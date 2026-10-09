'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const jtl = require('./index')

const DAY = 86400000

test('§3.1 eligibility: first-time, returning after 12 months, active within 12 months', () => {
  const at = new Date('2026-10-07T10:00:00Z')
  assert.deepEqual(jtl.evaluateEligibility({ lastSaleAt: null, at }), { eligible: true, reason: 'first_time_customer' })
  assert.equal(jtl.evaluateEligibility({ lastSaleAt: new Date(at - 400 * DAY), at }).eligible, true)
  assert.equal(jtl.evaluateEligibility({ lastSaleAt: new Date(at - 180 * DAY), at }).eligible, false)
})

test('periods and the §3.3 deadline (5th of the month after the quarter, Berlin time)', () => {
  assert.deepEqual(jtl.periodOf('2026-03-31T22:30:00Z'), { month: '2026-04', quarter: '2026-Q2' }) // already April in Berlin
  assert.equal(jtl.reportDeadline('2026-Q1'), '2026-04-05')
  assert.equal(jtl.reportDeadline('2026-Q4'), '2027-01-05')
  assert.equal(jtl.previousQuarter(new Date('2026-01-03T10:00:00Z')), '2025-Q4')
  assert.deepEqual(jtl.parseQuarter('2026-Q3').months, ['2026-07', '2026-08', '2026-09'])
  assert.equal(jtl.parseQuarter('2026-Q5'), null)
})

test('CSV export has the minimum columns and a total line', () => {
  const csv = jtl.reportCsv({
    rows: [{ period: '2026-Q1', month: '2026-01', seller_id: 's1', jtl_external_id: 'J1', seller_name: 'A; GmbH', gross_gmv_cents: 10000, provision_1pct_cents: 100, currency: 'EUR', order_count: 1 }],
    totals: { gross_gmv_cents: 10000, provision_1pct_cents: 100 },
  }, { declaration: 'yes' })
  const lines = csv.trim().split('\n')
  assert.equal(lines[0], jtl.CSV_COLUMNS.join(';'))
  assert.match(lines[1], /"A; GmbH"/)
  assert.match(lines[2], /^TOTAL;/)
})

// ── Integration against the settlement tables (real PostgreSQL) ──────────────
const h = (() => { try { return require('../settlement/test-helpers') } catch (_) { return null } })()
const skip = !(h && h.TEST_PG_URL) && 'SETTLEMENT_TEST_PG_URL not set'

test('100 € sale → 1 € accrual; partial refund reverses pro rata; non-JTL seller excluded; seller ledger untouched', { skip }, async () => {
  const s = require('../settlement')
  const c = await h.freshDatabase()
  try {
    await jtl.ensureJtlPartnerSchema(c)
    await h.addSeller(c, 'seller_jtl')
    await h.addSeller(c, 'seller_plain')
    // Attributed before the order (first-time customer → eligible).
    const { attribution } = await jtl.attributeJtlSeller(c, { sellerId: 'seller_jtl', source: 'jtl_scx_signup', externalId: 'SCX-1', at: new Date(Date.now() - 2 * DAY) })
    assert.equal(attribution.eligible, true)
    // Idempotent while open.
    assert.equal((await jtl.attributeJtlSeller(c, { sellerId: 'seller_jtl', source: 'manual_superuser' })).existing, true)

    const { order, items } = await h.addPaidOrder(c, { items: [{ seller: 'seller_jtl', price: 10000 }], shippingBySeller: { seller_jtl: 0 } })
    const other = await h.addPaidOrder(c, { items: [{ seller: 'seller_plain', price: 5000 }] })
    await s.createPayablesForOrder(c, order.id)
    await s.createPayablesForOrder(c, other.order.id)
    const ledgerBefore = await h.balanceOf(c, 'seller_jtl')

    const first = await jtl.syncJtlAccruals(c)
    assert.equal(first.sales, 1)
    assert.equal((await jtl.syncJtlAccruals(c)).sales, 0) // idempotent

    const stripe = h.fakeStripe()
    const { refund } = await s.createRefundRecord(c, { orderId: order.id, amountCents: 3000, lines: null, sellerScope: 'seller_jtl', idempotencyKey: 'r1' })
    await s.executeRefund(c, stripe, refund.id)
    assert.equal((await jtl.syncJtlAccruals(c)).refunds, 1)

    const { quarter } = jtl.periodOf(new Date())
    const report = await jtl.jtlQuarterReport(c, quarter)
    assert.equal(report.totals.gross_gmv_cents, 10000 - 3000)
    assert.equal(report.totals.provision_1pct_cents, 100 - 30)
    assert.equal(report.totals.seller_count, 1)
    assert.ok(report.rows.every((r) => r.seller_id === 'seller_jtl'))
    assert.equal(items.length, 1)
    // The JTL 1 % never touches the seller's money.
    assert.equal(await h.balanceOf(c, 'seller_jtl'), ledgerBefore - 3000 + Math.round(3000 * 0.12))
  } finally {
    await c.end()
  }
})

test('a seller active within the last 12 months is recorded but not eligible (no accruals)', { skip }, async () => {
  const s = require('../settlement')
  const c = await h.freshDatabase()
  try {
    await jtl.ensureJtlPartnerSchema(c)
    await h.addSeller(c, 'seller_old')
    const { order } = await h.addPaidOrder(c, { items: [{ seller: 'seller_old', price: 2000 }] })
    await s.createPayablesForOrder(c, order.id)
    await c.query(`UPDATE order_payments SET payment_succeeded_at = now() - interval '180 days', created_at = now() - interval '180 days'`)
    const { attribution } = await jtl.attributeJtlSeller(c, { sellerId: 'seller_old', source: 'jtl_scx_signup' })
    assert.equal(attribution.eligible, false)
    assert.equal(attribution.eligibility_reason, 'active_within_12_months')
    const later = await h.addPaidOrder(c, { items: [{ seller: 'seller_old', price: 3000 }] })
    await s.createPayablesForOrder(c, later.order.id)
    assert.equal((await jtl.syncJtlAccruals(c)).sales, 0)
  } finally {
    await c.end()
  }
})

test('auto send: JTL_REPORT_AUTO_SEND=false forces it off; only due from the 4th to the 10th after a quarter', async () => {
  const prev = process.env.JTL_REPORT_AUTO_SEND
  try {
    process.env.JTL_REPORT_AUTO_SEND = 'false'
    assert.deepEqual(await jtl.autoSendDueJtlReport(null, { now: new Date('2026-04-04T08:00:00Z'), sendEmail: () => {} }), { skipped: 'disabled' })
    process.env.JTL_REPORT_AUTO_SEND = 'true'
    assert.deepEqual(await jtl.autoSendDueJtlReport(null, { now: new Date('2026-05-04T08:00:00Z'), sendEmail: () => {} }), { skipped: 'not_due' })
    assert.deepEqual(await jtl.autoSendDueJtlReport(null, { now: new Date('2026-04-11T08:00:00Z'), sendEmail: () => {} }), { skipped: 'not_due' })
    assert.deepEqual(await jtl.autoSendDueJtlReport(null, { now: new Date('2026-04-03T08:00:00Z'), sendEmail: () => {} }), { skipped: 'not_due' })
  } finally {
    if (prev === undefined) delete process.env.JTL_REPORT_AUTO_SEND; else process.env.JTL_REPORT_AUTO_SEND = prev
  }
})

test('report flow: active Flows entry turns auto send on; template, recipient and CC from settings; declaration always included', { skip }, async () => {
  const c = await h.freshDatabase()
  const prev = process.env.JTL_REPORT_AUTO_SEND
  try {
    delete process.env.JTL_REPORT_AUTO_SEND
    await jtl.ensureJtlPartnerSchema(c)
    await c.query(`CREATE TABLE admin_hub_flows (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text, trigger_key text, status text, audience text, created_at timestamptz DEFAULT now())`)
    await c.query(`CREATE TABLE admin_hub_flow_steps (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), flow_id uuid, step_order int, step_type text, email_subject text, email_body text, email_i18n jsonb, email_attachments jsonb)`)
    const now = new Date('2026-04-04T08:00:00Z')
    const mails = []
    const sendEmail = async (m) => { mails.push(m); return { id: `msg_${mails.length}` } }

    assert.deepEqual(await jtl.autoSendDueJtlReport(c, { now, sendEmail }), { skipped: 'disabled' }) // no flow yet
    assert.equal((await jtl.seedJtlReportFlow(c)).created, true)
    assert.equal((await jtl.seedJtlReportFlow(c)).created, false)
    // created inside the window → no surprise send this quarter
    assert.deepEqual(await jtl.autoSendDueJtlReport(c, { now: new Date(), sendEmail }).then((r) => r.skipped === 'flow_created_in_window' || r.skipped === 'not_due'), true)
    await c.query(`UPDATE admin_hub_flows SET created_at = '2026-01-01T00:00:00Z'`)
    await assert.rejects(jtl.saveReportSettings(c, { recipient: 'not-an-email', cc: '' }), /Invalid recipient/)
    await jtl.saveReportSettings(c, { recipient: 'reporting@jtl.example', cc: 'su@andertal.example', actor: 'su' })
    // superuser edits the template in Flows and drops the declaration placeholder
    await c.query(`UPDATE admin_hub_flow_steps SET email_i18n = $1::jsonb`, [JSON.stringify({ de: { subject: 'Reporting {PERIOD} — Andertal', body: '<p>Zeitraum {PERIOD}: {GROSS_GMV} / {PROVISION}</p>{MONTH_TABLE}' } })])

    const r = await jtl.autoSendDueJtlReport(c, { now, sendEmail })
    assert.equal(r.sent, true)
    assert.equal(r.period, '2026-Q1')
    assert.equal(mails[0].to, 'reporting@jtl.example')
    assert.equal(mails[0].cc, 'su@andertal.example')
    assert.equal(mails[0].subject, 'Reporting 2026-Q1 — Andertal')
    assert.match(mails[0].html, /Zeitraum 2026-Q1: 0,00/)
    assert.match(mails[0].html, /vollständig und richtig/)
    assert.match(mails[0].text, /vollständig und richtig/)
    assert.equal(mails[0].attachments.length, 1)
    assert.deepEqual(await jtl.autoSendDueJtlReport(c, { now: new Date('2026-04-05T08:00:00Z'), sendEmail }), { skipped: 'already_sent', period: '2026-Q1' })

    await c.query(`UPDATE admin_hub_flows SET status = 'paused'`)
    assert.deepEqual(await jtl.autoSendDueJtlReport(c, { now: new Date('2026-07-04T08:00:00Z'), sendEmail }), { skipped: 'disabled' })
    assert.equal(mails.length, 1)
  } finally {
    if (prev === undefined) delete process.env.JTL_REPORT_AUTO_SEND; else process.env.JTL_REPORT_AUTO_SEND = prev
    await c.end()
  }
})

test('report e-mail: declaration required, dry run to the given address, real send stamps the batch', { skip }, async () => {
  const s = require('../settlement')
  const c = await h.freshDatabase()
  try {
    await jtl.ensureJtlPartnerSchema(c)
    await h.addSeller(c, 'seller_jtl')
    await jtl.attributeJtlSeller(c, { sellerId: 'seller_jtl', source: 'manual_superuser', at: new Date(Date.now() - DAY) })
    const { order } = await h.addPaidOrder(c, { items: [{ seller: 'seller_jtl', price: 10000 }] })
    await s.createPayablesForOrder(c, order.id)
    const { quarter } = jtl.periodOf(new Date())
    const mails = []
    const sendEmail = async (m) => { mails.push(m); return { id: `msg_${mails.length}` } }

    await assert.rejects(jtl.sendJtlReport(c, { period: quarter, confirmAccuracy: false, actor: 'su', sendEmail }), /Accuracy declaration/)
    await jtl.sendJtlReport(c, { period: quarter, confirmAccuracy: true, actor: 'su@x', dryRun: true, recipient: 'su@x', sendEmail })
    assert.equal(mails[0].to, 'su@x')
    assert.match(mails[0].subject, /^\[TEST\] Andertal JTL Partner Reporting/)
    assert.equal((await c.query('SELECT COUNT(*)::int AS n FROM jtl_partner_accruals WHERE reporting_batch_id IS NOT NULL')).rows[0].n, 0)

    const { send } = await jtl.sendJtlReport(c, { period: quarter, confirmAccuracy: true, actor: 'su@x', sendEmail })
    assert.equal(mails[1].to, 'technologiepartner@jtl-software.de')
    assert.match(mails[1].text, /vollständig und richtig/)
    assert.match(mails[1].attachments[0].content.toString('utf8'), /seller_jtl;.*;10000;100;EUR;1;true/)
    assert.equal(send.status, 'sent')
    assert.equal((await c.query('SELECT COUNT(*)::int AS n FROM jtl_partner_accruals WHERE reporting_batch_id = $1', [send.id])).rows[0].n, 1)
  } finally {
    await c.end()
  }
})
