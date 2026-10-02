'use strict'

/**
 * Andertal product identity helpers.
 *
 * Business model:
 *   FAMILY (optional roof) → PRODUCT (EAN sellable unit) → SELLER OFFER (listing)
 *
 * Parent/family is never sold. Listing is always scoped to one EAN (never covers_all).
 */

const PRODUCT_ROLE_PRODUCT = 'product'
const PRODUCT_ROLE_FAMILY_SHELL = 'family_shell'

const normalizeStoreEan = (raw) => {
  if (raw == null || raw === '') return ''
  const d = String(raw).replace(/\D/g, '')
  return d.length >= 8 ? d : ''
}

const parseVariantsArray = (p) => {
  const v = p && p.variants
  if (Array.isArray(v)) return v
  if (typeof v === 'string' && v) {
    try {
      const j = JSON.parse(v)
      return Array.isArray(j) ? j : []
    } catch (_) {
      return []
    }
  }
  return []
}

const isFamilyShell = (p) => {
  if (!p) return false
  const role = String(p.product_role || '').trim().toLowerCase()
  if (role === PRODUCT_ROLE_FAMILY_SHELL) return true
  const meta = p.metadata && typeof p.metadata === 'object' ? p.metadata : {}
  return meta.product_role === PRODUCT_ROLE_FAMILY_SHELL || meta.is_family_shell === true
}

/** Seller listing metadata — always EAN-scoped; never covers_all. */
const buildListingSellerMeta = (ean) => {
  const listed = normalizeStoreEan(ean)
  if (!listed) return null
  return { ean: listed }
}

/**
 * Whether a seller_listing applies to the given EAN.
 * covers_all is ignored (legacy bug) — only exact ean match, or single-EAN legacy rows.
 */
const listingCoversEan = (listing, targetEan, productRow) => {
  const want = normalizeStoreEan(targetEan)
  if (!want) return false
  if (listing && listing.listed_ean) {
    return normalizeStoreEan(listing.listed_ean) === want
  }
  const sm =
    listing && listing.seller_metadata && typeof listing.seller_metadata === 'object'
      ? listing.seller_metadata
      : {}
  // Explicitly ignore covers_all — sibling bleed is forbidden.
  const listed = normalizeStoreEan(sm.ean || sm.listed_ean || '')
  if (listed) return listed === want
  const all = collectProductEans(productRow)
  if (all.length <= 1) return all[0] ? all[0] === want : true
  // Legacy listing with no EAN scope on a multi-EAN parent: pin to representative EAN only.
  return extractRepresentativeEan(productRow) === want
}

const collectProductEans = (p) => {
  const out = []
  const seen = new Set()
  const add = (raw) => {
    const e = normalizeStoreEan(raw)
    if (!e || seen.has(e)) return
    seen.add(e)
    out.push(e)
  }
  if (!p) return out
  const meta = p.metadata && typeof p.metadata === 'object' ? p.metadata : {}
  add(meta.ean)
  for (const row of parseVariantsArray(p)) add(row && row.ean)
  return out
}

const extractRepresentativeEan = (p) => {
  if (!p) return ''
  const meta = p.metadata && typeof p.metadata === 'object' ? p.metadata : {}
  let e = normalizeStoreEan(meta.ean)
  if (e) return e
  for (const row of parseVariantsArray(p)) {
    e = normalizeStoreEan(row && row.ean)
    if (e) return e
  }
  return ''
}

const productHasEan = (p, targetEan) => {
  const want = normalizeStoreEan(targetEan)
  if (!p || !want) return false
  return collectProductEans(p).includes(want)
}

/**
 * Resolve the sellable unit for an EAN on a catalog row (umbrella or exploded product).
 * Prefers variant child identity when EAN lives on variants[].
 */
const resolveSellableUnit = (product, targetEan) => {
  const want = normalizeStoreEan(targetEan)
  if (!product || !want) return null
  if (isFamilyShell(product) && !productHasEan(product, want)) return null

  const meta = product.metadata && typeof product.metadata === 'object' ? product.metadata : {}
  const parentEan = normalizeStoreEan(meta.ean)
  const variants = parseVariantsArray(product)
  const variantIndex = variants.findIndex((v) => normalizeStoreEan(v && v.ean) === want)
  const matchedVariant = variantIndex >= 0 ? variants[variantIndex] : null

  if (matchedVariant) {
    const vMeta = matchedVariant.metadata && typeof matchedVariant.metadata === 'object' ? matchedVariant.metadata : {}
    const title =
      matchedVariant.title ||
      matchedVariant.label ||
      (vMeta.translations && vMeta.translations.de && vMeta.translations.de.title) ||
      (Array.isArray(matchedVariant.option_values) ? matchedVariant.option_values.join(' / ') : null) ||
      product.title ||
      null
    return {
      ean: want,
      matched_on: 'variant',
      variant_index: variantIndex,
      title,
      an_id: matchedVariant.an_id || null,
      product_id: String(product.id),
      family_id: product.family_id || null,
      cart_variant_id: stableVariantId(product.id, matchedVariant, variantIndex),
      source_product_id: (vMeta && vMeta.source_product_id) || null,
    }
  }

  if (parentEan === want) {
    // If this row still has other sellable variant EANs, matching the parent EAN is
    // ambiguous — treat as product-level only when no conflicting children exist,
    // or when this is already a single-SKU / exploded product row.
    return {
      ean: want,
      matched_on: variants.length > 0 ? 'parent' : 'product',
      variant_index: null,
      title: product.title || null,
      an_id: product.an_id || null,
      product_id: String(product.id),
      family_id: product.family_id || null,
      cart_variant_id: stableVariantId(product.id, null, 0),
      source_product_id: null,
    }
  }

  return null
}

/** Stable cart / store variant id — prefer explicit v.id, else EAN, else index fallback. */
const stableVariantId = (productId, variant, index) => {
  const pid = String(productId || '').trim()
  if (!pid) return null
  if (variant && variant.id) return String(variant.id)
  const ean = normalizeStoreEan(variant && variant.ean)
  if (ean) return `${pid}-ean-${ean}`
  const i = Number.isFinite(Number(index)) ? Number(index) : 0
  return `${pid}-variant-${i}`
}

/**
 * Extract product UUID from a cart variant_id (supports -ean-, -variant-, -listing-).
 */
const productIdFromVariantId = (variantId) => {
  if (!variantId || typeof variantId !== 'string') return null
  let base
  const eanIdx = variantId.lastIndexOf('-ean-')
  if (eanIdx > 0) {
    base = variantId.slice(0, eanIdx)
  } else if (variantId.endsWith('-variant')) {
    base = variantId.slice(0, -'-variant'.length)
  } else {
    const variantDashIdx = variantId.lastIndexOf('-variant-')
    if (variantDashIdx > 0) {
      base = variantId.slice(0, variantDashIdx)
    } else {
      const idx = variantId.indexOf('-v-')
      base = idx > 0 ? variantId.slice(0, idx) : variantId
    }
  }
  const listingIdx = base.indexOf('-listing-')
  return listingIdx > 0 ? base.slice(0, listingIdx) : base
}

/** Parse variant index / ean from cart variant_id against a product row. */
const resolveVariantFromCartId = (product, variantId) => {
  const vid = String(variantId || '').trim()
  if (!product || !vid) return { index: null, variant: null, ean: null }
  const variants = parseVariantsArray(product)
  const eanMatch = vid.match(/-ean-(\d{8,})$/)
  if (eanMatch) {
    const ean = normalizeStoreEan(eanMatch[1])
    const index = variants.findIndex((v) => normalizeStoreEan(v && v.ean) === ean)
    if (index >= 0) return { index, variant: variants[index], ean }
    if (normalizeStoreEan(product.metadata?.ean) === ean) return { index: null, variant: null, ean }
    return { index: null, variant: null, ean }
  }
  for (let i = 0; i < variants.length; i++) {
    const v = variants[i]
    if (v && v.id && String(v.id) === vid) return { index: i, variant: v, ean: normalizeStoreEan(v.ean) }
    if (stableVariantId(product.id, v, i) === vid) return { index: i, variant: v, ean: normalizeStoreEan(v.ean) }
  }
  const idx =
    vid.includes('-variant-')
      ? parseInt(vid.split('-variant-').pop(), 10)
      : vid.includes('-v-')
        ? parseInt(vid.split('-v-')[1], 10)
        : null
  if (idx != null && Number.isFinite(idx) && variants[idx]) {
    return { index: idx, variant: variants[idx], ean: normalizeStoreEan(variants[idx].ean) }
  }
  return { index: null, variant: null, ean: null }
}

module.exports = {
  PRODUCT_ROLE_PRODUCT,
  PRODUCT_ROLE_FAMILY_SHELL,
  normalizeStoreEan,
  parseVariantsArray,
  isFamilyShell,
  buildListingSellerMeta,
  listingCoversEan,
  collectProductEans,
  extractRepresentativeEan,
  productHasEan,
  resolveSellableUnit,
  stableVariantId,
  productIdFromVariantId,
  resolveVariantFromCartId,
}
