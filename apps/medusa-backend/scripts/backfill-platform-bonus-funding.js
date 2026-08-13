/**
 * BonusPunkte.md §5 — one-time backfill for store_orders.platform_bonus_funding_cents
 * (added in server.js's ALTER TABLE IF NOT EXISTS migration, §3.2).
 *
 * New orders get this column set at insert time (store-checkout.js). Existing rows created
 * before that change have it at its DEFAULT 0, which is wrong for any order that redeemed
 * bonus points before this script runs. This backfills those rows only:
 *   platform_bonus_funding_cents = GREATEST(0, discount_cents - COALESCE(coupon_discount_cents, 0))
 * — same formula as order-money.js's orderBonusDiscountCents(), kept in SQL here to avoid a
 * cross-module require from a standalone script.
 *
 * Only touches rows where platform_bonus_funding_cents = 0 AND bonus_points_redeemed > 0, so
 * running it twice (or after some new orders already have it set correctly) is a no-op for
 * already-correct rows — safe to re-run.
 *
 * Usage:
 *   node apps/medusa-backend/scripts/backfill-platform-bonus-funding.js [--dry-run]
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
    const affected = await client.query(
      `SELECT id, order_number, discount_cents, coupon_discount_cents, bonus_points_redeemed
         FROM store_orders
        WHERE platform_bonus_funding_cents = 0
          AND bonus_points_redeemed > 0
        ORDER BY created_at ASC`,
    )

    console.log(`Found ${affected.rows.length} order(s) with bonus_points_redeemed > 0 but platform_bonus_funding_cents still 0.`)
    if (affected.rows.length === 0) {
      console.log('Nothing to backfill.')
      return
    }

    let updated = 0
    for (const row of affected.rows) {
      const discount = Math.max(0, Number(row.discount_cents || 0))
      const coupon = Math.max(0, Number(row.coupon_discount_cents || 0))
      const bonusFunding = Math.max(0, discount - coupon)
      if (bonusFunding <= 0) {
        console.log(`  #${row.order_number} (${row.id}): bonus_points_redeemed=${row.bonus_points_redeemed} but derived funding=0 (discount=${discount}, coupon=${coupon}) — skipped, needs manual review.`)
        continue
      }
      console.log(`  #${row.order_number} (${row.id}): platform_bonus_funding_cents 0 -> ${bonusFunding}`)
      if (!DRY_RUN) {
        await client.query(
          `UPDATE store_orders SET platform_bonus_funding_cents = $1 WHERE id = $2::uuid`,
          [bonusFunding, row.id],
        )
      }
      updated += 1
    }

    console.log(DRY_RUN
      ? `Dry run — would update ${updated} order(s). Re-run without --dry-run to apply.`
      : `Updated ${updated} order(s).`)
  } finally {
    await client.end()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
