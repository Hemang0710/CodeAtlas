import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge Tailwind class names safely. clsx handles conditional/array inputs;
 * twMerge dedupes conflicting Tailwind utilities (e.g. `p-2 p-4` → `p-4`).
 * This is the same helper shadcn/ui expects to live at `@/lib/utils`.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
