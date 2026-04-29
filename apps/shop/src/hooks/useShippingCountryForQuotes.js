"use client";

import { useState, useEffect, useRef } from "react";
import { normalizeIsoCountryCode } from "@/lib/iso-country";

/** Last delivery country from checkout — used for Versand quotes until shop header country changes. */
export const CHECKOUT_SHIPPING_COUNTRY_LS = "andertal_checkout_shipping_country";
/** ISO2 of the market storefront (URL prefix) when {@link CHECKOUT_SHIPPING_COUNTRY_LS} was written — avoids DE checkout leaking into /gb/ threshold & Versand. */
export const CHECKOUT_SHIPPING_MARKET_COUNTRY_LS = "andertal_checkout_shipping_market_country";

/**
 * @param {string} marketCountryUpper - from URL market prefix (e.g. ES)
 * @returns {string} ISO2 uppercase for shipping price / free-ship threshold
 */
export function useShippingCountryForQuotes(marketCountryUpper) {
  const [code, setCode] = useState(marketCountryUpper);
  const prevMarketRef = useRef(marketCountryUpper);

  useEffect(() => {
    const marketChanged = prevMarketRef.current !== marketCountryUpper;
    prevMarketRef.current = marketCountryUpper;

    if (marketChanged) {
      try {
        localStorage.removeItem(CHECKOUT_SHIPPING_COUNTRY_LS);
        localStorage.removeItem(CHECKOUT_SHIPPING_MARKET_COUNTRY_LS);
      } catch (_) {}
      setCode(marketCountryUpper);
      return;
    }

    try {
      const marketIso = normalizeIsoCountryCode(marketCountryUpper);
      const storedMc = normalizeIsoCountryCode(localStorage.getItem(CHECKOUT_SHIPPING_MARKET_COUNTRY_LS));
      const stored = normalizeIsoCountryCode(localStorage.getItem(CHECKOUT_SHIPPING_COUNTRY_LS));
      if (
        storedMc &&
        marketIso &&
        storedMc !== marketIso
      ) {
        setCode(marketCountryUpper);
        return;
      }
      if (stored) {
        setCode(stored);
        return;
      }
    } catch (_) {}
    setCode(marketCountryUpper);
  }, [marketCountryUpper]);

  return code;
}
