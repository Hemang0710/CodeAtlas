/**
 * Centralised caps for the indexer. Bumping these is a single-file change.
 *
 * The defaults aim at "portfolio dev safety" rather than scale: we want
 * any user to be able to point CodeAtlas at a small/medium public repo
 * without blowing up our DB, embedding spend, or disk.
 */
export const INDEXER_LIMITS = {
  /** Cap on cloned repo size. Aborts the worker if exceeded. */
  MAX_REPO_BYTES: 100 * 1024 * 1024, // 100 MB

  /** Cap on individual file size. Larger files are skipped (not failed). */
  MAX_FILE_BYTES: 1 * 1024 * 1024, // 1 MB

  /** Cap on number of files in a single repo. */
  MAX_FILE_COUNT: 10_000,

  /** Hard timeout on `git clone`. */
  CLONE_TIMEOUT_MS: 60_000,

  /**
   * Per-file cap for the AST chunker. Files larger than this still get
   * inventoried in Phase 1, they just don't get chunked — parsing a 1 MB
   * minified bundle would take seconds and produce useless chunks.
   */
  MAX_PARSE_BYTES: 256 * 1024, // 256 KB

  /**
   * Chunk size policy (estimated tokens, via @/lib/token-estimate):
   *   - chunks SMALLER than MIN we try to merge with the next sibling
   *   - chunks LARGER than MAX we try to split at child boundaries
   *   - chunks BETWEEN are emitted as-is
   *
   * 100/1500 is what the roadmap specifies. Smaller chunks rank better in
   * retrieval (less dilution per match), bigger chunks carry more context
   * per LLM call. These numbers are the sweet spot we landed on.
   */
  MIN_CHUNK_TOKENS: 100,
  MAX_CHUNK_TOKENS: 1500,
} as const;
