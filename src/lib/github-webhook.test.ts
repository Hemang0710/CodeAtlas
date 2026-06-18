import crypto from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  parsePushEvent,
  verifyWebhookSignature,
} from "./github-webhook";

const SECRET = "test-webhook-secret";

function sign(body: string, secret = SECRET): string {
  return (
    "sha256=" +
    crypto.createHmac("sha256", secret).update(body, "utf8").digest("hex")
  );
}

describe("verifyWebhookSignature", () => {
  it("accepts a correctly signed body", () => {
    const body = JSON.stringify({ hello: "world" });
    expect(verifyWebhookSignature(body, sign(body), SECRET)).toBe(true);
  });

  it("rejects a body signed with the wrong secret", () => {
    const body = JSON.stringify({ hello: "world" });
    const badSig = sign(body, "attacker-secret");
    expect(verifyWebhookSignature(body, badSig, SECRET)).toBe(false);
  });

  it("rejects a tampered body", () => {
    const original = JSON.stringify({ amount: 1 });
    const sig = sign(original);
    const tampered = JSON.stringify({ amount: 9999 });
    expect(verifyWebhookSignature(tampered, sig, SECRET)).toBe(false);
  });

  it("fails closed when the signature header is missing", () => {
    const body = "{}";
    expect(verifyWebhookSignature(body, null, SECRET)).toBe(false);
  });

  it("rejects a malformed/short signature without throwing", () => {
    const body = "{}";
    expect(verifyWebhookSignature(body, "sha256=abc", SECRET)).toBe(false);
  });
});

describe("parsePushEvent", () => {
  const base = {
    ref: "refs/heads/main",
    repository: {
      html_url: "https://github.com/owner/repo",
      default_branch: "main",
      full_name: "owner/repo",
    },
  };

  it("flags a default-branch push", () => {
    const parsed = parsePushEvent(base);
    expect(parsed).not.toBeNull();
    expect(parsed?.isDefaultBranch).toBe(true);
    expect(parsed?.pushedBranch).toBe("main");
    expect(parsed?.repoHtmlUrl).toBe("https://github.com/owner/repo");
  });

  it("flags a feature-branch push as non-default", () => {
    const parsed = parsePushEvent({ ...base, ref: "refs/heads/feature-x" });
    expect(parsed?.isDefaultBranch).toBe(false);
    expect(parsed?.pushedBranch).toBe("feature-x");
  });

  it("treats a tag push as non-default branch", () => {
    const parsed = parsePushEvent({ ...base, ref: "refs/tags/v1.0.0" });
    expect(parsed?.isDefaultBranch).toBe(false);
    expect(parsed?.pushedBranch).toBe("");
  });

  it("surfaces branch deletions", () => {
    const parsed = parsePushEvent({ ...base, deleted: true });
    expect(parsed?.isDelete).toBe(true);
  });

  it("returns null for a payload missing required fields", () => {
    expect(parsePushEvent({ not: "a push" })).toBeNull();
  });
});
