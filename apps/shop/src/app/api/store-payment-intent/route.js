import { NextResponse } from "next/server";

const FALLBACK_BACKEND_URL = "https://belucha-medusa-backend.onrender.com";
const getBackendUrl = () => {
  const raw = String(process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "").trim();
  if (!raw || /localhost:9000/i.test(raw)) return FALLBACK_BACKEND_URL;
  return raw.replace(/\/$/, "");
};

export async function POST(request) {
  try {
    const body = await request.json();
    const base = getBackendUrl();
    const auth = request.headers.get("authorization");
    const headers = { "Content-Type": "application/json" };
    if (auth) headers.Authorization = auth;
    const res = await fetch(`${base}/store/payment-intent`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.ok ? 200 : res.status });
  } catch {
    return NextResponse.json({ message: "Payment intent creation failed" }, { status: 500 });
  }
}
