'use strict'

/**
 * JTL SCX Channel API client (docs: developer.jtl-software.com, openapi/scx/channel.json +
 * marketplace-channels/auth.json). Never talks to a JTL database (docs/CONNECTOR.md).
 *
 *  - POST /v1/auth (form: refreshToken) → short-lived Bearer token; cached and renewed 60 s before
 *    tokenExpireAt (the auth endpoint is rate limited — never once per request)
 *  - 401 → one re-auth + retry; 429/503 → back off (Retry-After) up to 3 attempts
 *  - error bodies { errorList: [{ code, message }] } become Error(code/message), status kept
 *
 * Env: JTL_SCX_API_BASE (default sandbox), JTL_SCX_CHANNEL_REFRESH_TOKEN.
 */

const SANDBOX = 'https://scx-sbx.api.jtl-software.com'

function scxConfigFromEnv(env = process.env) {
  const refreshToken = String(env.JTL_SCX_CHANNEL_REFRESH_TOKEN || env.JTL_SCX_REFRESH_TOKEN || '').trim()
  return {
    baseUrl: String(env.JTL_SCX_API_BASE || SANDBOX).trim().replace(/\/$/, ''),
    refreshToken,
    configured: !!refreshToken,
  }
}

class ScxError extends Error {
  constructor(message, { status = 0, code = null, errors = [] } = {}) {
    super(message)
    this.name = 'ScxError'
    this.status = status
    this.code = code
    this.errors = errors
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

class ScxClient {
  constructor({ baseUrl, refreshToken, fetchImpl = globalThis.fetch, now = () => Date.now(), maxAttempts = 3 } = {}) {
    if (!refreshToken) throw new ScxError('JTL SCX refresh token not configured', { code: 'NOT_CONFIGURED' })
    this.baseUrl = String(baseUrl || SANDBOX).replace(/\/$/, '')
    this.refreshToken = refreshToken
    this.fetch = fetchImpl
    this.now = now
    this.maxAttempts = maxAttempts
    this._token = null
    this._tokenExpiresAt = 0
  }

  async _auth(force = false) {
    if (!force && this._token && this._tokenExpiresAt - this.now() > 60_000) return this._token
    const res = await this.fetch(`${this.baseUrl}/v1/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json', 'Accept-Language': 'en' },
      body: new URLSearchParams({ refreshToken: this.refreshToken }).toString(),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data.authToken) throw toScxError(res.status, data, 'SCX auth failed')
    this._token = data.authToken
    const abs = data.tokenExpireAt ? Date.parse(data.tokenExpireAt) : NaN
    this._tokenExpiresAt = Number.isFinite(abs) ? abs : this.now() + (Number(data.expiresIn) || 300) * 1000
    return this._token
  }

  /** @returns {Promise<any>} parsed JSON (or null for 204 / empty body) */
  async request(method, path, { query = null, body = undefined } = {}) {
    const qs = query ? `?${new URLSearchParams(Object.entries(query).filter(([, v]) => v != null && v !== '')).toString()}` : ''
    let reauthed = false
    for (let attempt = 1; ; attempt++) {
      const token = await this._auth()
      const res = await this.fetch(`${this.baseUrl}${path}${qs}`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
          'Accept-Language': 'en',
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      })
      if (res.status === 401 && !reauthed) {
        reauthed = true
        await this._auth(true)
        continue
      }
      if ((res.status === 429 || res.status === 503) && attempt < this.maxAttempts) {
        const ra = Number(res.headers?.get?.('retry-after'))
        await sleep(Number.isFinite(ra) && ra > 0 ? Math.min(ra, 30) * 1000 : 1000 * attempt)
        continue
      }
      const text = await res.text().catch(() => '')
      let data = null
      try { data = text ? JSON.parse(text) : null } catch (_) { data = { raw: text } }
      if (!res.ok) throw toScxError(res.status, data, `SCX ${method} ${path} failed`)
      return data
    }
  }

  // ── Events ──
  getEvents({ eventTypeFilter = null } = {}) {
    return this.request('GET', '/v1/channel/event', { query: { eventTypeFilter: Array.isArray(eventTypeFilter) ? eventTypeFilter.join(',') : eventTypeFilter } })
  }
  ackEvents(eventIdList) {
    return eventIdList.length ? this.request('DELETE', '/v1/channel/event', { body: { eventIdList } }) : null
  }

  // ── Sellers ──
  readSignupSession(session) { return this.request('GET', '/v1/channel/seller/signup-session', { query: { session } }) }
  createSeller({ session, sellerId, companyName }) {
    return this.request('POST', '/v1/channel/seller', { body: { session, sellerId, ...(companyName ? { companyName } : {}) } })
  }
  readUpdateSession(sessionId) { return this.request('GET', '/v1/channel/seller/update-session', { query: { sessionId } }) }
  updateSeller({ sessionId, isActive = true, companyName }) {
    return this.request('PATCH', '/v1/channel/seller', { body: { sessionId, isActive, ...(companyName ? { companyName } : {}) } })
  }
  unlinkSeller(sellerId) { return this.request('DELETE', `/v1/channel/seller/${encodeURIComponent(sellerId)}`) }

  // ── Listing state ──
  offerInProgress(offerList) { return this.request('POST', '/v1/channel/offer/in-progress', { body: { offerList } }) }
  offerListed(offerList) { return this.request('POST', '/v1/channel/offer/listed', { body: { offerList } }) }
  offerListingFailed(offerList) { return this.request('POST', '/v1/channel/offer/listing-failed', { body: { offerList } }) }
  stockUpdatesAll(updatedAfter) { return this.request('GET', '/v1/channel/offer/stock-updates/all', { query: { updatedAfter } }) }

  // ── Orders ──
  createOrders(orderList) { return this.request('POST', '/v1/channel/order', { body: { orderList } }) }
  updateOrderStatus(orderList) { return this.request('PUT', '/v1/channel/order/status', { body: { orderList } }) }
  refundProcessingResult(result) { return this.request('POST', '/v1/channel/order/refund/processing-result', { body: result }) }

  // ── Channel metadata (setup) ──
  putPriceType({ priceTypeId, displayName, description }) {
    return this.request('POST', '/v1/channel/price', { body: { priceTypeId, displayName, description } })
  }
  putCategories(categoryList) { return this.request('PUT', '/v1/channel/categories', { body: { categoryList } }) }
  putGlobalAttributes(attributeList) { return this.request('PUT', '/v1/channel/attribute/global', { body: { attributeList } }) }
  status() { return this.request('GET', '/v1/channel') }
}

function toScxError(status, data, fallback) {
  const errors = Array.isArray(data?.errorList) ? data.errorList : []
  const first = errors[0]
  return new ScxError(first ? `${first.code}: ${first.message}` : fallback, { status, code: first?.code || null, errors })
}

let _shared = null
/** Process-wide client (one token cache) when the env is configured, else null. */
function getScxClient(env = process.env) {
  const cfg = scxConfigFromEnv(env)
  if (!cfg.configured) return null
  if (!_shared || _shared.baseUrl !== cfg.baseUrl || _shared.refreshToken !== cfg.refreshToken) {
    _shared = new ScxClient({ baseUrl: cfg.baseUrl, refreshToken: cfg.refreshToken })
  }
  return _shared
}

module.exports = { ScxClient, ScxError, scxConfigFromEnv, getScxClient, SANDBOX }
