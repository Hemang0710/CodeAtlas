import Link from "next/link";

import { cn } from "@/lib/utils";

/**
 * Tab strip across the three repo pages (chat/architecture/guide).
 * Server component on purpose — these are real links, not client state.
 */
const ITEMS: { key: string; label: string; href: (id: string) => string }[] = [
  { key: "chat", label: "Chat & files", href: (id) => `/repos/${id}` },
  {
    key: "architecture",
    label: "Architecture",
    href: (id) => `/repos/${id}/architecture`,
  },
  { key: "guide", label: "Onboarding", href: (id) => `/repos/${id}/guide` },
];

export function RepoNav({
  repoId,
  active,
}: {
  repoId: string;
  active: "chat" | "architecture" | "guide";
}) {
  return (
    <nav className="flex gap-1 border-b border-zinc-200 dark:border-zinc-800">
      {ITEMS.map((item) => {
        const isActive = item.key === active;
        return (
          <Link
            key={item.key}
            href={item.href(repoId)}
            className={cn(
              "border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              isActive
                ? "border-zinc-900 text-zinc-900 dark:border-zinc-100 dark:text-zinc-100"
                : "border-transparent text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
