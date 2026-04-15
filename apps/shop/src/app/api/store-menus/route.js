import { NextResponse } from "next/server";

const getBackendUrl = () =>
  (process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000").replace(/\/$/, "");

const menusCache = { data: null, expiresAt: 0 };
const MENUS_TTL = 60 * 1000; // 60 seconds

export async function GET() {
  try {
    const now = Date.now();
    if (menusCache.data && menusCache.expiresAt > now) {
      return NextResponse.json(menusCache.data);
    }
    const base = getBackendUrl();
    const res = await fetch(`${base}/store/menus`, {
      headers: { "Content-Type": "application/json" },
      next: { revalidate: 60 },
    });
    if (!res.ok) return NextResponse.json({ menus: [], count: 0 }, { status: 200 });
    const data = await res.json();
    menusCache.data = data;
    menusCache.expiresAt = now + MENUS_TTL;
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ menus: [], count: 0 }, { status: 200 });
  }
}
