import { describe, it, expect, afterEach } from "vitest";
import { db } from "../../src/db/index.js";
import { createDelivery } from "../../src/services/delivery.service.js";
import { getTotalGasSurplusKg } from "../../src/services/gas-surplus.service.js";
import {
  hasDb,
  createTestCustomer,
  createTestEmployee,
  getTestCylinderType,
  cleanupCustomer,
  cleanupEmployee,
} from "../helpers/db-test.js";

describe.skipIf(!hasDb)("gas surplus (integration)", () => {
  let customerId: string;
  let employeeId: string;

  afterEach(async () => {
    if (customerId) await cleanupCustomer(db, customerId);
    if (employeeId) await cleanupEmployee(db, employeeId);
  });

  it("records gas surplus kg on delivery line", async () => {
    const customer = await createTestCustomer(db);
    const employee = await createTestEmployee(db);
    const cyl = await getTestCylinderType(db, "45kg");
    customerId = customer.id;
    employeeId = employee.id;

    await createDelivery(db, {
      customerId,
      employeeId,
      cashReceived: 500_000,
      deliveredAt: new Date(),
      lines: [{ cylinderTypeId: cyl.id, cylindersOut: 2, cylindersIn: 2, gasSurplusKg: 5 }],
      allowGasSurplus: true,
    });

    const total = await getTotalGasSurplusKg(db);
    expect(total).toBeGreaterThanOrEqual(5);
  });

  it("validation: gas surplus on 12kg rejected", async () => {
    const customer = await createTestCustomer(db);
    const employee = await createTestEmployee(db);
    const cyl = await getTestCylinderType(db, "12kg");
    customerId = customer.id;
    employeeId = employee.id;

    await expect(
      createDelivery(db, {
        customerId,
        employeeId,
        cashReceived: 350_000,
        deliveredAt: new Date(),
        lines: [{ cylinderTypeId: cyl.id, cylindersOut: 1, cylindersIn: 1, gasSurplusKg: 2 }],
        allowGasSurplus: true,
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });
});
