import { NextResponse } from "next/server";

const FALLBACK_BACKEND = "https://belucha-medusa-backend.onrender.com";
const getBackendUrl = () => {
  const raw = String(process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "").trim();
  if (!raw) return FALLBACK_BACKEND;
  const normalized = raw.replace(/\/$/, "");
  if (/localhost|127\.0\.0\.1/i.test(normalized)) return FALLBACK_BACKEND;
  return normalized;
};

const categoriesCache = new Map();
const CACHE_TTL_MS = 45 * 1000; // 45 seconds — matches backend TTL so edits appear quickly

export async function GET(request) {
  try {
    const base = getBackendUrl();
    const { searchParams } = new URL(request.url);
    const qs = searchParams.toString();
    const cacheKey = qs || "__root__";
    const now = Date.now();
    const cached = categoriesCache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      return NextResponse.json(cached.data);
    }
    const res = await fetch(`${base}/store/categories${qs ? `?${qs}` : ""}`, {
      headers: { "Content-Type": "application/json" },
      next: { revalidate: 30 },
    });
    if (!res.ok) return NextResponse.json({ categories: [], tree: [], count: 0 }, { status: 200 });
    const data = await res.json();
    categoriesCache.set(cacheKey, { data, expiresAt: now + CACHE_TTL_MS });
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ categories: [], tree: [], count: 0 }, { status: 200 });
  }
}
