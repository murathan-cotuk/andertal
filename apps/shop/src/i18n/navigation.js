"use client";

import { forwardRef } from "react";
import {
  usePathname as useNextPathname,
  useRouter as useNextRouter,
} from "next/navigation";
import { createNavigation } from "next-intl/navigation";
import { routing } from "./routing";
import { useMarketPrefix } from "@/context/MarketPrefixContext";
import {
  parseMarketPath,
  marketPrefix,
  isValidLocale,
} from "@/lib/shop-market";

const intl = createNavigation(routing);

const LOCALE_PREFIX_RE = /^\/(en|de|tr|fr|it|es)(?=\/|$)/i;

/** Public market prefix /{cc}/{locale}/ or legacy …/{currency}/ — strip mistaken prefixes from hrefs. */
const MARKET_TRIPLE_PREFIX_RE =
  /^\/([a-z]{2})\/(en|de|tr|fr|it|es)(?:\/(?:eur|gbp|chf|usd|try))?(?=\/|$)/i;

function normalizeAppPath(href) {
  if (typeof href !== "string") return "/";
  if (href.startsWith("http://") || href.startsWith("https://")) return href;
  let x = href.startsWith("/") ? href : `/${href}`;
  let guard = 0;
  while (MARKET_TRIPLE_PREFIX_RE.test(x) && guard++ < 8) {
    x = x.replace(MARKET_TRIPLE_PREFIX_RE, "") || "/";
  }
  x = x.replace(LOCALE_PREFIX_RE, "") || "/";
  return x;
}

function marketTripleFromPathname(pathname, ctxPrefix) {
  const pathParsed = parseMarketPath(pathname || "");
  const ctxParsed = ctxPrefix ? parseMarketPath(ctxPrefix) : null;
  return pathParsed || ctxParsed;
}

function isModifiedClick(e) {
  return !!(
    e &&
    (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button === 1)
  );
}

/**
 * Public storefront URLs are /{country}/{lang}/… while App Router files live at /{lang}/….
 * next/link soft-nav against the public URL only updates the address bar (first click no-op,
 * second click loads). A real <a> document navigation lets proxy.js rewrite and render.
 */
export const Link = forwardRef(function Link(
  { href, locale, onClick, prefetch, replace, scroll, ...props },
  ref,
) {
  void prefetch;
  void replace;
  void scroll;
  const pathname = useNextPathname() || "/";
  const ctxPrefix = useMarketPrefix();
  const base = marketTripleFromPathname(pathname, ctxPrefix);
  let country = base?.country ?? "de";
  let lang = base?.lang ?? "de";
  if (locale && isValidLocale(String(locale))) {
    lang = String(locale).toLowerCase();
  }
  const prefix = marketPrefix(country, lang);

  if (typeof href === "string" && (href.startsWith("http://") || href.startsWith("https://"))) {
    return <a href={href} ref={ref} onClick={onClick} {...props} />;
  }

  const pathOnly =
    typeof href === "object" && href?.pathname != null
      ? normalizeAppPath(href.pathname)
      : normalizeAppPath(typeof href === "string" ? href : "/");

  const marketHref = pathOnly === "/" ? prefix : `${prefix}${pathOnly}`;

  const handleClick = (e) => {
    onClick?.(e);
    if (e.defaultPrevented || isModifiedClick(e) || props.target === "_blank") return;
  };

  return <a href={marketHref} ref={ref} onClick={handleClick} {...props} />;
});

export function useRouter() {
  const nr = useNextRouter();
  const pathname = useNextPathname() || "/";
  const ctxPrefix = useMarketPrefix();
  const base = marketTripleFromPathname(pathname, ctxPrefix);
  const prefix = base
    ? marketPrefix(base.country, base.lang)
    : marketPrefix("de", routing.defaultLocale);

  const abs = (href) => {
    if (typeof href !== "string") return href;
    if (href.startsWith("http://") || href.startsWith("https://")) return href;
    const p = normalizeAppPath(href);
    return p === "/" ? prefix : `${prefix}${p}`;
  };

  return {
    ...nr,
    push: (h) => {
      const url = abs(h);
      if (typeof url === "string" && typeof window !== "undefined") {
        window.location.assign(url);
        return;
      }
      return nr.push(url);
    },
    replace: (h) => {
      const url = abs(h);
      if (typeof url === "string" && typeof window !== "undefined") {
        window.location.replace(url);
        return;
      }
      return nr.replace(url);
    },
    prefetch: (h, o) => nr.prefetch(abs(h), o),
  };
}

export { usePathname } from "next/navigation";

export const { redirect, getPathname } = intl;
