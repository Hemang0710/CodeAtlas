#!/usr/bin/env node
/**
 * CodeAtlas MCP server.
 *
 * Exposes the same retrieval surface our web UI uses (hybrid search,
 * graph traversal, file reading) as an MCP tool set so editors like
 * Claude Desktop and Cursor can ask the indexed code questions directly.
 *
 * Run with `pnpm mcp` (which loads .env.local via dotenv-cli). Clients
 * launch it over stdio — see DEPLOY.md for the Claude Desktop config.
 *
 * Why no auth: stdio transports run as subprocess of the client, so the
 * "trust boundary" is the OS user that runs the client. The DB connection
 * we open is the user's own DATABASE_URL.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { parseGithubUrl } from "@/lib/github";
import { hybridSearch } from "@/server/retrieval/hybrid";
import { getReverseImpact } from "@/server/retrieval/impact";
import { listFilesForRepo } from "@/server/services/files";
import { getFileDependencies } from "@/server/services/graph";
import { getRepoById, listRepos } from "@/server/services/repos";

/** Helper: stringify a JSON-able payload as the MCP "content text" item. */
function asTextContent(payload: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(payload, null, 2),
      },
    ],
  };
}

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    // We can't usefully serve anything without a DB connection.
    console.error(
      "[codeatlas-mcp] DATABASE_URL is not set. Did you point this process at .env.local?",
    );
    process.exit(1);
  }

  const server = new McpServer({
    name: "codeatlas",
    version: "0.1.0",
  });

  // -- list_repos -----------------------------------------------------------
  server.registerTool(
    "list_repos",
    {
      title: "List indexed repositories",
      description:
        "Show all repositories CodeAtlas has indexed, with their ids. Call this first so subsequent tools know which repoId to pass.",
      inputSchema: {},
    },
    async () => {
      const rows = await listRepos();
      return asTextContent({
        repos: rows.map((r) => ({
          id: r.id,
          name: r.name,
          githubUrl: r.githubUrl,
          status: r.status,
          fileCount: r.fileCount,
        })),
      });
    },
  );

  // -- search_code ---------------------------------------------------------
  server.registerTool(
    "search_code",
    {
      title: "Hybrid code search",
      description:
        "Hybrid semantic + keyword search over a repo's indexed chunks. Returns ranked snippets with file:line citations.",
      inputSchema: {
        repoId: z.string().uuid().describe("Repo id from list_repos."),
        query: z.string().min(1).max(500),
        k: z.number().int().min(1).max(20).optional(),
      },
    },
    async ({ repoId, query, k }) => {
      const hits = await hybridSearch({ repoId, query, topK: k ?? 8 });
      return asTextContent({
        hits: hits.map((h) => ({
          citation: `${h.filePath}:${h.startLine}-${h.endLine}`,
          file: h.filePath,
          startLine: h.startLine,
          endLine: h.endLine,
          symbol: h.symbolName,
          symbolType: h.symbolType,
          source: h.source,
          snippet: h.content.length > 800 ? h.content.slice(0, 800) + "…" : h.content,
        })),
      });
    },
  );

  // -- read_file -----------------------------------------------------------
  server.registerTool(
    "read_file",
    {
      title: "Read raw file lines",
      description:
        "Fetch raw lines from a file in the repo via the GitHub raw URL. Capped at 400 lines / 8 KB.",
      inputSchema: {
        repoId: z.string().uuid(),
        path: z.string().min(1).max(500),
        startLine: z.number().int().min(1).optional(),
        endLine: z.number().int().min(1).optional(),
      },
    },
    async ({ repoId, path, startLine, endLine }) => {
      const repo = await getRepoById(repoId);
      if (!repo) return asTextContent({ error: "Repo not found." });
      const parsed = parseGithubUrl(repo.githubUrl);
      if (!parsed) return asTextContent({ error: "Repo URL not parseable." });

      const branch = repo.defaultBranch || "main";
      const url = `https://raw.githubusercontent.com/${parsed.owner}/${parsed.repo}/${branch}/${path}`;
      const headers: Record<string, string> = { "User-Agent": "CodeAtlas-MCP" };
      if (process.env.GITHUB_TOKEN) {
        headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
      }

      const res = await fetch(url, { headers });
      if (!res.ok) {
        return asTextContent({ error: `GitHub raw fetch failed (${res.status}).` });
      }
      const text = await res.text();
      const lines = text.split("\n");
      const start = Math.max(1, startLine ?? 1);
      const desiredEnd = endLine ?? start + 399;
      const end = Math.min(lines.length, start + 399, desiredEnd);
      const slice = lines.slice(start - 1, end).join("\n");
      return asTextContent({
        file: path,
        startLine: start,
        endLine: end,
        totalLines: lines.length,
        content: slice.length > 8000 ? slice.slice(0, 8000) + "…" : slice,
      });
    },
  );

  // -- list_files ----------------------------------------------------------
  server.registerTool(
    "list_files",
    {
      title: "List repo files",
      description:
        "List a repo's indexed files, optionally filtered by directory prefix or language.",
      inputSchema: {
        repoId: z.string().uuid(),
        directory: z.string().max(500).optional(),
        language: z.string().max(50).optional(),
      },
    },
    async ({ repoId, directory, language }) => {
      const all = await listFilesForRepo(repoId);
      const prefix = directory
        ? directory.endsWith("/")
          ? directory
          : directory + "/"
        : "";
      const filtered = all.filter((f) => {
        if (prefix && !f.path.startsWith(prefix) && f.path !== prefix.slice(0, -1)) {
          return false;
        }
        if (language && f.language !== language) return false;
        return true;
      });
      const limit = 200;
      return asTextContent({
        files: filtered.slice(0, limit).map((f) => ({
          path: f.path,
          language: f.language,
          sizeBytes: f.sizeBytes,
        })),
        totalMatches: filtered.length,
        truncated: filtered.length > limit,
      });
    },
  );

  // -- get_dependencies ----------------------------------------------------
  server.registerTool(
    "get_dependencies",
    {
      title: "Direct imports + importers",
      description:
        "For a given file, return the files it imports and the files that directly import it (1-hop both ways).",
      inputSchema: {
        repoId: z.string().uuid(),
        path: z.string().min(1).max(500),
      },
    },
    async ({ repoId, path }) => {
      const deps = await getFileDependencies({ repoId, path, limit: 50 });
      if (!deps.exists) return asTextContent({ error: `File not found: ${path}` });
      return asTextContent({
        file: path,
        imports: deps.imports,
        importedBy: deps.importedBy,
      });
    },
  );

  // -- get_impact ----------------------------------------------------------
  server.registerTool(
    "get_impact",
    {
      title: "Transitive blast radius",
      description:
        "What breaks if I change this file? Reverse-BFS over the import graph up to `depth` hops (default 3, max 5). Each result is tagged with the depth at which it was first reached.",
      inputSchema: {
        repoId: z.string().uuid(),
        path: z.string().min(1).max(500),
        depth: z.number().int().min(1).max(5).optional(),
      },
    },
    async ({ repoId, path, depth }) => {
      const result = await getReverseImpact({ repoId, path, depth });
      if (!result.found) return asTextContent({ error: `File not found: ${path}` });
      return asTextContent({
        file: path,
        reachedDepth: result.reachedDepth,
        truncated: result.truncated,
        affectedCount: result.affected.length,
        affected: result.affected.slice(0, 100).map((a) => ({
          file: a.path,
          depth: a.depth,
          language: a.language,
        })),
      });
    },
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Log to stderr so it doesn't pollute the stdio JSON-RPC stream.
  console.error("[codeatlas-mcp] ready");
}

main().catch((err) => {
  console.error("[codeatlas-mcp] fatal:", err);
  process.exit(1);
});
