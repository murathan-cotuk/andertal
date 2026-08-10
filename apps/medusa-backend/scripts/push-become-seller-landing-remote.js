'use strict'

/**
 * Push Verkäufer-werden landing containers to production API.
 * Usage: SELLER_TOKEN=... node scripts/push-become-seller-landing-remote.js
 */

const {
  becomeSellerContainers,
  LAYOUT_VERSION,
  PAGE_SLUG,
  PAGE_ID,
} = require('../src/become-seller-landing-seed')

const API_BASE = (process.env.API_BASE || 'https://api.andertal.com').replace(/\/+$/, '')
const TOKEN = process.env.SELLER_TOKEN || process.env.ADMIN_TOKEN || ''
const FORCE_PAGE_ID = process.env.PAGE_ID || PAGE_ID || ''

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
    const store = await fetch(`${API_BASE}/store/pages/${encodeURIComponent(PAGE_SLUG)}`)
    if (!store.ok) throw new Error(`Store page ${PAGE_SLUG} not found (${store.status})`)
    const page = await store.json()
    pageId = page.id
    console.log(`page id=${pageId} title=${page.title} slug=${page.slug}`)
  } else {
    console.log(`using page id=${pageId}`)
  }

  const existing = await req(`/admin-hub/landing-page/${encodeURIComponent(pageId)}`)
  const before = Array.isArray(existing.containers) ? existing.containers : []
  console.log(`before: ${before.length} containers`)

  const desktop = becomeSellerContainers('desktop')
  const tablet = becomeSellerContainers('tablet')
  const mobile = becomeSellerContainers('mobile')
  const containers = [...desktop, ...tablet, ...mobile]

  const settings = {
    ...(existing.settings && typeof existing.settings === 'object' ? existing.settings : {}),
    become_seller_layout: LAYOUT_VERSION,
  }

  const saved = await req(`/admin-hub/landing-page/${encodeURIComponent(pageId)}`, {
    method: 'PUT',
    body: JSON.stringify({ containers, settings }),
  })

  const after = Array.isArray(saved.containers) ? saved.containers : []
  console.log(`after: ${after.length} containers; layout=${LAYOUT_VERSION}`)
  console.log(`desktop types: ${desktop.map((c) => c.type).join(', ')}`)
}

main().catch((err) => {
  console.error('FAILED:', err.message, err.body ? JSON.stringify(err.body) : '')
  process.exit(1)
})
