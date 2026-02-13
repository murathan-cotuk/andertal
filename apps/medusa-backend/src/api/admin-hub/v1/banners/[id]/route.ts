/**
 * Admin Hub Banner by ID API v1
 * 
 * GET /admin-hub/v1/banners/:id - Banner detayı
 * PUT /admin-hub/v1/banners/:id - Banner güncelle
 * DELETE /admin-hub/v1/banners/:id - Banner sil
 */

import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import AdminHubService from "../../../../../../services/admin-hub-service"

export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  try {
    const adminHubService: AdminHubService = req.scope.resolve("adminHubService")
    const { id } = req.params

    const banner = await adminHubService.getBannerById(id)

    if (!banner) {
      res.status(404).json({
        message: "Banner not found",
      })
      return
    }

    res.json({ banner })
  } catch (error) {
    console.error("Admin Hub Banner GET error:", error)
    res.status(500).json({
      message: error.message || "Internal server error",
    })
  }
}

export async function PUT(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  try {
    const adminHubService: AdminHubService = req.scope.resolve("adminHubService")
    const { id } = req.params
    const updateData = req.body

    const banner = await adminHubService.updateBanner(id, updateData)

    res.json({ banner })
  } catch (error) {
    console.error("Admin Hub Banner PUT error:", error)
    res.status(500).json({
      message: error.message || "Internal server error",
    })
  }
}

export async function DELETE(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  try {
    const adminHubService: AdminHubService = req.scope.resolve("adminHubService")
    const { id } = req.params

    await adminHubService.deleteBanner(id)

    res.status(200).json({ deleted: true })
  } catch (error) {
    console.error("Admin Hub Banner DELETE error:", error)
    res.status(500).json({
      message: error.message || "Internal server error",
    })
  }
}
