import { describe, it, expect, beforeAll } from "vitest";
import { db, type Db } from "../../src/db/index.js";
import { users, inviteCodes, employees } from "../../src/db/schema.js";
import { eq, inArray } from "drizzle-orm";
import {
  activateInvite,
  countCoOwners,
  createCoOwnerInvite,
  createInviteCode,
  hasPrimaryOwner,
} from "../../src/services/auth.service.js";
import { hasDb } from "../helpers/db-test.js";
import { MAX_CO_OWNERS } from "../../utils/auth-roles.js";

describe.skipIf(!hasDb)("co-owner", () => {
  const tgBase = 900_000_000 + Math.floor(Math.random() * 10_000);

  async function cleanupCoOwners(dbConn: Db) {
    const coUsers = await dbConn
      .select({ id: users.id, employeeId: users.employeeId })
      .from(users)
      .where(eq(users.role, "co_owner"));
    const ids = coUsers.map((u) => u.id);
    const empIds = coUsers.map((u) => u.employeeId).filter(Boolean) as string[];
    if (ids.length) {
      await dbConn.delete(inviteCodes).where(inArray(inviteCodes.usedByUserId, ids));
      await dbConn.delete(users).where(inArray(users.id, ids));
    }
    if (empIds.length) {
      await dbConn.delete(employees).where(inArray(employees.id, empIds));
    }
  }

  beforeAll(async () => {
    await cleanupCoOwners(db);
  });

  it("hasPrimaryOwner when owner exists", async () => {
    expect(await hasPrimaryOwner(db)).toBe(true);
  });

  it("primary owner creates co-owner invite", async () => {
    const [owner] = await db.select().from(users).where(eq(users.role, "owner")).limit(1);
    expect(owner).toBeTruthy();
    const invite = await createCoOwnerInvite(db, owner!);
    expect(invite.role).toBe("co_owner");
  });

  it("co-owner cannot create co-owner invite", async () => {
    const fakeCo = { role: "co_owner" as const };
    await expect(createCoOwnerInvite(db, fakeCo)).rejects.toMatchObject({
      message: expect.stringContaining("chủ đại lý chính"),
    });
  });

  it("activates co-owner and enforces max quota", async () => {
    const [owner] = await db.select().from(users).where(eq(users.role, "owner")).limit(1);
    expect(owner).toBeTruthy();

    for (let i = 0; i < MAX_CO_OWNERS; i++) {
      const invite = await createCoOwnerInvite(db, owner!);
      const result = await activateInvite(db, {
        inviteCode: invite.code,
        telegramUserId: tgBase + i,
        name: `Co Owner ${i}`,
      });
      expect(result.user.role).toBe("co_owner");
    }

    expect(await countCoOwners(db)).toBe(MAX_CO_OWNERS);

    await expect(createCoOwnerInvite(db, owner!)).rejects.toMatchObject({
      message: expect.stringContaining(`${MAX_CO_OWNERS}`),
    });

    await cleanupCoOwners(db);
  });

  it("blocks second primary owner activation", async () => {
    if (!(await hasPrimaryOwner(db))) return;
    const invite = await createInviteCode(db, "owner", 1);
    await expect(
      activateInvite(db, {
        inviteCode: invite.code,
        telegramUserId: tgBase + 500,
        name: "Second Owner",
      }),
    ).rejects.toMatchObject({
      message: expect.stringContaining("cài đặt lần đầu"),
    });
  });
});
