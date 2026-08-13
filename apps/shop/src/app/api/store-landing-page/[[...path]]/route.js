import { NextResponse } from "next/server";

const getBackendUrl = () =>
  (process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000").replace(/\/$/, "");

export async function GET(request, context) {
  const { path } = await context.params;
  const suffix = Array.isArray(path) && path.length ? `/${path.map(encodeURIComponent).join("/")}` : "";
  try {
    const base = getBackendUrl();
    const res = await fetch(`${base}/store/landing-page${suffix}`, {
      headers: { "Content-Type": "application/json" },
      next: { revalidate: 30 },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return NextResponse.json(
        { __error: true, status: res.status, message: data?.message || res.statusText },
        { status: res.status },
      );
    }
    return NextResponse.json(data, {
      headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120" },
    });
  } catch (e) {
    return NextResponse.json({ __error: true, status: 0, message: e?.message || "Network error" }, { status: 200 });
  }
}
