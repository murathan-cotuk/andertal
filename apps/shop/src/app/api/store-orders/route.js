import { NextResponse } from "next/server";

const getBackendUrl = () =>
  (process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000").replace(/\/$/, "");

export async function POST(request) {
  const base = getBackendUrl();
  try {
    const body = await request.json();
    const auth = request.headers.get("authorization");
    const headers = { "Content-Type": "application/json" };
    if (auth) headers.Authorization = auth;
    const url = `${base}/store/orders`;
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    const contentType = res.headers.get("content-type") || "";
    let data = null;
    let rawText = "";
    try {
      if (contentType.includes("application/json")) {
        data = await res.json();
      } else {
        rawText = await res.text();
      }
    } catch (e) {
      rawText = `Failed to parse backend response: ${e?.message || String(e)}`;
    }

    if (res.ok) {
      return NextResponse.json(data || {}, { status: 201 });
    }

    const message =
      (data && typeof data === "object" && typeof data.message === "string" && data.message) ||
      (rawText && rawText.slice(0, 4000)) ||
      `Backend error (${res.status})`;

    return NextResponse.json(
      {
        message,
        backend_status: res.status,
      },
      { status: res.status }
    );
  } catch (e) {
    // Network / DNS / backend down / invalid JSON in request body etc.
    return NextResponse.json(
      {
        message: `Order creation failed: ${e?.message || "Unknown error"}`,
        backend_url: base,
      },
      { status: 500 }
    );
  }
}
