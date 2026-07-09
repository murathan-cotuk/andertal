import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

// Auth is handled client-side via AuthGuard (localStorage dev_token) — this
// middleware only needs to perform next-intl's locale routing (e.g. redirect
// "/" to "/en" since routing.localePrefix is "always" and no bare "/" route
// exists, only "/[locale]/page.jsx").
export default createMiddleware(routing);

export const config = {
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
