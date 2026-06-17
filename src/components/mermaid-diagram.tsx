"use client";

import { useEffect, useId, useRef, useState } from "react";

/**
 * Render a Mermaid diagram from a source string.
 *
 * We import mermaid lazily (dynamic import inside useEffect) for two reasons:
 *   1. It's a heavy package (~700 KB) — keeping it out of the initial
 *      bundle until the user actually views a diagram pays for itself.
 *   2. It touches `window`, so SSR would throw. Lazy + client-only sidesteps.
 *
 * On parse error we show the raw source in a `<pre>` so the user (and the
 * LLM during diff inspection) can see what actually arrived. Important:
 * the AI sometimes emits malformed Mermaid; we don't want that to crash
 * the whole chat turn.
 */
export function MermaidDiagram({
  source,
  className = "",
}: {
  source: string;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const id = useId().replace(/:/g, "_"); // CSS-id-safe

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const mermaidModule = await import("mermaid");
        const mermaid = mermaidModule.default;
        // Initialise once per render. `initialize` is idempotent enough
        // that we don't need to remember whether we've called it.
        mermaid.initialize({
          startOnLoad: false,
          theme: "default",
          securityLevel: "strict",
          flowchart: { useMaxWidth: true, htmlLabels: true },
        });

        const { svg } = await mermaid.render(`mmd-${id}`, source);
        if (cancelled) return;
        if (containerRef.current) {
          containerRef.current.innerHTML = svg;
          setError(null);
        }
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [source, id]);

  if (error) {
    return (
      <div className={`rounded-md border border-amber-300 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/40 ${className}`}>
        <p className="mb-2 text-xs font-semibold text-amber-900 dark:text-amber-200">
          Diagram failed to render
        </p>
        <pre className="overflow-x-auto whitespace-pre-wrap font-mono text-xs text-amber-900 dark:text-amber-300">
          {error}
        </pre>
        <details className="mt-2">
          <summary className="cursor-pointer text-xs text-amber-800 dark:text-amber-400">
            source
          </summary>
          <pre className="mt-1 overflow-x-auto rounded bg-amber-100 p-2 font-mono text-xs text-amber-900 dark:bg-amber-950/60 dark:text-amber-300">
            {source}
          </pre>
        </details>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`overflow-x-auto rounded-md border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950 ${className}`}
    />
  );
}
