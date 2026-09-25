'use strict'
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', 'apps', 'medusa-backend', '.env') })
const { Client } = require('pg')
;(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL })
  await c.connect()
  const names = require('./still-need-chunk-2.json')
  const r = await c.query(
    `SELECT COUNT(*)::int AS n FROM i18n_translation_cache WHERE source_lang='en' AND target_lang='de' AND source_text = ANY($1::text[])`,
    [names],
  )
  console.log('cached de', r.rows[0].n, 'of', names.length)
  for (const lang of ['de', 'es', 'fr', 'it', 'tr']) {
    const rr = await c.query(
      `SELECT COUNT(*)::int AS n FROM i18n_translation_cache WHERE source_lang='en' AND target_lang=$1 AND source_text = ANY($2::text[])`,
      [lang, names],
    )
    console.log('cached', lang, rr.rows[0].n)
  }
  await c.end()
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
