/**
 * Assign a compliance_profile_id to every row in admin_hub_categories
 * (docs/HUKUKI.md Faz 1 adım 3).
 *
 * Does NOT touch product validation (admin-products.js validateRequiredGpsrMetadata
 * keeps running unconditionally on all products) — this script only prepares the
 * category -> profile mapping so that step can safely become profile-conditional later.
 *
 * Matching: each category's own name+slug is tested against a keyword table
 * (EN-primary — the live category tree is Amazon's English taxonomy — with DE/TR
 * synonyms mixed in) mapped to a profile id from src/compliance/compliance-profiles.json.
 * First matching profile wins (ordered narrow-to-broad, e.g. medical_device is
 * checked before the generic electronics/CE profiles). A category with no keyword
 * match inherits its nearest ancestor's resolved profile. A ROOT category (no parent)
 * with no keyword match falls back to a per-root default (ROOT_DEFAULT_PROFILE below,
 * covering the 23 top-level Amazon categories actually present in this DB), and only
 * general_consumer_gpsr if the root itself isn't in that table either.
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
// (case-insensitive) against "<name> <slug>". EN-primary (see note above), DE/TR
// synonyms included for categories that were imported/renamed locally.
const KEYWORD_RULES = [
  { profile: 'medical_device', keywords: ['medical device', 'medical equipment', 'medizinprodukt', 'tibbi cihaz', 'tıbbi cihaz', 'hearing aid', 'blood pressure monitor', 'thermometer', 'mobility aid', 'wheelchair'] },
  { profile: 'nicotine_tpd', keywords: ['e-cigarette', 'e cigarette', 'vape', 'vaping', 'e-liquid', 'e-zigarette', 'nikotin', 'nicotine', 'e-sigara', 'tobacco'] },
  { profile: 'food_supplement', keywords: ['supplement', 'vitamin', 'protein powder', 'nahrungsergänzung', 'takviye edici', 'takviye gıda'] },
  { profile: 'food', keywords: ['food', 'grocery', 'gourmet', 'snack', 'beverage', 'drink', 'coffee', 'tea ', 'candy', 'chocolate', 'spice', 'condiment', 'baking', 'pantry', 'lebensmittel', 'gıda', 'içecek'] },
  { profile: 'cosmetics', keywords: ['beauty', 'personal care', 'cosmetic', 'makeup', 'make-up', 'skin care', 'skincare', 'hair care', 'fragrance', 'perfume', 'kosmetik', 'kozmetik', 'parfüm'] },
  { profile: 'energy_labeled_eprel', keywords: ['refrigerator', 'freezer', 'washing machine', 'washer', 'dryer', 'dishwasher', 'air conditioner', 'television', ' tv ', 'oven', 'range hood', 'kühlschrank', 'waschmaschine', 'geschirrspüler', 'klimaanlage'] },
  { profile: 'battery_containing', keywords: ['battery', 'batteries', 'power bank', 'rechargeable', 'batterie', 'akku', 'pil', 'batarya'] },
  { profile: 'electronics_weee', keywords: ['electronic', 'electronics', 'computer', 'laptop', 'tablet', 'monitor', 'printer', 'camera', 'phone', 'smartphone', 'headphone', 'speaker', 'appliance', 'kitchen appliance', 'small appliance', 'gaming console', 'router', 'charger', 'cable', 'elektronik', 'bilgisayar', 'telefon'] },
  { profile: 'toys', keywords: ['toy', 'toys & games', 'toys and games', 'game', 'puzzle', 'doll', 'action figure', 'lego', 'building block', 'spielzeug', 'oyuncak'] },
  { profile: 'chemicals_reach', keywords: ['chemical', 'cleaner', 'cleaning', 'detergent', 'paint', 'adhesive', 'glue', 'solvent', 'pesticide', 'fertilizer', 'kimyasal', 'reiniger', 'klebstoff'] },
  { profile: 'textiles', keywords: ['clothing', 'apparel', 'shoes', 'jewelry', 'fashion', 'shirt', 'dress', 'jacket', 'pants', 'sock', 'underwear', 'textile', 'fabric', 'linen', 'bedding', 'towel', 'textil', 'bekleidung', 'giyim', 'ayakkabı'] },
  { profile: 'books_media', keywords: ['book', 'books', 'ebook', 'magazine', 'novel', 'cd', 'vinyl', 'dvd', 'blu-ray', 'movie', 'music', 'audiobook', 'buch', 'kitap', 'dergi'] },
  { profile: 'digital_goods', keywords: ['digital', 'download', 'video game', 'software', 'license key', 'gift card', 'in-game', 'lizenz'] },
  { profile: 'ce_marked_general', keywords: ['power tool', 'hand tool', 'machine', 'machinery', 'drill', 'saw', 'generator', 'compressor', 'werkzeug', 'makine'] },
]

// Fallback used only when a ROOT category (no parent) has no keyword match itself.
// Covers all 23 top-level slugs present in this database (see docs/HUKUKI.md status
// report for the exact list) so most of the tree resolves to something more specific
// than the bare GPSR baseline even without a keyword hit deeper in the branch.
const ROOT_DEFAULT_PROFILE = {
  'appliances': 'electronics_weee',
  'arts-crafts-sewing': 'general_consumer_gpsr',
  'automotive': 'general_consumer_gpsr',
  'baby-products': 'general_consumer_gpsr',
  'beauty-personal-care': 'cosmetics',
  'books': 'books_media',
  'cds-vinyl': 'books_media',
  'cell-phones-accessories': 'electronics_weee',
  'clothing-shoes-jewelry': 'textiles',
  'electronics': 'electronics_weee',
  'grocery-gourmet-food': 'food',
  'health-household': 'general_consumer_gpsr',
  'home-kitchen': 'general_consumer_gpsr',
  'industrial-scientific': 'general_consumer_gpsr',
  'movies-tv': 'books_media',
  'musical-instruments': 'general_consumer_gpsr',
  'office-products': 'general_consumer_gpsr',
  'patio-lawn-garden': 'general_consumer_gpsr',
  'pet-supplies': 'general_consumer_gpsr',
  'sports-outdoors': 'general_consumer_gpsr',
  'tools-home-improvement': 'ce_marked_general',
  'toys-games': 'toys',
  'video-games': 'digital_goods',
}

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
  const unknownRootProfiles = Object.entries(ROOT_DEFAULT_PROFILE).filter(([, p]) => !PROFILES[p])
  if (unknownRootProfiles.length) {
    console.error('ROOT_DEFAULT_PROFILE references unknown profile id(s):', unknownRootProfiles.map((x) => x.join('->')).join(', '))
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

    const rootDefault = ROOT_DEFAULT_PROFILE[normalize(row.slug)]
    const result = rootDefault
      ? { profileId: rootDefault, source: 'root-default' }
      : { profileId: FALLBACK_PROFILE, source: 'fallback(root-no-match)' }
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
