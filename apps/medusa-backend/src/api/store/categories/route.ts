/**
 * Store API: Public category tree for storefront (Navbar, filters)
 *
 * GET /store/categories?tree=true&is_visible=true
 * CORS: STORE_CORS (shop origin). No auth required.
 */

import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import AdminHubService from "../../../../services/admin-hub-service"

export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  try {
    const adminHubService: AdminHubService = req.scope.resolve("adminHubService")
    const { tree, is_visible, slug } = req.query

    if (slug && typeof slug === "string") {
      const category = await adminHubService.getCategoryBySlug(slug)
      if (!category) {
        res.status(404).json({ message: "Category not found" })
        return
      }
      res.json({
        category,
        categories: [category],
        count: 1,
      })
      return
    }

    if (tree === "true") {
      const filters: { is_visible?: boolean } = {}
      if (is_visible !== undefined) {
        filters.is_visible = is_visible === "true"
      }
      const categoryTree = await adminHubService.getCategoryTree(filters)
      res.json({
        categories: categoryTree,
        tree: categoryTree,
        count: categoryTree.length,
      })
      return
    }

    const filters: any = {}
    if (is_visible !== undefined) {
      filters.is_visible = is_visible === "true"
    }
    const categories = await adminHubService.listCategories(filters)
    res.json({
      categories,
      count: categories.length,
    })
  } catch (error) {
    console.error("Store categories GET error:", error)
    res.status(500).json({
      message: error?.message || "Internal server error",
    })
  }
}
