'use strict'
const { Router } = require('express')
const path = require('path')
const fs = require('fs')

// Same storage convention as media.js: UPLOAD_DIR for a persistent volume, or S3 when
// S3_UPLOAD_* env vars are set, otherwise <medusa-backend>/uploads (ephemeral on many hosts).
const uploadDir = process.env.UPLOAD_DIR
  ? path.resolve(process.env.UPLOAD_DIR)
  : path.join(__dirname, '..', '..', 'uploads')
const useS3 = !!(process.env.S3_UPLOAD_BUCKET && process.env.S3_UPLOAD_REGION)

const ALLOWED_DOCUMENT_TYPES = ['invoice', 'lieferschein', 'retourelabel']

const getDbClient = () => {
  const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
  if (!dbUrl || !dbUrl.startsWith('postgres')) return null
  const { Client } = require('pg')
  return new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
}

const sanitizeSellerFolder = (sellerId) =>
  String(sellerId || 'seller').replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 120) || 'seller'

async function saveDocumentBuffer(buffer, sellerId, orderId, documentType) {
  const seg = sanitizeSellerFolder(sellerId)
  const filename = `${orderId}-${documentType}-${Date.now()}.pdf`
  if (useS3 && process.env.S3_UPLOAD_BUCKET) {
    const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3')
    const bucket = process.env.S3_UPLOAD_BUCKET
    const region = process.env.S3_UPLOAD_REGION || 'eu-central-1'
    const key = `order-documents/${seg}/${filename}`
    const s3 = new S3Client({
      region,
      ...(process.env.S3_UPLOAD_ENDPOINT && { endpoint: process.env.S3_UPLOAD_ENDPOINT }),
      ...(process.env.S3_UPLOAD_ACCESS_KEY_ID && process.env.S3_UPLOAD_SECRET_ACCESS_KEY
        ? { credentials: { accessKeyId: process.env.S3_UPLOAD_ACCESS_KEY_ID, secretAccessKey: process.env.S3_UPLOAD_SECRET_ACCESS_KEY } }
        : {}),
    })
    await s3.send(new PutObjectCommand({
      Bucket: bucket, Key: key, Body: buffer, ContentType: 'application/pdf',
      ...(process.env.S3_UPLOAD_ACL && { ACL: process.env.S3_UPLOAD_ACL }),
    }))
    const baseUrl = process.env.S3_UPLOAD_PUBLIC_BASE_URL || `https://${bucket}.s3.${region}.amazonaws.com`
    return `${baseUrl.replace(/\/$/, '')}/${key}`
  }
  const destDir = path.join(uploadDir, 'order-documents', seg)
  fs.mkdirSync(destDir, { recursive: true })
  fs.writeFileSync(path.join(destDir, filename), buffer)
  return `/uploads/order-documents/${seg}/${filename}`
}

/**
 * If the seller has opted this document type into "customer_api" sourcing and the
 * customer's system has actually pushed a document for this order, return its file_url.
 * Invoices are never substituted: bonus points / payment split only exist on the
 * platform-generated Rechnung, which is always sent to customer and seller.
 */
async function resolveCustomerSuppliedDocumentUrl(client, orderId, sellerId, documentType) {
  if (String(documentType || '').trim() === 'invoice') return null
  if (!sellerId || !orderId) return null
  const prefR = await client.query(
    `SELECT document_sources FROM admin_hub_seller_settings WHERE seller_id = $1`,
    [sellerId],
  )
  const prefs = prefR.rows[0]?.document_sources || {}
  if (prefs[documentType] !== 'customer_api') return null
  const docR = await client.query(
    `SELECT file_url FROM admin_hub_order_documents WHERE order_id = $1::uuid AND document_type = $2`,
    [orderId, documentType],
  )
  return docR.rows[0]?.file_url || null
}

// POST /api/v1/orders/:order_id/documents
// Auth: HTTP Basic <api_key>:<api_secret> — created by the seller from Sellercentral →
// Einstellungen → Integrationen (generic "custom" integration, store_integrations table).
// Body: { document_type: 'invoice'|'lieferschein'|'retourelabel', file_base64, filename? }
const apiOrderDocumentsPOST = async (req, res) => {
  const orderId = (req.params.order_id || '').trim()
  if (!orderId) return res.status(400).json({ message: 'order_id required' })
  const authHeader = req.headers.authorization || ''
  if (!authHeader.startsWith('Basic ')) {
    return res.status(401).json({ message: 'Basic auth required: base64(api_key:api_secret)' })
  }
  let apiKey = '', apiSecret = ''
  try {
    const raw = Buffer.from(authHeader.slice('Basic '.length), 'base64').toString('utf8')
    const idx = raw.indexOf(':')
    apiKey = idx >= 0 ? raw.slice(0, idx) : raw
    apiSecret = idx >= 0 ? raw.slice(idx + 1) : ''
  } catch (_) {
    return res.status(401).json({ message: 'Invalid Authorization header' })
  }
  if (!apiKey || !apiSecret) return res.status(401).json({ message: 'Invalid API credentials' })

  const body = req.body || {}
  const documentType = String(body.document_type || '').trim().toLowerCase()
  if (!ALLOWED_DOCUMENT_TYPES.includes(documentType)) {
    return res.status(400).json({ message: `document_type must be one of: ${ALLOWED_DOCUMENT_TYPES.join(', ')}` })
  }
  const fileBase64 = String(body.file_base64 || '').trim()
  if (!fileBase64) return res.status(400).json({ message: 'file_base64 required' })
  let buffer
  try {
    buffer = Buffer.from(fileBase64, 'base64')
  } catch (_) {
    return res.status(400).json({ message: 'file_base64 is not valid base64' })
  }
  if (buffer.length === 0 || buffer.length > 15 * 1024 * 1024) {
    return res.status(400).json({ message: 'File must be non-empty and under 15MB' })
  }
  if (buffer.slice(0, 4).toString('latin1') !== '%PDF') {
    return res.status(400).json({ message: 'Only PDF files are accepted' })
  }

  const client = getDbClient()
  if (!client) return res.status(503).json({ message: 'Database not configured' })
  try {
    await client.connect()
    const intR = await client.query(
      `SELECT id, seller_scope_key FROM store_integrations WHERE api_key = $1 AND api_secret = $2 AND is_active = true LIMIT 1`,
      [apiKey, apiSecret],
    )
    const integ = intR.rows[0]
    if (!integ || !integ.seller_scope_key || integ.seller_scope_key === 'default') {
      await client.end()
      return res.status(401).json({ message: 'Invalid API credentials' })
    }
    const sellerId = integ.seller_scope_key
    const orderR = await client.query(
      `SELECT id FROM store_orders WHERE id = $1::uuid AND seller_id = $2`,
      [orderId, sellerId],
    )
    if (!orderR.rows[0]) {
      await client.end()
      return res.status(404).json({ message: 'Order not found for this seller' })
    }
    const fileUrl = await saveDocumentBuffer(buffer, sellerId, orderId, documentType)
    const filename = String(body.filename || '').trim().slice(0, 200) || null
    await client.query(
      `INSERT INTO admin_hub_order_documents (order_id, seller_id, document_type, file_url, filename, uploaded_via, integration_id)
       VALUES ($1::uuid, $2, $3, $4, $5, 'customer_api', $6::uuid)
       ON CONFLICT (order_id, document_type) DO UPDATE SET
         file_url = EXCLUDED.file_url, filename = EXCLUDED.filename,
         integration_id = EXCLUDED.integration_id, updated_at = now()`,
      [orderId, sellerId, documentType, fileUrl, filename, integ.id],
    )
    await client.end()
    res.status(201).json({ ok: true, order_id: orderId, document_type: documentType, file_url: fileUrl })
  } catch (e) {
    if (client) try { await client.end() } catch (_) {}
    res.status(500).json({ message: e?.message || 'Error' })
  }
}

// GET /admin-hub/v1/document-sources — per-document-type preference for the logged-in seller
const adminHubDocumentSourcesGET = async (req, res) => {
  const sellerId = req.sellerUser?.seller_id
  if (!sellerId) return res.status(401).json({ message: 'Unauthorized' })
  const client = getDbClient()
  if (!client) return res.json({ document_sources: {} })
  try {
    await client.connect()
    const r = await client.query(`SELECT document_sources FROM admin_hub_seller_settings WHERE seller_id = $1`, [sellerId])
    await client.end()
    res.json({ document_sources: r.rows[0]?.document_sources || {} })
  } catch (e) {
    if (client) try { await client.end() } catch (_) {}
    res.json({ document_sources: {} })
  }
}

// PATCH /admin-hub/v1/document-sources — body: { invoice?, lieferschein?, retourelabel? } each 'platform'|'customer_api'
const adminHubDocumentSourcesPATCH = async (req, res) => {
  const sellerId = req.sellerUser?.seller_id
  if (!sellerId) return res.status(401).json({ message: 'Unauthorized' })
  const body = req.body || {}
  const next = {}
  for (const type of ALLOWED_DOCUMENT_TYPES) {
    const v = body[type]
    if (v === 'customer_api' || v === 'platform') next[type] = v
  }
  if (Object.keys(next).length === 0) return res.status(400).json({ message: 'No valid document_sources fields provided' })
  const client = getDbClient()
  if (!client) return res.status(503).json({ message: 'Database not configured' })
  try {
    await client.connect()
    const r = await client.query(
      `INSERT INTO admin_hub_seller_settings (seller_id, document_sources, updated_at)
       VALUES ($1, $2::jsonb, now())
       ON CONFLICT (seller_id) DO UPDATE SET
         document_sources = COALESCE(admin_hub_seller_settings.document_sources, '{}'::jsonb) || $2::jsonb,
         updated_at = now()
       RETURNING document_sources`,
      [sellerId, JSON.stringify(next)],
    )
    await client.end()
    res.json({ document_sources: r.rows[0]?.document_sources || {} })
  } catch (e) {
    if (client) try { await client.end() } catch (_) {}
    res.status(500).json({ message: e?.message || 'Error' })
  }
}

module.exports = function createOrderDocumentsRouter() {
  const router = Router()
  router.post('/api/v1/orders/:order_id/documents', apiOrderDocumentsPOST)
  router.get('/admin-hub/v1/document-sources', adminHubDocumentSourcesGET)
  router.patch('/admin-hub/v1/document-sources', adminHubDocumentSourcesPATCH)
  return router
}

module.exports.resolveCustomerSuppliedDocumentUrl = resolveCustomerSuppliedDocumentUrl
module.exports.ALLOWED_DOCUMENT_TYPES = ALLOWED_DOCUMENT_TYPES
