import { google } from "@ai-sdk/google";
import { convertToModelMessages, stepCountIs, streamText, type UIMessage } from "ai";

import type { Repo } from "@/server/db/schema";

import { buildSystemPrompt } from "./system-prompt";
import { buildAgentTools } from "./tools";

/**
 * Run the Claude tool-use loop for a single user turn.
 *
 * The agent is allowed up to 8 steps so multi-hop questions ("explain the
 * checkout flow") have room to: (1) search, (2) read top hit, (3) follow
 * an import, (4) read that file, (5) answer. Eight is comfortable; we
 * cap there so a confused model can't burn 50 calls trying.
 *
 * `onFinish` receives the full result so the route can persist the
 * assistant turn to the DB.
 */

const MAX_AGENT_STEPS = 8;

/**
 * Gemini 2.5 Flash is on the Google AI Studio free tier — no card on file
 * required, ~10 RPM / 250 RPD as of writing. That's plenty for portfolio
 * dev. The Vercel AI SDK abstraction means swapping providers later is a
 * one-line change to this constant + the import above.
 */
export const AGENT_MODEL_ID = "gemini-2.5-flash";

export async function streamAgentResponse(args: {
  repo: Pick<Repo, "id" | "name" | "githubUrl" | "defaultBranch">;
  messages: UIMessage[];
}) {
  const tools = buildAgentTools({ repo: args.repo });
  const system = buildSystemPrompt({
    repoName: args.repo.name,
    defaultBranch: args.repo.defaultBranch || "main",
  });

  // The AI SDK's `useChat` sends UIMessage[]; convertToModelMessages strips
  // UI-only fields (id, parts metadata) before sending to Claude. It's async
  // in v6+ because it can download files referenced in message parts.
  const modelMessages = await convertToModelMessages(args.messages);

  return streamText({
    model: google(AGENT_MODEL_ID),
    system,
    messages: modelMessages,
    tools,
    stopWhen: stepCountIs(MAX_AGENT_STEPS),
    // Conservative temperature: we want grounded, reproducible answers.
    // The retrieval does the interesting work; the model just narrates it.
    temperature: 0.2,
  });
}
