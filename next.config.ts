import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { NextConfig } from "next";

/**
 * Resolve the project root using the canonical filesystem case via
 * `fs.realpathSync.native()`. On Windows NTFS this returns the directory's
 * canonical case (e.g. `D:\Project\codeatlas`, not whatever the user typed
 * in their shell), which is what Turbopack uses internally for path
 * comparisons. Mismatched casing here causes Turbopack to silently ignore
 * the override and fall back to its own (often wrong) inference.
 *
 * If you see "We couldn't find the Next.js package (next/package.json)
 * from the project directory: …\src\app" the canonical case of this
 * directory has drifted from what pnpm baked into the node_modules
 * junctions. Rename the project directory on disk so its canonical case
 * matches what pnpm captured (typically the lowercase form). See README.
 */
const projectRoot = fs.realpathSync.native(
  path.dirname(fileURLToPath(import.meta.url)),
);

const nextConfig: NextConfig = {
  turbopack: {
    root: projectRoot,
  },
  // Use the same root for output file tracing so `next build`'s tracing
  // agrees with the dev server.
  outputFileTracingRoot: projectRoot,
};

export default nextConfig;
