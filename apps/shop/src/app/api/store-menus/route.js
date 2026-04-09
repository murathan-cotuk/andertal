import { NextResponse } from "next/server";

const FALLBACK_BACKEND = "https://belucha-medusa-backend.onrender.com";
const getBackendUrl = () => {
  const raw = String(process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "").trim();
  if (!raw) return FALLBACK_BACKEND;
  const normalized = raw.replace(/\/$/, "");
  if (/localhost|127\.0\.0\.1/i.test(normalized)) return FALLBACK_BACKEND;
  return normalized;
};

export async function GET() {
  try {
    const base = getBackendUrl();
    const res = await fetch(`${base}/store/menus`, {
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
    });
    if (!res.ok) return NextResponse.json({ menus: [], count: 0 }, { status: 200 });
    const data = await res.json();
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ menus: [], count: 0 }, { status: 200 });
  }
}
