import { NextResponse } from "next/server";

const getBackendUrl = () =>
  (process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000").replace(/\/$/, "");

const EMPTY = { query: "", mode: "related", total: 0, did_you_mean: null, products: [], categories: [], brands: [], suggestions: [] };

/** Relevance-ranked storefront search (backend src/store-search.js). */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const qs = new URLSearchParams();
    for (const key of ["q", "limit", "locale", "log", "country"]) {
      const v = searchParams.get(key);
      if (v != null && v !== "") qs.set(key, v);
    }
    const r = await fetch(`${getBackendUrl()}/store/search?${qs.toString()}`, { cache: "no-store" });
    const data = await r.json().catch(() => EMPTY);
    return NextResponse.json(data && typeof data === "object" ? data : EMPTY, {
      headers: { "Cache-Control": "public, s-maxage=15, stale-while-revalidate=60" },
    });
  } catch {
    return NextResponse.json(EMPTY);
  }
}
