import { neon } from "@neondatabase/serverless";

let ensured = false;
let ensuring: Promise<void> | null = null;

/** Idempotent — thêm enum co_owner nếu DB cũ chưa migrate. */
export async function ensureDbSchema() {
  if (ensured) return;
  if (ensuring) return ensuring;

  ensuring = (async () => {
    const url = process.env.DATABASE_URL?.trim();
    if (!url) return;
    const sql = neon(url);
    await sql('ALTER TYPE "user_role" ADD VALUE IF NOT EXISTS \'co_owner\'');
    ensured = true;
  })().catch((err) => {
    ensuring = null;
    console.error("ensureDbSchema failed:", err);
    throw err;
  });

  return ensuring;
}
