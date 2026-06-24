import Link from "next/link";
import { notFound } from "next/navigation";

import { ImpactAnalysis } from "@/components/impact-analysis";
import { RepoNav } from "@/components/repo-nav";
import { getRepoById } from "@/server/services/repos";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const repo = await getRepoById(id);
  return { title: repo ? `Impact · ${repo.name}` : "Impact" };
}

export default async function RepoImpactPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const repo = await getRepoById(id);
  if (!repo) notFound();

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-6 py-12">
      <div>
        <Link
          href="/"
          className="text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
        >
          &larr; All repos
        </Link>
      </div>

      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">{repo.name}</h1>
        <p className="text-xs text-zinc-500">
          Analyze the blast radius of changing any file in this repository.
        </p>
      </header>

      <RepoNav repoId={repo.id} active="impact" />

      <ImpactAnalysis repoId={repo.id} />
    </main>
  );
}
