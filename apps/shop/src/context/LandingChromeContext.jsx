"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";

const LandingChromeContext = createContext({
  showHeaderFilterBar: true,
  setLandingHeaderFilterBar: () => {},
  landingHeaderBg: null,
  setLandingHeaderBg: () => {},
});

/**
 * Steuert Shop-Chrome abhängig von Landing-Page-Settings.
 * Pro Routenwechsel wird auf Standard zurückgesetzt.
 */
export function LandingChromeProvider({ children }) {
  const [showHeaderFilterBar, setShow] = useState(true);
  const [landingHeaderBg, setLandingHeaderBg_] = useState(null);
  const pathname = usePathname();

  useEffect(() => {
    setShow(true);
    setLandingHeaderBg_(null);
  }, [pathname]);

  const setLandingHeaderFilterBar = useCallback((visible) => {
    setShow(visible !== false);
  }, []);

  const setLandingHeaderBg = useCallback((bg) => {
    setLandingHeaderBg_(bg || null);
  }, []);

  const value = useMemo(
    () => ({ showHeaderFilterBar, setLandingHeaderFilterBar, landingHeaderBg, setLandingHeaderBg }),
    [showHeaderFilterBar, setLandingHeaderFilterBar, landingHeaderBg, setLandingHeaderBg],
  );

  return (
    <LandingChromeContext.Provider value={value}>
      {children}
    </LandingChromeContext.Provider>
  );
}

export function useLandingChrome() {
  return useContext(LandingChromeContext);
}
