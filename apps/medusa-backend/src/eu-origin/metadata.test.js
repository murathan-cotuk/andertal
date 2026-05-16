const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const { applyEuOriginMetadataPolicy, pickEuOriginFields } = require('./metadata')
const { EU_ORIGIN_STATUS } = require('./constants')

describe('applyEuOriginMetadataPolicy', () => {
  it('strips verified fields for non-superuser', () => {
    const existing = { eu_origin_status: 'verified', eu_origin_verified_at: '2020-01-01' }
    const incoming = {
      eu_origin_status: 'verified',
      eu_origin_verified_at: '2099-01-01',
      eu_origin_registry_id: 'REG-1',
    }
    const out = applyEuOriginMetadataPolicy(incoming, existing, { isSuperuser: false })
    assert.equal(out.eu_origin_status, 'verified')
    assert.equal(out.eu_origin_verified_at, '2020-01-01')
    assert.equal(out.eu_origin_registry_id, 'REG-1')
  })

  it('sets pending when seller changes registry on unverified product', () => {
    const existing = {}
    const incoming = { eu_origin_registry_id: 'NEW', eu_origin_country: 'DE' }
    const out = applyEuOriginMetadataPolicy(incoming, existing, { isSuperuser: false })
    assert.equal(out.eu_origin_status, EU_ORIGIN_STATUS.PENDING)
  })
})

describe('pickEuOriginFields', () => {
  it('normalizes status to lowercase', () => {
    const f = pickEuOriginFields({ eu_origin_status: 'VERIFIED' })
    assert.equal(f.eu_origin_status, 'verified')
  })
})
