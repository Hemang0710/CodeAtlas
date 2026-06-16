/**
 * Hard-coded denylists for the indexer's file walker.
 *
 * These run *in addition to* the cloned repo's own `.gitignore`. We split
 * the rules into three buckets so a) tests can target each independently
 * and b) the reason a file was skipped is auditable.
 */

/**
 * Directory names that we never descend into — anywhere in the tree.
 * `.git` is here so we don't index the repo's own history blobs.
 */
export const SKIP_DIRS = new Set<string>([
  ".git",
  ".hg",
  ".svn",
  "node_modules",
  ".next",
  ".turbo",
  ".cache",
  ".pytest_cache",
  ".mypy_cache",
  ".ruff_cache",
  "__pycache__",
  ".venv",
  "venv",
  ".env",
  "dist",
  "build",
  "out",
  "target", // Rust/Java
  "coverage",
  "vendor",
  ".idea",
  ".vscode",
  ".gradle",
  ".bundle",
  ".DS_Store",
]);

/**
 * Exact basenames we never index. Lockfiles get heavy and add nothing for
 * semantic search; they'd just dilute embeddings later.
 */
export const SKIP_FILES = new Set<string>([
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "bun.lockb",
  "bun.lock",
  "composer.lock",
  "Pipfile.lock",
  "poetry.lock",
  "Cargo.lock",
  "Gemfile.lock",
  "uv.lock",
  "Podfile.lock",
  "mix.lock",
  ".DS_Store",
  "Thumbs.db",
]);

/**
 * Secret-bearing filename patterns from CLAUDE.md's security section. We
 * NEVER read or store these — they're regexed against the basename only,
 * not the path (so a directory called `.envs` is fine).
 *
 * Anything matching SHOULD NOT even be opened for hashing; the walker
 * filters these before any I/O.
 */
export const SECRET_PATTERNS: RegExp[] = [
  /^\.env(\..+)?$/i, // .env, .env.local, .env.production
  /\.pem$/i,
  /\.key$/i,
  /\.crt$/i,
  /\.p12$/i,
  /\.pfx$/i,
  /^credentials.*$/i,
  /^id_rsa.*$/i,
  /^id_ed25519.*$/i,
  /^id_ecdsa.*$/i,
  /^id_dsa.*$/i,
  /^\.netrc$/i,
  /^\.npmrc$/i, // can contain auth tokens
  /^\.pypirc$/i,
];

/** Convenience matcher for the secret regexes. */
export function isSecretFile(basename: string): boolean {
  return SECRET_PATTERNS.some((re) => re.test(basename));
}
