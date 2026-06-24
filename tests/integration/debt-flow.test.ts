import { describe, it, expect, afterEach } from "vitest";
import { db } from "../../src/db/index.js";
import { createDelivery, previewDelivery } from "../../src/services/delivery.service.js";
import { createPayment } from "../../src/services/payment.service.js";
import { getDebtBalance } from "../../src/services/ledger.service.js";
import { getCustomerLifetimeStats } from "../../src/services/customer.service.js";
import {
  hasDb,
  createTestCustomer,
  createTestEmployee,
  getTestCylinderType,
  cleanupCustomer,
  cleanupEmployee,
} from "../helpers/db-test.js";

describe.skipIf(!hasDb)("debt flow (integration)", () => {
  let customerId: string;
  let employeeId: string;
  let cylinderTypeId: string;

  afterEach(async () => {
    if (customerId) await cleanupCustomer(db, customerId);
    if (employeeId) await cleanupEmployee(db, employeeId);
    customerId = "";
    employeeId = "";
  });

  it("delivery adds debt; payment reduces debt", async () => {
    const customer = await createTestCustomer(db);
    const employee = await createTestEmployee(db);
    const cyl = await getTestCylinderType(db);
    customerId = customer.id;
    employeeId = employee.id;
    cylinderTypeId = cyl.id;

    const preview = await previewDelivery(db, {
      customerId,
      employeeId,
      cashReceived: 300_000,
      deliveredAt: new Date(),
      lines: [{ cylinderTypeId, cylindersOut: 2, cylindersIn: 1 }],
    });
    expect(preview.orderAmount).toBeGreaterThan(0);
    expect(preview.debtAmount).toBe(preview.orderAmount - 300_000);

    await createDelivery(db, {
      customerId,
      employeeId,
      cashReceived: 300_000,
      deliveredAt: new Date(),
      lines: [{ cylinderTypeId, cylindersOut: 2, cylindersIn: 1 }],
      note: "payment=tm",
    });

    const debtAfterDelivery = await getDebtBalance(db, customerId);
    expect(debtAfterDelivery).toBe(preview.debtAmount);

    await createPayment(db, {
      customerId,
      amount: 200_000,
      method: "cash",
      paidAt: new Date(),
    });

    const debtAfterPayment = await getDebtBalance(db, customerId);
    expect(debtAfterPayment).toBe(debtAfterDelivery - 200_000);
  });

  it("full debt payment (0vnd no)", async () => {
    const customer = await createTestCustomer(db);
    const employee = await createTestEmployee(db);
    const cyl = await getTestCylinderType(db);
    customerId = customer.id;
    employeeId = employee.id;

    const preview = await previewDelivery(db, {
      customerId,
      employeeId,
      cashReceived: 0,
      deliveredAt: new Date(),
      lines: [{ cylinderTypeId: cyl.id, cylindersOut: 1, cylindersIn: 0 }],
    });

    await createDelivery(db, {
      customerId,
      employeeId,
      cashReceived: 0,
      deliveredAt: new Date(),
      lines: [{ cylinderTypeId: cyl.id, cylindersOut: 1, cylindersIn: 0 }],
      note: "payment=no",
    });

    expect(await getDebtBalance(db, customerId)).toBe(preview.orderAmount);
  });

  it("customer lifetime stats reflect purchases", async () => {
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
      lines: [{ cylinderTypeId: cyl.id, cylindersOut: 1, cylindersIn: 0 }],
    });

    const stats = await getCustomerLifetimeStats(db, customerId);
    expect(stats.totalCylindersPurchased).toBe(1);
    expect(stats.totalPurchaseAmount).toBeGreaterThan(0);
    expect(stats.deliveryCount).toBe(1);
  });

  it("validation error: empty delivery", async () => {
    const customer = await createTestCustomer(db);
    const employee = await createTestEmployee(db);
    customerId = customer.id;
    employeeId = employee.id;

    await expect(
      previewDelivery(db, {
        customerId,
        employeeId,
        cashReceived: 0,
        deliveredAt: new Date(),
        lines: [{ cylinderTypeId: (await getTestCylinderType(db)).id, cylindersOut: 0, cylindersIn: 0 }],
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("validation error: payment amount <= 0", async () => {
    const customer = await createTestCustomer(db);
    customerId = customer.id;

    await expect(
      createPayment(db, {
        customerId,
        amount: 0,
        method: "cash",
        paidAt: new Date(),
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });
});
