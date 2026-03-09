"use client";

import ShopHeader from "@/components/ShopHeader";
import Footer from "@/components/Footer";
import ProductTemplate from "@/components/templates/ProductTemplate";

export default function ProductPage() {
  return (
    <div className="min-h-screen flex flex-col bg-white">
      <ShopHeader />
      <main className="flex-grow bg-white">
        <ProductTemplate />
      </main>
      <Footer />
    </div>
  );
}

