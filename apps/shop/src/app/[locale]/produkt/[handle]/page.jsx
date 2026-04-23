"use client";

import ShopHeader from "@/components/ShopHeader";
import Footer from "@/components/Footer";
import ProductTemplate from "@/components/templates/ProductTemplate";
import ProductTemplateMobile from "@/components/templates/ProductTemplateMobile";
import { useIsNarrow } from "@/hooks/useIsNarrow";

export default function ProduktPage() {
  const isMobile = useIsNarrow(767);
  return (
    <div className="min-h-screen flex flex-col bg-white">
      <ShopHeader />
      <main className="flex-grow bg-white">
        {isMobile ? <ProductTemplateMobile /> : <ProductTemplate />}
      </main>
      <Footer />
    </div>
  );
}
