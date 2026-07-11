"use client";

import { useEffect, useState } from "react";

/**
 * "mobile" ≤767px, "tablet" 768–1023px, "desktop" ≥1024px.
 * Matches ShopHeader's breakpoints (mega menu / second-nav band logic) so
 * badge sizing and header/nav behavior switch at the same viewport widths.
 */
export function useViewportBand() {
  const [band, setBand] = useState("desktop");
  useEffect(() => {
    const mqMobile = window.matchMedia("(max-width: 767px)");
    const mqTablet = window.matchMedia("(min-width: 768px) and (max-width: 1023px)");
    const apply = () => {
      if (mqMobile.matches) setBand("mobile");
      else if (mqTablet.matches) setBand("tablet");
      else setBand("desktop");
    };
    apply();
    mqMobile.addEventListener("change", apply);
    mqTablet.addEventListener("change", apply);
    return () => {
      mqMobile.removeEventListener("change", apply);
      mqTablet.removeEventListener("change", apply);
    };
  }, []);
  return band;
}
