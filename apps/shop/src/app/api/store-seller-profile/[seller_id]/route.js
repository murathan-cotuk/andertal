import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const getBackendUrl = () => {
  const raw = String(process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "").trim();
  if (!raw || /localhost|127\.0\.0\.1/i.test(raw)) {
    return "https://belucha-medusa-backend.onrender.com";
  }
  return raw.replace(/\/$/, "");
};

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
