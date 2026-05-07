/**
 * Pluggable outbound email for flow automation: SMTP (Nodemailer) or Resend.
 * Set FLOW_MAIL_PROVIDER=resend and RESEND_API_KEY to use Resend; otherwise SMTP.
 */

function resolveFlowMailProvider() {
  const pref = String(process.env.FLOW_MAIL_PROVIDER || '').trim().toLowerCase()
  const key = String(process.env.RESEND_API_KEY || '').trim()
  if (pref === 'resend' && key) return 'resend'
  return 'smtp'
}

/**
 * @param {object} opts
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
  const { transport, from, to, subject, html, text, attachments } = opts
  const provider = resolveFlowMailProvider()
  if (provider === 'resend') {
    const key = String(process.env.RESEND_API_KEY || '').trim()
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

module.exports = { resolveFlowMailProvider, sendFlowOutboundEmail }
