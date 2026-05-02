/**
 * Safari iOS: theme-color ve html arka planı için tek düz renk.
 * Header görünür yüzeyi `--header-chrome-bg` (gradient/katmanlı); `--header-bg` bazen yalnızca başlangıç hex'i.
 */

export function extractSolidTintFromChromeCss(chromeValue, fallback) {
  const fb = fallback && String(fallback).trim() ? String(fallback).trim() : "#1b8880";
  const s = String(chromeValue || "").trim();
  if (!s) return fb;
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(s)) return s.toLowerCase();
  if (/^rgba?\(/i.test(s)) return s;
  const hex = s.match(/#[0-9a-fA-F]{3,8}\b/);
  if (hex) return hex[0].toLowerCase();
  return fb;
}
