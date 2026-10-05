'use strict'
const { Router } = require('express')
const { getPooledClient } = require('../db-pool')
const { listStoreProducts } = require('./store-products')
const {
  getSearchIndex,
  searchIndex,
  searchFacets,
  searchSuggestions,
  normalizeText,
} = require('../store-search')

/*
 * GET /store/search?q=…&limit=24&locale=de[&log=1]
 *   → { query, mode: exact|related|popular, total, did_you_mean, products, categories, brands, suggestions }
 * GET /store/search/popular?limit=8
 *   → { searches: [{ query, count }] } — "Beliebte Suchen", from real submitted searches (log=1)
 */

const searchDeps = { listStoreProducts, getPooledClient }

let searchLogReady = null
const ensureSearchLogTable = (client) => {
  if (!searchLogReady) {
    searchLogReady = client.query(`
      CREATE TABLE IF NOT EXISTS store_search_queries (
        query_norm text PRIMARY KEY,
        query_display text NOT NULL,
        search_count integer NOT NULL DEFAULT 0,
        last_results integer NOT NULL DEFAULT 0,
        last_searched_at timestamptz NOT NULL DEFAULT now()
      )`).catch((err) => { searchLogReady = null; throw err })
  }
  return searchLogReady
}

/** Count a submitted search (search results page). Only queries with results become "popular". */
const logSearch = async (raw, resultCount) => {
  const norm = normalizeText(raw)
  if (norm.length < 2 || norm.length > 80) return
  const client = getPooledClient()
  if (!client) return
  try {
    await client.connect()
    await ensureSearchLogTable(client)
    await client.query(
      `INSERT INTO store_search_queries (query_norm, query_display, search_count, last_results, last_searched_at)
       VALUES ($1, $2, 1, $3, now())
       ON CONFLICT (query_norm) DO UPDATE SET
         search_count = store_search_queries.search_count + 1,
         query_display = EXCLUDED.query_display,
         last_results = EXCLUDED.last_results,
         last_searched_at = now()`,
      [norm, String(raw).trim().slice(0, 80), resultCount],
    )
  } catch (err) {
    console.error('Search log failed:', err && err.message)
  } finally {
    try { await client.end() } catch (_) {}
  }
}

const storeSearchGET = async (req, res) => {
  const raw = String(req.query.q || '').trim().slice(0, 120)
  const limit = Math.max(1, Math.min(200, parseInt(req.query.limit, 10) || 24))
  const locale = String(req.query.locale || 'de').slice(0, 2).toLowerCase()
  try {
    const index = await getSearchIndex(searchDeps)
    const result = searchIndex(index, raw, { limit })
    const facets = searchFacets(index, result, locale)
    const suggestions = searchSuggestions(index, result, locale, facets)
    if (req.query.log === '1' && raw && result.mode === 'exact') {
      logSearch(raw, result.total).catch(() => {})
    }
    res.set('Cache-Control', 'public, max-age=15, stale-while-revalidate=60')
    res.json({
      query: raw,
      mode: result.mode,
      total: result.total,
      did_you_mean: result.did_you_mean,
      products: result.hits.map((h) => h.doc.product),
      categories: facets.categories,
      brands: facets.brands,
      suggestions,
    })
  } catch (err) {
    console.error('Store search error:', err)
    res.status(200).json({ query: raw, mode: 'related', total: 0, did_you_mean: null, products: [], categories: [], brands: [], suggestions: [] })
  }
}

const storeSearchPopularGET = async (req, res) => {
  const limit = Math.max(1, Math.min(20, parseInt(req.query.limit, 10) || 8))
  const client = getPooledClient()
  if (!client) return res.json({ searches: [] })
  try {
    await client.connect()
    await ensureSearchLogTable(client)
    const r = await client.query(
      `SELECT query_display, search_count FROM store_search_queries
        WHERE last_results > 0 AND last_searched_at > now() - interval '90 days'
        ORDER BY search_count DESC, last_searched_at DESC
        LIMIT $1`,
      [limit],
    )
    res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300')
    res.json({ searches: (r.rows || []).map((row) => ({ query: row.query_display, count: Number(row.search_count) || 0 })) })
  } catch (err) {
    console.error('Popular searches error:', err && err.message)
    res.json({ searches: [] })
  } finally {
    try { await client.end() } catch (_) {}
  }
}

module.exports = function createStoreSearchRouter() {
  const router = Router()
  router.get('/store/search/popular', storeSearchPopularGET)
  router.get('/store/search', storeSearchGET)
  return router
}
