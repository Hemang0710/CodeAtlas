import { promises as fs } from "node:fs";

import Parser from "web-tree-sitter";

import {
  type GrammarKey,
  grammarWasmPath,
  pickGrammar,
  runtimeWasmPath,
} from "./grammars";

/**
 * Singleton parser front-end.
 *
 * Tree-sitter's WASM runtime is heavy to boot (~30ms) and each grammar
 * adds another async load. We init both lazily and cache per-grammar
 * `Language` instances. The result is one-time cost per worker process,
 * then microseconds per parse.
 *
 * We pin `web-tree-sitter@0.22.x` because that's the latest version whose
 * Emscripten ABI is compatible with `tree-sitter-wasms@0.1.13`'s grammars.
 * If we ever switch to a newer grammar source we can bump this back up.
 */

let runtimeReady: Promise<void> | null = null;
const languageCache = new Map<GrammarKey, Promise<Parser.Language>>();

function ensureRuntime(): Promise<void> {
  if (!runtimeReady) {
    runtimeReady = Parser.init({
      // In Node we have to tell Emscripten where the runtime wasm actually
      // lives — there's no http(s) fetch fallback like in a browser.
      locateFile() {
        return runtimeWasmPath();
      },
    });
  }
  return runtimeReady;
}

function loadLanguage(key: GrammarKey): Promise<Parser.Language> {
  let pending = languageCache.get(key);
  if (!pending) {
    pending = ensureRuntime().then(async () => {
      const bytes = await fs.readFile(grammarWasmPath(key));
      return Parser.Language.load(bytes);
    });
    languageCache.set(key, pending);
  }
  return pending;
}

export interface ParseSuccess {
  grammar: GrammarKey;
  /** Parsed tree. Caller MUST call `close()` to free native memory. */
  tree: Parser.Tree & { close: () => void };
}

/**
 * Parse a file's source. Returns null if we don't have a grammar for it
 * (caller should fall back to text chunking) or if parsing produced no tree.
 *
 * IMPORTANT: tree-sitter trees and parsers hold native (WASM) memory. The
 * caller MUST call `tree.close()` when done — we attach it as a helper so
 * one call frees both the tree and the parser used to produce it.
 */
export async function parseSource(
  filePath: string,
  source: string,
): Promise<ParseSuccess | null> {
  const grammar = pickGrammar(filePath);
  if (!grammar) return null;

  const language = await loadLanguage(grammar);
  const parser = new Parser();
  parser.setLanguage(language);
  const tree = parser.parse(source);
  if (!tree) {
    parser.delete();
    return null;
  }
  const close = () => {
    tree.delete();
    parser.delete();
  };
  return { grammar, tree: Object.assign(tree, { close }) };
}

// Re-export SyntaxNode so callers can type-annotate without depending on
// the namespace shape directly.
export type SyntaxNode = Parser.SyntaxNode;
