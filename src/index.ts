import "dotenv/config";
import { buildApp } from "./app.js";
import { startBot, stopBot } from "./bot/telegram.js";

const port = Number(process.env.PORT ?? 3000);

const app = await buildApp();

try {
  await app.listen({ port, host: "0.0.0.0" });
} catch (err: unknown) {
  const code = err && typeof err === "object" && "code" in err ? err.code : null;
  if (code === "EADDRINUSE") {
    console.error(
      `\n❌ Port ${port} đang bị chiếm. Chỉ chạy MỘT terminal npm run dev.\n` +
        `   PowerShell: netstat -ano | findstr :${port}  →  taskkill /PID <pid> /F\n`,
    );
    process.exit(1);
  }
  throw err;
}

console.log(`GasOS API listening on :${port}`);
await startBot(app);

const shutdown = async (signal: string) => {
  console.log(`${signal} — shutting down...`);
  await stopBot(app);
  await app.close();
  process.exit(0);
};

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));