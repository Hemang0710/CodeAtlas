import { describe, expect, it } from "vitest";

import { buildAgentTools, toolSchemas } from "./tools";

/**
 * We can validate the *shape* of the tool bundle without actually
 * executing tools (they hit the DB + GitHub). The Zod input schemas live
 * on each tool, so we exercise those here.
 */

const fakeRepo = {
  id: "00000000-0000-0000-0000-000000000000",
  githubUrl: "https://github.com/owner/repo",
  defaultBranch: "main",
  name: "owner/repo",
};

describe("buildAgentTools", () => {
  const tools = buildAgentTools({ repo: fakeRepo });

  it("exposes the tool surface the system prompt promises", () => {
    expect(Object.keys(tools).sort()).toEqual([
      "get_dependencies",
      "get_impact",
      "list_files",
      "read_file",
      "search_code",
    ]);
  });

  it("rejects an empty query on search_code", () => {
    const schema = toolSchemas.search_code;
    const result = schema.safeParse({ query: "" });
    expect(result.success).toBe(false);
  });

  it("caps k on search_code", () => {
    const schema = toolSchemas.search_code;
    expect(schema.safeParse({ query: "x", k: 0 }).success).toBe(false);
    expect(schema.safeParse({ query: "x", k: 1 }).success).toBe(true);
    expect(schema.safeParse({ query: "x", k: 999 }).success).toBe(false);
  });

  it("requires a non-empty path on read_file", () => {
    const schema = toolSchemas.read_file;
    expect(schema.safeParse({ path: "" }).success).toBe(false);
    expect(schema.safeParse({ path: "src/index.ts" }).success).toBe(true);
    expect(
      schema.safeParse({
        path: "src/index.ts",
        startLine: 10,
        endLine: 20,
      }).success,
    ).toBe(true);
  });

  it("requires a non-empty path on get_dependencies", () => {
    const schema = toolSchemas.get_dependencies;
    expect(schema.safeParse({}).success).toBe(false);
    expect(schema.safeParse({ path: "src/a.ts" }).success).toBe(true);
  });

  it("accepts list_files with no arguments", () => {
    const schema = toolSchemas.list_files;
    expect(schema.safeParse({}).success).toBe(true);
  });
});
