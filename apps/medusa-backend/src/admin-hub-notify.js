'use strict'

/**
 * Insert a superuser-facing row into admin_hub_notifications.
 * Fire-and-forget via insertAdminHubNotificationSafe so callers never fail the main request.
 */
async function insertAdminHubNotification({ type, title, body = null, sellerId = null, referenceId = null, client = null }) {
  const sql = `INSERT INTO admin_hub_notifications (type, title, body, seller_id, reference_id)
               VALUES ($1, $2, $3, $4, $5)`
  const params = [String(type), title || null, body || null, sellerId || null, referenceId != null ? String(referenceId) : null]
  if (client) {
    await client.query(sql, params)
    return
  }
  const { getPooledClient } = require('./db-pool')
  const c = getPooledClient()
  if (!c) return
  try {
    await c.connect()
    await c.query(sql, params)
  } finally {
    try { await c.end() } catch (_) {}
  }
}

function insertAdminHubNotificationSafe(opts) {
  return insertAdminHubNotification(opts).catch((e) => {
    console.error('[admin-hub-notify]', opts?.type, e?.message || e)
  })
}

module.exports = { insertAdminHubNotification, insertAdminHubNotificationSafe }
