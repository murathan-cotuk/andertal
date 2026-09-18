'use strict'

/**
 * Seed homepage landing containers (admin_hub_landing_page id=1).
 *
 * Default: only writes when containers[] is empty.
 * --draft writes the composition to unpublished draft_* (shop stays on published).
 * --force overwrites the published homepage. Do not use on production unless intended.
 *
 * Usage:
 *   DATABASE_URL=... node scripts/setup-homepage-landing.js
 *   DATABASE_URL=... node scripts/setup-homepage-landing.js --draft
 *   DATABASE_URL=... node scripts/setup-homepage-landing.js --force
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') })
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env.local') })

const { Client } = require('pg')
const { ensureHomepageLanding, seedHomepageDraftIfAbsent, LAYOUT_VERSION } = require('../src/homepage-landing-seed')

async function main() {
  const force = process.argv.includes('--force')
  const asDraft = process.argv.includes('--draft')
  if (force && asDraft) {
    throw new Error('Use either --draft or --force, not both.')
  }
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl || !databaseUrl.startsWith('postgres')) {
    throw new Error('DATABASE_URL is required.')
  }

  const client = new Client({
    connectionString: databaseUrl.replace(/^postgresql:\/\//, 'postgres://'),
    ssl: databaseUrl.includes('render.com') ? { rejectUnauthorized: false } : false,
  })
  await client.connect()
  try {
    await client.query(`ALTER TABLE admin_hub_landing_page ADD COLUMN IF NOT EXISTS settings JSONB NOT NULL DEFAULT '{}'::jsonb`).catch(() => {})
    await client.query(`ALTER TABLE admin_hub_landing_page ADD COLUMN IF NOT EXISTS draft_containers JSONB`).catch(() => {})
    await client.query(`ALTER TABLE admin_hub_landing_page ADD COLUMN IF NOT EXISTS draft_settings JSONB`).catch(() => {})
    const result = asDraft
      ? await seedHomepageDraftIfAbsent(client)
      : await ensureHomepageLanding(client, { force })
    console.log(JSON.stringify({ layout: LAYOUT_VERSION, ...result }, null, 2))
  } finally {
    await client.end()
  }
}

main().catch((err) => {
  console.error(err.message || err)
  process.exit(1)
})
