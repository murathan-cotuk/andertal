import { NextResponse } from "next/server";
import { fetchLandingPage } from "@/lib/landing-page-fetch";

export async function GET(request, context) {
  const { path } = await context.params;
  const suffix = Array.isArray(path) && path.length ? `/${path.map(encodeURIComponent).join("/")}` : "";
  const data = await fetchLandingPage(suffix);
  if (data?.__error) {
    return NextResponse.json(data, { status: data.status || 200 });
  }
  return NextResponse.json(data, {
    headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120" },
  });
}
