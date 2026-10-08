'use strict'
const { Router } = require('express')
const { dac7FiguresWithLegacy, dac7MissingFields } = require('../settlement/reporting')

// Reporting thresholds as implemented before (EU Directive 2021/514 de-minimis for goods sellers:
// fewer than 30 sales AND ≤ 2,000 € → not reportable). Confirm with the tax advisor before filing.
const DAC7_MIN_TRANSACTIONS = 30
const DAC7_MIN_REVENUE_CENTS = 200000 // €2,000

function escapeXml(str) {
  if (str == null) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

const eur = (cents) => (Number(cents || 0) / 100).toFixed(2)

/**
 * INTERNAL preview export. This is NOT the official BZSt / OECD DPI XML schema and must not be
 * submitted as a DAC7 report — it lists the data points per seller so the official report (BZSt
 * portal / ELMA, or Stripe Platform Tax Reporting as a helper) can be prepared and checked.
 */
function buildDac7PreviewXml(year, sellers, platformName = 'Andertal') {
  const now = new Date().toISOString().slice(0, 19)
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!-- INTERNE VORSCHAU — KEINE offizielle DAC7-/PStTG-Meldung und NICHT das BZSt-XML-Schema. -->',
    `<!-- Plattform: ${escapeXml(platformName)} — Meldejahr: ${year} — erstellt ${now} -->`,
    `<Dac7InternalPreview xmlns="urn:andertal:internal:dac7-preview:v1" year="${year}" generated="${now}">`,
  ]
  for (const s of sellers) {
    const addr = s.business_address || {}
    lines.push('  <Seller>')
    lines.push(`    <SellerId>${escapeXml(s.seller_id)}</SellerId>`)
    lines.push(`    <EntityType>${escapeXml(s.legal_entity_type || '')}</EntityType>`)
    lines.push(`    <LegalName>${escapeXml(s.legal_name || s.company_name || [s.first_name, s.last_name].filter(Boolean).join(' '))}</LegalName>`)
    lines.push(`    <DateOfBirth>${escapeXml(s.date_of_birth ? String(s.date_of_birth).slice(0, 10) : '')}</DateOfBirth>`)
    lines.push(`    <TIN country="${escapeXml(s.tax_id_country || '')}">${escapeXml(s.tax_id || '')}</TIN>`)
    lines.push(`    <VatId>${escapeXml(s.vat_id || '')}</VatId>`)
    lines.push(`    <BusinessRegistration country="${escapeXml(s.business_registration_country || '')}">${escapeXml(s.business_registration_number || '')}</BusinessRegistration>`)
    lines.push(`    <FinancialAccount>${escapeXml(s.iban || '')}</FinancialAccount>`)
    lines.push('    <Address>')
    lines.push(`      <Street>${escapeXml(addr.street || addr.line1 || '')}</Street>`)
    lines.push(`      <PostalCode>${escapeXml(addr.postal_code || '')}</PostalCode>`)
    lines.push(`      <City>${escapeXml(addr.city || '')}</City>`)
    lines.push(`      <Country>${escapeXml(addr.country || '')}</Country>`)
    lines.push('    </Address>')
    for (const q of s.quarters || []) {
      lines.push(`    <Quarter q="${q.quarter}" activities="${q.transaction_count}" gross="${eur(q.gross_cents)}" refunds="${eur(q.refunds_cents)}" consideration="${eur(q.consideration_cents)}" fees="${eur(q.fees_cents)}" currency="EUR"/>`)
    }
    if (s.includes_estimate) lines.push('    <EstimateIncluded>true</EstimateIncluded>')
    lines.push(`    <MissingFields>${escapeXml((s.missing_fields || []).join(', '))}</MissingFields>`)
    lines.push('  </Seller>')
  }
  lines.push('</Dac7InternalPreview>')
  return lines.join('\n')
}

module.exports = function createDac7Router({ getSellerDbClient }) {
  const router = Router()

  /** Figures from the settlement ledger (seller line items, quarterly) + the seller's legal data. */
  const loadReport = async (client, year) => {
    const figures = await dac7FiguresWithLegacy(client, year)
    const ids = figures.map((f) => f.seller_id)
    const su = ids.length
      ? (await client.query(
        `SELECT seller_id, store_name, email, company_name, first_name, last_name, legal_entity_type, legal_name,
                date_of_birth, tax_id, tax_id_country, vat_id, business_registration_number, business_registration_country,
                iban, business_address
           FROM seller_users WHERE seller_id = ANY($1::text[]) AND sub_of_seller_id IS NULL AND COALESCE(is_superuser, false) = false`,
        [ids],
      )).rows
      : []
    const byId = new Map(su.map((r) => [r.seller_id, r]))
    return figures
      .filter((f) => byId.has(f.seller_id))
      .map((f) => {
        const s = byId.get(f.seller_id)
        return {
          ...s,
          ...f,
          revenue_cents: f.consideration_cents,
          commission_cents: f.fees_cents,
          // De minimis (PStTG § 4 Abs. 5 Nr. 4): excluded with < 30 sales AND ≤ 2 000 € — exactly 2 000 € is not reportable.
          exceeds_revenue: f.consideration_cents > DAC7_MIN_REVENUE_CENTS,
          exceeds_transactions: f.transaction_count >= DAC7_MIN_TRANSACTIONS,
          missing_fields: dac7MissingFields(s),
        }
      })
      .filter((s) => s.exceeds_revenue || s.exceeds_transactions)
      .sort((a, b) => b.consideration_cents - a.consideration_cents)
  }

  // GET /admin-hub/v1/dac7/report?year=YYYY — superuser: preview reportable sellers
  router.get('/admin-hub/v1/dac7/report', async (req, res) => {
    if (!req.sellerUser?.is_superuser) return res.status(403).json({ message: 'Superuser access required' })
    const year = parseInt(req.query.year || new Date().getFullYear(), 10)
    if (!year || year < 2023 || year > 2100) return res.status(400).json({ message: 'Invalid year' })
    const client = getSellerDbClient()
    if (!client) return res.status(503).json({ message: 'DB not configured' })
    try {
      await client.connect()
      const sellers = await loadReport(client, year)
      await client.end()
      res.json({
        year,
        source: 'settlement_ledger',
        note: 'Interne Auswertung: ab Settlement-Cutover aus dem Ledger, davor aus Bestellpositionen GESCHÄTZT (includes_estimate). Vergütung = nach Abzug der Plattformgebühren. Keine offizielle DAC7-Meldung.',
        reportable_seller_count: sellers.length,
        thresholds: { min_revenue_eur: DAC7_MIN_REVENUE_CENTS / 100, min_transactions: DAC7_MIN_TRANSACTIONS },
        sellers: sellers.map((s) => ({ ...s, revenue_eur: eur(s.revenue_cents) })),
      })
    } catch (e) {
      try { await client.end() } catch (_) {}
      res.status(500).json({ message: e?.message || 'Error' })
    }
  })

  // GET /admin-hub/v1/dac7/export?year=YYYY — superuser: INTERNAL preview XML (not the BZSt format)
  router.get('/admin-hub/v1/dac7/export', async (req, res) => {
    if (!req.sellerUser?.is_superuser) return res.status(403).json({ message: 'Superuser access required' })
    const year = parseInt(req.query.year || new Date().getFullYear(), 10)
    if (!year || year < 2023 || year > 2100) return res.status(400).json({ message: 'Invalid year' })
    const client = getSellerDbClient()
    if (!client) return res.status(503).json({ message: 'DB not configured' })
    try {
      await client.connect()
      const sellers = await loadReport(client, year)
      await client.end()
      res.setHeader('Content-Type', 'application/xml; charset=utf-8')
      res.setHeader('Content-Disposition', `attachment; filename="dac7-interne-vorschau-${year}.xml"`)
      res.send(buildDac7PreviewXml(year, sellers, 'Andertal'))
    } catch (e) {
      try { await client.end() } catch (_) {}
      res.status(500).json({ message: e?.message || 'Error' })
    }
  })

  return router
}

module.exports.buildDac7PreviewXml = buildDac7PreviewXml
