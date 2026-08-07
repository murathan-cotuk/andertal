'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const {
  LAYOUT_VERSION,
  DEVICE_PRESETS,
  supportContainers,
  buildDeviceAmazonContainers,
  migrateToAmazonLayout,
  stripTestBlocks,
} = require('./customer-support-landing-seed')
const { _sanitizeLandingPayload } = require('./routes/pages')

const AMAZON_ORDER = [
  'support_order_picker',
  'support_help_cards',
  'support_help_library',
  'support_case_wizard',
]

test('layout version is amazon_v2 (permanence marker)', () => {
  assert.equal(LAYOUT_VERSION, 'amazon_v2')
})

test('device presets cover desktop/tablet/mobile with distinct padding', () => {
  assert.deepEqual(Object.keys(DEVICE_PRESETS).sort(), ['desktop', 'mobile', 'tablet'])
  assert.notEqual(DEVICE_PRESETS.desktop.padding, DEVICE_PRESETS.tablet.padding)
  assert.notEqual(DEVICE_PRESETS.tablet.padding, DEVICE_PRESETS.mobile.padding)
  assert.equal(DEVICE_PRESETS.mobile.orders_limit, 3)
  assert.equal(DEVICE_PRESETS.tablet.orders_limit, 4)
  assert.equal(DEVICE_PRESETS.desktop.orders_limit, 6)
})

test('full seed has 12 containers: 4 types × 3 devices in Amazon order', () => {
  const containers = supportContainers()
  assert.equal(containers.length, 12)
  for (const device of ['desktop', 'tablet', 'mobile']) {
    const stack = containers.filter((c) => c.visible_on === device)
    assert.equal(stack.length, 4)
    assert.deepEqual(stack.map((c) => c.type), AMAZON_ORDER)
  }
})

test('each device stack carries device-specific padding and i18n', () => {
  for (const device of ['desktop', 'tablet', 'mobile']) {
    const stack = buildDeviceAmazonContainers(device)
    const preset = DEVICE_PRESETS[device]
    for (const container of stack) {
      assert.equal(container.visible_on, device)
      assert.equal(container.visible, true)
      assert.equal(container.padding, preset.padding)
      assert.equal(container.content_max_width, preset.content_max_width)
      assert.ok(container.title || container.type === 'support_case_wizard')
      assert.ok(container._i18n)
      for (const lang of ['en', 'tr', 'fr', 'es', 'it']) {
        assert.ok(container._i18n[lang], `${container.type} missing ${lang}`)
      }
      assert.equal(container._i18n.de, undefined)
    }
    assert.equal(stack[0].orders_limit, preset.orders_limit)
    assert.equal(stack[1].cards.length, 4)
    assert.ok(stack[2].topics.length >= 1)
    assert.ok(stack[2].articles.length >= 1)
    assert.ok(stack[3].categories.length >= 1)
  }
})

test('stripTestBlocks removes YAPTIM OLDU text blocks only', () => {
  const input = [
    { type: 'text_block', title: 'YAPTIM OLDU', body: 'x' },
    { type: 'text_block', title: 'Keep me', body: 'ok' },
    { type: 'support_hero', title: 'Hero' },
  ]
  const out = stripTestBlocks(input)
  assert.equal(out.length, 2)
  assert.equal(out[0].title, 'Keep me')
  assert.equal(out[1].type, 'support_hero')
})

test('migrateToAmazonLayout rebuilds stack, strips tests, keeps custom types', () => {
  const messy = [
    { type: 'text_block', visible_on: 'desktop', title: 'YAPTIM OLDU' },
    { type: 'support_hero', visible_on: 'tablet', title: 'old' },
    { type: 'support_faq', visible_on: 'mobile', title: 'old faq' },
    { type: 'newsletter', visible_on: 'desktop', title: 'Custom' },
  ]
  const migrated = migrateToAmazonLayout(messy)
  assert.equal(migrated.filter((c) => c.type === 'newsletter').length, 1)
  assert.equal(migrated.filter((c) => c.type === 'support_hero').length, 0)
  assert.equal(migrated.filter((c) => c.type === 'support_faq').length, 0)
  assert.ok(!JSON.stringify(migrated).includes('YAPTIM'))
  assert.equal(migrated.filter((c) => AMAZON_ORDER.includes(c.type)).length, 12)
})

test('full amazon seed sanitizes cleanly (backend permanence)', () => {
  const { containers } = _sanitizeLandingPayload({ containers: supportContainers() })
  assert.equal(containers.length, 12)
  for (const c of containers) {
    assert.ok(AMAZON_ORDER.includes(c.type))
    assert.ok(['desktop', 'tablet', 'mobile'].includes(c.visible_on))
  }
})

test('nested children still sanitize with amazon root (nesting permanence)', () => {
  const [picker] = buildDeviceAmazonContainers('desktop')
  const payload = {
    containers: [{
      ...picker,
      children: [{
        id: 'child_text',
        type: 'text_block',
        title: 'Nested CTA',
        body: 'Hello',
        visible: true,
      }],
    }],
  }
  const { containers } = _sanitizeLandingPayload(payload)
  assert.equal(containers[0].type, 'support_order_picker')
  assert.equal(containers[0].children.length, 1)
  assert.equal(containers[0].children[0].type, 'text_block')
})

test('depth 4 nesting is rejected', () => {
  assert.throws(() => {
    _sanitizeLandingPayload({
      containers: [{
        id: 'r', type: 'text_block', title: 't', body: 'b',
        children: [{
          id: 'c', type: 'text_block', title: 't', body: 'b',
          children: [{
            id: 'g', type: 'text_block', title: 't', body: 'b',
            children: [{ id: 'too', type: 'text_block', title: 't', body: 'b' }],
          }],
        }],
      }],
    })
  }, /nesting deeper than 3/)
})
