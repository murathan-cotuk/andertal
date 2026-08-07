'use strict'

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') })
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env.local') })

const { Client } = require('pg')
const { ensureCatalogLandingPages, LAYOUT_VERSION } = require('../src/catalog-landing-pages-seed')

const dryRun = process.argv.includes('--dry-run')
const force = process.argv.includes('--force')
const databaseUrl = process.env.DATABASE_URL

async function main() {
  if (!databaseUrl || !databaseUrl.startsWith('postgres')) throw new Error('DATABASE_URL is required.')
  const client = new Client({
    connectionString: databaseUrl.replace(/^postgresql:\/\//, 'postgres://'),
    ssl: databaseUrl.includes('render.com') ? { rejectUnauthorized: false } : false,
  })
  await client.connect()
  try {
    const result = await ensureCatalogLandingPages(client, {
      dryRun,
      force,
      refreshContent: force,
    })
    if (dryRun) {
      console.log(`[dry-run] layout ${LAYOUT_VERSION}; would create/migrate ${result.migrated} page(s)`)
      for (const p of result.pages) {
        console.log(`  - ${p.slug}: create=${!!(p.wouldCreate || p.created)} migrate=${!!(p.wouldMigrate || p.migrated)} containers=${p.added || 0}`)
      }
      return
    }
    console.log(
      `Catalog landing pages: layout=${result.layout}; created=${result.created}; migrated=${result.migrated}`,
    )
    for (const p of result.pages) {
      console.log(`  - ${p.slug}: created=${!!p.created} migrated=${!!p.migrated} containers=${p.added || 0}`)
    }
  } finally {
    await client.end()
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message)
    process.exit(1)
  })
}

module.exports = { ensureCatalogLandingPages }
