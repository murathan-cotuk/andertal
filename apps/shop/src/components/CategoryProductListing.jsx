"use client";

import React from "react";
import { ProductGrid } from "@/components/ProductGrid";

/**
 * Kategorieseite: Shop-Template `products_per_row` (Desktop-Grid) + `products_per_row_mobile` (schmaler Viewport, Streifen).
 */
export function CategoryProductListing({ products, activeFilters, maxColumns = 4, maxColumnsMobile = 1 }) {
  if (!products?.length) return null;
  return (
    <ProductGrid
      products={products}
      maxColumns={maxColumns}
      maxColumnsMobile={maxColumnsMobile}
      activeFilters={activeFilters}
    />
  );
}
