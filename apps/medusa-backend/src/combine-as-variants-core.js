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

/** A "parent" already owns a variant matrix — two such products must never be combined. */
const isParentProduct = (product) => hasRealVariants(product)

const parentsAmong = (products) =>
  (Array.isArray(products) ? products : []).filter(isParentProduct)

const rejectMultipleParents = (products) => {
  const parents = parentsAmong(products)
  if (parents.length < 2) return null
  const names = parents.map((p) => p.title || p.id).join(', ')
  return {
    ok: false,
    message: `Cannot combine two parent products that already have variants. Pick standalones to add under one parent, or leave parents separate. Parents: ${names}`,
  }
}

/** Canonical product owner from row + metadata (empty = catalog / unowned master). */
const productOwnerSellerId = (product) =>
  String(
    product?.seller_id ||
      (product?.metadata && typeof product.metadata === 'object'
        ? product.metadata.seller_id || product.metadata.seller
        : '') ||
      ''
  ).trim()

/**
 * Sellers may only combine products they own (seller_id match).
 * Listed-but-not-owned catalog / other-seller rows are rejected.
 * Superuser bypasses.
 */
const assertCallerOwnsAllForCombine = ({ products, callerSellerId, isSuperuser }) => {
  if (isSuperuser === true) return { ok: true }
  const mine = String(callerSellerId || '').trim()
  if (!mine) return { ok: false, message: 'Forbidden' }
  for (const p of Array.isArray(products) ? products : []) {
    const owner = productOwnerSellerId(p)
    if (!owner || owner !== mine) {
      return {
        ok: false,
        message: `Not allowed to combine a product you do not own: ${p.title || p.id}`,
      }
    }
  }
  return { ok: true }
}

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

  const multiParent = rejectMultipleParents(rows)
  if (multiParent) return multiParent

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

/**
 * Create a brand-new roof (çatı) parent — none of the selected rows become the parent.
 * All selected products fold into variants[] and are archived against the new roof.
 *
 * @param {object} opts
 * @param {object[]} opts.products
 * @param {string} opts.roofTitle
 * @param {string} [opts.roofSku]
 * @param {string} [opts.optionName]
 * @param {Record<string,string>} [opts.optionValues]
 */
const buildNewRoofCombinePlan = ({ products, roofTitle, roofSku, optionName, optionValues }) => {
  const rows = Array.isArray(products) ? products : []
  if (rows.length < 2) return { ok: false, message: 'At least 2 products are required' }
  const title = String(roofTitle || '').trim()
  if (!title) return { ok: false, message: 'Roof product title is required' }
  const sku = String(roofSku || '').trim()
  if (!sku) return { ok: false, message: 'Roof product SKU is required' }

  for (const p of rows) {
    if (hasRealVariants(p)) {
      return {
        ok: false,
        message: `Cannot fold a product that already has variants into a new roof: ${p.title || p.id}`,
      }
    }
    if (String(p.status || '') === 'merged') {
      return { ok: false, message: `Product already merged: ${p.title || p.id}` }
    }
  }

  const labelsRaw = rows.map((p) => {
    const override = optionValues && optionValues[String(p.id)]
    if (override != null && String(override).trim()) return String(override).trim()
    return String(p.title || '').trim() || 'Variant'
  })
  const labels = uniqueLabels(labelsRaw)
  const variants = rows.map((p, i) => productRowToVariant(p, labels[i]))

  const axisName = String(optionName || '').trim() || 'Variante'
  const optionSet = []
  const optSeen = new Set()
  for (const v of variants) {
    const val = Array.isArray(v.option_values) ? String(v.option_values[0] || '').trim() : ''
    if (!val) continue
    const k = val.toLowerCase()
    if (optSeen.has(k)) continue
    optSeen.add(k)
    optionSet.push({ value: val })
  }

  // Seed catalog identity from the first member (brand/category); no parent-level EAN.
  // Roof is a normal matrix parent (shop PDP + listings), not a family_shell listing filter.
  const seedMeta =
    rows[0] && rows[0].metadata && typeof rows[0].metadata === 'object' ? rows[0].metadata : {}
  const parent_metadata = {
    variation_groups: [{ name: axisName, options: optionSet }],
  }
  if (seedMeta.brand_id) parent_metadata.brand_id = seedMeta.brand_id
  if (seedMeta.category_id) {
    parent_metadata.category_id = seedMeta.category_id
    if (seedMeta.admin_category_id) parent_metadata.admin_category_id = seedMeta.admin_category_id
    if (seedMeta.category_ids) parent_metadata.category_ids = seedMeta.category_ids
    if (seedMeta.category_slug) parent_metadata.category_slug = seedMeta.category_slug
  }
  if (seedMeta.shipping_group_id) parent_metadata.shipping_group_id = seedMeta.shipping_group_id

  const invSum = variants.reduce((s, v) => s + (Number(v.inventory) || 0), 0)
  const firstPrice = Number(variants[0]?.price_cents) || 0

  return {
    ok: true,
    mode: 'new_roof',
    roof_title: title,
    roof_sku: sku,
    variants,
    variation_groups: parent_metadata.variation_groups,
    parent_metadata,
    inventory: invSum,
    price_cents: firstPrice,
    source_ids_to_archive: rows.map((p) => String(p.id)),
  }
}

/**
 * Preferred Andertal model: link independent EAN products under a family roof.
 * Does NOT fold rows into variants[] and does NOT soft-archive sources.
 */
const buildFamilyLinkPlan = ({ familyTitle, products, optionName, optionValues }) => {
  const rows = Array.isArray(products) ? products : []
  if (rows.length < 2) return { ok: false, message: 'At least 2 products are required' }
  const multiParent = rejectMultipleParents(rows)
  if (multiParent) return multiParent
  for (const p of rows) {
    if (hasRealVariants(p)) {
      return {
        ok: false,
        message: `Cannot family-link a product that already has variants: ${p.title || p.id}. Add standalones under that parent instead.`,
      }
    }
    if (String(p.status || '') === 'merged') {
      return { ok: false, message: `Product already merged: ${p.title || p.id}` }
    }
  }
  const axisName = String(optionName || '').trim() || 'Variante'
  const members = rows.map((p) => {
    const override = optionValues && optionValues[String(p.id)]
    const label =
      override != null && String(override).trim()
        ? String(override).trim()
        : String(p.title || '').trim() || 'Product'
    return {
      product_id: String(p.id),
      title: label,
      option_value: label,
    }
  })
  const labels = uniqueLabels(members.map((m) => m.option_value))
  const optionSet = []
  const optSeen = new Set()
  for (const label of labels) {
    const k = label.toLowerCase()
    if (optSeen.has(k)) continue
    optSeen.add(k)
    optionSet.push({ value: label })
  }
  return {
    ok: true,
    mode: 'family_link',
    family_title: String(familyTitle || rows[0]?.title || 'Family').trim() || 'Family',
    variation_groups: [{ name: axisName, options: optionSet }],
    members: members.map((m, i) => ({ ...m, option_value: labels[i] })),
  }
}

module.exports = {
  parseVariantsArray,
  hasRealVariants,
  isParentProduct,
  parentsAmong,
  productOwnerSellerId,
  assertCallerOwnsAllForCombine,
  uniqueLabels,
  productRowToVariant,
  buildCombineAsVariantsPlan,
  buildNewRoofCombinePlan,
  buildFamilyLinkPlan,
}
