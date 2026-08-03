/**
 * Pluggable outbound email for flow automation: SMTP (Nodemailer) or Resend.
 * Resend can be connected two ways: a real per-platform integration row in
 * `store_integrations` (slug='resend', added via Sellercentral Settings → Integrations —
 * the same generic "Create integration" flow used for Sendcloud/Trustpilot), or the
 * legacy env vars (FLOW_MAIL_PROVIDER=resend + RESEND_API_KEY) for deployments that set
 * it at the process level instead. The DB row takes priority when both are present.
 */

async function resolveResendApiKey(client) {
  if (client) {
    try {
      const r = await client.query(
        `SELECT api_key FROM store_integrations WHERE LOWER(TRIM(slug)) = 'resend' AND is_active = true LIMIT 1`,
      )
      const dbKey = String(r.rows[0]?.api_key || '').trim()
      if (dbKey) return dbKey
    } catch (_) {
      // store_integrations lookup is best-effort — env var fallback below still applies.
    }
  }
  return String(process.env.RESEND_API_KEY || '').trim()
}

async function resolveFlowMailProvider(client) {
  const key = await resolveResendApiKey(client)
  if (key) return 'resend'
  const envPref = String(process.env.FLOW_MAIL_PROVIDER || '').trim().toLowerCase()
  if (envPref === 'resend' && key) return 'resend'
  return 'smtp'
}

/**
 * @param {object} opts
 * @param {import('pg').Client} [opts.client] - only needed to resolve a DB-configured Resend key
 * @param {import('nodemailer').Transporter | null} opts.transport
 * @param {string} opts.from - "Name <email@domain>"
 * @param {string} opts.to
 * @param {string} opts.subject
 * @param {string} opts.html
 * @param {string} [opts.text]
 * @param {Array<{filename?: string, content?: Buffer, path?: string}>} [opts.attachments]
 * @returns {Promise<{ provider: 'smtp' | 'resend', messageId?: string }>}
 */
async function sendFlowOutboundEmail(opts) {
  const { client, transport, from, to, subject, html, text, attachments } = opts
  const provider = await resolveFlowMailProvider(client)
  if (provider === 'resend') {
    const key = await resolveResendApiKey(client)
    if (!key) throw new Error('RESEND_API_KEY missing')
    const { Resend } = require('resend')
    const resend = new Resend(key)
    const att = []
    for (const a of attachments || []) {
      if (!a) continue
      const fn = String(a.filename || 'attachment').replace(/[^\w.\-]+/g, '_')
      let b64 = ''
      if (Buffer.isBuffer(a.content)) b64 = a.content.toString('base64')
      else if (typeof a.content === 'string') b64 = Buffer.from(a.content, 'utf8').toString('base64')
      else if (a.path) {
        const fs = require('fs')
        b64 = fs.readFileSync(a.path).toString('base64')
      }
      if (b64) att.push({ filename: fn, content: b64 })
    }
    const { data, error } = await resend.emails.send({
      from: String(from || '').trim(),
      to: [String(to || '').trim()],
      subject: String(subject || '').trim(),
      html: String(html || ''),
      text: text != null ? String(text) : undefined,
      ...(att.length ? { attachments: att } : {}),
    })
    if (error) throw new Error(error.message || String(error))
    return { provider: 'resend', messageId: data?.id }
  }
  if (!transport) throw new Error('SMTP not configured')
  await transport.sendMail({
    from: String(from || '').trim(),
    to: String(to || '').trim(),
    subject: String(subject || '').trim(),
    html: String(html || ''),
    text: text != null ? String(text) : undefined,
    ...(attachments && attachments.length ? { attachments } : {}),
  })
  return { provider: 'smtp' }
}

module.exports = { resolveFlowMailProvider, resolveResendApiKey, sendFlowOutboundEmail }
