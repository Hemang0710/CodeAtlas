"use client";

import { useEffect, useState } from "react";
import { Keyboard, X } from "lucide-react";

const SHORTCUTS = [
  { keys: ["/"], description: "Focus search / chat input" },
  { keys: ["?"], description: "Show this shortcuts panel" },
  { keys: ["Esc"], description: "Close dialogs / clear focus" },
  { keys: ["Ctrl", "K"], description: "Focus search / chat input" },
];

export function KeyboardShortcuts() {
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      const isInput = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;

      if (e.key === "Escape") {
        setShowHelp(false);
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }
        return;
      }

      if (isInput) return;

      if (e.key === "?") {
        e.preventDefault();
        setShowHelp((prev) => !prev);
        return;
      }

      if (e.key === "/" || (e.key === "k" && (e.ctrlKey || e.metaKey))) {
        e.preventDefault();
        const input = document.querySelector<HTMLInputElement>(
          'input[placeholder*="Ask"], input[placeholder*="search"], input[placeholder*="Search"], input[placeholder*="question"]'
        );
        input?.focus();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  if (!showHelp) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-6 shadow-2xl dark:border-zinc-700 dark:bg-zinc-900">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Keyboard className="h-5 w-5 text-amber-500" />
            <h2 className="font-semibold">Keyboard Shortcuts</h2>
          </div>
          <button
            onClick={() => setShowHelp(false)}
            className="rounded p-1 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            aria-label="Close shortcuts"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <ul className="space-y-2">
          {SHORTCUTS.map((s) => (
            <li key={s.description} className="flex items-center justify-between text-sm">
              <span className="text-zinc-600 dark:text-zinc-400">{s.description}</span>
              <div className="flex gap-1">
                {s.keys.map((k) => (
                  <kbd
                    key={k}
                    className="rounded border border-zinc-300 bg-zinc-50 px-1.5 py-0.5 font-mono text-xs text-zinc-700 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                  >
                    {k}
                  </kbd>
                ))}
              </div>
            </li>
          ))}
        </ul>

        <p className="mt-4 text-xs text-zinc-400">
          Press <kbd className="rounded border border-zinc-300 bg-zinc-50 px-1 py-0.5 font-mono text-xs dark:border-zinc-600 dark:bg-zinc-800">?</kbd> or <kbd className="rounded border border-zinc-300 bg-zinc-50 px-1 py-0.5 font-mono text-xs dark:border-zinc-600 dark:bg-zinc-800">Esc</kbd> to close
        </p>
      </div>
    </div>
  );
}
