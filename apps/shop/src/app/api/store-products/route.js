import { NextResponse } from "next/server";

const FALLBACK_BACKEND = "https://belucha-medusa-backend.onrender.com";
const getBackendUrl = () => {
  const raw = String(process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "").trim();
  if (!raw) return FALLBACK_BACKEND;
  const normalized = raw.replace(/\/$/, "");
  if (/localhost|127\.0\.0\.1/i.test(normalized)) return FALLBACK_BACKEND;
  return normalized;
};

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const qs = searchParams.toString();
    const base = getBackendUrl();
    const url = qs ? `${base}/store/products?${qs}` : `${base}/store/products`;
    const res = await fetch(url, {
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
    });
    if (!res.ok) {
      return NextResponse.json({ products: [], count: 0 }, { status: 200 });
    }
    const data = await res.json();
    const list = Array.isArray(data?.products) ? data.products : [];
    const approvedRes = await fetch(`${base}/store/approved-seller-ids`, { cache: "no-store" }).catch(() => null);
    const approvedData = approvedRes && approvedRes.ok ? await approvedRes.json().catch(() => ({ seller_ids: [] })) : { seller_ids: [] };
    const approved = new Set((approvedData?.seller_ids || []).map((s) => String(s || "").trim()).filter(Boolean));
    const filtered = list.filter((p) => {
      const sid = String(p?.seller_id || "").trim();
      if (!sid || sid === "default") return true;
      return approved.has(sid);
    });
    return NextResponse.json({ ...data, products: filtered, count: filtered.length });
  } catch {
    return NextResponse.json({ products: [], count: 0 }, { status: 200 });
  }
}
