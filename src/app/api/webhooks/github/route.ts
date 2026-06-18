import { parseGithubUrl } from "@/lib/github";
import {
  parsePushEvent,
  verifyWebhookSignature,
} from "@/lib/github-webhook";
import { startRepoIndexing } from "@/server/services/indexing";
import { findRepoByNormalizedUrl } from "@/server/services/repos";

/**
 * POST /api/webhooks/github — auto re-index on push.
 *
 * Configure a GitHub webhook (repo Settings → Webhooks) pointing here with:
 *   - Content type: application/json
 *   - Secret: the same value as GITHUB_WEBHOOK_SECRET
 *   - Events: "Just the push event"
 *
 * Flow:
 *   1. Verify the HMAC signature over the RAW body (fail closed).
 *   2. Handle GitHub's "ping" handshake.
 *   3. Parse the push; ignore non-default-branch pushes and branch deletes.
 *   4. Find the matching indexed repo; if we track it, enqueue a re-index.
 *
 * ingestRepo() already skips files whose content hash is unchanged, so a
 * push that touches three files only re-embeds those three — re-indexing is
 * cheap by design.
 *
 * We always return 2xx for events we intentionally skip so GitHub's delivery
 * UI shows green and doesn't retry. Only signature failures return 401.
 */

// Force the Node.js runtime: signature verification uses node:crypto, which
// isn't available on the Edge runtime.
export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!secret) {
    return Response.json(
      {
        error:
          "Webhooks are disabled: GITHUB_WEBHOOK_SECRET is not set on the server.",
      },
      { status: 503 },
    );
  }

  // Read the raw body BEFORE parsing — the signature is computed over these
  // exact bytes, so JSON.parse + re-stringify would break verification.
  const rawBody = await request.text();
  const signature = request.headers.get("x-hub-signature-256");

  if (!verifyWebhookSignature(rawBody, signature, secret)) {
    return Response.json({ error: "Invalid signature." }, { status: 401 });
  }

  const event = request.headers.get("x-github-event");

  // GitHub sends a "ping" event when the webhook is first created. Ack it so
  // the setup UI shows a successful delivery.
  if (event === "ping") {
    return Response.json({ ok: true, pong: true });
  }

  if (event !== "push") {
    return Response.json({ ok: true, skipped: `event "${event}" ignored` });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return Response.json({ error: "Body must be JSON." }, { status: 400 });
  }

  const push = parsePushEvent(payload);
  if (!push) {
    return Response.json({ ok: true, skipped: "unrecognized push payload" });
  }

  // Only re-index pushes to the default branch; ignore feature branches,
  // tags, and branch deletions.
  if (push.isDelete || !push.isDefaultBranch) {
    return Response.json({
      ok: true,
      skipped: `push to "${push.pushedBranch}" is not the default branch`,
    });
  }

  // Normalize the repo URL the same way indexing does, then look it up.
  const parsed = parseGithubUrl(push.repoHtmlUrl);
  if (!parsed) {
    return Response.json({ ok: true, skipped: "unparseable repository url" });
  }

  const repo = await findRepoByNormalizedUrl(parsed.normalizedUrl);
  if (!repo) {
    // We don't auto-index repos we've never seen — that would let any repo
    // with our URL trigger work. Only re-index ones a user already added.
    return Response.json({
      ok: true,
      skipped: `repo ${parsed.name} is not indexed`,
    });
  }

  const { jobId } = await startRepoIndexing({
    id: repo.id,
    githubUrl: repo.githubUrl,
  });

  console.log(
    `[webhook] re-index queued repo=${parsed.name} branch=${push.pushedBranch} job=${jobId}`,
  );

  return Response.json({ ok: true, repoId: repo.id, jobId }, { status: 202 });
}
