import { NextResponse } from "next/server";

const getBackendUrl = () =>
  (process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000").replace(/\/$/, "");

/** Always fresh — template changes (products_per_row, etc.) must show without waiting for TTL. */
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const base = getBackendUrl();
    const res = await fetch(`${base}/store/styles`, { cache: "no-store" });
    if (!res.ok) return NextResponse.json({ styles: {} }, { status: 200 });
    const data = await res.json().catch(() => ({ styles: {} }));
    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch {
    return NextResponse.json({ styles: {} }, { status: 200 });
  }
}
