/**
 * Resolve image URL for display.
 *
 * /uploads/ paths (relative or absolute) are returned as relative paths so the
 * shop's own rewrite rule proxies them — users see andertal.com URLs, never the
 * raw api.andertal.com backend.  All other absolute URLs are returned as-is.
 */
const BACKEND_URL = (typeof process !== "undefined" && process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL) || "http://localhost:9000";
const BASE = (BACKEND_URL || "").replace(/\/$/, "");

/** Extract pathname from a full URL (http(s) or //). Returns null if not a valid URL. */
function getPathname(fullUrl) {
  if (!fullUrl || typeof fullUrl !== "string") return null;
  const s = fullUrl.trim();
  try {
    if (s.startsWith("//")) return new URL(`https:${s}`).pathname;
    if (s.startsWith("http")) return new URL(s).pathname;
  } catch (_) {}
  return null;
}

export function resolveImageUrl(url) {
  if (!url || typeof url !== "string") return "";
  const u = url.trim();
  if (!u) return "";

  if (!u.startsWith("http") && !u.startsWith("//")) {
    // Relative path: /uploads/... stays relative so shop rewrite proxy serves it
    if (u.startsWith("/uploads/")) return u;
    return `${BASE}${u.startsWith("/") ? "" : "/"}${u}`;
  }

  // Absolute URL: if path is /uploads/..., strip the host so shop rewrite handles it
  const pathname = getPathname(u);
  if (pathname && pathname.startsWith("/uploads/")) {
    return pathname;
  }
  return u;
}

/**
 * Rewrite image URLs inside HTML (e.g. collection description richtext).
 * Ensures img src="/uploads/..." or wrong-host URLs use the configured backend.
 */
export function rewriteImageUrlsInHtml(html) {
  if (!html || typeof html !== "string") return html;
  return html.replace(
    /<img([^>]*)\ssrc=["']([^"']+)["']/gi,
    (match, attrs, src) => `<img${attrs} src="${resolveImageUrl(src)}"`
  );
}
