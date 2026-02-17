/**
 * Admin API: Products
 *
 * GET /admin/products - List products
 * POST /admin/products - Create product
 *
 * Medusa v2: productModuleService veya productService ile çözülür.
 */

import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

function getProductService(scope: { resolve: (key: string) => unknown }) {
  try {
    return scope.resolve("productModuleService") as { listAndCount: (f: object, o?: object) => Promise<[unknown[], number]>; create?: (d: unknown) => Promise<unknown[]>; createProducts?: (d: unknown[]) => Promise<unknown[]> }
  } catch {
    return scope.resolve("productService") as { listAndCount: (f: object, o?: object) => Promise<[unknown[], number]>; create?: (d: unknown) => Promise<unknown[]>; createProducts?: (d: unknown[]) => Promise<unknown[]> }
  }
}

export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  try {
    const productService = getProductService(req.scope) as {
      listAndCount: (filter: object, options?: object) => Promise<[unknown[], number]>
    }
    const { limit, offset, ...rest } = req.query as Record<string, string>
    const filter = rest && Object.keys(rest).length ? rest : {}
    const options: { take?: number; skip?: number; relations?: string[] } = {}
    if (limit) options.take = Math.min(parseInt(limit, 10) || 20, 100)
    if (offset) options.skip = parseInt(offset, 10) || 0
    options.relations = ["variants", "variants.prices", "images"]

    const [products, count] = await productService.listAndCount(filter, options)
    res.json({ products, count })
  } catch (error) {
    console.error("Admin products GET error:", error)
    res.status(500).json({
      message: (error as Error).message || "Internal server error",
    })
  }
}

export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  try {
    const body = req.body as Record<string, unknown>
    const productService = getProductService(req.scope) as {
      create: (data: unknown) => Promise<unknown[]>
      createProducts: (data: unknown[]) => Promise<unknown[]>
    }

    // Map common payload to Medusa product shape
    const title = body.title as string
    const handle = (body.handle ?? body.slug ?? title?.toLowerCase?.().replace(/\s+/g, "-").replace(/[^a-z0-9-]/gi, "")) as string
    const description = (body.description as string) || ""
    const status = (body.status as string) || "draft"
    const metadata = (body.metadata as Record<string, unknown>) || {}

    const variantsPayload = Array.isArray(body.variants) ? body.variants : []
    const hasVariants = variantsPayload.length > 0
    const variant = hasVariants
      ? variantsPayload.map((v: Record<string, unknown>) => ({
          title: (v.title as string) || "Default",
          sku: (v.sku as string) || undefined,
          prices: Array.isArray(v.prices)
            ? (v.prices as Array<{ amount: number; currency_code: string }>)
            : typeof v.price === "number"
            ? [{ amount: Math.round((v.price as number) * 100), currency_code: "EUR" }]
            : [{ amount: 0, currency_code: "EUR" }],
          inventory_quantity: typeof v.inventory === "number" ? v.inventory : typeof v.inventory_quantity === "number" ? v.inventory_quantity : 0,
          options: v.options || [],
        }))
      : [
          {
            title: "Default Variant",
            sku: (body.sku as string) || undefined,
            prices: [{ amount: Math.round(((body.price as number) || 0) * 100), currency_code: "EUR" }],
            inventory_quantity: typeof body.inventory === "number" ? body.inventory : 0,
            options: [],
          },
        ]

    const productData = {
      title: title || "Untitled Product",
      handle: handle || `product-${Date.now()}`,
      description,
      status,
      is_giftcard: false,
      images: body.images || [],
      options: body.options || [],
      variants: variant,
      metadata: Object.keys(metadata).length ? metadata : undefined,
    }

    let created: unknown[]
    if (typeof productService.createProducts === "function") {
      created = await productService.createProducts([productData])
    } else if (typeof productService.create === "function") {
      created = (await productService.create(productData)) as unknown[]
    } else {
      res.status(501).json({
        message: "Product creation not available (productService.createProducts/create not found)",
      })
      return
    }

    const product = Array.isArray(created) ? created[0] : created
    if (!product) {
      res.status(500).json({ message: "Product created but no data returned" })
      return
    }
    res.status(201).json({ product })
  } catch (error) {
    console.error("Admin products POST error:", error)
    res.status(500).json({
      message: (error as Error).message || "Internal server error",
    })
  }
}
