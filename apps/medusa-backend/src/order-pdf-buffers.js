/**
 * Generate Rechnung / Lieferschein / Provisionsfaktur PDF buffers for nodemailer attachments.
 */

const { resolveOrderPaidTotalCents, orderBonusDiscountCents, orderCouponDiscountCents } = require('./order-money')
const { getOrderPdfStrings, getOrderPdfFilename } = require('./order-pdf-i18n')
const { resolveLocaleFromCountry } = require('./locale-from-country')
const { salesInvoiceVat, resolvePlatformCommissionVatPercent } = require('./goods-vat')
const { enrichOrderItemRows } = require('./order-items-seller')
const {
  pdfCents,
  renderRetailOrderDocument,
  renderRetourenscheinDocument,
  renderVersandlabelDocument,
  renderCommissionInvoiceDocument,
  renderPeriodCommissionInvoiceDocument,
  renderPlatformFinanzamtDocument,
} = require('./order-pdf-layout')

/** Legal documents (Rechnung/Lieferschein) follow the recipient's billing/shipping country, not the storefront UI language. */
function resolveDocumentLocaleFromOrderRow(row) {
  return resolveLocaleFromCountry((row && (row.billing_country || row.country)) || '', 'de')
}

function isMarketplaceMerchantInvoice(sellerInfo, shopName) {
  if (!sellerInfo || sellerInfo._platform === true) return false
  const brand = String(shopName || process.env.SHOP_INVOICE_NAME || 'Andertal').trim().toLowerCase()
  const names = [sellerInfo.store_name, sellerInfo.company_name]
    .map((s) => String(s || '').trim().toLowerCase())
    .filter(Boolean)
  if (brand && names.some((n) => n === brand || n === 'andertal' || n.startsWith('andertal '))) return false
  return true
}

function realSellerKey(v) {
  const s = String(v || '').trim()
  return s && s !== 'default' ? s : ''
}

async function loadPlatformIssuer(pgClient) {
  const shopName = process.env.SHOP_INVOICE_NAME || 'Andertal'
  const vatPercent = resolvePlatformCommissionVatPercent()
  const fallbackVat = String(process.env.PLATFORM_VAT_ID || '').trim()
  const fallbackAddr = String(process.env.PLATFORM_INVOICE_ADDRESS || '').trim()
  const lines = [shopName]
  if (fallbackAddr) {
    fallbackAddr.split(/[,\n]/).map((s) => s.trim()).filter(Boolean).forEach((l) => lines.push(l))
  }
  if (fallbackVat) lines.push(`USt-IdNr.: ${fallbackVat}`)
  const info = { shopName, vatId: fallbackVat, vatPercent, lines }
  try {
    const lr = await pgClient.query(
      `SELECT legal_company_name, legal_representative, legal_street, legal_city,
              legal_trade_register, legal_register_court, legal_vat_id, legal_tax_id, legal_email
         FROM admin_hub_seller_settings WHERE seller_id = 'default' LIMIT 1`,
    )
    const l = lr.rows?.[0]
    if (!l) return info
    const name = String(l.legal_company_name || '').trim() || shopName
    const street = String(l.legal_street || '').trim()
    const city = String(l.legal_city || '').trim()
    const vatId = String(l.legal_vat_id || '').trim() || fallbackVat
    const taxId = String(l.legal_tax_id || '').trim()
    const email = String(l.legal_email || '').trim()
    const hrb = String(l.legal_trade_register || '').trim()
    const court = String(l.legal_register_court || '').trim()
    const gf = String(l.legal_representative || '').trim()
    const next = [name]
    if (street) next.push(street)
    if (city) next.push(city)
    if (gf) next.push(`Geschäftsführer: ${gf}`)
    if (hrb) next.push(`Handelsregister: ${hrb}`)
    if (court) next.push(`Amtsgericht: ${court}`)
    if (vatId) next.push(`USt-IdNr.: ${vatId}`)
    if (taxId) next.push(`Steuernr.: ${taxId}`)
    if (email) next.push(email)
    return { shopName: name, vatId, vatPercent, lines: next }
  } catch (_) {
    return info
  }
}

/** Marketplace checkout stamps store_orders.seller_id = default; the merchant lives on the lines. */
async function resolveDocumentSellerId(pgClient, orderRow, itemRows) {
  const stamped = [...new Set((itemRows || []).map((it) => realSellerKey(it.seller_id)).filter(Boolean))]
  if (stamped.length >= 1) return stamped[0]
  try {
    const enriched = await enrichOrderItemRows(pgClient, itemRows || [])
    const ids = [...new Set(enriched.map((it) => realSellerKey(it.seller_id)).filter(Boolean))]
    if (ids.length) return ids[0]
  } catch (_) {}
  return realSellerKey(orderRow?.seller_id) || 'default'
}

async function querySellerInfoForOrderDocuments(pgClient, orderRow, itemRows) {
  const sid = await resolveDocumentSellerId(pgClient, orderRow, itemRows)
  return _querySellerInfo(pgClient, sid)
}

async function prepareRetailPdfContext(pgClient, row, itemRows) {
  const items = await enrichOrderItemRows(pgClient, itemRows || [])
  const next = { ...row }
  if ((next.customer_number == null || next.customer_number === '') && next.email) {
    try {
      const cr = await pgClient.query(
        `SELECT customer_number FROM store_customers WHERE LOWER(email) = LOWER($1) LIMIT 1`,
        [next.email],
      )
      if (cr.rows[0]?.customer_number != null) next.customer_number = cr.rows[0].customer_number
    } catch (_) {}
  }
  return { row: next, itemRows: items }
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
  const issuerIsPlatform = sellerInfo?._platform === true || !sellerInfo
  const taxableGross = Math.max(0, orderValueCents)
  const customerVatId = row.customer_vat_id ? String(row.customer_vat_id).trim() : ''
  // Marketplace merchant invoices always split destination VAT (brutto prices). §19 UStG
  // Kleinunternehmer only applies when the platform itself is the invoice issuer and has no VAT-ID.
  const goodsVat = salesInvoiceVat(row, {
    sellerHasVatId: !!sellerVatId || !issuerIsPlatform,
    taxableGrossCents: taxableGross,
    customerVatId,
  })
  const vatPctLabel = Number(goodsVat.ratePercent).toLocaleString(
    getOrderPdfStrings(locale).dateLocale,
    { minimumFractionDigits: 2, maximumFractionDigits: 2 },
  )
  const payMethod = String(row.payment_method || '').trim()
  const extraTableRows = []
  if (couponDisc > 0) extraTableRows.push({ title: s.discount, note: cc, quantity: 1, unit_price_cents: -couponDisc })
  const remainder = Math.max(0, discount - bonusDisc - couponDisc)
  if (remainder > 0) extraTableRows.push({ title: s.discount, quantity: 1, unit_price_cents: -remainder })
  extraTableRows.push({ title: s.shipping, quantity: 1, unit_price_cents: shipping })

  const totalsLines = []
  if (!goodsVat.exempt) {
    totalsLines.push({ label: s.netTotal, value: pdfCents(goodsVat.netCents, locale) })
    totalsLines.push({ label: s.vatLine(vatPctLabel), value: pdfCents(goodsVat.vatCents, locale) })
  } else if (goodsVat.scheme === 'intra_b2b') {
    totalsLines.push({ label: s.netTotal, value: pdfCents(goodsVat.netCents, locale) })
    totalsLines.push({ label: s.reverseChargeNote, value: '', color: '#64748b', small: true })
    if (customerVatId) {
      const viesSuffix = row.customer_vat_id_verified === true ? ` ${s.viesVerifiedSuffix}` : '';
      totalsLines.push({ label: s.buyerVatIdLabel, value: `${customerVatId}${viesSuffix}`, small: true, color: '#64748b' })
    }
  } else {
    totalsLines.push({ label: s.vatExempt, value: '', color: '#64748b', small: true })
  }
  totalsLines.push({ label: s.grandTotal, value: pdfCents(orderValueCents, locale), bold: true })
  if (customerPaidCents > 0) {
    const payLabel = payMethod ? `${s.paymentMethodLabel} (${payMethod})` : s.paidByCard
    totalsLines.push({ label: payLabel, value: pdfCents(customerPaidCents, locale), small: true, color: '#64748b' })
  }
  if (bonusDisc > 0) {
    totalsLines.push({ label: s.paidByBonus, value: pdfCents(bonusDisc, locale), small: true, color: '#64748b' })
  }

  const marketplaceInvoice = isMarketplaceMerchantInvoice(sellerInfo, shopName)

  const displayNumber = String(invoiceNumber || '').startsWith('R-') ? String(invoiceNumber) : `R-${invoiceNumber}`

  renderRetailOrderDocument(doc, {
    docTitle: s.invoiceTitle,
    row,
    itemRows,
    shopName,
    sellerInfo,
    shopLogoBuffer: marketplaceInvoice ? null : shopLogoBuffer,
    locale,
    kind: 'invoice',
    totalsLines,
    extraTableRows,
    footerText: marketplaceInvoice ? s.invoiceFooter : '',
    showMarketplaceNotice: marketplaceInvoice,
    marketplaceMerchant: marketplaceInvoice,
    invoiceNumber: displayNumber,
    goodsVatPercent: !goodsVat.exempt ? goodsVat.ratePercent : 0,
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

  const marketplaceMerchant = isMarketplaceMerchantInvoice(sellerInfo, shopName)

  renderRetailOrderDocument(doc, {
    docTitle: s.deliveryTitle,
    row,
    itemRows,
    shopName,
    sellerInfo,
    shopLogoBuffer: marketplaceMerchant ? null : shopLogoBuffer,
    locale,
    kind: 'lieferschein',
    footerText: s.deliveryFooter,
    invoiceNumber: displayNumber,
    carrierName,
    trackingNumber,
    marketplaceMerchant,
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
  platformLines,
  platformVatPercent,
  bonusFundingCents = 0,
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
    platformLines,
    platformVatPercent,
    invoiceNumber: `PROV-${on}`,
    bonusFundingCents,
    customerPaidCents: resolveOrderPaidTotalCents(order),
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
        `SELECT su.store_name, su.company_name, su.first_name, su.last_name, su.vat_id, su.email, su.business_address, su.lucid_number,
                su.phone, su.website, su.iban, su.payment_bic, su.payment_bank_name, su.payment_account_holder,
                su.authorized_person_name, su.tax_id,
                ss.store_name AS settings_store_name
           FROM seller_users su
           LEFT JOIN admin_hub_seller_settings ss ON ss.seller_id = su.seller_id
          WHERE su.seller_id = $1 AND su.sub_of_seller_id IS NULL LIMIT 1`,
        [sid],
      )
      if (r.rows?.[0]) {
        const row = r.rows[0]
        const storeName = String(row.store_name || row.settings_store_name || row.company_name || '').trim()
        return { ...row, store_name: storeName || row.store_name, _platform: false }
      }
      const r2 = await pgClient.query(
        `SELECT su.store_name, su.company_name, su.first_name, su.last_name, su.vat_id, su.email, su.business_address, su.lucid_number,
                su.phone, su.website, su.iban, su.payment_bic, su.payment_bank_name, su.payment_account_holder,
                su.authorized_person_name, su.tax_id,
                ss.store_name AS settings_store_name
           FROM seller_users su
           LEFT JOIN admin_hub_seller_settings ss ON ss.seller_id = su.seller_id
          WHERE su.seller_id = $1 LIMIT 1`,
        [sid],
      )
      if (r2.rows?.[0]) {
        const row = r2.rows[0]
        const storeName = String(row.store_name || row.settings_store_name || row.company_name || '').trim()
        return { ...row, store_name: storeName || row.store_name, _platform: false }
      }
    }
    // Platform-run orders (no marketplace seller, i.e. seller_id is absent/'default') still need a
    // sender block + real VAT status on the invoice — fall back to the platform's own legal/company
    // settings instead of leaving the invoice sender blank and defaulting to the Kleinunternehmer notice.
    const lr = await pgClient.query(
      `SELECT legal_company_name, legal_representative, legal_street, legal_city,
              legal_trade_register, legal_register_court, legal_vat_id, legal_tax_id, legal_email
         FROM admin_hub_seller_settings WHERE seller_id = 'default' LIMIT 1`,
    )
    const l = lr.rows?.[0]
    if (!l) return { _platform: true }
    const companyName = String(l.legal_company_name || '').trim()
    const street = String(l.legal_street || '').trim()
    const cityLine = String(l.legal_city || '').trim()
    const vatId = String(l.legal_vat_id || '').trim()
    if (!companyName && !street && !cityLine && !vatId) return { _platform: true }
    return {
      store_name: companyName,
      company_name: companyName,
      vat_id: vatId,
      legal_vat_id: vatId,
      legal_representative: String(l.legal_representative || '').trim(),
      legal_trade_register: String(l.legal_trade_register || '').trim(),
      legal_register_court: String(l.legal_register_court || '').trim(),
      legal_tax_id: String(l.legal_tax_id || '').trim(),
      legal_email: String(l.legal_email || '').trim(),
      email: String(l.legal_email || '').trim(),
      authorized_person_name: String(l.legal_representative || '').trim(),
      business_address: { street, city: cityLine },
      _platform: true,
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
  const prepared = await prepareRetailPdfContext(pgClient, row, iRes.rows || [])
  const itemRows = prepared.itemRows
  const orderRow = prepared.row
  const sellerInfo = await querySellerInfoForOrderDocuments(pgClient, orderRow, itemRows)
  const on = orderRow.order_number != null ? String(orderRow.order_number) : String(id).slice(0, 8)
  const shopName = process.env.SHOP_INVOICE_NAME || 'Andertal'
  const logoUrl = await pgClient.query("SELECT shop_logo_url FROM admin_hub_seller_settings WHERE seller_id='default' LIMIT 1")
    .then((r) => r.rows?.[0]?.shop_logo_url || '').catch(() => '')
  const shopLogoBuffer = logoUrl ? await _fetchImageBuffer(logoUrl) : null
  const buf = await pdfDocToBuffer((doc) =>
    renderInvoicePdfDocument(doc, {
      row: orderRow,
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
  const prepared = await prepareRetailPdfContext(pgClient, row, iRes.rows || [])
  const itemRows = prepared.itemRows
  const orderRow = prepared.row
  const sellerInfo = await querySellerInfoForOrderDocuments(pgClient, orderRow, itemRows)
  const on = orderRow.order_number != null ? String(orderRow.order_number) : String(id).slice(0, 8)
  const shopName = process.env.SHOP_INVOICE_NAME || 'Andertal'
  const logoUrl = await pgClient.query("SELECT shop_logo_url FROM admin_hub_seller_settings WHERE seller_id='default' LIMIT 1")
    .then((r) => r.rows?.[0]?.shop_logo_url || '').catch(() => '')
  const shopLogoBuffer = logoUrl ? await _fetchImageBuffer(logoUrl) : null
  const buf = await pdfDocToBuffer((doc) =>
    renderLieferscheinPdfDocument(doc, {
      row: orderRow,
      itemRows,
      invoiceNumber: on,
      shopName,
      sellerInfo,
      shopLogoBuffer,
      locale: resolvedLocale,
      carrierName: orderRow.carrier_name || null,
      trackingNumber: orderRow.tracking_number || null,
    }),
  )
  return { filename: getOrderPdfFilename('lieferschein', on, resolvedLocale), content: buf }
}

async function buildProvisionsfakturPdfBuffer(pgClient, orderId) {
  const id = String(orderId || '').trim()
  const oRes = await pgClient.query(
    `SELECT id, order_number, seller_id, created_at, subtotal_cents, total_cents, shipping_cents,
            discount_cents, coupon_discount_cents,
            stripe_application_fee_cents, seller_net_after_commission_cents, platform_bonus_funding_cents
       FROM store_orders WHERE id = $1::uuid`,
    [id],
  )
  const order = oRes.rows?.[0]
  if (!order) return null
  const iRes = await pgClient.query('SELECT * FROM store_order_items WHERE order_id = $1 ORDER BY created_at', [id])
  const sellerInfo = await querySellerInfoForOrderDocuments(pgClient, order, iRes.rows || [])
  const platform = await loadPlatformIssuer(pgClient)

  const storedFee = Number(order.stripe_application_fee_cents)
  const subtotal = Number(order.subtotal_cents || order.total_cents || 0)
  const commissionCents = Number.isFinite(storedFee) && storedFee > 0 ? storedFee : Math.round(subtotal * 0.12)

  let commissionRatePct = 12
  if (subtotal > 0 && commissionCents > 0) {
    commissionRatePct = Math.round((commissionCents / subtotal) * 100 * 10) / 10
  }

  const on = order.order_number != null ? String(order.order_number) : String(id).slice(0, 8)

  const buf = await pdfDocToBuffer((doc) =>
    renderProvisionsfakturPdfDocument(doc, {
      order,
      sellerInfo,
      shopName: platform.shopName,
      commissionCents,
      commissionRatePct,
      platformLines: platform.lines,
      platformVatPercent: platform.vatPercent,
      bonusFundingCents: Number(order.platform_bonus_funding_cents || 0),
    }),
  )
  return { filename: `Provisionsfaktur-${on}.pdf`, content: buf }
}

/**
 * Period commission invoice (seller_payouts row → PDF) — shared by the download endpoint
 * (GET /admin-hub/v1/seller-payouts/:id/pdf) and the "invoice created" notification email,
 * so both always render identically instead of duplicating this query+render logic.
 */
async function buildSellerPayoutPdfBuffer(pgClient, payoutId) {
  const id = String(payoutId || '').trim()
  const pRes = await pgClient.query(
    `SELECT p.*, s.store_name, s.company_name, s.first_name, s.last_name,
            s.vat_id, s.tax_id, s.email, s.business_address, s.commission_rate, s.iban
       FROM seller_payouts p
       LEFT JOIN seller_users s ON s.seller_id = p.seller_id
       WHERE p.id = $1::uuid LIMIT 1`,
    [id],
  )
  const payout = pRes.rows?.[0]
  if (!payout) return null

  const platform = await loadPlatformIssuer(pgClient)
  try {
    const { aggregateSellerPeriodSales } = require('./seller-billing')
    const live = await aggregateSellerPeriodSales(pgClient, payout.seller_id, payout.period_start, payout.period_end)
    const rate = Number(payout.commission_rate) >= 0 ? Number(payout.commission_rate) : 0.12
    if (live.grossCents > 0 || Number(payout.total_cents || 0) === 0) {
      payout.total_cents = live.grossCents
      payout.commission_cents = Math.round(live.grossCents * rate)
      payout.payout_cents = Math.max(0, live.grossCents - payout.commission_cents)
      payout.bonus_funding_cents = live.bonusFundingCents
      payout.customer_paid_cents = live.customerPaidCents
      payout.shipping_cents = live.shippingCents
      payout.refund_cents = live.refundCents
      payout.order_count = live.orderCount
    }
  } catch (_) {}

  const ps = new Date(payout.period_start)
  const pe = new Date(payout.period_end)
  const periodLabel = `${ps.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })} – ${pe.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })}`
  const invoiceNum = `PROV-${String(payout.period_start).slice(0, 7).replace('-', '')}`

  const buf = await pdfDocToBuffer((doc) =>
    renderPeriodCommissionInvoiceDocument(doc, {
      payout,
      shopName: platform.shopName,
      platformLines: platform.lines,
      platformVatPercent: platform.vatPercent,
      invoiceNumber: invoiceNum,
      periodLabel,
    }),
  )
  return { filename: `Provisionsfaktur-${invoiceNum}.pdf`, content: buf, payout }
}

async function queryFinanzamtPeriodTotals(pgClient, periodStart, periodEnd) {
  const vatPercent = resolvePlatformCommissionVatPercent()
  try {
    const { aggregateMarketplacePeriodSales } = require('./seller-billing')
    const live = await aggregateMarketplacePeriodSales(pgClient, periodStart || null, periodEnd || null)
    if (live.orderCount > 0 || live.grossCents > 0) {
      return {
        gross_sale_cents: live.grossCents,
        shipping_cents: live.shippingCents,
        customer_paid_cents: live.customerPaidCents,
        bonus_funding_cents: live.bonusFundingCents,
        commission_net_cents: live.commissionCents,
        commission_vat_cents: Math.round(live.commissionCents * vatPercent / 100),
        seller_payout_cents: Math.max(0, live.grossCents - live.commissionCents),
        refund_cents: live.refundCents,
        order_count: live.orderCount,
        seller_count: live.sellerCount,
        invoice_count: 0,
      }
    }
  } catch (_) {}

  const where = []
  const params = []
  if (periodStart) { params.push(periodStart); where.push(`p.period_start >= $${params.length}::date`) }
  if (periodEnd) { params.push(periodEnd); where.push(`p.period_end <= $${params.length}::date`) }
  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const r = await pgClient.query(
    `SELECT p.seller_id, p.total_cents, p.commission_cents, p.payout_cents,
            p.customer_paid_cents, p.bonus_funding_cents, p.commission_vat_cents, p.refund_cents, p.order_count
       FROM seller_payouts p
       ${whereClause}`,
    params,
  )
  const rows = r.rows || []
  const totals = rows.reduce((acc, row) => {
    acc.gross_sale_cents += Number(row.total_cents || 0)
    acc.customer_paid_cents += Number(row.customer_paid_cents || 0)
    acc.bonus_funding_cents += Number(row.bonus_funding_cents || 0)
    acc.commission_net_cents += Number(row.commission_cents || 0)
    acc.commission_vat_cents += Number(row.commission_vat_cents || 0)
    acc.seller_payout_cents += Number(row.payout_cents || 0)
    acc.refund_cents += Number(row.refund_cents || 0)
    acc.order_count += Number(row.order_count || 0)
    return acc
  }, {
    gross_sale_cents: 0, shipping_cents: 0, customer_paid_cents: 0, bonus_funding_cents: 0, commission_net_cents: 0,
    commission_vat_cents: 0, seller_payout_cents: 0, refund_cents: 0, order_count: 0,
  })
  totals.seller_count = new Set(rows.map((row) => row.seller_id)).size
  totals.invoice_count = rows.length
  if (!totals.commission_vat_cents) {
    totals.commission_vat_cents = Math.round(Number(totals.commission_net_cents || 0) * vatPercent / 100)
  }
  return totals
}

async function queryFinanzamtOss(pgClient, periodStart, periodEnd) {
  const ossWhere = [`o.payment_status = 'bezahlt'`]
  const ossParams = []
  if (periodStart) { ossParams.push(periodStart); ossWhere.push(`o.created_at >= $${ossParams.length}::date`) }
  if (periodEnd) { ossParams.push(periodEnd); ossWhere.push(`o.created_at < ($${ossParams.length}::date + interval '1 day')`) }
  const oRes = await pgClient.query(
    `SELECT o.country, o.subtotal_cents, o.shipping_cents, o.discount_cents, o.coupon_discount_cents, o.total_cents,
            o.customer_vat_id, s.vat_id
       FROM store_orders o
       LEFT JOIN seller_users s ON s.seller_id = CASE WHEN o.seller_id IS NOT NULL AND o.seller_id <> 'default' THEN o.seller_id ELSE NULL END
      WHERE ${ossWhere.join(' AND ')}
      LIMIT 20000`,
    ossParams,
  )
  const byCountry = new Map()
  for (const row of oRes.rows || []) {
    const cc = row.country ? String(row.country).trim().toUpperCase().slice(0, 2) : 'DE'
    const customerPaid = resolveOrderPaidTotalCents(row)
    const bonus = orderBonusDiscountCents(row)
    const orderValueCents = Math.max(0, customerPaid + bonus)
    const sellerVatId = row.vat_id ? String(row.vat_id).trim() : ''
    const customerVatId = row.customer_vat_id ? String(row.customer_vat_id).trim() : ''
    const vat = salesInvoiceVat({ country: cc }, { sellerHasVatId: !!sellerVatId, taxableGrossCents: orderValueCents, customerVatId })
    if (vat.scheme === 'intra_b2b') continue
    if (!byCountry.has(cc)) {
      byCountry.set(cc, { country: cc, order_count: 0, gross_cents: 0, net_cents: 0, vat_cents: 0, rate_percent: vat.exempt ? 0 : vat.ratePercent })
    }
    const bucket = byCountry.get(cc)
    bucket.order_count += 1
    bucket.gross_cents += orderValueCents
    bucket.net_cents += vat.netCents
    bucket.vat_cents += vat.vatCents
  }
  return [...byCountry.values()].sort((a, b) => b.gross_cents - a.gross_cents)
}

async function buildPlatformFinanzamtPdfBuffer(pgClient, { periodStart = '', periodEnd = '' } = {}) {
  const platform = await loadPlatformIssuer(pgClient)
  const totals = await queryFinanzamtPeriodTotals(pgClient, periodStart || null, periodEnd || null)
  let ossByCountry = []
  try {
    ossByCountry = await queryFinanzamtOss(pgClient, periodStart || null, periodEnd || null)
  } catch (_) {
    ossByCountry = []
  }
  let periodLabel = 'Gesamt (alle Zeiträume)'
  if (periodStart && periodEnd) {
    const ps = new Date(periodStart)
    const pe = new Date(periodEnd)
    periodLabel = `${ps.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })} – ${pe.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })}`
  }
  const tag = periodStart ? String(periodStart).slice(0, 7).replace('-', '') : 'GESAMT'
  const invoiceNum = `PLAT-${tag}`
  const buf = await pdfDocToBuffer((doc) =>
    renderPlatformFinanzamtDocument(doc, {
      shopName: platform.shopName,
      platformLines: platform.lines,
      invoiceNumber: invoiceNum,
      periodLabel,
      dateValue: new Date(),
      totals,
      ossByCountry,
      platformVatPercent: platform.vatPercent,
    }),
  )
  return { filename: `Plattformabrechnung-${invoiceNum}.pdf`, content: buf }
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
  buildSellerPayoutPdfBuffer,
  buildPlatformFinanzamtPdfBuffer,
  renderInvoicePdfDocument,
  renderLieferscheinPdfDocument,
  renderRetourenscheinPdfDocument,
  renderVersandlabelPdfDocument,
  renderProvisionsfakturPdfDocument,
  getOrderPdfFilename,
  querySellerInfoForInvoice: _querySellerInfo,
  querySellerInfoForOrderDocuments,
  prepareRetailPdfContext,
  resolveDocumentSellerId,
}
