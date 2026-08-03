/**
 * Resolve From email/name for outbound SMTP: optional sender profile UUID, else default profile, else legacy store_smtp_settings row.
 * `fallbackName` (e.g. the seller's store name) is used only when the resolved row has no from_name set,
 * instead of the generic literal "Shop" — so a sender profile missing a display name still shows the real store name.
 */

async function resolveSmtpSenderIdentity(client, profileIdNullable, sellerId = 'default', fallbackName = 'Andertal') {
  const sid = String(sellerId || 'default').trim() || 'default'
  const pid = profileIdNullable != null && profileIdNullable !== '' ? String(profileIdNullable).trim() : ''
  const fb = String(fallbackName || '').trim() || 'Andertal'
  const logger = require('./logger')

  if (pid) {
    const r = await client.query(
      `SELECT from_email, from_name FROM store_smtp_sender_profiles WHERE id = $1::uuid AND seller_id = $2`,
      [pid, sid],
    )
    if (r.rows[0]?.from_email) {
      return {
        fromEmail: String(r.rows[0].from_email).trim(),
        fromName: String(r.rows[0].from_name || fb).trim() || fb,
      }
    }
    // A specific sender profile was requested (e.g. a flow step's own smtp_sender_id) but the
    // exact-id lookup found nothing — silently falling through to the platform default sender
    // is exactly the symptom reported as "I picked X but Y was used". Log it so the mismatch
    // (deleted profile? wrong seller scope? stale id?) is visible without DB access.
    logger.warn(`[smtp-sender-resolve] requested profile id=${pid} seller_id=${sid} not found — falling back to default sender`)
  }

  const d = await client.query(
    `SELECT from_email, from_name FROM store_smtp_sender_profiles WHERE seller_id = $1 AND is_default = true LIMIT 1`,
    [sid],
  )
  if (d.rows[0]?.from_email) {
    if (pid) logger.warn(`[smtp-sender-resolve] fallback resolved to default sender: ${d.rows[0].from_email}`)
    return {
      fromEmail: String(d.rows[0].from_email).trim(),
      fromName: String(d.rows[0].from_name || fb).trim() || fb,
    }
  }

  const leg = await client.query(`SELECT from_email, from_name, username FROM store_smtp_settings WHERE seller_id = $1 LIMIT 1`, [sid])
  return {
    fromEmail: String(leg.rows[0]?.from_email || leg.rows[0]?.username || '').trim(),
    fromName: String(leg.rows[0]?.from_name || fb).trim() || fb,
  }
}

module.exports = { resolveSmtpSenderIdentity }
