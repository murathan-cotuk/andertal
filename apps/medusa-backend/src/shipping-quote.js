'use strict'

/**
 * Per-seller shipping quote — the server-side source of truth for what a customer pays for
 * shipping at checkout.
 *
 * A cart is split by seller (store_cart_items.seller_id). Each seller is quoted on their own:
 *   - base shipping = highest shipping-group price among that seller's lines for the country
 *     (same "most expensive group wins" rule the shop always used, just scoped per seller)
 *   - free when that seller's own merchandise subtotal >= that seller's own free-shipping
 *     threshold for the country (admin_hub_seller_settings.free_shipping_thresholds of the
 *     seller's row — the platform's own products live on seller_id 'default')
 * Total shipping = sum over sellers. One seller's threshold never makes another seller's
 * shipping free, and items of different sellers never add up towards one threshold.
 *
 * Mirrors apps/shop/src/lib/seller-shipping.js — keep both in sync.
 */

const normalizeCountry = (code) => {
  const u = String(code ?? '').trim().toUpperCase()
  if (u === 'UK') return 'GB'
  return /^[A-Z]{2}$/.test(u) ? u : ''
}

const normGroupId = (x) => String(x ?? '').trim().toLowerCase()

const toCents = (v) => {
  if (v == null || v === '') return null
  const n = Number(v)
  if (!Number.isFinite(n) || n < 0) return null
  return Math.round(n)
}

const sellerKey = (it) => String(it?.seller_id || '').trim() || 'default'

/** Normalized {ISO: cents} map (drops invalid keys/values). */
const normalizePriceMap = (prices) => {
  const out = {}
  if (!prices || typeof prices !== 'object') return out
  for (const [k, v] of Object.entries(prices)) {
    const iso = normalizeCountry(k)
    const cents = toCents(v)
    if (iso && cents != null) out[iso] = cents
  }
  return out
}

/** Same as shop resolveShippingQuoteCents: exact country, then DE, then cheapest listed. */
const resolveShippingQuoteCents = (prices, countryCode) => {
  const byIso = normalizePriceMap(prices)
  const want = normalizeCountry(countryCode)
  if (want && Object.prototype.hasOwnProperty.call(byIso, want)) return byIso[want]
  if (Object.prototype.hasOwnProperty.call(byIso, 'DE')) return byIso.DE
  let min = null
  for (const n of Object.values(byIso)) {
    if (min === null || n < min) min = n
  }
  return min
}

/** Seller threshold for exactly this country — never another country's rule. */
const resolveThresholdCents = (rawThresholds, countryCode) => {
  const code = normalizeCountry(countryCode)
  if (!code) return null
  const byIso = normalizePriceMap(rawThresholds)
  return Object.prototype.hasOwnProperty.call(byIso, code) ? byIso[code] : null
}

/**
 * @param {{ items: Array<object>, groups: Array<{id: string, prices: object}>, thresholdsBySeller: Record<string, object|null>, country: string }} input
 * @returns {{ totalCents: number, sellers: Array<{ seller_id: string, subtotal_cents: number, base_shipping_cents: number, threshold_cents: number|null, free: boolean, shipping_cents: number }> }}
 */
function computeShippingBySeller({ items, groups, thresholdsBySeller, country }) {
  const groupPrices = new Map()
  for (const g of groups || []) groupPrices.set(normGroupId(g?.id), g?.prices || {})
  const bySeller = new Map()
  for (const it of Array.isArray(items) ? items : []) {
    const sid = sellerKey(it)
    if (!bySeller.has(sid)) bySeller.set(sid, { subtotal: 0, base: null })
    const s = bySeller.get(sid)
    s.subtotal += Math.max(0, Number(it.unit_price_cents || 0)) * Math.max(1, Number(it.quantity || 1))
    const gid = normGroupId(it.shipping_group_id || it?.product_metadata?.shipping_group_id || it?.metadata?.shipping_group_id)
    if (!gid || !groupPrices.has(gid)) continue
    const p = resolveShippingQuoteCents(groupPrices.get(gid), country)
    if (p == null) continue
    if (s.base === null || p > s.base) s.base = p
  }
  const sellers = []
  let totalCents = 0
  for (const [sid, s] of bySeller) {
    const base = s.base == null ? 0 : s.base
    const threshold = resolveThresholdCents(thresholdsBySeller ? thresholdsBySeller[sid] : null, country)
    const free = threshold != null && s.subtotal >= threshold
    const shipping = free ? 0 : base
    totalCents += shipping
    sellers.push({
      seller_id: sid,
      subtotal_cents: s.subtotal,
      base_shipping_cents: base,
      threshold_cents: threshold,
      free,
      shipping_cents: shipping,
    })
  }
  return { totalCents, sellers }
}

/** {seller_id: cents} as stored on store_orders.shipping_by_seller. */
const shippingBySellerMap = (quote) => {
  const out = {}
  for (const s of quote?.sellers || []) out[s.seller_id] = s.shipping_cents
  return out
}

async function loadShippingGroups(client) {
  const groups = await client.query('SELECT id FROM store_shipping_groups')
  const prices = await client.query('SELECT group_id, country_code, price_cents FROM store_shipping_prices')
  // Superuser-disabled countries are unbuyable everywhere (same filter as /store/shipping-groups).
  const disabled = await client.query(
    'SELECT country_code FROM admin_hub_country_overrides WHERE is_enabled = false',
  ).catch(() => ({ rows: [] }))
  const disabledSet = new Set((disabled.rows || []).map((r) => normalizeCountry(r.country_code)).filter(Boolean))
  const byGroup = {}
  for (const p of prices.rows || []) {
    const cc = normalizeCountry(p.country_code)
    if (!cc || disabledSet.has(cc)) continue
    if (!byGroup[p.group_id]) byGroup[p.group_id] = {}
    byGroup[p.group_id][cc] = Number(p.price_cents)
  }
  return (groups.rows || []).map((g) => ({ id: g.id, prices: byGroup[g.id] || {} }))
}

async function loadFreeShippingThresholds(client, sellerIds) {
  const ids = [...new Set((sellerIds || []).map((x) => String(x || '').trim()).filter(Boolean))]
  const out = {}
  if (!ids.length) return out
  const r = await client.query(
    'SELECT seller_id, free_shipping_thresholds FROM admin_hub_seller_settings WHERE seller_id = ANY($1::text[])',
    [ids],
  )
  for (const row of r.rows || []) {
    let raw = row.free_shipping_thresholds
    if (typeof raw === 'string') {
      try { raw = JSON.parse(raw) } catch (_) { raw = null }
    }
    out[String(row.seller_id)] = raw && typeof raw === 'object' ? normalizePriceMap(raw) : null
  }
  return out
}

/** Server-side quote for a cart (from getCartWithItems) and a shipping country. */
async function quoteCartShipping(client, cart, country) {
  const items = Array.isArray(cart?.items) ? cart.items : []
  const groups = await loadShippingGroups(client)
  const thresholdsBySeller = await loadFreeShippingThresholds(client, items.map(sellerKey))
  return computeShippingBySeller({ items, groups, thresholdsBySeller, country: normalizeCountry(country) || 'DE' })
}

module.exports = {
  normalizeCountry,
  resolveShippingQuoteCents,
  resolveThresholdCents,
  computeShippingBySeller,
  shippingBySellerMap,
  loadShippingGroups,
  loadFreeShippingThresholds,
  quoteCartShipping,
}
