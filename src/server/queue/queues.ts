import { Queue } from "bullmq";

import { getRedisConnection } from "./connection";

/**
 * Queue names live as exported constants so producers and consumers can't
 * disagree by typo. There's only one queue today; adding another later means
 * a new constant + a new Worker in worker.ts.
 */
export const INDEX_REPO_QUEUE = "index-repo";

export interface IndexRepoJobData {
  repoId: string;
  jobId: string;
  githubUrl: string;
}

function createIndexRepoQueue() {
  // No explicit return-type annotation: BullMQ 5's `Queue` has more generic
  // parameters than just the data type, and naming a partial subset confuses
  // the structural check. `ReturnType` below lifts the inferred shape.
  return new Queue<IndexRepoJobData>(INDEX_REPO_QUEUE, {
    connection: getRedisConnection(),
    defaultJobOptions: {
      // Drop completed jobs after a day so Redis doesn't grow without bound,
      // and keep the most recent 100 failures around for debugging.
      removeOnComplete: { age: 24 * 60 * 60, count: 1000 },
      removeOnFail: { count: 100 },
      // Two attempts handles transient blips (GitHub 5xx, brief network
      // hiccups). Anything truly permanent throws UnrecoverableError from
      // inside the worker, which short-circuits retries entirely.
      attempts: 2,
      backoff: { type: "exponential", delay: 2_000 },
    },
  });
}

export type IndexRepoQueue = ReturnType<typeof createIndexRepoQueue>;

const globalForQueues = globalThis as unknown as {
  __indexRepoQueue?: IndexRepoQueue;
};

export function getIndexRepoQueue(): IndexRepoQueue {
  if (!globalForQueues.__indexRepoQueue) {
    globalForQueues.__indexRepoQueue = createIndexRepoQueue();
  }
  return globalForQueues.__indexRepoQueue;
}

/**
 * Thin enqueue wrapper. Producers (API route handlers) call this rather
 * than the queue directly so the job name + payload shape stay consistent.
 */
export async function enqueueIndexRepo(data: IndexRepoJobData): Promise<void> {
  await getIndexRepoQueue().add("index", data, { jobId: data.jobId });
}
