import { z } from "zod";

import { generateOnboardingGuide } from "@/server/agent/guide";
import {
  getRepoById,
  setRepoOnboardingGuide,
} from "@/server/services/repos";

/**
 * POST /api/repos/:id/guide
 *
 * Generate (or regenerate) the onboarding guide. We don't auto-generate on
 * page load because the guide costs real LLM credits — the user opts in.
 *
 * Response: { markdown, generatedAt }
 */

const idSchema = z.string().uuid();

export async function POST(
  _request: Request,
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
          "Onboarding guide generation requires GOOGLE_GENERATIVE_AI_API_KEY in .env.local.",
      },
      { status: 503 },
    );
  }

  const repo = await getRepoById(validId.data);
  if (!repo) {
    return Response.json({ error: "Repo not found." }, { status: 404 });
  }

  try {
    const { markdown } = await generateOnboardingGuide({
      repo: {
        id: repo.id,
        name: repo.name,
        githubUrl: repo.githubUrl,
        defaultBranch: repo.defaultBranch,
      },
    });
    await setRepoOnboardingGuide(repo.id, markdown);
    return Response.json({
      markdown,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json(
      { error: `Guide generation failed: ${message}` },
      { status: 502 },
    );
  }
}
