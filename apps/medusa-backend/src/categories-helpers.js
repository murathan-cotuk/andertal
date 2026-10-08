'use strict'
const { container } = require('@medusajs/framework')
const categoryAutoTranslate = require('./category-auto-translate')
const {
  normalizeListLocale,
  wantsFullCategoryPayload,
  mapLightCategoryRow,
  lightCategorySelectSql,
} = require('./category-list-light')

function resolveAdminHub() {
  try { return container.resolve('adminHubService') } catch { return null }
}

function resolveCategoryRequestLocale(req) {
  return categoryAutoTranslate.normalizeCategoryLocale(req.query.locale || req.headers['x-shop-locale'] || '')
}

/**
 * Deep A–Z by the name already applied for the request locale (after applyCategoryLocale).
 * Ignores sort_order so DE "Haushaltsgeräte" is not forced first via EN "Appliances".
 */
function sortCategoryTreeByLocalizedName(categories, locale) {
  if (!Array.isArray(categories) || categories.length === 0) return categories
  const loc = String(locale || 'de').slice(0, 2).toLowerCase()
  const label = (c) =>
    String(c?.localized_name || c?.name || c?.title || c?.slug || '').trim()
  const sortDeep = (arr) => {
    arr.sort((a, b) => label(a).localeCompare(label(b), loc, { sensitivity: 'base' }))
    for (const n of arr) {
      if (Array.isArray(n.children) && n.children.length) sortDeep(n.children)
    }
  }
  sortDeep(categories)
  return categories
}

async function localizeCategoriesForRequest(categories, req, pgClient) {
  const locale = resolveCategoryRequestLocale(req)
  if (!locale || !Array.isArray(categories) || categories.length === 0) return categories
  try {
    await categoryAutoTranslate.applyCategoryLocale(categories, locale, { pgClient })
    sortCategoryTreeByLocalizedName(categories, locale)
  } catch (e) {
    console.warn('localizeCategoriesForRequest:', e?.message || e)
  }
  return categories
}

async function localizeSingleCategoryForRequest(category, req, pgClient) {
  if (!category) return category
  await localizeCategoriesForRequest([category], req, pgClient)
  return category
}

const mapAdminHubCategoryPgRow = (row) => ({
  id: row.id,
  name: row.name,
  slug: row.slug,
  description: row.description,
  parent_id: row.parent_id,
  active: row.active,
  is_visible: row.is_visible,
  has_collection: row.has_collection,
  sort_order: row.sort_order,
  seo_title: row.seo_title,
  seo_description: row.seo_description,
  long_content: row.long_content,
  banner_image_url: row.banner_image_url,
  metadata: row.metadata,
  created_at: row.created_at,
  updated_at: row.updated_at,
})

const buildAdminHubCategoryTreeFromFlat = (flat) => {
  const categoryMap = new Map()
  flat.forEach((cat) => categoryMap.set(cat.id, { ...cat, children: [] }))
  const roots = []
  flat.forEach((cat) => {
    const node = categoryMap.get(cat.id)
    if (cat.parent_id && categoryMap.has(cat.parent_id)) {
      categoryMap.get(cat.parent_id).children.push(node)
    } else {
      roots.push(node)
    }
  })
  // Provisional order by canonical name; request locale re-sorts after localization.
  const sortCategories = (cats) =>
    cats
      .sort((a, b) =>
        String(a.name || a.slug || '').localeCompare(String(b.name || b.slug || ''), 'de', {
          sensitivity: 'base',
        }),
      )
      .map((cat) => ({
        ...cat,
        children: cat.children && cat.children.length ? sortCategories(cat.children) : [],
      }))
  return sortCategories(roots)
}

// /store/categories?tree=true is fetched on nearly every storefront page load and was
// observed taking multiple seconds under load — pooled to avoid a fresh Postgres
// TCP+TLS handshake per request (see src/db-pool.js).
function getCategoriesPgClient() {
  const { getPooledClient } = require('./db-pool')
  return getPooledClient()
}

function categoriesPgUnavailable(res) {
  return res.status(503).json({
    message:
      'DATABASE_URL yok veya postgres değil. Render/hosting ortamında Postgres bağlantı dizesini ayarlayın (postgresql:// veya postgres://). Admin Hub TypeORM servisi kapalı olsa bile kategoriler veritabanından okunabilir.',
    code: 'DATABASE_URL_MISSING',
  })
}

module.exports = {
  resolveAdminHub,
  resolveCategoryRequestLocale,
  normalizeListLocale,
  wantsFullCategoryPayload,
  mapLightCategoryRow,
  lightCategorySelectSql,
  localizeCategoriesForRequest,
  localizeSingleCategoryForRequest,
  sortCategoryTreeByLocalizedName,
  mapAdminHubCategoryPgRow,
  buildAdminHubCategoryTreeFromFlat,
  getCategoriesPgClient,
  categoriesPgUnavailable,
}
