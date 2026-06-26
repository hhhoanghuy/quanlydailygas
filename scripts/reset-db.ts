/**
 * Xoá toàn bộ dữ liệu nghiệp vụ + tài khoản, giữ schema.
 * Sau đó seed lại loại bình, giá mặc định và mã mời owner đầu tiên.
 *
 * Chạy: npm run db:reset
 */
import "dotenv/config";
import { sql } from "drizzle-orm";
import { db } from "../src/db/index.js";
import { buildInviteDeepLink, createInviteCode } from "../src/services/auth.service.js";
import {
  cylinderTypes,
  pricePeriods,
  cylinderPrices,
} from "../src/db/schema.js";

async function truncateAll() {
  await db.execute(sql`
    TRUNCATE TABLE
      sessions,
      delivery_order_lines,
      delivery_orders,
      delivery_lines,
      debt_ledger,
      cylinder_ledger,
      payments,
      deliveries,
      invite_codes,
      users,
      employees,
      customers,
      cylinder_prices,
      price_periods,
      cylinder_types
    RESTART IDENTITY CASCADE
  `);
}

async function seedBasics() {
  const types = [
    { name: "12kg", capacityKg: "12" },
    { name: "20kg", capacityKg: "20" },
    { name: "45kg", capacityKg: "45" },
    { name: "48kg", capacityKg: "48" },
  ];

  const insertedTypes = [];
  for (const t of types) {
    const [row] = await db
      .insert(cylinderTypes)
      .values({ name: t.name, capacityKg: t.capacityKg })
      .returning();
    insertedTypes.push(row);
  }

  const [period] = await db
    .insert(pricePeriods)
    .values({
      name: "Đợt giá mặc định",
      effectiveFrom: new Date("2026-01-01"),
    })
    .returning();

  const defaultPrices: Record<string, number> = {
    "12kg": 350_000,
    "20kg": 480_000,
    "45kg": 680_000,
    "48kg": 720_000,
  };

  for (const t of insertedTypes) {
    const price = defaultPrices[t.name];
    if (price) {
      await db.insert(cylinderPrices).values({
        pricePeriodId: period.id,
        cylinderTypeId: t.id,
        pricePerCylinder: price,
      });
    }
  }

  return createInviteCode(db, "owner", 8760);
}

async function maybeNotifyOwner(code: string, link: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = process.env.OWNER_TELEGRAM_ID?.trim();
  if (!token || !chatId) return false;

  const text = [
    "🔄 Database đã reset — kích hoạt lại GasOS",
    "",
    `Mã mời chủ đại lý: ${code}`,
    "",
    "Bấm link hoặc gõ lệnh trong bot:",
    link,
    "",
    `Hoặc: /start ${code}`,
  ].join("\n");

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: Number(chatId), text }),
  });
  if (!res.ok) {
    const body = await res.text();
    console.warn("Không gửi được Telegram:", body);
    return false;
  }
  return true;
}

async function main() {
  if (!process.env.DATABASE_URL?.trim()) {
    console.error("Thiếu DATABASE_URL trong .env");
    process.exit(1);
  }

  console.log("Đang xoá toàn bộ dữ liệu...");
  await truncateAll();
  console.log("Đang seed lại bình, giá và mã mời owner...");
  const ownerInvite = await seedBasics();
  const link = buildInviteDeepLink(ownerInvite.code);

  console.log("\n=== RESET XONG ===");
  console.log("Mã mời chủ đại lý:", ownerInvite.code);
  console.log("Link kích hoạt:", link);
  console.log("Lệnh bot:", `/start ${ownerInvite.code}`);

  const sent = await maybeNotifyOwner(ownerInvite.code, link);
  if (sent) {
    console.log("\nĐã gửi mã mời qua Telegram (OWNER_TELEGRAM_ID).");
  } else {
    console.log("\nCopy link hoặc /start ở trên → nhắn bot @" + (process.env.TELEGRAM_BOT_USERNAME || "bot"));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
