'use strict'

/**
 * JTL partnership — 1 % partner commission Andertal owes JTL (docs/jtl.md, Marktplatzpartnervertrag §3).
 *
 * This is NOT seller commission and never touches seller money: nothing here writes to
 * seller_ledger_entries / seller_payables / payouts. It is a separate, append-only platform
 * liability ledger fed idempotently from the settlement tables (paid seller payables and
 * succeeded refunds), so the settlement code itself stays untouched.
 *
 * Contract rules implemented:
 *  - §3.1 eligibility: a JTL user (seller) who becomes an Andertal customer for the first time as a
 *    result of the partnership, or returns after 12 months without business (no sale in the 12
 *    months before the attribution). Billbee / organic sign-ups are never attributed.
 *  - §3.1 basis: the seller's total gross revenue on the marketplace towards third parties —
 *    basket value incl. shipping. We use the seller's payable gross (goods + shipping, VAT
 *    included) and subtract refunds proportionally (refund lines), see docs/jtl.md B3.
 *  - §3.2 USt comes on top (invoiced by JTL); we store the net 1 % and an estimated USt column.
 *  - §3.3 quarterly report by the 5th of the following month, broken down by month, with a
 *    declaration of completeness and accuracy.
 */

const PROVISION_RATE = 0.01
const VAT_RATE = 0.19 // JTL-Software-GmbH, DE — estimate only; the invoice is authoritative
const TWELVE_MONTHS_MS = 365 * 24 * 60 * 60 * 1000
const ATTRIBUTION_SOURCES = new Set(['jtl_scx_signup', 'manual_superuser'])

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS jtl_partner_attributions (
     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     seller_id varchar(255) NOT NULL,
     jtl_external_id text,
     source varchar(40) NOT NULL,
     attributed_at timestamptz NOT NULL DEFAULT now(),
     eligible boolean NOT NULL,
     eligibility_reason text,
     last_sale_before_at timestamptz,
     ended_at timestamptz,
     actor text,
     created_at timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS idx_jtl_attr_seller ON jtl_partner_attributions(seller_id)`,
  `CREATE TABLE IF NOT EXISTS jtl_partner_accruals (
     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     idempotency_key text NOT NULL UNIQUE,
     attribution_id uuid NOT NULL REFERENCES jtl_partner_attributions(id),
     seller_id varchar(255) NOT NULL,
     order_id uuid,
     payable_id uuid,
     refund_id uuid,
     kind varchar(20) NOT NULL CHECK (kind IN ('sale', 'refund')),
     occurred_at timestamptz NOT NULL,
     period_month varchar(7) NOT NULL,
     period_quarter varchar(7) NOT NULL,
     gross_cents bigint NOT NULL,
     provision_cents bigint NOT NULL,
     currency varchar(3) NOT NULL DEFAULT 'EUR',
     reporting_batch_id uuid,
     created_at timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS idx_jtl_accr_quarter ON jtl_partner_accruals(period_quarter)`,
  `CREATE TABLE IF NOT EXISTS jtl_report_sends (
     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     period_quarter varchar(7) NOT NULL,
     recipient text NOT NULL,
     dry_run boolean NOT NULL DEFAULT false,
     trigger varchar(20) NOT NULL DEFAULT 'manual',
     accuracy_confirmed_by text,
     accuracy_confirmed_at timestamptz,
     totals jsonb NOT NULL DEFAULT '{}'::jsonb,
     status varchar(20) NOT NULL DEFAULT 'pending',
     message_id text,
     error text,
     sent_at timestamptz,
     created_at timestamptz NOT NULL DEFAULT now()
   )`,
]

async function ensureJtlPartnerSchema(client) {
  for (const sql of SCHEMA) await client.query(sql)
}

// ── Periods (Europe/Berlin) ──────────────────────────────────────────────────

const TZ = 'Europe/Berlin'
function berlinParts(date) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(date).map((x) => [x.type, x.value]))
  return { y: Number(p.year), m: Number(p.month), d: Number(p.day) }
}
function periodOf(date) {
  const { y, m } = berlinParts(new Date(date))
  return { month: `${y}-${String(m).padStart(2, '0')}`, quarter: `${y}-Q${Math.ceil(m / 3)}` }
}
function parseQuarter(q) {
  const m = /^(\d{4})-Q([1-4])$/.exec(String(q || '').trim())
  if (!m) return null
  const year = Number(m[1]); const n = Number(m[2])
  const months = [1, 2, 3].map((i) => `${year}-${String((n - 1) * 3 + i).padStart(2, '0')}`)
  return { year, n, months, key: `${year}-Q${n}` }
}
function previousQuarter(now = new Date()) {
  const { y, m } = berlinParts(now)
  const q = Math.ceil(m / 3)
  return q === 1 ? `${y - 1}-Q4` : `${y}-Q${q - 1}`
}
/** §3.3: report due by the 5th of the month after the quarter. */
function reportDeadline(quarterKey) {
  const q = parseQuarter(quarterKey)
  if (!q) return null
  const m = q.n * 3 + 1
  const year = m > 12 ? q.year + 1 : q.year
  return `${year}-${String(m > 12 ? 1 : m).padStart(2, '0')}-05`
}

// ── Attribution (Faz A) ──────────────────────────────────────────────────────

/** §3.1: first-time customer, or returning after 12 months without business. */
function evaluateEligibility({ lastSaleAt, at = new Date() }) {
  if (!lastSaleAt) return { eligible: true, reason: 'first_time_customer' }
  const gap = new Date(at).getTime() - new Date(lastSaleAt).getTime()
  if (gap > TWELVE_MONTHS_MS) return { eligible: true, reason: 'returning_after_12_months' }
  return { eligible: false, reason: 'active_within_12_months' }
}

async function lastSaleBefore(client, sellerId, at) {
  const r = await client.query(
    `SELECT MAX(COALESCE(op.payment_succeeded_at, op.created_at)) AS t
       FROM seller_payables p JOIN order_payments op ON op.order_id = p.order_id
      WHERE p.seller_id = $1 AND COALESCE(op.payment_succeeded_at, op.created_at) < $2`,
    [sellerId, at],
  ).catch(() => ({ rows: [{}] }))
  return r.rows[0]?.t || null
}

/**
 * Records a JTL attribution for a seller (SCX sign-up hook or superuser). Idempotent while an
 * attribution is open; a seller already counting (eligible + open) is returned unchanged.
 */
async function attributeJtlSeller(client, { sellerId, source, externalId = null, actor = 'system', at = new Date() }) {
  const sid = String(sellerId || '').trim()
  if (!sid || sid === 'default') throw Object.assign(new Error('seller_id required'), { status: 400 })
  if (!ATTRIBUTION_SOURCES.has(source)) throw Object.assign(new Error(`invalid attribution source: ${source}`), { status: 400 })
  const open = (await client.query(
    `SELECT * FROM jtl_partner_attributions WHERE seller_id = $1 AND ended_at IS NULL ORDER BY attributed_at DESC LIMIT 1`, [sid],
  )).rows[0]
  if (open) return { attribution: open, existing: true }
  const last = await lastSaleBefore(client, sid, at)
  const ev = evaluateEligibility({ lastSaleAt: last, at })
  const row = (await client.query(
    `INSERT INTO jtl_partner_attributions (seller_id, jtl_external_id, source, attributed_at, eligible, eligibility_reason, last_sale_before_at, actor)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [sid, externalId, source, at, ev.eligible, ev.reason, last, actor],
  )).rows[0]
  return { attribution: row, existing: false }
}

/** JTL connection ended (disconnect / contract end, §4.5) — no accruals after this instant. */
async function endJtlAttribution(client, { sellerId, actor = 'system', at = new Date() }) {
  const r = await client.query(
    `UPDATE jtl_partner_attributions SET ended_at = $2, actor = COALESCE(actor, '') || ' / ended by ' || $3
      WHERE seller_id = $1 AND ended_at IS NULL RETURNING *`,
    [String(sellerId || '').trim(), at, actor],
  )
  return r.rows
}

// ── Accruals (Faz B) ─────────────────────────────────────────────────────────

const provisionOf = (grossCents) => Math.round(Number(grossCents) * PROVISION_RATE)

/**
 * Idempotent sync from the settlement tables: one 'sale' accrual per paid payable of an
 * eligible, attributed seller (paid at/after attribution, before it ended), one negative
 * 'refund' accrual per succeeded refund line on such a payable. Safe to run any time.
 */
async function syncJtlAccruals(client) {
  const sales = await client.query(
    `INSERT INTO jtl_partner_accruals
       (idempotency_key, attribution_id, seller_id, order_id, payable_id, kind, occurred_at,
        period_month, period_quarter, gross_cents, provision_cents)
     SELECT 'sale:' || p.id, a.id, p.seller_id, p.order_id, p.id, 'sale', t.at,
            to_char(t.at AT TIME ZONE 'Europe/Berlin', 'YYYY-MM'),
            to_char(t.at AT TIME ZONE 'Europe/Berlin', 'YYYY') || '-Q' || to_char(t.at AT TIME ZONE 'Europe/Berlin', 'Q'),
            p.gross_cents + p.shipping_cents,
            ROUND((p.gross_cents + p.shipping_cents) * ${PROVISION_RATE})
       FROM seller_payables p
       JOIN order_payments op ON op.order_id = p.order_id
       CROSS JOIN LATERAL (SELECT COALESCE(op.payment_succeeded_at, op.created_at) AS at) t
       JOIN jtl_partner_attributions a
         ON a.seller_id = p.seller_id AND a.eligible
        AND t.at >= a.attributed_at AND (a.ended_at IS NULL OR t.at < a.ended_at)
      WHERE p.gross_cents + p.shipping_cents > 0
     ON CONFLICT (idempotency_key) DO NOTHING`,
  )
  const refunds = await client.query(
    `INSERT INTO jtl_partner_accruals
       (idempotency_key, attribution_id, seller_id, order_id, payable_id, refund_id, kind, occurred_at,
        period_month, period_quarter, gross_cents, provision_cents)
     SELECT 'refund:' || l.id, s.attribution_id, s.seller_id, s.order_id, s.payable_id, r.id, 'refund', t.at,
            to_char(t.at AT TIME ZONE 'Europe/Berlin', 'YYYY-MM'),
            to_char(t.at AT TIME ZONE 'Europe/Berlin', 'YYYY') || '-Q' || to_char(t.at AT TIME ZONE 'Europe/Berlin', 'Q'),
            -(l.gross_cents + l.shipping_cents),
            -ROUND((l.gross_cents + l.shipping_cents) * ${PROVISION_RATE})
       FROM order_refund_lines l
       JOIN order_refunds r ON r.id = l.refund_id AND r.status = 'succeeded'
       CROSS JOIN LATERAL (SELECT COALESCE(r.succeeded_at, r.updated_at) AS at) t
       JOIN jtl_partner_accruals s ON s.payable_id = l.payable_id AND s.kind = 'sale'
      WHERE l.gross_cents + l.shipping_cents > 0
     ON CONFLICT (idempotency_key) DO NOTHING`,
  )
  return { sales: sales.rowCount || 0, refunds: refunds.rowCount || 0 }
}

// ── Reporting (Faz C/D) ──────────────────────────────────────────────────────

/** Quarter report: per month × seller, plus totals (docs/jtl.md §9 minimum schema). */
async function jtlQuarterReport(client, quarterKey) {
  const q = parseQuarter(quarterKey)
  if (!q) throw Object.assign(new Error('period must look like 2026-Q1'), { status: 400 })
  await syncJtlAccruals(client)
  const rows = (await client.query(
    `SELECT a.period_month AS month, a.seller_id,
            MAX(att.jtl_external_id) AS jtl_external_id,
            MAX(COALESCE(su.company_name, su.store_name, su.email)) AS seller_name,
            SUM(a.gross_cents)::bigint AS gross_gmv_cents,
            SUM(a.provision_cents)::bigint AS provision_1pct_cents,
            COUNT(DISTINCT a.order_id) FILTER (WHERE a.kind = 'sale')::int AS order_count,
            MAX(a.currency) AS currency
       FROM jtl_partner_accruals a
       JOIN jtl_partner_attributions att ON att.id = a.attribution_id
       LEFT JOIN seller_users su ON su.seller_id = a.seller_id
      WHERE a.period_quarter = $1
      GROUP BY a.period_month, a.seller_id
      ORDER BY a.period_month, a.seller_id`,
    [q.key],
  )).rows.map((r) => ({
    period: q.key, month: r.month, seller_id: r.seller_id, jtl_external_id: r.jtl_external_id || '',
    seller_name: r.seller_name || '', gross_gmv_cents: Number(r.gross_gmv_cents), provision_1pct_cents: Number(r.provision_1pct_cents),
    currency: r.currency || 'EUR', order_count: Number(r.order_count),
  }))
  const byMonth = q.months.map((m) => {
    const rs = rows.filter((r) => r.month === m)
    return { month: m, gross_gmv_cents: rs.reduce((s, r) => s + r.gross_gmv_cents, 0), provision_1pct_cents: rs.reduce((s, r) => s + r.provision_1pct_cents, 0), order_count: rs.reduce((s, r) => s + r.order_count, 0) }
  })
  const gross = byMonth.reduce((s, m) => s + m.gross_gmv_cents, 0)
  const provision = byMonth.reduce((s, m) => s + m.provision_1pct_cents, 0)
  const sellers = (await client.query(
    `SELECT att.seller_id, att.jtl_external_id, att.source, att.attributed_at, att.eligible, att.eligibility_reason, att.ended_at,
            COALESCE(su.company_name, su.store_name, su.email) AS seller_name,
            (SELECT MAX(occurred_at) FROM jtl_partner_accruals x WHERE x.seller_id = att.seller_id AND x.kind = 'sale') AS last_sale_at
       FROM jtl_partner_attributions att LEFT JOIN seller_users su ON su.seller_id = att.seller_id
      ORDER BY att.attributed_at DESC`,
  )).rows
  const lastSend = (await client.query(
    `SELECT * FROM jtl_report_sends WHERE period_quarter = $1 AND NOT dry_run ORDER BY created_at DESC LIMIT 1`, [q.key],
  )).rows[0] || null
  return {
    period: q.key,
    deadline: reportDeadline(q.key),
    totals: {
      gross_gmv_cents: gross,
      provision_1pct_cents: provision,
      vat_estimate_cents: Math.round(provision * VAT_RATE),
      seller_count: new Set(rows.map((r) => r.seller_id)).size,
    },
    by_month: byMonth,
    rows,
    sellers,
    last_send: lastSend,
  }
}

const CSV_COLUMNS = ['period', 'month', 'seller_id', 'jtl_external_id', 'seller_name', 'gross_gmv_cents', 'provision_1pct_cents', 'currency', 'order_count', 'accuracy_declaration']

function reportCsv(report, { declaration = '' } = {}) {
  const esc = (v) => {
    const s = String(v ?? '')
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const lines = [CSV_COLUMNS.join(';')]
  for (const r of report.rows) lines.push(CSV_COLUMNS.map((c) => esc(c === 'accuracy_declaration' ? declaration : r[c])).join(';'))
  lines.push(['TOTAL', '', '', '', '', report.totals.gross_gmv_cents, report.totals.provision_1pct_cents, 'EUR', report.rows.reduce((s, r) => s + r.order_count, 0), declaration].map(esc).join(';'))
  return lines.join('\n') + '\n'
}

// ── Report e-mail (Faz D) ────────────────────────────────────────────────────

const DEFAULT_RECIPIENT = 'technologiepartner@jtl-software.de' // §3.3
const reportRecipient = () => String(process.env.JTL_REPORTING_EMAIL || DEFAULT_RECIPIENT).trim()
const DECLARATION = 'Wir versichern, dass die Angaben in diesem Reporting vollständig und richtig sind (§ 3.3 (ii) Marktplatzpartnervertrag).'
const eur = (c) => (Number(c || 0) / 100).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
const escHtml = (v) => String(v ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]))

function reportEmail(report, { confirmedBy, confirmedAt }) {
  const subject = `Andertal JTL Partner Reporting ${report.period}`
  const at = new Date(confirmedAt).toISOString()
  const td = 'style="text-align:right;padding:6px;border:1px solid #ddd"'
  const monthRows = report.by_month
    .map((m) => `<tr><td style="padding:6px;border:1px solid #ddd">${m.month}</td><td ${td}>${eur(m.gross_gmv_cents)}</td><td ${td}>${eur(m.provision_1pct_cents)}</td><td ${td}>${m.order_count}</td></tr>`)
    .join('')
  const html = [
    '<p>Sehr geehrte Damen und Herren,</p>',
    `<p>anbei das Reporting gemäß § 3.3 Marktplatzpartnervertrag für den Zeitraum <strong>${escHtml(report.period)}</strong>.</p>`,
    '<table style="border-collapse:collapse"><thead><tr><th>Monat</th><th>Bruttoumsatz (provisionsrelevant)</th><th>Provision 1 % (netto)</th><th>Bestellungen</th></tr></thead>',
    `<tbody>${monthRows}</tbody>`,
    `<tfoot><tr><th>Summe</th><th ${td}>${eur(report.totals.gross_gmv_cents)}</th><th ${td}>${eur(report.totals.provision_1pct_cents)}</th><th></th></tr></tfoot></table>`,
    `<p>Provisionsrelevante Händler: ${report.totals.seller_count}. Die Provision versteht sich zzgl. Umsatzsteuer (§ 3.2). Die Aufschlüsselung je Händler und Monat liegt als CSV bei.</p>`,
    `<p>${escHtml(DECLARATION)}<br/>Bestätigt von: ${escHtml(confirmedBy)} am ${escHtml(at)}</p>`,
    '<p>Mit freundlichen Grüßen<br/>Andertal</p>',
  ].join('\n')
  const text = [
    `Reporting gemäß § 3.3 Marktplatzpartnervertrag — Zeitraum ${report.period}`,
    ...report.by_month.map((m) => `${m.month}: Brutto ${eur(m.gross_gmv_cents)} · Provision 1 % ${eur(m.provision_1pct_cents)} · Bestellungen ${m.order_count}`),
    `Summe: Brutto ${eur(report.totals.gross_gmv_cents)} · Provision ${eur(report.totals.provision_1pct_cents)} (zzgl. USt)`,
    DECLARATION,
    `Bestätigt von: ${confirmedBy} am ${at}`,
  ].join('\n')
  return { subject, html, text }
}

/**
 * Sends the quarterly report (manual from Billing → JTL, or the auto job). A real send needs the
 * accuracy declaration (§3.3 ii); a dry run goes only to the given recipient (e.g. the superuser).
 * Real sends stamp the quarter's accruals with the send id.
 */
async function sendJtlReport(client, { period, confirmAccuracy, actor, dryRun = false, recipient = null, trigger = 'manual', cc = null, sendEmail }) {
  if (confirmAccuracy !== true) throw Object.assign(new Error('Accuracy declaration (§ 3.3 ii) required'), { status: 400 })
  if (typeof sendEmail !== 'function') throw new Error('sendEmail missing')
  const to = dryRun ? String(recipient || '').trim() : reportRecipient()
  if (!to) throw Object.assign(new Error('Recipient required for a dry run'), { status: 400 })
  const report = await jtlQuarterReport(client, period)
  const confirmedAt = new Date()
  const row = (await client.query(
    `INSERT INTO jtl_report_sends (period_quarter, recipient, dry_run, trigger, accuracy_confirmed_by, accuracy_confirmed_at, totals)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb) RETURNING *`,
    [report.period, to, dryRun, trigger, actor, confirmedAt, JSON.stringify(report.totals)],
  )).rows[0]
  const mail = reportEmail(report, { confirmedBy: actor, confirmedAt })
  try {
    const sent = await sendEmail({
      to,
      ...(cc && !dryRun ? { cc } : {}),
      subject: (dryRun ? '[TEST] ' : '') + mail.subject,
      html: mail.html,
      text: mail.text,
      attachments: [{
        filename: `andertal-jtl-reporting-${report.period}.csv`,
        content: Buffer.from(reportCsv(report, { declaration: `true ${confirmedAt.toISOString()}` }), 'utf8'),
        contentType: 'text/csv',
      }],
    })
    const messageId = (sent && (sent.id || sent.messageId)) || null
    await client.query(`UPDATE jtl_report_sends SET status = 'sent', message_id = $2, sent_at = now() WHERE id = $1`, [row.id, messageId])
    if (!dryRun) {
      await client.query(`UPDATE jtl_partner_accruals SET reporting_batch_id = $2 WHERE period_quarter = $1 AND reporting_batch_id IS NULL`, [report.period, row.id])
    }
    return { send: { ...row, status: 'sent', message_id: messageId }, report }
  } catch (e) {
    await client.query(`UPDATE jtl_report_sends SET status = 'failed', error = $2 WHERE id = $1`, [row.id, String(e?.message || e).slice(0, 500)])
    throw Object.assign(new Error(`Report e-mail failed: ${e?.message || e}`), { status: 502 })
  }
}

/**
 * Auto job (daily): on the 4th–5th of the month after a quarter (Europe/Berlin) sends the previous
 * quarter's report if it was not sent yet. Opt-in via JTL_REPORT_AUTO_SEND=true so dev / test
 * environments never e-mail JTL. Copy to JTL_REPORT_CC (superuser).
 */
async function autoSendDueJtlReport(client, { now = new Date(), sendEmail }) {
  if (String(process.env.JTL_REPORT_AUTO_SEND || '').toLowerCase() !== 'true') return { skipped: 'disabled' }
  const { m, d } = berlinParts(now)
  if (![1, 4, 7, 10].includes(m) || d < 4 || d > 5) return { skipped: 'not_due' }
  const period = previousQuarter(now)
  const done = (await client.query(
    `SELECT 1 FROM jtl_report_sends WHERE period_quarter = $1 AND NOT dry_run AND status = 'sent' LIMIT 1`, [period],
  )).rows.length
  if (done) return { skipped: 'already_sent', period }
  const res = await sendJtlReport(client, {
    period, confirmAccuracy: true, actor: 'system:auto (Andertal)', trigger: 'auto', cc: process.env.JTL_REPORT_CC || null, sendEmail,
  })
  return { sent: true, period, send_id: res.send.id }
}

module.exports = {
  sendJtlReport,
  autoSendDueJtlReport,
  reportEmail,
  reportRecipient,
  DECLARATION,
  PROVISION_RATE,
  ensureJtlPartnerSchema,
  evaluateEligibility,
  attributeJtlSeller,
  endJtlAttribution,
  syncJtlAccruals,
  jtlQuarterReport,
  reportCsv,
  periodOf,
  parseQuarter,
  previousQuarter,
  reportDeadline,
  provisionOf,
  CSV_COLUMNS,
}
