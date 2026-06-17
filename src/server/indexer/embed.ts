import {
  listUnembeddedChunks,
  updateChunkEmbedding,
} from "@/server/services/chunks";
import { EMBED_BATCH_SIZE, embedDocuments } from "@/lib/embeddings";

/**
 * Embed every chunk in a repo that doesn't already have an embedding.
 *
 * The query in `listUnembeddedChunks` returns only NULL-embedding rows, so
 * this function is the natural "incremental" step: re-running it on the
 * same repo is a no-op once everything's covered. That falls out for free
 * from the skip-unchanged-files diff in `ingest.ts` — unchanged files keep
 * their old chunks (with embeddings intact), so only newly-inserted chunks
 * need work.
 *
 * `onProgress(done, total)` is invoked at each batch boundary so the
 * caller can push job.progress to the UI.
 */
export async function embedRepoChunks(
  repoId: string,
  options?: { onProgress?: (done: number, total: number) => Promise<void> | void },
): Promise<{ embedded: number }> {
  const pending = await listUnembeddedChunks(repoId);
  if (pending.length === 0) return { embedded: 0 };

  let done = 0;
  for (let i = 0; i < pending.length; i += EMBED_BATCH_SIZE) {
    const batch = pending.slice(i, i + EMBED_BATCH_SIZE);
    const inputs = batch.map((c) => c.content);
    const vectors = await embedDocuments(inputs);

    // Parallel writes are safe — each row is independent.
    await Promise.all(
      batch.map((chunk, idx) => updateChunkEmbedding(chunk.id, vectors[idx])),
    );

    done += batch.length;
    await options?.onProgress?.(done, pending.length);
  }
  return { embedded: done };
}
