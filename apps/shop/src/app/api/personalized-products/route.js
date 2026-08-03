import { NextResponse } from "next/server";

const getBackendUrl = () =>
  (process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000").replace(/\/$/, "");

// Thin proxy to the real recommendation engine (apps/medusa-backend/src/routes/personalization.js),
// which reads this project's actual catalog/order tables (admin_hub_products, store_orders,
// store_customer_wishlist, store_customer_product_views) — NOT Medusa's native /store/products
// and /store/customers/me/orders, which this route used to call and which are always empty here
// (the real storefront never writes through Medusa's native order/product modules).
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const base = getBackendUrl();
    const authHeader = request.headers.get("authorization") || "";
    const res = await fetch(`${base}/store/personalization/products?${searchParams.toString()}`, {
      headers: {
        "Content-Type": "application/json",
        ...(authHeader ? { Authorization: authHeader } : {}),
      },
      cache: "no-store",
    });
    if (!res.ok) return NextResponse.json({ products: [] });
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ products: [] }, { status: 200 });
  }
}
