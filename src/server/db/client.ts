import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

/**
 * Singleton postgres-js client + Drizzle wrapper.
 *
 * Why a singleton: in Next.js dev mode the module graph is reloaded on every
 * change, which would leak connections without this guard. We stash the
 * client on `globalThis` so HMR reuses it.
 *
 * In the worker process there's no HMR, but caching here is still cheap.
 */
const globalForDb = globalThis as unknown as {
  __codeatlasPg?: ReturnType<typeof postgres>;
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

function createClient() {
  // Supabase's pooled connection (pgbouncer transaction mode) disallows
  // prepared statements; postgres-js needs `prepare: false` to play nice.
  return postgres(getConnectionString(), {
    max: 10,
    prepare: false,
  });
}

const client = globalForDb.__codeatlasPg ?? createClient();
if (process.env.NODE_ENV !== "production") {
  globalForDb.__codeatlasPg = client;
}

export const db = drizzle(client, { schema });
export { schema };
