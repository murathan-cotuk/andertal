/**
 * PDF layout for retail order documents (invoice + delivery note).
 * Commission invoices use a separate visual system at the bottom of this file.
 */

const fs = require('fs')
const path = require('path')
const { getOrderPdfStrings, getCountryName } = require('./order-pdf-i18n')

// ─── Colors ───────────────────────────────────────────────────────────────────
const ACCENT = '#1a2e44'
const MUTED = '#64748b'
const BORDER = '#e2e8f0'
const ROW_ALT = '#f8fafc'

const COMMISSION_ACCENT = '#6d28d9'
const COMMISSION_ACCENT_DARK = '#4c1d95'
const COMMISSION_BG = '#f5f3ff'
const COMMISSION_BORDER = '#ddd6fe'

// ─── Unicode font loading ─────────────────────────────────────────────────────
const FONT_CANDIDATES = [
  ['/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'],
  ['/usr/share/fonts/dejavu/DejaVuSans.ttf', '/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf'],
  ['/usr/share/fonts/ttf-dejavu/DejaVuSans.ttf', '/usr/share/fonts/ttf-dejavu/DejaVuSans-Bold.ttf'],
  ['/usr/share/fonts/dejavu-sans-fonts/DejaVuSans.ttf', '/usr/share/fonts/dejavu-sans-fonts/DejaVuSans-Bold.ttf'],
  ['/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf', '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf'],
  ['/usr/share/fonts/liberation-sans/LiberationSans-Regular.ttf', '/usr/share/fonts/liberation-sans/LiberationSans-Bold.ttf'],
  ['/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf', '/usr/share/fonts/truetype/noto/NotoSans-Bold.ttf'],
  ['/Library/Fonts/Arial.ttf', '/Library/Fonts/Arial Bold.ttf'],
  ['C:\\Windows\\Fonts\\arial.ttf', 'C:\\Windows\\Fonts\\arialbd.ttf'],
  [path.join(__dirname, '..', 'fonts', 'NotoSans-Regular.ttf'), path.join(__dirname, '..', 'fonts', 'NotoSans-Bold.ttf')],
]

let _fontCache = undefined // undefined = unchecked, null = none found, object = found

function findUnicodeFonts() {
  if (_fontCache !== undefined) return _fontCache
  for (const [reg, bold] of FONT_CANDIDATES) {
    try {
      if (fs.existsSync(reg)) {
        _fontCache = { regular: reg, bold: fs.existsSync(bold) ? bold : reg }
        return _fontCache
      }
    } catch (_) {}
  }
  _fontCache = null
  return null
}

function setupDocFonts(doc) {
  const fonts = findUnicodeFonts()
  if (!fonts) return false
  try {
    doc.registerFont('PdfRegular', fonts.regular)
    doc.registerFont('PdfBold', fonts.bold)
    return true
  } catch (_) {
    return false
  }
}

// ─── ASCII transliteration fallback ──────────────────────────────────────────
const pdfDeLatin = (s) => {
  if (s == null) return ''
  return String(s)
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue')
    .replace(/Ä/g, 'Ae').replace(/Ö/g, 'Oe').replace(/Ü/g, 'Ue').replace(/ß/g, 'ss')
    .replace(/İ/g, 'I').replace(/ı/g, 'i').replace(/Ş/g, 'S').replace(/ş/g, 's')
    .replace(/Ğ/g, 'G').replace(/ğ/g, 'g').replace(/Ç/g, 'C').replace(/ç/g, 'c')
    .replace(/[éèêë]/g, 'e').replace(/[ÉÈÊË]/g, 'E')
    .replace(/[àâ]/g, 'a').replace(/[ÀÂ]/g, 'A')
    .replace(/[ùû]/g, 'u').replace(/[ÙÛ]/g, 'U')
    .replace(/î/g, 'i').replace(/Î/g, 'I').replace(/ô/g, 'o').replace(/Ô/g, 'O')
    .replace(/ñ/g, 'n').replace(/Ñ/g, 'N')
    .replace(/[áà]/g, 'a').replace(/[ÁÀ]/g, 'A')
    .replace(/[íì]/g, 'i').replace(/[ÍÌ]/g, 'I')
    .replace(/[óò]/g, 'o').replace(/[ÓÒ]/g, 'O')
    .replace(/[úù]/g, 'u').replace(/[ÚÙ]/g, 'U')
}

function txt(s, hasUnicode) {
  if (s == null) return ''
  return hasUnicode ? String(s) : pdfDeLatin(s)
}

// ─── Page metrics ─────────────────────────────────────────────────────────────
function pageMetrics(doc) {
  const left = doc.page.margins.left
  const right = doc.page.width - doc.page.margins.right
  return { left, right, contentWidth: right - left }
}

// ─── Date / money ─────────────────────────────────────────────────────────────
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

// ─── Seller address lines ─────────────────────────────────────────────────────
function resolveSellerDisplayLines(sellerInfo, locale, hasUnicode) {
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
  const zip = String(addr.zip || addr.postal_code || '').trim()
  const city = String(addr.city || '').trim()
  if (zip || city) lines.push([zip, city].filter(Boolean).join(' '))
  const countryRaw = addr.country || addr.country_code || ''
  if (countryRaw) lines.push(getCountryName(countryRaw, locale))
  if (sellerInfo.vat_id) lines.push(`${s.vatIdPrefix}: ${String(sellerInfo.vat_id).trim()}`)
  return lines.filter(Boolean).map((l) => txt(l, hasUnicode))
}

// ─── Draw helpers ─────────────────────────────────────────────────────────────
function drawHRule(doc, y) {
  const { left, right } = pageMetrics(doc)
  doc.save().moveTo(left, y).lineTo(right, y).lineWidth(0.5).strokeColor(BORDER).stroke().restore()
}

function drawLabel(doc, text, x, y, width, hasUnicode) {
  const font = hasUnicode ? 'PdfBold' : 'Helvetica-Bold'
  doc.fillColor(MUTED).font(font).fontSize(7).text(txt(text, hasUnicode), x, y, { width, characterSpacing: 0.5 })
  return doc.y
}

function drawLines(doc, lines, x, y, width, { hasUnicode, boldFirst = true, fontSize = 9.5 } = {}) {
  let cy = y
  lines.forEach((line, i) => {
    if (!line) return
    const bold = i === 0 && boldFirst
    doc
      .font(bold ? (hasUnicode ? 'PdfBold' : 'Helvetica-Bold') : (hasUnicode ? 'PdfRegular' : 'Helvetica'))
      .fontSize(bold ? 10 : fontSize)
      .fillColor('#1a1a2e')
      .text(txt(line, hasUnicode), x, cy, { width })
    cy = doc.y + 2
  })
  return cy
}

// ─── Retail order document (Rechnung + Lieferschein) ─────────────────────────
function renderRetailOrderDocument(doc, {
  docTitle,
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
  invoiceNumber = null,
}) {
  const hasUnicode = setupDocFonts(doc)
  const REG = hasUnicode ? 'PdfRegular' : 'Helvetica'
  const BOLD = hasUnicode ? 'PdfBold' : 'Helvetica-Bold'
  const s = getOrderPdfStrings(locale)
  const { left, right, contentWidth } = pageMetrics(doc)

  // ── Logo centered ──────────────────────────────────────────────────────────
  const LOGO_Y = 36
  const LOGO_H = 48
  if (shopLogoBuffer) {
    try {
      doc.image(shopLogoBuffer, left, LOGO_Y, { fit: [contentWidth, LOGO_H], align: 'center', valign: 'center' })
    } catch (_) {
      doc.fillColor(ACCENT).font(BOLD).fontSize(16)
        .text(txt(shopName || 'Andertal', hasUnicode), left, LOGO_Y, { width: contentWidth, align: 'center' })
    }
  } else {
    doc.fillColor(ACCENT).font(BOLD).fontSize(16)
      .text(txt(shopName || 'Andertal', hasUnicode), left, LOGO_Y, { width: contentWidth, align: 'center' })
  }

  // ── Rule below logo ────────────────────────────────────────────────────────
  const ruleY = LOGO_Y + LOGO_H + 8
  drawHRule(doc, ruleY)

  // ── Two-column header ──────────────────────────────────────────────────────
  const headerTop = ruleY + 14
  const leftColW = Math.round(contentWidth * 0.54)
  const rightColX = left + leftColW + 20
  const rightColW = contentWidth - leftColW - 20

  // Right column — document title + meta
  const orderNum = row.order_number != null ? String(row.order_number) : String(row.id || '').slice(0, 8)
  const rawNum = String(invoiceNumber || '').replace(/^[A-Za-z]+-/, '')
  const displayDocNum = kind === 'invoice'
    ? (String(invoiceNumber || '').startsWith('R-') ? String(invoiceNumber) : (rawNum ? `R-${rawNum}` : ''))
    : String(invoiceNumber || '')
  const shippingDate = row.shipped_at || row.fulfilled_at || null

  doc.fillColor(ACCENT).font(BOLD).fontSize(22)
    .text(txt(docTitle, hasUnicode), rightColX, headerTop, { width: rightColW, align: 'right' })

  let rightY = doc.y + 10
  const metaLabelW = Math.round(rightColW * 0.54)
  const metaValW = rightColW - metaLabelW

  const metaRows = [
    { label: s.orderNoLabel, value: `#${orderNum}` },
    displayDocNum ? { label: kind === 'invoice' ? s.invoiceNoLabel : s.deliveryNoLabel, value: displayDocNum } : null,
    { label: s.shippingDateLabel, value: pdfFmtDate(shippingDate || row.created_at, locale) },
  ].filter(Boolean)

  metaRows.forEach(({ label, value }) => {
    doc.fillColor(MUTED).font(REG).fontSize(8.5)
      .text(txt(label, hasUnicode), rightColX, rightY, { width: metaLabelW })
    doc.fillColor('#1a1a2e').font(BOLD).fontSize(8.5)
      .text(txt(value, hasUnicode), rightColX + metaLabelW, rightY, { width: metaValW, align: 'right' })
    rightY = doc.y + 3
  })

  // Left column — seller then customer
  let leftY = headerTop

  const sellerLines = resolveSellerDisplayLines(sellerInfo, locale, hasUnicode)
  const senderLines = sellerLines.length ? sellerLines : [txt(shopName || 'Andertal', hasUnicode)]

  drawLabel(doc, s.sellerLabel, left, leftY, leftColW, hasUnicode)
  leftY = doc.y + 3
  leftY = drawLines(doc, senderLines, left, leftY, leftColW, { hasUnicode, boldFirst: true, fontSize: 9 })
  leftY += 10

  const customerName = [row.first_name, row.last_name].filter(Boolean).join(' ')
  const shipCountry = getCountryName(row.country || '', locale)
  const addressLines = [
    customerName || '—',
    row.address_line1,
    row.address_line2,
    [row.postal_code, row.city].filter(Boolean).join(' '),
    shipCountry,
  ].filter(Boolean)

  drawLabel(doc, s.customerLabel, left, leftY, leftColW, hasUnicode)
  leftY = doc.y + 3
  leftY = drawLines(doc, addressLines, left, leftY, leftColW, { hasUnicode, boldFirst: true, fontSize: 9.5 })

  // Continue below both columns
  const afterHeader = Math.max(leftY, rightY) + 14
  drawHRule(doc, afterHeader)

  // ── Greeting ───────────────────────────────────────────────────────────────
  const greetingY = afterHeader + 10
  const greetingName = customerName || (row.email ? row.email.split('@')[0] : 'Kunde')
  doc.fillColor('#1a1a2e').font(REG).fontSize(10)
    .text(txt(s.greetingLine(greetingName), hasUnicode), left, greetingY, { width: contentWidth })
  doc.font(REG).fontSize(10)
    .text(txt(kind === 'invoice' ? s.invoiceGreeting : s.deliveryGreeting, hasUnicode), left, doc.y + 1, { width: contentWidth })

  const tableRuleY = doc.y + 12
  drawHRule(doc, tableRuleY)

  // ── Products table ─────────────────────────────────────────────────────────
  const tableTop = tableRuleY + 6
  let descW, qtyW, unitW, totalW, qtyX, unitX, totalX

  if (kind === 'invoice') {
    descW = Math.round(contentWidth * 0.46)
    qtyW = 38
    unitW = Math.round(contentWidth * 0.17)
    totalW = contentWidth - descW - qtyW - unitW
    qtyX = left + descW
    unitX = qtyX + qtyW
    totalX = unitX + unitW
  } else {
    descW = Math.round(contentWidth * 0.76)
    qtyW = contentWidth - descW
    totalW = 0
    unitW = 0
    qtyX = left + descW
    unitX = qtyX
    totalX = qtyX
  }

  const headerH = 18
  doc.rect(left, tableTop, contentWidth, headerH).fill(ACCENT)
  doc.fillColor('#ffffff').font(BOLD).fontSize(7.5)
  doc.text(txt(s.itemLabel, hasUnicode), left + 8, tableTop + 5, { width: descW - 12 })
  doc.text(txt(s.qtyLabel, hasUnicode), qtyX, tableTop + 5, { width: qtyW, align: 'right' })
  if (kind === 'invoice') {
    doc.text(txt(s.unitPriceLabel, hasUnicode), unitX, tableTop + 5, { width: unitW, align: 'right' })
    doc.text(txt(s.totalLabel, hasUnicode), totalX, tableTop + 5, { width: totalW - 8, align: 'right' })
  }
  doc.y = tableTop + headerH + 2

  const rows = lineItems.length ? lineItems : itemRows
  const drawRows = rows.length ? rows : [{ title: s.noItems, quantity: 1, unit_price_cents: 0 }]

  drawRows.forEach((it, idx) => {
    const qty = Number(it.quantity || 1)
    const unit = Number(it.unit_price_cents || 0)
    const lineTotal = unit * qty
    const title = txt(it.title || s.itemFallback, hasUnicode)
    const titleH = doc.heightOfString(title, { width: descW - 12 })
    const rowH = Math.max(22, titleH + 10)

    if (doc.y + rowH > doc.page.height - doc.page.margins.bottom - 160) {
      doc.addPage()
      doc.y = doc.page.margins.top + 10
    }

    const rowY = doc.y
    if (idx % 2 === 1) doc.rect(left, rowY, contentWidth, rowH).fill(ROW_ALT)

    doc.font(BOLD).fontSize(9.5).fillColor('#111827')
      .text(title, left + 8, rowY + 5, { width: descW - 12 })
    doc.font(REG).fontSize(9.5).fillColor('#111827')
      .text(String(qty), qtyX, rowY + 5, { width: qtyW, align: 'right' })

    if (kind === 'invoice') {
      doc.text(pdfCents(unit, locale), unitX, rowY + 5, { width: unitW, align: 'right' })
      doc.text(pdfCents(lineTotal, locale), totalX, rowY + 5, { width: totalW - 8, align: 'right' })
    }

    doc.moveTo(left, rowY + rowH).lineTo(right, rowY + rowH)
      .lineWidth(0.3).strokeColor(BORDER).stroke()
    doc.y = rowY + rowH
  })

  // ── Totals (invoice only) ──────────────────────────────────────────────────
  if (kind === 'invoice' && totalsLines.length) {
    if (doc.y + 130 > doc.page.height - doc.page.margins.bottom) {
      doc.addPage()
      doc.y = doc.page.margins.top + 10
    }
    const totalsW = 240
    const totalsX = right - totalsW
    doc.y += 12
    drawHRule(doc, doc.y)
    doc.y += 10

    totalsLines.forEach(({ label, value, bold, color }) => {
      const y = doc.y
      doc.font(bold ? BOLD : REG).fontSize(bold ? 10.5 : 9.5).fillColor(color || '#111827')
      doc.text(txt(label, hasUnicode), totalsX, y, { width: totalsW * 0.56 })
      doc.text(txt(value, hasUnicode), totalsX + totalsW * 0.56, y, { width: totalsW * 0.44, align: 'right' })
      doc.y = y + (bold ? 17 : 14)
    })

    if (amountDueCents != null) {
      doc.y += 6
      const boxY = doc.y
      const boxH = 28
      doc.rect(totalsX - 8, boxY, totalsW + 8, boxH).fill(ACCENT)
      doc.fillColor('#ffffff').font(BOLD).fontSize(10)
        .text(txt(s.amountDueLabel, hasUnicode), totalsX - 2, boxY + 8, { width: (totalsW + 8) * 0.52 })
      doc.text(pdfCents(amountDueCents, locale), totalsX + (totalsW + 8) * 0.5, boxY + 8, {
        width: (totalsW + 8) * 0.46, align: 'right',
      })
      doc.y = boxY + boxH + 14
    }
  }

  // ── Footer ─────────────────────────────────────────────────────────────────
  const footerY = Math.max(doc.y + 16, doc.page.height - doc.page.margins.bottom - 52)

  if (sellerLines.length) {
    doc.fillColor(MUTED).font(REG).fontSize(7.5)
      .text(txt(s.sellerDisclaimer, hasUnicode), left, footerY - 24, { width: contentWidth })
  }

  doc.fillColor(MUTED).font(REG).fontSize(7.5)
    .text(txt(footerText || (kind === 'invoice' ? s.invoiceFooter : s.deliveryFooter), hasUnicode), left, footerY, { width: contentWidth })

  doc.rect(left, doc.page.height - doc.page.margins.bottom + 8, contentWidth, 3).fill(ACCENT)
}

// ─── Commission invoice (order-level) ─────────────────────────────────────────
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

  const _label = (label, x, y, width) => {
    doc.fillColor('#64748b').font('Helvetica-Bold').fontSize(7.5)
      .text(pdfDeLatin(label), x, y, { width, characterSpacing: 0.4 })
  }
  const _lines = (lines, x, y, width, boldFirst = true, fontSize = 9.5) => {
    let cy = y
    lines.forEach((line, i) => {
      if (!line) return
      doc.font(i === 0 && boldFirst ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(i === 0 && boldFirst ? 10 : fontSize).fillColor('#1f2937')
        .text(pdfDeLatin(line), x, cy, { width })
      cy = doc.y + 2
    })
    return cy
  }

  doc.rect(left, 32, contentWidth, 52).fill(COMMISSION_ACCENT)
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(11)
    .text(pdfDeLatin(shopName || 'Andertal Marktplatz'), left + 14, 44)
  doc.font('Helvetica').fontSize(9).fillColor('#e9d5ff')
    .text('PLATFORM COMMISSION INVOICE', left + 14, 58)
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(16)
    .text('PROVISIONSFAKTUR', right - 220, 46, { width: 206, align: 'right' })
  doc.font('Helvetica').fontSize(9).fillColor('#e9d5ff')
    .text(pdfDeLatin(invoiceNumber || `PROV-${on}`), right - 220, 64, { width: 206, align: 'right' })

  let y = 100
  doc.fillColor('#334155').font('Helvetica').fontSize(9.5)
  doc.text(`Datum: ${pdfFmtDate(order.created_at)}`, left, y); y += 14
  doc.text(`Bezug Bestellung: #${on}`, left, y); y += 14
  if (periodLabel) { doc.text(`Abrechnungszeitraum: ${pdfDeLatin(periodLabel)}`, left, y); y += 14 }

  const colW = Math.floor((contentWidth - 20) / 2)
  const col2X = left + colW + 20
  const boxTop = y + 10

  doc.rect(left, boxTop, colW, 96).fill(COMMISSION_BG).stroke(COMMISSION_BORDER)
  _label('RECHNUNGSEMPFAENGER (VERKAEUFER)', left + 10, boxTop + 10, colW - 20)
  _lines(resolveSellerDisplayLines(sellerInfo, 'de', false), left + 10, boxTop + 24, colW - 20)

  doc.rect(col2X, boxTop, colW, 96).fill('#fafafa').stroke(COMMISSION_BORDER)
  _label('AUSSTELLER (PLATTFORM)', col2X + 10, boxTop + 10, colW - 20)
  const platformLines = [shopName || 'Andertal Marktplatz']
  if (platformAddress) String(platformAddress).split(/[,\n]/).map((x) => x.trim()).filter(Boolean).forEach((l) => platformLines.push(l))
  if (platformVatId) platformLines.push(`USt-IdNr.: ${platformVatId}`)
  _lines(platformLines, col2X + 10, boxTop + 24, colW - 20)

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
    doc.fillColor(i === 1 ? '#e9d5ff' : '#64748b').font('Helvetica-Bold').fontSize(7)
      .text(card.label, x + 10, cardsTop + 10, { width: cardW - 20 })
    doc.fillColor(i === 1 ? '#ffffff' : COMMISSION_ACCENT_DARK).font('Helvetica-Bold').fontSize(16)
      .text(card.value, x + 10, cardsTop + 28, { width: cardW - 20 })
    doc.fillColor(i === 1 ? '#ddd6fe' : '#64748b').font('Helvetica').fontSize(7.5)
      .text(card.sub, x + 10, cardsTop + 52, { width: cardW - 20 })
  })

  const tableTop = cardsTop + 90
  doc.fillColor(COMMISSION_ACCENT_DARK).font('Helvetica-Bold').fontSize(11)
    .text('ABRECHNUNGSDETAILS', left, tableTop)
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
  detailRows.forEach((r, i) => {
    const h = 22
    if (i % 2 === 0) doc.rect(left, rowY, contentWidth, h).fill('#fafafa')
    doc.fillColor('#1f2937').font('Helvetica').fontSize(9.5)
      .text(pdfDeLatin(r.label), left + 8, rowY + 6, { width: labelW - 12 })
    const prefix = r.amount < 0 ? '-' : ''
    doc.text(prefix + pdfCents(Math.abs(r.amount)), left + labelW, rowY + 6, { width: contentWidth - labelW - 8, align: 'right' })
    rowY += h
  })

  const dueY = rowY + 14, dueW = 260, dueX = right - dueW
  doc.rect(dueX, dueY, dueW, 26).fill(COMMISSION_ACCENT)
  doc.fillColor('#fff').font('Helvetica-Bold').fontSize(10)
  const dueLabel = vatOnCommission > 0 ? `PROVISION INKL. ${vatPercent}% MwSt.` : 'PROVISION FAELLIG'
  doc.text(dueLabel, dueX + 10, dueY + 8, { width: dueW * 0.55 })
  doc.text(pdfCents(commissionTotal), dueX + dueW * 0.5, dueY + 7, { width: dueW * 0.45, align: 'right' })

  doc.y = dueY + 40
  doc.fillColor('#64748b').font('Helvetica').fontSize(8.5)
    .text(pdfDeLatin('Diese Provisionsrechnung dokumentiert den Umsatz der Bestellung, die einbehaltene Marktplatzprovision und die Nettoauszahlung an den Verkaeufer.'), left, doc.y, { width: contentWidth })
  if (!platformVatId && vatPercent === 0) {
    doc.text(pdfDeLatin('Gemaess §19 UStG wird keine Umsatzsteuer auf die Provision berechnet, sofern anwendbar.'), left, doc.y + 4, { width: contentWidth })
  }
  doc.rect(left, doc.page.height - doc.page.margins.bottom + 8, contentWidth, 3).fill(COMMISSION_ACCENT)
}

// ─── Commission invoice (period-level) ────────────────────────────────────────
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
    store_name: payout.store_name, company_name: payout.company_name,
    first_name: payout.first_name, last_name: payout.last_name,
    vat_id: payout.vat_id, email: payout.email, business_address: payout.business_address,
  }

  const _label = (label, x, y, width) => {
    doc.fillColor('#64748b').font('Helvetica-Bold').fontSize(7.5)
      .text(pdfDeLatin(label), x, y, { width, characterSpacing: 0.4 })
  }
  const _lines = (lines, x, y, width, boldFirst = true, fontSize = 9.5) => {
    let cy = y
    lines.forEach((line, i) => {
      if (!line) return
      doc.font(i === 0 && boldFirst ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(i === 0 && boldFirst ? 10 : fontSize).fillColor('#1f2937')
        .text(pdfDeLatin(line), x, cy, { width })
      cy = doc.y + 2
    })
    return cy
  }

  doc.rect(left, 32, contentWidth, 52).fill(COMMISSION_ACCENT)
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(11)
    .text(pdfDeLatin(shopName || 'Andertal Marktplatz'), left + 14, 44)
  doc.font('Helvetica').fontSize(9).fillColor('#e9d5ff')
    .text('PLATFORM COMMISSION INVOICE', left + 14, 58)
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(16)
    .text('PROVISIONSFAKTUR', right - 220, 46, { width: 206, align: 'right' })
  doc.font('Helvetica').fontSize(9).fillColor('#e9d5ff')
    .text(pdfDeLatin(invoiceNumber || 'PROV'), right - 220, 64, { width: 206, align: 'right' })

  let y = 100
  doc.fillColor('#334155').font('Helvetica').fontSize(9.5)
  doc.text(`Datum: ${pdfFmtDate(new Date())}`, left, y); y += 14
  if (periodLabel) { doc.text(`Abrechnungszeitraum: ${pdfDeLatin(periodLabel)}`, left, y); y += 14 }

  const colW = Math.floor((contentWidth - 20) / 2)
  const col2X = left + colW + 20
  const boxTop = y + 10

  doc.rect(left, boxTop, colW, 96).fill(COMMISSION_BG).stroke(COMMISSION_BORDER)
  _label('RECHNUNGSEMPFAENGER (VERKAEUFER)', left + 10, boxTop + 10, colW - 20)
  _lines(resolveSellerDisplayLines(sellerInfo, 'de', false), left + 10, boxTop + 24, colW - 20)

  doc.rect(col2X, boxTop, colW, 96).fill('#fafafa').stroke(COMMISSION_BORDER)
  _label('AUSSTELLER (PLATTFORM)', col2X + 10, boxTop + 10, colW - 20)
  const platformLines = [shopName || 'Andertal Marktplatz']
  if (platformAddress) String(platformAddress).split(/[,\n]/).map((x) => x.trim()).filter(Boolean).forEach((l) => platformLines.push(l))
  if (platformVatId) platformLines.push(`USt-IdNr.: ${platformVatId}`)
  _lines(platformLines, col2X + 10, boxTop + 24, colW - 20)

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
    doc.fillColor(i === 1 ? '#e9d5ff' : '#64748b').font('Helvetica-Bold').fontSize(7)
      .text(card.label, x + 10, cardsTop + 10, { width: cardW - 20 })
    doc.fillColor(i === 1 ? '#ffffff' : COMMISSION_ACCENT_DARK).font('Helvetica-Bold').fontSize(16)
      .text(card.value, x + 10, cardsTop + 28, { width: cardW - 20 })
    doc.fillColor(i === 1 ? '#ddd6fe' : '#64748b').font('Helvetica').fontSize(7.5)
      .text(card.sub, x + 10, cardsTop + 52, { width: cardW - 20 })
  })

  const tableTop = cardsTop + 90
  doc.fillColor(COMMISSION_ACCENT_DARK).font('Helvetica-Bold').fontSize(11)
    .text('BESTELLUNGEN IM ZEITRAUM', left, tableTop)
  const tTop = tableTop + 18
  const numW = 72, dateW = 72, salesW = 100
  const feeW = contentWidth - numW - dateW - salesW - 16
  const dateX = left + numW + 8, salesX = dateX + dateW + 8, feeX = salesX + salesW + 8

  doc.rect(left, tTop, contentWidth, 18).fill(COMMISSION_ACCENT)
  doc.fillColor('#fff').font('Helvetica-Bold').fontSize(8)
  doc.text('BESTELLNR.', left + 8, tTop + 5, { width: numW })
  doc.text('DATUM', dateX, tTop + 5, { width: dateW })
  doc.text('WARENWERT', salesX, tTop + 5, { width: salesW, align: 'right' })
  doc.text('PROVISION', feeX, tTop + 5, { width: feeW - 8, align: 'right' })

  let rowY = tTop + 22
  if (!orders.length) {
    doc.fillColor('#9ca3af').font('Helvetica').fontSize(9)
      .text('Keine Bestellungen im Zeitraum', left + 8, rowY + 4)
    rowY += 24
  } else {
    orders.forEach((o, i) => {
      const sub = Number(o.subtotal_cents || 0)
      const fee = Number(o.stripe_application_fee_cents || 0) || Math.round(sub * displayRate / 100)
      const h = 20
      if (rowY + h > doc.page.height - doc.page.margins.bottom - 80) { doc.addPage(); rowY = doc.page.margins.top }
      if (i % 2 === 0) doc.rect(left, rowY, contentWidth, h).fill('#fafafa')
      doc.fillColor('#1f2937').font('Helvetica').fontSize(9)
      doc.text(`#${o.order_number || '—'}`, left + 8, rowY + 5, { width: numW })
      doc.text(pdfFmtDate(o.created_at), dateX, rowY + 5, { width: dateW })
      doc.text(pdfCents(sub), salesX, rowY + 5, { width: salesW, align: 'right' })
      doc.text(pdfCents(fee), feeX, rowY + 5, { width: feeW - 8, align: 'right' })
      rowY += h
    })
  }

  const dueY = rowY + 14, dueW = 280, dueX = right - dueW
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
    .text(pdfDeLatin('Diese Provisionsrechnung fasst alle Bestellungen der Abrechnungsperiode zusammen: Bruttoumsatz, einbehaltene Marktplatzprovision und Nettoauszahlung an den Verkaeufer.'), left, doc.y, { width: contentWidth })
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
