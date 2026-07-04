'use strict'
const { Router } = require('express')

module.exports = function createSavedPaymentMethodsRouter({
  loadPlatformCheckoutRow,
  resolveStripeSecretKeyFromPlatform,
  verifyCustomerToken,
}) {
    // ── Saved payment methods ────────────────────────────────────────────
    const getOrCreateStripeCustomer = async (client, customerId, email) => {
      const platformRow = await loadPlatformCheckoutRow(client)
      const secretKey = resolveStripeSecretKeyFromPlatform(platformRow)
      if (!secretKey) throw new Error('Stripe secret key not configured in Sellercentral settings')
      const stripe = new (require('stripe'))(secretKey)
      const row = await client.query('SELECT stripe_customer_id FROM store_customers WHERE id = $1::uuid', [customerId])
      let stripeCustomerId = row.rows[0]?.stripe_customer_id
      if (stripeCustomerId) {
        try {
          await stripe.customers.retrieve(stripeCustomerId)
        } catch (stripeErr) {
          const code = stripeErr && stripeErr.code
          const param = stripeErr && stripeErr.param
          const errMsg = String((stripeErr && stripeErr.message) || '')
          const noSuchCustomer =
            (code === 'resource_missing' && param === 'customer') ||
            /\bno such customer\b/i.test(errMsg)
          if (noSuchCustomer) {
            await client.query('UPDATE store_customers SET stripe_customer_id = NULL WHERE id = $1::uuid', [customerId])
            stripeCustomerId = null
          } else {
            throw stripeErr
          }
        }
      }
      if (!stripeCustomerId) {
        const sc = await stripe.customers.create({ email, metadata: { andertal_customer_id: customerId } })
        stripeCustomerId = sc.id
        await client.query('UPDATE store_customers SET stripe_customer_id = $1 WHERE id = $2::uuid', [stripeCustomerId, customerId])
      }
      return { stripe, stripeCustomerId }
    }

    const storePaymentMethodsGET = async (req, res) => {
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      const token = (req.headers.authorization || '').replace('Bearer ', '').trim()
      if (!token) return res.status(401).json({ message: 'Unauthorized' })
      const payload = verifyCustomerToken(token)
      if (!payload?.id) return res.status(401).json({ message: 'Invalid token' })
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        const { stripe, stripeCustomerId } = await getOrCreateStripeCustomer(client, payload.id, payload.email)
        const pms = await stripe.paymentMethods.list({ customer: stripeCustomerId, type: 'card' })
        await client.end()
        res.json({ payment_methods: pms.data })
      } catch (e) {
        if (client) try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    const storePaymentMethodsSetupPOST = async (req, res) => {
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      const token = (req.headers.authorization || '').replace('Bearer ', '').trim()
      if (!token) return res.status(401).json({ message: 'Unauthorized' })
      const payload = verifyCustomerToken(token)
      if (!payload?.id) return res.status(401).json({ message: 'Invalid token' })
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        const { stripe, stripeCustomerId } = await getOrCreateStripeCustomer(client, payload.id, payload.email)
        const setupIntent = await stripe.setupIntents.create({
          customer: stripeCustomerId,
          automatic_payment_methods: { enabled: true },
        })
        await client.end()
        res.json({ client_secret: setupIntent.client_secret })
      } catch (e) {
        if (client) try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    const storePaymentMethodsDELETE = async (req, res) => {
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      const token = (req.headers.authorization || '').replace('Bearer ', '').trim()
      if (!token) return res.status(401).json({ message: 'Unauthorized' })
      const payload = verifyCustomerToken(token)
      if (!payload?.id) return res.status(401).json({ message: 'Invalid token' })
      const pmId = (req.params.pmId || '').trim()
      if (!pmId) return res.status(400).json({ message: 'pmId required' })
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        const { stripe, stripeCustomerId } = await getOrCreateStripeCustomer(client, payload.id, payload.email)
        // Verify PM belongs to this customer
        const pm = await stripe.paymentMethods.retrieve(pmId)
        if (pm.customer !== stripeCustomerId) { await client.end(); return res.status(403).json({ message: 'Forbidden' }) }
        await stripe.paymentMethods.detach(pmId)
        await client.end()
        res.json({ success: true })
      } catch (e) {
        if (client) try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }
    // ────────────────────────────────────────────────────────────────────

  const router = Router()
  router.get('/store/payment-methods', storePaymentMethodsGET)
  router.post('/store/payment-methods/setup', storePaymentMethodsSetupPOST)
  router.delete('/store/payment-methods/:pmId', storePaymentMethodsDELETE)

  return router
}
