"use client";

import { useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function RepoForm({ onCreated }: { onCreated?: () => void }) {
  const searchParams = useSearchParams();
  // Initialize the input with ?prefill=<url> if present — lets the
  // "Try one of these" buttons on the homepage populate the form via a link.
  const [url, setUrl] = useState(() => searchParams.get("prefill") ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/repos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ githubUrl: url }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        throw new Error(json.error ?? "Failed to submit repo");
      }
      setUrl("");
      onCreated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <div className="flex gap-2">
        <Input
          name="githubUrl"
          placeholder="https://github.com/owner/repo"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          disabled={submitting}
          required
          autoComplete="off"
          spellCheck={false}
          className="font-mono text-sm"
        />
        <Button
          type="submit"
          disabled={submitting || url.trim().length === 0}
          className="shrink-0"
        >
          {submitting ? "Submitting…" : "Index repo"}
        </Button>
      </div>
      {error && (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      )}
    </form>
  );
}
