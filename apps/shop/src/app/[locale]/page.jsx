"use client";

import React, { useState, useEffect } from "react";
import ShopHeader from "@/components/ShopHeader";
import Footer from "@/components/Footer";
import {
  HeroSection,
  FlashSaleSection,
  FeaturedCollections,
  SellerHighlight,
  TrustBar,
  RecommendCarousel,
} from "@/components/landing";
import LandingContainers from "@/components/landing/LandingContainers";
import { getMedusaClient } from "@/lib/medusa-client";
import { useMedusaProducts } from "@/hooks/useMedusa";
import Breadcrumbs from "@/components/Breadcrumbs";
import { useTranslations } from "next-intl";

export default function Home() {
  const tHome = useTranslations("home");
  const { products, loading, error } = useMedusaProducts();
  const [collections, setCollections] = useState([]);

  useEffect(() => {
    const client = getMedusaClient();
    client.getCollections().then((r) => setCollections(r.collections || []));
  }, []);

  const saleProducts = (products || []).filter(
    (p) => p.metadata?.rabattpreis_cents != null || p.metadata?.sale
  );
  const recommendProducts = products || [];

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <ShopHeader />
      <main className="flex-grow bg-white">
        <LandingContainers />
        <HeroSection collections={collections} />
        <div className="max-w-3xl mx-auto px-4 py-6 text-center text-sm text-gray-600 leading-relaxed">
          {tHome("categoryBrowseHint")}
        </div>
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

