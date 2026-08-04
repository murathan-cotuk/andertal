'use strict'

const { Router } = require('express')
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const multer = require('multer')
const { getPool } = require('../db-pool')
const { runAutomationFlowsForMessageEvent } = require('../flow-automation')
const {
  TERMINAL_STATUSES,
  STATUSES,
  normalizePlainText,
  routeCategory,
  normalizeCaseView,
  groupOrderItemsBySeller,
  transitionFor,
  nextStatusAfterMessage,
  canAccessCase,
  detectFileType,
  makeAttachmentKey,
} = require('../support-case-core')

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const MAX_ATTACHMENTS = Math.max(1, Math.min(Number(process.env.SUPPORT_ATTACHMENT_MAX_COUNT || 5), 10))
const MAX_ATTACHMENT_BYTES = Math.max(1024, Math.min(Number(process.env.SUPPORT_ATTACHMENT_MAX_BYTES || 10 * 1024 * 1024), 20 * 1024 * 1024))
const ARCHIVE_DAYS = Math.max(1, Number(process.env.SUPPORT_CUSTOMER_ARCHIVE_DAYS || 30))
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { files: MAX_ATTACHMENTS, fileSize: MAX_ATTACHMENT_BYTES },
})

function clampInt(value, fallback, min, max) {
  const n = Number.parseInt(value, 10)
  return Number.isFinite(n) ? Math.min(Math.max(n, min), max) : fallback
}

function bearer(req) {
  const value = String(req.headers.authorization || '')
  return value.replace(/^Bearer\s+/i, '').trim()
}

function customerActor(req, verifyCustomerToken) {
  const payload = verifyCustomerToken(bearer(req))
  const email = String(payload?.email || '').trim().toLowerCase()
  const customerId = UUID_RE.test(String(payload?.id || '')) ? String(payload.id) : null
  return email ? { role: 'customer', email, customerId, id: customerId || email } : null
}

function sellerActor(req) {
  const user = req.sellerUser
  if (!user) return null
  const isSuperuser = user.is_superuser === true
  return {
    role: isSuperuser ? 'support' : 'seller',
    isSuperuser,
    sellerId: String(user.seller_id || '').trim() || null,
    id: String(user.id || user.email || user.seller_id || '').trim(),
  }
}

function createMemoryRateLimit({ windowMs, max }) {
  const buckets = new Map()
  return (req, res, next) => {
    const now = Date.now()
    const actor = req.supportActor?.id || req.ip || req.socket?.remoteAddress || 'unknown'
    const key = `${actor}:${req.baseUrl}:${req.route?.path || req.path}`
    const current = buckets.get(key)
    if (!current || current.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs })
      if (buckets.size > 10000) {
        for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k)
      }
      return next()
    }
    current.count += 1
    if (current.count > max) return res.status(429).json({ code: 'RATE_LIMITED', message: 'Too many support requests' })
    next()
  }
}

async function withClient(fn) {
  const pool = getPool()
  if (!pool) throw Object.assign(new Error('Database not configured'), { status: 503 })
  const client = await pool.connect()
  try {
    return await fn(client)
  } finally {
    client.release()
  }
}

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next)
}

function publicCase(row) {
  return {
    id: row.id,
    case_number: row.case_number,
    customer_id: row.customer_id,
    customer_email: row.customer_email,
    order_id: row.order_id,
    order_number: row.order_number == null ? null : Number(row.order_number),
    seller_id: row.seller_id,
    seller_display_name: row.seller_display_name || (row.seller_id ? null : 'Andertal Support'),
    parent_case_id: row.parent_case_id,
    category: row.category,
    subcategory: row.subcategory,
    title: row.title,
    status: row.status,
    priority: row.priority,
    locale: row.locale,
    created_at: row.created_at,
    updated_at: row.updated_at,
    closed_at: row.closed_at,
    reopened_at: row.reopened_at,
    customer_hidden_at: row.customer_hidden_at,
    auto_archive_at: row.auto_archive_at,
    last_message_at: row.last_message_at,
    legal_hold: row.legal_hold,
    resolution_note: row.resolution_note,
  }
}

function inboxCase(row) {
  const base = publicCase(row)
  delete base.customer_id
  delete base.customer_email
  return {
    ...base,
    order_number: row.order_number == null ? null : Number(row.order_number),
    seller_display_name: row.seller_display_name || 'Andertal Support',
    items: row.items || [],
    item_thumbnails: row.item_thumbnails || [],
    last_message: row.last_message_id ? {
      id: row.last_message_id,
      body: row.last_message_body,
      preview: normalizePlainText(row.last_message_body, 180),
      sender_role: row.last_message_sender_role,
      created_at: row.last_message_created_at,
    } : null,
    unread_count: Number(row.unread_count || 0),
  }
}

function parseAttachmentIds(value) {
  if (!Array.isArray(value)) return []
  const ids = value.map((entry) => String(typeof entry === 'string' ? entry : entry?.upload_id || entry?.id || '')).filter((id) => UUID_RE.test(id))
  if (ids.length !== value.length || ids.length > MAX_ATTACHMENTS || new Set(ids).size !== ids.length) {
    throw Object.assign(new Error('Invalid attachments'), { status: 400, code: 'INVALID_ATTACHMENTS' })
  }
  return ids
}

async function consumeAttachments(client, ids, actor, caseId) {
  if (!ids.length) return []
  const ownerId = String(actor.id)
  const result = await client.query(
    `SELECT id, public_url, mime_type, byte_size, original_name
       FROM support_attachment_uploads
      WHERE id = ANY($1::uuid[]) AND owner_role = $2 AND owner_id = $3
        AND consumed_at IS NULL AND expires_at > now()
      FOR UPDATE`,
    [ids, actor.role, ownerId],
  )
  if (result.rows.length !== ids.length) throw Object.assign(new Error('Attachment is invalid, expired, or not owned by caller'), { status: 400 })
  await client.query(
    `UPDATE support_attachment_uploads SET consumed_at = now(), case_id = $2::uuid WHERE id = ANY($1::uuid[])`,
    [ids, caseId],
  )
  return result.rows.map((row) => ({
    upload_id: row.id,
    url: row.public_url,
    mime_type: row.mime_type,
    byte_size: row.byte_size,
    name: row.original_name,
  }))
}

async function insertEvent(client, caseId, eventType, actor, data = {}, dedupeKey = null) {
  await client.query(
    `INSERT INTO support_case_events (case_id, event_type, actor_role, actor_id, data, dedupe_key)
     VALUES ($1::uuid, $2, $3, $4, $5::jsonb, $6)
     ON CONFLICT (case_id, dedupe_key) DO NOTHING`,
    [caseId, eventType, actor.role, actor.id || null, JSON.stringify(data), dedupeKey],
  )
}

async function notifyCase(client, supportCase, kind, actor, messageId = '') {
  const dedupeKey = `support:${kind}:${supportCase.id}:${messageId || supportCase.status}`
  const pendingEmails = []
  const inAppReserved = await client.query(
    `INSERT INTO support_notification_dedupe (dedupe_key, case_id, channel)
     VALUES ($1, $2::uuid, 'in_app') ON CONFLICT DO NOTHING RETURNING dedupe_key`,
    [dedupeKey, supportCase.id],
  )
  const sellerBase = String(process.env.NEXT_PUBLIC_SELLERCENTRAL_URL || process.env.SELLERCENTRAL_URL || 'https://sellercentral.andertal.com').replace(/\/$/, '')
  let inAppLocale = /^[a-z]{2}$/.test(String(supportCase.locale || '').toLowerCase()) ? String(supportCase.locale).toLowerCase() : 'de'
  if (supportCase.seller_id) {
    const sellerLocale = String((await client.query(
      'SELECT locale FROM admin_hub_seller_settings WHERE seller_id=$1 LIMIT 1',
      [supportCase.seller_id],
    )).rows[0]?.locale || '').trim().toLowerCase()
    if (/^[a-z]{2}$/.test(sellerLocale)) inAppLocale = sellerLocale
  }
  const sellerInboxUrl = `${sellerBase}/${inAppLocale}/inbox?case=${encodeURIComponent(supportCase.id)}`
  if (inAppReserved.rows.length) {
    try {
      await client.query(
        `INSERT INTO admin_hub_notifications (type, title, body, seller_id, reference_id)
         VALUES ('support_case', $1, $2, $3, $4)`,
        [`Support case ${supportCase.case_number}`, `${kind}: ${supportCase.title}\n${sellerInboxUrl}`, supportCase.seller_id, supportCase.id],
      )
    } catch (error) {
      await client.query(`DELETE FROM support_notification_dedupe WHERE dedupe_key=$1 AND channel='in_app'`, [dedupeKey]).catch(() => {})
      throw error
    }
  }

  const shopBase = String(process.env.STOREFRONT_PUBLIC_URL || process.env.SHOP_PUBLIC_URL || process.env.PUBLIC_SHOP_URL || '').replace(/\/$/, '')
  const customerUrl = `${shopBase}/nachrichten?case=${encodeURIComponent(supportCase.id)}`
  const recipients = []
  const addSellerRecipient = async () => {
    if (!supportCase.seller_id) return false
    const seller = (await client.query(
      `SELECT u.email, COALESCE(s.locale, 'de') AS locale
         FROM seller_users u LEFT JOIN admin_hub_seller_settings s ON s.seller_id=u.seller_id
        WHERE u.seller_id=$1 AND u.sub_of_seller_id IS NULL ORDER BY u.created_at LIMIT 1`,
      [supportCase.seller_id],
    )).rows[0]
    if (!seller?.email) return false
    const locale = normalizePlainText(seller.locale || 'de', 8).toLowerCase() || 'de'
    recipients.push({
      email: String(seller.email).trim(),
      locale,
      triggerKey: 'seller_support_case_updated',
      url: `${sellerBase}/${locale}/inbox?case=${encodeURIComponent(supportCase.id)}`,
    })
    return true
  }
  const addSupportRecipients = async () => {
    const dbRecipients = await client.query(
      `SELECT email FROM seller_users WHERE is_superuser=true AND email IS NOT NULL
       UNION SELECT admin_notification_email AS email FROM admin_hub_seller_settings
        WHERE seller_id='default' AND admin_notification_email IS NOT NULL`,
    )
    const envRecipients = String(process.env.SUPERUSER_EMAILS || '').split(',')
    for (const raw of [...dbRecipients.rows.map((row) => row.email), ...envRecipients]) {
      const email = String(raw || '').trim()
      if (email) recipients.push({ email, locale: 'de', triggerKey: 'admin_support_case_updated', url: sellerInboxUrl })
    }
  }

  if (actor?.role === 'customer') {
    if (!(await addSellerRecipient())) await addSupportRecipients()
  } else {
    if (supportCase.customer_email) {
      recipients.push({
        email: supportCase.customer_email,
        locale: supportCase.locale || 'de',
        triggerKey: 'customer_support_case_updated',
        url: customerUrl,
      })
    }
    if (kind === 'reassigned') {
      if (!(await addSellerRecipient())) await addSupportRecipients()
    }
  }

  const uniqueRecipients = new Map()
  for (const recipient of recipients) {
    const key = `${recipient.triggerKey}:${String(recipient.email).toLowerCase()}`
    if (!uniqueRecipients.has(key)) uniqueRecipients.set(key, recipient)
  }
  for (const recipient of uniqueRecipients.values()) {
    const recipientHash = crypto.createHash('sha256').update(`${recipient.triggerKey}:${recipient.email.toLowerCase()}`).digest('hex').slice(0, 24)
    const emailDedupe = `${dedupeKey}:email:${recipientHash}`
    const emailReserved = await client.query(
      `INSERT INTO support_notification_dedupe (dedupe_key, case_id, channel)
       VALUES ($1, $2::uuid, 'flow_email') ON CONFLICT DO NOTHING RETURNING dedupe_key`,
      [emailDedupe, supportCase.id],
    )
    if (!emailReserved.rows.length) continue
    pendingEmails.push({
      triggerKey: recipient.triggerKey,
      toEmail: recipient.email,
      locale: recipient.locale,
      vars: {
        CASE_ID: supportCase.id,
        CASE_NUMBER: supportCase.case_number,
        CASE_TITLE: supportCase.title,
        CASE_STATUS: supportCase.status,
        SUPPORT_CASE_EVENT: kind,
        SUPPORT_CASE_URL: recipient.url,
      },
      orderId: supportCase.order_id || '',
      dedupeKey: emailDedupe,
    })
  }
  return pendingEmails
}

function dispatchPendingEmails(pendingEmails = []) {
  for (const recipient of pendingEmails) {
    setImmediate(() => {
      runAutomationFlowsForMessageEvent({
        triggerKey: recipient.triggerKey,
        toEmail: recipient.toEmail,
        locale: recipient.locale,
        vars: recipient.vars,
        orderId: recipient.orderId,
        dedupeKey: recipient.dedupeKey,
      }).catch((error) => console.warn(`[support-cases] ${recipient.triggerKey}:`, error?.message || error))
    })
  }
}

async function loadCaseDetail(client, id, { includeEvents = true } = {}) {
  const row = (await client.query(
    `SELECT c.*, o.order_number, COALESCE(settings.store_name, 'Andertal Support') AS seller_display_name
       FROM support_cases c
       LEFT JOIN store_orders o ON o.id = c.order_id
       LEFT JOIN admin_hub_seller_settings settings ON settings.seller_id = c.seller_id
      WHERE c.id = $1::uuid`,
    [id],
  )).rows[0]
  if (!row) return null
  const [items, messages, events] = await Promise.all([
    client.query('SELECT * FROM support_case_items WHERE case_id = $1::uuid ORDER BY created_at', [id]),
    client.query('SELECT * FROM support_case_messages WHERE case_id = $1::uuid ORDER BY created_at', [id]),
    includeEvents
      ? client.query('SELECT id, event_type, actor_role, data, created_at FROM support_case_events WHERE case_id = $1::uuid ORDER BY created_at', [id])
      : Promise.resolve({ rows: [] }),
  ])
  return {
    case: publicCase(row),
    items: items.rows,
    messages: messages.rows,
    ...(includeEvents ? { events: events.rows } : {}),
  }
}

async function saveAttachment(file) {
  const detected = detectFileType(file.buffer)
  if (!detected) throw Object.assign(new Error('Only valid JPEG, PNG, WebP, or PDF files are allowed'), { status: 415 })
  const key = makeAttachmentKey(detected.ext)
  if (process.env.S3_UPLOAD_BUCKET && process.env.S3_UPLOAD_REGION) {
    const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3')
    const bucket = process.env.S3_UPLOAD_BUCKET
    const region = process.env.S3_UPLOAD_REGION
    const s3 = new S3Client({
      region,
      ...(process.env.S3_UPLOAD_ENDPOINT && { endpoint: process.env.S3_UPLOAD_ENDPOINT }),
      ...(process.env.S3_UPLOAD_ACCESS_KEY_ID && process.env.S3_UPLOAD_SECRET_ACCESS_KEY
        ? { credentials: { accessKeyId: process.env.S3_UPLOAD_ACCESS_KEY_ID, secretAccessKey: process.env.S3_UPLOAD_SECRET_ACCESS_KEY } }
        : {}),
    })
    await s3.send(new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: file.buffer,
      ContentType: detected.mime,
      ...(process.env.S3_UPLOAD_ACL && { ACL: process.env.S3_UPLOAD_ACL }),
    }))
    const base = String(process.env.S3_UPLOAD_PUBLIC_BASE_URL || `https://${bucket}.s3.${region}.amazonaws.com`).replace(/\/$/, '')
    return { key, url: `${base}/${key}`, mime: detected.mime, ext: detected.ext }
  }
  const uploadRoot = process.env.UPLOAD_DIR ? path.resolve(process.env.UPLOAD_DIR) : path.join(__dirname, '..', '..', 'uploads')
  const destination = path.join(uploadRoot, ...key.split('/'))
  fs.mkdirSync(path.dirname(destination), { recursive: true })
  fs.writeFileSync(destination, file.buffer, { flag: 'wx' })
  return { key, url: `/uploads/${key.replace(/\\/g, '/')}`, mime: detected.mime, ext: detected.ext }
}

module.exports = function createSupportCasesRouter({ verifyCustomerToken }) {
  const router = Router()
  const writeLimit = createMemoryRateLimit({ windowMs: 60 * 1000, max: 20 })
  const uploadLimit = createMemoryRateLimit({ windowMs: 10 * 60 * 1000, max: 20 })

  const requireCustomer = (req, res, next) => {
    const actor = customerActor(req, verifyCustomerToken)
    if (!actor) return res.status(401).json({ message: 'Unauthorized' })
    req.supportActor = actor
    next()
  }
  const requireSeller = (req, res, next) => {
    const actor = sellerActor(req)
    if (!actor || (!actor.isSuperuser && !actor.sellerId)) return res.status(401).json({ message: 'Unauthorized' })
    req.supportActor = actor
    next()
  }

  router.get('/store/support/orders', requireCustomer, asyncRoute(async (req, res) => {
    const actor = req.supportActor
    const limit = clampInt(req.query.limit, 10, 1, 25)
    const orders = await withClient(async (client) => {
      const result = await client.query(
        `SELECT o.id, o.order_number, o.order_status, o.payment_status, o.delivery_status,
                o.created_at, o.tracking_number, o.carrier_name, o.shipped_at, o.delivery_date,
                COALESCE(jsonb_agg(jsonb_build_object(
                  'id', oi.id, 'product_id', oi.product_id, 'variant_id', oi.variant_id,
                  'seller_id', oi.seller_id, 'title', oi.title, 'image', oi.thumbnail,
                  'quantity', oi.quantity
                ) ORDER BY oi.created_at) FILTER (WHERE oi.id IS NOT NULL), '[]'::jsonb) AS items
           FROM store_orders o
           LEFT JOIN store_order_items oi ON oi.order_id = o.id
          WHERE (($1::uuid IS NOT NULL AND o.customer_id = $1::uuid) OR lower(o.email) = lower($2))
          GROUP BY o.id
          ORDER BY o.created_at DESC
          LIMIT $3`,
        [actor.customerId, actor.email, limit],
      )
      return result.rows
    })
    res.json({ orders })
  }))

  router.get('/store/support/cases', requireCustomer, asyncRoute(async (req, res) => {
    const actor = req.supportActor
    const page = clampInt(req.query.page, 1, 1, 100000)
    const limit = clampInt(req.query.limit, 20, 1, 100)
    const status = String(req.query.status || '').trim()
    const category = normalizePlainText(req.query.category, 50).toLowerCase()
    const filter = normalizePlainText(req.query.filter || req.query.q, 100)
    const view = normalizeCaseView(req.query.view)
    if (status && !STATUSES.has(status)) return res.status(400).json({ message: 'Invalid status' })
    if (view == null) return res.status(400).json({ message: 'Invalid view' })
    const result = await withClient(async (client) => {
      await client.query(
        `UPDATE support_cases SET customer_hidden_at=NULL, auto_archive_at=NULL, closed_at=NULL, updated_at=now()
          WHERE status='reopened' AND (customer_hidden_at IS NOT NULL OR auto_archive_at IS NOT NULL OR closed_at IS NOT NULL)
            AND (($1::uuid IS NOT NULL AND customer_id=$1::uuid) OR lower(customer_email)=lower($2))`,
        [actor.customerId, actor.email],
      )
      const params = [actor.customerId, actor.email]
      const filters = [
        `(($1::uuid IS NOT NULL AND c.customer_id = $1::uuid) OR lower(c.customer_email) = lower($2))`,
        'c.customer_hidden_at IS NULL',
        `(c.auto_archive_at IS NULL OR c.auto_archive_at > now())`,
      ]
      if (status) { params.push(status); filters.push(`c.status = $${params.length}`) }
      if (view === 'open') filters.push(`c.status IN ('open','reopened','awaiting_seller','awaiting_customer','awaiting_support')`)
      if (view === 'unread') filters.push('unread.unread_count > 0')
      if (category) { params.push(category); filters.push(`c.category = $${params.length}`) }
      if (filter) {
        params.push(`%${filter.replace(/[%_\\]/g, '\\$&')}%`)
        filters.push(`(c.case_number ILIKE $${params.length} ESCAPE '\\' OR c.title ILIKE $${params.length} ESCAPE '\\'
          OR c.category ILIKE $${params.length} ESCAPE '\\' OR CAST(o.order_number AS text) ILIKE $${params.length} ESCAPE '\\'
          OR COALESCE(settings.store_name, 'Andertal Support') ILIKE $${params.length} ESCAPE '\\')`)
      }
      params.push(limit, (page - 1) * limit)
      const rows = await client.query(
        `SELECT c.*, o.order_number, COALESCE(settings.store_name, 'Andertal Support') AS seller_display_name,
                item_data.items, item_data.item_thumbnails,
                last_msg.id AS last_message_id, last_msg.body AS last_message_body,
                last_msg.sender_role AS last_message_sender_role, last_msg.created_at AS last_message_created_at,
                unread.unread_count, count(*) OVER()::int AS total
           FROM support_cases c
           LEFT JOIN store_orders o ON o.id=c.order_id
           LEFT JOIN admin_hub_seller_settings settings ON settings.seller_id=c.seller_id
           LEFT JOIN LATERAL (
             SELECT COALESCE(jsonb_agg(jsonb_build_object(
                      'id', i.id, 'order_item_id', i.order_item_id, 'title', i.title_snapshot,
                      'thumbnail', i.image_snapshot, 'quantity', i.quantity_snapshot
                    ) ORDER BY i.created_at), '[]'::jsonb) AS items,
                    COALESCE(jsonb_agg(i.image_snapshot) FILTER (WHERE i.image_snapshot IS NOT NULL), '[]'::jsonb) AS item_thumbnails
               FROM support_case_items i WHERE i.case_id=c.id
           ) item_data ON true
           LEFT JOIN LATERAL (
             SELECT m.id, m.body, m.sender_role, m.created_at
               FROM support_case_messages m WHERE m.case_id=c.id ORDER BY m.created_at DESC LIMIT 1
           ) last_msg ON true
           LEFT JOIN LATERAL (
             SELECT count(*)::int AS unread_count FROM support_case_messages m
              WHERE m.case_id=c.id AND m.sender_role <> 'customer' AND m.read_by_customer_at IS NULL
           ) unread ON true
         WHERE ${filters.join(' AND ')}
         ORDER BY c.updated_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params,
      )
      const legacy = page === 1 && !status && !category && !filter && !view
        ? await client.query(
          `SELECT m.id, m.order_id, m.subject, m.body, m.created_at, m.seller_id,
                  m.sender_type, m.is_read_by_customer, o_legacy.order_number,
                  settings_legacy.store_name AS seller_display_name
             FROM store_messages m
             LEFT JOIN store_orders o_legacy ON o_legacy.id=m.order_id
             LEFT JOIN admin_hub_seller_settings settings_legacy ON settings_legacy.seller_id=m.seller_id
            WHERE (lower(m.sender_email) = lower($1) OR lower(m.recipient_email) = lower($1)
              OR EXISTS (SELECT 1 FROM store_orders o WHERE o.id = m.order_id
                AND (($2::uuid IS NOT NULL AND o.customer_id = $2::uuid) OR lower(o.email) = lower($1))))
            ORDER BY m.created_at DESC LIMIT 10`,
          [actor.email, actor.customerId],
        )
        : { rows: [] }
      return { rows: rows.rows, legacy: legacy.rows }
    })
    const legacyCases = result.legacy.map((row) => ({
      id: `legacy-${row.id}`, case_number: `LEGACY-${String(row.id).slice(0, 8).toUpperCase()}`,
      order_id: row.order_id, seller_id: row.seller_id, category: 'legacy', subcategory: 'message',
      title: row.subject || normalizePlainText(row.body, 80), status: 'closed', created_at: row.created_at,
      updated_at: row.created_at, last_message_at: row.created_at, legacy_read_only: true,
      order_number: row.order_number == null ? null : Number(row.order_number),
      seller_display_name: row.seller_display_name || 'Andertal Support',
      items: [], item_thumbnails: [],
      last_message: { id: row.id, body: row.body, preview: normalizePlainText(row.body, 180), sender_role: row.sender_type, created_at: row.created_at },
      unread_count: row.sender_type === 'seller' && !row.is_read_by_customer ? 1 : 0,
    }))
    res.json({ cases: [...result.rows.map(inboxCase), ...legacyCases], page, limit, total: result.rows[0]?.total || 0, legacy_count: legacyCases.length })
  }))

  router.get('/store/support/cases/:id', requireCustomer, asyncRoute(async (req, res) => {
    const actor = req.supportActor
    const id = String(req.params.id || '')
    if (id.startsWith('legacy-') && UUID_RE.test(id.slice(7))) {
      const legacy = await withClient(async (client) => {
        const result = await client.query(
          `SELECT m.* FROM store_messages m
            WHERE m.id = $1::uuid AND
             (lower(m.sender_email) = lower($2) OR lower(m.recipient_email) = lower($2)
              OR EXISTS (SELECT 1 FROM store_orders o WHERE o.id = m.order_id
                AND (($3::uuid IS NOT NULL AND o.customer_id = $3::uuid) OR lower(o.email) = lower($2))))`,
          [id.slice(7), actor.email, actor.customerId],
        )
        return result.rows[0]
      })
      if (!legacy) return res.status(404).json({ message: 'Case not found' })
      return res.json({
        case: { id, case_number: `LEGACY-${legacy.id.slice(0, 8).toUpperCase()}`, category: 'legacy', title: legacy.subject || 'Legacy message', status: 'closed', legacy_read_only: true },
        items: [], messages: [{ id: legacy.id, sender_role: legacy.sender_type, body: legacy.body, created_at: legacy.created_at, attachments: [] }], events: [],
      })
    }
    if (!UUID_RE.test(id)) return res.status(404).json({ message: 'Case not found' })
    const detail = await withClient(async (client) => {
      const cleared = (await client.query(
        `UPDATE support_cases SET customer_hidden_at=NULL, auto_archive_at=NULL, closed_at=NULL, updated_at=now()
          WHERE id=$1::uuid AND status='reopened'
            AND (customer_hidden_at IS NOT NULL OR auto_archive_at IS NOT NULL OR closed_at IS NOT NULL)
            AND (($2::uuid IS NOT NULL AND customer_id=$2::uuid) OR lower(customer_email)=lower($3))
          RETURNING id`,
        [id, actor.customerId, actor.email],
      )).rows[0]
      void cleared
      const loaded = await loadCaseDetail(client, id, { includeEvents: true })
      if (!loaded || !canAccessCase(actor, loaded.case) || loaded.case.customer_hidden_at || (loaded.case.auto_archive_at && new Date(loaded.case.auto_archive_at) <= new Date())) return null
      return loaded
    })
    if (!detail) return res.status(404).json({ message: 'Case not found' })
    res.json(detail)
  }))

  const customerAttachmentUpload = asyncRoute(async (req, res) => {
    const files = req.files || []
    if (!files.length) return res.status(400).json({ message: 'files required' })
    const stored = []
    for (const file of files) {
      const saved = await saveAttachment(file)
      stored.push({ file, saved })
    }
    const uploads = await withClient(async (client) => {
      const rows = []
      for (const { file, saved } of stored) {
        const result = await client.query(
          `INSERT INTO support_attachment_uploads
            (owner_role, owner_id, storage_key, public_url, mime_type, byte_size, original_name, sha256)
           VALUES ('customer', $1, $2, $3, $4, $5, $6, $7) RETURNING id, public_url, mime_type, byte_size, expires_at`,
          [req.supportActor.id, saved.key, saved.url, saved.mime, file.size, normalizePlainText(path.basename(file.originalname), 255), crypto.createHash('sha256').update(file.buffer).digest('hex')],
        )
        rows.push(result.rows[0])
      }
      return rows
    })
    res.status(201).json({ attachments: uploads })
  })
  router.post('/store/support/attachments/upload', requireCustomer, uploadLimit, upload.array('files', MAX_ATTACHMENTS), customerAttachmentUpload)
  router.post('/store/support/attachments', requireCustomer, uploadLimit, upload.array('files', MAX_ATTACHMENTS), customerAttachmentUpload)

  router.post('/store/support/cases', requireCustomer, writeLimit, asyncRoute(async (req, res) => {
    const actor = req.supportActor
    const body = req.body || {}
    const routing = routeCategory(body.category)
    const subcategory = normalizePlainText(body.subcategory, 80).toLowerCase()
    const title = normalizePlainText(body.title, 200)
    const description = normalizePlainText(body.description, 10000)
    const locale = normalizePlainText(body.locale || 'de', 8).toLowerCase() || 'de'
    const orderId = body.order_id == null || body.order_id === '' ? null : String(body.order_id)
    const itemIds = Array.isArray(body.item_ids) ? body.item_ids.map(String) : []
    const attachmentIds = parseAttachmentIds(body.attachments || [])
    const idempotencyKey = normalizePlainText(body.idempotency_key, 200)
    if (!routing.category || !subcategory || !title || !description || !idempotencyKey) return res.status(400).json({ message: 'category, subcategory, title, description and idempotency_key are required' })
    if (!routing.accepted) return res.status(400).json({ code: 'INVALID_CATEGORY', message: 'Unsupported support category' })
    if ((orderId && !UUID_RE.test(orderId)) || itemIds.length > 100 || itemIds.some((id) => !UUID_RE.test(id)) || new Set(itemIds).size !== itemIds.length) return res.status(400).json({ message: 'Invalid order/item IDs' })
    if (routing.requiresOrder && (!orderId || !itemIds.length)) return res.status(400).json({ message: 'This category requires order_id and item_ids' })
    const requestHash = crypto.createHash('sha256').update(JSON.stringify({ category: routing.category, subcategory, title, description, locale, orderId, itemIds: [...itemIds].sort(), attachmentIds: [...attachmentIds].sort() })).digest('hex')
    const response = await withClient(async (client) => {
      await client.query('BEGIN')
      try {
        const customerKey = actor.customerId || actor.email
        const reservation = await client.query(
          `INSERT INTO support_case_idempotency (customer_key, idempotency_key, request_hash)
           VALUES ($1, $2, $3) ON CONFLICT DO NOTHING RETURNING customer_key`,
          [customerKey, idempotencyKey, requestHash],
        )
        if (!reservation.rows.length) {
          const existing = (await client.query(
            `SELECT request_hash, response_json FROM support_case_idempotency
              WHERE customer_key = $1 AND idempotency_key = $2 FOR UPDATE`,
            [customerKey, idempotencyKey],
          )).rows[0]
          if (existing?.request_hash !== requestHash) throw Object.assign(new Error('Idempotency key was used with a different request'), { status: 409, code: 'IDEMPOTENCY_CONFLICT' })
          if (existing?.response_json) {
            await client.query('COMMIT')
            return existing.response_json
          }
        }
        let items = []
        if (orderId) {
          const ownedOrder = (await client.query(
            `SELECT id FROM store_orders WHERE id = $1::uuid
              AND (($2::uuid IS NOT NULL AND customer_id = $2::uuid) OR lower(email) = lower($3)) FOR SHARE`,
            [orderId, actor.customerId, actor.email],
          )).rows[0]
          if (!ownedOrder) throw Object.assign(new Error('Order not found'), { status: 404 })
          if (itemIds.length) {
            items = (await client.query(
              `SELECT id, order_id, product_id, variant_id, seller_id, title, thumbnail, quantity, unit_price_cents
                 FROM store_order_items WHERE order_id = $1::uuid AND id = ANY($2::uuid[]) FOR SHARE`,
              [orderId, itemIds],
            )).rows
            if (items.length !== itemIds.length) throw Object.assign(new Error('One or more order items were not found in this order'), { status: 400 })
          }
        }
        const groups = routing.isPlatform ? [{ sellerId: null, items }] : groupOrderItemsBySeller(items, routing.category)
        if (!groups.length) groups.push({ sellerId: null, items: [] })
        const created = []
        let primaryId = null
        let sharedAttachments = null
        const pendingEmails = []
        for (let index = 0; index < groups.length; index += 1) {
          const group = groups[index]
          const initialStatus = group.sellerId ? 'awaiting_seller' : 'awaiting_support'
          const inserted = (await client.query(
            `INSERT INTO support_cases
              (customer_id, customer_email, order_id, seller_id, parent_case_id, category, subcategory, title, status, locale)
             VALUES ($1::uuid, $2, $3::uuid, $4, $5::uuid, $6, $7, $8, $9, $10) RETURNING *`,
            [actor.customerId, actor.email, orderId, routing.isPlatform ? null : group.sellerId, primaryId, routing.category, subcategory, title, initialStatus, locale],
          )).rows[0]
          if (!primaryId) primaryId = inserted.id
          for (const item of group.items) {
            await client.query(
              `INSERT INTO support_case_items
                (case_id, order_item_id, order_id, seller_id, product_id_snapshot, variant_id_snapshot,
                 title_snapshot, image_snapshot, quantity_snapshot, unit_price_cents_snapshot)
               VALUES ($1::uuid,$2::uuid,$3::uuid,$4,$5,$6,$7,$8,$9,$10)`,
              [inserted.id, item.id, item.order_id, routing.isPlatform ? null : item.seller_id, item.product_id, item.variant_id, normalizePlainText(item.title || 'Order item', 500), item.thumbnail || null, item.quantity, item.unit_price_cents],
            )
          }
          if (sharedAttachments === null) {
            sharedAttachments = await consumeAttachments(client, attachmentIds, actor, inserted.id)
          } else if (attachmentIds.length) {
            // Child cases share the same files; clone upload metadata with a unique storage_key
            // so ownership is not stuck on the primary case_id only.
            await client.query(
              `INSERT INTO support_attachment_uploads
                (owner_role, owner_id, storage_key, public_url, mime_type, byte_size, original_name, sha256, consumed_at, case_id, expires_at)
               SELECT owner_role, owner_id, storage_key || '#case:' || $2::text, public_url, mime_type, byte_size, original_name, sha256, now(), $2::uuid, expires_at
                 FROM support_attachment_uploads
                WHERE id = ANY($1::uuid[])`,
              [attachmentIds, inserted.id],
            )
          }
          const messageAttachments = sharedAttachments.map((entry) => ({ ...entry, case_id: inserted.id }))
          const message = (await client.query(
            `INSERT INTO support_case_messages
              (case_id, sender_role, sender_id, body, attachments, read_by_customer_at)
             VALUES ($1::uuid, 'customer', $2, $3, $4::jsonb, now()) RETURNING *`,
            [inserted.id, actor.id, description, JSON.stringify(messageAttachments)],
          )).rows[0]
          await insertEvent(client, inserted.id, 'case_created', actor, { status: initialStatus, parent_case_id: inserted.parent_case_id }, `created:${idempotencyKey}:${index}`)
          pendingEmails.push(...(await notifyCase(client, inserted, 'created', actor, message.id)))
          created.push(publicCase(inserted))
        }
        const payload = { cases: created, primary_case_id: primaryId }
        await client.query(
          `UPDATE support_case_idempotency SET response_json = $3::jsonb
            WHERE customer_key = $1 AND idempotency_key = $2`,
          [customerKey, idempotencyKey, JSON.stringify(payload)],
        )
        await client.query('COMMIT')
        dispatchPendingEmails(pendingEmails)
        return payload
      } catch (error) {
        await client.query('ROLLBACK')
        throw error
      }
    })
    res.status(201).json(response)
  }))

  async function addMessage(req, res) {
    const actor = req.supportActor
    const id = String(req.params.id || '')
    const body = normalizePlainText(req.body?.body || req.body?.message, 10000)
    const attachmentIds = parseAttachmentIds(req.body?.attachments || [])
    if (!UUID_RE.test(id)) return res.status(404).json({ message: 'Case not found' })
    if (!body) return res.status(400).json({ message: 'body required' })
    let pendingEmails = []
    const message = await withClient(async (client) => {
      await client.query('BEGIN')
      try {
        const row = (await client.query('SELECT * FROM support_cases WHERE id = $1::uuid FOR UPDATE', [id])).rows[0]
        if (!canAccessCase(actor, row)) throw Object.assign(new Error('Case not found'), { status: 404 })
        if (TERMINAL_STATUSES.has(row.status)) throw Object.assign(new Error('Closed cases cannot receive messages'), { status: 409, code: 'CASE_CLOSED' })
        const attachments = await consumeAttachments(client, attachmentIds, actor, id)
        const inserted = (await client.query(
          `INSERT INTO support_case_messages
            (case_id, sender_role, sender_id, body, attachments, read_by_customer_at, read_by_seller_at, read_by_support_at)
           VALUES ($1::uuid,$2,$3,$4,$5::jsonb,
             CASE WHEN $2='customer' THEN now() END,
             CASE WHEN $2='seller' THEN now() END,
             CASE WHEN $2='support' THEN now() END) RETURNING *`,
          [id, actor.role, actor.id, body, JSON.stringify(attachments)],
        )).rows[0]
        const status = nextStatusAfterMessage(actor.role, !!row.seller_id)
        await client.query('UPDATE support_cases SET status=$2, updated_at=now(), last_message_at=now() WHERE id=$1::uuid', [id, status])
        await insertEvent(client, id, 'message_added', actor, { message_id: inserted.id, status }, `message:${inserted.id}`)
        pendingEmails = await notifyCase(client, { ...row, status }, 'message', actor, inserted.id)
        await client.query('COMMIT')
        return inserted
      } catch (error) {
        await client.query('ROLLBACK')
        throw error
      }
    })
    dispatchPendingEmails(pendingEmails)
    res.status(201).json({ message })
  }

  async function transition(req, res, action) {
    const actor = req.supportActor
    const id = String(req.params.id || '')
    if (!UUID_RE.test(id)) return res.status(404).json({ message: 'Case not found' })
    let pendingEmails = []
    const result = await withClient(async (client) => {
      await client.query('BEGIN')
      try {
        const row = (await client.query('SELECT * FROM support_cases WHERE id=$1::uuid FOR UPDATE', [id])).rows[0]
        if (!canAccessCase(actor, row)) throw Object.assign(new Error('Case not found'), { status: 404 })
        const next = transitionFor(actor.role, action, row.status)
        if (!next) throw Object.assign(new Error('Invalid state transition'), { status: 409, code: 'INVALID_TRANSITION' })
        if (action === 'reopen' && row.auto_archive_at && new Date(row.auto_archive_at) <= new Date()) throw Object.assign(new Error('Reopen window expired'), { status: 409, code: 'REOPEN_WINDOW_EXPIRED' })
        const resolution = actor.role === 'customer' ? null : normalizePlainText(req.body?.resolution_note, 2000) || null
        const updated = (await client.query(
          `UPDATE support_cases SET status=$2, updated_at=now(),
             closed_at=CASE WHEN $3='close' THEN now() ELSE NULL END,
             reopened_at=CASE WHEN $3='reopen' THEN now() ELSE reopened_at END,
             customer_hidden_at=CASE WHEN $3='reopen' THEN NULL ELSE customer_hidden_at END,
             auto_archive_at=CASE WHEN $3='close' THEN now()+($4::int*interval '1 day') ELSE NULL END,
             resolution_note=CASE WHEN $3='close' THEN $5 ELSE resolution_note END
           WHERE id=$1::uuid RETURNING *`,
          [id, next, action, ARCHIVE_DAYS, resolution],
        )).rows[0]
        await insertEvent(client, id, action === 'close' ? 'case_closed' : 'case_reopened', actor, { from: row.status, to: next })
        pendingEmails = await notifyCase(client, updated, action, actor)
        await client.query('COMMIT')
        return updated
      } catch (error) {
        await client.query('ROLLBACK')
        throw error
      }
    })
    dispatchPendingEmails(pendingEmails)
    res.json({ case: publicCase(result) })
  }

  router.post('/store/support/cases/:id/messages', requireCustomer, writeLimit, asyncRoute(addMessage))
  router.post('/store/support/cases/:id/close', requireCustomer, writeLimit, asyncRoute((req, res) => transition(req, res, 'close')))
  router.post('/store/support/cases/:id/reopen', requireCustomer, writeLimit, asyncRoute((req, res) => transition(req, res, 'reopen')))
  router.post('/store/support/cases/:id/hide', requireCustomer, writeLimit, asyncRoute(async (req, res) => {
    const actor = req.supportActor
    const id = String(req.params.id || '')
    if (!UUID_RE.test(id)) return res.status(404).json({ message: 'Case not found' })
    const hidden = await withClient(async (client) => {
      const result = await client.query(
        `UPDATE support_cases SET customer_hidden_at=now(), updated_at=now()
          WHERE id=$1::uuid AND status IN ('closed','resolved')
            AND (($2::uuid IS NOT NULL AND customer_id=$2::uuid) OR lower(customer_email)=lower($3))
          RETURNING id`,
        [id, actor.customerId, actor.email],
      )
      if (result.rows[0]) await insertEvent(client, id, 'case_hidden', actor)
      return result.rows[0]
    })
    if (!hidden) return res.status(404).json({ message: 'Case not found or not closed' })
    res.json({ ok: true })
  }))
  router.post('/store/support/cases/:id/read', requireCustomer, asyncRoute(async (req, res) => {
    const actor = req.supportActor
    const id = String(req.params.id || '')
    if (!UUID_RE.test(id)) return res.status(404).json({ message: 'Case not found' })
    const count = await withClient(async (client) => {
      const result = await client.query(
        `UPDATE support_case_messages m SET read_by_customer_at=COALESCE(read_by_customer_at,now())
          FROM support_cases c WHERE c.id=m.case_id AND c.id=$1::uuid
            AND (($2::uuid IS NOT NULL AND c.customer_id=$2::uuid) OR lower(c.customer_email)=lower($3))
          RETURNING m.id`,
        [id, actor.customerId, actor.email],
      )
      return result.rowCount
    })
    if (!count) return res.status(404).json({ message: 'Case not found' })
    res.json({ ok: true })
  }))

  router.get('/admin-hub/v1/support-cases', requireSeller, asyncRoute(async (req, res) => {
    const actor = req.supportActor
    const page = clampInt(req.query.page, 1, 1, 100000)
    const limit = clampInt(req.query.limit, 20, 1, 100)
    const status = String(req.query.status || '').trim()
    const filter = normalizePlainText(req.query.filter || req.query.q, 100)
    const view = normalizeCaseView(req.query.view)
    if (status && !STATUSES.has(status)) return res.status(400).json({ message: 'Invalid status' })
    if (view == null) return res.status(400).json({ message: 'Invalid view' })
    const rows = await withClient(async (client) => {
      const params = []
      const where = []
      if (!actor.isSuperuser) { params.push(actor.sellerId); where.push(`c.seller_id=$${params.length}`) }
      if (status) { params.push(status); where.push(`c.status=$${params.length}`) }
      if (view === 'open') where.push(`c.status IN ('open','reopened','awaiting_seller','awaiting_customer','awaiting_support')`)
      if (view === 'unread') where.push('unread.unread_count > 0')
      if (filter) {
        params.push(`%${filter.replace(/[%_\\]/g, '\\$&')}%`)
        where.push(`(c.case_number ILIKE $${params.length} ESCAPE '\\' OR c.title ILIKE $${params.length} ESCAPE '\\'
          OR c.category ILIKE $${params.length} ESCAPE '\\' OR CAST(o.order_number AS text) ILIKE $${params.length} ESCAPE '\\'
          OR COALESCE(settings.store_name, 'Andertal Support') ILIKE $${params.length} ESCAPE '\\')`)
      }
      params.push(limit, (page - 1) * limit)
      const unreadCondition = actor.isSuperuser
        ? `m.sender_role <> 'support' AND m.read_by_support_at IS NULL`
        : `m.sender_role <> 'seller' AND m.read_by_seller_at IS NULL`
      return (await client.query(
        `SELECT c.*, o.order_number, COALESCE(settings.store_name, 'Andertal Support') AS seller_display_name,
                item_data.items, item_data.item_thumbnails,
                last_msg.id AS last_message_id, last_msg.body AS last_message_body,
                last_msg.sender_role AS last_message_sender_role, last_msg.created_at AS last_message_created_at,
                unread.unread_count, count(*) OVER()::int AS total
           FROM support_cases c
           LEFT JOIN store_orders o ON o.id=c.order_id
           LEFT JOIN admin_hub_seller_settings settings ON settings.seller_id=c.seller_id
           LEFT JOIN LATERAL (
             SELECT COALESCE(jsonb_agg(jsonb_build_object(
                      'id', i.id, 'order_item_id', i.order_item_id, 'title', i.title_snapshot,
                      'thumbnail', i.image_snapshot, 'quantity', i.quantity_snapshot
                    ) ORDER BY i.created_at), '[]'::jsonb) AS items,
                    COALESCE(jsonb_agg(i.image_snapshot) FILTER (WHERE i.image_snapshot IS NOT NULL), '[]'::jsonb) AS item_thumbnails
               FROM support_case_items i WHERE i.case_id=c.id
           ) item_data ON true
           LEFT JOIN LATERAL (
             SELECT m.id, m.body, m.sender_role, m.created_at
               FROM support_case_messages m WHERE m.case_id=c.id ORDER BY m.created_at DESC LIMIT 1
           ) last_msg ON true
           LEFT JOIN LATERAL (
             SELECT count(*)::int AS unread_count FROM support_case_messages m
              WHERE m.case_id=c.id AND ${unreadCondition}
           ) unread ON true
         ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
         ORDER BY c.updated_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params,
      )).rows
    })
    res.json({ cases: rows.map(inboxCase), page, limit, total: rows[0]?.total || 0 })
  }))

  router.post('/admin-hub/v1/support-cases/attachments/upload', requireSeller, uploadLimit, upload.array('files', MAX_ATTACHMENTS), asyncRoute(async (req, res) => {
    const files = req.files || []
    if (!files.length) return res.status(400).json({ message: 'files required' })
    const stored = []
    for (const file of files) stored.push({ file, saved: await saveAttachment(file) })
    const uploads = await withClient(async (client) => {
      const rows = []
      for (const { file, saved } of stored) {
        const result = await client.query(
          `INSERT INTO support_attachment_uploads
            (owner_role, owner_id, storage_key, public_url, mime_type, byte_size, original_name, sha256)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           RETURNING id, public_url, mime_type, byte_size, expires_at`,
          [req.supportActor.role, req.supportActor.id, saved.key, saved.url, saved.mime, file.size, normalizePlainText(path.basename(file.originalname), 255), crypto.createHash('sha256').update(file.buffer).digest('hex')],
        )
        rows.push(result.rows[0])
      }
      return rows
    })
    res.status(201).json({ attachments: uploads })
  }))

  router.get('/admin-hub/v1/support-cases/:id', requireSeller, asyncRoute(async (req, res) => {
    const actor = req.supportActor
    const id = String(req.params.id || '')
    if (!UUID_RE.test(id)) return res.status(404).json({ message: 'Case not found' })
    const detail = await withClient(async (client) => {
      const loaded = await loadCaseDetail(client, id, { includeEvents: actor.isSuperuser })
      if (!loaded || !canAccessCase(actor, loaded.case)) return null
      return loaded
    })
    if (!detail) return res.status(404).json({ message: 'Case not found' })
    res.json(detail)
  }))

  router.post('/admin-hub/v1/support-cases/:id/messages', requireSeller, writeLimit, asyncRoute(addMessage))
  router.post('/admin-hub/v1/support-cases/:id/close', requireSeller, writeLimit, asyncRoute((req, res) => transition(req, res, 'close')))
  router.post('/admin-hub/v1/support-cases/:id/reopen', requireSeller, writeLimit, asyncRoute((req, res) => transition(req, res, 'reopen')))
  router.post('/admin-hub/v1/support-cases/:id/read', requireSeller, asyncRoute(async (req, res) => {
    const actor = req.supportActor
    const id = String(req.params.id || '')
    if (!UUID_RE.test(id)) return res.status(404).json({ message: 'Case not found' })
    const column = actor.isSuperuser ? 'read_by_support_at' : 'read_by_seller_at'
    const count = await withClient(async (client) => {
      const row = (await client.query('SELECT * FROM support_cases WHERE id=$1::uuid', [id])).rows[0]
      if (!canAccessCase(actor, row)) return 0
      return (await client.query(`UPDATE support_case_messages SET ${column}=COALESCE(${column},now()) WHERE case_id=$1::uuid RETURNING id`, [id])).rowCount
    })
    if (!count) return res.status(404).json({ message: 'Case not found' })
    res.json({ ok: true })
  }))
  router.patch('/admin-hub/v1/support-cases/:id/reassign', requireSeller, writeLimit, asyncRoute(async (req, res) => {
    const actor = req.supportActor
    if (!actor.isSuperuser) return res.status(404).json({ message: 'Case not found' })
    const id = String(req.params.id || '')
    const sellerId = normalizePlainText(req.body?.seller_id, 255) || null
    if (!UUID_RE.test(id)) return res.status(404).json({ message: 'Case not found' })
    const updated = await withClient(async (client) => {
      await client.query('BEGIN')
      try {
        const previous = (await client.query('SELECT * FROM support_cases WHERE id=$1::uuid FOR UPDATE', [id])).rows[0]
        if (!previous) throw Object.assign(new Error('Case not found'), { status: 404 })
        if (sellerId) {
          const sellerExists = (await client.query(
            `SELECT 1 FROM seller_users WHERE seller_id=$1
             UNION ALL SELECT 1 FROM admin_hub_seller_settings WHERE seller_id=$1 LIMIT 1`,
            [sellerId],
          )).rows[0]
          if (!sellerExists) throw Object.assign(new Error('Seller not found'), { status: 400 })
        }
        const row = (await client.query('UPDATE support_cases SET seller_id=$2, updated_at=now() WHERE id=$1::uuid RETURNING *', [id, sellerId])).rows[0]
        await insertEvent(client, id, 'case_reassigned', actor, { from: previous.seller_id, to: sellerId })
        const emails = await notifyCase(client, row, 'reassigned', actor, `${previous.seller_id || 'support'}:${sellerId || 'support'}`)
        await client.query('COMMIT')
        return { row, emails }
      } catch (error) {
        await client.query('ROLLBACK')
        throw error
      }
    })
    dispatchPendingEmails(updated.emails)
    res.json({ case: publicCase(updated.row) })
  }))

  router.use((error, req, res, next) => {
    if (res.headersSent) return next(error)
    if (error instanceof multer.MulterError) return res.status(400).json({ code: 'UPLOAD_REJECTED', message: error.message })
    const status = Number(error.status) || 500
    if (status >= 500) console.error('[support-cases]', error)
    res.status(status).json({ ...(error.code ? { code: error.code } : {}), message: status >= 500 ? 'Support service error' : error.message })
  })

  return router
}

module.exports.customerActor = customerActor
module.exports.sellerActor = sellerActor
module.exports.parseAttachmentIds = parseAttachmentIds
