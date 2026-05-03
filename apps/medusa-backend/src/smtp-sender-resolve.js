/**
 * Resolve From email/name for outbound SMTP: optional sender profile UUID, else default profile, else legacy store_smtp_settings row.
 */

async function resolveSmtpSenderIdentity(client, profileIdNullable, sellerId = 'default') {
  const sid = String(sellerId || 'default').trim() || 'default'
  const pid = profileIdNullable != null && profileIdNullable !== '' ? String(profileIdNullable).trim() : ''

  if (pid) {
    const r = await client.query(
      `SELECT from_email, from_name FROM store_smtp_sender_profiles WHERE id = $1::uuid AND seller_id = $2`,
      [pid, sid],
    )
    if (r.rows[0]?.from_email) {
      return {
        fromEmail: String(r.rows[0].from_email).trim(),
        fromName: String(r.rows[0].from_name || 'Shop').trim() || 'Shop',
      }
    }
  }

  const d = await client.query(
    `SELECT from_email, from_name FROM store_smtp_sender_profiles WHERE seller_id = $1 AND is_default = true LIMIT 1`,
    [sid],
  )
  if (d.rows[0]?.from_email) {
    return {
      fromEmail: String(d.rows[0].from_email).trim(),
      fromName: String(d.rows[0].from_name || 'Shop').trim() || 'Shop',
    }
  }

  const leg = await client.query(`SELECT from_email, from_name, username FROM store_smtp_settings WHERE seller_id = $1 LIMIT 1`, [sid])
  return {
    fromEmail: String(leg.rows[0]?.from_email || leg.rows[0]?.username || '').trim(),
    fromName: String(leg.rows[0]?.from_name || 'Shop').trim() || 'Shop',
  }
}

module.exports = { resolveSmtpSenderIdentity }
