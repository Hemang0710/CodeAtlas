"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Download } from "lucide-react";

export function MermaidDiagram({
  source,
  className = "",
}: {
  source: string;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rendered, setRendered] = useState(false);
  const id = useId().replace(/:/g, "_");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const mermaidModule = await import("mermaid");
        const mermaid = mermaidModule.default;
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
          setRendered(true);
        }
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        setRendered(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [source, id]);

  const downloadSvg = useCallback(() => {
    if (!containerRef.current) return;
    const svg = containerRef.current.querySelector("svg");
    if (!svg) return;
    const blob = new Blob([svg.outerHTML], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "architecture.svg";
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const downloadPng = useCallback(() => {
    if (!containerRef.current) return;
    const svg = containerRef.current.querySelector("svg");
    if (!svg) return;
    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const img = new Image();
    img.onload = () => {
      canvas.width = img.width * 2;
      canvas.height = img.height * 2;
      ctx.scale(2, 2);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      canvas.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "architecture.png";
        a.click();
        URL.revokeObjectURL(url);
      });
    };
    img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svgData)));
  }, []);

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
    <div className={`relative ${className}`}>
      {rendered && (
        <div className="absolute right-2 top-2 z-10 flex gap-1">
          <button
            onClick={downloadSvg}
            className="flex items-center gap-1 rounded-md border border-zinc-200 bg-white/90 px-2 py-1 text-xs text-zinc-600 backdrop-blur-sm hover:bg-zinc-50 hover:text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900/90 dark:text-zinc-400 dark:hover:text-zinc-100 transition-colors"
            title="Download as SVG"
          >
            <Download className="h-3 w-3" />
            SVG
          </button>
          <button
            onClick={downloadPng}
            className="flex items-center gap-1 rounded-md border border-zinc-200 bg-white/90 px-2 py-1 text-xs text-zinc-600 backdrop-blur-sm hover:bg-zinc-50 hover:text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900/90 dark:text-zinc-400 dark:hover:text-zinc-100 transition-colors"
            title="Download as PNG"
          >
            <Download className="h-3 w-3" />
            PNG
          </button>
        </div>
      )}
      <div
        ref={containerRef}
        className="overflow-x-auto rounded-md border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950"
      />
    </div>
  );
}
