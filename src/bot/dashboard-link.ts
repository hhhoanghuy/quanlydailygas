import type { Context } from "grammy";
import { InlineKeyboard } from "grammy";
import type { Db } from "../db/index.js";
import { createMagicLink, assertOwner } from "../services/auth.service.js";
import type { users } from "../db/schema.js";

type BotUser = typeof users.$inferSelect;

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

  if (canUseInlineUrlButton(link.url)) {
    // HTTPS: hiển thị chữ + nút inline — URL ẩn trong nút
    const keyboard = new InlineKeyboard().url("🌐 Đăng nhập Dashboard", link.url);
    await ctx.reply(
      `🌐 <b>Web Dashboard</b>\n\nBấm nút bên dưới để đăng nhập.\nLink dùng <b>1 lần</b>, hết hạn sau <b>${link.expiresInMinutes} phút</b>.\nSau khi vào, phiên dùng được <b>8 giờ</b>.`,
      {
        parse_mode: "HTML",
        link_preview_options: { is_disabled: true },
        reply_markup: keyboard,
      },
    );
    return;
  }

  // localhost / dev: dùng HTML hyperlink — chữ hiển thị, URL ẩn dưới
  await ctx.reply(
    `🌐 <b>Web Dashboard</b>\n\n<a href="${link.url}">Đăng nhập Dashboard</a>\n\n(Di chuột vào chữ xanh để thấy link)\nLink dùng <b>1 lần</b>, hết hạn sau <b>${link.expiresInMinutes} phút</b>.`,
    {
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
    },
  );
}
