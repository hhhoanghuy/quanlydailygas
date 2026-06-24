import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { FastifyInstance } from "fastify";

const __dirname = dirname(fileURLToPath(import.meta.url));
const webDir = join(__dirname, "../web");

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

export async function registerDashboardWeb(app: FastifyInstance) {
  const isDev = process.env.NODE_ENV !== "production";

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
}
