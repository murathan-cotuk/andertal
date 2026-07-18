import { NextResponse } from "next/server";

const getBackendUrl = () =>
  (process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000").replace(/\/$/, "");

const menusCache = new Map(); // locale -> { data, expiresAt }
const MENUS_TTL = 60 * 1000; // 60 seconds

export async function GET(request) {
  const locale = new URL(request.url).searchParams.get("locale") || "";
  try {
    const skipCache = process.env.NODE_ENV === "development";
    const now = Date.now();
    const cached = menusCache.get(locale);
    if (!skipCache && cached && cached.expiresAt > now) {
      return NextResponse.json(cached.data);
    }
    const base = getBackendUrl();
    const qs = locale ? `?locale=${encodeURIComponent(locale)}` : "";
    const res = await fetch(`${base}/store/menus${qs}`, {
      headers: { "Content-Type": "application/json" },
      ...(skipCache ? { cache: "no-store" } : { next: { revalidate: 60 } }),
    });
    if (!res.ok) {
      if (process.env.NODE_ENV === "development") {
        console.warn(
          `[shop/api/store-menus] ${res.status} from ${base}/store/menus — sidebar menü boş kalabilir.`,
        );
      }
      return NextResponse.json({ menus: [], count: 0 }, { status: 200 });
    }
    const data = await res.json();
    if (!skipCache) {
      menusCache.set(locale, { data, expiresAt: now + MENUS_TTL });
    }
    return NextResponse.json(data);
  } catch (e) {
    if (process.env.NODE_ENV === "development") {
      console.warn(`[shop/api/store-menus] ${e?.message || e} — backend: ${getBackendUrl()}`);
    }
    return NextResponse.json({ menus: [], count: 0 }, { status: 200 });
  }
}
