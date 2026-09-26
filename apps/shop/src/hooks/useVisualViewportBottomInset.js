"use client";

import { useState, useEffect } from "react";

import { BOTTOM_NAV_MQ } from "@/lib/bottom-nav-mq";

/**
 * `position: fixed; bottom` offset so the bar sits on the visible screen edge.
 * Positive: browser toolbar covers the layout bottom — lift the bar above it.
 * Negative: Chrome hid that toolbar and the visual viewport grew past `innerHeight`.
 * Clamping at 0 leaves the bar floating with the footer showing in the gap.
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
        if (!window.matchMedia(BOTTOM_NAV_MQ).matches) {
          setInset(0);
          return;
        }
        const raw = window.innerHeight - vv.offsetTop - vv.height;
        setInset(Math.abs(raw) < 0.5 ? 0 : Math.round(raw));
      });
    };

    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    const mq = window.matchMedia(BOTTOM_NAV_MQ);
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
