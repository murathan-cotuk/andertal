import { NextResponse } from "next/server";

const getBackendUrl = () =>
  (process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000").replace(/\/$/, "");

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const handle = searchParams.get("handle") || "";
    const base = getBackendUrl();
    const url = handle
      ? `${base}/store/collections?handle=${encodeURIComponent(handle)}`
      : `${base}/store/collections`;
    const res = await fetch(url, {
      headers: { "Content-Type": "application/json" },
      next: { revalidate: 30 },
    });
    if (res.status === 404) {
      return NextResponse.json({ collection: null, collections: [] }, { status: 404 });
    }
    if (!res.ok) {
      return NextResponse.json({ collection: null, collections: [] }, { status: 200 });
    }
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ collection: null, collections: [] }, { status: 200 });
  }
}
