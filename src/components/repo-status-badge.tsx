import { Badge } from "@/components/ui/badge";

/**
 * Maps a job status string to a coloured pill. Centralising this lets the
 * list page and the detail page agree on what "indexing" looks like.
 */

type StatusKind = "queued" | "running" | "ready" | "failed" | "default";

const STATUS_KIND: Record<string, StatusKind> = {
  queued: "queued",
  cloning: "running",
  parsing: "running",
  embedding: "running",
  indexing: "running",
  done: "ready",
  ready: "ready",
  failed: "failed",
};

const STATUS_LABEL: Record<string, string> = {
  queued: "Queued",
  cloning: "Cloning",
  parsing: "Parsing",
  embedding: "Embedding",
  indexing: "Indexing",
  done: "Ready",
  ready: "Ready",
  failed: "Failed",
};

export function RepoStatusBadge({ status }: { status: string | null }) {
  const key = status ?? "queued";
  const kind = STATUS_KIND[key] ?? "default";
  const label = STATUS_LABEL[key] ?? key;
  return <Badge variant={kind}>{label}</Badge>;
}
