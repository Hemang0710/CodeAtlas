import { describe, expect, it } from "vitest";

import { resolveEdges } from "./resolve-edges";

describe("resolveEdges (JS/TS)", () => {
  const known = new Set([
    "src/index.ts",
    "src/util/format.ts",
    "src/util/index.ts",
    "src/components/Button.tsx",
  ]);

  it("resolves a relative import to a known file with extension", () => {
    const edges = resolveEdges({
      sourceFilePath: "src/index.ts",
      language: "typescript",
      imports: [{ specifier: "./util/format", line: 1 }],
      knownPaths: known,
    });
    expect(edges).toEqual([
      { sourceFilePath: "src/index.ts", targetFilePath: "src/util/format.ts" },
    ]);
  });

  it("resolves a directory import to its index file", () => {
    const edges = resolveEdges({
      sourceFilePath: "src/index.ts",
      language: "typescript",
      imports: [{ specifier: "./util", line: 1 }],
      knownPaths: known,
    });
    expect(edges[0]?.targetFilePath).toBe("src/util/index.ts");
  });

  it("drops bare package specifiers", () => {
    const edges = resolveEdges({
      sourceFilePath: "src/index.ts",
      language: "typescript",
      imports: [{ specifier: "react", line: 1 }, { specifier: "lodash", line: 2 }],
      knownPaths: known,
    });
    expect(edges).toEqual([]);
  });

  it("drops imports that don't match any known file", () => {
    const edges = resolveEdges({
      sourceFilePath: "src/index.ts",
      language: "typescript",
      imports: [{ specifier: "./does-not-exist", line: 1 }],
      knownPaths: known,
    });
    expect(edges).toEqual([]);
  });

  it("does not create a self-edge", () => {
    const edges = resolveEdges({
      sourceFilePath: "src/util/index.ts",
      language: "typescript",
      imports: [{ specifier: ".", line: 1 }],
      knownPaths: known,
    });
    expect(edges).toEqual([]);
  });

  it("dedupes multiple imports of the same target", () => {
    const edges = resolveEdges({
      sourceFilePath: "src/index.ts",
      language: "typescript",
      imports: [
        { specifier: "./util/format", line: 1 },
        { specifier: "./util/format", line: 2 },
      ],
      knownPaths: known,
    });
    expect(edges).toHaveLength(1);
  });
});

describe("resolveEdges (Python)", () => {
  const known = new Set([
    "pkg/__init__.py",
    "pkg/util.py",
    "pkg/sub/__init__.py",
    "pkg/sub/inner.py",
  ]);

  it("resolves single-dot relative to same package", () => {
    const edges = resolveEdges({
      sourceFilePath: "pkg/sub/inner.py",
      language: "python",
      imports: [{ specifier: ".inner", line: 1 }],
      knownPaths: known,
    });
    // `.inner` from inner.py resolves to itself → no self-edges; expect empty.
    expect(edges).toEqual([]);
  });

  it("resolves multi-dot to parent package", () => {
    const edges = resolveEdges({
      sourceFilePath: "pkg/sub/inner.py",
      language: "python",
      imports: [{ specifier: "..util", line: 1 }],
      knownPaths: known,
    });
    expect(edges[0]?.targetFilePath).toBe("pkg/util.py");
  });

  it("resolves dotted bare names by trying __init__", () => {
    const edges = resolveEdges({
      sourceFilePath: "pkg/sub/inner.py",
      language: "python",
      imports: [{ specifier: ".", line: 1 }],
      knownPaths: known,
    });
    expect(edges[0]?.targetFilePath).toBe("pkg/sub/__init__.py");
  });
});
