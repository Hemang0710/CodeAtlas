import { z } from "zod";
import type { UIMessage } from "ai";

import { streamAgentResponse } from "@/server/agent/answer";
import {
  appendMessage,
  createConversation,
  getConversationForRepo,
  renameConversation,
} from "@/server/services/conversations";
import { getRepoById } from "@/server/services/repos";

/**
 * POST /api/repos/:id/chat — stream a Claude tool-use response.
 *
 * Body: { conversationId?: string, messages: UIMessage[] }
 *   - If conversationId is omitted, we create a new conversation.
 *   - The full message history is sent every turn (the AI SDK's standard
 *     useChat pattern). The server uses the last user message to compute
 *     the title for new conversations.
 *
 * Response: a UI message stream the client's `useChat` knows how to
 * consume — tokens, tool-call inputs, and tool results all flow through
 * the same stream.
 */

const idSchema = z.string().uuid();
const bodySchema = z.object({
  conversationId: z.string().uuid().optional(),
  messages: z.array(z.unknown()).min(1),
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

  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    return Response.json(
      {
        error:
          "Chat is unavailable: GOOGLE_GENERATIVE_AI_API_KEY is not set on the server. See TODO.md step 5.",
      },
      { status: 503 },
    );
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

  // Resolve or create the conversation row.
  let conversation = parsed.data.conversationId
    ? await getConversationForRepo(parsed.data.conversationId, repo.id)
    : null;
  if (parsed.data.conversationId && !conversation) {
    return Response.json(
      { error: "Conversation not found for this repo." },
      { status: 404 },
    );
  }
  if (!conversation) {
    // Use the first ~80 chars of the user message as the working title.
    const firstUserText = previewText(parsed.data.messages.at(-1));
    conversation = await createConversation({
      repoId: repo.id,
      title: firstUserText.slice(0, 80) || "New conversation",
    });
  }

  // Persist the latest user turn before we kick off the stream.
  const last = parsed.data.messages.at(-1) as UIMessage | undefined;
  if (last && last.role === "user") {
    await appendMessage({
      conversationId: conversation.id,
      role: "user",
      content: previewText(last),
      parts: last.parts ?? [],
    });
  }

  const result = await streamAgentResponse({
    repo: {
      id: repo.id,
      name: repo.name,
      githubUrl: repo.githubUrl,
      defaultBranch: repo.defaultBranch,
    },
    messages: parsed.data.messages as UIMessage[],
  });

  return result.toUIMessageStreamResponse({
    onFinish: async ({ messages }) => {
      // The SDK gives us back the full assistant turn (text + tool parts).
      const assistant = messages.at(-1);
      if (!assistant || assistant.role !== "assistant") return;
      await appendMessage({
        conversationId: conversation.id,
        role: "assistant",
        content: previewText(assistant),
        parts: assistant.parts ?? [],
      });
      // First-turn nicety: replace the auto-title with something sharper
      // once we know what the answer ended up being.
      if (conversation.title === "New conversation" || conversation.title.length < 8) {
        const t = previewText(assistant).slice(0, 60);
        if (t) await renameConversation(conversation.id, t);
      }
    },
    // Expose the resolved conversation id so the client can stash it
    // and reuse it for subsequent turns.
    headers: {
      "x-codeatlas-conversation-id": conversation.id,
    },
  });
}

/**
 * Best-effort plain-text rendering of a UIMessage for previews and titles.
 * We walk the `parts` array and pull text segments; tool calls are skipped
 * (we keep them in `parts` for full fidelity).
 */
function previewText(message: unknown): string {
  if (!message || typeof message !== "object") return "";
  const parts = (message as { parts?: unknown[] }).parts;
  if (!Array.isArray(parts)) {
    const direct = (message as { content?: unknown }).content;
    return typeof direct === "string" ? direct : "";
  }
  const out: string[] = [];
  for (const part of parts) {
    if (
      part &&
      typeof part === "object" &&
      (part as { type?: string }).type === "text" &&
      typeof (part as { text?: unknown }).text === "string"
    ) {
      out.push((part as { text: string }).text);
    }
  }
  return out.join("\n").trim();
}
