import { describe, expect, it } from "vitest";

import { reciprocalRankFusion, RRF_K } from "./hybrid";
import type { KeywordHit } from "./keyword";
import type { VectorHit } from "./vector";

/**
 * RRF is a small bit of math but it's load-bearing — the whole DoD for
 * Phase 4 hangs on it. We lock in the formula and the corner cases here.
 */

function v(id: string, n = 0): VectorHit {
  return {
    chunkId: id,
    fileId: "f",
    filePath: "p",
    symbolName: id,
    symbolType: "function",
    startLine: n + 1,
    endLine: n + 10,
    content: id,
    distance: 0,
    score: 0,
  };
}
function k(id: string, n = 0): KeywordHit {
  return {
    chunkId: id,
    fileId: "f",
    filePath: "p",
    symbolName: id,
    symbolType: "function",
    startLine: n + 1,
    endLine: n + 10,
    content: id,
    score: 0,
  };
}

describe("reciprocalRankFusion", () => {
  it("rewards items that appear in both rankings", () => {
    // vector: A B C   keyword: B A D
    const fused = reciprocalRankFusion({
      vectorHits: [v("A"), v("B"), v("C")],
      keywordHits: [k("B"), k("A"), k("D")],
    });
    const idsInOrder = fused.map((f) => f.chunkId);
    // A and B both appear in both lists — they should come first.
    expect(idsInOrder.slice(0, 2).sort()).toEqual(["A", "B"]);
    // C and D each appear in only one list.
    expect(idsInOrder.slice(2)).toEqual(expect.arrayContaining(["C", "D"]));
  });

  it("computes scores exactly via 1/(k+rank)", () => {
    const fused = reciprocalRankFusion({
      vectorHits: [v("X")],
      keywordHits: [k("X")],
    });
    const expected = 1 / (RRF_K + 1) + 1 / (RRF_K + 1);
    expect(fused[0].score).toBeCloseTo(expected, 10);
    expect(fused[0].source).toBe("both");
    expect(fused[0].vectorRank).toBe(1);
    expect(fused[0].keywordRank).toBe(1);
  });

  it("solves the exact-identifier failure mode (keyword high, vector low)", () => {
    // Vector misranks the identifier at #15; keyword finds it at #1.
    // A different result is #1 in vector but missing in keyword.
    const vectorHits = [
      v("other"),
      ...Array.from({ length: 13 }, (_, i) => v(`pad${i}`)),
      v("createCheckoutSession"),
    ];
    const keywordHits = [k("createCheckoutSession")];

    const fused = reciprocalRankFusion({
      vectorHits,
      keywordHits,
      topK: 3,
    });

    // RRF for "createCheckoutSession": 1/(60+15) + 1/(60+1) ≈ 0.0297
    // RRF for "other":                  1/(60+1) ≈ 0.0164
    expect(fused[0].chunkId).toBe("createCheckoutSession");
    expect(fused[0].source).toBe("both");
  });

  it("marks single-list hits with the correct source", () => {
    const fused = reciprocalRankFusion({
      vectorHits: [v("only-v")],
      keywordHits: [k("only-k")],
    });
    const byId = new Map(fused.map((f) => [f.chunkId, f.source]));
    expect(byId.get("only-v")).toBe("vector");
    expect(byId.get("only-k")).toBe("keyword");
  });

  it("respects topK cap", () => {
    const fused = reciprocalRankFusion({
      vectorHits: Array.from({ length: 10 }, (_, i) => v(`a${i}`)),
      keywordHits: Array.from({ length: 10 }, (_, i) => k(`b${i}`)),
      topK: 5,
    });
    expect(fused).toHaveLength(5);
  });

  it("returns empty when both inputs are empty", () => {
    expect(reciprocalRankFusion({ vectorHits: [], keywordHits: [] })).toEqual([]);
  });
});
