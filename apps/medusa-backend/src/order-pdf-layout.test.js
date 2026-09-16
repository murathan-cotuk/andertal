'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const PDFDocument = require('pdfkit')
const { renderRetailOrderDocument } = require('./order-pdf-layout')

function sampleRow() {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    order_number: '10042',
    created_at: '2026-09-01T10:00:00.000Z',
    customer_number: 'K-999',
    first_name: 'Max',
    last_name: 'Mustermann',
    address_line1: 'Musterstrasse 1',
    postal_code: '10115',
    city: 'Berlin',
    country: 'DE',
    payment_method: 'card',
  }
}

function sampleSeller() {
  return {
    shop_name: 'Demo Shop',
    legal_name: 'Demo GmbH',
    vat_id: 'DE123456789',
    email: 'demo@example.com',
    business_address: { street: 'Sellerweg 2', zip: '80331', city: 'Muenchen', country: 'DE' },
  }
}

function renderBuffered(kind) {
  const doc = new PDFDocument({ margin: 42, size: 'A4', compress: false, bufferPages: true })
  let extraPages = 0
  doc.on('pageAdded', () => { extraPages += 1 })
  renderRetailOrderDocument(doc, {
    docTitle: kind === 'invoice' ? 'Rechnung' : 'Lieferschein',
    row: sampleRow(),
    itemRows: [{ title: 'Testartikel', quantity: 1, unit_price_cents: 1999, sku: 'SKU-1' }],
    shopName: 'Andertal',
    sellerInfo: sampleSeller(),
    locale: 'de',
    kind,
    invoiceNumber: '10042',
    totalsLines: [{ label: 'Gesamt', value: '19,99 EUR', bold: true }],
    showMarketplaceNotice: true,
    marketplaceMerchant: true,
  })
  const count = doc.bufferedPageRange().count
  doc.end()
  return { count, extraPages }
}

describe('renderPlatformFinanzamtDocument', () => {
  it('fits a typical period on one page without a blank first page', () => {
    const { renderPlatformFinanzamtDocument } = require('./order-pdf-layout')
    const doc = new PDFDocument({ margin: 50, size: 'A4', compress: false, bufferPages: true })
    let extraPages = 0
    doc.on('pageAdded', () => { extraPages += 1 })
    renderPlatformFinanzamtDocument(doc, {
      shopName: 'Andertal',
      invoiceNumber: 'PLAT-202608',
      periodLabel: '01.08.2026 – 15.08.2026',
      totals: {
        gross_sale_cents: 5299,
        shipping_cents: 800,
        shipping_payout_cents: 0,
        label_cents: 800,
        customer_paid_cents: 5299,
        bonus_funding_cents: 0,
        commission_net_cents: 636,
        commission_vat_cents: 121,
        seller_payout_cents: 4663,
        refund_cents: 0,
        order_count: 1,
        seller_count: 1,
      },
      ossByCountry: [{ country: 'DE', order_count: 1, gross_cents: 5299, net_cents: 4453, vat_cents: 846 }],
    })
    const count = doc.bufferedPageRange().count
    doc.end()
    assert.equal(count, 1)
    assert.equal(extraPages, 0)
  })
})

describe('renderRetailOrderDocument', () => {
  it('keeps a short invoice on a single page (no blank first page)', () => {
    const { count, extraPages } = renderBuffered('invoice')
    assert.equal(count, 1)
    assert.equal(extraPages, 0)
  })

  it('keeps a short delivery note on a single page', () => {
    const { count, extraPages } = renderBuffered('lieferschein')
    assert.equal(count, 1)
    assert.equal(extraPages, 0)
  })
})
