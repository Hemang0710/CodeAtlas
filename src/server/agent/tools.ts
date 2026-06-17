import { tool } from "ai";
import { z } from "zod";

import { parseGithubUrl } from "@/lib/github";
import { hybridSearch } from "@/server/retrieval/hybrid";
import { getReverseImpact } from "@/server/retrieval/impact";
import { listFilesForRepo } from "@/server/services/files";
import { getFileDependencies } from "@/server/services/graph";
import { type Repo } from "@/server/db/schema";

/**
 * Tools the Claude agent can call to interrogate a single repo.
 *
 * Each tool:
 *   - takes a Zod-validated input (so a malformed call from the model can't
 *     crash the worker — the SDK surfaces it as an InvalidToolInputError)
 *   - returns a JSON-serialisable result the SDK feeds back to the model
 *   - is output-capped so the model can't accidentally pull in 1 MB of file
 *     contents and blow its own context window
 *
 * The whole bundle is closed over a single `repo` so the tools can't read
 * across repos: the agent for repo A literally has no surface to read
 * from repo B. (Phase 7 cross-repo work would lift this constraint.)
 *
 * We export the Zod schemas separately too so tests can exercise them
 * without depending on the SDK's `FlexibleSchema` wrapper shape.
 */

/** Hard caps. Tuned to keep tool output ≤ ~2k tokens each. */
const SEARCH_MAX_HITS = 8;
const SEARCH_SNIPPET_CHARS = 800;
const READ_FILE_MAX_LINES = 400;
const READ_FILE_MAX_CHARS = 8000;
const LIST_FILES_LIMIT = 200;
const DEPENDENCIES_LIMIT = 50;

export const toolSchemas = {
  search_code: z.object({
    query: z
      .string()
      .min(1)
      .max(500)
      .describe(
        "Natural-language question or exact identifier. Specific is better than vague.",
      ),
    k: z
      .number()
      .int()
      .min(1)
      .max(SEARCH_MAX_HITS)
      .optional()
      .describe(`How many top hits to return (default ${SEARCH_MAX_HITS}).`),
  }),
  read_file: z.object({
    path: z
      .string()
      .min(1)
      .max(500)
      .describe("Repository-relative path, e.g. 'src/payments/stripe.ts'."),
    startLine: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe("1-based inclusive start line (default 1)."),
    endLine: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe(
        `1-based inclusive end line (default startLine + ${READ_FILE_MAX_LINES - 1}).`,
      ),
  }),
  list_files: z.object({
    directory: z
      .string()
      .max(500)
      .optional()
      .describe("Optional path prefix, e.g. 'src/components'. Trailing slash is fine."),
    language: z
      .string()
      .max(50)
      .optional()
      .describe(
        "Optional language label, e.g. 'typescript', 'python'. Same labels as `detectLanguage`.",
      ),
  }),
  get_dependencies: z.object({
    path: z
      .string()
      .min(1)
      .max(500)
      .describe("Repository-relative path of the file you're asking about."),
  }),
  get_impact: z.object({
    path: z
      .string()
      .min(1)
      .max(500)
      .describe(
        "Repository-relative path of the file you want the blast radius for.",
      ),
    depth: z
      .number()
      .int()
      .min(1)
      .max(5)
      .optional()
      .describe("Hops of reverse traversal (default 3, max 5)."),
  }),
} as const;

export interface BuildToolsArgs {
  repo: Pick<Repo, "id" | "githubUrl" | "defaultBranch" | "name">;
}

export function buildAgentTools({ repo }: BuildToolsArgs) {
  const parsed = parseGithubUrl(repo.githubUrl);

  return {
    search_code: tool({
      description:
        "Search this repository's indexed code chunks. Combines vector (semantic) and keyword search. Use for 'where is X', 'how does Y work', or for finding any specific function/class/identifier. Returns ranked snippets with file:line citations you MUST cite in your answer.",
      inputSchema: toolSchemas.search_code,
      execute: async ({ query, k }) => {
        const hits = await hybridSearch({
          repoId: repo.id,
          query,
          topK: k ?? SEARCH_MAX_HITS,
        });
        return {
          hits: hits.map((h) => ({
            citation: `${h.filePath}:${h.startLine}-${h.endLine}`,
            file: h.filePath,
            startLine: h.startLine,
            endLine: h.endLine,
            symbol: h.symbolName,
            symbolType: h.symbolType,
            source: h.source,
            snippet:
              h.content.length > SEARCH_SNIPPET_CHARS
                ? h.content.slice(0, SEARCH_SNIPPET_CHARS) + "…"
                : h.content,
          })),
        };
      },
    }),

    read_file: tool({
      description:
        "Read raw lines from a file in the repository. Use this after `search_code` returns a hit when you need surrounding context the snippet didn't include. Capped at 400 lines / 8 KB per call.",
      inputSchema: toolSchemas.read_file,
      execute: async ({ path, startLine, endLine }) => {
        if (!parsed) {
          return { error: "Repo URL is not a recognisable GitHub URL." };
        }
        const branch = repo.defaultBranch || "main";
        const url = `https://raw.githubusercontent.com/${parsed.owner}/${parsed.repo}/${branch}/${path}`;
        const headers: Record<string, string> = {
          "User-Agent": "CodeAtlas-agent",
        };
        if (process.env.GITHUB_TOKEN) {
          headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
        }

        const res = await fetch(url, { headers });
        if (res.status === 404) {
          return {
            error: `File not found: ${path}. Did you mean a different path? Try list_files.`,
          };
        }
        if (!res.ok) {
          return { error: `GitHub raw fetch failed (${res.status}).` };
        }

        const text = await res.text();
        const lines = text.split("\n");
        const start = Math.max(1, startLine ?? 1);
        const desiredEnd = endLine ?? start + READ_FILE_MAX_LINES - 1;
        const end = Math.min(
          lines.length,
          start + READ_FILE_MAX_LINES - 1,
          desiredEnd,
        );
        const slice = lines.slice(start - 1, end).join("\n");
        const truncated =
          slice.length > READ_FILE_MAX_CHARS
            ? slice.slice(0, READ_FILE_MAX_CHARS) + "…"
            : slice;

        return {
          file: path,
          startLine: start,
          endLine: end,
          totalLines: lines.length,
          content: truncated,
        };
      },
    }),

    list_files: tool({
      description:
        "List files in the repository, optionally filtered by directory prefix or language. Useful as a discovery step before search_code or read_file.",
      inputSchema: toolSchemas.list_files,
      execute: async ({ directory, language }) => {
        const all = await listFilesForRepo(repo.id);
        const prefix = directory
          ? directory.endsWith("/")
            ? directory
            : directory + "/"
          : "";

        const filtered = all.filter((f) => {
          if (
            prefix &&
            !f.path.startsWith(prefix) &&
            f.path !== prefix.slice(0, -1)
          ) {
            return false;
          }
          if (language && f.language !== language) return false;
          return true;
        });

        const truncated = filtered.length > LIST_FILES_LIMIT;
        return {
          files: filtered.slice(0, LIST_FILES_LIMIT).map((f) => ({
            path: f.path,
            language: f.language,
            sizeBytes: f.sizeBytes,
          })),
          totalMatches: filtered.length,
          truncated,
        };
      },
    }),

    get_dependencies: tool({
      description:
        "List the files that a given file imports, and the files that DIRECTLY import it (1 hop in both directions). For TRANSITIVE blast radius use get_impact instead.",
      inputSchema: toolSchemas.get_dependencies,
      execute: async ({ path }) => {
        const deps = await getFileDependencies({
          repoId: repo.id,
          path,
          limit: DEPENDENCIES_LIMIT,
        });
        if (!deps.exists) {
          return {
            error: `File not found in index: ${path}. Try list_files to discover the right path.`,
          };
        }
        return {
          file: path,
          imports: deps.imports,
          importedBy: deps.importedBy,
        };
      },
    }),

    get_impact: tool({
      description:
        "Reverse blast-radius: every file that transitively imports a target file, up to `depth` hops (default 3). Use for 'what breaks if I change X' questions. Results carry the depth at which each file was first reached (1 = direct importer, 2 = importer-of-importer, etc.).",
      inputSchema: toolSchemas.get_impact,
      execute: async ({ path, depth }) => {
        const result = await getReverseImpact({
          repoId: repo.id,
          path,
          depth,
        });
        if (!result.found) {
          return {
            error: `File not found in index: ${path}. Try list_files first.`,
          };
        }
        return {
          file: path,
          reachedDepth: result.reachedDepth,
          truncated: result.truncated,
          affectedCount: result.affected.length,
          affected: result.affected.slice(0, 100).map((a) => ({
            file: a.path,
            depth: a.depth,
            language: a.language,
          })),
        };
      },
    }),
  };
}

export type AgentTools = ReturnType<typeof buildAgentTools>;
