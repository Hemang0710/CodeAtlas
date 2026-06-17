import { describe, expect, it } from "vitest";

import {
  FILES_MODE_NODE_LIMIT,
  buildMermaidGraph,
  pickMermaidMode,
} from "./mermaid-graph";

describe("pickMermaidMode", () => {
  it("uses files mode up to the threshold", () => {
    expect(pickMermaidMode(0)).toBe("files");
    expect(pickMermaidMode(FILES_MODE_NODE_LIMIT)).toBe("files");
  });
  it("falls back to directories above the threshold", () => {
    expect(pickMermaidMode(FILES_MODE_NODE_LIMIT + 1)).toBe("directories");
    expect(pickMermaidMode(10000)).toBe("directories");
  });
});

describe("buildMermaidGraph (files mode)", () => {
  it("groups files into per-directory subgraphs", () => {
    const out = buildMermaidGraph({
      mode: "files",
      nodes: [
        { id: "a", path: "src/index.ts", language: "typescript" },
        { id: "b", path: "src/util.ts", language: "typescript" },
        { id: "c", path: "tests/index.test.ts", language: "typescript" },
      ],
      edges: [{ source: "a", target: "b" }],
    });
    expect(out).toContain("flowchart LR");
    expect(out).toContain("subgraph");
    expect(out).toContain("src");
    expect(out).toContain("tests");
    // Edge survives id mapping.
    expect(out).toMatch(/n_a --> n_b/);
  });

  it("handles files at the repo root", () => {
    const out = buildMermaidGraph({
      mode: "files",
      nodes: [{ id: "r", path: "README.md", language: "markdown" }],
      edges: [],
    });
    expect(out).toContain("(root)");
  });
});

describe("buildMermaidGraph (directories mode)", () => {
  it("collapses files to one node per folder", () => {
    const out = buildMermaidGraph({
      mode: "directories",
      nodes: [
        { id: "a", path: "src/api/route.ts", language: "typescript" },
        { id: "b", path: "src/api/util.ts", language: "typescript" },
        { id: "c", path: "src/db/client.ts", language: "typescript" },
      ],
      edges: [
        { source: "a", target: "c" }, // src/api → src/db
        { source: "b", target: "c" }, // dedupes to same edge
      ],
    });
    // One node per directory, not per file.
    expect(out.match(/n_dir_/g)?.length).toBeGreaterThanOrEqual(2);
    // Dedup: only one edge should appear in the output.
    expect((out.match(/-->/g) ?? []).length).toBe(1);
  });

  it("skips intra-directory edges", () => {
    const out = buildMermaidGraph({
      mode: "directories",
      nodes: [
        { id: "a", path: "src/a.ts", language: "typescript" },
        { id: "b", path: "src/b.ts", language: "typescript" },
      ],
      edges: [{ source: "a", target: "b" }],
    });
    expect(out).not.toContain("-->");
  });
});

describe("buildMermaidGraph (empty)", () => {
  it("returns a placeholder when there are no nodes", () => {
    expect(buildMermaidGraph({ nodes: [], edges: [] })).toContain("No files");
  });
});
