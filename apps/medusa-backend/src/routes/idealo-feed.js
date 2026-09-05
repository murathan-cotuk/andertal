'use strict'
const { Router } = require('express')

// Idealo is a price-comparison site, not a marketplace (docs/idealo.md) — one-way integration:
// we publish a product feed, Idealo crawls it periodically, clicks land directly on our shop
// product page and check out normally. No orders flow back through this route.
//
// XML field names below follow the common price-comparison feed shape (Google Shopping-adjacent),
// since Idealo's exact current schema doc wasn't available while building this — docs/idealo.md
// flags this as the one thing to double-check once the merchant account's test report comes back
// (Bölüm A4). Everything else (filtering, caching, category mapping) is stable regardless of the
// final field names.

const FEED_CACHE_TTL_MS = 6 * 60 * 60 * 1000 // 6h — Idealo typically re-crawls at most a few times/day
const PREVIEW_LIMIT = 5

let feedCache = { xml: '', generatedAt: 0, productCount: 0 }

function getDbClient() {
  const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
  if (!dbUrl || !dbUrl.startsWith('postgres')) return null
  const { Client } = require('pg')
  return new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
}

async function ensureIdealoCategoryMapTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS admin_hub_idealo_category_map (
      andertal_category_id uuid PRIMARY KEY,
      idealo_category_id text NOT NULL,
      idealo_category_name text,
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `)
}

function xmlEscape(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function cdata(value) {
  const s = String(value ?? '')
  return `<![CDATA[${s.replace(/]]>/g, ']]]]><![CDATA[>')}]]>`
}

function resolveShopBaseUrl() {
  const candidates = [
    process.env.STOREFRONT_PUBLIC_URL,
    process.env.NEXT_PUBLIC_SHOP_URL,
    process.env.SHOP_PUBLIC_URL,
  ]
  for (const c of candidates) {
    const v = String(c || '').trim().replace(/\/$/, '')
    if (v) return v
  }
  return ''
}

function productUrl(baseUrl, handle) {
  if (!baseUrl || !handle) return ''
  // Matches the exact path shape flow-automation.js already uses for email links:
  // /{market}/{lang}/produkt/{handle}. Idealo traffic defaults to DE/DE.
  return `${baseUrl}/de/de/produkt/${encodeURIComponent(handle)}`
}

function firstDefined(...values) {
  for (const v of values) {
    if (v !== undefined && v !== null && String(v).trim() !== '') return v
  }
  return null
}

/** Resolves one product row (from admin_hub_products) to a feed entry, or null to skip it. */
function buildFeedEntry(row, categoryMap, baseUrl) {
  const meta = row.metadata && typeof row.metadata === 'object' ? row.metadata : {}
  const deTranslation = meta.translations?.de || {}

  const title = firstDefined(deTranslation.title, row.title)
  const ean = firstDefined(meta.ean)
  const handle = firstDefined(deTranslation.handle, row.handle)
  const image = Array.isArray(meta.media) && meta.media.length ? meta.media[0] : null
  const categoryId = firstDefined(meta.category_id, meta.admin_category_id)
  const idealoCategory = categoryId ? categoryMap.get(String(categoryId)) : null
  const priceCents = firstDefined(meta.prices?.DE?.brutto_cents, row.price_cents)
  const complianceReview = meta.compliance_review && typeof meta.compliance_review === 'object' ? meta.compliance_review : null

  // Skip (never send a half-broken listing) rather than let Idealo reject it at crawl time:
  // no EAN, no handle to link to, no image, no category mapping yet, no price, out of stock,
  // or a KNOWN compliance gap (missing compliance_review data is NOT treated as a gap — the
  // async stamp may simply not have run yet for an older product; that shouldn't block it).
  if (!title || !ean || !handle || !image || !idealoCategory || !priceCents || Number(row.inventory) <= 0) return null
  if (complianceReview && complianceReview.ok === false) return null

  return {
    id: row.id,
    title,
    description: firstDefined(deTranslation.description, row.description, ''),
    ean,
    brand: firstDefined(meta.hersteller, ''),
    priceCents: Number(priceCents),
    url: productUrl(baseUrl, handle),
    image,
    idealoCategoryId: idealoCategory.idealo_category_id,
    availability: 'in stock',
  }
}

function renderFeedXml(entries) {
  const items = entries.map((e) => `  <product>
    <id>${xmlEscape(e.id)}</id>
    <name>${cdata(e.title)}</name>
    <description>${cdata(e.description)}</description>
    <ean>${xmlEscape(e.ean)}</ean>
    <brand>${cdata(e.brand)}</brand>
    <price>${(e.priceCents / 100).toFixed(2)}</price>
    <currency>EUR</currency>
    <url>${xmlEscape(e.url)}</url>
    <image_url>${xmlEscape(e.image)}</image_url>
    <category_id>${xmlEscape(e.idealoCategoryId)}</category_id>
    <availability>${xmlEscape(e.availability)}</availability>
  </product>`).join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<products generated_at="${new Date().toISOString()}" count="${entries.length}">\n${items}\n</products>\n`
}

/** Core builder — shared by the cached full feed and the ?preview=1 path. */
async function buildFeed({ limit = null } = {}) {
  const client = getDbClient()
  if (!client) return { xml: renderFeedXml([]), count: 0 }
  const baseUrl = resolveShopBaseUrl()
  try {
    await client.connect()
    await ensureIdealoCategoryMapTable(client)
    const mapRes = await client.query('SELECT andertal_category_id, idealo_category_id, idealo_category_name FROM admin_hub_idealo_category_map')
    const categoryMap = new Map(mapRes.rows.map((r) => [String(r.andertal_category_id), r]))

    const productsRes = await client.query(`
      SELECT id, title, handle, description, price_cents, inventory, metadata
        FROM admin_hub_products
       WHERE status = 'published'
       ORDER BY updated_at DESC
       ${limit ? 'LIMIT $1' : ''}
    `, limit ? [limit * 20] : []) // over-fetch since most rows get filtered out below (no mapping yet, etc.)
    await client.end()

    const entries = []
    for (const row of productsRes.rows) {
      const entry = buildFeedEntry(row, categoryMap, baseUrl)
      if (entry) entries.push(entry)
      if (limit && entries.length >= limit) break
    }
    return { xml: renderFeedXml(entries), count: entries.length }
  } catch (e) {
    try { await client.end() } catch (_) {}
    throw e
  }
}

async function idealoFeedGET(req, res) {
  try {
    const isPreview = String(req.query.preview || '') === '1'
    res.setHeader('Content-Type', 'application/xml; charset=utf-8')

    if (isPreview) {
      const { xml } = await buildFeed({ limit: PREVIEW_LIMIT })
      return res.send(xml)
    }

    const isStale = Date.now() - feedCache.generatedAt > FEED_CACHE_TTL_MS
    if (isStale || !feedCache.xml) {
      const { xml, count } = await buildFeed()
      feedCache = { xml, generatedAt: Date.now(), productCount: count }
    }
    res.send(feedCache.xml)
  } catch (e) {
    console.error('[idealo-feed] generation failed:', e?.message || e)
    res.status(500).type('text/plain').send('Feed temporarily unavailable')
  }
}

module.exports = function createIdealoFeedRouter() {
  const router = Router()
  router.get('/idealo-feed.xml', idealoFeedGET)
  return router
}

module.exports._buildFeed = buildFeed
module.exports._buildFeedEntry = buildFeedEntry
