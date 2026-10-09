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
  // Report recipient / CC set in Billing → JTL (env JTL_REPORTING_EMAIL / JTL_REPORT_CC are the defaults).
  `CREATE TABLE IF NOT EXISTS jtl_partner_settings (
     key text PRIMARY KEY,
     value text,
     updated_by text,
     updated_at timestamptz NOT NULL DEFAULT now()
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

const EMAIL_RE = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/
const REPORT_TRIGGER = 'jtl_partner_quarterly_report'

/** Recipient + CC: Billing → JTL settings, else env, else the contract address (§3.3). */
async function getReportSettings(client) {
  const rows = (await client.query(`SELECT key, value FROM jtl_partner_settings WHERE key IN ('report_recipient', 'report_cc')`).catch(() => ({ rows: [] }))).rows
  const v = Object.fromEntries(rows.map((r) => [r.key, String(r.value || '').trim()]))
  return {
    recipient: v.report_recipient || reportRecipient(),
    cc: v.report_cc !== undefined ? (v.report_cc || null) : (String(process.env.JTL_REPORT_CC || '').trim() || null),
  }
}

async function saveReportSettings(client, { recipient, cc, actor }) {
  const to = String(recipient || '').trim()
  const ccs = String(cc || '').split(/[,;\s]+/).map((x) => x.trim()).filter(Boolean)
  if (!EMAIL_RE.test(to)) throw Object.assign(new Error('Invalid recipient e-mail'), { status: 400 })
  if (ccs.some((x) => !EMAIL_RE.test(x))) throw Object.assign(new Error('Invalid CC e-mail'), { status: 400 })
  for (const [key, value] of [['report_recipient', to], ['report_cc', ccs.join(', ')]]) {
    await client.query(
      `INSERT INTO jtl_partner_settings (key, value, updated_by, updated_at) VALUES ($1, $2, $3, now())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()`,
      [key, value, actor || null],
    )
  }
  return getReportSettings(client)
}

/** The Flows entry for the report (SC → Content → Flows): status = auto send on/off, step = template. */
async function loadReportFlow(client) {
  const f = (await client.query(
    `SELECT id, status, created_at FROM admin_hub_flows WHERE trigger_key = $1 ORDER BY (status = 'active') DESC, created_at LIMIT 1`, [REPORT_TRIGGER],
  ).catch(() => ({ rows: [] }))).rows[0]
  if (!f) return null
  const step = (await client.query(
    `SELECT email_subject, email_body, email_i18n FROM admin_hub_flow_steps WHERE flow_id = $1 AND step_type = 'send_email' ORDER BY step_order LIMIT 1`, [f.id],
  ).catch(() => ({ rows: [] }))).rows[0] || null
  return { id: f.id, status: f.status, created_at: f.created_at, step }
}

function monthTableHtml(report) {
  const td = 'style="text-align:right;padding:6px;border:1px solid #ddd"'
  const monthRows = report.by_month
    .map((m) => `<tr><td style="padding:6px;border:1px solid #ddd">${m.month}</td><td ${td}>${eur(m.gross_gmv_cents)}</td><td ${td}>${eur(m.provision_1pct_cents)}</td><td ${td}>${m.order_count}</td></tr>`)
    .join('')
  return [
    '<table style="border-collapse:collapse"><thead><tr><th>Monat</th><th>Bruttoumsatz (provisionsrelevant)</th><th>Provision 1 % (netto)</th><th>Bestellungen</th></tr></thead>',
    `<tbody>${monthRows}</tbody>`,
    `<tfoot><tr><th>Summe</th><th ${td}>${eur(report.totals.gross_gmv_cents)}</th><th ${td}>${eur(report.totals.provision_1pct_cents)}</th><th></th></tr></tfoot></table>`,
  ].join('\n')
}

/**
 * Report e-mail from the Flows template. Placeholders are filled from the report; the accuracy
 * declaration (§ 3.3 ii) is appended when the template does not contain {DECLARATION}.
 */
function renderReportFromTemplate(report, step, { confirmedBy, confirmedAt }) {
  const tpl = (step?.email_i18n && step.email_i18n.de) || {}
  const subjectTpl = String(tpl.subject || step?.email_subject || '').trim()
  const bodyTpl = String(tpl.body || step?.email_body || '').trim()
  if (!subjectTpl || !bodyTpl) return null
  const at = new Date(confirmedAt).toISOString()
  const vars = {
    PERIOD: report.period,
    DEADLINE: report.deadline || '',
    GROSS_GMV: eur(report.totals.gross_gmv_cents),
    PROVISION: eur(report.totals.provision_1pct_cents),
    VAT_ESTIMATE: eur(report.totals.vat_estimate_cents),
    SELLER_COUNT: String(report.totals.seller_count),
    ORDER_COUNT: String(report.by_month.reduce((x, m) => x + m.order_count, 0)),
    DECLARATION,
    CONFIRMED_BY: confirmedBy,
    CONFIRMED_AT: at,
  }
  const monthText = () => report.by_month.map((m) => `${m.month}: Brutto ${eur(m.gross_gmv_cents)} · Provision 1 % ${eur(m.provision_1pct_cents)} · Bestellungen ${m.order_count}`).join('\n')
  const fill = (str, html) => str.replace(/\{([A-Z_]+)\}/g, (all, k) => {
    if (k === 'MONTH_TABLE') return html ? monthTableHtml(report) : monthText()
    if (!(k in vars)) return all
    return html ? escHtml(vars[k]) : vars[k]
  })
  const hasDecl = bodyTpl.includes('{DECLARATION}')
  let html = fill(bodyTpl, true)
  if (!hasDecl) html += `\n<p>${escHtml(DECLARATION)}<br/>Bestätigt von: ${escHtml(confirmedBy)} am ${escHtml(at)}</p>`
  let text = fill(bodyTpl, false)
    .replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|tr|table|div|h\d)>/gi, '\n').replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\n{3,}/g, '\n\n').trim()
  if (!hasDecl) text += `\n${DECLARATION}\nBestätigt von: ${confirmedBy} am ${at}`
  return { subject: fill(subjectTpl, false), html, text }
}

/** Default template (seeded into Flows; editable there). */
const REPORT_FLOW_TEMPLATE = {
  subject: 'Andertal JTL Partner Reporting {PERIOD}',
  body: [
    '<p>Sehr geehrte Damen und Herren,</p>',
    '<p>anbei das Reporting gemäß § 3.3 Marktplatzpartnervertrag für den Zeitraum <strong>{PERIOD}</strong>.</p>',
    '{MONTH_TABLE}',
    '<p>Provisionsrelevante Händler: {SELLER_COUNT}. Die Provision versteht sich zzgl. Umsatzsteuer (§ 3.2). Die Aufschlüsselung je Händler und Monat liegt als CSV bei.</p>',
    '<p>{DECLARATION}<br/>Bestätigt von: {CONFIRMED_BY} am {CONFIRMED_AT}</p>',
    '<p>Mit freundlichen Grüßen<br/>Andertal</p>',
  ].join('\n'),
}

/** Creates the Flows entry once (active = automatic quarterly send). Superuser edits win. */
async function seedJtlReportFlow(client) {
  const ex = await client.query(`SELECT id FROM admin_hub_flows WHERE trigger_key = $1 LIMIT 1`, [REPORT_TRIGGER])
  if (ex.rows[0]) return { created: false }
  const fr = await client.query(
    `INSERT INTO admin_hub_flows (name, trigger_key, status, audience) VALUES ($1, $2, 'active', 'admin') RETURNING id`,
    ['JTL-Partner-Reporting — an JTL', REPORT_TRIGGER],
  )
  await client.query(
    `INSERT INTO admin_hub_flow_steps (flow_id, step_order, step_type, email_subject, email_body, email_i18n, email_attachments)
     VALUES ($1, 0, 'send_email', $2, $3, $4::jsonb, '[]'::jsonb)`,
    [fr.rows[0].id, REPORT_FLOW_TEMPLATE.subject, REPORT_FLOW_TEMPLATE.body, JSON.stringify({ de: REPORT_FLOW_TEMPLATE })],
  )
  return { created: true, flow_id: fr.rows[0].id }
}

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
  const settings = await getReportSettings(client)
  const to = dryRun ? String(recipient || '').trim() : settings.recipient
  if (!dryRun && cc == null) cc = settings.cc
  if (!to) throw Object.assign(new Error('Recipient required for a dry run'), { status: 400 })
  const report = await jtlQuarterReport(client, period)
  const confirmedAt = new Date()
  const row = (await client.query(
    `INSERT INTO jtl_report_sends (period_quarter, recipient, dry_run, trigger, accuracy_confirmed_by, accuracy_confirmed_at, totals)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb) RETURNING *`,
    [report.period, to, dryRun, trigger, actor, confirmedAt, JSON.stringify(report.totals)],
  )).rows[0]
  const flow = await loadReportFlow(client)
  const mail = renderReportFromTemplate(report, flow?.step, { confirmedBy: actor, confirmedAt })
    || reportEmail(report, { confirmedBy: actor, confirmedAt })
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
 * Auto job (every 6 h): from the 4th of the month after a quarter (Europe/Berlin; §3.3 deadline is
 * the 5th) the previous quarter's report is sent once to the recipient from Billing → JTL. On while
 * the Flows entry "JTL-Partner-Reporting" is active; JTL_REPORT_AUTO_SEND=false forces it off
 * (e.g. local dev on a shared DB), =true forces it on. Missed or failed sends are retried until the
 * 10th. One sender at a time (advisory lock).
 */
async function autoSendDueJtlReport(client, { now = new Date(), sendEmail }) {
  const env = String(process.env.JTL_REPORT_AUTO_SEND || '').toLowerCase()
  if (env === 'false') return { skipped: 'disabled' }
  let flow = null
  if (env !== 'true') {
    flow = await loadReportFlow(client)
    if (!flow || flow.status !== 'active') return { skipped: 'disabled' }
  }
  const { y, m, d } = berlinParts(now)
  if (![1, 4, 7, 10].includes(m) || d < 4 || d > 10) return { skipped: 'not_due' }
  // A flow created inside the window (e.g. the first deploy) must not e-mail JTL by surprise:
  // that quarter is sent manually from Billing → JTL; automation starts with the next one.
  if (flow?.created_at && new Date(flow.created_at) > new Date(Date.UTC(y, m - 1, 3, 22))) return { skipped: 'flow_created_in_window' }
  const period = previousQuarter(now)
  const lock = (await client.query('SELECT pg_try_advisory_lock(74211302) AS ok')).rows[0]
  if (!lock?.ok) return { skipped: 'locked' }
  try {
    const done = (await client.query(
      `SELECT 1 FROM jtl_report_sends WHERE period_quarter = $1 AND NOT dry_run AND status = 'sent' LIMIT 1`, [period],
    )).rows.length
    if (done) return { skipped: 'already_sent', period }
    const res = await sendJtlReport(client, {
      period, confirmAccuracy: true, actor: 'system:auto (Andertal)', trigger: 'auto', sendEmail,
    })
    return { sent: true, period, send_id: res.send.id }
  } finally {
    await client.query('SELECT pg_advisory_unlock(74211302)').catch(() => {})
  }
}

module.exports = {
  getReportSettings,
  saveReportSettings,
  loadReportFlow,
  renderReportFromTemplate,
  seedJtlReportFlow,
  REPORT_FLOW_TEMPLATE,
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
