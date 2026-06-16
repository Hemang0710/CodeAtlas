import { desc, eq, sql } from "drizzle-orm";

import { db } from "@/server/db/client";
import { files, indexJobs, repos, type Repo } from "@/server/db/schema";
import type { ParsedGithubUrl } from "@/lib/github";

/**
 * Repo-level service. All DB writes that touch the `repos` table go
 * through here so route handlers and worker code stay free of SQL.
 *
 * Re-submitting the same URL: we upsert on `github_url` (the unique key),
 * reset status to `queued`, and bump `updated_at`. The caller then queues
 * a fresh index_job. This keeps a single row per repo while still letting
 * users trigger a re-index by re-submitting.
 */

export interface RepoListItem extends Repo {
  fileCount: number;
  latestJobStatus: string | null;
  latestJobProgress: number;
  latestJobError: string | null;
}

export async function upsertRepoByUrl(parsed: ParsedGithubUrl): Promise<Repo> {
  // Drizzle's onConflictDoUpdate is the idiomatic way to express PG UPSERT
  // and keeps the round-trip count to one.
  const [row] = await db
    .insert(repos)
    .values({
      githubUrl: parsed.normalizedUrl,
      name: parsed.name,
      status: "queued",
    })
    .onConflictDoUpdate({
      target: repos.githubUrl,
      set: {
        status: "queued",
        updatedAt: sql`now()`,
      },
    })
    .returning();

  return row;
}

export async function getRepoById(id: string): Promise<Repo | null> {
  const [row] = await db.select().from(repos).where(eq(repos.id, id)).limit(1);
  return row ?? null;
}

export async function deleteRepo(id: string): Promise<boolean> {
  // ON DELETE CASCADE on files / index_jobs / chunks / file_edges takes care
  // of dependents — this single DELETE removes everything.
  const result = await db.delete(repos).where(eq(repos.id, id)).returning({
    id: repos.id,
  });
  return result.length > 0;
}

/**
 * List repos with their file count and most-recent job status — what the
 * homepage needs in one query. The LEFT JOIN + DISTINCT ON pattern picks
 * the latest job per repo without a correlated subquery.
 */
export async function listRepos(): Promise<RepoListItem[]> {
  // We use raw `sql` here for the aggregate joins because composing this
  // particular shape with Drizzle's builder is more code than the SQL itself,
  // and this lives in a service file (not raw SQL in a route handler).
  const rows = await db
    .select({
      id: repos.id,
      githubUrl: repos.githubUrl,
      name: repos.name,
      defaultBranch: repos.defaultBranch,
      status: repos.status,
      lastIndexedAt: repos.lastIndexedAt,
      createdAt: repos.createdAt,
      updatedAt: repos.updatedAt,
      fileCount: sql<number>`(select count(*)::int from ${files} where ${files.repoId} = ${repos.id})`,
      latestJobStatus: sql<
        string | null
      >`(select status from ${indexJobs} where ${indexJobs.repoId} = ${repos.id} order by ${indexJobs.createdAt} desc limit 1)`,
      latestJobProgress: sql<
        number
      >`coalesce((select progress from ${indexJobs} where ${indexJobs.repoId} = ${repos.id} order by ${indexJobs.createdAt} desc limit 1), 0)`,
      latestJobError: sql<
        string | null
      >`(select error from ${indexJobs} where ${indexJobs.repoId} = ${repos.id} order by ${indexJobs.createdAt} desc limit 1)`,
    })
    .from(repos)
    .orderBy(desc(repos.updatedAt));

  return rows as RepoListItem[];
}

export async function markRepoIndexing(id: string): Promise<void> {
  await db
    .update(repos)
    .set({ status: "indexing", updatedAt: sql`now()` })
    .where(eq(repos.id, id));
}

export async function markRepoReady(id: string): Promise<void> {
  await db
    .update(repos)
    .set({
      status: "ready",
      lastIndexedAt: sql`now()`,
      updatedAt: sql`now()`,
    })
    .where(eq(repos.id, id));
}

export async function markRepoFailed(id: string): Promise<void> {
  await db
    .update(repos)
    .set({ status: "failed", updatedAt: sql`now()` })
    .where(eq(repos.id, id));
}
