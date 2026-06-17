import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

/**
 * Singleton postgres-js client + Drizzle wrapper.
 *
 * We initialise lazily (on first property access) for two reasons:
 *
 *   1. HMR in `next dev` reloads modules; binding the client to globalThis
 *      lets us survive a reload without leaking connections.
 *   2. Unit tests can import modules that transitively touch `db` without
 *      needing a running database. Tests never *call* `.select()` etc.,
 *      so the underlying client never gets constructed.
 *
 * Supabase's pooled (pgbouncer transaction-mode) connection disallows
 * prepared statements, hence `prepare: false`.
 */

type PgClient = ReturnType<typeof postgres>;
type Db = ReturnType<typeof drizzle<typeof schema>>;

const globalForDb = globalThis as unknown as {
  __codeatlasPg?: PgClient;
  __codeatlasDb?: Db;
};

function getConnectionString(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.",
    );
  }
  return url;
}

function getClient(): PgClient {
  if (!globalForDb.__codeatlasPg) {
    globalForDb.__codeatlasPg = postgres(getConnectionString(), {
      max: 10,
      prepare: false,
    });
  }
  return globalForDb.__codeatlasPg;
}

function getDb(): Db {
  if (!globalForDb.__codeatlasDb) {
    globalForDb.__codeatlasDb = drizzle(getClient(), { schema });
  }
  return globalForDb.__codeatlasDb;
}

/**
 * Lazy facade around the real Drizzle instance. The Proxy means
 * `import { db } from "@/server/db/client"` is a free operation; the
 * Postgres connection only opens the first time someone calls a real
 * method like `db.select()`.
 *
 * Method binding is preserved via `.bind(actual)` so chained query
 * builders keep their `this` reference.
 */
export const db = new Proxy({} as Db, {
  get(_target, prop) {
    const actual = getDb() as unknown as Record<string | symbol, unknown>;
    const value = actual[prop];
    return typeof value === "function" ? (value as (...args: unknown[]) => unknown).bind(actual) : value;
  },
});

export { schema };
