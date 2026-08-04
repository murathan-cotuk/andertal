import createMiddleware from "next-intl/middleware";
import { NextResponse } from "next/server";
import { routing } from "./i18n/routing";

const intlMiddleware = createMiddleware(routing);

const PUBLIC_PATH_PATTERNS = [
  /^\/login(\/|$)/,
  /^\/register(\/|$)/,
  /^\/forgot-password(\/|$)/,
  /^\/[^/]+\/login(\/|$)/,
  /^\/[^/]+\/register(\/|$)/,
  /^\/[^/]+\/forgot-password(\/|$)/,
  /^\/_next\//,
  /^\/api\//,
  /^\/favicon/,
  /\.\w+$/,
];

function isPublic(pathname) {
  return PUBLIC_PATH_PATTERNS.some((re) => re.test(pathname));
}

// Decode JWT payload without signature verification.
// The backend verifies signatures on every API call — the middleware only
// needs to confirm the cookie contains a non-expired token so unauthenticated
// browsers are redirected to login before the page renders.
function decodeTokenPayload(token) {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const json = atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"));
    const payload = JSON.parse(json);
    if (!payload?.id) return null;
    if (payload.exp && Math.floor(Date.now() / 1000) > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

function getLoginUrl(request, pathname) {
  const localeMatch = pathname.match(/^\/([^/]+)/);
  const rawLocale = localeMatch ? localeMatch[1] : "";
  const locale = (routing.locales || []).includes(rawLocale)
    ? rawLocale
    : routing.defaultLocale || "en";
  const loginUrl = new URL(`/${locale}/login`, request.url);
  loginUrl.searchParams.set("next", pathname);
  return loginUrl;
}

function redirectToLoginClearingCookie(request, pathname) {
  const res = NextResponse.redirect(getLoginUrl(request, pathname));
  res.cookies.set("sc_token", "", { path: "/", maxAge: 0, sameSite: "lax" });
  return res;
}

export default function middleware(request) {
  const { pathname } = request.nextUrl;

  if (!isPublic(pathname)) {
    const token = request.cookies.get("sc_token")?.value;
    if (!token) {
      return NextResponse.redirect(getLoginUrl(request, pathname));
    }
    const payload = decodeTokenPayload(token);
    if (!payload) {
      return redirectToLoginClearingCookie(request, pathname);
    }
  }

  return intlMiddleware(request);
}

export const config = {
  // `icon`/`apple-icon` are Next.js's extensionless metadata routes (from src/app/icon.png,
  // apple-icon.png) — no dot in the path, so the `.*\..*` exclusion doesn't catch them.
  // Without this they were falling through to the auth check (redirected to /login, since
  // isPublic() only recognizes `/favicon` and dotted paths) and then to intlMiddleware
  // (redirected to a locale-prefixed path) — either way the favicon/apple-touch-icon 404'd.
  matcher: ["/((?!api|_next|_vercel|icon$|apple-icon$|.*\\..*).*)"],
};
