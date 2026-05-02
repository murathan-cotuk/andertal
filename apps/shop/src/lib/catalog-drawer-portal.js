"use client";

/**
 * Katalog-/Such-/Marken-Filter-Drawer: bei ≤1023px per Portal an document.body,
 * damit position:fixed nicht durch transform-Eltern oder niedrigere Layer unter
 * ShopHeader / MobileNav hängen bleibt.
 */

import { useState, useLayoutEffect } from "react";
import { createPortal } from "react-dom";

/** Wie ShopHeader narrow breakpoint */
export const CATALOG_DRAWER_MAX_PX = 1023;

export const catalogDrawerMaxCss = `(max-width: ${CATALOG_DRAWER_MAX_PX}px)`;

/** Über ShopHeader (2147483600), Cart (~3637), MobileNav (3640) */
export const CATALOG_FILTER_OVERLAY_Z = 2147483646;
export const CATALOG_FILTER_SIDEBAR_Z = 2147483647;

export default function CatalogDrawerPortal({ children }) {
  const [toBody, setToBody] = useState(false);

  useLayoutEffect(() => {
    const mq = window.matchMedia(catalogDrawerMaxCss);
    const sync = () => setToBody(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  if (toBody && typeof document !== "undefined") {
    return createPortal(children, document.body);
  }
  return children;
}
