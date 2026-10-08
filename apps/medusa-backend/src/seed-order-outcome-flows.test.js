'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { seedOrderOutcomeFlows, FLOWS } = require('./seed-order-outcome-flows')

test('every seeded flow has all 6 languages with subject + body', () => {
  for (const f of FLOWS) {
    for (const l of ['de', 'en', 'tr', 'fr', 'it', 'es']) {
      assert.ok(f.content[l]?.subject && f.content[l]?.body, `${f.trigger_key}/${f.audience}/${l}`)
    }
  }
})

const PG = process.env.SETTLEMENT_TEST_PG_URL
test('seed creates missing flows once and never touches existing ones — real Postgres', { skip: !PG && 'no PG' }, async (t) => {
  const { Client } = require('pg')
  const c = new Client({ connectionString: PG })
  await c.connect()
  try {
    // Production is UTF8; a local WIN1252 test cluster cannot store the Turkish texts.
    if ((await c.query('SHOW server_encoding')).rows[0].server_encoding !== 'UTF8') { t.skip('server_encoding is not UTF8'); return }
    await c.query(`CREATE TEMP TABLE admin_hub_flows (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text, trigger_key text, status text, audience text)`)
    await c.query(`CREATE TEMP TABLE admin_hub_flow_steps (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), flow_id uuid, step_order int, step_type text, email_subject text, email_body text, email_i18n jsonb, email_attachments jsonb)`)
    await c.query(`INSERT INTO admin_hub_flows (name, trigger_key, status, audience) VALUES ('Mein Storno', 'order_cancelled', 'active', 'customer')`)
    await seedOrderOutcomeFlows(c)
    await seedOrderOutcomeFlows(c)
    const rows = (await c.query(`SELECT trigger_key, audience, name FROM admin_hub_flows ORDER BY trigger_key, audience`)).rows
    assert.equal(rows.length, 5)
    assert.equal(rows.find((r) => r.trigger_key === 'order_cancelled' && r.audience === 'customer').name, 'Mein Storno')
    assert.equal((await c.query('SELECT COUNT(*)::int AS n FROM admin_hub_flow_steps')).rows[0].n, 4)
  } finally {
    await c.end()
  }
})
