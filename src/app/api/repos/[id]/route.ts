import { z } from "zod";

import { deleteRepo, getRepoById } from "@/server/services/repos";

/**
 * GET    /api/repos/:id — fetch one repo by id.
 * DELETE /api/repos/:id — remove a repo and cascade everything below it
 *                         (jobs, files, chunks, edges).
 *
 * In Next.js 16 the dynamic params are async — `ctx.params` is a Promise.
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
  return Response.json({ repo });
}

export async function DELETE(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await ctx.params;
  const validId = idSchema.safeParse(id);
  if (!validId.success) {
    return Response.json({ error: "Invalid repo id." }, { status: 400 });
  }

  const removed = await deleteRepo(validId.data);
  if (!removed) {
    return Response.json({ error: "Repo not found." }, { status: 404 });
  }
  return Response.json({ ok: true });
}
