"use client";

import { useState } from "react";
import { Loader2, RefreshCw, Sparkles } from "lucide-react";

import { MermaidDiagram } from "@/components/mermaid-diagram";
import { Button } from "@/components/ui/button";
import { splitTextAroundMermaid } from "@/lib/mermaid-text";

/**
 * Client component for the onboarding guide page. Owns the
 * generate/regenerate action; the cached Markdown is passed in as a prop
 * (rendered server-side initially).
 *
 * We render the Markdown ourselves with a minimal pass — headings,
 * paragraphs, bullets, inline code — because adding a full Markdown
 * library for one page isn't worth the bundle bump.
 */

export function RepoGuide({
  repoId,
  initialMarkdown,
  initialGeneratedAt,
}: {
  repoId: string;
  initialMarkdown: string | null;
  initialGeneratedAt: string | null;
}) {
  const [markdown, setMarkdown] = useState<string | null>(initialMarkdown);
  const [generatedAt, setGeneratedAt] = useState<string | null>(initialGeneratedAt);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/repos/${repoId}/guide`, { method: "POST" });
      const json = (await res.json()) as {
        markdown?: string;
        generatedAt?: string;
        error?: string;
      };
      if (!res.ok || !json.markdown) {
        throw new Error(json.error ?? `Generation failed (HTTP ${res.status}).`);
      }
      setMarkdown(json.markdown);
      setGeneratedAt(json.generatedAt ?? new Date().toISOString());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setBusy(false);
    }
  }

  if (!markdown) {
    return (
      <section className="space-y-4">
        <p className="rounded-lg border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500 dark:border-zinc-700">
          No onboarding guide for this repo yet. Click below to generate one —
          this calls the agent once and caches the result.
        </p>
        {error && (
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        )}
        <div className="flex justify-center">
          <Button onClick={generate} disabled={busy}>
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            {busy ? "Generating…" : "Generate guide"}
          </Button>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-zinc-500">
          {generatedAt
            ? `Generated ${new Date(generatedAt).toLocaleString()}`
            : "Cached"}
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={generate}
          disabled={busy}
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          Regenerate
        </Button>
      </div>
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      <MarkdownWithMermaid source={markdown} />
    </section>
  );
}

/**
 * Render Markdown with embedded Mermaid blocks. Minimal — headings, bold,
 * inline code, paragraphs, bullets. Anything fancier and we'd reach for
 * react-markdown.
 */
function MarkdownWithMermaid({ source }: { source: string }) {
  const segments = splitTextAroundMermaid(source);
  return (
    <div className="prose-zinc max-w-none space-y-3 text-sm leading-relaxed text-zinc-900 dark:text-zinc-100">
      {segments.map((seg, i) =>
        seg.type === "mermaid" ? (
          <MermaidDiagram key={i} source={seg.source} />
        ) : (
          <MarkdownText key={i} source={seg.text} />
        ),
      )}
    </div>
  );
}

function MarkdownText({ source }: { source: string }) {
  // We split on blank lines (paragraphs) and then render each line.
  const blocks = source.split(/\n{2,}/);
  return (
    <>
      {blocks.map((block, i) => {
        const trimmed = block.trim();
        if (trimmed.length === 0) return null;
        if (trimmed.startsWith("### ")) {
          return (
            <h3 key={i} className="mt-4 text-sm font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-400">
              {renderInline(trimmed.slice(4))}
            </h3>
          );
        }
        if (trimmed.startsWith("## ")) {
          return (
            <h2 key={i} className="mt-6 text-lg font-semibold tracking-tight">
              {renderInline(trimmed.slice(3))}
            </h2>
          );
        }
        if (trimmed.startsWith("# ")) {
          return (
            <h1 key={i} className="mt-6 text-xl font-semibold tracking-tight">
              {renderInline(trimmed.slice(2))}
            </h1>
          );
        }
        // Bullet list — lines starting with `- ` or `* `.
        if (/^\s*[-*]\s/.test(trimmed)) {
          const items = trimmed
            .split(/\n+/)
            .filter((l) => /^\s*[-*]\s/.test(l));
          return (
            <ul key={i} className="ml-5 list-disc space-y-1">
              {items.map((item, j) => (
                <li key={j}>{renderInline(item.replace(/^\s*[-*]\s+/, ""))}</li>
              ))}
            </ul>
          );
        }
        return (
          <p key={i} className="whitespace-pre-wrap">
            {renderInline(trimmed)}
          </p>
        );
      })}
    </>
  );
}

/** Render inline Markdown: **bold**, `code`, plus our citation chips. */
function renderInline(text: string): React.ReactNode {
  // Tokenize on alternation of code spans / bold / citations.
  const pieces: React.ReactNode[] = [];
  // First pass: protect inline code spans so further regexes don't bleed in.
  const codeSplit = text.split(/(`[^`]+`)/g);
  codeSplit.forEach((seg, i) => {
    if (seg.startsWith("`") && seg.endsWith("`")) {
      pieces.push(
        <code
          key={`c${i}`}
          className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-xs text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200"
        >
          {seg.slice(1, -1)}
        </code>,
      );
      return;
    }
    // Bold + citations on the remainder.
    const boldSplit = seg.split(/(\*\*[^*]+\*\*)/g);
    boldSplit.forEach((bs, j) => {
      if (bs.startsWith("**") && bs.endsWith("**")) {
        pieces.push(<strong key={`b${i}_${j}`}>{bs.slice(2, -2)}</strong>);
      } else {
        pieces.push(...renderCitations(bs, `t${i}_${j}`));
      }
    });
  });
  return pieces;
}

const CITATION_RE = /([a-zA-Z0-9_./-]+\.[a-zA-Z]{1,6}):(\d+)(?:-(\d+))?/g;

function renderCitations(text: string, keyPrefix: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let i = 0;
  CITATION_RE.lastIndex = 0;
  while ((match = CITATION_RE.exec(text)) !== null) {
    if (match.index > lastIndex) out.push(text.slice(lastIndex, match.index));
    out.push(
      <code
        key={`${keyPrefix}_${i++}`}
        className="rounded bg-amber-100 px-1 py-0.5 font-mono text-xs text-amber-900 dark:bg-amber-950/60 dark:text-amber-300"
      >
        {match[0]}
      </code>,
    );
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) out.push(text.slice(lastIndex));
  return out;
}
