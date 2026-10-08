'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const pr = require('./password-reset')

test('password rule matches registration', () => {
  assert.equal(pr.passwordStrongEnough('abc12345'), true)
  assert.equal(pr.passwordStrongEnough('abcdefgh'), false)
  assert.equal(pr.passwordStrongEnough('1234567'), false)
})

const PG = process.env.SETTLEMENT_TEST_PG_URL
test('token: stored hashed, single use, newest only, expires — real Postgres', { skip: !PG && 'SETTLEMENT_TEST_PG_URL not set' }, async () => {
  const { Client } = require('pg')
  const c = new Client({ connectionString: PG })
  await c.connect()
  try {
    await c.query('DROP TABLE IF EXISTS password_reset_tokens')
    await pr.ensurePasswordResetSchema(c)
    const t1 = await pr.createResetToken(c, { kind: 'customer', userId: 'u1' })
    assert.match(t1, /^[0-9a-f]{64}$/)
    assert.equal((await c.query('SELECT COUNT(*)::int AS n FROM password_reset_tokens WHERE token_hash = $1', [t1])).rows[0].n, 0) // never stored raw
    const t2 = await pr.createResetToken(c, { kind: 'customer', userId: 'u1' })
    assert.equal(await pr.consumeResetToken(c, { kind: 'customer', token: t1 }), null) // superseded
    assert.equal(await pr.consumeResetToken(c, { kind: 'seller', token: t2 }), null) // wrong kind
    assert.equal(await pr.consumeResetToken(c, { kind: 'customer', token: t2 }), 'u1')
    assert.equal(await pr.consumeResetToken(c, { kind: 'customer', token: t2 }), null) // single use
    const t3 = await pr.createResetToken(c, { kind: 'seller', userId: 's1' })
    await c.query(`UPDATE password_reset_tokens SET expires_at = now() - interval '1 minute' WHERE kind = 'seller'`)
    assert.equal(await pr.consumeResetToken(c, { kind: 'seller', token: t3 }), null) // expired
    assert.equal(await pr.consumeResetToken(c, { kind: 'customer', token: 'nothex' }), null)
  } finally {
    await c.query('DROP TABLE IF EXISTS password_reset_tokens').catch(() => {})
    await c.end()
  }
})
