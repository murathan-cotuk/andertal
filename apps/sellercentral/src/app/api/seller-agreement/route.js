import { NextResponse } from "next/server";

const getBackendUrl = () =>
  (process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000").replace(/\/$/, "");

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const locale = String(searchParams.get("locale") || "de").slice(0, 2).toLowerCase();
  try {
    const res = await fetch(`${getBackendUrl()}/public/seller-agreement?locale=${encodeURIComponent(locale)}`, {
      headers: { Accept: "application/json" },
      next: { revalidate: 300 },
    });
    if (!res.ok) {
      return NextResponse.json({ message: "Agreement unavailable", sections: [] }, { status: 502 });
    }
    const data = await res.json();
    return NextResponse.json(data, {
      headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" },
    });
  } catch (e) {
    return NextResponse.json({ message: e?.message || "Error", sections: [] }, { status: 502 });
  }
}
