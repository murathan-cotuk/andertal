"use client";

import { ProductCard } from "@/components/ProductCard";
import styled from "styled-components";

/* Mobil şerit: kartlar arası + biraz daha geniş his için dar gap */
const STRIP_GAP = 8;

const CatalogWrap = styled.div`
  width: 100%;
  @media (max-width: 1023px) {
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
  @media (min-width: 1024px) {
    display: grid;
    grid-template-columns: ${(p) =>
      p.$cols
        ? `repeat(${p.$cols}, minmax(0, 1fr))`
        : "repeat(4, minmax(0, 1fr))"};
    gap: 16px;
    align-content: start;
  }
`;

const CardSlot = styled.div`
  @media (max-width: 1023px) {
    flex: 0 0
      ${(p) => `calc((100% - ${(p.$m - 1) * STRIP_GAP}px) / ${p.$m})`};
    min-width: ${(p) => `calc((100% - ${(p.$m - 1) * STRIP_GAP}px) / ${p.$m})`};
    max-width: ${(p) => `calc((100% - ${(p.$m - 1) * STRIP_GAP}px) / ${p.$m})`};
    scroll-snap-align: start;
    box-sizing: border-box;
  }
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
 * @param {number} [maxColumns=4] — desktop grid (≥1024px)
 * @param {number} [maxColumnsMobile=1] — yatay şerit, düşük viewport (≤1023px); 1 = tam geniş kart
 */
export function ProductGrid({
  products = [],
  maxColumns = 4,
  maxColumnsMobile = 1,
  activeFilters = {},
}) {
  if (!products.length) return <Empty>No products found</Empty>;

  const cols = clampCols(maxColumns);
  const m = clampCols(maxColumnsMobile);

  return (
    <CatalogWrap
      className="product-grid-strip"
      data-product-strip
      $cols={cols}
    >
      {products.map((p) => (
        <CardSlot key={p.id} $m={m}>
          <ProductCard product={p} activeFilters={activeFilters} plainImage />
        </CardSlot>
      ))}
    </CatalogWrap>
  );
}
