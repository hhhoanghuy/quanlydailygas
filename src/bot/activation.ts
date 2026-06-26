import type { Context } from "grammy";
import type { Db } from "../db/index.js";
import {
  activateInvite,
  extractInviteCode,
  getUserByTelegramId,
} from "../services/auth.service.js";
import { AppError } from "../../utils/errors.js";

export async function handleStartCommand(ctx: Context, db: Db) {
  const payload =
    typeof ctx.match === "string" ? ctx.match.trim() : undefined;
  const from = ctx.from!;
  const existing = await getUserByTelegramId(db, from.id);

  if (existing) {
    const roleLabel = existing.role === "owner" ? "Chủ đại lý" : "Nhân viên";
    const menuHint =
      existing.role === "owner"
        ? "Gõ /menu_admin hoặc /menu"
        : "Gõ /nhan_vien hoặc /menu";
    if (!payload) {
      await ctx.reply(`Xin chào ${existing.name}! (${roleLabel})\n${menuHint}`, {
        reply_markup: (await import("./keyboards.js")).mainMenu(existing.role),
      });
      return;
    }
    await ctx.reply(`Bạn đã kích hoạt (${roleLabel}). ${menuHint}`, {
      reply_markup: (await import("./keyboards.js")).mainMenu(existing.role),
    });
    return;
  }

  if (!payload) {
    await ctx.reply(
      "Chào mừng đến GasOS!\n\nNV: bấm link mã mời từ chủ đại lý.\nHoặc gõ: /start GAS-XXXXXXXX",
    );
    return;
  }

  await activateFromCode(ctx, db, payload);
}

export async function tryActivateFromText(
  ctx: Context,
  db: Db,
  text: string,
): Promise<boolean> {
  const code = extractInviteCode(text);
  if (!code) return false;
  await activateFromCode(ctx, db, code);
  return true;
}

async function activateFromCode(ctx: Context, db: Db, rawCode: string) {
  const from = ctx.from!;
  try {
    const displayName =
      [from.first_name, from.last_name].filter(Boolean).join(" ") || "User";
    const result = await activateInvite(db, {
      inviteCode: rawCode,
      telegramUserId: from.id,
      telegramUsername: from.username,
      name: displayName,
    });
      const { mainMenu } = await import("./keyboards.js");
    const roleLabel = result.user.role === "owner" ? "Chủ đại lý" : "Nhân viên";
    const menuHint =
      result.user.role === "owner"
        ? "Gõ /menu_admin hoặc /help"
        : "Gõ /nhan_vien hoặc /help";
    await ctx.reply(
      `✅ Kích hoạt thành công!\nVai trò: ${roleLabel}\n\n${menuHint}`,
      { reply_markup: mainMenu(result.user.role) },
    );
  } catch (err) {
    const msg =
      err instanceof AppError
        ? err.message
        : err instanceof Error
          ? err.message
          : "Lỗi kích hoạt";
    await ctx.reply(`❌ ${msg}`);
  }
}
