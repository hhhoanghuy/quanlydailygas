import "dotenv/config";
import { db } from "./index.js";
import {
  cylinderTypes,
  pricePeriods,
  cylinderPrices,
  inviteCodes,
} from "./schema.js";
import { createInviteCode } from "../services/auth.service.js";

async function seed() {
  const types = [
    { name: "12kg", capacityKg: "12" },
    { name: "20kg", capacityKg: "20" },
    { name: "45kg", capacityKg: "45" },
    { name: "48kg", capacityKg: "48" },
  ];

  const existing = await db.select().from(cylinderTypes);
  if (existing.length > 0) {
    console.log("Already seeded, skip");
    return;
  }

  const insertedTypes = [];
  for (const t of types) {
    const [row] = await db.insert(cylinderTypes).values({ name: t.name, capacityKg: t.capacityKg }).returning();
    insertedTypes.push(row);
  }

  const allTypes = insertedTypes;

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

  for (const t of allTypes) {
    const price = defaultPrices[t.name];
    if (price) {
      await db.insert(cylinderPrices).values({
        pricePeriodId: period.id,
        cylinderTypeId: t.id,
        pricePerCylinder: price,
      });
    }
  }

  const ownerInvite = await createInviteCode(db, "owner", 8760);
  console.log("Seed OK");
  console.log("Owner invite code:", ownerInvite.code);
  console.log("Cylinder types:", allTypes.length);
}

seed().catch((e) => {
  console.error(e);
  process.exit(1);
});
