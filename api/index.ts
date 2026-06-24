import type { IncomingMessage, ServerResponse } from "node:http";

type Handler = (req: IncomingMessage, res: ServerResponse) => Promise<void>;

let handlerPromise: Promise<Handler> | undefined;

async function loadHandler(): Promise<Handler> {
  if (!handlerPromise) {
    handlerPromise = import("../dist/src/serverless.js").then((mod) => {
      if (typeof mod.default !== "function") {
        throw new Error("dist/src/serverless.js không export default handler");
      }
      return mod.default as Handler;
    });
  }
  return handlerPromise;
}

function sendBootstrapError(res: ServerResponse, err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  const html = `<!DOCTYPE html>
<html lang="vi"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>GasOS — Lỗi khởi động</title>
<style>body{font-family:system-ui,sans-serif;max-width:560px;margin:3rem auto;padding:0 1.25rem;line-height:1.55}
h1{color:#dc2626;font-size:1.2rem}pre{background:#fef2f2;padding:.75rem;border-radius:8px;overflow:auto;font-size:.85rem}
p{color:#4b5563}</style></head>
<body>
<h1>⚠ Serverless không load được app</h1>
<p>Build có thể OK nhưng runtime thiếu file hoặc cấu hình. Chi tiết:</p>
<pre>${message.replace(/</g, "&lt;")}</pre>
<p>Kiểm tra: Vercel → Settings → Environment Variables (đủ biến) → Redeploy.</p>
</body></html>`;
  res.writeHead(500, { "Content-Type": "text/html; charset=utf-8" });
  res.end(html);
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    const appHandler = await loadHandler();
    await appHandler(req, res);
  } catch (err) {
    console.error("api/index bootstrap error:", err);
    if (!res.headersSent) sendBootstrapError(res, err);
  }
}

export const config = {
  maxDuration: 10,
};
