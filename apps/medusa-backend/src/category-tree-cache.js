'use strict'

/**
 * Category tree cache for the public storefront endpoint (GET /store/categories?tree=true).
 * Every one of the shop's ~10 pages hitting this route shares one cache entry per
 * `is_visible` filter instead of each recomputing the tree from Postgres.
 * Must be invalidated on every admin-hub category create/update/delete/import.
 */

const { createTieredCache } = require('./tiered-cache')

const CATEGORY_TREE_CACHE_TTL_SECONDS = 60

const cache = createTieredCache('category-tree', CATEGORY_TREE_CACHE_TTL_SECONDS)

function keyFor(filters) {
  const vis = filters && filters.is_visible !== undefined ? String(filters.is_visible) : 'all'
  return `tree:${vis}`
}

function getCachedCategoryTree(filters) {
  return cache.get(keyFor(filters))
}

function setCachedCategoryTree(filters, data) {
  return cache.set(keyFor(filters), data)
}

function invalidateCategoryTreeCache() {
  return cache.invalidateAll()
}

module.exports = { getCachedCategoryTree, setCachedCategoryTree, invalidateCategoryTreeCache, CATEGORY_TREE_CACHE_TTL_SECONDS }
