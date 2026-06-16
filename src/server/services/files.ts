import { asc, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/server/db/client";
import { files, type FileRow, type NewFileRow } from "@/server/db/schema";

/**
 * File-row service.
 *
 * `upsertFiles` is the only write surface. We insert in batches of 500 so a
 * 10k-file repo stays under Postgres' parameter-per-statement limit and
 * doesn't pin the connection for too long.
 */

const BATCH_SIZE = 500;

export async function upsertFiles(rows: NewFileRow[]): Promise<void> {
  if (rows.length === 0) return;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    await db
      .insert(files)
      .values(batch)
      .onConflictDoUpdate({
        target: [files.repoId, files.path],
        set: {
          language: sql`excluded.language`,
          contentHash: sql`excluded.content_hash`,
          sizeBytes: sql`excluded.size_bytes`,
        },
      });
  }
}

/**
 * Existing files for a repo, returned as a path → {id, contentHash} map.
 * Used by the ingester to diff against the new walk: files whose hash
 * matches a known row don't need re-chunking or re-embedding.
 */
export async function getExistingFilesMap(
  repoId: string,
): Promise<Map<string, { id: string; contentHash: string }>> {
  const rows = await db
    .select({
      id: files.id,
      path: files.path,
      contentHash: files.contentHash,
    })
    .from(files)
    .where(eq(files.repoId, repoId));
  const out = new Map<string, { id: string; contentHash: string }>();
  for (const r of rows) {
    out.set(r.path, { id: r.id, contentHash: r.contentHash });
  }
  return out;
}

/**
 * Delete a list of files by id. Used by ingest to remove files that
 * disappeared upstream. Chunks and edges cascade through ON DELETE.
 */
export async function deleteFilesByIds(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  for (let i = 0; i < ids.length; i += 500) {
    const slice = ids.slice(i, i + 500);
    await db.delete(files).where(inArray(files.id, slice));
  }
}

/**
 * Two lookups the indexer needs after the main file insert:
 *   - the list itself (for chunking)
 *   - a path → id map (for resolving import edges)
 *
 * Doing both in one query (and building the map client-side) keeps the
 * worker's DB round-trips down.
 */
export async function getFilesForRepoIndexed(
  repoId: string,
): Promise<{ files: FileRow[]; pathToId: Map<string, string> }> {
  const rows = await db
    .select()
    .from(files)
    .where(eq(files.repoId, repoId))
    .orderBy(asc(files.path));
  const pathToId = new Map<string, string>();
  for (const r of rows) pathToId.set(r.path, r.id);
  return { files: rows, pathToId };
}

export async function listFilesForRepo(repoId: string): Promise<FileRow[]> {
  return db
    .select()
    .from(files)
    .where(eq(files.repoId, repoId))
    .orderBy(asc(files.path));
}

export async function countFilesForRepo(repoId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(files)
    .where(eq(files.repoId, repoId));
  return row?.count ?? 0;
}

/**
 * Wipe files for a repo before a re-index. We don't strictly need this
 * (the upsert handles updates) but if the new index has fewer files —
 * e.g. someone deleted a directory upstream — the stale rows would linger.
 */
export async function clearFilesForRepo(repoId: string): Promise<void> {
  await db.delete(files).where(eq(files.repoId, repoId));
}
