import { z } from "zod";

import {
  createConversation,
  listConversationsForRepo,
} from "@/server/services/conversations";
import { getRepoById } from "@/server/services/repos";

/**
 * GET  /api/repos/:id/conversations — list this repo's chats.
 * POST /api/repos/:id/conversations — create an empty chat (rarely used;
 *      the chat route auto-creates on first turn).
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

  const rows = await listConversationsForRepo(repo.id);
  return Response.json({
    conversations: rows.map((c) => ({
      id: c.id,
      title: c.title,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    })),
  });
}

const createBody = z.object({ title: z.string().min(1).max(200).optional() });

export async function POST(
  request: Request,
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

  let json: unknown = {};
  try {
    json = await request.json();
  } catch {
    /* empty body is OK */
  }
  const parsed = createBody.safeParse(json);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid body.", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const created = await createConversation({
    repoId: repo.id,
    title: parsed.data.title,
  });
  return Response.json({ conversation: created }, { status: 201 });
}
