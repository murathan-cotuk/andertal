'use strict'

const { assertImplementsConnectorInterface } = require('./connector-interface')

/** erp_type -> lazy adapter factory. Lazy so a missing dependency in one adapter never breaks the others. */
const ADAPTER_FACTORIES = {
  billbee: () => require('./adapters/billbee-connector'),
  jtl: () => require('./adapters/jtl-scx-connector'),
}

const instances = new Map()

/**
 * Returns the connector adapter for `erpType`, or null if `erpType` isn't implemented yet
 * (e.g. 'xentral', 'plentymarkets' — Faz 2, "Coming soon" in SellerCentral).
 */
function getConnector(erpType) {
  const key = String(erpType || '').trim().toLowerCase()
  if (!key) return null
  if (instances.has(key)) return instances.get(key)
  const factory = ADAPTER_FACTORIES[key]
  if (!factory) return null
  const adapter = factory()
  assertImplementsConnectorInterface(adapter, key)
  instances.set(key, adapter)
  return adapter
}

/** erp_types this registry actually implements right now (drives "Coming soon" vs active in the UI). */
function listSupportedErpTypes() {
  return Object.keys(ADAPTER_FACTORIES)
}

module.exports = { getConnector, listSupportedErpTypes }
