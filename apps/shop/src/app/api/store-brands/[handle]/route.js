import { NextResponse } from "next/server";

const getBackendUrl = () =>
  (process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000").replace(/\/$/, "");

export async function GET(request, context) {
  const params = await Promise.resolve(context.params || {});
  try {
    const handle = params?.handle;
    if (!handle) return NextResponse.json({ message: "handle required" }, { status: 400 });
    const base = getBackendUrl();
    const res = await fetch(`${base}/store/brands/${encodeURIComponent(handle)}`, {
      headers: { "Content-Type": "application/json" },
      next: { revalidate: 300 },
    });
    if (!res.ok) {
      return NextResponse.json({ message: "Brand not found" }, { status: res.status });
    }
    const data = await res.json();
    return NextResponse.json(data, {
      headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" },
    });
  } catch {
    return NextResponse.json({ message: "Internal server error" }, { status: 500 });
  }
}
