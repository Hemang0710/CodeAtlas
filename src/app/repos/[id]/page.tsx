import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertCircle, ArrowLeft, FileCode2, Layers } from "lucide-react";

import { FileList } from "@/components/file-list";
import { RepoChat } from "@/components/repo-chat";
import { RepoNav } from "@/components/repo-nav";
import { RepoSearch } from "@/components/repo-search";
import { RepoStatusBadge } from "@/components/repo-status-badge";
import { countEmbeddedChunks } from "@/server/retrieval/vector";
import { listFilesForRepo } from "@/server/services/files";
import { getLatestJob } from "@/server/services/jobs";
import { getRepoById } from "@/server/services/repos";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const repo = await getRepoById(id);
  return { title: repo?.name ?? "Repo" };
}

export default async function RepoDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

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
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-6 py-10">
      {/* breadcrumb */}
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors w-fit"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        All repos
      </Link>

      {/* repo header */}
      <header className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-semibold tracking-tight truncate">
                {repo.name}
              </h1>
              <RepoStatusBadge status={displayStatus} />
            </div>
            <a
              href={repo.githubUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 block text-sm text-zinc-500 underline-offset-4 hover:underline truncate"
            >
              {repo.githubUrl}
            </a>
          </div>
        </div>

        <div className="flex flex-wrap gap-4 text-xs text-zinc-500">
          <span className="flex items-center gap-1">
            <FileCode2 className="h-3.5 w-3.5" />
            {files.length.toLocaleString()} file{files.length === 1 ? "" : "s"} indexed
          </span>
          <span className="flex items-center gap-1">
            <Layers className="h-3.5 w-3.5" />
            {embedCounts.embedded.toLocaleString()} / {embedCounts.total.toLocaleString()} chunks embedded
          </span>
          {repo.lastIndexedAt && (
            <span>
              last indexed{" "}
              {new Date(repo.lastIndexedAt).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </span>
          )}
        </div>

        {latestJob?.error && (
          <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{latestJob.error}</span>
          </div>
        )}
      </header>

      <RepoNav repoId={repo.id} active="chat" />

      {/* chat + search — only available once chunks are embedded */}
      {searchReady ? (
        <>
          <RepoChat repoId={repo.id} />
          <hr className="border-zinc-200 dark:border-zinc-800" />
          <RepoSearch repoId={repo.id} />
        </>
      ) : (
        <div className="rounded-xl border border-dashed border-zinc-300 p-8 dark:border-zinc-700">
          <h3 className="mb-2 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
            Chat &amp; search are not available yet
          </h3>
          <p className="text-sm text-zinc-500 leading-relaxed">
            No chunks have been embedded for this repo. To fix this:
          </p>
          <ol className="mt-3 space-y-1 text-sm text-zinc-500 list-decimal list-inside">
            <li>
              Make sure <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">GOOGLE_GENERATIVE_AI_API_KEY</code> is set in{" "}
              <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">.env.local</code>
            </li>
            <li>
              Run <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">docker compose up -d</code> to start Redis
            </li>
            <li>
              Run <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">pnpm worker</code> in a separate terminal
            </li>
            <li>Re-submit the repo from the homepage</li>
          </ol>
        </div>
      )}

      {/* file list */}
      {files.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 p-8 text-center dark:border-zinc-700">
          <p className="text-sm text-zinc-500">
            {displayStatus === "failed"
              ? "Indexing failed — see the error above."
              : "No files indexed yet. The worker may still be running; refresh in a moment."}
          </p>
        </div>
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
    </div>
  );
}
