/**
 * Admin Hub Category by ID API
 * 
 * GET /admin-hub/categories/:id - Kategori detayı
 * PUT /admin-hub/categories/:id - Kategori güncelle
 * DELETE /admin-hub/categories/:id - Kategori sil
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

    const category = await adminHubService.getCategoryById(id)

    if (!category) {
      res.status(404).json({
        message: "Category not found",
      })
      return
    }

    res.json({ category })
  } catch (error) {
    console.error("Admin Hub Category GET error:", error)
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

    const category = await adminHubService.updateCategory(id, updateData)

    res.json({ category })
  } catch (error) {
    console.error("Admin Hub Category PUT error:", error)
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

    await adminHubService.deleteCategory(id)

    res.status(200).json({ deleted: true })
  } catch (error) {
    console.error("Admin Hub Category DELETE error:", error)
    res.status(500).json({
      message: error.message || "Internal server error",
    })
  }
}
