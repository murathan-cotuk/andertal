"use client";

import ShopHeader from "@/components/ShopHeader";
import Footer from "@/components/Footer";
import CategoryTemplate from "@/components/templates/CategoryTemplate";

export default function CategoryPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <ShopHeader />
      <main className="flex-grow">
        <CategoryTemplate />
      </main>
      <Footer />
    </div>
  );
}

