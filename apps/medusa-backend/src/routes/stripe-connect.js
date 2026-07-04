'use strict'
const { Router } = require('express')

module.exports = function createStripeConnectRouter({
  getSellerDbClient,
  loadPlatformCheckoutRow,
  resolveStripeSecretKeyFromPlatform,
  requireSuperuser,
  resolvePlatformApplicationFeeCents,
  resolveSellerDisplayNameForStripe,
  truncateForStripeDescription,
}) {
    // ── Stripe Connect Routes ────────────────────────────────────────────────
    const SELLERCENTRAL_URL = (process.env.SELLERCENTRAL_URL || 'http://localhost:3002').replace(/\/$/, '')

    // Helper: load platform checkout row using a fresh DB connection
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

    /**
     * POST /admin-hub/v1/stripe-connect/onboard
     * Creates (or reuses) a Stripe Express account for the seller and returns
     * an Account Link URL they must visit to complete Stripe's own KYC.
     */
  const router = Router()

  router.post('/admin-hub/v1/stripe-connect/onboard', async (req, res) => {
      const userId = req.sellerUser?.id
      const sellerId = req.sellerUser?.seller_id
      const email = req.sellerUser?.email
      if (!userId) return res.status(401).json({ message: 'Unauthorized' })

      const platformRow = await loadPlatformCheckoutRowFresh()
      const secretKey = resolveStripeSecretKeyFromPlatform(platformRow)
      if (!secretKey) return res.status(503).json({ message: 'Stripe nicht konfiguriert — Sellercentral → Einstellungen → Checkout (Secret Key in DB).' })

      const stripe = new (require('stripe'))(secretKey)
      const client = getSellerDbClient()
      if (!client) return res.status(503).json({ message: 'Database not configured' })
      try {
        await client.connect()
        const sellerRes = await client.query(
          `SELECT stripe_account_id, stripe_onboarding_complete FROM seller_users WHERE id = $1`, [userId]
        )
        let stripeAccountId = sellerRes.rows?.[0]?.stripe_account_id || null

        // Create Express account if not yet created
        if (!stripeAccountId) {
          const account = await stripe.accounts.create({
            type: 'express',
            email,
            capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
            settings: { payouts: { schedule: { interval: 'manual' } } },
            metadata: { seller_id: sellerId, seller_user_id: userId },
          })
          stripeAccountId = account.id
          await client.query(
            `UPDATE seller_users SET stripe_account_id = $1, updated_at = now() WHERE id = $2`,
            [stripeAccountId, userId]
          )
        }

        // Create (or refresh) an Account Link for onboarding
        const accountLink = await stripe.accountLinks.create({
          account: stripeAccountId,
          refresh_url: `${SELLERCENTRAL_URL}/en/settings/stripe-connect?refresh=true`,
          return_url: `${SELLERCENTRAL_URL}/en/settings/stripe-connect?connected=true`,
          type: 'account_onboarding',
        })

        await client.end()
        res.json({ url: accountLink.url, stripe_account_id: stripeAccountId })
      } catch (e) {
        try { await client.end() } catch (_) {}
        console.error('[stripe-connect/onboard]', e.message)
        res.status(500).json({ message: e.message || 'Stripe Connect onboarding failed' })
      }
    })

    /**
     * GET /admin-hub/v1/stripe-connect/status
     * Returns current Connect status for the logged-in seller.
     * Also syncs onboarding_complete from Stripe if account exists.
     */
  router.get('/admin-hub/v1/stripe-connect/status', async (req, res) => {
      const userId = req.sellerUser?.id
      if (!userId) return res.status(401).json({ message: 'Unauthorized' })

      const client = getSellerDbClient()
      if (!client) return res.status(503).json({ message: 'Database not configured' })
      try {
        await client.connect()
        const sellerRes = await client.query(
          `SELECT stripe_account_id, stripe_onboarding_complete, commission_rate FROM seller_users WHERE id = $1`, [userId]
        )
        const row = sellerRes.rows?.[0] || {}
        let onboardingComplete = row.stripe_onboarding_complete || false
        const stripeAccountId = row.stripe_account_id || null

        let payoutBank = null
        // Sync from Stripe if account exists (and also expose payout destination summary)
        if (stripeAccountId && !onboardingComplete) {
          try {
            const platformRow = await loadPlatformCheckoutRowFresh()
            const secretKey = resolveStripeSecretKeyFromPlatform(platformRow)
            if (secretKey) {
              const stripe = new (require('stripe'))(secretKey)
              const account = await stripe.accounts.retrieve(stripeAccountId)
              onboardingComplete = account.details_submitted && account.charges_enabled
              // Ensure manual payout schedule (idempotent — safe to call multiple times)
              if (onboardingComplete) {
                try {
                  await stripe.accounts.update(stripeAccountId, { settings: { payouts: { schedule: { interval: 'manual' } } } })
                } catch (_) {}
              }
              try {
                const ext = await stripe.accounts.listExternalAccounts(stripeAccountId, { object: 'bank_account', limit: 1 })
                const bank = ext?.data?.[0]
                if (bank) {
                  payoutBank = {
                    bank_name: bank.bank_name || null,
                    country: bank.country || null,
                    currency: bank.currency || null,
                    last4: bank.last4 || null,
                    holder_name: bank.account_holder_name || null,
                    status: bank.status || null,
                  }
                }
              } catch (_) {}
              if (onboardingComplete) {
                await client.query(
                  `UPDATE seller_users SET stripe_onboarding_complete = true, updated_at = now() WHERE id = $1`, [userId]
                )
              }
            }
          } catch (_) {}
        } else if (stripeAccountId) {
          try {
            const platformRow = await loadPlatformCheckoutRowFresh()
            const secretKey = resolveStripeSecretKeyFromPlatform(platformRow)
            if (secretKey) {
              const stripe = new (require('stripe'))(secretKey)
              const ext = await stripe.accounts.listExternalAccounts(stripeAccountId, { object: 'bank_account', limit: 1 })
              const bank = ext?.data?.[0]
              if (bank) {
                payoutBank = {
                  bank_name: bank.bank_name || null,
                  country: bank.country || null,
                  currency: bank.currency || null,
                  last4: bank.last4 || null,
                  holder_name: bank.account_holder_name || null,
                  status: bank.status || null,
                }
              }
            }
          } catch (_) {}
        }

        await client.end()
        res.json({
          connected: !!stripeAccountId,
          onboarding_complete: onboardingComplete,
          stripe_account_id: stripeAccountId,
          commission_rate: Number(row.commission_rate ?? 0.12),
          payout_bank: payoutBank,
        })
      } catch (e) {
        try { await client.end() } catch (_) {}
        res.status(500).json({ message: e.message || 'Error' })
      }
    })

    /**
     * GET /admin-hub/v1/stripe-connect/dashboard-link
     * Returns a one-time Stripe Express dashboard URL so sellers can check their balance/payouts.
     */
  router.get('/admin-hub/v1/stripe-connect/dashboard-link', async (req, res) => {
      const userId = req.sellerUser?.id
      if (!userId) return res.status(401).json({ message: 'Unauthorized' })

      const client = getSellerDbClient()
      if (!client) return res.status(503).json({ message: 'Database not configured' })
      try {
        await client.connect()
        const sellerRes = await client.query(`SELECT stripe_account_id FROM seller_users WHERE id = $1`, [userId])
        const stripeAccountId = sellerRes.rows?.[0]?.stripe_account_id
        await client.end()

        if (!stripeAccountId) return res.status(404).json({ message: 'No Stripe account connected yet.' })

        const platformRow = await loadPlatformCheckoutRowFresh()
        const secretKey = resolveStripeSecretKeyFromPlatform(platformRow)
        if (!secretKey) return res.status(503).json({ message: 'Stripe not configured' })

        const stripe = new (require('stripe'))(secretKey)
        const loginLink = await stripe.accounts.createLoginLink(stripeAccountId)
        res.json({ url: loginLink.url })
      } catch (e) {
        try { await client.end() } catch (_) {}
        res.status(500).json({ message: e.message || 'Error' })
      }
    })

    /**
     * POST /admin-hub/v1/stripe-connect/disconnect
     * Superuser only — removes Connect linkage from a seller (does NOT delete Stripe account).
     */
  router.post('/admin-hub/v1/stripe-connect/disconnect', async (req, res) => {
      if (!req.sellerUser?.is_superuser) return res.status(403).json({ message: 'Superuser access required' })
      const { seller_id } = req.body || {}
      if (!seller_id) return res.status(400).json({ message: 'seller_id required' })
      const client = getSellerDbClient()
      if (!client) return res.status(503).json({ message: 'Database not configured' })
      try {
        await client.connect()
        await client.query(
          `UPDATE seller_users SET stripe_account_id = NULL, stripe_onboarding_complete = false, updated_at = now() WHERE seller_id = $1`,
          [seller_id]
        )
        await client.end()
        res.json({ success: true })
      } catch (e) {
        try { await client.end() } catch (_) {}
        res.status(500).json({ message: e.message || 'Error' })
      }
    })
    /**
     * POST /admin-hub/v1/stripe-connect/transfer/:orderId
     * Superuser — manually release funds for a specific order, bypassing the 14-day window.
     * Handles both models:
     *  - Destination charge (new): creates a payout from the connected account
     *  - Legacy transfer: creates a platform→seller transfer via source_transaction
     */
  router.post('/admin-hub/v1/stripe-connect/transfer/:orderId', requireSuperuser, async (req, res) => {
      const orderId = (req.params.orderId || '').trim()
      if (!orderId) return res.status(400).json({ message: 'orderId required' })

      const platformRow = await loadPlatformCheckoutRowFresh()
      const secretKey = resolveStripeSecretKeyFromPlatform(platformRow)
      if (!secretKey) return res.status(503).json({ message: 'Stripe not configured' })

      const { Client } = require('pg')
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      const client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
      try {
        await client.connect()
        const oRes = await client.query(
          `SELECT id, order_number, seller_id, payment_intent_id, subtotal_cents, total_cents, cart_id,
                  stripe_transfer_status, stripe_payout_status, stripe_account_id, stripe_application_fee_cents
           FROM store_orders WHERE id = $1::uuid`,
          [orderId]
        )
        const order = oRes.rows[0]
        if (!order) { await client.end(); return res.status(404).json({ message: 'Order not found' }) }
        if (order.stripe_payout_status === 'paid') { await client.end(); return res.status(400).json({ message: 'Payout already completed' }) }
        if (order.stripe_transfer_status === 'completed') { await client.end(); return res.status(400).json({ message: 'Transfer already completed' }) }

        const stripe = new (require('stripe'))(secretKey)

        if (order.stripe_account_id) {
          // ── Destination charge model: create payout on connected account ───
          const sRateRow = await client.query(
            'SELECT commission_rate FROM seller_users WHERE seller_id = $1 LIMIT 1',
            [order.seller_id],
          )
          const commRt = Number(sRateRow.rows?.[0]?.commission_rate ?? 0.12)
          const totalCents = Number(order.total_cents || 0)
          const feeCents = resolvePlatformApplicationFeeCents(order, commRt)
          const payoutAmount = Math.max(0, totalCents - feeCents)
          if (payoutAmount <= 0) { await client.end(); return res.status(400).json({ message: 'Payout amount <= 0' }) }

          const payout = await stripe.payouts.create(
            {
              amount: payoutAmount,
              currency: 'eur',
              description: `Manual release — Order #${order.order_number || ''}`,
              metadata: { order_id: orderId, order_number: String(order.order_number || ''), seller_id: order.seller_id, manual: 'true' },
            },
            { stripeAccount: order.stripe_account_id }
          )
          await client.query(
            `UPDATE store_orders SET stripe_payout_status='paid', stripe_payout_id=$2, updated_at=now() WHERE id=$1::uuid`,
            [orderId, payout.id]
          )
          await client.end()
          res.json({ success: true, model: 'payout', payout_id: payout.id, amount: payoutAmount })

        } else {
          // ── Legacy model: platform → seller transfer ───────────────────────
          if (!order.payment_intent_id) { await client.end(); return res.status(400).json({ message: 'No payment intent on order' }) }

          const sRes = await client.query(
            `SELECT stripe_account_id, stripe_onboarding_complete, commission_rate FROM seller_users WHERE seller_id = $1`,
            [order.seller_id]
          )
          const seller = sRes.rows[0]
          if (!seller?.stripe_account_id || !seller?.stripe_onboarding_complete) {
            await client.end()
            return res.status(400).json({ message: 'Seller Stripe onboarding incomplete' })
          }

          const pi = await stripe.paymentIntents.retrieve(String(order.payment_intent_id), { expand: ['latest_charge'] })
          const chargeId = typeof pi.latest_charge === 'object' ? pi.latest_charge?.id : pi.latest_charge
          if (!chargeId) { await client.end(); return res.status(400).json({ message: 'No charge on payment intent' }) }

          const commRate = Number(seller.commission_rate ?? 0.12)
          const transferAmount = Math.floor(Number(order.subtotal_cents || 0) * (1 - commRate))
          if (transferAmount <= 0) { await client.end(); return res.status(400).json({ message: 'Transfer amount <= 0' }) }

          const sellerDisplay = await resolveSellerDisplayNameForStripe(client, order.seller_id)
          const tr = await stripe.transfers.create({
            amount: transferAmount,
            currency: 'eur',
            destination: seller.stripe_account_id,
            source_transaction: chargeId,
            transfer_group: `cart_${order.cart_id || ''}`,
            description: `Manual: Order #${order.order_number || ''} — ${truncateForStripeDescription(sellerDisplay) || order.seller_id}`,
            metadata: { order_id: orderId, order_number: String(order.order_number || ''), seller_id: order.seller_id, manual: 'true' },
          })
          await client.query(
            `UPDATE store_orders SET stripe_transfer_status='completed', stripe_transfer_id=$2, stripe_transfer_error=NULL, stripe_transfer_at=now(), updated_at=now() WHERE id=$1::uuid`,
            [orderId, tr.id]
          )
          await client.end()
          res.json({ success: true, model: 'transfer', transfer_id: tr.id, amount: transferAmount })
        }
      } catch (e) {
        try { await client.end() } catch (_) {}
        res.status(500).json({ message: e.message || 'Payout/transfer failed' })
      }
    })
    // ── End Stripe Connect Routes ────────────────────────────────────────────

  return router
}
