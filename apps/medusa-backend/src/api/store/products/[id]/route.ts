/**
 * Store API: Single product by id or handle
 *
 * GET /store/products/:idOrHandle
 * Returns { product } for storefront product detail page.
 */

import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const idOrHandle = req.params.id as string
  if (!idOrHandle) {
    res.status(400).json({ message: "Product id or handle required" })
    return
  }

  try {
    const productService = req.scope.resolve("productService") as {
      listAndCount: (filter: object, options?: object) => Promise<[unknown[], number]>
    }

    // Try by id first, then by handle
    const isUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        idOrHandle
      )
    const filter = isUuid ? { id: idOrHandle } : { handle: idOrHandle }

    const [products] = await productService.listAndCount(filter, {
      relations: ["variants", "variants.prices", "images", "collection"],
      take: 1,
    })

    const product = products?.[0]
    if (!product) {
      res.status(404).json({ message: "Product not found" })
      return
    }

    res.json({ product })
  } catch (error) {
    console.error("Store product GET error:", error)
    res.status(500).json({
      message: (error as Error).message || "Internal server error",
    })
  }
}
