const { verifyEuOriginForProduct } = require('./verify')
const { listEuOriginPending } = require('./queue')
const { listEuOriginProviders } = require('./providers')
const { pickEuOriginFields } = require('./metadata')

function registerEuOriginRoutes(httpApp, deps) {
  const {
    requireSellerAuth,
    requireSuperuser,
    verifySellerToken,
    getAdminHubProductByIdOrHandleDb,
    updateAdminHubProductDb,
    getDbQ,
  } = deps

  httpApp.get('/admin-hub/eu-origin/providers', requireSellerAuth, (req, res) => {
    res.json({ providers: listEuOriginProviders() })
  })

  httpApp.get('/admin-hub/eu-origin/pending', requireSellerAuth, requireSuperuser, async (req, res) => {
    try {
      const dbQ = getDbQ()
      if (!dbQ) return res.status(503).json({ message: 'Database not configured' })
      const status = req.query.status ? String(req.query.status) : 'pending'
      const items = await listEuOriginPending(dbQ, { status, limit: req.query.limit })
      res.json({ items, count: items.length })
    } catch (err) {
      res.status(500).json({ message: err?.message || 'Internal server error' })
    }
  })

  httpApp.post('/admin-hub/products/:id/eu-origin/verify', requireSellerAuth, async (req, res) => {
    try {
      const auth = req.headers.authorization || ''
      const token = auth.startsWith('Bearer ') ? auth.slice(7) : null
      const sellerPayload = token ? verifySellerToken(token) : null
      const isSuperuser = sellerPayload?.is_superuser === true
      const sellerId = sellerPayload?.seller_id ? String(sellerPayload.seller_id) : null
      const manual = req.body?.manual === true || req.body?.mode === 'manual'

      if (manual && !isSuperuser) {
        return res.status(403).json({ message: 'Only superusers may manually verify EU origin' })
      }

      const product = await getAdminHubProductByIdOrHandleDb(req.params.id)
      if (!product) return res.status(404).json({ message: 'Product not found' })

      const dbQ = getDbQ()
      if (!dbQ) return res.status(503).json({ message: 'Database not configured' })

      // Each variant is its own product for compliance purposes — when the caller passes
      // variant_option_values, verify/update that variant's own metadata instead of the
      // parent's, leaving every sibling variant and the parent's own metadata untouched.
      const variantOptionValues = Array.isArray(req.body?.variant_option_values) ? req.body.variant_option_values : null
      let variantIndex = -1
      if (variantOptionValues) {
        const key = JSON.stringify(variantOptionValues)
        const variants = Array.isArray(product.variants) ? product.variants : []
        variantIndex = variants.findIndex((v) => Array.isArray(v?.option_values) && JSON.stringify(v.option_values) === key)
        if (variantIndex < 0) return res.status(404).json({ message: 'Variant not found' })
      }

      const existingMeta = variantIndex >= 0
        ? (product.variants[variantIndex].metadata && typeof product.variants[variantIndex].metadata === 'object' ? product.variants[variantIndex].metadata : {})
        : (product.metadata && typeof product.metadata === 'object' ? product.metadata : {})

      const result = await verifyEuOriginForProduct({
        dbQ,
        productId: product.id,
        existingMeta,
        isSuperuser,
        manual,
        verifiedBy: sellerId,
        providerId: req.body?.provider || existingMeta.eu_origin_provider,
        pendingQueueId: req.body?.pending_queue_id || null,
        variantLabel: variantIndex >= 0 ? `variant: ${variantOptionValues.join(' / ')}` : null,
      })

      let updated
      if (variantIndex >= 0) {
        const nextVariants = product.variants.map((v, i) => (i === variantIndex ? { ...v, metadata: result.metadata } : v))
        updated = await updateAdminHubProductDb(product.id, { variants: nextVariants })
      } else {
        updated = await updateAdminHubProductDb(product.id, { metadata: result.metadata })
      }
      if (!updated) return res.status(500).json({ message: 'Failed to update product' })
      if (updated.__error) return res.status(400).json({ message: updated.__error })

      const updatedVariantMeta = variantIndex >= 0 && Array.isArray(updated.variants)
        ? (updated.variants[variantIndex]?.metadata || {})
        : null

      res.json({
        ok: result.ok,
        pending: Boolean(result.pending),
        status: result.status,
        mode: result.mode,
        provider: result.provider,
        message: result.message,
        product: updated,
        eu_origin: pickEuOriginFields(updatedVariantMeta || updated.metadata),
      })
    } catch (err) {
      res.status(500).json({ message: err?.message || 'Internal server error' })
    }
  })
}

module.exports = { registerEuOriginRoutes }
