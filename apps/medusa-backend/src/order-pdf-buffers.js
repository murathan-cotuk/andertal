/**
 * Generate Rechnung / Lieferschein / Provisionsfaktur PDF buffers for nodemailer attachments.
 */

const { resolveOrderPaidTotalCents, orderBonusDiscountCents, orderCouponDiscountCents } = require('./order-money')
const { getOrderPdfStrings, getOrderPdfFilename } = require('./order-pdf-i18n')

const pdfDeLatin = (s) => {
  if (s == null || s === undefined) return ''
  return String(s)
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/Ä/g, 'Ae')
    .replace(/Ö/g, 'Oe')
    .replace(/Ü/g, 'Ue')
    .replace(/ß/g, 'ss')
}

const pdfFmtDate = (d, locale = 'de') => {
  if (!d) return '—'
  const s = getOrderPdfStrings(locale)
  try {
    return new Date(d).toLocaleDateString(s.dateLocale, { day: '2-digit', month: '2-digit', year: 'numeric' })
  } catch (_) {
    return '—'
  }
}

const pdfCents = (c, locale = 'de') => {
  const s = getOrderPdfStrings(locale)
  return (Number(c || 0) / 100).toLocaleString(s.dateLocale, { minimumFractionDigits: 2 }) + s.currencySuffix
}

/** Vendor info block: store_name / company_name / first+last, address, vat_id. */
function resolveSellerDisplayLines(sellerInfo, locale = 'de') {
  if (!sellerInfo) return []
  const s = getOrderPdfStrings(locale)
  const name =
    String(sellerInfo.store_name || '').trim() ||
    String(sellerInfo.company_name || '').trim() ||
    [sellerInfo.first_name, sellerInfo.last_name].filter(Boolean).join(' ').trim()
  const addr = sellerInfo.business_address || {}
  const lines = [name]
  if (addr.street) lines.push(String(addr.street).trim())
  if (addr.address_line1) lines.push(String(addr.address_line1).trim())
  if (addr.zip || addr.postal_code || addr.city) {
    const zip = String(addr.zip || addr.postal_code || '').trim()
    const city = String(addr.city || '').trim()
    if (zip || city) lines.push([zip, city].filter(Boolean).join(' '))
  }
  if (addr.country) lines.push(String(addr.country).trim())
  if (sellerInfo.vat_id) lines.push(`${s.vatIdPrefix}: ${String(sellerInfo.vat_id).trim()}`)
  return lines.filter(Boolean)
}

/**
 * Render customer invoice (Rechnung) into an open PDFKit document.
 * @param {object} sellerInfo - optional, from seller_users row
 * @param {Buffer|null} shopLogoBuffer - optional logo image buffer for header
 */
function renderInvoicePdfDocument(doc, { row, itemRows, orderId, invoiceNumber, shopName, sellerInfo, shopLogoBuffer, locale = 'de' }) {
  const s = getOrderPdfStrings(locale)
  const left = doc.page.margins.left
  const right = doc.page.width - doc.page.margins.right
  const contentWidth = right - left
  const invoiceMetaWidth = 220
  const tableTop = 292
  const tableTitleW = Math.round(contentWidth * 0.54)
  const tableQtyW = 52
  const tableUnitW = 110
  const tableTotalW = contentWidth - tableTitleW - tableQtyW - tableUnitW
  const tableUnitX = right - tableTotalW - tableUnitW
  const tableTotalX = right - tableTotalW
  const customerName = [row.first_name, row.last_name].filter(Boolean).join(' ')
  const billingAddressDifferent = row.billing_same_as_shipping === false && row.billing_address_line1
  const subtotal =
    row.subtotal_cents != null
      ? Number(row.subtotal_cents)
      : itemRows.reduce((sum, it) => sum + Number(it.unit_price_cents || 0) * Number(it.quantity || 1), 0)
  const shipping = Number(row.shipping_cents || 0)
  const discount = Number(row.discount_cents || 0)
  const bonusDisc = orderBonusDiscountCents(row)
  const couponDisc = orderCouponDiscountCents(row)
  const grandTotal = resolveOrderPaidTotalCents(row)
  const ensureY = (minY) => {
    if (doc.y > minY) {
      doc.addPage()
    }
  }

  // Header: logo centered if available, else dark bar with shop name
  const headerH = 60
  if (shopLogoBuffer) {
    doc.rect(left, 24, contentWidth, headerH).fill('#f8fafc')
    try {
      const logoMaxH = 40
      doc.image(shopLogoBuffer, left, 24, { fit: [contentWidth, logoMaxH], align: 'center', valign: 'center' })
    } catch (_) {
      doc.fillColor('#111827').font('Helvetica-Bold').fontSize(16)
        .text(pdfDeLatin(shopName || 'Andertal'), left, 24 + headerH / 2 - 8, { width: contentWidth, align: 'center' })
    }
  } else {
    doc.rect(left, 34, contentWidth, 44).fill('#111827')
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(16)
      .text(pdfDeLatin(shopName || 'Andertal'), left + 14, 49, { width: contentWidth - 28, align: 'left' })
  }

  doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(25).text(s.invoiceTitle, left, 94)
  doc.font('Helvetica').fontSize(10).fillColor('#4b5563').text(`${s.invoiceNoLabel}: ${invoiceNumber}`, right - invoiceMetaWidth, 96, {
    width: invoiceMetaWidth,
    align: 'right',
  })
  doc.text(`${s.dateLabel}: ${pdfFmtDate(row.created_at, locale)}`, right - invoiceMetaWidth, 111, { width: invoiceMetaWidth, align: 'right' })

  doc.fillColor('#111827').font('Helvetica-Bold').fontSize(10).text(s.customerLabel, left, 152)
  doc.font('Helvetica').fontSize(10).fillColor('#1f2937')
  ;[customerName || '—', row.email || null].filter(Boolean).forEach((line) => {
    doc.text(pdfDeLatin(line), left, doc.y + 1)
  })

  const addressTop = 152
  const rightColumnX = left + Math.round(contentWidth / 2) + 8
  doc.font('Helvetica-Bold').fontSize(10).fillColor('#111827').text(s.deliveryAddressLabel, rightColumnX, addressTop)
  doc.font('Helvetica').fontSize(10).fillColor('#1f2937')
  ;[customerName, row.address_line1, row.address_line2, [row.postal_code, row.city].filter(Boolean).join(' '), row.country]
    .filter(Boolean)
    .forEach((line) => doc.text(pdfDeLatin(line), rightColumnX, doc.y + 1))

  if (billingAddressDifferent) {
    const nextY = Math.max(doc.y, 216)
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#111827').text(s.billingAddressLabel, rightColumnX, nextY)
    doc.font('Helvetica').fontSize(10).fillColor('#1f2937')
    ;[
      [row.first_name, row.last_name].filter(Boolean).join(' '),
      row.billing_address_line1,
      row.billing_address_line2,
      [row.billing_postal_code, row.billing_city].filter(Boolean).join(' '),
      row.billing_country,
    ]
      .filter(Boolean)
      .forEach((line) => doc.text(pdfDeLatin(line), rightColumnX, doc.y + 1))
  }

  ensureY(tableTop)
  doc.rect(left, tableTop, contentWidth, 22).fill('#f3f4f6')
  doc.fillColor('#111827').font('Helvetica-Bold').fontSize(9)
  doc.text(s.itemLabel, left + 8, tableTop + 7, { width: tableTitleW - 16 })
  doc.text(s.qtyLabel, left + tableTitleW + 4, tableTop + 7, { width: tableQtyW - 8, align: 'right' })
  doc.text(s.unitPriceLabel, tableUnitX + 4, tableTop + 7, { width: tableUnitW - 8, align: 'right' })
  doc.text(s.totalLabel, tableTotalX + 4, tableTop + 7, { width: tableTotalW - 8, align: 'right' })
  doc.y = tableTop + 27

  const drawItemRow = (it) => {
    const qty = Number(it.quantity || 1)
    const unit = Number(it.unit_price_cents || 0)
    const lineTotal = unit * qty
    const title = pdfDeLatin(it.title || s.itemFallback)
    const titleHeight = doc.heightOfString(title, { width: tableTitleW - 16, align: 'left' })
    const rowHeight = Math.max(20, titleHeight + 8)
    const y = doc.y
    if (y + rowHeight + 120 > doc.page.height - doc.page.margins.bottom) {
      doc.addPage()
      doc.rect(left, doc.page.margins.top, contentWidth, 22).fill('#f3f4f6')
      doc.fillColor('#111827').font('Helvetica-Bold').fontSize(9)
      doc.text(s.itemLabel, left + 8, doc.page.margins.top + 7, { width: tableTitleW - 16 })
      doc.text(s.qtyLabel, left + tableTitleW + 4, doc.page.margins.top + 7, { width: tableQtyW - 8, align: 'right' })
      doc.text(s.unitPriceLabel, tableUnitX + 4, doc.page.margins.top + 7, { width: tableUnitW - 8, align: 'right' })
      doc.text(s.totalLabel, tableTotalX + 4, doc.page.margins.top + 7, { width: tableTotalW - 8, align: 'right' })
      doc.y = doc.page.margins.top + 27
    }
    const rowY = doc.y
    doc.font('Helvetica').fontSize(10).fillColor('#111827').text(title, left + 8, rowY + 4, { width: tableTitleW - 16 })
    doc.text(String(qty), left + tableTitleW + 4, rowY + 4, { width: tableQtyW - 8, align: 'right' })
    doc.text(pdfCents(unit, locale), tableUnitX + 4, rowY + 4, { width: tableUnitW - 8, align: 'right' })
    doc.text(pdfCents(lineTotal, locale), tableTotalX + 4, rowY + 4, { width: tableTotalW - 8, align: 'right' })
    doc.moveTo(left, rowY + rowHeight).lineTo(right, rowY + rowHeight).lineWidth(0.5).strokeColor('#e5e7eb').stroke()
    doc.y = rowY + rowHeight + 2
  }

  if (!itemRows.length) {
    drawItemRow({ title: s.noItems, quantity: 1, unit_price_cents: 0 })
  } else {
    itemRows.forEach(drawItemRow)
  }

  if (doc.y + 180 > doc.page.height - doc.page.margins.bottom) doc.addPage()
  const totalsWidth = 250
  const totalsX = right - totalsWidth
  const drawTotalLine = (label, value, bold = false, color = '#111827') => {
    const y = doc.y
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 11 : 10).fillColor(color)
    doc.text(label, totalsX, y, { width: totalsWidth * 0.55, align: 'left' })
    doc.text(value, totalsX + totalsWidth * 0.55, y, { width: totalsWidth * 0.45, align: 'right' })
    doc.y = y + (bold ? 18 : 16)
  }
  doc.moveDown(0.4)
  drawTotalLine(s.subtotal, pdfCents(subtotal, locale))
  drawTotalLine(s.shipping, shipping > 0 ? pdfCents(shipping, locale) : s.freeShipping)
  const pts = Number(row.bonus_points_redeemed || 0)
  if (bonusDisc > 0) drawTotalLine(s.bonusPoints(pts), `-${pdfCents(bonusDisc, locale)}`)
  const cc = row.coupon_code ? String(row.coupon_code).trim() : ''
  if (couponDisc > 0) drawTotalLine(cc ? `${s.coupon} (${pdfDeLatin(cc)})` : s.coupon, `-${pdfCents(couponDisc, locale)}`)
  const remainder = Math.max(0, discount - bonusDisc - couponDisc)
  if (remainder > 0) drawTotalLine(s.discount, `-${pdfCents(remainder, locale)}`)
  doc.moveTo(totalsX, doc.y).lineTo(right, doc.y).lineWidth(1).strokeColor('#d1d5db').stroke()
  doc.y += 4
  drawTotalLine(s.grandTotal, pdfCents(grandTotal, locale), true)

  // VAT breakdown (extracted from gross price)
  doc.y += 4
  const sellerVatId = sellerInfo?.vat_id ? String(sellerInfo.vat_id).trim() : ''
  if (sellerVatId) {
    const vatCents = Math.round(grandTotal * 19 / 119)
    const netCents = grandTotal - vatCents
    drawTotalLine(s.vatIncluded, pdfCents(vatCents, locale), false, '#6b7280')
    drawTotalLine(s.netAmount, pdfCents(netCents, locale), false, '#6b7280')
  } else {
    doc.font('Helvetica').fontSize(8.5).fillColor('#6b7280')
    doc.text(
      pdfDeLatin(s.vatExempt),
      totalsX,
      doc.y,
      { width: totalsWidth, align: 'left' },
    )
    doc.y += 14
  }

  // Seller info block
  const sellerLines = resolveSellerDisplayLines(sellerInfo, locale)
  if (sellerLines.length) {
    doc.y += 10
    const sellerBlockY = doc.y
    if (sellerBlockY + sellerLines.length * 13 + 40 > doc.page.height - doc.page.margins.bottom) {
      doc.addPage()
    }
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#374151').text(s.sellerLabel, left, doc.y)
    doc.font('Helvetica').fontSize(9).fillColor('#4b5563')
    sellerLines.forEach((line) => {
      doc.text(pdfDeLatin(line), left, doc.y + 2)
    })
    doc.y += 6
    doc.font('Helvetica').fontSize(8.5).fillColor('#6b7280')
    doc.text(
      pdfDeLatin(s.sellerDisclaimer),
      left,
      doc.y,
      { width: contentWidth, align: 'left' },
    )
  }

  // Footer
  doc.font('Helvetica').fontSize(8.5).fillColor('#6b7280')
  doc.text(
    pdfDeLatin(s.invoiceFooter),
    left,
    doc.page.height - doc.page.margins.bottom - 22,
    { width: contentWidth, align: 'left' },
  )
}

/**
 * Render a commission invoice (Provisionsfaktur) from the platform to the seller.
 * @param {object} doc - PDFKit document
 * @param {object} opts
 * @param {object} opts.order - order row from store_orders
 * @param {object} opts.sellerInfo - seller_users row
 * @param {string} opts.shopName - platform display name
 * @param {number} opts.commissionCents - commission amount in cents (integer)
 * @param {number} opts.commissionRatePct - commission rate as percentage (e.g. 12 for 12%)
 * @param {string} [opts.platformAddress] - platform address from env
 * @param {string} [opts.platformVatId] - platform VAT ID from env
 * @param {number} [opts.platformVatPercent] - 0 or 19 (default 0 = Kleinunternehmer)
 */
function renderProvisionsfakturPdfDocument(doc, { order, sellerInfo, shopName, commissionCents, commissionRatePct, platformAddress, platformVatId, platformVatPercent }) {
  const left = doc.page.margins.left
  const right = doc.page.width - doc.page.margins.right
  const contentWidth = right - left
  const vatPercent = Number(platformVatPercent || 0)
  const useVat = vatPercent > 0
  const vatCents = useVat ? Math.round(commissionCents * vatPercent / 100) : 0
  const totalCents = commissionCents + vatCents
  const on = order.order_number != null ? String(order.order_number) : String(order.id || '').slice(0, 8)
  const invoiceNumber = `PROV-${on}`
  const rateLabel = Number.isFinite(commissionRatePct) ? `${commissionRatePct}%` : ''

  // Header bar
  doc.rect(left, 34, contentWidth, 44).fill('#111827')
  doc
    .fillColor('#ffffff')
    .font('Helvetica-Bold')
    .fontSize(16)
    .text(pdfDeLatin(shopName || 'Andertal'), left + 14, 49, { width: contentWidth - 28, align: 'left' })

  // Title
  const invoiceMetaWidth = 220
  doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(22).text('PROVISIONSFAKTUR', left, 94)
  doc.font('Helvetica').fontSize(10).fillColor('#4b5563')
  doc.text(`Rechnungs-Nr.: ${invoiceNumber}`, right - invoiceMetaWidth, 96, { width: invoiceMetaWidth, align: 'right' })
  doc.text(`Datum: ${pdfFmtDate(order.created_at)}`, right - invoiceMetaWidth, 111, { width: invoiceMetaWidth, align: 'right' })
  doc.text(`Bezug: Bestellung #${on}`, right - invoiceMetaWidth, 126, { width: invoiceMetaWidth, align: 'right' })

  // Two-column: Empfänger (seller) | Aussteller (platform)
  const colW = Math.round(contentWidth / 2) - 8
  const rightColX = left + colW + 16

  doc.font('Helvetica-Bold').fontSize(10).fillColor('#111827').text('EMPFAENGER (VERKAEUFER)', left, 158)
  doc.font('Helvetica').fontSize(10).fillColor('#1f2937')
  resolveSellerDisplayLines(sellerInfo).forEach((line) => {
    doc.text(pdfDeLatin(line), left, doc.y + 1)
  })

  doc.font('Helvetica-Bold').fontSize(10).fillColor('#111827').text('AUSSTELLER', rightColX, 158)
  doc.font('Helvetica').fontSize(10).fillColor('#1f2937')
  doc.text(pdfDeLatin(shopName || 'Andertal Marktplatz'), rightColX, doc.y + 1)
  if (platformAddress) {
    String(platformAddress).split(/[,\n]/).map(s => s.trim()).filter(Boolean).forEach((line) => {
      doc.text(pdfDeLatin(line), rightColX, doc.y + 1)
    })
  }
  if (platformVatId) {
    doc.text(`USt-IdNr.: ${pdfDeLatin(String(platformVatId))}`, rightColX, doc.y + 1)
  } else if (!useVat) {
    doc.font('Helvetica').fontSize(8.5).fillColor('#6b7280')
    doc.text(pdfDeLatin('Kleinunternehmer gem. §19 UStG'), rightColX, doc.y + 1)
    doc.font('Helvetica').fontSize(10).fillColor('#1f2937')
  }

  // Table header
  const tableTop = Math.max(doc.y + 20, 280)
  const tableTitleW = Math.round(contentWidth * 0.54)
  const tableQtyW = 52
  const tableUnitW = 110
  const tableTotalW = contentWidth - tableTitleW - tableQtyW - tableUnitW
  const tableUnitX = right - tableTotalW - tableUnitW
  const tableTotalX = right - tableTotalW

  doc.rect(left, tableTop, contentWidth, 22).fill('#f3f4f6')
  doc.fillColor('#111827').font('Helvetica-Bold').fontSize(9)
  doc.text('LEISTUNGSBESCHREIBUNG', left + 8, tableTop + 7, { width: tableTitleW - 16 })
  doc.text('MENGE', left + tableTitleW + 4, tableTop + 7, { width: tableQtyW - 8, align: 'right' })
  doc.text('EINZELPREIS', tableUnitX + 4, tableTop + 7, { width: tableUnitW - 8, align: 'right' })
  doc.text('BETRAG', tableTotalX + 4, tableTop + 7, { width: tableTotalW - 8, align: 'right' })
  doc.y = tableTop + 27

  // Commission line item
  const commDesc = `Marktplatzprovision fuer Bestellung #${on}${rateLabel ? ` (${rateLabel})` : ''}`
  const rowY = doc.y
  doc.font('Helvetica').fontSize(10).fillColor('#111827')
  doc.text(pdfDeLatin(commDesc), left + 8, rowY + 4, { width: tableTitleW - 16 })
  doc.text('1', left + tableTitleW + 4, rowY + 4, { width: tableQtyW - 8, align: 'right' })
  doc.text(pdfCents(commissionCents), tableUnitX + 4, rowY + 4, { width: tableUnitW - 8, align: 'right' })
  doc.text(pdfCents(commissionCents), tableTotalX + 4, rowY + 4, { width: tableTotalW - 8, align: 'right' })
  const rowH = 28
  doc.moveTo(left, rowY + rowH).lineTo(right, rowY + rowH).lineWidth(0.5).strokeColor('#e5e7eb').stroke()
  doc.y = rowY + rowH + 8

  // Totals
  const totalsWidth = 250
  const totalsX = right - totalsWidth
  const drawLine = (label, value, bold = false, color = '#111827') => {
    const y = doc.y
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 11 : 10).fillColor(color)
    doc.text(label, totalsX, y, { width: totalsWidth * 0.55, align: 'left' })
    doc.text(value, totalsX + totalsWidth * 0.55, y, { width: totalsWidth * 0.45, align: 'right' })
    doc.y = y + (bold ? 18 : 16)
  }

  drawLine('Nettobetrag', pdfCents(commissionCents))
  if (useVat) {
    drawLine(`${vatPercent}% MwSt.`, pdfCents(vatCents))
  }
  doc.moveTo(totalsX, doc.y).lineTo(right, doc.y).lineWidth(1).strokeColor('#d1d5db').stroke()
  doc.y += 4
  drawLine('Rechnungsbetrag', pdfCents(totalCents), true)

  // Legal notices
  doc.y += 14
  doc.font('Helvetica').fontSize(8.5).fillColor('#6b7280')
  if (!useVat && !platformVatId) {
    doc.text(
      pdfDeLatin('Gemaess §19 UStG wird keine Umsatzsteuer berechnet (Kleinunternehmerregelung).'),
      left, doc.y, { width: contentWidth },
    )
    doc.y += 12
  }
  doc.text(
    pdfDeLatin('Diese Provisionsrechnung wird automatisch fuer die erbrachte Vermittlungsleistung des Marktplatzes ausgestellt. Der genannte Betrag wird gemaess den Verkaeufer-AGB verrechnet.'),
    left, doc.y, { width: contentWidth },
  )
}

function renderLieferscheinPdfDocument(doc, { row, itemRows, invoiceNumber, shopName, shopLogoBuffer, locale = 'de' }) {
  const s = getOrderPdfStrings(locale)
  const on = invoiceNumber
  const left = doc.page.margins.left
  const right = doc.page.width - doc.page.margins.right
  const contentWidth = right - left
  const custName = [row.first_name, row.last_name].filter(Boolean).join(' ')

  // ── Header ──────────────────────────────────────────────────────────────
  const headerH = 56
  doc.rect(left, 30, contentWidth, headerH).fill('#1e293b')
  if (shopLogoBuffer) {
    try {
      doc.image(shopLogoBuffer, left + 12, 34, { fit: [160, 46], valign: 'center' })
    } catch (_) {
      doc.fillColor('#fff').font('Helvetica-Bold').fontSize(14)
        .text(pdfDeLatin(shopName || 'Andertal'), left + 14, 48, { width: 180 })
    }
  } else {
    doc.fillColor('#fff').font('Helvetica-Bold').fontSize(14)
      .text(pdfDeLatin(shopName || 'Andertal'), left + 14, 48, { width: 180 })
  }
  doc.fillColor('#94a3b8').font('Helvetica').fontSize(8)
    .text(s.deliveryTitle, right - 120, 42, { width: 120, align: 'right' })
  doc.fillColor('#fff').font('Helvetica-Bold').fontSize(11)
    .text(pdfDeLatin(`Nr. ${on}`), right - 120, 54, { width: 120, align: 'right' })

  // ── Meta strip ──────────────────────────────────────────────────────────
  doc.rect(left, 30 + headerH, contentWidth, 22).fill('#f1f5f9')
  doc.fillColor('#374151').font('Helvetica').fontSize(8.5)
  doc.text(`${s.dateLabel}: ${pdfFmtDate(row.created_at, locale)}`, left + 8, 30 + headerH + 7)
  if (row.carrier_name) doc.text(pdfDeLatin(`${s.shippingSection}: ${row.carrier_name}`), left + 130, 30 + headerH + 7)
  if (row.tracking_number) doc.text(`${s.trackingLabel}: ${pdfDeLatin(String(row.tracking_number))}`, left + 280, 30 + headerH + 7)

  // ── Two-column address block ─────────────────────────────────────────────
  const blockTop = 30 + headerH + 34
  const colW = Math.round(contentWidth / 2) - 12
  const col2X = left + colW + 24

  // Left: delivery address
  doc.rect(left, blockTop, colW, 110).fill('#f8fafc').stroke('#e2e8f0')
  doc.fillColor('#64748b').font('Helvetica-Bold').fontSize(7.5)
    .text(s.deliveryAddressLabel, left + 10, blockTop + 10, { width: colW - 20, characterSpacing: 0.5 })
  doc.fillColor('#111827').font('Helvetica-Bold').fontSize(10)
    .text(pdfDeLatin(custName || '—'), left + 10, blockTop + 24)
  doc.font('Helvetica').fontSize(9.5).fillColor('#374151')
  ;[row.address_line1, row.address_line2, [row.postal_code, row.city].filter(Boolean).join(' '), row.country]
    .filter(Boolean)
    .forEach((line) => { doc.text(pdfDeLatin(line), left + 10, doc.y + 1, { width: colW - 20 }) })

  // Right: order info
  doc.rect(col2X, blockTop, colW, 110).fill('#f8fafc').stroke('#e2e8f0')
  doc.fillColor('#64748b').font('Helvetica-Bold').fontSize(7.5)
    .text(s.orderInfoLabel, col2X + 10, blockTop + 10, { width: colW - 20, characterSpacing: 0.5 })
  const infoLines = [
    row.email ? `${s.emailLabel}: ${pdfDeLatin(row.email)}` : null,
    row.phone ? `${s.phoneLabel}: ${pdfDeLatin(String(row.phone))}` : null,
  ].filter(Boolean)
  doc.fillColor('#374151').font('Helvetica').fontSize(9.5)
  let infoY = blockTop + 24
  infoLines.forEach((l) => { doc.text(pdfDeLatin(l), col2X + 10, infoY, { width: colW - 20 }); infoY += 15 })

  // ── Article table ────────────────────────────────────────────────────────
  const tableTop = blockTop + 124
  doc.rect(left, tableTop, contentWidth, 20).fill('#1e293b')
  doc.fillColor('#fff').font('Helvetica-Bold').fontSize(8.5)
  const qW = 48, prW = 100
  doc.text(s.itemLabel, left + 8, tableTop + 6, { width: contentWidth - qW - prW - 16 })
  doc.text(s.qtyLabel, right - qW - prW, tableTop + 6, { width: qW, align: 'right' })
  doc.text(s.unitPriceLabel, right - prW, tableTop + 6, { width: prW - 4, align: 'right' })
  doc.y = tableTop + 24

  const rows2 = itemRows.length ? itemRows : [{ title: s.noItems, quantity: 1, unit_price_cents: 0 }]
  rows2.forEach((it, idx) => {
    const qty = Number(it.quantity || 1)
    const unit = Number(it.unit_price_cents || 0)
    const title = pdfDeLatin(it.title || s.itemFallback)
    const h = Math.max(18, doc.heightOfString(title, { width: contentWidth - qW - prW - 20 }) + 8)
    const y = doc.y
    if (idx % 2 === 1) doc.rect(left, y, contentWidth, h).fill('#f8fafc')
    doc.fillColor('#111827').font('Helvetica').fontSize(9.5)
      .text(title, left + 8, y + 4, { width: contentWidth - qW - prW - 16 })
    doc.text(String(qty), right - qW - prW, y + 4, { width: qW, align: 'right' })
    doc.text(pdfCents(unit, locale), right - prW, y + 4, { width: prW - 4, align: 'right' })
    doc.moveTo(left, y + h).lineTo(right, y + h).lineWidth(0.4).strokeColor('#e2e8f0').stroke()
    doc.y = y + h
  })

  // ── Footer note ─────────────────────────────────────────────────────────
  doc.y += 12
  doc.rect(left, doc.y, contentWidth, 26).fill('#f1f5f9')
  doc.fillColor('#64748b').font('Helvetica').fontSize(8)
    .text(pdfDeLatin(s.deliveryFooter), left + 8, doc.y + 9, { width: contentWidth - 16 })
}

function pdfDocToBuffer(renderFn) {
  const PDFDocument = require('pdfkit')
  return new Promise((resolve, reject) => {
    const chunks = []
    const doc = new PDFDocument({ margin: 42, size: 'A4', compress: false, pdfVersion: '1.7' })
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

function lieferscheinDocToBuffer(renderFn) {
  const PDFDocument = require('pdfkit')
  return new Promise((resolve, reject) => {
    const chunks = []
    const doc = new PDFDocument({ margin: 48, size: 'A4' })
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
  const buf = await lieferscheinDocToBuffer((doc) =>
    renderLieferscheinPdfDocument(doc, { row, itemRows, invoiceNumber: on, shopName, shopLogoBuffer, locale }),
  )
  return { filename: getOrderPdfFilename('lieferschein', on, locale), content: buf }
}

/**
 * Build a commission invoice (Provisionsfaktur) PDF buffer for a given order.
 * Uses SHOP_INVOICE_NAME, PLATFORM_INVOICE_ADDRESS, PLATFORM_VAT_ID, PLATFORM_VAT_PERCENT env vars.
 */
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

  // Commission amount: prefer stored stripe_application_fee_cents, fall back to 12% of subtotal
  const storedFee = Number(order.stripe_application_fee_cents)
  const subtotal = Number(order.subtotal_cents || order.total_cents || 0)
  const commissionCents = Number.isFinite(storedFee) && storedFee > 0
    ? storedFee
    : Math.round(subtotal * 0.12)

  // Commission rate for display (approximate from stored values)
  let commissionRatePct = null
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

/**
 * @param {*} pgClient connected pg client
 * @param {string} orderId uuid
 * @param {string[]} keys subset of invoice_pdf | lieferschein_pdf
 * @returns {Promise<{ filename: string, content: Buffer }[]>}
 */
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
