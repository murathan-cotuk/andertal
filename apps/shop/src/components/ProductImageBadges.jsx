"use client";

import BestsellerBadge, { useBestsellerBadgeWidth } from "@/components/BestsellerBadge";

/**
 * Bestseller + Sale badges, top-left over a product image. ALWAYS stacked
 * vertically (never side by side, never overlapping) — this was previously
 * duplicated with small inconsistencies across ProductTemplate.jsx and
 * ProductTemplateMobile.jsx (2 copies), each drifting slightly from the
 * others over time. Single shared implementation so every product image
 * (desktop detail page, mobile detail page) renders identically.
 *
 * When a custom Bestseller image is configured (Sellercentral → Styles),
 * the Sale badge is sized to match it exactly (same width/height box)
 * instead of its own small text-pill size.
 */
export default function ProductImageBadges({ isBestseller, hasSale, isComingSoon }) {
  const bestsellerWidth = useBestsellerBadgeWidth();
  if (isComingSoon || (!isBestseller && !hasSale)) return null;
  const matchSize = isBestseller && bestsellerWidth != null;
  return (
    <div
      style={{
        position: "absolute",
        top: 8,
        left: 8,
        zIndex: 8,
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        gap: 4,
        pointerEvents: "none",
      }}
    >
      {isBestseller && <BestsellerBadge />}
      {hasSale && (
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            ...(matchSize
              ? { width: bestsellerWidth, height: Math.max(24, Math.round(bestsellerWidth * 0.55)), padding: 0 }
              : { padding: "5px 9px" }),
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            borderRadius: 6,
            color: "#fff",
            background: "#e11d48",
            boxShadow: "0 2px 6px rgba(0, 0, 0, 0.18)",
            whiteSpace: "nowrap",
          }}
        >
          Sale
        </span>
      )}
    </div>
  );
}
