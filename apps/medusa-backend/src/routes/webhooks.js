'use strict'
const { Router } = require('express')

const { chargeReturnLabelOnCarrierMovement } = require('../return-label')

module.exports = function createWebhooksRouter({
  getSellerDbClient,
  loadPlatformCheckoutRow,
  resolveStripeSecretKeyFromPlatform,
}) {
  const getDbClient = () => {
    const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
    if (!dbUrl || !dbUrl.startsWith('postgres')) return null
    const { Client } = require('pg')
    const isRender = dbUrl.includes('render.com')
    return new Client({ connectionString: dbUrl, ssl: isRender ? { rejectUnauthorized: false } : false })
  }

    // loadPlatformCheckoutRowFresh is also used below by the Sendcloud/Stripe webhook handlers.
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

    // ── Sendcloud Webhook ────────────────────────────────────────────────────
    // Maps Sendcloud parcel status IDs to internal delivery statuses
    function mapSendcloudStatus(statusId) {
      // https://support.sendcloud.com/hc/en-us/articles/360024967051
      const id = Number(statusId)
      if ([11, 12, 22, 26].includes(id)) return 'zugestellt'      // Delivered / at pickup point
      if ([15, 29].includes(id)) return 'exception'                 // Exception / error
      if ([31, 32, 33].includes(id)) return 'retour'               // Return
      if ([8, 24].includes(id)) return 'in_transit'                // Out for delivery
      if ([1, 2, 3, 4, 5, 6, 7, 13, 21, 23, 25].includes(id)) return 'versendet'
      return 'in_transit'
    }

  const router = Router()

  router.post('/webhook/sendcloud', async (req, res) => {
      // Sendcloud sends JSON — no raw body signature needed unless SENDCLOUD_WEBHOOK_SECRET is set
      const secret = process.env.SENDCLOUD_WEBHOOK_SECRET
      if (secret) {
        const _c = require('crypto')
        const given = req.headers['sendcloud-signature'] || req.headers['x-sendcloud-signature'] || ''
        const expected = _c.createHmac('sha256', secret).update(JSON.stringify(req.body)).digest('hex')
        if (given !== expected) return res.status(401).json({ message: 'Invalid signature' })
      }
      res.json({ received: true }) // ack immediately
      try {
        const payload = req.body || {}
        const action = payload.action || ''
        if (action !== 'parcel_status_changed') return
        const parcel = payload.parcel || {}
        const trackingNumber = String(parcel.tracking_number || parcel.awb_number || '').trim()
        const statusId = parcel.status?.id ?? parcel.status_id
        if (!trackingNumber || statusId == null) return
        const internalStatus = mapSendcloudStatus(statusId)
        const statusMessage = parcel.status?.message || parcel.status_message || ''
        const location = parcel.carrier_code ? String(parcel.carrier_code).toUpperCase() : null
        const ts = parcel.updated_at ? new Date(parcel.updated_at).toISOString() : new Date().toISOString()
        const client = getDbClient()
        if (!client) return
        await client.connect()
        // Find the order by tracking number
        const orderRes = await client.query(
          `SELECT id, delivery_status FROM store_orders WHERE tracking_number = $1 LIMIT 1`,
          [trackingNumber]
        )
        const order = orderRes.rows[0]
        if (order) {
          // Upsert shipment event
          const exists = await client.query(
            `SELECT id FROM store_shipment_events WHERE order_id=$1::uuid AND status=$2 AND event_time=$3::timestamptz LIMIT 1`,
            [order.id, internalStatus, ts]
          )
          if (!exists.rows.length) {
            await client.query(
              `INSERT INTO store_shipment_events (order_id, status, description, location, event_time, source) VALUES ($1::uuid,$2,$3,$4,$5::timestamptz,'sendcloud')`,
              [order.id, internalStatus, statusMessage || null, location, ts]
            )
          }
          // Update order status
          if (internalStatus === 'zugestellt' && order.delivery_status !== 'zugestellt') {
            await client.query(`UPDATE store_orders SET delivery_status='zugestellt', delivery_date=COALESCE(delivery_date,now()), updated_at=now() WHERE id=$1::uuid`, [order.id])
            await client.query(`UPDATE store_orders SET order_status='abgeschlossen', updated_at=now() WHERE id=$1::uuid AND payment_status='bezahlt' AND delivery_status='zugestellt' AND order_status NOT IN ('abgeschlossen','retoure','retoure_anfrage','refunded','storniert')`, [order.id])
          } else if (internalStatus === 'versendet' || internalStatus === 'in_transit') {
            await client.query(`UPDATE store_orders SET delivery_status='versendet', updated_at=now() WHERE id=$1::uuid AND delivery_status NOT IN ('versendet','zugestellt')`, [order.id])
          }
        } else {
          // Not an outbound order tracking number — check if it's an auto-generated return label.
          // The seller is billed here, not at label creation: the first webhook for a given
          // tracking number is Sendcloud's "label created" event, so we record that status once
          // and only charge when a LATER webhook reports a different status — i.e. the carrier
          // actually scanned/moved the parcel, not merely that we created the label.
          const retRes = await client.query(
            `SELECT id, label_first_status_id, label_charge_status FROM store_returns WHERE label_tracking_number = $1 LIMIT 1`,
            [trackingNumber],
          )
          const ret = retRes.rows[0]
          if (ret) {
            if (ret.label_first_status_id == null) {
              await client.query(`UPDATE store_returns SET label_first_status_id = $1 WHERE id = $2::uuid`, [statusId, ret.id])
            } else if (Number(ret.label_first_status_id) !== Number(statusId) && ret.label_charge_status === 'pending') {
              const platformRow = await loadPlatformCheckoutRowFresh()
              const secretKey = resolveStripeSecretKeyFromPlatform(platformRow)
              if (secretKey) {
                const stripe = new (require('stripe'))(secretKey)
                await chargeReturnLabelOnCarrierMovement(client, { returnId: ret.id, stripe })
              }
            }
          }
        }
        await client.end()
      } catch (_) {}
    })

    // ── Stripe Webhook ───────────────────────────────────────────────────────
    // req.rawBody is the raw Buffer preserved by the express.json() verify callback above.
    // constructEvent MUST receive the raw bytes — parsing to JSON breaks the signature.
  router.post('/webhook/stripe', async (req, res) => {
      const sig = req.headers['stripe-signature']
      const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
      if (!webhookSecret) return res.status(400).json({ message: 'STRIPE_WEBHOOK_SECRET not configured' })

      const rawBody = req.rawBody
      if (!rawBody) return res.status(400).json({ message: 'Raw body missing — verify callback not running' })

      const platformRow = await loadPlatformCheckoutRowFresh()
      const secretKey = resolveStripeSecretKeyFromPlatform(platformRow)
      if (!secretKey) return res.status(400).json({ message: 'Stripe not configured' })

      let event
      try {
        const stripe = new (require('stripe'))(secretKey)
        event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret)
      } catch (err) {
        console.error('[webhook/stripe] Signature verification failed:', err.message)
        return res.status(400).json({ message: `Webhook signature invalid: ${err.message}` })
      }

      // Acknowledge immediately — Stripe retries if it doesn't get 2xx within 30s
      res.json({ received: true })

      setImmediate(async () => {
        const stripe = new (require('stripe'))(secretKey)
        const { Client } = require('pg')
        const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
        const mkClient = () => new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })

        // ── payment_intent.succeeded ──────────────────────────────────────────
        if (event.type === 'payment_intent.succeeded') {
          const pi = event.data.object
          const client = mkClient()
          try {
            await client.connect()
            // For destination charges: ensure stripe_payout_status = 'pending' (idempotent)
            await client.query(
              `UPDATE store_orders
               SET stripe_payout_status = COALESCE(stripe_payout_status, 'pending'),
                   updated_at = now()
               WHERE payment_intent_id = $1
                 AND stripe_account_id IS NOT NULL
                 AND stripe_payout_status IS NULL`,
              [pi.id]
            )
            // For legacy transfer orders: ensure stripe_transfer_status is initialised
            await client.query(
              `UPDATE store_orders
               SET stripe_transfer_status = COALESCE(stripe_transfer_status, 'pending'),
                   updated_at = now()
               WHERE payment_intent_id = $1
                 AND stripe_account_id IS NULL
                 AND (stripe_transfer_status IS NULL OR stripe_transfer_status = 'legacy_skipped')`,
              [pi.id]
            )
            await client.end()
          } catch (e) {
            try { await client.end() } catch (_) {}
            console.error('[webhook/stripe] payment_intent.succeeded error:', e.message)
          }
        }

        // ── checkout.session.completed (campaign budget prepayment) ──────────
        else if (event.type === 'checkout.session.completed') {
          const session = event.data.object
          const meta = session.metadata || {}
          if (meta.type === 'campaign_budget' && meta.campaign_id) {
            const client = mkClient()
            try {
              await client.connect()
              await client.query(
                `UPDATE seller_campaigns SET stripe_charge_id=$1, ad_status='pending', updated_at=now() WHERE id=$2`,
                [session.payment_intent || session.id, meta.campaign_id]
              )
              await client.query(
                `INSERT INTO admin_hub_notifications (type, title, body, seller_id, reference_id)
                 VALUES ('campaign_paid', $1, $2, $3, $4)
                 ON CONFLICT DO NOTHING`,
                [
                  'Kampagne bezahlt',
                  `Budget für Kampagne ${meta.campaign_id} wurde über Stripe beglichen.`,
                  meta.seller_id || null,
                  meta.campaign_id,
                ]
              ).catch(() => {})
              await client.end()
            } catch (e) {
              try { await client.end() } catch (_) {}
              console.error('[webhook/stripe] campaign_budget error:', e.message)
            }
          }
        }

        // ── charge.refunded ───────────────────────────────────────────────────
        else if (event.type === 'charge.refunded') {
          const charge = event.data.object
          const paymentIntentId = charge.payment_intent
          if (!paymentIntentId) return

          const client = mkClient()
          try {
            await client.connect()
            const oRes = await client.query(
              `SELECT id, order_number, stripe_account_id, stripe_payout_status,
                      stripe_transfer_id, stripe_transfer_status
               FROM store_orders WHERE payment_intent_id = $1 LIMIT 1`,
              [paymentIntentId]
            )
            const order = oRes.rows[0]
            if (!order) { await client.end(); return }

            if (order.stripe_account_id) {
              // Destination charge model: mark payout status
              const newStatus = order.stripe_payout_status === 'paid' ? 'refunded_post_payout' : 'refunded'
              await client.query(
                `UPDATE store_orders SET stripe_payout_status = $2, updated_at = now() WHERE id = $1::uuid`,
                [order.id, newStatus]
              )
              if (newStatus === 'refunded_post_payout') {
                console.warn(`[webhook/stripe] Post-payout refund on order #${order.order_number} — manual recovery may be needed`)
              }
            } else if (order.stripe_transfer_id && order.stripe_transfer_status === 'completed') {
              // Legacy transfer model: reverse the transfer
              try {
                const reversal = await stripe.transfers.createReversal(order.stripe_transfer_id, {
                  description: `Refund — order #${order.order_number || order.id}`,
                  metadata: { order_id: order.id, order_number: String(order.order_number || '') },
                })
                await client.query(
                  `UPDATE store_orders SET stripe_transfer_status = 'reversed', stripe_transfer_error = $2, updated_at = now() WHERE id = $1::uuid`,
                  [order.id, `Reversed: ${reversal.id}`]
                )
                console.log(`[webhook/stripe] Transfer reversed for order #${order.order_number}: ${reversal.id}`)
              } catch (re) {
                console.error('[webhook/stripe] Transfer reversal failed:', re.message)
              }
            }
            await client.end()
          } catch (e) {
            try { await client.end() } catch (_) {}
            console.error('[webhook/stripe] charge.refunded error:', e.message)
          }
        }

        // ── payout.paid ───────────────────────────────────────────────────────
        // Fires on the CONNECTED ACCOUNT (account: acct_xxx in event.account), not the platform.
        // Stripe delivers it to the platform webhook if you have Connect webhooks enabled.
        else if (event.type === 'payout.paid') {
          const payout = event.data.object
          const payoutId = payout.id
          const client = mkClient()
          try {
            await client.connect()
            await client.query(
              `UPDATE store_orders
               SET stripe_payout_status = 'paid',
                   stripe_payout_id = $2,
                   updated_at = now()
               WHERE stripe_payout_id = $2 AND stripe_payout_status != 'paid'`,
              [payoutId, payoutId]
            )
            await client.end()
          } catch (e) {
            try { await client.end() } catch (_) {}
            console.error('[webhook/stripe] payout.paid error:', e.message)
          }
        }

        // ── payout.failed ─────────────────────────────────────────────────────
        else if (event.type === 'payout.failed') {
          const payout = event.data.object
          const payoutId = payout.id
          const client = mkClient()
          try {
            await client.connect()
            await client.query(
              `UPDATE store_orders
               SET stripe_payout_status = 'failed',
                   updated_at = now()
               WHERE stripe_payout_id = $1 AND stripe_payout_status NOT IN ('paid', 'refunded')`,
              [payoutId]
            )
            await client.end()
            console.warn(`[webhook/stripe] Payout failed: ${payoutId}`)
          } catch (e) {
            try { await client.end() } catch (_) {}
            console.error('[webhook/stripe] payout.failed error:', e.message)
          }
        }
      })
    })
    // ── End Stripe Webhook ───────────────────────────────────────────────────

  return router
}
