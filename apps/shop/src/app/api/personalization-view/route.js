import { NextResponse } from "next/server";

const getBackendUrl = () =>
  (process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000").replace(/\/$/, "");

// Thin proxy: logs "this logged-in customer viewed this product" server-side
// (store_customer_product_views), so recently-viewed/trending-in-your-categories work
// across devices — not just in this browser's localStorage.
export async function POST(request) {
  try {
    const base = getBackendUrl();
    const authHeader = request.headers.get("authorization") || "";
    if (!authHeader) return NextResponse.json({ ok: false }, { status: 200 });
    const body = await request.json().catch(() => ({}));
    const res = await fetch(`${base}/store/personalization/view`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: authHeader },
      body: JSON.stringify({ product_id: body?.product_id }),
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.ok ? 200 : res.status });
  } catch {
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}
