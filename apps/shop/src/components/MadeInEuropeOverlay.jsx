"use client";

import React from "react";
import styled from "styled-components";
import { resolveImageUrl } from "@/lib/image-url";
import { mergeMadeInEuropeBadge } from "@andertal/shop-theme";

const Overlay = styled.div`
  position: absolute;
  z-index: 2;
  pointer-events: none;
  display: flex;
  align-items: flex-end;
  line-height: 0;
`;

const BadgeImg = styled.img`
  display: block;
  object-fit: contain;
  max-width: 42%;
  height: auto;
`;

/**
 * PDP main image — bottom-left badge when product is EU-origin verified.
 * @param {{ badgeConfig?: object, className?: string }} props
 */
export default function MadeInEuropeOverlay({ badgeConfig, className }) {
  const cfg = mergeMadeInEuropeBadge(badgeConfig);
  const src = resolveImageUrl(cfg.image_url);
  if (!src) return null;

  return (
    <Overlay
      className={className}
      style={{
        left: `${cfg.offset_left}px`,
        bottom: `${cfg.offset_bottom}px`,
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
