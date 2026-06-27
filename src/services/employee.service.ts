import { eq, and, count, gte, lte, or, isNull, inArray, asc } from "drizzle-orm";
import type { Db } from "../db/index.js";
import { deliveries, employees, users } from "../db/schema.js";
import { notFoundError, validationError } from "../../utils/errors.js";
import { normalizePhone } from "../../utils/phone.js";
import { roleDisplayLabel } from "../../utils/auth-roles.js";

function monthRange(date = new Date()) {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  start.setHours(0, 0, 0, 0);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

export type TeamMemberRole = "owner" | "co_owner" | "employee" | "pending";

export type TeamMember = {
  id: string;
  name: string;
  phone: string;
  active: boolean;
  createdAt: Date;
  hasTelegram: boolean;
  telegramUsername: string | null;
  role: TeamMemberRole;
  roleLabel: string;
  /** Chủ chính (role owner) */
  isOwner: boolean;
  isCoOwner: boolean;
  deliveriesThisMonth: number;
};

async function deliveriesThisMonth(db: Db, employeeId: string) {
  const { start, end } = monthRange();
  const [row] = await db
    .select({ n: count(deliveries.id) })
    .from(deliveries)
    .where(
      and(
        eq(deliveries.employeeId, employeeId),
        eq(deliveries.status, "active"),
        gte(deliveries.deliveredAt, start),
        lte(deliveries.deliveredAt, end),
      ),
    );
  return Number(row?.n ?? 0);
}

/** Danh sách đội ngũ: chủ chính + co-owner + nhân viên */
export async function listTeamMembers(db: Db): Promise<TeamMember[]> {
  const { start, end } = monthRange();
  const result: TeamMember[] = [];
  const adminEmployeeIds = new Set<string>();

  const adminUsers = await db
    .select({
      userId: users.id,
      userRole: users.role,
      name: users.name,
      telegramUsername: users.telegramUsername,
      employeeId: users.employeeId,
      empName: employees.name,
      empPhone: employees.phone,
      empActive: employees.active,
      empCreatedAt: employees.createdAt,
      userCreatedAt: users.createdAt,
    })
    .from(users)
    .leftJoin(employees, eq(users.employeeId, employees.id))
    .where(inArray(users.role, ["owner", "co_owner"]))
    .orderBy(asc(users.createdAt));

  for (const a of adminUsers) {
    if (!a.employeeId) continue;
    adminEmployeeIds.add(a.employeeId);
    const role = a.userRole as TeamMemberRole;
    const delCount = await deliveriesThisMonth(db, a.employeeId);
    result.push({
      id: a.employeeId,
      name: a.name || a.empName || "Quản trị",
      phone: a.empPhone ?? "—",
      active: a.empActive ?? true,
      createdAt: a.empCreatedAt ?? a.userCreatedAt,
      hasTelegram: true,
      telegramUsername: a.telegramUsername,
      role,
      roleLabel: roleDisplayLabel(role),
      isOwner: role === "owner",
      isCoOwner: role === "co_owner",
      deliveriesThisMonth: delCount,
    });
  }

  const nvRows = await db
    .select({
      id: employees.id,
      name: employees.name,
      phone: employees.phone,
      active: employees.active,
      createdAt: employees.createdAt,
      userId: users.id,
      telegramUsername: users.telegramUsername,
      userRole: users.role,
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
      users.role,
    )
    .orderBy(employees.name);

  for (const r of nvRows) {
    if (adminEmployeeIds.has(r.id)) continue;
    const role: TeamMemberRole = r.userId && r.userRole === "employee" ? "employee" : "pending";
    result.push({
      id: r.id,
      name: r.name,
      phone: r.phone,
      active: r.active,
      createdAt: r.createdAt,
      hasTelegram: Boolean(r.userId),
      telegramUsername: r.telegramUsername,
      role,
      roleLabel: roleDisplayLabel(role),
      isOwner: false,
      isCoOwner: false,
      deliveriesThisMonth: Number(r.deliveriesThisMonth ?? 0),
    });
  }

  return result;
}

export async function setEmployeeActive(db: Db, id: string, active: boolean) {
  const adminLinks = await db
    .select({ employeeId: users.employeeId })
    .from(users)
    .where(inArray(users.role, ["owner", "co_owner"]));
  if (adminLinks.some((l) => l.employeeId === id)) {
    throw notFoundError("Không thể thay đổi trạng thái quản trị viên");
  }

  const [row] = await db
    .update(employees)
    .set({ active })
    .where(eq(employees.id, id))
    .returning();
  if (!row) throw notFoundError("Nhân viên không tồn tại");
  return row;
}

/** @deprecated dùng listTeamMembers — giữ tương thích API cũ */
export async function listEmployees(db: Db) {
  const team = await listTeamMembers(db);
  return team.filter((m) => m.role === "employee" || m.role === "pending");
}

export async function updateEmployee(
  db: Db,
  id: string,
  input: { name?: string; phone?: string },
) {
  const name = input.name?.trim();
  const phoneRaw = input.phone?.trim();
  if (!name && !phoneRaw) throw validationError("Cần tên hoặc SĐT");

  const [existing] = await db.select().from(employees).where(eq(employees.id, id)).limit(1);
  if (!existing) throw notFoundError("Nhân viên không tồn tại");

  const updates: { name?: string; phone?: string } = {};
  if (name) updates.name = name;
  if (phoneRaw) updates.phone = normalizePhone(phoneRaw);

  const [row] = await db.update(employees).set(updates).where(eq(employees.id, id)).returning();

  if (name) {
    await db.update(users).set({ name }).where(eq(users.employeeId, id));
  }

  return row;
}
