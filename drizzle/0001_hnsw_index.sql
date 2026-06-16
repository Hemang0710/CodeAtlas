-- HNSW index on chunks.embedding for fast cosine-similarity top-k search.
--
-- - `vector_cosine_ops` is the right operator class because we use the
--   `<=>` cosine-distance operator at query time.
-- - We don't tune `m`/`ef_construction` yet; the defaults (m=16, ef=64)
--   are fine for hundreds of thousands of chunks. We'll revisit when the
--   corpus passes a few million.
-- - `IF NOT EXISTS` makes the migration idempotent.
-- - The index only covers non-NULL rows. Before Phase 3 embeddings land,
--   the index is effectively empty, which is exactly what we want.
CREATE INDEX IF NOT EXISTS chunks_embedding_hnsw_idx
  ON chunks
  USING hnsw (embedding vector_cosine_ops);
