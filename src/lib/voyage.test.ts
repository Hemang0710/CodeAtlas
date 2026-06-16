import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { VOYAGE_BATCH_SIZE, VoyageClient } from "./voyage";

/**
 * The Voyage client is the most failure-prone surface in Phase 3: network
 * errors, 429s, batch boundaries. We mock global `fetch` and inspect what
 * the client actually does.
 */

const originalFetch = globalThis.fetch;

beforeEach(() => {
  globalThis.fetch = vi.fn() as unknown as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

function mockOnce(body: object, status = 200, headers: Record<string, string> = {}) {
  const fetchMock = globalThis.fetch as unknown as {
    mockResolvedValueOnce: (value: Response) => void;
  };
  fetchMock.mockResolvedValueOnce(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json", ...headers },
    }),
  );
}

function makeEmbeddingResponse(count: number, dims = 4) {
  const data = Array.from({ length: count }, (_, i) => ({
    object: "embedding" as const,
    index: i,
    embedding: Array.from({ length: dims }, () => Math.random()),
  }));
  return { data, model: "voyage-code-3", usage: { total_tokens: count * 10 } };
}

describe("VoyageClient", () => {
  it("throws if no API key is supplied", () => {
    expect(() => new VoyageClient("")).toThrow();
  });

  it("batches inputs at VOYAGE_BATCH_SIZE", async () => {
    const inputs = Array.from({ length: VOYAGE_BATCH_SIZE * 2 + 5 }, (_, i) => `x${i}`);
    mockOnce(makeEmbeddingResponse(VOYAGE_BATCH_SIZE));
    mockOnce(makeEmbeddingResponse(VOYAGE_BATCH_SIZE));
    mockOnce(makeEmbeddingResponse(5));

    const client = new VoyageClient("k");
    const out = await client.embedDocuments(inputs);
    expect(out).toHaveLength(inputs.length);
    expect(globalThis.fetch).toHaveBeenCalledTimes(3);
  });

  it("uses input_type=query for query embeddings", async () => {
    mockOnce(makeEmbeddingResponse(1));
    const client = new VoyageClient("k");
    await client.embedQuery("where is auth");

    const fetchMock = globalThis.fetch as unknown as {
      mock: { calls: [string, RequestInit][] };
    };
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string) as {
      input_type: string;
      input: string[];
    };
    expect(body.input_type).toBe("query");
    expect(body.input).toEqual(["where is auth"]);
  });

  it("retries on 429 then succeeds", async () => {
    const fetchMock = globalThis.fetch as unknown as {
      mockResolvedValueOnce: (value: Response) => void;
    };
    // First call: 429 with no retry-after — should still trigger backoff.
    fetchMock.mockResolvedValueOnce(
      new Response("rate limited", { status: 429 }),
    );
    // Second call: success.
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(makeEmbeddingResponse(1)), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const client = new VoyageClient("k");
    const out = await client.embedDocuments(["one"]);
    expect(out).toHaveLength(1);
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it("does not retry on 400 (permanent error)", async () => {
    const fetchMock = globalThis.fetch as unknown as {
      mockResolvedValueOnce: (value: Response) => void;
    };
    fetchMock.mockResolvedValueOnce(
      new Response("bad body", { status: 400 }),
    );
    const client = new VoyageClient("k");
    await expect(client.embedDocuments(["x"])).rejects.toThrow(/Voyage 400/);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });
});
