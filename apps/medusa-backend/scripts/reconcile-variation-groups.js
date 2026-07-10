/**
 * Reconcile admin_hub_products.metadata.variation_groups with the actual
 * option_values found in admin_hub_products.variants, for every product in
 * the database.
 *
 * Root cause: variants can be added (typically via repeated Excel imports —
 * see apps/sellercentral/src/app/api/import-export/import/route.js) without
 * always updating variation_groups, so the two silently drift apart. Example
 * seen in production: a product had 36 variants spanning 9 colors x 4 sizes,
 * but variation_groups only listed 1 color and 2 sizes — Sellercentral's
 * "Step 1: Group definitions" showed "1 option(s)" while the Variation
 * Matrix below it showed all 9/4 actual values.
 *
 * This script is READ + additive-only on variation_groups: for each group
 * (matched by position, since option_values are stored positionally), any
 * value present in a variant's option_values but missing from that group's
 * options is appended (as a bare option — value only, no swatch/labels,
 * since none exist for it). Existing options (with their swatch_image/labels)
 * are never removed or modified. Products with more option_value dimensions
 * than configured groups, or with no variation_groups at all, are skipped
 * (left for manual review) — not something this script should guess at.
 *
 * Usage:
 *   node apps/medusa-backend/scripts/reconcile-variation-groups.js [--dry-run]
 *
 *   --dry-run   Print what would change, write nothing to the DB.
 *
 * Env: DATABASE_URL (same convention as the rest of apps/medusa-backend)
 */
require('dotenv').config()
try {
  require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.local') })
} catch (_) {}

const { Client } = require('pg')

const DATABASE_URL = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')

function reconcileGroups(variationGroups, variants) {
  const groups = variationGroups.map((g) => ({
    name: g?.name || '',
    options: Array.isArray(g?.options) ? g.options.map((o) => ({ ...o })) : [],
  }))
  const list = Array.isArray(variants) ? variants : []
  let addedTotal = 0
  const added = groups.map(() => [])

  groups.forEach((group, gIdx) => {
    const seen = new Set(
      group.options.map((o) => String((o && typeof o === 'object' ? o.value : o) ?? '').trim().toLowerCase()).filter(Boolean)
    )
    for (const v of list) {
      const ov = Array.isArray(v.option_values) ? v.option_values : []
      const raw = ov[gIdx]
      if (raw == null || String(raw).trim() === '') continue
      const key = String(raw).trim().toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      const newOpt = { value: String(raw).trim() }
      group.options.push(newOpt)
      added[gIdx].push(newOpt.value)
      addedTotal++
    }
  })

  return { groups, added, addedTotal }
}

async function main() {
  const dryRun = process.argv.includes('--dry-run')
  if (!DATABASE_URL) {
    console.error('DATABASE_URL not set.')
    process.exit(1)
  }

  console.log(dryRun ? 'Running in --dry-run mode (no writes).' : 'Running LIVE (will write to admin_hub_products.metadata.variation_groups).')
  const client = new Client({ connectionString: DATABASE_URL, ssl: DATABASE_URL.includes('render.com') ? { rejectUnauthorized: false } : false })
  await client.connect()

  const res = await client.query(`SELECT id, title, metadata, variants FROM admin_hub_products WHERE metadata->'variation_groups' IS NOT NULL AND jsonb_array_length(metadata->'variation_groups') > 0`)
  const rows = res.rows || []
  console.log(`\nProducts with variation_groups configured: ${rows.length}`)

  let skippedDimensionMismatch = 0
  let cleanCount = 0
  const toFix = []

  for (const row of rows) {
    const vg = Array.isArray(row.metadata?.variation_groups) ? row.metadata.variation_groups : []
    const variants = Array.isArray(row.variants) ? row.variants : []
    if (variants.length === 0) { cleanCount++; continue }

    // Skip products where any variant has MORE option dimensions than configured
    // groups — that's a different problem (a whole missing group), not a value-list
    // drift, and this script shouldn't guess a group name for it.
    const maxDims = variants.reduce((m, v) => Math.max(m, Array.isArray(v.option_values) ? v.option_values.length : 0), 0)
    if (maxDims > vg.length) { skippedDimensionMismatch++; continue }

    const { groups, added, addedTotal } = reconcileGroups(vg, variants)
    if (addedTotal === 0) { cleanCount++; continue }
    toFix.push({ id: row.id, title: row.title, groups, added })
  }

  console.log(`Already in sync: ${cleanCount}`)
  console.log(`Skipped (variant has more option dimensions than configured groups — needs manual review): ${skippedDimensionMismatch}`)
  console.log(`To reconcile: ${toFix.length}`)

  console.log('\nSample (first 20):')
  for (const item of toFix.slice(0, 20)) {
    const summary = item.groups.map((g, i) => `${g.name || `Group${i + 1}`}: +${item.added[i].length} (${item.added[i].join(', ') || '—'})`).join(' | ')
    console.log(`  ${item.id}  ${(item.title || '').slice(0, 50)}  ->  ${summary}`)
  }

  if (dryRun) {
    console.log('\nDry run — no changes written.')
    await client.end()
    return
  }

  let written = 0
  for (const item of toFix) {
    await client.query(
      `UPDATE admin_hub_products SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{variation_groups}', $1::jsonb), updated_at = now() WHERE id = $2`,
      [JSON.stringify(item.groups), item.id]
    )
    written++
  }
  await client.end()
  console.log(`\nDone. Reconciled variation_groups for ${written} products.`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
