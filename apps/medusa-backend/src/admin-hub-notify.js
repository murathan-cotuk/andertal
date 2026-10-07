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

/**
 * Re-open a table-driven superuser inbox item after new activity (e.g. more proposed
 * metafield values on an already-pending key). Clears read_at and deleted_at so the
 * badge/dropdown show it again without inserting a duplicate queue row.
 */
async function reopenSuperuserSourceUnread(sourceType, sourceId, client = null) {
  const st = String(sourceType || '').trim()
  const sid = sourceId != null ? String(sourceId).trim() : ''
  if (!st || !sid) return
  const sql = `DELETE FROM seller_hub_notification_state
               WHERE recipient_key = '__superuser__'
                 AND source_type = $1
                 AND source_id = $2`
  const params = [st, sid]
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

function reopenSuperuserSourceUnreadSafe(sourceType, sourceId) {
  return reopenSuperuserSourceUnread(sourceType, sourceId).catch((e) => {
    console.error('[admin-hub-notify] reopen', sourceType, e?.message || e)
  })
}

module.exports = {
  insertAdminHubNotification,
  insertAdminHubNotificationSafe,
  reopenSuperuserSourceUnread,
  reopenSuperuserSourceUnreadSafe,
}
