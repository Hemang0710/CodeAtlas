import { z } from "zod";

import {
  getConversation,
  listMessages,
} from "@/server/services/conversations";

/**
 * GET /api/conversations/:id/messages — replay a conversation.
 *
 * Returns messages in insert order with their full `parts` payload so the
 * client can rehydrate the AI SDK chat view exactly as it was.
 */

const idSchema = z.string().uuid();

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await ctx.params;
  const validId = idSchema.safeParse(id);
  if (!validId.success) {
    return Response.json({ error: "Invalid conversation id." }, { status: 400 });
  }
  const conv = await getConversation(validId.data);
  if (!conv) {
    return Response.json({ error: "Conversation not found." }, { status: 404 });
  }

  const rows = await listMessages(conv.id);
  return Response.json({
    conversation: { id: conv.id, repoId: conv.repoId, title: conv.title },
    messages: rows.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      parts: m.parts,
      createdAt: m.createdAt,
    })),
  });
}
