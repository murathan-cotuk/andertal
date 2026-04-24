import createMiddleware from "next-intl/middleware";
import { NextResponse } from "next/server";
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
  /\.\w+$/,          // static files with extension
];

function isPublic(pathname) {
  return PUBLIC_PATH_PATTERNS.some((re) => re.test(pathname));
}

export default function middleware(request) {
  const { pathname } = request.nextUrl;

  // Let public paths through without cookie check
  if (!isPublic(pathname)) {
    const token = request.cookies.get("sc_token")?.value;
    if (!token) {
      // Determine locale prefix from path (e.g. /de/dashboard → /de/login)
      const localeMatch = pathname.match(/^\/([^/]+)/);
      const rawLocale = localeMatch ? localeMatch[1] : "";
      const locale = (routing.locales || []).includes(rawLocale) ? rawLocale : routing.defaultLocale || "en";
      const loginUrl = new URL(`/${locale}/login`, request.url);
      loginUrl.searchParams.set("next", pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  return intlMiddleware(request);
}

export const config = {
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
