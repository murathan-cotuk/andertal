import { NextResponse } from "next/server";

const COOKIE_NAME = "sc_token";
const MAX_AGE    = 60 * 60 * 24 * 7; // 7 days

/**
 * POST /api/auth/session
 * Body: { token: string }
 * Sets an httpOnly cookie so the session survives XSS-safe.
 */
export async function POST(request) {
  let token;
  try {
    const body = await request.json();
    token = typeof body?.token === "string" ? body.token.trim() : "";
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  if (!token) {
    return NextResponse.json({ error: "token is required" }, { status: 400 });
  }

  const isProd = process.env.NODE_ENV === "production";

  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure:   isProd,
    sameSite: "strict",
    path:     "/",
    maxAge:   MAX_AGE,
  });
  return res;
}

/**
 * DELETE /api/auth/session
 * Clears the httpOnly session cookie (logout).
 */
export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_NAME, "", {
    httpOnly: true,
    secure:   process.env.NODE_ENV === "production",
    sameSite: "strict",
    path:     "/",
    maxAge:   0,
  });
  return res;
}
