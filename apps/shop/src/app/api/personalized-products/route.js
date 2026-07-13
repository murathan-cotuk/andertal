import { NextResponse } from "next/server";

const getBackendUrl = () =>
  (process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000").replace(/\/$/, "");

function toSalesScore(metadata) {
  if (!metadata || typeof metadata !== "object") return 0;
  const soldLastMonth = Number(metadata.sold_last_month ?? 0);
  if (Number.isFinite(soldLastMonth) && soldLastMonth > 0) return soldLastMonth;
  const sold = Number(metadata.sold ?? metadata.sales_count ?? 0);
  return Number.isFinite(sold) && sold > 0 ? sold : 0;
}

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const algorithm = searchParams.get("algorithm") || "top_picks";
    const limit = Math.min(20, Math.max(1, Number(searchParams.get("limit")) || 8));
    const base = getBackendUrl();

    // ── reorder ───────────────────────────────────────────────────────────────
    if (algorithm === "reorder") {
      const authHeader = request.headers.get("authorization") || "";
      if (!authHeader.startsWith("Bearer ")) {
        return NextResponse.json({ products: [] }, { status: 401 });
      }
      const token = authHeader.slice(7);

      const ordersRes = await fetch(`${base}/store/customers/me/orders?limit=100`, {
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (!ordersRes.ok) return NextResponse.json({ products: [] });
      const ordersData = await ordersRes.json();
      const orders = Array.isArray(ordersData?.orders) ? ordersData.orders : [];

      const now = Date.now();
      const oldOrders = orders.filter((o) => now - new Date(o.created_at).getTime() > THIRTY_DAYS_MS);
      const recentOrders = orders.filter((o) => now - new Date(o.created_at).getTime() <= THIRTY_DAYS_MS);

      // Collect handles from recent orders (already re-purchased)
      const recentHandles = new Set();
      recentOrders.forEach((o) => {
        (o.items || []).forEach((item) => {
          const handle = item.variant?.product?.handle;
          if (handle) recentHandles.add(handle);
        });
      });

      // Collect unique old handles not re-purchased recently
      const candidateHandles = [];
      const seen = new Set();
      for (const order of oldOrders) {
        for (const item of order.items || []) {
          const handle = item.variant?.product?.handle;
          if (handle && !recentHandles.has(handle) && !seen.has(handle)) {
            seen.add(handle);
            candidateHandles.push(handle);
          }
        }
      }

      // Fetch fresh product data for those handles (up to limit)
      const products = [];
      for (const handle of candidateHandles.slice(0, limit)) {
        try {
          const pRes = await fetch(`${base}/store/products/${encodeURIComponent(handle)}`, {
            headers: { "Content-Type": "application/json" },
            cache: "no-store",
          });
          if (pRes.ok) {
            const pData = await pRes.json();
            if (pData?.product) products.push(pData.product);
          }
        } catch {
          // skip failed handle
        }
      }
      return NextResponse.json({ products });
    }

    // ── also_bought / trending_for_you ────────────────────────────────────────
    if (algorithm === "also_bought" || algorithm === "trending_for_you") {
      const categoriesParam = searchParams.get("categories") || "";
      const excludeParam = searchParams.get("exclude") || "";
      const excludeHandles = new Set(
        excludeParam.split(",").map((h) => h.trim()).filter(Boolean)
      );
      const categorySlugs = categoriesParam.split(",").map((s) => s.trim()).filter(Boolean);

      const productMap = new Map();
      for (const slug of categorySlugs) {
        try {
          const cRes = await fetch(
            `${base}/store/products?category=${encodeURIComponent(slug)}&limit=20`,
            { headers: { "Content-Type": "application/json" }, cache: "no-store" }
          );
          if (cRes.ok) {
            const cData = await cRes.json();
            (Array.isArray(cData?.products) ? cData.products : []).forEach((p) => {
              if (!productMap.has(p.id)) productMap.set(p.id, p);
            });
          }
        } catch {
          // skip failed category
        }
      }

      const products = Array.from(productMap.values())
        .filter((p) => !excludeHandles.has(p.handle))
        .sort((a, b) => toSalesScore(b.metadata) - toSalesScore(a.metadata))
        .slice(0, limit);

      return NextResponse.json({ products });
    }

    // ── top_picks (default) ───────────────────────────────────────────────────
    const res = await fetch(`${base}/store/products?limit=50`, {
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
    });
    if (!res.ok) return NextResponse.json({ products: [] });
    const data = await res.json();
    const all = Array.isArray(data?.products) ? data.products : [];
    const products = all
      .sort((a, b) => toSalesScore(b.metadata) - toSalesScore(a.metadata))
      .slice(0, limit);
    return NextResponse.json({ products });
  } catch {
    return NextResponse.json({ products: [] }, { status: 200 });
  }
}
