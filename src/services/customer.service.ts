import { eq, and, ilike, or, sql, ne, inArray } from "drizzle-orm";
import type { Db } from "../db/index.js";
import { customers, debtLedger, deliveries, deliveryOrders, deliveryLines, cylinderTypes } from "../db/schema.js";
import { validationError, notFoundError } from "../../utils/errors.js";
import { normalizePhone, looksLikePhone } from "../../utils/phone.js";
import { getDebtBalance, getCylinderBalancesByType } from "./ledger.service.js";

export async function createCustomer(
  db: Db,
  input: {
    name: string;
    phone: string;
    address: string;
    note?: string;
    customerType?: "household" | "restaurant" | "industrial";
  },
) {
  if (!input.name?.trim()) throw validationError("Tên bắt buộc");
  if (!input.phone?.trim()) throw validationError("SĐT bắt buộc");
  if (!input.address?.trim()) throw validationError("Địa chỉ bắt buộc");

  const phone = normalizePhone(input.phone);

  const existing = await db
    .select()
    .from(customers)
    .where(eq(customers.phone, phone))
    .limit(1);

  if (existing.length) {
    throw validationError("Số điện thoại đã tồn tại", [
      { field: "phone", message: "Trùng SĐT" },
    ]);
  }

  const [row] = await db
    .insert(customers)
    .values({
      name: input.name.trim(),
      phone,
      address: input.address.trim(),
      note: input.note,
      customerType: input.customerType ?? "household",
    })
    .returning();

  return row;
}

export async function deactivateCustomer(db: Db, id: string) {
  const [row] = await db
    .update(customers)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(customers.id, id))
    .returning();
  if (!row) throw notFoundError("Khách không tồn tại");
  return row;
}

export async function hardDeleteCustomer(db: Db, id: string) {
  const balance = await getDebtBalance(db, id);
  if (balance !== 0) {
    throw validationError("Không thể xoá khách còn nợ — thu nợ trước hoặc dùng Ẩn");
  }

  const hasHistory = await customerHasHistory(db, id);
  if (hasHistory) {
    throw validationError("Khách đã có lịch sử giao hàng — chỉ có thể Ẩn, không xoá vĩnh viễn");
  }

  const [row] = await db.delete(customers).where(eq(customers.id, id)).returning();
  if (!row) throw notFoundError("Khách không tồn tại");
  return row;
}

async function customerHasHistory(db: Db, customerId: string) {
  const [delivery] = await db
    .select({ id: deliveries.id })
    .from(deliveries)
    .where(eq(deliveries.customerId, customerId))
    .limit(1);
  if (delivery) return true;

  const [order] = await db
    .select({ id: deliveryOrders.id })
    .from(deliveryOrders)
    .where(eq(deliveryOrders.customerId, customerId))
    .limit(1);
  return Boolean(order);
}

async function getCustomerIdsWithHistory(db: Db, customerIds: string[]) {
  if (!customerIds.length) return new Set<string>();

  const fromDeliveries = await db
    .selectDistinct({ customerId: deliveries.customerId })
    .from(deliveries)
    .where(inArray(deliveries.customerId, customerIds));

  const fromOrders = await db
    .selectDistinct({ customerId: deliveryOrders.customerId })
    .from(deliveryOrders)
    .where(inArray(deliveryOrders.customerId, customerIds));

  return new Set([
    ...fromDeliveries.map((r) => r.customerId),
    ...fromOrders.map((r) => r.customerId),
  ]);
}

export async function listCustomers(
  db: Db,
  opts?: { search?: string; limit?: number; offset?: number },
) {
  const limit = opts?.limit ?? 100;
  const offset = opts?.offset ?? 0;
  const search = opts?.search?.trim();

  const baseWhere = eq(customers.isActive, true);
  const where = search
    ? and(
        baseWhere,
        or(
          ilike(customers.name, `%${search}%`),
          ilike(customers.phone, `%${search}%`),
          ilike(customers.address, `%${search}%`),
        ),
      )
    : baseWhere;

  const rows = await db
    .select({
      id: customers.id,
      name: customers.name,
      phone: customers.phone,
      address: customers.address,
      note: customers.note,
      customerType: customers.customerType,
      createdAt: customers.createdAt,
      debtBalance: sql<number>`coalesce(sum(${debtLedger.amount}), 0)`,
    })
    .from(customers)
    .leftJoin(debtLedger, eq(debtLedger.customerId, customers.id))
    .where(where)
    .groupBy(
      customers.id,
      customers.name,
      customers.phone,
      customers.address,
      customers.note,
      customers.customerType,
      customers.createdAt,
    )
    .orderBy(customers.name)
    .limit(limit)
    .offset(offset);

  const ids = rows.map((r) => r.id);
  const withHistory = await getCustomerIdsWithHistory(db, ids);

  return rows.map((r) => {
    const debtBalance = Number(r.debtBalance ?? 0);
    const hasHistory = withHistory.has(r.id);
    return {
      id: r.id,
      name: r.name,
      phone: r.phone,
      address: r.address,
      note: r.note,
      customerType: r.customerType,
      createdAt: r.createdAt,
      debtBalance,
      canDelete: debtBalance === 0 && !hasHistory,
    };
  });
}

/** Top khách theo số lần giao hoàn thành (completed delivery_orders). */
export async function listTopCustomersByCompletedOrders(db: Db, limit = 10) {
  const rows = await db
    .select({
      id: customers.id,
      name: customers.name,
      phone: customers.phone,
      address: customers.address,
      completedOrders: sql<number>`count(${deliveryOrders.id})::int`,
    })
    .from(customers)
    .innerJoin(
      deliveryOrders,
      and(
        eq(deliveryOrders.customerId, customers.id),
        eq(deliveryOrders.status, "completed"),
      ),
    )
    .where(eq(customers.isActive, true))
    .groupBy(customers.id, customers.name, customers.phone, customers.address)
    .orderBy(sql`count(${deliveryOrders.id}) desc`)
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    phone: r.phone,
    address: r.address,
    completedOrders: Number(r.completedOrders),
  }));
}

/** 10 khách hiển thị hub bot — ưu tiên giao gần nhất, thiếu thì khách mới tạo. */
export async function listCustomersForHub(db: Db, limit = 10) {
  const recent = await db
    .select({
      id: customers.id,
      name: customers.name,
      phone: customers.phone,
      lastAt: sql<Date>`max(${deliveryOrders.completedAt})`,
    })
    .from(customers)
    .innerJoin(
      deliveryOrders,
      and(
        eq(deliveryOrders.customerId, customers.id),
        eq(deliveryOrders.status, "completed"),
      ),
    )
    .where(eq(customers.isActive, true))
    .groupBy(customers.id, customers.name, customers.phone)
    .orderBy(sql`max(${deliveryOrders.completedAt}) desc`)
    .limit(limit);

  const seen = new Set(recent.map((r) => r.id));
  const result = recent.map((r) => ({ id: r.id, name: r.name, phone: r.phone }));

  if (result.length < limit) {
    const extra = await db
      .select({ id: customers.id, name: customers.name, phone: customers.phone })
      .from(customers)
      .where(eq(customers.isActive, true))
      .orderBy(sql`${customers.createdAt} desc`)
      .limit(limit * 2);
    for (const c of extra) {
      if (result.length >= limit) break;
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      result.push(c);
    }
  }
  return result;
}

export async function updateCustomer(
  db: Db,
  id: string,
  input: {
    name?: string;
    phone?: string;
    address?: string;
    note?: string;
    customerType?: "household" | "restaurant" | "industrial";
  },
) {
  const [existing] = await db.select().from(customers).where(eq(customers.id, id)).limit(1);
  if (!existing) throw notFoundError("Khách không tồn tại");

  const patch: Partial<typeof customers.$inferInsert> = { updatedAt: new Date() };
  if (input.name !== undefined) {
    if (!input.name.trim()) throw validationError("Tên bắt buộc");
    patch.name = input.name.trim();
  }
  if (input.address !== undefined) {
    if (!input.address.trim()) throw validationError("Địa chỉ bắt buộc");
    patch.address = input.address.trim();
  }
  if (input.note !== undefined) patch.note = input.note;
  if (input.customerType !== undefined) patch.customerType = input.customerType;

  if (input.phone !== undefined) {
    const phone = normalizePhone(input.phone);
    const [dup] = await db
      .select({ id: customers.id })
      .from(customers)
      .where(and(eq(customers.phone, phone), ne(customers.id, id)))
      .limit(1);
    if (dup) throw validationError("Số điện thoại đã tồn tại");
    patch.phone = phone;
  }

  const [row] = await db.update(customers).set(patch).where(eq(customers.id, id)).returning();
  return row!;
}

export async function listZeroDebtCustomers(db: Db, limit = 30) {
  const rows = await db
    .select({
      id: customers.id,
      name: customers.name,
      phone: customers.phone,
      debtBalance: sql<number>`coalesce(sum(${debtLedger.amount}), 0)`,
    })
    .from(customers)
    .leftJoin(debtLedger, eq(debtLedger.customerId, customers.id))
    .where(eq(customers.isActive, true))
    .groupBy(customers.id, customers.name, customers.phone)
    .having(sql`coalesce(sum(${debtLedger.amount}), 0) = 0`)
    .limit(limit);

  return rows.map((r) => ({
    customerId: r.id,
    name: r.name,
    phone: r.phone,
    debtBalance: 0,
  }));
}

export async function getCustomerDetail(db: Db, id: string, includeCylinders = false) {
  const [customer] = await db
    .select()
    .from(customers)
    .where(eq(customers.id, id))
    .limit(1);

  if (!customer) throw notFoundError("Khách không tồn tại");

  const debtBalance = await getDebtBalance(db, id);
  const cylinderBalances = includeCylinders
    ? await getCylinderBalancesByType(db, id)
    : [];

  const cylinderBalance = cylinderBalances.reduce((s, c) => s + c.balance, 0);

  return { customer, debtBalance, cylinderBalance, cylinderBalances };
}

/** Tổng hợp mua hàng / vỏ / nợ của khách (toàn bộ lịch sử). */
export async function getCustomerLifetimeStats(db: Db, customerId: string) {
  const [debtBalance, cylinderBalances, [deliveryAgg], lineStats] = await Promise.all([
    getDebtBalance(db, customerId),
    getCylinderBalancesByType(db, customerId),
    db
      .select({
        totalPurchaseAmount: sql<number>`coalesce(sum(${deliveries.orderAmount}), 0)`,
        totalCashPaid: sql<number>`coalesce(sum(${deliveries.cashReceived}), 0)`,
        deliveryCount: sql<number>`count(*)::int`,
      })
      .from(deliveries)
      .where(and(eq(deliveries.customerId, customerId), eq(deliveries.status, "active"))),
    db
      .select({
        cylinderTypeId: cylinderTypes.id,
        typeName: cylinderTypes.name,
        totalOut: sql<number>`coalesce(sum(${deliveryLines.cylindersOut}), 0)`,
        totalIn: sql<number>`coalesce(sum(${deliveryLines.cylindersIn}), 0)`,
      })
      .from(deliveryLines)
      .innerJoin(deliveries, eq(deliveries.id, deliveryLines.deliveryId))
      .innerJoin(cylinderTypes, eq(cylinderTypes.id, deliveryLines.cylinderTypeId))
      .where(and(eq(deliveries.customerId, customerId), eq(deliveries.status, "active")))
      .groupBy(cylinderTypes.id, cylinderTypes.name)
      .orderBy(cylinderTypes.name),
  ]);

  const holdingByType = new Map(cylinderBalances.map((c) => [c.cylinderTypeId, c.balance]));
  const seenTypes = new Set<string>();

  const cylindersByType = lineStats.map((r) => {
    seenTypes.add(r.cylinderTypeId);
    return {
      typeName: r.typeName,
      totalPurchased: Number(r.totalOut ?? 0),
      totalReturned: Number(r.totalIn ?? 0),
      currentlyHolding: holdingByType.get(r.cylinderTypeId) ?? 0,
    };
  });

  for (const c of cylinderBalances) {
    if (seenTypes.has(c.cylinderTypeId) || c.balance === 0) continue;
    cylindersByType.push({
      typeName: c.name,
      totalPurchased: 0,
      totalReturned: 0,
      currentlyHolding: c.balance,
    });
  }

  cylindersByType.sort((a, b) => a.typeName.localeCompare(b.typeName, "vi"));

  return {
    debtBalance,
    totalPurchaseAmount: Number(deliveryAgg?.totalPurchaseAmount ?? 0),
    totalCashPaid: Number(deliveryAgg?.totalCashPaid ?? 0),
    deliveryCount: Number(deliveryAgg?.deliveryCount ?? 0),
    totalCylindersPurchased: cylindersByType.reduce((s, c) => s + c.totalPurchased, 0),
    totalCylindersHolding: cylindersByType.reduce((s, c) => s + c.currentlyHolding, 0),
    cylindersByType,
  };
}

export async function getDebtByPhone(db: Db, phone: string) {
  const normalized = normalizePhone(phone);
  const [customer] = await db
    .select()
    .from(customers)
    .where(eq(customers.phone, normalized))
    .limit(1);

  if (!customer) throw notFoundError("Không tìm thấy khách");
  const debtBalance = await getDebtBalance(db, customer.id);
  return {
    id: customer.id,
    name: customer.name,
    phone: customer.phone,
    address: customer.address,
    debtBalance,
  };
}

/** Tra nợ theo SĐT chính xác, tên hoặc địa chỉ. */
export async function searchCustomerDebt(db: Db, query: string, limit = 10) {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const normalized = normalizePhone(trimmed);
  const [byExactPhone] = await db
    .select()
    .from(customers)
    .where(eq(customers.phone, normalized))
    .limit(1);

  if (byExactPhone) {
    return [
      {
        id: byExactPhone.id,
        name: byExactPhone.name,
        phone: byExactPhone.phone,
        address: byExactPhone.address,
        debtBalance: await getDebtBalance(db, byExactPhone.id),
      },
    ];
  }

  const results = await searchCustomers(db, trimmed, limit);
  return Promise.all(
    results.map(async (c) => ({
      id: c.id,
      name: c.name,
      phone: c.phone,
      address: c.address,
      debtBalance: await getDebtBalance(db, c.id),
    })),
  );
}

export async function findCustomerByPhone(db: Db, phone: string) {
  const normalized = normalizePhone(phone);
  const [customer] = await db
    .select()
    .from(customers)
    .where(and(eq(customers.phone, normalized), eq(customers.isActive, true)))
    .limit(1);
  return customer ?? null;
}

export async function searchCustomers(db: Db, query: string, limit = 10) {
  const trimmed = query.trim();
  if (!trimmed) return [];

  if (looksLikePhone(trimmed)) {
    const phone = normalizePhone(trimmed);
    const byPhone = await db
      .select({
        id: customers.id,
        name: customers.name,
        phone: customers.phone,
        address: customers.address,
      })
      .from(customers)
      .where(and(eq(customers.isActive, true), eq(customers.phone, phone)))
      .limit(limit);
    if (byPhone.length) return byPhone;

    const partial = `%${phone.replace(/^0/, "")}%`;
    return db
      .select({
        id: customers.id,
        name: customers.name,
        phone: customers.phone,
        address: customers.address,
      })
      .from(customers)
      .where(and(eq(customers.isActive, true), ilike(customers.phone, partial)))
      .limit(limit);
  }

  const q = `%${trimmed}%`;
  return db
    .select({
      id: customers.id,
      name: customers.name,
      phone: customers.phone,
      address: customers.address,
    })
    .from(customers)
    .where(
      and(
        eq(customers.isActive, true),
        or(ilike(customers.name, q), ilike(customers.phone, q), ilike(customers.address, q)),
      ),
    )
    .limit(limit);
}
