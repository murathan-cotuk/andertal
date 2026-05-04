import { NextResponse } from "next/server";

const getBackendUrl = () =>
  (process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000").replace(/\/$/, "");

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const product_id = searchParams.get("product_id");
    const variant_id = searchParams.get("variant_id") || "";
    const seller_id = searchParams.get("seller_id") || "";
    if (!product_id) {
      return NextResponse.json({ discount: null }, { status: 400 });
    }
    const base = getBackendUrl();
    const qs = new URLSearchParams({
      product_id,
      ...(variant_id ? { variant_id } : {}),
      ...(seller_id ? { seller_id } : {}),
    });
    const res = await fetch(`${base}/store/campaigns/discount?${qs}`, {
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
    });
    const data = await res.json().catch(() => ({ discount: null }));
    return NextResponse.json(data, { status: res.ok ? 200 : 200 });
  } catch {
    return NextResponse.json({ discount: null }, { status: 200 });
  }
}
