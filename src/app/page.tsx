import { GitFork, Map, MessageSquare, Network, Search, Zap } from "lucide-react";

import { RepoList } from "@/components/repo-list";
import { listRepos } from "@/server/services/repos";

export const dynamic = "force-dynamic";

const FEATURES = [
  {
    icon: MessageSquare,
    title: "Natural language Q&A",
    description:
      "Ask anything in plain English. The AI searches the codebase, reads relevant files, and explains what it found — complete with file and line references.",
  },
  {
    icon: Search,
    title: "Hybrid retrieval",
    description:
      "Every answer is grounded by semantic vector search plus full-text keyword search, merged via Reciprocal Rank Fusion so nothing important gets missed.",
  },
  {
    icon: Network,
    title: "Architecture diagrams",
    description:
      "Generates interactive Mermaid diagrams of file-level import graphs so you can see how modules connect at a glance.",
  },
  {
    icon: GitFork,
    title: "Import graph & impact",
    description:
      "Traces dependency edges across files. Ask what a change would break before you make it.",
  },
  {
    icon: Zap,
    title: "Onboarding guide",
    description:
      "Auto-generates a plain-English guide to any repo — entry points, key abstractions, and how to run it — in under a minute.",
  },
  {
    icon: Map,
    title: "MCP server",
    description:
      "Exposes every tool as an MCP server so Claude Desktop or any MCP client can query your indexed repos from a chat window.",
  },
];

const SUGGESTED = [
  { label: "colinhacks/zod", url: "https://github.com/colinhacks/zod" },
  { label: "sindresorhus/is", url: "https://github.com/sindresorhus/is" },
  {
    label: "nicolo-ribaudo/tc39-proposal-async-context",
    url: "https://github.com/nicolo-ribaudo/tc39-proposal-async-context",
  },
  { label: "withastro/astro", url: "https://github.com/withastro/astro" },
];

export default async function Home() {
  const initial = await listRepos();

  return (
    <div className="flex flex-col">
      {/* ── Hero ── */}
      <section className="border-b border-zinc-200 dark:border-zinc-800 bg-gradient-to-b from-zinc-50 to-white dark:from-zinc-900 dark:to-zinc-950">
        <div className="mx-auto max-w-3xl px-6 py-16 text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-400">
            <Map className="h-3.5 w-3.5" />
            Powered by Gemini 2.5 Flash · free, no credit card
          </div>
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
            Ask any GitHub repo
            <br />
            <span className="text-amber-500">a question.</span>
          </h1>
          <p className="mt-4 text-base text-zinc-600 dark:text-zinc-400 max-w-xl mx-auto leading-relaxed">
            CodeAtlas indexes a repository, maps every file and symbol, then
            answers natural-language questions with cited code references —
            like a senior engineer who has read every line.
          </p>
        </div>
      </section>

      {/* ── Index form ── */}
      <section className="mx-auto w-full max-w-3xl px-6 py-10">
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

        {/* Suggested repos */}
        <div className="mt-4">
          <p className="mb-2 text-xs text-zinc-500">
            Not sure what to try? Click one:
          </p>
          <div className="flex flex-wrap gap-2">
            {SUGGESTED.map((s) => (
              <a
                key={s.url}
                href={`/?prefill=${encodeURIComponent(s.url)}`}
                className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs text-zinc-600 hover:border-zinc-400 hover:text-zinc-900 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400 dark:hover:border-zinc-600 dark:hover:text-zinc-100 transition-colors"
              >
                {s.label}
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section className="border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/40">
        <div className="mx-auto max-w-5xl px-6 py-14">
          <h2 className="mb-2 text-center text-2xl font-semibold tracking-tight">
            Everything you need to understand a codebase
          </h2>
          <p className="mb-10 text-center text-sm text-zinc-500">
            Paste the URL, wait ~30 seconds, then ask anything.
          </p>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => {
              const Icon = f.icon;
              return (
                <div
                  key={f.title}
                  className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950"
                >
                  <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-amber-50 dark:bg-amber-950/40">
                    <Icon className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                  </div>
                  <h3 className="mb-1 text-sm font-semibold">{f.title}</h3>
                  <p className="text-xs leading-relaxed text-zinc-500">
                    {f.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section className="border-t border-zinc-200 dark:border-zinc-800">
        <div className="mx-auto max-w-3xl px-6 py-14">
          <h2 className="mb-10 text-center text-2xl font-semibold tracking-tight">
            How it works
          </h2>
          <ol className="space-y-8">
            {[
              {
                step: "1",
                title: "Paste a public GitHub URL",
                body: "Any public repo works. We check the size upfront and reject repos over 100 MB to stay within free-tier limits.",
              },
              {
                step: "2",
                title: "We clone, parse, and embed",
                body: "The background worker clones the repo, walks every source file, parses it with tree-sitter into semantic chunks (functions, classes, methods), and embeds each chunk into a vector database. Unchanged files on re-index are skipped automatically.",
              },
              {
                step: "3",
                title: "Ask anything",
                body: "Once indexed, open the repo and type a question. The AI runs up to 8 tool-call steps — searching code, reading files, following import edges — before writing a cited answer. Diagrams and flow charts render inline.",
              },
            ].map((item) => (
              <li key={item.step} className="flex gap-5">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-100 text-sm font-semibold text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
                  {item.step}
                </div>
                <div>
                  <h3 className="mb-1 font-semibold">{item.title}</h3>
                  <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                    {item.body}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>
    </div>
  );
}

