import { NextResponse } from "next/server";

const getBackendUrl = () =>
  (process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000").replace(/\/$/, "");

export async function GET() {
  try {
    const base = getBackendUrl();
    const res = await fetch(`${base}/store/pages`, { cache: "no-store" });
    if (!res.ok) return NextResponse.json({ pages: [], count: 0 }, { status: 200 });
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ pages: [], count: 0 }, { status: 200 });
  }
}
