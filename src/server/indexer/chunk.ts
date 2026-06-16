import { estimateTokens } from "@/lib/token-estimate";

import { INDEXER_LIMITS } from "./config";
import type { GrammarKey } from "./grammars";
import { parseSource, type SyntaxNode } from "./parser";

/**
 * Split a source file into semantically meaningful chunks.
 *
 * Algorithm:
 *   1. Parse the file with the right tree-sitter grammar.
 *   2. Walk the AST and collect "chunkable" nodes — functions, classes,
 *      methods. Each language has its own set of node-type strings.
 *   3. For each chunkable node:
 *        - if it's bigger than MAX_CHUNK_TOKENS and it has chunkable
 *          *descendants*, throw away the wrapper and emit the descendants
 *          instead. This is how a giant class becomes a list of methods.
 *        - if it's bigger than MAX and has NO chunkable descendants
 *          (e.g. one huge function with a switch), split it at line
 *          boundaries roughly MAX tokens apart.
 *        - otherwise emit it as one chunk.
 *   4. Tiny adjacent siblings get merged so we don't waste a chunk on a
 *      6-line getter.
 *   5. If the file has zero chunkable nodes, emit one "module"-typed
 *      chunk covering the whole file (so retrieval doesn't miss it).
 *
 * Chunks reference the source by 1-based line numbers, matching how
 * humans read code references like `file.ts:42`.
 */

export type ChunkSymbolType =
  | "function"
  | "class"
  | "method"
  | "module"
  | "other";

export interface ChunkPart {
  symbolName: string | null;
  symbolType: ChunkSymbolType;
  /** 1-based, inclusive. */
  startLine: number;
  /** 1-based, inclusive. */
  endLine: number;
  content: string;
}

/**
 * Per-grammar set of AST node types we consider "a chunk on its own."
 * If you add a language, the only thing you almost always need to edit
 * is this table.
 */
const CHUNKABLE_TYPES: Record<GrammarKey, Set<string>> = {
  typescript: new Set([
    "function_declaration",
    "method_definition",
    "class_declaration",
    "abstract_class_declaration",
    "interface_declaration",
    "enum_declaration",
    "generator_function_declaration",
  ]),
  tsx: new Set([
    "function_declaration",
    "method_definition",
    "class_declaration",
    "abstract_class_declaration",
    "interface_declaration",
    "enum_declaration",
    "generator_function_declaration",
  ]),
  javascript: new Set([
    "function_declaration",
    "method_definition",
    "class_declaration",
    "generator_function_declaration",
  ]),
  python: new Set([
    "function_definition",
    "async_function_definition",
    "class_definition",
    "decorated_definition",
  ]),
};

function symbolKind(node: SyntaxNode): ChunkSymbolType {
  switch (node.type) {
    case "function_declaration":
    case "function_definition":
    case "async_function_definition":
    case "generator_function_declaration":
      return "function";
    case "method_definition":
      return "method";
    case "class_declaration":
    case "class_definition":
    case "abstract_class_declaration":
    case "interface_declaration":
    case "enum_declaration":
      return "class";
    case "decorated_definition": {
      // Python: peek inside to learn whether it's wrapping a fn or class.
      const inner = node.childForFieldName("definition");
      return inner ? symbolKind(inner) : "other";
    }
    default:
      return "other";
  }
}

function symbolNameOf(node: SyntaxNode): string | null {
  // Standard "name" field works for function_declaration, class_declaration,
  // method_definition, function_definition, class_definition, etc.
  const named = node.childForFieldName("name");
  if (named) return named.text;
  // Decorated python definition wraps a class/fn definition.
  if (node.type === "decorated_definition") {
    const inner = node.childForFieldName("definition");
    if (inner) return symbolNameOf(inner);
  }
  return null;
}

/**
 * Recursive worker. Returns the chunks contributed by `node`'s subtree.
 *
 * The "swap a too-big parent for its descendants" trick is what makes a
 * 1500-line class break cleanly into per-method chunks without losing the
 * containing class context — each method's `symbolName` still names the
 * method itself, and the class definition shows up as its own chunk too if
 * the class wrapper (signature + non-method body) is large enough.
 */
function harvest(node: SyntaxNode, grammar: GrammarKey): ChunkPart[] {
  const chunkable = CHUNKABLE_TYPES[grammar];

  if (chunkable.has(node.type)) {
    const tokens = estimateTokens(node.text);
    if (tokens <= INDEXER_LIMITS.MAX_CHUNK_TOKENS) {
      return [makeChunkFromNode(node)];
    }
    // Too big. Try to descend into chunkable children.
    const descendants: ChunkPart[] = [];
    for (const child of node.namedChildren) {
      if (!child) continue;
      descendants.push(...harvest(child, grammar));
    }
    if (descendants.length > 0) return descendants;
    // No chunkable inner units — split by line groups.
    return splitByLines(node);
  }

  // Not chunkable itself, but its descendants might be.
  const out: ChunkPart[] = [];
  for (const child of node.namedChildren) {
    if (!child) continue;
    out.push(...harvest(child, grammar));
  }
  return out;
}

function makeChunkFromNode(node: SyntaxNode): ChunkPart {
  return {
    symbolName: symbolNameOf(node),
    symbolType: symbolKind(node),
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    content: node.text,
  };
}

/**
 * Last-resort splitter for a huge, leaf-ish node. We split its text into
 * line groups of roughly MAX_CHUNK_TOKENS each. Each piece keeps the same
 * symbol name + symbol type, so the LLM can still tell what it's looking at.
 */
function splitByLines(node: SyntaxNode): ChunkPart[] {
  const lines = node.text.split("\n");
  const startLine = node.startPosition.row + 1;
  const name = symbolNameOf(node);
  const type = symbolKind(node);

  const out: ChunkPart[] = [];
  let buffer: string[] = [];
  let bufferStart = startLine;

  for (let i = 0; i < lines.length; i++) {
    buffer.push(lines[i]);
    if (estimateTokens(buffer.join("\n")) >= INDEXER_LIMITS.MAX_CHUNK_TOKENS) {
      out.push({
        symbolName: name,
        symbolType: type,
        startLine: bufferStart,
        endLine: bufferStart + buffer.length - 1,
        content: buffer.join("\n"),
      });
      bufferStart += buffer.length;
      buffer = [];
    }
  }
  if (buffer.length > 0) {
    out.push({
      symbolName: name,
      symbolType: type,
      startLine: bufferStart,
      endLine: bufferStart + buffer.length - 1,
      content: buffer.join("\n"),
    });
  }
  return out;
}

/**
 * Merge tiny adjacent same-type chunks. A repo full of one-line getters
 * would otherwise produce a chunk per getter, which is wasteful for the
 * embedding budget AND poor for retrieval (each one's signal is too weak).
 *
 * We merge only when:
 *   - both chunks share a symbol type (e.g. both methods),
 *   - the smaller of the two is below MIN_CHUNK_TOKENS,
 *   - the combined chunk would still be under MAX_CHUNK_TOKENS.
 */
function mergeTinies(chunks: ChunkPart[]): ChunkPart[] {
  const out: ChunkPart[] = [];
  for (const next of chunks) {
    const prev = out[out.length - 1];
    if (
      prev &&
      prev.symbolType === next.symbolType &&
      (estimateTokens(prev.content) < INDEXER_LIMITS.MIN_CHUNK_TOKENS ||
        estimateTokens(next.content) < INDEXER_LIMITS.MIN_CHUNK_TOKENS) &&
      estimateTokens(prev.content + "\n" + next.content) <=
        INDEXER_LIMITS.MAX_CHUNK_TOKENS
    ) {
      // Splice into the previous one, in place.
      out[out.length - 1] = {
        symbolName: prev.symbolName ?? next.symbolName,
        symbolType: prev.symbolType,
        startLine: prev.startLine,
        endLine: next.endLine,
        content: `${prev.content}\n${next.content}`,
      };
    } else {
      out.push(next);
    }
  }
  return out;
}

/**
 * Main entry. Given a file's path + content, returns the chunks we want
 * to store, or `null` if this file should be passed to the fallback text
 * chunker instead (no grammar, file too big, or parser failed).
 */
export async function chunkFile(
  filePath: string,
  content: string,
): Promise<ChunkPart[] | null> {
  if (content.length === 0) return [];
  if (content.length > INDEXER_LIMITS.MAX_PARSE_BYTES) return null;

  const parsed = await parseSource(filePath, content);
  if (!parsed) return null;

  try {
    const harvested = harvest(parsed.tree.rootNode, parsed.grammar);
    if (harvested.length === 0) {
      // Whole file as one module-level chunk so retrieval doesn't miss it.
      const lines = content.split("\n");
      return [
        {
          symbolName: null,
          symbolType: "module",
          startLine: 1,
          endLine: Math.max(lines.length, 1),
          content,
        },
      ];
    }
    return mergeTinies(harvested);
  } finally {
    (parsed.tree as unknown as { close: () => void }).close();
  }
}
