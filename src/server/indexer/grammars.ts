import { createRequire } from "node:module";
import path from "node:path";

// Our codebase is ESM, so `require` isn't ambient. `createRequire(import.meta.url)`
// gives us a CommonJS-style resolver scoped to this file's URL — perfect for
// asking "where on disk does package X live?" without parsing package.json
// ourselves.
const requireFromHere = createRequire(import.meta.url);

/**
 * Map a file path to the grammar it should be parsed with.
 *
 * Picking by extension (rather than by our high-level language label) lets
 * us distinguish TS from TSX cleanly: we lump both under the `"typescript"`
 * label for display, but TSX needs the JSX-aware grammar to parse.
 */

export type GrammarKey = "typescript" | "tsx" | "javascript" | "python";

const EXT_TO_GRAMMAR: Record<string, GrammarKey> = {
  ts: "typescript",
  mts: "typescript",
  cts: "typescript",
  tsx: "tsx",
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  jsx: "javascript",
  py: "python",
  pyi: "python",
};

export function pickGrammar(filePath: string): GrammarKey | null {
  const ext = filePath.toLowerCase().split(".").pop();
  if (!ext) return null;
  return EXT_TO_GRAMMAR[ext] ?? null;
}

/**
 * Absolute path to the wasm file for a grammar. We resolve via the
 * `tree-sitter-wasms` package layout (out/tree-sitter-<key>.wasm) and turn
 * it into an absolute path via `require.resolve` — works under both tsx
 * (dev worker) and a built worker.
 */
export function grammarWasmPath(key: GrammarKey): string {
  // tree-sitter-wasms uses underscores for some grammar names; the ones we
  // use happen to be plain. If we add a multi-word grammar later (e.g.
  // c_sharp), keep this mapping explicit so we don't paper over typos.
  const file = `tree-sitter-${key}.wasm`;
  // We can't ask for `package.json` directly because some packages restrict
  // it in their `exports` field. Resolving any known shipped sub-path gets
  // us into the package directory just as well.
  const known = requireFromHere.resolve("tree-sitter-wasms/out/tree-sitter-javascript.wasm");
  return path.join(path.dirname(known), file);
}

/**
 * Absolute path to the web-tree-sitter runtime wasm. `Parser.init` needs
 * this via its `locateFile` callback when running outside a browser.
 */
export function runtimeWasmPath(): string {
  // web-tree-sitter's `exports` field doesn't include `./package.json`, so
  // we resolve its main entry instead and walk up to the package dir.
  // The 0.22.x line ships its runtime as `tree-sitter.wasm`; the 0.26.x
  // line renamed it to `web-tree-sitter.wasm`. We're on 0.22.x for grammar
  // ABI compatibility, so it's the unprefixed name.
  const main = requireFromHere.resolve("web-tree-sitter");
  return path.join(path.dirname(main), "tree-sitter.wasm");
}
