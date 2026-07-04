'use strict'
const { Router } = require('express')

const getDbClient = () => {
  const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
  if (!dbUrl || !dbUrl.startsWith('postgres')) return null
  const { Client } = require('pg')
  const isRender = dbUrl.includes('render.com')
  return new Client({ connectionString: dbUrl, ssl: isRender ? { rejectUnauthorized: false } : false })
}

function createSellerErrorLogsRouter() {
    // ── Seller Error Logs ─────────────────────────────────────────────────────
    /** Call this anywhere in the backend to log a seller error */
    const logSellerError = async (sellerId, { errorCode, errorMessage, terminalOutput, context }) => {
      const client = getDbClient()
      if (!client) return
      try {
        await client.connect()
        await client.query(
          `INSERT INTO seller_error_logs (seller_id, error_code, error_message, terminal_output, context)
           VALUES ($1, $2, $3, $4, $5)`,
          [sellerId || null, errorCode || null, errorMessage || '(Unbekannt)', terminalOutput || null, context || null]
        )
        await client.end()
      } catch (_) {
        try { await client.end() } catch (_2) {}
      }
    }

    const adminHubSellerErrorLogsGET = async (req, res) => {
      if (!req.sellerUser?.is_superuser) return res.status(403).json({ message: 'Superuser required' })
      const client = getDbClient()
      if (!client) return res.status(503).json({ message: 'DB not configured' })
      try {
        await client.connect()
        const { seller_id, status } = req.query
        const params = []; const wheres = []
        if (seller_id) { params.push(seller_id); wheres.push(`e.seller_id = $${params.length}`) }
        if (status && status !== 'all') { params.push(status); wheres.push(`e.status = $${params.length}`) }
        const where = wheres.length ? 'WHERE ' + wheres.join(' AND ') : ''
        const r = await client.query(
          `SELECT e.*, s.store_name, s.email AS seller_email, s.company_name
             FROM seller_error_logs e
             LEFT JOIN seller_users s ON s.seller_id = e.seller_id
             ${where}
             ORDER BY e.created_at DESC LIMIT 500`,
          params
        )
        const unread = await client.query('SELECT COUNT(*) FROM seller_error_logs WHERE is_read = false')
        await client.end()
        res.json({ errors: r.rows, unread_count: parseInt(unread.rows[0]?.count || '0') })
      } catch (e) {
        try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    const adminHubSellerErrorLogsPOST = async (req, res) => {
      if (!req.sellerUser?.is_superuser) return res.status(403).json({ message: 'Superuser required' })
      const client = getDbClient()
      if (!client) return res.status(503).json({ message: 'DB not configured' })
      try {
        await client.connect()
        const { seller_id, error_code, error_message, terminal_output, context } = req.body || {}
        if (!error_message) { await client.end(); return res.status(400).json({ message: 'error_message required' }) }
        const r = await client.query(
          `INSERT INTO seller_error_logs (seller_id, error_code, error_message, terminal_output, context)
           VALUES ($1, $2, $3, $4, $5) RETURNING *`,
          [seller_id || null, error_code || null, error_message, terminal_output || null, context || null]
        )
        await client.end()
        res.json({ error: r.rows[0] })
      } catch (e) {
        try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    /** Sellers report client/API errors — visible in /sellers/errors for superusers */
    const adminHubSellerErrorsReportPOST = async (req, res) => {
      const sellerId = req.sellerUser?.seller_id
      if (!sellerId) return res.status(401).json({ message: 'Unauthorized' })
      if (req.sellerUser?.is_superuser) return res.json({ ok: true, skipped: true })
      const body = req.body || {}
      const error_message = String(body.error_message || '').trim()
      if (!error_message) return res.status(400).json({ message: 'error_message required' })
      const error_code = String(body.error_code || 'CLIENT_ERROR').slice(0, 100)
      const context = String(body.context || body.page_url || '').slice(0, 255) || null
      const terminal_output = body.terminal_output ? String(body.terminal_output).slice(0, 8000) : null
      const client = getDbClient()
      if (!client) return res.status(503).json({ message: 'DB not configured' })
      try {
        await client.connect()
        const dup = await client.query(
          `SELECT id FROM seller_error_logs
           WHERE seller_id = $1 AND error_code = $2 AND COALESCE(context, '') = COALESCE($3::varchar, '')
             AND created_at > now() - interval '15 minutes'
           LIMIT 1`,
          [sellerId, error_code, context],
        )
        if (dup.rows?.length) {
          await client.end()
          return res.json({ ok: true, duplicate: true })
        }
        const storeQ = await client.query(
          `SELECT store_name, email FROM seller_users WHERE seller_id = $1 LIMIT 1`,
          [sellerId],
        ).catch(() => ({ rows: [] }))
        const storeName = storeQ.rows?.[0]?.store_name || storeQ.rows?.[0]?.email || sellerId
        const r = await client.query(
          `INSERT INTO seller_error_logs (seller_id, error_code, error_message, terminal_output, context)
           VALUES ($1, $2, $3, $4, $5) RETURNING id`,
          [sellerId, error_code, error_message, terminal_output, context],
        )
        const logId = r.rows?.[0]?.id
        const notifTitle = `Seller-Fehler: ${storeName}`
        const notifBody = `[${error_code}] ${error_message.slice(0, 400)}${context ? ` · ${context}` : ''}`
        await client.query(
          `INSERT INTO admin_hub_notifications (type, title, body, seller_id, reference_id)
           VALUES ('seller_client_error', $1, $2, $3, $4)`,
          [notifTitle, notifBody, sellerId, logId ? String(logId) : null],
        ).catch(() => {})
        await client.end()
        res.json({ ok: true, id: logId })
      } catch (e) {
        try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    const adminHubSellerErrorLogsPATCH = async (req, res) => {
      if (!req.sellerUser?.is_superuser) return res.status(403).json({ message: 'Superuser required' })
      const { id } = req.params
      const client = getDbClient()
      if (!client) return res.status(503).json({ message: 'DB not configured' })
      try {
        await client.connect()
        const { status, resolution, is_read } = req.body || {}
        const sets = []; const params = []
        if (status !== undefined) { params.push(status); sets.push(`status = $${params.length}`) }
        if (resolution !== undefined) { params.push(resolution); sets.push(`resolution = $${params.length}`) }
        if (is_read !== undefined) { params.push(is_read ? true : false); sets.push(`is_read = $${params.length}`) }
        if (!sets.length) { await client.end(); return res.status(400).json({ message: 'Nothing to update' }) }
        sets.push('updated_at = now()')
        params.push(id)
        const r = await client.query(`UPDATE seller_error_logs SET ${sets.join(', ')} WHERE id = $${params.length}::uuid RETURNING *`, params)
        await client.end()
        res.json({ error: r.rows[0] })
      } catch (e) {
        try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    const adminHubSellerErrorLogsDELETE = async (req, res) => {
      if (!req.sellerUser?.is_superuser) return res.status(403).json({ message: 'Superuser required' })
      const { id } = req.params
      const client = getDbClient()
      if (!client) return res.status(503).json({ message: 'DB not configured' })
      try {
        await client.connect()
        await client.query('DELETE FROM seller_error_logs WHERE id = $1::uuid', [id])
        await client.end()
        res.json({ success: true })
      } catch (e) {
        try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

  const router = Router()
  router.get('/admin-hub/v1/seller-errors', adminHubSellerErrorLogsGET)
  router.post('/admin-hub/v1/seller-errors', adminHubSellerErrorLogsPOST)
  router.post('/admin-hub/v1/seller-errors/report', adminHubSellerErrorsReportPOST)
  router.patch('/admin-hub/v1/seller-errors/:id', adminHubSellerErrorLogsPATCH)
  router.delete('/admin-hub/v1/seller-errors/:id', adminHubSellerErrorLogsDELETE)

  return { router, logSellerError }
}

module.exports = { createSellerErrorLogsRouter }
