"use client";

import { forwardRef } from "react";
import { useLocale } from "next-intl";
import { createNavigation } from "next-intl/navigation";
import { routing } from "./routing";

const intl = createNavigation(routing);

const LOCALE_RE = /^\/(en|de|tr|fr|it|es)(?=\/|$)/i;

function stripLocale(path) {
  const p = !path ? "/" : path.startsWith("/") ? path : `/${path}`;
  return p.replace(LOCALE_RE, "") || "/";
}

function prefixLocale(path, locale) {
  const rest = stripLocale(path);
  return rest === "/" ? `/${locale}` : `/${locale}${rest}`;
}

function splitHref(href) {
  if (href == null) return { pathname: "/", search: "", hash: "" };
  if (typeof href === "object") {
    const pathname = href.pathname || "/";
    let search = "";
    if (href.search) search = href.search.startsWith("?") ? href.search : `?${href.search}`;
    else if (href.query && typeof href.query === "object") {
      const q = new URLSearchParams();
      for (const [k, v] of Object.entries(href.query)) {
        if (v == null) continue;
        q.set(k, String(v));
      }
      const s = q.toString();
      if (s) search = `?${s}`;
    }
    return { pathname, search, hash: href.hash || "" };
  }
  const s = String(href);
  if (s.startsWith("http://") || s.startsWith("https://")) {
    return { absolute: s };
  }
  const hashIdx = s.indexOf("#");
  const hash = hashIdx >= 0 ? s.slice(hashIdx) : "";
  const noHash = hashIdx >= 0 ? s.slice(0, hashIdx) : s;
  const qIdx = noHash.indexOf("?");
  const search = qIdx >= 0 ? noHash.slice(qIdx) : "";
  const pathname = qIdx >= 0 ? noHash.slice(0, qIdx) : noHash;
  return { pathname: pathname || "/", search, hash };
}

function toUrl(href, locale) {
  const parts = splitHref(href);
  if (parts.absolute) return parts.absolute;
  return `${prefixLocale(parts.pathname, locale)}${parts.search || ""}${parts.hash || ""}`;
}

function persistLocaleCookie(locale) {
  try {
    document.cookie = `NEXT_LOCALE=${encodeURIComponent(locale)}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`;
  } catch (_) {}
}

function pickLocale(requested, fallback) {
  const loc = String(requested || fallback || routing.defaultLocale).toLowerCase();
  return routing.locales.includes(loc) ? loc : fallback || routing.defaultLocale;
}

/**
 * Soft client navigations (next-intl Link / router.push) update the address bar
 * without remounting the page — first click / locale switch looks like a no-op
 * until a hard reload. Document navigation always loads the matching locale.
 */
export const Link = forwardRef(function Link(
  { href, locale, onClick, prefetch, replace, scroll, ...props },
  ref,
) {
  void prefetch;
  void replace;
  void scroll;
  const current = useLocale();
  const loc = pickLocale(locale, current);
  if (typeof href === "string" && (href.startsWith("http://") || href.startsWith("https://"))) {
    return <a href={href} ref={ref} onClick={onClick} {...props} />;
  }
  return <a href={toUrl(href, loc)} ref={ref} onClick={onClick} {...props} />;
});

export function useRouter() {
  const current = useLocale();
  const intlRouter = intl.useRouter();

  const go = (href, opts, method) => {
    const loc = pickLocale(opts?.locale, current);
    if (typeof window === "undefined") {
      return method === "replace" ? intlRouter.replace(href, opts) : intlRouter.push(href, opts);
    }
    persistLocaleCookie(loc);
    let target = href;
    if (opts?.locale && typeof href === "string" && !href.includes("?") && !href.includes("#")) {
      target = `${href}${window.location.search}${window.location.hash}`;
    }
    const url = toUrl(target, loc);
    if (method === "replace") window.location.replace(url);
    else window.location.assign(url);
  };

  return {
    ...intlRouter,
    push: (href, opts) => go(href, opts, "push"),
    replace: (href, opts) => go(href, opts, "replace"),
  };
}

export const { redirect, getPathname, usePathname } = intl;
