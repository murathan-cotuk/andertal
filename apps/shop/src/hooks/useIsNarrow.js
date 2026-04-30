"use client";

import { useEffect, useState } from "react";

/**
 * @param {number} maxWidth — e.g. 1023 (matches ProductGrid / catalog breakpoint)
 */
export function useIsNarrow(maxWidth = 1023) {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const q = window.matchMedia(`(max-width: ${maxWidth}px)`);
    const go = () => setNarrow(q.matches);
    go();
    q.addEventListener("change", go);
    return () => q.removeEventListener("change", go);
  }, [maxWidth]);
  return narrow;
}

/**
 * Tablet aralığı: 600px–1199px (hem dikey hem yatay tablet yönünü kapsar).
 * Landing page'de visible_on="tablet" container'larının gösterim koşuludur.
 */
export function useIsTablet() {
  const [tablet, setTablet] = useState(false);
  useEffect(() => {
    const q = window.matchMedia("(min-width: 600px) and (max-width: 1199px)");
    const go = () => setTablet(q.matches);
    go();
    q.addEventListener("change", go);
    return () => q.removeEventListener("change", go);
  }, []);
  return tablet;
}
