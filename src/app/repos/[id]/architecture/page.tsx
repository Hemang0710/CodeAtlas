import Link from "next/link";
import { notFound } from "next/navigation";

import { MermaidDiagram } from "@/components/mermaid-diagram";
import { RepoNav } from "@/components/repo-nav";
import { buildMermaidGraph, pickMermaidMode } from "@/lib/mermaid-graph";
import { getRepoGraph } from "@/server/services/graph";
import { getRepoById } from "@/server/services/repos";

/**
 * /repos/:id/architecture
 *
 * Fetches the file-graph server-side, converts to Mermaid, and ships it to
 * a client component for rendering. We do the conversion server-side so
 * the client doesn't have to pull anything from /api/graph at all.
 */
export const dynamic = "force-dynamic";

export default async function RepoArchitecturePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const repo = await getRepoById(id);
  if (!repo) notFound();

  const graph = await getRepoGraph(repo.id);
  const mode = pickMermaidMode(graph.nodes.length);
  const source = buildMermaidGraph({
    nodes: graph.nodes,
    edges: graph.edges,
  });

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-6 py-12">
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
          {graph.nodes.length.toLocaleString()} files ·{" "}
          {graph.edges.length.toLocaleString()} import edges · rendering in{" "}
          <span className="font-mono">{mode}</span> mode
          {mode === "directories" && " (collapsed because the repo is large)"}
        </p>
      </header>

      <RepoNav repoId={repo.id} active="architecture" />

      {graph.nodes.length === 0 ? (
        <p className="rounded-lg border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500 dark:border-zinc-700">
          No files indexed yet for this repo.
        </p>
      ) : (
        <MermaidDiagram source={source} />
      )}
    </main>
  );
}
