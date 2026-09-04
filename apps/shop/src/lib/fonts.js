/**
 * Self-hosted via next/font/google (build-time download + fallback-metric matching) instead of a
 * render-blocking CSS @import to fonts.googleapis.com — removes the extra network round trip and
 * the layout shift from font-swap on first paint. CSS variables are wired into globals.css'
 * --font-sans and consumed anywhere `var(--font-sans)` is already used.
 */
import { Inter } from "next/font/google";

export const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-inter",
});
