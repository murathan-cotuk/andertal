'use strict'
const { Router } = require('express')
const { runAutomationFlowsForMessageEvent, FLOW_EMAIL_LOCALES } = require('../flow-automation')
const { resolveSmtpSenderIdentity } = require('../smtp-sender-resolve')

const resolveShopBaseUrl = () => {
  const candidates = [
    process.env.STOREFRONT_PUBLIC_URL,
    process.env.SHOP_PUBLIC_URL,
    process.env.PUBLIC_SHOP_URL,
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.NEXT_PUBLIC_SHOP_URL,
    process.env.SITE_URL,
  ]
  for (const raw of candidates) {
    const s = String(raw || '').trim().replace(/\/$/, '')
    if (/^https?:\/\//i.test(s)) return s
  }
  return ''
}
const resolveSellercentralBaseUrl = () =>
  (process.env.NEXT_PUBLIC_SELLERCENTRAL_URL || process.env.SELLERCENTRAL_URL || 'https://sellercentral.andertal.com').replace(/\/$/, '')

const messageBodyToHtml = (body) =>
  String(body || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')

/** Best-effort recipient name lookup — falls back to the email's local-part so templates never show "undefined". */
const displayNameOrEmail = (firstName, lastName, email) => {
  const n = [firstName, lastName].filter(Boolean).join(' ').trim()
  if (n) return n
  return String(email || '').split('@')[0] || ''
}

const getDbClient = () => {
  const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
  if (!dbUrl || !dbUrl.startsWith('postgres')) return null
  const { Client } = require('pg')
  const isRender = dbUrl.includes('render.com')
  return new Client({ connectionString: dbUrl, ssl: isRender ? { rejectUnauthorized: false } : false })
}

// Shared with server.js: order-confirmation / flow / invitation emails also need the configured SMTP transport.
const getSmtpTransport = async (client) => {
  let nodemailer
  try { nodemailer = require('nodemailer') } catch { return null }
  const r = await client.query(`SELECT * FROM store_smtp_settings WHERE seller_id = 'default' LIMIT 1`)
  const s = r.rows[0]
  if (!s?.host || !s?.username) return null
  return nodemailer.createTransport({
    host: s.host, port: s.port || 587, secure: !!s.secure,
    auth: { user: s.username, pass: s.password_enc || '' },
  })
}

function createMessagesRouter({ verifyCustomerToken, requireSuperuser }) {
    const adminHubMessagesGET = async (req, res) => {
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        const orderId = req.query.order_id || null
        const sellerId = (req.query.seller_id || '').trim()
        const searchRaw = (req.query.q || req.query.search || '').trim()
        // channel: 'customer' (default) = customer<->seller msgs, 'support' = seller<->support team msgs
        const channel = (req.query.channel || 'customer').trim()
        const lim = Math.min(Math.max(parseInt(req.query.limit, 10) || (searchRaw ? 600 : 400), 1), 1000)
        let q
        const params = []
        const conditions = []
        if (channel === 'support') {
          q = `SELECT m.*,
            sh.store_name AS seller_store_name
            FROM store_messages m
            LEFT JOIN admin_hub_seller_settings sh ON sh.seller_id = m.seller_id`
          if (sellerId) { params.push(sellerId); conditions.push(`m.seller_id = $${params.length}`) }
          conditions.push(`m.channel = 'support'`)
          if (searchRaw) {
            const term = `%${searchRaw.replace(/%/g, '\\%').replace(/_/g, '\\_')}%`
            params.push(term)
            const n = params.length
            conditions.push(`(
              m.body ILIKE $${n} ESCAPE '\\'
              OR COALESCE(m.subject, '') ILIKE $${n} ESCAPE '\\'
              OR COALESCE(m.seller_id, '') ILIKE $${n} ESCAPE '\\'
              OR COALESCE(sh.store_name, '') ILIKE $${n} ESCAPE '\\'
            )`)
          }
        } else {
          q = `SELECT m.*,
            o.order_number, o.status AS order_status, o.order_status AS order_order_status,
            o.total_cents AS order_total_cents, o.first_name AS order_first_name,
            o.last_name AS order_last_name, o.email AS order_email,
            o.seller_id AS order_seller_id,
            c.customer_number AS customer_number,
            sh.store_name AS seller_store_name
            FROM store_messages m
            LEFT JOIN store_orders o ON o.id = m.order_id
            LEFT JOIN store_customers c ON c.email IS NOT NULL AND o.email IS NOT NULL
              AND LOWER(TRIM(c.email)) = LOWER(TRIM(o.email))
            LEFT JOIN admin_hub_seller_settings sh ON sh.seller_id = o.seller_id`
          conditions.push(`(m.channel = 'customer' OR m.channel IS NULL)`)
          if (orderId) { params.push(orderId); conditions.push(`m.order_id = $${params.length}::uuid`) }
          if (sellerId) {
            params.push(sellerId)
            const n = params.length
            // o.seller_id is always the platform now (an order can mix items from several real
            // sellers) — match any order where this seller actually has an item, the same
            // ownership pattern used by orders.js/transactions.js, not a direct o.seller_id match.
            conditions.push(`(
              o.seller_id = $${n}
              OR EXISTS (
                SELECT 1 FROM store_order_items oi WHERE oi.order_id = o.id AND (
                  EXISTS (SELECT 1 FROM admin_hub_seller_listings sl WHERE sl.product_id::text = oi.product_id::text AND sl.seller_id = $${n})
                  OR EXISTS (SELECT 1 FROM admin_hub_products ap WHERE ap.id::text = oi.product_id::text AND ap.seller_id = $${n})
                )
              )
            )`)
          }
          if (searchRaw) {
            const term = `%${searchRaw.replace(/%/g, '\\%').replace(/_/g, '\\_')}%`
            params.push(term)
            const n = params.length
            conditions.push(`(
              m.body ILIKE $${n} ESCAPE '\\'
              OR COALESCE(m.subject, '') ILIKE $${n} ESCAPE '\\'
              OR CAST(o.order_number AS TEXT) ILIKE $${n} ESCAPE '\\'
              OR CAST(c.customer_number AS TEXT) ILIKE $${n} ESCAPE '\\'
              OR COALESCE(o.first_name, '') ILIKE $${n} ESCAPE '\\'
              OR COALESCE(o.last_name, '') ILIKE $${n} ESCAPE '\\'
              OR TRIM(COALESCE(o.first_name, '') || ' ' || COALESCE(o.last_name, '')) ILIKE $${n} ESCAPE '\\'
              OR COALESCE(o.email, '') ILIKE $${n} ESCAPE '\\'
              OR COALESCE(m.sender_email, '') ILIKE $${n} ESCAPE '\\'
              OR COALESCE(sh.store_name, '') ILIKE $${n} ESCAPE '\\'
              OR COALESCE(o.seller_id, '') ILIKE $${n} ESCAPE '\\'
            )`)
          }
        }
        if (conditions.length) q += ' WHERE ' + conditions.join(' AND ')
        q += ` ORDER BY m.created_at ASC LIMIT ${lim}`
        const r = await client.query(q, params)
        // Unread count depends on channel
        let unreadR
        if (channel === 'support') {
          const unreadParams = sellerId ? [sellerId] : []
          const unreadWhere = sellerId ? `AND m2.seller_id = $1` : ''
          unreadR = await client.query(
            `SELECT COUNT(*)::int AS c FROM store_messages m2 WHERE m2.channel = 'support' AND m2.sender_type = 'customer' AND m2.is_read_by_seller = false ${unreadWhere}`,
            unreadParams
          )
        } else {
          const unreadWhere = sellerId ? `AND m2.order_id IN (
              SELECT o.id FROM store_orders o WHERE o.seller_id = $1
                OR EXISTS (
                  SELECT 1 FROM store_order_items oi WHERE oi.order_id = o.id AND (
                    EXISTS (SELECT 1 FROM admin_hub_seller_listings sl WHERE sl.product_id::text = oi.product_id::text AND sl.seller_id = $1)
                    OR EXISTS (SELECT 1 FROM admin_hub_products ap WHERE ap.id::text = oi.product_id::text AND ap.seller_id = $1)
                  )
                )
            )` : ''
          unreadR = await client.query(
            `SELECT COUNT(*)::int AS c FROM store_messages m2 WHERE (m2.channel = 'customer' OR m2.channel IS NULL) AND m2.sender_type = 'customer' AND m2.is_read_by_seller = false ${unreadWhere}`,
            sellerId ? [sellerId] : []
          )
        }
        await client.end()
        res.json({
          messages: r.rows.map(row => ({
            ...row,
            order_number: row.order_number ? Number(row.order_number) : null,
            order_total_cents: row.order_total_cents != null ? Number(row.order_total_cents) : null,
            customer_number: row.customer_number != null ? Number(row.customer_number) : null,
          })),
          unread: unreadR.rows[0]?.c || 0,
        })
      } catch (e) {
        if (client) try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    const adminHubMessagesPOST = async (req, res) => {
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        const { order_id, product_id, body, subject, channel, sender_seller_id, locale } = req.body || {}
        if (!body) { await client.end(); return res.status(400).json({ message: 'body required' }) }

        // Opportunistically remember the acting seller's current Sellercentral UI language, so
        // automated notification emails to them can be sent in that language later.
        const requestedLocale = String(locale || '').trim().toLowerCase()
        const callerLocale = FLOW_EMAIL_LOCALES.includes(requestedLocale) ? requestedLocale : ''
        const actingSellerId = String(sender_seller_id || req.sellerUser?.seller_id || '').trim()
        if (callerLocale && actingSellerId) {
          await client.query(
            `INSERT INTO admin_hub_seller_settings (seller_id, locale) VALUES ($1, $2)
             ON CONFLICT (seller_id) DO UPDATE SET locale = $2`,
            [actingSellerId, callerLocale],
          ).catch(() => {})
        }

        if (channel === 'support') {
          // Support channel: seller <-> support team (superusers)
          // sender_seller_id: if set, sender is a seller (opening/continuing a ticket); if null, sender is support team replying.
          const isSupportSide = !sender_seller_id
          const senderType = isSupportSide ? 'seller' : 'customer' // 'customer' = seller side, 'seller' = support side
          const msgSellerId = sender_seller_id || req.body.target_seller_id || null
          const r = await client.query(
            `INSERT INTO store_messages (order_id, sender_type, sender_email, recipient_email, subject, body, channel, seller_id, is_read_by_seller, is_read_by_support, is_read_by_customer)
             VALUES ($1, $2, $3, $4, $5, $6, 'support', $7, $8, $9, false) RETURNING *`,
            [
              null, senderType, req.sellerUser?.email || null, null, subject || null, body, msgSellerId,
              isSupportSide ? true : false, // is_read_by_seller: support side msgs are auto-read by support
              isSupportSide ? false : true,  // is_read_by_support: seller side msgs need to be read by support
            ]
          )

          if (msgSellerId) {
            const sur = await client.query(
              `SELECT email FROM seller_users WHERE seller_id = $1 AND sub_of_seller_id IS NULL ORDER BY created_at ASC LIMIT 1`,
              [msgSellerId],
            )
            const sellerEmail = String(sur.rows[0]?.email || '').trim()
            const sh = await client.query(`SELECT store_name, locale FROM admin_hub_seller_settings WHERE seller_id = $1 LIMIT 1`, [msgSellerId])
            const sellerName = String(sh.rows[0]?.store_name || '').trim()
            const sLoc = String(sh.rows[0]?.locale || '').trim().toLowerCase()
            const sellerLocale = callerLocale || (FLOW_EMAIL_LOCALES.includes(sLoc) ? sLoc : 'de')
            if (sellerEmail) {
              const vars = {
                SELLER_NAME: sellerName,
                MESSAGE_BODY: messageBodyToHtml(body),
                MESSAGE_SUBJECT: String(subject || '').trim(),
                SELLERCENTRAL_INBOX_URL: `${resolveSellercentralBaseUrl()}/${sellerLocale}/inbox`,
              }
              const triggerKey = isSupportSide ? 'seller_support_ticket_replied' : 'seller_support_ticket_sent'
              runAutomationFlowsForMessageEvent({
                triggerKey,
                toEmail: sellerEmail,
                locale: sellerLocale,
                vars,
                dedupeKey: r.rows[0]?.id || '',
              }).catch((e) => console.error(`[flow-automation] ${triggerKey}`, e?.message || e))
            }
          }

          await client.end()
          return res.status(201).json({ message: r.rows[0] })
        }

        // Customer channel (default) — seller/superuser replying to a customer.
        // The message is attributed to the REPLYING seller's own account, not the order's
        // seller_id — an order's seller_id is always the platform now (an order can mix items
        // from several real sellers), so it can no longer stand in for "which seller is this."
        const replyingSellerId = String(req.sellerUser?.seller_id || '').trim() || null
        let recipientEmail = null
        let orderNumber = null
        let orderLocale = ''
        let orderCountry = ''
        if (order_id) {
          const oR = await client.query(`SELECT email, order_number, locale, country FROM store_orders WHERE id = $1::uuid`, [order_id])
          recipientEmail = oR.rows[0]?.email || null
          orderNumber = oR.rows[0]?.order_number != null ? Number(oR.rows[0].order_number) : null
          orderLocale = String(oR.rows[0]?.locale || '').trim().toLowerCase()
          orderCountry = String(oR.rows[0]?.country || '').trim()
        }
        const r = await client.query(
          `INSERT INTO store_messages (order_id, product_id, sender_type, sender_email, recipient_email, subject, body, channel, seller_id, is_read_by_seller, is_read_by_customer)
           VALUES ($1, $2, 'seller', $3, $4, $5, $6, 'customer', $7, true, false) RETURNING *`,
          [order_id || null, product_id ? String(product_id) : null, req.sellerUser?.email || null, recipientEmail, subject || null, body, replyingSellerId]
        )
        const msg = r.rows[0]

        if (recipientEmail) {
          const custR = await client.query(`SELECT first_name, last_name, locale FROM store_customers WHERE LOWER(email) = LOWER($1) LIMIT 1`, [recipientEmail])
          const customerName = displayNameOrEmail(custR.rows[0]?.first_name, custR.rows[0]?.last_name, recipientEmail)
          const custLocaleRaw = String(custR.rows[0]?.locale || orderLocale || '').trim().toLowerCase()
          const { resolveEmailLocaleFromCountry } = require('../flow-automation')
          const customerLocale = FLOW_EMAIL_LOCALES.includes(custLocaleRaw) ? custLocaleRaw : resolveEmailLocaleFromCountry(orderCountry)
          let sellerName = ''
          if (replyingSellerId) {
            const sh = await client.query(`SELECT store_name FROM admin_hub_seller_settings WHERE seller_id = $1 LIMIT 1`, [replyingSellerId])
            sellerName = String(sh.rows[0]?.store_name || '').trim()
          }
          runAutomationFlowsForMessageEvent({
            triggerKey: 'customer_message_replied',
            toEmail: recipientEmail,
            locale: customerLocale,
            vars: {
              CUSTOMER_NAME: customerName,
              SELLER_NAME: sellerName,
              MESSAGE_BODY: messageBodyToHtml(body),
              MESSAGE_SUBJECT: String(subject || '').trim(),
              ORDER_NUMBER: orderNumber != null ? String(orderNumber) : '',
              SHOP_MESSAGES_URL: `${resolveShopBaseUrl()}/nachrichten`,
            },
            orderId: order_id || '',
            dedupeKey: msg?.id || '',
          }).catch((e) => console.error('[flow-automation] customer_message_replied', e?.message || e))
        }

        await client.end()
        res.status(201).json({ message: msg })
      } catch (e) {
        if (client) try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    const adminHubMessageMarkReadPATCH = async (req, res) => {
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      const id = (req.params.id || '').trim()
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        // Support channel: seller reads support-side msgs (sender_type seller); support reads seller msgs (sender_type customer).
        // Customer channel: seller marks customer msgs read (existing behavior).
        await client.query(
          `UPDATE store_messages SET
            is_read_by_seller = CASE
              WHEN channel = 'support' AND sender_type = 'seller' THEN true
              WHEN channel = 'customer' OR channel IS NULL THEN true
              ELSE is_read_by_seller END,
            is_read_by_support = CASE
              WHEN channel = 'support' AND sender_type = 'customer' THEN true
              ELSE is_read_by_support END
          WHERE id = $1::uuid`,
          [id]
        )
        await client.end()
        res.json({ success: true })
      } catch (e) {
        if (client) try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    // Mark all support-channel messages for a seller as read by support team
    const adminHubSupportMessagesMarkReadPATCH = async (req, res) => {
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        const { seller_id, mark_as, subject_thread } = req.body || {}
        if (!seller_id) { await client.end(); return res.status(400).json({ message: 'seller_id required' }) }
        const subj = (subject_thread === undefined || subject_thread === null) ? null : String(subject_thread).trim()
        const subjectClause =
          subj === null
            ? ''
            : subj === ''
              ? ` AND (subject IS NULL OR TRIM(subject) = '')`
              : ` AND TRIM(COALESCE(subject, '')) = $2`
        const params = subj === null || subj === '' ? [seller_id] : [seller_id, subj]
        if (mark_as === 'support') {
          await client.query(
            `UPDATE store_messages SET is_read_by_support = true WHERE channel = 'support' AND seller_id = $1 AND sender_type = 'customer'${subjectClause}`,
            params
          )
        } else {
          await client.query(
            `UPDATE store_messages SET is_read_by_seller = true WHERE channel = 'support' AND seller_id = $1 AND sender_type = 'seller'${subjectClause}`,
            params
          )
        }
        await client.end()
        res.json({ success: true })
      } catch (e) {
        if (client) try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    const ensureMessageTemplatesTable = async (client) => {
      await client.query(`
        CREATE TABLE IF NOT EXISTS admin_hub_message_templates (
          id bigserial PRIMARY KEY,
          seller_id text NOT NULL,
          name text NOT NULL,
          body text NOT NULL,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now()
        )
      `)
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_admin_hub_message_templates_seller_id
        ON admin_hub_message_templates (seller_id, updated_at DESC)
      `)
    }

    const adminHubMessageTemplatesGET = async (req, res) => {
      const client = getDbClient()
      if (!client) return res.status(503).json({ message: 'DB not configured' })
      try {
        await client.connect()
        await ensureMessageTemplatesTable(client)
        const sellerId = String(req.sellerUser?.seller_id || '').trim()
        if (!sellerId) {
          await client.end()
          return res.status(400).json({ message: 'seller_id missing in token' })
        }
        const r = await client.query(
          `SELECT id, seller_id, name, body, created_at, updated_at
           FROM admin_hub_message_templates
           WHERE seller_id = $1
           ORDER BY updated_at DESC, id DESC`,
          [sellerId],
        )
        await client.end()
        res.json({ templates: r.rows || [], count: r.rows?.length || 0 })
      } catch (e) {
        try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    const adminHubMessageTemplatesPOST = async (req, res) => {
      const client = getDbClient()
      if (!client) return res.status(503).json({ message: 'DB not configured' })
      try {
        await client.connect()
        await ensureMessageTemplatesTable(client)
        const sellerId = String(req.sellerUser?.seller_id || '').trim()
        if (!sellerId) {
          await client.end()
          return res.status(400).json({ message: 'seller_id missing in token' })
        }
        const name = String(req.body?.name || '').trim()
        const body = String(req.body?.body || '').trim()
        if (!name) {
          await client.end()
          return res.status(400).json({ message: 'name required' })
        }
        if (!body) {
          await client.end()
          return res.status(400).json({ message: 'body required' })
        }
        if (name.length > 120) {
          await client.end()
          return res.status(400).json({ message: 'name too long' })
        }
        if (body.length > 5000) {
          await client.end()
          return res.status(400).json({ message: 'body too long' })
        }
        const r = await client.query(
          `INSERT INTO admin_hub_message_templates (seller_id, name, body)
           VALUES ($1, $2, $3)
           RETURNING id, seller_id, name, body, created_at, updated_at`,
          [sellerId, name, body],
        )
        await client.end()
        res.status(201).json({ template: r.rows?.[0] || null })
      } catch (e) {
        try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    const adminHubMessageTemplatesDELETE = async (req, res) => {
      const client = getDbClient()
      if (!client) return res.status(503).json({ message: 'DB not configured' })
      try {
        await client.connect()
        await ensureMessageTemplatesTable(client)
        const sellerId = String(req.sellerUser?.seller_id || '').trim()
        const id = Number(req.params.id)
        if (!sellerId) {
          await client.end()
          return res.status(400).json({ message: 'seller_id missing in token' })
        }
        if (!Number.isFinite(id) || id <= 0) {
          await client.end()
          return res.status(400).json({ message: 'invalid id' })
        }
        await client.query(
          `DELETE FROM admin_hub_message_templates WHERE id = $1 AND seller_id = $2`,
          [id, sellerId],
        )
        await client.end()
        res.json({ success: true })
      } catch (e) {
        try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    const adminHubMessageTemplatesPATCH = async (req, res) => {
      const client = getDbClient()
      if (!client) return res.status(503).json({ message: 'DB not configured' })
      try {
        await client.connect()
        await ensureMessageTemplatesTable(client)
        const sellerId = String(req.sellerUser?.seller_id || '').trim()
        const id = Number(req.params.id)
        if (!sellerId) {
          await client.end()
          return res.status(400).json({ message: 'seller_id missing in token' })
        }
        if (!Number.isFinite(id) || id <= 0) {
          await client.end()
          return res.status(400).json({ message: 'invalid id' })
        }
        const nameRaw = req.body?.name
        const bodyRaw = req.body?.body
        const updates = []
        const vals = []
        let n = 0
        if (nameRaw !== undefined) {
          const name = String(nameRaw || '').trim()
          if (!name) {
            await client.end()
            return res.status(400).json({ message: 'name required' })
          }
          if (name.length > 120) {
            await client.end()
            return res.status(400).json({ message: 'name too long' })
          }
          n++
          updates.push(`name = $${n}`)
          vals.push(name)
        }
        if (bodyRaw !== undefined) {
          const body = String(bodyRaw || '').trim()
          if (!body) {
            await client.end()
            return res.status(400).json({ message: 'body required' })
          }
          if (body.length > 5000) {
            await client.end()
            return res.status(400).json({ message: 'body too long' })
          }
          n++
          updates.push(`body = $${n}`)
          vals.push(body)
        }
        if (!updates.length) {
          await client.end()
          return res.status(400).json({ message: 'nothing to update' })
        }
        const idPh = n + 1
        const sidPh = n + 2
        vals.push(id, sellerId)
        const r = await client.query(
          `UPDATE admin_hub_message_templates SET ${updates.join(', ')}, updated_at = now()
           WHERE id = $${idPh} AND seller_id = $${sidPh}
           RETURNING id, seller_id, name, body, created_at, updated_at`,
          vals,
        )
        await client.end()
        if (!r.rows?.length) return res.status(404).json({ message: 'template not found' })
        res.json({ template: r.rows[0] })
      } catch (e) {
        try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    const storeMessagesGET = async (req, res) => {
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      const token = (req.headers.authorization || '').replace('Bearer ', '').trim()
      if (!token) return res.status(401).json({ message: 'Unauthorized' })
      const payload = verifyCustomerToken(token)
      if (!payload?.email) return res.status(401).json({ message: 'Invalid token' })
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        const orderId = req.query.order_id || null
        let q = `SELECT m.*, o.order_number FROM store_messages m
          LEFT JOIN store_orders o ON o.id = m.order_id
          WHERE (m.sender_email = $1 OR m.recipient_email = $1
            OR (m.order_id IS NOT NULL AND m.order_id IN (
              SELECT id FROM store_orders WHERE LOWER(email) = LOWER($1)
            )))`
        const params = [payload.email]
        if (orderId) { params.push(orderId); q += ` AND m.order_id = $2::uuid` }
        q += ' ORDER BY m.created_at ASC'
        const r = await client.query(q, params)
        await client.end()
        res.json({ messages: r.rows.map(row => ({ ...row, order_number: row.order_number ? Number(row.order_number) : null })) })
      } catch (e) {
        if (client) try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    const storeMessagesPOST = async (req, res) => {
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      const token = (req.headers.authorization || '').replace('Bearer ', '').trim()
      if (!token) return res.status(401).json({ message: 'Unauthorized' })
      const payload = verifyCustomerToken(token)
      if (!payload?.email) return res.status(401).json({ message: 'Invalid token' })
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        const { order_id, product_id, body, subject, locale } = req.body || {}
        if (!body) { await client.end(); return res.status(400).json({ message: 'body required' }) }
        if (!order_id || !product_id) { await client.end(); return res.status(400).json({ message: 'order_id and product_id required — pick which product this message is about.' }) }

        // A message concerns exactly ONE product, so it can only ever go to that product's own
        // seller — an order can otherwise mix items from several unrelated real sellers, and a
        // message about seller A's product must never reach seller B just because they happen to
        // share the order. product_id is looked up against this exact order's own items, so a
        // customer can't message a seller about a product that isn't even in this order.
        const oR = await client.query(`SELECT order_number FROM store_orders WHERE id = $1::uuid`, [order_id])
        const orderNumber = oR.rows[0]?.order_number != null ? Number(oR.rows[0].order_number) : null
        const itemR = await client.query(
          `SELECT seller_id, title FROM store_order_items WHERE order_id = $1::uuid AND product_id = $2 LIMIT 1`,
          [order_id, String(product_id)],
        )
        const item = itemR.rows[0]
        if (!item) { await client.end(); return res.status(404).json({ message: 'Product not found in this order.' }) }
        const productSellerId = String(item.seller_id || '').trim()
        if (!productSellerId || productSellerId === 'default') {
          await client.end()
          return res.status(400).json({ message: 'This product has no seller to message.' })
        }
        let sellerEmail = ''
        let sellerLocale = 'de'
        let sellerName = ''
        const sur = await client.query(
          `SELECT email FROM seller_users WHERE seller_id = $1 AND sub_of_seller_id IS NULL ORDER BY created_at ASC LIMIT 1`,
          [productSellerId],
        )
        sellerEmail = String(sur.rows[0]?.email || '').trim()
        const sh = await client.query(
          `SELECT store_name, locale FROM admin_hub_seller_settings WHERE seller_id = $1 LIMIT 1`,
          [productSellerId],
        )
        sellerName = String(sh.rows[0]?.store_name || '').trim()
        const sLoc = String(sh.rows[0]?.locale || '').trim().toLowerCase()
        sellerLocale = FLOW_EMAIL_LOCALES.includes(sLoc) ? sLoc : 'de'

        const r = await client.query(
          `INSERT INTO store_messages (order_id, product_id, sender_type, sender_email, recipient_email, subject, body, channel, seller_id, is_read_by_seller, is_read_by_customer)
           VALUES ($1, $2, 'customer', $3, $4, $5, $6, 'customer', $7, false, true) RETURNING *`,
          [order_id, String(product_id), payload.email, sellerEmail || null, subject || null, body, productSellerId]
        )

        const custR = await client.query(`SELECT first_name, last_name FROM store_customers WHERE LOWER(email) = LOWER($1) LIMIT 1`, [payload.email])
        const customerName = displayNameOrEmail(custR.rows[0]?.first_name, custR.rows[0]?.last_name, payload.email)
        const requestedLocale = String(locale || '').trim().toLowerCase()
        const customerLocale = FLOW_EMAIL_LOCALES.includes(requestedLocale) ? requestedLocale : 'de'
        const sharedVars = {
          CUSTOMER_NAME: customerName,
          CUSTOMER_EMAIL: payload.email,
          SELLER_NAME: sellerName,
          PRODUCT_TITLE: String(item.title || '').trim(),
          MESSAGE_BODY: messageBodyToHtml(body),
          MESSAGE_SUBJECT: String(subject || '').trim(),
          ORDER_NUMBER: orderNumber != null ? String(orderNumber) : '',
          SHOP_MESSAGES_URL: `${resolveShopBaseUrl()}/nachrichten`,
          SELLERCENTRAL_INBOX_URL: `${resolveSellercentralBaseUrl()}/${sellerLocale}/inbox`,
        }

        // Copy of the customer's own message, sent to them — also serves as our own record in
        // whichever mailbox the "customer_message_sent" flow's sender address belongs to.
        runAutomationFlowsForMessageEvent({
          triggerKey: 'customer_message_sent',
          toEmail: payload.email,
          locale: customerLocale,
          vars: sharedVars,
          orderId: order_id || '',
          dedupeKey: r.rows[0]?.id || '',
        }).catch((e) => console.error('[flow-automation] customer_message_sent', e?.message || e))

        // Notify only the one seller who owns the selected product — nobody else with items in
        // this same order is involved in this specific message.
        if (sellerEmail) {
          runAutomationFlowsForMessageEvent({
            triggerKey: 'seller_new_customer_message',
            toEmail: sellerEmail,
            locale: sellerLocale,
            vars: sharedVars,
            orderId: order_id || '',
            dedupeKey: r.rows[0]?.id || '',
          }).catch((e) => console.error('[flow-automation] seller_new_customer_message', e?.message || e))
        }

        await client.end()
        res.status(201).json({ message: r.rows[0] })
      } catch (e) {
        if (client) try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    // ── SMTP Settings ─────────────────────────────────────────────────────
    const syncDefaultSenderFromSmtpForm = async (client, fromEmail, fromName) => {
      const fe = String(fromEmail || '').trim()
      const fn = String(fromName || '').trim()
      if (!fe) return
      const def = await client.query(
        `SELECT id FROM store_smtp_sender_profiles WHERE seller_id = 'default' AND is_default = true LIMIT 1`,
      )
      if (def.rows[0]) {
        await client.query(`UPDATE store_smtp_sender_profiles SET from_email = $1, from_name = $2 WHERE id = $3::uuid`, [
          fe,
          fn || null,
          def.rows[0].id,
        ])
        return
      }
      const cnt = await client.query(`SELECT COUNT(*)::int AS n FROM store_smtp_sender_profiles WHERE seller_id = 'default'`)
      const first = Number(cnt.rows[0]?.n || 0) === 0
      await client.query(
        `INSERT INTO store_smtp_sender_profiles (seller_id, from_email, from_name, is_default) VALUES ('default', $1, $2, $3)`,
        [fe, fn || null, first],
      )
    }

    const adminHubSmtpSettingsGET = async (req, res) => {
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        const r = await client.query(`SELECT seller_id, provider, host, port, secure, username, from_name, from_email, updated_at FROM store_smtp_settings WHERE seller_id = 'default' LIMIT 1`)
        const row = r.rows[0] || null
        const smtpConfigured = !!(row?.host)
        let senders = []
        if (req.sellerUser?.is_superuser) {
          const sr = await client.query(
            `SELECT id, from_email, from_name, is_default, last_test_ok, last_test_at, last_test_message FROM store_smtp_sender_profiles WHERE seller_id = 'default' ORDER BY is_default DESC, created_at ASC`,
          )
          senders = sr.rows || []
        }
        await client.end()
        if (!req.sellerUser?.is_superuser) {
          return res.json({ smtp: null, smtp_configured: smtpConfigured, senders: [] })
        }
        res.json({ smtp: row, smtp_configured: smtpConfigured, senders })
      } catch (e) {
        if (client) try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    const adminHubSmtpSettingsPATCH = async (req, res) => {
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        const { provider, host, port, secure, username, password, from_name, from_email } = req.body || {}
        await client.query(
          `INSERT INTO store_smtp_settings (seller_id, provider, host, port, secure, username, password_enc, from_name, from_email, updated_at)
           VALUES ('default', $1, $2, $3, $4, $5, $6, $7, $8, now())
           ON CONFLICT (seller_id) DO UPDATE SET
             provider = EXCLUDED.provider, host = EXCLUDED.host, port = EXCLUDED.port,
             secure = EXCLUDED.secure, username = EXCLUDED.username,
             password_enc = CASE WHEN EXCLUDED.password_enc IS NOT NULL AND EXCLUDED.password_enc <> '' THEN EXCLUDED.password_enc ELSE store_smtp_settings.password_enc END,
             from_name = EXCLUDED.from_name, from_email = EXCLUDED.from_email, updated_at = now()`,
          [provider || null, host || null, port || 587, !!secure, username || null, password || null, from_name || null, from_email || null]
        )
        await syncDefaultSenderFromSmtpForm(client, from_email, from_name)
        await client.end()
        res.json({ success: true })
      } catch (e) {
        if (client) try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    const adminHubSmtpSettingsTestPOST = async (req, res) => {
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        const transport = await getSmtpTransport(client)
        await client.end()
        if (!transport) return res.status(400).json({ message: 'SMTP nicht konfiguriert' })
        await transport.verify()
        res.json({ success: true, message: 'Verbindung erfolgreich' })
      } catch (e) {
        if (client) try { await client.end() } catch (_) {}
        res.status(400).json({ message: e?.message || 'Verbindung fehlgeschlagen' })
      }
    }

    const SMTP_PROFILE_UUID_RE =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

    const adminHubSmtpSendersPOST = async (req, res) => {
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        const { from_email, from_name } = req.body || {}
        const fe = String(from_email || '').trim()
        if (!fe) {
          await client.end()
          return res.status(400).json({ message: 'from_email required' })
        }
        const cnt = await client.query(`SELECT COUNT(*)::int AS n FROM store_smtp_sender_profiles WHERE seller_id = 'default'`)
        const isFirst = Number(cnt.rows[0]?.n || 0) === 0
        const ins = await client.query(
          `INSERT INTO store_smtp_sender_profiles (seller_id, from_email, from_name, is_default)
           VALUES ('default', $1, $2, $3)
           RETURNING id, from_email, from_name, is_default, last_test_ok, last_test_at, last_test_message`,
          [fe, String(from_name || '').trim() || null, isFirst],
        )
        await client.end()
        res.status(201).json({ sender: ins.rows[0] })
      } catch (e) {
        if (client) try { await client.end() } catch (_) {}
        const msg = e?.code === '23505' ? 'This from_email already exists' : e?.message || 'Error'
        res.status(400).json({ message: msg })
      }
    }

    const adminHubSmtpSendersPATCH = async (req, res) => {
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        const id = String(req.params.id || '').trim()
        if (!SMTP_PROFILE_UUID_RE.test(id)) {
          await client.end()
          return res.status(400).json({ message: 'invalid id' })
        }
        const ex = await client.query(
          `SELECT id FROM store_smtp_sender_profiles WHERE id = $1::uuid AND seller_id = 'default'`,
          [id],
        )
        if (!ex.rows[0]) {
          await client.end()
          return res.status(404).json({ message: 'Sender not found' })
        }
        const { from_email, from_name } = req.body || {}
        const fe = String(from_email || '').trim()
        if (!fe) {
          await client.end()
          return res.status(400).json({ message: 'from_email required' })
        }
        const up = await client.query(
          `UPDATE store_smtp_sender_profiles SET from_email = $1, from_name = $2 WHERE id = $3::uuid AND seller_id = 'default'
           RETURNING id, from_email, from_name, is_default, last_test_ok, last_test_at, last_test_message`,
          [fe, String(from_name || '').trim() || null, id],
        )
        await client.end()
        res.json({ sender: up.rows[0] })
      } catch (e) {
        if (client) try { await client.end() } catch (_) {}
        const msg = e?.code === '23505' ? 'This from_email already exists' : e?.message || 'Error'
        res.status(400).json({ message: msg })
      }
    }

    const adminHubSmtpSendersDELETE = async (req, res) => {
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        const id = String(req.params.id || '').trim()
        if (!SMTP_PROFILE_UUID_RE.test(id)) {
          await client.end()
          return res.status(400).json({ message: 'invalid id' })
        }
        const row = await client.query(
          `SELECT id, is_default FROM store_smtp_sender_profiles WHERE id = $1::uuid AND seller_id = 'default'`,
          [id],
        )
        if (!row.rows[0]) {
          await client.end()
          return res.status(404).json({ message: 'Sender not found' })
        }
        const total = await client.query(`SELECT COUNT(*)::int AS n FROM store_smtp_sender_profiles WHERE seller_id = 'default'`)
        if (Number(total.rows[0]?.n || 0) <= 1) {
          await client.end()
          return res.status(400).json({ message: 'Cannot delete the only sender profile' })
        }
        await client.query(`DELETE FROM store_smtp_sender_profiles WHERE id = $1::uuid AND seller_id = 'default'`, [id])
        if (row.rows[0].is_default) {
          const pick = await client.query(
            `SELECT id FROM store_smtp_sender_profiles WHERE seller_id = 'default' ORDER BY created_at ASC LIMIT 1`,
          )
          if (pick.rows[0]?.id) {
            await client.query(`UPDATE store_smtp_sender_profiles SET is_default = true WHERE id = $1::uuid`, [pick.rows[0].id])
            const sync = await client.query(
              `SELECT from_email, from_name FROM store_smtp_sender_profiles WHERE id = $1::uuid`,
              [pick.rows[0].id],
            )
            if (sync.rows[0]?.from_email) {
              await client.query(
                `UPDATE store_smtp_settings SET from_email = $1, from_name = $2, updated_at = now() WHERE seller_id = 'default'`,
                [String(sync.rows[0].from_email).trim(), sync.rows[0].from_name || null],
              )
            }
          }
        }
        await client.end()
        res.json({ deleted: true })
      } catch (e) {
        if (client) try { await client.end() } catch (_) {}
        res.status(400).json({ message: e?.message || 'Error' })
      }
    }

    const adminHubSmtpSendersSetDefaultPOST = async (req, res) => {
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        const id = String(req.params.id || '').trim()
        if (!SMTP_PROFILE_UUID_RE.test(id)) {
          await client.end()
          return res.status(400).json({ message: 'invalid id' })
        }
        const ex = await client.query(
          `SELECT id FROM store_smtp_sender_profiles WHERE id = $1::uuid AND seller_id = 'default'`,
          [id],
        )
        if (!ex.rows[0]) {
          await client.end()
          return res.status(404).json({ message: 'Sender not found' })
        }
        await client.query(`UPDATE store_smtp_sender_profiles SET is_default = false WHERE seller_id = 'default'`)
        await client.query(`UPDATE store_smtp_sender_profiles SET is_default = true WHERE id = $1::uuid AND seller_id = 'default'`, [id])
        const sync = await client.query(
          `SELECT from_email, from_name FROM store_smtp_sender_profiles WHERE id = $1::uuid`,
          [id],
        )
        if (sync.rows[0]?.from_email) {
          await client.query(
            `UPDATE store_smtp_settings SET from_email = $1, from_name = $2, updated_at = now() WHERE seller_id = 'default'`,
            [String(sync.rows[0].from_email).trim(), sync.rows[0].from_name || null],
          )
        }
        await client.end()
        res.json({ success: true })
      } catch (e) {
        if (client) try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    const adminHubSmtpSendersTestPOST = async (req, res) => {
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        const id = String(req.params.id || '').trim()
        const body = req.body || {}
        const toRaw = String(body.to || '').trim()
        const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        if (!SMTP_PROFILE_UUID_RE.test(id)) {
          await client.end()
          return res.status(400).json({ message: 'invalid id' })
        }
        if (!toRaw || !emailRe.test(toRaw)) {
          await client.end()
          return res.status(400).json({ message: 'valid to email required' })
        }
        const ex = await client.query(
          `SELECT id FROM store_smtp_sender_profiles WHERE id = $1::uuid AND seller_id = 'default'`,
          [id],
        )
        if (!ex.rows[0]) {
          await client.end()
          return res.status(404).json({ message: 'Sender not found' })
        }
        const transport = await getSmtpTransport(client)
        const { fromEmail, fromName } = await resolveSmtpSenderIdentity(client, id)
        const msgOk = 'Test email sent'
        try {
          if (!transport) throw new Error('SMTP not configured')
          const fe = String(fromEmail || '').trim()
          if (!fe) throw new Error('From email not set for this sender')
          await transport.sendMail({
            from: `"${String(fromName).replace(/"/g, '')}" <${fe}>`,
            to: toRaw,
            subject: 'SMTP sender test',
            text: 'Andertal SMTP sender test — OK',
            html: '<p>Andertal SMTP sender test — OK</p>',
          })
          await client.query(
            `UPDATE store_smtp_sender_profiles SET last_test_ok = true, last_test_at = now(), last_test_message = $2 WHERE id = $1::uuid`,
            [id, msgOk],
          )
          await client.end()
          return res.json({ success: true, message: msgOk })
        } catch (sendErr) {
          const errMsg = String(sendErr?.message || sendErr || 'Send failed').slice(0, 500)
          await client.query(
            `UPDATE store_smtp_sender_profiles SET last_test_ok = false, last_test_at = now(), last_test_message = $2 WHERE id = $1::uuid`,
            [id, errMsg],
          )
          await client.end()
          return res.status(400).json({ message: errMsg })
        }
      } catch (e) {
        if (client) try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }
    const storeMessagesUnreadCountGET = async (req, res) => {
      const client = getDbClient()
      if (!client) return res.json({ count: 0 })
      try {
        await client.connect()
        const email = req.query.email
        if (!email) return res.json({ count: 0 })
        const r = await client.query(
          `SELECT COUNT(*)::int AS c FROM store_messages WHERE recipient_email = $1 AND sender_type = 'seller' AND is_read_by_customer = false`,
          [email]
        )
        res.json({ count: r.rows[0]?.c || 0 })
      } catch { res.json({ count: 0 }) } finally { await client.end().catch(() => {}) }
    }

    const storeMessagesMarkReadPATCH = async (req, res) => {
      const client = getDbClient()
      if (!client) return res.json({ ok: true })
      try {
        await client.connect()
        const { email, order_id } = req.body || {}
        if (!email) return res.json({ ok: true })
        let q = `UPDATE store_messages SET is_read_by_customer = true WHERE recipient_email = $1 AND sender_type = 'seller'`
        const params = [email]
        if (order_id) { params.push(order_id); q += ` AND order_id = $2` }
        else q += ` AND order_id IS NULL`
        await client.query(q, params)
        res.json({ ok: true })
      } catch { res.json({ ok: true }) } finally { await client.end().catch(() => {}) }
    }

  const router = Router()
  router.get('/admin-hub/v1/messages', adminHubMessagesGET)
  router.post('/admin-hub/v1/messages', adminHubMessagesPOST)
  router.patch('/admin-hub/v1/messages/support/mark-read', adminHubSupportMessagesMarkReadPATCH)
  router.patch('/admin-hub/v1/messages/:id/read', adminHubMessageMarkReadPATCH)
  router.get('/admin-hub/v1/message-templates', adminHubMessageTemplatesGET)
  router.post('/admin-hub/v1/message-templates', adminHubMessageTemplatesPOST)
  router.patch('/admin-hub/v1/message-templates/:id', adminHubMessageTemplatesPATCH)
  router.delete('/admin-hub/v1/message-templates/:id', adminHubMessageTemplatesDELETE)
  router.get('/store/messages', storeMessagesGET)
  router.post('/store/messages', storeMessagesPOST)
  router.get('/store/messages/unread-count', storeMessagesUnreadCountGET)
  router.patch('/store/messages/mark-read', storeMessagesMarkReadPATCH)
  router.get('/admin-hub/v1/smtp-settings', adminHubSmtpSettingsGET)
  router.patch('/admin-hub/v1/smtp-settings', requireSuperuser, adminHubSmtpSettingsPATCH)
  router.post('/admin-hub/v1/smtp-settings/test', requireSuperuser, adminHubSmtpSettingsTestPOST)
  router.post('/admin-hub/v1/smtp-senders', requireSuperuser, adminHubSmtpSendersPOST)
  router.patch('/admin-hub/v1/smtp-senders/:id', requireSuperuser, adminHubSmtpSendersPATCH)
  router.delete('/admin-hub/v1/smtp-senders/:id', requireSuperuser, adminHubSmtpSendersDELETE)
  router.post('/admin-hub/v1/smtp-senders/:id/set-default', requireSuperuser, adminHubSmtpSendersSetDefaultPOST)
  router.post('/admin-hub/v1/smtp-senders/:id/test', requireSuperuser, adminHubSmtpSendersTestPOST)
  return router
}

module.exports = { createMessagesRouter, getSmtpTransport }
