'use strict'

const normalizeCatalogMetaKey = (raw) => (
  String(raw || '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '')
)

const isOperationalProductKey = (raw) => {
  const key = normalizeCatalogMetaKey(raw)
  if (!key || key.startsWith('_')) return true
  if (key.endsWith('_id') || key.endsWith('_ids')) return true
  if (key.includes('bullet_point')) return true
  if (/(^|_)(weee?|eprel|bullet|hersteller|manufacturer|gpsr|category|brand)(_|$)/i.test(key)) return true
  if ([
    'type', 'ean', 'sku', 'handle', 'title', 'description', 'status', 'inventory', 'price',
    'media', 'prices', 'files', 'product_files', 'metafields', 'variation_groups', 'translations',
  ].includes(key)) return true
  return false
}

const parseI18nLabels = (raw) => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return []
  const out = []
  for (const v of Object.values(raw)) {
    if (v && typeof v === 'object' && v.label != null) out.push(String(v.label).trim())
    else if (typeof v === 'string') out.push(v.trim())
  }
  return out.filter(Boolean)
}

const buildCatalogMaps = (definitionRows) => {
  const allowedByKey = new Map()
  const keyByAlias = new Map()
  const labelByKey = new Map()
  for (const row of definitionRows || []) {
    const key = normalizeCatalogMetaKey(row?.key)
    if (!key || isOperationalProductKey(key)) continue
    const label = String(row?.label || key).trim() || key
    labelByKey.set(key, label)
    keyByAlias.set(key.toLowerCase(), key)
    keyByAlias.set(label.toLowerCase(), key)
    for (const extra of parseI18nLabels(row.label_i18n)) {
      keyByAlias.set(extra.toLowerCase(), key)
    }
    const vals = new Set()
    for (const v of (Array.isArray(row.values) ? row.values : [])) {
      const s = String(v || '').trim()
      if (s) vals.add(s.toLowerCase())
    }
    allowedByKey.set(key, vals)
  }
  return { allowedByKey, keyByAlias, labelByKey }
}

const resolveCatalogKey = (raw, maps) => {
  const s = String(raw || '').trim()
  if (!s) return ''
  const hit = maps.keyByAlias.get(s.toLowerCase())
  if (hit) return hit
  return normalizeCatalogMetaKey(s)
}

const isAllowedCatalogValue = (maps, key, val) => {
  const set = maps.allowedByKey.get(key)
  if (!set) return false
  return set.has(String(val || '').trim().toLowerCase())
}

const notePending = (pendingByKey, key, val, label) => {
  if (!key || !val) return
  if (!pendingByKey.has(key)) pendingByKey.set(key, { values: new Set(), label: label || key })
  const rec = pendingByKey.get(key)
  rec.values.add(val)
  if (label && (!rec.label || rec.label === key)) rec.label = label
}

const keepMetafieldsAndQueueUnknown = (arr, maps, pendingByKey) => {
  const out = []
  for (const pair of (Array.isArray(arr) ? arr : [])) {
    const rawKey = pair?.key
    const key = resolveCatalogKey(rawKey, maps)
    const val = String(pair?.value || '').trim()
    if (!key || !val) continue
    out.push({ key, value: val })
    if (isOperationalProductKey(key)) continue
    if (!isAllowedCatalogValue(maps, key, val)) {
      notePending(pendingByKey, key, val, maps.labelByKey.get(key) || String(rawKey || key))
    }
  }
  return out
}

const scanVariationGroups = (groups, maps, pendingByKey) => {
  if (!Array.isArray(groups)) return groups
  return groups.map((g) => {
    const name = String(g?.name || '').trim()
    let key = resolveCatalogKey(g?.metafield_key || '', maps)
    if (!key && name) key = resolveCatalogKey(name, maps)
    const knownKey = maps.allowedByKey.has(key)
    const options = Array.isArray(g?.options) ? g.options : []
    for (const opt of options) {
      const val = String(opt?.value || '').trim()
      if (!val) continue
      const k = knownKey ? key : (key || normalizeCatalogMetaKey(name))
      if (!k || isOperationalProductKey(k)) continue
      if (!isAllowedCatalogValue(maps, k, val)) {
        notePending(pendingByKey, k, val, name || maps.labelByKey.get(k) || k)
      }
    }
    if (knownKey) return { ...g, metafield_key: key, ...(name ? { name } : {}) }
    if (name && !knownKey) {
      const k = normalizeCatalogMetaKey(name)
      if (k && !isOperationalProductKey(k) && !maps.allowedByKey.has(k)) {
        for (const opt of options) {
          const val = String(opt?.value || '').trim()
          if (val) notePending(pendingByKey, k, val, name)
        }
      }
    }
    return g
  })
}

const applyPendingFlags = (meta, pendingByKey) => {
  const pairs = []
  for (const [key, rec] of pendingByKey.entries()) {
    for (const value of rec.values) pairs.push({ key, value })
  }
  if (pairs.length) {
    meta._pending_catalog_metafields = pairs
    meta._catalog_approval_pending = true
  } else {
    delete meta._pending_catalog_metafields
    delete meta._catalog_approval_pending
  }
  return pairs
}

const scanProductCatalogPending = (metadata, variants, maps) => {
  const meta = metadata && typeof metadata === 'object' ? { ...metadata } : {}
  const pendingByKey = new Map()
  if (Array.isArray(meta.metafields)) {
    meta.metafields = keepMetafieldsAndQueueUnknown(meta.metafields, maps, pendingByKey)
  }
  if (Array.isArray(meta.variation_groups)) {
    meta.variation_groups = scanVariationGroups(meta.variation_groups, maps, pendingByKey)
  }
  let nextVariants = variants
  if (Array.isArray(variants)) {
    nextVariants = variants.map((v) => {
      const row = { ...(v || {}) }
      if (Array.isArray(row.metafields)) {
        row.metafields = keepMetafieldsAndQueueUnknown(row.metafields, maps, pendingByKey)
      }
      if (row.metadata && typeof row.metadata === 'object') {
        const vm = { ...row.metadata }
        if (Array.isArray(vm.metafields)) {
          vm.metafields = keepMetafieldsAndQueueUnknown(vm.metafields, maps, pendingByKey)
        }
        row.metadata = vm
      }
      return row
    })
  }
  applyPendingFlags(meta, pendingByKey)
  return { metadata: meta, variants: nextVariants, pendingByKey }
}

const productHasPendingCatalogMetafields = (product) => {
  const meta = product?.metadata && typeof product.metadata === 'object' ? product.metadata : {}
  if (meta._catalog_approval_pending === true) return true
  if (String(meta._catalog_approval_pending || '').toLowerCase() === 'true') return true
  if (Array.isArray(meta._pending_catalog_metafields) && meta._pending_catalog_metafields.length > 0) return true
  return false
}

const filterMetafieldsRejecting = (arr, rejectKey, rejectLower) => (
  (Array.isArray(arr) ? arr : []).filter((p) => {
    const k = normalizeCatalogMetaKey(p?.key)
    if (k !== rejectKey) return true
    return !rejectLower.has(String(p?.value || '').trim().toLowerCase())
  })
)

const stripRejectedCatalogValues = (metadata, variants, rejectKey, rejectValues) => {
  const rejectLower = new Set((Array.isArray(rejectValues) ? rejectValues : []).map((v) => String(v || '').trim().toLowerCase()).filter(Boolean))
  const key = normalizeCatalogMetaKey(rejectKey)
  const meta = metadata && typeof metadata === 'object' ? { ...metadata } : {}
  if (Array.isArray(meta.metafields)) meta.metafields = filterMetafieldsRejecting(meta.metafields, key, rejectLower)
  if (Array.isArray(meta.variation_groups)) {
    meta.variation_groups = meta.variation_groups.map((g) => {
      const gKey = normalizeCatalogMetaKey(g?.metafield_key || g?.name)
      if (gKey !== key) return g
      return {
        ...g,
        options: (Array.isArray(g.options) ? g.options : []).filter(
          (o) => !rejectLower.has(String(o?.value || '').trim().toLowerCase())
        ),
      }
    })
  }
  let nextVariants = variants
  if (Array.isArray(variants)) {
    nextVariants = variants.map((v) => {
      const row = { ...(v || {}) }
      if (Array.isArray(row.metafields)) row.metafields = filterMetafieldsRejecting(row.metafields, key, rejectLower)
      if (row.metadata && typeof row.metadata === 'object' && Array.isArray(row.metadata.metafields)) {
        row.metadata = { ...row.metadata, metafields: filterMetafieldsRejecting(row.metadata.metafields, key, rejectLower) }
      }
      return row
    })
  }
  return { metadata: meta, variants: nextVariants }
}

const persistCatalogPendingScan = async (dbQ, maps) => {
  let prodRes
  try {
    prodRes = await dbQ(
      `SELECT id, metadata, variants FROM admin_hub_products
       WHERE (metadata ? '_catalog_approval_pending')
          OR (metadata ? '_pending_catalog_metafields')`
    )
  } catch (_) {
    return
  }
  for (const row of (prodRes.rows || [])) {
    const scanned = scanProductCatalogPending(row.metadata, row.variants, maps)
    try {
      await dbQ(
        `UPDATE admin_hub_products SET metadata = $1::jsonb, variants = $2::jsonb, updated_at = NOW() WHERE id = $3`,
        [JSON.stringify(scanned.metadata), JSON.stringify(scanned.variants == null ? (row.variants || []) : scanned.variants), row.id]
      )
    } catch (_) {}
  }
}

module.exports = {
  normalizeCatalogMetaKey,
  buildCatalogMaps,
  resolveCatalogKey,
  scanProductCatalogPending,
  productHasPendingCatalogMetafields,
  stripRejectedCatalogValues,
  persistCatalogPendingScan,
}
