import { describe, expect, it } from "vitest";

import { extractImports } from "./imports";

describe("extractImports", () => {
  it("captures TS imports of every flavour", async () => {
    const src = `
import foo from "./foo";
import { bar } from "./bar";
import type { Baz } from "./baz";
import "./side-effect";
import * as ns from "lodash";
export { qux } from "./qux";
const lazy = await import("./lazy");
`;
    const refs = await extractImports("file.ts", src);
    const specs = refs.map((r) => r.specifier).sort();
    expect(specs).toEqual([
      "./bar",
      "./baz",
      "./foo",
      "./lazy",
      "./qux",
      "./side-effect",
      "lodash",
    ]);
  });

  it("captures Python imports — bare, dotted, and relative", async () => {
    const src = `
import os
import os.path
from .util import helper
from ..pkg import sibling
from . import index
`;
    const refs = await extractImports("mod.py", src);
    const specs = refs.map((r) => r.specifier).sort();
    expect(specs).toEqual([".", "..pkg", ".util", "os", "os.path"]);
  });

  it("returns [] for files without a grammar", async () => {
    const refs = await extractImports("readme.md", "# title");
    expect(refs).toEqual([]);
  });
});
