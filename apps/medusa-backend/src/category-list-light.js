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

/** Excel export needs every language name without SELECT * metadata (OOM). */
function wantsExcelExportPayload(query) {
  const v = String(query?.excel || '').toLowerCase()
  return v === 'true' || v === '1' || v === 'yes'
}

const EXCEL_EXPORT_LANGS = ['de', 'en', 'tr', 'fr', 'it', 'es']

function excelExportCategorySelectSql() {
  const nameCols = EXCEL_EXPORT_LANGS.map(
    (l) => `NULLIF(TRIM(metadata #>> '{translations,${l},name}'), '') AS name_${l}`,
  ).join(',\n    ')
  const descCols = EXCEL_EXPORT_LANGS.map(
    (l) => `NULLIF(TRIM(COALESCE(
      metadata #>> '{translations,${l},long_content}',
      metadata #>> '{translations,${l},description}'
    )), '') AS description_${l}`,
  ).join(',\n    ')
  const seoTitleCols = EXCEL_EXPORT_LANGS.map(
    (l) => `NULLIF(TRIM(COALESCE(
      metadata #>> '{translations,${l},seo_title}',
      metadata #>> '{seo_i18n,${l},meta_title}'
    )), '') AS seo_title_${l}`,
  ).join(',\n    ')
  const seoDescCols = EXCEL_EXPORT_LANGS.map(
    (l) => `NULLIF(TRIM(COALESCE(
      metadata #>> '{translations,${l},seo_description}',
      metadata #>> '{seo_i18n,${l},meta_description}'
    )), '') AS seo_description_${l}`,
  ).join(',\n    ')
  const seoKwCols = EXCEL_EXPORT_LANGS.map(
    (l) => `NULLIF(TRIM(COALESCE(
      metadata #>> '{translations,${l},keywords}',
      metadata #>> '{translations,${l},seo_keywords}',
      metadata #>> '{seo_i18n,${l},keywords}'
    )), '') AS seo_keywords_${l}`,
  ).join(',\n    ')
  return `id, name, slug, parent_id, active, is_visible, has_collection, sort_order,
    seo_title, seo_description, long_content, banner_image_url,
    NULLIF(TRIM(metadata #>> '{image_url}'), '') AS image_url,
    NULLIF(TRIM(COALESCE(metadata #>> '{banner_image_url}', banner_image_url)), '') AS banner_image_url_meta,
    ${nameCols},
    ${descCols},
    ${seoTitleCols},
    ${seoDescCols},
    ${seoKwCols}`
}

function mapExcelExportCategoryRow(row) {
  const translations = {}
  const seo_i18n = {}
  for (const lang of EXCEL_EXPORT_LANGS) {
    const name = String(row[`name_${lang}`] || '').trim()
    const long_content = String(row[`description_${lang}`] || '').trim()
    const seo_title = String(row[`seo_title_${lang}`] || '').trim()
    const seo_description = String(row[`seo_description_${lang}`] || '').trim()
    const keywords = String(row[`seo_keywords_${lang}`] || '').trim()
    if (name || long_content || seo_title || seo_description || keywords) {
      translations[lang] = {
        ...(name ? { name } : {}),
        ...(long_content ? { long_content, description: long_content } : {}),
        ...(seo_title ? { seo_title } : {}),
        ...(seo_description ? { seo_description } : {}),
        ...(keywords ? { keywords, seo_keywords: keywords } : {}),
      }
    }
    if (seo_title || seo_description || keywords) {
      seo_i18n[lang] = {
        ...(seo_title ? { meta_title: seo_title } : {}),
        ...(seo_description ? { meta_description: seo_description } : {}),
        ...(keywords ? { keywords } : {}),
      }
    }
  }
  // Canonical DE name lives on `name`; ensure translations.de.name is present for export.
  if (!translations.de?.name && row.name) {
    translations.de = { ...(translations.de || {}), name: String(row.name).trim() }
  }
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    parent_id: row.parent_id || null,
    active: !!row.active,
    is_visible: row.is_visible !== false,
    has_collection: !!row.has_collection,
    sort_order: Number(row.sort_order) || 0,
    seo_title: row.seo_title || null,
    seo_description: row.seo_description || null,
    long_content: row.long_content || null,
    banner_image_url: row.banner_image_url_meta || row.banner_image_url || null,
    image_url: row.image_url || null,
    metadata: {
      translations,
      ...(Object.keys(seo_i18n).length ? { seo_i18n } : {}),
      ...(row.image_url ? { image_url: row.image_url } : {}),
      ...(row.banner_image_url_meta || row.banner_image_url
        ? { banner_image_url: row.banner_image_url_meta || row.banner_image_url }
        : {}),
    },
  }
}

module.exports = {
  LIST_LOCALES,
  normalizeListLocale,
  wantsFullCategoryPayload,
  wantsExcelExportPayload,
  mergeCategoryMetadata,
  mapLightCategoryRow,
  lightCategorySelectSql,
  excelExportCategorySelectSql,
  mapExcelExportCategoryRow,
  EXCEL_EXPORT_LANGS,
}
