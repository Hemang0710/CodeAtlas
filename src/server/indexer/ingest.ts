import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { UnrecoverableError } from "bullmq";

import { fetchRepoMetadata, RepoNotFoundError } from "@/lib/github-api";
import { parseGithubUrl } from "@/lib/github";
import { insertChunks, clearChunksForFiles } from "@/server/services/chunks";
import { clearEdgesForRepo, insertEdges } from "@/server/services/edges";
import {
  deleteFilesByIds,
  getExistingFilesMap,
  getFilesForRepoIndexed,
  upsertFiles,
} from "@/server/services/files";
import { markJobFailed, updateJob } from "@/server/services/jobs";
import {
  markRepoFailed,
  markRepoIndexing,
  markRepoReady,
} from "@/server/services/repos";

import { chunkFile, type ChunkPart } from "./chunk";
import { cloneRepo, directorySize } from "./clone";
import { INDEXER_LIMITS } from "./config";
import { embedRepoChunks } from "./embed";
import { chunkText } from "./fallback-chunk";
import { extractImports, type ImportRef } from "./imports";
import { resolveEdges } from "./resolve-edges";
import { walkRepo, type WalkedFile } from "./walk";

/**
 * Full ingestion pipeline. Stages and progress:
 *
 *   pre-flight                              jobs.status="cloning" 2%
 *   git clone                                                   20%
 *   walk + diff against existing files      jobs.status="parsing" 30%
 *   per-file chunk + import-extract (changed files only)        35-75%
 *   resolve + insert edges                                     80%
 *   embed unembedded chunks (Voyage)        jobs.status="embedding" 80-99%
 *   wrap up                                 jobs.status="done"  100%
 *
 * The skip-unchanged-files diff in stage 3 is what makes re-indexing
 * cheap: files whose contentHash matches a previously-indexed row keep
 * their chunks and embeddings as-is, so they cost zero API calls.
 */
export async function ingestRepo(input: {
  repoId: string;
  jobId: string;
  githubUrl: string;
}): Promise<void> {
  const { repoId, jobId, githubUrl } = input;
  const parsed = parseGithubUrl(githubUrl);
  if (!parsed) {
    await markJobFailed(jobId, `Invalid GitHub URL: ${githubUrl}`);
    await markRepoFailed(repoId);
    throw new UnrecoverableError(`Invalid GitHub URL: ${githubUrl}`);
  }

  // -- Pre-flight ----------------------------------------------------------
  try {
    await updateJob(jobId, { status: "cloning", progress: 2 });
    const meta = await fetchRepoMetadata(parsed.owner, parsed.repo);

    const sizeBytes = meta.sizeKb * 1024;
    if (sizeBytes > INDEXER_LIMITS.MAX_REPO_BYTES) {
      const reportedMb = Math.round(meta.sizeKb / 1024);
      const capMb = INDEXER_LIMITS.MAX_REPO_BYTES / 1024 / 1024;
      throw new UnrecoverableError(
        `Repository is ${reportedMb} MB (GitHub reported), which exceeds the ${capMb} MB cap.`,
      );
    }
    if (meta.archived) {
      console.log(`[ingest] note: ${parsed.name} is archived on GitHub`);
    }
  } catch (err) {
    if (err instanceof RepoNotFoundError) {
      await markJobFailed(jobId, err.message);
      await markRepoFailed(repoId);
      throw new UnrecoverableError(err.message);
    }
    if (err instanceof UnrecoverableError) {
      await markJobFailed(jobId, err.message);
      await markRepoFailed(repoId);
      throw err;
    }
    const message = err instanceof Error ? err.message : String(err);
    await updateJob(jobId, { error: message });
    throw err;
  }

  // -- Real work -----------------------------------------------------------
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "codeatlas-"));
  const cloneDir = path.join(tempDir, "repo");

  try {
    await markRepoIndexing(repoId);
    await updateJob(jobId, { progress: 5 });

    await cloneRepo({ cloneUrl: parsed.cloneUrl, targetDir: cloneDir });
    await updateJob(jobId, { progress: 20 });

    const size = await directorySize(cloneDir);
    if (size > INDEXER_LIMITS.MAX_REPO_BYTES) {
      throw new UnrecoverableError(
        `Repository is ${Math.round(size / 1024 / 1024)} MB after clone, exceeds the ${INDEXER_LIMITS.MAX_REPO_BYTES / 1024 / 1024} MB cap.`,
      );
    }

    // ---- Walk + diff against existing -----------------------------------
    await updateJob(jobId, { status: "parsing", progress: 30 });
    const walk = await walkRepo(cloneDir);
    const existing = await getExistingFilesMap(repoId);

    // Classify each walked file. "changed" includes both new files and
    // files whose contentHash differs from what's in the DB.
    const changed: WalkedFile[] = [];
    const newPaths = new Set<string>();
    for (const f of walk.files) {
      newPaths.add(f.path);
      const prev = existing.get(f.path);
      if (!prev || prev.contentHash !== f.contentHash) changed.push(f);
    }
    // Orphans = files in the DB that didn't appear in this walk. They get
    // deleted, and chunks/edges cascade out.
    const orphanIds: string[] = [];
    for (const [path, prev] of existing) {
      if (!newPaths.has(path)) orphanIds.push(prev.id);
    }

    await deleteFilesByIds(orphanIds);

    // Upsert metadata for every walked file. For unchanged files this is
    // a no-op write but it keeps the row's `updated_at`-style trail honest.
    await upsertFiles(
      walk.files.map((f) => ({
        repoId,
        path: f.path,
        language: f.language ?? null,
        contentHash: f.contentHash,
        sizeBytes: f.sizeBytes,
      })),
    );

    // For changed files we need to wipe their existing chunks before
    // inserting the fresh AST output — otherwise we'd accumulate stale
    // rows alongside the new ones.
    const changedExistingIds: string[] = [];
    for (const f of changed) {
      const prev = existing.get(f.path);
      if (prev) changedExistingIds.push(prev.id);
    }
    if (changedExistingIds.length > 0) {
      await clearChunksForFiles(changedExistingIds);
    }

    // We always rebuild file_edges from scratch because resolution depends
    // on the full file set — a single moved file can invalidate many edges.
    await clearEdgesForRepo(repoId);

    // ---- Per-file: chunk (changed only) + collect imports (all files) --
    const { files: fileRows, pathToId } = await getFilesForRepoIndexed(repoId);
    const changedPaths = new Set(changed.map((c) => c.path));
    const allChunks: { fileId: string; chunk: ChunkPart }[] = [];
    const importsByPath = new Map<
      string,
      { language: string | null; imports: ImportRef[] }
    >();

    const chunkProgressSpan = 40; // 30 → 70 during this phase
    let processed = 0;

    for (const row of fileRows) {
      const fileFullPath = path.join(cloneDir, row.path);
      let content: string;
      try {
        content = await fs.readFile(fileFullPath, "utf8");
      } catch {
        processed++;
        continue;
      }

      // Chunking is only redone for changed files; unchanged files keep
      // their existing chunks (and embeddings) untouched.
      if (changedPaths.has(row.path)) {
        const chunks = await chunkOrFallback(row.path, content);
        for (const c of chunks) {
          allChunks.push({ fileId: row.id, chunk: c });
        }
      }

      // Imports get re-extracted for every file — edge resolution needs the
      // full picture. Re-extraction is cheap relative to chunking.
      const imports = await safeExtractImports(row.path, content);
      if (imports.length > 0) {
        importsByPath.set(row.path, { language: row.language, imports });
      }

      processed++;
      if (processed % 50 === 0) {
        const pct =
          30 + Math.round((processed / fileRows.length) * chunkProgressSpan);
        await updateJob(jobId, { progress: pct });
      }
    }

    if (allChunks.length > 0) {
      await insertChunks(
        allChunks.map(({ fileId, chunk }) => ({
          fileId,
          symbolName: chunk.symbolName,
          symbolType: chunk.symbolType,
          startLine: chunk.startLine,
          endLine: chunk.endLine,
          content: chunk.content,
          // Embeddings come right after — leave null and let embedRepoChunks
          // backfill in batches.
          embedding: null,
        })),
      );
    }
    await updateJob(jobId, { progress: 75 });

    // ---- Resolve + insert edges -----------------------------------------
    const knownPaths = new Set(pathToId.keys());
    const edges: { sourceFileId: string; targetFileId: string }[] = [];
    for (const [sourcePath, { language, imports }] of importsByPath) {
      const sourceId = pathToId.get(sourcePath);
      if (!sourceId) continue;
      const resolved = resolveEdges({
        sourceFilePath: sourcePath,
        language,
        imports,
        knownPaths,
      });
      for (const e of resolved) {
        const targetId = pathToId.get(e.targetFilePath);
        if (!targetId) continue;
        edges.push({ sourceFileId: sourceId, targetFileId: targetId });
      }
    }
    if (edges.length > 0) {
      await insertEdges(
        edges.map((e) => ({
          sourceFileId: e.sourceFileId,
          targetFileId: e.targetFileId,
          edgeType: "imports" as const,
        })),
      );
    }
    await updateJob(jobId, { progress: 78 });

    // ---- Embed unembedded chunks ----------------------------------------
    let embedded = 0;
    if (process.env.VOYAGE_API_KEY) {
      await updateJob(jobId, { status: "embedding", progress: 80 });
      const embedResult = await embedRepoChunks(repoId, {
        onProgress: async (done, total) => {
          // Map 0→100% of embedding onto 80→99% of overall progress.
          const pct = 80 + Math.round((done / total) * 19);
          await updateJob(jobId, { progress: pct });
        },
      });
      embedded = embedResult.embedded;
    } else {
      // No key? We still finish the job successfully — Phase 3 search just
      // won't return semantic hits until the user sets VOYAGE_API_KEY and
      // re-indexes (or we add a "re-embed" button later).
      console.warn(
        "[ingest] VOYAGE_API_KEY not set — skipping embedding step. " +
          "Set it in .env.local and re-index to enable semantic search.",
      );
    }
    await updateJob(jobId, { progress: 99 });

    // ---- Wrap up --------------------------------------------------------
    await markRepoReady(repoId);
    await updateJob(jobId, { status: "done", progress: 100, finished: true });

    console.log(
      `[ingest] repo=${parsed.name} files=${fileRows.length} changed=${changed.length} orphaned=${orphanIds.length} chunks=${allChunks.length} edges=${edges.length} embedded=${embedded} skipped=${walk.skipped}`,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[ingest] failed repo=${parsed.name} err=${message}`);
    await markJobFailed(jobId, message);
    await markRepoFailed(repoId);
    throw err;
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {
      /* best-effort cleanup */
    });
  }
}

async function chunkOrFallback(
  filePath: string,
  content: string,
): Promise<ChunkPart[]> {
  try {
    const ast = await chunkFile(filePath, content);
    if (ast !== null) return ast;
  } catch (err) {
    console.warn(
      `[ingest] AST chunker failed for ${filePath}: ${err instanceof Error ? err.message : err}`,
    );
  }
  return chunkText(content);
}

async function safeExtractImports(
  filePath: string,
  content: string,
): Promise<ImportRef[]> {
  try {
    return await extractImports(filePath, content);
  } catch {
    return [];
  }
}
