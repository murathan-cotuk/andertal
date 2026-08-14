'use strict'
/**
 * Shared Sendcloud API helpers (platform-wide credentials from store_integrations).
 * Used by both outbound label purchase (shipment-tracking.js) and return-label
 * auto-creation (return-label.js) so credential/request handling can't drift.
 */

const getSendcloudCredentials = async (pgClient) => {
  const r = await pgClient.query(
    `SELECT api_key, api_secret, config FROM store_integrations WHERE LOWER(TRIM(slug))='sendcloud' AND seller_scope_key='platform' LIMIT 1`
  )
  const row = r.rows[0]
  if (!row) return { public_key: '', secret_key: '', markup_pct: 5 }
  let extraCfg = {}
  try { extraCfg = typeof row.config === 'string' ? JSON.parse(row.config) : (row.config || {}) } catch (_) {}
  return { public_key: row.api_key || '', secret_key: row.api_secret || '', markup_pct: extraCfg.markup_pct ?? 5 }
}

const sendcloudRequest = async (path, { public_key, secret_key }, opts = {}) => {
  const https = require('https')
  const creds = Buffer.from(`${public_key}:${secret_key}`).toString('base64')
  const url = new URL('https://panel.sendcloud.sc' + path)
  return new Promise((resolve, reject) => {
    const req = https.request({ hostname: url.hostname, path: url.pathname + url.search, method: opts.method || 'GET',
      headers: { 'Authorization': `Basic ${creds}`, 'Content-Type': 'application/json', 'Accept': 'application/json' }
    }, (resp) => {
      let body = ''
      resp.on('data', d => { body += d })
      resp.on('end', () => {
        try { resolve({ status: resp.statusCode, data: JSON.parse(body || '{}') }) }
        catch { resolve({ status: resp.statusCode, data: {} }) }
      })
    })
    req.on('error', reject)
    if (opts.body) req.write(opts.body)
    req.end()
  })
}

function isSendcloudHost(hostname) {
  const h = String(hostname || '').toLowerCase()
  return h === 'panel.sendcloud.sc' || h.endsWith('.sendcloud.sc') || h.endsWith('.sendcloud.com')
}

/** Fetch a Sendcloud/DHL label PDF (follows redirects; Basic-auth on Sendcloud hosts). */
async function fetchLabelPdfBuffer(labelUrl, creds = {}, hops = 0) {
  if (!labelUrl || !String(labelUrl).startsWith('http') || hops > 5) return null
  const https = require('https')
  const http = require('http')
  let parsed
  try { parsed = new URL(labelUrl) } catch (_) { return null }
  const lib = parsed.protocol === 'https:' ? https : http
  const headers = { Accept: 'application/pdf,*/*' }
  if (creds.public_key && creds.secret_key && isSendcloudHost(parsed.hostname)) {
    headers.Authorization = `Basic ${Buffer.from(`${creds.public_key}:${creds.secret_key}`).toString('base64')}`
  }
  return await new Promise((resolve) => {
    const req = lib.get({
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      headers,
      timeout: 20000,
    }, (resp) => {
      const code = resp.statusCode || 0
      if (code >= 300 && code < 400 && resp.headers.location) {
        resp.resume()
        const next = new URL(resp.headers.location, parsed).toString()
        return resolve(fetchLabelPdfBuffer(next, creds, hops + 1))
      }
      if (code !== 200) { resp.resume(); return resolve(null) }
      const chunks = []
      resp.on('data', (c) => chunks.push(c))
      resp.on('end', () => resolve(Buffer.concat(chunks)))
      resp.on('error', () => resolve(null))
    })
    req.on('error', () => resolve(null))
    req.on('timeout', () => { req.destroy(); resolve(null) })
  })
}

module.exports = { getSendcloudCredentials, sendcloudRequest, fetchLabelPdfBuffer }
