/**
 * BullMQ worker entry point. Run with `pnpm worker` (which loads .env.local
 * via dotenv-cli and then re-execs tsx in watch mode — see package.json).
 *
 * Phase 1: handler delegates to `ingestRepo`. Anything thrown there marks
 * the job failed and BullMQ retries per `defaultJobOptions.attempts`.
 */
import { z } from "zod";
import { Worker, type Job } from "bullmq";

import { ingestRepo } from "@/server/indexer/ingest";

import { getRedisConnection } from "./connection";
import { INDEX_REPO_QUEUE, type IndexRepoJobData } from "./queues";

/**
 * Validate the queue payload before we touch any IO. Anything reaching the
 * worker is "untrusted" in the sense that a different process produced it —
 * Zod catches typos and accidental refactors at runtime.
 */
const jobDataSchema = z.object({
  repoId: z.string().uuid(),
  jobId: z.string().uuid(),
  githubUrl: z.string().min(1).max(500),
});

async function handleIndexRepoJob(job: Job<IndexRepoJobData>): Promise<void> {
  const data = jobDataSchema.parse(job.data);
  console.log(
    `[worker] start id=${job.id} repoId=${data.repoId} url=${data.githubUrl}`,
  );
  await ingestRepo(data);
}

function start(): void {
  const worker = new Worker<IndexRepoJobData>(
    INDEX_REPO_QUEUE,
    handleIndexRepoJob,
    {
      connection: getRedisConnection(),
      concurrency: 2,
    },
  );

  worker.on("ready", () => {
    console.log(`[worker] ready, listening on queue "${INDEX_REPO_QUEUE}"`);
  });
  worker.on("completed", (job) => {
    console.log(`[worker] completed id=${job.id}`);
  });
  worker.on("failed", (job, err) => {
    console.error(`[worker] failed id=${job?.id} err=${err.message}`);
  });
  worker.on("error", (err) => {
    console.error("[worker] worker error:", err);
  });

  // Graceful shutdown so in-flight jobs get a chance to finish (and Redis
  // connections close cleanly) when you Ctrl+C.
  const shutdown = async (signal: NodeJS.Signals) => {
    console.log(`[worker] received ${signal}, draining…`);
    await worker.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

start();
