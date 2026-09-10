import { NextResponse } from "next/server";
import { registerStoreApiCache } from "@/lib/store-api-cache-registry";

const getBackendUrl = () =>
  (process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000").replace(/\/$/, "");

/** Global product-page visibility/layout settings live on the reserved
 *  `__product_page__` landing row (settings blob). Read-only for the shop. */
let cache = { at: 0, data: null };
const TTL_MS = 30 * 1000;

registerStoreApiCache("product-page-settings", () => {
  cache = { at: 0, data: null };
});

const EMPTY = { settings: {}, containers: [] };

export async function GET() {
  const now = Date.now();
  if (cache.data && now - cache.at < TTL_MS) {
    return NextResponse.json(cache.data, {
      headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120" },
    });
  }
  try {
    const res = await fetch(`${getBackendUrl()}/store/landing-page/__product_page__`, {
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
    });
    if (!res.ok) return NextResponse.json(EMPTY, { status: 200 });
    const data = await res.json();
    const out = {
      settings: data && typeof data.settings === "object" && data.settings ? data.settings : {},
      containers: Array.isArray(data?.containers) ? data.containers : [],
    };
    cache = { at: now, data: out };
    return NextResponse.json(out, {
      headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120" },
    });
  } catch {
    return NextResponse.json(EMPTY, { status: 200 });
  }
}
