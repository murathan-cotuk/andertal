'use strict'
const { container } = require('@medusajs/framework')
const categoryAutoTranslate = require('./category-auto-translate')

function resolveAdminHub() {
  try { return container.resolve('adminHubService') } catch { return null }
}

function resolveCategoryRequestLocale(req) {
  return categoryAutoTranslate.normalizeCategoryLocale(req.query.locale || req.headers['x-shop-locale'] || '')
}

async function localizeCategoriesForRequest(categories, req, pgClient) {
  const locale = resolveCategoryRequestLocale(req)
  if (!locale || !Array.isArray(categories) || categories.length === 0) return categories
  try {
    await categoryAutoTranslate.applyCategoryLocale(categories, locale, { pgClient })
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
  const sortCategories = (cats) =>
    cats
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
      .map((cat) => ({
        ...cat,
        children: cat.children && cat.children.length ? sortCategories(cat.children) : [],
      }))
  return sortCategories(roots)
}

function getCategoriesPgClient() {
  const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
  if (!dbUrl || !dbUrl.startsWith('postgres')) return null
  const { Client } = require('pg')
  return new Client({
    connectionString: dbUrl,
    ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false,
  })
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
  localizeCategoriesForRequest,
  localizeSingleCategoryForRequest,
  mapAdminHubCategoryPgRow,
  buildAdminHubCategoryTreeFromFlat,
  getCategoriesPgClient,
  categoriesPgUnavailable,
}
