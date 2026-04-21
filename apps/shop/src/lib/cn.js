import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge Tailwind classes safely (deduplicates conflicting classes).
 * Usage: cn("px-4 py-2", condition && "bg-blue-500", "px-8")
 *   → "py-2 bg-blue-500 px-8"  (px-4 is replaced by px-8)
 */
export function cn(...inputs) {
  return twMerge(clsx(inputs));
}
