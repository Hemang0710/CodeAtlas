import type { Repo } from "@/server/db/schema";
import { enqueueIndexRepo } from "@/server/queue/queues";
import { createJob } from "@/server/services/jobs";
import { markRepoQueued } from "@/server/services/repos";

/**
 * Kick off (or re-kick) indexing for an already-existing repo row.
 *
 * Both the manual "submit a repo" route and the GitHub webhook need the exact
 * same three steps: flip the repo back to `queued`, create a fresh index_job
 * for the UI to poll, and enqueue the BullMQ job. Centralizing it here means
 * the two trigger paths can never drift apart (e.g. if we add a step later).
 */
export async function startRepoIndexing(
  repo: Pick<Repo, "id" | "githubUrl">,
): Promise<{ jobId: string }> {
  await markRepoQueued(repo.id);
  const job = await createJob(repo.id);
  await enqueueIndexRepo({
    repoId: repo.id,
    jobId: job.id,
    githubUrl: repo.githubUrl,
  });
  return { jobId: job.id };
}
