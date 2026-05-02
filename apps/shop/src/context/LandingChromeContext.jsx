"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";

const LandingChromeContext = createContext({
  showHeaderFilterBar: true,
  setLandingHeaderFilterBar: () => {},
  secondNavDesktopClassic: false,
  setSecondNavDesktopClassic: () => {},
  landingHeaderBg: null,
  setLandingHeaderBg: () => {},
});

/**
 * Steuert Shop-Chrome abhängig von Landing-Page-Settings.
 * Pro Routenwechsel wird auf Standard zurückgesetzt.
 */
export function LandingChromeProvider({ children }) {
  const [showHeaderFilterBar, setShow] = useState(true);
  const [secondNavDesktopClassic, setSecondNavDesktopClassic_] = useState(false);
  const [landingHeaderBg, setLandingHeaderBg_] = useState(null);
  const pathname = usePathname();

  useEffect(() => {
    setShow(true);
    setSecondNavDesktopClassic_(false);
    setLandingHeaderBg_(null);
  }, [pathname]);

  const setLandingHeaderFilterBar = useCallback((visible) => {
    setShow(visible !== false);
  }, []);

  const setSecondNavDesktopClassic = useCallback((classic) => {
    setSecondNavDesktopClassic_(classic === true);
  }, []);

  const setLandingHeaderBg = useCallback((bg) => {
    setLandingHeaderBg_(bg || null);
  }, []);

  const value = useMemo(
    () => ({
      showHeaderFilterBar,
      setLandingHeaderFilterBar,
      secondNavDesktopClassic,
      setSecondNavDesktopClassic,
      landingHeaderBg,
      setLandingHeaderBg,
    }),
    [
      showHeaderFilterBar,
      setLandingHeaderFilterBar,
      secondNavDesktopClassic,
      setSecondNavDesktopClassic,
      landingHeaderBg,
      setLandingHeaderBg,
    ],
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
