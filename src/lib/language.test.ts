import { describe, expect, it } from "vitest";

import { detectLanguage } from "./language";

describe("detectLanguage", () => {
  it("returns the language for known extensions", () => {
    expect(detectLanguage("src/index.ts")).toBe("typescript");
    expect(detectLanguage("foo.py")).toBe("python");
    expect(detectLanguage("a/b/main.go")).toBe("go");
  });

  it("handles uppercase and Windows separators", () => {
    expect(detectLanguage("src\\Component.TSX")).toBe("typescript");
  });

  it("matches by special basename when no extension", () => {
    expect(detectLanguage("Dockerfile")).toBe("dockerfile");
    expect(detectLanguage("Makefile")).toBe("make");
    expect(detectLanguage("dir/Rakefile")).toBe("ruby");
  });

  it("returns null for unknown or empty extensions", () => {
    expect(detectLanguage("notes.zzz")).toBeNull();
    expect(detectLanguage("README")).toBeNull();
    expect(detectLanguage(".hidden")).toBeNull();
  });
});
