import type { Context } from "grammy";
import type { Db } from "../db/index.js";
import { createMagicLink, assertOwner } from "../services/auth.service.js";
import type { users } from "../db/schema.js";

type BotUser = typeof users.$inferSelect;

export async function sendDashboardLink(ctx: Context, db: Db, user: BotUser) {
  assertOwner(user);
  const link = await createMagicLink(db, user.id);

  // Link /open?code= → trang chuyển sang trình duyệt ngoài (không ở trong Telegram)
  await ctx.reply(
    `🌐 <b>Web Dashboard</b>\n\n<a href="${link.url}">Đăng nhập Dashboard</a>\n\n<i>Mở trình duyệt · link 1 lần · ${link.expiresInMinutes} phút · phiên 8 giờ</i>`,
    {
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
    },
  );
}
