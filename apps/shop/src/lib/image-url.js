/**
 * Resolve image URL for display.
 *
 * Own-backend /uploads/ paths (relative or absolute) stay as relative /uploads/...
 * so the shop rewrite proxies them from the backend disk — most catalog images still
 * live there until migrated to R2.
 *
 * Absolute R2/CDN URLs (or any foreign host) are left as-is. New uploads already
 * store full https://pub-….r2.dev/media/... URLs in the DB when S3_UPLOAD_* is set.
 *
 * Do NOT rewrite every /uploads path to NEXT_PUBLIC_UPLOADS_BASE_URL: that breaks
 * legacy files that were never copied to R2.
 */
const BACKEND_URL =
  (typeof process !== "undefined" && process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL) ||
  "http://localhost:9000";
const BASE = (BACKEND_URL || "").replace(/\/$/, "");
const UPLOADS_BASE = (
  (typeof process !== "undefined" && process.env.NEXT_PUBLIC_UPLOADS_BASE_URL) ||
  ""
).replace(/\/$/, "");

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

function isUploadsCdnHost(fullUrl) {
  if (!UPLOADS_BASE) return false;
  try {
    const abs = fullUrl.startsWith("//") ? `https:${fullUrl}` : fullUrl;
    const host = new URL(abs).hostname.toLowerCase();
    const cdnHost = new URL(UPLOADS_BASE.startsWith("http") ? UPLOADS_BASE : `https://${UPLOADS_BASE}`).hostname.toLowerCase();
    return host === cdnHost;
  } catch (_) {
    return false;
  }
}

function isOwnUploadHost(fullUrl) {
  try {
    const abs = fullUrl.startsWith("//") ? `https:${fullUrl}` : fullUrl;
    const host = new URL(abs).hostname.toLowerCase();
    if (host === "localhost" || host === "127.0.0.1") return true;
    let backendHost = "";
    try {
      const b = BASE.startsWith("http") ? BASE : `https://${BASE}`;
      backendHost = new URL(b).hostname.toLowerCase();
    } catch (_) {}
    if (backendHost && host === backendHost) return true;
    if (host === "andertal.com" || host.endsWith(".andertal.com")) return true;
    if (host.endsWith(".onrender.com")) return true;
    return false;
  } catch (_) {
    return false;
  }
}

export function resolveImageUrl(url) {
  if (!url || typeof url !== "string") return "";
  const u = url.trim();
  if (!u) return "";

  if (!u.startsWith("http") && !u.startsWith("//")) {
    // Relative /uploads/... → shop rewrite → backend disk (legacy + safe).
    if (u.startsWith("/uploads/")) return u;
    return `${BASE}${u.startsWith("/") ? "" : "/"}${u}`;
  }

  // Already on R2/CDN — keep absolute.
  if (isUploadsCdnHost(u)) return u;

  const pathname = getPathname(u);
  if (pathname && pathname.startsWith("/uploads/")) {
    // Own backend absolute /uploads → same-origin relative (shop proxy).
    if (isOwnUploadHost(u)) return pathname;
    return u;
  }
  return u;
}

/**
 * Rewrite image URLs inside HTML (e.g. collection description richtext).
 */
export function rewriteImageUrlsInHtml(html) {
  if (!html || typeof html !== "string") return html;
  return html.replace(
    /<img([^>]*)\ssrc=["']([^"']+)["']/gi,
    (match, attrs, src) => `<img${attrs} src="${resolveImageUrl(src)}"`
  );
}
