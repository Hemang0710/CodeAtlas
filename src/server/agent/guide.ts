import { generateText, stepCountIs } from "ai";
import { google } from "@ai-sdk/google";

import { type Repo } from "@/server/db/schema";

import { AGENT_MODEL_ID } from "./answer";
import { buildAgentTools } from "./tools";

/**
 * Phase 6: one-shot onboarding guide generator.
 *
 * Differs from the chat loop in three ways:
 *   1. Uses `generateText` (non-streaming) — the result lands in the DB and
 *      the page renders it server-side. No need for SSE.
 *   2. Fixed task prompt; the user doesn't drive this.
 *   3. We let it take more steps (12 vs 8) because the agent often does
 *      list_files → search_code → read_file → read_file → ... to assemble
 *      a tour. A short cap here would make the guide vague.
 *
 * Returned text is Markdown (with optional Mermaid fences) for the page to
 * render.
 */

const MAX_GUIDE_STEPS = 12;

const TASK_PROMPT = `Write a concise onboarding guide for this repository.

Cover, in this order:
  1. **What it is** — one paragraph: what the project does and who it's for.
     Cite a README or package.json if one exists.
  2. **Entry points** — one bullet per entry point (CLI, server, app, etc.)
     with file:line citation.
  3. **Key modules** — 3 to 6 bullets, each naming an important module +
     citing one or two representative files.
  4. **How a request / job flows through the code** — one paragraph plus a
     fenced \`\`\`mermaid\`\`\` diagram (sequenceDiagram or flowchart LR is fine).
     Pick the *most representative* end-to-end flow you can identify.
  5. **Where to start contributing** — two or three bullets with specific
     paths a newcomer should read first.

Rules:
  - Markdown. Use \`#\`, \`##\` headings, bullets, and inline code freely.
  - Every concrete claim must end with a \`path/to/file.ts:42\` citation.
  - If you can't find evidence for a section, write "Not obvious from the
    code." rather than guessing.
  - Aim for ~400 words plus the diagram. Tighter is better.`;

export async function generateOnboardingGuide(args: {
  repo: Pick<Repo, "id" | "name" | "githubUrl" | "defaultBranch">;
}): Promise<{ markdown: string }> {
  const tools = buildAgentTools({ repo: args.repo });

  const result = await generateText({
    model: google(AGENT_MODEL_ID),
    system: `You are CodeAtlas. The user has asked for an onboarding guide
for **${args.repo.name}**. Use the tools to ground every claim. Cite
file:line for everything concrete. Never invent file paths.`,
    prompt: TASK_PROMPT,
    tools,
    stopWhen: stepCountIs(MAX_GUIDE_STEPS),
    temperature: 0.2,
  });

  return { markdown: result.text };
}
