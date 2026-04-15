import { NextResponse } from "next/server";

const getBackendUrl = () =>
  (process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000").replace(/\/$/, "");

// Cache the full collections list (used for carousel + handle lookup)
const colCache = { data: null, expiresAt: 0 };
const COL_TTL = 60 * 1000;

async function fetchAllCollections(base) {
  const now = Date.now();
  if (colCache.data && colCache.expiresAt > now) return colCache.data;
  const res = await fetch(`${base}/store/collections`, {
    headers: { "Content-Type": "application/json" },
    next: { revalidate: 60 },
  });
  if (!res.ok) return [];
  const data = await res.json();
  const cols = data?.collections || [];
  colCache.data = cols;
  colCache.expiresAt = now + COL_TTL;
  return cols;
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const handle = (searchParams.get("handle") || "").trim();
    const base = getBackendUrl();

    if (handle) {
      // Try single-handle endpoint first
      const singleUrl = `${base}/store/collections?handle=${encodeURIComponent(handle)}`;
      const res = await fetch(singleUrl, { headers: { "Content-Type": "application/json" }, next: { revalidate: 60 } });
      if (res.ok) {
        const data = await res.json();
        if (data?.collection) return NextResponse.json(data);
      }
      // Fallback: use cached list
      const collections = await fetchAllCollections(base);
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(handle).trim());
      const found = collections.find(
        (c) =>
          (c?.handle && String(c.handle).toLowerCase() === handle.toLowerCase()) ||
          (isUuid && c?.id && String(c.id).toLowerCase() === String(handle).trim().toLowerCase())
      );
      return NextResponse.json(found ? { collection: found, collections } : { collection: null, collections });
    }

    const collections = await fetchAllCollections(base);
    return NextResponse.json({ collections });
  } catch {
    return NextResponse.json({ collection: null, collections: [] }, { status: 200 });
  }
}
