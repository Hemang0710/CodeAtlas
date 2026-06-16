import type { ConnectionOptions } from "bullmq";

/**
 * Build the BullMQ connection options from REDIS_URL.
 *
 * Why we return options (instead of a live ioredis client): BullMQ ships its
 * own pinned ioredis version, and constructing one ourselves can fight that
 * pinning (TS sees two structurally different `Redis` types). Letting BullMQ
 * construct the client from our options object avoids that entirely and is
 * also the pattern the BullMQ docs recommend.
 *
 * `maxRetriesPerRequest: null` and `enableReadyCheck: false` are required by
 * BullMQ — its long-blocking BRPOP would otherwise be killed by ioredis's
 * retry logic. See https://docs.bullmq.io/guide/connections
 */
export function getRedisConnection(): ConnectionOptions {
  const raw = process.env.REDIS_URL;
  if (!raw) {
    throw new Error(
      "REDIS_URL is not set. Did you start docker compose and create .env.local?",
    );
  }

  const url = new URL(raw);
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: url.username || undefined,
    password: url.password ? decodeURIComponent(url.password) : undefined,
    db: url.pathname.length > 1 ? Number(url.pathname.slice(1)) : 0,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  };
}
