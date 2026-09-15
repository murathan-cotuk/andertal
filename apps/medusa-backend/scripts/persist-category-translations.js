/**
 * Persist localized category names into metadata.translations for de/tr/fr/es/it.
 * Canonical English stays in admin_hub_categories.name (and translations.en.name).
 *
 * Usage (from apps/medusa-backend):
 *   node scripts/persist-category-translations.js --dry-run
 *   node scripts/persist-category-translations.js
 *   node scripts/persist-category-translations.js --force
 *
 * Prefers DEEPL_AUTH_KEY; otherwise uses Google clients5 translate in batches.
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') })
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env.local') })

const { Client } = require('pg')
const { translateTexts } = require('../src/deepl-translate')
const { glossaryLookup } = require('../src/amazon-category-name-glossary')
const {
  TARGET_LOCALES,
  normalizeName,
  applyCategoryLocaleNames,
} = require('../src/category-translation-persist')

const CHUNK = 15
const CONCURRENCY = 5
const DELAY_MS = 50
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

function parseClients5(json, expected) {
  if (typeof json === 'string') return expected === 1 ? [json] : []
  if (!Array.isArray(json)) return []
  return json.map((item) => {
    if (typeof item === 'string') return item
    if (Array.isArray(item) && typeof item[0] === 'string') return item[0]
    return ''
  })
}

async function fetchClients5(names, targetLang) {
  const url = new URL('https://clients5.google.com/translate_a/t')
  url.searchParams.set('client', 'dict-chrome-ex')
  url.searchParams.set('sl', 'en')
  url.searchParams.set('tl', targetLang)
  for (const n of names) url.searchParams.append('q', n)
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      const r = await fetch(url, {
        headers: { 'User-Agent': UA, Accept: 'application/json' },
        signal: AbortSignal.timeout(20000),
      })
      if (r.status === 429 || r.status >= 500) {
        await sleep(900 * (attempt + 1))
        continue
      }
      const json = await r.json().catch(() => null)
      if (!r.ok || json == null) {
        await sleep(400 * (attempt + 1))
        continue
      }
      const parsed = parseClients5(json, names.length)
      if (parsed.length === names.length) return parsed
    } catch {
      await sleep(600 * (attempt + 1))
    }
  }
  return null
}

async function translateChunk(chunk, targetLang) {
  let parsed = await fetchClients5(chunk, targetLang)
  if (!parsed) {
    parsed = []
    for (const n of chunk) {
      const one = await fetchClients5([n], targetLang)
      parsed.push(one?.[0] || '')
      await sleep(DELAY_MS)
    }
  }
  return chunk.map((n, idx) => [n, String(parsed[idx] || '').trim()])
}

async function googleTranslateIndexed(names, targetLang, onBatch) {
  const out = new Map()
  if (!names.length) return out
  const chunks = []
  for (let i = 0; i < names.length; i += CHUNK) chunks.push(names.slice(i, i + CHUNK))
  let done = 0
  for (let i = 0; i < chunks.length; i += CONCURRENCY) {
    const group = chunks.slice(i, i + CONCURRENCY)
    const results = await Promise.all(group.map((chunk) => translateChunk(chunk, targetLang)))
    const pairs = []
    for (const batch of results) {
      for (const [n, tr] of batch) {
        if (tr) {
          out.set(n, tr)
          pairs.push([n, tr])
        }
      }
      done += batch.length
    }
    if (onBatch && pairs.length) await onBatch(pairs)
    if (done % 300 < CHUNK * CONCURRENCY || done >= names.length) {
      process.stdout.write(`${Math.min(done, names.length)}/${names.length} `)
    }
    await sleep(DELAY_MS)
  }
  return out
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

async function loadCache(client, texts, sourceLang, targetLang) {
  const map = new Map()
  const unique = [...new Set(texts.map((t) => String(t || '').trim()).filter(Boolean))]
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

async function saveCache(client, sourceLang, targetLang, pairs) {
  const srcs = []
  const trs = []
  for (const [src, tr] of pairs) {
    if (!src || !tr) continue
    srcs.push(src)
    trs.push(tr)
  }
  if (!srcs.length) return
  await client.query(
    `INSERT INTO i18n_translation_cache (source_lang, target_lang, source_text, translated_text, updated_at)
     SELECT $1, $2, x.source_text, x.translated_text, NOW()
     FROM unnest($3::text[], $4::text[]) AS x(source_text, translated_text)
     ON CONFLICT (source_lang, target_lang, source_text)
     DO UPDATE SET translated_text = EXCLUDED.translated_text, updated_at = NOW()`,
    [sourceLang, targetLang, srcs, trs],
  )
}

async function deeplMap(client, texts, targetLang) {
  const list = await translateTexts(texts, 'en', targetLang, { pgClient: client })
  const map = new Map()
  texts.forEach((t, i) => {
    const src = String(t || '').trim()
    const tr = list[i]
    if (src && tr) map.set(src, tr)
  })
  return map
}

async function buildLocaleMap(client, names, locale, useDeepL) {
  const map = new Map()
  const missing = []
  for (const n of names) {
    const g = glossaryLookup(n, locale)
    if (g) map.set(n, g)
    else missing.push(n)
  }
  const cached = await loadCache(client, missing, 'en', locale)
  const still = []
  for (const n of missing) {
    if (cached.has(n)) map.set(n, cached.get(n))
    else still.push(n)
  }
  if (!still.length) return map

  let produced = new Map()
  if (useDeepL) produced = await deeplMap(client, still, locale)
  const leftover = still.filter((n) => !produced.get(n))
  if (leftover.length) {
    const gmap = await googleTranslateIndexed(leftover, locale, (pairs) =>
      saveCache(client, 'en', locale, pairs),
    )
    for (const [k, v] of gmap) produced.set(k, v)
  }
  for (const n of still) {
    const tr = produced.get(n)
    if (tr) map.set(n, tr)
  }
  return map
}

async function main() {
  const dryRun = process.argv.includes('--dry-run')
  const force = process.argv.includes('--force')
  const url = process.env.DATABASE_URL
  if (!url || !url.startsWith('postgres')) {
    console.error('DATABASE_URL required')
    process.exit(1)
  }
  const useDeepL = Boolean(String(process.env.DEEPL_AUTH_KEY || '').trim())
  const client = new Client({
    connectionString: url,
    ssl: url.includes('render.com') ? { rejectUnauthorized: false } : undefined,
  })
  await client.connect()
  await ensureCacheTable(client)
  const rows = await client.query(`SELECT id, name, metadata FROM admin_hub_categories`)
  const names = [...new Set((rows.rows || []).map((r) => normalizeName(r.name)).filter(Boolean))]
  console.log(
    `Categories: ${rows.rows.length}, unique names: ${names.length}, deepl: ${useDeepL ? 'yes' : 'gtx fallback'}, dryRun: ${dryRun}, force: ${force}`,
  )

  const maps = {}
  for (const loc of TARGET_LOCALES) {
    process.stdout.write(`Translating → ${loc} … `)
    maps[loc] = await buildLocaleMap(client, names, loc, useDeepL)
    console.log(`done ${maps[loc].size}/${names.length}`)
  }

  const appliances = names.find((n) => n.toLowerCase() === 'appliances')
  if (appliances) {
    console.log('Appliances FR:', maps.fr.get(appliances) || glossaryLookup(appliances, 'fr'))
  }

  let updated = 0
  let skipped = 0
  if (!dryRun) await client.query('BEGIN')
  try {
    for (const row of rows.rows) {
      const sourceName = normalizeName(row.name)
      const nameByLocale = {}
      for (const loc of TARGET_LOCALES) nameByLocale[loc] = maps[loc].get(sourceName) || ''
      const next = applyCategoryLocaleNames(row, nameByLocale, { sourceName, force })
      if (!next.changed) {
        skipped += 1
        continue
      }
      updated += 1
      if (dryRun) continue
      await client.query(
        `UPDATE admin_hub_categories SET metadata = $2::jsonb, updated_at = NOW() WHERE id = $1::uuid`,
        [row.id, JSON.stringify(next.metadata)],
      )
    }
    if (!dryRun) await client.query('COMMIT')
  } catch (e) {
    if (!dryRun) await client.query('ROLLBACK')
    throw e
  }

  console.log(JSON.stringify({ updated, skipped, dryRun }, null, 2))
  await client.end()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
