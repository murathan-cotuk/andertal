"use client";

import React from "react";
import Carousel from "@/components/Carousel";
import { ProductCard } from "@/components/ProductCard";

export default function RecommendCarousel({
  title = "Beliebt bei unseren Kunden",
  products = [],
}) {
  const list = (products || []).slice(0, 12);

  return (
    <Carousel
      title={title}
      visibleCount={2}
      navOnSides
      gap={16}
      showFade={false}
      ariaLabel={title}
    >
      {list.map((product, i) => (
        <ProductCard key={product.id || i} product={product} plainImage />
      ))}
    </Carousel>
  );
}
