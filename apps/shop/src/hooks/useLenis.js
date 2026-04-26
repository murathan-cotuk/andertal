"use client";

import { useEffect } from "react";

/**
 * Initializes Lenis smooth scroll on mount.
 * Lenis is lazily imported so it does not bloat SSR bundles.
 */
export function useLenis() {
  useEffect(() => {
    // Skip Lenis on touch devices — native momentum scroll is smooth and
    // Lenis's touch interception causes pull-to-refresh jitter on mobile.
    if (typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches) return;

    let lenis;
    let raf;

    import("lenis").then(({ default: Lenis }) => {
      lenis = new Lenis({
        duration: 1.2,
        easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
        smoothWheel: true,
        wheelMultiplier: 1,
      });

      function animate(time) {
        lenis.raf(time);
        raf = requestAnimationFrame(animate);
      }
      raf = requestAnimationFrame(animate);
    });

    return () => {
      if (raf) cancelAnimationFrame(raf);
      if (lenis) lenis.destroy();
    };
  }, []);
}
