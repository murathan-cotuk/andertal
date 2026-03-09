import createMiddleware from "next-intl/middleware";
import { NextResponse } from "next/server";
import { routing } from "./i18n/routing";

const intlMiddleware = createMiddleware(routing);

export default function middleware(request) {
  const pathname = request.nextUrl.pathname || "";
  // /sale (no locale) -> redirect to default locale so [handle] route serves sale collection
  if (pathname === "/sale" || pathname === "/sale/") {
    return NextResponse.redirect(
      new URL(`/${routing.defaultLocale}/sale`, request.url)
    );
  }
  return intlMiddleware(request);
}

export const config = {
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
