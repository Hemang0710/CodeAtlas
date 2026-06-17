import { google } from "@ai-sdk/google";
import { embed, embedMany } from "ai";

/**
 * Code embeddings via Gemini `gemini-embedding-001`.
 *
 * Two reasons this lives behind helpers rather than calling the Vercel AI
 * SDK directly at each call site:
 *
 *   1. We pin the model id and the output dimensionality in ONE place. The
 *      DB's `chunks.embedding` column is `vector(1024)`. If we ever bump
 *      that, only this file changes.
 *   2. The two call sites — embed a corpus document vs embed a search
 *      query — want different `taskType` values. Gemini's embeddings are
 *      task-conditioned, so getting this right matters for recall.
 *
 * Free tier on Google AI Studio: ~100 RPM for `gemini-embedding-001`,
 * 1500 RPD, no credit card required. Plenty for portfolio dev.
 */

const MODEL_ID = "gemini-embedding-001";

/**
 * Output dimensionality we ask Gemini for. The model is Matryoshka, so it
 * can emit 768 / 1024 / 1536 / 3072 dim vectors; we pin 1024 so we don't
 * have to migrate the existing pgvector column.
 */
export const EMBED_DIMENSIONS = 1024;

/**
 * Conservative request batch size. Gemini accepts up to 100 inputs per
 * call but the free tier rate limit kicks in faster. 32 strikes a
 * balance: enough that big repos finish in a reasonable wall-clock time,
 * small enough that one slow-fail doesn't waste a lot of work.
 */
const BATCH_SIZE = 32;

/**
 * Embed a corpus of code chunks. Used by the indexer. The AI SDK handles
 * batching internally; we still loop in groups so progress callbacks
 * have something to report on.
 */
export async function embedDocuments(inputs: string[]): Promise<number[][]> {
  if (inputs.length === 0) return [];
  const out: number[][] = new Array(inputs.length);
  for (let i = 0; i < inputs.length; i += BATCH_SIZE) {
    const batch = inputs.slice(i, i + BATCH_SIZE);
    const { embeddings } = await embedMany({
      model: google.textEmbeddingModel(MODEL_ID),
      values: batch,
      providerOptions: {
        google: {
          outputDimensionality: EMBED_DIMENSIONS,
          taskType: "RETRIEVAL_DOCUMENT",
        },
      },
      maxRetries: 3,
    });
    for (let j = 0; j < embeddings.length; j++) {
      out[i + j] = embeddings[j];
    }
  }
  return out;
}

/**
 * Embed a single search query. `CODE_RETRIEVAL_QUERY` is Gemini's task
 * type purpose-built for "natural-language or identifier query against a
 * code corpus" — sharper than generic `RETRIEVAL_QUERY` for our use.
 */
export async function embedQuery(query: string): Promise<number[]> {
  const { embedding } = await embed({
    model: google.textEmbeddingModel(MODEL_ID),
    value: query,
    providerOptions: {
      google: {
        outputDimensionality: EMBED_DIMENSIONS,
        taskType: "CODE_RETRIEVAL_QUERY",
      },
    },
    maxRetries: 3,
  });
  return embedding;
}

/** Re-export for callers checking batch boundaries (currently just embed.ts). */
export const EMBED_BATCH_SIZE = BATCH_SIZE;
