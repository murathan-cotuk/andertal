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
