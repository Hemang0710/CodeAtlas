import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * We mock the `ai` package's `embed` / `embedMany` so the embed helpers
 * can be exercised without a real API key. This keeps tests offline AND
 * stable across SDK / provider updates — the contract we care about is
 * the shape of inputs and the call boundary, not the internals.
 */

vi.mock("ai", () => ({
  embed: vi.fn(),
  embedMany: vi.fn(),
}));
vi.mock("@ai-sdk/google", () => ({
  google: {
    textEmbeddingModel: (id: string) => ({ __mockModelId: id }),
  },
}));

import { embed, embedMany } from "ai";
import { EMBED_BATCH_SIZE, EMBED_DIMENSIONS, embedDocuments, embedQuery } from "./embeddings";

const embedMock = embed as unknown as ReturnType<typeof vi.fn>;
const embedManyMock = embedMany as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  embedMock.mockReset();
  embedManyMock.mockReset();
});
afterEach(() => {
  vi.clearAllMocks();
});

const fakeVector = () => Array.from({ length: EMBED_DIMENSIONS }, () => Math.random());

describe("embedDocuments", () => {
  it("returns [] for empty input without calling the SDK", async () => {
    const out = await embedDocuments([]);
    expect(out).toEqual([]);
    expect(embedManyMock).not.toHaveBeenCalled();
  });

  it("splits inputs across batches of EMBED_BATCH_SIZE", async () => {
    const total = EMBED_BATCH_SIZE * 2 + 3;
    embedManyMock.mockImplementation(({ values }: { values: string[] }) =>
      Promise.resolve({ embeddings: values.map(() => fakeVector()) }),
    );

    const inputs = Array.from({ length: total }, (_, i) => `chunk-${i}`);
    const out = await embedDocuments(inputs);

    expect(out).toHaveLength(total);
    expect(embedManyMock).toHaveBeenCalledTimes(3);
  });

  it("uses RETRIEVAL_DOCUMENT task type and the pinned dimensionality", async () => {
    embedManyMock.mockResolvedValueOnce({ embeddings: [fakeVector()] });
    await embedDocuments(["one"]);
    const call = embedManyMock.mock.calls[0][0] as {
      providerOptions: { google: { outputDimensionality: number; taskType: string } };
    };
    expect(call.providerOptions.google.taskType).toBe("RETRIEVAL_DOCUMENT");
    expect(call.providerOptions.google.outputDimensionality).toBe(EMBED_DIMENSIONS);
  });
});

describe("embedQuery", () => {
  it("uses CODE_RETRIEVAL_QUERY task type", async () => {
    embedMock.mockResolvedValueOnce({ embedding: fakeVector() });
    const out = await embedQuery("where is auth");
    expect(out).toHaveLength(EMBED_DIMENSIONS);
    const call = embedMock.mock.calls[0][0] as {
      value: string;
      providerOptions: { google: { taskType: string; outputDimensionality: number } };
    };
    expect(call.value).toBe("where is auth");
    expect(call.providerOptions.google.taskType).toBe("CODE_RETRIEVAL_QUERY");
    expect(call.providerOptions.google.outputDimensionality).toBe(EMBED_DIMENSIONS);
  });
});
