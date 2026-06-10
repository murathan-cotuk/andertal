import { NextResponse } from "next/server";

const getBackendUrl = () =>
  (process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000").replace(/\/$/, "");

export async function GET(request, { params }) {
  const { slug } = params;
  if (!slug) return NextResponse.json({ message: "Not found" }, { status: 404 });
  try {
    const base = getBackendUrl();
    const res = await fetch(`${base}/store/pages/${encodeURIComponent(slug)}`, { cache: "no-store" });
    if (!res.ok) return NextResponse.json({ message: "Not found" }, { status: 404 });
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ message: "Not found" }, { status: 404 });
  }
}
