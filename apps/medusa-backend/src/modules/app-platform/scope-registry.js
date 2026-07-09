'use strict'

const SCOPES = {
  read_products:         'Read products',
  write_products:        'Create and update products',
  read_orders:           'Read orders',
  write_orders:          'Update order status (limited)',
  write_fulfillments:    'Write tracking number and shipping status',
  read_inventory:        'Read inventory levels',
  write_inventory:       'Update inventory',
  read_customers:        'Read customer data (GDPR-sensitive — requires justification)',
  read_analytics:        'Read sales analytics and reports',
  write_discounts:       'Create coupons and discounts',
  read_brands:           'Read brand data',
  write_brands:          'Create and update brands',
  read_categories:       'Read product categories',
  write_shipping_methods:'Create shipping groups and methods',
  read_seller_settings:  'Read seller profile and settings',
  write_storefront:      'Add blocks to the shop UI (shop_app Tier 1 only)',
  write_checkout:        'Add checkout extensions (shop_app Tier 1 only)',
}

const SHOP_APP_ONLY_SCOPES = new Set(['write_storefront', 'write_checkout'])

function isValidScope(scope) {
  return Object.prototype.hasOwnProperty.call(SCOPES, scope)
}

function getScopeDescription(scope) {
  return SCOPES[scope] || scope
}

function isShopAppOnlyScope(scope) {
  return SHOP_APP_ONLY_SCOPES.has(scope)
}

function validateScopes(scopes) {
  if (!Array.isArray(scopes)) return ['scopes must be an array']
  const errors = []
  for (const s of scopes) {
    if (!isValidScope(s)) errors.push(`Unknown scope: "${s}"`)
  }
  return errors
}

module.exports = { SCOPES, SHOP_APP_ONLY_SCOPES, isValidScope, getScopeDescription, isShopAppOnlyScope, validateScopes }
