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

      const existingMeta = product.metadata && typeof product.metadata === 'object' ? product.metadata : {}
      const result = await verifyEuOriginForProduct({
        dbQ,
        productId: product.id,
        existingMeta,
        isSuperuser,
        manual,
        verifiedBy: sellerId,
        providerId: req.body?.provider || existingMeta.eu_origin_provider,
        pendingQueueId: req.body?.pending_queue_id || null,
      })

      const updated = await updateAdminHubProductDb(product.id, { metadata: result.metadata })
      if (!updated) return res.status(500).json({ message: 'Failed to update product' })
      if (updated.__error) return res.status(400).json({ message: updated.__error })

      res.json({
        ok: result.ok,
        pending: Boolean(result.pending),
        status: result.status,
        mode: result.mode,
        provider: result.provider,
        message: result.message,
        product: updated,
        eu_origin: pickEuOriginFields(updated.metadata),
      })
    } catch (err) {
      res.status(500).json({ message: err?.message || 'Internal server error' })
    }
  })
}

module.exports = { registerEuOriginRoutes }
