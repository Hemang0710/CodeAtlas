import { and, eq, sql } from "drizzle-orm";

import { db } from "@/server/db/client";
import { chunks, files } from "@/server/db/schema";

/**
 * Keyword (full-text) retrieval over a repo's chunks.
 *
 * Uses Postgres' `tsvector` column added in migration 0002. Two notable bits:
 *
 *   - We use `websearch_to_tsquery` rather than plain `to_tsquery` so user
 *     input like `"login flow" OR session` is parsed without us writing a
 *     mini-tokenizer. Mismatched quotes etc. don't blow up the query.
 *   - We rank with `ts_rank_cd` (cover-density), which weights documents
 *     by how close the matching terms are AND honours the `setweight`
 *     applied to `symbol_name` vs `content` in the migration. Net effect:
 *     a chunk where the symbol name IS the searched term outranks one
 *     that just mentions it.
 */

export interface KeywordHit {
  chunkId: string;
  fileId: string;
  filePath: string;
  symbolName: string | null;
  symbolType: string;
  startLine: number;
  endLine: number;
  content: string;
  score: number;
}

export async function keywordSearch(args: {
  repoId: string;
  query: string;
  k?: number;
}): Promise<KeywordHit[]> {
  const k = args.k ?? 10;
  // websearch_to_tsquery handles user-shaped input — phrase quoting, `OR`,
  // negation with `-`, etc. The parameter is bound, not interpolated.
  const tsquery = sql`websearch_to_tsquery('english', ${args.query})`;
  // ts_rank_cd takes the tsvector column and the tsquery; we cast `tsv` so
  // Drizzle can mention the column it doesn't know about by raw name.
  const rankExpr = sql<number>`ts_rank_cd(${chunks}.tsv, ${tsquery})`;

  const rows = await db
    .select({
      chunkId: chunks.id,
      fileId: chunks.fileId,
      filePath: files.path,
      symbolName: chunks.symbolName,
      symbolType: chunks.symbolType,
      startLine: chunks.startLine,
      endLine: chunks.endLine,
      content: chunks.content,
      score: rankExpr,
    })
    .from(chunks)
    .innerJoin(files, eq(chunks.fileId, files.id))
    .where(
      and(
        eq(files.repoId, args.repoId),
        // Filter to rows that actually match at all so the orderBy has
        // meaningful values.
        sql`${chunks}.tsv @@ ${tsquery}`,
      ),
    )
    .orderBy(sql`${rankExpr} desc`)
    .limit(k);

  return rows.map((r) => ({
    chunkId: r.chunkId,
    fileId: r.fileId,
    filePath: r.filePath,
    symbolName: r.symbolName,
    symbolType: r.symbolType,
    startLine: r.startLine,
    endLine: r.endLine,
    content: r.content,
    score: Number(r.score),
  }));
}
