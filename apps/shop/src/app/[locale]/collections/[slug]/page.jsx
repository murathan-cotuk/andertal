"use client";

import ShopHeader from "@/components/ShopHeader";
import Footer from "@/components/Footer";
import { ProductGrid } from "@/components/ProductGrid";
import Breadcrumbs from "@/components/Breadcrumbs";
import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { getMedusaClient } from "@/lib/medusa-client";

export default function CollectionPage() {
  const params = useParams();
  const slug = params?.slug != null ? String(params.slug) : undefined;

  const [category, setCategory] = useState(null);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!slug) return;

    const fetchData = async () => {
      try {
        setLoading(true);
        const client = getMedusaClient();

        const categoryItem = await client.getCategoryBySlug(slug);
        if (!categoryItem || !categoryItem.has_collection) {
          throw new Error("Collection not found");
        }
        setCategory(categoryItem);

        const productsData = await client.getProducts({ collection_id: slug });
        setProducts(productsData.products || []);
      } catch (err) {
        setError(err?.message ?? "Error");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [slug]);

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col">
        <ShopHeader />
        <main className="flex-grow container mx-auto px-4 py-8">
          <p>Loading collection...</p>
        </main>
        <Footer />
      </div>
    );
  }

  if (error || !category) {
    return (
      <div className="min-h-screen flex flex-col">
        <ShopHeader />
        <main className="flex-grow container mx-auto px-4 py-8">
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
            <p>{error || "Collection not found"}</p>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <ShopHeader />
      <main className="flex-grow container mx-auto px-4 py-8 bg-white">
        <Breadcrumbs title={category.name} />
        <h1 className="text-4xl font-bold mb-4">{category.name}</h1>
        {category.description && (
          <p className="text-gray-600 mb-8">{category.description}</p>
        )}
        
        {products.length === 0 ? (
          <p className="text-gray-500">No products in this collection yet.</p>
        ) : (
          <ProductGrid products={products} />
        )}
      </main>
      <Footer />
    </div>
  );
}
