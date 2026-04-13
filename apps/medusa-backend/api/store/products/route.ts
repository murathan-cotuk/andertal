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
  const keysToTry: string[] = []
  try {
    const { Modules } = require("@medusajs/framework/utils")
    if (Modules?.PRODUCT) keysToTry.push(Modules.PRODUCT)
  } catch (_) {}
  keysToTry.push("productModuleService", "product_service", "productService")
  let lastErr: Error | null = null
  for (const key of keysToTry) {
    try {
      const svc = scope.resolve(key) as any
      if (svc && typeof svc.listAndCount === "function") return svc
      if (svc && typeof svc.listAndCountProducts === "function") {
        return { listAndCount: (f: object, o?: object) => svc.listAndCountProducts(f, o) }
      }
    } catch (e) {
      lastErr = e as Error
    }
  }
  throw lastErr || new Error("Could not resolve product service")
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
      res.json({ products: [], count: 0 })
      return
    }

    // Önce Medusa'dan TÜM ürünleri al
    const allProducts = await productService.listAndCount({})

    let filteredProducts = allProducts[0]

    // Collection filtresi (Medusa collection handle = category slug)
    if (collection_id && typeof collection_id === "string") {
      try {
        const productCollectionService = req.scope.resolve("productCollectionService") as {
          list?: (filter: object) => Promise<unknown[]>
          retrieve?: (id: string, opts?: object) => Promise<{ products?: { id: string }[] }>
        }
        const listFn = productCollectionService?.list
        const collections = listFn ? await listFn({ handle: collection_id }) : []
        const collectionsArr = Array.isArray(collections) ? collections : []

        if (collectionsArr.length > 0) {
          const collection = collectionsArr[0] as { id: string }
          const retrieveFn = productCollectionService?.retrieve
          const collectionProducts = retrieveFn
            ? await retrieveFn(collection.id, { relations: ["products"] })
            : null
          
          const products = collectionProducts && (collectionProducts as { products?: { id: string }[] }).products
          if (products && Array.isArray(products)) {
            const collectionProductIds = products.map((p) => p.id)
            filteredProducts = filteredProducts.filter((product: { id: string }) =>
              collectionProductIds.includes(product.id)
            )
          }
        } else {
          filteredProducts = []
        }
      } catch (e) {
        console.warn("Collection filter failed, falling back to category filter:", (e as Error)?.message)
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
          const want = String(categoryEntity.id || "").trim().toLowerCase()
          filteredProducts = filteredProducts.filter((product: any) => {
            const productMetadata = product.metadata || {}
            const primary = String(productMetadata.admin_category_id || productMetadata.category_id || "")
              .trim()
              .toLowerCase()
            if (primary && primary === want) return true
            const raw = productMetadata.category_ids
            const arr = Array.isArray(raw)
              ? raw
              : typeof raw === "string" && raw.trim().startsWith("[")
                ? (() => {
                    try {
                      const p = JSON.parse(raw)
                      return Array.isArray(p) ? p : []
                    } catch {
                      return []
                    }
                  })()
                : []
            return arr.some((id: unknown) => String(id || "").trim().toLowerCase() === want)
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
      ...(region && typeof region === "string" && { region: region.toUpperCase() }),
      ...(category && { category }),
      ...(collection_id && { collection_id }),
    })
  } catch (error) {
    console.error("Store products error:", error)
    res.status(500).json({
      message: (error as Error)?.message || "Internal server error",
    })
  }
}
