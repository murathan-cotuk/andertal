'use strict'

const {
  becomeSellerLandingContainers,
  ensureBecomeSellerLanding,
  LAYOUT_VERSION,
  PAGE_SLUG,
} = require('./become-seller-landing-seed')

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed')
}

function testContainerStack() {
  const all = becomeSellerLandingContainers()
  assert(all.length === 39, `expected 39 containers, got ${all.length}`)
  const devices = new Set(all.map((c) => c.visible_on))
  assert(devices.has('desktop') && devices.has('tablet') && devices.has('mobile'), 'all devices')
  assert(all.some((c) => c.type === 'hero_banner'), 'hero')
  assert(all.some((c) => c.type === 'image_text' && c.image), 'image_text with image')
}

async function testEnsureSeedsWhenEmpty() {
  const state = { pages: [], landings: new Map(), begun: false }
  const client = {
    async query(sql, params = []) {
      const s = String(sql)
      if (s === 'BEGIN') { state.begun = true; return { rows: [] } }
      if (s === 'COMMIT' || s === 'ROLLBACK') { state.begun = false; return { rows: [] } }
      if (s.includes('information_schema.columns')) {
        return { rows: [{ column_name: 'slug' }, { column_name: 'handle' }] }
      }
      if (s.includes('FROM admin_hub_pages') && s.includes('SELECT id, slug')) {
        if (s.includes('id::text')) {
          return { rows: state.pages.filter((p) => p.id === params[0]) }
        }
        return { rows: state.pages.filter((p) => p.slug === params[0]) }
      }
      if (s.includes('INSERT INTO admin_hub_pages')) {
        const row = { id: 'page-new', slug: params[1] }
        state.pages.push(row)
        return { rows: [row] }
      }
      if (s.includes('FROM admin_hub_landing_pages') && s.includes('FOR UPDATE')) {
        const hit = state.landings.get(params[0])
        return { rows: hit ? [hit] : [] }
      }
      if (s.includes('INSERT INTO admin_hub_landing_pages')) {
        state.landings.set(params[0], {
          containers: JSON.parse(params[1]),
          settings: JSON.parse(params[2]),
        })
        return { rows: [] }
      }
      if (s.includes('UPDATE admin_hub_landing_pages')) {
        state.landings.set(params[0], {
          containers: JSON.parse(params[1]),
          settings: JSON.parse(params[2]),
        })
        return { rows: [] }
      }
      return { rows: [] }
    },
  }

  const first = await ensureBecomeSellerLanding(client, {})
  assert(first.created === true, 'creates page')
  assert(first.seeded === true, 'seeds containers')
  assert(first.added === 39, `seeded 39, got ${first.added}`)
  assert(state.landings.get(first.pageId).settings.become_seller_layout === LAYOUT_VERSION, 'layout marker')

  const second = await ensureBecomeSellerLanding(client, {})
  assert(second.skipped === true, 'skips when containers exist')
  assert(second.seeded === false, 'no re-seed')

  const forced = await ensureBecomeSellerLanding(client, { force: true })
  assert(forced.seeded === true, 'force re-seeds')
  assert(forced.added === 39, 'force still 39')
}

testContainerStack()
testEnsureSeedsWhenEmpty()
  .then(() => console.log('become-seller-landing-seed.test.js OK', PAGE_SLUG, LAYOUT_VERSION))
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
