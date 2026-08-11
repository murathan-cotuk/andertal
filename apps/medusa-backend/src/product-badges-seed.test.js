'use strict'

const { seedDefaultProductBadges, DEFAULT_API_BADGES } = require('./product-badges-seed')

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed')
}

async function testSeedIdempotent() {
  const rows = []
  const client = {
    async query(sql, params) {
      const s = String(sql)
      if (s.includes('SELECT id FROM admin_hub_product_badges')) {
        const rule = params[0]
        const hit = rows.find((r) => r.api_rule === rule)
        return { rows: hit ? [hit] : [] }
      }
      if (s.includes('INSERT INTO admin_hub_product_badges')) {
        rows.push({ id: `id-${params[4]}`, api_rule: params[4], position: params[1] })
        return { rows: [] }
      }
      return { rows: [] }
    },
  }

  const first = await seedDefaultProductBadges(client)
  assert(first.inserted === DEFAULT_API_BADGES.length, `insert all (${first.inserted})`)
  assert(first.skipped === 0, 'no skip first run')
  const sale = rows.find((r) => r.api_rule === 'sale')
  assert(sale && sale.position === 'top-right', 'sale position top-right')

  const second = await seedDefaultProductBadges(client)
  assert(second.inserted === 0, 'no re-insert')
  assert(second.skipped === DEFAULT_API_BADGES.length, 'all skipped')
  assert(rows.length === DEFAULT_API_BADGES.length, 'row count stable')
}

testSeedIdempotent()
  .then(() => console.log('product-badges-seed.test.js OK'))
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
