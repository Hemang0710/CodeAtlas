import { z } from "zod";
import type { UIMessage } from "ai";

import { streamAgentResponse } from "@/server/agent/answer";
import { getRepoById } from "@/server/services/repos";

/**
 * POST /api/repos/:id/ask — single-turn Q&A as a PLAIN TEXT stream.
 *
 * This is the endpoint the VS Code extension talks to. It differs from
 * /chat in two deliberate ways:
 *   1. No conversation persistence — the IDE owns its own history.
 *   2. Returns `toTextStreamResponse()` (raw text deltas) instead of the AI
 *      SDK UI-message stream, so a non-React client can consume it with a
 *      plain `fetch` + ReadableStream reader — no SDK required.
 *
 * Body: { question: string, context?: { filePath, selection } }
 *   - `context` is optional code the user highlighted in their editor; we
 *     fold it into the prompt so the agent can ground its answer on it.
 */

const idSchema = z.string().uuid();
const bodySchema = z.object({
  question: z.string().min(1).max(2000),
  context: z
    .object({
      filePath: z.string().min(1).max(500),
      selection: z.string().min(1).max(10_000),
    })
    .optional(),
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
      { error: "Ask is unavailable: GOOGLE_GENERATIVE_AI_API_KEY is not set." },
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

  // Fold any highlighted editor code into the user turn so the agent can
  // reason about exactly what the developer is looking at.
  const { question, context } = parsed.data;
  const userText = context
    ? `${question}\n\nThe user is looking at this code in \`${context.filePath}\`:\n\`\`\`\n${context.selection}\n\`\`\``
    : question;

  const messages: UIMessage[] = [
    {
      id: crypto.randomUUID(),
      role: "user",
      parts: [{ type: "text", text: userText }],
    },
  ];

  const result = await streamAgentResponse({
    repo: {
      id: repo.id,
      name: repo.name,
      githubUrl: repo.githubUrl,
      defaultBranch: repo.defaultBranch,
    },
    messages,
  });

  return result.toTextStreamResponse();
}
