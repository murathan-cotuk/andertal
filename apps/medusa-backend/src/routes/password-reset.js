'use strict'
const { Router } = require('express')
const crypto = require('crypto')
const pr = require('../password-reset')

/** Same scrypt format as customer + seller registration ("salt:hash"). */
function hashPasswordScrypt(password) {
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.scryptSync(password, salt, 64).toString('hex')
  return `${salt}:${hash}`
}

const dbClient = () => {
  const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
  if (!dbUrl || !dbUrl.startsWith('postgres')) return null
  const { Client } = require('pg')
  return new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
}

const clientIp = (req) => String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || null
const normLocale = (l) => {
  const s = String(l || '').slice(0, 2).toLowerCase()
  return ['de', 'en', 'tr', 'fr', 'it', 'es'].includes(s) ? s : 'de'
}
// Same env aliases as the flow e-mails (flow-automation.js) so links point where flows point.
const firstUrl = (list, fallback) => {
  for (const raw of list) {
    const s = String(raw || '').trim().replace(/\/$/, '')
    if (/^https?:\/\//i.test(s)) return s
  }
  return fallback
}
const baseUrl = (kind) => (kind === 'seller'
  ? firstUrl([process.env.SELLERCENTRAL_PUBLIC_URL, process.env.NEXT_PUBLIC_SELLERCENTRAL_URL, process.env.SELLERCENTRAL_URL, process.env.SELLER_CENTRAL_URL], 'https://sellercentral.andertal.com')
  : firstUrl([process.env.STOREFRONT_PUBLIC_URL, process.env.SHOP_PUBLIC_URL, process.env.PUBLIC_SHOP_URL, process.env.NEXT_PUBLIC_SITE_URL, process.env.NEXT_PUBLIC_SHOP_URL, process.env.SITE_URL], 'https://andertal.de'))

const ACCOUNTS = {
  customer: {
    find: (c, email) => c.query(
      `SELECT id::text AS id, email FROM store_customers
        WHERE LOWER(TRIM(email)) = LOWER(TRIM($1)) AND password_hash IS NOT NULL ORDER BY created_at DESC LIMIT 1`, [email]),
    setPassword: (c, id, hash) => c.query('UPDATE store_customers SET password_hash = $1, updated_at = now() WHERE id::text = $2', [hash, id]),
  },
  seller: {
    find: (c, email) => c.query(`SELECT id::text AS id, email FROM seller_users WHERE LOWER(TRIM(email)) = LOWER(TRIM($1)) LIMIT 1`, [email]),
    setPassword: async (c, id, hash) => {
      await c.query('UPDATE seller_users SET password_hash = $1, updated_at = now() WHERE id::text = $2', [hash, id])
      // Every signed-in device of that user is logged out (the reset may follow a compromise).
      await c.query('UPDATE seller_sessions SET revoked_at = now() WHERE user_id::text = $1 AND revoked_at IS NULL', [id]).catch(() => {})
    },
  },
}

function requestHandler(kind) {
  return async (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase()
    const locale = normLocale(req.body?.locale)
    // Always the same answer — never reveal whether an account exists.
    const ok = () => res.json({ success: true })
    if (!email || email.length > 254 || !email.includes('@')) return ok()
    const c = dbClient()
    if (!c) return res.status(503).json({ message: 'Database not configured' })
    try {
      await c.connect()
      await pr.ensurePasswordResetSchema(c)
      const acc = (await ACCOUNTS[kind].find(c, email)).rows[0]
      if (acc) {
        const token = await pr.createResetToken(c, { kind, userId: acc.id, ip: clientIp(req) })
        const link = `${baseUrl(kind)}/${locale}/reset-password?token=${token}`
        await pr.sendResetMail(c, { to: acc.email, link, locale }).catch((e) => console.error(`[password-reset] ${kind} mail failed:`, e?.message || e))
      }
      await c.end()
      return ok()
    } catch (e) {
      try { await c.end() } catch (_) {}
      console.error('[password-reset] request:', e?.message || e)
      return ok()
    }
  }
}

function resetHandler(kind) {
  return async (req, res) => {
    const token = String(req.body?.token || '').trim()
    const password = String(req.body?.password || '')
    if (!pr.passwordStrongEnough(password)) {
      return res.status(400).json({ code: 'weak_password', message: 'Passwort: mindestens 8 Zeichen, ein Buchstabe und eine Ziffer.' })
    }
    const c = dbClient()
    if (!c) return res.status(503).json({ message: 'Database not configured' })
    try {
      await c.connect()
      await pr.ensurePasswordResetSchema(c)
      const userId = await pr.consumeResetToken(c, { kind, token })
      if (!userId) {
        await c.end()
        return res.status(400).json({ code: 'invalid_token', message: 'Der Link ist ungültig oder abgelaufen.' })
      }
      await ACCOUNTS[kind].setPassword(c, userId, hashPasswordScrypt(password))
      await c.end()
      return res.json({ success: true })
    } catch (e) {
      try { await c.end() } catch (_) {}
      console.error('[password-reset] reset:', e?.message || e)
      return res.status(500).json({ message: 'Error' })
    }
  }
}

module.exports = function createPasswordResetRouter() {
  const router = Router()
  router.post('/store/customers/password-token', requestHandler('customer'))
  router.post('/store/customers/password-reset', resetHandler('customer'))
  router.post('/admin-hub/auth/password-token', requestHandler('seller'))
  router.post('/admin-hub/auth/password-reset', resetHandler('seller'))
  return router
}
module.exports.hashPasswordScrypt = hashPasswordScrypt
