'use strict'
const { Router } = require('express')

module.exports = function createSellerCardRouter({
  getSellerDbClient,
  loadPlatformCheckoutRow,
  resolveStripeSecretKeyFromPlatform,
  requireSuperuser,
}) {
  const loadPlatformCheckoutRowFresh = async () => {
    const c = getSellerDbClient()
    if (!c) return null
    try {
      await c.connect()
      const row = await loadPlatformCheckoutRow(c)
      await c.end()
      return row
    } catch (_) {
      try { await c.end() } catch (_2) {}
      return null
    }
  }

    // ── Seller Credit Card Routes ─────────────────────────────────────────────

    /** GET /admin-hub/v1/stripe-publishable-key — returns Stripe publishable key for card form */
  const router = Router()

  router.get('/admin-hub/v1/stripe-publishable-key', async (req, res) => {
      try {
        const platformRow = await loadPlatformCheckoutRowFresh()
        const pk = (platformRow?.stripe_publishable_key || '').toString().trim()
        res.json({ publishable_key: pk || null })
      } catch (e) {
        res.status(500).json({ message: e.message || 'Error' })
      }
    })

    /** POST /admin-hub/v1/seller/card/setup-intent — creates Stripe SetupIntent for saving a card */
  router.post('/admin-hub/v1/seller/card/setup-intent', async (req, res) => {
      const userId = req.sellerUser?.id
      const email = req.sellerUser?.email
      if (!userId) return res.status(401).json({ message: 'Unauthorized' })
      const platformRow = await loadPlatformCheckoutRowFresh()
      const secretKey = resolveStripeSecretKeyFromPlatform(platformRow)
      if (!secretKey) return res.status(503).json({ message: 'Stripe nicht konfiguriert' })
      const stripe = new (require('stripe'))(secretKey)
      const client = getSellerDbClient()
      if (!client) return res.status(503).json({ message: 'Database not configured' })
      try {
        await client.connect()
        const row = await client.query(`SELECT stripe_customer_id FROM seller_users WHERE id = $1`, [userId])
        let customerId = row.rows?.[0]?.stripe_customer_id || null
        if (!customerId) {
          const customer = await stripe.customers.create({ email, metadata: { seller_user_id: userId } })
          customerId = customer.id
          await client.query(`UPDATE seller_users SET stripe_customer_id = $1, updated_at = now() WHERE id = $2`, [customerId, userId])
        }
        const si = await stripe.setupIntents.create({ customer: customerId, usage: 'off_session' })
        await client.end()
        res.json({ client_secret: si.client_secret })
      } catch (e) {
        try { await client.end() } catch (_) {}
        res.status(500).json({ message: e.message || 'Setup intent failed' })
      }
    })

    /** POST /admin-hub/v1/seller/card/confirm — saves PM details after Stripe.js setup */
  router.post('/admin-hub/v1/seller/card/confirm', async (req, res) => {
      const userId = req.sellerUser?.id
      const { payment_method_id } = req.body || {}
      if (!userId) return res.status(401).json({ message: 'Unauthorized' })
      if (!payment_method_id) return res.status(400).json({ message: 'payment_method_id required' })
      const platformRow = await loadPlatformCheckoutRowFresh()
      const secretKey = resolveStripeSecretKeyFromPlatform(platformRow)
      if (!secretKey) return res.status(503).json({ message: 'Stripe nicht konfiguriert' })
      const stripe = new (require('stripe'))(secretKey)
      const client = getSellerDbClient()
      if (!client) return res.status(503).json({ message: 'Database not configured' })
      try {
        await client.connect()
        const pm = await stripe.paymentMethods.retrieve(payment_method_id)
        const card = pm.card || {}
        const existing = await client.query(`SELECT stripe_payment_method_id FROM seller_users WHERE id = $1`, [userId])
        const oldPmId = existing.rows?.[0]?.stripe_payment_method_id
        if (oldPmId && oldPmId !== payment_method_id) {
          try { await stripe.paymentMethods.detach(oldPmId) } catch (_) {}
        }
        await client.query(
          `UPDATE seller_users SET stripe_payment_method_id = $1, stripe_card_last4 = $2, stripe_card_brand = $3, stripe_card_exp_month = $4, stripe_card_exp_year = $5, updated_at = now() WHERE id = $6`,
          [payment_method_id, card.last4 || null, card.brand || null, card.exp_month || null, card.exp_year || null, userId]
        )
        await client.end()
        res.json({ ok: true, last4: card.last4, brand: card.brand, exp_month: card.exp_month, exp_year: card.exp_year })
      } catch (e) {
        try { await client.end() } catch (_) {}
        res.status(500).json({ message: e.message || 'Confirm failed' })
      }
    })

    /** GET /admin-hub/v1/seller/card — returns current saved card info (masked) */
  router.get('/admin-hub/v1/seller/card', async (req, res) => {
      const userId = req.sellerUser?.id
      if (!userId) return res.status(401).json({ message: 'Unauthorized' })
      const client = getSellerDbClient()
      if (!client) return res.status(503).json({ message: 'Database not configured' })
      try {
        await client.connect()
        const row = await client.query(
          `SELECT stripe_payment_method_id, stripe_card_last4, stripe_card_brand, stripe_card_exp_month, stripe_card_exp_year FROM seller_users WHERE id = $1`,
          [userId]
        )
        await client.end()
        const r = row.rows?.[0] || {}
        res.json({
          has_card: !!r.stripe_payment_method_id,
          last4: r.stripe_card_last4 || null,
          brand: r.stripe_card_brand || null,
          exp_month: r.stripe_card_exp_month || null,
          exp_year: r.stripe_card_exp_year || null,
        })
      } catch (e) {
        try { await client.end() } catch (_) {}
        res.status(500).json({ message: e.message || 'Error' })
      }
    })

    /** DELETE /admin-hub/v1/seller/card — detaches and removes saved card */
  router.delete('/admin-hub/v1/seller/card', async (req, res) => {
      const userId = req.sellerUser?.id
      if (!userId) return res.status(401).json({ message: 'Unauthorized' })
      const platformRow = await loadPlatformCheckoutRowFresh()
      const secretKey = resolveStripeSecretKeyFromPlatform(platformRow)
      const client = getSellerDbClient()
      if (!client) return res.status(503).json({ message: 'Database not configured' })
      try {
        await client.connect()
        const row = await client.query(`SELECT stripe_payment_method_id FROM seller_users WHERE id = $1`, [userId])
        const pmId = row.rows?.[0]?.stripe_payment_method_id
        if (pmId && secretKey) {
          const stripe = new (require('stripe'))(secretKey)
          try { await stripe.paymentMethods.detach(pmId) } catch (_) {}
        }
        await client.query(
          `UPDATE seller_users SET stripe_payment_method_id = NULL, stripe_card_last4 = NULL, stripe_card_brand = NULL, stripe_card_exp_month = NULL, stripe_card_exp_year = NULL, updated_at = now() WHERE id = $1`,
          [userId]
        )
        await client.end()
        res.json({ ok: true })
      } catch (e) {
        try { await client.end() } catch (_) {}
        res.status(500).json({ message: e.message || 'Error' })
      }
    })

    /** GET /admin-hub/v1/sellers/:id/card — superuser: view seller's card */
  router.get('/admin-hub/v1/sellers/:id/card', requireSuperuser, async (req, res) => {
      const sellerId = req.params.id
      const client = getSellerDbClient()
      if (!client) return res.status(503).json({ message: 'Database not configured' })
      try {
        await client.connect()
        const row = await client.query(
          `SELECT stripe_payment_method_id, stripe_card_last4, stripe_card_brand, stripe_card_exp_month, stripe_card_exp_year FROM seller_users WHERE seller_id = $1 ORDER BY created_at LIMIT 1`,
          [sellerId]
        )
        await client.end()
        const r = row.rows?.[0] || {}
        res.json({
          has_card: !!r.stripe_payment_method_id,
          last4: r.stripe_card_last4 || null,
          brand: r.stripe_card_brand || null,
          exp_month: r.stripe_card_exp_month || null,
          exp_year: r.stripe_card_exp_year || null,
        })
      } catch (e) {
        try { await client.end() } catch (_) {}
        res.status(500).json({ message: e.message || 'Error' })
      }
    })

    /** DELETE /admin-hub/v1/sellers/:id/card — superuser: detach and remove seller's card */
  router.delete('/admin-hub/v1/sellers/:id/card', requireSuperuser, async (req, res) => {
      const sellerId = req.params.id
      const platformRow = await loadPlatformCheckoutRowFresh()
      const secretKey = resolveStripeSecretKeyFromPlatform(platformRow)
      const client = getSellerDbClient()
      if (!client) return res.status(503).json({ message: 'Database not configured' })
      try {
        await client.connect()
        const row = await client.query(
          `SELECT id, stripe_payment_method_id FROM seller_users WHERE seller_id = $1 ORDER BY created_at LIMIT 1`,
          [sellerId]
        )
        const r = row.rows?.[0]
        if (!r) { await client.end(); return res.status(404).json({ message: 'Seller not found' }) }
        if (r.stripe_payment_method_id && secretKey) {
          const stripe = new (require('stripe'))(secretKey)
          try { await stripe.paymentMethods.detach(r.stripe_payment_method_id) } catch (_) {}
        }
        await client.query(
          `UPDATE seller_users SET stripe_payment_method_id = NULL, stripe_card_last4 = NULL, stripe_card_brand = NULL, stripe_card_exp_month = NULL, stripe_card_exp_year = NULL, updated_at = now() WHERE id = $1`,
          [r.id]
        )
        await client.end()
        res.json({ ok: true })
      } catch (e) {
        try { await client.end() } catch (_) {}
        res.status(500).json({ message: e.message || 'Error' })
      }
    })

    // ── End Seller Credit Card Routes ─────────────────────────────────────────

  return router
}
