import { defineConfig } from "drizzle-kit";

/**
 * Drizzle Kit config — used by `pnpm db:generate` (create SQL from schema)
 * and `pnpm db:studio`. Migrations themselves are applied by the small
 * runner in scripts/migrate.ts so the same code path can be used in CI later.
 *
 * `dotenv-cli` loads .env.local before drizzle-kit runs (see package.json).
 */
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/server/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
  // Verbose output during generate makes it easier to spot accidental
  // destructive operations in pull requests.
  verbose: true,
  strict: true,
});
