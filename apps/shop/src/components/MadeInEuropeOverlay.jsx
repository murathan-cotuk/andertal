"use client";

import React from "react";
import styled from "styled-components";
import { resolveImageUrl } from "@/lib/image-url";
import { mergeMadeInEuropeBadge } from "@andertal/shop-theme";
import { useShopStyles } from "@/context/ShopStylesContext";

const Overlay = styled.div`
  position: absolute;
  z-index: 2;
  pointer-events: none;
  line-height: 0;
`;

const BadgeImg = styled.img`
  display: block;
  object-fit: contain;
  height: auto;
`;

/**
 * PDP main image — bottom-left badge when product is EU-origin verified.
 * Rendered OUTSIDE the overflow:hidden image wrap so it can overflow freely.
 * Default position: bottom-left, with 5% of badge height protruding below the image.
 * @param {{ badgeConfig?: object, className?: string }} props
 */
export default function MadeInEuropeOverlay({ badgeConfig: badgeConfigProp, className }) {
  const shopStyles = useShopStyles();
  const cfg = mergeMadeInEuropeBadge(badgeConfigProp ?? shopStyles?.made_in_europe_badge);
  const src = resolveImageUrl(cfg.image_url);
  if (!src) return null;

  // translateY(5%): shifts badge down by 5% of its own height → protrudes below image at offset=0
  return (
    <Overlay
      className={className}
      style={{
        left: `${cfg.offset_left}px`,
        bottom: `${cfg.offset_bottom}px`,
        transform: "translateY(5%)",
      }}
      aria-hidden
    >
      <BadgeImg
        src={src}
        alt=""
        width={cfg.width}
        height={cfg.height}
        style={{ width: cfg.width, height: cfg.height }}
      />
    </Overlay>
  );
}
