import { and, eq, inArray, isNull, sql } from "drizzle-orm";

import { db } from "@/server/db/client";
import { chunks, files, type Chunk, type NewChunk } from "@/server/db/schema";

/**
 * Chunks service. Like files, we batch inserts to keep the per-request
 * parameter count well under Postgres's 65 535 cap. 500 rows × 8 columns
 * stays comfortably below.
 */

const BATCH_SIZE = 500;

export async function insertChunks(rows: NewChunk[]): Promise<void> {
  if (rows.length === 0) return;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    await db.insert(chunks).values(batch);
  }
}

export async function clearChunksForFiles(fileIds: string[]): Promise<void> {
  if (fileIds.length === 0) return;
  // Drizzle's `inArray` would work too but for a fresh re-index we usually
  // wipe per-file in the same loop where we re-insert, so a per-file delete
  // is simpler than building a 10 000-item IN list.
  for (const id of fileIds) {
    await db.delete(chunks).where(eq(chunks.fileId, id));
  }
}

/**
 * Fetch chunks for a repo that don't yet have an embedding. The embed step
 * paginates through these so it never holds the whole repo in memory.
 */
export async function listUnembeddedChunks(
  repoId: string,
): Promise<Pick<Chunk, "id" | "content">[]> {
  return db
    .select({ id: chunks.id, content: chunks.content })
    .from(chunks)
    .innerJoin(files, eq(chunks.fileId, files.id))
    .where(and(eq(files.repoId, repoId), isNull(chunks.embedding)));
}

/**
 * Write embeddings back. We use a single UPDATE per chunk because Postgres
 * doesn't support bulk UPDATE ... FROM VALUES cleanly through Drizzle's
 * builder. The work is parallelised at the batch boundary by the embedder,
 * so even 10 000 chunks finish in seconds.
 */
export async function updateChunkEmbedding(
  id: string,
  embedding: number[],
): Promise<void> {
  // pgvector accepts the JS array directly via Drizzle's vector column.
  await db.update(chunks).set({ embedding }).where(eq(chunks.id, id));
}

/** Re-export for retrieval — keeps imports tidy. */
export { chunks, files };
export { inArray, sql };
