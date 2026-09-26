/**
 * Resolve image URL for display.
 *
 * When NEXT_PUBLIC_UPLOADS_BASE_URL is set (Cloudflare R2 public URL), relative
 * /uploads/... paths and own-backend absolute /uploads URLs are rewritten to the
 * CDN so browsers never pull image bytes through Render.
 *
 * Disk paths are /uploads/media/...; R2 object keys are media/... (no "uploads"
 * segment) — matching medusa-backend/src/s3-upload.js.
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

/** /uploads/media/x → https://cdn/media/x (R2 keys omit the "uploads" prefix). */
function toCdnUploadsUrl(uploadsPathname) {
  if (!UPLOADS_BASE || !uploadsPathname) return "";
  let p = String(uploadsPathname).replace(/^\/+/, "");
  if (p.startsWith("uploads/")) p = p.slice("uploads/".length);
  return `${UPLOADS_BASE}/${p}`;
}

export function resolveImageUrl(url) {
  if (!url || typeof url !== "string") return "";
  const u = url.trim();
  if (!u) return "";

  if (!u.startsWith("http") && !u.startsWith("//")) {
    if (u.startsWith("/uploads/")) {
      if (UPLOADS_BASE) return toCdnUploadsUrl(u);
      return u;
    }
    return `${BASE}${u.startsWith("/") ? "" : "/"}${u}`;
  }

  const pathname = getPathname(u);
  if (pathname && pathname.startsWith("/uploads/")) {
    if (UPLOADS_BASE) return toCdnUploadsUrl(pathname);
    if (isOwnUploadHost(u)) return pathname;
    return u;
  }
  // Already absolute CDN / foreign URL — keep as-is
  return u;
}

/**
 * Rewrite image URLs inside HTML (e.g. collection description richtext).
 * Ensures img src="/uploads/..." or wrong-host URLs use the configured CDN/backend.
 */
export function rewriteImageUrlsInHtml(html) {
  if (!html || typeof html !== "string") return html;
  return html.replace(
    /<img([^>]*)\ssrc=["']([^"']+)["']/gi,
    (match, attrs, src) => `<img${attrs} src="${resolveImageUrl(src)}"`
  );
}
