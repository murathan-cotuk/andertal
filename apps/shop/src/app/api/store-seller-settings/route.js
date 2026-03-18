import { NextResponse } from "next/server";

export async function GET(req) {
  try {
    const url = new URL(req.url);
    const sellerId = url.searchParams.get("seller_id") || "default";
    const base = process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000";
    const r = await fetch(
      `${base}/store/seller-settings?seller_id=${encodeURIComponent(sellerId)}`,
      { cache: "no-store" }
    );
    const data = await r.json().catch(() => ({}));
    return NextResponse.json(
      { store_name: data?.store_name || "" },
      { status: r.ok ? 200 : r.status }
    );
  } catch (e) {
    return NextResponse.json({ store_name: "" }, { status: 200 });
  }
}

