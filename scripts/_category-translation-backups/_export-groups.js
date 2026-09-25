'use strict'
const fs = require('fs')
const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '..', '..', 'apps', 'medusa-backend', '.env') })
const { Client } = require('pg')
const need = require('./still-need-chunk-7.json')

;(async () => {
  let dbUrl = (process.env.DATABASE_URL || '').trim().replace(/^postgresql:\/\//, 'postgres://')
  const client = new Client({
    connectionString: dbUrl,
    ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : undefined,
  })
  await client.connect()
  const res = await client.query(
    `SELECT metadata FROM (
       SELECT metadata, ntile(8) OVER (ORDER BY id) AS bucket
       FROM admin_hub_categories
     ) t WHERE bucket = 8 AND metadata->'translations'->'en'->>'name' = ANY($1::text[])`,
    [need]
  )
  const groupB = {}
  const groupA = []
  for (const row of res.rows) {
    const tr = row.metadata?.translations || {}
    const en = String(tr.en?.name || '').trim()
    if (!en) continue
    if (tr.es && tr.es._auto) {
      groupB[en] = {
        es: String(tr.es?.name || '').trim(),
        fr: String(tr.fr?.name || '').trim(),
        it: String(tr.it?.name || '').trim(),
        tr: String(tr.tr?.name || '').trim(),
        deExisting: String(tr.de?.name || '').trim() || null,
      }
    } else {
      groupA.push(en)
    }
  }
  fs.writeFileSync(path.join(__dirname, 'chunk7-groupB-existing.json'), JSON.stringify(groupB, null, 0))
  fs.writeFileSync(path.join(__dirname, 'chunk7-groupA-names.json'), JSON.stringify(groupA, null, 0))
  console.log('groupB', Object.keys(groupB).length, 'groupA', groupA.length)
  // Show a few Group B that might have English hybrids in es
  let hybridish = 0
  for (const [en, v] of Object.entries(groupB)) {
    const words = en.split(/\s+/).filter((w) => w.length > 4)
    if (words.some((w) => (v.es || '').includes(w))) hybridish++
  }
  console.log('groupB es containing long EN tokens', hybridish)
  await client.end()
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
