'use strict'
/**
 * One-off: add a text_block "YAPTIM OLDU" to Kundenservice (/customer-support) landing.
 *
 * Usage (pick one):
 *   set SELLER_TOKEN=<jwt> && node scripts/add-yaptim-oldu-text-block.js
 *   set DATABASE_URL=postgres://... && node scripts/add-yaptim-oldu-text-block.js
 *
 * Optional: BACKEND_URL (default https://api.andertal.com)
 */
const { randomUUID } = require('crypto')

const BACKEND = (process.env.BACKEND_URL || process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || 'https://api.andertal.com').replace(/\/$/, '')
const TOKEN = String(process.env.SELLER_TOKEN || process.env.ADMIN_TOKEN || '').trim()
const DB = String(process.env.DATABASE_URL || '').trim()
const MARKER = 'YAPTIM OLDU'
const PAGE_SLUG = 'customer-support'

function makeTextBlock(visibleOn) {
  return {
    id: randomUUID(),
    type: 'text_block',
    visible: true,
    visible_on: visibleOn,
    title: MARKER,
    body: MARKER,
    btn_text: '',
    btn_url: '',
    align: 'center',
    bg_color: '#ffffff',
    text_color: '#111827',
    padding: '48px 24px',
    btn_bg: '#ff971c',
    btn_color: '#fff',
    btn_border: '2px solid #000',
    btn_radius: 8,
    content_layout: 'contained',
    content_max_width: '800px',
  }
}

function alreadyHasMarker(containers) {
  return (containers || []).some((c) => {
    if (c?.type !== 'text_block') return false
    const t = String(c.title || '')
    const b = String(c.body || '')
    return t.includes(MARKER) || b.includes(MARKER)
  })
}

function mergeContainers(existing) {
  const list = Array.isArray(existing) ? [...existing] : []
  if (alreadyHasMarker(list)) return { containers: list, added: 0 }
  const extras = ['desktop', 'tablet', 'mobile'].map(makeTextBlock)
  return { containers: [...extras, ...list], added: extras.length }
}

async function viaApi(pageId) {
  if (!TOKEN) throw new Error('SELLER_TOKEN required for API mode')
  const getRes = await fetch(`${BACKEND}/admin-hub/landing-page/${pageId}`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  })
  if (!getRes.ok) throw new Error(`GET landing ${getRes.status}: ${await getRes.text()}`)
  const data = await getRes.json()
  const { containers, added } = mergeContainers(data.containers)
  if (!added) {
    console.log('Already has YAPTIM OLDU text_block — nothing to do')
    return
  }
  const putRes = await fetch(`${BACKEND}/admin-hub/landing-page/${pageId}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ containers, settings: data.settings || {} }),
  })
  if (!putRes.ok) throw new Error(`PUT landing ${putRes.status}: ${await putRes.text()}`)
  console.log(`OK via API: added ${added} text_block(s) to page ${pageId}`)
}

async function resolvePageIdViaStore() {
  const res = await fetch(`${BACKEND}/store/pages/${PAGE_SLUG}`)
  if (!res.ok) throw new Error(`store pages ${res.status}`)
  const page = await res.json()
  if (!page?.id) throw new Error('page id missing')
  return String(page.id)
}

async function viaDb() {
  const dbUrl = DB.replace(/^postgresql:\/\//, 'postgres://')
  const { Client } = require('pg')
  const isRender = dbUrl.includes('render.com')
  const client = new Client({
    connectionString: dbUrl,
    ssl: isRender ? { rejectUnauthorized: false } : false,
  })
  await client.connect()
  try {
    const pageR = await client.query(
      `SELECT id FROM admin_hub_pages
       WHERE regexp_replace(slug, '^/+', '') = $1
       ORDER BY updated_at DESC NULLS LAST LIMIT 1`,
      [PAGE_SLUG],
    )
    if (!pageR.rows[0]) throw new Error('customer-support page not found')
    const pageId = String(pageR.rows[0].id)
    const lpR = await client.query(
      'SELECT containers, settings FROM admin_hub_landing_pages WHERE page_id = $1 FOR UPDATE',
      [pageId],
    )
    const existing = lpR.rows[0]?.containers
    const settings = lpR.rows[0]?.settings && typeof lpR.rows[0].settings === 'object' ? lpR.rows[0].settings : {}
    const { containers, added } = mergeContainers(existing)
    if (!added) {
      console.log('Already has YAPTIM OLDU text_block — nothing to do')
      return
    }
    await client.query(
      `INSERT INTO admin_hub_landing_pages (page_id, containers, settings, updated_at)
       VALUES ($1, $2::jsonb, $3::jsonb, NOW())
       ON CONFLICT (page_id) DO UPDATE SET containers = $2::jsonb, settings = $3::jsonb, updated_at = NOW()`,
      [pageId, JSON.stringify(containers), JSON.stringify(settings)],
    )
    console.log(`OK via DB: added ${added} text_block(s) to page ${pageId}`)
  } finally {
    await client.end()
  }
}

async function main() {
  if (DB) {
    await viaDb()
    return
  }
  const pageId = await resolvePageIdViaStore()
  console.log('pageId', pageId)
  await viaApi(pageId)
}

main().catch((e) => {
  console.error(e.message || e)
  process.exit(1)
})
