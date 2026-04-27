import { NextResponse } from "next/server";

const getBackendUrl = () =>
  (process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000").replace(/\/$/, "");

async function forward(request, ctx) {
  try {
    const base = getBackendUrl();
    const params = await ctx?.params;
    const parts = Array.isArray(params?.path) ? params.path : [];
    const suffix = parts.length ? `/${parts.map(encodeURIComponent).join("/")}` : "";
    const incoming = new URL(request.url);
    const query = incoming.search || "";
    const url = `${base}/store/carts${suffix}${query}`;

    const headers = { "Content-Type": "application/json" };
    const auth = request.headers.get("authorization");
    if (auth) headers.Authorization = auth;

    const method = request.method || "GET";
    const hasBody = method !== "GET" && method !== "HEAD";
    const bodyText = hasBody ? await request.text() : "";

    const res = await fetch(url, {
      method,
      headers,
      body: hasBody ? bodyText : undefined,
      cache: "no-store",
    });

    const text = await res.text();
    return new NextResponse(text, {
      status: res.status,
      headers: { "Content-Type": res.headers.get("content-type") || "application/json" },
    });
  } catch (e) {
    return NextResponse.json(
      { message: e?.message || "Cart proxy failed" },
      { status: 502 },
    );
  }
}

export async function GET(request, ctx) {
  return forward(request, ctx);
}

export async function POST(request, ctx) {
  return forward(request, ctx);
}

export async function PATCH(request, ctx) {
  return forward(request, ctx);
}

export async function DELETE(request, ctx) {
  return forward(request, ctx);
}
