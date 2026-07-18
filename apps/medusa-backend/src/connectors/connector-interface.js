'use strict'

/**
 * Shared shape every ERP connector adapter (Billbee, JTL, and future adapters) implements.
 * Not every method is meaningful for every ERP (e.g. JTL's "sync" is really "drain the event
 * queue", Billbee has no inbound webhook worth calling syncProductsFull on) — adapters that
 * don't support an operation should return `{ ok: true, skipped: true, reason: '...' }` rather
 * than throwing, so the queue workers in flow-queue-based jobs can treat every adapter uniformly.
 *
 * @typedef {Object} ConnectorConnectionStatus
 * @property {boolean} connected
 * @property {string} status - 'connected' | 'disconnected' | 'error' | 'pending'
 * @property {Object} [config]
 * @property {string} [error]
 *
 * @typedef {Object} ConnectorSyncResult
 * @property {boolean} ok
 * @property {boolean} [skipped]
 * @property {string} [reason]
 * @property {number} [processed]
 * @property {number} [failed]
 * @property {Array<{externalId: string, message: string}>} [errors]
 *
 * @typedef {Object} ErpConnector
 * @property {(sellerId: string, config: Object) => Promise<{ok: boolean, error?: string}>} connect
 * @property {(sellerId: string) => Promise<{ok: boolean}>} disconnect
 * @property {(sellerId: string) => Promise<ConnectorConnectionStatus>} getConnectionStatus
 * @property {(sellerId: string) => Promise<ConnectorSyncResult>} syncProductsFull
 * @property {(sellerId: string, since: Date|string|null) => Promise<ConnectorSyncResult>} syncProductsDelta
 * @property {(sellerId: string, sku: string) => Promise<{ok: boolean, quantity?: number}>} getStock
 * @property {(sellerId: string, sku: string, quantity: number) => Promise<{ok: boolean}>} updateStock
 * @property {(sellerId: string, canonicalOrder: Object) => Promise<{ok: boolean, externalOrderId?: string, error?: string}>} pushOrder
 * @property {(sellerId: string, externalOrderId: string, tracking: Object) => Promise<{ok: boolean}>} updateFulfillment
 * @property {(payload: Object, req?: Object) => Promise<{ok: boolean}>} [handleWebhook]
 */

const REQUIRED_METHODS = [
  'connect',
  'disconnect',
  'getConnectionStatus',
  'syncProductsFull',
  'syncProductsDelta',
  'getStock',
  'updateStock',
  'pushOrder',
  'updateFulfillment',
]

/**
 * Throws if `adapter` is missing any required connector method. `handleWebhook` is intentionally
 * optional — not every ERP has an inbound webhook (JTL is event-poll-based, not webhook-based).
 */
function assertImplementsConnectorInterface(adapter, erpType) {
  const missing = REQUIRED_METHODS.filter((m) => typeof adapter?.[m] !== 'function')
  if (missing.length) {
    throw new Error(`Connector adapter "${erpType}" is missing required method(s): ${missing.join(', ')}`)
  }
}

/** Standard "not supported by this ERP" result — use instead of throwing. */
function unsupported(reason) {
  return { ok: true, skipped: true, reason }
}

module.exports = {
  REQUIRED_METHODS,
  assertImplementsConnectorInterface,
  unsupported,
}
