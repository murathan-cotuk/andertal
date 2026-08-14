/**
 * Generate Rechnung / Lieferschein / Provisionsfaktur PDF buffers for nodemailer attachments.
 */

const { resolveOrderPaidTotalCents, orderBonusDiscountCents, orderCouponDiscountCents } = require('./order-money')
const { getOrderPdfStrings, getOrderPdfFilename } = require('./order-pdf-i18n')
const { resolveLocaleFromCountry } = require('./locale-from-country')
const { salesInvoiceVat, formatVatPercent } = require('./goods-vat')
const {
  pdfCents,
  renderRetailOrderDocument,
  renderRetourenscheinDocument,
  renderVersandlabelDocument,
  renderCommissionInvoiceDocument,
} = require('./order-pdf-layout')

/** Legal documents (Rechnung/Lieferschein) follow the recipient's billing/shipping country, not the storefront UI language. */
function resolveDocumentLocaleFromOrderRow(row) {
  return resolveLocaleFromCountry((row && (row.billing_country || row.country)) || '', 'de')
}

function renderInvoicePdfDocument(doc, { row, itemRows, orderId, invoiceNumber, shopName, sellerInfo, shopLogoBuffer, locale = 'de' }) {
  const s = getOrderPdfStrings(locale)
  const subtotal =
    row.subtotal_cents != null
      ? Number(row.subtotal_cents)
      : itemRows.reduce((sum, it) => sum + Number(it.unit_price_cents || 0) * Number(it.quantity || 1), 0)
  const shipping = Number(row.shipping_cents || 0)
  const discount = Number(row.discount_cents || 0)
  const bonusDisc = orderBonusDiscountCents(row)
  const couponDisc = orderCouponDiscountCents(row)
  const customerPaidCents = resolveOrderPaidTotalCents(row)
  // Bonus points are a platform-funded payment method, not a price reduction: the seller's
  // invoiced sale price (and the customer's legal order value) is the paid amount plus the
  // bonus-funded portion, not the discounted card/PayPal charge.
  const orderValueCents = customerPaidCents + bonusDisc
  const cc = row.coupon_code ? String(row.coupon_code).trim() : ''

  const sellerVatId = sellerInfo?.vat_id ? String(sellerInfo.vat_id).trim() : ''
  const taxableGross = Math.max(0, orderValueCents)
  const customerVatId = row.customer_vat_id ? String(row.customer_vat_id).trim() : ''
  const goodsVat = salesInvoiceVat(row, { sellerHasVatId: !!sellerVatId, taxableGrossCents: taxableGross, customerVatId })
  const vatPctLabel = formatVatPercent(goodsVat.ratePercent)
  const totalsLines = []
  if (couponDisc > 0) totalsLines.push({ label: cc ? `${s.coupon} (${cc})` : s.coupon, value: `-${pdfCents(couponDisc, locale)}` })
  const remainder = Math.max(0, discount - bonusDisc - couponDisc)
  if (remainder > 0) totalsLines.push({ label: s.discount, value: `-${pdfCents(remainder, locale)}` })
  if (sellerVatId && !goodsVat.exempt) {
    totalsLines.push({ label: s.netTotal, value: pdfCents(goodsVat.netCents, locale) })
    totalsLines.push({ label: s.vatLine(vatPctLabel), value: pdfCents(goodsVat.vatCents, locale) })
  } else if (goodsVat.scheme === 'intra_b2b') {
    // Reverse-charge invoice: net-only line + the legally required note + the buyer's own VAT-ID
    // (never the same wording/branch as the Kleinunternehmer §19 UStG exemption below).
    totalsLines.push({ label: s.netTotal, value: pdfCents(goodsVat.netCents, locale) })
    totalsLines.push({ label: s.reverseChargeNote, value: '', color: '#64748b', small: true })
    if (customerVatId) totalsLines.push({ label: s.buyerVatIdLabel, value: customerVatId, small: true, color: '#64748b' })
  } else {
    totalsLines.push({ label: s.vatExempt, value: '', color: '#64748b', small: true })
  }
  totalsLines.push({ label: s.grandTotal, value: pdfCents(orderValueCents, locale) })
  if (bonusDisc > 0) {
    if (customerPaidCents > 0) totalsLines.push({ label: s.paidByCard, value: pdfCents(customerPaidCents, locale), small: true, color: '#64748b' })
    totalsLines.push({ label: s.paidByBonus, value: pdfCents(bonusDisc, locale), small: true, color: '#64748b' })
  }

  const displayNumber = String(invoiceNumber || '').startsWith('R-') ? String(invoiceNumber) : `R-${invoiceNumber}`

  renderRetailOrderDocument(doc, {
    docTitle: s.invoiceTitle,
    row,
    itemRows,
    shopName,
    sellerInfo,
    shopLogoBuffer,
    locale,
    kind: 'invoice',
    totalsLines,
    shippingCents: shipping,
    amountDueCents: orderValueCents,
    footerText: s.invoiceFooter,
    invoiceNumber: displayNumber,
    goodsVatPercent: sellerVatId && !goodsVat.exempt ? goodsVat.ratePercent : 0,
  })
}

function renderLieferscheinPdfDocument(doc, {
  row,
  itemRows,
  invoiceNumber,
  shopName,
  sellerInfo = null,
  shopLogoBuffer,
  locale = 'de',
  carrierName = null,
  trackingNumber = null,
}) {
  const s = getOrderPdfStrings(locale)
  const raw = String(invoiceNumber || '').trim()
  const displayNumber = !raw
    ? ''
    : raw.startsWith('L-')
      ? raw
      : `L-${raw.replace(/^[A-Za-z]+-/, '')}`

  renderRetailOrderDocument(doc, {
    docTitle: s.deliveryTitle,
    row,
    itemRows,
    shopName,
    sellerInfo,
    shopLogoBuffer,
    locale,
    kind: 'lieferschein',
    footerText: s.deliveryFooter,
    invoiceNumber: displayNumber,
    carrierName,
    trackingNumber,
  })
}

function renderRetourenscheinPdfDocument(doc, {
  row,
  returnRow = null,
  shopName,
  sellerInfo = null,
  shopLogoBuffer = null,
  locale = 'de',
  lineItems = null,
}) {
  renderRetourenscheinDocument(doc, {
    row,
    returnRow,
    shopName,
    sellerInfo,
    shopLogoBuffer,
    locale,
    lineItems,
  })
}

function renderVersandlabelPdfDocument(doc, {
  row,
  itemRows = [],
  shopName,
  sellerInfo = null,
  shopLogoBuffer = null,
  locale = 'de',
  carrierName = null,
  trackingNumber = null,
}) {
  renderVersandlabelDocument(doc, {
    row,
    itemRows,
    shopName,
    sellerInfo,
    shopLogoBuffer,
    locale,
    carrierName,
    trackingNumber,
  })
}

function renderProvisionsfakturPdfDocument(doc, {
  order,
  sellerInfo,
  shopName,
  commissionCents,
  commissionRatePct,
  platformAddress,
  platformVatId,
  platformVatPercent,
}) {
  const on = order.order_number != null ? String(order.order_number) : String(order.id || '').slice(0, 8)
  const grossSalesCents = Number(order.subtotal_cents || order.total_cents || 0)
  const storedNet = Number(order.seller_net_after_commission_cents)
  const payoutCents = Number.isFinite(storedNet) && storedNet > 0 ? storedNet : Math.max(0, grossSalesCents - Number(commissionCents || 0))
  const rate = Number.isFinite(commissionRatePct) && commissionRatePct > 0 ? commissionRatePct : 12

  renderCommissionInvoiceDocument(doc, {
    order,
    sellerInfo,
    shopName,
    commissionCents,
    commissionRatePct: rate,
    grossSalesCents,
    payoutCents,
    platformAddress,
    platformVatId,
    platformVatPercent,
    invoiceNumber: `PROV-${on}`,
  })
}

function pdfDocToBuffer(renderFn) {
  const PDFDocument = require('pdfkit')
  return new Promise((resolve, reject) => {
    const chunks = []
    const doc = new PDFDocument({ margin: 50, size: 'A4', compress: false, pdfVersion: '1.7' })
    doc.on('data', (c) => chunks.push(c))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)
    try {
      renderFn(doc)
      doc.end()
    } catch (e) {
      reject(e)
    }
  })
}

async function _fetchImageBuffer(url) {
  if (!url || !String(url).startsWith('http')) return null
  try {
    const https = require('https')
    const http = require('http')
    const lib = String(url).startsWith('https') ? https : http
    return await new Promise((resolve) => {
      const req = lib.get(url, { timeout: 5000 }, (res) => {
        if (res.statusCode !== 200) { res.resume(); return resolve(null) }
        const chunks = []
        res.on('data', (c) => chunks.push(c))
        res.on('end', () => resolve(Buffer.concat(chunks)))
        res.on('error', () => resolve(null))
      })
      req.on('error', () => resolve(null))
      req.on('timeout', () => { req.destroy(); resolve(null) })
    })
  } catch (_) {
    return null
  }
}

async function _querySellerInfo(pgClient, sellerId) {
  const sid = String(sellerId || '').trim()
  try {
    if (sid && sid !== 'default') {
      const r = await pgClient.query(
        `SELECT store_name, company_name, first_name, last_name, vat_id, email, business_address, lucid_number
           FROM seller_users WHERE seller_id = $1 LIMIT 1`,
        [sid],
      )
      if (r.rows?.[0]) return r.rows[0]
    }
    // Platform-run orders (no marketplace seller, i.e. seller_id is absent/'default') still need a
    // sender block + real VAT status on the invoice — fall back to the platform's own legal/company
    // settings instead of leaving the invoice sender blank and defaulting to the Kleinunternehmer notice.
    const lr = await pgClient.query(
      `SELECT legal_company_name, legal_street, legal_city, legal_vat_id
         FROM admin_hub_seller_settings WHERE seller_id = 'default' LIMIT 1`,
    )
    const l = lr.rows?.[0]
    if (!l) return null
    const companyName = String(l.legal_company_name || '').trim()
    const street = String(l.legal_street || '').trim()
    const cityLine = String(l.legal_city || '').trim()
    const vatId = String(l.legal_vat_id || '').trim()
    if (!companyName && !street && !cityLine && !vatId) return null
    return {
      store_name: companyName,
      company_name: companyName,
      vat_id: vatId,
      business_address: { street, city: cityLine },
    }
  } catch (_) {
    return null
  }
}

async function buildInvoicePdfBuffer(pgClient, orderId, locale) {
  const id = String(orderId || '').trim()
  const oRes = await pgClient.query('SELECT * FROM store_orders WHERE id = $1::uuid', [id])
  const row = oRes.rows && oRes.rows[0]
  if (!row) return null
  // Invoices are always issued in German regardless of the shipping/billing country.
  const resolvedLocale = locale || 'de'
  const iRes = await pgClient.query('SELECT * FROM store_order_items WHERE order_id = $1 ORDER BY created_at', [id])
  const itemRows = iRes.rows || []
  const sellerInfo = await _querySellerInfo(pgClient, row.seller_id)
  const on = row.order_number != null ? String(row.order_number) : String(id).slice(0, 8)
  const shopName = process.env.SHOP_INVOICE_NAME || 'Andertal'
  const logoUrl = await pgClient.query("SELECT shop_logo_url FROM admin_hub_seller_settings WHERE seller_id='default' LIMIT 1")
    .then((r) => r.rows?.[0]?.shop_logo_url || '').catch(() => '')
  const shopLogoBuffer = logoUrl ? await _fetchImageBuffer(logoUrl) : null
  const buf = await pdfDocToBuffer((doc) =>
    renderInvoicePdfDocument(doc, {
      row,
      itemRows,
      orderId: id,
      invoiceNumber: on,
      shopName,
      sellerInfo,
      shopLogoBuffer,
      locale: resolvedLocale,
    }),
  )
  return { filename: getOrderPdfFilename('invoice', on, resolvedLocale), content: buf }
}

async function buildLieferscheinPdfBuffer(pgClient, orderId, locale) {
  const id = String(orderId || '').trim()
  const oRes = await pgClient.query('SELECT * FROM store_orders WHERE id = $1::uuid', [id])
  const row = oRes.rows && oRes.rows[0]
  if (!row) return null
  const resolvedLocale = locale || resolveDocumentLocaleFromOrderRow(row)
  const iRes = await pgClient.query('SELECT * FROM store_order_items WHERE order_id = $1 ORDER BY created_at', [id])
  const itemRows = iRes.rows || []
  const sellerInfo = await _querySellerInfo(pgClient, row.seller_id)
  const on = row.order_number != null ? String(row.order_number) : String(id).slice(0, 8)
  const shopName = process.env.SHOP_INVOICE_NAME || 'Andertal'
  const logoUrl = await pgClient.query("SELECT shop_logo_url FROM admin_hub_seller_settings WHERE seller_id='default' LIMIT 1")
    .then((r) => r.rows?.[0]?.shop_logo_url || '').catch(() => '')
  const shopLogoBuffer = logoUrl ? await _fetchImageBuffer(logoUrl) : null
  const buf = await pdfDocToBuffer((doc) =>
    renderLieferscheinPdfDocument(doc, {
      row,
      itemRows,
      invoiceNumber: on,
      shopName,
      sellerInfo,
      shopLogoBuffer,
      locale: resolvedLocale,
      carrierName: row.carrier_name || null,
      trackingNumber: row.tracking_number || null,
    }),
  )
  return { filename: getOrderPdfFilename('lieferschein', on, resolvedLocale), content: buf }
}

async function buildProvisionsfakturPdfBuffer(pgClient, orderId) {
  const id = String(orderId || '').trim()
  const oRes = await pgClient.query(
    `SELECT id, order_number, seller_id, created_at, subtotal_cents, total_cents,
            stripe_application_fee_cents, seller_net_after_commission_cents
       FROM store_orders WHERE id = $1::uuid`,
    [id],
  )
  const order = oRes.rows?.[0]
  if (!order) return null
  const sellerInfo = await _querySellerInfo(pgClient, order.seller_id)

  const storedFee = Number(order.stripe_application_fee_cents)
  const subtotal = Number(order.subtotal_cents || order.total_cents || 0)
  const commissionCents = Number.isFinite(storedFee) && storedFee > 0 ? storedFee : Math.round(subtotal * 0.12)

  let commissionRatePct = 12
  if (subtotal > 0 && commissionCents > 0) {
    commissionRatePct = Math.round((commissionCents / subtotal) * 100 * 10) / 10
  }

  const shopName = process.env.SHOP_INVOICE_NAME || 'Andertal Marktplatz'
  const platformAddress = process.env.PLATFORM_INVOICE_ADDRESS || ''
  const platformVatId = process.env.PLATFORM_VAT_ID || ''
  const platformVatPercent = Number(process.env.PLATFORM_VAT_PERCENT || '0')
  const on = order.order_number != null ? String(order.order_number) : String(id).slice(0, 8)

  const buf = await pdfDocToBuffer((doc) =>
    renderProvisionsfakturPdfDocument(doc, {
      order,
      sellerInfo,
      shopName,
      commissionCents,
      commissionRatePct,
      platformAddress,
      platformVatId,
      platformVatPercent,
    }),
  )
  return { filename: `Provisionsfaktur-${on}.pdf`, content: buf }
}

const ALLOWED_ATTACH_KEYS = new Set(['invoice_pdf', 'lieferschein_pdf', 'return_label_pdf'])

/** Fetches the already-generated Sendcloud/DHL return label PDF (see return-label.js) for this order. */
async function buildReturnLabelPdfAttachment(pgClient, orderId) {
  const r = await pgClient.query(
    `SELECT return_number, label_url FROM store_returns WHERE order_id = $1::uuid AND label_url IS NOT NULL ORDER BY created_at DESC LIMIT 1`,
    [orderId],
  )
  const row = r.rows[0]
  if (!row?.label_url) return null
  const buf = await _fetchImageBuffer(row.label_url)
  if (!buf) return null
  const num = row.return_number != null ? String(row.return_number) : String(orderId).slice(0, 8)
  return { filename: `Retourenetikett-${num}.pdf`, content: buf }
}

async function buildFlowEmailPdfAttachments(pgClient, orderId, keys) {
  const uniq = [...new Set((keys || []).map((k) => String(k)).filter((k) => ALLOWED_ATTACH_KEYS.has(k)))]
  const out = []
  for (const k of uniq) {
    if (k === 'invoice_pdf') {
      const a = await buildInvoicePdfBuffer(pgClient, orderId)
      if (a) out.push(a)
    } else if (k === 'lieferschein_pdf') {
      const a = await buildLieferscheinPdfBuffer(pgClient, orderId)
      if (a) out.push(a)
    } else if (k === 'return_label_pdf') {
      const a = await buildReturnLabelPdfAttachment(pgClient, orderId)
      if (a) out.push(a)
    }
  }
  return out
}

module.exports = {
  buildFlowEmailPdfAttachments,
  buildInvoicePdfBuffer,
  buildLieferscheinPdfBuffer,
  buildReturnLabelPdfAttachment,
  buildProvisionsfakturPdfBuffer,
  renderInvoicePdfDocument,
  renderLieferscheinPdfDocument,
  renderRetourenscheinPdfDocument,
  renderVersandlabelPdfDocument,
  renderProvisionsfakturPdfDocument,
  getOrderPdfFilename,
  querySellerInfoForInvoice: _querySellerInfo,
}
