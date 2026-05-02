"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";

/** ShopHeader ile aynı eşik (dar görünümde ikinci şerit + mobil alt bar) */
export const MOBILE_CHROME_SCROLL_THRESHOLD_PX = 60;

const MobileBottomNavScrollContext = createContext({
  publishMobileBottomNavScroll: () => {},
  mobileBottomNavScroll: { scrollY: 0, scrollingDown: false },
});

/** ShopHeader scroll ile senkron — mobil alt bar aşağı kaydırınca saklanır */
export function MobileBottomNavScrollProvider({ children }) {
  const [mobileBottomNavScroll, setMobileBottomNavScroll] = useState({
    scrollY: 0,
    scrollingDown: false,
  });

  const publishMobileBottomNavScroll = useCallback((patch) => {
    setMobileBottomNavScroll((prev) => {
      const next = { ...prev, ...patch };
      if (next.scrollY === prev.scrollY && next.scrollingDown === prev.scrollingDown) return prev;
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({ publishMobileBottomNavScroll, mobileBottomNavScroll }),
    [publishMobileBottomNavScroll, mobileBottomNavScroll],
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
