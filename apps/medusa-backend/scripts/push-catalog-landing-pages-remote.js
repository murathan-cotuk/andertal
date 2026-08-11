'use strict'

/**
 * Push catalog hub CMS pages + landing containers to a remote API (production).
 * Usage: SELLER_TOKEN=... node scripts/push-catalog-landing-pages-remote.js
 *
 * Note: bestsellers/sales/brands/neuheiten are reserved shop route slugs.
 * Neuheiten content lives on CMS slug `new-in` (existing page).
 */

const {
  CATALOG_PAGES,
  buildPageContainers,
  LAYOUT_VERSION,
  NATIVE_LAYOUT_VERSION,
} = require('../src/catalog-landing-pages-seed')

const API_BASE = (process.env.API_BASE || 'https://api.andertal.com').replace(/\/+$/, '')
const TOKEN = process.env.SELLER_TOKEN || process.env.ADMIN_TOKEN || ''

/** Prefer these page ids/slugs when store lookup by seed slug fails. */
const SLUG_ALIASES = {
  'new-in': ['new-in', 'neuheiten'],
  bestsellers: ['bestsellers'],
  sales: ['sales'],
  brands: ['brands', 'marke', 'marken'],
}

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

async function findPage(slug) {
  const aliases = SLUG_ALIASES[slug] || [slug]
  for (const candidate of aliases) {
    try {
      const store = await fetch(`${API_BASE}/store/pages/${encodeURIComponent(candidate)}`)
      if (store.ok) {
        const page = await store.json()
        return page
      }
    } catch (_) { /* continue */ }
  }
  // Admin list fallback
  const list = await req('/admin-hub/v1/pages?limit=200')
  const pages = Array.isArray(list.pages) ? list.pages : []
  for (const candidate of aliases) {
    const hit = pages.find((p) => String(p.slug || '') === candidate)
    if (hit) return hit
  }
  return null
}

function pageI18nPayload(pageDef) {
  const title_i18n = { de: { title: pageDef.titles.de } }
  const body_i18n = { de: { body: pageDef.bodies.de } }
  for (const lang of ['en', 'tr', 'fr', 'es', 'it']) {
    title_i18n[lang] = { title: pageDef.titles[lang] }
    body_i18n[lang] = { body: pageDef.bodies[lang] }
  }
  return {
    title: pageDef.titles.de,
    body: pageDef.bodies.de,
    status: 'published',
    page_type: 'page',
    title_i18n,
    body_i18n,
  }
}

async function ensurePage(pageDef) {
  const existing = await findPage(pageDef.slug)
  if (existing?.id) {
    const updated = await req(`/admin-hub/v1/pages/${encodeURIComponent(existing.id)}`, {
      method: 'PUT',
      body: JSON.stringify({
        ...pageI18nPayload(pageDef),
        // Keep existing slug (may be alias like new-in)
        slug: existing.slug,
      }),
    })
    return { page: updated, created: false }
  }

  // Create only if slug is not reserved — otherwise fail clearly
  try {
    const created = await req('/admin-hub/v1/pages', {
      method: 'POST',
      body: JSON.stringify({
        ...pageI18nPayload(pageDef),
        slug: pageDef.slug,
      }),
    })
    return { page: created, created: true }
  } catch (err) {
    throw new Error(`Cannot create page ${pageDef.slug}: ${err.message}`)
  }
}

async function pushLanding(pageId, pageDef, existingSettings) {
  const containers = buildPageContainers(pageDef)
  const layout = pageDef.nativeCatalog ? NATIVE_LAYOUT_VERSION : LAYOUT_VERSION
  const settings = {
    ...(existingSettings && typeof existingSettings === 'object' ? existingSettings : {}),
    catalog_landing_layout: layout,
  }
  if (pageDef.nativeCatalog) delete settings.catalog_use_containers
  return req(`/admin-hub/landing-page/${encodeURIComponent(pageId)}`, {
    method: 'PUT',
    body: JSON.stringify({ containers, settings }),
  })
}

async function main() {
  if (!TOKEN) throw new Error('SELLER_TOKEN (or ADMIN_TOKEN) is required')

  const profile = await req('/admin-hub/v1/seller/profile')
  console.log(`auth email=${profile?.user?.email} super=${profile?.user?.is_superuser}`)
  if (!profile?.user?.is_superuser) {
    console.warn('WARNING: token is not superuser — page list/editor may still be limited')
  }

  for (const pageDef of CATALOG_PAGES) {
    console.log(`\n=== ${pageDef.slug} ===`)
    const { page, created } = await ensurePage(pageDef)
    const pageId = page.id
    console.log(`${created ? 'created' : 'updated'} page id=${pageId} slug=${page.slug} title=${page.title}`)

    let beforeCount = 0
    let existingSettings = {}
    try {
      const landing = await req(`/admin-hub/landing-page/${encodeURIComponent(pageId)}`)
      beforeCount = Array.isArray(landing.containers) ? landing.containers.length : 0
      existingSettings = landing.settings || {}
    } catch (_) { /* empty */ }

    const saved = await pushLanding(pageId, pageDef, existingSettings)
    const after = Array.isArray(saved.containers) ? saved.containers : []
    const layout = pageDef.nativeCatalog ? NATIVE_LAYOUT_VERSION : LAYOUT_VERSION
    console.log(`landing ${beforeCount} → ${after.length} containers; layout=${layout}`)
    console.log(after.length ? after.map((c) => `${c.visible_on}:${c.type}`).join(', ') : '(empty — native shop template)')
  }

  console.log('\nDone.')
}

main().catch((err) => {
  console.error('FAILED:', err.message, err.body ? JSON.stringify(err.body) : '')
  process.exit(1)
})
