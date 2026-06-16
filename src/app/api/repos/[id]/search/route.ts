import { z } from "zod";

import { VoyageClient } from "@/lib/voyage";
import { getRepoById } from "@/server/services/repos";
import { vectorSearch } from "@/server/retrieval/vector";

/**
 * POST /api/repos/:id/search — semantic search over a repo's chunks.
 *
 * Body: { query: string, k?: number }
 * Response: { hits: VectorHit[] }
 *
 * This is the "ask the codebase" surface. Phase 5 will swap it for the
 * full Q&A agent; today it's a clean ranked list so we can validate the
 * embedding pipeline end-to-end.
 */

const idSchema = z.string().uuid();

const bodySchema = z.object({
  query: z.string().min(1).max(2000),
  k: z.number().int().min(1).max(50).optional(),
});

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await ctx.params;
  const validId = idSchema.safeParse(id);
  if (!validId.success) {
    return Response.json({ error: "Invalid repo id." }, { status: 400 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return Response.json({ error: "Body must be JSON." }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid request body.", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const repo = await getRepoById(validId.data);
  if (!repo) {
    return Response.json({ error: "Repo not found." }, { status: 404 });
  }

  if (!process.env.VOYAGE_API_KEY) {
    return Response.json(
      {
        error:
          "Search is unavailable: VOYAGE_API_KEY is not set on the server. See TODO.md step 6.",
      },
      { status: 503 },
    );
  }

  let queryEmbedding: number[];
  try {
    const voyage = VoyageClient.fromEnv();
    queryEmbedding = await voyage.embedQuery(parsed.data.query);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json(
      { error: `Could not embed query: ${message}` },
      { status: 502 },
    );
  }

  const hits = await vectorSearch({
    repoId: repo.id,
    queryEmbedding,
    k: parsed.data.k ?? 10,
  });

  return Response.json({
    repo: { id: repo.id, name: repo.name },
    hits: hits.map((h) => ({
      chunkId: h.chunkId,
      fileId: h.fileId,
      filePath: h.filePath,
      symbolName: h.symbolName,
      symbolType: h.symbolType,
      startLine: h.startLine,
      endLine: h.endLine,
      // Trim long chunks for the wire — the UI only previews the first ~600
      // chars. Phase 5's tool calls fetch full content via read_file.
      content:
        h.content.length > 1200 ? h.content.slice(0, 1200) + "…" : h.content,
      score: h.score,
    })),
  });
}
