/**
 * Generate Rechnung / Lieferschein / Provisionsfaktur PDF buffers for nodemailer attachments.
 */

const { resolveOrderPaidTotalCents, orderBonusDiscountCents, orderCouponDiscountCents } = require('./order-money')

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

const pdfFmtDate = (d) => {
  if (!d) return '—'
  try {
    return new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
  } catch (_) {
    return '—'
  }
}

const pdfCents = (c) => (Number(c || 0) / 100).toLocaleString('de-DE', { minimumFractionDigits: 2 }) + ' EUR'

/** Vendor info block: store_name / company_name / first+last, address, vat_id. */
function resolveSellerDisplayLines(sellerInfo) {
  if (!sellerInfo) return []
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
  if (sellerInfo.vat_id) lines.push(`USt-IdNr.: ${String(sellerInfo.vat_id).trim()}`)
  return lines.filter(Boolean)
}

/**
 * Render customer invoice (Rechnung) into an open PDFKit document.
 * @param {object} sellerInfo - optional, from seller_users row
 */
function renderInvoicePdfDocument(doc, { row, itemRows, orderId, invoiceNumber, shopName, sellerInfo }) {
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

  doc.rect(left, 34, contentWidth, 44).fill('#111827')
  doc
    .fillColor('#ffffff')
    .font('Helvetica-Bold')
    .fontSize(16)
    .text(pdfDeLatin(shopName || 'Andertal'), left + 14, 49, { width: contentWidth - 28, align: 'left' })

  doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(25).text('RECHNUNG', left, 94)
  doc.font('Helvetica').fontSize(10).fillColor('#4b5563').text(`Rechnungs-Nr.: ${invoiceNumber}`, right - invoiceMetaWidth, 96, {
    width: invoiceMetaWidth,
    align: 'right',
  })
  doc.text(`Datum: ${pdfFmtDate(row.created_at)}`, right - invoiceMetaWidth, 111, { width: invoiceMetaWidth, align: 'right' })
  doc.text(`Bestell-ID: ${orderId}`, right - invoiceMetaWidth, 126, { width: invoiceMetaWidth, align: 'right' })

  doc.fillColor('#111827').font('Helvetica-Bold').fontSize(10).text('KUNDE', left, 152)
  doc.font('Helvetica').fontSize(10).fillColor('#1f2937')
  ;[customerName || '—', row.email || null].filter(Boolean).forEach((line) => {
    doc.text(pdfDeLatin(line), left, doc.y + 1)
  })

  const addressTop = 152
  const rightColumnX = left + Math.round(contentWidth / 2) + 8
  doc.font('Helvetica-Bold').fontSize(10).fillColor('#111827').text('LIEFERADRESSE', rightColumnX, addressTop)
  doc.font('Helvetica').fontSize(10).fillColor('#1f2937')
  ;[customerName, row.address_line1, row.address_line2, [row.postal_code, row.city].filter(Boolean).join(' '), row.country]
    .filter(Boolean)
    .forEach((line) => doc.text(pdfDeLatin(line), rightColumnX, doc.y + 1))

  if (billingAddressDifferent) {
    const nextY = Math.max(doc.y, 216)
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#111827').text('RECHNUNGSADRESSE', rightColumnX, nextY)
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
  doc.text('ARTIKEL', left + 8, tableTop + 7, { width: tableTitleW - 16 })
  doc.text('MENGE', left + tableTitleW + 4, tableTop + 7, { width: tableQtyW - 8, align: 'right' })
  doc.text('EINZELPREIS', tableUnitX + 4, tableTop + 7, { width: tableUnitW - 8, align: 'right' })
  doc.text('GESAMT', tableTotalX + 4, tableTop + 7, { width: tableTotalW - 8, align: 'right' })
  doc.y = tableTop + 27

  const drawItemRow = (it) => {
    const qty = Number(it.quantity || 1)
    const unit = Number(it.unit_price_cents || 0)
    const lineTotal = unit * qty
    const title = pdfDeLatin(it.title || 'Artikel')
    const titleHeight = doc.heightOfString(title, { width: tableTitleW - 16, align: 'left' })
    const rowHeight = Math.max(20, titleHeight + 8)
    const y = doc.y
    if (y + rowHeight + 120 > doc.page.height - doc.page.margins.bottom) {
      doc.addPage()
      doc.rect(left, doc.page.margins.top, contentWidth, 22).fill('#f3f4f6')
      doc.fillColor('#111827').font('Helvetica-Bold').fontSize(9)
      doc.text('ARTIKEL', left + 8, doc.page.margins.top + 7, { width: tableTitleW - 16 })
      doc.text('MENGE', left + tableTitleW + 4, doc.page.margins.top + 7, { width: tableQtyW - 8, align: 'right' })
      doc.text('EINZELPREIS', tableUnitX + 4, doc.page.margins.top + 7, { width: tableUnitW - 8, align: 'right' })
      doc.text('GESAMT', tableTotalX + 4, doc.page.margins.top + 7, { width: tableTotalW - 8, align: 'right' })
      doc.y = doc.page.margins.top + 27
    }
    const rowY = doc.y
    doc.font('Helvetica').fontSize(10).fillColor('#111827').text(title, left + 8, rowY + 4, { width: tableTitleW - 16 })
    doc.text(String(qty), left + tableTitleW + 4, rowY + 4, { width: tableQtyW - 8, align: 'right' })
    doc.text(pdfCents(unit), tableUnitX + 4, rowY + 4, { width: tableUnitW - 8, align: 'right' })
    doc.text(pdfCents(lineTotal), tableTotalX + 4, rowY + 4, { width: tableTotalW - 8, align: 'right' })
    doc.moveTo(left, rowY + rowHeight).lineTo(right, rowY + rowHeight).lineWidth(0.5).strokeColor('#e5e7eb').stroke()
    doc.y = rowY + rowHeight + 2
  }

  if (!itemRows.length) {
    drawItemRow({ title: 'Keine Artikel', quantity: 1, unit_price_cents: 0 })
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
  drawTotalLine('Zwischensumme', pdfCents(subtotal))
  drawTotalLine('Versand', shipping > 0 ? pdfCents(shipping) : '0,00 EUR (kostenlos)')
  const pts = Number(row.bonus_points_redeemed || 0)
  if (bonusDisc > 0) drawTotalLine(`Bonuspunkte (${pts} Pkt.)`, `-${pdfCents(bonusDisc)}`)
  const cc = row.coupon_code ? String(row.coupon_code).trim() : ''
  if (couponDisc > 0) drawTotalLine(cc ? `Gutschein (${pdfDeLatin(cc)})` : 'Gutschein', `-${pdfCents(couponDisc)}`)
  const remainder = Math.max(0, discount - bonusDisc - couponDisc)
  if (remainder > 0) drawTotalLine('Rabatt', `-${pdfCents(remainder)}`)
  doc.moveTo(totalsX, doc.y).lineTo(right, doc.y).lineWidth(1).strokeColor('#d1d5db').stroke()
  doc.y += 4
  drawTotalLine('Gesamt (Brutto)', pdfCents(grandTotal), true)

  // VAT breakdown (extracted from gross price)
  doc.y += 4
  const sellerVatId = sellerInfo?.vat_id ? String(sellerInfo.vat_id).trim() : ''
  if (sellerVatId) {
    const vatCents = Math.round(grandTotal * 19 / 119)
    const netCents = grandTotal - vatCents
    drawTotalLine('darin enthaltene 19% MwSt.', pdfCents(vatCents), false, '#6b7280')
    drawTotalLine('Nettobetrag', pdfCents(netCents), false, '#6b7280')
  } else {
    doc.font('Helvetica').fontSize(8.5).fillColor('#6b7280')
    doc.text(
      pdfDeLatin('Gemaess §19 UStG wird keine Umsatzsteuer ausgewiesen (Kleinunternehmerregelung).'),
      totalsX,
      doc.y,
      { width: totalsWidth, align: 'left' },
    )
    doc.y += 14
  }

  // Seller info block
  const sellerLines = resolveSellerDisplayLines(sellerInfo)
  if (sellerLines.length) {
    doc.y += 10
    const sellerBlockY = doc.y
    if (sellerBlockY + sellerLines.length * 13 + 40 > doc.page.height - doc.page.margins.bottom) {
      doc.addPage()
    }
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#374151').text('VERKAEUFER', left, doc.y)
    doc.font('Helvetica').fontSize(9).fillColor('#4b5563')
    sellerLines.forEach((line) => {
      doc.text(pdfDeLatin(line), left, doc.y + 2)
    })
    doc.y += 6
    doc.font('Helvetica').fontSize(8.5).fillColor('#6b7280')
    doc.text(
      pdfDeLatin('Der Kaufvertrag wird ausschliesslich zwischen dem Kaeufer und dem oben genannten Verkaeufer geschlossen. Andertal Marktplatz handelt als technischer Vermittler und ist nicht Vertragspartei.'),
      left,
      doc.y,
      { width: contentWidth, align: 'left' },
    )
  }

  // Footer
  doc.font('Helvetica').fontSize(8.5).fillColor('#6b7280')
  doc.text(
    pdfDeLatin('Bei Fragen zu Ihrer Bestellung wenden Sie sich bitte direkt an den Verkaeufer. Andertal ist Marktplatzbetreiber und nicht Verkaeufer der Ware.'),
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

function renderLieferscheinPdfDocument(doc, { row, itemRows, invoiceNumber, shopName }) {
  const on = invoiceNumber
  doc.fontSize(20).fillColor('#111').text(pdfDeLatin('Lieferschein'), { align: 'right' })
  doc.moveDown(0.2)
  doc.fontSize(9).fillColor('#666').text(pdfDeLatin(shopName), { align: 'right' })
  doc.fillColor('#111')
  doc.moveDown(1.2)
  doc.fontSize(10).text(`Lieferschein-Nr.: ${on}`)
  doc.text(`Datum: ${pdfFmtDate(row.created_at)}`)
  doc.moveDown(0.6)
  doc.fontSize(10).font('Helvetica-Bold').text(pdfDeLatin('Lieferadresse'))
  doc.font('Helvetica').fontSize(9)
  const custName = [row.first_name, row.last_name].filter(Boolean).join(' ')
  ;[custName, row.address_line1, row.address_line2, [row.postal_code, row.city].filter(Boolean).join(' '), row.country]
    .filter(Boolean)
    .forEach((line) => doc.text(pdfDeLatin(line)))
  doc.moveDown(0.8)
  if (row.carrier_name || row.tracking_number) {
    doc.fontSize(10).font('Helvetica-Bold').text(pdfDeLatin('Versand'))
    doc.font('Helvetica').fontSize(9)
    if (row.carrier_name) doc.text(pdfDeLatin(String(row.carrier_name)))
    if (row.tracking_number) doc.text(`Tracking: ${pdfDeLatin(String(row.tracking_number))}`)
    doc.moveDown(0.6)
  }
  doc.fontSize(10).font('Helvetica-Bold').text(pdfDeLatin('Packstücke / Artikel'))
  doc.font('Helvetica').fontSize(9)
  itemRows.forEach((it) => {
    const qty = Number(it.quantity || 1)
    doc.text(`${qty} x ${pdfDeLatin(it.title || 'Artikel')}${it.product_handle ? ` (${pdfDeLatin(it.product_handle)})` : ''}`, {
      width: 500,
    })
  })
  doc.font('Helvetica').fontSize(8).fillColor('#666')
  doc.moveDown(1)
  doc.text(pdfDeLatin('Dieser Lieferschein dient der Zuordnung der Sendung. Keine Rechnung.'), { width: 480 })
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

async function buildInvoicePdfBuffer(pgClient, orderId) {
  const id = String(orderId || '').trim()
  const oRes = await pgClient.query('SELECT * FROM store_orders WHERE id = $1::uuid', [id])
  const row = oRes.rows && oRes.rows[0]
  if (!row) return null
  const iRes = await pgClient.query('SELECT * FROM store_order_items WHERE order_id = $1 ORDER BY created_at', [id])
  const itemRows = iRes.rows || []
  const sellerInfo = await _querySellerInfo(pgClient, row.seller_id)
  const on = row.order_number != null ? String(row.order_number) : String(id).slice(0, 8)
  const shopName = process.env.SHOP_INVOICE_NAME || 'Andertal'
  const buf = await pdfDocToBuffer((doc) =>
    renderInvoicePdfDocument(doc, {
      row,
      itemRows,
      orderId: id,
      invoiceNumber: on,
      shopName,
      sellerInfo,
    }),
  )
  return { filename: `Rechnung-${on}.pdf`, content: buf }
}

async function buildLieferscheinPdfBuffer(pgClient, orderId) {
  const id = String(orderId || '').trim()
  const oRes = await pgClient.query('SELECT * FROM store_orders WHERE id = $1::uuid', [id])
  const row = oRes.rows && oRes.rows[0]
  if (!row) return null
  const iRes = await pgClient.query('SELECT * FROM store_order_items WHERE order_id = $1 ORDER BY created_at', [id])
  const itemRows = iRes.rows || []
  const on = row.order_number != null ? String(row.order_number) : String(id).slice(0, 8)
  const shopName = process.env.SHOP_INVOICE_NAME || 'Andertal'
  const buf = await lieferscheinDocToBuffer((doc) =>
    renderLieferscheinPdfDocument(doc, { row, itemRows, invoiceNumber: on, shopName }),
  )
  return { filename: `Lieferschein-${on}.pdf`, content: buf }
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
  renderProvisionsfakturPdfDocument,
}
