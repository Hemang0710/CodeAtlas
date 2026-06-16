/**
 * Apply pending Drizzle migrations against DATABASE_URL.
 *
 * Run with `pnpm db:migrate`. We keep this as a tiny script (instead of
 * shelling out to `drizzle-kit migrate`) so the same code path can be used
 * later in CI, in container start-up, or in tests.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error(
      "DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.",
    );
    process.exit(1);
  }

  // Migrations must run on a single connection so advisory locks behave
  // and DDL stays serialized. `max: 1` is the canonical setting.
  const client = postgres(url, { max: 1, prepare: false });
  const db = drizzle(client);

  try {
    await migrate(db, { migrationsFolder: "./drizzle" });
    console.log("[migrate] all migrations applied");
  } catch (err) {
    console.error("[migrate] failed:", err);
    process.exitCode = 1;
  } finally {
    await client.end({ timeout: 5 });
  }
}

void main();
