/**
 * Tiny Voyage AI client for code embeddings.
 *
 * We only call one endpoint (POST /v1/embeddings) so a hand-rolled wrapper
 * is lighter than pulling in a full SDK. The interesting bits:
 *
 *   - voyage-code-3 returns 1024-dim float vectors (matches our pgvector
 *     column width). The model name is centralised in MODEL_NAME so a
 *     future provider change is a one-line edit.
 *   - Voyage caps each request at 128 inputs and ~120 000 tokens. We batch
 *     callers' inputs at BATCH_SIZE = 128 and let the caller chunk further
 *     if their inputs are large.
 *   - Retries: 429 (rate-limited) and 5xx get exponential backoff up to
 *     MAX_RETRIES. 4xx other than 429 is a permanent error and we throw.
 *   - The `input_type` flag matters for retrieval quality. We expose two
 *     functions — `embedDocuments` for things we'll search against,
 *     `embedQuery` for the user's question.
 */

const API_URL = "https://api.voyageai.com/v1/embeddings";
const MODEL_NAME = "voyage-code-3";

/** Max inputs per Voyage API request. Hard limit per their docs. */
export const VOYAGE_BATCH_SIZE = 128;

const MAX_RETRIES = 4;
const BASE_BACKOFF_MS = 500;

export type VoyageInputType = "document" | "query";

interface VoyageRequest {
  input: string[];
  model: string;
  input_type: VoyageInputType;
  output_dimension?: number;
  truncation?: boolean;
}

interface VoyageEmbeddingItem {
  embedding: number[];
  index: number;
  object: "embedding";
}

interface VoyageResponse {
  data: VoyageEmbeddingItem[];
  model: string;
  usage: { total_tokens: number };
}

export class VoyageClient {
  constructor(private readonly apiKey: string) {
    if (!apiKey) {
      throw new Error(
        "VOYAGE_API_KEY is not set. See TODO.md step 6 for how to grab one.",
      );
    }
  }

  static fromEnv(): VoyageClient {
    const key = process.env.VOYAGE_API_KEY ?? "";
    return new VoyageClient(key);
  }

  /** Embed corpus inputs — chunks we'll later search against. */
  async embedDocuments(inputs: string[]): Promise<number[][]> {
    return this.embedBatched(inputs, "document");
  }

  /** Embed a single search query. Voyage uses input_type to weight tokens. */
  async embedQuery(query: string): Promise<number[]> {
    const result = await this.embedBatched([query], "query");
    return result[0];
  }

  /**
   * Splits `inputs` into batches of VOYAGE_BATCH_SIZE and concatenates the
   * results in input order. Each batch is a separate API call.
   */
  private async embedBatched(
    inputs: string[],
    inputType: VoyageInputType,
  ): Promise<number[][]> {
    const out: number[][] = new Array(inputs.length);
    for (let i = 0; i < inputs.length; i += VOYAGE_BATCH_SIZE) {
      const batch = inputs.slice(i, i + VOYAGE_BATCH_SIZE);
      const vectors = await this.callOnce(batch, inputType);
      for (let j = 0; j < vectors.length; j++) {
        out[i + j] = vectors[j];
      }
    }
    return out;
  }

  private async callOnce(
    inputs: string[],
    inputType: VoyageInputType,
  ): Promise<number[][]> {
    const body: VoyageRequest = {
      input: inputs,
      model: MODEL_NAME,
      input_type: inputType,
      // 1024 is the default for voyage-code-3 anyway, but we pin it so a
      // future model change can't silently widen our pgvector column.
      output_dimension: 1024,
      // Documentation: voyage will truncate inputs longer than the model's
      // context window when truncation: true. We accept that trade-off so
      // an oversize chunk doesn't crash a whole batch.
      truncation: true,
    };

    let lastErr: Error | null = null;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const res = await fetch(API_URL, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        });

        if (res.status === 429 || res.status >= 500) {
          // Retry-After (if present) wins over our backoff schedule.
          const retryAfter = Number(res.headers.get("retry-after"));
          const delayMs =
            Number.isFinite(retryAfter) && retryAfter > 0
              ? retryAfter * 1000
              : backoffMs(attempt);
          lastErr = new Error(
            `Voyage ${res.status}: ${(await res.text()).slice(0, 200)}`,
          );
          if (attempt < MAX_RETRIES) {
            await sleep(delayMs);
            continue;
          }
          throw lastErr;
        }

        if (!res.ok) {
          // 4xx other than 429 is a permanent error (bad API key, malformed
          // body, oversized input). No retry.
          throw new Error(
            `Voyage ${res.status}: ${(await res.text()).slice(0, 500)}`,
          );
        }

        const json = (await res.json()) as VoyageResponse;
        // The API returns items with a sortable `index` — defensive sort
        // in case ordering ever changes.
        const sorted = [...json.data].sort((a, b) => a.index - b.index);
        return sorted.map((item) => item.embedding);
      } catch (err) {
        if (
          attempt < MAX_RETRIES &&
          err instanceof TypeError /* fetch network error */
        ) {
          lastErr = err;
          await sleep(backoffMs(attempt));
          continue;
        }
        throw err;
      }
    }
    throw lastErr ?? new Error("Voyage embed: unknown failure");
  }
}

function backoffMs(attempt: number): number {
  // 500 ms, 1 s, 2 s, 4 s, with jitter.
  const exp = BASE_BACKOFF_MS * Math.pow(2, attempt);
  const jitter = Math.random() * 200;
  return exp + jitter;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
