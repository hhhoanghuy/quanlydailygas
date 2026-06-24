import type { Context } from "grammy";
import { InlineKeyboard } from "grammy";
import type { Db } from "../db/index.js";
import { createMagicLink, assertOwner } from "../services/auth.service.js";
import type { users } from "../db/schema.js";

type BotUser = typeof users.$inferSelect;

/** Telegram inline URL button chỉ ổn định với HTTPS công khai */
function canUseInlineUrlButton(url: string): boolean {
  try {
    return new URL(url).protocol === "https:";
  } catch {
    return false;
  }
}

export async function sendDashboardLink(ctx: Context, db: Db, user: BotUser) {
  assertOwner(user);
  const link = await createMagicLink(db, user.id);

  const text = [
    "🌐 Web Dashboard",
    `Link đăng nhập (dùng 1 lần, hết hạn sau ${link.expiresInMinutes} phút):`,
    link.url,
    "",
    "Chạm link xanh ở trên để mở.",
    "Sau khi vào, dashboard dùng được 8 giờ.",
    "Link hết hạn chỉ áp dụng nếu chưa kịp đăng nhập — không ảnh hưởng phiên đang mở.",
  ].join("\n");

  const replyOpts = { link_preview_options: { is_disabled: true } as const };

  if (canUseInlineUrlButton(link.url)) {
    const keyboard = new InlineKeyboard().url("🌐 Mở Dashboard", link.url);
    await ctx.reply(text, { ...replyOpts, reply_markup: keyboard });
    return;
  }

  await ctx.reply(text, replyOpts);
}
