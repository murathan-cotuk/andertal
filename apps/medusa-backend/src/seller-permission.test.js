'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { pagePermitted } = require('./seller-permission')

test('owners, superusers and unrestricted team members pass', () => {
  assert.equal(pagePermitted({ sub_of_seller_id: null }, '/settings/payments'), true)
  assert.equal(pagePermitted({ is_superuser: true, sub_of_seller_id: 's1' , permissions: ['/orders'] }, '/settings/payments'), true)
  assert.equal(pagePermitted({ sub_of_seller_id: 's1', permissions: null }, '/settings/payments'), true)
})

test('restricted team member needs the page (or a parent path)', () => {
  const u = { sub_of_seller_id: 's1', permissions: ['/orders', '/settings/verification'] }
  assert.equal(pagePermitted(u, '/settings/payments'), false)
  assert.equal(pagePermitted(u, '/settings/verification'), true)
  assert.equal(pagePermitted({ sub_of_seller_id: 's1', permissions: '["/settings"]' }, '/settings/users-permissions'), true)
  assert.equal(pagePermitted({ sub_of_seller_id: 's1', permissions: ['/settingsX'] }, '/settings/payments'), false)
  assert.equal(pagePermitted(null, '/orders'), false)
})
