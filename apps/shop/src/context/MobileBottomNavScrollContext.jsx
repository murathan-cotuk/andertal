"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

/** ShopHeader ile aynı eşik (dar görünümde ikinci şerit + mobil alt bar) */
export const MOBILE_CHROME_SCROLL_THRESHOLD_PX = 60;

/** Bu kadar px kaydırınca üst/alt chrome tamamen gizlenir (progress 0→1) */
export const CHROME_HIDE_SCROLL_PX = 100;

const MobileBottomNavScrollContext = createContext({
  publishMobileBottomNavScroll: () => {},
  mobileBottomNavScroll: { scrollY: 0, scrollingDown: false, chromeHideProgress: 0 },
  /** true while a product page is mounted — the bottom nav then recedes on scroll there only */
  productPageActive: false,
  setProductPageActive: () => {},
});

/** ShopHeader scroll ile senkron — mobil alt bar aşağı kaydırınca saklanır */
export function MobileBottomNavScrollProvider({ children }) {
  const [mobileBottomNavScroll, setMobileBottomNavScroll] = useState({
    scrollY: 0,
    scrollingDown: false,
    chromeHideProgress: 0,
  });

  const publishMobileBottomNavScroll = useCallback((patch) => {
    setMobileBottomNavScroll((prev) => {
      const next = { ...prev, ...patch };
      if (
        next.scrollY === prev.scrollY &&
        next.scrollingDown === prev.scrollingDown &&
        next.chromeHideProgress === prev.chromeHideProgress
      ) {
        return prev;
      }
      return next;
    });
  }, []);

  const [productPageActive, setProductPageActive] = useState(false);

  const value = useMemo(
    () => ({ publishMobileBottomNavScroll, mobileBottomNavScroll, productPageActive, setProductPageActive }),
    [publishMobileBottomNavScroll, mobileBottomNavScroll, productPageActive],
  );

  return (
    <MobileBottomNavScrollContext.Provider value={value}>
      {children}
    </MobileBottomNavScrollContext.Provider>
  );
}

export function useMobileBottomNavScroll() {
  return useContext(MobileBottomNavScrollContext);
}

/** Call from a product page template: marks the page so the mobile bottom nav hides on scroll down. */
export function useMarkProductPage() {
  const { setProductPageActive } = useContext(MobileBottomNavScrollContext);
  useEffect(() => {
    setProductPageActive(true);
    return () => setProductPageActive(false);
  }, [setProductPageActive]);
}
