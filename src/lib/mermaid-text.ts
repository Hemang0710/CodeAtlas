/**
 * Split assistant text into segments where ```mermaid fenced blocks become
 * their own segments. Everything else passes through as `text`.
 *
 * Why a custom splitter rather than a full Markdown parser: the chat
 * surface already has bespoke rendering for citations and tool calls.
 * Pulling in `react-markdown` for one fenced-code special case is overkill.
 *
 * Supports nested whitespace and CRLF line endings. Unclosed blocks
 * (because the model is still streaming) are treated as text until the
 * closing fence arrives, so we never half-render an in-progress diagram.
 */

export type TextSegment =
  | { type: "text"; text: string }
  | { type: "mermaid"; source: string };

const MERMAID_FENCE_RE = /```mermaid\s*\r?\n([\s\S]*?)\r?\n```/g;

export function splitTextAroundMermaid(text: string): TextSegment[] {
  if (!text) return [];
  const out: TextSegment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  // Reset state because the regex has `g` and we mutate lastIndex.
  MERMAID_FENCE_RE.lastIndex = 0;
  while ((match = MERMAID_FENCE_RE.exec(text)) !== null) {
    if (match.index > lastIndex) {
      out.push({ type: "text", text: text.slice(lastIndex, match.index) });
    }
    const source = match[1].trim();
    if (source.length > 0) {
      out.push({ type: "mermaid", source });
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    out.push({ type: "text", text: text.slice(lastIndex) });
  }
  return out;
}
