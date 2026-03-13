"use client";

import { ProductCard } from "@/components/ProductCard";
import styled from "styled-components";

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 2px;

  @media (min-width: 640px) {
    grid-template-columns: repeat(3, 1fr);
  }

  @media (min-width: 1024px) {
    grid-template-columns: ${(p) =>
      p.$cols === 4 ? "repeat(4, 1fr)" : "repeat(3, 1fr)"};
  }

  @media (min-width: 1280px) {
    grid-template-columns: ${(p) =>
      p.$cols === 4 ? "repeat(4, 1fr)" : "repeat(3, 1fr)"};
  }
`;

const Empty = styled.div`
  text-align: center;
  padding: 64px 24px;
  color: #9ca3af;
  font-size: 14px;
  letter-spacing: 0.02em;
`;

export function ProductGrid({ products = [], maxColumns = 3 }) {
  if (products.length === 0) {
    return <Empty>No products found.</Empty>;
  }

  return (
    <Grid $cols={maxColumns}>
      {products.map((product) => (
        <ProductCard key={product.id} product={product} />
      ))}
    </Grid>
  );
}
