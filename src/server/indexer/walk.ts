import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

import ignore, { type Ignore } from "ignore";

import { hasBinaryExtension, looksBinary } from "@/lib/is-binary";
import { detectLanguage } from "@/lib/language";
import {
  SKIP_DIRS,
  SKIP_FILES,
  isSecretFile,
} from "@/lib/skip-patterns";

import { INDEXER_LIMITS } from "./config";

/**
 * Walk a cloned repo and yield one record per indexable file.
 *
 * Decision flow per entry:
 *   1. SKIP_DIRS (and dotfile-style directories named `.git`) → skip subtree.
 *   2. Anything `.gitignore` matches → skip.
 *   3. SKIP_FILES or secret regex → skip.
 *   4. Binary by extension or null-byte sniff → skip.
 *   5. Larger than MAX_FILE_BYTES → skip (not a failure).
 *   6. Otherwise read + hash + record.
 *
 * Anything skipped is reported via the optional `onSkip` callback so the
 * UI / logs can show how many files were dropped and why.
 */

export interface WalkedFile {
  /** Path relative to the repo root, always using forward slashes. */
  path: string;
  language: string | null;
  contentHash: string; // sha-256, hex
  sizeBytes: number;
}

export interface WalkReport {
  files: WalkedFile[];
  totalFilesSeen: number;
  skipped: number;
  truncatedAtCap: boolean;
}

export async function walkRepo(rootDir: string): Promise<WalkReport> {
  const ig = await loadGitignore(rootDir);
  const result: WalkedFile[] = [];
  let totalSeen = 0;
  let skipped = 0;
  let truncated = false;

  // Iterative DFS to keep the call stack bounded on deeply nested repos.
  const stack: string[] = [rootDir];

  while (stack.length > 0) {
    const dir = stack.pop();
    if (!dir) continue;

    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (result.length >= INDEXER_LIMITS.MAX_FILE_COUNT) {
        truncated = true;
        return { files: result, totalFilesSeen: totalSeen, skipped, truncatedAtCap: true };
      }

      const absolute = path.join(dir, entry.name);
      const relative = path
        .relative(rootDir, absolute)
        .split(path.sep)
        .join("/");

      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name) || ig.ignores(`${relative}/`)) {
          continue;
        }
        stack.push(absolute);
        continue;
      }

      if (!entry.isFile()) continue;
      totalSeen++;

      if (SKIP_FILES.has(entry.name) || isSecretFile(entry.name)) {
        skipped++;
        continue;
      }
      if (ig.ignores(relative)) {
        skipped++;
        continue;
      }
      if (hasBinaryExtension(relative)) {
        skipped++;
        continue;
      }

      const stat = await fs.stat(absolute);
      if (stat.size > INDEXER_LIMITS.MAX_FILE_BYTES) {
        skipped++;
        continue;
      }

      const buffer = await fs.readFile(absolute);
      if (looksBinary(buffer)) {
        skipped++;
        continue;
      }

      result.push({
        path: relative,
        language: detectLanguage(relative),
        contentHash: sha256Hex(buffer),
        sizeBytes: stat.size,
      });
    }
  }

  return {
    files: result,
    totalFilesSeen: totalSeen,
    skipped,
    truncatedAtCap: truncated,
  };
}

/**
 * Load the repo's root .gitignore into an `ignore` matcher. Nested
 * .gitignore files would need a more elaborate matcher per directory; we
 * accept that gap for Phase 1 since repos rarely have deeply nested ones,
 * and our hard denylist already covers the worst offenders.
 */
async function loadGitignore(rootDir: string): Promise<Ignore> {
  const ig = ignore();
  // Always ignore `.git` directory contents even if no gitignore exists.
  ig.add(".git");

  try {
    const content = await fs.readFile(path.join(rootDir, ".gitignore"), "utf8");
    ig.add(content);
  } catch {
    // Repo without a .gitignore — that's fine, our hard denylist remains.
  }
  return ig;
}

/**
 * Node-native sha-256. The worker is Node-only so we can use `node:crypto`
 * directly, which sidesteps the BufferSource typing dance webcrypto requires.
 */
function sha256Hex(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}
