import { NextResponse } from "next/server";

const getBackendUrl = () =>
  (process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000").replace(/\/$/, "");

/** "Beliebte Suchen" — most submitted searches that had results (backend store-search.js). */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = searchParams.get("limit") || "8";
    const r = await fetch(`${getBackendUrl()}/store/search/popular?limit=${encodeURIComponent(limit)}`, {
      next: { revalidate: 60 },
    });
    const data = await r.json().catch(() => ({ searches: [] }));
    return NextResponse.json(
      { searches: Array.isArray(data?.searches) ? data.searches : [] },
      { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } },
    );
  } catch {
    return NextResponse.json({ searches: [] });
  }
}
