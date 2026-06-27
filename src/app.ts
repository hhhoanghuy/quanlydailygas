import Fastify from "fastify";
import cors from "@fastify/cors";
import { db } from "./db/index.js";
import { ensureDbSchema } from "./db/ensure-schema.js";
import { AppError } from "../utils/errors.js";
import { registerApiRoutes } from "./routes/api.js";
import { registerDashboardWeb } from "./routes/dashboard-web.js";
import { registerBot } from "./bot/telegram.js";

export async function buildApp() {
  await ensureDbSchema();

  const app = Fastify({ logger: true });

  await app.register(cors, { origin: true });

  app.decorate("db", db);

  app.setErrorHandler((error, _req, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
        },
      });
    }
    app.log.error(error);
    return reply.status(500).send({
      error: { code: "INTERNAL_ERROR", message: "Lỗi server" },
    });
  });

  app.get("/health", async () => ({ status: "ok" }));

  await registerDashboardWeb(app);
  await registerApiRoutes(app);

  if (process.env.TELEGRAM_BOT_TOKEN) {
    if (!process.env.TELEGRAM_BOT_USERNAME?.trim()) {
      throw new Error(
        "TELEGRAM_BOT_USERNAME bắt buộc khi bật bot (VD: quanlydailygas_bot)",
      );
    }
    await registerBot(app);
  }

  return app;
}

declare module "fastify" {
  interface FastifyInstance {
    db: typeof db;
  }
}
