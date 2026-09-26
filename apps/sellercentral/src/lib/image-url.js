/**
 * Resolve media URLs for Sellercentral.
 * Prefer NEXT_PUBLIC_UPLOADS_BASE_URL (R2/CDN) so panel previews do not hammer Render.
 */
const BACKEND_URL =
  (typeof process !== "undefined" && process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL) ||
  "http://localhost:9000";
const BASE = (BACKEND_URL || "").replace(/\/$/, "");
const UPLOADS_BASE = (
  (typeof process !== "undefined" && process.env.NEXT_PUBLIC_UPLOADS_BASE_URL) ||
  ""
).replace(/\/$/, "");

function getPathname(fullUrl) {
  if (!fullUrl || typeof fullUrl !== "string") return null;
  const s = fullUrl.trim();
  try {
    if (s.startsWith("//")) return new URL(`https:${s}`).pathname;
    if (s.startsWith("http")) return new URL(s).pathname;
  } catch (_) {}
  return null;
}

function toCdnUploadsUrl(uploadsPathname) {
  if (!UPLOADS_BASE || !uploadsPathname) return "";
  let p = String(uploadsPathname).replace(/^\/+/, "");
  if (p.startsWith("uploads/")) p = p.slice("uploads/".length);
  return `${UPLOADS_BASE}/${p}`;
}

export function resolveImageUrl(url) {
  if (!url || typeof url !== "string") return "";
  const u = url.trim();
  if (!u.startsWith("http") && !u.startsWith("//")) {
    if (u.startsWith("/uploads/") && UPLOADS_BASE) return toCdnUploadsUrl(u);
    return `${BASE}${u.startsWith("/") ? "" : "/"}${u}`;
  }
  const pathname = getPathname(u);
  if (pathname && pathname.startsWith("/uploads/")) {
    if (UPLOADS_BASE) return toCdnUploadsUrl(pathname);
    return `${BASE}${pathname}`;
  }
  return u;
}
