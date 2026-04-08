import { NextResponse } from "next/server";

const getBackendUrl = () =>
  (process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000").replace(/\/$/, "");

export async function GET(request) {
  try {
    const base = getBackendUrl();
    const { searchParams } = new URL(request.url);
    const qs = searchParams.toString();
    const res = await fetch(`${base}/store/categories${qs ? `?${qs}` : ""}`, {
      headers: { "Content-Type": "application/json" },
      next: { revalidate: 30 },
    });
    if (!res.ok) return NextResponse.json({ categories: [], tree: [], count: 0 }, { status: 200 });
    const data = await res.json();
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ categories: [], tree: [], count: 0 }, { status: 200 });
  }
}
