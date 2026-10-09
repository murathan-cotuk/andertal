'use strict'

/**
 * Production wiring of the SCX service: DB client, product functions with all gates, image
 * rehosting, Stripe key — plus the background poller (CONNECTOR.md: never sync inside an HTTP
 * request; one worker at a time via a PG advisory lock).
 */

const { getScxClient, scxConfigFromEnv } = require('./client')
const svc = require('./service')

const ADVISORY_LOCK_KEY = 74_211_301 // "jtl scx poll"

function newDbClient() {
  const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
  if (!dbUrl || !dbUrl.startsWith('postgres')) return null
  const { Client } = require('pg')
  return new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
}

function shopBaseUrl() {
  return String(process.env.SHOP_PUBLIC_URL || process.env.NEXT_PUBLIC_SHOP_URL || 'https://andertal.de').replace(/\/+$/, '')
}

/** @param {import('pg').Client} client connected client */
function buildContext(client, { loadPlatformCheckoutRow, resolveStripeSecretKeyFromPlatform } = {}) {
  const adminProducts = require('../../routes/admin-products')
  const media = require('../../routes/media')
  const { ingestRemoteImageUrl } = require('../../remote-image-ingest')
  return {
    client,
    scx: getScxClient(),
    shopBaseUrl: shopBaseUrl(),
    products: {
      // Same as POST /admin-hub/products for a seller: master product + the seller's listing row.
      create: async (body) => {
        const row = await adminProducts.createAdminHubProductDb({ ...body, seller_id: body.seller })
        if (row && !row.__error && row.id) {
          await client.query(
            'INSERT INTO admin_hub_seller_listings (product_id, seller_id, price_cents, inventory, status) VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING',
            [row.id, body.seller, row.price_cents || 0, row.inventory || 0, 'active'],
          ).catch((e) => console.warn('[jtl-scx] seller listing:', e?.message || e))
        }
        return row
      },
      update: (id, body) => adminProducts.updateAdminHubProductDb(id, body),
    },
    // JTL picture URLs expire after 7 days → copy into our storage (reuse an earlier copy).
    ingestImage: async (sourceUrl, sellerId) => {
      const prev = (await client.query(
        'SELECT url FROM admin_hub_media WHERE source_url = $1 AND seller_id = $2 ORDER BY created_at DESC LIMIT 1', [sourceUrl, sellerId],
      )).rows[0]
      if (prev?.url && prev.url !== sourceUrl) return prev.url
      const mediaSeg = await media.resolveMediaSegForSellerId(client, sellerId, false)
      const ing = await ingestRemoteImageUrl({
        sourceUrl, mediaSeg, purpose: 'product', uploadDir: media.uploadDir,
        processProductImageToSquareWebp: media.processProductImageToSquareWebp, processGenericImageToWebp: media.processGenericImageToWebp,
      })
      await client.query(
        `INSERT INTO admin_hub_media (filename, url, source_url, mime_type, size, seller_id) VALUES ($1, $2, $3, $4, $5, $6)`,
        [ing.filename || sourceUrl.split('/').pop()?.split('?')[0] || 'image', ing.url, sourceUrl, ing.mime || null, ing.size || 0, sellerId],
      ).catch(() => {})
      return ing.url
    },
    stripeSecretKey: async () => {
      if (!loadPlatformCheckoutRow || !resolveStripeSecretKeyFromPlatform) return null
      return resolveStripeSecretKeyFromPlatform(await loadPlatformCheckoutRow(client)) || null
    },
  }
}

let running = false

/** One worker cycle: events → order export → stock. Skips when another instance holds the lock. */
async function runScxCycle(deps = {}) {
  if (running || !scxConfigFromEnv().configured) return { skipped: true }
  const client = newDbClient()
  if (!client) return { skipped: true }
  running = true
  try {
    await client.connect()
    const lock = (await client.query('SELECT pg_try_advisory_lock($1) AS ok', [ADVISORY_LOCK_KEY])).rows[0]
    if (!lock?.ok) return { skipped: 'locked' }
    try {
      const ctx = buildContext(client, deps)
      const out = {}
      for (const [name, fn] of [['events', svc.pollEventsOnce], ['orders', svc.exportOrdersOnce], ['stock', svc.syncStockOnce]]) {
        try { out[name] = await fn(ctx) } catch (e) { out[name] = { error: e?.message || String(e) } }
      }
      return out
    } finally {
      await client.query('SELECT pg_advisory_unlock($1)', [ADVISORY_LOCK_KEY]).catch(() => {})
    }
  } finally {
    running = false
    try { await client.end() } catch (_) {}
  }
}

function startScxPoller(deps = {}) {
  if (String(process.env.JTL_SCX_POLL || '').toLowerCase() === 'off' || !scxConfigFromEnv().configured) return null
  const tick = () => runScxCycle(deps).then((r) => {
    for (const [k, v] of Object.entries(r || {})) if (v && v.error) console.warn(`[jtl-scx] ${k}:`, v.error)
  }).catch((e) => console.warn('[jtl-scx] cycle:', e?.message || e))
  setTimeout(tick, 45 * 1000)
  return setInterval(tick, 60 * 1000)
}

module.exports = { buildContext, runScxCycle, startScxPoller, newDbClient }
