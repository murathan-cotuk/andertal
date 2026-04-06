/**
 * Admin Hub Brands [id] API
 *
 * GET    /admin-hub/brands/:id  - Marka getir
 * PATCH  /admin-hub/brands/:id  - Marka güncelle
 * DELETE /admin-hub/brands/:id  - Marka sil
 */

import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import AdminHubService from "../../../../../services/admin-hub-service"

export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  try {
    const adminHubService: AdminHubService = req.scope.resolve("adminHubService")
    const { id } = req.params
    const brand = await adminHubService.getBrandById(id)
    if (!brand) {
      res.status(404).json({ message: "Brand not found" })
      return
    }
    res.json({ brand })
  } catch (error) {
    console.error("Admin Hub Brands GET [id] error:", error)
    res.status(500).json({ message: (error as Error)?.message || "Internal server error" })
  }
}

export async function PATCH(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  try {
    const adminHubService: AdminHubService = req.scope.resolve("adminHubService")
    const { id } = req.params
    const { name, handle, logo_image, banner_image, address, metadata } = req.body as any

    const brand = await adminHubService.updateBrand(id, {
      ...(name !== undefined && { name }),
      ...(handle !== undefined && { handle }),
      ...(logo_image !== undefined && { logo_image }),
      ...(banner_image !== undefined && { banner_image }),
      ...(address !== undefined && { address }),
      ...(metadata !== undefined && { metadata }),
    })

    res.json({ brand })
  } catch (error) {
    console.error("Admin Hub Brands PATCH error:", error)
    res.status(500).json({ message: (error as Error)?.message || "Internal server error" })
  }
}

export async function DELETE(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  try {
    const adminHubService: AdminHubService = req.scope.resolve("adminHubService")
    const { id } = req.params
    await adminHubService.deleteBrand(id)
    res.json({ deleted: true, id })
  } catch (error) {
    console.error("Admin Hub Brands DELETE error:", error)
    res.status(500).json({ message: (error as Error)?.message || "Internal server error" })
  }
}
