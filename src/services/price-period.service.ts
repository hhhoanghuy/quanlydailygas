import { eq, and, desc, lte, or, isNull, gte } from "drizzle-orm";
import type { Db } from "../db/index.js";
import {
  pricePeriods,
  cylinderPrices,
  cylinderTypes,
} from "../db/schema.js";
import { validationError } from "../../utils/errors.js";

export async function createPricePeriod(
  db: Db,
  input: {
    name: string;
    effectiveFrom: Date;
    prices: { cylinderTypeId: string; pricePerCylinder: number }[];
  },
) {
  if (!input.prices.length) {
    throw validationError("Phải có ít nhất một mức giá");
  }

  const [period] = await db
    .insert(pricePeriods)
    .values({
      name: input.name,
      effectiveFrom: input.effectiveFrom,
    })
    .returning();

  for (const p of input.prices) {
    await db.insert(cylinderPrices).values({
      pricePeriodId: period.id,
      cylinderTypeId: p.cylinderTypeId,
      pricePerCylinder: p.pricePerCylinder,
    });
  }

  return period;
}

export async function getCurrentPrices(db: Db) {
  const now = new Date();
  const [period] = await db
    .select()
    .from(pricePeriods)
    .where(
      and(
        lte(pricePeriods.effectiveFrom, now),
        or(isNull(pricePeriods.effectiveTo), gte(pricePeriods.effectiveTo, now)),
      ),
    )
    .orderBy(desc(pricePeriods.effectiveFrom))
    .limit(1);

  if (!period) return null;

  const prices = await db
    .select({
      cylinderTypeId: cylinderPrices.cylinderTypeId,
      name: cylinderTypes.name,
      capacityKg: cylinderTypes.capacityKg,
      pricePerCylinder: cylinderPrices.pricePerCylinder,
    })
    .from(cylinderPrices)
    .innerJoin(cylinderTypes, eq(cylinderTypes.id, cylinderPrices.cylinderTypeId))
    .where(eq(cylinderPrices.pricePeriodId, period.id));

  return { period, prices };
}

export async function updateCurrentPrices(
  db: Db,
  prices: { cylinderTypeId: string; pricePerCylinder: number }[],
) {
  if (!prices.length) {
    throw validationError("Phải có ít nhất một mức giá");
  }

  const now = new Date();
  const current = await getCurrentPrices(db);

  if (current) {
    await db
      .update(pricePeriods)
      .set({ effectiveTo: now })
      .where(eq(pricePeriods.id, current.period.id));
  }

  const dateLabel = now.toLocaleDateString("vi-VN");
  return createPricePeriod(db, {
    name: `Bảng giá ${dateLabel}`,
    effectiveFrom: now,
    prices,
  });
}

export function formatPriceTable(
  prices: { name: string; pricePerCylinder: number }[],
) {
  return prices
    .map((p) => `· ${p.name}: ${p.pricePerCylinder.toLocaleString("vi-VN")}đ / bình`)
    .join("\n");
}

export async function setCylinderPrice(
  db: Db,
  cylinderTypeId: string,
  pricePerCylinder: number,
) {
  if (pricePerCylinder <= 0) {
    throw validationError("Giá phải > 0");
  }

  const current = await getCurrentPrices(db);
  if (!current) {
    throw validationError("Chưa có bảng giá");
  }

  const existing = current.prices.find((p) => p.cylinderTypeId === cylinderTypeId);
  if (existing) {
    await db
      .update(cylinderPrices)
      .set({ pricePerCylinder })
      .where(
        and(
          eq(cylinderPrices.pricePeriodId, current.period.id),
          eq(cylinderPrices.cylinderTypeId, cylinderTypeId),
        ),
      );
    return;
  }

  await db.insert(cylinderPrices).values({
    pricePeriodId: current.period.id,
    cylinderTypeId,
    pricePerCylinder,
  });
}

export async function listCylinderTypes(db: Db) {
  return db
    .select()
    .from(cylinderTypes)
    .where(eq(cylinderTypes.isActive, true))
    .orderBy(cylinderTypes.name);
}
