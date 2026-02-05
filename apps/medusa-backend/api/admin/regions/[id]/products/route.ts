/**
 * Admin API: Attach Product to Region
 * 
 * POST /admin/regions/:id/products - Ürünü region'a bağla
 * DELETE /admin/regions/:id/products/:productId - Ürünü region'dan ayır
 */

import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import RegionService from "../../../../../services/region-service"

export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const regionService: RegionService = req.scope.resolve("regionService")
  const { id: regionId } = req.params
  const { product_id } = req.body

  if (!product_id) {
    res.status(400).json({
      message: "product_id zorunludur",
    })
    return
  }

  try {
    const relation = await regionService.attachProductToRegion(product_id, regionId)
    res.status(201).json({ relation })
  } catch (error) {
    console.error("Region-Product API error:", error)
    res.status(500).json({
      message: error.message || "Internal server error",
    })
  }
}

export async function DELETE(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const regionService: RegionService = req.scope.resolve("regionService")
  const { id: regionId, productId } = req.params

  try {
    await regionService.detachProductFromRegion(productId, regionId)
    res.status(200).json({ deleted: true })
  } catch (error) {
    console.error("Region-Product API error:", error)
    res.status(500).json({
      message: error.message || "Internal server error",
    })
  }
}
