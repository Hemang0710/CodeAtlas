/**
 * HTTP client for the CodeAtlas server. Uses the global `fetch` (available
 * in the VS Code extension host, Node 18+). No SDK — the /ask endpoint
 * streams plain text, so we read the body with a stream reader.
 */

export interface RepoListItem {
  id: string;
  name: string;
  githubUrl: string;
  status: string;
}

interface ReposResponse {
  repos: Array<{
    id: string;
    name: string;
    githubUrl: string;
    status: string;
  }>;
}

/** GET /api/repos — list indexed repositories for the repo picker. */
export async function listRepos(serverUrl: string): Promise<RepoListItem[]> {
  const res = await fetch(`${serverUrl}/api/repos`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`Server returned ${res.status} listing repos.`);
  }
  const json = (await res.json()) as ReposResponse;
  return json.repos.map((r) => ({
    id: r.id,
    name: r.name,
    githubUrl: r.githubUrl,
    status: r.status,
  }));
}

export interface AskContext {
  filePath: string;
  selection: string;
}

export interface AskOptions {
  serverUrl: string;
  repoId: string;
  question: string;
  context?: AskContext;
  /** Called with each text delta as it streams in. */
  onDelta: (chunk: string) => void;
  /** Lets the caller cancel an in-flight stream (e.g. user closed the panel). */
  signal?: AbortSignal;
}

/**
 * POST /api/repos/:id/ask and stream the plain-text answer back through
 * `onDelta`. Resolves when the stream ends; rejects on HTTP or network error.
 */
export async function askStream(opts: AskOptions): Promise<void> {
  const res = await fetch(`${opts.serverUrl}/api/repos/${opts.repoId}/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      question: opts.question,
      context: opts.context,
    }),
    signal: opts.signal,
  });

  if (!res.ok) {
    // The server returns JSON errors; surface the message if we can read one.
    let message = `Server returned ${res.status}.`;
    try {
      const json = (await res.json()) as { error?: string };
      if (json.error) message = json.error;
    } catch {
      /* body wasn't JSON — keep the status-code message */
    }
    throw new Error(message);
  }

  if (!res.body) {
    throw new Error("No response body from server.");
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) opts.onDelta(decoder.decode(value, { stream: true }));
    }
  } finally {
    reader.releaseLock();
  }
}
