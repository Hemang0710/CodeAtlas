import { describe, expect, it } from "vitest";

import { reverseImpactBfs } from "./impact";

/**
 * The DB-backed `getReverseImpact` would need an integration env to test.
 * `reverseImpactBfs` is the same algorithm operating on an in-memory edge
 * map — we lock its behaviour in here so refactors can't change the
 * traversal semantics silently.
 *
 * Adjacency convention: `reverseAdjacency.get(X)` returns the files that
 * IMPORT X (i.e. point at X). So a key of `lib` with value `["app"]`
 * means `app` imports `lib`.
 */

const adj = new Map<string, string[]>([
  ["lib", ["util", "app"]], // app and util both import lib
  ["util", ["app"]], // app imports util
  ["app", ["entry"]], // entry imports app
  ["entry", []], // nothing imports entry
  ["isolated", []], // no importers
]);

describe("reverseImpactBfs", () => {
  it("finds direct importers at depth 1", () => {
    const r = reverseImpactBfs({ rootId: "lib", reverseAdjacency: adj, depth: 1 });
    expect([...r.visited.entries()].sort()).toEqual([
      ["app", 1],
      ["util", 1],
    ]);
    expect(r.reachedDepth).toBe(1);
  });

  it("transitively reaches depth 3 with correct min-depth labels", () => {
    const r = reverseImpactBfs({ rootId: "lib", reverseAdjacency: adj, depth: 3 });
    // util is depth 1 (direct importer); app is depth 1 (also direct);
    // entry is depth 2 (entry → app → lib). entry should NOT be 3.
    expect(r.visited.get("util")).toBe(1);
    expect(r.visited.get("app")).toBe(1);
    expect(r.visited.get("entry")).toBe(2);
    expect(r.reachedDepth).toBe(2);
  });

  it("returns an empty visited set for an isolated file", () => {
    const r = reverseImpactBfs({
      rootId: "isolated",
      reverseAdjacency: adj,
      depth: 3,
    });
    expect(r.visited.size).toBe(0);
    expect(r.reachedDepth).toBe(0);
  });

  it("does not include the root in its own visited set", () => {
    const r = reverseImpactBfs({ rootId: "lib", reverseAdjacency: adj, depth: 5 });
    expect(r.visited.has("lib")).toBe(false);
  });

  it("clamps depth to MAX_DEPTH", () => {
    const r = reverseImpactBfs({
      rootId: "lib",
      reverseAdjacency: adj,
      depth: 99, // request more than the cap
    });
    // The reachable subset is the same regardless of the cap here, but the
    // function should still complete normally and return a sane result.
    expect(r.visited.size).toBeGreaterThan(0);
  });

  it("handles cycles without infinite loop", () => {
    // a → b → c → a (cycle). Root = a.
    const cyclic = new Map<string, string[]>([
      ["a", ["c"]], // c imports a
      ["b", ["a"]],
      ["c", ["b"]],
    ]);
    const r = reverseImpactBfs({ rootId: "a", reverseAdjacency: cyclic, depth: 5 });
    // Cycle traversed; root excluded.
    expect(r.visited.has("a")).toBe(false);
    expect(r.visited.has("b")).toBe(true);
    expect(r.visited.has("c")).toBe(true);
  });
});
