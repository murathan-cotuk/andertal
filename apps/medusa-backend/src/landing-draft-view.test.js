'use strict'

const {
  _resolveAdminLandingView,
  _resolveStoreLandingView,
  _isAdminHubLandingReq,
} = require('./routes/pages')

function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

const published = {
  containers: [{ id: 'live', type: 'hero_banner' }],
  settings: { a: 1 },
  draft_containers: null,
  draft_settings: null,
}
const withDraft = {
  ...published,
  draft_containers: [{ id: 'draft', type: 'text_block' }],
  draft_settings: { a: 2 },
}

const adminLive = _resolveAdminLandingView(published)
assert(adminLive.containers[0].id === 'live', 'admin without draft uses published')
assert(adminLive.has_unpublished_draft === false, 'no draft flag')

const adminDraft = _resolveAdminLandingView(withDraft)
assert(adminDraft.containers[0].id === 'draft', 'admin with draft uses draft')
assert(adminDraft.has_unpublished_draft === true, 'draft flag')
assert(adminDraft.published_containers[0].id === 'live', 'published copy kept')

const storeDraft = _resolveStoreLandingView(withDraft)
assert(storeDraft.containers[0].id === 'live', 'store never sees draft')
assert(storeDraft.has_unpublished_draft === false, 'store has no draft flag')

assert(_isAdminHubLandingReq({ originalUrl: '/admin-hub/landing-page', baseUrl: '' }) === true, 'admin path')
assert(_isAdminHubLandingReq({ originalUrl: '/store/landing-page', baseUrl: '' }) === false, 'store path')

console.log('landing-draft-view.test.js OK')
