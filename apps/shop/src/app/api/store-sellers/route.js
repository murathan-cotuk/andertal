import { NextResponse } from "next/server";

const getBackendUrl = () =>
  (process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000").replace(/\/$/, "");

export async function GET(req) {
  try {
    const url = new URL(req.url);
    const limit = url.searchParams.get("limit") || "20";
    const base = getBackendUrl();
    const res = await fetch(`${base}/store/sellers?limit=${encodeURIComponent(limit)}`, {
      cache: "no-store",
    });
    if (!res.ok) {
      return NextResponse.json({ sellers: [] }, { status: 200 });
    }
    const data = await res.json().catch(() => ({}));
    return NextResponse.json({ sellers: Array.isArray(data?.sellers) ? data.sellers : [] });
  } catch {
    return NextResponse.json({ sellers: [] }, { status: 200 });
  }
}
