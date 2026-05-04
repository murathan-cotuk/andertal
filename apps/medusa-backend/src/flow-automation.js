/**
 * Runs automation flow emails for order-related triggers (SMTP via store_smtp_settings default).
 * Uses multi-locale templates from admin_hub_flow_steps.email_i18n when present.
 */

const { Client } = require('pg')
const { resolveSmtpSenderIdentity } = require('./smtp-sender-resolve')
const { resolveOrderPaidTotalCents } = require('./order-money')

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

/** Mirrors apps/shop/src/lib/shop-market.js — URL language segment from market country. */
function storefrontLangFromMarketCountry(market) {
  const m = String(market || 'de').toLowerCase()
  if (['de', 'at', 'ch', 'li', 'lu', 'be'].includes(m)) return 'de'
  if (['fr', 'mc', 'sn', 'ci', 'cm', 'cd'].includes(m)) return 'fr'
  if (['it', 'sm', 'va'].includes(m)) return 'it'
  if (
    ['es', 'mx', 'ar', 'co', 'cl', 'pe', 've', 'ec', 'bo', 'py', 'uy', 'cr', 'gt', 'hn', 'sv', 'ni', 'pa', 'do', 'cu', 'pr'].includes(
      m,
    )
  )
    return 'es'
  if (m === 'tr') return 'tr'
  return 'en'
}

/**
 * Shop canonical URLs: /{market}/{lang}/… (middleware). Derives market from shipping country.
 * Override via env: STOREFRONT_EMAIL_MARKET, STOREFRONT_EMAIL_LANG (ISO2 lowercase).
 */
function storefrontPathPrefixFromShippingCountry(shippingCountryRaw) {
  const envM = String(process.env.STOREFRONT_EMAIL_MARKET || '').trim().toLowerCase()
  const envL = String(process.env.STOREFRONT_EMAIL_LANG || '').trim().toLowerCase()
  const ship = String(shippingCountryRaw || '').trim().toLowerCase()
  const market = /^[a-z]{2}$/.test(envM) ? envM : /^[a-z]{2}$/.test(ship) ? ship : 'de'
  const lang =
    /^[a-z]{2}$/.test(envL) && FLOW_EMAIL_LOCALES.includes(envL) ? envL : storefrontLangFromMarketCountry(market)
  return { market, lang, prefix: `/${market}/${lang}` }
}

function absoluteStorefrontUrl(baseSite, path) {
  const b = String(baseSite || '').replace(/\/$/, '')
  const p = String(path || '')
  if (!b) return ''
  if (!p.startsWith('/')) return `${b}/${p}`
  return `${b}${p}`
}

/**
 * Absolute shop URL for emails (flow placeholders). Backend Render jobs often lack Next.js env;
 * accept several aliases used across deployments.
 */
function resolvePublicShopBaseUrl() {
  const candidates = [
    process.env.STOREFRONT_PUBLIC_URL,
    process.env.SHOP_PUBLIC_URL,
    process.env.PUBLIC_SHOP_URL,
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.NEXT_PUBLIC_SHOP_URL,
    process.env.SITE_URL,
  ]
  for (const raw of candidates) {
    const s = String(raw || '').trim().replace(/\/$/, '')
    if (!s) continue
    if (/^https?:\/\//i.test(s)) return s
  }
  const vercel = String(process.env.VERCEL_URL || process.env.NEXT_PUBLIC_VERCEL_URL || '').trim()
  if (vercel) {
    const host = vercel.replace(/^https?:\/\//i, '').replace(/\/$/, '')
    if (host) return `https://${host}`
  }
  return ''
}

function formatEuro(cents) {
  const n = Number(cents)
  if (Number.isNaN(n)) return '0,00 €'
  return `${(n / 100).toFixed(2).replace('.', ',')} €`
}

/** Carrier tracking page URL when carrier + number are known (same heuristics as storefront orders page). */
function trackingUrlFromCarrier(carrierRaw, numberRaw) {
  const number = String(numberRaw || '').trim()
  if (!number) return ''
  const c = String(carrierRaw || '').toLowerCase().trim()
  if (c.includes('dhl')) return `https://www.dhl.de/de/privatkunden/dhl-sendungsverfolgung.html?piececode=${encodeURIComponent(number)}`
  if (c.includes('dpd')) return `https://tracking.dpd.de/status/de_DE/parcel/${encodeURIComponent(number)}`
  if (c.includes('ups')) return `https://www.ups.com/track?tracknum=${encodeURIComponent(number)}`
  if (c.includes('fedex')) return `https://www.fedex.com/fedextrack/?trknbr=${encodeURIComponent(number)}`
  if (c.includes('hermes') || c.includes('evri'))
    return `https://www.myhermes.de/empfangen/sendungsverfolgung/sendungsdetails/#/${encodeURIComponent(number)}`
  if (c.includes('gls')) return `https://gls-group.com/DE/de/paketverfolgung?match=${encodeURIComponent(number)}`
  if (c.includes('post') || c.includes('brief'))
    return `https://www.deutschepost.de/de/s/sendungsverfolgung.html?barcode=${encodeURIComponent(number)}`
  return ''
}

function applyFlowEmailPlaceholders(template, vars) {
  return String(template || '').replace(/\{([A-Za-z0-9_]+)\}/g, (_, rawKey) => {
    const keyUp = String(rawKey).toUpperCase()
    const v = vars[keyUp] ?? vars[String(rawKey)] ?? vars[rawKey]
    const str = v == null ? '' : String(v).trim()
    if (str !== '') return str
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
  const orderRaw = oRes.rows[0]
  if (!orderRaw) return null
  const order = { ...orderRaw, total_cents: resolveOrderPaidTotalCents(orderRaw) }
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
  const siteUrl = resolvePublicShopBaseUrl()
  if (!siteUrl) {
    console.warn(
      '[flow-automation] Public shop URL missing: set STOREFRONT_PUBLIC_URL or SHOP_PUBLIC_URL (or NEXT_PUBLIC_SITE_URL) on the backend — otherwise merge tokens like {ORDER_DETAIL_URL} stay unreplaced in emails.',
    )
  }
  const parts = []
  for (const it of items) {
    const q = Number(it.quantity || 1)
    const title = String(it.title || 'Item').trim()
    parts.push(`${q}× ${title}`)
  }
  const lineSummary = parts.length ? `${parts.join('; ')} · ${formatEuro(order.total_cents)}` : formatEuro(order.total_cents)
  const first = items[0]
  const productTitle = first ? String(first.title || '').trim() : ''
  const productImage = first?.thumbnail ? String(first.thumbnail).trim() : ''

  const backendUrl = String(process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || process.env.BACKEND_URL || '').replace(/\/$/, '')
  const resolveUrl = (u) => {
    if (!u) return ''
    if (/^https?:\/\//i.test(u)) return u
    return backendUrl ? `${backendUrl}${u.startsWith('/') ? '' : '/'}${u}` : u
  }

  const orderItemsHtml = items.length
    ? `<table style="border-collapse:collapse;width:100%;font-family:inherit;font-size:13px;">\n` +
      items.map((it) => {
        const imgSrc = resolveUrl(it.thumbnail || '')
        const imgTag = imgSrc ? `<img src="${imgSrc}" alt="" width="48" height="48" style="object-fit:cover;border-radius:4px;display:block;" />` : ''
        const qty = Number(it.quantity || 1)
        const price = formatEuro(it.unit_price_cents)
        const title = String(it.title || '').trim()
        return `<tr><td style="padding:6px 10px 6px 0;vertical-align:top;width:56px;">${imgTag}</td>` +
          `<td style="padding:6px 0;vertical-align:top;">${title}</td>` +
          `<td style="padding:6px 0 6px 10px;vertical-align:top;white-space:nowrap;text-align:right;">${qty}× ${price}</td></tr>`
      }).join('\n') +
      `\n</table>`
    : ''

  const prefixParts = storefrontPathPrefixFromShippingCountry(order.country)
  return {
    order,
    items,
    storeName,
    supportEmail,
    siteUrl,
    lineSummary,
    productTitle,
    productImage,
    orderItemsHtml,
    resolveUrl,
    prefixParts,
  }
}

function salutationVarsFromGender(genderRaw) {
  const g = String(genderRaw || '').trim().toLowerCase()
  const isFemale = ['female', 'f', 'woman', 'w', 'frau'].includes(g)
  const isMale = ['male', 'm', 'man', 'herr'].includes(g)
  const raw = String(genderRaw || '').trim()
  let SALUTATION_DE = ''
  let GREETING_DE = ''
  let SALUTATION_EN = ''
  let GREETING_EN = ''
  let SALUTATION_TR = ''
  let GREETING_TR = ''
  if (isFemale) {
    SALUTATION_DE = 'Frau'
    GREETING_DE = 'Sehr geehrte Frau'
    SALUTATION_EN = 'Ms.'
    GREETING_EN = 'Dear Ms.'
    SALUTATION_TR = 'Bayan'
    GREETING_TR = 'Sayın Bayan'
  } else if (isMale) {
    SALUTATION_DE = 'Herr'
    GREETING_DE = 'Sehr geehrter Herr'
    SALUTATION_EN = 'Mr.'
    GREETING_EN = 'Dear Mr.'
    SALUTATION_TR = 'Bay'
    GREETING_TR = 'Sayın Bay'
  } else {
    GREETING_DE = 'Guten Tag'
    GREETING_EN = 'Hello'
    GREETING_TR = 'Merhaba'
  }
  return {
    GENDER: raw,
    SALUTATION_DE,
    GREETING_DE,
    SALUTATION_EN,
    GREETING_EN,
    SALUTATION_TR,
    GREETING_TR,
  }
}

function overlayCustomerProfile(vars, cust) {
  if (!cust) return
  const fn = String(cust.first_name || '').trim()
  const ln = String(cust.last_name || '').trim()
  const fullName = [fn, ln].filter(Boolean).join(' ') || String(cust.email || '').trim()
  if (fn) vars.FIRST_NAME = fn
  if (ln) vars.LAST_NAME = ln
  if (fullName) {
    vars.CUSTOMER_NAME = fullName
    vars.CUSTOMER = fullName
    if (!vars.SHIPPING_FULL_NAME) vars.SHIPPING_FULL_NAME = fullName
  }
  const em = String(cust.email || '').trim()
  if (em) vars.EMAIL = em
  const ph = String(cust.phone || '').trim()
  if (ph) vars.PHONE = ph
}

function buildPlaceholderVars(ctx, triggerKey, customerProfile = null) {
  const {
    order,
    items,
    storeName,
    supportEmail,
    siteUrl,
    lineSummary,
    productTitle,
    productImage,
    orderItemsHtml,
    resolveUrl,
    prefixParts,
  } = ctx
  const fn = String(order.first_name || '').trim()
  const ln = String(order.last_name || '').trim()
  const fullName = [fn, ln].filter(Boolean).join(' ') || String(order.email || '').trim()
  const ordDate = order.created_at ? new Date(order.created_at).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : ''
  const baseSite = String(siteUrl || '').replace(/\/$/, '')
  const { market, lang, prefix } = prefixParts || storefrontPathPrefixFromShippingCountry(order.country)
  const firstHandle = items[0]?.product_handle ? String(items[0].product_handle).trim() : ''
  const orderDetailUrl = order.id ? absoluteStorefrontUrl(baseSite, `${prefix}/order/${order.id}`) : ''
  const trackingUrl = trackingUrlFromCarrier(order.carrier_name, order.tracking_number)
  const vars = {
    CUSTOMER_NAME: fullName,
    CUSTOMER: fullName,
    FIRST_NAME: fn || fullName,
    LAST_NAME: ln,
    EMAIL: String(order.email || '').trim(),
    PHONE: String(order.phone || '').trim(),
    ORDER_NUMBER: String(order.order_number != null ? order.order_number : ''),
    ORDER_ID: String(order.order_number != null ? order.order_number : ''),
    ORDER_UUID: String(order.id || ''),
    ORDER_DATE: ordDate,
    ORDER_TOTAL: formatEuro(order.total_cents),
    ORDER_SUBTOTAL: formatEuro(order.subtotal_cents),
    ORDER_SHIPPING: formatEuro(order.shipping_cents),
    ORDER_DISCOUNT: formatEuro(Math.max(0, Number(order.discount_cents || 0))),
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
    PRODUCT_IMAGE: resolveUrl ? resolveUrl(productImage) : (productImage || ''),
    PRODUCT_IMAGE_HTML: productImage
      ? `<img src="${resolveUrl ? resolveUrl(productImage) : productImage}" alt="${productTitle.replace(/"/g, '&quot;')}" style="max-width:200px;width:100%;height:auto;display:block;border-radius:6px;" />`
      : '',
    ORDER_ITEMS_HTML: orderItemsHtml || '',
    LINE_ITEMS_SUMMARY: lineSummary,
    STORE_NAME: storeName,
    SHOP_NAME: storeName,
    SITE_URL: siteUrl || 'https://',
    SUPPORT_EMAIL: supportEmail || String(order.email || '').trim(),
    TRACKING_NUMBER: String(order.tracking_number || '').trim(),
    CARRIER_NAME: String(order.carrier_name || '').trim(),
    TRACKING_URL: trackingUrl,
    /** Deutsch alternative token often used in templates */
    SENDUNGSVERFOLGUNG_URL: trackingUrl || orderDetailUrl,
    TRACKING_LINK: trackingUrl,
    MY_ORDERS_URL: absoluteStorefrontUrl(baseSite, `${prefix}/orders`),
    SHOP_HOME_URL: absoluteStorefrontUrl(baseSite, `${prefix}/`),
    ACCOUNT_URL: absoluteStorefrontUrl(baseSite, `${prefix}/account`),
    ORDER_DETAIL_URL: orderDetailUrl,
    IMPRESSUM_URL: absoluteStorefrontUrl(baseSite, `${prefix}/impressum`),
    DATENSCHUTZ_URL: absoluteStorefrontUrl(baseSite, `${prefix}/datenschutz`),
    MARKET_COUNTRY: String(market || '').toUpperCase(),
    STOREFRONT_LOCALE: lang,
    CHECKOUT_URL: absoluteStorefrontUrl(baseSite, `${prefix}/checkout`),
    PRODUCT_URL: firstHandle
      ? absoluteStorefrontUrl(baseSite, `${prefix}/produkt/${encodeURIComponent(firstHandle)}`)
      : absoluteStorefrontUrl(baseSite, `${prefix}/`),
    LOGIN_URL: absoluteStorefrontUrl(baseSite, `${prefix}/login`),
    REGISTER_URL: absoluteStorefrontUrl(baseSite, `${prefix}/register`),
  }
  items.slice(0, 5).forEach((it, i) => {
    const n = i + 1
    vars[`ITEM_${n}_NAME`] = String(it.title || '').trim()
    vars[`ITEM_${n}_IMAGE`] = resolveUrl ? resolveUrl(it.thumbnail || '') : (it.thumbnail || '')
    vars[`ITEM_${n}_QUANTITY`] = String(Number(it.quantity || 1))
    vars[`ITEM_${n}_PRICE`] = formatEuro(it.unit_price_cents)
    vars[`ITEM_${n}_SKU`] = String(it.sku || it.variant_sku || '').trim()
  })
  if (customerProfile) {
    overlayCustomerProfile(vars, customerProfile)
    Object.assign(vars, salutationVarsFromGender(customerProfile.gender))
  }
  return vars
}

async function placeholderVarsCustomerOnly(client, cust) {
  const fn = String(cust.first_name || '').trim()
  const ln = String(cust.last_name || '').trim()
  const fullName = [fn, ln].filter(Boolean).join(' ') || String(cust.email || '').trim()
  const sh = await client.query(`SELECT store_name, support_email FROM admin_hub_seller_settings WHERE seller_id = 'default' LIMIT 1`)
  const storeName = String(sh.rows[0]?.store_name || 'Shop').trim() || 'Shop'
  const supportEmail = String(sh.rows[0]?.support_email || '').trim()
  const siteUrl = resolvePublicShopBaseUrl()
  const { market, lang, prefix } = storefrontPathPrefixFromShippingCountry(cust.country)
  const absPath = (p) => absoluteStorefrontUrl(siteUrl, p)
  return {
    CUSTOMER_NAME: fullName,
    CUSTOMER: fullName,
    FIRST_NAME: fn || fullName,
    LAST_NAME: ln,
    EMAIL: String(cust.email || '').trim(),
    PHONE: String(cust.phone || '').trim(),
    ORDER_NUMBER: '',
    ORDER_ID: '',
    ORDER_DATE: '',
    ORDER_TOTAL: '',
    ORDER_SUBTOTAL: '',
    ORDER_SHIPPING: '',
    ORDER_DISCOUNT: '',
    ORDER_CURRENCY: '',
    PAYMENT_METHOD: '',
    SHIPPING_FULL_NAME: fullName,
    ADDRESS_LINE1: String(cust.address_line1 || ''),
    ADDRESS_LINE2: String(cust.address_line2 || ''),
    CITY: String(cust.city || ''),
    POSTAL_CODE: String(cust.zip_code || ''),
    ZIP_CODE: String(cust.zip_code || ''),
    COUNTRY: String(cust.country || ''),
    PRODUCT: '',
    PRODUCT_NAME: '',
    PRODUCT_IMAGE: '',
    PRODUCT_IMAGE_HTML: '',
    LINE_ITEMS_SUMMARY: '',
    STORE_NAME: storeName,
    SHOP_NAME: storeName,
    SITE_URL: siteUrl || 'https://',
    SUPPORT_EMAIL: supportEmail || String(cust.email || '').trim(),
    TRACKING_NUMBER: '',
    CARRIER_NAME: '',
    TRACKING_URL: '',
    SENDUNGSVERFOLGUNG_URL: '',
    TRACKING_LINK: '',
    MY_ORDERS_URL: absPath(`${prefix}/orders`),
    SHOP_HOME_URL: absPath(`${prefix}/`),
    ACCOUNT_URL: absPath(`${prefix}/account`),
    ORDER_DETAIL_URL: '',
    IMPRESSUM_URL: absPath(`${prefix}/impressum`),
    DATENSCHUTZ_URL: absPath(`${prefix}/datenschutz`),
    MARKET_COUNTRY: String(market || '').toUpperCase(),
    STOREFRONT_LOCALE: lang,
    CHECKOUT_URL: absPath(`${prefix}/checkout`),
    PRODUCT_URL: absPath(`${prefix}/`),
    LOGIN_URL: absPath(`${prefix}/login`),
    REGISTER_URL: absPath(`${prefix}/register`),
    ORDER_UUID: '',
    ORDER_ITEMS_HTML: '',
    ...salutationVarsFromGender(cust.gender),
  }
}

/**
 * Merge fields for flow test emails: latest order for customer when present, else profile-only.
 * @returns {Promise<object|null>} placeholder map, or null if customer id invalid / not found
 */
async function buildFlowEmailPlaceholderVarsForCustomer(client, customerId) {
  const id = String(customerId || '').trim()
  if (!id) return null
  const cRes = await client.query(
    `SELECT id, email, first_name, last_name, phone, gender, address_line1, address_line2, zip_code, city, country FROM store_customers WHERE id = $1::uuid`,
    [id],
  )
  const cust = cRes.rows[0]
  if (!cust) return null

  const ordR = await client.query(
    `SELECT id FROM store_orders WHERE customer_id = $1::uuid ORDER BY created_at DESC LIMIT 1`,
    [id],
  )

  if (ordR.rows[0]) {
    const ctx = await loadOrderContext(client, ordR.rows[0].id)
    if (ctx) return buildPlaceholderVars(ctx, '*', cust)
  }

  return placeholderVarsCustomerOnly(client, cust)
}

/**
 * Send consecutive flow steps from the start until a positive wait_hours is encountered.
 */
async function sendImmediateStepsForFlow({
  client,
  transport,
  flowId,
  audience,
  triggerKey,
  steps,
  toEmail,
  templateLocale,
  placeholderVars,
  orderId,
}) {
  const { buildFlowEmailPdfAttachments } = require('./order-pdf-buffers')
  let idx = 0
  let emailsSent = 0
  while (idx < steps.length) {
    const s = steps[idx]
    if (s.step_type === 'wait_hours') {
      const wh = Number(s.wait_hours || 0)
      if (wh > 0) {
        console.warn(
          `[flow-automation] order ${orderId} flow ${flowId}: wait_hours=${wh} stops immediate sends — delayed steps are not scheduled yet. Put "Send email" as the first step (or 0h wait) for instant mail after checkout.`,
        )
        break
      }
      idx += 1
      continue
    }
    if (s.step_type !== 'send_email') {
      idx += 1
      continue
    }
    const tpl = pickStepTemplate(s, templateLocale)
    if (!tpl) {
      console.warn(
        `[flow-automation] flow ${flowId} step ${idx + 1}: skipped — email subject/body is empty. Fill in the template in Content → Flows.`,
      )
      idx += 1
      continue
    }
    if (!toEmail) {
      idx += 1
      continue
    }
    const subject = applyFlowEmailPlaceholders(tpl.subject, placeholderVars)
    const html = applyFlowEmailPlaceholders(tpl.body, placeholderVars)
    const plain = flowEmailHtmlToPlainText(html)
    let attachments = []
    const oid = String(orderId || '').trim()
    const keys = Array.isArray(s.email_attachments) ? s.email_attachments : []
    if (oid && keys.length) {
      try {
        attachments = await buildFlowEmailPdfAttachments(client, oid, keys)
      } catch (e) {
        console.error('[flow-automation] pdf attachments', e?.message || e)
      }
    }
    const { fromEmail, fromName } = await resolveSmtpSenderIdentity(client, s.smtp_sender_id)
    if (!fromEmail) {
      idx += 1
      continue
    }
    await transport.sendMail({
      from: `"${String(fromName).replace(/"/g, '')}" <${fromEmail}>`,
      to: toEmail,
      subject,
      html,
      text: plain || subject,
      ...(attachments.length ? { attachments } : {}),
    })
    emailsSent += 1
    idx += 1
  }
  const hasSendEmailStep = steps.some((x) => x.step_type === 'send_email')
  if (hasSendEmailStep && emailsSent === 0) {
    console.warn(
      `[flow-automation] order ${orderId} flow ${flowId}: send_email step(s) but nothing delivered (empty templates, missing From, or wait > 0 before any email).`,
    )
  }
  if (emailsSent > 0) {
    await client.query(`UPDATE admin_hub_flows SET sent_count = sent_count + 1, updated_at = now() WHERE id = $1::uuid`, [flowId])
  }
  return emailsSent
}

/**
 * @param {{ triggerKey: string, orderId: string }} opts
 */
async function runAutomationFlowsForOrder(opts) {
  const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
  if (!dbUrl || !dbUrl.startsWith('postgres')) {
    console.warn('[flow-automation] skip: DATABASE_URL missing')
    return
  }

  const triggerKey = String(opts.triggerKey || '').trim()
  const orderId = String(opts.orderId || '').trim()
  if (!triggerKey || !orderId) return

  let client
  try {
    client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
    await client.connect()

    const ctx = await loadOrderContext(client, orderId)
    if (!ctx) {
      console.warn('[flow-automation] skip: order not found', orderId)
      return
    }

    const transport = await getSmtpTransport(client)
    if (!transport) {
      console.warn('[flow-automation] skip: SMTP not configured (store_smtp_settings needs host + username)')
      return
    }

    let customerProfile = null
    if (ctx.order.customer_id) {
      const cr = await client.query(
        `SELECT id, email, first_name, last_name, phone, gender FROM store_customers WHERE id = $1::uuid`,
        [ctx.order.customer_id],
      )
      customerProfile = cr.rows[0] || null
    }
    const placeholderVars = buildPlaceholderVars(ctx, triggerKey, customerProfile)
    const customerLocale = resolveEmailLocaleFromCountry(ctx.order.country)

    const flowsR = await client.query(
      `SELECT id, audience FROM admin_hub_flows
       WHERE status = 'active' AND trigger_key = $1
       ORDER BY updated_at ASC`,
      [triggerKey],
    )

    const flowRows = flowsR.rows || []
    if (!flowRows.length) {
      console.warn(
        `[flow-automation] no active flow for trigger "${triggerKey}" — enable the flow (status Active, not Draft) and matching trigger in Content → Flows`,
      )
      return
    }

    let totalEmails = 0
    for (const fr of flowRows) {
      const flowId = fr.id
      const audience = String(fr.audience || 'customer').toLowerCase() === 'seller' ? 'seller' : 'customer'

      const sr = await client.query(
        `SELECT step_order, step_type, wait_hours, email_subject, email_body, email_i18n, email_attachments, smtp_sender_id
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
        if (!sid) {
          console.warn(`[flow-automation] skip flow ${flowId}: seller audience but order has no seller_id`)
          continue
        }
        const sur = await client.query(
          `SELECT email FROM seller_users WHERE seller_id = $1 AND sub_of_seller_id IS NULL ORDER BY created_at ASC LIMIT 1`,
          [sid],
        )
        toEmail = String(sur.rows[0]?.email || '').trim()
      }

      if (!toEmail) {
        console.warn(
          `[flow-automation] skip flow ${flowId} (${audience}): no recipient — customer order needs email; seller flow needs seller account email`,
        )
        continue
      }

      const n = await sendImmediateStepsForFlow({
        client,
        transport,
        flowId,
        audience,
        triggerKey,
        steps,
        toEmail,
        templateLocale,
        placeholderVars,
        orderId,
      })
      totalEmails += n
    }
    if (totalEmails > 0) {
      console.log(`[flow-automation] ${triggerKey} order=${orderId}: sent ${totalEmails} email(s)`)
    } else if (flowRows.length > 0) {
      console.warn(
        `[flow-automation] ${triggerKey} order=${orderId}: matched ${flowRows.length} flow(s) but 0 emails — see warnings above (draft→active, wait step first, SMTP, templates).`,
      )
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
  buildFlowEmailPlaceholderVarsForCustomer,
  resolveSmtpSenderIdentity,
}
