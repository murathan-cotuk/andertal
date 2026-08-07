'use strict'

/**
 * DB-free smoke for Kundenservice Amazon landing seed + sanitize.
 * Exit 0 = OK. Run: node scripts/smoke-customer-support-landing.js
 */

const {
  LAYOUT_VERSION,
  supportContainers,
  migrateToAmazonLayout,
  DEVICE_PRESETS,
} = require('../src/customer-support-landing-seed')
const { _sanitizeLandingPayload } = require('../src/routes/pages')

const fail = (msg) => {
  console.error(`FAIL: ${msg}`)
  process.exit(1)
}

const containers = supportContainers()
if (LAYOUT_VERSION !== 'amazon_v2') fail(`expected layout amazon_v2, got ${LAYOUT_VERSION}`)
if (containers.length !== 12) fail(`expected 12 containers, got ${containers.length}`)

for (const device of ['desktop', 'tablet', 'mobile']) {
  const stack = containers.filter((c) => c.visible_on === device)
  const types = stack.map((c) => c.type).join(',')
  const expected = 'support_order_picker,support_help_cards,support_help_library,support_case_wizard'
  if (types !== expected) fail(`${device} order: ${types}`)
  if (stack[0].padding !== DEVICE_PRESETS[device].padding) {
    fail(`${device} padding mismatch`)
  }
}

let sanitized
try {
  sanitized = _sanitizeLandingPayload({ containers })
} catch (err) {
  fail(`sanitize: ${err.message}`)
}
if (sanitized.containers.length !== 12) fail('sanitize count')

const migrated = migrateToAmazonLayout([
  { type: 'text_block', title: 'YAPTIM OLDU', visible_on: 'desktop' },
  { type: 'support_hero', visible_on: 'mobile' },
])
if (migrated.some((c) => c.type === 'support_hero')) fail('migrate left hero')
if (/YAPTIM/i.test(JSON.stringify(migrated))) fail('migrate left YAPTIM OLDU')

console.log(`OK smoke customer-support landing layout=${LAYOUT_VERSION} containers=${containers.length}`)
process.exit(0)
