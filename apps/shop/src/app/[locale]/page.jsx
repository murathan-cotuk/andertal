"use client";

import React, { useState, useEffect } from "react";
import ShopHeader from "@/components/ShopHeader";
import Footer from "@/components/Footer";
import {
  HeroSection,
  CategoryShowcase,
  FlashSaleSection,
  FeaturedCollections,
  SellerHighlight,
  TrustBar,
  RecommendCarousel,
} from "@/components/landing";
import { getMedusaClient } from "@/lib/medusa-client";
import { useMedusaProducts } from "@/hooks/useMedusa";
import Breadcrumbs from "@/components/Breadcrumbs";

export default function Home() {
  const { products, loading, error } = useMedusaProducts();
  const [collections, setCollections] = useState([]);
  const [categories, setCategories] = useState([]);

  useEffect(() => {
    const client = getMedusaClient();
    client.getCollections().then((r) => setCollections(r.collections || []));
    client.getCategories().then((r) => setCategories(r.categories || []));
  }, []);

  const saleProducts = (products || []).filter(
    (p) => p.metadata?.rabattpreis_cents != null || p.metadata?.sale
  );
  const recommendProducts = products || [];

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <ShopHeader />
      <main className="flex-grow bg-white">
        <HeroSection collections={collections} />
        <CategoryShowcase
          categories={categories.length ? categories : collections}
        />
        <FlashSaleSection
          products={saleProducts.length ? saleProducts : products || []}
          endDate={null}
        />
        <FeaturedCollections collections={collections} />
        <SellerHighlight sellers={[]} />
        <TrustBar />
        <RecommendCarousel products={recommendProducts} />
        <div className="container mx-auto px-4 py-8">
          <Breadcrumbs />
          {loading && <p className="text-dark-600 text-small py-4">Laden…</p>}
          {error && (
            <div className="bg-state-warning/10 border border-state-warning text-dark-800 px-4 py-3 rounded-card mb-4 text-small">
              Produkte derzeit nicht verfügbar.
            </div>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}

