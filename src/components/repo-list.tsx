"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useState } from "react";
import { Trash2 } from "lucide-react";

import { RepoForm } from "@/components/repo-form";
import { RepoStatusBadge } from "@/components/repo-status-badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * Home-page view: form + repo list + polling.
 *
 * Polling: while any repo's job status is one of {queued, cloning, parsing,
 * embedding, indexing} we re-fetch /api/repos every 2s. Once everything is
 * "done" or "failed" we go silent — no need to hammer the DB when nothing
 * is moving.
 */

interface RepoRow {
  id: string;
  name: string;
  githubUrl: string;
  status: string;
  fileCount: number;
  latestJobStatus: string | null;
  latestJobProgress: number;
  latestJobError: string | null;
  updatedAt: string;
}

const ACTIVE_STATUSES = new Set([
  "queued",
  "cloning",
  "parsing",
  "embedding",
  "indexing",
]);

export function RepoList({ initial }: { initial: RepoRow[] }) {
  const [repos, setRepos] = useState<RepoRow[]>(initial);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/repos", { cache: "no-store" });
      if (res.ok) {
        const json = (await res.json()) as { repos: RepoRow[] };
        setRepos(json.repos);
      }
    } finally {
      setRefreshing(false);
    }
  }, []);

  // Poll while anything is active. The dependency is a primitive (bool), not
  // the whole array, so the effect only re-arms when active-state changes.
  const anyActive = repos.some(
    (r) =>
      ACTIVE_STATUSES.has(r.status) ||
      (r.latestJobStatus !== null &&
        ACTIVE_STATUSES.has(r.latestJobStatus)),
  );
  useEffect(() => {
    if (!anyActive) return;
    const id = setInterval(refresh, 2000);
    return () => clearInterval(id);
  }, [anyActive, refresh]);

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Delete ${name}? This removes all indexed files for it.`)) {
      return;
    }
    const res = await fetch(`/api/repos/${id}`, { method: "DELETE" });
    if (res.ok) {
      setRepos((prev) => prev.filter((r) => r.id !== id));
    } else {
      alert("Delete failed.");
    }
  }

  return (
    <div className="space-y-8">
      <Suspense fallback={<div className="h-10" />}>
        <RepoForm onCreated={refresh} />
      </Suspense>

      {repos.length === 0 ? (
        <p className="rounded-lg border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500 dark:border-zinc-700">
          No repos yet. Paste a GitHub URL above to index your first.
        </p>
      ) : (
        <div className="space-y-3">
          {repos.map((r) => (
            <RepoRowCard
              key={r.id}
              row={r}
              onDelete={() => handleDelete(r.id, r.name)}
            />
          ))}
        </div>
      )}

      {refreshing && (
        <p className="text-xs text-zinc-400">Refreshing…</p>
      )}
    </div>
  );
}

function RepoRowCard({ row, onDelete }: { row: RepoRow; onDelete: () => void }) {
  const displayStatus = row.latestJobStatus ?? row.status;
  const isActive =
    ACTIVE_STATUSES.has(row.status) ||
    (row.latestJobStatus !== null &&
      ACTIVE_STATUSES.has(row.latestJobStatus));

  return (
    <Card className="transition-colors hover:border-zinc-300 dark:hover:border-zinc-700">
      <div className="flex items-start justify-between gap-4 p-5">
        <Link
          href={`/repos/${row.id}`}
          className="min-w-0 flex-1 space-y-1 outline-none"
        >
          <CardHeader className="p-0">
            <div className="flex items-center gap-2">
              <CardTitle className="truncate">{row.name}</CardTitle>
              <RepoStatusBadge status={displayStatus} />
            </div>
            <CardDescription className="truncate">
              {row.githubUrl}
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0 pt-2">
            {row.latestJobError ? (
              <p className="truncate text-xs text-red-600 dark:text-red-400">
                {row.latestJobError}
              </p>
            ) : isActive ? (
              <div className="space-y-1">
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                  <div
                    className="h-full bg-amber-500 transition-[width]"
                    style={{ width: `${row.latestJobProgress}%` }}
                  />
                </div>
                <p className="text-xs text-zinc-500">
                  {row.latestJobProgress}% — {displayStatus}
                </p>
              </div>
            ) : (
              <p className="text-xs text-zinc-500">
                {row.fileCount.toLocaleString()} file
                {row.fileCount === 1 ? "" : "s"} indexed
              </p>
            )}
          </CardContent>
        </Link>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Delete ${row.name}`}
          onClick={(e) => {
            e.preventDefault();
            onDelete();
          }}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </Card>
  );
}
