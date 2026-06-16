import { eq } from "drizzle-orm";

import { db } from "@/server/db/client";
import { fileEdges, files, type NewFileEdge } from "@/server/db/schema";

/**
 * File-edge service.
 *
 * Edges are de-duped at the column level by a UNIQUE constraint on
 * (source_file_id, target_file_id, edge_type). Doing the dedupe in the DB
 * lets us keep the writer dumb — we just insert and tolerate conflicts.
 */

const BATCH_SIZE = 500;

export async function insertEdges(rows: NewFileEdge[]): Promise<void> {
  if (rows.length === 0) return;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    await db.insert(fileEdges).values(batch).onConflictDoNothing();
  }
}

/**
 * Wipe edges where either endpoint belongs to a given repo. Used during
 * re-indexing so stale edges from an old version of the repo don't linger.
 *
 * Implementation note: file_edges doesn't carry repo_id itself, but every
 * file belongs to exactly one repo, so a sub-select on file ids is enough.
 */
export async function clearEdgesForRepo(repoId: string): Promise<void> {
  // We do this in two passes via the source side. Because of the cascade
  // on `files`, edges where source belongs to this repo are matched by a
  // join through `files`.
  const fileIds = (
    await db
      .select({ id: files.id })
      .from(files)
      .where(eq(files.repoId, repoId))
  ).map((r) => r.id);

  if (fileIds.length === 0) return;
  for (const id of fileIds) {
    // Delete edges originating at any of these files. Edges with a target
    // in this repo and source elsewhere don't exist in our world (single-
    // repo edges only) so this is sufficient.
    await db.delete(fileEdges).where(eq(fileEdges.sourceFileId, id));
  }
}
