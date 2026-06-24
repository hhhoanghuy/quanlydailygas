import { eq, and, count, gte, lte, or, isNull } from "drizzle-orm";
import type { Db } from "../db/index.js";
import { deliveries, employees, users } from "../db/schema.js";
import { notFoundError } from "../../utils/errors.js";

function monthRange(date = new Date()) {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  start.setHours(0, 0, 0, 0);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

export async function listEmployees(db: Db) {
  const { start, end } = monthRange();

  const rows = await db
    .select({
      id: employees.id,
      name: employees.name,
      phone: employees.phone,
      active: employees.active,
      createdAt: employees.createdAt,
      userId: users.id,
      telegramUsername: users.telegramUsername,
      telegramUserId: users.telegramUserId,
      role: users.role,
      deliveriesThisMonth: count(deliveries.id),
    })
    .from(employees)
    .leftJoin(users, eq(users.employeeId, employees.id))
    .leftJoin(
      deliveries,
      and(
        eq(deliveries.employeeId, employees.id),
        eq(deliveries.status, "active"),
        gte(deliveries.deliveredAt, start),
        lte(deliveries.deliveredAt, end),
      ),
    )
    .where(or(isNull(users.id), eq(users.role, "employee")))
    .groupBy(
      employees.id,
      employees.name,
      employees.phone,
      employees.active,
      employees.createdAt,
      users.id,
      users.telegramUsername,
      users.telegramUserId,
      users.role,
    )
    .orderBy(employees.name);

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    phone: r.phone,
    active: r.active,
    createdAt: r.createdAt,
    hasTelegram: Boolean(r.userId),
    telegramUsername: r.telegramUsername,
    role: r.role ?? null,
    deliveriesThisMonth: Number(r.deliveriesThisMonth ?? 0),
  }));
}

export async function setEmployeeActive(db: Db, id: string, active: boolean) {
  const [row] = await db
    .update(employees)
    .set({ active })
    .where(eq(employees.id, id))
    .returning();
  if (!row) throw notFoundError("Nhân viên không tồn tại");
  return row;
}
