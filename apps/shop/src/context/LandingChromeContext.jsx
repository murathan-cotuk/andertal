"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";

const LandingChromeContext = createContext({
  showHeaderFilterBar: true,
  setLandingHeaderFilterBar: () => {},
  secondNavDesktopClassic: false,
  setSecondNavDesktopClassic: () => {},
  landingHeaderBg: null,
  landingHeaderStatusColor: null,
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
  const [landingHeaderStatusColor, setLandingHeaderStatusColor_] = useState(null);
  const pathname = usePathname();

  useEffect(() => {
    setShow(true);
    setSecondNavDesktopClassic_(false);
    setLandingHeaderBg_(null);
    setLandingHeaderStatusColor_(null);
  }, [pathname]);

  const setLandingHeaderFilterBar = useCallback((visible) => {
    setShow(visible !== false);
  }, []);

  const setSecondNavDesktopClassic = useCallback((classic) => {
    setSecondNavDesktopClassic_(classic === true);
  }, []);

  const setLandingHeaderBg = useCallback((bg, statusColor = null) => {
    setLandingHeaderBg_(bg || null);
    const solid = statusColor != null && String(statusColor).trim()
      ? String(statusColor).trim()
      : null;
    setLandingHeaderStatusColor_(solid);
  }, []);

  const value = useMemo(
    () => ({
      showHeaderFilterBar,
      setLandingHeaderFilterBar,
      secondNavDesktopClassic,
      setSecondNavDesktopClassic,
      landingHeaderBg,
      landingHeaderStatusColor,
      setLandingHeaderBg,
    }),
    [
      showHeaderFilterBar,
      setLandingHeaderFilterBar,
      secondNavDesktopClassic,
      setSecondNavDesktopClassic,
      landingHeaderBg,
      landingHeaderStatusColor,
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
