'use strict'
const { Router } = require('express')
const { scxConfigFromEnv } = require('../connectors/scx/client')
const svc = require('../connectors/scx/service')
const { buildContext, newDbClient, runScxCycle } = require('../connectors/scx/runtime')

/**
 * ERP connectors (docs/CONNECTOR.md, JTL Faz E). /admin-hub is seller-JWT protected.
 *  - Seller (account owner): JTL-Wawi sign-up / update sessions → SCX seller, connection list.
 *  - Superuser: channel setup (price type, GPSR attributes, categories), status, manual cycle.
 * The sync itself runs in the background worker (runtime.js), never inside these requests.
 */
module.exports = function createErpConnectorsRouter(deps = {}) {
  const router = Router()
  const withDb = (fn) => async (req, res) => {
    const client = newDbClient()
    if (!client) return res.status(503).json({ message: 'DB not configured' })
    try {
      await client.connect()
      await fn(req, res, client)
    } catch (e) {
      if (!res.headersSent) {
        const status = e?.status && e.status >= 400 && e.status < 600 ? (e.status >= 500 ? 502 : e.status) : 500
        res.status(status).json({ message: e?.message || 'Error', code: e?.code || undefined })
      }
    } finally {
      try { await client.end() } catch (_) {}
    }
  }
  const superOnly = (fn) => withDb(async (req, res, client) => {
    if (req.sellerUser?.is_superuser !== true) return res.status(403).json({ message: 'Superuser access required' })
    return fn(req, res, client)
  })
  // Only the account owner may connect an ERP (sub-users share the seller_id).
  const ownerOnly = (fn) => withDb(async (req, res, client) => {
    const sellerId = String(req.sellerUser?.seller_id || '').trim()
    if (!sellerId || sellerId === 'default') return res.status(403).json({ message: 'Seller account required' })
    const u = (await client.query('SELECT sub_of_seller_id, company_name, store_name FROM seller_users WHERE id = $1', [req.sellerUser.id])).rows[0]
    if (!u || u.sub_of_seller_id) return res.status(403).json({ message: 'Only the account owner can connect an ERP.' })
    return fn(req, res, client, { sellerId, companyName: String(u.company_name || u.store_name || '').trim() || null })
  })
  const requireConfigured = (res) => {
    if (scxConfigFromEnv().configured) return true
    res.status(503).json({ message: 'JTL connection is not configured yet.', code: 'scx_not_configured' })
    return false
  }
  const sessionOf = (req) => String(req.body?.session || req.body?.sessionId || '').trim()

  router.get('/admin-hub/v1/erp/connections', withDb(async (req, res, client) => {
    const sellerId = String(req.sellerUser?.seller_id || '').trim()
    const rows = (await client.query(
      `SELECT c.erp_type, c.status, c.company_name, c.connected_at, c.unlinked_at, c.unlink_reason,
              (SELECT count(*)::int FROM erp_offer_links l WHERE l.erp_type = c.erp_type AND l.external_seller_id = c.external_seller_id AND l.status = 'listed') AS listed,
              (SELECT count(*)::int FROM erp_offer_links l WHERE l.erp_type = c.erp_type AND l.external_seller_id = c.external_seller_id AND l.status = 'failed') AS failed,
              (SELECT count(*)::int FROM erp_order_exports x WHERE x.erp_type = c.erp_type AND x.seller_id = c.seller_id AND x.exported_at IS NOT NULL) AS orders_exported
         FROM erp_connections c WHERE c.seller_id = $1 ORDER BY c.connected_at DESC`,
      [sellerId],
    )).rows
    const failedOffers = rows.some((r) => r.failed > 0)
      ? (await client.query(
        `SELECT l.offer_id, l.product_id, l.last_error, l.updated_at FROM erp_offer_links l JOIN erp_connections c ON c.erp_type = l.erp_type AND c.external_seller_id = l.external_seller_id
          WHERE c.seller_id = $1 AND l.status = 'failed' ORDER BY l.updated_at DESC LIMIT 50`, [sellerId],
      )).rows
      : []
    res.json({ connections: rows, failed_offers: failedOffers, jtl_available: scxConfigFromEnv().configured })
  }))

  // Partner-Portal "Signup URL" lands on Sellercentral /integrations/jtl/signup?session=… → here.
  router.post('/admin-hub/v1/erp/jtl/signup', ownerOnly(async (req, res, client, me) => {
    if (!requireConfigured(res)) return
    const session = sessionOf(req)
    if (!session) return res.status(400).json({ message: 'session required' })
    const existing = (await client.query(`SELECT status FROM erp_connections WHERE erp_type = $1 AND seller_id = $2`, [svc.ERP, me.sellerId])).rows[0]
    if (existing?.status === 'active') return res.status(409).json({ message: 'JTL-Wawi is already connected to this account.', code: 'already_connected' })
    res.json(await svc.signupSeller(buildContext(client, deps), { session, sellerId: me.sellerId, companyName: me.companyName }))
  }))

  // Partner-Portal "Update URL" (re-activation / token renewal from JTL-Wawi).
  router.post('/admin-hub/v1/erp/jtl/update', ownerOnly(async (req, res, client, me) => {
    if (!requireConfigured(res)) return
    const session = sessionOf(req)
    if (!session) return res.status(400).json({ message: 'session required' })
    res.json(await svc.updateSellerConnection(buildContext(client, deps), { session, sellerId: me.sellerId, companyName: me.companyName }))
  }))

  router.get('/admin-hub/v1/erp/jtl/status', superOnly(async (req, res, client) => {
    const cfg = scxConfigFromEnv()
    const one = async (sql) => (await client.query(sql)).rows
    res.json({
      configured: cfg.configured,
      api_base: cfg.baseUrl,
      poll: String(process.env.JTL_SCX_POLL || '').toLowerCase() === 'off' ? 'off' : 'on',
      connections: await one(`SELECT status, count(*)::int AS n FROM erp_connections WHERE erp_type = 'jtl_scx' GROUP BY status`),
      offers: await one(`SELECT status, count(*)::int AS n FROM erp_offer_links WHERE erp_type = 'jtl_scx' GROUP BY status`),
      events_failed: await one(`SELECT event_id, event_type, external_seller_id, attempts, error, received_at FROM erp_event_log WHERE erp_type = 'jtl_scx' AND processed_at IS NULL ORDER BY received_at DESC LIMIT 50`),
      orders_failed: await one(`SELECT order_id, seller_id, attempts, last_error, updated_at FROM erp_order_exports WHERE erp_type = 'jtl_scx' AND exported_at IS NULL ORDER BY updated_at DESC LIMIT 50`),
      stock_cursor: (await one(`SELECT value FROM erp_sync_state WHERE key = 'jtl_scx.stock_cursor'`))[0]?.value || null,
    })
  }))

  // One-time channel setup (repeatable): price type + GPSR attributes (+ categories when asked).
  router.post('/admin-hub/v1/erp/jtl/setup', superOnly(async (req, res, client) => {
    if (!requireConfigured(res)) return
    res.json(await svc.setupChannel(buildContext(client, deps), { includeCategories: req.body?.categories === true }))
  }))

  router.post('/admin-hub/v1/erp/jtl/run', superOnly(async (req, res) => {
    if (!requireConfigured(res)) return
    res.json(await runScxCycle(deps))
  }))

  return router
}
