/**
 * Convert a repo's file dependency graph into Mermaid `flowchart` source.
 *
 * Two modes:
 *   - "files"        : one node per file, grouped into subgraphs by folder.
 *                      Readable up to ~80 nodes.
 *   - "directories"  : collapse files to their parent folder; edges between
 *                      folders if any files in one folder import from the
 *                      other. Used automatically above the file threshold,
 *                      and useful as the at-a-glance view even for small
 *                      repos.
 *
 * We don't try to do clever layout — Mermaid's dagre defaults are fine for
 * what's effectively "top-down packages with arrows."
 */

export interface GraphNode {
  id: string;
  path: string;
  language: string | null;
}

export interface GraphEdge {
  source: string;
  target: string;
}

export type MermaidMode = "files" | "directories";

/** Files beyond this count fall back to directory-level rendering. */
export const FILES_MODE_NODE_LIMIT = 80;

export function pickMermaidMode(nodeCount: number): MermaidMode {
  return nodeCount > FILES_MODE_NODE_LIMIT ? "directories" : "files";
}

interface BuildArgs {
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** Override auto mode if you want to force one. */
  mode?: MermaidMode;
}

export function buildMermaidGraph({ nodes, edges, mode }: BuildArgs): string {
  if (nodes.length === 0) {
    return "flowchart LR\n  empty[No files indexed yet]";
  }
  const effective = mode ?? pickMermaidMode(nodes.length);
  if (effective === "directories") return renderDirectoryGraph(nodes, edges);
  return renderFileGraph(nodes, edges);
}

// -- File-level rendering --------------------------------------------------

function renderFileGraph(nodes: GraphNode[], edges: GraphEdge[]): string {
  // Group nodes by parent directory.
  const byDir = new Map<string, GraphNode[]>();
  for (const n of nodes) {
    const dir = directoryOf(n.path) || "(root)";
    const arr = byDir.get(dir) ?? [];
    arr.push(n);
    byDir.set(dir, arr);
  }

  const lines: string[] = ["flowchart LR"];
  // Sort directories for deterministic output (tests rely on this).
  const sortedDirs = [...byDir.keys()].sort();

  for (const dir of sortedDirs) {
    const dirId = mermaidId("dir_" + dir);
    lines.push(`  subgraph ${dirId}["${escapeLabel(dir)}"]`);
    const files = byDir.get(dir) ?? [];
    files.sort((a, b) => a.path.localeCompare(b.path));
    for (const f of files) {
      lines.push(`    ${mermaidId(f.id)}["${escapeLabel(basename(f.path))}"]`);
    }
    lines.push("  end");
  }

  for (const e of edges) {
    lines.push(`  ${mermaidId(e.source)} --> ${mermaidId(e.target)}`);
  }

  return lines.join("\n");
}

// -- Directory-level rendering --------------------------------------------

/**
 * Separator between source + target dirs in the dedupe key. We pick a
 * sequence no path or directory name should ever contain, and never write
 * it to the rendered Mermaid output — it's split back out before
 * emitting.
 */
const DIR_EDGE_SEP = "|>>|";

function renderDirectoryGraph(nodes: GraphNode[], edges: GraphEdge[]): string {
  // Map file id → directory, then aggregate edges between directories.
  const fileIdToDir = new Map<string, string>();
  for (const n of nodes) {
    fileIdToDir.set(n.id, directoryOf(n.path) || "(root)");
  }

  const dirEdges = new Set<string>();
  for (const e of edges) {
    const s = fileIdToDir.get(e.source);
    const t = fileIdToDir.get(e.target);
    if (!s || !t || s === t) continue; // skip intra-directory edges
    dirEdges.add(`${s}${DIR_EDGE_SEP}${t}`);
  }

  const dirs = new Set<string>(fileIdToDir.values());
  const sortedDirs = [...dirs].sort();

  const lines: string[] = ["flowchart LR"];
  for (const dir of sortedDirs) {
    lines.push(`  ${mermaidId("dir_" + dir)}["${escapeLabel(dir)}"]`);
  }
  for (const e of [...dirEdges].sort()) {
    const [s, t] = e.split(DIR_EDGE_SEP);
    lines.push(`  ${mermaidId("dir_" + s)} --> ${mermaidId("dir_" + t)}`);
  }

  return lines.join("\n");
}

// -- Helpers ---------------------------------------------------------------

function directoryOf(path: string): string {
  const idx = path.lastIndexOf("/");
  return idx >= 0 ? path.slice(0, idx) : "";
}

function basename(path: string): string {
  const idx = path.lastIndexOf("/");
  return idx >= 0 ? path.slice(idx + 1) : path;
}

/**
 * Mermaid node ids must match `[A-Za-z][A-Za-z0-9_]*`. We map anything
 * outside that to underscores and prefix with `n_` so a numeric / UUID id
 * stays valid. Determinism matters for tests.
 */
function mermaidId(raw: string): string {
  return "n_" + raw.replace(/[^A-Za-z0-9_]/g, "_");
}

/** Escape characters that would break a Mermaid label literal. */
function escapeLabel(text: string): string {
  return text.replace(/"/g, "&quot;").replace(/\n/g, " ");
}
