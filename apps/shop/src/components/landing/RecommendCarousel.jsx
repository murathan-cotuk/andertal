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
      visibleCount={4}
      navOnSides
      autoPlay
      autoPlayInterval={7500}
      gap={20}
      ariaLabel={title}
    >
      {list.map((product, i) => (
        <ProductCard key={product.id || i} product={product} compact />
      ))}
    </Carousel>
  );
}
