import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/server/db/client";
import { fileEdges, files } from "@/server/db/schema";

/**
 * Impact analysis — "what breaks if I change this file?"
 *
 * Reverse-BFS over file_edges: for a starting file we collect every file
 * that imports it directly, then files that import THOSE, up to a
 * configurable depth. Each file's smallest-distance from the root is
 * preserved so the UI can show a "blast radius" by ring.
 *
 * We don't try to be clever about which imports are "load-bearing" vs
 * "casual" — that's per-language semantics. Conservative reverse
 * reachability is the right baseline for a portfolio project.
 */

const DEFAULT_DEPTH = 3;
const MAX_DEPTH = 5;
const MAX_VISITED = 2000;

export interface ImpactFile {
  fileId: string;
  path: string;
  language: string | null;
  /** 1 = direct importer, 2 = importer-of-importer, etc. */
  depth: number;
}

export interface ImpactResult {
  found: boolean;
  rootPath: string;
  rootFileId: string | null;
  affected: ImpactFile[];
  /** True when the BFS hit MAX_VISITED before completing. */
  truncated: boolean;
  /** The deepest level we actually visited. */
  reachedDepth: number;
}

export async function getReverseImpact(args: {
  repoId: string;
  path: string;
  depth?: number;
}): Promise<ImpactResult> {
  const depth = Math.min(Math.max(1, args.depth ?? DEFAULT_DEPTH), MAX_DEPTH);

  const [root] = await db
    .select({ id: files.id })
    .from(files)
    .where(and(eq(files.repoId, args.repoId), eq(files.path, args.path)))
    .limit(1);
  if (!root) {
    return {
      found: false,
      rootPath: args.path,
      rootFileId: null,
      affected: [],
      truncated: false,
      reachedDepth: 0,
    };
  }

  // BFS: each iteration takes the current frontier and expands one level.
  // Visited tracks min-distance per file so we don't revisit.
  const visited = new Map<string, number>(); // fileId → depth
  let frontier: string[] = [root.id];
  let level = 0;
  let truncated = false;

  while (frontier.length > 0 && level < depth) {
    level++;
    // Files that import any of the current frontier.
    const edges = await db
      .select({ source: fileEdges.sourceFileId })
      .from(fileEdges)
      .where(inArray(fileEdges.targetFileId, frontier));

    const next: string[] = [];
    for (const e of edges) {
      if (e.source === root.id) continue; // self-reference, drop
      if (visited.has(e.source)) continue;
      visited.set(e.source, level);
      next.push(e.source);
      if (visited.size >= MAX_VISITED) {
        truncated = true;
        break;
      }
    }
    frontier = next;
    if (truncated) break;
  }

  if (visited.size === 0) {
    return {
      found: true,
      rootPath: args.path,
      rootFileId: root.id,
      affected: [],
      truncated: false,
      reachedDepth: 0,
    };
  }

  // Hydrate file rows for the visited set.
  const fileIds = [...visited.keys()];
  const rows = await db
    .select({ id: files.id, path: files.path, language: files.language })
    .from(files)
    .where(inArray(files.id, fileIds));

  const affected: ImpactFile[] = rows
    .map((r) => ({
      fileId: r.id,
      path: r.path,
      language: r.language,
      depth: visited.get(r.id) ?? 0,
    }))
    // Closer impact first; secondary sort by path for determinism.
    .sort((a, b) =>
      a.depth !== b.depth ? a.depth - b.depth : a.path.localeCompare(b.path),
    );

  const reachedDepth = Math.max(...affected.map((a) => a.depth));

  return {
    found: true,
    rootPath: args.path,
    rootFileId: root.id,
    affected,
    truncated,
    reachedDepth,
  };
}

/**
 * Pure BFS helper, exposed for tests. Same algorithm as
 * `getReverseImpact` but takes the edge map directly so we don't need a
 * live database. Returns the same shape minus `path` hydration.
 */
export function reverseImpactBfs(args: {
  rootId: string;
  /** key = file id imported BY the value's set members (reverse adjacency). */
  reverseAdjacency: Map<string, string[]>;
  depth: number;
}): { visited: Map<string, number>; truncated: boolean; reachedDepth: number } {
  const depth = Math.min(Math.max(1, args.depth), MAX_DEPTH);
  const visited = new Map<string, number>();
  let frontier = [args.rootId];
  let level = 0;
  let truncated = false;

  while (frontier.length > 0 && level < depth) {
    level++;
    const next: string[] = [];
    for (const id of frontier) {
      const importers = args.reverseAdjacency.get(id) ?? [];
      for (const importer of importers) {
        if (importer === args.rootId) continue;
        if (visited.has(importer)) continue;
        visited.set(importer, level);
        next.push(importer);
        if (visited.size >= MAX_VISITED) {
          truncated = true;
          break;
        }
      }
      if (truncated) break;
    }
    frontier = next;
    if (truncated) break;
  }

  const reachedDepth =
    visited.size === 0 ? 0 : Math.max(...visited.values());
  return { visited, truncated, reachedDepth };
}
