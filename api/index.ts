import type { IncomingMessage, ServerResponse } from "node:http";

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;");
}

function sendBootstrapError(res: ServerResponse, err: unknown) {
  const message = err instanceof Error ? err.stack || err.message : String(err);
  const html = `<!DOCTYPE html>
<html lang="vi"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>GasOS — Lỗi khởi động</title>
<style>body{font-family:system-ui,sans-serif;max-width:560px;margin:3rem auto;padding:0 1.25rem;line-height:1.55}
h1{color:#dc2626;font-size:1.2rem}pre{background:#fef2f2;padding:.75rem;border-radius:8px;overflow:auto;font-size:.75rem;white-space:pre-wrap}
p{color:#4b5563}</style></head>
<body>
<h1>⚠ Serverless không load được app</h1>
<p>Chi tiết lỗi (gửi ảnh này nếu cần hỗ trợ):</p>
<pre>${escapeHtml(message)}</pre>
</body></html>`;
  res.writeHead(500, { "Content-Type": "text/html; charset=utf-8" });
  res.end(html);
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    const mod = await import("./handler.mjs");
    if (typeof mod.default !== "function") {
      throw new Error("api/handler.mjs không export default function");
    }
    await mod.default(req, res);
  } catch (err) {
    console.error("api/index bootstrap error:", err);
    if (!res.headersSent) sendBootstrapError(res, err);
  }
}

export const config = {
  maxDuration: 10,
};
