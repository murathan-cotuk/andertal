import createMiddleware from "next-intl/middleware";
import { NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { routing } from "./i18n/routing";

const intlMiddleware = createMiddleware(routing);

/** Routes that don't require authentication */
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

const DEV_PLACEHOLDER_SECRET = "dev-only-seller-secret-do-not-use-in-prod";

let warnedMissingSecret = false;

function resolveSellerSecret() {
  const raw = process.env.SELLER_JWT_SECRET || process.env.JWT_SECRET;
  if (raw) {
    return new TextEncoder().encode(raw);
  }
  if (process.env.NODE_ENV === "production") {
    if (!warnedMissingSecret) {
      console.error(
        "[middleware] SELLER_JWT_SECRET / JWT_SECRET is unset in production. " +
          "All authenticated requests will redirect to login until this is fixed.",
      );
      warnedMissingSecret = true;
    }
    return null;
  }
  return new TextEncoder().encode(DEV_PLACEHOLDER_SECRET);
}

async function verifyToken(token, secret) {
  if (!token || !secret) return null;
  try {
    const { payload } = await jwtVerify(token, secret, {
      algorithms: ["HS256"],
    });
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
  res.cookies.set("sc_token", "", {
    path: "/",
    maxAge: 0,
    sameSite: "lax",
  });
  return res;
}

export default async function middleware(request) {
  const { pathname } = request.nextUrl;

  if (!isPublic(pathname)) {
    const token = request.cookies.get("sc_token")?.value;
    if (!token) {
      return NextResponse.redirect(getLoginUrl(request, pathname));
    }
    const secret = resolveSellerSecret();
    const payload = await verifyToken(token, secret);
    if (!payload) {
      return redirectToLoginClearingCookie(request, pathname);
    }
  }

  return intlMiddleware(request);
}

export const config = {
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
