'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('crypto')
const sup = require('./email-suppression')

const secretRaw = crypto.randomBytes(24)
const secret = 'whsec_' + secretRaw.toString('base64')
const sign = (id, ts, body) => 'v1,' + crypto.createHmac('sha256', secretRaw).update(`${id}.${ts}.${body}`).digest('base64')

test('Svix signature: valid, tampered body, wrong secret, stale timestamp', () => {
  const body = '{"type":"email.bounced"}'
  const ts = String(Math.floor(Date.now() / 1000))
  const sig = sign('msg_1', ts, body)
  assert.equal(sup.verifySvixSignature({ secret, id: 'msg_1', timestamp: ts, signature: `v1,bogus ${sig}`, rawBody: Buffer.from(body) }), true)
  assert.equal(sup.verifySvixSignature({ secret, id: 'msg_1', timestamp: ts, signature: sig, rawBody: body + ' ' }), false)
  assert.equal(sup.verifySvixSignature({ secret: 'whsec_' + crypto.randomBytes(24).toString('base64'), id: 'msg_1', timestamp: ts, signature: sig, rawBody: body }), false)
  const old = String(Math.floor(Date.now() / 1000) - 3600)
  assert.equal(sup.verifySvixSignature({ secret, id: 'msg_1', timestamp: old, signature: sign('msg_1', old, body), rawBody: body }), false)
})

const PG = process.env.SETTLEMENT_TEST_PG_URL
test('bounce suppresses all mail, complaint only opts out of advertising — real Postgres', { skip: !PG && 'no PG' }, async () => {
  const { Client } = require('pg')
  const c = new Client({ connectionString: PG })
  await c.connect()
  try {
    await c.query('DROP TABLE IF EXISTS email_suppressions')
    await c.query(`CREATE TEMP TABLE store_newsletter_subscribers (email text, status text, unsubscribed_at timestamptz, updated_at timestamptz)`)
    await c.query(`INSERT INTO store_newsletter_subscribers VALUES ('fan@example.com', 'active', NULL, NULL)`)
    await sup.ensureSuppressionSchema(c)
    assert.equal(await sup.isSuppressed(c, 'Bad@Example.com'), false)
    await sup.recordBounce(c, 'Bad@Example.com', 'mailbox does not exist')
    assert.equal(await sup.isSuppressed(c, 'bad@example.com'), true)
    await sup.recordComplaint(c, 'fan@example.com')
    assert.equal(await sup.isSuppressed(c, 'fan@example.com'), false) // transactional mail still allowed
    assert.equal((await c.query(`SELECT status FROM store_newsletter_subscribers`)).rows[0].status, 'unsubscribed')
  } finally {
    await c.query('DROP TABLE IF EXISTS email_suppressions').catch(() => {})
    await c.end()
  }
})
