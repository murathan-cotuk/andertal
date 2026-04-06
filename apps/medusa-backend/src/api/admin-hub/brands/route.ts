/**
 * Admin Hub Brands API
 *
 * GET  /admin-hub/brands       - Markaları listele
 * POST /admin-hub/brands       - Yeni marka oluştur
 */

import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import AdminHubService from "../../../../services/admin-hub-service"

export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  try {
    const adminHubService: AdminHubService = req.scope.resolve("adminHubService")
    const brands = await adminHubService.listBrands()
    res.json({ brands, count: brands.length })
  } catch (error) {
    console.error("Admin Hub Brands GET error:", error)
    res.status(500).json({ message: (error as Error)?.message || "Internal server error" })
  }
}

export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  try {
    const adminHubService: AdminHubService = req.scope.resolve("adminHubService")
    const { name, handle, logo_image, banner_image, address, metadata } = req.body as any

    if (!name || !handle) {
      res.status(400).json({ message: "name ve handle zorunludur" })
      return
    }

    const brand = await adminHubService.createBrand({
      name,
      handle,
      logo_image: logo_image ?? null,
      banner_image: banner_image ?? null,
      address: address ?? null,
      metadata,
    })

    res.status(201).json({ brand })
  } catch (error) {
    console.error("Admin Hub Brands POST error:", error)
    res.status(500).json({ message: (error as Error)?.message || "Internal server error" })
  }
}
