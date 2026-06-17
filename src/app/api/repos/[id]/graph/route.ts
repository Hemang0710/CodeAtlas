import { z } from "zod";

import { getRepoGraph } from "@/server/services/graph";
import { getRepoById } from "@/server/services/repos";

/**
 * GET /api/repos/:id/graph — full nodes + edges for the repo's import graph.
 *
 * Nodes are files, edges are import relationships. We return the whole
 * graph today; if a repo ever passes a few thousand nodes we'll add
 * `?depth=N&from=<fileId>` for ego-graph slicing.
 */

const idSchema = z.string().uuid();

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await ctx.params;
  const validId = idSchema.safeParse(id);
  if (!validId.success) {
    return Response.json({ error: "Invalid repo id." }, { status: 400 });
  }

  const repo = await getRepoById(validId.data);
  if (!repo) {
    return Response.json({ error: "Repo not found." }, { status: 404 });
  }

  const graph = await getRepoGraph(repo.id);
  return Response.json({
    repo: { id: repo.id, name: repo.name },
    nodes: graph.nodes,
    edges: graph.edges,
    counts: { nodes: graph.nodes.length, edges: graph.edges.length },
  });
}
