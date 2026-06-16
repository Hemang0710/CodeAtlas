import { describe, expect, it } from "vitest";

import { chunkFile } from "./chunk";

/**
 * Roadmap-mandated cases: normal function, class with methods, huge function,
 * empty file. Plus a Python case so we know both grammar branches load.
 *
 * These tests boot the WASM parser the first time they run (~100ms) so we
 * intentionally let vitest's default per-file isolation handle warm-up.
 */

describe("chunkFile", () => {
  it("emits one chunk per top-level function once each is above the merge threshold", async () => {
    // Each function body needs to estimate above MIN_CHUNK_TOKENS (100
    // tokens ≈ 400 chars) or the merger will collapse them — that's
    // desirable in production but defeats the test's intent.
    const body = Array.from({ length: 30 }, (_, i) => `  const x${i} = ${i};`).join("\n");
    const src = `function add(a: number, b: number): number {
${body}
  return a + b;
}

function sub(a: number, b: number): number {
${body}
  return a - b;
}
`;
    const chunks = await chunkFile("math.ts", src);
    expect(chunks).not.toBeNull();
    const names = chunks!.map((c) => c.symbolName);
    expect(names).toEqual(["add", "sub"]);
    expect(chunks!.every((c) => c.symbolType === "function")).toBe(true);
    expect(chunks![0].startLine).toBe(1);
  });

  it("emits a class as a single chunk when it fits, with methods when it doesn't", async () => {
    const smallClass = `class Greeter {
  constructor(public name: string) {}
  greet() { return \`Hello, \${this.name}\`; }
}
`;
    const small = await chunkFile("greet.ts", smallClass);
    expect(small).not.toBeNull();
    expect(small!.length).toBe(1);
    expect(small![0].symbolName).toBe("Greeter");
    expect(small![0].symbolType).toBe("class");

    // Now a class whose body is huge enough to break into per-method chunks.
    // The full class needs to exceed MAX_CHUNK_TOKENS (1500 tokens ≈ 6 KB)
    // while each method stays under. We pad each method with ~2.5 KB of
    // comment ballast so 3 methods × 2.5 KB ≈ 7.5 KB total.
    const ballast = "// " + "x".repeat(2400) + "\n";
    const bigClass = `class Big {
  foo() {
${ballast}    return 1;
  }
  bar() {
${ballast}    return 2;
  }
  baz() {
${ballast}    return 3;
  }
}
`;
    const big = await chunkFile("big.ts", bigClass);
    expect(big).not.toBeNull();
    const names = big!.map((c) => c.symbolName).sort();
    expect(names).toEqual(["bar", "baz", "foo"]);
    expect(big!.every((c) => c.symbolType === "method")).toBe(true);
  });

  it("splits a single huge leaf function at line boundaries", async () => {
    // A function whose body has no nested functions or classes, so the
    // chunker can only split it by lines.
    const padding = Array.from({ length: 2000 }, (_, i) => `  let x${i} = ${i};`).join("\n");
    const src = `function huge() {\n${padding}\n  return null;\n}\n`;
    const chunks = await chunkFile("huge.ts", src);
    expect(chunks).not.toBeNull();
    expect(chunks!.length).toBeGreaterThan(1);
    expect(chunks!.every((c) => c.symbolName === "huge")).toBe(true);
    // Sanity: line ranges should be contiguous and non-overlapping.
    for (let i = 1; i < chunks!.length; i++) {
      expect(chunks![i].startLine).toBeGreaterThan(chunks![i - 1].startLine);
    }
  });

  it("returns an empty array for an empty file", async () => {
    const chunks = await chunkFile("empty.ts", "");
    expect(chunks).toEqual([]);
  });

  it("emits one module-level chunk for a file with no chunkable nodes", async () => {
    const src = `// constants module\nexport const PI = 3.14;\nexport const E = 2.71;\n`;
    const chunks = await chunkFile("constants.ts", src);
    expect(chunks).not.toBeNull();
    expect(chunks!.length).toBe(1);
    expect(chunks![0].symbolType).toBe("module");
    expect(chunks![0].startLine).toBe(1);
  });

  it("chunks Python functions and classes", async () => {
    const src = `def hello(name):\n    return f"hi {name}"\n\nclass Person:\n    def __init__(self, name):\n        self.name = name\n    def greet(self):\n        return hello(self.name)\n`;
    const chunks = await chunkFile("p.py", src);
    expect(chunks).not.toBeNull();
    const names = chunks!.map((c) => c.symbolName);
    expect(names).toContain("hello");
    expect(names).toContain("Person");
  });

  it("returns null for files without a grammar (caller should fallback)", async () => {
    const chunks = await chunkFile("notes.md", "# heading\n\ntext");
    expect(chunks).toBeNull();
  });
});
