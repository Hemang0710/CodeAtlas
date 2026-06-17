import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/server/db/client";
import { fileEdges, files } from "@/server/db/schema";

/**
 * Build a node + edge graph for a repo. Phase 4 returns this raw via
 * `/api/repos/:id/graph`; Phase 6 will visualize it with Mermaid /
 * react-force-graph. Phase 5's agent uses it via the `get_dependencies`
 * tool.
 *
 * "Node" = a file. "Edge" = an import (today the only edge_type).
 */

export interface GraphNode {
  id: string;
  path: string;
  language: string | null;
}

export interface GraphEdge {
  source: string;
  target: string;
  type: string;
}

export interface RepoGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

/**
 * Used by the agent's `get_dependencies` tool. Given a file path inside a
 * repo, return its imports (outgoing edges) and importers (incoming edges).
 *
 * We resolve the path → id once and then issue two short edge queries.
 */
export async function getFileDependencies(args: {
  repoId: string;
  path: string;
  limit?: number;
}): Promise<{
  exists: boolean;
  imports: { path: string; language: string | null }[];
  importedBy: { path: string; language: string | null }[];
}> {
  const limit = args.limit ?? 50;
  const [self] = await db
    .select({ id: files.id })
    .from(files)
    .where(and(eq(files.repoId, args.repoId), eq(files.path, args.path)))
    .limit(1);
  if (!self) {
    return { exists: false, imports: [], importedBy: [] };
  }

  const targetA = db
    .select({ otherId: fileEdges.targetFileId })
    .from(fileEdges)
    .where(eq(fileEdges.sourceFileId, self.id))
    .limit(limit);
  const targetB = db
    .select({ otherId: fileEdges.sourceFileId })
    .from(fileEdges)
    .where(eq(fileEdges.targetFileId, self.id))
    .limit(limit);
  const [outRows, inRows] = await Promise.all([targetA, targetB]);

  const allIds = [...new Set([...outRows, ...inRows].map((r) => r.otherId))];
  if (allIds.length === 0) {
    return { exists: true, imports: [], importedBy: [] };
  }

  const fileRows = await db
    .select({ id: files.id, path: files.path, language: files.language })
    .from(files)
    .where(inArray(files.id, allIds));
  const byId = new Map(fileRows.map((f) => [f.id, f]));

  const imports = outRows
    .map((r) => byId.get(r.otherId))
    .filter((f): f is { id: string; path: string; language: string | null } => Boolean(f))
    .map((f) => ({ path: f.path, language: f.language }));
  const importedBy = inRows
    .map((r) => byId.get(r.otherId))
    .filter((f): f is { id: string; path: string; language: string | null } => Boolean(f))
    .map((f) => ({ path: f.path, language: f.language }));

  return { exists: true, imports, importedBy };
}

export async function getRepoGraph(repoId: string): Promise<RepoGraph> {
  // Fetch all files for the repo as nodes.
  const fileRows = await db
    .select({
      id: files.id,
      path: files.path,
      language: files.language,
    })
    .from(files)
    .where(eq(files.repoId, repoId));

  if (fileRows.length === 0) return { nodes: [], edges: [] };

  const fileIds = fileRows.map((f) => f.id);

  // file_edges doesn't carry repoId, so we filter by source ∈ this repo's
  // files. Since we only insert intra-repo edges, that covers everything.
  const edgeRows = await db
    .select({
      source: fileEdges.sourceFileId,
      target: fileEdges.targetFileId,
      type: fileEdges.edgeType,
    })
    .from(fileEdges)
    .where(inArray(fileEdges.sourceFileId, fileIds));

  return {
    nodes: fileRows.map((f) => ({
      id: f.id,
      path: f.path,
      language: f.language,
    })),
    edges: edgeRows.map((e) => ({
      source: e.source,
      target: e.target,
      type: e.type,
    })),
  };
}
