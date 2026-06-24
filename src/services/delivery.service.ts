import { eq, and, desc, lte, or, isNull, gte } from "drizzle-orm";
import type { Db } from "../db/index.js";
import {
  pricePeriods,
  cylinderPrices,
  cylinderTypes,
  deliveries,
  deliveryLines,
  cylinderLedger,
  customers,
  employees,
} from "../db/schema.js";
import {
  calculateLineAmount,
  calculateOrderAmount,
  calculateDebtAmount,
} from "../../utils/money.js";
import { validationError, notFoundError } from "../../utils/errors.js";
import {
  insertDebtEntry,
  insertCylinderEntriesForLines,
} from "./ledger.service.js";

export interface DeliveryLineInput {
  cylinderTypeId: string;
  cylindersOut: number;
  cylindersIn: number;
  gasSurplusKg?: number;
}

export interface CreateDeliveryInput {
  customerId: string;
  employeeId: string;
  cashReceived: number;
  note?: string;
  deliveredAt: Date;
  lines: DeliveryLineInput[];
  /** P3 feature flag */
  allowGasSurplus?: boolean;
  /** P2: ghi cylinder ledger */
  enableCylinderLedger?: boolean;
}

export async function getCurrentPricePeriod(db: Db) {
  const now = new Date();
  const [period] = await db
    .select()
    .from(pricePeriods)
    .where(
      and(
        lte(pricePeriods.effectiveFrom, now),
        or(isNull(pricePeriods.effectiveTo), gte(pricePeriods.effectiveTo, now)),
      ),
    )
    .orderBy(desc(pricePeriods.effectiveFrom))
    .limit(1);

  if (!period) {
    throw validationError("Không có đợt giá hiện hành");
  }
  return period;
}

export async function previewDelivery(db: Db, input: CreateDeliveryInput) {
  return buildDeliveryPricing(db, input);
}

async function buildDeliveryPricing(db: Db, input: CreateDeliveryInput) {
  validateDeliveryInput(input);

  const period = await getCurrentPricePeriod(db);
  const pricedLines = [];

  for (const line of input.lines) {
    const [type] = await db
      .select()
      .from(cylinderTypes)
      .where(eq(cylinderTypes.id, line.cylinderTypeId))
      .limit(1);

    if (!type) {
      throw notFoundError(`Loại bình không tồn tại: ${line.cylinderTypeId}`);
    }

    const capacityKg = Number(type.capacityKg);
    const gasSurplusKg = line.gasSurplusKg ?? 0;

    if (gasSurplusKg > 0 && !input.allowGasSurplus) {
      throw validationError("Gas dư vỏ chưa bật (Phase 3)");
    }
    if (gasSurplusKg > 0 && capacityKg < 20) {
      throw validationError("Gas dư chỉ áp dụng bình ≥20kg");
    }
  const maxKg = line.cylindersOut * capacityKg;
    if (gasSurplusKg > maxKg) {
      throw validationError("gas_surplus_kg vượt kg giao");
    }

    const [priceRow] = await db
      .select()
      .from(cylinderPrices)
      .where(
        and(
          eq(cylinderPrices.pricePeriodId, period.id),
          eq(cylinderPrices.cylinderTypeId, line.cylinderTypeId),
        ),
      )
      .limit(1);

    if (!priceRow) {
      throw validationError(`Chưa có giá cho loại bình ${type.name} trong đợt hiện hành`);
    }

    const { lineAmount } = calculateLineAmount({
      cylindersOut: line.cylindersOut,
      pricePerCylinder: priceRow.pricePerCylinder,
      capacityKg,
      gasSurplusKg,
      allowGasSurplus: input.allowGasSurplus ?? false,
    });

    pricedLines.push({
      ...line,
      pricePerCylinderSnapshot: priceRow.pricePerCylinder,
      lineAmount,
      capacityKg,
    });
  }

  const orderAmount = calculateOrderAmount(pricedLines.map((l) => l.lineAmount));
  const debtAmount = calculateDebtAmount(orderAmount, input.cashReceived);

  return {
    pricePeriodId: period.id,
    lines: pricedLines,
    orderAmount,
    cashReceived: input.cashReceived,
    debtAmount,
  };
}

function validateDeliveryInput(input: CreateDeliveryInput) {
  if (!input.lines.length) {
    throw validationError("Delivery phải có ít nhất một dòng");
  }

  const allZero = input.lines.every(
    (l) =>
      l.cylindersOut === 0 &&
      l.cylindersIn === 0 &&
      (l.gasSurplusKg ?? 0) === 0,
  );
  if (allZero && input.cashReceived === 0) {
    throw validationError("Không cho phép delivery rỗng");
  }

  for (const line of input.lines) {
    if (line.cylindersOut < 0 || line.cylindersIn < 0) {
      throw validationError("Số bình không được âm");
    }
  }
}

export async function createDelivery(db: Db, input: CreateDeliveryInput) {
  const pricing = await buildDeliveryPricing(db, input);

  const [delivery] = await db
    .insert(deliveries)
    .values({
      customerId: input.customerId,
      employeeId: input.employeeId,
      pricePeriodId: pricing.pricePeriodId,
      orderAmount: pricing.orderAmount,
      cashReceived: input.cashReceived,
      debtAmount: pricing.debtAmount,
      note: input.note,
      deliveredAt: input.deliveredAt,
      status: "active",
    })
    .returning();

  const insertedLines = [];
  for (const line of pricing.lines) {
    const [row] = await db
      .insert(deliveryLines)
      .values({
        deliveryId: delivery.id,
        cylinderTypeId: line.cylinderTypeId,
        cylindersOut: line.cylindersOut,
        cylindersIn: line.cylindersIn,
        gasSurplusKg: String(line.gasSurplusKg ?? 0),
        pricePerCylinderSnapshot: line.pricePerCylinderSnapshot,
        lineAmount: line.lineAmount,
      })
      .returning();
    insertedLines.push(row);
  }

  if (pricing.debtAmount !== 0) {
    await insertDebtEntry(db, {
      customerId: input.customerId,
      amount: pricing.debtAmount,
      referenceType: "delivery",
      referenceId: delivery.id,
    });
  }

  if (input.enableCylinderLedger) {
    await insertCylinderEntriesForLines(
      db,
      input.customerId,
      delivery.id,
      pricing.lines.map((l) => ({
        cylinderTypeId: l.cylinderTypeId,
        cylindersOut: l.cylindersOut,
        cylindersIn: l.cylindersIn,
      })),
    );
  }

  return { delivery, lines: insertedLines, pricing };
}

export interface SnapshotDeliveryLineInput {
  cylinderTypeId: string;
  cylindersOut: number;
  cylindersIn: number;
  gasSurplusKg?: number;
  pricePerCylinderSnapshot: number;
  capacityKg: number;
}

/** Tạo delivery giữ nguyên đợt giá & snapshot giá từng dòng (sửa đơn đã giao). */
export async function createDeliveryFromSnapshots(
  db: Db,
  input: {
    customerId: string;
    employeeId: string;
    pricePeriodId: string;
    cashReceived: number;
    note?: string;
    deliveredAt: Date;
    lines: SnapshotDeliveryLineInput[];
    allowGasSurplus?: boolean;
    enableCylinderLedger?: boolean;
  },
) {
  if (!input.lines.length) {
    throw validationError("Delivery phải có ít nhất một dòng");
  }

  for (const line of input.lines) {
    if (line.cylindersOut < 0 || line.cylindersIn < 0) {
      throw validationError("Số bình không được âm");
    }
    const gasSurplusKg = line.gasSurplusKg ?? 0;
    if (gasSurplusKg > 0 && !input.allowGasSurplus) {
      throw validationError("Gas dư vỏ chưa bật (Phase 3)");
    }
    if (gasSurplusKg > 0 && line.capacityKg < 20) {
      throw validationError("Gas dư chỉ áp dụng bình ≥20kg");
    }
    const maxKg = line.cylindersOut * line.capacityKg;
    if (gasSurplusKg > maxKg) {
      throw validationError("gas_surplus_kg vượt kg giao");
    }
  }

  const pricedLines = input.lines.map((line) => {
    const gasSurplusKg = line.gasSurplusKg ?? 0;
    const { lineAmount } = calculateLineAmount({
      cylindersOut: line.cylindersOut,
      pricePerCylinder: line.pricePerCylinderSnapshot,
      capacityKg: line.capacityKg,
      gasSurplusKg,
      allowGasSurplus: input.allowGasSurplus ?? false,
    });
    return { ...line, gasSurplusKg, lineAmount };
  });

  const orderAmount = calculateOrderAmount(pricedLines.map((l) => l.lineAmount));
  const debtAmount = calculateDebtAmount(orderAmount, input.cashReceived);

  const [delivery] = await db
    .insert(deliveries)
    .values({
      customerId: input.customerId,
      employeeId: input.employeeId,
      pricePeriodId: input.pricePeriodId,
      orderAmount,
      cashReceived: input.cashReceived,
      debtAmount,
      note: input.note,
      deliveredAt: input.deliveredAt,
      status: "active",
    })
    .returning();

  const insertedLines = [];
  for (const line of pricedLines) {
    const [row] = await db
      .insert(deliveryLines)
      .values({
        deliveryId: delivery.id,
        cylinderTypeId: line.cylinderTypeId,
        cylindersOut: line.cylindersOut,
        cylindersIn: line.cylindersIn,
        gasSurplusKg: String(line.gasSurplusKg),
        pricePerCylinderSnapshot: line.pricePerCylinderSnapshot,
        lineAmount: line.lineAmount,
      })
      .returning();
    insertedLines.push(row);
  }

  if (debtAmount !== 0) {
    await insertDebtEntry(db, {
      customerId: input.customerId,
      amount: debtAmount,
      referenceType: "delivery",
      referenceId: delivery.id,
    });
  }

  if (input.enableCylinderLedger) {
    await insertCylinderEntriesForLines(
      db,
      input.customerId,
      delivery.id,
      pricedLines.map((l) => ({
        cylinderTypeId: l.cylinderTypeId,
        cylindersOut: l.cylindersOut,
        cylindersIn: l.cylindersIn,
      })),
    );
  }

  return {
    delivery,
    lines: insertedLines,
    pricing: { orderAmount, cashReceived: input.cashReceived, debtAmount },
  };
}

export async function voidDelivery(db: Db, deliveryId: string) {
  const [delivery] = await db
    .select()
    .from(deliveries)
    .where(eq(deliveries.id, deliveryId))
    .limit(1);

  if (!delivery) throw notFoundError("Delivery không tồn tại");
  if (delivery.status === "voided") {
    throw validationError("Delivery đã được void");
  }

  await db
    .update(deliveries)
    .set({ status: "voided", voidedAt: new Date() })
    .where(eq(deliveries.id, deliveryId));

  if (delivery.debtAmount !== 0) {
    await insertDebtEntry(db, {
      customerId: delivery.customerId,
      amount: -delivery.debtAmount,
      referenceType: "void",
      referenceId: delivery.id,
    });
  }

  const lines = await db
    .select()
    .from(deliveryLines)
    .where(eq(deliveryLines.deliveryId, deliveryId));

  const existingCylinder = await db
    .select()
    .from(cylinderLedger)
    .where(
      and(
        eq(cylinderLedger.referenceId, deliveryId),
        eq(cylinderLedger.referenceType, "delivery"),
      ),
    );

  if (existingCylinder.length > 0) {
    for (const entry of existingCylinder) {
      await db.insert(cylinderLedger).values({
        customerId: entry.customerId,
        cylinderTypeId: entry.cylinderTypeId,
        quantity: -entry.quantity,
        referenceType: "void",
        referenceId: delivery.id,
      });
    }
  }

  return delivery;
}

export async function listDeliveries(
  db: Db,
  opts?: { from?: Date; to?: Date; limit?: number },
) {
  const limit = opts?.limit ?? 100;
  const conditions = [eq(deliveries.status, "active")];
  if (opts?.from) conditions.push(gte(deliveries.deliveredAt, opts.from));
  if (opts?.to) conditions.push(lte(deliveries.deliveredAt, opts.to));

  return db
    .select({
      id: deliveries.id,
      customerId: deliveries.customerId,
      customerName: customers.name,
      customerPhone: customers.phone,
      employeeName: employees.name,
      orderAmount: deliveries.orderAmount,
      cashReceived: deliveries.cashReceived,
      debtAmount: deliveries.debtAmount,
      note: deliveries.note,
      deliveredAt: deliveries.deliveredAt,
    })
    .from(deliveries)
    .innerJoin(customers, eq(customers.id, deliveries.customerId))
    .innerJoin(employees, eq(employees.id, deliveries.employeeId))
    .where(and(...conditions))
    .orderBy(desc(deliveries.deliveredAt))
    .limit(limit);
}
