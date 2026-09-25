'use strict'
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', 'apps', 'medusa-backend', '.env') })
const { Client } = require('pg')
const need = require('./still-need-chunk-7.json')

;(async () => {
  let dbUrl = (process.env.DATABASE_URL || '').trim().replace(/^postgresql:\/\//, 'postgres://')
  const client = new Client({
    connectionString: dbUrl,
    ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : undefined,
  })
  await client.connect()
  // Sample how many of still-need are in chunk 7 and group A vs B
  const res = await client.query(
    `SELECT id, name, metadata FROM (
       SELECT id, name, metadata, ntile(8) OVER (ORDER BY id) AS bucket
       FROM admin_hub_categories
     ) t WHERE bucket = 8 AND metadata->'translations'->'en'->>'name' = ANY($1::text[])`,
    [need]
  )
  let groupA = 0, groupB = 0
  for (const row of res.rows) {
    const tr = row.metadata?.translations || {}
    if (tr.es && tr.es._auto) groupB++
    else groupA++
  }
  console.log('in chunk7 matching still-need', res.rows.length)
  console.log('groupA', groupA, 'groupB', groupB)
  // Also show sample existing translations for group B
  const sample = res.rows.find((r) => r.metadata?.translations?.es?._auto)
  if (sample) {
    const tr = sample.metadata.translations
    console.log('sample B en', tr.en?.name)
    console.log('sample B es', tr.es?.name)
    console.log('sample B de', tr.de?.name)
  }
  await client.end()
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
