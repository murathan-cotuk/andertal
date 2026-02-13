/**
 * Store API: Region-based & Category-based Products
 * 
 * GET /store/products?region=DE - Region'a göre ürünleri listele
 * GET /store/products?category=electronics - Kategoriye göre ürünleri listele
 * GET /store/products?region=DE&category=electronics - Hem region hem kategori filtresi
 * 
 * ÖNCE Medusa ProductService'ten tüm ürünleri alır
 * SONRA RegionService ile region'a göre filtreler
 * SONRA AdminHubCategory ile kategoriye göre filtreler (metadata.admin_category_id)
 */

import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import RegionService from "../../../../services/region-service"
import AdminHubService from "../../../../services/admin-hub-service"

export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const { region, category, collection_id } = req.query

  try {
    // Medusa ProductService'i container'dan al
    const productService = req.scope.resolve("productService")

    // Önce Medusa'dan TÜM ürünleri al
    const allProducts = await productService.listAndCount({})

    let filteredProducts = allProducts[0]

    // Collection filtresi (Medusa collection handle = category slug)
    if (collection_id && typeof collection_id === "string") {
      try {
        const productCollectionService = req.scope.resolve("productCollectionService")
        const collections = await productCollectionService.list({ handle: collection_id })
        
        if (collections && collections.length > 0) {
          const collection = collections[0]
          // Get products in collection
          const collectionProducts = await productCollectionService.retrieve(collection.id, {
            relations: ["products"],
          })
          
          if (collectionProducts?.products) {
            const collectionProductIds = collectionProducts.products.map((p: any) => p.id)
            filteredProducts = filteredProducts.filter((product: any) =>
              collectionProductIds.includes(product.id)
            )
          }
        } else {
          filteredProducts = []
        }
      } catch (e) {
        console.warn("Collection filter failed, falling back to category filter:", e.message)
        // Fallback to category filter
      }
    }

    // Region filtresi
    if (region && typeof region === "string") {
      const regionService: RegionService = req.scope.resolve("regionService")
      const regionProductIds = await regionService.listProductsByRegion(region.toUpperCase())
      filteredProducts = filteredProducts.filter((product: any) =>
        regionProductIds.includes(product.id)
      )
    }

    // Category filtresi (Admin Hub kategorisi - metadata.admin_category_id)
    if (category && typeof category === "string") {
      const adminHubService: AdminHubService = req.scope.resolve("adminHubService")
      
      // Category slug'dan ID'yi bul
      const categoryEntity = await adminHubService.getCategoryBySlug(category)
      
      if (categoryEntity) {
        // metadata.admin_category_id ile eşleşen ürünleri filtrele
        filteredProducts = filteredProducts.filter((product: any) => {
          const productMetadata = product.metadata || {}
          return productMetadata.admin_category_id === categoryEntity.id
        })
      } else {
        // Kategori bulunamadı, boş array döndür
        filteredProducts = []
      }
    }

    res.json({
      products: filteredProducts,
      count: filteredProducts.length,
      ...(region && { region: region.toUpperCase() }),
      ...(category && { category }),
      ...(collection_id && { collection_id }),
    })
  } catch (error) {
    console.error("Store products error:", error)
    res.status(500).json({
      message: error.message || "Internal server error",
    })
  }
}
