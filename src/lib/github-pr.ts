/**
 * GitHub API helpers for pull request data.
 *
 * Keeps all PR-specific fetching separate from the general github.ts so
 * the indexer doesn't grow a dependency on PR concepts.
 */

const API_BASE = "https://api.github.com";
const API_VERSION = "2022-11-28";

export interface PrRef {
  owner: string;
  repo: string;
  number: number;
}

export interface PrMetadata {
  title: string;
  body: string | null;
  state: "open" | "closed";
  merged: boolean;
  baseBranch: string;
  headBranch: string;
  changedFiles: number;
  additions: number;
  deletions: number;
  /** "owner/repo" as reported by GitHub — used to validate the PR belongs to the indexed repo. */
  repoFullName: string;
}

export interface PrFile {
  filename: string;
  status:
    | "added"
    | "removed"
    | "modified"
    | "renamed"
    | "copied"
    | "changed"
    | "unchanged";
  additions: number;
  deletions: number;
  /** Unified diff hunk. Absent for binary files; truncated for very large files. */
  patch?: string;
  previousFilename?: string;
}

/**
 * Parse a GitHub PR URL such as https://github.com/owner/repo/pull/123.
 * Returns null for anything that doesn't match that shape.
 */
export function parsePrUrl(url: string): PrRef | null {
  try {
    const u = new URL(url.trim());
    if (u.hostname !== "github.com" && u.hostname !== "www.github.com") {
      return null;
    }
    const [, owner, repo, pullsSegment, numStr] = u.pathname.split("/");
    if (pullsSegment !== "pull") return null;
    const number = parseInt(numStr ?? "", 10);
    if (!owner || !repo || isNaN(number) || number <= 0) return null;
    return { owner, repo, number };
  } catch {
    return null;
  }
}

function makeHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": API_VERSION,
    "User-Agent": "CodeAtlas-pr-review",
  };
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }
  return headers;
}

async function ghFetch(path: string): Promise<Response> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: makeHeaders(),
    // Prevent Next.js from caching GitHub responses — we always want fresh data.
    cache: "no-store",
  });
  if (res.status === 404) {
    throw new Error(`Not found (404): ${path}. The PR may not exist or the repo may be private.`);
  }
  if (res.status === 403) {
    const remaining = res.headers.get("x-ratelimit-remaining");
    if (remaining === "0") {
      throw new Error(
        "GitHub API rate limit exhausted. Set GITHUB_TOKEN in .env.local for a higher limit.",
      );
    }
  }
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GitHub API ${res.status}: ${body.slice(0, 200)}`);
  }
  return res;
}

export async function fetchPrMetadata(ref: PrRef): Promise<PrMetadata> {
  const res = await ghFetch(
    `/repos/${ref.owner}/${ref.repo}/pulls/${ref.number}`,
  );
  const json = (await res.json()) as {
    title: string;
    body: string | null;
    state: string;
    merged: boolean;
    base: { ref: string; repo: { full_name: string } };
    head: { ref: string };
    changed_files: number;
    additions: number;
    deletions: number;
  };
  return {
    title: json.title,
    body: json.body,
    state: json.state as "open" | "closed",
    merged: json.merged,
    baseBranch: json.base.ref,
    headBranch: json.head.ref,
    changedFiles: json.changed_files,
    additions: json.additions,
    deletions: json.deletions,
    repoFullName: json.base.repo.full_name,
  };
}

/** Cap how many files we pull and how big each patch can be. */
const MAX_FILES = 50;
const MAX_PATCH_CHARS = 1500;

export async function fetchPrFiles(ref: PrRef): Promise<PrFile[]> {
  const res = await ghFetch(
    `/repos/${ref.owner}/${ref.repo}/pulls/${ref.number}/files?per_page=${MAX_FILES}`,
  );
  const json = (await res.json()) as Array<{
    filename: string;
    status: string;
    additions: number;
    deletions: number;
    patch?: string;
    previous_filename?: string;
  }>;
  return json.map((f) => ({
    filename: f.filename,
    status: f.status as PrFile["status"],
    additions: f.additions,
    deletions: f.deletions,
    patch: f.patch
      ? f.patch.length > MAX_PATCH_CHARS
        ? f.patch.slice(0, MAX_PATCH_CHARS) + "\n… (patch truncated)"
        : f.patch
      : undefined,
    previousFilename: f.previous_filename,
  }));
}
