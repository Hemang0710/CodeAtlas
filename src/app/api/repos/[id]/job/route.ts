import { z } from "zod";

import { getLatestJob } from "@/server/services/jobs";

/**
 * GET /api/repos/:id/job — return the most recent index_job for a repo.
 *
 * The UI polls this every couple of seconds while a job is in progress.
 * Keeping the response shape minimal makes that poll cheap.
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

  const job = await getLatestJob(validId.data);
  if (!job) {
    return Response.json({ error: "No job for that repo." }, { status: 404 });
  }
  return Response.json({
    job: {
      id: job.id,
      status: job.status,
      progress: job.progress,
      error: job.error,
      startedAt: job.startedAt,
      finishedAt: job.finishedAt,
    },
  });
}
