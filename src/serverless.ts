import type { IncomingMessage, ServerResponse } from "node:http";
import type { FastifyInstance } from "fastify";
import { buildApp } from "./app.js";
import { startBot } from "./bot/telegram.js";

let app: FastifyInstance | undefined;

function collectConfigErrors(): string[] {
  const missing: string[] = [];
  if (!process.env.DATABASE_URL?.trim()) missing.push("DATABASE_URL");
  if (!process.env.TELEGRAM_BOT_TOKEN?.trim()) missing.push("TELEGRAM_BOT_TOKEN");
  if (!process.env.TELEGRAM_BOT_USERNAME?.trim()) missing.push("TELEGRAM_BOT_USERNAME");
  if (!process.env.SESSION_SECRET?.trim()) missing.push("SESSION_SECRET");
  if (process.env.NODE_ENV !== "production") missing.push("NODE_ENV=production");

  const base = process.env.PUBLIC_BASE_URL?.trim();
  if (!base) {
    missing.push("PUBLIC_BASE_URL (https://ten-app.vercel.app)");
  }

  return missing;
}

function sendConfigErrorPage(res: ServerResponse, errors: string[]) {
  const list = errors.map((e) => `<li><code>${e}</code></li>`).join("");
  const html = `<!DOCTYPE html>
<html lang="vi"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>GasOS — Thiếu cấu hình</title>
<style>body{font-family:system-ui,sans-serif;max-width:520px;margin:3rem auto;padding:0 1.25rem;line-height:1.55}
h1{color:#dc2626;font-size:1.25rem}code{background:#fef2f2;padding:.1rem .35rem;border-radius:4px}
ol{margin:.75rem 0 0 1.1rem}p{color:#4b5563}</style></head>
<body>
<h1>⚠ Deploy OK nhưng thiếu biến môi trường</h1>
<p>Vercel → Project → <strong>Settings → Environment Variables</strong> → thêm các biến sau → <strong>Redeploy</strong>:</p>
<ul>${list}</ul>
<p>Sau khi cấu hình, mở lại URL này để thấy trang xác nhận deploy.</p>
</body></html>`;
  res.writeHead(503, { "Content-Type": "text/html; charset=utf-8" });
  res.end(html);
}

async function ensureReady() {
  if (app) return app;
  app = await buildApp();
  await app.ready();
  void startBot(app).catch((err) => {
    app?.log.error({ err }, "startBot failed");
  });
  return app;
}

/** Entry cho Vercel — Fastify nhận req/res Node HTTP */
export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const configErrors = collectConfigErrors();
  if (configErrors.length) {
    sendConfigErrorPage(res, configErrors);
    return;
  }

  try {
    const instance = await ensureReady();
    instance.server.emit("request", req, res);
  } catch (err) {
    console.error("Serverless handler error:", err);
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Lỗi khởi động server — xem Runtime Logs trên Vercel.");
    }
  }
}
