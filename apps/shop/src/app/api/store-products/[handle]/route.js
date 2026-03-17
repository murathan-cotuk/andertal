import { NextResponse } from "next/server";

const getBackendUrl = () =>
  (process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000").replace(/\/$/, "");

export async function GET(request, context) {
  const params = await Promise.resolve(context.params || {});
  const handle = params.handle;
  if (!handle) {
    return NextResponse.json({ product: null }, { status: 400 });
  }
  try {
    const base = getBackendUrl();
    const url = `${base}/store/products/${encodeURIComponent(handle)}`;
    const res = await fetch(url, {
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
    });
    if (res.status === 404) {
      return NextResponse.json({ product: null }, { status: 404 });
    }
    if (!res.ok) {
      return NextResponse.json({ product: null }, { status: res.status });
    }
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ product: null }, { status: 500 });
  }
}
