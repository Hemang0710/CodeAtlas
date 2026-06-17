import { describe, expect, it } from "vitest";

import { splitTextAroundMermaid } from "./mermaid-text";

describe("splitTextAroundMermaid", () => {
  it("returns one text segment when there's no fence", () => {
    const segs = splitTextAroundMermaid("just prose");
    expect(segs).toEqual([{ type: "text", text: "just prose" }]);
  });

  it("returns empty for empty input", () => {
    expect(splitTextAroundMermaid("")).toEqual([]);
  });

  it("extracts a single fenced mermaid block", () => {
    const txt = "before\n\n```mermaid\nflowchart LR\n  A-->B\n```\n\nafter";
    const segs = splitTextAroundMermaid(txt);
    expect(segs).toHaveLength(3);
    expect(segs[0]).toEqual({ type: "text", text: "before\n\n" });
    expect(segs[1]).toEqual({ type: "mermaid", source: "flowchart LR\n  A-->B" });
    expect(segs[2]).toEqual({ type: "text", text: "\n\nafter" });
  });

  it("extracts multiple fenced blocks", () => {
    const txt = "```mermaid\nA-->B\n```\n---\n```mermaid\nC-->D\n```";
    const segs = splitTextAroundMermaid(txt);
    expect(segs.filter((s) => s.type === "mermaid")).toHaveLength(2);
  });

  it("ignores in-progress (unclosed) fences", () => {
    const txt = "before\n```mermaid\nflowchart LR\n  A";
    const segs = splitTextAroundMermaid(txt);
    expect(segs.every((s) => s.type === "text")).toBe(true);
  });

  it("skips empty mermaid blocks", () => {
    const txt = "```mermaid\n\n```";
    const segs = splitTextAroundMermaid(txt);
    expect(segs.filter((s) => s.type === "mermaid")).toHaveLength(0);
  });
});
