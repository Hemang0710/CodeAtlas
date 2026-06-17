-- Full-text search column for chunks.
--
-- A STORED generated column means Postgres computes the tsvector once at
-- insert/update time and persists it; reads (the hot path) hit it directly.
-- The trade-off is a tiny storage increase per row.
--
-- We weight `symbol_name` higher than `content` so that searching for an
-- exact identifier prefers chunks where that name IS the symbol, not just
-- chunks that mention it in passing. The 'A'/'B' setweight values plug
-- into `ts_rank_cd` at query time.
ALTER TABLE chunks
  ADD COLUMN IF NOT EXISTS tsv tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(symbol_name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(content, '')), 'B')
  ) STORED;
--> statement-breakpoint
-- GIN is the right index for tsvector full-text search.
CREATE INDEX IF NOT EXISTS chunks_tsv_gin_idx
  ON chunks
  USING GIN (tsv);
