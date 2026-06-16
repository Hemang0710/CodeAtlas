import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
  {
    variants: {
      variant: {
        default: "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100",
        queued: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
        running: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
        ready: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
        failed: "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}
