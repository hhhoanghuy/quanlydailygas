import "dotenv/config";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);

const dir = join(process.cwd(), "drizzle");
const files = readdirSync(dir)
  .filter((f) => f.endsWith(".sql"))
  .sort();

for (const file of files) {
  console.log(`\n--- ${file} ---`);
  const content = readFileSync(join(dir, file), "utf8");
  const statements = content
    .split(/;\s*\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith("--"));

  for (const statement of statements) {
    try {
      await sql(`${statement};`);
      console.log("OK:", statement.slice(0, 60).replace(/\s+/g, " ") + "...");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("already exists")) {
        console.log("SKIP (exists):", statement.slice(0, 40) + "...");
      } else {
        throw err;
      }
    }
  }
}

console.log("\nMigrations complete");
