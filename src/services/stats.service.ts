import { eq, and, gte, lte, sql, count, sum, inArray, desc } from "drizzle-orm";
import type { Db } from "../db/index.js";
import {
  customers,
  deliveries,
  deliveryLines,
  deliveryOrders,
  employees,
  cylinderTypes,
  users,
} from "../db/schema.js";
import { getTotalCylindersOutside, getTotalDebtBalance, listDebtors } from "./ledger.service.js";
import { getTotalGasSurplusKg } from "./gas-surplus.service.js";
import { listTeamMembers } from "./employee.service.js";

export type PaymentTag = "tm" | "ck" | "no";

function dayRange(date: Date) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

export function extractPayment(note: string | null): PaymentTag | null {
  if (!note) return null;
  const m = note.match(/payment=(tm|ck|no)/);
  return m ? (m[1] as PaymentTag) : null;
}

function classifyCash(note: string | null, cashReceived: number): PaymentTag {
  const tagged = extractPayment(note);
  if (tagged) return tagged;
  return cashReceived > 0 ? "tm" : "no";
}

export async function getStatsByEmployee(db: Db, date: Date) {
  const { start, end } = dayRange(date);
  const rows = await db
    .select({
      id: deliveries.id,
      employeeId: deliveries.employeeId,
      name: employees.name,
      cashReceived: deliveries.cashReceived,
      note: deliveries.note,
      cylindersOut: sum(deliveryLines.cylindersOut),
    })
    .from(deliveries)
    .innerJoin(employees, eq(employees.id, deliveries.employeeId))
    .leftJoin(deliveryLines, eq(deliveryLines.deliveryId, deliveries.id))
    .where(
      and(
        eq(deliveries.status, "active"),
        gte(deliveries.deliveredAt, start),
        lte(deliveries.deliveredAt, end),
      ),
    )
    .groupBy(
      deliveries.id,
      deliveries.employeeId,
      employees.name,
      deliveries.cashReceived,
      deliveries.note,
    );

  const map = new Map<
    string,
    { name: string; deliveryCount: number; cylindersOut: number; cashHeld: number }
  >();

  for (const r of rows) {
    const cur = map.get(r.employeeId) ?? {
      name: r.name,
      deliveryCount: 0,
      cylindersOut: 0,
      cashHeld: 0,
    };
    cur.deliveryCount += 1;
    cur.cylindersOut += Number(r.cylindersOut ?? 0);
    if (classifyCash(r.note, r.cashReceived) === "tm") {
      cur.cashHeld += r.cashReceived;
    }
    map.set(r.employeeId, cur);
  }

  return {
    date: start.toISOString().slice(0, 10),
    employees: [...map.values()].sort((a, b) => b.deliveryCount - a.deliveryCount),
  };
}

function monthRange(date: Date) {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  start.setHours(0, 0, 0, 0);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

export async function getStatsByRange(db: Db, start: Date, end: Date) {
  const dateLabel =
    start.toISOString().slice(0, 10) === end.toISOString().slice(0, 10)
      ? start.toISOString().slice(0, 10)
      : `${start.toISOString().slice(0, 10)} → ${end.toISOString().slice(0, 10)}`;

  const rangeDeliveries = await db
    .select({
      cashReceived: deliveries.cashReceived,
      debtAmount: deliveries.debtAmount,
      note: deliveries.note,
    })
    .from(deliveries)
    .where(
      and(
        eq(deliveries.status, "active"),
        gte(deliveries.deliveredAt, start),
        lte(deliveries.deliveredAt, end),
      ),
    );

  let cashRevenue = 0;
  let transferRevenue = 0;
  let debtAdded = 0;
  for (const d of rangeDeliveries) {
    const pay = classifyCash(d.note, d.cashReceived);
    if (pay === "tm") cashRevenue += d.cashReceived;
    else if (pay === "ck") transferRevenue += d.cashReceived;
    debtAdded += d.debtAmount;
  }

  const cylinderRows = await db
    .select({
      typeName: cylinderTypes.name,
      cylindersOut: sum(deliveryLines.cylindersOut),
      cylindersIn: sum(deliveryLines.cylindersIn),
    })
    .from(deliveryLines)
    .innerJoin(deliveries, eq(deliveries.id, deliveryLines.deliveryId))
    .innerJoin(cylinderTypes, eq(cylinderTypes.id, deliveryLines.cylinderTypeId))
    .where(
      and(
        eq(deliveries.status, "active"),
        gte(deliveries.deliveredAt, start),
        lte(deliveries.deliveredAt, end),
      ),
    )
    .groupBy(cylinderTypes.name)
    .orderBy(cylinderTypes.name);

  const empRows = await db
    .select({
      id: deliveries.id,
      employeeId: deliveries.employeeId,
      name: employees.name,
      cashReceived: deliveries.cashReceived,
      note: deliveries.note,
      cylindersOut: sum(deliveryLines.cylindersOut),
    })
    .from(deliveries)
    .innerJoin(employees, eq(employees.id, deliveries.employeeId))
    .leftJoin(deliveryLines, eq(deliveryLines.deliveryId, deliveries.id))
    .where(
      and(
        eq(deliveries.status, "active"),
        gte(deliveries.deliveredAt, start),
        lte(deliveries.deliveredAt, end),
      ),
    )
    .groupBy(
      deliveries.id,
      deliveries.employeeId,
      employees.name,
      deliveries.cashReceived,
      deliveries.note,
    );

  const empMap = new Map<
    string,
    { name: string; deliveryCount: number; cylindersOut: number; cashHeld: number }
  >();
  for (const r of empRows) {
    const cur = empMap.get(r.employeeId) ?? {
      name: r.name,
      deliveryCount: 0,
      cylindersOut: 0,
      cashHeld: 0,
    };
    cur.deliveryCount += 1;
    cur.cylindersOut += Number(r.cylindersOut ?? 0);
    if (classifyCash(r.note, r.cashReceived) === "tm") {
      cur.cashHeld += r.cashReceived;
    }
    empMap.set(r.employeeId, cur);
  }

  return {
    date: dateLabel,
    orderCount: rangeDeliveries.length,
    cashRevenue,
    transferRevenue,
    debtAdded,
    cylinders: cylinderRows.map((r) => ({
      typeName: r.typeName,
      cylindersOut: Number(r.cylindersOut ?? 0),
      cylindersIn: Number(r.cylindersIn ?? 0),
    })),
    employees: [...empMap.values()].sort((a, b) => b.deliveryCount - a.deliveryCount),
  };
}

export async function getStatsByDay(db: Db, date: Date) {
  const { start, end } = dayRange(date);
  const stats = await getStatsByRange(db, start, end);
  return {
    date: start.toISOString().slice(0, 10),
    orderCount: stats.orderCount,
    cashRevenue: stats.cashRevenue,
    transferRevenue: stats.transferRevenue,
    debtAdded: stats.debtAdded,
    cylinders: stats.cylinders,
  };
}

export async function getStatsByMonth(db: Db, date: Date) {
  const { start, end } = monthRange(date);
  return getStatsByRange(db, start, end);
}

export async function getStatsOrders(db: Db) {
  const rows = await db
    .select({
      status: deliveryOrders.status,
      cnt: count(),
    })
    .from(deliveryOrders)
    .groupBy(deliveryOrders.status);

  const byStatus: Record<string, number> = {};
  for (const r of rows) {
    byStatus[r.status] = Number(r.cnt);
  }

  const notDelivered = byStatus.pending ?? 0;
  const delivering = byStatus.delivering ?? 0;
  const completed = byStatus.completed ?? 0;
  const cancelled = byStatus.cancelled ?? 0;

  const openList = await db
    .select({
      status: deliveryOrders.status,
      customerName: customers.name,
      assignedEmployeeName: employees.name,
    })
    .from(deliveryOrders)
    .innerJoin(customers, eq(customers.id, deliveryOrders.customerId))
    .leftJoin(employees, eq(employees.id, deliveryOrders.assignedEmployeeId))
    .where(inArray(deliveryOrders.status, ["pending", "delivering"]))
    .orderBy(desc(deliveryOrders.createdAt))
    .limit(8);

  const completedList = await db
    .select({
      status: deliveryOrders.status,
      customerName: customers.name,
      assignedEmployeeName: employees.name,
    })
    .from(deliveryOrders)
    .innerJoin(customers, eq(customers.id, deliveryOrders.customerId))
    .leftJoin(employees, eq(employees.id, deliveryOrders.assignedEmployeeId))
    .where(eq(deliveryOrders.status, "completed"))
    .orderBy(desc(deliveryOrders.completedAt))
    .limit(8);

  return {
    notDelivered,
    delivering,
    completed,
    cancelled,
    byStatus,
    openList,
    completedList,
  };
}

export async function getDashboardTrend(db: Db, days = 7) {
  const points: {
    date: string;
    deliveries: number;
    revenue: number;
    debtAdded: number;
  }[] = [];

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const day = await getStatsByDay(db, d);
    points.push({
      date: day.date,
      deliveries: day.orderCount,
      revenue: day.cashRevenue + day.transferRevenue,
      debtAdded: day.debtAdded,
    });
  }

  return { days, points };
}

/** Tổng quan bot — Tong_Quan menu Thống kê */
export async function getStatsOverview(db: Db) {
  const [primaryRow] = await db
    .select({ n: count() })
    .from(users)
    .where(eq(users.role, "owner"));
  const [coRow] = await db
    .select({ n: count() })
    .from(users)
    .where(eq(users.role, "co_owner"));
  const team = await listTeamMembers(db);
  const employeeCount = team.filter((m) => m.role === "employee").length;
  const [custRow] = await db
    .select({ n: count() })
    .from(customers)
    .where(eq(customers.isActive, true));
  const month = await getStatsByMonth(db, new Date());
  const totalDebt = await getTotalDebtBalance(db);

  return {
    primaryOwnerCount: Number(primaryRow?.n ?? 0),
    coOwnerCount: Number(coRow?.n ?? 0),
    adminCount: Number(primaryRow?.n ?? 0) + Number(coRow?.n ?? 0),
    employeeCount,
    customerCount: Number(custRow?.n ?? 0),
    monthRevenue: month.cashRevenue + month.transferRevenue,
    monthCash: month.cashRevenue,
    monthTransfer: month.transferRevenue,
    monthOrderCount: month.orderCount,
    monthDebtAdded: month.debtAdded,
    totalDebt,
    monthLabel: month.date,
  };
}

function weekRange(date: Date) {
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  const start = new Date(date);
  start.setDate(start.getDate() - 6);
  start.setHours(0, 0, 0, 0);
  return { start, end };
}

export async function getStatsByWeek(db: Db, date: Date) {
  const { start, end } = weekRange(date);
  return getStatsByRange(db, start, end);
}

export async function getStatsByCustomer(db: Db, date: Date) {
  const { start, end } = monthRange(date);
  const rows = await db
    .select({
      name: customers.name,
      phone: customers.phone,
      deliveryCount: count(deliveries.id),
      cylindersOut: sum(deliveryLines.cylindersOut),
    })
    .from(deliveries)
    .innerJoin(customers, eq(customers.id, deliveries.customerId))
    .leftJoin(deliveryLines, eq(deliveryLines.deliveryId, deliveries.id))
    .where(
      and(
        eq(deliveries.status, "active"),
        gte(deliveries.deliveredAt, start),
        lte(deliveries.deliveredAt, end),
      ),
    )
    .groupBy(customers.id, customers.name, customers.phone)
    .orderBy(sql`count(${deliveries.id}) desc`)
    .limit(15);

  return {
    periodLabel: start.toISOString().slice(0, 7),
    customers: rows.map((r) => ({
      name: r.name,
      phone: r.phone,
      deliveryCount: Number(r.deliveryCount),
      cylindersOut: Number(r.cylindersOut ?? 0),
    })),
  };
}

export async function getDashboard(
  db: Db,
  date: Date,
  options?: { includeCylinders?: boolean; period?: "day" | "month" },
) {
  const period = options?.period ?? "day";
  const monthStats = period === "month" ? await getStatsByMonth(db, date) : null;
  const dayStats = period === "day" ? await getStatsByDay(db, date) : null;
  const empStats = period === "day" ? await getStatsByEmployee(db, date) : null;

  const stats = monthStats ?? dayStats!;
  const topEmployeesSource = monthStats?.employees ?? empStats?.employees ?? [];

  let totalCylindersOutside = 0;
  if (options?.includeCylinders) {
    totalCylindersOutside = await getTotalCylindersOutside(db);
  }

  const totalDebtAllCustomers = await getTotalDebtBalance(db);
  const { start, end } = period === "month"
    ? (() => {
        const s = new Date(date.getFullYear(), date.getMonth(), 1);
        const e = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
        return { start: s, end: e };
      })()
    : (() => {
        const s = new Date(date);
        s.setHours(0, 0, 0, 0);
        const e = new Date(date);
        e.setHours(23, 59, 59, 999);
        return { start: s, end: e };
      })();
  const totalGasSurplusKg = await getTotalGasSurplusKg(db, { from: start, to: end });
  const totalGasSurplusAllKg = await getTotalGasSurplusKg(db);

  return {
    period,
    date: stats.date,
    totalDeliveries: stats.orderCount,
    totalCashReceived: stats.cashRevenue + stats.transferRevenue,
    cashRevenue: stats.cashRevenue,
    transferRevenue: stats.transferRevenue,
    debtAddedInPeriod: stats.debtAdded,
    totalDebt: totalDebtAllCustomers,
    totalCylindersOutside: options?.includeCylinders ? totalCylindersOutside : 0,
    totalGasSurplusKg,
    totalGasSurplusAllKg,
    cylinders: stats.cylinders,
    topEmployees: topEmployeesSource.slice(0, 5).map((e) => ({
      name: e.name,
      deliveryCount: e.deliveryCount,
      cylindersOut: e.cylindersOut,
      cashHeld: e.cashHeld,
    })),
  };
}

export { listDebtors };
