/**
 * Auto-translate menu names / menu item labels via DeepL + shared Postgres cache
 * (same i18n_translation_cache table used by category-auto-translate.js).
 * Manual overrides in name_i18n[locale] / label_i18n[locale] take precedence.
 */

const logger = require('./logger')

const ALLOWED = new Set(['en', 'de', 'tr', 'fr', 'es', 'it'])
const CHUNK_SIZE = 50
const SOURCE_LOCALE = String(process.env.MENU_SOURCE_LOCALE || 'de').toLowerCase().slice(0, 2)

function normalizeLocale(loc) {
  const l = String(loc || '').toLowerCase().slice(0, 2)
  return ALLOWED.has(l) ? l : ''
}

function deepLang(loc) {
  const u = String(loc || 'en').toUpperCase()
  const m = { EN: 'EN', DE: 'DE', TR: 'TR', FR: 'FR', IT: 'IT', ES: 'ES' }
  return m[u.slice(0, 2)] || 'EN'
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
  if (!unique.length) return map
  const r = await client.query(
    `SELECT source_text, translated_text FROM i18n_translation_cache
     WHERE source_lang = $1 AND target_lang = $2 AND source_text = ANY($3::text[])`,
    [sourceLang, targetLang, unique],
  )
  for (const row of r.rows || []) {
    if (row.source_text && row.translated_text) map.set(row.source_text, row.translated_text)
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
      logger.warn('menu-auto-translate chunk failed:', e?.message || e)
    }
  }
  return cached
}

function manualOverride(i18nField, locale) {
  if (!i18nField || typeof i18nField !== 'object') return ''
  const v = i18nField[locale]
  return v ? String(v).trim() : ''
}

/**
 * Applies localized name/label to a menusWithItems array (as returned by
 * getStoreMenusFromDb) in place. Returns the same reference.
 */
async function applyMenuLocale(menusWithItems, targetLocale, opts = {}) {
  const locale = normalizeLocale(targetLocale)
  const sourceLang = normalizeLocale(opts.sourceLocale || SOURCE_LOCALE) || 'de'
  if (!Array.isArray(menusWithItems) || !menusWithItems.length) return menusWithItems
  if (!locale || locale === sourceLang) return menusWithItems

  const texts = []
  for (const menu of menusWithItems) {
    if (!manualOverride(menu.name_i18n, locale) && menu.name) texts.push(String(menu.name).trim())
    for (const item of menu.items || []) {
      if (!manualOverride(item.label_i18n, locale) && item.label) texts.push(String(item.label).trim())
    }
  }
  const unique = [...new Set(texts)]
  if (!unique.length) return menusWithItems

  let client = opts.pgClient || null
  let ownsClient = false
  if (!client) {
    const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
    if (dbUrl && dbUrl.startsWith('postgres')) {
      const { Client } = require('pg')
      client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
      ownsClient = true
      await client.connect()
    }
  }

  let cacheMap = new Map()
  try {
    cacheMap = await translateAndCache(client, unique, sourceLang, locale)
  } finally {
    if (ownsClient && client) await client.end().catch(() => {})
  }

  for (const menu of menusWithItems) {
    const manualName = manualOverride(menu.name_i18n, locale)
    if (manualName) {
      menu.name = manualName
    } else if (menu.name) {
      const translated = cacheMap.get(String(menu.name).trim())
      if (translated) menu.name = translated
    }
    for (const item of menu.items || []) {
      const manualLabel = manualOverride(item.label_i18n, locale)
      if (manualLabel) {
        item.label = manualLabel
      } else if (item.label) {
        const translated = cacheMap.get(String(item.label).trim())
        if (translated) item.label = translated
      }
    }
  }
  return menusWithItems
}

module.exports = {
  applyMenuLocale,
  normalizeMenuLocale: normalizeLocale,
  MENU_SOURCE_LOCALE: SOURCE_LOCALE,
}
