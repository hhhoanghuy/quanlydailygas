import "dotenv/config";
import { db } from "../src/db/index.js";
import { inviteCodes } from "../src/db/schema.js";
import { eq } from "drizzle-orm";
import { createInviteCode } from "../src/services/auth.service.js";

const rows = await db
  .select({
    code: inviteCodes.code,
    role: inviteCodes.role,
    usedAt: inviteCodes.usedAt,
    expiresAt: inviteCodes.expiresAt,
  })
  .from(inviteCodes)
  .where(eq(inviteCodes.role, "owner"));

const unused = rows.filter((r) => !r.usedAt);

if (unused.length > 0) {
  console.log("\n=== MÃ MỜI OWNER CHƯA DÙNG ===");
  for (const r of unused) {
    const exp = r.expiresAt ? new Date(r.expiresAt).toLocaleString("vi-VN") : "không hết hạn";
    console.log(`  /start ${r.code}   (hết hạn: ${exp})`);
  }
} else {
  console.log("Không có mã chưa dùng — tạo mã mới...");
  const inv = await createInviteCode(db, "owner", 8760);
  console.log(`\n  /start ${inv.code}`);
}

console.log("\nCopy lệnh trên → nhắn bot Telegram @quanlydailygas_bot\n");
process.exit(0);
