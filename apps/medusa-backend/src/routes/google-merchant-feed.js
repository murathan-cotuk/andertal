'use strict'
const { Router } = require('express')

// Google Merchant Center product feed (RSS 2.0 + Google Shopping <g:*> namespace per
// https://support.google.com/merchants/answer/7052112). Mirrors idealo-feed.js's structure
// (same cache/preview pattern, same admin_hub_products source) — intentionally NOT merged
// with it, since Idealo is a price-comparison feed with its own custom XML shape and its own
// category-mapping table, while this is Google's own standardized feed schema; keeping them
// separate avoids coupling two independent integrations that can evolve on different schedules.
//
// Fields NOT emitted because the data genuinely doesn't exist yet (do not invent):
//   - g:mpn            — no MPN column/metadata key anywhere in the product schema.
//   - g:google_product_category — no Andertal-category -> Google-taxonomy mapping table exists
//     yet (idealo-feed.js has admin_hub_idealo_category_map for its own taxonomy; a Google
//     equivalent, e.g. admin_hub_google_category_map, would need to be built the same way
//     before this field can be added truthfully).
//   - g:shipping       — no per-product weight/dimensions in the schema; shipping cost/time is
//     configured at the Merchant Center account level instead (Settings -> Shipping), which is
//     also Google's own recommended approach when per-item shipping data isn't tracked.
//   - g:condition      — hardcoded to "new": matches the existing Product JSON-LD precedent
//     (apps/shop/src/lib/seo.js buildProductJsonLd, itemCondition: NewCondition) — this
//     marketplace has no used/refurbished listing flow, so "new" is a platform-wide fact,
//     not a per-item guess. Revisit if a used/refurbished listing type is ever introduced.

const FEED_CACHE_TTL_MS = 6 * 60 * 60 * 1000 // 6h, matches idealo-feed.js's crawl-frequency assumption
const PREVIEW_LIMIT = 5

let feedCache = { xml: '', generatedAt: 0, productCount: 0 }

function getDbClient() {
  const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
  if (!dbUrl || !dbUrl.startsWith('postgres')) return null
  const { Client } = require('pg')
  return new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
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
  // Same canonical path shape as the shop's own product URLs (apps/shop/src/lib/seo.js,
  // productHandleForLocale) — Google crawls this link, so it must be the real canonical URL,
  // not a legacy shim.
  return `${baseUrl}/de/de/${encodeURIComponent(handle)}`
}

function firstDefined(...values) {
  for (const v of values) {
    if (v !== undefined && v !== null && String(v).trim() !== '') return v
  }
  return null
}

/** Same GTIN validation as apps/shop/src/lib/seo.js normalizedGtin() — only accept digit
 * lengths GS1/Google actually recognize (8/12/13/14), never a malformed free-text value. */
function normalizedGtin(meta, variants) {
  const raw = firstDefined(
    meta.ean,
    meta.canonical_ean,
    Array.isArray(variants) && variants[0] ? variants[0].ean : null,
    Array.isArray(variants) && variants[0] ? variants[0].barcode : null,
  )
  const digits = String(raw || '').replace(/\D/g, '')
  return [8, 12, 13, 14].includes(digits.length) ? digits : null
}

/** Resolves one admin_hub_products row to a feed entry, or null to skip it (mirrors
 * idealo-feed.js's buildFeedEntry: never send a half-broken listing to Google). */
function buildFeedEntry(row, baseUrl) {
  const meta = row.metadata && typeof row.metadata === 'object' ? row.metadata : {}
  const deTranslation = meta.translations?.de || {}

  const title = firstDefined(deTranslation.title, row.title)
  const handle = firstDefined(deTranslation.handle, row.handle)
  const image = Array.isArray(meta.media) && meta.media.length ? meta.media[0] : null
  const priceCents = firstDefined(meta.prices?.DE?.brutto_cents, row.price_cents)

  // Required by Google (id, title, link, image_link, price, availability) — skip rather than
  // submit an entry Merchant Center would reject at validation time anyway.
  if (!title || !handle || !image || !priceCents) return null

  const brand = firstDefined(meta.brand_name, meta.brand, meta.hersteller)
  const gtin = normalizedGtin(meta, row.variants)
  const description = firstDefined(deTranslation.description, row.description, title)

  return {
    id: row.id,
    title,
    description,
    brand,
    gtin,
    priceCents: Number(priceCents),
    url: productUrl(baseUrl, handle),
    image,
    availability: Number(row.inventory) > 0 ? 'in_stock' : 'out_of_stock',
  }
}

function renderFeedXml(entries) {
  const items = entries.map((e) => `    <item>
      <g:id>${xmlEscape(e.id)}</g:id>
      <title>${cdata(e.title)}</title>
      <description>${cdata(e.description)}</description>
      <link>${xmlEscape(e.url)}</link>
      <g:image_link>${xmlEscape(e.image)}</g:image_link>
      <g:availability>${xmlEscape(e.availability)}</g:availability>
      <g:price>${(e.priceCents / 100).toFixed(2)} EUR</g:price>
      <g:condition>new</g:condition>
      ${e.brand ? `<g:brand>${cdata(e.brand)}</g:brand>\n      ` : ''}${e.gtin ? `<g:gtin>${xmlEscape(e.gtin)}</g:gtin>\n      ` : ''}${!e.brand && !e.gtin ? '<g:identifier_exists>false</g:identifier_exists>\n      ' : ''}<g:item_group_id>${xmlEscape(e.id)}</g:item_group_id>
    </item>`).join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss xmlns:g="http://base.google.com/ns/1.0" version="2.0">
  <channel>
    <title>Andertal — Product Feed</title>
    <link>${xmlEscape(resolveShopBaseUrl())}</link>
    <description>Andertal Google Merchant Center product feed</description>
${items}
  </channel>
</rss>
`
}

/** Core builder — shared by the cached full feed and the ?preview=1 path. */
async function buildFeed({ limit = null } = {}) {
  const client = getDbClient()
  if (!client) return { xml: renderFeedXml([]), count: 0 }
  const baseUrl = resolveShopBaseUrl()
  try {
    await client.connect()
    const productsRes = await client.query(`
      SELECT id, title, handle, description, price_cents, inventory, metadata, variants
        FROM admin_hub_products
       WHERE status = 'published'
       ORDER BY updated_at DESC
       ${limit ? 'LIMIT $1' : ''}
    `, limit ? [limit * 5] : []) // small over-fetch since some rows get skipped below
    await client.end()

    const entries = []
    for (const row of productsRes.rows) {
      const entry = buildFeedEntry(row, baseUrl)
      if (entry) entries.push(entry)
      if (limit && entries.length >= limit) break
    }
    return { xml: renderFeedXml(entries), count: entries.length }
  } catch (e) {
    try { await client.end() } catch (_) {}
    throw e
  }
}

async function googleMerchantFeedGET(req, res) {
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
    console.error('[google-merchant-feed] generation failed:', e?.message || e)
    res.status(500).type('text/plain').send('Feed temporarily unavailable')
  }
}

module.exports = function createGoogleMerchantFeedRouter() {
  const router = Router()
  router.get('/google-merchant-feed.xml', googleMerchantFeedGET)
  return router
}

module.exports._buildFeed = buildFeed
module.exports._buildFeedEntry = buildFeedEntry
