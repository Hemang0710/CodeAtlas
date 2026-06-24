"use client";

import { useState, type FormEvent } from "react";
import { AlertTriangle, GitBranch, Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface ImpactFile {
  fileId: string;
  path: string;
  language: string | null;
  depth: number;
}

interface ImpactResult {
  root: string;
  affected: ImpactFile[];
  reachedDepth: number;
  truncated: boolean;
}

const DEPTH_COLORS: Record<number, string> = {
  1: "border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950/40",
  2: "border-orange-300 bg-orange-50 dark:border-orange-800 dark:bg-orange-950/40",
  3: "border-yellow-300 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-950/40",
};

export function ImpactAnalysis({ repoId }: { repoId: string }) {
  const [filePath, setFilePath] = useState("");
  const [depth, setDepth] = useState(3);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImpactResult | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const params = new URLSearchParams({ path: filePath.trim(), depth: String(depth) });
      const res = await fetch(`/api/repos/${repoId}/impact?${params.toString()}`);
      const json = (await res.json()) as ImpactResult & { error?: string };
      if (!res.ok) {
        throw new Error(json.error ?? `Impact analysis failed (HTTP ${res.status})`);
      }
      setResult(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setResult(null);
    } finally {
      setSubmitting(false);
    }
  }

  const grouped = result
    ? Object.entries(
        result.affected.reduce<Record<number, ImpactFile[]>>((acc, f) => {
          (acc[f.depth] ??= []).push(f);
          return acc;
        }, {})
      ).sort(([a], [b]) => Number(a) - Number(b))
    : [];

  return (
    <section className="space-y-4">
      <header className="flex items-center gap-2">
        <GitBranch className="h-4 w-4 text-zinc-500" />
        <h2 className="text-sm font-semibold">Impact Analysis</h2>
      </header>

      <p className="text-xs text-zinc-500">
        Enter a file path to see what other files depend on it. Shows the &quot;blast radius&quot; of a change.
      </p>

      <form onSubmit={handleSubmit} className="space-y-2">
        <div className="flex gap-2">
          <Input
            placeholder="src/server/db/schema.ts"
            value={filePath}
            onChange={(e) => setFilePath(e.target.value)}
            disabled={submitting}
          />
          <select
            value={depth}
            onChange={(e) => setDepth(Number(e.target.value))}
            className="rounded-md border border-zinc-200 bg-transparent px-2 py-1.5 text-sm dark:border-zinc-700"
          >
            <option value={1}>1 hop</option>
            <option value={2}>2 hops</option>
            <option value={3}>3 hops</option>
            <option value={5}>5 hops</option>
          </select>
          <Button type="submit" disabled={submitting || filePath.trim().length === 0}>
            <Search className="h-4 w-4" />
            {submitting ? "Analyzing..." : "Analyze"}
          </Button>
        </div>
        {error && (
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        )}
      </form>

      {result && result.affected.length === 0 && (
        <p className="rounded-lg border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-500 dark:border-zinc-700">
          No files depend on <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">{result.root}</code>. It&apos;s a leaf node.
        </p>
      )}

      {result && result.affected.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            <span>
              <strong>{result.affected.length}</strong> file{result.affected.length === 1 ? "" : "s"} affected
              {result.truncated && " (truncated — too many dependencies)"}
            </span>
          </div>

          {grouped.map(([depthStr, files]) => {
            const d = Number(depthStr);
            const colorClass = DEPTH_COLORS[d] ?? "border-zinc-300 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900";
            return (
              <div key={d} className="space-y-1">
                <h3 className="text-xs font-semibold text-zinc-500">
                  Depth {d} — {d === 1 ? "direct importers" : `${d} hops away`}
                </h3>
                <ul className="space-y-1">
                  {files.map((f) => (
                    <li
                      key={f.fileId}
                      className={`flex items-center justify-between rounded-md border px-3 py-2 ${colorClass}`}
                    >
                      <span className="font-mono text-xs truncate">{f.path}</span>
                      {f.language && (
                        <Badge variant="default">{f.language}</Badge>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
