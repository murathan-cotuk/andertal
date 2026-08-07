'use strict'

/**
 * Push amazon_v2 Kundenservice landing containers to production API.
 * Usage: SELLER_TOKEN=... node scripts/push-customer-support-landing-remote.js
 * Optional: API_BASE=https://api.andertal.com PAGE_ID=...
 */

const {
  supportContainers,
  LAYOUT_VERSION,
} = require('../src/customer-support-landing-seed')

const API_BASE = (process.env.API_BASE || 'https://api.andertal.com').replace(/\/+$/, '')
const TOKEN = process.env.SELLER_TOKEN || process.env.ADMIN_TOKEN || ''
const PAGE_SLUG = process.env.PAGE_SLUG || 'customer-support'
const FORCE_PAGE_ID = process.env.PAGE_ID || ''

async function req(path, opts = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${TOKEN}`,
      ...(opts.headers || {}),
    },
  })
  const text = await res.text()
  let body
  try { body = JSON.parse(text) } catch { body = { raw: text } }
  if (!res.ok) {
    const err = new Error(body.message || `HTTP ${res.status}`)
    err.status = res.status
    err.body = body
    throw err
  }
  return body
}

async function main() {
  if (!TOKEN) throw new Error('SELLER_TOKEN (or ADMIN_TOKEN) is required')

  let pageId = FORCE_PAGE_ID
  if (!pageId) {
    // Prefer store public slug lookup (no auth filter issues)
    const store = await fetch(`${API_BASE}/store/pages/${encodeURIComponent(PAGE_SLUG)}`)
    if (!store.ok) throw new Error(`Store page ${PAGE_SLUG} not found (${store.status})`)
    const page = await store.json()
    pageId = page.id
    console.log(`page id=${pageId} title=${page.title} slug=${page.slug}`)
  }

  const existing = await req(`/admin-hub/landing-page/${encodeURIComponent(pageId)}`)
  const before = Array.isArray(existing.containers) ? existing.containers : []
  console.log(`before: ${before.length} containers; types=${before.map((c) => c.type).join(',')}`)

  const containers = supportContainers()
  const settings = {
    ...(existing.settings && typeof existing.settings === 'object' ? existing.settings : {}),
    support_landing_layout: LAYOUT_VERSION,
  }

  const saved = await req(`/admin-hub/landing-page/${encodeURIComponent(pageId)}`, {
    method: 'PUT',
    body: JSON.stringify({ containers, settings }),
  })

  const after = Array.isArray(saved.containers) ? saved.containers : []
  console.log(`after: ${after.length} containers; layout=${LAYOUT_VERSION}`)
  console.log(after.map((c) => `${c.visible_on}:${c.type}`).join('\n'))
}

main().catch((err) => {
  console.error('FAILED:', err.message, err.body ? JSON.stringify(err.body) : '')
  process.exit(1)
})
