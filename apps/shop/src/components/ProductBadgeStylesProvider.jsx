"use client";

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

const ProductBadgeStylesContext = createContext({ byId: {}, ready: false });

/**
 * Fetches live badge style definitions (font_size, image_width, colors, …) so
 * Sellercentral edits apply even when product list/PDP responses are CDN-cached
 * with older custom_badges payloads.
 */
export function ProductBadgeStylesProvider({ children }) {
  const [byId, setById] = useState({});
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      fetch("/api/store-product-badges", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : { badges: [] }))
        .then((data) => {
          if (cancelled) return;
          const map = {};
          for (const b of data?.badges || []) {
            if (b?.id) map[String(b.id)] = b;
          }
          setById(map);
          setReady(true);
        })
        .catch(() => {
          if (!cancelled) setReady(true);
        });
    };
    load();
    // Refresh periodically so size edits appear without a full page reload.
    const t = setInterval(load, 20000);
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      clearInterval(t);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  const value = useMemo(() => ({ byId, ready }), [byId, ready]);
  return (
    <ProductBadgeStylesContext.Provider value={value}>
      {children}
    </ProductBadgeStylesContext.Provider>
  );
}

export function useProductBadgeStyles() {
  return useContext(ProductBadgeStylesContext);
}

/** Merge product-embedded badge with live style row (live wins for visual fields). */
export function mergeBadgeWithLiveStyle(badge, byId) {
  if (!badge) return badge;
  const live = byId?.[String(badge.id)];
  if (!live) return badge;
  return {
    ...badge,
    label: live.label ?? badge.label,
    position: live.position ?? badge.position,
    bg_color: live.bg_color ?? badge.bg_color,
    text_color: live.text_color ?? badge.text_color,
    font_size: live.font_size ?? badge.font_size,
    border_width: live.border_width ?? badge.border_width,
    border_color: live.border_color ?? badge.border_color,
    border_radius: live.border_radius ?? badge.border_radius,
    offset_x: live.offset_x ?? badge.offset_x,
    offset_y: live.offset_y ?? badge.offset_y,
    badge_type: live.badge_type ?? badge.badge_type,
    image_url: live.image_url ?? badge.image_url,
    image_width: live.image_width ?? badge.image_width,
    image_height: live.image_height ?? badge.image_height,
    i18n: live.i18n ?? badge.i18n,
  };
}
