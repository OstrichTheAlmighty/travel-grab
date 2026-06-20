import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

type DrizzleDb = ReturnType<typeof drizzle<typeof schema>>;

// Singleton lives on globalThis so it survives Next.js hot-reloads in dev.
const g = globalThis as unknown as { _pgDb?: DrizzleDb };

function initDb(): DrizzleDb {
  if (!g._pgDb) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set. Add it to .env.local.");
    const client = postgres(url, { max: 10, idle_timeout: 20, connect_timeout: 10 });
    g._pgDb = drizzle(client, { schema });
  }
  return g._pgDb;
}

// Proxy defers initialization to the first actual query, so importing this
// module at build time (when DATABASE_URL may be absent) doesn't throw.
export const db = new Proxy({} as DrizzleDb, {
  get(_, prop) {
    return Reflect.get(initDb(), prop as string);
  },
});

export type Db = typeof db;
