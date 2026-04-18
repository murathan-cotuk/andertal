import { NextResponse } from "next/server";

const getBackendUrl = () =>
  (process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000").replace(/\/$/, "");

const locCache = { data: null, expiresAt: 0 };
const LOC_TTL = 5 * 60 * 1000; // 5 minutes — locations almost never change

export async function GET() {
  try {
    const skipCache = process.env.NODE_ENV === "development";
    const now = Date.now();
    if (!skipCache && locCache.data && locCache.expiresAt > now) {
      return NextResponse.json(locCache.data);
    }
    const base = getBackendUrl();
    const res = await fetch(`${base}/store/menu-locations`, {
      headers: { "Content-Type": "application/json" },
      ...(skipCache ? { cache: "no-store" } : { next: { revalidate: 300 } }),
    });
    if (!res.ok) return NextResponse.json({ locations: [] }, { status: 200 });
    const data = await res.json();
    if (!skipCache) {
      locCache.data = data;
      locCache.expiresAt = now + LOC_TTL;
    }
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ locations: [] }, { status: 200 });
  }
}
