import Link from "next/link";
import { notFound } from "next/navigation";

import { RepoGuide } from "@/components/repo-guide";
import { RepoNav } from "@/components/repo-nav";
import { getRepoById } from "@/server/services/repos";

export const dynamic = "force-dynamic";

/**
 * /repos/:id/guide — server fetches the cached guide; client owns the
 * "generate" / "regenerate" actions.
 */
export default async function RepoGuidePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const repo = await getRepoById(id);
  if (!repo) notFound();

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-6 py-12">
      <div>
        <Link
          href="/"
          className="text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
        >
          ← All repos
        </Link>
      </div>

      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">{repo.name}</h1>
        <p className="text-xs text-zinc-500">
          Auto-generated onboarding guide. Updated on demand — not every reindex.
        </p>
      </header>

      <RepoNav repoId={repo.id} active="guide" />

      <RepoGuide
        repoId={repo.id}
        initialMarkdown={repo.onboardingGuide ?? null}
        initialGeneratedAt={repo.onboardingGuideGeneratedAt?.toISOString() ?? null}
      />
    </main>
  );
}
