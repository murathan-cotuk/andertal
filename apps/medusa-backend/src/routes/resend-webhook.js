'use strict'
const { Router } = require('express')
const sup = require('../email-suppression')

/**
 * POST /webhooks/resend — Resend delivery feedback. Setup (Resend dashboard → Webhooks):
 * endpoint https://<backend>/webhooks/resend, events email.bounced + email.complained, and the
 * signing secret as RESEND_WEBHOOK_SECRET on the backend. Without the secret every call is refused.
 */
module.exports = function createResendWebhookRouter() {
  const router = Router()
  router.post('/webhooks/resend', async (req, res) => {
    const secret = String(process.env.RESEND_WEBHOOK_SECRET || '').trim()
    if (!secret) return res.status(503).json({ message: 'RESEND_WEBHOOK_SECRET not configured' })
    const ok = sup.verifySvixSignature({
      secret,
      id: req.headers['svix-id'],
      timestamp: req.headers['svix-timestamp'],
      signature: req.headers['svix-signature'],
      rawBody: req.rawBody,
    })
    if (!ok) return res.status(401).json({ message: 'Invalid signature' })
    const evt = req.body || {}
    const type = String(evt.type || '')
    const to = Array.isArray(evt.data?.to) ? evt.data.to : (evt.data?.to ? [evt.data.to] : [])
    if (!['email.bounced', 'email.complained'].includes(type) || !to.length) return res.json({ received: true, ignored: true })
    const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
    const { Client } = require('pg')
    const client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
    try {
      await client.connect()
      await sup.ensureSuppressionSchema(client)
      for (const email of to) {
        if (type === 'email.bounced') {
          // Soft bounces (mailbox full, temporary) are not suppressed.
          const bounceType = String(evt.data?.bounce?.type || evt.data?.bounce_type || '').toLowerCase()
          if (bounceType && !['permanent', 'hard'].includes(bounceType)) continue
          await sup.recordBounce(client, email, String(evt.data?.bounce?.message || '').slice(0, 500) || null)
        } else {
          await sup.recordComplaint(client, email)
        }
      }
      await client.end()
      res.json({ received: true })
    } catch (e) {
      try { await client.end() } catch (_) {}
      console.error('[resend-webhook]', e?.message || e)
      res.status(500).json({ message: 'Error' })
    }
  })
  return router
}
