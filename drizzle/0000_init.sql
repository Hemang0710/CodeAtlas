-- Required by the `embedding vector(1024)` column on the chunks table below.
-- Supabase ships pgvector pre-installed; on local Postgres the user must
-- have superuser rights for this to succeed.
CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
-- pg_trgm helps fuzzy identifier matching later; cheap to enable now.
CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE TYPE "public"."edge_type" AS ENUM('imports');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('queued', 'cloning', 'parsing', 'embedding', 'done', 'failed');--> statement-breakpoint
CREATE TYPE "public"."repo_status" AS ENUM('queued', 'indexing', 'ready', 'failed');--> statement-breakpoint
CREATE TYPE "public"."symbol_type" AS ENUM('function', 'class', 'method', 'module', 'other');--> statement-breakpoint
CREATE TABLE "chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"file_id" uuid NOT NULL,
	"symbol_name" text,
	"symbol_type" "symbol_type" DEFAULT 'other' NOT NULL,
	"start_line" integer NOT NULL,
	"end_line" integer NOT NULL,
	"content" text NOT NULL,
	"embedding" vector(1024),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "file_edges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_file_id" uuid NOT NULL,
	"target_file_id" uuid NOT NULL,
	"edge_type" "edge_type" DEFAULT 'imports' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"repo_id" uuid NOT NULL,
	"path" text NOT NULL,
	"language" text,
	"content_hash" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "index_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"repo_id" uuid NOT NULL,
	"status" "job_status" DEFAULT 'queued' NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"error" text,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "repos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"github_url" text NOT NULL,
	"name" text NOT NULL,
	"default_branch" text DEFAULT 'main' NOT NULL,
	"status" "repo_status" DEFAULT 'queued' NOT NULL,
	"last_indexed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chunks" ADD CONSTRAINT "chunks_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_edges" ADD CONSTRAINT "file_edges_source_file_id_files_id_fk" FOREIGN KEY ("source_file_id") REFERENCES "public"."files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_edges" ADD CONSTRAINT "file_edges_target_file_id_files_id_fk" FOREIGN KEY ("target_file_id") REFERENCES "public"."files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_repo_id_repos_id_fk" FOREIGN KEY ("repo_id") REFERENCES "public"."repos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "index_jobs" ADD CONSTRAINT "index_jobs_repo_id_repos_id_fk" FOREIGN KEY ("repo_id") REFERENCES "public"."repos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chunks_file_id_idx" ON "chunks" USING btree ("file_id");--> statement-breakpoint
CREATE UNIQUE INDEX "file_edges_unique" ON "file_edges" USING btree ("source_file_id","target_file_id","edge_type");--> statement-breakpoint
CREATE INDEX "file_edges_target_idx" ON "file_edges" USING btree ("target_file_id");--> statement-breakpoint
CREATE UNIQUE INDEX "files_repo_path_uq" ON "files" USING btree ("repo_id","path");--> statement-breakpoint
CREATE INDEX "files_repo_id_idx" ON "files" USING btree ("repo_id");--> statement-breakpoint
CREATE INDEX "index_jobs_repo_id_idx" ON "index_jobs" USING btree ("repo_id");--> statement-breakpoint
CREATE UNIQUE INDEX "repos_github_url_uq" ON "repos" USING btree ("github_url");