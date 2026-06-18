import { google } from "@ai-sdk/google";
import { streamText, stepCountIs } from "ai";

import type { Repo } from "@/server/db/schema";
import type { PrMetadata, PrFile } from "@/lib/github-pr";

import { AGENT_MODEL_ID } from "./answer";
import { buildAgentTools } from "./tools";

/**
 * Slightly more steps than the chat loop (12 vs 8) because PR review
 * benefits from tracing impact on multiple changed files in sequence.
 */
const MAX_STEPS = 12;

function buildPrSystemPrompt(repoName: string): string {
  return `You are CodeAtlas, performing a code review for a pull request to **${repoName}**.

You have access to the full indexed codebase via your tools:
  - search_code: find related code, usages, and tests
  - read_file: read specific files for surrounding context
  - get_impact: find every file that transitively imports a changed file (blast radius)
  - get_dependencies: see what a file imports and who imports it directly

## Review process

1. Read the PR diff provided in the user message.
2. For the most significant changed source files (not trivial configs, lockfiles, or docs),
   call get_impact to find the blast radius — this is your main value-add over a plain diff.
3. Call search_code to find existing tests related to the changed code.
4. Write a structured markdown review covering these sections (use ## headings):

### Summary
One paragraph: what this PR does.

### Changed Files
Bullet list: each changed file with its +/- counts.

### Blast Radius
For each key file you called get_impact on, list the depth-1 importers.
Mark **HIGH** if > 5 direct importers, **LOW** if ≤ 2.

### Potential Issues
Concrete, cited concerns:
- Breaking changes (exported name/type changes, removed fields)
- Missing null or error handling
- Security concerns (auth bypass, injection, hardcoded secrets)
- Performance concerns (N+1 queries, large synchronous operations)
If none found, write "No major issues found."

### Test Coverage
Which changed logic has no corresponding test changes?
Use search_code("test <function name>") to check.

### Verdict
One of: **Approve** · **Request Changes** · **Needs Discussion** — one sentence rationale.

## Rules
- Cite file:line for every concrete claim.
- Never invent file paths or line numbers that did not appear in tool output.
- If the diff is documentation-only or trivial config, say so and keep the review brief.
- Do not repeat the raw diff back; summarize each file in ≤ 2 sentences.`;
}

/**
 * Build the user turn that contains the full PR context.
 * Kept in a separate function so tests can assert on the message shape.
 */
export function buildPrUserMessage(meta: PrMetadata, files: PrFile[]): string {
  const descSection = meta.body?.trim()
    ? `\n**Description:**\n${meta.body.slice(0, 800)}\n`
    : "";

  const fileSections = files.map((f) => {
    const header = [
      `**${f.filename}**`,
      `(${f.status}, +${f.additions}/-${f.deletions}${f.previousFilename ? `, renamed from \`${f.previousFilename}\`` : ""})`,
    ].join(" ");
    const patch = f.patch
      ? `\n\`\`\`diff\n${f.patch}\n\`\`\``
      : " *(binary file or patch unavailable)*";
    return header + patch;
  });

  return `Please review this pull request:

## ${meta.title}
- **Repo:** ${meta.repoFullName}  branch \`${meta.headBranch}\` → \`${meta.baseBranch}\`
- **Stats:** +${meta.additions} / -${meta.deletions} across ${meta.changedFiles} file${meta.changedFiles === 1 ? "" : "s"}
- **Status:** ${meta.merged ? "Merged" : meta.state}${descSection}

## Diff (${files.length} file${files.length === 1 ? "" : "s"} shown)

${fileSections.join("\n\n")}

---
Start by calling get_impact for the key changed source files. Then search for related tests. Then write your review.`;
}

export function streamPrReview(args: {
  repo: Pick<Repo, "id" | "name" | "githubUrl" | "defaultBranch">;
  meta: PrMetadata;
  files: PrFile[];
}) {
  const tools = buildAgentTools({ repo: args.repo });

  return streamText({
    model: google(AGENT_MODEL_ID),
    system: buildPrSystemPrompt(args.repo.name),
    messages: [
      { role: "user", content: buildPrUserMessage(args.meta, args.files) },
    ],
    tools,
    stopWhen: stepCountIs(MAX_STEPS),
    // Lower temperature than chat — reviews should be consistent and factual.
    temperature: 0.1,
  });
}
