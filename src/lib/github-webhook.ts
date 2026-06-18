import crypto from "node:crypto";

import { z } from "zod";

/**
 * Helpers for GitHub webhook delivery: signature verification and push-event
 * parsing.
 *
 * Security note: GitHub signs every delivery with HMAC-SHA256 over the raw
 * request body, using the secret you configured on the webhook. We MUST
 * verify this before trusting anything in the payload — otherwise anyone who
 * learns the URL could trigger re-index jobs at will. The comparison is
 * timing-safe so an attacker can't recover the signature byte-by-byte.
 */

/**
 * Verify the `X-Hub-Signature-256` header against the raw body.
 *
 * @param rawBody  The exact request body bytes as a string (NOT re-serialized
 *                 JSON — the signature is over the literal payload).
 * @param signatureHeader  Value of the `x-hub-signature-256` header, e.g.
 *                         "sha256=abcd…". Null/empty fails closed.
 * @param secret   The webhook secret (GITHUB_WEBHOOK_SECRET).
 */
export function verifyWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
): boolean {
  if (!signatureHeader) return false;

  const expected =
    "sha256=" +
    crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");

  // timingSafeEqual throws if the two buffers differ in length, so we guard
  // that first. A length mismatch already means the signature is invalid.
  const received = Buffer.from(signatureHeader);
  const computed = Buffer.from(expected);
  if (received.length !== computed.length) return false;

  return crypto.timingSafeEqual(received, computed);
}

/**
 * Minimal shape of a GitHub `push` event — only the fields we act on.
 * `.passthrough()` lets the rest of GitHub's large payload flow through
 * without us having to model every field.
 */
const pushEventSchema = z
  .object({
    ref: z.string(),
    deleted: z.boolean().optional(),
    repository: z
      .object({
        html_url: z.string(),
        default_branch: z.string(),
        full_name: z.string(),
      })
      .passthrough(),
  })
  .passthrough();

export type PushEvent = z.infer<typeof pushEventSchema>;

export interface ParsedPush {
  repoHtmlUrl: string;
  repoFullName: string;
  /** The branch that was pushed to, e.g. "main". */
  pushedBranch: string;
  defaultBranch: string;
  /** True when the push targeted the repo's default branch (what we re-index on). */
  isDefaultBranch: boolean;
  /** True for branch-deletion pushes — we ignore these. */
  isDelete: boolean;
}

/**
 * Parse a raw push-event payload into the bits we care about. Returns null
 * if the payload isn't a recognizable push event (e.g. it was a different
 * event type that slipped past the X-GitHub-Event check).
 */
export function parsePushEvent(payload: unknown): ParsedPush | null {
  const result = pushEventSchema.safeParse(payload);
  if (!result.success) return null;

  const { ref, deleted, repository } = result.data;
  // ref looks like "refs/heads/<branch>" for branch pushes; tags use
  // "refs/tags/<name>", which we don't index on.
  const branchPrefix = "refs/heads/";
  const pushedBranch = ref.startsWith(branchPrefix)
    ? ref.slice(branchPrefix.length)
    : "";

  return {
    repoHtmlUrl: repository.html_url,
    repoFullName: repository.full_name,
    pushedBranch,
    defaultBranch: repository.default_branch,
    isDefaultBranch:
      pushedBranch.length > 0 && pushedBranch === repository.default_branch,
    isDelete: deleted === true,
  };
}
