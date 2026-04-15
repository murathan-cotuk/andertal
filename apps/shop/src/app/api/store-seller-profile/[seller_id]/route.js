import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const getBackendUrl = () =>
  (process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000").replace(/\/$/, "");

export async function GET(req, { params }) {
  try {
    const { seller_id } = await params;
    const base = getBackendUrl();
    const r = await fetch(`${base}/store/seller-profile/${encodeURIComponent(seller_id)}`, {
      cache: "no-store",
    });
    const data = await r.json().catch(() => ({}));
    return NextResponse.json(data, { status: r.ok ? 200 : r.status });
  } catch (e) {
    return NextResponse.json({ seller: null, reviews: [], products: [] }, { status: 200 });
  }
}
