import { z } from "zod";

import { listFilesForRepo } from "@/server/services/files";
import { getRepoById } from "@/server/services/repos";

/**
 * GET /api/repos/:id/files — list every file we indexed for a repo.
 *
 * For Phase 1 this returns the full list; if a repo ever blows past a few
 * thousand files we'll add pagination here. Until then a flat array keeps
 * the client code simple.
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

  const rows = await listFilesForRepo(repo.id);
  return Response.json({
    repo: { id: repo.id, name: repo.name, status: repo.status },
    files: rows.map((f) => ({
      id: f.id,
      path: f.path,
      language: f.language,
      sizeBytes: f.sizeBytes,
    })),
  });
}
