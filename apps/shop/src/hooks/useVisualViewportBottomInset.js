"use client";

import { useState, useEffect } from "react";

const MOBILE_MAX = 1023;

/**
 * Distance from the bottom of the layout viewport to the bottom of the visual viewport.
 * Mobile browsers (Chrome bottom toolbar, Safari chrome) often exclude this from
 * env(safe-area-inset-bottom). Pushing `position: fixed; bottom: 0` up by this value
 * keeps the bar on the actually visible screen edge when the browser UI shows/hides.
 */
export function useVisualViewportBottomInset() {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined" || !window.visualViewport) return;
    /* Standalone (Add to Home Screen / installed PWA): there is no browser toolbar to dodge,
       but iOS still fires visualViewport resize/scroll with tiny transient offsetTop/height
       jitter during scroll momentum — tracking it here made the fixed bottom nav visibly
       shift while scrolling. Skip the dynamic tracking entirely in that mode; inset stays 0. */
    const isStandalone =
      window.matchMedia?.("(display-mode: standalone)")?.matches || window.navigator?.standalone === true;
    if (isStandalone) { setInset(0); return; }
    const vv = window.visualViewport;

    /* Use rAF so both window.resize and vv.resize have fired before we read
       final values — avoids a 1-frame "float" when the browser toolbar hides. */
    let rafId = null;
    const update = () => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        if (!window.matchMedia(`(max-width: ${MOBILE_MAX}px)`).matches) {
          setInset(0);
          return;
        }
        setInset(Math.max(0, window.innerHeight - vv.height - vv.offsetTop));
      });
    };

    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    const mq = window.matchMedia(`(max-width: ${MOBILE_MAX}px)`);
    mq.addEventListener("change", update);

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      mq.removeEventListener("change", update);
    };
  }, []);

  return inset;
}
