'use strict'

/**
 * Pure helpers: fold N standalone admin_hub_products rows into one parent’s variants[].
 * Used by POST /admin-hub/v1/products/combine-as-variants.
 */

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

const hasRealVariants = (product) =>
  parseVariantsArray(product).some(
    (v) => Array.isArray(v?.option_values) && v.option_values.length > 0
  )

const uniqueLabels = (labels) => {
  const seen = new Map()
  return labels.map((raw, i) => {
    let base = String(raw || '').trim() || `Variant ${i + 1}`
    const key = base.toLowerCase()
    const n = (seen.get(key) || 0) + 1
    seen.set(key, n)
    if (n > 1) base = `${base} (${n})`
    return base
  })
}

/**
 * Map a standalone product row into one variant object.
 */
const productRowToVariant = (product, optionValue) => {
  const meta =
    product && product.metadata && typeof product.metadata === 'object'
      ? { ...product.metadata }
      : {}
  delete meta.variation_groups
  delete meta.merged_into_id

  const label = String(optionValue || product?.title || 'Variant').trim() || 'Variant'
  const media = Array.isArray(meta.media) ? meta.media : []
  const firstMedia =
    media[0] && typeof media[0] === 'object'
      ? media[0].url || media[0].src || ''
      : typeof media[0] === 'string'
        ? media[0]
        : ''
  const image_url = String(meta.image_url || meta.thumbnail || firstMedia || '').trim()

  const price_cents = Number(product?.price_cents != null ? product.price_cents : Math.round(Number(product?.price || 0) * 100)) || 0
  const compare =
    meta.compare_at_price_cents != null
      ? Number(meta.compare_at_price_cents)
      : meta.uvp_cents != null
        ? Number(meta.uvp_cents)
        : null
  const sale =
    meta.sale_price_cents != null
      ? Number(meta.sale_price_cents)
      : meta.rabattpreis_cents != null
        ? Number(meta.rabattpreis_cents)
        : null

  return {
    option_values: [label],
    title: label,
    value: label,
    sku: product?.sku ? String(product.sku) : '',
    ean: meta.ean ? String(meta.ean) : '',
    inventory: Number(product?.inventory || 0) || 0,
    price_cents,
    compare_at_price_cents: Number.isFinite(compare) ? compare : null,
    sale_price_cents: Number.isFinite(sale) ? sale : null,
    image_url,
    image_urls: meta.image_urls && typeof meta.image_urls === 'object' ? meta.image_urls : {},
    metadata: {
      ...meta,
      source_product_id: product?.id || null,
      description: product?.description || meta.description || '',
    },
  }
}

/**
 * Build the combined parent payload from loaded product rows.
 *
 * @param {object} opts
 * @param {string} opts.parentId
 * @param {object[]} opts.products - full rows including parent
 * @param {string} [opts.optionName]
 * @param {Record<string,string>} [opts.optionValues] - productId → label
 * @returns {{ ok: true, parentId, variants, variation_groups, parent_metadata_patch, source_ids_to_archive } | { ok: false, message }}
 */
const buildCombineAsVariantsPlan = ({ parentId, products, optionName, optionValues }) => {
  const pid = String(parentId || '').trim()
  if (!pid) return { ok: false, message: 'parent_id required' }
  const rows = Array.isArray(products) ? products : []
  if (rows.length < 2) return { ok: false, message: 'At least 2 products are required' }

  const byId = new Map(rows.map((p) => [String(p.id), p]))
  if (!byId.has(pid)) return { ok: false, message: 'parent_id must be one of the selected products' }

  for (const p of rows) {
    if (String(p.id) === pid) continue
    if (hasRealVariants(p)) {
      return {
        ok: false,
        message: `Cannot absorb product that already has variants: ${p.title || p.id}`,
      }
    }
    if (String(p.status || '') === 'merged') {
      return { ok: false, message: `Product already merged: ${p.title || p.id}` }
    }
  }

  const parent = byId.get(pid)
  const existingReal = parseVariantsArray(parent).filter(
    (v) => Array.isArray(v?.option_values) && v.option_values.length > 0
  )

  const sourcesToConvert = rows.filter((p) => String(p.id) !== pid)
  // If parent is still a standalone sellable (no real variants), fold it into variants too.
  const convertParentSelf = existingReal.length === 0

  const ordered = convertParentSelf ? [parent, ...sourcesToConvert] : [...sourcesToConvert]
  if (!ordered.length && existingReal.length === 0) {
    return { ok: false, message: 'Nothing to combine' }
  }

  const labelsRaw = ordered.map((p) => {
    const override = optionValues && optionValues[String(p.id)]
    if (override != null && String(override).trim()) return String(override).trim()
    return String(p.title || '').trim() || 'Variant'
  })
  const labels = uniqueLabels(labelsRaw)
  const newVariants = ordered.map((p, i) => productRowToVariant(p, labels[i]))

  const variants = [...existingReal, ...newVariants]
  // Dedupe by option key (keep first)
  const seenKeys = new Set()
  const deduped = []
  for (const v of variants) {
    const key = (Array.isArray(v.option_values) ? v.option_values : []).join('\0')
    if (!key || seenKeys.has(key)) continue
    seenKeys.add(key)
    deduped.push(v)
  }

  const axisName = String(optionName || '').trim() || 'Variante'
  const optionSet = []
  const optSeen = new Set()
  for (const v of deduped) {
    const val = Array.isArray(v.option_values) ? String(v.option_values[0] || '').trim() : ''
    if (!val) continue
    const k = val.toLowerCase()
    if (optSeen.has(k)) continue
    optSeen.add(k)
    optionSet.push({ value: val })
  }

  const parent_metadata_patch = {
    variation_groups: [{ name: axisName, options: optionSet }],
  }
  // Parent EAN must not collide with child EANs — clear when we folded parent into a variant.
  if (convertParentSelf) {
    parent_metadata_patch.ean = null
  }

  return {
    ok: true,
    parentId: pid,
    variants: deduped,
    variation_groups: parent_metadata_patch.variation_groups,
    parent_metadata_patch,
    convertParentSelf,
    source_ids_to_archive: sourcesToConvert.map((p) => String(p.id)),
  }
}

module.exports = {
  parseVariantsArray,
  hasRealVariants,
  uniqueLabels,
  productRowToVariant,
  buildCombineAsVariantsPlan,
}
