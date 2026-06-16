import Link from "next/link";
import { notFound } from "next/navigation";

import { FileList } from "@/components/file-list";
import { RepoSearch } from "@/components/repo-search";
import { RepoStatusBadge } from "@/components/repo-status-badge";
import { countEmbeddedChunks } from "@/server/retrieval/vector";
import { listFilesForRepo } from "@/server/services/files";
import { getLatestJob } from "@/server/services/jobs";
import { getRepoById } from "@/server/services/repos";

export const dynamic = "force-dynamic";

/**
 * /repos/:id — server component. Fetches the repo, its latest job (so the
 * header status pill matches the homepage), and the file list in parallel.
 */
export default async function RepoDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // UUID format check is cheap and avoids a DB round-trip for obvious junk.
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    notFound();
  }

  const [repo, latestJob, files, embedCounts] = await Promise.all([
    getRepoById(id),
    getLatestJob(id),
    listFilesForRepo(id),
    countEmbeddedChunks(id),
  ]);

  if (!repo) notFound();

  const displayStatus = latestJob?.status ?? repo.status;
  const searchReady = embedCounts.embedded > 0;

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-6 py-12">
      <div>
        <Link
          href="/"
          className="text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
        >
          ← All repos
        </Link>
      </div>

      <header className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">
            {repo.name}
          </h1>
          <RepoStatusBadge status={displayStatus} />
        </div>
        <a
          href={repo.githubUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-zinc-500 underline-offset-4 hover:underline"
        >
          {repo.githubUrl}
        </a>
        <p className="text-xs text-zinc-500">
          {files.length.toLocaleString()} file
          {files.length === 1 ? "" : "s"} indexed ·{" "}
          {embedCounts.embedded.toLocaleString()} / {embedCounts.total.toLocaleString()}{" "}
          chunks embedded
          {repo.lastIndexedAt
            ? ` · last indexed ${repo.lastIndexedAt.toISOString()}`
            : ""}
        </p>
        {latestJob?.error && (
          <p className="text-sm text-red-600 dark:text-red-400">
            {latestJob.error}
          </p>
        )}
      </header>

      {searchReady ? (
        <RepoSearch repoId={repo.id} />
      ) : (
        <p className="rounded-lg border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-500 dark:border-zinc-700">
          Search is offline for this repo — no chunks have been embedded yet.
          Make sure <code>VOYAGE_API_KEY</code> is set in <code>.env.local</code>{" "}
          and re-index from the homepage.
        </p>
      )}

      {files.length === 0 ? (
        <p className="rounded-lg border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500 dark:border-zinc-700">
          {displayStatus === "failed"
            ? "Indexing failed for this repo — see the error above."
            : "No files indexed yet. The worker may still be running; come back in a moment."}
        </p>
      ) : (
        <FileList
          files={files.map((f) => ({
            id: f.id,
            path: f.path,
            language: f.language,
            sizeBytes: f.sizeBytes,
          }))}
        />
      )}
    </main>
  );
}
