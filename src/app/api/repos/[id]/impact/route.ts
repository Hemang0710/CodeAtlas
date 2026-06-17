import { z } from "zod";

import { getReverseImpact } from "@/server/retrieval/impact";
import { getRepoById } from "@/server/services/repos";

/**
 * GET /api/repos/:id/impact?path=...&depth=2
 *
 * Returns every file that transitively imports `path`, up to `depth`.
 * Each result carries the depth at which it was first reached so the
 * caller can render concentric "rings of impact."
 */

const idSchema = z.string().uuid();
const querySchema = z.object({
  path: z.string().min(1).max(500),
  depth: z.coerce.number().int().min(1).max(5).optional(),
});

export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await ctx.params;
  const validId = idSchema.safeParse(id);
  if (!validId.success) {
    return Response.json({ error: "Invalid repo id." }, { status: 400 });
  }

  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    path: url.searchParams.get("path") ?? "",
    depth: url.searchParams.get("depth") ?? undefined,
  });
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid query.", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const repo = await getRepoById(validId.data);
  if (!repo) {
    return Response.json({ error: "Repo not found." }, { status: 404 });
  }

  const result = await getReverseImpact({
    repoId: repo.id,
    path: parsed.data.path,
    depth: parsed.data.depth,
  });

  if (!result.found) {
    return Response.json(
      { error: `File not found in index: ${parsed.data.path}` },
      { status: 404 },
    );
  }

  return Response.json({
    repo: { id: repo.id, name: repo.name },
    root: parsed.data.path,
    affected: result.affected,
    reachedDepth: result.reachedDepth,
    truncated: result.truncated,
  });
}
