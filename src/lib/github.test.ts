import { describe, expect, it } from "vitest";

import { parseGithubUrl } from "./github";

describe("parseGithubUrl", () => {
  it("parses a vanilla owner/repo URL", () => {
    const r = parseGithubUrl("https://github.com/vercel/next.js");
    expect(r).toEqual({
      owner: "vercel",
      repo: "next.js",
      normalizedUrl: "https://github.com/vercel/next.js",
      name: "vercel/next.js",
      cloneUrl: "https://github.com/vercel/next.js.git",
    });
  });

  it("strips a trailing .git", () => {
    const r = parseGithubUrl("https://github.com/owner/my-repo.git");
    expect(r?.repo).toBe("my-repo");
    expect(r?.normalizedUrl).toBe("https://github.com/owner/my-repo");
  });

  it("ignores deep-link path segments", () => {
    const r = parseGithubUrl(
      "https://github.com/owner/repo/tree/main/src/components",
    );
    expect(r?.normalizedUrl).toBe("https://github.com/owner/repo");
  });

  it("accepts the www. host", () => {
    const r = parseGithubUrl("https://www.github.com/owner/repo");
    expect(r?.name).toBe("owner/repo");
  });

  it("rejects non-github hosts", () => {
    expect(parseGithubUrl("https://gitlab.com/owner/repo")).toBeNull();
  });

  it("rejects malformed URLs", () => {
    expect(parseGithubUrl("not a url")).toBeNull();
    expect(parseGithubUrl("https://github.com/")).toBeNull();
    expect(parseGithubUrl("https://github.com/justanowner")).toBeNull();
  });

  it("rejects illegal owner/repo characters", () => {
    expect(parseGithubUrl("https://github.com/owner!/repo")).toBeNull();
    expect(parseGithubUrl("https://github.com/owner/repo with space")).toBeNull();
  });
});
