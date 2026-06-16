/**
 * Minimal GitHub REST client. Only one endpoint for now — repo metadata —
 * so we can size-check a repo before paying for a clone.
 *
 * Auth: optional. If GITHUB_TOKEN is set we send it; without it we get the
 * lower anonymous rate limit (60/hour/IP) which is fine for portfolio dev.
 */

const API_BASE = "https://api.github.com";
const API_VERSION = "2022-11-28";

export interface RepoMetadata {
  /** Reported size of the repo on GitHub, in **kilobytes**. */
  sizeKb: number;
  defaultBranch: string;
  archived: boolean;
  isPrivate: boolean;
}

/**
 * Custom error: a repo doesn't exist (or we're not allowed to see it).
 * Used so the caller can decide not to retry — re-running a 404 forever
 * just burns CPU.
 */
export class RepoNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RepoNotFoundError";
  }
}

interface GithubRepoResponse {
  size: number;
  default_branch: string;
  archived: boolean;
  private: boolean;
}

export async function fetchRepoMetadata(
  owner: string,
  repo: string,
): Promise<RepoMetadata> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": API_VERSION,
    "User-Agent": "CodeAtlas-indexer",
  };
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  const res = await fetch(`${API_BASE}/repos/${owner}/${repo}`, { headers });

  if (res.status === 404) {
    throw new RepoNotFoundError(
      `Repository ${owner}/${repo} not found, or it is private and our token can't see it.`,
    );
  }
  if (res.status === 403) {
    // 403 with rate-limit headers means we should wait, not give up.
    const remaining = res.headers.get("x-ratelimit-remaining");
    if (remaining === "0") {
      throw new Error(
        `GitHub API rate limit exhausted. Set GITHUB_TOKEN in .env.local for a higher limit.`,
      );
    }
  }
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GitHub API returned ${res.status}: ${body.slice(0, 200)}`);
  }

  const json = (await res.json()) as GithubRepoResponse;
  return {
    sizeKb: json.size,
    defaultBranch: json.default_branch,
    archived: json.archived,
    isPrivate: json.private,
  };
}
