import { describe, expect, it } from "vitest";

import { hasBinaryExtension, looksBinary } from "./is-binary";

describe("hasBinaryExtension", () => {
  it("flags common binary extensions", () => {
    expect(hasBinaryExtension("a/b/logo.png")).toBe(true);
    expect(hasBinaryExtension("font.WOFF2")).toBe(true); // case-insensitive
    expect(hasBinaryExtension("model.safetensors")).toBe(true);
  });

  it("does not flag source files", () => {
    expect(hasBinaryExtension("src/index.ts")).toBe(false);
    expect(hasBinaryExtension("README.md")).toBe(false);
  });
});

describe("looksBinary", () => {
  it("returns true when the sniff window contains a null byte", () => {
    expect(looksBinary(Buffer.from([0x68, 0x69, 0x00, 0x21]))).toBe(true);
  });

  it("returns false for plain ASCII", () => {
    expect(looksBinary(Buffer.from("hello, world"))).toBe(false);
  });

  it("returns false if the null byte is past the sniff window", () => {
    // 10 KB of 'a' then a null byte — past the 8 KB sniff window.
    const buf = Buffer.alloc(10 * 1024 + 1, 0x61);
    buf[10 * 1024] = 0;
    expect(looksBinary(buf)).toBe(false);
  });
});
