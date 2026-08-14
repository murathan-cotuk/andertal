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

const PLATFORM_ACCENT = '#bae6fd'
const PLATFORM_ACCENT_DARK = '#0369a1'
const PLATFORM_HEADER = '#e0f2fe'
const PLATFORM_BG = '#f0f9ff'
const PLATFORM_BORDER = '#7dd3fc'

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

function parseBusinessAddress(raw) {
  if (!raw) return {}
  if (typeof raw === 'string') {
    try {
      const p = JSON.parse(raw)
      return p && typeof p === 'object' && !Array.isArray(p) ? p : {}
    } catch (_) {
      return {}
    }
  }
  return typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
}

function formatIbanDisplay(iban) {
  const s = String(iban || '').replace(/\s/g, '').toUpperCase()
  if (!s) return ''
  return s.replace(/(.{4})/g, '$1 ').trim()
}

function sellerDisplayName(sellerInfo, shopName) {
  const company = String(sellerInfo?.company_name || '').trim()
  const store = String(sellerInfo?.store_name || '').trim()
  const person = [sellerInfo?.first_name, sellerInfo?.last_name].filter(Boolean).join(' ').trim()
  const named = company || store || person
  // Marketplace merchant invoices must never fall back to the platform brand — otherwise
  // Andertal looks like the seller and would be taxed on the full merchandise turnover.
  if (sellerInfo && sellerInfo._platform !== true) return named
  return named || String(shopName || 'Andertal').trim()
}

function sellerReturnLine(sellerInfo, shopName) {
  const addr = parseBusinessAddress(sellerInfo?.business_address)
  const name = sellerDisplayName(sellerInfo, shopName)
  const street = String(addr.street || addr.address_line1 || '').trim()
  const zip = String(addr.zip || addr.postal_code || '').trim()
  const city = String(addr.city || '').trim()
  const cityLine = [zip, city].filter(Boolean).join(' ') || city
  return [name, street, cityLine].filter(Boolean).join(' | ')
}

function personAddressLines(row, prefix) {
  const p = prefix ? `${prefix}_` : ''
  const name = [row.first_name, row.last_name].filter(Boolean).join(' ')
  const line1 = row[`${p}address_line1`] ?? (prefix ? '' : row.address_line1)
  const line2 = row[`${p}address_line2`] ?? (prefix ? '' : row.address_line2)
  const postal = row[`${p}postal_code`] ?? (prefix ? '' : row.postal_code)
  const city = row[`${p}city`] ?? (prefix ? '' : row.city)
  const country = row[`${p}country`] ?? (prefix ? '' : row.country)
  return {
    name: name || '',
    line1: String(line1 || '').trim(),
    line2: String(line2 || '').trim(),
    cityLine: [String(postal || '').trim(), String(city || '').trim()].filter(Boolean).join(' '),
    country: String(country || '').trim(),
  }
}

function formatAddressLines(parts, locale, hasUnicode) {
  return [
    parts.name,
    parts.line1,
    parts.line2,
    parts.cityLine,
    getCountryName(parts.country, locale),
  ].filter(Boolean).map((l) => txt(l, hasUnicode))
}

function sameAddress(a, b) {
  const norm = (x) => String(x || '').trim().toLowerCase().replace(/\s+/g, ' ')
  return (
    norm(a.line1) === norm(b.line1) &&
    norm(a.line2) === norm(b.line2) &&
    norm(a.cityLine) === norm(b.cityLine) &&
    norm(a.country) === norm(b.country)
  )
}

function billingAddressParts(row) {
  const hasBilling = !!(
    String(row.billing_address_line1 || '').trim() ||
    String(row.billing_city || '').trim() ||
    String(row.billing_postal_code || '').trim()
  )
  if (!hasBilling || row.billing_same_as_shipping === true) {
    return personAddressLines(row, '')
  }
  return {
    name: [row.first_name, row.last_name].filter(Boolean).join(' '),
    line1: String(row.billing_address_line1 || '').trim(),
    line2: String(row.billing_address_line2 || '').trim(),
    cityLine: [String(row.billing_postal_code || '').trim(), String(row.billing_city || '').trim()].filter(Boolean).join(' '),
    country: String(row.billing_country || '').trim(),
  }
}

function collectLegalFooterColumns(sellerInfo, shopName, s) {
  const addr = parseBusinessAddress(sellerInfo?.business_address)
  const name = sellerDisplayName(sellerInfo, shopName)
  const street = String(addr.street || addr.address_line1 || '').trim()
  const zip = String(addr.zip || addr.postal_code || '').trim()
  const city = String(addr.city || '').trim()
  const cityLine = [zip, city].filter(Boolean).join(' ') || city
  const phone = String(sellerInfo?.phone || '').trim()
  const col1 = [name, street, cityLine, phone].filter(Boolean)

  const iban = formatIbanDisplay(sellerInfo?.iban)
  const bic = String(sellerInfo?.payment_bic || '').trim()
  const bank = String(sellerInfo?.payment_bank_name || '').trim()
  const holder = String(sellerInfo?.payment_account_holder || '').trim()
  const col2 = []
  if (iban || bank || bic) {
    col2.push(s.bankLabel)
    if (holder) col2.push(holder)
    if (bank) col2.push(bank)
    if (iban) col2.push(`IBAN ${iban}`)
    if (bic) col2.push(`BIC/SWIFT ${bic}`)
  }

  const gf = String(sellerInfo?.authorized_person_name || sellerInfo?.legal_representative || '').trim()
  const hrb = String(sellerInfo?.legal_trade_register || '').trim()
  const court = String(sellerInfo?.legal_register_court || '').trim()
  const vat = String(sellerInfo?.vat_id || sellerInfo?.legal_vat_id || '').trim()
  const taxId = String(sellerInfo?.tax_id || sellerInfo?.legal_tax_id || '').trim()
  const col3 = []
  if (gf) {
    col3.push(s.managingDirectorLabel)
    col3.push(gf)
  }
  if (hrb) col3.push(`${s.tradeRegisterLabel}: ${hrb}`)
  if (court) col3.push(`${s.registerCourtLabel}: ${court}`)
  if (vat) col3.push(`${s.vatIdPrefix} ${vat}`)
  else if (taxId) col3.push(`${s.vatIdPrefix} ${taxId}`)

  const email = String(sellerInfo?.email || sellerInfo?.legal_email || '').trim()
  const web = String(sellerInfo?.website || '').trim()
  const lucid = String(sellerInfo?.lucid_number || '').trim()
  const col4 = []
  if (email) col4.push(`${s.emailShortLabel}: ${email}`)
  if (web) col4.push(`${s.internetLabel}: ${web}`)
  if (lucid) col4.push(`${s.lucidLabel}: ${lucid}`)

  return [col1, col2, col3, col4].filter((c) => c.length)
}

function drawLegalPageFooter(doc, {
  sellerInfo, shopName, locale, hasUnicode, pageNo, docRef,
}) {
  const s = getOrderPdfStrings(locale)
  const REG = hasUnicode ? 'PdfRegular' : 'Helvetica'
  const { left, right, contentWidth } = pageMetrics(doc)
  const cols = collectLegalFooterColumns(sellerInfo, shopName, s)
  const footerTop = doc.page.height - 78
  doc.moveTo(left, footerTop - 8).lineTo(right, footerTop - 8)
    .lineWidth(0.4).strokeColor(BORDER).stroke()

  if (cols.length) {
    const gap = 10
    const colW = (contentWidth - gap * (cols.length - 1)) / cols.length
    cols.forEach((lines, i) => {
      const x = left + i * (colW + gap)
      let y = footerTop
      lines.forEach((line) => {
        doc.fillColor(MUTED).font(REG).fontSize(6)
          .text(txt(line, hasUnicode), x, y, { width: colW, lineBreak: false })
        y += 8
      })
    })
  }

  const pageText = s.pageLabel(pageNo) + (docRef ? ` (${docRef})` : '')
  doc.fillColor(MUTED).font(REG).fontSize(6.5)
    .text(txt(pageText, hasUnicode), left, doc.page.height - 16, {
      width: contentWidth,
      align: 'right',
      lineBreak: false,
    })
}

// ─── Seller address lines ─────────────────────────────────────────────────────
function resolveSellerDisplayLines(sellerInfo, locale, hasUnicode) {
  if (!sellerInfo) return []
  const s = getOrderPdfStrings(locale)
  const name = sellerDisplayName(sellerInfo, '')
  const addr = parseBusinessAddress(sellerInfo.business_address)
  const lines = [name]
  if (addr.street) lines.push(String(addr.street).trim())
  if (addr.address_line1) lines.push(String(addr.address_line1).trim())
  const zip = String(addr.zip || addr.postal_code || '').trim()
  const city = String(addr.city || '').trim()
  if (zip || city) lines.push([zip, city].filter(Boolean).join(' '))
  const countryRaw = addr.country || addr.country_code || ''
  if (countryRaw) lines.push(getCountryName(countryRaw, locale))
  if (sellerInfo.vat_id) lines.push(`${s.vatIdPrefix}: ${String(sellerInfo.vat_id).trim()}`)
  const taxId = String(sellerInfo.tax_id || sellerInfo.legal_tax_id || '').trim()
  if (taxId) lines.push(`Steuernr.: ${taxId}`)
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
  extraTableRows = [],
  amountDueCents = null,
  footerText = '',
  invoiceNumber = null,
  carrierName = null,
  trackingNumber = null,
  goodsVatPercent = null,
  showMarketplaceNotice = false,
  marketplaceMerchant = false,
}) {
  const hasUnicode = setupDocFonts(doc)
  const REG = hasUnicode ? 'PdfRegular' : 'Helvetica'
  const BOLD = hasUnicode ? 'PdfBold' : 'Helvetica-Bold'
  const s = getOrderPdfStrings(locale)
  const { left, right, contentWidth } = pageMetrics(doc)
  const INK = '#111111'
  const CONTENT_BOTTOM = () => doc.page.height - 92
  const merchantDoc = marketplaceMerchant === true || showMarketplaceNotice === true

  const orderNum = row.order_number != null ? String(row.order_number) : String(row.id || '').slice(0, 8)
  const rawNum = String(invoiceNumber || '').replace(/^[A-Za-z]+-/, '') || orderNum
  const shipAt = row.shipped_at || row.fulfilled_at || row.delivery_date || null
  const carrier = String(carrierName || row.carrier_name || '').trim()
  const tracking = String(trackingNumber || row.tracking_number || '').trim()
  const customerNo = row.customer_number != null && String(row.customer_number).trim() !== ''
    ? String(row.customer_number)
    : ''
  const docRef = kind === 'invoice' ? `RE${rawNum}` : `LS${rawNum}`
  let pageNo = 1

  const stampPageChrome = () => {
    if (shopLogoBuffer && !merchantDoc) {
      try {
        doc.image(shopLogoBuffer, right - 100, 28, { fit: [100, 26], align: 'right', valign: 'center' })
      } catch (_) {}
    }
    drawLegalPageFooter(doc, {
      sellerInfo,
      shopName,
      locale,
      hasUnicode,
      pageNo,
      docRef,
    })
  }
  stampPageChrome()
  doc.on('pageAdded', () => {
    pageNo += 1
    stampPageChrome()
  })

  const billing = billingAddressParts(row)
  const shipping = personAddressLines(row, '')
  const billingLines = formatAddressLines(billing, locale, hasUnicode)
  const shippingLines = formatAddressLines(shipping, locale, hasUnicode)
  const shipSameAsBill = sameAddress(billing, shipping)

  const returnLine = sellerReturnLine(sellerInfo, shopName)
  let leftY = 48
  if (returnLine) {
    doc.fillColor(MUTED).font(REG).fontSize(7)
      .text(txt(returnLine, hasUnicode), left, leftY, { width: Math.round(contentWidth * 0.55), lineBreak: false })
    const underlineY = leftY + 10
    doc.moveTo(left, underlineY).lineTo(left + Math.min(240, Math.round(contentWidth * 0.5)), underlineY)
      .lineWidth(0.4).strokeColor('#94a3b8').stroke()
    leftY = underlineY + 6
  }

  leftY = drawLines(doc, billingLines.length ? billingLines : ['—'], left, leftY, Math.round(contentWidth * 0.55), {
    hasUnicode,
    boldFirst: true,
    fontSize: 9.5,
  })

  const gap = 20
  const leftColW = Math.round(contentWidth * 0.55)
  const rightColX = left + leftColW + gap
  const rightColW = contentWidth - leftColW - gap
  const metaLabelW = Math.min(110, Math.round(rightColW * 0.52))
  const metaValW = rightColW - metaLabelW
  let rightY = 48
  const metaRows = kind === 'invoice'
    ? [
        { label: s.orderJobLabel, value: orderNum },
        { label: s.issueDateLabel + ':', value: pdfFmtDate(row.created_at, locale) },
        customerNo ? { label: s.customerNoLabel, value: customerNo } : null,
        { label: s.deliveryNoteMetaLabel, value: rawNum },
        { label: s.deliveryDateLabel, value: pdfFmtDate(shipAt || row.created_at, locale) },
        { label: s.orderNoLabel.replace(/\s*$/, '') + (s.orderNoLabel.includes(':') ? '' : ':'), value: orderNum },
      ]
    : [
        { label: s.orderJobLabel, value: orderNum },
        { label: s.deliveryDateLabel, value: pdfFmtDate(shipAt || row.created_at, locale) },
        customerNo ? { label: s.customerNoLabel, value: customerNo } : null,
        { label: s.orderNoLabel.replace(/\s*$/, '') + (s.orderNoLabel.includes(':') ? '' : ':'), value: orderNum },
        carrier ? { label: s.carrierLabel + ':', value: carrier } : null,
        tracking ? { label: s.trackingLabel + ':', value: tracking } : null,
      ]
  metaRows.filter(Boolean).forEach(({ label, value }) => {
    rightY = drawMetaRow(doc, txt(label, hasUnicode), txt(value, hasUnicode), rightColX, rightY, metaLabelW, metaValW, REG)
  })

  let y = Math.max(leftY, rightY) + 16
  const heading = `${docTitle} ${rawNum}`.trim()
  doc.fillColor(INK).font(BOLD).fontSize(16)
    .text(txt(heading, hasUnicode), left, y, { width: contentWidth, lineBreak: false })
  y = doc.y + 10

  const issuerLines = resolveSellerDisplayLines(sellerInfo, locale, hasUnicode)
  const issuerFallback = sellerDisplayName(sellerInfo, merchantDoc ? '' : shopName)
  y = drawLabel(doc, s.issuerLabel || s.sellerLabel, left, y, contentWidth, hasUnicode)
  y = drawLines(doc, issuerLines.length ? issuerLines : [txt(issuerFallback || '—', hasUnicode)], left, y, contentWidth, {
    hasUnicode,
    boldFirst: true,
    fontSize: 9,
  })
  y += 8

  doc.fillColor(INK).font(REG).fontSize(9.5)
    .text(txt(s.formalGreeting, hasUnicode), left, y, { width: contentWidth })
  y = doc.y + 2
  doc.font(REG).fontSize(9.5)
    .text(txt(kind === 'invoice' ? s.invoiceGreeting : s.deliveryGreeting, hasUnicode), left, y, { width: contentWidth })
  y = doc.y + 12

  doc.fillColor(MUTED).font(REG).fontSize(8)
    .text(txt(`${s.customerLabel}:`, hasUnicode), left, y, { width: contentWidth })
  y = doc.y + 2
  if (shipSameAsBill) {
    doc.fillColor(INK).font(REG).fontSize(9)
      .text(txt(s.billingEqualsShipping, hasUnicode), left, y, { width: contentWidth })
    y = doc.y + 4
  } else {
    y = drawLines(doc, shippingLines, left, y, contentWidth, { hasUnicode, boldFirst: true, fontSize: 9 })
  }

  doc.fillColor(INK).font(REG).fontSize(9)
    .text(txt(`${s.orderNoLabel.replace(/:?\s*$/, '')}:${orderNum}`, hasUnicode), left, y + 6, { width: contentWidth })
  y = doc.y + 10

  const sellerHasVat = Number(goodsVatPercent) > 0 || !!(sellerInfo && sellerInfo.vat_id && String(sellerInfo.vat_id).trim())
  const goodsVatRate = goodsVatPercent != null && Number(goodsVatPercent) > 0
    ? Number(goodsVatPercent)
    : (sellerHasVat ? 19 : 0)
  const goodsVatLabel = goodsVatRate > 0
    ? `${Math.abs(goodsVatRate - Math.round(goodsVatRate)) < 1e-9 ? String(Math.round(goodsVatRate)) : String(goodsVatRate)}%`
    : '—'

  const isInvoice = kind === 'invoice'
  const posW = 28
  const skuW = 62
  let qtyW, mwstW, unitW, totalW, descW
  if (isInvoice) {
    qtyW = 36
    mwstW = 36
    unitW = 58
    totalW = 62
    descW = contentWidth - posW - skuW - qtyW - mwstW - unitW - totalW
  } else {
    qtyW = 48
    mwstW = 0
    unitW = 0
    totalW = 0
    descW = contentWidth - posW - skuW - qtyW
  }
  const posX = left
  const skuX = posX + posW
  const descX = skuX + skuW
  const qtyX = descX + descW
  const mwstX = qtyX + qtyW
  const unitX = mwstX + mwstW
  const totalX = unitX + unitW

  const drawTableHeader = (top) => {
    doc.moveTo(left, top + 14).lineTo(right, top + 14).lineWidth(0.6).strokeColor(INK).stroke()
    doc.fillColor(INK).font(BOLD).fontSize(7.5)
    doc.text(txt(s.posLabel, hasUnicode), posX, top, { width: posW - 4, lineBreak: false })
    doc.text(txt(s.articleNoLabel, hasUnicode), skuX, top, { width: skuW - 4, lineBreak: false })
    doc.text(txt(s.itemLabel, hasUnicode), descX, top, { width: descW - 6, lineBreak: false })
    doc.text(txt(s.qtyLabel, hasUnicode), qtyX, top, { width: qtyW - 2, align: 'right', lineBreak: false })
    if (isInvoice) {
      doc.text(txt(s.mwstLabel, hasUnicode), mwstX, top, { width: mwstW - 2, align: 'right', lineBreak: false })
      doc.text(txt(s.unitShortLabel, hasUnicode), unitX, top, { width: unitW - 2, align: 'right', lineBreak: false })
      doc.text(txt(s.totalLabel, hasUnicode), totalX, top, { width: totalW, align: 'right', lineBreak: false })
    }
  }

  const tableTop = y
  drawTableHeader(tableTop)
  doc.y = tableTop + 18

  const productRows = (lineItems.length ? lineItems : itemRows)
  const extras = Array.isArray(extraTableRows) ? extraTableRows.slice() : []
  if (isInvoice && extras.length === 0 && shippingCents != null) {
    extras.push({ title: s.shipping, quantity: 1, unit_price_cents: shippingCents })
  }
  const drawRows = (productRows.length ? productRows : [{ title: s.noItems, quantity: 1, unit_price_cents: 0 }]).concat(extras)

  const ensureSpace = (h) => {
    if (doc.y + h > CONTENT_BOTTOM()) {
      doc.addPage()
      doc.y = 48
      drawTableHeader(doc.y)
      doc.y += 18
    }
  }

  drawRows.forEach((it, idx) => {
    const qty = Number(it.quantity || 1)
    const unit = Number(it.unit_price_cents || 0)
    const lineTotal = unit * qty
    const { main: titleMain, note: titleNote } = splitItemTitle(it.title || s.itemFallback)
    const sku = String(it.sku || it.article_no || '').trim()
    const ean = String(it.ean || '').trim()
    const extraNote = String(it.note || '').trim()
    const title = txt(titleMain, hasUnicode)
    const subBits = [titleNote, extraNote, ean ? `EAN: ${ean}` : ''].filter(Boolean)
    const note = txt(subBits.join(' · '), hasUnicode)

    const titleOpts = { width: descW - 8, lineGap: 1 }
    doc.font(REG).fontSize(8.5)
    const titleH = doc.heightOfString(title, titleOpts)
    doc.font(REG).fontSize(7)
    const noteH = note ? doc.heightOfString(note, { width: descW - 8, lineGap: 1 }) : 0
    const rowH = Math.max(18, 4 + titleH + (note ? 2 + noteH : 0) + 4)

    ensureSpace(rowH)

    const rowY = doc.y
    const cellY = rowY + 3
    doc.font(REG).fontSize(8).fillColor(INK)
      .text(String(idx + 1), posX, cellY, { width: posW - 4, lineBreak: false })
      .text(txt(sku || '—', hasUnicode), skuX, cellY, { width: skuW - 4, lineBreak: false })
    doc.font(REG).fontSize(8.5)
      .text(title, descX, cellY, titleOpts)
    if (note) {
      doc.font(REG).fontSize(7).fillColor(MUTED)
        .text(note, descX, cellY + titleH + 1, { width: descW - 8, lineGap: 1 })
    }
    doc.font(REG).fontSize(8.5).fillColor(INK)
      .text(String(qty), qtyX, cellY, { width: qtyW - 2, align: 'right', lineBreak: false })
    if (isInvoice) {
      doc.text(goodsVatLabel, mwstX, cellY, { width: mwstW - 2, align: 'right', lineBreak: false })
      doc.text(pdfCents(unit, locale), unitX, cellY, { width: unitW - 2, align: 'right', lineBreak: false })
      doc.text(pdfCents(lineTotal, locale), totalX, cellY, { width: totalW, align: 'right', lineBreak: false })
    }
    doc.moveTo(left, rowY + rowH).lineTo(right, rowY + rowH)
      .lineWidth(0.25).strokeColor(BORDER).stroke()
    doc.y = rowY + rowH
  })

  if (isInvoice && totalsLines.length) {
    ensureSpace(24 + totalsLines.length * 14 + 40)
    const totalsW = 220
    const totalsX = right - totalsW
    doc.y += 10
    doc.moveTo(totalsX, doc.y).lineTo(right, doc.y).lineWidth(0.5).strokeColor(INK).stroke()
    doc.y += 8

    totalsLines.forEach(({ label, value, bold, color, small }) => {
      const ty = doc.y
      const fs = bold ? 10 : small ? 7.5 : 9
      const hasVal = value != null && value !== ''
      doc.font(bold ? BOLD : REG).fontSize(fs).fillColor(color || INK)
      doc.text(txt(label, hasUnicode), totalsX, ty, {
        width: hasVal ? totalsW * 0.62 : totalsW,
        lineBreak: false,
      })
      if (hasVal) {
        doc.text(txt(value, hasUnicode), totalsX + totalsW * 0.58, ty, {
          width: totalsW * 0.42,
          align: 'right',
          lineBreak: false,
        })
      }
      doc.y = ty + (bold ? 15 : small ? 11 : 13)
    })
  }

  doc.y += 12
  doc.fillColor(MUTED).font(REG).fontSize(7.5)
    .text(txt(s.machineCreated, hasUnicode), left, doc.y, { width: contentWidth })

  const payMethod = String(row.payment_method || '').trim()
  if (isInvoice && payMethod) {
    doc.y += 6
    doc.fillColor(MUTED).font(REG).fontSize(8)
      .text(txt(`${s.paymentMethodLabel}: ${payMethod}`, hasUnicode), left, doc.y, { width: contentWidth })
  }

  const marketplaceNotice = kind === 'invoice' && showMarketplaceNotice
  const resolvedFooter = footerText != null && footerText !== ''
    ? footerText
    : (kind === 'invoice' ? '' : s.deliveryFooter)
  if (marketplaceNotice || resolvedFooter) {
    doc.y += 10
    if (marketplaceNotice) {
      doc.fillColor(MUTED).font(REG).fontSize(7)
        .text(txt(s.sellerDisclaimer, hasUnicode), left, doc.y, { width: contentWidth })
      doc.y += 4
    }
    if (resolvedFooter) {
      doc.fillColor(MUTED).font(REG).fontSize(7)
        .text(txt(resolvedFooter, hasUnicode), left, doc.y, { width: contentWidth })
    }
  }
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
    const titleH = doc.heightOfString(title, { width: descW - 12, lineGap: 2 })
    doc.font(REG).fontSize(7.5)
    const noteH = note ? doc.heightOfString(note, { width: descW - 12, lineGap: 1 }) : 0
    const titleNoteGap = note ? 5 : 0
    const rowH = Math.max(22, 6 + titleH + titleNoteGap + noteH + 6)

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
        .text(note, left + 8, rowY + 5 + titleH + 5, { width: descW - 12, lineGap: 1 })
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
    const titleH = doc.heightOfString(title, { width: descW - 12, lineGap: 2 })
    doc.font(REG).fontSize(7.5)
    const noteH = note ? doc.heightOfString(note, { width: descW - 12, lineGap: 1 }) : 0
    const titleNoteGap = note ? 5 : 0
    const rowH = Math.max(22, 6 + titleH + titleNoteGap + noteH + 6)

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
        .text(note, left + 8, rowY + 5 + titleH + 5, { width: descW - 12, lineGap: 1 })
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

// ─── Commission invoice (totals-only: period or single order) ─────────────────
function renderCommissionSettlementDocument(doc, {
  sellerInfo,
  shopName,
  platformLines = [],
  commissionCents,
  commissionRatePct = 12,
  grossSalesCents,
  payoutCents,
  platformVatPercent = 19,
  invoiceNumber,
  periodLabel = null,
  dateValue = null,
  orderRef = null,
  bonusFundingCents = 0,
  customerPaidCents = 0,
  shippingCents = 0,
  orderCount = null,
  refundCents = 0,
}) {
  const hasUnicode = setupDocFonts(doc)
  const REG = hasUnicode ? 'PdfRegular' : 'Helvetica'
  const BOLD = hasUnicode ? 'PdfBold' : 'Helvetica-Bold'
  const { left, right, contentWidth } = pageMetrics(doc)
  const rate = Number.isFinite(commissionRatePct) && commissionRatePct > 0 ? commissionRatePct : 12
  const gross = Number(grossSalesCents || 0)
  const shipping = Math.max(0, Number(shippingCents || 0))
  const orderValue = gross + shipping
  const commission = Number(commissionCents || 0)
  const payout = Number.isFinite(payoutCents) ? Number(payoutCents) : Math.max(0, gross - commission)
  const vatPercent = Number(platformVatPercent) > 0 ? Number(platformVatPercent) : 19
  const vatOnCommission = Math.round(commission * vatPercent / 100)
  const commissionTotal = commission + vatOnCommission
  const bonus = Math.max(0, Number(bonusFundingCents || 0))
  const customerPaid = Math.max(0, Number(customerPaidCents || 0))

  const t = (s) => txt(s, hasUnicode)

  const _label = (label, x, y, width) => {
    doc.fillColor('#64748b').font(BOLD).fontSize(7.5)
      .text(t(label), x, y, { width, characterSpacing: 0.3 })
  }
  const _lines = (lines, x, y, width, boldFirst = true, fontSize = 8.5) => {
    let cy = y
    lines.forEach((line, i) => {
      if (!line) return
      doc.font(i === 0 && boldFirst ? BOLD : REG)
        .fontSize(i === 0 && boldFirst ? 9.5 : fontSize).fillColor('#1f2937')
        .text(t(line), x, cy, { width, lineGap: 1 })
      cy = doc.y + 1
    })
    return cy
  }

  doc.rect(left, 32, contentWidth, 52).fill(COMMISSION_ACCENT)
  doc.fillColor('#ffffff').font(BOLD).fontSize(11)
    .text(t(shopName || 'Andertal'), left + 14, 44)
  doc.font(REG).fontSize(9).fillColor('#e9d5ff')
    .text(t('Provisionsrechnung'), left + 14, 58)
  doc.fillColor('#ffffff').font(BOLD).fontSize(16)
    .text('PROVISIONSFAKTUR', right - 220, 46, { width: 206, align: 'right' })
  doc.font(REG).fontSize(9).fillColor('#e9d5ff')
    .text(t(invoiceNumber || 'PROV'), right - 220, 64, { width: 206, align: 'right' })

  let y = 100
  doc.fillColor('#334155').font(REG).fontSize(9.5)
  doc.text(t(`Datum: ${pdfFmtDate(dateValue || new Date())}`), left, y); y += 14
  if (periodLabel) { doc.text(t(`Abrechnungszeitraum: ${periodLabel}`), left, y); y += 14 }
  if (orderRef) { doc.text(t(`Bezug Bestellung: #${orderRef}`), left, y); y += 14 }
  if (orderCount != null && Number(orderCount) >= 0) {
    doc.text(t(`Enthaltene Bestellungen: ${Number(orderCount)}`), left, y); y += 14
  }

  const sellerLines = resolveSellerDisplayLines(sellerInfo, 'de', hasUnicode)
  const issuerLines = (platformLines && platformLines.length)
    ? platformLines
    : [shopName || 'Andertal']
  const boxH = Math.max(110, 36 + Math.max(sellerLines.length, issuerLines.length) * 12)
  const colW = Math.floor((contentWidth - 20) / 2)
  const col2X = left + colW + 20
  const boxTop = y + 10

  doc.rect(left, boxTop, colW, boxH).fill(COMMISSION_BG).stroke(COMMISSION_BORDER)
  _label('RECHNUNGSEMPFÄNGER (VERKÄUFER)', left + 10, boxTop + 10, colW - 20)
  _lines(sellerLines.length ? sellerLines : ['—'], left + 10, boxTop + 24, colW - 20)

  doc.rect(col2X, boxTop, colW, boxH).fill('#fafafa').stroke(COMMISSION_BORDER)
  _label('AUSSTELLER (PLATTFORM)', col2X + 10, boxTop + 10, colW - 20)
  _lines(issuerLines, col2X + 10, boxTop + 24, colW - 20)

  const cardsTop = boxTop + boxH + 16
  const cardW = Math.floor((contentWidth - 24) / 3)
  const cards = [
    { label: 'BRUTTOUMSATZ', value: pdfCents(gross), sub: 'Warenverkäufe (Provisionsbasis)' },
    { label: `PROVISION (${rate} %)`, value: pdfCents(commission), sub: 'Marktplatzgebühr (netto)' },
    { label: 'AUSZAHLUNG AN VERKÄUFER', value: pdfCents(payout), sub: 'Bruttoumsatz abzüglich Provision (netto)' },
  ]
  cards.forEach((card, i) => {
    const x = left + i * (cardW + 12)
    doc.rect(x, cardsTop, cardW, 78).fill(i === 1 ? COMMISSION_ACCENT : '#ffffff').stroke(COMMISSION_BORDER)
    doc.fillColor(i === 1 ? '#e9d5ff' : '#64748b').font(BOLD).fontSize(7)
      .text(t(card.label), x + 10, cardsTop + 10, { width: cardW - 20 })
    doc.fillColor(i === 1 ? '#ffffff' : COMMISSION_ACCENT_DARK).font(BOLD).fontSize(14)
      .text(card.value, x + 10, cardsTop + 28, { width: cardW - 20 })
    doc.fillColor(i === 1 ? '#ddd6fe' : '#64748b').font(REG).fontSize(7.5)
      .text(t(card.sub), x + 10, cardsTop + 52, { width: cardW - 20 })
  })

  const tableTop = cardsTop + 96
  doc.fillColor(COMMISSION_ACCENT_DARK).font(BOLD).fontSize(11)
    .text(t('ABRECHNUNG (GESAMT)'), left, tableTop)
  const tTop = tableTop + 18
  const labelW = Math.round(contentWidth * 0.62)
  doc.rect(left, tTop, contentWidth, 18).fill(COMMISSION_ACCENT)
  doc.fillColor('#fff').font(BOLD).fontSize(8)
  doc.text(t('BESCHREIBUNG'), left + 8, tTop + 5, { width: labelW - 12 })
  doc.text(t('BETRAG'), left + labelW, tTop + 5, { width: contentWidth - labelW - 8, align: 'right' })

  const refund = Math.max(0, Number(refundCents || 0))
  const detailRows = [
    { label: 'Bruttoumsatz (Warenverkäufe — Provisionsbasis)', amount: gross },
    shipping > 0 ? { label: 'zzgl. Versand', amount: shipping } : null,
    shipping > 0 ? { label: 'Bestellwert (Ware + Versand)', amount: orderValue } : null,
    { label: 'Vom Kunden gezahlt', amount: customerPaid },
    { label: 'Von Bonuspunkten gezahlt (Andertal)', amount: bonus, info: true },
    { label: `Provision ${rate} % (netto)`, amount: commission },
    { label: `zzgl. MwSt. ${vatPercent} % auf Provision (dem Verkäufer belastet)`, amount: vatOnCommission },
    { label: 'Provision inkl. MwSt. (fällig)', amount: commissionTotal, emphasis: true },
    { label: 'Auszahlung an Verkäufer', amount: payout },
    refund > 0 ? { label: 'Erstattungen im Zeitraum', amount: refund } : null,
  ].filter(Boolean)

  let rowY = tTop + 22
  detailRows.forEach((r) => {
    const h = 22
    if (r.emphasis) doc.rect(left, rowY, contentWidth, h).fill(COMMISSION_ACCENT)
    else if (r.info) doc.rect(left, rowY, contentWidth, h).fill('#eff6ff')
    else doc.rect(left, rowY, contentWidth, h).fill('#fafafa')
    doc.fillColor(r.emphasis ? '#fff' : (r.info ? '#1d4ed8' : '#1f2937'))
      .font(r.emphasis ? BOLD : REG).fontSize(9)
      .text(t(r.label), left + 8, rowY + 6, { width: labelW - 12, lineBreak: false })
    doc.text(pdfCents(r.amount), left + labelW, rowY + 6, { width: contentWidth - labelW - 8, align: 'right', lineBreak: false })
    rowY += h
  })

  doc.y = rowY + 16
  doc.fillColor('#64748b').font(REG).fontSize(8)
    .text(t('Bruttoumsatz ist der Warenwert (Provisionsbasis) — ohne Versand. Bestellwert = Ware + Versand. Vom Kunden gezahlt + Bonuspunkte decken den Bestellwert (abzüglich ggf. Coupons). Die Marktplatzprovision zuzüglich Umsatzsteuer wird dem Verkäufer belastet. Andertal versteuert ausschließlich diese Provision, nicht den Warenumsatz des Verkäufers.'), left, doc.y, { width: contentWidth })
  doc.rect(left, doc.page.height - doc.page.margins.bottom + 8, contentWidth, 3).fill(COMMISSION_ACCENT)
}

function renderCommissionInvoiceDocument(doc, opts) {
  const on = opts.order?.order_number != null
    ? String(opts.order.order_number)
    : String(opts.order?.id || '').slice(0, 8)
  renderCommissionSettlementDocument(doc, {
    sellerInfo: opts.sellerInfo,
    shopName: opts.shopName,
    platformLines: opts.platformLines,
    commissionCents: opts.commissionCents,
    commissionRatePct: opts.commissionRatePct,
    grossSalesCents: opts.grossSalesCents,
    payoutCents: opts.payoutCents,
    platformVatPercent: opts.platformVatPercent,
    invoiceNumber: opts.invoiceNumber,
    periodLabel: opts.periodLabel,
    dateValue: opts.order?.created_at,
    orderRef: on,
    bonusFundingCents: opts.bonusFundingCents || opts.order?.platform_bonus_funding_cents || 0,
    customerPaidCents: opts.customerPaidCents || 0,
    shippingCents: opts.shippingCents || opts.order?.shipping_cents || 0,
    refundCents: opts.refundCents || 0,
  })
}

function renderPeriodCommissionInvoiceDocument(doc, {
  payout,
  shopName,
  platformLines = [],
  platformVatPercent = 19,
  invoiceNumber,
  periodLabel,
}) {
  const ratePct = Math.round(Number(payout.commission_rate || 0.12) * 1000) / 10
  const displayRate = ratePct > 0 && ratePct <= 100 ? ratePct : 12
  const grossCents = Number(payout.total_cents || 0)
  const commissionCents = Number(payout.commission_cents || 0)
  const payoutCents = Number(payout.payout_cents || Math.max(0, grossCents - commissionCents))
  const vatPercent = Number(platformVatPercent) > 0 ? Number(platformVatPercent) : 19
  const sellerInfo = {
    store_name: payout.store_name, company_name: payout.company_name,
    first_name: payout.first_name, last_name: payout.last_name,
    vat_id: payout.vat_id, tax_id: payout.tax_id, email: payout.email, business_address: payout.business_address,
  }
  renderCommissionSettlementDocument(doc, {
    sellerInfo,
    shopName,
    platformLines,
    commissionCents,
    commissionRatePct: displayRate,
    grossSalesCents: grossCents,
    payoutCents,
    platformVatPercent: vatPercent,
    invoiceNumber,
    periodLabel,
    dateValue: new Date(),
    bonusFundingCents: Number(payout.bonus_funding_cents || 0),
    customerPaidCents: Number(payout.customer_paid_cents || 0),
    shippingCents: Number(payout.shipping_cents || 0),
    orderCount: payout.order_count != null ? Number(payout.order_count) : null,
    refundCents: Number(payout.refund_cents || 0),
  })
}


function renderPlatformFinanzamtDocument(doc, {
  shopName,
  platformLines = [],
  invoiceNumber,
  periodLabel = null,
  dateValue = null,
  totals = {},
  ossByCountry = [],
  platformVatPercent = 19,
}) {
  const hasUnicode = setupDocFonts(doc)
  const REG = hasUnicode ? 'PdfRegular' : 'Helvetica'
  const BOLD = hasUnicode ? 'PdfBold' : 'Helvetica-Bold'
  const { left, right, contentWidth } = pageMetrics(doc)
  const t = (s) => txt(s, hasUnicode)

  const gross = Number(totals.gross_sale_cents || 0)
  const shipping = Math.max(0, Number(totals.shipping_cents || 0))
  const customerPaid = Number(totals.customer_paid_cents || 0)
  const bonus = Math.max(0, Number(totals.bonus_funding_cents || 0))
  const orderValue = gross + shipping
  const commission = Number(totals.commission_net_cents || 0)
  const vatPercent = Number(platformVatPercent) > 0 ? Number(platformVatPercent) : 19
  const storedVat = Number(totals.commission_vat_cents || 0)
  const vatOnCommission = storedVat > 0 ? storedVat : Math.round(commission * vatPercent / 100)
  const commissionTotal = commission + vatOnCommission
  const payout = Number(totals.seller_payout_cents || Math.max(0, gross - commission))
  const refund = Math.max(0, Number(totals.refund_cents || 0))
  const orderCount = Number(totals.order_count || 0)
  const sellerCount = Number(totals.seller_count || 0)

  const _label = (label, x, y, width) => {
    doc.fillColor('#64748b').font(BOLD).fontSize(7.5)
      .text(t(label), x, y, { width, characterSpacing: 0.3 })
  }
  const _lines = (lines, x, y, width, boldFirst = true, fontSize = 8.5) => {
    let cy = y
    lines.forEach((line, i) => {
      if (!line) return
      doc.font(i === 0 && boldFirst ? BOLD : REG)
        .fontSize(i === 0 && boldFirst ? 9.5 : fontSize).fillColor('#0c4a6e')
        .text(t(line), x, cy, { width, lineGap: 1 })
      cy = doc.y + 1
    })
    return cy
  }

  doc.rect(left, 32, contentWidth, 52).fill(PLATFORM_HEADER).stroke(PLATFORM_BORDER)
  doc.fillColor(PLATFORM_ACCENT_DARK).font(BOLD).fontSize(11)
    .text(t(shopName || 'Andertal'), left + 14, 44)
  doc.font(REG).fontSize(9).fillColor('#0284c7')
    .text(t('Gesamtabrechnung aller Verkäufer'), left + 14, 58)
  doc.fillColor(PLATFORM_ACCENT_DARK).font(BOLD).fontSize(13)
    .text('PLATTFORMABRECHNUNG', right - 240, 44, { width: 226, align: 'right' })
  doc.font(REG).fontSize(9).fillColor('#0284c7')
    .text(t(invoiceNumber || 'PLAT'), right - 240, 62, { width: 226, align: 'right' })

  let y = 100
  doc.fillColor('#334155').font(REG).fontSize(9.5)
  doc.text(t(`Datum: ${pdfFmtDate(dateValue || new Date())}`), left, y); y += 14
  if (periodLabel) { doc.text(t(`Abrechnungszeitraum: ${periodLabel}`), left, y); y += 14 }
  if (orderCount || sellerCount) {
    doc.text(t(`Bestellungen: ${orderCount}   ·   Verkäufer: ${sellerCount}`), left, y); y += 14
  }

  const issuerLines = (platformLines && platformLines.length) ? platformLines : [shopName || 'Andertal']
  const recipientLines = [
    'Buchhaltung / Finanzamt',
    'Interne Plattformabrechnung',
    'Keine Verkäuferrechnung — Summe aller Marktplatzumsätze',
  ]
  const boxH = Math.max(110, 36 + Math.max(recipientLines.length, issuerLines.length) * 12)
  const colW = Math.floor((contentWidth - 20) / 2)
  const col2X = left + colW + 20
  const boxTop = y + 10

  doc.rect(left, boxTop, colW, boxH).fill(PLATFORM_BG).stroke(PLATFORM_BORDER)
  _label('EMPFÄNGER', left + 10, boxTop + 10, colW - 20)
  _lines(recipientLines, left + 10, boxTop + 24, colW - 20)

  doc.rect(col2X, boxTop, colW, boxH).fill('#ffffff').stroke(PLATFORM_BORDER)
  _label('AUSSTELLER (PLATTFORM)', col2X + 10, boxTop + 10, colW - 20)
  _lines(issuerLines, col2X + 10, boxTop + 24, colW - 20)

  const cardsTop = boxTop + boxH + 16
  const cardW = Math.floor((contentWidth - 24) / 3)
  const cards = [
    { label: 'BRUTTOUMSATZ', value: pdfCents(gross), sub: 'Warenverkäufe aller Verkäufer' },
    { label: 'PROVISION (NETTO)', value: pdfCents(commission), sub: 'Andertal-Marktplatzgebühr' },
    { label: 'AUSZAHLUNG AN VERKÄUFER', value: pdfCents(payout), sub: 'Summe der Händlerauszahlungen' },
  ]
  cards.forEach((card, i) => {
    const x = left + i * (cardW + 12)
    const fill = i === 1 ? PLATFORM_ACCENT : '#ffffff'
    doc.rect(x, cardsTop, cardW, 78).fill(fill).stroke(PLATFORM_BORDER)
    doc.fillColor(PLATFORM_ACCENT_DARK).font(BOLD).fontSize(7)
      .text(t(card.label), x + 10, cardsTop + 10, { width: cardW - 20 })
    doc.fillColor('#0c4a6e').font(BOLD).fontSize(14)
      .text(card.value, x + 10, cardsTop + 28, { width: cardW - 20 })
    doc.fillColor('#64748b').font(REG).fontSize(7.5)
      .text(t(card.sub), x + 10, cardsTop + 52, { width: cardW - 20 })
  })

  const tableTop = cardsTop + 96
  doc.fillColor(PLATFORM_ACCENT_DARK).font(BOLD).fontSize(11)
    .text(t('GESAMTABRECHNUNG (ALLE VERKÄUFER)'), left, tableTop)
  const tTop = tableTop + 18
  const labelW = Math.round(contentWidth * 0.62)
  doc.rect(left, tTop, contentWidth, 18).fill(PLATFORM_ACCENT)
  doc.fillColor('#0c4a6e').font(BOLD).fontSize(8)
  doc.text(t('BESCHREIBUNG'), left + 8, tTop + 5, { width: labelW - 12 })
  doc.text(t('BETRAG'), left + labelW, tTop + 5, { width: contentWidth - labelW - 8, align: 'right' })

  const detailRows = [
    { label: 'Bruttoumsatz (Warenverkäufe — Provisionsbasis)', amount: gross },
    shipping > 0 ? { label: 'zzgl. Versand', amount: shipping } : null,
    shipping > 0 ? { label: 'Bestellwert (Ware + Versand)', amount: orderValue } : null,
    { label: 'Vom Kunden gezahlt', amount: customerPaid },
    { label: 'Von Bonuspunkten gezahlt (Andertal)', amount: bonus, info: true },
    { label: 'Provision netto (Andertal)', amount: commission },
    { label: `zzgl. MwSt. ${vatPercent} % auf Provision`, amount: vatOnCommission },
    { label: 'Provision inkl. MwSt. (Andertal-Umsatz, steuerpflichtig)', amount: commissionTotal, emphasis: true },
    { label: 'Auszahlung an Verkäufer', amount: payout },
    refund > 0 ? { label: 'Erstattungen im Zeitraum', amount: refund } : null,
  ].filter(Boolean)

  let rowY = tTop + 22
  detailRows.forEach((r) => {
    const h = 22
    if (r.emphasis) doc.rect(left, rowY, contentWidth, h).fill(PLATFORM_ACCENT)
    else if (r.info) doc.rect(left, rowY, contentWidth, h).fill('#ecfeff')
    else doc.rect(left, rowY, contentWidth, h).fill(PLATFORM_BG)
    doc.fillColor(r.emphasis ? '#0c4a6e' : (r.info ? '#0e7490' : '#1f2937'))
      .font(r.emphasis ? BOLD : REG).fontSize(9)
      .text(t(r.label), left + 8, rowY + 6, { width: labelW - 12, lineBreak: false })
    doc.text(pdfCents(r.amount), left + labelW, rowY + 6, { width: contentWidth - labelW - 8, align: 'right', lineBreak: false })
    rowY += h
  })

  const oss = Array.isArray(ossByCountry) ? ossByCountry.filter((r) => r && Number(r.order_count || 0) > 0) : []
  if (oss.length) {
    rowY += 18
    if (rowY > doc.page.height - 180) {
      doc.addPage()
      rowY = 48
    }
    doc.fillColor(PLATFORM_ACCENT_DARK).font(BOLD).fontSize(11)
      .text(t('OSS — UMSATZ NACH BESTIMMUNGSLAND'), left, rowY)
    rowY += 16
    const cols = [0.18, 0.16, 0.22, 0.22, 0.22]
    const headers = ['Land', 'Bestellungen', 'Brutto', 'Netto (Ware)', 'USt Ware']
    doc.rect(left, rowY, contentWidth, 16).fill(PLATFORM_ACCENT)
    let hx = left
    headers.forEach((h, i) => {
      const w = Math.round(contentWidth * cols[i])
      doc.fillColor('#0c4a6e').font(BOLD).fontSize(7.5)
        .text(t(h), hx + 6, rowY + 4, { width: w - 10, align: i === 0 ? 'left' : 'right' })
      hx += w
    })
    rowY += 16
    oss.slice(0, 18).forEach((row, idx) => {
      const h = 16
      doc.rect(left, rowY, contentWidth, h).fill(idx % 2 ? PLATFORM_BG : '#ffffff')
      const vals = [
        String(row.country || '—'),
        String(row.order_count || 0),
        pdfCents(row.gross_cents),
        pdfCents(row.net_cents),
        pdfCents(row.vat_cents),
      ]
      let vx = left
      vals.forEach((v, i) => {
        const w = Math.round(contentWidth * cols[i])
        doc.fillColor('#1f2937').font(REG).fontSize(8)
          .text(v, vx + 6, rowY + 4, { width: w - 10, align: i === 0 ? 'left' : 'right', lineBreak: false })
        vx += w
      })
      rowY += h
    })
  }

  doc.y = rowY + 16
  doc.fillColor('#64748b').font(REG).fontSize(8)
    .text(t('Diese Plattformabrechnung fasst den Gesamtumsatz aller Verkäufer zusammen. Bruttoumsatz ist der Warenwert (Provisionsbasis). Versand ist getrennt. Bestellwert = vom Kunden gezahlt + von Bonuspunkten gezahlt. Einzelne Provisionsrechnungen an Verkäufer stehen unter Provisionsrechnungen. Andertal versteuert ausschließlich die Marktplatzprovision zuzüglich Umsatzsteuer.'), left, doc.y, { width: contentWidth })
  doc.rect(left, doc.page.height - doc.page.margins.bottom + 8, contentWidth, 3).fill(PLATFORM_ACCENT)
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
  renderPlatformFinanzamtDocument,
}
