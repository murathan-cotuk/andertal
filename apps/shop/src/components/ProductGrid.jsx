"use client";

import { ProductCard, ProductListItem } from "@/components/ProductCard";
import { useIsNarrow } from "@/hooks/useIsNarrow";
import styled from "styled-components";

const STRIP_GAP = 8;
const MOBILE_GRID_GAP = 8;

const CatalogWrap = styled.div`
  width: 100%;

  /* ── Mobile (≤767px): list (1-col) or grid ───────────────────────────── */
  @media (max-width: 767px) {
    ${(p) => p.$mobileCols === 1 ? `
      display: flex;
      flex-direction: column;
      gap: 0;
    ` : `
      display: grid;
      grid-template-columns: repeat(${p.$mobileCols}, minmax(0, 1fr));
      gap: ${MOBILE_GRID_GAP}px;
      align-content: start;
    `}
  }

  /* ── Tablet (768–1023px): horizontal scroll strip ────────────────────── */
  @media (min-width: 768px) and (max-width: 1023px) {
    display: flex;
    flex-direction: row;
    flex-wrap: nowrap;
    gap: ${STRIP_GAP}px;
    overflow-x: auto;
    overflow-y: hidden;
    -webkit-overflow-scrolling: touch;
    scroll-snap-type: x mandatory;
    scroll-behavior: smooth;
    padding: 0 0 4px;
    scrollbar-width: thin;
    @media (prefers-reduced-motion: reduce) {
      scroll-behavior: auto;
    }
  }

  /* ── Desktop (≥1024px): grid ─────────────────────────────────────────── */
  @media (min-width: 1024px) {
    display: grid;
    grid-template-columns: ${(p) =>
      p.$cols ? `repeat(${p.$cols}, minmax(0, 1fr))` : "repeat(4, minmax(0, 1fr))"};
    gap: 16px;
    align-content: start;
  }
`;

const CardSlot = styled.div`
  /* Mobile: grid handles layout, no extra styles needed */
  @media (max-width: 767px) {
    min-width: 0;
  }

  /* Tablet strip: fixed-width cards */
  @media (min-width: 768px) and (max-width: 1023px) {
    flex: 0 0 ${(p) => `calc((100% - ${(p.$m - 1) * STRIP_GAP}px) / ${p.$m})`};
    min-width: ${(p) => `calc((100% - ${(p.$m - 1) * STRIP_GAP}px) / ${p.$m})`};
    max-width: ${(p) => `calc((100% - ${(p.$m - 1) * STRIP_GAP}px) / ${p.$m})`};
    scroll-snap-align: start;
    box-sizing: border-box;
  }

  /* Desktop: grid handles layout */
  @media (min-width: 1024px) {
    min-width: 0;
  }
`;

const Empty = styled.div`
  padding: 80px 0;
  text-align: center;
  font-size: 13px;
  color: #aaa;
  letter-spacing: 0.04em;
  text-transform: uppercase;
`;

function clampCols(n) {
  const x = Math.round(Number(n));
  if (!Number.isFinite(x) || x < 1) return 4;
  return Math.min(6, Math.max(1, x));
}

/**
 * @param {number} [maxColumns=4]       — desktop grid (≥1024px)
 * @param {number} [maxColumnsMobile=2] — mobile grid (≤767px); default 2
 */
export function ProductGrid({
  products = [],
  maxColumns = 4,
  maxColumnsMobile = 2,
  activeFilters = {},
}) {
  const isMobile = useIsNarrow(767);
  if (!products.length) return <Empty>No products found</Empty>;

  const cols = clampCols(maxColumns);
  const m = clampCols(maxColumnsMobile);
  const mobileCols = Math.max(1, Math.min(m, 3));
  const useMobileList = isMobile && mobileCols === 1;

  return (
    <CatalogWrap
      className="product-grid-strip"
      data-product-strip
      $cols={cols}
      $mobileCols={mobileCols}
    >
      {products.map((p) => (
        <CardSlot key={p.id} $m={m}>
          {useMobileList
            ? <ProductListItem product={p} activeFilters={activeFilters} />
            : <ProductCard product={p} activeFilters={activeFilters} plainImage />
          }
        </CardSlot>
      ))}
    </CatalogWrap>
  );
}
