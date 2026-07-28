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

module.exports = { getSendcloudCredentials, sendcloudRequest }
