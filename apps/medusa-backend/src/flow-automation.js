/**
 * Runs automation flow emails for order-related triggers (SMTP via store_smtp_settings default).
 * Uses multi-locale templates from admin_hub_flow_steps.email_i18n when present.
 */

const { Client } = require('pg')

const FLOW_EMAIL_LOCALES = ['en', 'de', 'tr', 'fr', 'it', 'es']

/** Map ISO shipping country → preferred email locale (matches shop conventions). */
const COUNTRY_TO_EMAIL_LOCALE = {
  DE: 'de',
  AT: 'de',
  CH: 'de',
  LU: 'de',
  LI: 'de',
  BE: 'de',
  TR: 'tr',
  FR: 'fr',
  MC: 'fr',
  ES: 'es',
  MX: 'es',
  IT: 'it',
  SM: 'it',
  VA: 'it',
  GB: 'en',
  US: 'en',
  IE: 'en',
  AU: 'en',
  NZ: 'en',
  CA: 'en',
}

function resolveEmailLocaleFromCountry(countryRaw) {
  const c = String(countryRaw || '')
    .trim()
    .toUpperCase()
  if (c && FLOW_EMAIL_LOCALES.includes(COUNTRY_TO_EMAIL_LOCALE[c])) {
    return COUNTRY_TO_EMAIL_LOCALE[c]
  }
  return 'en'
}

function formatEuro(cents) {
  const n = Number(cents)
  if (Number.isNaN(n)) return '0,00 €'
  return `${(n / 100).toFixed(2).replace('.', ',')} €`
}

function applyFlowEmailPlaceholders(template, vars) {
  return String(template || '').replace(/\{([A-Za-z0-9_]+)\}/g, (_, rawKey) => {
    const keyUp = String(rawKey).toUpperCase()
    const v = vars[keyUp] ?? vars[String(rawKey)] ?? vars[rawKey]
    if (v != null && v !== '') return String(v)
    return `{${rawKey}}`
  })
}

function flowEmailHtmlToPlainText(html) {
  return String(html || '')
    .replace(/\r\n/g, '\n')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|tr|table)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function pickStepTemplate(step, locale) {
  const i18n = step.email_i18n
  const tryLocales = [locale, 'en', 'de']
  if (i18n && typeof i18n === 'object') {
    for (const loc of tryLocales) {
      if (!FLOW_EMAIL_LOCALES.includes(loc)) continue
      const b = i18n[loc]
      const subj = String(b?.subject || '').trim()
      const body = String(b?.body || '').trim()
      if (subj && body) return { subject: subj, body }
    }
    for (const loc of FLOW_EMAIL_LOCALES) {
      const b = i18n[loc]
      const subj = String(b?.subject || '').trim()
      const body = String(b?.body || '').trim()
      if (subj && body) return { subject: subj, body }
    }
  }
  const ls = String(step.email_subject || '').trim()
  const lb = String(step.email_body || '').trim()
  if (ls && lb) return { subject: ls, body: lb }
  return null
}

async function getSmtpTransport(client) {
  let nodemailer
  try {
    nodemailer = require('nodemailer')
  } catch {
    return null
  }
  const r = await client.query(`SELECT * FROM store_smtp_settings WHERE seller_id = 'default' LIMIT 1`)
  const s = r.rows[0]
  if (!s?.host || !s?.username) return null
  return nodemailer.createTransport({
    host: s.host,
    port: s.port || 587,
    secure: !!s.secure,
    auth: { user: s.username, pass: s.password_enc || '' },
  })
}

async function loadOrderContext(client, orderId) {
  const oRes = await client.query(`SELECT * FROM store_orders WHERE id = $1::uuid`, [orderId])
  const order = oRes.rows[0]
  if (!order) return null
  const iRes = await client.query(
    `SELECT * FROM store_order_items WHERE order_id = $1::uuid ORDER BY created_at ASC`,
    [orderId],
  )
  const items = iRes.rows || []
  let storeName = 'Shop'
  let supportEmail = ''
  const sid = order.seller_id
  if (sid) {
    const sh = await client.query(
      `SELECT store_name, support_email FROM admin_hub_seller_settings WHERE seller_id = $1 LIMIT 1`,
      [sid],
    )
    if (sh.rows[0]) {
      storeName = String(sh.rows[0].store_name || storeName).trim() || storeName
      supportEmail = String(sh.rows[0].support_email || '').trim()
    }
  }
  const siteUrl = String(process.env.STOREFRONT_PUBLIC_URL || process.env.NEXT_PUBLIC_SITE_URL || '').replace(
    /\/$/,
    '',
  )
  const parts = []
  for (const it of items) {
    const q = Number(it.quantity || 1)
    const title = String(it.title || 'Item').trim()
    parts.push(`${q}× ${title}`)
  }
  const lineSummary = parts.length ? `${parts.join('; ')} · ${formatEuro(order.total_cents)}` : formatEuro(order.total_cents)
  const first = items[0]
  const productTitle = first ? String(first.title || '').trim() : ''

  return { order, items, storeName, supportEmail, siteUrl, lineSummary, productTitle }
}

function buildPlaceholderVars(ctx, triggerKey) {
  const { order, items, storeName, supportEmail, siteUrl, lineSummary, productTitle } = ctx
  const fn = String(order.first_name || '').trim()
  const ln = String(order.last_name || '').trim()
  const fullName = [fn, ln].filter(Boolean).join(' ') || String(order.email || '').trim()
  const ordDate = order.created_at ? new Date(order.created_at).toLocaleDateString('de-DE') : ''
  const vars = {
    CUSTOMER_NAME: fullName,
    CUSTOMER: fullName,
    FIRST_NAME: fn || fullName,
    LAST_NAME: ln,
    EMAIL: String(order.email || '').trim(),
    PHONE: String(order.phone || '').trim(),
    ORDER_NUMBER: String(order.order_number != null ? order.order_number : ''),
    ORDER_ID: String(order.order_number != null ? order.order_number : ''),
    ORDER_DATE: ordDate,
    ORDER_TOTAL: formatEuro(order.total_cents),
    ORDER_SUBTOTAL: formatEuro(order.subtotal_cents),
    ORDER_SHIPPING: formatEuro(order.shipping_cents),
    ORDER_DISCOUNT: formatEuro(order.discount_cents || order.coupon_discount_cents || 0),
    ORDER_CURRENCY: String(order.currency || 'EUR').toUpperCase(),
    PAYMENT_METHOD: String(order.payment_method || ''),
    SHIPPING_FULL_NAME: fullName,
    ADDRESS_LINE1: String(order.address_line1 || ''),
    ADDRESS_LINE2: String(order.address_line2 || ''),
    CITY: String(order.city || ''),
    POSTAL_CODE: String(order.postal_code || ''),
    ZIP_CODE: String(order.postal_code || ''),
    COUNTRY: String(order.country || ''),
    PRODUCT: productTitle,
    PRODUCT_NAME: productTitle,
    LINE_ITEMS_SUMMARY: lineSummary,
    STORE_NAME: storeName,
    SHOP_NAME: storeName,
    SITE_URL: siteUrl || 'https://',
    SUPPORT_EMAIL: supportEmail || String(order.email || '').trim(),
    TRACKING_NUMBER: String(order.tracking_number || '').trim(),
    CARRIER_NAME: String(order.carrier_name || '').trim(),
  }
  if (siteUrl && order.id) {
    vars.CHECKOUT_URL = `${siteUrl}/`
    vars.PRODUCT_URL = productTitle ? `${siteUrl}/` : `${siteUrl}/`
  }
  return vars
}

/**
 * Send consecutive flow steps from the start until a positive wait_hours is encountered.
 */
async function sendImmediateStepsForFlow({
  client,
  transport,
  fromEmail,
  fromName,
  flowId,
  audience,
  triggerKey,
  steps,
  toEmail,
  templateLocale,
  placeholderVars,
}) {
  let idx = 0
  while (idx < steps.length) {
    const s = steps[idx]
    if (s.step_type === 'wait_hours') {
      const wh = Number(s.wait_hours || 0)
      if (wh > 0) break
      idx += 1
      continue
    }
    if (s.step_type !== 'send_email') {
      idx += 1
      continue
    }
    const tpl = pickStepTemplate(s, templateLocale)
    if (!tpl || !toEmail) {
      idx += 1
      continue
    }
    const subject = applyFlowEmailPlaceholders(tpl.subject, placeholderVars)
    const html = applyFlowEmailPlaceholders(tpl.body, placeholderVars)
    const plain = flowEmailHtmlToPlainText(html)
    await transport.sendMail({
      from: `"${String(fromName).replace(/"/g, '')}" <${fromEmail}>`,
      to: toEmail,
      subject,
      html,
      text: plain || subject,
    })
    idx += 1
  }
  await client.query(`UPDATE admin_hub_flows SET sent_count = sent_count + 1, updated_at = now() WHERE id = $1::uuid`, [
    flowId,
  ])
}

/**
 * @param {{ triggerKey: string, orderId: string }} opts
 */
async function runAutomationFlowsForOrder(opts) {
  const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
  if (!dbUrl || !dbUrl.startsWith('postgres')) return

  const triggerKey = String(opts.triggerKey || '').trim()
  const orderId = String(opts.orderId || '').trim()
  if (!triggerKey || !orderId) return

  let client
  try {
    client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
    await client.connect()

    const ctx = await loadOrderContext(client, orderId)
    if (!ctx) return

    const transport = await getSmtpTransport(client)
    if (!transport) return

    const smtpR = await client.query(`SELECT from_email, from_name FROM store_smtp_settings WHERE seller_id = 'default' LIMIT 1`)
    const fromEmail = String(smtpR.rows[0]?.from_email || '').trim()
    if (!fromEmail) return
    const fromName = smtpR.rows[0]?.from_name || 'Shop'

    const placeholderVars = buildPlaceholderVars(ctx, triggerKey)
    const customerLocale = resolveEmailLocaleFromCountry(ctx.order.country)

    const flowsR = await client.query(
      `SELECT id, audience FROM admin_hub_flows
       WHERE status = 'active' AND trigger_key = $1
       ORDER BY updated_at ASC`,
      [triggerKey],
    )

    for (const fr of flowsR.rows || []) {
      const flowId = fr.id
      const audience = String(fr.audience || 'customer').toLowerCase() === 'seller' ? 'seller' : 'customer'

      const sr = await client.query(
        `SELECT step_order, step_type, wait_hours, email_subject, email_body, email_i18n
         FROM admin_hub_flow_steps WHERE flow_id = $1::uuid ORDER BY step_order ASC`,
        [flowId],
      )
      const steps = sr.rows || []

      let toEmail = ''
      let templateLocale = customerLocale
      if (audience === 'customer') {
        toEmail = String(ctx.order.email || '').trim()
        templateLocale = customerLocale
      } else {
        templateLocale = 'de'
        const sid = ctx.order.seller_id
        if (!sid) continue
        const sur = await client.query(
          `SELECT email FROM seller_users WHERE seller_id = $1 AND sub_of_seller_id IS NULL ORDER BY created_at ASC LIMIT 1`,
          [sid],
        )
        toEmail = String(sur.rows[0]?.email || '').trim()
      }

      if (!toEmail) continue

      await sendImmediateStepsForFlow({
        client,
        transport,
        fromEmail,
        fromName,
        flowId,
        audience,
        triggerKey,
        steps,
        toEmail,
        templateLocale,
        placeholderVars,
      })
    }
  } catch (e) {
    console.error('[flow-automation]', opts.triggerKey, opts.orderId, e?.message || e)
  } finally {
    if (client)
      try {
        await client.end()
      } catch (_) {}
  }
}

module.exports = {
  runAutomationFlowsForOrder,
  resolveEmailLocaleFromCountry,
  FLOW_EMAIL_LOCALES,
}
