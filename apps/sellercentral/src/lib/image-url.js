const BACKEND_URL =
  (typeof process !== "undefined" && process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL) ||
  "http://localhost:9000";
const BASE = (BACKEND_URL || "").replace(/\/$/, "");

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
  if (!u.startsWith("http") && !u.startsWith("//")) {
    return `${BASE}${u.startsWith("/") ? "" : "/"}${u}`;
  }
  const pathname = getPathname(u);
  if (pathname && pathname.startsWith("/uploads/")) {
    return `${BASE}${pathname}`;
  }
  return u;
}
