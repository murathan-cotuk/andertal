import { NextResponse } from "next/server";

const getBackendUrl = () =>
  (process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000").replace(/\/$/, "");

export async function POST(request) {
  const base = getBackendUrl();
  try {
    const body = await request.json();
    const headers = {
      "Content-Type": "application/json",
      "User-Agent": request.headers.get("user-agent") || "",
      "X-Forwarded-For": request.headers.get("x-forwarded-for") || "",
      "X-Real-IP": request.headers.get("x-real-ip") || "",
      "CF-IPCountry": request.headers.get("cf-ipcountry") || "",
      "CF-IPCity": request.headers.get("cf-ipcity") || "",
      "CF-Region": request.headers.get("cf-region") || "",
    };
    const res = await fetch(`${base}/store/presence/heartbeat`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    const contentType = res.headers.get("content-type") || "";
    let data = null;
    if (contentType.includes("application/json")) {
      data = await res.json().catch(() => ({}));
    }
    return NextResponse.json(data || {}, { status: res.status });
  } catch {
    return NextResponse.json({ ok: false }, { status: 502 });
  }
}
