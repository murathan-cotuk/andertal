import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

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
    console.log('[store-seller-settings API] free_shipping_thresholds:', JSON.stringify(data?.free_shipping_thresholds));
    return NextResponse.json(
      {
        store_name: data?.store_name || "",
        free_shipping_threshold_cents: data?.free_shipping_threshold_cents ?? null,
        free_shipping_thresholds: data?.free_shipping_thresholds ?? null,
      },
      { status: r.ok ? 200 : r.status }
    );
  } catch (e) {
    return NextResponse.json({ store_name: "" }, { status: 200 });
  }
}

