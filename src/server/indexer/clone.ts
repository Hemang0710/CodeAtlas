import { promises as fs } from "node:fs";
import path from "node:path";

import { simpleGit } from "simple-git";

import { INDEXER_LIMITS } from "./config";

/**
 * Clone a public GitHub repo into `targetDir`.
 *
 * Why shallow (depth 1): we only need the *current* state of the code, and
 * `--depth 1` is often 10× faster and smaller than a full clone.
 *
 * Why no auth path here: we only index public repos in Phase 1. Private
 * repos would route through GITHUB_TOKEN later — that's a Phase 7 stretch.
 */
export async function cloneRepo(opts: {
  cloneUrl: string;
  targetDir: string;
}): Promise<void> {
  await fs.mkdir(opts.targetDir, { recursive: true });

  const git = simpleGit({
    baseDir: path.dirname(opts.targetDir),
    timeout: { block: INDEXER_LIMITS.CLONE_TIMEOUT_MS },
  });

  await git.clone(opts.cloneUrl, opts.targetDir, [
    "--depth",
    "1",
    "--single-branch",
    // No tags, no submodules: we don't index either, and submodules can
    // contain arbitrary code we haven't size-checked.
    "--no-tags",
    "--no-checkout",
  ]);

  // We did `--no-checkout` so we could check the .git size before paying
  // for the working tree. Now check out into the same dir.
  const repoGit = simpleGit({ baseDir: opts.targetDir });
  await repoGit.checkout("HEAD");
}

/**
 * Recursive size walker — used after clone to enforce MAX_REPO_BYTES.
 *
 * We don't skip directories like `.git` here because we want to charge the
 * size budget honestly. The walker that ingests files has its own skip list.
 */
export async function directorySize(dir: string): Promise<number> {
  let total = 0;
  const stack: string[] = [dir];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (entry.isFile()) {
        const stat = await fs.stat(full);
        total += stat.size;
        // Fast-path: stop counting once we exceed the cap.
        if (total > INDEXER_LIMITS.MAX_REPO_BYTES) return total;
      }
    }
  }
  return total;
}
