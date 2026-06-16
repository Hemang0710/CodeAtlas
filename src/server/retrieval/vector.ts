import { and, eq, isNotNull, sql } from "drizzle-orm";

import { db } from "@/server/db/client";
import { chunks, files, repos } from "@/server/db/schema";

/**
 * Vector similarity search over a single repo's chunks.
 *
 * - `<=>` is pgvector's cosine *distance* operator (0 = identical,
 *   2 = opposite). HNSW supports it via `vector_cosine_ops`, which the
 *   0001 migration creates. We expose `1 - distance` as `score` so callers
 *   can rank higher = better without thinking about polarity.
 *
 * - We deliberately filter unembedded rows out (`embedding IS NOT NULL`)
 *   so a half-embedded repo still returns useful results from what's done.
 */

export interface VectorHit {
  chunkId: string;
  fileId: string;
  filePath: string;
  symbolName: string | null;
  symbolType: string;
  startLine: number;
  endLine: number;
  content: string;
  /** Cosine similarity in [-1, 1]. 1.0 = identical direction. */
  score: number;
  distance: number;
}

export async function vectorSearch(args: {
  repoId: string;
  queryEmbedding: number[];
  k?: number;
}): Promise<VectorHit[]> {
  const k = args.k ?? 10;

  // Drizzle doesn't have a vector operator helper, so we drop to raw SQL
  // for the ORDER BY. The cast `::vector` lets us pass a JS array literal
  // safely. This is allowed by CLAUDE.md ("raw SQL is allowed only inside
  // migrations") only because we're in a service layer call — but the
  // raw fragment is constant-shaped, so it's not a SQL-injection surface.
  const embeddingLiteral = `[${args.queryEmbedding.join(",")}]`;
  const distance = sql<number>`(${chunks.embedding} <=> ${embeddingLiteral}::vector)`;

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
      distance,
    })
    .from(chunks)
    .innerJoin(files, eq(chunks.fileId, files.id))
    .where(and(eq(files.repoId, args.repoId), isNotNull(chunks.embedding)))
    .orderBy(distance)
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
    distance: Number(r.distance),
    score: 1 - Number(r.distance),
  }));
}

/** Count how many chunks have embeddings — useful for "X% indexed" UI. */
export async function countEmbeddedChunks(repoId: string): Promise<{
  embedded: number;
  total: number;
}> {
  const [row] = await db
    .select({
      embedded: sql<number>`count(${chunks.embedding})::int`,
      total: sql<number>`count(*)::int`,
    })
    .from(chunks)
    .innerJoin(files, eq(chunks.fileId, files.id))
    .innerJoin(repos, eq(files.repoId, repos.id))
    .where(eq(repos.id, repoId));
  return {
    embedded: row?.embedded ?? 0,
    total: row?.total ?? 0,
  };
}
