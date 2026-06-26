import type { Context } from "grammy";
import type { Db } from "../db/index.js";
import { getUserByTelegramId } from "../services/auth.service.js";
import { sendDashboardLink } from "./dashboard-link.js";
import { adminMenu, employeeMenu, mainMenu } from "./keyboards.js";
import type { users } from "../db/schema.js";

type BotUser = typeof users.$inferSelect;

export async function getActivatedUser(db: Db, telegramUserId: number) {
  return getUserByTelegramId(db, telegramUserId);
}

export async function replyMenuForUser(ctx: Context, user: BotUser) {
  const isOwner = user.role === "owner";
  const title = isOwner ? "📋 Menu Quản Trị" : "📋 Menu Nhân Viên";
  await ctx.reply(title, { reply_markup: mainMenu(user.role) });
}

export async function replyAdminMenu(ctx: Context) {
  await ctx.reply("📋 Menu Quản Trị", { reply_markup: adminMenu() });
}

export async function replyEmployeeMenu(ctx: Context) {
  await ctx.reply("📋 Menu Nhân Viên", { reply_markup: employeeMenu() });
}

export function buildHelpText(role?: string) {
  const lines = [
    "📖 Trợ giúp GasOS",
    "",
    "/start — Bắt đầu hoặc kích hoạt mã mời",
    "/menu — Menu theo vai trò của bạn",
    "/help — Xem trợ giúp này",
    "/no <tên|SĐT> — Tra nợ nhanh",
  ];

  if (role === "owner") {
    lines.push(
      "",
      "Chủ đại lý:",
      "/menu_admin — Menu quản trị",
      "/weblogin — Đăng nhập dashboard web",
    );
  } else if (role === "employee") {
    lines.push("", "Nhân viên:", "/nhan_vien — Menu nhân viên");
  } else {
    lines.push(
      "",
      "/menu_admin — Menu quản trị (chủ)",
      "/nhan_vien — Menu nhân viên",
      "/weblogin — Dashboard web (chủ)",
    );
  }

  return lines.join("\n");
}

export async function sendHelp(ctx: Context, role?: string) {
  await ctx.reply(buildHelpText(role));
}

export async function sendWebLogin(ctx: Context, db: Db, user: BotUser) {
  await sendDashboardLink(ctx, db, user);
}

export const NOT_ACTIVATED =
  "❌ Chưa kích hoạt tài khoản.\n\nBấm link mã mời hoặc gõ:\n/start GAS-XXXXXXXX";

export const SUPER_ADMIN_PLACEHOLDER =
  "🔧 Menu Quản Trị Hệ Thống chưa phát triển.\n\nTính năng multi-tenant sẽ có ở phase sau.";
