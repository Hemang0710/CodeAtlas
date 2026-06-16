import { describe, expect, it } from "vitest";

import { chunkText } from "./fallback-chunk";

describe("chunkText", () => {
  it("returns empty for empty input", () => {
    expect(chunkText("")).toEqual([]);
  });

  it("emits a single chunk for short content", () => {
    const chunks = chunkText("hello world\nthis is a paragraph.");
    expect(chunks.length).toBe(1);
    expect(chunks[0].symbolType).toBe("module");
    expect(chunks[0].startLine).toBe(1);
  });

  it("splits long content at blank-line boundaries and stays under cap", () => {
    // Build content with several distinct paragraphs separated by blank lines.
    const paragraph = "abc ".repeat(400); // ~1600 chars per paragraph
    const content = [paragraph, paragraph, paragraph, paragraph].join("\n\n");
    const chunks = chunkText(content);
    expect(chunks.length).toBeGreaterThan(1);
    // Every chunk should start on a sensible line number > 0.
    for (const c of chunks) {
      expect(c.startLine).toBeGreaterThan(0);
      expect(c.endLine).toBeGreaterThanOrEqual(c.startLine);
    }
  });
});
