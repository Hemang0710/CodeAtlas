import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { walkRepo } from "./walk";

/**
 * Integration-ish test: build a fake repo on disk, run the walker, assert
 * what gets included and what gets filtered. Cleaner than mocking fs.
 */

describe("walkRepo", () => {
  let dir = "";

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "codeatlas-walk-"));
  });
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("includes source files, skips ignored / binary / secret / lockfile", async () => {
    // Layout:
    //   src/index.ts            ← kept
    //   src/util.py             ← kept
    //   node_modules/foo.js     ← skipped (denylist dir)
    //   .git/HEAD               ← skipped (denylist dir)
    //   logo.png                ← skipped (binary extension)
    //   pnpm-lock.yaml          ← skipped (lockfile)
    //   .env                    ← skipped (secret)
    //   ignored.txt             ← skipped (.gitignore says so)
    //   real.txt                ← kept
    await write(dir, "src/index.ts", "export const x = 1;\n");
    await write(dir, "src/util.py", "x = 1\n");
    await write(dir, "node_modules/foo.js", "// junk\n");
    await write(dir, ".git/HEAD", "ref: refs/heads/main\n");
    await write(dir, "logo.png", Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    await write(dir, "pnpm-lock.yaml", "lockfileVersion: 9\n");
    await write(dir, ".env", "SECRET=shhh\n");
    await write(dir, "ignored.txt", "should not appear\n");
    await write(dir, "real.txt", "kept\n");
    await write(dir, ".gitignore", "ignored.txt\n");

    const report = await walkRepo(dir);

    const paths = report.files.map((f) => f.path).sort();
    // .gitignore itself IS indexed — it's a useful config file, not a secret.
    expect(paths).toEqual([
      ".gitignore",
      "real.txt",
      "src/index.ts",
      "src/util.py",
    ]);

    // Sanity: language detection happened.
    const byPath = new Map(report.files.map((f) => [f.path, f]));
    expect(byPath.get("src/index.ts")?.language).toBe("typescript");
    expect(byPath.get("src/util.py")?.language).toBe("python");

    // Hashes look like sha-256 hex.
    for (const f of report.files) {
      expect(f.contentHash).toMatch(/^[0-9a-f]{64}$/);
    }

    expect(report.skipped).toBeGreaterThan(0);
    expect(report.truncatedAtCap).toBe(false);
  });

  it("handles a repo with no .gitignore", async () => {
    await write(dir, "a.ts", "const a = 1;\n");
    const report = await walkRepo(dir);
    expect(report.files.map((f) => f.path)).toEqual(["a.ts"]);
  });
});

async function write(
  rootDir: string,
  relPath: string,
  content: string | Buffer,
): Promise<void> {
  const full = path.join(rootDir, relPath);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, content);
}
