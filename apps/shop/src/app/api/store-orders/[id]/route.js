import { NextResponse } from "next/server";

const getBackendUrl = () =>
  (process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000").replace(/\/$/, "");

export async function GET(request, { params }) {
  try {
    const { id } = await params;
    if (!id) return NextResponse.json({ message: "Order ID required" }, { status: 400 });
    const base = getBackendUrl();
    // Forward the customer's Bearer token when present so the backend can enforce ownership for
    // logged-in customers — guests (no token, e.g. post-checkout redirect or email links) still
    // resolve by id alone. See storeOrdersGET in store-checkout.js for the ownership check.
    const authHeader = request.headers.get("authorization") || "";
    const res = await fetch(`${base}/store/orders/${id}`, {
      next: { revalidate: 0 },
      headers: authHeader ? { Authorization: authHeader } : {},
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.ok ? 200 : res.status });
  } catch {
    return NextResponse.json({ message: "Failed to fetch order" }, { status: 500 });
  }
}
