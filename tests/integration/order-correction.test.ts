import { describe, it, expect, afterEach } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../../src/db/index.js";
import { deliveryOrders } from "../../src/db/schema.js";
import {
  createDeliveryOrder,
  markOrderDelivering,
  completeDeliveryOrder,
  previewOrderCorrection,
  correctCompletedOrder,
} from "../../src/services/order.service.js";
import { getDebtBalance } from "../../src/services/ledger.service.js";
import {
  hasDb,
  createTestCustomer,
  createTestEmployee,
  createTestOwnerUser,
  getTestCylinderType,
  cleanupCustomer,
  cleanupEmployee,
  cleanupUser,
} from "../helpers/db-test.js";

describe.skipIf(!hasDb)("order correction (integration)", () => {
  let customerId: string;
  let employeeId: string;
  let ownerUserId: string;
  let orderId: string;

  afterEach(async () => {
    if (customerId) await cleanupCustomer(db, customerId);
    if (employeeId) await cleanupEmployee(db, employeeId);
    if (ownerUserId) await cleanupUser(db, ownerUserId);
    customerId = "";
    employeeId = "";
    ownerUserId = "";
    orderId = "";
  });

  async function completeTestOrder(cylindersOut = 2, cylindersIn = 1, cashReceived = 350_000) {
    const customer = await createTestCustomer(db);
    const employee = await createTestEmployee(db);
    const owner = await createTestOwnerUser(db);
    const cyl = await getTestCylinderType(db);
    customerId = customer.id;
    employeeId = employee.id;
    ownerUserId = owner.id;

    const { order } = await createDeliveryOrder(db, {
      customerId,
      createdByUserId: owner.id,
      assignedEmployeeId: employee.id,
      lines: [{ cylinderTypeId: cyl.id, cylindersOut }],
    });
    orderId = order.id;

    await markOrderDelivering(db, order.id, employee.id);
    await completeDeliveryOrder(db, {
      orderId: order.id,
      employeeId: employee.id,
      cylindersInByLine: [cylindersIn],
      cashReceived,
      note: "payment=tm",
    });

    return { customer, employee, cyl };
  }

  it("preview shows debt and holding delta", async () => {
    await completeTestOrder(2, 1, 350_000);

    const preview = await previewOrderCorrection(db, orderId, {
      lines: [{ cylindersOut: 2, cylindersIn: 0, gasSurplusKg: 0 }],
      cashReceived: 0,
      paymentMethod: "no",
      employeeId,
    });

    expect(preview.delta.holding).toBe(1);
    expect(preview.delta.cashReceived).toBeLessThan(0);
    expect(preview.delta.debtAmount).toBeGreaterThan(0);
  });

  it("correct updates customer debt", async () => {
    await completeTestOrder(2, 1, 350_000);
    const debtBefore = await getDebtBalance(db, customerId);

    await correctCompletedOrder(db, orderId, {
      lines: [{ cylindersOut: 1, cylindersIn: 1, gasSurplusKg: 0 }],
      cashReceived: 500_000,
      paymentMethod: "tm",
      employeeId,
    });

    const debtAfter = await getDebtBalance(db, customerId);
    expect(debtAfter).not.toBe(debtBefore);
  });

  it("rejects correction after 48 hours", async () => {
    await completeTestOrder(1, 0, 0);

    await db
      .update(deliveryOrders)
      .set({ completedAt: new Date(Date.now() - 49 * 60 * 60 * 1000) })
      .where(eq(deliveryOrders.id, orderId));

    await expect(
      previewOrderCorrection(db, orderId, {
        lines: [{ cylindersOut: 1, cylindersIn: 0 }],
        cashReceived: 0,
        paymentMethod: "no",
        employeeId,
      }),
    ).rejects.toThrow(/48 giờ/i);
  });
});
