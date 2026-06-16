import { desc, eq, sql } from "drizzle-orm";

import { db } from "@/server/db/client";
import { indexJobs, type IndexJob } from "@/server/db/schema";

/**
 * Indexing-job service. The worker writes through these helpers so that
 * "what progress means" lives in one place: every status transition is one
 * function call, and every UI poll reads the same shape.
 */

export type JobStatus =
  | "queued"
  | "cloning"
  | "parsing"
  | "embedding"
  | "done"
  | "failed";

export async function createJob(repoId: string): Promise<IndexJob> {
  const [row] = await db
    .insert(indexJobs)
    .values({ repoId, status: "queued", progress: 0 })
    .returning();
  return row;
}

export async function getLatestJob(repoId: string): Promise<IndexJob | null> {
  const [row] = await db
    .select()
    .from(indexJobs)
    .where(eq(indexJobs.repoId, repoId))
    .orderBy(desc(indexJobs.createdAt))
    .limit(1);
  return row ?? null;
}

export async function getJob(id: string): Promise<IndexJob | null> {
  const [row] = await db
    .select()
    .from(indexJobs)
    .where(eq(indexJobs.id, id))
    .limit(1);
  return row ?? null;
}

interface JobUpdate {
  status?: JobStatus;
  progress?: number;
  error?: string | null;
  finished?: boolean;
}

export async function updateJob(id: string, update: JobUpdate): Promise<void> {
  const patch: Record<string, unknown> = {};
  if (update.status !== undefined) patch.status = update.status;
  if (update.progress !== undefined) {
    // Clamp so UI doesn't show 110% if we miscount somewhere.
    patch.progress = Math.max(0, Math.min(100, Math.round(update.progress)));
  }
  if (update.error !== undefined) patch.error = update.error;
  if (update.finished) patch.finishedAt = sql`now()`;
  if (update.status === "cloning") patch.startedAt = sql`now()`;

  await db.update(indexJobs).set(patch).where(eq(indexJobs.id, id));
}

export async function markJobFailed(id: string, message: string): Promise<void> {
  await updateJob(id, {
    status: "failed",
    error: message.slice(0, 2000), // keep the column tidy
    finished: true,
  });
}
