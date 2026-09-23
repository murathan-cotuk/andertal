/**
 * Admin Hub Categories API v1
 * 
 * GET /admin-hub/v1/categories - Kategorileri listele
 * POST /admin-hub/v1/categories - Yeni kategori oluştur
 */

import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import AdminHubService from "../../../../../services/admin-hub-service"

const { adminHubCategoriesGET } = require("../../../../routes/categories") as {
  adminHubCategoriesGET: (req: MedusaRequest, res: MedusaResponse) => Promise<unknown>
}

export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  await adminHubCategoriesGET(req, res)
}

type CategoryCreateBody = {
  name?: string
  slug?: string
  description?: string
  parent_id?: string | null
  active?: boolean
  is_visible?: boolean
  has_collection?: boolean
  sort_order?: number
  seo_title?: string | null
  seo_description?: string | null
  long_content?: string | null
  banner_image_url?: string | null
  metadata?: Record<string, unknown>
}

export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  try {
    const adminHubService: AdminHubService = req.scope.resolve("adminHubService")
    const body = (req.body || {}) as CategoryCreateBody
    const {
      name,
      slug,
      description,
      parent_id,
      active,
      is_visible,
      has_collection,
      sort_order,
      seo_title,
      seo_description,
      long_content,
      banner_image_url,
      metadata,
    } = body

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
      seo_title: seo_title ?? null,
      seo_description: seo_description ?? null,
      long_content: long_content ?? null,
      banner_image_url: banner_image_url ?? null,
      metadata,
    })

    res.status(201).json({ category })
  } catch (error) {
    console.error("Admin Hub Categories POST error:", error)
    res.status(500).json({
      message: (error as Error)?.message || "Internal server error",
    })
  }
}
