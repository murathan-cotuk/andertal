'use strict'

/**
 * Password reset for customers (shop) and sellers (Sellercentral). Before this the shop's
 * "Passwort vergessen" page called a Medusa endpoint that does not exist on this backend and
 * always showed "e-mail sent"; Sellercentral had no reset at all.
 *
 * - One-time token, 32 random bytes; only its SHA-256 is stored; valid 60 minutes; requesting a
 *   new one invalidates older unused ones; consumed atomically.
 * - Request endpoints never reveal whether the e-mail exists.
 * - Mail goes through the platform mail settings (Resend or SMTP, same as flows).
 */

const crypto = require('crypto')

const TOKEN_TTL_MINUTES = 60
const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex')

async function ensurePasswordResetSchema(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      kind varchar(16) NOT NULL,
      user_id text NOT NULL,
      token_hash char(64) NOT NULL,
      expires_at timestamptz NOT NULL,
      used_at timestamptz,
      request_ip text,
      created_at timestamptz NOT NULL DEFAULT now()
    )`)
  await client.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_password_reset_token_hash ON password_reset_tokens (token_hash)')
}

/** @returns {Promise<string>} the raw token (only ever sent by mail) */
async function createResetToken(client, { kind, userId, ip = null }) {
  await client.query(
    `UPDATE password_reset_tokens SET used_at = now() WHERE kind = $1 AND user_id = $2 AND used_at IS NULL`,
    [kind, String(userId)],
  )
  const token = crypto.randomBytes(32).toString('hex')
  await client.query(
    `INSERT INTO password_reset_tokens (kind, user_id, token_hash, expires_at, request_ip)
     VALUES ($1, $2, $3, now() + ($4 || ' minutes')::interval, $5)`,
    [kind, String(userId), sha256(token), String(TOKEN_TTL_MINUTES), ip],
  )
  return token
}

/** Consumes the token once; @returns {Promise<string|null>} user id */
async function consumeResetToken(client, { kind, token }) {
  const t = String(token || '').trim()
  if (!/^[0-9a-f]{64}$/i.test(t)) return null
  const r = await client.query(
    `UPDATE password_reset_tokens SET used_at = now()
      WHERE token_hash = $1 AND kind = $2 AND used_at IS NULL AND expires_at > now()
      RETURNING user_id`,
    [sha256(t.toLowerCase()), kind],
  )
  return r.rows[0]?.user_id || null
}

/** Same rule as registration (8+ characters, a letter and a digit). */
function passwordStrongEnough(pw) {
  const s = String(pw || '')
  return s.length >= 8 && s.length <= 256 && /[a-zA-Z]/.test(s) && /[0-9]/.test(s)
}

const MAIL_TEXT = {
  de: (link) => ({
    subject: 'Andertal: Passwort zurücksetzen',
    text: `Sie haben angefordert, Ihr Passwort zurückzusetzen.\n\nNeues Passwort festlegen (Link 60 Minuten gültig):\n${link}\n\nWenn Sie das nicht waren, ignorieren Sie diese E-Mail — Ihr Passwort bleibt unverändert.`,
  }),
  en: (link) => ({
    subject: 'Andertal: Reset your password',
    text: `You asked to reset your password.\n\nSet a new password (link valid for 60 minutes):\n${link}\n\nIf this was not you, ignore this e-mail — your password stays unchanged.`,
  }),
}

const escHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

async function sendResetMail(client, { to, link, locale = 'de' }) {
  const lang = String(locale || 'de').slice(0, 2).toLowerCase() === 'de' ? 'de' : 'en'
  const { subject, text } = MAIL_TEXT[lang](link)
  const html = text.split('\n').map((line) => (line === link
    ? `<p><a href="${escHtml(link)}">${escHtml(link)}</a></p>`
    : (line ? `<p>${escHtml(line)}</p>` : ''))).join('')
  const { resolveFlowMailProvider, sendFlowOutboundEmail } = require('./email-providers')
  const { resolveSmtpSenderIdentity } = require('./smtp-sender-resolve')
  const provider = await resolveFlowMailProvider(client)
  let transport = null
  if (provider !== 'resend') {
    const s = (await client.query(`SELECT * FROM store_smtp_settings WHERE seller_id = 'default' LIMIT 1`).catch(() => ({ rows: [] }))).rows[0]
    if (s?.host && s?.username) {
      transport = require('nodemailer').createTransport({
        host: s.host, port: s.port || 587, secure: !!s.secure, auth: { user: s.username, pass: s.password_enc || '' },
      })
    }
  }
  if (provider !== 'resend' && !transport) {
    // Last resort: env-configured provider (src/email.js); logs in dev.
    await require('./email').sendEmail({ to, subject, text, html })
    return
  }
  const { fromEmail, fromName } = await resolveSmtpSenderIdentity(client, null, 'default', 'Andertal')
  await sendFlowOutboundEmail({
    client, transport, from: `"${String(fromName || 'Andertal').replace(/"/g, '')}" <${fromEmail}>`, to, subject, html, text,
  })
}

module.exports = {
  ensurePasswordResetSchema, createResetToken, consumeResetToken, passwordStrongEnough, sendResetMail, sha256, TOKEN_TTL_MINUTES,
}
