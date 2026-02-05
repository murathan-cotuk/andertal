/**
 * Admin Hub Banners API
 * 
 * GET /admin-hub/banners - Banner'ları listele
 * POST /admin-hub/banners - Yeni banner oluştur
 */

import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import AdminHubService from "../../../services/admin-hub-service"

export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  try {
    const adminHubService: AdminHubService = req.scope.resolve("adminHubService")
    const { active, position } = req.query

    const filters: any = {}
    if (active !== undefined) {
      filters.active = active === "true"
    }
    if (position) {
      filters.position = position as string
    }

    const banners = await adminHubService.listBanners(filters)

    res.json({
      banners,
      count: banners.length,
    })
  } catch (error) {
    console.error("Admin Hub Banners GET error:", error)
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
    const { title, image_url, link, position, active, sort_order, start_date, end_date, metadata } = req.body

    if (!title || !image_url) {
      res.status(400).json({
        message: "title ve image_url zorunludur",
      })
      return
    }

    const banner = await adminHubService.createBanner({
      title,
      image_url,
      link: link || null,
      position: position || "home",
      active: active !== undefined ? active : true,
      sort_order: sort_order || 0,
      start_date: start_date ? new Date(start_date) : null,
      end_date: end_date ? new Date(end_date) : null,
      metadata,
    })

    res.status(201).json({ banner })
  } catch (error) {
    console.error("Admin Hub Banners POST error:", error)
    res.status(500).json({
      message: error.message || "Internal server error",
    })
  }
}
