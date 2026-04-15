"use client";

import { ProductCard } from "@/components/ProductCard";
import styled from "styled-components";

const Grid = styled.div`
  display: grid;
  gap: 16px;
  background: transparent;

  /* Mobile always 2 columns */
  grid-template-columns: repeat(2, 1fr);

  /* Tablet: up to 3 */
  @media (min-width: 640px) {
    grid-template-columns: repeat(${(p) => Math.min(p.$cols, 3)}, 1fr);
  }

  /* Desktop: full column count */
  @media (min-width: 1024px) {
    grid-template-columns: repeat(${(p) => p.$cols}, 1fr);
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

export function ProductGrid({ products = [], maxColumns = 4, activeFilters = {} }) {
  const cols = Math.max(2, Math.min(6, Number(maxColumns) || 4));
  if (!products.length) return <Empty>No products found</Empty>;

  return (
    <Grid $cols={cols}>
      {products.map((p) => (
        <ProductCard key={p.id} product={p} activeFilters={activeFilters} />
      ))}
    </Grid>
  );
}
