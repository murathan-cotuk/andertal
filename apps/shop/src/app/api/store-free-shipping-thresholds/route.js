import { NextResponse } from "next/server";

const getBackendUrl = () =>
  (process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000").replace(/\/$/, "");

/** Per-seller free-shipping thresholds for the sellers in a cart (see lib/seller-shipping.js). */
export async function GET(req) {
  try {
    const url = new URL(req.url);
    const ids = (url.searchParams.get("seller_ids") || "").trim();
    if (!ids) return NextResponse.json({ thresholds: {} });
    const r = await fetch(
      `${getBackendUrl()}/store/free-shipping-thresholds?seller_ids=${encodeURIComponent(ids)}`,
      { cache: "no-store" },
    );
    const data = await r.json().catch(() => ({}));
    return NextResponse.json({ thresholds: data?.thresholds && typeof data.thresholds === "object" ? data.thresholds : {} });
  } catch {
    return NextResponse.json({ thresholds: {} });
  }
}
