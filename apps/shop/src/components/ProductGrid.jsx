"use client";

import { ProductCard } from "@/components/ProductCard";
import styled from "styled-components";

const Grid = styled.div`
  display: grid;
  gap: 16px;
  background: transparent;

  grid-template-columns: repeat(2, 1fr);

  @media (min-width: 640px)  { grid-template-columns: repeat(3, 1fr); }
  @media (min-width: 1024px) {
    grid-template-columns: ${(p) =>
      p.$cols === 4 ? "repeat(4, 1fr)" : "repeat(3, 1fr)"};
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

export function ProductGrid({ products = [], maxColumns = 3 }) {
  if (!products.length) return <Empty>No products found</Empty>;

  return (
    <Grid $cols={maxColumns}>
      {products.map((p) => (
        <ProductCard key={p.id} product={p} />
      ))}
    </Grid>
  );
}
