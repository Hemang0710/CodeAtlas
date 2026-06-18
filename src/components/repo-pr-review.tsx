"use client";

import { useState, type FormEvent } from "react";
import { GitPullRequest, Loader2, RotateCcw, Sparkles } from "lucide-react";

import { MermaidDiagram } from "@/components/mermaid-diagram";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { splitTextAroundMermaid } from "@/lib/mermaid-text";

/**
 * One-shot PR review: paste a GitHub PR URL, get a structured streaming
 * review with blast-radius analysis powered by the indexed codebase.
 *
 * Uses plain fetch + ReadableStream instead of useChat because this is a
 * single-turn flow, not a conversation. The server returns text/plain
 * chunks that we accumulate into a markdown string.
 */

export function RepoPrReview({ repoId }: { repoId: string }) {
  const [prUrl, setPrUrl] = useState("");
  const [review, setReview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const url = prUrl.trim();
    if (!url || isLoading) return;

    setIsLoading(true);
    setReview(null);
    setError(null);

    try {
      const res = await fetch(`/api/repos/${repoId}/pr-review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prUrl: url }),
      });

      if (!res.ok) {
        const json = (await res.json()) as { error?: string };
        throw new Error(json.error ?? `Server error ${res.status}`);
      }

      if (!res.body) throw new Error("No response body from server.");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        accumulated += decoder.decode(value, { stream: true });
        setReview(accumulated);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "An unexpected error occurred.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  function onReset() {
    setReview(null);
    setError(null);
    setPrUrl("");
  }

  return (
    <section className="space-y-6">
      <header className="flex items-center gap-2">
        <GitPullRequest className="h-4 w-4 text-zinc-500" />
        <h2 className="text-sm font-semibold">PR Review</h2>
      </header>

      <form onSubmit={onSubmit} className="flex gap-2">
        <Input
          type="url"
          placeholder="https://github.com/owner/repo/pull/123"
          value={prUrl}
          onChange={(e) => setPrUrl(e.target.value)}
          disabled={isLoading}
          autoComplete="off"
          className="font-mono text-sm"
        />
        <Button
          type="submit"
          disabled={isLoading || prUrl.trim().length === 0}
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          {isLoading ? "Analyzing…" : "Review PR"}
        </Button>
        {(review || error) && !isLoading && (
          <Button type="button" variant="outline" onClick={onReset}>
            <RotateCcw className="h-4 w-4" />
            New review
          </Button>
        )}
      </form>

      {!review && !error && !isLoading && (
        <div className="rounded-lg border border-dashed border-zinc-300 p-8 text-center dark:border-zinc-700">
          <GitPullRequest className="mx-auto mb-3 h-8 w-8 text-zinc-300 dark:text-zinc-600" />
          <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Paste a PR URL from this repository
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            CodeAtlas fetches the diff, traces the blast radius of each changed
            file through the import graph, and writes a structured review.
          </p>
        </div>
      )}

      {isLoading && !review && (
        <div className="rounded-lg border border-zinc-200 p-8 text-center dark:border-zinc-800">
          <Loader2 className="mx-auto mb-3 h-6 w-6 animate-spin text-zinc-400" />
          <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Fetching diff &amp; analyzing impact…
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            The agent is tracing import edges and searching for related tests.
          </p>
        </div>
      )}

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      )}

      {review && (
        <div className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
          <div className="mb-4 flex items-center gap-2 text-xs uppercase tracking-wide text-zinc-500">
            <GitPullRequest className="h-3.5 w-3.5" />
            CodeAtlas Review
            {isLoading && (
              <Loader2 className="h-3 w-3 animate-spin" />
            )}
          </div>
          <ReviewDisplay text={review} />
        </div>
      )}
    </section>
  );
}

function ReviewDisplay({ text }: { text: string }) {
  const segments = splitTextAroundMermaid(text);
  return (
    <div className="space-y-3 text-sm leading-relaxed text-zinc-900 dark:text-zinc-100">
      {segments.map((seg, i) =>
        seg.type === "mermaid" ? (
          <MermaidDiagram key={i} source={seg.source} />
        ) : (
          <div key={i} className="whitespace-pre-wrap">
            {renderWithCitations(seg.text)}
          </div>
        ),
      )}
    </div>
  );
}

/**
 * Turns `path/to/file.ts:42` and `path/to/file.ts:42-58` into amber chips.
 * Creates a fresh RegExp each call to avoid lastIndex state across renders.
 */
function renderWithCitations(text: string): React.ReactNode[] {
  const CITATION_RE = /([a-zA-Z0-9_./-]+\.[a-zA-Z]{1,6}):(\d+)(?:-(\d+))?/g;
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let i = 0;
  while ((match = CITATION_RE.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    nodes.push(
      <code
        key={`c${i++}`}
        className="rounded bg-amber-100 px-1 py-0.5 font-mono text-xs text-amber-900 dark:bg-amber-950/60 dark:text-amber-300"
      >
        {match[0]}
      </code>,
    );
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}
