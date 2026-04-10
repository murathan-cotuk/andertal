import { NextResponse } from "next/server";

const FALLBACK_BACKEND_URL = "https://belucha-medusa-backend.onrender.com";
const getBackendUrl = () => {
  const raw = String(process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "").trim();
  if (!raw || /localhost:9000/i.test(raw)) return FALLBACK_BACKEND_URL;
  return raw.replace(/\/$/, "");
};

export async function GET() {
  try {
    const base = getBackendUrl();
    const res = await fetch(`${base}/store/public-payment-config`, { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.ok ? 200 : res.status });
  } catch {
    return NextResponse.json({ stripe_publishable_key: null, payment_method_types: ["card"] }, { status: 200 });
  }
}
