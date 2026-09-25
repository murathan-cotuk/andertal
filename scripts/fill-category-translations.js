/**
 * Fixes category translations across the whole admin_hub_categories table.
 *
 * Root cause (see docs/TASKS.md investigation, 2026-09-24): two different generation
 * mechanisms wrote metadata.translations for categories:
 *   - "Group A" (metadata.translations.de.name present, es.* has NO `_auto` marker):
 *     populated by scripts/fill-category-excel-i18n.js, a word-by-word dictionary
 *     substitution with a small, incomplete vocabulary. Any English word missing from
 *     its dictionary was left untranslated verbatim, producing hybrids like
 *     "Spielzeug Cash Registers" (only "Toy" got translated, "Cash Registers" didn't).
 *     It also overwrote the canonical `name` column with that broken de value, even
 *     though category-auto-translate.js's architecture expects `name` to stay the
 *     clean English source.
 *   - "Group B" (metadata.translations.es._auto present): a real auto-translate pass
 *     produced good es/fr/it/tr names, but never generated German at all, and never
 *     generated description/SEO content in any locale.
 *
 * This script re-derives every non-English name from the (always-clean) English name
 * via a supplied translation map, regenerates description/seo_title/seo_description/
 * seo_keywords from this site's fixed per-locale template (verified byte-identical
 * across multiple sampled categories — this is templated boilerplate, not free-form
 * content, so no translation judgment is needed for it), and restores the canonical
 * `name` column to the English value.
 *
 * Usage:
 *   node scripts/fix-category-translations.js --translations <path-to-name-map.json> \
 *     --chunk-index 0 --chunk-count 8 [--dry-run] [--limit N]
 *
 * <name-map.json> shape: { "English Name": { de, es, fr, it, tr } }  (any subset of
 * locales; only locales present in the map are used — others are left untouched).
 *
 * Writes a JSONL backup of every row's PRE-CHANGE metadata to
 * scripts/_category-translation-backups/chunk-<index>.jsonl before updating it.
 */
'use strict'
const fs = require('fs')
const path = require('path')
const { Client } = require('pg')

require('dotenv').config({ path: path.join(__dirname, '..', 'apps', 'medusa-backend', '.env') })

const LOCALES = ['de', 'es', 'fr', 'it', 'tr']

const TEMPLATES = {
  en: {
    description: (n) => `<h2>${n}</h2>\r\n<p>Discover <strong>${n}</strong> at Andertal. This category gathers products so you can compare options and find the right fit.</p>\r\n<p>Browse ${n} and related accessories with EU delivery.</p>`,
    seo_title: (n) => `${n} | Andertal`,
    seo_description: (n) => `Shop ${n} at Andertal. Wide selection, clear product data and delivery across the EU.`,
  },
  de: {
    description: (n) => `<h2>${n}</h2>\r\n<p>Entdecken Sie <strong>${n}</strong> bei Andertal. In dieser Kategorie finden Sie passende Produkte zum Vergleichen und Auswählen.</p>\r\n<p>Stöbern Sie in ${n} und verwandtem Zubehör — Lieferung in der EU.</p>`,
    seo_title: (n) => `${n} | Andertal`,
    seo_description: (n) => `${n} bei Andertal kaufen. Große Auswahl, klare Produktdaten und Lieferung in der EU.`,
  },
  es: {
    description: (n) => `<h2>${n}</h2>\r\n<p>Descubre <strong>${n}</strong> en Andertal. En esta categoría comparas productos y encuentras lo que encaja.</p>\r\n<p>Explora ${n} y accesorios relacionados — envío en la UE.</p>`,
    seo_title: (n) => `${n} | Andertal`,
    seo_description: (n) => `Compra ${n} en Andertal. Amplia selección, fichas claras y envío en la UE.`,
  },
  fr: {
    description: (n) => `<h2>${n}</h2>\r\n<p>Découvrez <strong>${n}</strong> sur Andertal. Cette catégorie rassemble des produits à comparer pour trouver le bon article.</p>\r\n<p>Parcourez ${n} et les accessoires associés — livraison dans l’UE.</p>`,
    seo_title: (n) => `${n} | Andertal`,
    seo_description: (n) => `Achetez ${n} sur Andertal. Large choix, fiches claires et livraison dans l’UE.`,
  },
  it: {
    description: (n) => `<h2>${n}</h2>\r\n<p>Scopri <strong>${n}</strong> su Andertal. In questa categoria confronti i prodotti e scegli quello giusto.</p>\r\n<p>Esplora ${n} e gli accessori correlati — consegna in UE.</p>`,
    seo_title: (n) => `${n} | Andertal`,
    seo_description: (n) => `Acquista ${n} su Andertal. Ampia scelta, schede chiare e consegna in UE.`,
  },
  tr: {
    description: (n) => `<h2>${n}</h2>\r\n<p>Andertal’da <strong>${n}</strong> kategorisini keşfedin. Ürünleri karşılaştırıp size uygun olanı bulun.</p>\r\n<p>${n} ve ilgili aksesuarlara göz atın; AB teslimatı.</p>`,
    seo_title: (n) => `${n} | Andertal`,
    seo_description: (n) => `Andertal’da ${n}. Geniş seçim, net ürün bilgisi ve AB teslimatı.`,
  },
}

function keywordsFor(name) {
  const lower = String(name || '').trim().toLowerCase()
  const words = lower.split(/\s+/).filter(Boolean)
  return [...new Set([lower, ...words])].join(', ')
}

function buildLocaleBlock(locale, name) {
  const t = TEMPLATES[locale]
  const description = t.description(name)
  return {
    name,
    description,
    long_content: description,
    seo_title: t.seo_title(name),
    seo_description: t.seo_description(name),
    seo_keywords: keywordsFor(name),
    keywords: keywordsFor(name),
  }
}

function parseArgs() {
  const args = process.argv.slice(2)
  const out = { chunkIndex: 0, chunkCount: 1, dryRun: false, limit: null, translationsPath: null, ids: null }
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '--chunk-index') out.chunkIndex = parseInt(args[++i], 10)
    else if (a === '--chunk-count') out.chunkCount = parseInt(args[++i], 10)
    else if (a === '--dry-run') out.dryRun = true
    else if (a === '--limit') out.limit = parseInt(args[++i], 10)
    else if (a === '--translations') out.translationsPath = args[++i]
    else if (a === '--ids') out.ids = args[++i].split(',').map((s) => s.trim()).filter(Boolean)
    else if (a === '--dump-missing') out.dumpMissingPath = args[++i]
  }
  if (!out.translationsPath) throw new Error('--translations <path> is required')
  return out
}

async function main() {
  const opts = parseArgs()
  const nameMap = JSON.parse(fs.readFileSync(opts.translationsPath, 'utf8'))

  const dbUrl = (process.env.DATABASE_URL || '').trim().replace(/^postgresql:\/\//, 'postgres://')
  if (!dbUrl.startsWith('postgres')) throw new Error('DATABASE_URL not configured')
  const client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
  await client.connect()

  const backupDir = path.join(__dirname, '_category-translation-backups')
  fs.mkdirSync(backupDir, { recursive: true })
  const backupPath = path.join(backupDir, `chunk-${opts.chunkIndex}.jsonl`)
  const backupStream = fs.createWriteStream(backupPath, { flags: 'a' })

  // Deterministic disjoint partition across all chunks, ordered by id — or an explicit
  // id list for targeted testing/retries.
  const res = opts.ids
    ? await client.query(`SELECT id, name, metadata FROM admin_hub_categories WHERE id = ANY($1::uuid[])`, [opts.ids])
    : await client.query(
        `SELECT id, name, metadata FROM (
           SELECT id, name, metadata, ntile($1) OVER (ORDER BY id) AS bucket
           FROM admin_hub_categories
         ) t WHERE bucket = $2`,
        [opts.chunkCount, opts.chunkIndex + 1]
      )
  let rows = res.rows
  if (opts.limit) rows = rows.slice(0, opts.limit)

  let updated = 0, skippedNoName = 0, skippedNoTranslation = 0, errors = 0
  const missingNames = new Set()

  for (const row of rows) {
    try {
      const meta = row.metadata && typeof row.metadata === 'object' ? row.metadata : {}
      const tr = meta.translations && typeof meta.translations === 'object' ? meta.translations : {}
      const enName = String(tr.en?.name || '').trim()
      if (!enName) { skippedNoName++; continue }

      const isGroupB = !!(tr.es && typeof tr.es === 'object' && tr.es._auto)
      const map = nameMap[enName]

      const nextTr = { ...tr, en: tr.en }
      let changed = false

      for (const locale of LOCALES) {
        const needsName = isGroupB ? locale === 'de' : true // Group B: only de is missing/needed. Group A: all 5 are bad.
        if (needsName) {
          const translated = map && map[locale] ? String(map[locale]).trim() : ''
          if (!translated) { missingNames.add(enName); continue }
          nextTr[locale] = buildLocaleBlock(locale, translated)
          changed = true
        } else {
          // Group B locale already has a good name from the real auto-translate pass —
          // keep its name, only backfill description/SEO if missing (it never had any).
          const existing = tr[locale] && typeof tr[locale] === 'object' ? tr[locale] : {}
          const existingName = String(existing.name || '').trim()
          if (!existingName) { missingNames.add(enName); continue }
          if (!existing.description) {
            nextTr[locale] = { ...existing, ...buildLocaleBlock(locale, existingName), name: existingName }
            changed = true
          }
        }
      }

      // English itself: Group B categories mostly have no description/SEO at all yet —
      // backfill from the same template. Group A's English content is already fine
      // (the dictionary bug never touched English), so only fill if missing.
      if (!tr.en?.description) {
        nextTr.en = { ...(tr.en || {}), ...buildLocaleBlock('en', enName), name: enName }
        changed = true
      }

      if (!changed) continue

      const nextMeta = { ...meta, translations: nextTr }
      const nextName = enName // Restore canonical name to the clean English source.

      if (!opts.dryRun) {
        backupStream.write(JSON.stringify({ id: row.id, before: { name: row.name, translations: tr } }) + '\n')
        await client.query('UPDATE admin_hub_categories SET name = $1, metadata = $2::jsonb, updated_at = now() WHERE id = $3', [
          nextName, JSON.stringify(nextMeta), row.id,
        ])
      }
      updated++
    } catch (e) {
      errors++
      console.error('row error', row.id, e.message)
    }
  }

  backupStream.end()
  await client.end()

  if (opts.dumpMissingPath) {
    fs.writeFileSync(opts.dumpMissingPath, JSON.stringify([...missingNames].sort(), null, 1))
  }

  console.log(JSON.stringify({
    chunk: opts.chunkIndex, chunkCount: opts.chunkCount, totalRows: rows.length,
    updated, skippedNoName, skippedNoTranslation, errors,
    missingTranslationCount: missingNames.size,
    missingTranslationSample: [...missingNames].slice(0, 20),
    dryRun: opts.dryRun,
  }, null, 2))
}

main().catch((e) => { console.error(e); process.exit(1) })
