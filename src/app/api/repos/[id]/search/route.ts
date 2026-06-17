import { z } from "zod";

import { expandHits } from "@/server/retrieval/expand";
import { hybridSearch } from "@/server/retrieval/hybrid";
import { getRepoById } from "@/server/services/repos";

/**
 * POST /api/repos/:id/search — hybrid (vector + keyword) semantic search.
 *
 * Body: { query: string, k?: number, expand?: boolean }
 * Response: { hits: HybridHit[] (+ optional expanded) }
 *
 * `expand: true` pads the primary RRF results with sibling chunks (same
 * file) and 1-hop graph neighbours. Useful as context for the Q&A agent
 * landing in Phase 5; the UI defaults to expanded=false to keep results
 * compact.
 */

const idSchema = z.string().uuid();

const bodySchema = z.object({
  query: z.string().min(1).max(2000),
  k: z.number().int().min(1).max(50).optional(),
  expand: z.boolean().optional(),
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

  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    return Response.json(
      {
        error:
          "Search is unavailable: GOOGLE_GENERATIVE_AI_API_KEY is not set on the server.",
      },
      { status: 503 },
    );
  }

  try {
    const primary = await hybridSearch({
      repoId: repo.id,
      query: parsed.data.query,
      topK: parsed.data.k ?? 10,
    });

    const hits = parsed.data.expand
      ? await expandHits({ repoId: repo.id, hits: primary, perHit: 2 })
      : primary;

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
        // Trim long chunks for the wire; the agent can fetch the full file
        // via read_file in Phase 5.
        content:
          h.content.length > 1200 ? h.content.slice(0, 1200) + "…" : h.content,
        score: h.score,
        source: h.source,
        vectorRank: h.vectorRank ?? null,
        keywordRank: h.keywordRank ?? null,
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json(
      { error: `Search failed: ${message}` },
      { status: 502 },
    );
  }
}
