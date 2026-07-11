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
  gap: 5px;
  padding: 4px 10px;
  border-radius: 999px;
  background: linear-gradient(135deg, #2a1200 0%, #9a5b00 40%, #fbbf24 100%);
  border: 1px solid rgba(255, 214, 107, 0.7);
  color: #fff;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  box-shadow: 0 6px 16px rgba(180, 83, 9, 0.38), inset 0 1px 0 rgba(255,255,255,0.25);
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
      <span aria-hidden style={{ fontSize: 10, lineHeight: 1 }}>★</span>
      {children}
    </Badge>
  );
}
