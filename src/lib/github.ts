import { z } from "zod";

/**
 * Helpers for handling user-pasted GitHub repository URLs.
 *
 * The interesting bit is normalization: users paste URLs in many shapes
 * (`https://github.com/owner/repo`, `https://github.com/owner/repo.git`,
 * trailing `/`, `?tab=...` querystrings, deep-links into `/tree/main/...`).
 * We compress all of those to a single canonical form so the same repo
 * never gets two rows in the database.
 */

export interface ParsedGithubUrl {
  owner: string;
  repo: string;
  /** Canonical form: `https://github.com/<owner>/<repo>` — used as the DB key. */
  normalizedUrl: string;
  /** Display name = `${owner}/${repo}`. */
  name: string;
  /** Clone target — same as normalizedUrl but with `.git` appended. */
  cloneUrl: string;
}

/**
 * Strict pattern for owner + repo segments. GitHub limits owners to
 * alphanumeric/hyphen and repos to alphanumeric, hyphen, underscore, period.
 * We keep the pattern simple (no leading-dash check etc.) and rely on the
 * actual clone to fail for malformed names — saves us hand-rolling GitHub's
 * full naming rules.
 */
const OWNER = /^[a-zA-Z0-9][a-zA-Z0-9-]{0,38}$/;
const REPO = /^[a-zA-Z0-9._-]{1,100}$/;

export function parseGithubUrl(input: string): ParsedGithubUrl | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }

  // We only support github.com today. Enterprise hostnames would need a
  // config knob; out of scope for now.
  if (url.hostname !== "github.com" && url.hostname !== "www.github.com") {
    return null;
  }

  // Split path → [owner, repo, ...rest]. We ignore the rest so deep-links
  // like /owner/repo/tree/main/src work fine.
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length < 2) return null;

  const owner = parts[0];
  let repo = parts[1];

  // Strip the trailing `.git` if the user pasted the clone URL form.
  if (repo.endsWith(".git")) repo = repo.slice(0, -4);

  if (!OWNER.test(owner) || !REPO.test(repo)) return null;

  const normalizedUrl = `https://github.com/${owner}/${repo}`;
  return {
    owner,
    repo,
    normalizedUrl,
    name: `${owner}/${repo}`,
    cloneUrl: `${normalizedUrl}.git`,
  };
}

/**
 * Zod refinement that turns the raw string into a `ParsedGithubUrl`. Use
 * this in API route bodies so route handlers never see an un-validated URL.
 */
export const githubUrlSchema = z
  .string()
  .min(1)
  .max(500)
  .transform((raw, ctx) => {
    const parsed = parseGithubUrl(raw);
    if (!parsed) {
      ctx.addIssue({
        code: "custom",
        message:
          "Not a recognizable GitHub repository URL (expected https://github.com/owner/repo).",
      });
      return z.NEVER;
    }
    return parsed;
  });
