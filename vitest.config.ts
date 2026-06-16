import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

/**
 * Vitest config.
 *
 * - `environment: "node"` because every test today is for server-side code.
 *   We'll add `happy-dom` later if we start unit-testing React components.
 * - The `@/*` alias mirrors tsconfig.json so test imports look like app imports.
 * - Tests are colocated with source as `*.test.ts(x)` plus a `tests/` folder
 *   for integration-style tests that don't belong next to one file.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}", "tests/**/*.test.{ts,tsx}"],
    globals: false,
    passWithNoTests: false,
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
