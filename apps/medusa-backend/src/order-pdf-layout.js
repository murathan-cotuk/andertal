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

/** store_order_items.title bakes the variant as a trailing "(...)" at checkout (store-checkout.js) —
 * split it back out so it can render as a smaller, muted note line instead of inline in the title. */
function splitItemTitle(title) {
  const s = String(title || '').trim()
  const m = s.match(/^(.*?)\s*\(([^()]+)\)\s*$/)
  if (!m || !m[1].trim()) return { main: s, note: '' }
  return { main: m[1].trim(), note: m[2].trim() }
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
  const font = hasUnicode ? 'PdfRegular' : 'Helvetica'
  doc.fillColor(MUTED).font(font).fontSize(7).text(txt(text, hasUnicode), x, y, {
    width,
    characterSpacing: 0.4,
    lineBreak: false,
  })
  return y + 10
}

function drawLines(doc, lines, x, y, width, { hasUnicode, boldFirst = false, fontSize = 9 } = {}) {
  const REG = hasUnicode ? 'PdfRegular' : 'Helvetica'
  const BOLD = hasUnicode ? 'PdfBold' : 'Helvetica-Bold'
  let cy = y
  lines.forEach((line, i) => {
    if (!line) return
    const bold = i === 0 && boldFirst
    doc
      .font(bold ? BOLD : REG)
      .fontSize(fontSize)
      .fillColor('#1a1a2e')
      .text(txt(line, hasUnicode), x, cy, { width, lineGap: 1 })
    cy = doc.y + 1
  })
  return cy
}

/** Same-row label/value without letting PDFKit advance y between cells (avoids overlap). */
function drawMetaRow(doc, label, value, x, y, labelW, valW, REG) {
  const lineH = 12
  doc.fillColor(MUTED).font(REG).fontSize(8.5)
    .text(label, x, y, { width: labelW, lineBreak: false })
  doc.fillColor('#1a1a2e').font(REG).fontSize(8.5)
    .text(value, x + labelW, y, { width: valW, align: 'right', lineBreak: false })
  return y + lineH
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
  shippingCents = null,
  amountDueCents = null,
  footerText = '',
  invoiceNumber = null,
  carrierName = null,
  trackingNumber = null,
  goodsVatPercent = null,
}) {
  const hasUnicode = setupDocFonts(doc)
  const REG = hasUnicode ? 'PdfRegular' : 'Helvetica'
  const BOLD = hasUnicode ? 'PdfBold' : 'Helvetica-Bold'
  const s = getOrderPdfStrings(locale)
  const { left, right, contentWidth } = pageMetrics(doc)

  const orderNum = row.order_number != null ? String(row.order_number) : String(row.id || '').slice(0, 8)
  const rawNum = String(invoiceNumber || '').replace(/^[A-Za-z]+-/, '')
  const displayDocNum = (() => {
    if (!rawNum && !invoiceNumber) return ''
    if (kind === 'invoice') {
      return String(invoiceNumber || '').startsWith('R-') ? String(invoiceNumber) : `R-${rawNum}`
    }
    // Lieferschein
    const raw = String(invoiceNumber || '')
    if (raw.startsWith('L-')) return raw
    return rawNum ? `L-${rawNum}` : raw
  })()
  const shipAt = row.shipped_at || row.fulfilled_at || null
  const carrier = String(carrierName || row.carrier_name || '').trim()
  const tracking = String(trackingNumber || row.tracking_number || '').trim()

  // ── Brand row: small logo top-left + document title top-right ───────────────
  const brandY = 36
  const LOGO_MAX_W = 108
  const LOGO_MAX_H = 28
  let brandBottom = brandY + LOGO_MAX_H

  if (shopLogoBuffer) {
    try {
      doc.image(shopLogoBuffer, left, brandY, { fit: [LOGO_MAX_W, LOGO_MAX_H], align: 'left', valign: 'center' })
    } catch (_) {
      doc.fillColor(ACCENT).font(REG).fontSize(12)
        .text(txt(shopName || 'Andertal', hasUnicode), left, brandY + 6, { width: LOGO_MAX_W, lineBreak: false })
    }
  } else {
    doc.fillColor(ACCENT).font(REG).fontSize(12)
      .text(txt(shopName || 'Andertal', hasUnicode), left, brandY + 6, { width: LOGO_MAX_W, lineBreak: false })
  }

  doc.fillColor(ACCENT).font(REG).fontSize(14)
    .text(txt(docTitle, hasUnicode), left + LOGO_MAX_W + 16, brandY + 6, {
      width: contentWidth - LOGO_MAX_W - 16,
      align: 'right',
      lineBreak: false,
    })

  const ruleY = brandBottom + 10
  drawHRule(doc, ruleY)

  // ── Two-column header: seller/customer | meta ──────────────────────────────
  const headerTop = ruleY + 12
  const gap = 24
  const leftColW = Math.round(contentWidth * 0.55)
  const rightColX = left + leftColW + gap
  const rightColW = contentWidth - leftColW - gap

  let leftY = headerTop
  const sellerLines = resolveSellerDisplayLines(sellerInfo, locale, hasUnicode)
  const senderLines = sellerLines.length
    ? sellerLines
    : [txt(shopName || 'Andertal', hasUnicode)]

  doc.fillColor(MUTED).font(REG).fontSize(7)
    .text(txt(s.sellerLabel || 'Verkäufer', hasUnicode), left, leftY, {
      width: leftColW,
      characterSpacing: 0.4,
      lineBreak: false,
    })
  leftY += 10
  leftY = drawLines(doc, senderLines, left, leftY, leftColW, {
    hasUnicode,
    boldFirst: false,
    fontSize: 8.5,
  })
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

  leftY = drawLabel(doc, s.customerLabel, left, leftY, leftColW, hasUnicode)
  leftY = drawLines(doc, addressLines, left, leftY, leftColW, {
    hasUnicode,
    boldFirst: true,
    fontSize: 9,
  })

  let rightY = headerTop
  const metaLabelW = Math.min(92, Math.round(rightColW * 0.42))
  const metaValW = rightColW - metaLabelW
  const metaRows = [
    { label: s.orderNoLabel, value: `#${orderNum}` },
    displayDocNum ? { label: kind === 'invoice' ? s.invoiceNoLabel : s.deliveryNoLabel, value: displayDocNum } : null,
    kind === 'lieferschein'
      ? { label: s.shipDateLabel || s.shippingDateLabel, value: pdfFmtDate(shipAt || row.created_at, locale) }
      : { label: s.shippingDateLabel, value: pdfFmtDate(row.created_at, locale) },
    kind === 'lieferschein' && carrier ? { label: s.carrierLabel, value: carrier } : null,
    kind === 'lieferschein' && tracking ? { label: s.trackingLabel, value: tracking } : null,
  ].filter(Boolean)

  metaRows.forEach(({ label, value }) => {
    rightY = drawMetaRow(
      doc,
      txt(label, hasUnicode),
      txt(value, hasUnicode),
      rightColX,
      rightY,
      metaLabelW,
      metaValW,
      REG,
    )
  })

  const afterHeader = Math.max(leftY, rightY) + 12
  drawHRule(doc, afterHeader)

  // ── Greeting ───────────────────────────────────────────────────────────────
  let y = afterHeader + 10
  const greetingName = customerName || (row.email ? row.email.split('@')[0] : 'Kunde')
  doc.fillColor('#1a1a2e').font(REG).fontSize(9.5)
    .text(txt(s.greetingLine(greetingName), hasUnicode), left, y, { width: contentWidth, lineGap: 2 })
  y = doc.y + 2
  doc.font(REG).fontSize(9.5)
    .text(txt(kind === 'invoice' ? s.invoiceGreeting : s.deliveryGreeting, hasUnicode), left, y, {
      width: contentWidth,
      lineGap: 2,
    })

  const tableRuleY = doc.y + 10
  drawHRule(doc, tableRuleY)

  // ── Products table ─────────────────────────────────────────────────────────
  const tableTop = tableRuleY + 8
  const sellerHasVat = !!(sellerInfo && sellerInfo.vat_id && String(sellerInfo.vat_id).trim())
  const goodsVatRate = sellerHasVat && goodsVatPercent != null && Number(goodsVatPercent) > 0
    ? Number(goodsVatPercent)
    : (sellerHasVat ? 19 : 0)
  const goodsVatLabel = sellerHasVat && goodsVatRate > 0
    ? `${Math.abs(goodsVatRate - Math.round(goodsVatRate)) < 1e-9 ? String(Math.round(goodsVatRate)) : String(goodsVatRate)}%`
    : '—'
  let descW, qtyW, mwstW, unitW, totalW, qtyX, mwstX, unitX, totalX

  if (kind === 'invoice') {
    descW = Math.round(contentWidth * 0.44)
    qtyW = 32
    mwstW = 40
    unitW = Math.round(contentWidth * 0.16)
    totalW = contentWidth - descW - qtyW - mwstW - unitW
    qtyX = left + descW
    mwstX = qtyX + qtyW
    unitX = mwstX + mwstW
    totalX = unitX + unitW
  } else {
    descW = Math.round(contentWidth * 0.76)
    qtyW = contentWidth - descW
    mwstW = 0
    totalW = 0
    unitW = 0
    qtyX = left + descW
    mwstX = qtyX
    unitX = qtyX
    totalX = qtyX
  }

  const headerH = 16
  doc.rect(left, tableTop, contentWidth, headerH).fill(ACCENT)
  doc.fillColor('#ffffff').font(REG).fontSize(7.5)
  doc.text(txt(s.itemLabel, hasUnicode), left + 8, tableTop + 4, { width: descW - 12, lineBreak: false })
  doc.text(txt(s.qtyLabel, hasUnicode), qtyX, tableTop + 4, { width: qtyW, align: 'right', lineBreak: false })
  if (kind === 'invoice') {
    doc.text(txt(s.mwstLabel, hasUnicode), mwstX, tableTop + 4, { width: mwstW, align: 'right', lineBreak: false })
    doc.text(txt(s.unitPriceLabel, hasUnicode), unitX, tableTop + 4, { width: unitW, align: 'right', lineBreak: false })
    doc.text(txt(s.totalLabel, hasUnicode), totalX, tableTop + 4, { width: totalW - 8, align: 'right', lineBreak: false })
  }
  doc.y = tableTop + headerH

  const rows = lineItems.length ? lineItems : itemRows
  const drawRows = rows.length ? rows : [{ title: s.noItems, quantity: 1, unit_price_cents: 0 }]

  drawRows.forEach((it, idx) => {
    const qty = Number(it.quantity || 1)
    const unit = Number(it.unit_price_cents || 0)
    const lineTotal = unit * qty
    const { main: titleMain, note: titleNote } = splitItemTitle(it.title || s.itemFallback)
    const title = txt(titleMain, hasUnicode)
    const note = txt(titleNote, hasUnicode)

    doc.font(REG).fontSize(9)
    const titleH = doc.heightOfString(title, { width: descW - 12 })
    doc.font(REG).fontSize(7.5)
    const noteH = note ? doc.heightOfString(note, { width: descW - 12 }) : 0
    const rowH = Math.max(20, titleH + (note ? noteH + 2 : 0) + 10)

    if (doc.y + rowH > doc.page.height - doc.page.margins.bottom - 160) {
      doc.addPage()
      doc.y = doc.page.margins.top + 10
    }

    const rowY = doc.y
    if (idx % 2 === 1) doc.rect(left, rowY, contentWidth, rowH).fill(ROW_ALT)

    doc.font(REG).fontSize(9).fillColor('#111827')
      .text(title, left + 8, rowY + 5, { width: descW - 12 })
    if (note) {
      doc.font(REG).fontSize(7.5).fillColor(MUTED)
        .text(note, left + 8, rowY + 5 + titleH + 1, { width: descW - 12 })
    }

    const cellY = rowY + 5
    doc.font(REG).fontSize(9).fillColor('#111827')
      .text(String(qty), qtyX, cellY, { width: qtyW, align: 'right', lineBreak: false })
    if (kind === 'invoice') {
      doc.text(goodsVatLabel, mwstX, cellY, { width: mwstW, align: 'right', lineBreak: false })
      doc.text(pdfCents(unit, locale), unitX, cellY, { width: unitW, align: 'right', lineBreak: false })
      doc.text(pdfCents(lineTotal, locale), totalX, cellY, { width: totalW - 8, align: 'right', lineBreak: false })
    }

    doc.moveTo(left, rowY + rowH).lineTo(right, rowY + rowH)
      .lineWidth(0.3).strokeColor(BORDER).stroke()
    doc.y = rowY + rowH
  })

  // ── Shipping row (invoice only) ────────────────────────────────────────────
  if (kind === 'invoice' && shippingCents != null) {
    const shRowIdx = drawRows.length
    const shRowY = doc.y
    const shRowH = 20
    if (shRowIdx % 2 === 1) doc.rect(left, shRowY, contentWidth, shRowH).fill(ROW_ALT)
    const shTitle = txt(s.shipping, hasUnicode)
    doc.font(REG).fontSize(9).fillColor('#111827')
      .text(shTitle, left + 8, shRowY + 5, { width: descW - 12, lineBreak: false })
      .text('1', qtyX, shRowY + 5, { width: qtyW, align: 'right', lineBreak: false })
      .text(goodsVatLabel, mwstX, shRowY + 5, { width: mwstW, align: 'right', lineBreak: false })
      .text(pdfCents(shippingCents, locale), unitX, shRowY + 5, { width: unitW, align: 'right', lineBreak: false })
      .text(pdfCents(shippingCents, locale), totalX, shRowY + 5, { width: totalW - 8, align: 'right', lineBreak: false })
    doc.moveTo(left, shRowY + shRowH).lineTo(right, shRowY + shRowH)
      .lineWidth(0.3).strokeColor(BORDER).stroke()
    doc.y = shRowY + shRowH
  }

  // ── Totals (invoice only) ──────────────────────────────────────────────────
  if (kind === 'invoice' && totalsLines.length) {
    if (doc.y + 130 > doc.page.height - doc.page.margins.bottom) {
      doc.addPage()
      doc.y = doc.page.margins.top + 10
    }
    const totalsW = 230
    const totalsX = right - totalsW
    doc.y += 14
    drawHRule(doc, doc.y)
    doc.y += 10

    totalsLines.forEach(({ label, value, bold, color, small }) => {
      const ty = doc.y
      const fs = bold ? 10 : small ? 8 : 9
      const hasVal = value != null && value !== ''
      doc.font(bold ? BOLD : REG).fontSize(fs).fillColor(color || '#111827')
      doc.text(txt(label, hasUnicode), totalsX, ty, {
        width: hasVal ? totalsW * 0.62 : totalsW,
        lineBreak: false,
      })
      if (hasVal) {
        doc.text(txt(value, hasUnicode), totalsX + totalsW * 0.62, ty, {
          width: totalsW * 0.38,
          align: 'right',
          lineBreak: false,
        })
      }
      doc.y = ty + (bold ? 16 : small ? 12 : 13)
    })

    if (amountDueCents != null) {
      doc.y += 6
      const boxY = doc.y
      const boxH = 26
      doc.rect(totalsX - 6, boxY, totalsW + 6, boxH).fill(ACCENT)
      doc.fillColor('#ffffff').font(BOLD).fontSize(9.5)
        .text(txt(s.amountDueLabel, hasUnicode), totalsX, boxY + 7, {
          width: (totalsW + 6) * 0.52,
          lineBreak: false,
        })
      doc.font(BOLD).fontSize(10)
        .text(pdfCents(amountDueCents, locale), totalsX + (totalsW + 6) * 0.48, boxY + 7, {
          width: (totalsW + 6) * 0.48,
          align: 'right',
          lineBreak: false,
        })
      doc.y = boxY + boxH + 12
    }
  }

  // ── Compliance info (payment method, LUCID) ────────────────────────────────
  if (kind === 'invoice') {
    const paymentMethod = String(row.payment_method || '').trim()
    const lucidNumber = String(sellerInfo?.lucid_number || '').trim()
    if (paymentMethod || lucidNumber) {
      let infoY = doc.y + 10
      doc.fillColor(MUTED).font(REG).fontSize(8)
      if (paymentMethod) {
        doc.text(txt(`${s.paymentMethodLabel}: ${paymentMethod}`, hasUnicode), left, infoY, { width: contentWidth })
        infoY = doc.y + 2
      }
      if (lucidNumber) {
        doc.text(txt(`${s.lucidLabel}: ${lucidNumber}`, hasUnicode), left, infoY, { width: contentWidth })
        infoY = doc.y + 2
      }
      doc.y = infoY
    }
  }

  // ── Footer ─────────────────────────────────────────────────────────────────
  const footerY = Math.max(doc.y + 16, doc.page.height - doc.page.margins.bottom - 52)

  if (kind === 'invoice' && sellerInfo) {
    doc.fillColor(MUTED).font(REG).fontSize(7)
      .text(txt(s.sellerDisclaimer, hasUnicode), left, footerY - 22, { width: contentWidth })
  }

  doc.fillColor(MUTED).font(REG).fontSize(7)
    .text(txt(footerText || (kind === 'invoice' ? s.invoiceFooter : s.deliveryFooter), hasUnicode), left, footerY, {
      width: contentWidth,
    })

  doc.rect(left, doc.page.height - doc.page.margins.bottom + 8, contentWidth, 2).fill(ACCENT)
}

function parseReturnItems(returnRow) {
  let items = returnRow?.items
  if (typeof items === 'string') {
    try { items = JSON.parse(items) } catch (_) { items = [] }
  }
  return Array.isArray(items) ? items : []
}

function formatReturnDisplayNumber(returnRow, orderNum) {
  const raw = returnRow?.return_number
  if (raw == null || String(raw).trim() === '') {
    return orderNum ? `R-${orderNum}` : 'R-—'
  }
  const s = String(raw).trim()
  if (/^R-/i.test(s) || /^RT-/i.test(s)) return s
  return `R-${s}`
}

// ─── Retourenschein (return slip) ────────────────────────────────────────────
function renderRetourenscheinDocument(doc, {
  row,
  returnRow = null,
  shopName,
  sellerInfo,
  shopLogoBuffer,
  locale = 'de',
  lineItems = null,
}) {
  const hasUnicode = setupDocFonts(doc)
  const REG = hasUnicode ? 'PdfRegular' : 'Helvetica'
  const BOLD = hasUnicode ? 'PdfBold' : 'Helvetica-Bold'
  const s = getOrderPdfStrings(locale)
  const { left, right, contentWidth } = pageMetrics(doc)

  const orderNum = row.order_number != null ? String(row.order_number) : String(row.id || '').slice(0, 8)
  const returnNum = formatReturnDisplayNumber(returnRow, orderNum)
  const items = Array.isArray(lineItems) && lineItems.length
    ? lineItems
    : parseReturnItems(returnRow)

  // Brand row
  const brandY = 36
  const LOGO_MAX_W = 108
  const LOGO_MAX_H = 28
  const brandBottom = brandY + LOGO_MAX_H

  if (shopLogoBuffer) {
    try {
      doc.image(shopLogoBuffer, left, brandY, { fit: [LOGO_MAX_W, LOGO_MAX_H], align: 'left', valign: 'center' })
    } catch (_) {
      doc.fillColor(ACCENT).font(REG).fontSize(12)
        .text(txt(shopName || 'Andertal', hasUnicode), left, brandY + 6, { width: LOGO_MAX_W, lineBreak: false })
    }
  } else {
    doc.fillColor(ACCENT).font(REG).fontSize(12)
      .text(txt(shopName || 'Andertal', hasUnicode), left, brandY + 6, { width: LOGO_MAX_W, lineBreak: false })
  }

  doc.fillColor(ACCENT).font(REG).fontSize(14)
    .text(txt(s.returnTitle, hasUnicode), left + LOGO_MAX_W + 16, brandY + 6, {
      width: contentWidth - LOGO_MAX_W - 16,
      align: 'right',
      lineBreak: false,
    })

  const ruleY = brandBottom + 10
  drawHRule(doc, ruleY)

  // Two-column header
  const headerTop = ruleY + 12
  const gap = 24
  const leftColW = Math.round(contentWidth * 0.55)
  const rightColX = left + leftColW + gap
  const rightColW = contentWidth - leftColW - gap

  let leftY = headerTop
  const customerName = [row.first_name, row.last_name].filter(Boolean).join(' ')
  const shipCountry = getCountryName(row.country || '', locale)
  const senderLines = [
    customerName || '—',
    row.address_line1,
    row.address_line2,
    [row.postal_code, row.city].filter(Boolean).join(' '),
    shipCountry,
  ].filter(Boolean)

  leftY = drawLabel(doc, s.returnSenderLabel, left, leftY, leftColW, hasUnicode)
  leftY = drawLines(doc, senderLines, left, leftY, leftColW, {
    hasUnicode,
    boldFirst: true,
    fontSize: 9,
  })
  leftY += 10

  const sellerLines = resolveSellerDisplayLines(sellerInfo, locale, hasUnicode)
  const recipientLines = sellerLines.length
    ? sellerLines
    : [txt(shopName || 'Andertal', hasUnicode)]
  leftY = drawLabel(doc, s.returnRecipientLabel, left, leftY, leftColW, hasUnicode)
  leftY = drawLines(doc, recipientLines, left, leftY, leftColW, {
    hasUnicode,
    boldFirst: false,
    fontSize: 8.5,
  })

  let rightY = headerTop
  const metaLabelW = Math.min(100, Math.round(rightColW * 0.46))
  const metaValW = rightColW - metaLabelW
  const metaRows = [
    { label: s.returnNoLabel, value: returnNum },
    { label: s.orderNoLabel, value: `#${orderNum}` },
    returnRow?.created_at ? { label: s.returnCreatedLabel, value: pdfFmtDate(returnRow.created_at, locale) } : null,
    returnRow?.approved_at ? { label: s.returnApprovedLabel, value: pdfFmtDate(returnRow.approved_at, locale) } : null,
  ].filter(Boolean)

  metaRows.forEach(({ label, value }) => {
    rightY = drawMetaRow(
      doc,
      txt(label, hasUnicode),
      txt(value, hasUnicode),
      rightColX,
      rightY,
      metaLabelW,
      metaValW,
      REG,
    )
  })

  const afterHeader = Math.max(leftY, rightY) + 12
  drawHRule(doc, afterHeader)

  // Greeting
  let y = afterHeader + 10
  const greetingName = customerName || (row.email ? String(row.email).split('@')[0] : 'Kunde')
  doc.fillColor('#1a1a2e').font(REG).fontSize(9.5)
    .text(txt(s.greetingLine(greetingName), hasUnicode), left, y, { width: contentWidth, lineGap: 2 })
  y = doc.y + 2
  doc.font(REG).fontSize(9.5)
    .text(txt(s.returnGreeting, hasUnicode), left, y, { width: contentWidth, lineGap: 2 })

  // Return number highlight box
  y = doc.y + 14
  const boxH = 52
  doc.rect(left, y, contentWidth, boxH).fill(ROW_ALT)
  doc.rect(left, y, contentWidth, boxH).lineWidth(0.8).strokeColor(BORDER).stroke()
  doc.fillColor(MUTED).font(REG).fontSize(7.5)
    .text(txt(s.returnNumberBoxHint, hasUnicode), left + 12, y + 8, {
      width: contentWidth - 24,
      align: 'center',
      lineBreak: false,
    })
  doc.fillColor(ACCENT).font(BOLD).fontSize(18)
    .text(txt(returnNum, hasUnicode), left + 12, y + 22, {
      width: contentWidth - 24,
      align: 'center',
      lineBreak: false,
    })
  doc.y = y + boxH + 12

  // Items table (qty + title, like Lieferschein)
  const tableTop = doc.y
  const descW = Math.round(contentWidth * 0.76)
  const qtyW = contentWidth - descW
  const qtyX = left + descW
  const headerH = 16
  doc.rect(left, tableTop, contentWidth, headerH).fill(ACCENT)
  doc.fillColor('#ffffff').font(REG).fontSize(7.5)
  doc.text(txt(s.returnItemsLabel, hasUnicode), left + 8, tableTop + 4, { width: descW - 12, lineBreak: false })
  doc.text(txt(s.qtyLabel, hasUnicode), qtyX, tableTop + 4, { width: qtyW - 8, align: 'right', lineBreak: false })
  doc.y = tableTop + headerH

  const drawRows = items.length
    ? items
    : [{ title: s.noItems, quantity: '' }]

  drawRows.forEach((it, idx) => {
    const qty = it.quantity != null && it.quantity !== '' ? String(it.quantity) : '—'
    const { main: titleMain, note: titleNote } = splitItemTitle(it.title || it.name || s.itemFallback)
    const title = txt(titleMain, hasUnicode)
    const note = txt(titleNote, hasUnicode)

    doc.font(REG).fontSize(9)
    const titleH = doc.heightOfString(title, { width: descW - 12 })
    doc.font(REG).fontSize(7.5)
    const noteH = note ? doc.heightOfString(note, { width: descW - 12 }) : 0
    const rowH = Math.max(20, titleH + (note ? noteH + 2 : 0) + 10)

    if (doc.y + rowH > doc.page.height - doc.page.margins.bottom - 120) {
      doc.addPage()
      doc.y = doc.page.margins.top + 10
    }

    const rowY = doc.y
    if (idx % 2 === 1) doc.rect(left, rowY, contentWidth, rowH).fill(ROW_ALT)

    doc.font(REG).fontSize(9).fillColor('#111827')
      .text(title, left + 8, rowY + 5, { width: descW - 12 })
    if (note) {
      doc.font(REG).fontSize(7.5).fillColor(MUTED)
        .text(note, left + 8, rowY + 5 + titleH + 1, { width: descW - 12 })
    }
    doc.font(REG).fontSize(9).fillColor('#111827')
      .text(qty, qtyX, rowY + 5, { width: qtyW - 8, align: 'right', lineBreak: false })

    doc.moveTo(left, rowY + rowH).lineTo(right, rowY + rowH)
      .lineWidth(0.3).strokeColor(BORDER).stroke()
    doc.y = rowY + rowH
  })

  // Reason / notes
  const reason = String(returnRow?.reason || '').trim()
  const notes = String(returnRow?.notes || '').trim()
  if (reason || notes) {
    doc.y += 14
    drawHRule(doc, doc.y)
    doc.y += 10
    if (reason) {
      doc.fillColor(MUTED).font(REG).fontSize(7)
        .text(txt(s.returnReasonLabel, hasUnicode), left, doc.y, {
          width: contentWidth,
          characterSpacing: 0.4,
          lineBreak: false,
        })
      doc.y += 10
      doc.fillColor('#1a1a2e').font(REG).fontSize(9)
        .text(txt(reason, hasUnicode), left, doc.y, { width: contentWidth, lineGap: 2 })
      doc.y += 8
    }
    if (notes) {
      doc.fillColor(MUTED).font(REG).fontSize(7)
        .text(txt(s.returnNotesLabel, hasUnicode), left, doc.y, {
          width: contentWidth,
          characterSpacing: 0.4,
          lineBreak: false,
        })
      doc.y += 10
      doc.fillColor('#1a1a2e').font(REG).fontSize(9)
        .text(txt(notes, hasUnicode), left, doc.y, { width: contentWidth, lineGap: 2 })
    }
  }

  // Footer
  const footerY = Math.max(doc.y + 16, doc.page.height - doc.page.margins.bottom - 40)
  doc.fillColor(MUTED).font(REG).fontSize(7)
    .text(txt(s.returnFooter, hasUnicode), left, footerY, { width: contentWidth })
  doc.rect(left, doc.page.height - doc.page.margins.bottom + 8, contentWidth, 2).fill(ACCENT)
}

// ─── Versandlabel (shipping label document) ──────────────────────────────────
function renderVersandlabelDocument(doc, {
  row,
  itemRows = [],
  shopName,
  sellerInfo,
  shopLogoBuffer,
  locale = 'de',
  carrierName = null,
  trackingNumber = null,
}) {
  const hasUnicode = setupDocFonts(doc)
  const REG = hasUnicode ? 'PdfRegular' : 'Helvetica'
  const BOLD = hasUnicode ? 'PdfBold' : 'Helvetica-Bold'
  const s = getOrderPdfStrings(locale)
  const { left, right, contentWidth } = pageMetrics(doc)

  const orderNum = row.order_number != null ? String(row.order_number) : String(row.id || '').slice(0, 8)
  const carrier = String(carrierName || row.carrier_name || '').trim()
  const tracking = String(trackingNumber || row.tracking_number || '').trim()
  const shipAt = row.shipped_at || row.fulfilled_at || row.created_at || null
  const items = Array.isArray(itemRows) ? itemRows : []

  const brandY = 36
  const LOGO_MAX_W = 108
  const LOGO_MAX_H = 28
  const brandBottom = brandY + LOGO_MAX_H

  if (shopLogoBuffer) {
    try {
      doc.image(shopLogoBuffer, left, brandY, { fit: [LOGO_MAX_W, LOGO_MAX_H], align: 'left', valign: 'center' })
    } catch (_) {
      doc.fillColor(ACCENT).font(REG).fontSize(12)
        .text(txt(shopName || 'Andertal', hasUnicode), left, brandY + 6, { width: LOGO_MAX_W, lineBreak: false })
    }
  } else {
    doc.fillColor(ACCENT).font(REG).fontSize(12)
      .text(txt(shopName || 'Andertal', hasUnicode), left, brandY + 6, { width: LOGO_MAX_W, lineBreak: false })
  }

  doc.fillColor(ACCENT).font(REG).fontSize(14)
    .text(txt(s.shippingTitle, hasUnicode), left + LOGO_MAX_W + 16, brandY + 6, {
      width: contentWidth - LOGO_MAX_W - 16,
      align: 'right',
      lineBreak: false,
    })

  const ruleY = brandBottom + 10
  drawHRule(doc, ruleY)

  const headerTop = ruleY + 12
  const gap = 24
  const leftColW = Math.round(contentWidth * 0.55)
  const rightColX = left + leftColW + gap
  const rightColW = contentWidth - leftColW - gap

  let leftY = headerTop
  const sellerLines = resolveSellerDisplayLines(sellerInfo, locale, hasUnicode)
  const senderLines = sellerLines.length
    ? sellerLines
    : [txt(shopName || 'Andertal', hasUnicode)]
  leftY = drawLabel(doc, s.shippingSenderLabel, left, leftY, leftColW, hasUnicode)
  leftY = drawLines(doc, senderLines, left, leftY, leftColW, {
    hasUnicode,
    boldFirst: false,
    fontSize: 8.5,
  })
  leftY += 10

  const customerName = [row.first_name, row.last_name].filter(Boolean).join(' ')
  const shipCountry = getCountryName(row.country || '', locale)
  const recipientLines = [
    customerName || '—',
    row.address_line1,
    row.address_line2,
    [row.postal_code, row.city].filter(Boolean).join(' '),
    shipCountry,
  ].filter(Boolean)
  leftY = drawLabel(doc, s.shippingRecipientLabel, left, leftY, leftColW, hasUnicode)
  leftY = drawLines(doc, recipientLines, left, leftY, leftColW, {
    hasUnicode,
    boldFirst: true,
    fontSize: 9.5,
  })

  let rightY = headerTop
  const metaLabelW = Math.min(100, Math.round(rightColW * 0.46))
  const metaValW = rightColW - metaLabelW
  const metaRows = [
    { label: s.orderNoLabel, value: `#${orderNum}` },
    { label: s.shippingDateMetaLabel, value: pdfFmtDate(shipAt, locale) },
    carrier ? { label: s.carrierLabel, value: carrier } : null,
    tracking ? { label: s.shippingNoLabel, value: tracking } : null,
  ].filter(Boolean)

  metaRows.forEach(({ label, value }) => {
    rightY = drawMetaRow(
      doc,
      txt(label, hasUnicode),
      txt(value, hasUnicode),
      rightColX,
      rightY,
      metaLabelW,
      metaValW,
      REG,
    )
  })

  const afterHeader = Math.max(leftY, rightY) + 12
  drawHRule(doc, afterHeader)

  let y = afterHeader + 10
  const greetingName = customerName || (row.email ? String(row.email).split('@')[0] : 'Kunde')
  doc.fillColor('#1a1a2e').font(REG).fontSize(9.5)
    .text(txt(s.greetingLine(greetingName), hasUnicode), left, y, { width: contentWidth, lineGap: 2 })
  y = doc.y + 2
  doc.font(REG).fontSize(9.5)
    .text(txt(s.shippingGreeting, hasUnicode), left, y, { width: contentWidth, lineGap: 2 })

  // Tracking / order highlight box
  y = doc.y + 14
  const boxH = 52
  const boxValue = tracking || `#${orderNum}`
  doc.rect(left, y, contentWidth, boxH).fill(ROW_ALT)
  doc.rect(left, y, contentWidth, boxH).lineWidth(0.8).strokeColor(BORDER).stroke()
  doc.fillColor(MUTED).font(REG).fontSize(7.5)
    .text(txt(s.shippingTrackingBoxHint, hasUnicode), left + 12, y + 8, {
      width: contentWidth - 24,
      align: 'center',
      lineBreak: false,
    })
  doc.fillColor(ACCENT).font(BOLD).fontSize(tracking ? 16 : 18)
    .text(txt(boxValue, hasUnicode), left + 12, y + 22, {
      width: contentWidth - 24,
      align: 'center',
      lineBreak: false,
    })
  doc.y = y + boxH + 12

  // Items table
  const tableTop = doc.y
  const descW = Math.round(contentWidth * 0.76)
  const qtyW = contentWidth - descW
  const qtyX = left + descW
  const headerH = 16
  doc.rect(left, tableTop, contentWidth, headerH).fill(ACCENT)
  doc.fillColor('#ffffff').font(REG).fontSize(7.5)
  doc.text(txt(s.shippingItemsLabel, hasUnicode), left + 8, tableTop + 4, { width: descW - 12, lineBreak: false })
  doc.text(txt(s.qtyLabel, hasUnicode), qtyX, tableTop + 4, { width: qtyW - 8, align: 'right', lineBreak: false })
  doc.y = tableTop + headerH

  const drawRows = items.length
    ? items
    : [{ title: s.noItems, quantity: '' }]

  drawRows.forEach((it, idx) => {
    const qty = it.quantity != null && it.quantity !== '' ? String(it.quantity) : '—'
    const { main: titleMain, note: titleNote } = splitItemTitle(it.title || it.name || s.itemFallback)
    const title = txt(titleMain, hasUnicode)
    const note = txt(titleNote, hasUnicode)

    doc.font(REG).fontSize(9)
    const titleH = doc.heightOfString(title, { width: descW - 12 })
    doc.font(REG).fontSize(7.5)
    const noteH = note ? doc.heightOfString(note, { width: descW - 12 }) : 0
    const rowH = Math.max(20, titleH + (note ? noteH + 2 : 0) + 10)

    if (doc.y + rowH > doc.page.height - doc.page.margins.bottom - 120) {
      doc.addPage()
      doc.y = doc.page.margins.top + 10
    }

    const rowY = doc.y
    if (idx % 2 === 1) doc.rect(left, rowY, contentWidth, rowH).fill(ROW_ALT)

    doc.font(REG).fontSize(9).fillColor('#111827')
      .text(title, left + 8, rowY + 5, { width: descW - 12 })
    if (note) {
      doc.font(REG).fontSize(7.5).fillColor(MUTED)
        .text(note, left + 8, rowY + 5 + titleH + 1, { width: descW - 12 })
    }
    doc.font(REG).fontSize(9).fillColor('#111827')
      .text(qty, qtyX, rowY + 5, { width: qtyW - 8, align: 'right', lineBreak: false })

    doc.moveTo(left, rowY + rowH).lineTo(right, rowY + rowH)
      .lineWidth(0.3).strokeColor(BORDER).stroke()
    doc.y = rowY + rowH
  })

  const footerY = Math.max(doc.y + 16, doc.page.height - doc.page.margins.bottom - 40)
  doc.fillColor(MUTED).font(REG).fontSize(7)
    .text(txt(s.shippingFooter, hasUnicode), left, footerY, { width: contentWidth })
  doc.rect(left, doc.page.height - doc.page.margins.bottom + 8, contentWidth, 2).fill(ACCENT)
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
  // BonusPunkte.md §3.8 items 2-3: customer_paid_cents/bonus_funding_cents are period sums stored on
  // seller_payouts (added alongside total/commission/payout — see server.js migration) — 0 on rows
  // created before that column existed / not yet re-run through backfill, so both lines stay optional.
  const customerPaidCents = Number(payout.customer_paid_cents || 0)
  const bonusFundingCents = Number(payout.bonus_funding_cents || 0)
  // Prefer the column stored at commission-invoice time; commission_vat_cents may be 0 on older rows
  // even if PLATFORM_VAT_PERCENT is configured now — fall back to computing it live in that case.
  const storedCommissionVat = Number(payout.commission_vat_cents || 0)
  const vatOnCommission = storedCommissionVat > 0
    ? storedCommissionVat
    : (vatPercent > 0 ? Math.round(commissionCents * vatPercent / 100) : 0)
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

  const dueW = 280, dueX = right - dueW
  let dueY = rowY + 14
  const dueRow = (label, valueCents, opts = {}) => {
    doc.rect(dueX, dueY, dueW, 22).fill(opts.bg || '#fafafa').stroke(COMMISSION_BORDER)
    doc.fillColor(opts.color || '#334155').font(opts.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9)
    doc.text(label, dueX + 10, dueY + 6, { width: dueW * 0.55 })
    doc.text(pdfCents(valueCents), dueX + dueW * 0.5, dueY + 6, { width: dueW * 0.45, align: 'right' })
    dueY += 26
  }

  dueRow('Gesamtwarenwert', grossCents)
  if (customerPaidCents > 0) dueRow('Davon vom Kunden gezahlt', customerPaidCents)
  if (bonusFundingCents > 0) dueRow('Davon von Andertal (Bonuspunkte)', bonusFundingCents, { color: '#2563eb' })
  dueRow(`Provision (${displayRate}%)`, commissionCents)
  if (vatOnCommission > 0) dueRow(`MwSt. ${vatPercent}%`, vatOnCommission)

  doc.rect(dueX, dueY, dueW, 28).fill(COMMISSION_ACCENT)
  doc.fillColor('#fff').font('Helvetica-Bold').fontSize(10)
  doc.text('PROVISION FAELLIG', dueX + 10, dueY + 8, { width: dueW * 0.55 })
  doc.text(pdfCents(commissionTotal), dueX + dueW * 0.5, dueY + 7, { width: dueW * 0.45, align: 'right' })
  dueY += 36

  const payoutY = dueY
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
  renderRetourenscheinDocument,
  renderVersandlabelDocument,
  renderCommissionInvoiceDocument,
  renderPeriodCommissionInvoiceDocument,
}
