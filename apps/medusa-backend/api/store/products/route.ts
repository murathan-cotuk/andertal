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
import RegionService from "../../../services/region-service"
import AdminHubService from "../../../services/admin-hub-service"

function getProductService(scope: { resolve: (key: string) => unknown }) {
  try {
    return scope.resolve("productModuleService") as { listAndCount: (f: object, o?: object) => Promise<[unknown[], number]> }
  } catch {
    return scope.resolve("productService") as { listAndCount: (f: object, o?: object) => Promise<[unknown[], number]> }
  }
}

export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const { region, category, collection_id } = req.query

  try {
    let productService: { listAndCount: (f: object, o?: object) => Promise<[unknown[], number]> }
    try {
      productService = getProductService(req.scope)
    } catch {
      return res.json({ products: [], count: 0 })
    }

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

    // Region filtresi (regionService yoksa atla)
    if (region && typeof region === "string") {
      try {
        const regionService: RegionService = req.scope.resolve("regionService")
        const regionProductIds = await regionService.listProductsByRegion(region.toUpperCase())
        filteredProducts = filteredProducts.filter((product: any) =>
          regionProductIds.includes(product.id)
        )
      } catch (e) {
        console.warn("Region filter skipped:", (e as Error).message)
      }
    }

    // Category filtresi (adminHubService yoksa atla)
    if (category && typeof category === "string") {
      try {
        const adminHubService: AdminHubService = req.scope.resolve("adminHubService")
        const categoryEntity = await adminHubService.getCategoryBySlug(category)
        if (categoryEntity) {
          filteredProducts = filteredProducts.filter((product: any) => {
            const productMetadata = product.metadata || {}
            return productMetadata.admin_category_id === categoryEntity.id
          })
        } else {
          filteredProducts = []
        }
      } catch (e) {
        console.warn("Category filter skipped:", (e as Error).message)
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
