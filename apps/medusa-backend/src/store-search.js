'use strict'

/**
 * Storefront search engine (GET /store/search) — in-memory, relevance-ranked.
 *
 * What a shopper can type and find:
 *   - codes (exact, whitespace/dash-insensitive): EAN, SKU / Artikelnummer, Andertal-ID (AN-…),
 *     product id, handle, category id — product AND variant level
 *   - text: product title (every language), brand, category name / keywords (every language,
 *     incl. parent categories), seller name, attributes, description
 * Ranking: exact code > exact title phrase > every word matched (title > brand > category >
 * seller > attributes > description) > fuzzy (typos) > partial. When nothing contains every
 * word the response switches to `mode: 'related'` (best partial / fuzzy / same-category
 * products) and, when a typo was corrected, offers `did_you_mean`.
 *
 * The index is built from the exact product list the shop renders (listStoreProducts), so
 * results are always sellable, published, enriched store products.
 */

/* ── text helpers ─────────────────────────────────────────────────────────── */

/** lower-case, umlauts/accents folded (ä→a, ß→ss), punctuation → space. */
function normalizeText(s) {
  return String(s == null ? '' : s)
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Code form: no spaces / dashes / dots (EAN "400 638 1333931", "AN-K2N4P6X" ≙ "ank2n4p6x"). */
function normalizeCode(s) {
  return normalizeText(s).replace(/ /g, '')
}

function stripHtml(s) {
  return String(s == null ? '' : s).replace(/<[^>]*>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&[a-z]+;/gi, ' ')
}

function words(s) {
  const n = normalizeText(s)
  return n ? n.split(' ') : []
}

/** Damerau-free Levenshtein with an early exit once `max` is exceeded. */
function levenshtein(a, b, max = 2) {
  if (a === b) return 0
  const la = a.length
  const lb = b.length
  if (Math.abs(la - lb) > max) return max + 1
  let prev = new Array(lb + 1)
  for (let j = 0; j <= lb; j++) prev[j] = j
  for (let i = 1; i <= la; i++) {
    const cur = [i]
    let rowMin = i
    for (let j = 1; j <= lb; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost)
      if (cur[j] < rowMin) rowMin = cur[j]
    }
    if (rowMin > max) return max + 1
    prev = cur
  }
  return prev[lb]
}

/** Allowed typo distance for a query token. */
function fuzzyBudget(token) {
  if (token.length >= 8) return 2
  if (token.length >= 4) return 1
  return 0
}

/* ── index ────────────────────────────────────────────────────────────────── */

const FIELD_WEIGHTS = {
  title: { exact: 40, prefix: 30, infix: 20, fuzzy: 16 },
  brand: { exact: 32, prefix: 24, infix: 14, fuzzy: 12 },
  category: { exact: 26, prefix: 20, infix: 12, fuzzy: 10 },
  seller: { exact: 14, prefix: 10, infix: 6, fuzzy: 5 },
  attrs: { exact: 10, prefix: 8, infix: 5, fuzzy: 4 },
  desc: { exact: 6, prefix: 5, infix: 3, fuzzy: 3 },
}

/** Typo match against the whole word or its beginning ("heisenbrg" ≈ "heisenbergde"). */
function fuzzyHit(token, word, budget) {
  // Cheap pre-filter: typos rarely hit the first letter, and it keeps large catalogs fast.
  if (!budget || word[0] !== token[0] || word.length + budget < token.length) return false
  if (levenshtein(token, word, budget) <= budget) return true
  return word.length > token.length && levenshtein(token, word.slice(0, token.length), budget) <= budget
}

function uniq(list) {
  return [...new Set(list.filter(Boolean))]
}

function categoryNames(cat) {
  if (!cat) return []
  const out = [cat.name]
  const tr = cat.metadata && typeof cat.metadata === 'object' ? cat.metadata.translations : null
  if (tr && typeof tr === 'object') {
    for (const loc of Object.values(tr)) {
      if (!loc || typeof loc !== 'object') continue
      out.push(loc.name)
      out.push(loc.keywords, loc.seo_keywords)
    }
  }
  return uniq(out.map((x) => (x == null ? '' : String(x))))
}

function categoryDisplayName(cat, locale) {
  if (!cat) return ''
  const tr = cat.metadata && typeof cat.metadata === 'object' ? cat.metadata.translations : null
  const loc = String(locale || 'de').slice(0, 2).toLowerCase()
  return String((tr && tr[loc] && tr[loc].name) || cat.name || '')
}

function productCategoryIds(p) {
  const m = p && p.metadata && typeof p.metadata === 'object' ? p.metadata : {}
  const ids = []
  if (Array.isArray(m.category_ids)) ids.push(...m.category_ids)
  ids.push(m.admin_category_id, m.category_id)
  if (Array.isArray(p.categories)) for (const c of p.categories) ids.push(c && c.id)
  return uniq(ids.map((x) => (x == null ? '' : String(x).trim().toLowerCase())))
}

function productTitles(p) {
  const out = [p.title]
  const tr = p.metadata && typeof p.metadata === 'object' ? p.metadata.translations : null
  if (tr && typeof tr === 'object') for (const loc of Object.values(tr)) if (loc && loc.title) out.push(loc.title)
  return uniq(out.map((x) => (x == null ? '' : String(x))))
}

function productAttrs(p) {
  const out = []
  const m = p.metadata && typeof p.metadata === 'object' ? p.metadata : {}
  const mf = m.metafields && typeof m.metafields === 'object' ? m.metafields : {}
  for (const v of Object.values(mf)) {
    if (v == null) continue
    if (typeof v === 'object') out.push(...Object.values(v).filter((x) => typeof x === 'string' || typeof x === 'number'))
    else out.push(v)
  }
  for (const v of Array.isArray(p.variants) ? p.variants : []) {
    if (Array.isArray(v && v.option_values)) out.push(...v.option_values)
    if (v && v.title) out.push(v.title)
  }
  if (m.hersteller) out.push(m.hersteller)
  return uniq(out.map((x) => String(x)))
}

/**
 * @param {Array<object>} products  store products (listStoreProducts)
 * @param {Array<object>} categories  admin_hub_categories rows {id,name,slug,parent_id,metadata}
 * @param {Map<string,string[]>} anIdsByProduct  product id → [parent AN-ID, variant AN-IDs…]
 */
function buildSearchIndex(products, categories, anIdsByProduct = new Map()) {
  const catById = new Map()
  for (const c of categories || []) if (c && c.id != null) catById.set(String(c.id).trim().toLowerCase(), c)
  const ancestorsOf = (id) => {
    const out = []
    const seen = new Set()
    let cur = catById.get(id)
    while (cur && cur.parent_id != null && !seen.has(String(cur.id))) {
      seen.add(String(cur.id))
      const pid = String(cur.parent_id).trim().toLowerCase()
      const parent = catById.get(pid)
      if (!parent) break
      out.push(pid)
      cur = parent
    }
    return out
  }

  const docs = []
  for (const p of products || []) {
    if (!p || !p.id) continue
    const m = p.metadata && typeof p.metadata === 'object' ? p.metadata : {}
    const ownCats = productCategoryIds(p)
    const allCats = uniq([...ownCats, ...ownCats.flatMap(ancestorsOf)])
    const variantCodes = []
    for (const v of Array.isArray(p.variants) ? p.variants : []) {
      if (!v) continue
      variantCodes.push(v.sku, v.ean, v.id, v.an_id)
      if (v.metadata && typeof v.metadata === 'object') variantCodes.push(v.metadata.sku, v.metadata.ean)
    }
    const codes = uniq([
      p.id, p.handle, p.slug, p.sku, p.ean, m.ean, m.sku, m.an_id,
      ...(anIdsByProduct.get(String(p.id)) || []),
      ...variantCodes,
      ...allCats,
    ].map((x) => (x == null ? '' : normalizeCode(x))).filter((c) => c.length >= 3))
    const fields = {
      title: uniq(productTitles(p).flatMap(words)),
      brand: words(m.brand_name || ''),
      category: uniq(allCats.flatMap((id) => categoryNames(catById.get(id))).flatMap(words)),
      seller: words(m.seller_name || m.shop_name || ''),
      attrs: uniq(productAttrs(p).flatMap(words)),
      desc: uniq(words(stripHtml(p.description || '')).slice(0, 400)),
    }
    docs.push({
      product: p,
      codes,
      fields,
      titleText: normalizeText(productTitles(p).join(' | ')),
      categoryIds: allCats,
      ownCategoryIds: ownCats,
      brand: m.brand_name ? { name: String(m.brand_name), handle: m.brand_handle || null } : null,
      popularity: Math.log10(1 + (Number(m.sales_count) || 0)) * 4 + (m.is_bestseller ? 3 : 0)
        + (Number(m.review_avg) || 0) * Math.log10(1 + (Number(m.review_count) || 0)),
    })
  }

  // Vocabulary for "did you mean": every title / brand / category word.
  const vocab = new Set()
  for (const d of docs) for (const w of [...d.fields.title, ...d.fields.brand, ...d.fields.category]) if (w.length >= 3) vocab.add(w)

  return { docs, catById, vocab, builtAt: Date.now() }
}

/* ── scoring ──────────────────────────────────────────────────────────────── */

function matchField(token, fieldWords, weights, allowPrefix) {
  let best = 0
  let kind = ''
  const budget = fuzzyBudget(token)
  for (const w of fieldWords) {
    if (w === token) return { score: weights.exact, kind: 'exact' }
    if (allowPrefix && token.length >= 2 && w.startsWith(token)) {
      if (weights.prefix > best) { best = weights.prefix; kind = 'prefix' }
    } else if (token.length >= 3 && w.includes(token)) {
      if (weights.infix > best) { best = weights.infix; kind = 'infix' }
    } else if (weights.fuzzy > best && fuzzyHit(token, w, budget)) {
      best = weights.fuzzy
      kind = 'fuzzy'
    }
  }
  return { score: best, kind }
}

function scoreDoc(doc, q) {
  let score = 0
  let codeHit = false
  if (q.code.length >= 3) {
    if (doc.codes.includes(q.code)) { score += 1000; codeHit = true }
    else if (q.code.length >= 5 && doc.codes.some((c) => c.startsWith(q.code))) { score += 300; codeHit = true }
  }
  let matched = 0
  let fuzzyOnly = 0
  q.tokens.forEach((t, i) => {
    // Only the last token may be a prefix ("haush" while typing "haushalt").
    const allowPrefix = i === q.tokens.length - 1 || t.length >= 4
    let best = { score: 0, kind: '' }
    for (const [field, weights] of Object.entries(FIELD_WEIGHTS)) {
      const r = matchField(t, doc.fields[field], weights, allowPrefix)
      if (r.score > best.score) best = r
    }
    if (best.score > 0) {
      matched += 1
      if (best.kind === 'fuzzy') fuzzyOnly += 1
      score += best.score
    }
  })
  const allMatched = q.tokens.length > 0 && matched === q.tokens.length
  if (allMatched && q.tokens.length > 1) score += 25
  if (q.text && doc.titleText.includes(q.text)) score += q.tokens.length > 1 ? 45 : 15
  if (q.text && doc.titleText.startsWith(q.text)) score += 15
  if (score > 0) score += doc.popularity
  return { score, matched, allMatched, fuzzyOnly, codeHit }
}

function parseQuery(raw) {
  const text = normalizeText(raw)
  return { raw: String(raw || '').trim(), text, tokens: text ? text.split(' ').filter(Boolean) : [], code: normalizeCode(raw) }
}

function didYouMean(index, q) {
  let changed = false
  const fixed = q.tokens.map((t) => {
    if (index.vocab.has(t) || t.length < 4) return t
    let best = null
    let bestDist = fuzzyBudget(t) + 1
    for (const w of index.vocab) {
      const d = levenshtein(t, w, fuzzyBudget(t))
      if (d < bestDist) { bestDist = d; best = w }
    }
    if (best) { changed = true; return best }
    return t
  })
  return changed ? fixed.join(' ') : null
}

/**
 * @returns {{ mode: 'exact'|'related'|'popular', total: number, hits: Array<{doc, score}>, did_you_mean: string|null }}
 */
function searchIndex(index, raw, { limit = 24 } = {}) {
  const q = parseQuery(raw)
  if (!q.tokens.length && !q.code) return { mode: 'popular', total: 0, hits: [], did_you_mean: null, query: q }
  const scored = index.docs.map((doc) => ({ doc, ...scoreDoc(doc, q) })).filter((x) => x.score > 0)
  const byScore = (a, b) => b.score - a.score

  const exact = scored.filter((x) => x.codeHit || x.allMatched).sort(byScore)
  if (exact.length) {
    return { mode: 'exact', total: exact.length, hits: exact.slice(0, limit), did_you_mean: null, query: q }
  }

  // Related: best partial matches, then products that share a category with them.
  const partial = scored.sort(byScore)
  const related = [...partial]
  const seen = new Set(related.map((x) => x.doc.product.id))
  // The hits' own categories plus their parents, so siblings ("Trockner" next to
  // "Waschmaschinen" under "Haushaltsgeräte") count as related too.
  const relatedCats = new Set(partial.slice(0, 5).flatMap((x) => [
    ...x.doc.ownCategoryIds,
    ...x.doc.ownCategoryIds.map((id) => {
      const cat = index.catById.get(id)
      return cat && cat.parent_id != null ? String(cat.parent_id).trim().toLowerCase() : ''
    }),
  ].filter(Boolean)))
  if (relatedCats.size) {
    for (const doc of index.docs) {
      if (seen.has(doc.product.id)) continue
      if (doc.categoryIds.some((c) => relatedCats.has(c))) {
        related.push({ doc, score: 1 + doc.popularity })
        seen.add(doc.product.id)
      }
    }
  }
  const dym = didYouMean(index, q)
  if (related.length) {
    return { mode: 'related', total: related.length, hits: related.slice(0, limit), did_you_mean: dym, query: q }
  }
  // Nothing at all: most popular products so the page is never empty.
  const popular = [...index.docs].sort((a, b) => b.popularity - a.popularity).map((doc) => ({ doc, score: doc.popularity }))
  return { mode: 'popular', total: popular.length, hits: popular.slice(0, limit), did_you_mean: dym, query: q }
}

/** Categories + brands for the result panel: name matches first, then where the hits live. */
function searchFacets(index, result, locale, { maxCategories = 6, maxBrands = 5 } = {}) {
  const q = result.query
  // Nothing matched: the fallback products say nothing about the query.
  if (result.mode === 'popular') return { categories: [], brands: [] }
  const catScore = new Map()
  if (q && q.tokens.length) {
    for (const [id, cat] of index.catById) {
      if (cat.is_visible === false || cat.active === false) continue
      const ws = uniq(categoryNames(cat).flatMap(words))
      let s = 0
      for (const t of q.tokens) {
        const r = matchField(t, ws, FIELD_WEIGHTS.category, true)
        s += r.score
      }
      if (s > 0) catScore.set(id, (catScore.get(id) || 0) + s * 2)
    }
  }
  const brandCount = new Map()
  for (const h of result.hits) {
    for (const id of h.doc.ownCategoryIds) catScore.set(id, (catScore.get(id) || 0) + 3)
    if (h.doc.brand) {
      const key = h.doc.brand.name
      const cur = brandCount.get(key) || { ...h.doc.brand, count: 0 }
      cur.count += 1
      brandCount.set(key, cur)
    }
  }
  const productCount = (id) => index.docs.filter((d) => d.categoryIds.includes(id)).length
  const categories = [...catScore.entries()]
    .map(([id, score]) => ({ id, score, cat: index.catById.get(id) }))
    .filter((x) => x.cat && x.cat.slug && x.cat.is_visible !== false && x.cat.active !== false)
    .map((x) => ({ id: x.cat.id, name: categoryDisplayName(x.cat, locale), slug: String(x.cat.slug).replace(/^\//, ''), count: productCount(x.id), score: x.score }))
    .filter((x) => x.count > 0)
    .sort((a, b) => b.score - a.score || b.count - a.count)
    .slice(0, maxCategories)
    .map(({ score, ...rest }) => rest)
  const brands = [...brandCount.values()].sort((a, b) => b.count - a.count).slice(0, maxBrands)
  return { categories, brands }
}

/** Query completions: product titles / categories / brands that start with what was typed. */
function searchSuggestions(index, result, locale, facets, max = 6) {
  const q = result.query
  if (!q || !q.text) return []
  const out = []
  const push = (s) => {
    const v = String(s || '').trim()
    if (v && !out.some((x) => x.toLowerCase() === v.toLowerCase()) && normalizeText(v) !== q.text) out.push(v)
  }
  const lastTok = q.tokens[q.tokens.length - 1] || ''
  const relevant = (name) => q.tokens.some((t) => normalizeText(name).split(' ').some((w) => w.startsWith(t)))
  if (result.did_you_mean) push(result.did_you_mean)
  if (result.mode === 'popular') return out.slice(0, max)
  for (const c of facets.categories) if (relevant(c.name)) push(c.name)
  for (const b of facets.brands) if (relevant(b.name)) push(b.name)
  if (result.mode === 'exact') {
    for (const h of result.hits.slice(0, 8)) {
      const title = String(h.doc.product.title || '')
      const ws = title.split(/\s+/)
      // Short, readable completion: the title cut right after the word that matched last.
      const idx = ws.findIndex((w) => normalizeText(w).startsWith(lastTok))
      if (idx >= 0) push(ws.slice(0, Math.min(ws.length, idx + 2)).join(' ').replace(/[\s|,;:–-]+$/, ''))
    }
  }
  return out.slice(0, max)
}

/* ── loader (cached, stale-while-revalidate) ──────────────────────────────── */

const INDEX_TTL_MS = 60_000
let cachedIndex = null
let inflight = null

async function loadAnIds(client) {
  const map = new Map()
  try {
    const r = await client.query(
      `SELECT id::text AS id, an_id,
              (SELECT array_agg(v->>'an_id') FROM jsonb_array_elements(
                 CASE WHEN jsonb_typeof(COALESCE(variants::jsonb, 'null'::jsonb)) = 'array' THEN variants::jsonb ELSE '[]'::jsonb END
               ) v WHERE v->>'an_id' IS NOT NULL) AS variant_an_ids
         FROM admin_hub_products
        WHERE an_id IS NOT NULL OR variants IS NOT NULL`,
    )
    for (const row of r.rows || []) {
      const ids = [row.an_id, ...(Array.isArray(row.variant_an_ids) ? row.variant_an_ids : [])].filter(Boolean)
      if (ids.length) map.set(String(row.id), ids)
    }
  } catch (_) { /* older DB without an_id */ }
  return map
}

async function buildIndexFromDb({ listStoreProducts, getPooledClient }) {
  const products = await listStoreProducts({ limit: 10000 })
  let categories = []
  let anIds = new Map()
  const client = getPooledClient()
  if (client) {
    await client.connect()
    try {
      const r = await client.query('SELECT id, name, slug, parent_id, metadata, active, is_visible FROM admin_hub_categories')
      categories = r.rows || []
      anIds = await loadAnIds(client)
    } finally {
      try { await client.end() } catch (_) {}
    }
  }
  return buildSearchIndex(products, categories, anIds)
}

/** Fresh for 60s; afterwards the stale index answers immediately while a rebuild runs. */
async function getSearchIndex(deps) {
  const now = Date.now()
  if (cachedIndex && now - cachedIndex.builtAt < INDEX_TTL_MS) return cachedIndex
  if (!inflight) {
    inflight = buildIndexFromDb(deps)
      .then((idx) => { cachedIndex = idx; return idx })
      .finally(() => { inflight = null })
  }
  if (cachedIndex) {
    inflight.catch((err) => console.error('Search index refresh failed:', err && err.message))
    return cachedIndex
  }
  return inflight
}

module.exports = {
  normalizeText,
  normalizeCode,
  levenshtein,
  buildSearchIndex,
  searchIndex,
  searchFacets,
  searchSuggestions,
  getSearchIndex,
}
