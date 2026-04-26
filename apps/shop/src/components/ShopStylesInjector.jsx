"use client";

import { useEffect, useLayoutEffect, useContext } from "react";
import {
  DEFAULT_SHOP_STYLES,
  buildShopThemeCSS,
  mergeLoadedShopStyles,
  collectTypographyGoogleFamilies,
  buildGoogleFontsLinkHrefForFamilies,
} from "@belucha/shop-theme";
import { ShopStylesContext } from "@/context/ShopStylesContext";

// Fetch styles through the internal API route (handles backend URL; route is no-store)
const STYLES_URL = "/api/store-styles";

function loadAndApplyStyles(setStyles, injectCss, ensureGoogleFontLink) {
  fetch(STYLES_URL, { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : null))
    .then((data) => {
      const raw = data?.styles || {};
      const merged = mergeLoadedShopStyles(raw);
      injectCss(buildShopThemeCSS(merged, { merge: false }));
      const href = buildGoogleFontsLinkHrefForFamilies(collectTypographyGoogleFamilies(merged.typography));
      ensureGoogleFontLink(href);
      if (setStyles) setStyles(merged);
    })
    .catch(() => {});
}

const FONT_LINK_ID = "shop-google-font-link";

/** Fired when seller theme CSS is injected so header can sync `theme-color` and safe-area */
export const SHOP_THEME_CSS_UPDATED = "shop-theme-css-updated";

function injectCss(css) {
  let tag = document.getElementById("shop-theme-styles");
  if (!tag) {
    tag = document.createElement("style");
    tag.id = "shop-theme-styles";
    document.head.appendChild(tag);
  }
  tag.textContent = css;
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(SHOP_THEME_CSS_UPDATED));
  }
}

function ensureGoogleFontLink(href) {
  if (!href || typeof document === "undefined") return;
  let tag = document.getElementById(FONT_LINK_ID);
  if (!tag) {
    tag = document.createElement("link");
    tag.id = FONT_LINK_ID;
    tag.rel = "stylesheet";
    document.head.appendChild(tag);
  }
  if (tag.getAttribute("href") !== href) tag.setAttribute("href", href);
}

export default function ShopStylesInjector() {
  const ctx = useContext(ShopStylesContext);
  const setStyles = ctx?.setStyles;

  // İlk boyamadan önce :root değişkenleri (H1–H5, body) hazır olsun; yoksa rich text h1 body fontuna düşer
  useLayoutEffect(() => {
    injectCss(buildShopThemeCSS(DEFAULT_SHOP_STYLES));
    const g0 = buildGoogleFontsLinkHrefForFamilies(collectTypographyGoogleFamilies(DEFAULT_SHOP_STYLES.typography));
    ensureGoogleFontLink(g0);
  }, []);

  useEffect(() => {
    loadAndApplyStyles(setStyles, injectCss, ensureGoogleFontLink);
  }, [setStyles]);

  // Seller'da Templates kaydedilince sekmeye dönünce güncel sütun sayısı vb. yüklensin
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") {
        loadAndApplyStyles(setStyles, injectCss, ensureGoogleFontLink);
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [setStyles]);

  return null;
}
