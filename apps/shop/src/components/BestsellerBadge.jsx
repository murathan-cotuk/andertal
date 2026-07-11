"use client";

import React from "react";
import styled from "styled-components";
import { useShopStyles } from "@/context/ShopStylesContext";
import { useViewportBand } from "@/hooks/useViewportBand";
import { bestsellerBadgeWidthForBand } from "@/lib/bestseller";

const Badge = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 5px 9px;
  border-radius: 6px;
  background: #18181b;
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.18);
  white-space: nowrap;
`;

/** Configured bestseller badge width (px) for the current viewport (desktop/tablet/mobile), or null when using the default text pill (no custom image set). */
export function useBestsellerBadgeWidth() {
  const shopStyles = useShopStyles();
  const band = useViewportBand();
  const imgUrl = shopStyles?.bestseller_badge?.image_url;
  if (!imgUrl) return null;
  return bestsellerBadgeWidthForBand(shopStyles?.bestseller_badge, band);
}

export default function BestsellerBadge({ children = "Bestseller", className, style }) {
  const shopStyles = useShopStyles();
  const band = useViewportBand();
  const imgUrl = shopStyles?.bestseller_badge?.image_url;
  const badgeWidth = bestsellerBadgeWidthForBand(shopStyles?.bestseller_badge, band);

  if (imgUrl) {
    return (
      <img
        src={imgUrl}
        alt="Bestseller"
        className={className}
        // maxHeight guards against a badly-proportioned uploaded image (e.g. tall/
        // portrait) blowing up in height at the configured width and overlapping
        // the Sale badge stacked below it, or other page content.
        style={{
          width: badgeWidth,
          height: "auto",
          maxHeight: Math.max(24, Math.round(badgeWidth * 0.55)),
          display: "inline-block",
          verticalAlign: "middle",
          flexShrink: 0,
          objectFit: "contain",
          ...style,
        }}
      />
    );
  }

  return (
    <Badge className={className} style={style}>
      <span aria-hidden style={{ fontSize: 9, lineHeight: 1, color: "#fbbf24" }}>★</span>
      {children}
    </Badge>
  );
}
