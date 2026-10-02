'use strict'
/**
 * Phase 3 — explode variants[] into first-class product rows under a family roof.
 *
 * Default: dry-run (no writes). Pass --apply to write.
 * Does NOT delete rows, does NOT reset DB, does NOT touch orders/auth/stripe.
 *
 * Usage:
 *   node scripts/backfill-variants-to-products.js
 *   node scripts/backfill-variants-to-products.js --apply
 *   node scripts/backfill-variants-to-products.js --apply --limit=50
 */

const { Client } = require('pg')
const {
  normalizeStoreEan,
  parseVariantsArray,
  PRODUCT_ROLE_PRODUCT,
  PRODUCT_ROLE_FAMILY_SHELL,
  buildListingSellerMeta,
} = require('../src/product-identity')

const APPLY = process.argv.includes('--apply')
const limitArg = process.argv.find((a) => a.startsWith('--limit='))
const LIMIT = limitArg ? Math.max(1, parseInt(limitArg.split('=')[1], 10) || 100) : null

function slugify(str) {
  if (!str || typeof str !== 'string') return ''
  const map = { ü: 'u', Ü: 'u', ö: 'o', Ö: 'o', ı: 'i', I: 'i', İ: 'i', ç: 'c', Ç: 'c', ğ: 'g', Ğ: 'g', ä: 'ae', Ä: 'ae', ß: 'ss' }
  let s = str.trim()
  for (const [from, to] of Object.entries(map)) s = s.split(from).join(to)
  return s.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').slice(0, 180)
}

async function main() {
  const raw = process.env.DATABASE_URL || ''
  if (!raw) {
    console.error('DATABASE_URL required')
    process.exit(1)
  }
  const url = raw.replace(/^postgresql:\/\//, 'postgres://')
  const client = new Client({
    connectionString: url,
    ssl: url.includes('render.com') ? { rejectUnauthorized: false } : false,
  })
  await client.connect()

  // Ensure additive columns exist (same as server ensure).
  await client.query(`ALTER TABLE admin_hub_products ADD COLUMN IF NOT EXISTS family_id uuid`)
  await client.query(`ALTER TABLE admin_hub_products ADD COLUMN IF NOT EXISTS product_role varchar(32) DEFAULT 'product'`)
  await client.query(`ALTER TABLE admin_hub_seller_listings ADD COLUMN IF NOT EXISTS listed_ean text`)
  await client.query(`CREATE TABLE IF NOT EXISTS admin_hub_product_families (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    title text NOT NULL,
    handle varchar(255),
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
  )`)

  const q = `
    SELECT id, title, handle, sku, description, status, seller_id, collection_id,
           price_cents, inventory, metadata, variants, an_id, family_id, product_role
    FROM admin_hub_products
    WHERE COALESCE(status, '') <> 'merged'
      AND (product_role IS NULL OR product_role = 'product')
      AND family_id IS NULL
      AND variants IS NOT NULL
      AND jsonb_typeof(CASE WHEN jsonb_typeof(variants::jsonb) = 'array' THEN variants::jsonb ELSE '[]'::jsonb END) = 'array'
      AND jsonb_array_length(CASE WHEN jsonb_typeof(variants::jsonb) = 'array' THEN variants::jsonb ELSE '[]'::jsonb END) > 0
    ORDER BY created_at ASC
    ${LIMIT ? `LIMIT ${LIMIT}` : ''}
  `
  // variants may be jsonb or text — load broadly then filter in JS
  const broad = await client.query(`
    SELECT id, title, handle, sku, description, status, seller_id, collection_id,
           price_cents, inventory, metadata, variants, an_id, family_id, product_role
    FROM admin_hub_products
    WHERE COALESCE(status, '') <> 'merged'
      AND (product_role IS NULL OR product_role <> 'family_shell')
      AND family_id IS NULL
    ORDER BY created_at ASC
    ${LIMIT ? `LIMIT ${Math.max(LIMIT * 5, 200)}` : 'LIMIT 5000'}
  `)

  const candidates = []
  for (const row of broad.rows || []) {
    const vars = parseVariantsArray(row).filter((v) => normalizeStoreEan(v && v.ean))
    if (vars.length >= 1 && parseVariantsArray(row).length >= 1) {
      // Only explode when there is at least one variant EAN (sellable children).
      if (vars.length >= 1 && (vars.length > 1 || normalizeStoreEan(row.metadata?.ean) !== vars[0].ean)) {
        candidates.push({ row, vars: parseVariantsArray(row) })
      }
    }
  }
  const work = LIMIT ? candidates.slice(0, LIMIT) : candidates

  console.log(`Mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}`)
  console.log(`Candidates with variants[]: ${work.length}`)

  let createdProducts = 0
  let createdFamilies = 0
  let reboundListings = 0

  for (const { row, vars } of work) {
    const sellable = vars.filter((v) => normalizeStoreEan(v && v.ean))
    if (!sellable.length) continue
    console.log(`- ${row.id} "${row.title}" → ${sellable.length} EAN child(ren)`)

    if (!APPLY) continue

    await client.query('BEGIN')
    try {
      const fam = await client.query(
        `INSERT INTO admin_hub_product_families (title, handle, metadata)
         VALUES ($1, $2, $3::jsonb) RETURNING id`,
        [
          row.title || 'Family',
          slugify(row.handle || row.title || String(row.id)) || null,
          JSON.stringify({
            source_umbrella_id: row.id,
            variation_groups: (row.metadata && row.metadata.variation_groups) || null,
          }),
        ]
      )
      const familyId = fam.rows[0].id
      createdFamilies++

      // Mark umbrella as family shell (not sold). Keep variants[] for dual-read during cutover.
      const shellMeta = {
        ...(row.metadata && typeof row.metadata === 'object' ? row.metadata : {}),
        product_role: PRODUCT_ROLE_FAMILY_SHELL,
        is_family_shell: true,
      }
      delete shellMeta.ean
      await client.query(
        `UPDATE admin_hub_products
         SET family_id = $1, product_role = $2, metadata = $3::jsonb,
             price_cents = 0, inventory = 0, sku = NULL, updated_at = now()
         WHERE id = $4`,
        [familyId, PRODUCT_ROLE_FAMILY_SHELL, JSON.stringify(shellMeta), row.id]
      )

      for (let i = 0; i < sellable.length; i++) {
        const v = sellable[i]
        const ean = normalizeStoreEan(v.ean)
        const vMeta = v.metadata && typeof v.metadata === 'object' ? { ...v.metadata } : {}
        vMeta.ean = ean
        vMeta.source_umbrella_id = row.id
        vMeta.source_variant_index = i
        if (v.option_values) vMeta.option_values = v.option_values

        const title =
          v.title ||
          v.label ||
          (Array.isArray(v.option_values) ? v.option_values.join(' / ') : null) ||
          `${row.title || 'Product'} ${ean}`
        const handleBase = slugify(`${row.handle || row.title || 'p'}-${ean}`) || `p-${ean}`
        const child = await client.query(
          `INSERT INTO admin_hub_products
             (title, handle, sku, description, status, seller_id, collection_id,
              price_cents, inventory, metadata, variants, an_id, family_id, product_role)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,'[]'::jsonb,$11,$12,$13)
           RETURNING id`,
          [
            title,
            `${handleBase}-${String(row.id).slice(0, 8)}`,
            v.sku || null,
            vMeta.description || row.description || null,
            row.status || 'draft',
            row.seller_id || null,
            row.collection_id || null,
            v.price_cents != null ? Number(v.price_cents) : 0,
            parseInt(v.inventory, 10) || 0,
            JSON.stringify(vMeta),
            v.an_id || null,
            familyId,
            PRODUCT_ROLE_PRODUCT,
          ]
        )
        const childId = child.rows[0].id
        createdProducts++

        // Rebind listings scoped to this EAN from umbrella → child product.
        const listingMeta = buildListingSellerMeta(ean)
        const upd = await client.query(
          `UPDATE admin_hub_seller_listings
           SET product_id = $1,
               listed_ean = $2,
               seller_metadata = COALESCE(seller_metadata, '{}'::jsonb) || $3::jsonb,
               updated_at = now()
           WHERE product_id = $4
             AND (listed_ean = $2 OR seller_metadata->>'ean' = $2)`,
          [childId, ean, JSON.stringify(listingMeta || { ean }), row.id]
        )
        reboundListings += upd.rowCount || 0
      }

      await client.query('COMMIT')
    } catch (err) {
      await client.query('ROLLBACK')
      console.error(`  FAIL ${row.id}:`, err.message)
    }
  }

  console.log('\nSummary:')
  console.log('  families:', createdFamilies)
  console.log('  products:', createdProducts)
  console.log('  listings rebound:', reboundListings)
  if (!APPLY) console.log('\nRe-run with --apply to write.')

  await client.end()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
