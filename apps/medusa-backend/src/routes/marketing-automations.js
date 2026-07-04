'use strict'

module.exports = function createMarketingAutomationsRunner({ getSmtpTransport }) {
    // ── Marketing Automations ─────────────────────────────────────────────────

    const adminHubAutomationsGET = async (req, res) => {
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      const sellerId = req.sellerUser?.seller_id || null
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        const rRules = await client.query(
          `SELECT type, is_active, config, triggered_count, updated_at FROM store_automation_rules WHERE seller_id=$1 ORDER BY type`,
          [sellerId || 'default']
        )
        const rStats = await client.query(
          `SELECT rule_type AS type, COUNT(*) AS count FROM store_automation_logs WHERE seller_id=$1 AND status='sent' GROUP BY rule_type`,
          [sellerId || 'default']
        )
        await client.end()
        const rules = (rRules.rows || []).map(r => ({
          type: r.type, is_active: r.is_active,
          config: typeof r.config === 'string' ? JSON.parse(r.config || '{}') : (r.config || {}),
          triggered_count: Number(r.triggered_count || 0),
          updated_at: r.updated_at,
        }))
        const stats = (rStats.rows || []).map(s => ({ type: s.type, count: Number(s.count) }))
        res.json({ rules, stats })
      } catch (e) {
        if (client) try { await client.end() } catch (_) {}
        res.json({ rules: [], stats: [] })
      }
    }

    const adminHubAutomationPUT = async (req, res) => {
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      const type = (req.params.type || '').trim()
      const sellerId = req.sellerUser?.seller_id || 'default'
      const { is_active = false, config = {} } = req.body || {}
      if (!type) return res.status(400).json({ message: 'type required' })
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        const configStr = JSON.stringify(config)
        await client.query(
          `INSERT INTO store_automation_rules (seller_id, type, is_active, config, triggered_count, created_at, updated_at)
           VALUES ($1,$2,$3,$4::jsonb,0,now(),now())
           ON CONFLICT (seller_id, type) DO UPDATE SET is_active=$3, config=$4::jsonb, updated_at=now()`,
          [sellerId, type, is_active, configStr]
        ).catch(async () => {
          // Fallback if jsonb cast fails — store as text
          const exists = await client.query(`SELECT id FROM store_automation_rules WHERE seller_id=$1 AND type=$2`, [sellerId, type])
          if (exists.rows[0]) {
            await client.query(`UPDATE store_automation_rules SET is_active=$3, config=$4, updated_at=now() WHERE seller_id=$1 AND type=$2`, [sellerId, type, is_active, configStr])
          } else {
            await client.query(`INSERT INTO store_automation_rules (seller_id, type, is_active, config, triggered_count) VALUES ($1,$2,$3,$4,0)`, [sellerId, type, is_active, configStr])
          }
        })
        await client.end()
        res.json({ ok: true })
      } catch (e) {
        if (client) try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    // Background automation runner (every 60 min)
    const runAutomations = async () => {
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      if (!dbUrl) return
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        const transport = await getSmtpTransport(client)
        if (!transport) { await client.end(); return }
        const fromAddr = process.env.SMTP_FROM || '"Andertal" <noreply@andertal.de>'

        // Fetch all active rules
        const rulesR = await client.query(`SELECT seller_id, type, config FROM store_automation_rules WHERE is_active=true`)
        for (const rule of (rulesR.rows || [])) {
          const cfg = typeof rule.config === 'string' ? JSON.parse(rule.config || '{}') : (rule.config || {})
          try {
            if (rule.type === 'low_stock_alert') {
              const threshold = Number(cfg.threshold) || 5
              const alertEmail = (cfg.alert_email || '').trim()
              if (!alertEmail) continue
              const products = await client.query(
                `SELECT id, title, inventory FROM admin_hub_products WHERE seller_id=$1 AND inventory <= $2 AND inventory IS NOT NULL AND status='published'`,
                [rule.seller_id, threshold]
              )
              for (const p of (products.rows || [])) {
                // Check not already alerted today
                const already = await client.query(
                  `SELECT id FROM store_automation_logs WHERE seller_id=$1 AND rule_type='low_stock_alert' AND target_id=$2 AND triggered_at > now()-interval '24 hours'`,
                  [rule.seller_id, p.id]
                )
                if (already.rows[0]) continue
                await transport.sendMail({
                  from: fromAddr, to: alertEmail,
                  subject: `⚠ Lagerbestand niedrig: ${p.title}`,
                  html: `<p>Das Produkt <strong>${p.title}</strong> hat nur noch <strong>${p.inventory}</strong> Einheiten auf Lager (Schwellenwert: ${threshold}).</p><p>Bitte bestand aufstocken.</p>`,
                })
                await client.query(
                  `INSERT INTO store_automation_logs (seller_id, rule_type, target_id, status, triggered_at) VALUES ($1,'low_stock_alert',$2,'sent',now())`,
                  [rule.seller_id, p.id]
                ).catch(() => {})
                await client.query(`UPDATE store_automation_rules SET triggered_count=triggered_count+1 WHERE seller_id=$1 AND type='low_stock_alert'`, [rule.seller_id]).catch(() => {})
              }
            }

            if (rule.type === 'review_request') {
              const delayDays = Number(cfg.delay_days) || 3
              const subject = cfg.email_subject || 'Wie war Ihre Bestellung? Ihre Meinung zählt!'
              const orders = await client.query(
                `SELECT id, email, first_name, last_name, order_number FROM store_orders
                 WHERE delivery_status='zugestellt' AND email IS NOT NULL
                 AND delivery_date <= now() - interval '${delayDays} days'
                 AND (seller_id=$1 OR seller_id='default')
                 LIMIT 50`,
                [rule.seller_id]
              )
              for (const o of (orders.rows || [])) {
                if (!o.email) continue
                const already = await client.query(
                  `SELECT id FROM store_automation_logs WHERE seller_id=$1 AND rule_type='review_request' AND target_id=$2`,
                  [rule.seller_id, o.id]
                )
                if (already.rows[0]) continue
                const name = [o.first_name, o.last_name].filter(Boolean).join(' ') || 'Kunde'
                await transport.sendMail({
                  from: fromAddr, to: o.email,
                  subject,
                  html: `<p>Hallo ${name},</p><p>wir hoffen, Ihre Bestellung #${o.order_number || ''} ist gut bei Ihnen angekommen. Wir würden uns sehr über Ihre Bewertung freuen!</p><p>Vielen Dank für Ihr Vertrauen.</p>`,
                })
                await client.query(
                  `INSERT INTO store_automation_logs (seller_id, rule_type, target_id, status, triggered_at) VALUES ($1,'review_request',$2,'sent',now())`,
                  [rule.seller_id, o.id]
                ).catch(() => {})
                await client.query(`UPDATE store_automation_rules SET triggered_count=triggered_count+1 WHERE seller_id=$1 AND type='review_request'`, [rule.seller_id]).catch(() => {})
              }
            }

            if (rule.type === 'welcome_email') {
              const subject = cfg.email_subject || 'Willkommen — danke für Ihr Vertrauen!'
              const orders = await client.query(
                `SELECT o.id, o.email, o.first_name, o.last_name, o.order_number
                 FROM store_orders o
                 WHERE (o.seller_id=$1 OR o.seller_id='default') AND o.email IS NOT NULL
                 AND NOT EXISTS (
                   SELECT 1 FROM store_orders o2 WHERE LOWER(o2.email)=LOWER(o.email) AND o2.id != o.id AND o2.created_at < o.created_at
                 )
                 AND NOT EXISTS (
                   SELECT 1 FROM store_automation_logs l WHERE l.seller_id=$1 AND l.rule_type='welcome_email' AND l.target_id=o.id
                 )
                 AND o.payment_status='bezahlt'
                 LIMIT 30`,
                [rule.seller_id]
              )
              for (const o of (orders.rows || [])) {
                if (!o.email) continue
                const name = [o.first_name, o.last_name].filter(Boolean).join(' ') || 'Kunde'
                await transport.sendMail({
                  from: fromAddr, to: o.email,
                  subject,
                  html: `<p>Hallo ${name},</p><p>herzlich willkommen! Wir freuen uns, Sie als neuen Kunden begrüßen zu dürfen. Ihre Bestellung #${o.order_number || ''} wird schnellstmöglich bearbeitet.</p>`,
                })
                await client.query(
                  `INSERT INTO store_automation_logs (seller_id, rule_type, target_id, status, triggered_at) VALUES ($1,'welcome_email',$2,'sent',now())`,
                  [rule.seller_id, o.id]
                ).catch(() => {})
                await client.query(`UPDATE store_automation_rules SET triggered_count=triggered_count+1 WHERE seller_id=$1 AND type='welcome_email'`, [rule.seller_id]).catch(() => {})
              }
            }
          } catch (ruleErr) {
            // Per-rule errors don't abort other rules
          }
        }
        await client.end()
      } catch (_) {
        if (client) try { await client.end() } catch (__) {}
      }
    }
    setTimeout(() => runAutomations().catch(() => {}), 5 * 60 * 1000)
    setInterval(() => runAutomations().catch(() => {}), 60 * 60 * 1000)
}
