import { describe, it, expect, afterEach } from "vitest";
import { db } from "../../src/db/index.js";
import { createDelivery } from "../../src/services/delivery.service.js";
import {
  getCylinderBalance,
  getCylinderBalancesByType,
} from "../../src/services/ledger.service.js";
import {
  hasDb,
  createTestCustomer,
  createTestEmployee,
  getTestCylinderType,
  cleanupCustomer,
  cleanupEmployee,
} from "../helpers/db-test.js";

describe.skipIf(!hasDb)("cylinder ledger (integration)", () => {
  let customerId: string;
  let employeeId: string;

  afterEach(async () => {
    if (customerId) await cleanupCustomer(db, customerId);
    if (employeeId) await cleanupEmployee(db, employeeId);
  });

  it("out minus in equals holding balance", async () => {
    const customer = await createTestCustomer(db);
    const employee = await createTestEmployee(db);
    const cyl = await getTestCylinderType(db);
    customerId = customer.id;
    employeeId = employee.id;

    await createDelivery(db, {
      customerId,
      employeeId,
      cashReceived: 350_000,
      deliveredAt: new Date(),
      lines: [{ cylinderTypeId: cyl.id, cylindersOut: 4, cylindersIn: 2 }],
      enableCylinderLedger: true,
    });

    const balance = await getCylinderBalance(db, customerId, cyl.id);
    expect(balance).toBe(2);

    const byType = await getCylinderBalancesByType(db, customerId);
    const row = byType.find((b) => b.cylinderTypeId === cyl.id);
    expect(row?.balance).toBe(2);
  });

  it("no ledger when enableCylinderLedger false", async () => {
    const customer = await createTestCustomer(db);
    const employee = await createTestEmployee(db);
    const cyl = await getTestCylinderType(db);
    customerId = customer.id;
    employeeId = employee.id;

    await createDelivery(db, {
      customerId,
      employeeId,
      cashReceived: 350_000,
      deliveredAt: new Date(),
      lines: [{ cylinderTypeId: cyl.id, cylindersOut: 3, cylindersIn: 1 }],
      enableCylinderLedger: false,
    });

    expect(await getCylinderBalance(db, customerId, cyl.id)).toBe(0);
  });
});
