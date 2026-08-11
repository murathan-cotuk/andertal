'use strict'

/**
 * Ensure Verkäufer-werden page + landing containers in the local/prod DB.
 *
 * Usage:
 *   DATABASE_URL=... node scripts/setup-become-seller-landing.js
 *   DATABASE_URL=... node scripts/setup-become-seller-landing.js --force
 *   DATABASE_URL=... node scripts/setup-become-seller-landing.js --dry-run
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') })
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env.local') })

const { Client } = require('pg')
const { ensureBecomeSellerLanding, LAYOUT_VERSION, PAGE_SLUG } = require('../src/become-seller-landing-seed')

async function main() {
  const dryRun = process.argv.includes('--dry-run')
  const force = process.argv.includes('--force')
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
    const result = await ensureBecomeSellerLanding(client, { dryRun, force })
    console.log(JSON.stringify({ slug: PAGE_SLUG, layout: LAYOUT_VERSION, ...result }, null, 2))
  } finally {
    await client.end()
  }
}

main().catch((err) => {
  console.error(err.message || err)
  process.exit(1)
})
