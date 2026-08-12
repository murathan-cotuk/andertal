import { NextResponse } from "next/server";

const getBackendUrl = () =>
  (process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000").replace(/\/$/, "");

function stripHandleSuffix(handle) {
  const lastDash = handle.lastIndexOf("-");
  if (lastDash < 1) return null;
  const suffix = handle.slice(lastDash + 1);
  if (!/^[a-z0-9]{8}$/.test(suffix)) return null;
  // New format: {handle}-a-{8chars} — strip "-a-{8chars}" to get base handle
  const withoutSuffix = handle.slice(0, lastDash);
  if (withoutSuffix.endsWith("-a")) return withoutSuffix.slice(0, -2);
  // Legacy format: {handle}-{8chars}
  return withoutSuffix;
}

async function fetchFromBackend(base, handle) {
  const res = await fetch(`${base}/store/products/${encodeURIComponent(handle)}`, {
    headers: { "Content-Type": "application/json" },
    next: { revalidate: 30 },
  });
  return res;
}

export async function GET(request, context) {
  const params = await Promise.resolve(context.params || {});
  const handle = params.handle;
  if (!handle) {
    return NextResponse.json({ product: null }, { status: 400 });
  }
  try {
    const base = getBackendUrl();
    let res = await fetchFromBackend(base, handle);

    // If not found, try stripping the 8-char short-code suffix
    if (res.status === 404) {
      const baseHandle = stripHandleSuffix(handle);
      if (baseHandle) res = await fetchFromBackend(base, baseHandle);
    }

    if (res.status === 404) {
      return NextResponse.json({ product: null }, { status: 404 });
    }
    if (!res.ok) {
      return NextResponse.json({ product: null }, { status: res.status });
    }
    const data = await res.json();
    const product = data?.product || null;
    const sid = String(product?.seller_id || "").trim();
    if (sid && sid !== "default") {
      const approvedRes = await fetch(`${base}/store/approved-seller-ids`, { next: { revalidate: 300 } }).catch(() => null);
      const approvedData = approvedRes && approvedRes.ok ? await approvedRes.json().catch(() => ({ seller_ids: [] })) : { seller_ids: [] };
      const approved = new Set((approvedData?.seller_ids || []).map((s) => String(s || "").trim()).filter(Boolean));
      if (!approved.has(sid)) {
        return NextResponse.json({ product: null }, { status: 404 });
      }
    }
    return NextResponse.json(data, {
      headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120" },
    });
  } catch {
    return NextResponse.json({ product: null }, { status: 500 });
  }
}
