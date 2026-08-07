'use strict'

const assert = require('assert')
const {
  LAYOUT_VERSION,
  CATALOG_PAGES,
  buildPageContainers,
} = require('./catalog-landing-pages-seed')

assert.strictEqual(LAYOUT_VERSION, 'catalog_hub_v1')
assert.strictEqual(CATALOG_PAGES.length, 4)
assert.deepStrictEqual(
  CATALOG_PAGES.map((p) => p.slug).sort(),
  ['bestsellers', 'brands', 'new-in', 'sales'],
)

for (const page of CATALOG_PAGES) {
  assert.ok(page.titles.de)
  assert.ok(page.bodies.de)
  assert.ok(!/<h1\b/i.test(page.bodies.de), `${page.slug} DE body must not contain H1`)
  for (const lang of ['en', 'tr', 'fr', 'es', 'it']) {
    assert.ok(page.titles[lang], `${page.slug} missing title ${lang}`)
    assert.ok(page.bodies[lang], `${page.slug} missing body ${lang}`)
    assert.ok(!/<h1\b/i.test(page.bodies[lang]), `${page.slug} ${lang} body must not contain H1`)
  }

  const containers = buildPageContainers(page)
  // 3 devices × (intro + rows/features + newsletter) — brands has feature+seller instead of 2 product rows
  assert.ok(containers.length >= 9, `${page.slug} expected >=9 containers, got ${containers.length}`)
  const devices = new Set(containers.map((c) => c.visible_on))
  assert.deepStrictEqual([...devices].sort(), ['desktop', 'mobile', 'tablet'])
  assert.ok(containers.every((c) => c.id && c.type && c.visible === true))
  assert.ok(containers.some((c) => c.type === 'text_block'))
  assert.ok(containers.some((c) => c.type === 'newsletter'))
  if (page.slug === 'brands') {
    assert.ok(containers.some((c) => c.type === 'feature_grid'))
    assert.ok(containers.some((c) => c.type === 'seller_carousel'))
  } else {
    assert.ok(containers.some((c) => c.type === 'personalized_product_row' && c.algorithm === page.algorithm))
  }
  // Intro text_block has empty title (page H1 is separate) and localized body
  const intro = containers.find((c) => c.type === 'text_block' && c.visible_on === 'desktop')
  assert.ok(intro)
  assert.strictEqual(intro.title, '')
  assert.ok(intro.body && intro.body.includes('<p>'))
  assert.ok(intro._i18n?.en?.body)
}

console.log('catalog-landing-pages-seed.test.js: ok')
