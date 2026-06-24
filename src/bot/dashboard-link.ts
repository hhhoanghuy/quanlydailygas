import type { Context } from "grammy";
import { InlineKeyboard } from "grammy";
import type { Db } from "../db/index.js";
import { assertOwner } from "../services/auth.service.js";
import { getPublicBaseUrl } from "../config/env.js";
import type { users } from "../db/schema.js";

type BotUser = typeof users.$inferSelect;

export async function sendDashboardLink(ctx: Context, _db: Db, user: BotUser) {
  assertOwner(user);

  const base = getPublicBaseUrl();
  const dashUrl = `${base}/dashboard`;
  const isHttps = dashUrl.startsWith("https://");

  if (isHttps) {
    // Production: dùng WebApp button — Telegram ký initData bằng bot token
    // Server xác minh chữ ký → không có token nào trong URL
    const keyboard = new InlineKeyboard().webApp("🌐 Đăng nhập Dashboard", dashUrl);
    await ctx.reply(
      "🌐 <b>Web Dashboard</b>\n\nBấm nút bên dưới — Telegram xác nhận danh tính tự động.\nKhông có link, không có token lộ ra ngoài.",
      { parse_mode: "HTML", reply_markup: keyboard },
    );
    return;
  }

  // Dev localhost: WebApp không chạy được — fallback plain URL
  await ctx.reply(
    `🌐 <b>Web Dashboard (dev)</b>\n\n${dashUrl}\n\n<i>Chạy local — chưa qua xác thực Telegram WebApp.</i>`,
    { parse_mode: "HTML", link_preview_options: { is_disabled: true } },
  );
}
