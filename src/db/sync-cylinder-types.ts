import "dotenv/config";
import { db } from "./index.js";
import { cylinderPrices, cylinderTypes } from "./schema.js";
import { getCurrentPrices } from "../services/price-period.service.js";

const CATALOG = [
  { name: "12kg", capacityKg: "12", defaultPrice: 350_000 },
  { name: "20kg", capacityKg: "20", defaultPrice: 480_000 },
  { name: "45kg", capacityKg: "45", defaultPrice: 680_000 },
  { name: "48kg", capacityKg: "48", defaultPrice: 720_000 },
] as const;

async function sync() {
  const existing = await db.select().from(cylinderTypes);
  const byName = new Map(existing.map((t) => [t.name, t]));

  for (const item of CATALOG) {
    if (byName.has(item.name)) continue;
    const [row] = await db
      .insert(cylinderTypes)
      .values({ name: item.name, capacityKg: item.capacityKg })
      .returning();
    byName.set(item.name, row);
    console.log(`+ Thêm loại bình: ${item.name}`);
  }

  const current = await getCurrentPrices(db);
  if (!current) {
    console.log("Chưa có bảng giá — chạy npm run db:seed hoặc cài giá trong bot");
    return;
  }

  const priced = new Set(current.prices.map((p) => p.name));
  for (const item of CATALOG) {
    if (priced.has(item.name)) continue;
    const type = byName.get(item.name);
    if (!type) continue;
    await db.insert(cylinderPrices).values({
      pricePeriodId: current.period.id,
      cylinderTypeId: type.id,
      pricePerCylinder: item.defaultPrice,
    });
    console.log(`+ Thêm giá ${item.name}: ${item.defaultPrice.toLocaleString("vi-VN")}đ`);
  }

  console.log("Đồng bộ loại bình xong");
}

sync().catch((e) => {
  console.error(e);
  process.exit(1);
});
