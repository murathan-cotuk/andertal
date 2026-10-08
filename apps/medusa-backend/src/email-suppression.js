'use strict'

/**
 * E-mail suppression from provider feedback (Resend webhooks):
 *   - hard bounce   → no further e-mails to that address (it does not exist / rejects)
 *   - spam complaint → no further advertising e-mails (newsletter opt-out, UWG §7)
 * Sending to known-bad addresses again hurts the sender reputation of every Andertal mail.
 */
const crypto = require('crypto')

async function ensureSuppressionSchema(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS email_suppressions (
      email text PRIMARY KEY,
      reason varchar(20) NOT NULL,
      detail text,
      created_at timestamptz NOT NULL DEFAULT now()
    )`)
}

const norm = (e) => String(e || '').trim().toLowerCase()

async function isSuppressed(client, email) {
  const e = norm(email)
  if (!e) return false
  try {
    const r = await client.query(`SELECT 1 FROM email_suppressions WHERE email = $1 AND reason = 'bounce' LIMIT 1`, [e])
    return r.rows.length > 0
  } catch (_) {
    return false // table not there yet → nothing suppressed
  }
}

async function recordBounce(client, email, detail = null) {
  const e = norm(email)
  if (!e) return
  await client.query(
    `INSERT INTO email_suppressions (email, reason, detail) VALUES ($1, 'bounce', $2)
     ON CONFLICT (email) DO UPDATE SET reason = 'bounce', detail = EXCLUDED.detail`,
    [e, detail],
  )
}

async function recordComplaint(client, email) {
  const e = norm(email)
  if (!e) return
  await client.query(
    `INSERT INTO email_suppressions (email, reason) VALUES ($1, 'complaint') ON CONFLICT (email) DO NOTHING`, [e],
  )
  await client.query(
    `UPDATE store_newsletter_subscribers SET status = 'unsubscribed', unsubscribed_at = now(), updated_at = now()
      WHERE LOWER(email) = $1 AND status <> 'unsubscribed'`,
    [e],
  ).catch(() => {})
}

/**
 * Resend signs webhooks with Svix: HMAC-SHA256 over "<svix-id>.<svix-timestamp>.<raw body>" with
 * the base64 secret after "whsec_"; header "svix-signature" = space-separated "v1,<base64>".
 */
function verifySvixSignature({ secret, id, timestamp, signature, rawBody, toleranceSec = 300, now = Date.now() }) {
  if (!secret || !id || !timestamp || !signature || rawBody == null) return false
  const ts = Number(timestamp)
  if (!Number.isFinite(ts) || Math.abs(now / 1000 - ts) > toleranceSec) return false
  let key
  try { key = Buffer.from(String(secret).replace(/^whsec_/, ''), 'base64') } catch (_) { return false }
  const expected = crypto.createHmac('sha256', key).update(`${id}.${timestamp}.${Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody)}`).digest('base64')
  return String(signature).split(' ').some((part) => {
    const [ver, sig] = part.split(',')
    if (ver !== 'v1' || !sig) return false
    const a = Buffer.from(sig)
    const b = Buffer.from(expected)
    return a.length === b.length && crypto.timingSafeEqual(a, b)
  })
}

module.exports = { ensureSuppressionSchema, isSuppressed, recordBounce, recordComplaint, verifySvixSignature }
