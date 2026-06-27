import { Bot, webhookCallback } from "grammy";
import type { FastifyInstance } from "fastify";

import { getWebhookUrl } from "../config/env.js";
import { handleStartCommand } from "./activation.js";
import { isAdminRole } from "../../utils/auth-roles.js";
import { registerBotHandlers } from "./handlers.js";
import {
  buildHelpText,
  getActivatedUser,
  NOT_ACTIVATED,
  replyAdminMenu,
  replyEmployeeMenu,
  replyMenuForUser,
  sendHelp,
  sendWebLogin,
  SUPER_ADMIN_PLACEHOLDER,
} from "./menu-commands.js";

export async function registerBot(app: FastifyInstance) {
  const token = process.env.TELEGRAM_BOT_TOKEN!;
  const bot = new Bot(token);

  bot.command("start", async (ctx) => {
    await handleStartCommand(ctx, app.db);
  });

  bot.command("menu", async (ctx) => {
    const user = await getActivatedUser(app.db, ctx.from!.id);
    if (!user) {
      await ctx.reply(NOT_ACTIVATED);
      return;
    }
    await replyMenuForUser(ctx, user);
  });

  bot.command("menu_admin", async (ctx) => {
    const user = await getActivatedUser(app.db, ctx.from!.id);
    if (!user) {
      await ctx.reply(NOT_ACTIVATED);
      return;
    }
    if (!isAdminRole(user.role)) {
      await ctx.reply("❌ Chỉ quản trị viên.\nNhân viên gõ: /nhan_vien");
      return;
    }
    await replyAdminMenu(ctx);
  });

  bot.command("nhan_vien", async (ctx) => {
    const user = await getActivatedUser(app.db, ctx.from!.id);
    if (!user) {
      await ctx.reply(NOT_ACTIVATED);
      return;
    }
    if (!isAdminRole(user.role)) {
      await ctx.reply("❌ Chỉ quản trị viên.\nChủ/co-owner gõ: /menu_admin");
      return;
    }
    await replyEmployeeMenu(ctx);
  });

  bot.command("menu_super_admin", async (ctx) => {
    await ctx.reply(SUPER_ADMIN_PLACEHOLDER);
  });

  bot.command("help", async (ctx) => {
    const user = await getActivatedUser(app.db, ctx.from!.id);
    await sendHelp(ctx, user?.role);
  });

  bot.command("weblogin", async (ctx) => {
    const user = await getActivatedUser(app.db, ctx.from!.id);
    if (!user) {
      await ctx.reply(NOT_ACTIVATED);
      return;
    }
    if (!isAdminRole(user.role)) {
      await ctx.reply("❌ Chỉ quản trị viên mới mở được Dashboard web.");
      return;
    }
    await sendWebLogin(ctx, app.db, user);
  });

  bot.command("dashboard", async (ctx) => {
    const user = await getActivatedUser(app.db, ctx.from!.id);
    if (!user) {
      await ctx.reply(NOT_ACTIVATED);
      return;
    }
    if (!isAdminRole(user.role)) {
      await ctx.reply("❌ Chỉ quản trị viên mới mở được Dashboard web.");
      return;
    }
    await sendWebLogin(ctx, app.db, user);
  });

  bot.command("no", async (ctx) => {
    const query = ctx.match?.trim();
    if (!query) {
      await ctx.reply("Dùng: /no tên hoặc SĐT khách\nVD: /no Phở Hoa\nVD: /no 0901234567");
      return;
    }
    try {
      const { searchCustomerDebt } = await import("../services/customer.service.js");
      const results = await searchCustomerDebt(app.db, query, 5);
      if (!results.length) {
        await ctx.reply("Không tìm thấy khách");
        return;
      }
      if (results.length === 1) {
        const c = results[0];
        await ctx.reply(
          `💰 ${c.name}\nSĐT: ${c.phone}\n📍 ${c.address}\nĐang nợ: ${c.debtBalance.toLocaleString("vi-VN")}đ`,
        );
        return;
      }
      const lines = results
        .map(
          (c) =>
            `· ${c.name} — ${c.phone}\n  📍 ${c.address}\n  Nợ: ${c.debtBalance.toLocaleString("vi-VN")}đ`,
        )
        .join("\n\n");
      await ctx.reply(`Tìm thấy ${results.length} khách:\n\n${lines}`);
    } catch {
      await ctx.reply("Không tìm thấy khách");
    }
  });

  registerBotHandlers(bot, app.db);

  if (process.env.NODE_ENV === "production") {
    const secret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
    const handle = webhookCallback(bot, "fastify", {
      secretToken: secret || undefined,
    });
    app.post("/telegram/webhook", handle);
  }

  app.decorate("bot", bot);
  return bot;
}

/** Gọi sau app.listen() — polling (dev) hoặc setWebhook (production) */
export async function startBot(app: FastifyInstance) {
  const bot = app.bot;
  if (!bot) return;

  if (process.env.NODE_ENV === "production") {
    const url = getWebhookUrl();
    if (!url) {
      app.log.warn("WEBHOOK_URL / PUBLIC_BASE_URL chưa cấu hình — bot webhook không đăng ký");
      return;
    }
    const secret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
    try {
      await bot.api.setWebhook(url, {
        secret_token: secret || undefined,
        drop_pending_updates: true,
      });
      app.log.info({ url }, "Telegram webhook registered");
    } catch (err) {
      app.log.error({ err, url }, "Telegram setWebhook thất bại — kiểm tra PUBLIC_BASE_URL và token");
    }
    return;
  }

  void bot.start({ drop_pending_updates: true });
  app.log.info("Telegram bot polling started");
}

export async function stopBot(app: FastifyInstance) {
  const bot = app.bot;
  if (!bot) return;

  if (process.env.NODE_ENV === "production") {
    await bot.api.deleteWebhook({ drop_pending_updates: false });
    app.log.info("Telegram webhook removed");
    return;
  }

  await bot.stop();
  app.log.info("Telegram bot polling stopped");
}

declare module "fastify" {
  interface FastifyInstance {
    bot?: Bot;
  }
}

export { buildHelpText };
