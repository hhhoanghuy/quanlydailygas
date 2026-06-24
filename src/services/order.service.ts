import { eq, and, desc, inArray } from "drizzle-orm";
import type { Db } from "../db/index.js";
import {
  customers,
  cylinderTypes,
  deliveryOrders,
  deliveryOrderLines,
  deliveries,
  deliveryLines,
  employees,
  users,
} from "../db/schema.js";
import { validationError, notFoundError } from "../../utils/errors.js";
import {
  calculateLineAmount,
  calculateOrderAmount,
  calculateDebtAmount,
} from "../../utils/money.js";
import { getCustomerLifetimeStats } from "./customer.service.js";
import { createDelivery, createDeliveryFromSnapshots, voidDelivery } from "./delivery.service.js";
import { extractPayment } from "./stats.service.js";
import type { PaymentTag } from "./stats.service.js";

export const ORDER_CORRECTION_WINDOW_MS = 48 * 60 * 60 * 1000;

export interface OrderCorrectionLineInput {
  cylindersOut: number;
  cylindersIn: number;
  gasSurplusKg?: number;
}

export interface OrderCorrectionInput {
  lines: OrderCorrectionLineInput[];
  cashReceived: number;
  paymentMethod: PaymentTag;
  employeeId: string;
  note?: string;
}
export interface OrderLineInput {
  cylinderTypeId: string;
  cylindersOut: number;
}

export async function createDeliveryOrder(
  db: Db,
  input: {
    customerId: string;
    createdByUserId: string;
    lines: OrderLineInput[];
    note?: string;
    assignedEmployeeId?: string;
  },
) {
  if (!input.lines.length) {
    throw validationError("Đơn phải có ít nhất một dòng bình");
  }
  for (const line of input.lines) {
    if (line.cylindersOut <= 0) {
      throw validationError("Số bình giao phải > 0");
    }
  }

  const [customer] = await db
    .select()
    .from(customers)
    .where(eq(customers.id, input.customerId))
    .limit(1);
  if (!customer) throw notFoundError("Khách không tồn tại");

  if (!input.assignedEmployeeId) {
    throw validationError("Phải chọn nhân viên giao");
  }

  const [order] = await db
    .insert(deliveryOrders)
    .values({
      customerId: input.customerId,
      createdByUserId: input.createdByUserId,
      assignedEmployeeId: input.assignedEmployeeId,
      status: "pending",
      note: input.note,
    })
    .returning();

  const insertedLines = [];
  for (let i = 0; i < input.lines.length; i++) {
    const line = input.lines[i];
    const [row] = await db
      .insert(deliveryOrderLines)
      .values({
        orderId: order.id,
        cylinderTypeId: line.cylinderTypeId,
        cylindersOut: line.cylindersOut,
        sortOrder: i,
      })
      .returning();
    insertedLines.push(row);
  }

  return { order, customer, lines: insertedLines };
}

export async function listPendingOrders(
  db: Db,
  opts?: { employeeId?: string },
) {
  const statusFilter = inArray(deliveryOrders.status, ["pending", "delivering"]);
  const assignmentFilter = opts?.employeeId
    ? eq(deliveryOrders.assignedEmployeeId, opts.employeeId)
    : undefined;

  const orders = await db
    .select({
      id: deliveryOrders.id,
      status: deliveryOrders.status,
      createdAt: deliveryOrders.createdAt,
      customerId: deliveryOrders.customerId,
      assignedEmployeeId: deliveryOrders.assignedEmployeeId,
      assignedEmployeeName: employees.name,
      customerName: customers.name,
      customerPhone: customers.phone,
      customerAddress: customers.address,
    })
    .from(deliveryOrders)
    .innerJoin(customers, eq(customers.id, deliveryOrders.customerId))
    .leftJoin(employees, eq(employees.id, deliveryOrders.assignedEmployeeId))
    .where(assignmentFilter ? and(statusFilter, assignmentFilter) : statusFilter)
    .orderBy(desc(deliveryOrders.createdAt));

  if (!orders.length) return [];

  const orderIds = orders.map((o) => o.id);
  const lines = await db
    .select({
      orderId: deliveryOrderLines.orderId,
      cylindersOut: deliveryOrderLines.cylindersOut,
      typeName: cylinderTypes.name,
    })
    .from(deliveryOrderLines)
    .innerJoin(cylinderTypes, eq(cylinderTypes.id, deliveryOrderLines.cylinderTypeId))
    .where(inArray(deliveryOrderLines.orderId, orderIds));

  const linesByOrder = new Map<string, string[]>();
  for (const l of lines) {
    const arr = linesByOrder.get(l.orderId) ?? [];
    arr.push(`${l.typeName} ×${l.cylindersOut}`);
    linesByOrder.set(l.orderId, arr);
  }

  return orders.map((o) => ({
    ...o,
    lineSummary: linesByOrder.get(o.id)?.join(", ") ?? "",
  }));
}

export async function getOrderDetail(db: Db, orderId: string) {
  const [order] = await db
    .select({
      id: deliveryOrders.id,
      status: deliveryOrders.status,
      createdAt: deliveryOrders.createdAt,
      customerId: deliveryOrders.customerId,
      customerName: customers.name,
      customerPhone: customers.phone,
      customerAddress: customers.address,
      assignedEmployeeId: deliveryOrders.assignedEmployeeId,
      assignedEmployeeName: employees.name,
      deliveryId: deliveryOrders.deliveryId,
      completedAt: deliveryOrders.completedAt,
    })
    .from(deliveryOrders)
    .innerJoin(customers, eq(customers.id, deliveryOrders.customerId))
    .leftJoin(employees, eq(employees.id, deliveryOrders.assignedEmployeeId))
    .where(eq(deliveryOrders.id, orderId))
    .limit(1);

  if (!order) throw notFoundError("Đơn không tồn tại");

  const lines = await db
    .select({
      id: deliveryOrderLines.id,
      cylinderTypeId: deliveryOrderLines.cylinderTypeId,
      cylindersOut: deliveryOrderLines.cylindersOut,
      typeName: cylinderTypes.name,
      capacityKg: cylinderTypes.capacityKg,
    })
    .from(deliveryOrderLines)
    .innerJoin(cylinderTypes, eq(cylinderTypes.id, deliveryOrderLines.cylinderTypeId))
    .where(eq(deliveryOrderLines.orderId, orderId))
    .orderBy(deliveryOrderLines.sortOrder);

  return { order, lines };
}

const PAYMENT_LABEL: Record<string, string> = {
  tm: "Tiền mặt",
  ck: "Chuyển khoản",
  no: "Ghi nợ",
};

export function buildOrderMessagePreview(input: {
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  status: string;
  lines: { typeName: string; cylindersOut: number; cylindersIn?: number; gasSurplusKg?: number }[];
  fulfillment?: {
    deliveredAt: Date;
    orderAmount: number;
    cashReceived: number;
    debtAmount: number;
    paymentMethod: string | null;
  } | null;
}) {
  const linesOut = input.lines.map((l) => `${l.typeName} ×${l.cylindersOut}`).join(", ");
  if (input.status !== "completed" || !input.fulfillment) {
    return [
      `Xin chào ${input.customerName},`,
      `Đơn gas chờ giao: ${linesOut}.`,
      `Địa chỉ: ${input.customerAddress}.`,
      `Liên hệ: ${input.customerPhone}.`,
    ].join("\n");
  }

  const f = input.fulfillment;
  const pay = PAYMENT_LABEL[f.paymentMethod ?? ""] ?? (f.cashReceived > 0 ? "Tiền mặt" : "Ghi nợ");
  const linesDetail = input.lines
    .map((l) => {
      const parts = [`Giao ${l.typeName} ×${l.cylindersOut}`];
      if (l.cylindersIn != null) parts.push(`thu ${l.cylindersIn} vỏ`);
      if (l.gasSurplusKg && l.gasSurplusKg > 0) parts.push(`gas dư ${l.gasSurplusKg}kg`);
      return parts.join(", ");
    })
    .join("; ");

  const debtLine =
    f.debtAmount > 0
      ? `Còn nợ thêm: ${f.debtAmount.toLocaleString("vi-VN")}đ.`
      : f.cashReceived > 0
        ? `Đã thanh toán: ${f.cashReceived.toLocaleString("vi-VN")}đ (${pay}).`
        : "";

  return [
    `Xin chào ${input.customerName},`,
    `Đại lý đã giao gas lúc ${f.deliveredAt.toLocaleString("vi-VN")}.`,
    linesDetail + ".",
    `Tổng đơn: ${f.orderAmount.toLocaleString("vi-VN")}đ.`,
    debtLine,
    "Cảm ơn quý khách!",
  ]
    .filter(Boolean)
    .join("\n");
}

export async function listOrders(
  db: Db,
  opts?: { status?: string; limit?: number; offset?: number },
) {
  const limit = opts?.limit ?? 100;
  const offset = opts?.offset ?? 0;

  const statusFilter =
    opts?.status && opts.status !== "all"
      ? eq(deliveryOrders.status, opts.status as "pending" | "delivering" | "completed" | "cancelled")
      : undefined;

  const orders = await db
    .select({
      id: deliveryOrders.id,
      status: deliveryOrders.status,
      createdAt: deliveryOrders.createdAt,
      completedAt: deliveryOrders.completedAt,
      customerId: deliveryOrders.customerId,
      assignedEmployeeName: employees.name,
      customerName: customers.name,
      customerPhone: customers.phone,
      customerAddress: customers.address,
    })
    .from(deliveryOrders)
    .innerJoin(customers, eq(customers.id, deliveryOrders.customerId))
    .leftJoin(employees, eq(employees.id, deliveryOrders.assignedEmployeeId))
    .where(statusFilter)
    .orderBy(desc(deliveryOrders.createdAt))
    .limit(limit)
    .offset(offset);

  if (!orders.length) return [];

  const orderIds = orders.map((o) => o.id);
  const lineRows = await db
    .select({
      orderId: deliveryOrderLines.orderId,
      cylindersOut: deliveryOrderLines.cylindersOut,
      typeName: cylinderTypes.name,
    })
    .from(deliveryOrderLines)
    .innerJoin(cylinderTypes, eq(cylinderTypes.id, deliveryOrderLines.cylinderTypeId))
    .where(inArray(deliveryOrderLines.orderId, orderIds));

  const linesByOrder = new Map<string, string[]>();
  for (const l of lineRows) {
    const arr = linesByOrder.get(l.orderId) ?? [];
    arr.push(`${l.typeName} ×${l.cylindersOut}`);
    linesByOrder.set(l.orderId, arr);
  }

  return orders.map((o) => ({
    ...o,
    lineSummary: linesByOrder.get(o.id)?.join(", ") ?? "",
  }));
}

export async function getOrderDetailForWeb(db: Db, orderId: string) {
  const [orderRow] = await db
    .select({
      id: deliveryOrders.id,
      status: deliveryOrders.status,
      createdAt: deliveryOrders.createdAt,
      completedAt: deliveryOrders.completedAt,
      note: deliveryOrders.note,
      customerId: deliveryOrders.customerId,
      customerName: customers.name,
      customerPhone: customers.phone,
      customerAddress: customers.address,
      customerType: customers.customerType,
      assignedEmployeeId: deliveryOrders.assignedEmployeeId,
      assignedEmployeeName: employees.name,
      deliveryId: deliveryOrders.deliveryId,
    })
    .from(deliveryOrders)
    .innerJoin(customers, eq(customers.id, deliveryOrders.customerId))
    .leftJoin(employees, eq(employees.id, deliveryOrders.assignedEmployeeId))
    .where(eq(deliveryOrders.id, orderId))
    .limit(1);

  if (!orderRow) throw notFoundError("Đơn không tồn tại");

  const orderLines = await db
    .select({
      id: deliveryOrderLines.id,
      cylinderTypeId: deliveryOrderLines.cylinderTypeId,
      cylindersOut: deliveryOrderLines.cylindersOut,
      typeName: cylinderTypes.name,
    })
    .from(deliveryOrderLines)
    .innerJoin(cylinderTypes, eq(cylinderTypes.id, deliveryOrderLines.cylinderTypeId))
    .where(eq(deliveryOrderLines.orderId, orderId))
    .orderBy(deliveryOrderLines.sortOrder);

  let fulfillment: {
    deliveryId: string;
    deliveredAt: Date;
    orderAmount: number;
    cashReceived: number;
    debtAmount: number;
    paymentMethod: string | null;
    employeeName: string;
    lines: {
      typeName: string;
      cylindersOut: number;
      cylindersIn: number;
      gasSurplusKg: number;
      lineAmount: number;
    }[];
  } | null = null;

  const linesWithFulfill = orderLines.map((l) => ({
    typeName: l.typeName,
    cylindersOut: l.cylindersOut,
    cylindersIn: undefined as number | undefined,
    gasSurplusKg: undefined as number | undefined,
  }));

  if (orderRow.deliveryId) {
    const [delivery] = await db
      .select({
        id: deliveries.id,
        deliveredAt: deliveries.deliveredAt,
        orderAmount: deliveries.orderAmount,
        cashReceived: deliveries.cashReceived,
        debtAmount: deliveries.debtAmount,
        note: deliveries.note,
        employeeName: employees.name,
      })
      .from(deliveries)
      .innerJoin(employees, eq(employees.id, deliveries.employeeId))
      .where(eq(deliveries.id, orderRow.deliveryId))
      .limit(1);

    if (delivery) {
      const dLines = await db
        .select({
          typeName: cylinderTypes.name,
          cylindersOut: deliveryLines.cylindersOut,
          cylindersIn: deliveryLines.cylindersIn,
          gasSurplusKg: deliveryLines.gasSurplusKg,
          lineAmount: deliveryLines.lineAmount,
        })
        .from(deliveryLines)
        .innerJoin(cylinderTypes, eq(cylinderTypes.id, deliveryLines.cylinderTypeId))
        .where(eq(deliveryLines.deliveryId, delivery.id))
        .orderBy(deliveryLines.id);

      for (let i = 0; i < linesWithFulfill.length && i < dLines.length; i++) {
        linesWithFulfill[i].cylindersIn = dLines[i].cylindersIn;
        linesWithFulfill[i].gasSurplusKg = Number(dLines[i].gasSurplusKg ?? 0);
      }

      fulfillment = {
        deliveryId: delivery.id,
        deliveredAt: delivery.deliveredAt,
        orderAmount: delivery.orderAmount,
        cashReceived: delivery.cashReceived,
        debtAmount: delivery.debtAmount,
        paymentMethod: extractPayment(delivery.note),
        employeeName: delivery.employeeName,
        lines: dLines.map((l) => ({
          typeName: l.typeName,
          cylindersOut: l.cylindersOut,
          cylindersIn: l.cylindersIn,
          gasSurplusKg: Number(l.gasSurplusKg ?? 0),
          lineAmount: l.lineAmount,
        })),
      };
    }
  }

  const messagePreview = buildOrderMessagePreview({
    customerName: orderRow.customerName,
    customerPhone: orderRow.customerPhone,
    customerAddress: orderRow.customerAddress,
    status: orderRow.status,
    lines: linesWithFulfill,
    fulfillment: fulfillment
      ? {
          deliveredAt: fulfillment.deliveredAt,
          orderAmount: fulfillment.orderAmount,
          cashReceived: fulfillment.cashReceived,
          debtAmount: fulfillment.debtAmount,
          paymentMethod: fulfillment.paymentMethod,
        }
      : null,
  });

  const customerSummary = await getCustomerLifetimeStats(db, orderRow.customerId);

  const correctionAnchor = orderRow.completedAt ?? fulfillment?.deliveredAt ?? null;
  const correctionDeadline = correctionAnchor
    ? new Date(new Date(correctionAnchor).getTime() + ORDER_CORRECTION_WINDOW_MS)
    : null;
  const canCorrect =
    orderRow.status === "completed" &&
    Boolean(orderRow.deliveryId && fulfillment) &&
    Boolean(correctionDeadline && Date.now() <= correctionDeadline.getTime());

  return {
    order: orderRow,
    lines: orderLines,
    fulfillment,
    messagePreview,
    customerSummary,
    canCorrect,
    correctionDeadline,
  };
}

export async function markOrderDelivering(db: Db, orderId: string, employeeId: string) {
  const detail = await getOrderDetail(db, orderId);
  if (detail.order.status === "completed") {
    throw validationError("Đơn đã hoàn thành");
  }
  if (detail.order.status === "cancelled") {
    throw validationError("Đơn đã huỷ");
  }
  if (
    detail.order.assignedEmployeeId &&
    detail.order.assignedEmployeeId !== employeeId
  ) {
    throw validationError("Đơn đã giao cho nhân viên khác");
  }
  if (!detail.order.assignedEmployeeId) {
    throw validationError("Đơn chưa gán NV — chủ cần huỷ và lên đơn lại");
  }

  await db
    .update(deliveryOrders)
    .set({ status: "delivering", assignedEmployeeId: employeeId })
    .where(eq(deliveryOrders.id, orderId));

  return detail;
}

export async function completeDeliveryOrder(
  db: Db,
  input: {
    orderId: string;
    employeeId: string;
    cylindersInByLine: number[];
    cashReceived: number;
    gasSurplusKgByLine?: number[];
    note?: string;
    allowGasSurplus?: boolean;
    enableCylinderLedger?: boolean;
  },
) {
  const detail = await getOrderDetail(db, input.orderId);
  if (detail.order.status === "completed") {
    throw validationError("Đơn đã hoàn thành");
  }
  if (detail.order.status === "cancelled") {
    throw validationError("Đơn đã huỷ");
  }
  if (input.cylindersInByLine.length !== detail.lines.length) {
    throw validationError("Số dòng bình thu không khớp đơn");
  }

  const deliveryLines = detail.lines.map((line, i) => ({
    cylinderTypeId: line.cylinderTypeId,
    cylindersOut: line.cylindersOut,
    cylindersIn: input.cylindersInByLine[i],
    gasSurplusKg: input.gasSurplusKgByLine?.[i] ?? 0,
  }));

  const result = await createDelivery(db, {
    customerId: detail.order.customerId,
    employeeId: input.employeeId,
    cashReceived: input.cashReceived,
    note: input.note,
    deliveredAt: new Date(),
    lines: deliveryLines,
    allowGasSurplus: input.allowGasSurplus,
    enableCylinderLedger: input.enableCylinderLedger,
  });

  await db
    .update(deliveryOrders)
    .set({
      status: "completed",
      deliveryId: result.delivery.id,
      assignedEmployeeId: input.employeeId,
      completedAt: new Date(),
    })
    .where(eq(deliveryOrders.id, input.orderId));

  return { ...result, order: detail.order };
}

export async function cancelDeliveryOrder(db: Db, orderId: string) {
  const [order] = await db
    .select()
    .from(deliveryOrders)
    .where(eq(deliveryOrders.id, orderId))
    .limit(1);
  if (!order) throw notFoundError("Đơn không tồn tại");
  if (order.status === "completed") {
    throw validationError("Không huỷ đơn đã giao xong");
  }

  await db
    .update(deliveryOrders)
    .set({ status: "cancelled" })
    .where(eq(deliveryOrders.id, orderId));

  return order;
}

export async function listActiveEmployees(db: Db) {
  return db
    .select({
      employeeId: employees.id,
      name: users.name,
      telegramUserId: users.telegramUserId,
    })
    .from(users)
    .innerJoin(employees, eq(employees.id, users.employeeId))
    .where(and(eq(users.role, "employee"), eq(employees.active, true)))
    .orderBy(users.name);
}

export async function listEmployeeTelegramIds(db: Db, employeeId?: string) {
  const conditions = [eq(users.role, "employee")];
  if (employeeId) {
    conditions.push(eq(users.employeeId, employeeId));
  }

  return db
    .select({
      telegramUserId: users.telegramUserId,
      name: users.name,
      employeeId: users.employeeId,
    })
    .from(users)
    .where(and(...conditions));
}

export function formatOrderNotification(
  orderNumber: string,
  customerName: string,
  address: string,
  lineSummary: string,
) {
  return [
    "📦 Đơn hàng mới!",
    "",
    `👤 ${customerName}`,
    `📍 ${address}`,
    `🛢 ${lineSummary}`,
    "",
    "Bấm 📋 Đơn cần giao để xem và giao hàng.",
  ].join("\n");
}

function assertOrderCorrectable(
  order: { status: string; deliveryId: string | null; completedAt: Date | null },
  deliveredAt: Date | null,
) {
  if (order.status !== "completed") {
    throw validationError("Chỉ sửa được đơn đã giao xong");
  }
  if (!order.deliveryId) {
    throw validationError("Đơn chưa có giao dịch giao hàng");
  }
  const anchor = order.completedAt ?? deliveredAt;
  if (!anchor) {
    throw validationError("Không xác định thời điểm hoàn thành đơn");
  }
  const deadline = new Date(new Date(anchor).getTime() + ORDER_CORRECTION_WINDOW_MS);
  if (Date.now() > deadline.getTime()) {
    throw validationError("Chỉ sửa được trong 48 giờ sau khi giao");
  }
}

function buildCorrectionNote(paymentMethod: PaymentTag, note?: string) {
  const base = `payment=${paymentMethod}`;
  const extra = note?.trim();
  return extra ? `${base} ${extra}` : base;
}

async function loadCorrectionSnapshots(db: Db, deliveryId: string) {
  const [delivery] = await db
    .select()
    .from(deliveries)
    .where(eq(deliveries.id, deliveryId))
    .limit(1);
  if (!delivery) throw notFoundError("Giao dịch giao hàng không tồn tại");
  if (delivery.status === "voided") {
    throw validationError("Giao dịch đã bị huỷ — không thể sửa");
  }

  const dLines = await db
    .select({
      id: deliveryLines.id,
      cylinderTypeId: deliveryLines.cylinderTypeId,
      cylindersOut: deliveryLines.cylindersOut,
      cylindersIn: deliveryLines.cylindersIn,
      gasSurplusKg: deliveryLines.gasSurplusKg,
      pricePerCylinderSnapshot: deliveryLines.pricePerCylinderSnapshot,
      typeName: cylinderTypes.name,
      capacityKg: cylinderTypes.capacityKg,
    })
    .from(deliveryLines)
    .innerJoin(cylinderTypes, eq(cylinderTypes.id, deliveryLines.cylinderTypeId))
    .where(eq(deliveryLines.deliveryId, deliveryId))
    .orderBy(deliveryLines.id);

  return { delivery, dLines };
}

function buildCorrectedPricing(
  snapshots: Awaited<ReturnType<typeof loadCorrectionSnapshots>>["dLines"],
  input: OrderCorrectionInput,
  allowGasSurplus: boolean,
) {
  if (input.lines.length !== snapshots.length) {
    throw validationError("Số dòng bình không khớp đơn");
  }

  const lines = snapshots.map((snap, i) => {
    const row = input.lines[i];
    if (row.cylindersOut < 0 || row.cylindersIn < 0) {
      throw validationError("Số bình không được âm");
    }
    const gasSurplusKg = row.gasSurplusKg ?? 0;
    const capacityKg = Number(snap.capacityKg);
    if (gasSurplusKg > 0 && !allowGasSurplus) {
      throw validationError("Gas dư vỏ chưa bật");
    }
    if (gasSurplusKg > 0 && capacityKg < 20) {
      throw validationError("Gas dư chỉ áp dụng bình ≥20kg");
    }
    const maxKg = row.cylindersOut * capacityKg;
    if (gasSurplusKg > maxKg) {
      throw validationError("gas_surplus_kg vượt kg giao");
    }

    const { lineAmount } = calculateLineAmount({
      cylindersOut: row.cylindersOut,
      pricePerCylinder: snap.pricePerCylinderSnapshot,
      capacityKg,
      gasSurplusKg,
      allowGasSurplus,
    });

    return {
      cylinderTypeId: snap.cylinderTypeId,
      typeName: snap.typeName,
      cylindersOut: row.cylindersOut,
      cylindersIn: row.cylindersIn,
      gasSurplusKg,
      pricePerCylinderSnapshot: snap.pricePerCylinderSnapshot,
      capacityKg,
      lineAmount,
      holding: row.cylindersOut - row.cylindersIn,
      oldHolding: snap.cylindersOut - snap.cylindersIn,
    };
  });

  const orderAmount = calculateOrderAmount(lines.map((l) => l.lineAmount));
  const debtAmount = calculateDebtAmount(orderAmount, input.cashReceived);

  return { lines, orderAmount, cashReceived: input.cashReceived, debtAmount };
}

function summarizeCorrectionDelta(
  before: { orderAmount: number; cashReceived: number; debtAmount: number; holding: number },
  after: ReturnType<typeof buildCorrectedPricing>,
) {
  const afterHolding = after.lines.reduce((s, l) => s + l.holding, 0);
  return {
    before,
    after: {
      orderAmount: after.orderAmount,
      cashReceived: after.cashReceived,
      debtAmount: after.debtAmount,
      holding: afterHolding,
    },
    delta: {
      orderAmount: after.orderAmount - before.orderAmount,
      cashReceived: after.cashReceived - before.cashReceived,
      debtAmount: after.debtAmount - before.debtAmount,
      holding: afterHolding - before.holding,
    },
    lines: after.lines.map((l, i) => ({
      typeName: l.typeName,
      cylindersOut: l.cylindersOut,
      cylindersIn: l.cylindersIn,
      gasSurplusKg: l.gasSurplusKg,
      lineAmount: l.lineAmount,
      deltaHolding: l.holding - l.oldHolding,
    })),
  };
}

export async function previewOrderCorrection(
  db: Db,
  orderId: string,
  input: OrderCorrectionInput,
  opts?: { allowGasSurplus?: boolean },
) {
  const detail = await getOrderDetail(db, orderId);
  const { delivery, dLines } = await loadCorrectionSnapshots(db, detail.order.deliveryId!);
  assertOrderCorrectable(detail.order, delivery.deliveredAt);

  const [employee] = await db
    .select({ id: employees.id })
    .from(employees)
    .where(eq(employees.id, input.employeeId))
    .limit(1);
  if (!employee) throw notFoundError("Nhân viên không tồn tại");

  const beforeHolding = dLines.reduce((s, l) => s + (l.cylindersOut - l.cylindersIn), 0);
  const before = {
    orderAmount: delivery.orderAmount,
    cashReceived: delivery.cashReceived,
    debtAmount: delivery.debtAmount,
    holding: beforeHolding,
  };

  const afterPricing = buildCorrectedPricing(dLines, input, opts?.allowGasSurplus ?? false);
  return summarizeCorrectionDelta(before, afterPricing);
}

export async function correctCompletedOrder(
  db: Db,
  orderId: string,
  input: OrderCorrectionInput,
  opts?: { allowGasSurplus?: boolean; enableCylinderLedger?: boolean },
) {
  const detail = await getOrderDetail(db, orderId);
  const { delivery, dLines } = await loadCorrectionSnapshots(db, detail.order.deliveryId!);
  assertOrderCorrectable(detail.order, delivery.deliveredAt);

  const [employee] = await db
    .select({ id: employees.id })
    .from(employees)
    .where(eq(employees.id, input.employeeId))
    .limit(1);
  if (!employee) throw notFoundError("Nhân viên không tồn tại");

  const preview = await previewOrderCorrection(db, orderId, input, opts);
  const afterPricing = buildCorrectedPricing(dLines, input, opts?.allowGasSurplus ?? false);

  await voidDelivery(db, delivery.id);

  const result = await createDeliveryFromSnapshots(db, {
    customerId: detail.order.customerId,
    employeeId: input.employeeId,
    pricePeriodId: delivery.pricePeriodId,
    cashReceived: input.cashReceived,
    note: buildCorrectionNote(input.paymentMethod, input.note),
    deliveredAt: delivery.deliveredAt,
    lines: afterPricing.lines.map((l) => ({
      cylinderTypeId: l.cylinderTypeId,
      cylindersOut: l.cylindersOut,
      cylindersIn: l.cylindersIn,
      gasSurplusKg: l.gasSurplusKg,
      pricePerCylinderSnapshot: l.pricePerCylinderSnapshot,
      capacityKg: l.capacityKg,
    })),
    allowGasSurplus: opts?.allowGasSurplus,
    enableCylinderLedger: opts?.enableCylinderLedger,
  });

  await db
    .update(deliveryOrders)
    .set({
      deliveryId: result.delivery.id,
      assignedEmployeeId: input.employeeId,
    })
    .where(eq(deliveryOrders.id, orderId));

  const orderLineRows = await db
    .select({ id: deliveryOrderLines.id })
    .from(deliveryOrderLines)
    .where(eq(deliveryOrderLines.orderId, orderId))
    .orderBy(deliveryOrderLines.sortOrder);

  for (let i = 0; i < orderLineRows.length && i < input.lines.length; i++) {
    await db
      .update(deliveryOrderLines)
      .set({ cylindersOut: input.lines[i].cylindersOut })
      .where(eq(deliveryOrderLines.id, orderLineRows[i].id));
  }

  return {
    preview,
    order: await getOrderDetailForWeb(db, orderId),
  };
}
