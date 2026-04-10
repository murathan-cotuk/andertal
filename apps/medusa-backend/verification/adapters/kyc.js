/**
 * KYC Adapter — mock-ready, swap provider by setting KYC_PROVIDER env var.
 *
 * Supported providers: "mock" (default), "stripe_identity" (future)
 *
 * Interface contract:
 *   checkKyc({ documents, email, name }) → { passed: bool, reason: string|null, score_penalty: number }
 */

const PROVIDER = (process.env.KYC_PROVIDER || 'mock').toLowerCase()

// ── Mock provider ─────────────────────────────────────────────────────────────
async function mockKyc({ documents, email, name }) {
  const docs = Array.isArray(documents) ? documents : []
  const hasId = docs.some((d) => d?.doc_type === 'id_passport')
  const hasTrade = docs.some((d) => d?.doc_type === 'trade_register')

  if (!hasId && !hasTrade) {
    return { passed: false, reason: 'No identity or trade documents provided', score_penalty: 30 }
  }
  if (!hasId) {
    return { passed: false, reason: 'ID / Passport document missing', score_penalty: 20 }
  }
  if (!hasTrade) {
    return { passed: false, reason: 'Trade register document missing', score_penalty: 20 }
  }
  return { passed: true, reason: null, score_penalty: 0 }
}

// ── Stripe Identity provider (ready to wire, not yet active) ──────────────────
async function stripeIdentityKyc({ documents, email, name }) {
  // TODO: create VerificationSession via Stripe SDK
  // const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY)
  // const session = await stripe.identity.verificationSessions.create({ type: 'document', ... })
  throw new Error('Stripe Identity KYC not yet configured. Set KYC_PROVIDER=mock or wire STRIPE_SECRET_KEY.')
}

// ── Public interface ──────────────────────────────────────────────────────────
async function checkKyc(payload) {
  try {
    if (PROVIDER === 'stripe_identity') return await stripeIdentityKyc(payload)
    return await mockKyc(payload)
  } catch (err) {
    console.error('[kyc-adapter] error:', err.message)
    // Fail open with penalty — do not crash the pipeline
    return { passed: false, reason: err.message, score_penalty: 15 }
  }
}

module.exports = { checkKyc }
