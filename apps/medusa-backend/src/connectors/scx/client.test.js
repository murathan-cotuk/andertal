'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { ScxClient, scxConfigFromEnv } = require('./client')

function fakeFetch(script) {
  const calls = []
  const fn = async (url, init) => {
    calls.push({ url, method: init.method, auth: init.headers?.Authorization, body: init.body })
    const next = script.shift()
    const r = typeof next === 'function' ? next(url, init) : next
    return {
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      headers: { get: (k) => (r.headers || {})[k.toLowerCase()] || null },
      json: async () => r.body,
      text: async () => (r.body == null ? '' : JSON.stringify(r.body)),
    }
  }
  fn.calls = calls
  return fn
}

const auth = (token, inSec = 600) => ({ status: 200, body: { authToken: token, tokenExpireAt: new Date(Date.now() + inSec * 1000).toISOString() } })

test('token is cached across requests and sent as Bearer; refresh token goes form-encoded', async () => {
  const f = fakeFetch([auth('T1'), { status: 200, body: { eventList: [] } }, { status: 200, body: { eventList: [] } }])
  const c = new ScxClient({ baseUrl: 'https://scx.test', refreshToken: 'CHAN:abc', fetchImpl: f })
  await c.getEvents()
  await c.getEvents({ eventTypeFilter: ['Seller:Offer.New', 'Seller:Order.Shipping'] })
  assert.equal(f.calls.filter((x) => x.url.endsWith('/v1/auth')).length, 1)
  assert.equal(f.calls[0].body, 'refreshToken=CHAN%3Aabc')
  assert.equal(f.calls[2].auth, 'Bearer T1')
  assert.match(f.calls[2].url, /eventTypeFilter=Seller%3AOffer\.New%2CSeller%3AOrder\.Shipping/)
})

test('401 re-authenticates once; 429 backs off and retries', async () => {
  const f = fakeFetch([
    auth('OLD'), { status: 401, body: {} }, auth('NEW'),
    { status: 429, headers: { 'retry-after': '0' }, body: {} },
    { status: 200, body: { ok: true } },
  ])
  const c = new ScxClient({ baseUrl: 'https://scx.test', refreshToken: 'r', fetchImpl: f })
  assert.deepEqual(await c.status(), { ok: true })
  assert.equal(f.calls.at(-1).auth, 'Bearer NEW')
})

test('SCX errorList becomes a typed error with code + status', async () => {
  const f = fakeFetch([auth('T'), { status: 400, body: { errorList: [{ code: 'VAL100', message: 'bad sellerId', severity: 'error' }] } }])
  const c = new ScxClient({ baseUrl: 'https://scx.test', refreshToken: 'r', fetchImpl: f })
  await assert.rejects(() => c.createSeller({ session: 's', sellerId: 'x' }), (e) => e.code === 'VAL100' && e.status === 400 && /bad sellerId/.test(e.message))
})

test('config: sandbox by default, configured only with a refresh token', () => {
  assert.deepEqual(scxConfigFromEnv({}), { baseUrl: 'https://scx-sbx.api.jtl-software.com', refreshToken: '', configured: false })
  assert.equal(scxConfigFromEnv({ JTL_SCX_CHANNEL_REFRESH_TOKEN: 'x', JTL_SCX_API_BASE: 'https://scx.api.jtl-software.com/' }).baseUrl, 'https://scx.api.jtl-software.com')
})
