'use client'

import Navbar from '@/components/Navbar'
import SlimBar from '@/components/SlimBar'
import Footer from '@/components/Footer'
import Hero from '@/components/Hero'
import { ProductGrid } from '@/components/ProductGrid'
import { useMedusaProducts } from '@/hooks/useMedusa'

export default function Home() {
  const { products, loading, error } = useMedusaProducts()

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <SlimBar />
      <main className="flex-grow">
        <Hero />
        <div className="container mx-auto px-4 py-8">
          <h2 className="text-3xl font-bold mb-6">Products</h2>
          {loading && <p>Loading products from Medusa...</p>}
          {error && (
            <div className="bg-yellow-100 border border-yellow-400 text-yellow-700 px-4 py-3 rounded mb-4">
              <p>⚠️ Products temporarily unavailable</p>
              <p className="text-sm mt-2">
                {typeof window !== 'undefined' && window.location.hostname === 'localhost'
                  ? 'Start the backend from the repo root: npm run dev --workspace=medusa-backend (or cd apps/medusa-backend && npm run dev). Ensure apps/shop/.env.local has NEXT_PUBLIC_MEDUSA_BACKEND_URL=http://localhost:9000.'
                  : 'The product catalog is being set up. Please check back soon.'}
              </p>
            </div>
          )}
          {!loading && !error && products.length === 0 && (
            <p>No products found. Please add products in Medusa admin panel.</p>
          )}
          <ProductGrid products={products || []} />
        </div>
      </main>
      <Footer />
    </div>
  )
}
