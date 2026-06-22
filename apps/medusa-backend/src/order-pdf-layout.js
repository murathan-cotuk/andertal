/**
 * Shared PDF layout for retail order documents (invoice + delivery note).
 * Commission invoices use a separate visual system.
 */

const { getOrderPdfStrings } = require('./order-pdf-i18n')

const RETAIL_ACCENT = '#2d6a6a'
const RETAIL_MUTED = '#64748b'
const RETAIL_BORDER = '#cbd5e1'
const COMMISSION_ACCENT = '#6d28d9'
const COMMISSION_ACCENT_DARK = '#4c1d95'
const COMMISSION_BG = '#f5f3ff'
const COMMISSION_BORDER = '#ddd6fe'

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

function pageMetrics(doc) {
  const left = doc.page.margins.left
  const right = doc.page.width - doc.page.margins.right
  const contentWidth = right - left
  return { left, right, contentWidth }
}

function drawDottedLine(doc, y) {
  const { left, right } = pageMetrics(doc)
  doc.save()
  doc.dash(1.5, { space: 2.5 })
  doc.moveTo(left, y).lineTo(right, y).strokeColor(RETAIL_BORDER).lineWidth(0.6).stroke()
  doc.undash()
  doc.restore()
}

function drawLogoTopLeft(doc, shopLogoBuffer, shopName, topY) {
  const { left } = pageMetrics(doc)
  const maxW = 132
  const maxH = 46
  if (shopLogoBuffer) {
    try {
      doc.image(shopLogoBuffer, left, topY, { fit: [maxW, maxH], align: 'left', valign: 'top' })
      return topY + maxH + 14
    } catch (_) {
      /* fall through */
    }
  }
  doc.fillColor(RETAIL_ACCENT).font('Helvetica-Bold').fontSize(15)
  doc.text(pdfDeLatin(shopName || 'Andertal'), left, topY, { width: maxW })
  return topY + 24
}

function drawBlockLabel(doc, label, x, y, width) {
  doc.fillColor(RETAIL_MUTED).font('Helvetica-Bold').fontSize(7.5)
  doc.text(pdfDeLatin(label), x, y, { width, characterSpacing: 0.4 })
}

function drawBlockLines(doc, lines, x, y, width, opts = {}) {
  const { boldFirst = true, fontSize = 9.5 } = opts
  let cy = y
  lines.forEach((line, idx) => {
    if (!line) return
    doc.font(idx === 0 && boldFirst ? 'Helvetica-Bold' : 'Helvetica')
      .fontSize(idx === 0 && boldFirst ? 10 : fontSize)
      .fillColor('#1f2937')
    doc.text(pdfDeLatin(line), x, cy, { width })
    cy = doc.y + 2
  })
  return cy
}

/**
 * Raaka-style retail document shell (invoice + delivery note).
 */
function renderRetailOrderDocument(doc, {
  docTitle,
  docNumber,
  row,
  itemRows = [],
  shopName,
  sellerInfo,
  shopLogoBuffer,
  locale = 'de',
  kind = 'invoice',
  lineItems = [],
  totalsLines = [],
  amountDueCents = null,
  footerText = '',
}) {
  const s = getOrderPdfStrings(locale)
  const { left, right, contentWidth } = pageMetrics(doc)
  const rightColW = 200
  const rightColX = right - rightColW

  const afterLogoY = drawLogoTopLeft(doc, shopLogoBuffer, shopName, 36)

  // Seller block — top right
  const sellerLines = resolveSellerDisplayLines(sellerInfo, locale)
  drawBlockLabel(doc, s.sellerLabel, rightColX, 38, rightColW)
  drawBlockLines(doc, sellerLines.length ? sellerLines : [shopName || 'Andertal'], rightColX, 50, rightColW, { boldFirst: true, fontSize: 9 })

  // Title + meta (left)
  const titleY = Math.max(afterLogoY, 88)
  doc.fillColor(RETAIL_ACCENT).font('Helvetica-Bold').fontSize(28)
  doc.text(pdfDeLatin(docTitle), left, titleY, { width: contentWidth - rightColW - 20 })

  doc.fillColor('#334155').font('Helvetica').fontSize(10)
  let metaY = titleY + 36
  doc.text(pdfDeLatin(docNumber), left, metaY)
  metaY += 14
  doc.text(`${s.issueDateLabel}: ${pdfFmtDate(row.created_at, locale)}`, left, metaY)
  metaY += 14
  if (kind === 'invoice') {
    doc.text(`${s.deliveryDateLabel}: ${pdfFmtDate(row.shipped_at || row.created_at, locale)}`, left, metaY)
    metaY += 14
  }
  if (row.payment_method || row.checkout_payment_kind) {
    doc.text(`${s.paymentMethodLabel}: ${pdfDeLatin(String(row.payment_method || row.checkout_payment_kind))}`, left, metaY)
    metaY += 14
  }

  const customerName = [row.first_name, row.last_name].filter(Boolean).join(' ')
  const billingDifferent = row.billing_same_as_shipping === false && row.billing_address_line1

  const columnsTop = Math.max(metaY, doc.y, 168) + 18
  drawDottedLine(doc, columnsTop - 8)

  const colGap = 14
  const colW = Math.floor((contentWidth - colGap * 2) / 3)
  const col2X = left + colW + colGap
  const col3X = left + (colW + colGap) * 2

  // Column 1 — Customer
  drawBlockLabel(doc, s.customerLabel, left, columnsTop, colW)
  const customerLines = [customerName || '—', row.email].filter(Boolean)
  let colBottom = drawBlockLines(doc, customerLines, left, columnsTop + 14, colW)

  // Column 2 — Shipping
  drawBlockLabel(doc, s.deliveryAddressLabel, col2X, columnsTop, colW)
  const shipLines = [
    customerName,
    row.address_line1,
    row.address_line2,
    [row.postal_code, row.city].filter(Boolean).join(' '),
    row.country,
  ].filter(Boolean)
  colBottom = Math.max(colBottom, drawBlockLines(doc, shipLines, col2X, columnsTop + 14, colW))

  // Column 3 — Billing or order info
  if (billingDifferent) {
    drawBlockLabel(doc, s.billingAddressLabel, col3X, columnsTop, colW)
    const billLines = [
      customerName,
      row.billing_address_line1,
      row.billing_address_line2,
      [row.billing_postal_code, row.billing_city].filter(Boolean).join(' '),
      row.billing_country,
    ].filter(Boolean)
    colBottom = Math.max(colBottom, drawBlockLines(doc, billLines, col3X, columnsTop + 14, colW))
  } else {
    drawBlockLabel(doc, s.orderInfoLabel, col3X, columnsTop, colW)
    const infoLines = [
      row.email ? `${s.emailLabel}: ${row.email}` : null,
      row.phone ? `${s.phoneLabel}: ${row.phone}` : null,
      row.tracking_number ? `${s.trackingLabel}: ${row.tracking_number}` : null,
      row.carrier_name ? `${s.shippingSection}: ${row.carrier_name}` : null,
    ].filter(Boolean)
    colBottom = Math.max(colBottom, drawBlockLines(doc, infoLines, col3X, columnsTop + 14, colW, { boldFirst: false }))
  }

  const tableTop = colBottom + 20
  drawDottedLine(doc, tableTop - 6)

  const descW = Math.round(contentWidth * 0.46)
  const qtyW = 44
  const unitW = kind === 'invoice' ? 88 : 0
  const totalW = kind === 'invoice' ? contentWidth - descW - qtyW - unitW : contentWidth - descW - qtyW
  const qtyX = left + descW
  const unitX = qtyX + qtyW
  const totalX = kind === 'invoice' ? unitX + unitW : qtyX + qtyW

  doc.rect(left, tableTop, contentWidth, 20).fill(RETAIL_ACCENT)
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8)
  doc.text(s.itemLabel, left + 8, tableTop + 6, { width: descW - 12 })
  doc.text(s.qtyLabel, qtyX, tableTop + 6, { width: qtyW - 4, align: 'right' })
  if (kind === 'invoice') {
    doc.text(s.unitPriceLabel, unitX, tableTop + 6, { width: unitW - 4, align: 'right' })
    doc.text(s.totalLabel, totalX, tableTop + 6, { width: totalW - 4, align: 'right' })
  }
  doc.y = tableTop + 24

  const rows = lineItems.length ? lineItems : itemRows
  const drawRows = rows.length ? rows : [{ title: s.noItems, quantity: 1, unit_price_cents: 0 }]

  drawRows.forEach((it, idx) => {
    const qty = Number(it.quantity || 1)
    const unit = Number(it.unit_price_cents || 0)
    const lineTotal = unit * qty
    const title = pdfDeLatin(it.title || s.itemFallback)
    const titleH = doc.heightOfString(title, { width: descW - 12 })
    const rowH = Math.max(22, titleH + 10)
    const y = doc.y

    if (y + rowH > doc.page.height - doc.page.margins.bottom - 140) {
      doc.addPage()
      doc.y = doc.page.margins.top
    }

    const rowY = doc.y
    if (idx % 2 === 1) doc.rect(left, rowY, contentWidth, rowH).fill('#f8fafc')
    doc.font('Helvetica').fontSize(9.5).fillColor('#111827')
    doc.text(title, left + 8, rowY + 5, { width: descW - 12 })
    doc.text(String(qty), qtyX, rowY + 5, { width: qtyW - 4, align: 'right' })
    if (kind === 'invoice') {
      doc.text(pdfCents(unit, locale), unitX, rowY + 5, { width: unitW - 4, align: 'right' })
      doc.text(pdfCents(lineTotal, locale), totalX, rowY + 5, { width: totalW - 4, align: 'right' })
    }
    doc.moveTo(left, rowY + rowH).lineTo(right, rowY + rowH).lineWidth(0.4).strokeColor('#e2e8f0').stroke()
    doc.y = rowY + rowH
  })

  if (kind === 'invoice' && totalsLines.length) {
    if (doc.y + 120 > doc.page.height - doc.page.margins.bottom) doc.addPage()
    const totalsW = 240
    const totalsX = right - totalsW
    doc.y += 10

    totalsLines.forEach(({ label, value, bold, color }) => {
      const y = doc.y
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 11 : 10).fillColor(color || '#111827')
      doc.text(pdfDeLatin(label), totalsX, y, { width: totalsW * 0.58, align: 'left' })
      doc.text(pdfDeLatin(value), totalsX + totalsW * 0.58, y, { width: totalsW * 0.42, align: 'right' })
      doc.y = y + (bold ? 18 : 15)
    })

    if (amountDueCents != null) {
      const boxY = doc.y + 6
      const boxH = 30
      doc.rect(totalsX, boxY, totalsW, boxH).fill(RETAIL_ACCENT)
      doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(10)
      doc.text(s.amountDueLabel, totalsX + 10, boxY + 9, { width: totalsW * 0.5 })
      doc.text(pdfCents(amountDueCents, locale), totalsX + totalsW * 0.45, boxY + 8, { width: totalsW * 0.5, align: 'right' })
      doc.y = boxY + boxH + 10
    }
  }

  // Seller disclaimer + footer
  doc.font('Helvetica').fontSize(8.5).fillColor(RETAIL_MUTED)
  const footerY = Math.max(doc.y + 16, doc.page.height - doc.page.margins.bottom - 48)
  if (sellerLines.length) {
    doc.text(pdfDeLatin(s.sellerDisclaimer), left, footerY - 28, { width: contentWidth })
  }
  doc.text(pdfDeLatin(footerText || (kind === 'invoice' ? s.invoiceFooter : s.deliveryFooter)), left, footerY, { width: contentWidth })

  // Bottom accent bar
  doc.rect(left, doc.page.height - doc.page.margins.bottom + 8, contentWidth, 3).fill(RETAIL_ACCENT)
}

/**
 * Commission invoice — visually distinct summary layout.
 */
function renderCommissionInvoiceDocument(doc, {
  order,
  sellerInfo,
  shopName,
  commissionCents,
  commissionRatePct = 12,
  grossSalesCents,
  payoutCents,
  platformAddress,
  platformVatId,
  platformVatPercent = 0,
  invoiceNumber,
  periodLabel = null,
}) {
  const { left, right, contentWidth } = pageMetrics(doc)
  const on = order.order_number != null ? String(order.order_number) : String(order.id || '').slice(0, 8)
  const rate = Number.isFinite(commissionRatePct) ? commissionRatePct : 12
  const gross = Number(grossSalesCents || 0)
  const commission = Number(commissionCents || 0)
  const payout = Number.isFinite(payoutCents) ? Number(payoutCents) : Math.max(0, gross - commission)
  const vatPercent = Number(platformVatPercent || 0)
  const vatOnCommission = vatPercent > 0 ? Math.round(commission * vatPercent / 100) : 0
  const commissionTotal = commission + vatOnCommission

  // Header band
  doc.rect(left, 32, contentWidth, 52).fill(COMMISSION_ACCENT)
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(11)
  doc.text(pdfDeLatin(shopName || 'Andertal Marktplatz'), left + 14, 44)
  doc.font('Helvetica').fontSize(9).fillColor('#e9d5ff')
  doc.text('PLATFORM COMMISSION INVOICE', left + 14, 58)
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(16)
  doc.text('PROVISIONSFAKTUR', right - 220, 46, { width: 206, align: 'right' })
  doc.font('Helvetica').fontSize(9).fillColor('#e9d5ff')
  doc.text(pdfDeLatin(invoiceNumber || `PROV-${on}`), right - 220, 64, { width: 206, align: 'right' })

  let y = 100
  doc.fillColor('#334155').font('Helvetica').fontSize(9.5)
  doc.text(`Datum: ${pdfFmtDate(order.created_at)}`, left, y)
  y += 14
  doc.text(`Bezug Bestellung: #${on}`, left, y)
  y += 14
  if (periodLabel) {
    doc.text(`Abrechnungszeitraum: ${pdfDeLatin(periodLabel)}`, left, y)
    y += 14
  }

  // Two columns: seller | platform
  const colW = Math.floor((contentWidth - 20) / 2)
  const col2X = left + colW + 20
  const boxTop = y + 10

  doc.rect(left, boxTop, colW, 96).fill(COMMISSION_BG).stroke(COMMISSION_BORDER)
  drawBlockLabel(doc, 'RECHNUNGSEMPFAENGER (VERKAEUFER)', left + 10, boxTop + 10, colW - 20)
  drawBlockLines(doc, resolveSellerDisplayLines(sellerInfo), left + 10, boxTop + 24, colW - 20)

  doc.rect(col2X, boxTop, colW, 96).fill('#fafafa').stroke(COMMISSION_BORDER)
  drawBlockLabel(doc, 'AUSSTELLER (PLATTFORM)', col2X + 10, boxTop + 10, colW - 20)
  const platformLines = [shopName || 'Andertal Marktplatz']
  if (platformAddress) {
    String(platformAddress).split(/[,\n]/).map((x) => x.trim()).filter(Boolean).forEach((l) => platformLines.push(l))
  }
  if (platformVatId) platformLines.push(`USt-IdNr.: ${platformVatId}`)
  drawBlockLines(doc, platformLines, col2X + 10, boxTop + 24, colW - 20)

  // Summary cards
  const cardsTop = boxTop + 112
  const cardW = Math.floor((contentWidth - 24) / 3)
  const cards = [
    { label: 'BRUTTOUMSATZ (VERKAEUFER)', value: pdfCents(gross), sub: 'Summe der Warenverkaeufe' },
    { label: `PROVISION (${rate}%)`, value: pdfCents(commission), sub: 'Marktplatzgebuehr' },
    { label: 'AUSZAHLUNG AN VERKAEUFER', value: pdfCents(payout), sub: 'Netto nach Provision' },
  ]
  cards.forEach((card, i) => {
    const x = left + i * (cardW + 12)
    doc.rect(x, cardsTop, cardW, 72).fill(i === 1 ? COMMISSION_ACCENT : '#ffffff').stroke(COMMISSION_BORDER)
    const labelColor = i === 1 ? '#e9d5ff' : '#64748b'
    const valueColor = i === 1 ? '#ffffff' : COMMISSION_ACCENT_DARK
    doc.fillColor(labelColor).font('Helvetica-Bold').fontSize(7)
    doc.text(card.label, x + 10, cardsTop + 10, { width: cardW - 20 })
    doc.fillColor(valueColor).font('Helvetica-Bold').fontSize(16)
    doc.text(card.value, x + 10, cardsTop + 28, { width: cardW - 20 })
    doc.fillColor(i === 1 ? '#ddd6fe' : '#64748b').font('Helvetica').fontSize(7.5)
    doc.text(card.sub, x + 10, cardsTop + 52, { width: cardW - 20 })
  })

  // Detail table
  const tableTop = cardsTop + 90
  doc.fillColor(COMMISSION_ACCENT_DARK).font('Helvetica-Bold').fontSize(11)
  doc.text('ABRECHNUNGSDETAILS', left, tableTop)

  const tTop = tableTop + 18
  const labelW = Math.round(contentWidth * 0.62)
  doc.rect(left, tTop, contentWidth, 18).fill(COMMISSION_ACCENT)
  doc.fillColor('#fff').font('Helvetica-Bold').fontSize(8)
  doc.text('BESCHREIBUNG', left + 8, tTop + 5, { width: labelW - 12 })
  doc.text('BETRAG', left + labelW, tTop + 5, { width: contentWidth - labelW - 8, align: 'right' })

  const detailRows = [
    { label: `Warenverkaeufe (Bestellung #${on})`, amount: gross },
    { label: `Abzug Marktplatzprovision (${rate}%)`, amount: -commission },
    { label: 'Auszahlung an Verkaeufer (netto)', amount: payout },
  ]
  let rowY = tTop + 22
  detailRows.forEach((r, idx) => {
    const h = 22
    if (idx % 2 === 0) doc.rect(left, rowY, contentWidth, h).fill('#fafafa')
    doc.fillColor('#1f2937').font('Helvetica').fontSize(9.5)
    doc.text(pdfDeLatin(r.label), left + 8, rowY + 6, { width: labelW - 12 })
    const prefix = r.amount < 0 ? '-' : ''
    doc.text(prefix + pdfCents(Math.abs(r.amount)), left + labelW, rowY + 6, { width: contentWidth - labelW - 8, align: 'right' })
    rowY += h
  })

  // Commission due box
  const dueY = rowY + 14
  const dueW = 260
  const dueX = right - dueW
  doc.rect(dueX, dueY, dueW, 26).fill(COMMISSION_ACCENT)
  doc.fillColor('#fff').font('Helvetica-Bold').fontSize(10)
  let dueLabel = 'PROVISION FAELLIG'
  if (vatOnCommission > 0) dueLabel = `PROVISION INKL. ${vatPercent}% MwSt.`
  doc.text(dueLabel, dueX + 10, dueY + 8, { width: dueW * 0.55 })
  doc.text(pdfCents(commissionTotal), dueX + dueW * 0.5, dueY + 7, { width: dueW * 0.45, align: 'right' })

  doc.y = dueY + 40
  doc.fillColor('#64748b').font('Helvetica').fontSize(8.5)
  doc.text(
    pdfDeLatin(
      'Diese Provisionsrechnung dokumentiert den Umsatz der Bestellung, die einbehaltene Marktplatzprovision (12%) und die Nettoauszahlung an den Verkaeufer. Der Provisionbetrag wird gemaess den Verkaeufer-AGB verrechnet.',
    ),
    left,
    doc.y,
    { width: contentWidth },
  )
  if (!platformVatId && vatPercent === 0) {
    doc.text(pdfDeLatin('Gemaess §19 UStG wird keine Umsatzsteuer auf die Provision berechnet, sofern anwendbar.'), left, doc.y + 4, { width: contentWidth })
  }

  doc.rect(left, doc.page.height - doc.page.margins.bottom + 8, contentWidth, 3).fill(COMMISSION_ACCENT)
}

/**
 * Commission invoice for a payout period — same visual system, order breakdown.
 */
function renderPeriodCommissionInvoiceDocument(doc, {
  payout,
  orders = [],
  shopName,
  platformAddress,
  platformVatId,
  platformVatPercent = 0,
  invoiceNumber,
  periodLabel,
}) {
  const { left, right, contentWidth } = pageMetrics(doc)
  const ratePct = Math.round(Number(payout.commission_rate || 0.12) * 1000) / 10
  const displayRate = ratePct > 0 && ratePct <= 100 ? ratePct : 12
  const grossCents = Number(payout.total_cents || 0)
  const commissionCents = Number(payout.commission_cents || 0)
  const payoutCents = Number(payout.payout_cents || Math.max(0, grossCents - commissionCents))
  const vatPercent = Number(platformVatPercent || 0)
  const vatOnCommission = vatPercent > 0 ? Math.round(commissionCents * vatPercent / 100) : 0
  const commissionTotal = commissionCents + vatOnCommission

  const sellerInfo = {
    store_name: payout.store_name,
    company_name: payout.company_name,
    first_name: payout.first_name,
    last_name: payout.last_name,
    vat_id: payout.vat_id,
    email: payout.email,
    business_address: payout.business_address,
  }

  doc.rect(left, 32, contentWidth, 52).fill(COMMISSION_ACCENT)
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(11)
  doc.text(pdfDeLatin(shopName || 'Andertal Marktplatz'), left + 14, 44)
  doc.font('Helvetica').fontSize(9).fillColor('#e9d5ff')
  doc.text('PLATFORM COMMISSION INVOICE', left + 14, 58)
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(16)
  doc.text('PROVISIONSFAKTUR', right - 220, 46, { width: 206, align: 'right' })
  doc.font('Helvetica').fontSize(9).fillColor('#e9d5ff')
  doc.text(pdfDeLatin(invoiceNumber || 'PROV'), right - 220, 64, { width: 206, align: 'right' })

  let y = 100
  doc.fillColor('#334155').font('Helvetica').fontSize(9.5)
  doc.text(`Datum: ${pdfFmtDate(new Date())}`, left, y)
  y += 14
  if (periodLabel) {
    doc.text(`Abrechnungszeitraum: ${pdfDeLatin(periodLabel)}`, left, y)
    y += 14
  }

  const colW = Math.floor((contentWidth - 20) / 2)
  const col2X = left + colW + 20
  const boxTop = y + 10

  doc.rect(left, boxTop, colW, 96).fill(COMMISSION_BG).stroke(COMMISSION_BORDER)
  drawBlockLabel(doc, 'RECHNUNGSEMPFAENGER (VERKAEUFER)', left + 10, boxTop + 10, colW - 20)
  drawBlockLines(doc, resolveSellerDisplayLines(sellerInfo), left + 10, boxTop + 24, colW - 20)

  doc.rect(col2X, boxTop, colW, 96).fill('#fafafa').stroke(COMMISSION_BORDER)
  drawBlockLabel(doc, 'AUSSTELLER (PLATTFORM)', col2X + 10, boxTop + 10, colW - 20)
  const platformLines = [shopName || 'Andertal Marktplatz']
  if (platformAddress) {
    String(platformAddress).split(/[,\n]/).map((x) => x.trim()).filter(Boolean).forEach((l) => platformLines.push(l))
  }
  if (platformVatId) platformLines.push(`USt-IdNr.: ${platformVatId}`)
  drawBlockLines(doc, platformLines, col2X + 10, boxTop + 24, colW - 20)

  const cardsTop = boxTop + 112
  const cardW = Math.floor((contentWidth - 24) / 3)
  const cards = [
    { label: 'BRUTTOUMSATZ (PERIODE)', value: pdfCents(grossCents), sub: 'Summe aller Warenverkaeufe' },
    { label: `PROVISION (${displayRate}%)`, value: pdfCents(commissionCents), sub: 'Marktplatzgebuehr' },
    { label: 'AUSZAHLUNG AN VERKAEUFER', value: pdfCents(payoutCents), sub: 'Netto nach Provision' },
  ]
  cards.forEach((card, i) => {
    const x = left + i * (cardW + 12)
    doc.rect(x, cardsTop, cardW, 72).fill(i === 1 ? COMMISSION_ACCENT : '#ffffff').stroke(COMMISSION_BORDER)
    const labelColor = i === 1 ? '#e9d5ff' : '#64748b'
    const valueColor = i === 1 ? '#ffffff' : COMMISSION_ACCENT_DARK
    doc.fillColor(labelColor).font('Helvetica-Bold').fontSize(7)
    doc.text(card.label, x + 10, cardsTop + 10, { width: cardW - 20 })
    doc.fillColor(valueColor).font('Helvetica-Bold').fontSize(16)
    doc.text(card.value, x + 10, cardsTop + 28, { width: cardW - 20 })
    doc.fillColor(i === 1 ? '#ddd6fe' : '#64748b').font('Helvetica').fontSize(7.5)
    doc.text(card.sub, x + 10, cardsTop + 52, { width: cardW - 20 })
  })

  const tableTop = cardsTop + 90
  doc.fillColor(COMMISSION_ACCENT_DARK).font('Helvetica-Bold').fontSize(11)
  doc.text('BESTELLUNGEN IM ZEITRAUM', left, tableTop)

  const tTop = tableTop + 18
  const numW = 72
  const dateW = 72
  const salesW = 100
  const feeW = contentWidth - numW - dateW - salesW - 16
  const dateX = left + numW + 8
  const salesX = dateX + dateW + 8
  const feeX = salesX + salesW + 8

  doc.rect(left, tTop, contentWidth, 18).fill(COMMISSION_ACCENT)
  doc.fillColor('#fff').font('Helvetica-Bold').fontSize(8)
  doc.text('BESTELLNR.', left + 8, tTop + 5, { width: numW })
  doc.text('DATUM', dateX, tTop + 5, { width: dateW })
  doc.text('WARENWERT', salesX, tTop + 5, { width: salesW, align: 'right' })
  doc.text('PROVISION', feeX, tTop + 5, { width: feeW - 8, align: 'right' })

  let rowY = tTop + 22
  const orderList = orders.length ? orders : []
  if (!orderList.length) {
    doc.fillColor('#9ca3af').font('Helvetica').fontSize(9)
    doc.text('Keine Bestellungen im Zeitraum', left + 8, rowY + 4)
    rowY += 24
  } else {
    orderList.forEach((o, idx) => {
      const sub = Number(o.subtotal_cents || 0)
      const fee = Number(o.stripe_application_fee_cents || 0) || Math.round(sub * displayRate / 100)
      const h = 20
      if (rowY + h > doc.page.height - doc.page.margins.bottom - 80) {
        doc.addPage()
        rowY = doc.page.margins.top
      }
      if (idx % 2 === 0) doc.rect(left, rowY, contentWidth, h).fill('#fafafa')
      doc.fillColor('#1f2937').font('Helvetica').fontSize(9)
      doc.text(`#${o.order_number || '—'}`, left + 8, rowY + 5, { width: numW })
      doc.text(pdfFmtDate(o.created_at), dateX, rowY + 5, { width: dateW })
      doc.text(pdfCents(sub), salesX, rowY + 5, { width: salesW, align: 'right' })
      doc.text(pdfCents(fee), feeX, rowY + 5, { width: feeW - 8, align: 'right' })
      rowY += h
    })
  }

  const dueY = rowY + 14
  const dueW = 280
  const dueX = right - dueW
  doc.rect(dueX, dueY, dueW, 22).fill('#fafafa').stroke(COMMISSION_BORDER)
  doc.fillColor('#334155').font('Helvetica').fontSize(9)
  doc.text('Gesamtwarenwert', dueX + 10, dueY + 6, { width: dueW * 0.55 })
  doc.text(pdfCents(grossCents), dueX + dueW * 0.5, dueY + 6, { width: dueW * 0.45, align: 'right' })

  const dueY2 = dueY + 26
  doc.rect(dueX, dueY2, dueW, 22).fill('#fafafa').stroke(COMMISSION_BORDER)
  doc.text(`Provision (${displayRate}%)`, dueX + 10, dueY2 + 6, { width: dueW * 0.55 })
  doc.text(pdfCents(commissionCents), dueX + dueW * 0.5, dueY2 + 6, { width: dueW * 0.45, align: 'right' })

  let dueY3 = dueY2 + 26
  if (vatOnCommission > 0) {
    doc.rect(dueX, dueY3, dueW, 22).fill('#fafafa').stroke(COMMISSION_BORDER)
    doc.text(`MwSt. ${vatPercent}%`, dueX + 10, dueY3 + 6, { width: dueW * 0.55 })
    doc.text(pdfCents(vatOnCommission), dueX + dueW * 0.5, dueY3 + 6, { width: dueW * 0.45, align: 'right' })
    dueY3 += 26
  }

  doc.rect(dueX, dueY3, dueW, 28).fill(COMMISSION_ACCENT)
  doc.fillColor('#fff').font('Helvetica-Bold').fontSize(10)
  doc.text('PROVISION FAELLIG', dueX + 10, dueY3 + 8, { width: dueW * 0.55 })
  doc.text(pdfCents(commissionTotal), dueX + dueW * 0.5, dueY3 + 7, { width: dueW * 0.45, align: 'right' })

  const payoutY = dueY3 + 36
  doc.rect(left, payoutY, contentWidth, 26).fill(COMMISSION_BG).stroke(COMMISSION_BORDER)
  doc.fillColor(COMMISSION_ACCENT_DARK).font('Helvetica-Bold').fontSize(10)
  doc.text('AUSZAHLUNG AN VERKAEUFER (NETTO)', left + 10, payoutY + 8, { width: contentWidth * 0.6 })
  doc.text(pdfCents(payoutCents), left + contentWidth * 0.55, payoutY + 7, { width: contentWidth * 0.4, align: 'right' })

  doc.y = payoutY + 40
  doc.fillColor('#64748b').font('Helvetica').fontSize(8.5)
  doc.text(
    pdfDeLatin(
      'Diese Provisionsrechnung fasst alle Bestellungen der Abrechnungsperiode zusammen: Bruttoumsatz, einbehaltene Marktplatzprovision und Nettoauszahlung an den Verkaeufer.',
    ),
    left,
    doc.y,
    { width: contentWidth },
  )

  doc.rect(left, doc.page.height - doc.page.margins.bottom + 8, contentWidth, 3).fill(COMMISSION_ACCENT)
}

module.exports = {
  pdfDeLatin,
  pdfFmtDate,
  pdfCents,
  resolveSellerDisplayLines,
  renderRetailOrderDocument,
  renderCommissionInvoiceDocument,
  renderPeriodCommissionInvoiceDocument,
}
