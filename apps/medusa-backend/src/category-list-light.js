'use strict'

const LIST_LOCALES = new Set(['de', 'en', 'tr', 'fr', 'es', 'it'])

function normalizeListLocale(raw) {
  const l = String(raw || 'de').slice(0, 2).toLowerCase()
  return LIST_LOCALES.has(l) ? l : 'de'
}

/** Full SELECT * + translations dump OOMs a 2GB box at ~20k categories. List/tree is slim unless full=true. */
function wantsFullCategoryPayload(query) {
  const v = String(query?.full || '').toLowerCase()
  return v === 'true' || v === '1' || v === 'yes'
}

function isPlainObject(v) {
  return v != null && typeof v === 'object' && !Array.isArray(v)
}

function mergeLocaleNested(existing, incoming) {
  const left = isPlainObject(existing) ? existing : {}
  const right = isPlainObject(incoming) ? incoming : {}
  const out = { ...left }
  for (const [k, rv] of Object.entries(right)) {
    const lv = left[k]
    out[k] = isPlainObject(lv) && isPlainObject(rv) ? { ...lv, ...rv } : rv
  }
  return out
}

/**
 * Shallow metadata spread would replace translations with a single locale and wipe the rest.
 * List payloads only carry the active language; PUT must merge locale maps.
 */
function mergeCategoryMetadata(existing, incoming) {
  const base = isPlainObject(existing) ? { ...existing } : {}
  if (incoming === undefined || incoming === null) return base
  if (!isPlainObject(incoming)) return base
  const out = { ...base, ...incoming }
  if (base.translations || incoming.translations) {
    out.translations = mergeLocaleNested(base.translations, incoming.translations)
  }
  if (base.seo_i18n || incoming.seo_i18n) {
    out.seo_i18n = mergeLocaleNested(base.seo_i18n, incoming.seo_i18n)
  }
  return out
}

function mapLightCategoryRow(row, locale) {
  const loc = normalizeListLocale(locale)
  const canonical = String(row?.name || '').trim()
  const own = String(row?.locale_own_name || '').trim()
  const localized = String(row?.localized_name || '').trim() || canonical
  return {
    id: row.id,
    name: canonical,
    slug: row.slug,
    parent_id: row.parent_id || null,
    active: !!row.active,
    is_visible: row.is_visible !== false,
    has_collection: !!row.has_collection,
    sort_order: Number(row.sort_order) || 0,
    localized_name: localized,
    metadata: own ? { translations: { [loc]: { name: own } } } : {},
  }
}

/** $1 is always the UI locale for the translations JSON path. */
function lightCategorySelectSql() {
  return `id, name, slug, parent_id, active, is_visible, has_collection, sort_order,
    NULLIF(TRIM(metadata #>> ARRAY['translations', $1, 'name']), '') AS locale_own_name,
    NULLIF(TRIM(COALESCE(
      metadata #>> ARRAY['translations', $1, 'name'],
      metadata #>> ARRAY['translations', 'de', 'name'],
      name
    )), '') AS localized_name`
}

module.exports = {
  LIST_LOCALES,
  normalizeListLocale,
  wantsFullCategoryPayload,
  mergeCategoryMetadata,
  mapLightCategoryRow,
  lightCategorySelectSql,
}
