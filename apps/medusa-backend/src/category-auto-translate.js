/**
 * Auto-translate category names (canonical English in DB) via DeepL + Postgres cache.
 * Manual overrides in metadata.translations[locale].name take precedence.
 */

const ALLOWED = new Set(['en', 'de', 'tr', 'fr', 'es', 'it'])
const CHUNK_SIZE = 50
const DEFAULT_SYNC_LIMIT = 120
const SOURCE_LOCALE = String(process.env.CATEGORY_SOURCE_LOCALE || 'en').toLowerCase().slice(0, 2)

const warmupState = new Map()

function normalizeLocale(loc) {
  const l = String(loc || '').toLowerCase().slice(0, 2)
  return ALLOWED.has(l) ? l : ''
}

function deepLang(loc) {
  const u = String(loc || 'en').toUpperCase()
  const m = { EN: 'EN', DE: 'DE', TR: 'TR', FR: 'FR', IT: 'IT', ES: 'ES' }
  return m[u.slice(0, 2)] || 'EN'
}

function pgClientFromEnv() {
  const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
  if (!dbUrl || !dbUrl.startsWith('postgres')) return null
  const { Client } = require('pg')
  return new Client({
    connectionString: dbUrl,
    ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false,
  })
}

async function ensureCacheTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS i18n_translation_cache (
      source_lang VARCHAR(8) NOT NULL,
      target_lang VARCHAR(8) NOT NULL,
      source_text TEXT NOT NULL,
      translated_text TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (source_lang, target_lang, source_text)
    )
  `)
}

async function loadFromCache(client, texts, sourceLang, targetLang) {
  const map = new Map()
  const unique = [...new Set((texts || []).map((t) => String(t || '').trim()).filter(Boolean))]
  for (let i = 0; i < unique.length; i += 400) {
    const chunk = unique.slice(i, i + 400)
    const r = await client.query(
      `SELECT source_text, translated_text FROM i18n_translation_cache
       WHERE source_lang = $1 AND target_lang = $2 AND source_text = ANY($3::text[])`,
      [sourceLang, targetLang, chunk],
    )
    for (const row of r.rows || []) {
      if (row.source_text && row.translated_text) map.set(row.source_text, row.translated_text)
    }
  }
  return map
}

async function savePairsToCache(client, sourceLang, targetLang, pairs) {
  for (const [src, tr] of pairs) {
    const source_text = String(src || '').trim()
    const translated_text = String(tr || '').trim()
    if (!source_text || !translated_text) continue
    await client.query(
      `INSERT INTO i18n_translation_cache (source_lang, target_lang, source_text, translated_text, updated_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (source_lang, target_lang, source_text)
       DO UPDATE SET translated_text = EXCLUDED.translated_text, updated_at = NOW()`,
      [sourceLang, targetLang, source_text, translated_text],
    )
  }
}

async function deeplTranslateBatch(texts, sourceLocale, targetLocale) {
  const key = String(process.env.DEEPL_AUTH_KEY || '').trim()
  if (!key || !texts.length) return texts.map(() => null)
  const baseUrl =
    String(process.env.DEEPL_API_URL || '').trim() ||
    (key.endsWith(':fx') ? 'https://api-free.deepl.com/v2/translate' : 'https://api.deepl.com/v2/translate')
  const params = new URLSearchParams()
  params.set('auth_key', key)
  params.set('target_lang', deepLang(targetLocale))
  if (sourceLocale) params.set('source_lang', deepLang(sourceLocale))
  for (const t of texts) params.append('text', t)
  const r = await fetch(baseUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j.message || `DeepL HTTP ${r.status}`)
  const out = (j.translations || []).map((x) => String(x?.text || '').trim())
  while (out.length < texts.length) out.push(null)
  return out
}

function collectCategoryNodes(categories, out = []) {
  for (const c of categories || []) {
    if (!c) continue
    out.push(c)
    if (Array.isArray(c.children) && c.children.length) collectCategoryNodes(c.children, out)
  }
  return out
}

function manualCategoryName(category, locale) {
  const meta = category?.metadata && typeof category.metadata === 'object' ? category.metadata : {}
  const tr = meta.translations?.[locale]?.name
  return tr ? String(tr).trim() : ''
}

function canonicalCategoryName(category, sourceLang) {
  const meta = category?.metadata && typeof category.metadata === 'object' ? category.metadata : {}
  const fromMeta = meta.translations?.[sourceLang]?.name
  return String(fromMeta || category?.name || '').trim()
}

async function translateAndCache(client, texts, sourceLang, targetLang) {
  const map = new Map()
  const unique = [...new Set(texts.map((t) => String(t || '').trim()).filter(Boolean))]
  if (!unique.length) return map

  let cached = new Map()
  if (client) {
    await ensureCacheTable(client)
    cached = await loadFromCache(client, unique, sourceLang, targetLang)
  }

  const missing = unique.filter((t) => !cached.has(t))
  for (let i = 0; i < missing.length; i += CHUNK_SIZE) {
    const chunk = missing.slice(i, i + CHUNK_SIZE)
    try {
      const translated = await deeplTranslateBatch(chunk, sourceLang, targetLang)
      const pairs = []
      for (let j = 0; j < chunk.length; j++) {
        const tr = translated[j]
        if (tr) {
          cached.set(chunk[j], tr)
          pairs.push([chunk[j], tr])
        }
      }
      if (client && pairs.length) await savePairsToCache(client, sourceLang, targetLang, pairs)
    } catch (e) {
      console.warn('category-auto-translate chunk failed:', e?.message || e)
    }
  }
  return cached
}

function queueBackgroundWarmup(texts, sourceLang, targetLang) {
  const key = `${sourceLang}:${targetLang}`
  let state = warmupState.get(key)
  if (!state) {
    state = { queue: [], running: false }
    warmupState.set(key, state)
  }
  for (const t of texts) {
    const s = String(t || '').trim()
    if (s && !state.queue.includes(s)) state.queue.push(s)
  }
  if (state.running) return
  state.running = true
  setImmediate(async () => {
    const client = pgClientFromEnv()
    try {
      if (client) await client.connect()
      while (state.queue.length) {
        const batch = state.queue.splice(0, CHUNK_SIZE * 4)
        await translateAndCache(client, batch, sourceLang, targetLang)
        await new Promise((r) => setTimeout(r, 250))
      }
    } catch (e) {
      console.warn('category-auto-translate warmup:', e?.message || e)
    } finally {
      if (client) await client.end().catch(() => {})
      state.running = false
      if (state.queue.length) queueBackgroundWarmup([], sourceLang, targetLang)
    }
  })
}

/**
 * Apply localized names to category tree/list in place. Returns same reference.
 */
async function applyCategoryLocale(categories, targetLocale, opts = {}) {
  const locale = normalizeLocale(targetLocale)
  const sourceLang = normalizeLocale(opts.sourceLocale || SOURCE_LOCALE) || 'en'
  if (!locale || locale === sourceLang) return categories
  if (!Array.isArray(categories) || categories.length === 0) return categories

  const nodes = collectCategoryNodes(categories)
  const sourceTexts = []
  for (const node of nodes) {
    if (manualCategoryName(node, locale)) continue
    const src = canonicalCategoryName(node, sourceLang)
    if (src) sourceTexts.push(src)
  }
  const unique = [...new Set(sourceTexts)]
  if (!unique.length) return categories

  const syncLimit = Number(opts.syncLimit) > 0 ? Number(opts.syncLimit) : DEFAULT_SYNC_LIMIT
  const syncTexts = unique.slice(0, syncLimit)
  const asyncTexts = unique.slice(syncLimit)

  let client = opts.pgClient || null
  let ownsClient = false
  if (!client) {
    client = pgClientFromEnv()
    if (client) {
      ownsClient = true
      await client.connect()
    }
  }

  let cacheMap = new Map()
  try {
    cacheMap = await translateAndCache(client, syncTexts, sourceLang, locale)
    if (asyncTexts.length) queueBackgroundWarmup(asyncTexts, sourceLang, locale)
  } finally {
    if (ownsClient && client) await client.end().catch(() => {})
  }

  for (const node of nodes) {
    const manual = manualCategoryName(node, locale)
    const src = canonicalCategoryName(node, sourceLang)
    const localized = manual || cacheMap.get(src) || node.name
    if (localized) {
      node.name = localized
      if (node.title != null) node.title = localized
    }
  }
  return categories
}

async function warmAllCategoryNames(targetLocale, opts = {}) {
  const locale = normalizeLocale(targetLocale)
  const sourceLang = normalizeLocale(opts.sourceLocale || SOURCE_LOCALE) || 'en'
  if (!locale || locale === sourceLang) return { warmed: 0 }

  const client = opts.pgClient || pgClientFromEnv()
  if (!client) return { warmed: 0, error: 'no_db' }
  const ownsClient = !opts.pgClient
  if (ownsClient) await client.connect()

  try {
    const r = await client.query(`SELECT DISTINCT name FROM admin_hub_categories WHERE name IS NOT NULL AND TRIM(name) <> ''`)
    const names = (r.rows || []).map((row) => String(row.name || '').trim()).filter(Boolean)
    const unique = [...new Set(names)]
    await translateAndCache(client, unique, sourceLang, locale)
    return { warmed: unique.length, locale, sourceLang }
  } finally {
    if (ownsClient) await client.end().catch(() => {})
  }
}

module.exports = {
  applyCategoryLocale,
  warmAllCategoryNames,
  normalizeCategoryLocale: normalizeLocale,
  CATEGORY_SOURCE_LOCALE: SOURCE_LOCALE,
}
