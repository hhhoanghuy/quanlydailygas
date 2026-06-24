import { eq, and, gte, lte, sql, desc, inArray } from "drizzle-orm";
import type { Db } from "../db/index.js";
import { customers, deliveries, deliveryLines, cylinderTypes } from "../db/schema.js";

function monthRange(date = new Date()) {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  start.setHours(0, 0, 0, 0);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

export async function getTotalGasSurplusKg(
  db: Db,
  opts?: { from?: Date; to?: Date },
): Promise<number> {
  const conditions = [eq(deliveries.status, "active")];
  if (opts?.from) conditions.push(gte(deliveries.deliveredAt, opts.from));
  if (opts?.to) conditions.push(lte(deliveries.deliveredAt, opts.to));

  const [row] = await db
    .select({
      total: sql<number>`coalesce(sum(${deliveryLines.gasSurplusKg}), 0)`,
    })
    .from(deliveryLines)
    .innerJoin(deliveries, eq(deliveries.id, deliveryLines.deliveryId))
    .where(and(...conditions));

  return Number(row?.total ?? 0);
}

export async function listGasSurplusByCustomer(
  db: Db,
  opts?: { from?: Date; to?: Date; limit?: number },
) {
  const limit = opts?.limit ?? 50;
  const conditions = [eq(deliveries.status, "active")];
  if (opts?.from) conditions.push(gte(deliveries.deliveredAt, opts.from));
  if (opts?.to) conditions.push(lte(deliveries.deliveredAt, opts.to));

  const rows = await db
    .select({
      customerId: customers.id,
      customerName: customers.name,
      customerPhone: customers.phone,
      totalKg: sql<number>`coalesce(sum(${deliveryLines.gasSurplusKg}), 0)`,
      deliveryCount: sql<number>`count(distinct ${deliveries.id})`,
    })
    .from(deliveryLines)
    .innerJoin(deliveries, eq(deliveries.id, deliveryLines.deliveryId))
    .innerJoin(customers, eq(customers.id, deliveries.customerId))
    .where(and(...conditions))
    .groupBy(customers.id, customers.name, customers.phone)
    .having(sql`coalesce(sum(${deliveryLines.gasSurplusKg}), 0) > 0`)
    .orderBy(desc(sql`sum(${deliveryLines.gasSurplusKg})`))
    .limit(limit);

  return rows.map((r) => ({
    customerId: r.customerId,
    customerName: r.customerName,
    customerPhone: r.customerPhone,
    totalKg: Number(r.totalKg ?? 0),
    deliveryCount: Number(r.deliveryCount ?? 0),
  }));
}

export async function listGasSurplusRecent(db: Db, opts?: { limit?: number }) {
  const limit = opts?.limit ?? 30;

  const deliveryRows = await db
    .select({
      deliveryId: deliveries.id,
      deliveredAt: deliveries.deliveredAt,
      customerName: customers.name,
      customerPhone: customers.phone,
      totalKg: sql<number>`coalesce(sum(${deliveryLines.gasSurplusKg}), 0)`,
    })
    .from(deliveries)
    .innerJoin(customers, eq(customers.id, deliveries.customerId))
    .innerJoin(deliveryLines, eq(deliveryLines.deliveryId, deliveries.id))
    .where(eq(deliveries.status, "active"))
    .groupBy(deliveries.id, deliveries.deliveredAt, customers.name, customers.phone)
    .having(sql`coalesce(sum(${deliveryLines.gasSurplusKg}), 0) > 0`)
    .orderBy(desc(deliveries.deliveredAt))
    .limit(limit);

  if (!deliveryRows.length) return [];

  const ids = deliveryRows.map((d) => d.deliveryId);
  const allLines = await db
    .select({
      deliveryId: deliveryLines.deliveryId,
      typeName: cylinderTypes.name,
      gasSurplusKg: deliveryLines.gasSurplusKg,
    })
    .from(deliveryLines)
    .innerJoin(cylinderTypes, eq(cylinderTypes.id, deliveryLines.cylinderTypeId))
    .where(inArray(deliveryLines.deliveryId, ids));

  const linesByDelivery = new Map<string, { typeName: string; kg: number }[]>();
  for (const l of allLines) {
    const kg = Number(l.gasSurplusKg ?? 0);
    if (kg <= 0) continue;
    const arr = linesByDelivery.get(l.deliveryId) ?? [];
    arr.push({ typeName: l.typeName, kg });
    linesByDelivery.set(l.deliveryId, arr);
  }

  return deliveryRows.map((d) => ({
    deliveryId: d.deliveryId,
    deliveredAt: d.deliveredAt,
    customerName: d.customerName,
    customerPhone: d.customerPhone,
    totalKg: Number(d.totalKg ?? 0),
    lines: linesByDelivery.get(d.deliveryId) ?? [],
  }));
}

export async function getGasSurplusDashboard(db: Db) {
  const { start, end } = monthRange();
  const [totalAll, totalMonth, byCustomer, recent] = await Promise.all([
    getTotalGasSurplusKg(db),
    getTotalGasSurplusKg(db, { from: start, to: end }),
    listGasSurplusByCustomer(db, { from: start, to: end, limit: 20 }),
    listGasSurplusRecent(db, { limit: 20 }),
  ]);

  return {
    totalAllKg: totalAll,
    totalMonthKg: totalMonth,
    monthLabel: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}`,
    byCustomer,
    recent,
  };
}
