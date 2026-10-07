'use strict'

/**
 * Listing readiness: the minimum a product needs before it may go live (title, a price for
 * every sellable unit, at least one image, a category). Like the GPSR gate this is SOFT — the
 * edit is saved, the product stays/becomes a draft and the seller is told what is missing.
 *
 * It only applies when a product is being published (new, or draft → published). Products that
 * are already live are never taken offline by this rule.
 */

const LIVE_STATUSES = new Set(['published', 'active'])

const isLiveStatus = (s) => LIVE_STATUSES.has(String(s || '').trim().toLowerCase())

const positive = (n) => Number.isFinite(Number(n)) && Number(n) > 0

const pricesMapHasPrice = (prices) =>
  !!prices && typeof prices === 'object'
  && Object.values(prices).some((p) => p && typeof p === 'object' && positive(p.brutto_cents))

const hasImageValue = (v) => {
  if (!v) return false
  if (typeof v === 'string') return v.trim().length > 0
  if (Array.isArray(v)) return v.some(hasImageValue)
  if (typeof v === 'object') return Object.values(v).some(hasImageValue)
  return false
}

const isRealVariant = (v) => v && Array.isArray(v.option_values) && v.option_values.length > 0

/**
 * @returns {string[]} missing requirement keys: 'title' | 'price' | 'image' | 'category'
 */
const listingReadinessMissing = ({ title, priceCents, metadata, variants }) => {
  const meta = metadata && typeof metadata === 'object' ? metadata : {}
  const vs = (Array.isArray(variants) ? variants : []).filter(isRealVariant)
  const missing = []

  const t = String(title || '').trim()
  if (!t || t.toLowerCase() === 'untitled') missing.push('title')

  const parentPrice = positive(priceCents) || pricesMapHasPrice(meta.prices)
  const variantPrice = (v) => {
    const vm = v.metadata && typeof v.metadata === 'object' ? v.metadata : {}
    return positive(v.price_cents) || pricesMapHasPrice(vm.prices) || pricesMapHasPrice(v.prices)
  }
  const priced = vs.length ? vs.every((v) => parentPrice || variantPrice(v)) : parentPrice
  if (!priced) missing.push('price')

  const parentImage = hasImageValue(meta.media) || hasImageValue(meta.thumbnail)
  const variantImage = vs.some((v) => {
    const vm = v.metadata && typeof v.metadata === 'object' ? v.metadata : {}
    return hasImageValue(v.image_url) || hasImageValue(v.image_urls) || hasImageValue(vm.media)
  })
  if (!parentImage && !variantImage) missing.push('image')

  const cats = Array.isArray(meta.category_ids) ? meta.category_ids.filter(Boolean) : []
  if (!cats.length && !String(meta.category_id || '').trim()) missing.push('category')

  return missing
}

const READINESS_LABELS = { title: 'title', price: 'price', image: 'image', category: 'category' }

/**
 * Applies the gate. `previousStatus` = stored status before this save (null for a new product).
 * @returns {{ status: string, missing: string[], message: string | null }}
 */
const applyListingReadinessGate = ({ status, previousStatus = null, title, priceCents, metadata, variants }) => {
  if (!isLiveStatus(status) || isLiveStatus(previousStatus)) return { status, missing: [], message: null }
  const missing = listingReadinessMissing({ title, priceCents, metadata, variants })
  if (!missing.length) return { status, missing, message: null }
  return {
    status: 'draft',
    missing,
    message: `Not published yet — missing: ${missing.map((k) => READINESS_LABELS[k]).join(', ')}`,
  }
}

module.exports = { listingReadinessMissing, applyListingReadinessGate, isLiveStatus }
