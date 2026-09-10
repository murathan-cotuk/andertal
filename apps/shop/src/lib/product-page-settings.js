"use client";

import { useEffect, useState, useCallback } from "react";
import { pdpElementVisible } from "@andertal/shop-theme";

/**
 * Global product-page visibility settings (Sellercentral › Content › Landing page ›
 * "Product page"). Fetched once per mount from the cached shop API proxy.
 *
 * Fails open: until loaded, and on any error, every element is treated as visible,
 * so the PDP renders exactly as before.
 */
export function useProductPageSettings() {
  const [settings, setSettings] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/product-page-settings", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d && typeof d.settings === "object") setSettings(d.settings);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const visible = useCallback((key) => pdpElementVisible(settings || {}, key), [settings]);

  return { settings, visible };
}
