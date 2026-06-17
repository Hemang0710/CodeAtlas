import { describe, expect, it } from "vitest";

import { buildSystemPrompt } from "./system-prompt";

describe("buildSystemPrompt", () => {
  it("mentions the repo name and branch", () => {
    const p = buildSystemPrompt({ repoName: "vercel/next.js", defaultBranch: "main" });
    expect(p).toContain("vercel/next.js");
    expect(p).toContain("main");
  });

  it("enforces the load-bearing rules from the DoD", () => {
    const p = buildSystemPrompt({ repoName: "o/r", defaultBranch: "main" });
    // Citations: explicit format example must be present.
    expect(p).toMatch(/path\/to\/file\.ts:42/);
    // Honest "not found" instruction.
    expect(p.toLowerCase()).toMatch(/didn[’']?t find|never invent/);
    // Lists the four tools so the model knows what's on the table.
    expect(p).toContain("search_code");
    expect(p).toContain("read_file");
    expect(p).toContain("list_files");
    expect(p).toContain("get_dependencies");
  });
});
