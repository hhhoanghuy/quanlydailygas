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

export type TeamMemberRole = "owner" | "employee" | "pending";

export type TeamMember = {
  id: string;
  name: string;
  phone: string;
  active: boolean;
  createdAt: Date;
  hasTelegram: boolean;
  telegramUsername: string | null;
  /** owner | employee | pending (NV chưa kích hoạt Telegram) */
  role: TeamMemberRole;
  /** Nhãn tiếng Việt hiển thị UI */
  roleLabel: string;
  isOwner: boolean;
  deliveriesThisMonth: number;
};

function roleLabel(role: TeamMemberRole): string {
  if (role === "owner") return "Chủ đại lý";
  if (role === "employee") return "Nhân viên";
  return "Chưa kích hoạt";
}

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

/** Danh sách đội ngũ: chủ đại lý + nhân viên — phân vai trò rõ ràng */
export async function listTeamMembers(db: Db): Promise<TeamMember[]> {
  const { start, end } = monthRange();
  const result: TeamMember[] = [];

  const [ownerUser] = await db
    .select({
      userId: users.id,
      name: users.name,
      telegramUsername: users.telegramUsername,
      employeeId: users.employeeId,
      empName: employees.name,
      empPhone: employees.phone,
      empActive: employees.active,
      empCreatedAt: employees.createdAt,
    })
    .from(users)
    .innerJoin(employees, eq(users.employeeId, employees.id))
    .where(eq(users.role, "owner"))
    .limit(1);

  if (ownerUser?.employeeId) {
    const delCount = await deliveriesThisMonth(db, ownerUser.employeeId);
    result.push({
      id: ownerUser.employeeId,
      name: ownerUser.name || ownerUser.empName,
      phone: ownerUser.empPhone,
      active: ownerUser.empActive,
      createdAt: ownerUser.empCreatedAt,
      hasTelegram: true,
      telegramUsername: ownerUser.telegramUsername,
      role: "owner",
      roleLabel: roleLabel("owner"),
      isOwner: true,
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
    if (ownerUser?.employeeId && r.id === ownerUser.employeeId) continue;
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
      roleLabel: roleLabel(role),
      isOwner: false,
      deliveriesThisMonth: Number(r.deliveriesThisMonth ?? 0),
    });
  }

  return result;
}

/** @deprecated dùng listTeamMembers — giữ tương thích API cũ */
export async function listEmployees(db: Db) {
  const team = await listTeamMembers(db);
  return team.filter((m) => !m.isOwner);
}

export async function setEmployeeActive(db: Db, id: string, active: boolean) {
  const [ownerLink] = await db
    .select({ employeeId: users.employeeId })
    .from(users)
    .where(eq(users.role, "owner"))
    .limit(1);
  if (ownerLink?.employeeId === id) {
    throw notFoundError("Không thể thay đổi trạng thái chủ đại lý");
  }

  const [row] = await db
    .update(employees)
    .set({ active })
    .where(eq(employees.id, id))
    .returning();
  if (!row) throw notFoundError("Nhân viên không tồn tại");
  return row;
}
