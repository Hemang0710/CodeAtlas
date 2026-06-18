import { z } from "zod";

import { parseGithubUrl } from "@/lib/github";
import {
  parsePrUrl,
  fetchPrMetadata,
  fetchPrFiles,
} from "@/lib/github-pr";
import { streamPrReview } from "@/server/agent/pr-review";
import { getRepoById } from "@/server/services/repos";

/**
 * POST /api/repos/:id/pr-review
 *
 * Body: { prUrl: string }  — a GitHub PR URL for this indexed repo.
 *
 * Response: text/plain streaming — each chunk is a piece of the review
 * text as the agent generates it. The client accumulates chunks and
 * renders them as Markdown.
 *
 * The PR must belong to the same repository that is indexed (enforced by
 * comparing owner/repo from the PR URL against the repo row's github_url).
 */

const idSchema = z.string().uuid();
const bodySchema = z.object({
  prUrl: z.string().min(1).max(500),
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
      { error: "PR review requires GOOGLE_GENERATIVE_AI_API_KEY in .env.local." },
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
    return Response.json({ error: "Missing or invalid prUrl." }, { status: 400 });
  }

  const repo = await getRepoById(validId.data);
  if (!repo) {
    return Response.json({ error: "Repo not found." }, { status: 404 });
  }

  const prRef = parsePrUrl(parsed.data.prUrl);
  if (!prRef) {
    return Response.json(
      {
        error:
          "Invalid PR URL. Expected format: https://github.com/owner/repo/pull/123",
      },
      { status: 400 },
    );
  }

  // Validate that the PR belongs to the same repo we have indexed.
  const repoParsed = parseGithubUrl(repo.githubUrl);
  if (
    repoParsed &&
    (prRef.owner.toLowerCase() !== repoParsed.owner.toLowerCase() ||
      prRef.repo.toLowerCase() !== repoParsed.repo.toLowerCase())
  ) {
    return Response.json(
      {
        error: `This PR is from ${prRef.owner}/${prRef.repo}, but the indexed repo is ${repoParsed.owner}/${repoParsed.repo}. The PR must be from the same repository.`,
      },
      { status: 400 },
    );
  }

  // Fetch PR data from GitHub before starting the stream so any GitHub
  // API errors surface as clean JSON 502s rather than mid-stream failures.
  let meta: Awaited<ReturnType<typeof fetchPrMetadata>>;
  let files: Awaited<ReturnType<typeof fetchPrFiles>>;
  try {
    [meta, files] = await Promise.all([
      fetchPrMetadata(prRef),
      fetchPrFiles(prRef),
    ]);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json(
      { error: `GitHub API error: ${message}` },
      { status: 502 },
    );
  }

  const result = streamPrReview({
    repo: {
      id: repo.id,
      name: repo.name,
      githubUrl: repo.githubUrl,
      defaultBranch: repo.defaultBranch,
    },
    meta,
    files,
  });

  // toTextStreamResponse streams plain text deltas — simple to consume on
  // the client without needing useChat or SSE parsing.
  return result.toTextStreamResponse();
}
