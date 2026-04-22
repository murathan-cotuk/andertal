"use client";

import { useEffect, useState } from "react";

const MQ = "(max-width: 1023px)";

/**
 * Katalog: ürün şeridi (≤1023px) vs grid (≥1024px) — Landing carousels ve template ile aynı kırılım.
 */
export function useResponsiveColumnCount(desktop, mobile) {
  const d = Math.max(1, Math.min(6, Math.round(Number(desktop) || 4)));
  const m = Math.max(1, Math.min(6, Math.round(Number(mobile) || 2)));
  const [n, setN] = useState(d);

  useEffect(() => {
    const q = window.matchMedia(MQ);
    const go = () => {
      setN(q.matches ? m : d);
    };
    go();
    q.addEventListener("change", go);
    return () => q.removeEventListener("change", go);
  }, [d, m]);

  return n;
}
