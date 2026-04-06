"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";

const LandingChromeContext = createContext({
  showHeaderFilterBar: true,
  setLandingHeaderFilterBar: () => {},
});

/**
 * Steuert Shop-Chrome abhängig von Landing-Page-Settings (z. B. zweite Navigationszeile).
 * Pro Routenwechsel wird auf Standard (sichtbar) zurückgesetzt; LandingContainers setzt den Wert nach dem API-Load.
 */
export function LandingChromeProvider({ children }) {
  const [showHeaderFilterBar, setShow] = useState(true);
  const pathname = usePathname();

  useEffect(() => {
    setShow(true);
  }, [pathname]);

  const setLandingHeaderFilterBar = useCallback((visible) => {
    setShow(visible !== false);
  }, []);

  const value = useMemo(
    () => ({ showHeaderFilterBar, setLandingHeaderFilterBar }),
    [showHeaderFilterBar, setLandingHeaderFilterBar],
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
