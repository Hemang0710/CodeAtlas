/**
 * Rough token count for a piece of source code.
 *
 * "Real" tokenization is per-model (voyage-code-3 uses a BPE close to GPT's
 * cl100k) and we only need an estimate to drive merge/split decisions in
 * the chunker. The chars/4 heuristic is the same one OpenAI publishes for
 * English prose; for source code it's a slight overestimate (lots of
 * single-char tokens) but it's directionally right and costs nothing.
 *
 * Phase 3 swaps in the real tokenizer when we actually call the embedding
 * API — we don't need it yet.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
