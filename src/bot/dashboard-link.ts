import type { Context } from "grammy";
import type { Db } from "../db/index.js";
import { createMagicLink, assertOwner } from "../services/auth.service.js";
import type { users } from "../db/schema.js";

type BotUser = typeof users.$inferSelect;

export async function sendDashboardLink(ctx: Context, db: Db, user: BotUser) {
  assertOwner(user);
  const link = await createMagicLink(db, user.id);

  // URL + token ẩn dưới chữ — hover/nhấn giữ mới thấy link đầy đủ
  await ctx.reply(
    `🌐 <b>Web Dashboard</b>\n\n<a href="${link.url}">Đăng nhập Dashboard</a>\n\n<i>Link dùng 1 lần · hết hạn ${link.expiresInMinutes} phút · phiên giữ 8 giờ</i>`,
    {
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
    },
  );
}
