import { NextResponse } from "next/server";

const getBackendUrl = () =>
  (process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000").replace(/\/$/, "");

// Cache styles — re-fetch at most every 60 seconds
const stylesCache = { data: null, expiresAt: 0 };
const STYLES_TTL = 60 * 1000;

export async function GET() {
  try {
    const now = Date.now();
    if (stylesCache.data && stylesCache.expiresAt > now) {
      return NextResponse.json(stylesCache.data);
    }
    const base = getBackendUrl();
    const res = await fetch(`${base}/store/styles`, { next: { revalidate: 60 } });
    if (!res.ok) return NextResponse.json({ styles: {} }, { status: 200 });
    const data = await res.json().catch(() => ({ styles: {} }));
    stylesCache.data = data;
    stylesCache.expiresAt = now + STYLES_TTL;
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ styles: {} }, { status: 200 });
  }
}
