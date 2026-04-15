import { NextResponse } from "next/server";

// Cache branding per seller — changes rarely (logo, store name)
const settingsCache = new Map();
const SETTINGS_TTL = 5 * 60 * 1000; // 5 minutes

const getBackendUrl = () =>
  (process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000").replace(/\/$/, "");

export async function GET(req) {
  try {
    const url = new URL(req.url);
    const sellerId = url.searchParams.get("seller_id") || "default";
    const now = Date.now();
    const cached = settingsCache.get(sellerId);
    if (cached && cached.expiresAt > now) {
      return NextResponse.json(cached.data);
    }
    const base = getBackendUrl();
    const r = await fetch(
      `${base}/store/seller-settings?seller_id=${encodeURIComponent(sellerId)}`,
      { next: { revalidate: 300 } }
    );
    const data = await r.json().catch(() => ({}));
    const result = {
      store_name: data?.store_name || "",
      free_shipping_threshold_cents: data?.free_shipping_threshold_cents ?? null,
      free_shipping_thresholds: data?.free_shipping_thresholds ?? null,
      shop_logo_url: data?.shop_logo_url || "",
      shop_favicon_url: data?.shop_favicon_url || "",
      sellercentral_logo_url: data?.sellercentral_logo_url || "",
      sellercentral_favicon_url: data?.sellercentral_favicon_url || "",
      shop_logo_height: data?.shop_logo_height != null ? Number(data.shop_logo_height) : 34,
      sellercentral_logo_height: data?.sellercentral_logo_height != null ? Number(data.sellercentral_logo_height) : 30,
    };
    settingsCache.set(sellerId, { data: result, expiresAt: now + SETTINGS_TTL });
    return NextResponse.json(result, { status: r.ok ? 200 : r.status });
  } catch (e) {
    return NextResponse.json({ store_name: "", shop_logo_url: "", shop_favicon_url: "", sellercentral_logo_url: "", sellercentral_favicon_url: "", shop_logo_height: 34, sellercentral_logo_height: 30 }, { status: 200 });
  }
}

