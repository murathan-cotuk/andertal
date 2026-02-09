/**
 * Admin API: Single product
 *
 * GET /admin/products/:id - Get product by id or handle
 * PUT /admin/products/:id - Update product
 * DELETE /admin/products/:id - Delete product
 */

import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const id = req.params.id as string
  if (!id) {
    res.status(400).json({ message: "Product id required" })
    return
  }
  try {
    const productService = req.scope.resolve("productService") as {
      listAndCount: (filter: object, options?: object) => Promise<[unknown[], number]>
    }
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
    const filter = isUuid ? { id } : { handle: id }
    const [products] = await productService.listAndCount(filter, {
      take: 1,
      relations: ["variants", "variants.prices", "images", "collection"],
    })
    const product = products?.[0]
    if (!product) {
      res.status(404).json({ message: "Product not found" })
      return
    }
    res.json({ product })
  } catch (error) {
    console.error("Admin product GET error:", error)
    res.status(500).json({
      message: (error as Error).message || "Internal server error",
    })
  }
}

export async function PUT(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const id = req.params.id as string
  if (!id) {
    res.status(400).json({ message: "Product id required" })
    return
  }
  try {
    const productService = req.scope.resolve("productService") as {
      update: (id: string, data: unknown) => Promise<unknown[]>
      updateProducts: (args: { id: string; data: unknown }[]) => Promise<unknown[]>
    }
    const body = req.body as Record<string, unknown>
    const updateData: Record<string, unknown> = {}
    if (body.title !== undefined) updateData.title = body.title
    if (body.handle !== undefined) updateData.handle = body.handle
    if (body.slug !== undefined) updateData.handle = body.slug
    if (body.description !== undefined) updateData.description = body.description
    if (body.status !== undefined) updateData.status = body.status
    if (body.metadata !== undefined) updateData.metadata = body.metadata
    if (body.images !== undefined) updateData.images = body.images
    if (body.options !== undefined) updateData.options = body.options

    let updated: unknown[]
    if (typeof productService.updateProducts === "function") {
      updated = await productService.updateProducts([{ id, data: updateData }])
    } else if (typeof productService.update === "function") {
      updated = (await productService.update(id, updateData)) as unknown[]
    } else {
      res.status(501).json({
        message: "Product update not available",
      })
      return
    }
    const product = Array.isArray(updated) ? updated[0] : updated
    res.json({ product: product ?? updateData })
  } catch (error) {
    console.error("Admin product PUT error:", error)
    res.status(500).json({
      message: (error as Error).message || "Internal server error",
    })
  }
}

export async function DELETE(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const id = req.params.id as string
  if (!id) {
    res.status(400).json({ message: "Product id required" })
    return
  }
  try {
    const productService = req.scope.resolve("productService") as {
      delete: (ids: string[]) => Promise<void>
      deleteProducts: (ids: string[]) => Promise<void>
    }
    if (typeof productService.deleteProducts === "function") {
      await productService.deleteProducts([id])
    } else if (typeof productService.delete === "function") {
      await productService.delete([id])
    } else {
      res.status(501).json({ message: "Product delete not available" })
      return
    }
    res.status(200).json({ id, object: "product", deleted: true })
  } catch (error) {
    console.error("Admin product DELETE error:", error)
    res.status(500).json({
      message: (error as Error).message || "Internal server error",
    })
  }
}
