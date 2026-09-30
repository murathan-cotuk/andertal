'use strict'

/**
 * One-off seed: apps/shop's "Erneut Kaufen" (buy-again) second-nav page had zero landing
 * containers (LegalPageShell "no content" fallback — genuinely blank for visitors), unlike
 * its sibling pages (bestsellers/sales/neuheiten), which src/catalog-landing-pages-seed.js
 * already seeds. Mirrors that script's container shape (text_block intro + personalized_
 * product_row × desktop/tablet/mobile) with two algorithms already built in personalization.js:
 * 'reorder' (past purchases) and 'favorited' (Merkzettel), both of which fall back to guest-safe
 * bestsellers automatically for logged-out visitors (see personalization.js GUEST_SAFE_ALGORITHMS).
 */

const { randomUUID } = require('crypto')

const PAGE_SLUG = 'erneut-kaufen'

const DEVICE_PRESETS = {
  desktop: { padding: '40px 24px', content_max_width: '1200px', visible_count: 5 },
  tablet: { padding: '32px 20px', content_max_width: '960px', visible_count: 4 },
  mobile: { padding: '24px 16px', content_max_width: '100%', visible_count: 2 },
}

const INTRO_BODY = {
  de: '<p>Hier finden Sie alles, was Sie bei Andertal schon einmal bestellt haben — schnell und unkompliziert erneut kaufen.</p><p>Ihre bewährten Favoriten, ohne erneute Suche.</p><ul><li>Bisherige Bestellungen auf einen Blick</li><li>Ein Klick zum erneuten Kauf</li><li>Auch Ihre Merkzettel-Favoriten inklusive</li></ul>',
  en: "<p>Everything you've ordered from Andertal before — reorder quickly and easily, all in one place.</p><p>Your proven favorites, without searching again.</p><ul><li>Past orders at a glance</li><li>One click to reorder</li><li>Includes your wishlist favorites too</li></ul>",
  tr: '<p>Andertal’den daha önce sipariş ettiğiniz her şey — hızlı ve kolayca tekrar satın alın, hepsi bir arada.</p><p>Kanıtlanmış favorileriniz, tekrar aramaya gerek kalmadan.</p><ul><li>Geçmiş siparişleriniz tek bakışta</li><li>Tek tıkla tekrar satın alın</li><li>Merkzettel favorileriniz de dahil</li></ul>',
  fr: "<p>Tout ce que vous avez déjà commandé sur Andertal — recommandez rapidement et facilement, au même endroit.</p><p>Vos favoris éprouvés, sans nouvelle recherche.</p><ul><li>Vos commandes précédentes en un coup d'œil</li><li>Un clic pour recommander</li><li>Vos favoris de la liste de souhaits inclus</li></ul>",
  es: '<p>Todo lo que ya has pedido en Andertal — vuelve a comprarlo rápida y fácilmente, todo en un solo lugar.</p><p>Tus favoritos de confianza, sin tener que buscar de nuevo.</p><ul><li>Tus pedidos anteriores de un vistazo</li><li>Un clic para volver a comprar</li><li>Incluye también tus favoritos de la lista de deseos</li></ul>',
  it: "<p>Tutto ciò che hai già ordinato su Andertal — riordina in modo rapido e semplice, tutto in un unico posto.</p><p>I tuoi preferiti di fiducia, senza dover cercare di nuovo.</p><ul><li>I tuoi ordini precedenti a colpo d'occhio</li><li>Un clic per riordinare</li><li>Include anche i tuoi preferiti della lista dei desideri</li></ul>",
}

const REORDER_TITLE = { de: 'Erneut bestellen', en: 'Order it again', tr: 'Yeniden sipariş ver', fr: 'Recommander', es: 'Volver a pedir', it: 'Ordina di nuovo' }
const FAVORITED_TITLE = { de: 'Ihre gemerkten Favoriten', en: 'Your saved favorites', tr: 'Kaydettiğin favorilerin', fr: 'Vos favoris enregistrés', es: 'Tus favoritos guardados', it: 'I tuoi preferiti salvati' }

const LANGS = ['en', 'tr', 'fr', 'es', 'it']
const i18nOf = (map, field) => Object.fromEntries(LANGS.map((l) => [l, { [field]: map[l] }]))

function textBlock(visibleOn) {
  const preset = DEVICE_PRESETS[visibleOn]
  return {
    id: randomUUID(),
    type: 'text_block',
    body: INTRO_BODY.de,
    _i18n: i18nOf(INTRO_BODY, 'body'),
    align: 'left',
    title: '',
    padding: preset.padding,
    visible: true,
    bg_color: '#ffffff',
    text_color: '#111827',
    visible_on: visibleOn,
    content_layout: 'contained',
    content_max_width: preset.content_max_width,
  }
}

function productRow(visibleOn, algorithm, titleMap) {
  const preset = DEVICE_PRESETS[visibleOn]
  return {
    id: randomUUID(),
    gap: 12,
    type: 'personalized_product_row',
    _i18n: i18nOf(titleMap, 'title'),
    title: titleMap.de,
    padding: preset.padding,
    visible: true,
    algorithm,
    visible_on: visibleOn,
    visible_count: preset.visible_count,
    content_layout: 'contained',
    content_max_width: preset.content_max_width,
  }
}

const containers = []
for (const viewport of ['desktop', 'tablet', 'mobile']) {
  containers.push(textBlock(viewport))
  containers.push(productRow(viewport, 'reorder', REORDER_TITLE))
  containers.push(productRow(viewport, 'favorited', FAVORITED_TITLE))
}

async function main() {
  require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.local') })
  const { Client } = require('pg')
  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
  await client.connect()
  try {
    const page = await client.query('SELECT id FROM admin_hub_pages WHERE slug = $1', [PAGE_SLUG])
    if (!page.rows[0]?.id) throw new Error(`admin_hub_pages row not found for slug=${PAGE_SLUG}`)
    const pageId = page.rows[0].id

    const existing = await client.query('SELECT page_id, jsonb_array_length(containers) AS n FROM admin_hub_landing_pages WHERE page_id = $1', [pageId])
    if (existing.rows[0] && Number(existing.rows[0].n) > 0) {
      console.log(`admin_hub_landing_pages already has ${existing.rows[0].n} containers for ${PAGE_SLUG} — aborting, not overwriting.`)
      return
    }

    await client.query(
      `INSERT INTO admin_hub_landing_pages (page_id, containers, settings, updated_at)
       VALUES ($1, $2::jsonb, '{}'::jsonb, now())
       ON CONFLICT (page_id) DO UPDATE SET containers = EXCLUDED.containers, updated_at = now()
       WHERE jsonb_array_length(admin_hub_landing_pages.containers) = 0`,
      [pageId, JSON.stringify(containers)],
    )
    console.log(`Seeded ${containers.length} containers for "${PAGE_SLUG}" (page_id=${pageId}).`)
  } finally {
    await client.end()
  }
}

main().catch((e) => {
  console.error('ERR', e.message)
  process.exit(1)
})
