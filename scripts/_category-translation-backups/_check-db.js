'use strict'
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', 'apps', 'medusa-backend', '.env') })
const { Client } = require('pg')

;(async () => {
  let dbUrl = (process.env.DATABASE_URL || '').trim().replace(/^postgresql:\/\//, 'postgres://')
  console.log('host', dbUrl.replace(/:[^:@]+@/, ':****@').slice(0, 80))
  const client = new Client({
    connectionString: dbUrl,
    ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : undefined,
  })
  await client.connect()
  const r = await client.query('SELECT COUNT(*)::int AS n FROM admin_hub_categories')
  console.log('categories', r.rows[0].n)
  await client.end()
})().catch((e) => {
  console.error(e.message)
  process.exit(1)
})
