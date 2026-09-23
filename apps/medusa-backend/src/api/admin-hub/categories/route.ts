/**
 * Admin Hub Categories API
 * 
 * GET /admin-hub/categories - Kategorileri listele
 * POST /admin-hub/categories - Yeni kategori oluştur
 */

import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import AdminHubService from "../../../../services/admin-hub-service"

const { adminHubCategoriesGET } = require("../../../routes/categories") as {
  adminHubCategoriesGET: (req: MedusaRequest, res: MedusaResponse) => Promise<unknown>
}

export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  await adminHubCategoriesGET(req, res)
}

export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  try {
    const adminHubService: AdminHubService = req.scope.resolve("adminHubService")
    const { 
      name, 
      slug, 
      description, 
      parent_id, 
      active, 
      is_visible, 
      has_collection, 
      sort_order, 
      metadata 
    } = req.body

    if (!name || !slug) {
      res.status(400).json({
        message: "name ve slug zorunludur",
      })
      return
    }

    const category = await adminHubService.createCategory({
      name,
      slug,
      description,
      parent_id: parent_id || null,
      active: active !== undefined ? active : true,
      is_visible: is_visible !== undefined ? is_visible : true,
      has_collection: has_collection !== undefined ? has_collection : false,
      sort_order: sort_order || 0,
      metadata,
    })

    res.status(201).json({ category })
  } catch (error) {
    console.error("Admin Hub Categories POST error:", error)
    res.status(500).json({
      message: error.message || "Internal server error",
    })
  }
}
