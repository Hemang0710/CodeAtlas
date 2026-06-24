"use client";

import { useState, type FormEvent } from "react";
import { Check, Copy, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

/**
 * Phase 3 search box. The user types a question or symbol name, we POST
 * to /api/repos/:id/search, and render ranked chunks below.
 *
 * Phase 5 swaps this for the streaming Q&A agent; we'll keep the same
 * card shell.
 */

interface Hit {
  chunkId: string;
  filePath: string;
  symbolName: string | null;
  symbolType: string;
  startLine: number;
  endLine: number;
  content: string;
  score: number;
  source?: "vector" | "keyword" | "both" | "expanded";
  vectorRank?: number | null;
  keywordRank?: number | null;
}

export function RepoSearch({ repoId }: { repoId: string }) {
  const [query, setQuery] = useState("");
  const [languageFilter, setLanguageFilter] = useState<string>("all");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hits, setHits] = useState<Hit[] | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/repos/${repoId}/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, k: 10 }),
      });
      const json = (await res.json()) as { hits?: Hit[]; error?: string };
      if (!res.ok) {
        throw new Error(json.error ?? `Search failed (HTTP ${res.status})`);
      }
      setHits(json.hits ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setHits(null);
    } finally {
      setSubmitting(false);
    }
  }

  const languages = hits
    ? [...new Set(hits.map((h) => {
        const ext = h.filePath.split(".").pop() ?? "";
        return ext;
      }))].sort()
    : [];

  const filteredHits = hits
    ? languageFilter === "all"
      ? hits
      : hits.filter((h) => h.filePath.endsWith(`.${languageFilter}`))
    : null;

  return (
    <section className="space-y-4">
      <form onSubmit={handleSubmit} className="space-y-2">
        <div className="flex gap-2">
          <Input
            placeholder="Where is the payment logic? · class Greeter · what handles login"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            disabled={submitting}
          />
          <Button type="submit" disabled={submitting || query.trim().length === 0}>
            <Search className="h-4 w-4" />
            {submitting ? "Searching…" : "Search"}
          </Button>
        </div>
        <p className="text-xs text-zinc-500">
          Semantic search across this repo&apos;s indexed chunks. Top 10 hits
          are returned, ranked by cosine similarity.
        </p>
        {error && (
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        )}
      </form>

      {hits && hits.length > 0 && languages.length > 1 && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-500">Filter:</span>
          <div className="flex flex-wrap gap-1">
            <button
              onClick={() => setLanguageFilter("all")}
              className={`rounded-full px-2.5 py-0.5 text-xs transition-colors ${
                languageFilter === "all"
                  ? "bg-amber-500 text-white"
                  : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
              }`}
            >
              All ({hits.length})
            </button>
            {languages.map((lang) => {
              const count = hits.filter((h) => h.filePath.endsWith(`.${lang}`)).length;
              return (
                <button
                  key={lang}
                  onClick={() => setLanguageFilter(lang)}
                  className={`rounded-full px-2.5 py-0.5 text-xs transition-colors ${
                    languageFilter === lang
                      ? "bg-amber-500 text-white"
                      : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
                  }`}
                >
                  .{lang} ({count})
                </button>
              );
            })}
          </div>
        </div>
      )}

      {filteredHits && filteredHits.length === 0 && (
        <p className="rounded-lg border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-500 dark:border-zinc-700">
          {hits && hits.length > 0
            ? "No matches for this file type. Try a different filter."
            : "No matches. Make sure indexing has finished and embeddings have been written."}
        </p>
      )}

      {filteredHits && filteredHits.length > 0 && (
        <ul className="space-y-3">
          {filteredHits.map((h) => (
            <HitCard key={h.chunkId} hit={h} />
          ))}
        </ul>
      )}
    </section>
  );
}

function HitCard({ hit }: { hit: Hit }) {
  const [copied, setCopied] = useState(false);
  const displayContent = hit.content.length > 800
    ? hit.content.slice(0, 800) + "…"
    : hit.content;

  async function handleCopy() {
    await navigator.clipboard.writeText(hit.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <li className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex items-center gap-2 font-mono text-xs">
          <span className="font-semibold">
            {hit.symbolName ?? "(module)"}
          </span>
          <Badge variant="default">{hit.symbolType}</Badge>
          {hit.source && hit.source !== "expanded" && (
            <Badge variant={hit.source === "both" ? "ready" : "queued"}>
              {hit.source}
            </Badge>
          )}
        </div>
        <span className="text-xs text-zinc-500">
          score {hit.score.toFixed(3)}
        </span>
      </div>
      <p className="mt-1 font-mono text-xs text-zinc-500">
        {hit.filePath}:{hit.startLine}-{hit.endLine}
      </p>
      <div className="group relative mt-3">
        <button
          onClick={handleCopy}
          className="absolute right-2 top-2 rounded border border-zinc-200 bg-white/80 p-1 text-zinc-500 opacity-0 transition-opacity hover:text-zinc-900 group-hover:opacity-100 dark:border-zinc-700 dark:bg-zinc-900/80 dark:hover:text-zinc-100"
          aria-label="Copy code"
        >
          {copied ? <Check className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3" />}
        </button>
        <pre className="overflow-x-auto rounded-md bg-zinc-50 p-3 font-mono text-xs leading-relaxed text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100">
          {displayContent}
        </pre>
      </div>
    </li>
  );
}
