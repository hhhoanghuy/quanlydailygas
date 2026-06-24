import type { IncomingMessage, ServerResponse } from "node:http";
import type { FastifyInstance } from "fastify";
import { buildApp } from "./app.js";
import { startBot } from "./bot/telegram.js";

let app: FastifyInstance | undefined;

async function ensureReady() {
  if (app) return app;
  app = await buildApp();
  await app.ready();
  await startBot(app);
  return app;
}

/** Entry cho Vercel — Fastify nhận req/res Node HTTP */
export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const instance = await ensureReady();
  instance.server.emit("request", req, res);
}
