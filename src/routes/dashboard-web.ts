import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { FastifyInstance } from "fastify";

const __dirname = dirname(fileURLToPath(import.meta.url));

function resolveWebDir(): string {
  const candidates = [join(__dirname, "../web"), join(process.cwd(), "src/web")];
  for (const dir of candidates) {
    if (existsSync(dir)) return dir;
  }
  throw new Error("Không tìm thấy thư mục src/web");
}

const webDir = resolveWebDir();

const cache = new Map<string, string>();

async function loadWebFile(name: string) {
  if (!cache.has(name)) {
    cache.set(name, await readFile(join(webDir, name), "utf8"));
  }
  return cache.get(name)!;
}

function agencyName() {
  return process.env.AGENCY_NAME?.trim() || "GasOS";
}

function botUsername() {
  return process.env.TELEGRAM_BOT_USERNAME?.trim().replace(/^@/, "") || "your_bot";
}

function renderLanding(html: string) {
  const agency = agencyName();
  const bot = botUsername();
  const initial = agency.charAt(0).toUpperCase() || "G";
  return html
    .replaceAll("{{AGENCY_NAME}}", agency)
    .replaceAll("{{BOT_USERNAME}}", bot)
    .replaceAll("{{BOT_LINK}}", `https://t.me/${bot}`)
    .replaceAll("{{INITIAL}}", initial);
}

export async function registerDashboardWeb(app: FastifyInstance) {
  const isDev = process.env.NODE_ENV !== "production";

  app.get("/", async (_req, reply) => {
    if (isDev) cache.delete("landing.html");
    const html = await loadWebFile("landing.html");
    return reply.type("text/html; charset=utf-8").send(renderLanding(html));
  });

  app.get("/dashboard/app.css", async (_req, reply) => {
    if (isDev) cache.delete("app.css");
    return reply.type("text/css").send(await loadWebFile("app.css"));
  });

  app.get("/dashboard/app.js", async (_req, reply) => {
    if (isDev) cache.delete("app.js");
    return reply.type("application/javascript").send(await loadWebFile("app.js"));
  });

  app.get("/dashboard", async (_req, reply) => {
    if (isDev) cache.delete("dashboard.html");
    const html = await loadWebFile("dashboard.html");
    const agency = agencyName();
    return reply
      .type("text/html; charset=utf-8")
      .send(html.replaceAll("{{AGENCY_NAME}}", agency));
  });

  app.get("/open", async (_req, reply) => {
    if (isDev) cache.delete("open.html");
    const html = await loadWebFile("open.html");
    const agency = agencyName();
    const initial = agency.charAt(0).toUpperCase() || "G";
    return reply
      .type("text/html; charset=utf-8")
      .send(html.replaceAll("{{AGENCY_NAME}}", agency).replaceAll("{{INITIAL}}", initial));
  });
}
