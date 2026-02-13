/**
 * Admin API: Product Categories (DEPRECATED - Salt Read-Only)
 * 
 * ⚠️ DEPRECATED: Bu endpoint sadece okuma için kullanılmalı.
 * Kategori oluşturma/güncelleme Admin Hub üzerinden yapılmalı.
 * 
 * GET /admin/product-categories - Tüm kategorileri listele (read-only)
 * POST /admin/product-categories - DEPRECATED (kullanmayın, Admin Hub kullanın)
 * 
 * Medusa v2 ProductCategoryService kullanıyor (read-only)
 */

import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  try {
    // DEPRECATED: Bu endpoint salt read-only, yeni kullanım için Admin Hub kullanın
    console.log("⚠️  DEPRECATED: /admin/product-categories (use /admin-hub/v1/categories)")
    
    // Medusa v2'de ProductCategoryService'i container'dan al
    // Medusa v2'de service adı: "productCategoryService" veya module service olabilir
    let productCategoryService
    
    try {
      productCategoryService = req.scope.resolve("productCategoryService")
      console.log("✅ productCategoryService bulundu")
    } catch (e1) {
      console.warn("⚠️  productCategoryService bulunamadı, alternatif denenecek...")
      try {
        // ProductModuleService'i dene
        const productModuleService = req.scope.resolve("productModuleService")
        productCategoryService = productModuleService
        console.log("✅ productModuleService bulundu")
      } catch (e2) {
        console.warn("⚠️  productModuleService de bulunamadı")
        // Service bulunamadı, boş array döndür (frontend crash olmasın)
        console.log("📤 Boş array döndürülüyor (service bulunamadı)")
        res.json({
          product_categories: [],
          count: 0,
        })
        return
      }
    }

    // Tüm kategorileri listele
    let categories, count
    
    if (productCategoryService && typeof productCategoryService.listAndCount === 'function') {
      [categories, count] = await productCategoryService.listAndCount({})
      console.log(`✅ ${count || 0} kategori bulundu`)
    } else if (productCategoryService && typeof productCategoryService.list === 'function') {
      categories = await productCategoryService.list({})
      count = categories?.length || 0
      console.log(`✅ ${count} kategori bulundu (list method)`)
    } else {
      console.warn("⚠️  Service'de listAndCount veya list method'u yok")
      categories = []
      count = 0
    }

    res.json({
      product_categories: categories || [],
      count: count || 0,
    })
  } catch (error) {
    console.error("❌ Product categories API error:", error)
    console.error("Error stack:", error.stack)
    
    // Hata durumunda boş array döndür (frontend crash olmasın)
    res.json({
      product_categories: [],
      count: 0,
    })
  }
}

export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  // DEPRECATED: Kategori oluşturma Admin Hub üzerinden yapılmalı
  res.status(410).json({
    message: "This endpoint is deprecated. Use /admin-hub/v1/categories instead.",
    deprecated: true,
    alternative: "/admin-hub/v1/categories",
  })
}
