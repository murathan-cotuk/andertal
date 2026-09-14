/**
 * One-time backfill for admin_hub_products.an_id (added in server.js's
 * ALTER TABLE IF NOT EXISTS migration, see src/an-id.js for the format/rationale).
 *
 * New products get an AN-ID assigned at creation (admin-products.js createAdminHubProductDb),
 * and any existing product without one gets lazily backfilled the next time it's opened/saved
 * in Sellercentral (getAdminHubProductByIdOrHandleDb). This script exists to catch up the rest
 * of the catalog in one pass — e.g. products that are only ever read via the list/search
 * endpoints (Inventory, affiliate product search) and never individually opened.
 *
 * Safe to re-run: only touches rows where an_id IS NULL.
 *
 * Usage:
 *   node apps/medusa-backend/scripts/backfill-an-ids.js [--dry-run]
 *
 * Env: DATABASE_URL (same convention as the rest of apps/medusa-backend)
 */
require('dotenv').config()
try {
  require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.local') })
} catch (_) {}

const { Client } = require('pg')
const { assignAnId } = require('../src/an-id')

const DATABASE_URL = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
const DRY_RUN = process.argv.includes('--dry-run')

async function main() {
  if (!DATABASE_URL) {
    console.error('DATABASE_URL not set.')
    process.exit(1)
  }
  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: DATABASE_URL.includes('render.com') ? { rejectUnauthorized: false } : false,
  })
  await client.connect()
  try {
    const { rows } = await client.query(
      `SELECT id, title FROM admin_hub_products WHERE an_id IS NULL ORDER BY created_at ASC`
    )
    console.log(`Found ${rows.length} product(s) without an AN-ID.`)
    let updated = 0
    for (const row of rows) {
      const anId = await assignAnId(client)
      if (DRY_RUN) {
        console.log(`[dry-run] ${row.id}  "${row.title}"  -> ${anId}`)
        continue
      }
      await client.query('UPDATE admin_hub_products SET an_id = $1 WHERE id = $2', [anId, row.id])
      updated++
      if (updated % 200 === 0) console.log(`  ...${updated} done`)
    }
    console.log(DRY_RUN ? 'Dry run complete — nothing written.' : `Done. Assigned AN-ID to ${updated} product(s).`)
  } finally {
    await client.end()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
