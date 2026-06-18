import { z } from "zod";

import { githubUrlSchema } from "@/lib/github";
import { startRepoIndexing } from "@/server/services/indexing";
import { listRepos, upsertRepoByUrl } from "@/server/services/repos";

/**
 * POST /api/repos — submit a repo for indexing.
 * GET  /api/repos — list all known repos with their latest job state.
 *
 * Both are thin: validate input (or none), call a service, return JSON.
 * Anything heavy happens in the worker via BullMQ.
 */

const createBody = z.object({
  githubUrl: githubUrlSchema,
});

export async function POST(request: Request): Promise<Response> {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return Response.json({ error: "Body must be JSON." }, { status: 400 });
  }

  const parsed = createBody.safeParse(json);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid request body.", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  // 1) Upsert the repo row by URL (re-submitting the same URL reuses the id).
  const repo = await upsertRepoByUrl(parsed.data.githubUrl);

  // 2) Create the job + enqueue. From here the worker takes over. Shared with
  //    the webhook path so both triggers index identically.
  const { jobId } = await startRepoIndexing({
    id: repo.id,
    githubUrl: repo.githubUrl,
  });

  return Response.json(
    { repo: { id: repo.id, name: repo.name, status: repo.status }, jobId },
    { status: 201 },
  );
}

export async function GET(): Promise<Response> {
  const rows = await listRepos();
  return Response.json({ repos: rows });
}
