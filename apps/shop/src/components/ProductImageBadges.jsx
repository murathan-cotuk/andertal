"use client";

import BestsellerBadge from "@/components/BestsellerBadge";

/**
 * Bestseller + Sale badges, top-left over a product image. ALWAYS stacked
 * vertically (never side by side, never overlapping) — this was previously
 * duplicated with small inconsistencies across ProductTemplate.jsx and
 * ProductTemplateMobile.jsx (2 copies), each drifting slightly from the
 * others over time. Single shared implementation so every product image
 * (desktop detail page, mobile detail page) renders identically.
 */
export default function ProductImageBadges({ isBestseller, hasSale, isComingSoon }) {
  if (isComingSoon || (!isBestseller && !hasSale)) return null;
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
            display: "inline-block",
            padding: "3px 7px",
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            borderRadius: 3,
            color: "#fff",
            background: "#e53e3e",
            whiteSpace: "nowrap",
          }}
        >
          Sale
        </span>
      )}
    </div>
  );
}
