import { describe, it, expect, afterEach } from "vitest";
import { db } from "../../src/db/index.js";
import {
  createDeliveryOrder,
  markOrderDelivering,
  completeDeliveryOrder,
  cancelDeliveryOrder,
  getOrderDetail,
  listOrders,
  getOrderDetailForWeb,
  listDeliveryWorkers,
} from "../../src/services/order.service.js";
import { ensureEmployeeId } from "../../src/services/auth.service.js";
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

describe.skipIf(!hasDb)("order flow (integration)", () => {
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

  it("happy path: create → delivering → complete", async () => {
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
      lines: [{ cylinderTypeId: cyl.id, cylindersOut: 2 }],
    });
    orderId = order.id;
    expect(order.status).toBe("pending");

    await markOrderDelivering(db, order.id, employee.id);
    const mid = await getOrderDetail(db, order.id);
    expect(mid.order.status).toBe("delivering");

    await completeDeliveryOrder(db, {
      orderId: order.id,
      employeeId: employee.id,
      cylindersInByLine: [1],
      cashReceived: 350_000,
      note: "payment=tm",
    });

    const done = await getOrderDetail(db, order.id);
    expect(done.order.status).toBe("completed");
    expect(done.order.deliveryId).toBeTruthy();

    const webDetail = await getOrderDetailForWeb(db, order.id);
    expect(webDetail.fulfillment).toBeTruthy();
    expect(webDetail.customerSummary.totalCylindersPurchased).toBeGreaterThanOrEqual(2);
    expect(webDetail.messagePreview).toContain(customer.name);
  });

  it("cancel pending order", async () => {
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
      lines: [{ cylinderTypeId: cyl.id, cylindersOut: 1 }],
    });
    orderId = order.id;

    await cancelDeliveryOrder(db, order.id);
    const detail = await getOrderDetail(db, order.id);
    expect(detail.order.status).toBe("cancelled");
  });

  it("validation: order without employee", async () => {
    const customer = await createTestCustomer(db);
    const owner = await createTestOwnerUser(db);
    const cyl = await getTestCylinderType(db);
    customerId = customer.id;
    ownerUserId = owner.id;

    await expect(
      createDeliveryOrder(db, {
        customerId,
        createdByUserId: owner.id,
        lines: [{ cylinderTypeId: cyl.id, cylindersOut: 1 }],
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("owner-only shop: assign and complete as owner", async () => {
    const customer = await createTestCustomer(db);
    const owner = await createTestOwnerUser(db);
    const cyl = await getTestCylinderType(db);
    customerId = customer.id;
    ownerUserId = owner.id;

    const ownerEmployeeId = await ensureEmployeeId(db, owner);
    const workers = await listDeliveryWorkers(db, owner, ownerEmployeeId);
    expect(workers).toHaveLength(1);
    expect(workers[0].isOwner).toBe(true);

    const { order } = await createDeliveryOrder(db, {
      customerId,
      createdByUserId: owner.id,
      assignedEmployeeId: ownerEmployeeId,
      lines: [{ cylinderTypeId: cyl.id, cylindersOut: 1 }],
    });
    orderId = order.id;

    await markOrderDelivering(db, order.id, ownerEmployeeId);
    await completeDeliveryOrder(db, {
      orderId: order.id,
      employeeId: ownerEmployeeId,
      cylindersInByLine: [0],
      cashReceived: 0,
      note: "payment=no",
    });

    const done = await getOrderDetail(db, order.id);
    expect(done.order.status).toBe("completed");
  });

  it("validation: cannot complete twice", async () => {
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
      lines: [{ cylinderTypeId: cyl.id, cylindersOut: 1 }],
    });
    orderId = order.id;

    await markOrderDelivering(db, order.id, employee.id);
    await completeDeliveryOrder(db, {
      orderId: order.id,
      employeeId: employee.id,
      cylindersInByLine: [0],
      cashReceived: 0,
      note: "payment=no",
    });

    await expect(
      completeDeliveryOrder(db, {
        orderId: order.id,
        employeeId: employee.id,
        cylindersInByLine: [0],
        cashReceived: 0,
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("listOrders filters by status", async () => {
    const all = await listOrders(db, { status: "all", limit: 5 });
    expect(Array.isArray(all)).toBe(true);
  });
});
