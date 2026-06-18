import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { RepoPrReview } from "@/components/repo-pr-review";
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
  return { title: repo ? `PR Review — ${repo.name}` : "PR Review" };
}

export default async function PrReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const repo = await getRepoById(id);
  if (!repo) notFound();

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-6 py-10">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors w-fit"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        All repos
      </Link>

      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{repo.name}</h1>
        <a
          href={repo.githubUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-zinc-500 underline-offset-4 hover:underline truncate"
        >
          {repo.githubUrl}
        </a>
      </header>

      <RepoNav repoId={repo.id} active="pr-review" />

      <RepoPrReview repoId={repo.id} />
    </div>
  );
}
