/**
 * Generate Rechnung / Lieferschein / Provisionsfaktur PDF buffers for nodemailer attachments.
 */

const { resolveOrderPaidTotalCents, orderBonusDiscountCents, orderCouponDiscountCents } = require('./order-money')
const { getOrderPdfStrings, getOrderPdfFilename } = require('./order-pdf-i18n')
const {
  pdfCents,
  renderRetailOrderDocument,
  renderCommissionInvoiceDocument,
} = require('./order-pdf-layout')

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
  const grandTotal = resolveOrderPaidTotalCents(row)
  const cc = row.coupon_code ? String(row.coupon_code).trim() : ''

  const totalsLines = [
    { label: s.subtotal, value: pdfCents(subtotal, locale) },
    { label: s.shipping, value: shipping > 0 ? pdfCents(shipping, locale) : s.freeShipping },
  ]
  if (bonusDisc > 0) totalsLines.push({ label: s.bonusPoints(Number(row.bonus_points_redeemed || 0)), value: `-${pdfCents(bonusDisc, locale)}` })
  if (couponDisc > 0) totalsLines.push({ label: cc ? `${s.coupon} (${cc})` : s.coupon, value: `-${pdfCents(couponDisc, locale)}` })
  const remainder = Math.max(0, discount - bonusDisc - couponDisc)
  if (remainder > 0) totalsLines.push({ label: s.discount, value: `-${pdfCents(remainder, locale)}` })
  totalsLines.push({ label: s.grandTotal, value: pdfCents(grandTotal, locale), bold: true })

  const sellerVatId = sellerInfo?.vat_id ? String(sellerInfo.vat_id).trim() : ''
  if (sellerVatId) {
    const vatCents = Math.round(grandTotal * 19 / 119)
    const netCents = grandTotal - vatCents
    totalsLines.push({ label: s.vatIncluded, value: pdfCents(vatCents, locale), color: '#64748b' })
    totalsLines.push({ label: s.netAmount, value: pdfCents(netCents, locale), color: '#64748b' })
  } else {
    totalsLines.push({ label: s.vatExempt, value: '', color: '#64748b' })
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
    amountDueCents: grandTotal,
    footerText: s.invoiceFooter,
    invoiceNumber: displayNumber,
  })
}

function renderLieferscheinPdfDocument(doc, { row, itemRows, invoiceNumber, shopName, shopLogoBuffer, locale = 'de' }) {
  const s = getOrderPdfStrings(locale)
  const displayNumber = String(invoiceNumber || '')

  renderRetailOrderDocument(doc, {
    docTitle: s.deliveryTitle,
    row,
    itemRows,
    shopName,
    sellerInfo: null,
    shopLogoBuffer,
    locale,
    kind: 'lieferschein',
    footerText: s.deliveryFooter,
    invoiceNumber: displayNumber,
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
  if (!sellerId || String(sellerId).trim() === 'default') return null
  try {
    const r = await pgClient.query(
      `SELECT store_name, company_name, first_name, last_name, vat_id, email, business_address
         FROM seller_users WHERE seller_id = $1 LIMIT 1`,
      [String(sellerId).trim()],
    )
    return r.rows?.[0] || null
  } catch (_) {
    return null
  }
}

async function buildInvoicePdfBuffer(pgClient, orderId, locale = 'de') {
  const id = String(orderId || '').trim()
  const oRes = await pgClient.query('SELECT * FROM store_orders WHERE id = $1::uuid', [id])
  const row = oRes.rows && oRes.rows[0]
  if (!row) return null
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
      locale,
    }),
  )
  return { filename: getOrderPdfFilename('invoice', on, locale), content: buf }
}

async function buildLieferscheinPdfBuffer(pgClient, orderId, locale = 'de') {
  const id = String(orderId || '').trim()
  const oRes = await pgClient.query('SELECT * FROM store_orders WHERE id = $1::uuid', [id])
  const row = oRes.rows && oRes.rows[0]
  if (!row) return null
  const iRes = await pgClient.query('SELECT * FROM store_order_items WHERE order_id = $1 ORDER BY created_at', [id])
  const itemRows = iRes.rows || []
  const on = row.order_number != null ? String(row.order_number) : String(id).slice(0, 8)
  const shopName = process.env.SHOP_INVOICE_NAME || 'Andertal'
  const logoUrl = await pgClient.query("SELECT shop_logo_url FROM admin_hub_seller_settings WHERE seller_id='default' LIMIT 1")
    .then((r) => r.rows?.[0]?.shop_logo_url || '').catch(() => '')
  const shopLogoBuffer = logoUrl ? await _fetchImageBuffer(logoUrl) : null
  const buf = await pdfDocToBuffer((doc) =>
    renderLieferscheinPdfDocument(doc, { row, itemRows, invoiceNumber: on, shopName, shopLogoBuffer, locale }),
  )
  return { filename: getOrderPdfFilename('lieferschein', on, locale), content: buf }
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

const ALLOWED_ATTACH_KEYS = new Set(['invoice_pdf', 'lieferschein_pdf'])

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
    }
  }
  return out
}

module.exports = {
  buildFlowEmailPdfAttachments,
  buildInvoicePdfBuffer,
  buildLieferscheinPdfBuffer,
  buildProvisionsfakturPdfBuffer,
  renderInvoicePdfDocument,
  renderLieferscheinPdfDocument,
  renderProvisionsfakturPdfDocument,
  getOrderPdfFilename,
}
