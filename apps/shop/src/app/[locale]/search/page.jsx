"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import ShopHeader from "@/components/ShopHeader";
import Footer from "@/components/Footer";
import { ProductGrid } from "@/components/ProductGrid";
import { useMedusaProducts } from "@/hooks/useMedusa";
import Breadcrumbs from "@/components/Breadcrumbs";

function SearchPageContent() {
  const searchParams = useSearchParams();
  const q = (searchParams?.get("q") || "").trim();
  const { products, loading, error } = useMedusaProducts();
  const filtered =
    q && Array.isArray(products)
      ? products.filter(
          (p) =>
            (p.title || "").toLowerCase().includes(q.toLowerCase()) ||
            (p.description || "").toLowerCase().includes(q.toLowerCase())
        )
      : [];

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <ShopHeader />
      <main className="flex-grow bg-white">
        <div className="container mx-auto px-4 py-8">
          <Breadcrumbs />
          <h1 className="text-2xl font-bold mb-4">
            {q ? `Suche: „${q}"` : "Suche"}
          </h1>
          {loading && <p className="text-gray-500">Laden…</p>}
          {error && <p className="text-amber-600">Suche vorübergehend nicht verfügbar.</p>}
          {!loading && !error && !q && (
            <p className="text-gray-500">Suchbegriff eingeben und Enter drücken.</p>
          )}
          {!loading && !error && q && (
            <>
              <p className="text-gray-600 mb-6">
                {filtered.length} {filtered.length === 1 ? "Ergebnis" : "Ergebnisse"}
              </p>
              <ProductGrid products={filtered} />
            </>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}

function SearchFallback() {
  return (
    <div className="min-h-screen flex flex-col bg-white">
      <ShopHeader />
      <main className="flex-grow bg-white">
        <div className="container mx-auto px-4 py-8">
          <Breadcrumbs />
          <h1 className="text-2xl font-bold mb-4">Suche</h1>
          <p className="text-gray-500">Laden…</p>
        </div>
      </main>
      <Footer />
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={<SearchFallback />}>
      <SearchPageContent />
    </Suspense>
  );
}
