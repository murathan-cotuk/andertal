"use client";

import React from "react";
import { useTranslations } from "next-intl";
import Carousel from "@/components/Carousel";
import { ProductCard } from "@/components/ProductCard";

export default function RecommendCarousel({
  title,
  products = [],
}) {
  const tp = useTranslations("product");
  const list = (products || []).slice(0, 12);

  const displayTitle = title ?? tp("popularWithCustomers");
  return (
    <Carousel
      title={displayTitle}
      visibleCount={2}
      navOnSides
      gap={16}
      showFade={false}
      ariaLabel={displayTitle}
    >
      {list.map((product, i) => (
        <ProductCard key={product.id || i} product={product} plainImage />
      ))}
    </Carousel>
  );
}
