import { sql } from "drizzle-orm";
import {
  bigint,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  vector,
} from "drizzle-orm/pg-core";

/**
 * Database schema for CodeAtlas.
 *
 * Migrations live in /drizzle and are generated from this file via
 * `pnpm db:generate`. The very first migration (0000_enable_pgvector.sql)
 * is hand-written and turns on the pgvector extension; everything else is
 * generated. See docs/ROADMAP.md for which columns each phase actually
 * uses — the schema is defined up-front so we don't churn it every phase.
 */

// -- Enums -----------------------------------------------------------------

/** Lifecycle state for a repository in our index. */
export const repoStatus = pgEnum("repo_status", [
  "queued",
  "indexing",
  "ready",
  "failed",
]);

/** Pipeline stage for a single indexing job. */
export const jobStatus = pgEnum("job_status", [
  "queued",
  "cloning",
  "parsing",
  "embedding",
  "done",
  "failed",
]);

/** What kind of AST node a chunk represents. */
export const symbolType = pgEnum("symbol_type", [
  "function",
  "class",
  "method",
  "module",
  "other",
]);

/** Kind of dependency edge between two files. Today we only emit `imports`. */
export const edgeType = pgEnum("edge_type", ["imports"]);

// -- Tables ----------------------------------------------------------------

export const repos = pgTable(
  "repos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    githubUrl: text("github_url").notNull(),
    name: text("name").notNull(),
    defaultBranch: text("default_branch").notNull().default("main"),
    status: repoStatus("status").notNull().default("queued"),
    lastIndexedAt: timestamp("last_indexed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("repos_github_url_uq").on(t.githubUrl)],
);

export const indexJobs = pgTable(
  "index_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    repoId: uuid("repo_id")
      .notNull()
      .references(() => repos.id, { onDelete: "cascade" }),
    status: jobStatus("status").notNull().default("queued"),
    /** 0–100. Updated by the worker at each pipeline stage. */
    progress: integer("progress").notNull().default(0),
    error: text("error"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("index_jobs_repo_id_idx").on(t.repoId)],
);

export const files = pgTable(
  "files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    repoId: uuid("repo_id")
      .notNull()
      .references(() => repos.id, { onDelete: "cascade" }),
    path: text("path").notNull(),
    language: text("language"),
    /** SHA-256 of file contents — lets re-indexing skip unchanged files. */
    contentHash: text("content_hash").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("files_repo_path_uq").on(t.repoId, t.path),
    index("files_repo_id_idx").on(t.repoId),
  ],
);

export const chunks = pgTable(
  "chunks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fileId: uuid("file_id")
      .notNull()
      .references(() => files.id, { onDelete: "cascade" }),
    symbolName: text("symbol_name"),
    symbolType: symbolType("symbol_type").notNull().default("other"),
    startLine: integer("start_line").notNull(),
    endLine: integer("end_line").notNull(),
    content: text("content").notNull(),
    /**
     * voyage-code-3 outputs 1024-dim vectors. If we ever switch providers
     * with different dims we'll add a new column rather than reshape this one.
     */
    embedding: vector("embedding", { dimensions: 1024 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("chunks_file_id_idx").on(t.fileId),
    // HNSW index for cosine similarity is added in a later migration once
    // we start embedding (Phase 3); creating it now would just slow inserts
    // with no benefit.
  ],
);

export const fileEdges = pgTable(
  "file_edges",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceFileId: uuid("source_file_id")
      .notNull()
      .references(() => files.id, { onDelete: "cascade" }),
    targetFileId: uuid("target_file_id")
      .notNull()
      .references(() => files.id, { onDelete: "cascade" }),
    edgeType: edgeType("edge_type").notNull().default("imports"),
  },
  (t) => [
    uniqueIndex("file_edges_unique").on(
      t.sourceFileId,
      t.targetFileId,
      t.edgeType,
    ),
    index("file_edges_target_idx").on(t.targetFileId),
  ],
);

// -- Inferred row types — import these in services rather than re-declaring.

export type Repo = typeof repos.$inferSelect;
export type NewRepo = typeof repos.$inferInsert;
export type IndexJob = typeof indexJobs.$inferSelect;
export type NewIndexJob = typeof indexJobs.$inferInsert;
export type FileRow = typeof files.$inferSelect;
export type NewFileRow = typeof files.$inferInsert;
export type Chunk = typeof chunks.$inferSelect;
export type NewChunk = typeof chunks.$inferInsert;
export type FileEdge = typeof fileEdges.$inferSelect;
export type NewFileEdge = typeof fileEdges.$inferInsert;

// Re-export `sql` so callers don't need a second drizzle import for raw bits.
export { sql };
