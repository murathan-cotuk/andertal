/**
 * Admin API: Regions
 * 
 * POST /admin/regions - Yeni region oluştur
 * GET /admin/regions - Tüm region'ları listele
 */

import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import RegionService from "../../../services/region-service"

export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const regionService: RegionService = req.scope.resolve("regionService")

  const { name, code, currency_code } = req.body

  if (!name || !code || !currency_code) {
    res.status(400).json({
      message: "name, code ve currency_code zorunludur",
    })
    return
  }

  try {
    const region = await regionService.createRegion({
      name,
      code,
      currency_code,
    })

    res.status(201).json({ region })
  } catch (error) {
    console.error("Region API error:", error)
    res.status(500).json({
      message: error.message || "Internal server error",
    })
  }
}

export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const regionService: RegionService = req.scope.resolve("regionService")

  try {
    const regions = await regionService.listRegions()
    res.json({ regions, count: regions.length })
  } catch (error) {
    console.error("Region API error:", error)
    res.status(500).json({
      message: error.message || "Internal server error",
    })
  }
}
