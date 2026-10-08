'use strict'

/**
 * Team-member (sub-user) permissions on the API. Sellercentral stores a sub-user's permissions as
 * an allow-list of SC page paths (e.g. ["/orders", "/products"]; null = everything a seller sees)
 * and only hid menu entries — the API itself never checked them, so e.g. an "orders only" team
 * member could change the payout IBAN or invite people. Sensitive endpoints now require the page
 * that offers them in SC; account owners and superusers are unaffected.
 */

/** Pure rule (same as PolarisLayout filterNavForRole): owner/superuser/null → allowed. */
function pagePermitted(user, pagePath) {
  if (!user) return false
  if (user.is_superuser === true) return true
  if (!user.sub_of_seller_id) return true
  let perms = user.permissions
  if (typeof perms === 'string') { try { perms = JSON.parse(perms) } catch (_) { perms = null } }
  if (perms == null) return true
  if (!Array.isArray(perms)) return false
  return perms.some((p) => {
    const s = String(p || '').trim()
    return s && (pagePath === s || pagePath.startsWith(s + '/'))
  })
}

/** Express middleware: the caller must be allowed to open `pagePath` in Sellercentral. */
function requireSellerPage(pagePath) {
  return async function sellerPageGuard(req, res, next) {
    const u = req.sellerUser
    if (!u) return res.status(401).json({ message: 'Unauthorized' })
    if (u.is_superuser === true) return next()
    const { getPooledClient } = require('./db-pool')
    const client = getPooledClient()
    if (!client) return res.status(503).json({ message: 'DB not configured' })
    try {
      await client.connect()
      const row = (await client.query('SELECT is_superuser, sub_of_seller_id, permissions FROM seller_users WHERE id = $1', [u.id])).rows[0]
      await client.end()
      if (!pagePermitted(row, pagePath)) {
        return res.status(403).json({ code: 'permission_denied', message: 'Keine Berechtigung für diesen Bereich.' })
      }
      req.sellerUserRow = row
      next()
    } catch (e) {
      try { await client.end() } catch (_) {}
      res.status(500).json({ message: e?.message || 'Error' })
    }
  }
}

module.exports = { pagePermitted, requireSellerPage }
