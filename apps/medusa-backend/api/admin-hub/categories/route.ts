/**
 * Admin Hub Categories API
 * 
 * GET /admin-hub/categories - Kategorileri listele
 * POST /admin-hub/categories - Yeni kategori oluştur
 */

import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import AdminHubService from "../../../services/admin-hub-service"

export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  try {
    const adminHubService: AdminHubService = req.scope.resolve("adminHubService")
    const { active, parent_id, tree, is_visible, slug } = req.query

    // If slug is provided, return single category
    if (slug && typeof slug === "string") {
      const category = await adminHubService.getCategoryBySlug(slug)
      if (!category) {
        res.status(404).json({
          message: "Category not found",
        })
        return
      }
      res.json({
        category,
        categories: [category], // For consistency
        count: 1,
      })
      return
    }

    // If tree=true, return tree structure
    if (tree === "true") {
      const filters: any = {}
      if (is_visible !== undefined) {
        filters.is_visible = is_visible === "true"
      }
      const categoryTree = await adminHubService.getCategoryTree(filters)
      res.json({
        tree: categoryTree,
        count: categoryTree.length,
      })
      return
    }

    // Otherwise return flat list
    const filters: any = {}
    if (active !== undefined) {
      filters.active = active === "true"
    }
    if (parent_id !== undefined) {
      filters.parent_id = parent_id === "null" ? null : parent_id as string
    }

    const categories = await adminHubService.listCategories(filters)

    res.json({
      categories,
      count: categories.length,
    })
  } catch (error) {
    console.error("Admin Hub Categories GET error:", error)
    res.status(500).json({
      message: error.message || "Internal server error",
    })
  }
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
