import { eq, and, gt } from "drizzle-orm";
import { createHmac, createHash } from "node:crypto";
import { customAlphabet } from "nanoid";
import type { Db } from "../db/index.js";
import {
  inviteCodes,
  users,
  sessions,
  employees,
} from "../db/schema.js";
import { validationError, unauthorizedError, forbiddenError } from "../../utils/errors.js";
import { getBotUsername, getPublicBaseUrl } from "../config/env.js";

const genToken = customAlphabet("abcdefghijklmnopqrstuvwxyz0123456789", 48);
const genInviteCode = customAlphabet("ABCDEFGHJKLMNPQRSTUVWXYZ23456789", 8);
const genMagicCode = customAlphabet("abcdefghijklmnopqrstuvwxyz0123456789", 16);

const MAGIC_LINK_TTL_MINUTES = 5;
const WEB_SESSION_TTL_MINUTES = 8 * 60;

export async function createInviteCode(
  db: Db,
  role: "owner" | "employee",
  expiresInHours = 72,
) {
  const code = `GAS-${genInviteCode()}`;
  const expiresAt = new Date(Date.now() + expiresInHours * 3600_000);

  const [row] = await db
    .insert(inviteCodes)
    .values({ code, role, expiresAt })
    .returning();

  return row;
}

export async function activateInvite(
  db: Db,
  input: {
    inviteCode: string;
    telegramUserId: number;
    telegramUsername?: string;
    name: string;
  },
) {
  const code = normalizeInviteCode(input.inviteCode);

  const existingUser = await getUserByTelegramId(db, input.telegramUserId);
  if (existingUser) {
    throw validationError(
      "Tài khoản Telegram này đã kích hoạt. Gõ /menu để vào hệ thống.",
    );
  }

  const [invite] = await db
    .select()
    .from(inviteCodes)
    .where(eq(inviteCodes.code, code))
    .limit(1);

  if (!invite) throw validationError("Mã mời không hợp lệ");
  if (invite.usedByUserId) throw validationError("Mã mời đã được sử dụng");
  if (invite.expiresAt < new Date()) throw validationError("Mã mời đã hết hạn");

  let employeeId: string | null = null;
  const [emp] = await db
    .insert(employees)
    .values({
      name: input.name,
      phone: invite.role === "employee" ? String(input.telegramUserId) : "owner",
      active: true,
    })
    .returning();
  employeeId = emp.id;

  const [user] = await db
    .insert(users)
    .values({
      telegramUserId: input.telegramUserId,
      telegramUsername: input.telegramUsername,
      name: input.name,
      role: invite.role,
      employeeId,
    })
    .returning();

  await db
    .update(inviteCodes)
    .set({ usedByUserId: user.id })
    .where(eq(inviteCodes.id, invite.id));

  const session = await createSession(db, user.id, "telegram", 30 * 24);
  return { user, token: session.token };
}

export async function createMagicLink(db: Db, userId: string) {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw unauthorizedError("User không tồn tại");
  assertOwner(user);

  const code = genMagicCode();
  const expiresAt = new Date(Date.now() + MAGIC_LINK_TTL_MINUTES * 60_000);

  await db.insert(sessions).values({
    token: code,
    userId: user.id,
    type: "magic_link",
    expiresAt,
  });

  const baseUrl = getPublicBaseUrl();
  return {
    code,
    url: `${baseUrl}/dashboard?code=${code}`,
    expiresAt,
    expiresInMinutes: MAGIC_LINK_TTL_MINUTES,
  };
}

export async function exchangeMagicLink(db: Db, code: string) {
  const trimmed = code?.trim();
  if (!trimmed) throw validationError("Thiếu mã đăng nhập");
  // Chỉ mã 16 ký tự từ createMagicLink — không nhầm với token phiên web (48 ký tự)
  if (trimmed.length !== 16) {
    throw unauthorizedError("Link đăng nhập không hợp lệ");
  }

  const [row] = await db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(
      and(
        eq(sessions.token, trimmed),
        eq(sessions.type, "magic_link"),
        gt(sessions.expiresAt, new Date()),
      ),
    )
    .limit(1);

  if (!row) {
    throw unauthorizedError("Link đăng nhập hết hạn (5 phút) hoặc đã được sử dụng");
  }
  assertOwner(row.user);

  await db.delete(sessions).where(eq(sessions.id, row.session.id));

  const session = await createSession(db, row.user.id, "web", WEB_SESSION_TTL_MINUTES);
  return {
    token: session.token,
    user: {
      id: row.user.id,
      name: row.user.name,
      role: row.user.role,
      employee_id: row.user.employeeId,
    },
    expires_at: session.expiresAt,
  };
}

export async function revokeSession(db: Db, token: string) {
  await db.delete(sessions).where(eq(sessions.token, token));
  return { ok: true };
}

export async function createSession(
  db: Db,
  userId: string,
  type: "telegram" | "magic_link" | "web",
  ttlMinutes: number,
) {
  const token = genToken();
  const expiresAt = new Date(Date.now() + ttlMinutes * 60_000);

  const [session] = await db
    .insert(sessions)
    .values({ token, userId, type, expiresAt })
    .returning();

  return session;
}

export async function getUserFromToken(db: Db, token: string) {
  const [row] = await db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.token, token), gt(sessions.expiresAt, new Date())))
    .limit(1);

  if (!row) throw unauthorizedError("Token không hợp lệ hoặc hết hạn");
  return row.user;
}

export async function getUserByTelegramId(db: Db, telegramUserId: number) {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.telegramUserId, telegramUserId))
    .limit(1);
  return user ?? null;
}

/** Chủ/NV cũ thiếu employee_id — tự gắn để ghi delivery */
export async function ensureEmployeeId(db: Db, user: typeof users.$inferSelect) {
  if (user.employeeId) return user.employeeId;
  const [emp] = await db
    .insert(employees)
    .values({
      name: user.name,
      phone: user.role === "owner" ? "owner" : String(user.telegramUserId),
      active: true,
    })
    .returning();
  await db.update(users).set({ employeeId: emp.id }).where(eq(users.id, user.id));
  return emp.id;
}

export function assertOwner(user: { role: string }) {
  if (user.role !== "owner") {
    throw forbiddenError("Chỉ chủ đại lý mới có quyền này");
  }
}

export function assertEmployeeDelivery(user: { role: string; employeeId: string | null }) {
  if (user.role === "employee" && !user.employeeId) {
    throw forbiddenError("Nhân viên chưa được gắn employee_id");
  }
}

export function resolveEmployeeId(
  user: { role: string; employeeId: string | null },
  requestedId?: string,
): string {
  if (user.role === "employee") {
    return user.employeeId!;
  }
  if (requestedId) return requestedId;
  throw validationError("employee_id bắt buộc cho owner");
}

/** Chuẩn hoá mã mời: GAS-XXXXXXXX */
export function normalizeInviteCode(raw: string): string {
  const trimmed = raw.trim().toUpperCase();
  if (trimmed.startsWith("GAS-")) {
    if (trimmed.length <= 4) throw validationError("Mã mời không hợp lệ");
    return trimmed;
  }
  if (trimmed === "GAS") {
    throw validationError("Mã mời không đầy đủ — dùng link mời mới từ chủ đại lý");
  }
  if (!/^[A-HJ-NP-Z2-9]{6,12}$/.test(trimmed)) {
    throw validationError("Mã mời không hợp lệ");
  }
  return `GAS-${trimmed}`;
}

/**
 * Xác minh initData do Telegram WebApp gửi kèm.
 * Trả về object user nếu hợp lệ, throw nếu sai chữ ký hoặc hết hạn (5 phút).
 */
export function verifyTelegramWebAppInitData(initData: string): {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
} {
  const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!botToken) throw unauthorizedError("TELEGRAM_BOT_TOKEN chưa cấu hình");

  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) throw unauthorizedError("initData thiếu hash");

  params.delete("hash");
  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");

  const secretKey = createHmac("sha256", "WebAppData").update(botToken).digest();
  const expectedHash = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

  if (expectedHash !== hash) throw unauthorizedError("initData chữ ký không hợp lệ");

  const authDate = Number(params.get("auth_date") || "0");
  const age = Math.floor(Date.now() / 1000) - authDate;
  // Cho phép tối đa 5 phút — đủ cho cold start serverless
  if (age > 300) throw unauthorizedError("initData đã hết hạn (5 phút) — mở lại từ bot");

  const userJson = params.get("user");
  if (!userJson) throw unauthorizedError("initData thiếu thông tin user");

  return JSON.parse(userJson) as { id: number; first_name?: string; last_name?: string; username?: string };
}

/**
 * Đăng nhập qua Telegram WebApp: xác minh initData → tìm user → tạo phiên web.
 * Chỉ user đã kích hoạt (có trong bảng users) mới đăng nhập được.
 */
export async function loginWithTelegramWebApp(db: Db, initData: string) {
  const tgUser = verifyTelegramWebAppInitData(initData);
  const user = await getUserByTelegramId(db, tgUser.id);
  if (!user) {
    throw unauthorizedError(
      "Tài khoản chưa kích hoạt — nhắn /start <mã mời> trong bot trước khi đăng nhập web.",
    );
  }
  assertOwner(user);
  const session = await createSession(db, user.id, "web", WEB_SESSION_TTL_MINUTES);
  return {
    token: session.token,
    user: { id: user.id, name: user.name, role: user.role, employee_id: user.employeeId },
    expires_at: session.expiresAt,
  };
}

/** Tìm mã trong tin nhắn dán (VD copy cả block mời NV) */
export function extractInviteCode(text: string): string | null {
  const full = text.match(/GAS-[A-HJ-NP-Z2-9]{6,12}/i);
  if (full) return full[0].toUpperCase();

  const suffix = text.match(/\b([A-HJ-NP-Z2-9]{8})\b/);
  if (suffix) return `GAS-${suffix[1].toUpperCase()}`;

  return null;
}

/** Payload link t.me — chỉ suffix, không có dấu - (Telegram mobile hay cắt tại -) */
export function inviteToStartPayload(code: string): string {
  return normalizeInviteCode(code).slice(4);
}

export function buildInviteDeepLink(code: string): string {
  return `https://t.me/${getBotUsername()}?start=${inviteToStartPayload(code)}`;
}
