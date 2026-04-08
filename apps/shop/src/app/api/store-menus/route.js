import { NextResponse } from "next/server";

const getBackendUrl = () =>
  (process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000").replace(/\/$/, "");

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
