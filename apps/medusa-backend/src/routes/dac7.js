'use strict'
const { Router } = require('express')

// DAC7 thresholds (EU Directive 2021/514): report sellers with >= 30 transactions OR >= €2,000 revenue in a calendar year.
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

function buildDac7Xml(year, sellers, platformName = 'Andertal') {
  const now = new Date().toISOString().slice(0, 19)
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<!-- DAC7 / § 12 PStTG Meldung — Plattform: ${escapeXml(platformName)} — Meldejahr: ${year} -->`,
    `<!-- Erstellt: ${now} — Enthält ${sellers.length} meldepflichtige Anbieter -->`,
    '<DAC7Report xmlns="urn:oecd:ties:dac:v1">',
    '  <MessageSpec>',
    `    <SendingEntityIN>${escapeXml(platformName)}</SendingEntityIN>`,
    `    <TransmittingCountry>DE</TransmittingCountry>`,
    `    <MessageType>DAC7</MessageType>`,
    `    <MessageRefId>${escapeXml(platformName)}-${year}-${Date.now()}</MessageRefId>`,
    `    <ReportingPeriod>${year}</ReportingPeriod>`,
    `    <Timestamp>${now}</Timestamp>`,
    '  </MessageSpec>',
    '  <ReportableSellers>',
  ]

  for (const s of sellers) {
    const addr = s.business_address || {}
    lines.push('    <ReportableSeller>')
    lines.push(`      <SellerID>${escapeXml(s.seller_id)}</SellerID>`)
    lines.push(`      <Name>${escapeXml(s.store_name || s.company_name || '')}</Name>`)
    lines.push(`      <CompanyName>${escapeXml(s.company_name || '')}</CompanyName>`)
    lines.push(`      <TaxID>${escapeXml(s.tax_id || '')}</TaxID>`)
    lines.push(`      <VatID>${escapeXml(s.vat_id || '')}</VatID>`)
    lines.push(`      <IBAN>${escapeXml(s.iban || '')}</IBAN>`)
    lines.push(`      <Email>${escapeXml(s.email || '')}</Email>`)
    lines.push('      <Address>')
    lines.push(`        <Street>${escapeXml(addr.street || '')}</Street>`)
    lines.push(`        <City>${escapeXml(addr.city || '')}</City>`)
    lines.push(`        <PostalCode>${escapeXml(addr.postal_code || '')}</PostalCode>`)
    lines.push(`        <Country>${escapeXml(addr.country || 'DE')}</Country>`)
    lines.push('      </Address>')
    lines.push('      <ReportingPeriodActivities>')
    lines.push(`        <NumberOfActivities>${s.transaction_count}</NumberOfActivities>`)
    lines.push(`        <TotalConsideration currency="EUR">${(s.revenue_cents / 100).toFixed(2)}</TotalConsideration>`)
    lines.push(`        <Fees>${(s.commission_cents / 100).toFixed(2)}</Fees>`)
    lines.push('      </ReportingPeriodActivities>')
    lines.push('    </ReportableSeller>')
  }

  lines.push('  </ReportableSellers>')
  lines.push('</DAC7Report>')
  return lines.join('\n')
}

module.exports = function createDac7Router({ getSellerDbClient }) {
  const router = Router()

  // GET /admin-hub/v1/dac7/report?year=YYYY — superuser: preview reportable sellers
  router.get('/admin-hub/v1/dac7/report', async (req, res) => {
    if (!req.sellerUser?.is_superuser) return res.status(403).json({ message: 'Superuser access required' })
    const year = parseInt(req.query.year || new Date().getFullYear(), 10)
    if (!year || year < 2023 || year > 2100) return res.status(400).json({ message: 'Invalid year' })

    const client = getSellerDbClient()
    if (!client) return res.status(503).json({ message: 'DB not configured' })
    try {
      await client.connect()

      // Aggregate orders per seller for the given calendar year
      const r = await client.query(
        `SELECT
           su.seller_id,
           su.store_name,
           su.email,
           su.company_name,
           su.tax_id,
           su.vat_id,
           su.iban,
           su.business_address,
           su.lucid_number,
           COALESCE(SUM(o.subtotal_cents), 0)::bigint AS revenue_cents,
           COUNT(o.id)::int AS transaction_count,
           su.commission_rate
         FROM seller_users su
         LEFT JOIN store_orders o
           ON o.seller_id = su.seller_id
           AND o.payment_status = 'bezahlt'
           AND EXTRACT(YEAR FROM o.created_at) = $1
         WHERE su.sub_of_seller_id IS NULL
           AND su.is_superuser = false
         GROUP BY su.seller_id, su.store_name, su.email, su.company_name,
                  su.tax_id, su.vat_id, su.iban, su.business_address,
                  su.lucid_number, su.commission_rate
         HAVING
           COALESCE(SUM(o.subtotal_cents), 0) >= $2
           OR COUNT(o.id) >= $3
         ORDER BY revenue_cents DESC`,
        [year, DAC7_MIN_REVENUE_CENTS, DAC7_MIN_TRANSACTIONS]
      )

      await client.end()

      const sellers = r.rows.map(row => ({
        ...row,
        revenue_cents: parseInt(row.revenue_cents) || 0,
        transaction_count: parseInt(row.transaction_count) || 0,
        commission_cents: Math.round((parseInt(row.revenue_cents) || 0) * (parseFloat(row.commission_rate) || 0.12)),
        revenue_eur: ((parseInt(row.revenue_cents) || 0) / 100).toFixed(2),
        exceeds_revenue: (parseInt(row.revenue_cents) || 0) >= DAC7_MIN_REVENUE_CENTS,
        exceeds_transactions: (parseInt(row.transaction_count) || 0) >= DAC7_MIN_TRANSACTIONS,
      }))

      res.json({
        year,
        reportable_seller_count: sellers.length,
        thresholds: { min_revenue_eur: DAC7_MIN_REVENUE_CENTS / 100, min_transactions: DAC7_MIN_TRANSACTIONS },
        sellers,
      })
    } catch (e) {
      try { await client.end() } catch (_) {}
      res.status(500).json({ message: e?.message || 'Error' })
    }
  })

  // GET /admin-hub/v1/dac7/export?year=YYYY — superuser: download XML
  router.get('/admin-hub/v1/dac7/export', async (req, res) => {
    if (!req.sellerUser?.is_superuser) return res.status(403).json({ message: 'Superuser access required' })
    const year = parseInt(req.query.year || new Date().getFullYear(), 10)
    if (!year || year < 2023 || year > 2100) return res.status(400).json({ message: 'Invalid year' })

    const client = getSellerDbClient()
    if (!client) return res.status(503).json({ message: 'DB not configured' })
    try {
      await client.connect()

      const r = await client.query(
        `SELECT
           su.seller_id, su.store_name, su.email, su.company_name,
           su.tax_id, su.vat_id, su.iban, su.business_address, su.lucid_number,
           COALESCE(SUM(o.subtotal_cents), 0)::bigint AS revenue_cents,
           COUNT(o.id)::int AS transaction_count,
           su.commission_rate
         FROM seller_users su
         LEFT JOIN store_orders o
           ON o.seller_id = su.seller_id
           AND o.payment_status = 'bezahlt'
           AND EXTRACT(YEAR FROM o.created_at) = $1
         WHERE su.sub_of_seller_id IS NULL
           AND su.is_superuser = false
         GROUP BY su.seller_id, su.store_name, su.email, su.company_name,
                  su.tax_id, su.vat_id, su.iban, su.business_address,
                  su.lucid_number, su.commission_rate
         HAVING
           COALESCE(SUM(o.subtotal_cents), 0) >= $2
           OR COUNT(o.id) >= $3
         ORDER BY revenue_cents DESC`,
        [year, DAC7_MIN_REVENUE_CENTS, DAC7_MIN_TRANSACTIONS]
      )

      await client.end()

      const sellers = r.rows.map(row => ({
        ...row,
        revenue_cents: parseInt(row.revenue_cents) || 0,
        transaction_count: parseInt(row.transaction_count) || 0,
        commission_cents: Math.round((parseInt(row.revenue_cents) || 0) * (parseFloat(row.commission_rate) || 0.12)),
      }))

      const xml = buildDac7Xml(year, sellers, 'Andertal')
      res.setHeader('Content-Type', 'application/xml; charset=utf-8')
      res.setHeader('Content-Disposition', `attachment; filename="dac7-${year}.xml"`)
      res.send(xml)
    } catch (e) {
      try { await client.end() } catch (_) {}
      res.status(500).json({ message: e?.message || 'Error' })
    }
  })

  return router
}
