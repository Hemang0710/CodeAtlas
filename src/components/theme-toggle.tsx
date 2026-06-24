"use client";

import { useEffect, useSyncExternalStore } from "react";
import { Moon, Sun, Monitor } from "lucide-react";

type Theme = "light" | "dark" | "system";

function getSnapshot(): Theme {
  if (typeof window === "undefined") return "system";
  return (localStorage.getItem("codeatlas-theme") as Theme) ?? "system";
}

function getServerSnapshot(): Theme {
  return "system";
}

function subscribe(callback: () => void): () => void {
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches)) {
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
  }
}

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    if (theme === "system") {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      const handler = () => applyTheme("system");
      mq.addEventListener("change", handler);
      return () => mq.removeEventListener("change", handler);
    }
  }, [theme]);

  function cycle() {
    const next: Theme = theme === "light" ? "dark" : theme === "dark" ? "system" : "light";
    localStorage.setItem("codeatlas-theme", next);
    window.dispatchEvent(new StorageEvent("storage"));
    applyTheme(next);
  }

  const isDark = theme === "dark";
  const isSystem = theme === "system";

  return (
    <button
      onClick={cycle}
      className="relative flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100 transition-colors"
      aria-label={`Current theme: ${theme}. Click to cycle.`}
      title={`Theme: ${theme}`}
    >
      {isDark ? <Moon className="h-4 w-4" /> : isSystem ? <Monitor className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
      <span className="hidden sm:inline text-xs capitalize">{theme}</span>
    </button>
  );
}
