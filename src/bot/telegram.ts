import { Bot, webhookCallback } from "grammy";
import type { FastifyInstance } from "fastify";

import { getUserByTelegramId } from "../services/auth.service.js";
import { getWebhookUrl } from "../config/env.js";
import { handleStartCommand } from "./activation.js";
import { sendDashboardLink } from "./dashboard-link.js";
import { registerBotHandlers } from "./handlers.js";
import { mainMenu } from "./keyboards.js";

export async function registerBot(app: FastifyInstance) {
  const token = process.env.TELEGRAM_BOT_TOKEN!;
  const bot = new Bot(token);

  bot.command("start", async (ctx) => {
    await handleStartCommand(ctx, app.db);
  });

  bot.command("menu", async (ctx) => {
    const user = await getUserByTelegramId(app.db, ctx.from!.id);
    if (!user) {
      await ctx.reply("Chưa kích hoạt — bấm link mã mời hoặc /start <mã>");
      return;
    }
    await ctx.reply("📋 Menu", { reply_markup: mainMenu(user.role) });
  });

  bot.command("dashboard", async (ctx) => {
    const user = await getUserByTelegramId(app.db, ctx.from!.id);
    if (!user) {
      await ctx.reply("Chưa kích hoạt — bấm link mã mời hoặc /start <mã>");
      return;
    }
    if (user.role !== "owner") {
      await ctx.reply("❌ Chỉ chủ đại lý mới mở được Dashboard web.");
      return;
    }
    await sendDashboardLink(ctx, app.db, user);
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
    await bot.api.setWebhook(url, {
      secret_token: secret || undefined,
      drop_pending_updates: true,
    });
    app.log.info({ url }, "Telegram webhook registered");
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
