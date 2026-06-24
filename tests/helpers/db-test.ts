import { eq, inArray } from "drizzle-orm";
import { db, type Db } from "../../src/db/index.js";
import {
  customers,
  cylinderTypes,
  debtLedger,
  cylinderLedger,
  deliveries,
  deliveryLines,
  deliveryOrders,
  deliveryOrderLines,
  payments,
  employees,
  users,
} from "../../src/db/schema.js";
import { createCustomer } from "../../src/services/customer.service.js";

export const hasDb = Boolean(process.env.DATABASE_URL);

export function uniquePhone(): string {
  const rand = Math.floor(Math.random() * 90_000_000) + 10_000_000;
  return `0${rand}`;
}

export async function createTestCustomer(
  dbConn: Db = db,
  overrides?: Partial<{ name: string; phone: string; address: string }>,
) {
  return createCustomer(dbConn, {
    name: overrides?.name ?? `TEST Khách ${Date.now()}`,
    phone: overrides?.phone ?? uniquePhone(),
    address: overrides?.address ?? "123 Đường Test, Q1",
    customerType: "household",
  });
}

export async function getTestCylinderType(dbConn: Db = db, preferName = "12kg") {
  const rows = await dbConn.select().from(cylinderTypes);
  if (!rows.length) {
    throw new Error("Chưa seed cylinder_types — chạy npm run db:seed");
  }
  return rows.find((r) => r.name === preferName) ?? rows[0];
}

export async function createTestEmployee(dbConn: Db = db) {
  const [emp] = await dbConn
    .insert(employees)
    .values({ name: `TEST NV ${Date.now()}`, phone: uniquePhone(), active: true })
    .returning();
  return emp;
}

export async function createTestOwnerUser(dbConn: Db = db) {
  const [user] = await dbConn
    .insert(users)
    .values({
      telegramUserId: Date.now() + Math.floor(Math.random() * 10_000),
      name: "TEST Owner",
      role: "owner",
    })
    .returning();
  return user;
}

/** Dọn dữ liệu test theo customerId (best-effort). */
export async function cleanupCustomer(dbConn: Db, customerId: string) {
  const customerOrders = await dbConn
    .select({ id: deliveryOrders.id })
    .from(deliveryOrders)
    .where(eq(deliveryOrders.customerId, customerId));
  const orderIds = customerOrders.map((o) => o.id);

  if (orderIds.length) {
    await dbConn.delete(deliveryOrderLines).where(inArray(deliveryOrderLines.orderId, orderIds));
    await dbConn.delete(deliveryOrders).where(inArray(deliveryOrders.id, orderIds));
  }

  const customerDeliveries = await dbConn
    .select({ id: deliveries.id })
    .from(deliveries)
    .where(eq(deliveries.customerId, customerId));
  const deliveryIds = customerDeliveries.map((d) => d.id);

  if (deliveryIds.length) {
    await dbConn.delete(deliveryLines).where(inArray(deliveryLines.deliveryId, deliveryIds));
    await dbConn.delete(debtLedger).where(inArray(debtLedger.referenceId, deliveryIds));
    await dbConn.delete(cylinderLedger).where(inArray(cylinderLedger.referenceId, deliveryIds));
    await dbConn.delete(deliveries).where(inArray(deliveries.id, deliveryIds));
  }

  await dbConn.delete(payments).where(eq(payments.customerId, customerId));
  await dbConn.delete(debtLedger).where(eq(debtLedger.customerId, customerId));
  await dbConn.delete(cylinderLedger).where(eq(cylinderLedger.customerId, customerId));
  await dbConn.delete(customers).where(eq(customers.id, customerId));
}

export async function cleanupEmployee(dbConn: Db, employeeId: string) {
  await dbConn.delete(employees).where(eq(employees.id, employeeId));
}

export async function cleanupUser(dbConn: Db, userId: string) {
  await dbConn.delete(users).where(eq(users.id, userId));
}
