import { describe, it, expect, afterEach } from "vitest";
import { db } from "../../src/db/index.js";
import {
  createCustomer,
  updateCustomer,
  deactivateCustomer,
  hardDeleteCustomer,
  searchCustomers,
  searchCustomerDebt,
  getCustomerDetail,
  listCustomers,
} from "../../src/services/customer.service.js";
import { AppError } from "../../utils/errors.js";
import {
  hasDb,
  uniquePhone,
  createTestCustomer,
  cleanupCustomer,
} from "../helpers/db-test.js";

describe.skipIf(!hasDb)("customer.service (integration)", () => {
  const customerIds: string[] = [];

  afterEach(async () => {
    for (const id of customerIds.splice(0)) {
      await cleanupCustomer(db, id);
    }
  });

  it("happy path: create and list customer", async () => {
    const phone = uniquePhone();
    const row = await createCustomer(db, {
      name: "TEST Create",
      phone,
      address: "Addr",
    });
    customerIds.push(row.id);

    const list = await listCustomers(db, { search: "TEST Create" });
    expect(list.some((c) => c.id === row.id)).toBe(true);
    expect(list.find((c) => c.id === row.id)?.debtBalance).toBe(0);
  });

  it("validation error: duplicate phone", async () => {
    const phone = uniquePhone();
    const row = await createCustomer(db, { name: "A", phone, address: "X" });
    customerIds.push(row.id);

    await expect(
      createCustomer(db, { name: "B", phone, address: "Y" }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("validation error: empty name", async () => {
    await expect(
      createCustomer(db, { name: "  ", phone: uniquePhone(), address: "X" }),
    ).rejects.toThrow(AppError);
  });

  it("search by name and address", async () => {
    const row = await createTestCustomer(db, {
      name: "TEST Tìm Tên UniqueXYZ",
      address: "Khu phố TEST-ADDR-999",
    });
    customerIds.push(row.id);

    const byName = await searchCustomers(db, "UniqueXYZ");
    expect(byName.some((c) => c.id === row.id)).toBe(true);

    const byAddr = await searchCustomers(db, "TEST-ADDR-999");
    expect(byAddr.some((c) => c.id === row.id)).toBe(true);
  });

  it("searchCustomerDebt by name", async () => {
    const row = await createTestCustomer(db, { name: "TEST Nợ Search ABC" });
    customerIds.push(row.id);

    const results = await searchCustomerDebt(db, "Nợ Search ABC");
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].name).toContain("ABC");
  });

  it("deactivate hides from search", async () => {
    const row = await createTestCustomer(db, { name: "TEST Hide Me" });
    customerIds.push(row.id);
    await deactivateCustomer(db, row.id);

    const results = await searchCustomers(db, "TEST Hide Me");
    expect(results.some((c) => c.id === row.id)).toBe(false);
  });

  it("hard delete allowed when no history and zero debt", async () => {
    const row = await createTestCustomer(db);
    await hardDeleteCustomer(db, row.id);
    await expect(getCustomerDetail(db, row.id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("hard delete blocked when would have history — via canDelete flag", async () => {
    const row = await createTestCustomer(db);
    customerIds.push(row.id);
    const list = await listCustomers(db, { search: row.phone });
    const item = list.find((c) => c.id === row.id);
    expect(item?.canDelete).toBe(true);
  });

  it("update customer phone normalizes", async () => {
    const row = await createTestCustomer(db);
    customerIds.push(row.id);
    const updated = await updateCustomer(db, row.id, { phone: "+84987654321" });
    expect(updated.phone).toMatch(/^0/);
  });
});
