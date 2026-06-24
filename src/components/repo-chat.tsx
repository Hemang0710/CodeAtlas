"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useChat } from "@ai-sdk/react";
import { Check, Copy, Loader2, MessageSquare, Sparkles, Wrench } from "lucide-react";

import { MermaidDiagram } from "@/components/mermaid-diagram";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { splitTextAroundMermaid } from "@/lib/mermaid-text";

/**
 * Phase 5 streaming chat. Uses the AI SDK's `useChat` hook to drive the
 * stream; each message is rendered by walking its `parts` array so we can
 * show tool calls inline.
 *
 * Conversation lifecycle:
 *   1. On mount we POST /conversations and stash the new id.
 *   2. Every `sendMessage` carries `{ conversationId }` in the body.
 *   3. The server appends user + assistant turns to the DB as they happen.
 */

export function RepoChat({ repoId }: { repoId: string }) {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);

  // Pre-create the conversation row so the chat route never has to invent
  // one mid-stream.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/repos/${repoId}/conversations`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        if (!res.ok) throw new Error(`Could not start a conversation (${res.status}).`);
        const json = (await res.json()) as { conversation: { id: string } };
        if (cancelled) return;
        setConversationId(json.conversation.id);
      } catch (err) {
        if (!cancelled) {
          setCreateError(err instanceof Error ? err.message : "Unknown error");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [repoId]);

  // The transport gets re-created exactly once, when conversationId flips
  // from null to a UUID. That's well before any user could click Send, so
  // we don't risk tearing down a live stream. We capture conversationId as
  // a closure here so the prepare callback doesn't need to read a ref.
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: `/api/repos/${repoId}/chat`,
        prepareSendMessagesRequest({ messages, body }) {
          return {
            body: { ...body, conversationId, messages },
          };
        },
      }),
    [repoId, conversationId],
  );

  const { messages, sendMessage, status, error } = useChat({
    transport,
  });

  const [input, setInput] = useState("");
  const isSending = status === "submitted" || status === "streaming";

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const text = input.trim();
    if (!text || !conversationId) return;
    setInput("");
    void sendMessage({ text });
  }

  return (
    <section className="space-y-4">
      <header className="flex items-center gap-2">
        <MessageSquare className="h-4 w-4 text-zinc-500" />
        <h2 className="text-sm font-semibold">Ask the codebase</h2>
        {!conversationId && !createError && (
          <span className="text-xs text-zinc-500">starting…</span>
        )}
      </header>

      {createError && (
        <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          {createError}
        </p>
      )}

      {messages.length === 0 && conversationId && !createError && (
        <p className="rounded-lg border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-500 dark:border-zinc-700">
          Try: <em>&quot;Where is the entry point?&quot;</em>,{" "}
          <em>&quot;Explain the auth flow.&quot;</em>, or{" "}
          <em>&quot;What does <code>handleRequest</code> do?&quot;</em>
        </p>
      )}

      <ul className="space-y-4">
        {messages.map((m) => (
          <MessageBubble key={m.id} message={m} />
        ))}
      </ul>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          {error.message}
        </p>
      )}

      <form onSubmit={onSubmit} className="flex gap-2">
        <Input
          placeholder="Ask anything about this repository…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={!conversationId || isSending}
          autoComplete="off"
        />
        <Button
          type="submit"
          disabled={!conversationId || isSending || input.trim().length === 0}
        >
          {isSending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          {isSending ? "Thinking…" : "Ask"}
        </Button>
      </form>
    </section>
  );
}

function MessageBubble({ message }: { message: UIMessage }) {
  const isUser = message.role === "user";
  return (
    <li
      className={
        isUser
          ? "rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/40"
          : "rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
      }
    >
      <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-wide text-zinc-500">
        {isUser ? "You" : "CodeAtlas"}
      </div>
      <div className="space-y-3">
        {message.parts.map((part, i) => (
          <PartRenderer key={i} part={part} />
        ))}
      </div>
    </li>
  );
}

function PartRenderer({ part }: { part: UIMessage["parts"][number] }) {
  if (part.type === "text") {
    // The agent may emit ```mermaid blocks; split those out so each block
    // renders as a diagram while the surrounding prose still gets its
    // citation chips.
    const segments = splitTextAroundMermaid(part.text);
    return (
      <div className="space-y-3 text-sm leading-relaxed text-zinc-900 dark:text-zinc-100">
        {segments.map((seg, i) =>
          seg.type === "mermaid" ? (
            <MermaidDiagram key={i} source={seg.source} />
          ) : (
            <div key={i} className="whitespace-pre-wrap">
              {renderWithCitations(seg.text)}
            </div>
          ),
        )}
      </div>
    );
  }

  // Tool calls/results carry a type like `tool-<name>`.
  if (typeof part.type === "string" && part.type.startsWith("tool-")) {
    const toolName = part.type.slice("tool-".length);
    const state = (part as { state?: string }).state;
    const input = (part as { input?: unknown }).input;
    const output = (part as { output?: unknown }).output;
    return (
      <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/60">
        <div className="mb-2 flex items-center gap-2 text-xs">
          <Wrench className="h-3.5 w-3.5" />
          <span className="font-mono font-semibold">{toolName}</span>
          {state && (
            <Badge variant={state === "output-available" ? "ready" : "queued"}>
              {state === "output-available" ? "done" : state}
            </Badge>
          )}
        </div>
        {input !== undefined && (
          <CopyablePre content={JSON.stringify(input, null, 2)} />
        )}
        {output !== undefined && state === "output-available" && (
          <details className="mt-2">
            <summary className="cursor-pointer text-xs text-zinc-500">
              result
            </summary>
            <CopyablePre content={JSON.stringify(output, null, 2)} className="mt-1 max-h-64 overflow-auto" />
          </details>
        )}
      </div>
    );
  }
  return null;
}

/**
 * Turn `path/to/file.ts:42` and `path/to/file.ts:42-58` mentions inside
 * assistant text into clickable chips. Citations are the load-bearing
 * promise of this product, so we make them visually distinct.
 */
const CITATION_RE = /([a-zA-Z0-9_./-]+\.[a-zA-Z]{1,6}):(\d+)(?:-(\d+))?/g;

function CopyablePre({ content, className = "" }: { content: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  async function handleCopy() {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <div className={`group relative ${className}`}>
      <button
        onClick={handleCopy}
        className="absolute right-2 top-2 rounded border border-zinc-200 bg-white/80 p-1 text-zinc-500 opacity-0 transition-opacity hover:text-zinc-900 group-hover:opacity-100 dark:border-zinc-700 dark:bg-zinc-900/80 dark:hover:text-zinc-100"
        aria-label="Copy code"
      >
        {copied ? <Check className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3" />}
      </button>
      <pre className="overflow-x-auto rounded bg-zinc-100 p-2 font-mono text-xs text-zinc-700 dark:bg-zinc-950 dark:text-zinc-300">
        {content}
      </pre>
    </div>
  );
}

function renderWithCitations(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let i = 0;
  while ((match = CITATION_RE.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    nodes.push(
      <code
        key={`c${i++}`}
        className="rounded bg-amber-100 px-1 py-0.5 font-mono text-xs text-amber-900 dark:bg-amber-950/60 dark:text-amber-300"
      >
        {match[0]}
      </code>,
    );
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}
