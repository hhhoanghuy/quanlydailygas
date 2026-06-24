import { eq, and, desc, lte, or, isNull, sql, sum, ilike } from "drizzle-orm";
import type { Db } from "../db/index.js";
import {
  debtLedger,
  customers,
  cylinderLedger,
  cylinderTypes,
  deliveryLines,
  deliveries,
} from "../db/schema.js";

export async function getDebtBalance(db: Db, customerId: string): Promise<number> {
  const [row] = await db
    .select({ total: sum(debtLedger.amount) })
    .from(debtLedger)
    .where(eq(debtLedger.customerId, customerId));
  return Number(row?.total ?? 0);
}

export async function getCylinderBalance(
  db: Db,
  customerId: string,
  cylinderTypeId?: string,
): Promise<number> {
  const conditions = [eq(cylinderLedger.customerId, customerId)];
  if (cylinderTypeId) {
    conditions.push(eq(cylinderLedger.cylinderTypeId, cylinderTypeId));
  }
  const [row] = await db
    .select({ total: sum(cylinderLedger.quantity) })
    .from(cylinderLedger)
    .where(and(...conditions));
  return Number(row?.total ?? 0);
}

export async function getCylinderBalancesByType(
  db: Db,
  customerId: string,
): Promise<{ cylinderTypeId: string; name: string; balance: number }[]> {
  const rows = await db
    .select({
      cylinderTypeId: cylinderLedger.cylinderTypeId,
      name: cylinderTypes.name,
      total: sum(cylinderLedger.quantity),
    })
    .from(cylinderLedger)
    .innerJoin(cylinderTypes, eq(cylinderLedger.cylinderTypeId, cylinderTypes.id))
    .where(eq(cylinderLedger.customerId, customerId))
    .groupBy(cylinderLedger.cylinderTypeId, cylinderTypes.name);

  return rows.map((r) => ({
    cylinderTypeId: r.cylinderTypeId,
    name: r.name,
    balance: Number(r.total ?? 0),
  }));
}

export async function getTotalCylindersOutside(db: Db): Promise<number> {
  const [row] = await db
    .select({ total: sum(cylinderLedger.quantity) })
    .from(cylinderLedger);
  return Number(row?.total ?? 0);
}

export async function insertDebtEntry(
  db: Db,
  data: {
    customerId: string;
    amount: number;
    referenceType: "delivery" | "payment" | "void";
    referenceId: string;
  },
) {
  await db.insert(debtLedger).values(data);
}

export async function insertCylinderEntriesForLines(
  db: Db,
  customerId: string,
  deliveryId: string,
  lines: { cylinderTypeId: string; cylindersOut: number; cylindersIn: number }[],
) {
  for (const line of lines) {
    if (line.cylindersOut > 0) {
      await db.insert(cylinderLedger).values({
        customerId,
        cylinderTypeId: line.cylinderTypeId,
        quantity: line.cylindersOut,
        referenceType: "delivery",
        referenceId: deliveryId,
      });
    }
    if (line.cylindersIn > 0) {
      await db.insert(cylinderLedger).values({
        customerId,
        cylinderTypeId: line.cylinderTypeId,
        quantity: -line.cylindersIn,
        referenceType: "delivery",
        referenceId: deliveryId,
      });
    }
  }
}

/** P2 backfill: sinh cylinder ledger từ delivery_lines đã lưu */
export async function backfillCylinderLedgerFromDeliveries(db: Db): Promise<number> {
  const activeDeliveries = await db
    .select()
    .from(deliveries)
    .where(eq(deliveries.status, "active"));

  let count = 0;
  for (const d of activeDeliveries) {
    const existing = await db
      .select({ id: cylinderLedger.id })
      .from(cylinderLedger)
      .where(
        and(
          eq(cylinderLedger.referenceId, d.id),
          eq(cylinderLedger.referenceType, "delivery"),
        ),
      )
      .limit(1);

    if (existing.length > 0) continue;

    const lines = await db
      .select()
      .from(deliveryLines)
      .where(eq(deliveryLines.deliveryId, d.id));

    await insertCylinderEntriesForLines(
      db,
      d.customerId,
      d.id,
      lines.map((l) => ({
        cylinderTypeId: l.cylinderTypeId,
        cylindersOut: l.cylindersOut,
        cylindersIn: l.cylindersIn,
      })),
    );
    count++;
  }
  return count;
}

export async function listDebtors(
  db: Db,
  minDebt = 1,
): Promise<{ customerId: string; name: string; phone: string; debtBalance: number }[]> {
  const rows = await db
    .select({
      customerId: customers.id,
      name: customers.name,
      phone: customers.phone,
      debtBalance: sum(debtLedger.amount),
    })
    .from(customers)
    .innerJoin(debtLedger, eq(debtLedger.customerId, customers.id))
    .where(eq(customers.isActive, true))
    .groupBy(customers.id, customers.name, customers.phone)
    .having(sql`sum(${debtLedger.amount}) >= ${minDebt}`)
    .orderBy(desc(sum(debtLedger.amount)));

  return rows.map((r) => ({
    customerId: r.customerId,
    name: r.name,
    phone: r.phone,
    debtBalance: Number(r.debtBalance ?? 0),
  }));
}

export async function getTotalDebtBalance(db: Db): Promise<number> {
  const debtors = await listDebtors(db, 1);
  return debtors.reduce((sum, d) => sum + d.debtBalance, 0);
}

export async function listCylinderHolders(db: Db, opts?: { search?: string }) {
  const search = opts?.search?.trim();
  const searchCond = search
    ? and(
        eq(customers.isActive, true),
        or(ilike(customers.name, `%${search}%`), ilike(customers.phone, `%${search}%`)),
      )
    : eq(customers.isActive, true);

  const rows = await db
    .select({
      customerId: customers.id,
      customerName: customers.name,
      customerPhone: customers.phone,
      typeName: cylinderTypes.name,
      cylinderTypeId: cylinderTypes.id,
      balance: sum(cylinderLedger.quantity),
    })
    .from(cylinderLedger)
    .innerJoin(customers, eq(customers.id, cylinderLedger.customerId))
    .innerJoin(cylinderTypes, eq(cylinderTypes.id, cylinderLedger.cylinderTypeId))
    .where(searchCond)
    .groupBy(
      customers.id,
      customers.name,
      customers.phone,
      cylinderTypes.id,
      cylinderTypes.name,
    )
    .having(sql`sum(${cylinderLedger.quantity}) <> 0`);

  const map = new Map<
    string,
    {
      customerId: string;
      name: string;
      phone: string;
      types: { typeName: string; balance: number }[];
      total: number;
    }
  >();

  for (const r of rows) {
    const bal = Number(r.balance ?? 0);
    const cur = map.get(r.customerId) ?? {
      customerId: r.customerId,
      name: r.customerName,
      phone: r.customerPhone,
      types: [],
      total: 0,
    };
    cur.types.push({ typeName: r.typeName, balance: bal });
    cur.total += bal;
    map.set(r.customerId, cur);
  }

  return [...map.values()].sort((a, b) => b.total - a.total);
}

export async function getCylinderSummaryByType(db: Db) {
  const rows = await db
    .select({
      typeName: cylinderTypes.name,
      total: sum(cylinderLedger.quantity),
    })
    .from(cylinderLedger)
    .innerJoin(cylinderTypes, eq(cylinderTypes.id, cylinderLedger.cylinderTypeId))
    .groupBy(cylinderTypes.name)
    .orderBy(cylinderTypes.name);

  return rows.map((r) => ({
    typeName: r.typeName,
    total: Number(r.total ?? 0),
  }));
}
