import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import * as schema from "./schema.js";

let _db: ReturnType<typeof drizzle<typeof schema>> | undefined;

function createDb() {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    throw new Error(
      "DATABASE_URL chưa cấu hình. Vercel → Settings → Environment Variables → thêm DATABASE_URL (Neon PostgreSQL).",
    );
  }
  return drizzle(neon(url), { schema });
}

export function getDb() {
  if (!_db) _db = createDb();
  return _db;
}

/** Lazy init — tránh crash import khi thiếu DATABASE_URL (Vercel cold start). */
export const db = new Proxy({} as ReturnType<typeof createDb>, {
  get(_target, prop, receiver) {
    const instance = getDb();
    const value = Reflect.get(instance as object, prop, receiver);
    return typeof value === "function" ? value.bind(instance) : value;
  },
});

export type Db = ReturnType<typeof createDb>;
