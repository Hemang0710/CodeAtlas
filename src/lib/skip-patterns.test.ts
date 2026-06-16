import { describe, expect, it } from "vitest";

import {
  SKIP_DIRS,
  SKIP_FILES,
  isSecretFile,
} from "./skip-patterns";

describe("skip patterns", () => {
  it("contains the dirs CLAUDE.md tells us to skip", () => {
    for (const dir of ["node_modules", ".git", "dist", "build"]) {
      expect(SKIP_DIRS.has(dir)).toBe(true);
    }
  });

  it("contains lockfiles", () => {
    for (const f of ["package-lock.json", "pnpm-lock.yaml", "Cargo.lock"]) {
      expect(SKIP_FILES.has(f)).toBe(true);
    }
  });

  it("flags secret filenames", () => {
    expect(isSecretFile(".env")).toBe(true);
    expect(isSecretFile(".env.local")).toBe(true);
    expect(isSecretFile("server.pem")).toBe(true);
    expect(isSecretFile("id_rsa")).toBe(true);
    expect(isSecretFile("credentials.json")).toBe(true);
    expect(isSecretFile(".npmrc")).toBe(true);
  });

  it("does not flag normal source files", () => {
    expect(isSecretFile("index.ts")).toBe(false);
    expect(isSecretFile("README.md")).toBe(false);
    expect(isSecretFile("env.ts")).toBe(false);
  });
});
