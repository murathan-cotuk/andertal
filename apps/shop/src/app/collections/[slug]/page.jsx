"use client";

import Navbar from "@/components/Navbar";
import SlimBar from "@/components/SlimBar";
import Footer from "@/components/Footer";
import { ProductGrid } from "@/components/ProductGrid";
import { useState, useEffect } from "react";
import { useParams } from "next/navigation";

const MEDUSA_BACKEND_URL = process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || 'http://localhost:9000';

export default function CollectionPage() {
  const params = useParams();
  const slug = params?.slug as string;
  
  const [category, setCategory] = useState(null);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!slug) return;

    const fetchData = async () => {
      try {
        setLoading(true);
        
        // 1. Fetch category by slug
        const categoryRes = await fetch(`${MEDUSA_BACKEND_URL}/admin-hub/categories?slug=${slug}`);
        if (!categoryRes.ok) throw new Error("Category not found");
        
        const categoryData = await categoryRes.json();
        const categoryItem = categoryData.categories?.find((c: any) => c.slug === slug);
        
        if (!categoryItem || !categoryItem.has_collection) {
          throw new Error("Collection not found");
        }
        
        setCategory(categoryItem);

        // 2. Fetch products from Medusa collection (handle = slug)
        const productsRes = await fetch(`${MEDUSA_BACKEND_URL}/store/products?collection_id=${slug}`);
        if (!productsRes.ok) throw new Error("Failed to fetch products");
        
        const productsData = await productsRes.json();
        setProducts(productsData.products || []);
        
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [slug]);

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col">
        <Navbar />
        <SlimBar />
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
        <Navbar />
        <SlimBar />
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
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <SlimBar />
      <main className="flex-grow container mx-auto px-4 py-8">
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
