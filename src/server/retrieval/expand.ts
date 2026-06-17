import { and, asc, eq, inArray, notInArray, or, sql } from "drizzle-orm";

import { db } from "@/server/db/client";
import { chunks, fileEdges, files } from "@/server/db/schema";

import type { HybridHit } from "./hybrid";

/**
 * Take a set of primary hits and pad it with related context:
 *
 *   1. Sibling chunks — same file, nearby in line range. A class spread
 *      across several methods often has its useful context one chunk over.
 *   2. 1-hop graph neighbours — files that the hit's file imports or is
 *      imported by (via file_edges). We add up to one chunk per neighbour
 *      file, preferring the smallest `start_line` (usually module-level
 *      imports/exports — high signal for "what's in this module").
 *
 * Returned hits keep the original `HybridHit` shape but with `source =
 * "expanded"` so callers can show "related" badges. The original primary
 * hits come back unchanged at the top of the list.
 */

export type ExpandedHit = HybridHit | (Omit<HybridHit, "source"> & { source: "expanded" });

export async function expandHits(args: {
  repoId: string;
  hits: HybridHit[];
  /** How many extra context chunks to add per primary hit. */
  perHit?: number;
}): Promise<ExpandedHit[]> {
  const perHit = args.perHit ?? 3;
  if (args.hits.length === 0) return [];

  const primaryChunkIds = new Set(args.hits.map((h) => h.chunkId));
  const primaryFileIds = Array.from(new Set(args.hits.map((h) => h.fileId)));

  const [siblings, neighbours] = await Promise.all([
    fetchSiblings(args.repoId, primaryFileIds, primaryChunkIds, perHit),
    fetchNeighbours(args.repoId, primaryFileIds, primaryChunkIds, perHit),
  ]);

  // Stable concat: primaries first (preserve RRF order), then siblings,
  // then neighbours. Caller can paginate / cap downstream.
  return [...args.hits, ...siblings, ...neighbours];
}

async function fetchSiblings(
  _repoId: string,
  fileIds: string[],
  excludeChunks: Set<string>,
  perFile: number,
): Promise<ExpandedHit[]> {
  if (fileIds.length === 0) return [];

  // Postgres `row_number() OVER (PARTITION BY file_id ORDER BY start_line)`
  // lets us take N per file in one query. We then filter to top-N
  // outside (cleaner than window-only filtering, and Drizzle-friendly).
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
    })
    .from(chunks)
    .innerJoin(files, eq(chunks.fileId, files.id))
    .where(
      and(
        inArray(chunks.fileId, fileIds),
        excludeChunks.size > 0
          ? notInArray(chunks.id, Array.from(excludeChunks))
          : sql`true`,
      ),
    )
    .orderBy(asc(chunks.fileId), asc(chunks.startLine));

  const perFileSeen = new Map<string, number>();
  const out: ExpandedHit[] = [];
  for (const r of rows) {
    const seen = perFileSeen.get(r.fileId) ?? 0;
    if (seen >= perFile) continue;
    perFileSeen.set(r.fileId, seen + 1);
    out.push({
      chunkId: r.chunkId,
      fileId: r.fileId,
      filePath: r.filePath,
      symbolName: r.symbolName,
      symbolType: r.symbolType,
      startLine: r.startLine,
      endLine: r.endLine,
      content: r.content,
      score: 0,
      source: "expanded",
      vectorRank: null,
      keywordRank: null,
    });
  }
  return out;
}

async function fetchNeighbours(
  _repoId: string,
  fileIds: string[],
  excludeChunks: Set<string>,
  perFile: number,
): Promise<ExpandedHit[]> {
  if (fileIds.length === 0) return [];

  // 1-hop: file_edges where source OR target is one of our primary file ids.
  // Either direction counts as a connection.
  const edges = await db
    .select({
      source: fileEdges.sourceFileId,
      target: fileEdges.targetFileId,
    })
    .from(fileEdges)
    .where(
      or(
        inArray(fileEdges.sourceFileId, fileIds),
        inArray(fileEdges.targetFileId, fileIds),
      ),
    );

  const neighbourIds = new Set<string>();
  const primarySet = new Set(fileIds);
  for (const e of edges) {
    if (!primarySet.has(e.source)) neighbourIds.add(e.source);
    if (!primarySet.has(e.target)) neighbourIds.add(e.target);
  }
  if (neighbourIds.size === 0) return [];

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
    })
    .from(chunks)
    .innerJoin(files, eq(chunks.fileId, files.id))
    .where(
      and(
        inArray(chunks.fileId, Array.from(neighbourIds)),
        excludeChunks.size > 0
          ? notInArray(chunks.id, Array.from(excludeChunks))
          : sql`true`,
      ),
    )
    .orderBy(asc(chunks.fileId), asc(chunks.startLine));

  const perFileSeen = new Map<string, number>();
  const out: ExpandedHit[] = [];
  for (const r of rows) {
    const seen = perFileSeen.get(r.fileId) ?? 0;
    if (seen >= perFile) continue;
    perFileSeen.set(r.fileId, seen + 1);
    out.push({
      chunkId: r.chunkId,
      fileId: r.fileId,
      filePath: r.filePath,
      symbolName: r.symbolName,
      symbolType: r.symbolType,
      startLine: r.startLine,
      endLine: r.endLine,
      content: r.content,
      score: 0,
      source: "expanded",
      vectorRank: null,
      keywordRank: null,
    });
  }
  return out;
}
