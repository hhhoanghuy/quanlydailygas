import { describe, it, expect, afterEach } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../../src/db/index.js";
import { sessions } from "../../src/db/schema.js";
import {
  createMagicLink,
  exchangeMagicLink,
  getUserFromToken,
} from "../../src/services/auth.service.js";
import { hasDb, createTestOwnerUser, cleanupUser } from "../helpers/db-test.js";

describe.skipIf(!hasDb)("auth magic link (integration)", () => {
  let userId: string;

  afterEach(async () => {
    if (userId) {
      await db.delete(sessions).where(eq(sessions.userId, userId));
      await cleanupUser(db, userId);
      userId = "";
    }
  });

  it("exchange creates 8h web session; expired link code does not revoke web token", async () => {
    const user = await createTestOwnerUser(db);
    userId = user.id;

    const link = await createMagicLink(db, user.id);
    expect(link.code).toHaveLength(16);

    const { token: webToken } = await exchangeMagicLink(db, link.code);
    expect(webToken).toHaveLength(48);

    const me = await getUserFromToken(db, webToken);
    expect(me.id).toBe(user.id);

    await expect(exchangeMagicLink(db, link.code)).rejects.toThrow(/hết hạn|đã được sử dụng/i);

    const stillMe = await getUserFromToken(db, webToken);
    expect(stillMe.id).toBe(user.id);
  });

  it("rejects web session token as magic link code", async () => {
    const user = await createTestOwnerUser(db);
    userId = user.id;

    const link = await createMagicLink(db, user.id);
    const { token: webToken } = await exchangeMagicLink(db, link.code);

    await expect(exchangeMagicLink(db, webToken)).rejects.toThrow(/không hợp lệ/i);
  });
});
