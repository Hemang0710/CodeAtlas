import { embedQuery } from "@/lib/embeddings";

import { keywordSearch, type KeywordHit } from "./keyword";
import { vectorSearch, type VectorHit } from "./vector";

/**
 * Hybrid retrieval: run vector + keyword in parallel, fuse with RRF.
 *
 * Reciprocal Rank Fusion (RRF):
 *     score(item) = Σ over rankers   1 / (RRF_K + rank_in_that_ranker)
 *
 * That's all. We deliberately ignore the raw scores from each ranker —
 * they're on incompatible scales (cosine similarity vs ts_rank_cd) and
 * normalising them is a tar pit. Rank positions ARE on the same scale.
 *
 * RRF_K is the standard constant (Cormack, Clarke, Büttcher, 2009).
 * Bigger K flattens differences between top ranks; smaller K rewards
 * sitting at #1 more heavily.
 */

export const RRF_K = 60;

export interface HybridHit {
  chunkId: string;
  fileId: string;
  filePath: string;
  symbolName: string | null;
  symbolType: string;
  startLine: number;
  endLine: number;
  content: string;
  /** Combined RRF score — higher is better. Don't display as a probability. */
  score: number;
  /** Where this hit came from. "both" means it ranked in both lists. */
  source: "vector" | "keyword" | "both";
  /** 1-based rank in the vector list, or null if it didn't appear. */
  vectorRank: number | null;
  /** 1-based rank in the keyword list, or null if it didn't appear. */
  keywordRank: number | null;
}

/**
 * Fuse two ranked lists. Pure function — no DB or network — so easy to test.
 *
 * Both inputs must be in their own ranked order (best first). Output is in
 * RRF order, best first, capped at `topK`.
 */
export function reciprocalRankFusion(args: {
  vectorHits: VectorHit[];
  keywordHits: KeywordHit[];
  k?: number;
  topK?: number;
}): HybridHit[] {
  const k = args.k ?? RRF_K;
  const topK = args.topK ?? 10;

  type Acc = {
    hit: VectorHit | KeywordHit;
    vectorRank: number | null;
    keywordRank: number | null;
    score: number;
  };
  const merged = new Map<string, Acc>();

  args.vectorHits.forEach((hit, i) => {
    const rank = i + 1;
    const term = 1 / (k + rank);
    merged.set(hit.chunkId, {
      hit,
      vectorRank: rank,
      keywordRank: null,
      score: term,
    });
  });

  args.keywordHits.forEach((hit, i) => {
    const rank = i + 1;
    const term = 1 / (k + rank);
    const existing = merged.get(hit.chunkId);
    if (existing) {
      existing.keywordRank = rank;
      existing.score += term;
      // Prefer the vector copy's content (identical here, but defensively).
    } else {
      merged.set(hit.chunkId, {
        hit,
        vectorRank: null,
        keywordRank: rank,
        score: term,
      });
    }
  });

  const fused: HybridHit[] = [...merged.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map(({ hit, vectorRank, keywordRank, score }) => ({
      chunkId: hit.chunkId,
      fileId: hit.fileId,
      filePath: hit.filePath,
      symbolName: hit.symbolName,
      symbolType: hit.symbolType,
      startLine: hit.startLine,
      endLine: hit.endLine,
      content: hit.content,
      score,
      source:
        vectorRank !== null && keywordRank !== null
          ? "both"
          : vectorRank !== null
            ? "vector"
            : "keyword",
      vectorRank,
      keywordRank,
    }));

  return fused;
}

/**
 * End-to-end hybrid search. Embeds the query, runs both retrievers in
 * parallel, fuses. We over-fetch from each retriever (RECALL_K) so RRF has
 * enough overlap to work with, then cap the output at `topK`.
 */
export async function hybridSearch(args: {
  repoId: string;
  query: string;
  topK?: number;
}): Promise<HybridHit[]> {
  const topK = args.topK ?? 10;
  const recallK = Math.max(topK * 3, 20);

  const queryEmbedding = await embedQuery(args.query);

  const [vectorHits, keywordHits] = await Promise.all([
    vectorSearch({ repoId: args.repoId, queryEmbedding, k: recallK }),
    keywordSearch({ repoId: args.repoId, query: args.query, k: recallK }),
  ]);

  return reciprocalRankFusion({ vectorHits, keywordHits, topK });
}
