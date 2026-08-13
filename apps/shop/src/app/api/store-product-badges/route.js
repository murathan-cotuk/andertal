import { NextResponse } from "next/server";

const getBackendUrl = () =>
  (process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000").replace(/\/$/, "");

/** Live badge styles — never CDN-cache; Sellercentral size edits must show immediately. */
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const base = getBackendUrl();
    const res = await fetch(`${base}/store/product-badges`, {
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
    });
    if (!res.ok) {
      return NextResponse.json({ badges: [] }, { status: res.status, headers: { "Cache-Control": "no-store" } });
    }
    const data = await res.json();
    return NextResponse.json(data, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch {
    return NextResponse.json({ badges: [] }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
