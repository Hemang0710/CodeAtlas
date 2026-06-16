import { RepoList } from "@/components/repo-list";
import { listRepos } from "@/server/services/repos";

/**
 * Server component. We fetch repos once on the server so the page paints
 * instantly with real data; the client `RepoList` then handles polling +
 * mutations. No `useEffect` flash, no loading spinner on first load.
 */
export const dynamic = "force-dynamic";

export default async function Home() {
  const initial = await listRepos();

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-6 py-12">
      <header className="space-y-2">
        <p className="font-mono text-xs uppercase tracking-widest text-zinc-500">
          phase 1 · ingestion
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">CodeAtlas</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Paste a public GitHub repository URL. The worker will clone it,
          walk every source file, and store its inventory in the database.
          Live progress shows below.
        </p>
      </header>

      <RepoList
        initial={initial.map((r) => ({
          id: r.id,
          name: r.name,
          githubUrl: r.githubUrl,
          status: r.status,
          fileCount: r.fileCount,
          latestJobStatus: r.latestJobStatus,
          latestJobProgress: r.latestJobProgress,
          latestJobError: r.latestJobError,
          updatedAt: r.updatedAt.toISOString(),
        }))}
      />
    </main>
  );
}
