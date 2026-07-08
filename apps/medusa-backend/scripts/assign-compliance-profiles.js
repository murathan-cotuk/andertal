/**
 * Assign a compliance_profile_id to every row in admin_hub_categories
 * (docs/HUKUKI.md Faz 1 adım 3).
 *
 * Does NOT touch product validation (admin-products.js validateRequiredGpsrMetadata
 * keeps running unconditionally on all products) — this script only prepares the
 * category -> profile mapping so that step can safely become profile-conditional later.
 *
 * Matching: each category's own name+slug is tested against a keyword table
 * (DE/EN/TR) mapped to a profile id from src/compliance/compliance-profiles.json.
 * First matching profile wins (ordered narrow-to-broad, e.g. medical_device is
 * checked before the generic electronics/CE profiles). A category with no keyword
 * match inherits its nearest ancestor's resolved profile. A root category with no
 * match and no matched ancestor falls back to general_consumer_gpsr.
 *
 * Usage:
 *   node apps/medusa-backend/scripts/assign-compliance-profiles.js [--dry-run] [--force] [--csv path/to/overrides.csv]
 *
 *   --dry-run   Print the resulting assignment table, write nothing to the DB.
 *   --force     Overwrite categories that already have a metadata.compliance_profile_id
 *               (default: only fills in categories that don't have one yet).
 *   --csv       Optional CSV (semicolon-separated: category_slug_prefix;profile_id) of
 *               manual overrides, checked BEFORE the built-in keyword table. Use this
 *               to correct any mismatch without touching this script.
 *
 * Env: DATABASE_URL (same convention as the rest of apps/medusa-backend)
 */
require('dotenv').config()
try {
  require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.local') })
} catch (_) {}

const { Client } = require('pg')
const fs = require('fs')
const path = require('path')

const DATABASE_URL = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
const PROFILES = require('../src/compliance/compliance-profiles.json').profiles || {}
const FALLBACK_PROFILE = 'general_consumer_gpsr'

// Ordered narrow -> broad: first match wins. Keywords are matched as substrings
// (case-insensitive) against "<name> <slug>". DE/EN/TR mixed since this platform's
// categories and staff are a mix of all three.
const KEYWORD_RULES = [
  { profile: 'medical_device', keywords: ['medizinprodukt', 'medical device', 'tibbi cihaz', 'tıbbi cihaz'] },
  { profile: 'nicotine_tpd', keywords: ['e-zigarette', 'e-zigaretten', 'liquid', 'vape', 'nikotin', 'nicotine', 'e-sigara'] },
  { profile: 'food_supplement', keywords: ['nahrungsergänzung', 'supplement', 'takviye edici', 'takviye gıda', 'protein pulver'] },
  { profile: 'food', keywords: ['lebensmittel', 'food', 'gıda', 'getränk', 'beverage', 'içecek', 'snack', 'süßware', 'gewürz'] },
  { profile: 'cosmetics', keywords: ['kosmetik', 'cosmetic', 'kozmetik', 'parfüm', 'parfum', 'makeup', 'make-up', 'pflege', 'skincare'] },
  { profile: 'energy_labeled_eprel', keywords: ['kühlschrank', 'waschmaschine', 'geschirrspüler', 'fernseher', 'klimaanlage', 'refrigerator', 'washing machine', 'dishwasher', 'buzdolabı', 'çamaşır makinesi', 'klima'] },
  { profile: 'battery_containing', keywords: ['batterie', 'akku', 'battery', 'pil', 'batarya', 'powerbank'] },
  { profile: 'electronics_weee', keywords: ['elektronik', 'electronic', 'elektro', 'computer', 'bilgisayar', 'smartphone', 'handy', 'telefon', 'laptop', 'kamera', 'camera', 'haushaltsgerät', 'appliance'] },
  { profile: 'toys', keywords: ['spielzeug', 'toy', 'oyuncak'] },
  { profile: 'chemicals_reach', keywords: ['chemikalie', 'chemical', 'kimyasal', 'reiniger', 'detergent', 'lack', 'farbe', 'kleber', 'klebstoff', 'adhesive'] },
  { profile: 'textiles', keywords: ['textil', 'textile', 'tekstil', 'bekleidung', 'clothing', 'giyim', 'schuh', 'shoe', 'ayakkabı', 'kleidung'] },
  { profile: 'books_media', keywords: ['buch', 'book', 'kitap', 'medien', 'media', 'zeitschrift', 'magazine', 'dergi', 'hörbuch'] },
  { profile: 'digital_goods', keywords: ['digital', 'download', 'lizenz', 'license', 'e-book', 'software'] },
  { profile: 'ce_marked_general', keywords: ['maschine', 'machine', 'makine', 'werkzeug', 'power tool', 'elektrowerkzeug'] },
]

function normalize(s) {
  return String(s || '').toLowerCase()
}

function matchKeywordProfile(name, slug) {
  const hay = `${normalize(name)} ${normalize(slug)}`
  for (const rule of KEYWORD_RULES) {
    if (rule.keywords.some((kw) => hay.includes(kw))) return rule.profile
  }
  return null
}

function loadCsvOverrides(csvPath) {
  if (!csvPath) return []
  const resolved = path.resolve(csvPath)
  if (!fs.existsSync(resolved)) {
    console.error('CSV override file not found:', resolved)
    process.exit(1)
  }
  const lines = fs.readFileSync(resolved, 'utf8').split(/\r?\n/).filter((l) => l.trim())
  const rows = []
  for (let i = 1; i < lines.length; i++) {
    const [prefix, profileId] = lines[i].split(';').map((s) => (s || '').trim())
    if (prefix && profileId) rows.push({ prefix: prefix.toLowerCase(), profileId })
  }
  return rows
}

async function main() {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const force = args.includes('--force')
  const csvIdx = args.indexOf('--csv')
  const csvOverrides = csvIdx >= 0 ? loadCsvOverrides(args[csvIdx + 1]) : []

  const unknownProfiles = KEYWORD_RULES.filter((r) => !PROFILES[r.profile]).map((r) => r.profile)
  if (unknownProfiles.length) {
    console.error('Keyword table references unknown profile id(s):', unknownProfiles.join(', '))
    process.exit(1)
  }
  if (!PROFILES[FALLBACK_PROFILE]) {
    console.error('Fallback profile missing from compliance-profiles.json:', FALLBACK_PROFILE)
    process.exit(1)
  }

  if (!DATABASE_URL) {
    console.error('DATABASE_URL not set.')
    process.exit(1)
  }

  console.log(dryRun ? 'Running in --dry-run mode (no writes).' : 'Running LIVE (will write to admin_hub_categories.metadata).')
  const client = new Client({ connectionString: DATABASE_URL, ssl: DATABASE_URL.includes('render.com') ? { rejectUnauthorized: false } : false })
  await client.connect()

  const res = await client.query('SELECT id, name, slug, parent_id, metadata FROM admin_hub_categories')
  const rows = res.rows || []
  const byId = new Map(rows.map((r) => [r.id, r]))

  const resolvedCache = new Map() // id -> { profileId, source }

  function csvOverrideFor(slug) {
    const s = normalize(slug)
    const hit = csvOverrides.find((o) => s.startsWith(o.prefix))
    return hit ? hit.profileId : null
  }

  function resolveProfile(id, depth = 0) {
    if (depth > 50) return { profileId: FALLBACK_PROFILE, source: 'fallback(cycle-guard)' }
    if (resolvedCache.has(id)) return resolvedCache.get(id)
    const row = byId.get(id)
    if (!row) return { profileId: FALLBACK_PROFILE, source: 'fallback(missing-row)' }

    const csvHit = csvOverrideFor(row.slug)
    if (csvHit) {
      const result = { profileId: csvHit, source: 'csv-override' }
      resolvedCache.set(id, result)
      return result
    }

    const kwHit = matchKeywordProfile(row.name, row.slug)
    if (kwHit) {
      const result = { profileId: kwHit, source: 'keyword-match' }
      resolvedCache.set(id, result)
      return result
    }

    if (row.parent_id) {
      const parentResult = resolveProfile(row.parent_id, depth + 1)
      const result = { profileId: parentResult.profileId, source: `inherited(${parentResult.source})` }
      resolvedCache.set(id, result)
      return result
    }

    const result = { profileId: FALLBACK_PROFILE, source: 'fallback(root-no-match)' }
    resolvedCache.set(id, result)
    return result
  }

  const summary = {}
  const toWrite = []
  for (const row of rows) {
    const existing = row.metadata && typeof row.metadata === 'object' ? row.metadata.compliance_profile_id : null
    if (existing && !force) {
      summary[existing] = (summary[existing] || 0) + 1
      continue
    }
    const { profileId, source } = resolveProfile(row.id)
    summary[profileId] = (summary[profileId] || 0) + 1
    toWrite.push({ id: row.id, name: row.name, slug: row.slug, profileId, source })
  }

  console.log(`\nCategories: ${rows.length} total, ${toWrite.length} to ${force ? 'overwrite' : 'assign'}.`)
  console.log('\nSample assignments (first 30):')
  for (const item of toWrite.slice(0, 30)) {
    console.log(`  ${item.slug || item.id}  ->  ${item.profileId}  (${item.source})`)
  }
  console.log('\nProfile distribution (including already-assigned, unless --force):')
  for (const [profileId, count] of Object.entries(summary).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${profileId}: ${count}`)
  }

  if (dryRun) {
    console.log('\nDry run — no changes written.')
    await client.end()
    return
  }

  let written = 0
  for (const item of toWrite) {
    await client.query(
      `UPDATE admin_hub_categories SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('compliance_profile_id', $1::text), updated_at = now() WHERE id = $2`,
      [item.profileId, item.id]
    )
    written++
  }
  await client.end()
  console.log(`\nDone. Wrote compliance_profile_id to ${written} categories.`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
