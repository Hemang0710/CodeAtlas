import { estimateTokens } from "@/lib/token-estimate";

import type { ChunkPart } from "./chunk";
import { INDEXER_LIMITS } from "./config";

/**
 * Fallback chunker for files we can't parse: Markdown, plain text,
 * anything without a tree-sitter grammar. The strategy is "split on blank
 * lines, then merge until each chunk is at least MIN_CHUNK_TOKENS — but
 * never let one grow past MAX_CHUNK_TOKENS."
 *
 * This isn't as semantically clean as the AST chunker but it produces
 * sensible Markdown sections (paragraphs, lists, headings stay together)
 * and gives plain text the same retrieval surface as code.
 */
export function chunkText(content: string): ChunkPart[] {
  if (content.length === 0) return [];

  // First pass: blank-line-separated blocks. Each block carries its 1-based
  // start line so we can produce accurate citations later.
  const blocks: { startLine: number; text: string }[] = [];
  const lines = content.split("\n");
  let cursorLine = 1;
  let buffer: string[] = [];
  let bufferStart = 1;

  const flushBlock = () => {
    if (buffer.length === 0) return;
    const text = buffer.join("\n");
    if (text.trim().length > 0) {
      blocks.push({ startLine: bufferStart, text });
    }
    buffer = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === "") {
      flushBlock();
      cursorLine = i + 2; // next line after the blank
      bufferStart = cursorLine;
    } else {
      if (buffer.length === 0) bufferStart = cursorLine;
      buffer.push(line);
      cursorLine = i + 2;
    }
  }
  flushBlock();

  if (blocks.length === 0) {
    // Whole file was whitespace; emit a single chunk so the file isn't lost.
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

  // Second pass: greedy merge into chunks of [MIN, MAX] tokens.
  const out: ChunkPart[] = [];
  let pending: { startLine: number; text: string } | null = null;

  for (const block of blocks) {
    if (!pending) {
      pending = { ...block };
      continue;
    }
    const combined = `${pending.text}\n\n${block.text}`;
    const combinedTokens = estimateTokens(combined);
    if (combinedTokens > INDEXER_LIMITS.MAX_CHUNK_TOKENS) {
      out.push(toChunk(pending));
      pending = { ...block };
    } else {
      pending.text = combined;
      if (
        estimateTokens(pending.text) >= INDEXER_LIMITS.MIN_CHUNK_TOKENS
      ) {
        out.push(toChunk(pending));
        pending = null;
      }
    }
  }
  if (pending) out.push(toChunk(pending));
  return out;
}

function toChunk(block: { startLine: number; text: string }): ChunkPart {
  const lineCount = block.text.split("\n").length;
  return {
    symbolName: null,
    symbolType: "module",
    startLine: block.startLine,
    endLine: block.startLine + lineCount - 1,
    content: block.text,
  };
}
