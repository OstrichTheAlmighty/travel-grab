import { createClient } from "@supabase/supabase-js";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./db/schema";
import type { SQL } from "drizzle-orm";
import { CasingCache } from "drizzle-orm/casing";

// ── Supabase admin client (REST / auth bypass) ─────────────────────────────────

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

export const supabaseAdmin = supabaseUrl && serviceRoleKey
  ? createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })
  : null;

// ── Full Drizzle db (select / insert / update / delete / execute) ──────────────
// Checks Vercel Supabase integration env vars before falling back to DATABASE_URL.

type DrizzleDb = ReturnType<typeof drizzle<typeof schema>>;

const _g = globalThis as typeof globalThis & {
  _pgLibDb?: DrizzleDb;
  _pgLibRaw?: ReturnType<typeof postgres>;
};

function initDb(): DrizzleDb {
  if (!_g._pgLibDb) {
    const url =
      process.env.POSTGRES_URL_NON_POOLING ??  // Vercel Supabase integration (direct)
      process.env.DATABASE_URL ??               // generic fallback
      process.env.POSTGRES_URL ??               // pooled fallback
      "";
    if (!url) throw new Error("No Postgres URL. Set POSTGRES_URL_NON_POOLING or DATABASE_URL.");
    _g._pgLibRaw = postgres(url, { max: 10, idle_timeout: 20, connect_timeout: 10 });
    _g._pgLibDb = drizzle(_g._pgLibRaw, { schema });
  }
  return _g._pgLibDb!;
}

// Proxy defers init to first query — safe to import at build time when URL is absent.
export const db = new Proxy({} as DrizzleDb, {
  get(_, prop) {
    return Reflect.get(initDb(), prop as string);
  },
});

export type Db = typeof db;

// ── db.execute helper — exposed as a standalone for _inventoryCache.ts ─────────
// Accepts a Drizzle sql`` template and runs it directly against Postgres.

const _casing = new CasingCache();

export async function executeRaw<T = Record<string, unknown>>(
  template: SQL<unknown>,
): Promise<T[]> {
  initDb();
  if (!_g._pgLibRaw) throw new Error("Postgres client not initialised");
  const { sql: text, params } = template.toQuery({
    casing: _casing,
    escapeName: (name) => `"${name}"`,
    escapeParam: (num) => `$${num + 1}`,
    escapeString: (str) => `'${str.replace(/'/g, "''")}'`,
  });
  const rows = await _g._pgLibRaw.unsafe(text, params as postgres.ParameterOrJSON<never>[]);
  return rows as unknown as T[];
}
