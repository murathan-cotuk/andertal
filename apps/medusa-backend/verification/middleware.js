/**
 * Seller Verification Middleware
 *
 * Reusable Express middleware that guards sensitive endpoints.
 * Place AFTER requireSellerAuth so req.sellerUser is already populated.
 *
 * Checks:
 *   - seller's approval_status is 'approved' or 'active'
 *   - (optional) risk_score is below a configurable threshold
 *
 * Usage in server.js:
 *   const { requireVerified, requireVerifiedOrPending } = require('./verification/middleware')
 *
 *   // Block unverified sellers from creating listings:
 *   httpApp.post('/admin-hub/v1/products', requireSellerAuth, requireVerified, ...)
 *
 *   // Allow pending sellers to read but not write:
 *   httpApp.get('/admin-hub/v1/products', requireSellerAuth, requireVerifiedOrPending, ...)
 */

'use strict'

const APPROVED_STATUSES = new Set(['approved', 'active'])
const PENDING_STATUSES  = new Set(['approved', 'active', 'documents_submitted', 'pending_approval', 'pending'])

// Max allowed risk score for verified endpoints (override via env)
const MAX_RISK_SCORE = parseInt(process.env.VERIFICATION_MAX_RISK_SCORE || '49')

/**
 * requireVerified — blocks requests from sellers who are not fully approved.
 * Superusers always pass.
 */
function requireVerified(req, res, next) {
  const user = req.sellerUser
  if (!user) return res.status(401).json({ message: 'Unauthorized' })

  // Superusers bypass verification gates
  if (user.is_superuser) return next()

  const status = String(user.approval_status || 'registered').toLowerCase()
  if (!APPROVED_STATUSES.has(status)) {
    return res.status(403).json({
      message: 'Your account must be verified before performing this action.',
      verification_status: status,
      code: 'VERIFICATION_REQUIRED',
    })
  }

  // Optional: block high-risk sellers even if approved
  if (user.risk_score != null && Number(user.risk_score) > MAX_RISK_SCORE) {
    return res.status(403).json({
      message: 'Account flagged for elevated risk. Please contact support.',
      code: 'HIGH_RISK_BLOCKED',
    })
  }

  next()
}

/**
 * requireVerifiedOrPending — allows approved AND pending-review sellers (read-like ops).
 * Blocks only 'registered' sellers who haven't submitted anything yet.
 * Superusers always pass.
 */
function requireVerifiedOrPending(req, res, next) {
  const user = req.sellerUser
  if (!user) return res.status(401).json({ message: 'Unauthorized' })

  if (user.is_superuser) return next()

  const status = String(user.approval_status || 'registered').toLowerCase()
  if (!PENDING_STATUSES.has(status)) {
    return res.status(403).json({
      message: 'Please complete verification before accessing this area.',
      verification_status: status,
      code: 'VERIFICATION_REQUIRED',
    })
  }

  next()
}

/**
 * requireNotSuspended — only blocks suspended/rejected sellers.
 * Everything else passes (including unverified).
 */
function requireNotSuspended(req, res, next) {
  const user = req.sellerUser
  if (!user) return res.status(401).json({ message: 'Unauthorized' })
  if (user.is_superuser) return next()

  const status = String(user.approval_status || 'registered').toLowerCase()
  if (status === 'suspended' || status === 'rejected') {
    return res.status(403).json({
      message: 'Your account has been suspended. Please contact support.',
      verification_status: status,
      code: 'ACCOUNT_SUSPENDED',
    })
  }

  next()
}

module.exports = { requireVerified, requireVerifiedOrPending, requireNotSuspended }
