'use strict'
const path = require('path')
const { Router } = require('express')

module.exports = function createVerificationRouter({ getSellerDbClient, getProductsDbClient }) {
    // ── Verification Pipeline Routes ─────────────────────────────────────────
    // Lazy-load so the pipeline module is not required until first use
    const verificationPath = path.join(__dirname, '..', '..', 'verification', 'pipeline.js')
    let _runPipeline = null
    const getRunPipeline = () => {
      if (!_runPipeline) {
        try { _runPipeline = require(verificationPath).runPipeline } catch (e) {
          console.error('[verification] pipeline.js not found:', e.message)
        }
      }
      return _runPipeline
    }

    /**
     * POST /admin-hub/v1/verification/start
     * Seller triggers the verification pipeline against their own profile.
     * Returns the pipeline result and saves risk_score + verification_steps to DB.
     */
  const router = Router()

  router.post('/admin-hub/v1/verification/start', async (req, res) => {
      const userId = req.sellerUser?.id
      const sellerId = req.sellerUser?.seller_id
      if (!userId) return res.status(401).json({ message: 'Unauthorized' })

      const runPipeline = getRunPipeline()
      if (!runPipeline) return res.status(503).json({ message: 'Verification pipeline not available' })

      const client = getSellerDbClient()
      if (!client) return res.status(503).json({ message: 'Database not configured' })
      try {
        await client.connect()
        // Fetch full seller profile to run the pipeline
        const sellerRes = await client.query(
          `SELECT * FROM seller_users WHERE id = $1`, [userId]
        )
        const seller = sellerRes.rows[0]
        if (!seller) { await client.end(); return res.status(404).json({ message: 'Seller not found' }) }

        // Extract client IP (respects proxy headers set by Render/Vercel)
        const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()
          || req.socket?.remoteAddress || null

        const result = await runPipeline({ seller, ip })

        // Map pipeline decision to existing approval_status values
        const statusMap = { approved: 'approved', pending_review: 'pending_approval', rejected: 'rejected' }
        const newStatus = statusMap[result.decision] || 'pending_approval'

        // Only auto-advance status if currently in early stages (don't downgrade approved sellers)
        const currentStatus = String(seller.approval_status || 'registered').toLowerCase()
        const canAutoAdvance = ['registered', 'documents_submitted', 'pending_approval'].includes(currentStatus)

        const updates = [
          `risk_score = $1`,
          `verification_steps = $2`,
          `verification_started_at = COALESCE(verification_started_at, now())`,
          `updated_at = now()`,
        ]
        const params = [result.score, JSON.stringify(result.steps)]

        if (canAutoAdvance) {
          updates.push(`approval_status = $3`)
          params.push(newStatus)
          params.push(userId)
          updates.push(`updated_at = now()`)
        } else {
          params.push(userId)
        }

        await client.query(
          `UPDATE seller_users SET ${updates.join(', ')} WHERE id = $${params.length}`,
          params
        )
        await client.end()

        if (canAutoAdvance) {
          const flowTriggerByStatus = { approved: 'seller_verification_approved', rejected: 'seller_verification_rejected' }
          const flowTrigger = flowTriggerByStatus[newStatus]
          if (flowTrigger) {
            setImmediate(() => {
              try { require('../flow-automation').runAutomationFlowsForSellerEvent({ triggerKey: flowTrigger, sellerUserId: userId }).catch(() => {}) } catch (_) {}
            })
          }
        }

        // Insert notification for superusers
        try {
          const notifClient = getProductsDbClient()
          if (notifClient) {
            await notifClient.connect()
            const storeName = seller.store_name || seller.email || sellerId || 'Bir satıcı'
            await notifClient.query(
              `INSERT INTO admin_hub_notifications (type, title, body, seller_id, reference_id)
               VALUES ('verification_submitted', $1, $2, $3, $4)`,
              [
                `${storeName} — Evrak Gönderildi`,
                `${storeName} doğrulama evraklarını gönderdi. Lütfen inceleyiniz.`,
                sellerId || null,
                userId,
              ]
            )
            await notifClient.end()
          }
        } catch (e) {
          console.error('[verification/start] admin_hub_notifications insert failed:', e.message)
        }

        res.json({
          score: result.score,
          decision: result.decision,
          approval_status: canAutoAdvance ? newStatus : currentStatus,
          steps: result.steps,
          ran_at: result.ran_at,
        })
      } catch (e) {
        try { await client.end() } catch (_) {}
        console.error('[verification/start]', e.message)
        res.status(500).json({ message: e?.message || 'Verification failed' })
      }
    })

    /**
     * GET /admin-hub/v1/verification/status
     * Returns current verification state for the logged-in seller.
     * Accessible by the seller themselves OR superusers (with ?seller_id=).
     */
  router.get('/admin-hub/v1/verification/status', async (req, res) => {
      const isSuperuser = req.sellerUser?.is_superuser
      const targetSellerId = isSuperuser && req.query.seller_id
        ? req.query.seller_id
        : req.sellerUser?.id

      const client = getSellerDbClient()
      if (!client) return res.status(503).json({ message: 'Database not configured' })
      try {
        await client.connect()
        const r = await client.query(
          `SELECT id, email, store_name, seller_id, approval_status,
                  risk_score, verification_steps, verification_started_at,
                  company_name, authorized_person_name, tax_id, vat_id,
                  phone, business_address, documents,
                  lucid_number, epr_document_url,
                  agreement_accepted, agreement_accepted_at, agreement_version
           FROM seller_users WHERE ${isSuperuser && req.query.seller_id ? 'seller_id' : 'id'} = $1`,
          [targetSellerId]
        )
        await client.end()
        const row = r.rows[0]
        if (!row) return res.status(404).json({ message: 'Seller not found' })

        res.json({
          seller_id: row.seller_id,
          approval_status: row.approval_status || 'registered',
          risk_score: row.risk_score,
          verification_steps: row.verification_steps || [],
          verification_started_at: row.verification_started_at,
          profile_completeness: {
            company_name: !!row.company_name,
            authorized_person: !!row.authorized_person_name,
            tax_id: !!row.tax_id,
            vat_id: !!row.vat_id,
            lucid_number: !!row.lucid_number,
            epr_document: !!row.epr_document_url,
            phone: !!row.phone,
            address: !!(row.business_address?.street || row.business_address?.city),
            documents_count: Array.isArray(row.documents) ? row.documents.length : 0,
            agreement_accepted: !!row.agreement_accepted,
          },
        })
      } catch (e) {
        try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    })

    /**
     * POST /admin-hub/v1/verification/review
     * Superuser manually overrides the pipeline decision.
     * Body: { seller_id, action: 'approve'|'reject'|'flag', note? }
     */
  router.post('/admin-hub/v1/verification/review', async (req, res) => {
      if (!req.sellerUser?.is_superuser) return res.status(403).json({ message: 'Superuser access required' })
      const { seller_id, action, note } = req.body || {}
      if (!seller_id || !action) return res.status(400).json({ message: 'seller_id and action are required' })

      const actionStatusMap = { approve: 'approved', reject: 'rejected', flag: 'pending_approval', suspend: 'suspended' }
      const newStatus = actionStatusMap[action]
      if (!newStatus) return res.status(400).json({ message: `action must be one of: ${Object.keys(actionStatusMap).join(', ')}` })

      const client = getSellerDbClient()
      if (!client) return res.status(503).json({ message: 'Database not configured' })
      try {
        await client.connect()
        const r = await client.query(
          `UPDATE seller_users
           SET approval_status = $1,
               rejection_reason = CASE WHEN $1 = 'rejected' THEN $2 ELSE rejection_reason END,
               approved_at = CASE WHEN $1 = 'approved' THEN now() ELSE approved_at END,
               approved_by = CASE WHEN $1 = 'approved' THEN $3 ELSE approved_by END,
               updated_at = now()
           WHERE seller_id = $4
           RETURNING id, seller_id, approval_status, rejection_reason, approved_at`,
          [newStatus, note || null, req.sellerUser?.email || 'superuser', seller_id]
        )
        await client.end()
        if (!r.rows[0]) return res.status(404).json({ message: 'Seller not found' })

        const flowTriggerByStatus = { approved: 'seller_verification_approved', rejected: 'seller_verification_rejected' }
        const flowTrigger = flowTriggerByStatus[newStatus]
        if (flowTrigger) {
          setImmediate(() => {
            try { require('../flow-automation').runAutomationFlowsForSellerEvent({ triggerKey: flowTrigger, sellerUserId: r.rows[0].id }).catch(() => {}) } catch (_) {}
          })
        }

        // Sync product publish status (reuse existing logic pattern)
        if (newStatus === 'approved') {
          const prodClient = getSellerDbClient()
          if (prodClient) {
            prodClient.connect()
              .then(() => prodClient.query(`UPDATE admin_hub_products SET status = 'published' WHERE seller_id = $1 AND status = 'draft'`, [seller_id]))
              .then(() => prodClient.end())
              .catch(() => {})
          }
        } else if (newStatus === 'rejected' || newStatus === 'suspended') {
          const prodClient = getSellerDbClient()
          if (prodClient) {
            prodClient.connect()
              .then(() => prodClient.query(`UPDATE admin_hub_products SET status = 'draft' WHERE seller_id = $1 AND status = 'published'`, [seller_id]))
              .then(() => prodClient.end())
              .catch(() => {})
          }
        }

        res.json({ success: true, seller: r.rows[0] })
      } catch (e) {
        try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    })
    // ── End Verification Pipeline Routes ────────────────────────────────────

  return router
}
