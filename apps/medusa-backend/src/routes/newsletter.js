'use strict'
const { Router } = require('express')
const crypto = require('crypto')

/* ── helpers ─────────────────────────────────────────────────────────── */

function makeDbClient(dbUrl) {
  const { Client } = require('pg')
  return new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
}

function resolveDbUrl() {
  return (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
}

async function resolveShopBaseForUnsubscribe(client) {
  const envCandidates = [
    process.env.STOREFRONT_PUBLIC_URL,
    process.env.SHOP_PUBLIC_URL,
    process.env.PUBLIC_SHOP_URL,
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.NEXT_PUBLIC_SHOP_URL,
    process.env.SITE_URL,
  ]
  for (const raw of envCandidates) {
    const s = String(raw || '').trim().replace(/\/$/, '')
    if (s && /^https?:\/\//i.test(s)) return s
  }
  if (client) {
    try {
      const r = await client.query(
        `SELECT storefront_url FROM admin_hub_seller_settings WHERE seller_id = 'default' LIMIT 1`,
      )
      const db = String(r.rows[0]?.storefront_url || '').trim().replace(/\/$/, '')
      if (db && /^https?:\/\//i.test(db)) return db
    } catch (_) {}
  }
  return ''
}

/**
 * Generate a one-time unsubscribe token, save to store_newsletter_unsubscribe_tokens,
 * and return the full URL to embed in emails.
 * @param {object} client  – already-connected pg Client
 * @param {string} email
 * @param {string} locale  – e.g. 'de', 'en', 'tr', …
 * @param {string} [baseUrl] – optional absolute shop base (overrides env/DB lookup)
 * @returns {Promise<string>} absolute URL
 */
async function generateUnsubscribeUrl(client, email, locale, baseUrl) {
  const loc = ['de', 'en', 'tr', 'fr', 'it', 'es'].includes(String(locale || '').trim().toLowerCase())
    ? String(locale).trim().toLowerCase()
    : 'de'
  const token = crypto.randomBytes(32).toString('hex')
  await client.query(
    `INSERT INTO store_newsletter_unsubscribe_tokens (token, email, locale, created_at, used)
     VALUES ($1, $2, $3, now(), false)`,
    [token, String(email).trim().toLowerCase(), loc],
  )
  const base = String(baseUrl || '').trim().replace(/\/$/, '') || (await resolveShopBaseForUnsubscribe(client))
  if (!base) {
    console.warn('[newsletter] UNSUBSCRIBE_URL: no storefront base URL — set STOREFRONT_PUBLIC_URL or Plattform storefront_url')
    return ''
  }
  return `${base}/${loc}/newsletter/unsubscribe?token=${token}`
}

/* ── public endpoint: GET /store/newsletter-unsubscribe?token=xxx ─────── */

const storeNewsletterUnsubscribeGET = async (req, res) => {
  const token = String(req.query?.token || '').trim()
  if (!token) return res.status(400).json({ ok: false, message: 'token_missing' })
  const dbUrl = resolveDbUrl()
  const c = makeDbClient(dbUrl)
  try {
    await c.connect()
    const tr = await c.query(
      `SELECT email, locale, used FROM store_newsletter_unsubscribe_tokens WHERE token = $1 LIMIT 1`,
      [token],
    )
    if (!tr.rows.length) {
      await c.end()
      return res.status(404).json({ ok: false, message: 'token_not_found' })
    }
    const { email, locale, used } = tr.rows[0]
    if (used) {
      await c.end()
      return res.json({ ok: true, already: true, email, locale })
    }
    await c.query(
      `UPDATE store_newsletter_subscribers
       SET status = 'unsubscribed', unsubscribed_at = now(), updated_at = now()
       WHERE LOWER(TRIM(email)) = LOWER(TRIM($1))`,
      [email],
    )
    await c.query(
      `UPDATE store_customers
       SET email_marketing_consent = false, updated_at = now()
       WHERE LOWER(TRIM(email)) = LOWER(TRIM($1))`,
      [email],
    ).catch(() => {})
    await c.query(
      `UPDATE store_newsletter_unsubscribe_tokens SET used = true WHERE token = $1`,
      [token],
    )
    await c.end()
    return res.json({ ok: true, already: false, email, locale })
  } catch (e) {
    try { await c.end() } catch (_) {}
    return res.status(500).json({ ok: false, message: e?.message || 'error' })
  }
}

const storeNewsletterSubscribePOST = (dispatchCustomerFlowEvent) => async (req, res) => {
  const { email, source, first_name, last_name, preferred_locale } = req.body || {}
  if (!email || !String(email).includes('@')) return res.status(400).json({ message: 'Valid email required' })
  const allowedSources = new Set(['landing_page', 'register', 'checkout', 'manual'])
  const sourceValue = allowedSources.has(String(source || '').trim()) ? String(source).trim() : 'landing_page'
  const localeRaw = String(preferred_locale || '').trim().toLowerCase()
  const localeValue = ['de', 'en', 'tr', 'fr', 'it', 'es'].includes(localeRaw) ? localeRaw : null
  const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
  const { Client } = require('pg')
  const c = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
  try {
    await c.connect()
    await c.query(
      `INSERT INTO store_newsletter_subscribers (email, source, status, first_name, last_name, preferred_locale, subscribed_at, unsubscribed_at, updated_at)
       VALUES ($1, $2, 'active', $3, $4, $5, now(), NULL, now())
       ON CONFLICT (email) DO UPDATE
       SET source = EXCLUDED.source,
           status = 'active',
           first_name = COALESCE(EXCLUDED.first_name, store_newsletter_subscribers.first_name),
           last_name = COALESCE(EXCLUDED.last_name, store_newsletter_subscribers.last_name),
           preferred_locale = COALESCE(EXCLUDED.preferred_locale, store_newsletter_subscribers.preferred_locale),
           subscribed_at = now(),
           unsubscribed_at = NULL,
           updated_at = now()`,
      [String(email).trim().toLowerCase(), sourceValue, first_name ? String(first_name).trim() : null, last_name ? String(last_name).trim() : null, localeValue]
    )
    await c.query(
      `UPDATE store_customers
       SET email_marketing_consent = true, updated_at = now()
       WHERE LOWER(TRIM(email)) = LOWER(TRIM($1))`,
      [String(email).trim().toLowerCase()]
    ).catch(() => {})
    await c.end()
    res.json({ ok: true })
    void dispatchCustomerFlowEvent('new_subscriber', {
      email: String(email).trim().toLowerCase(),
      locale: localeValue || undefined,
    })
  } catch (e) {
    try { await c.end() } catch (_) {}
    res.status(500).json({ message: e?.message || 'Error' })
  }
}

const storeNewsletterUnsubscribePOST = async (req, res) => {
  const { email } = req.body || {}
  if (!email || !String(email).includes('@')) return res.status(400).json({ message: 'Valid email required' })
  const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
  const { Client } = require('pg')
  const c = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
  try {
    await c.connect()
    await c.query(
      `UPDATE store_newsletter_subscribers
       SET status = 'unsubscribed', unsubscribed_at = now()
       WHERE email = $1`,
      [String(email).trim().toLowerCase()]
    )
    await c.query(
      `UPDATE store_customers
       SET email_marketing_consent = false, updated_at = now()
       WHERE LOWER(TRIM(email)) = LOWER(TRIM($1))`,
      [String(email).trim().toLowerCase()]
    ).catch(() => {})
    await c.end()
    res.json({ ok: true })
  } catch (e) {
    try { await c.end() } catch (_) {}
    res.status(500).json({ message: e?.message || 'Error' })
  }
}

const adminHubNewsletterSubscribersGET = async (req, res) => {
  const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
  const { Client } = require('pg')
  const c = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
  try {
    await c.connect()
    const q = String(req.query?.q || '').trim().toLowerCase()
    const status = String(req.query?.status || '').trim().toLowerCase()
    const where = []
    const vals = []
    if (q) {
      vals.push(`%${q}%`)
      where.push(`(LOWER(email) LIKE $${vals.length} OR LOWER(COALESCE(first_name,'')) LIKE $${vals.length} OR LOWER(COALESCE(last_name,'')) LIKE $${vals.length})`)
    }
    if (['active', 'unsubscribed', 'deactivated'].includes(status)) {
      vals.push(status)
      where.push(`status = $${vals.length}`)
    }
    const sql = `SELECT * FROM store_newsletter_subscribers ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY subscribed_at DESC NULLS LAST LIMIT 500`
    const r = await c.query(sql, vals)
    await c.end()
    res.json({ subscribers: r.rows })
  } catch (e) {
    try { await c.end() } catch (_) {}
    res.json({ subscribers: [] })
  }
}

const adminHubNewsletterSubscribersPOST = async (req, res) => {
  const user = req.sellerUser || {}
  if (String(user.is_superuser || '').toLowerCase() !== 'true' && user.is_superuser !== true) {
    return res.status(403).json({ message: 'Forbidden' })
  }
  const body = req.body || {}
  const email = String(body.email || '').trim().toLowerCase()
  if (!email || !email.includes('@')) return res.status(400).json({ message: 'Valid email required' })
  const status = ['active', 'unsubscribed', 'deactivated'].includes(String(body.status || '').trim()) ? String(body.status).trim() : 'active'
  const localeRaw = String(body.preferred_locale || '').trim().toLowerCase()
  const localeValue = ['de', 'en', 'tr', 'fr', 'it', 'es'].includes(localeRaw) ? localeRaw : null
  const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
  const { Client } = require('pg')
  const c = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
  try {
    await c.connect()
    const r = await c.query(
      `INSERT INTO store_newsletter_subscribers (email, source, status, first_name, last_name, preferred_locale, notes, subscribed_at, unsubscribed_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, now(), CASE WHEN $3 = 'unsubscribed' THEN now() ELSE NULL END, now())
       ON CONFLICT (email) DO UPDATE
       SET source = EXCLUDED.source, status = EXCLUDED.status, first_name = EXCLUDED.first_name, last_name = EXCLUDED.last_name,
           preferred_locale = EXCLUDED.preferred_locale, notes = EXCLUDED.notes, updated_at = now(),
           unsubscribed_at = CASE WHEN EXCLUDED.status = 'unsubscribed' THEN now() ELSE NULL END
       RETURNING *`,
      [email, String(body.source || 'manual').trim() || 'manual', status, body.first_name ? String(body.first_name).trim() : null, body.last_name ? String(body.last_name).trim() : null, localeValue, body.notes ? String(body.notes) : null]
    )
    await c.end()
    res.json({ subscriber: r.rows[0] || null })
  } catch (e) {
    try { await c.end() } catch (_) {}
    res.status(500).json({ message: e?.message || 'Error' })
  }
}

const adminHubNewsletterSubscriberByIdGET = async (req, res) => {
  const id = String(req.params?.id || '').trim()
  if (!id) return res.status(400).json({ message: 'id is required' })
  const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
  const { Client } = require('pg')
  const c = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
  try {
    await c.connect()
    const sr = await c.query(`SELECT * FROM store_newsletter_subscribers WHERE id = $1::uuid LIMIT 1`, [id])
    if (!sr.rows?.length) {
      await c.end()
      return res.status(404).json({ message: 'Not found' })
    }
    const er = await c.query(
      `SELECT id, recipient_email, subject, provider, delivery_status, flow_trigger_key, sent_at
       FROM store_newsletter_email_logs
       WHERE subscriber_id = $1::uuid OR recipient_email = $2
       ORDER BY sent_at DESC
       LIMIT 200`,
      [id, String(sr.rows[0].email || '').trim().toLowerCase()]
    )
    await c.end()
    res.json({ subscriber: sr.rows[0], emails: er.rows || [] })
  } catch (e) {
    try { await c.end() } catch (_) {}
    res.status(500).json({ message: e?.message || 'Error' })
  }
}

const adminHubNewsletterSubscriberPATCH = async (req, res) => {
  const user = req.sellerUser || {}
  if (String(user.is_superuser || '').toLowerCase() !== 'true' && user.is_superuser !== true) {
    return res.status(403).json({ message: 'Forbidden' })
  }
  const id = String(req.params?.id || '').trim()
  const status = String(req.body?.status || '').trim().toLowerCase()
  if (!id) return res.status(400).json({ message: 'id is required' })
  if (!['active', 'deactivated', 'unsubscribed'].includes(status)) {
    return res.status(400).json({ message: 'Invalid status' })
  }
  const localeRaw = String(req.body?.preferred_locale || '').trim().toLowerCase()
  const localeValue = ['de', 'en', 'tr', 'fr', 'it', 'es'].includes(localeRaw) ? localeRaw : null
  const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
  const { Client } = require('pg')
  const c = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
  try {
    await c.connect()
    const r = await c.query(
      `UPDATE store_newsletter_subscribers
       SET status = $2,
           first_name = COALESCE($3, first_name),
           last_name = COALESCE($4, last_name),
           preferred_locale = COALESCE($5, preferred_locale),
           notes = COALESCE($6, notes),
           updated_at = now(),
           unsubscribed_at = CASE WHEN $2 = 'unsubscribed' THEN now() ELSE NULL END
       WHERE id = $1
       RETURNING *`,
      [id, status, req.body?.first_name !== undefined ? (req.body.first_name ? String(req.body.first_name).trim() : null) : null, req.body?.last_name !== undefined ? (req.body.last_name ? String(req.body.last_name).trim() : null) : null, req.body?.preferred_locale !== undefined ? localeValue : null, req.body?.notes !== undefined ? (req.body.notes ? String(req.body.notes) : null) : null]
    )
    await c.end()
    if (!r.rows?.length) return res.status(404).json({ message: 'Not found' })
    res.json({ subscriber: r.rows[0] })
  } catch (e) {
    try { await c.end() } catch (_) {}
    res.status(500).json({ message: e?.message || 'Error' })
  }
}

const adminHubNewsletterSubscriberDELETE = async (req, res) => {
  const user = req.sellerUser || {}
  if (String(user.is_superuser || '').toLowerCase() !== 'true' && user.is_superuser !== true) {
    return res.status(403).json({ message: 'Forbidden' })
  }
  const id = String(req.params?.id || '').trim()
  if (!id) return res.status(400).json({ message: 'id is required' })
  const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
  const { Client } = require('pg')
  const c = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
  try {
    await c.connect()
    await c.query(`DELETE FROM store_newsletter_subscribers WHERE id = $1::uuid`, [id])
    await c.end()
    res.json({ ok: true })
  } catch (e) {
    try { await c.end() } catch (_) {}
    res.status(500).json({ message: e?.message || 'Error' })
  }
}

const adminHubNewsletterSubscribersActiveGET = async (req, res) => {
  const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
  const { Client } = require('pg')
  const c = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
  try {
    await c.connect()
    const r = await c.query(
      `SELECT * FROM store_newsletter_subscribers
       WHERE status = 'active'
       ORDER BY subscribed_at DESC NULLS LAST
       LIMIT 500`
    )
    await c.end()
    res.json({ subscribers: r.rows })
  } catch (e) {
    try { await c.end() } catch (_) {}
    res.json({ subscribers: [] })
  }
}

module.exports = function createNewsletterRouter({ dispatchCustomerFlowEvent }) {
  const router = Router()

  router.post('/store/newsletter-subscribe', storeNewsletterSubscribePOST(dispatchCustomerFlowEvent))
  router.post('/store/newsletter-unsubscribe', storeNewsletterUnsubscribePOST)
  router.get('/store/newsletter-unsubscribe', storeNewsletterUnsubscribeGET)
  router.get('/admin-hub/v1/newsletter-subscribers', adminHubNewsletterSubscribersGET)
  router.post('/admin-hub/v1/newsletter-subscribers', adminHubNewsletterSubscribersPOST)
  router.get('/admin-hub/v1/newsletter-subscribers/:id', adminHubNewsletterSubscriberByIdGET)
  router.patch('/admin-hub/v1/newsletter-subscribers/:id', adminHubNewsletterSubscriberPATCH)
  router.delete('/admin-hub/v1/newsletter-subscribers/:id', adminHubNewsletterSubscriberDELETE)
  router.get('/admin-hub/v1/newsletter-subscribers-active', adminHubNewsletterSubscribersActiveGET)

  return router
}
module.exports.generateUnsubscribeUrl = generateUnsubscribeUrl
