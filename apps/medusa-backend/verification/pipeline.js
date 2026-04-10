/**
 * Seller Verification Pipeline
 *
 * Orchestrates verification steps in order. Each step can be enabled/disabled
 * via environment variables. Steps that fail do NOT crash the pipeline — they
 * accumulate a score penalty and continue.
 *
 * Steps (in order):
 *   1. profile      — completeness check (reuses existing seller_users fields)
 *   2. kyc          — document/identity check (via kycAdapter)
 *   3. vat          — VAT format/validity (via vatAdapter)
 *   4. ip_risk      — IP / VPN / proxy detection (via ipRiskAdapter)
 *
 * Usage:
 *   const { runPipeline } = require('./pipeline')
 *   const result = await runPipeline({ seller, ip })
 */

'use strict'

const { checkKyc }     = require('./adapters/kyc')
const { checkVat }     = require('./adapters/vat')
const { checkIpRisk }  = require('./adapters/ipRisk')
const { score, scoreProfile } = require('./riskScorer')

// Step enable flags — set VERIFICATION_SKIP_<STEP>=true to disable
const STEPS_ENABLED = {
  profile:  process.env.VERIFICATION_SKIP_PROFILE  !== 'true',
  kyc:      process.env.VERIFICATION_SKIP_KYC      !== 'true',
  vat:      process.env.VERIFICATION_SKIP_VAT      !== 'true',
  ip_risk:  process.env.VERIFICATION_SKIP_IP_RISK  !== 'true',
}

/**
 * runPipeline({ seller, ip })
 *
 * @param {object} seller  — full seller_users row (all KYB fields)
 * @param {string} ip      — client IP address (from request headers)
 *
 * @returns {object} {
 *   score: number,
 *   decision: 'approved' | 'pending_review' | 'rejected',
 *   steps: Array<{ step, passed, penalty, reason }>,
 *   ran_at: ISO string
 * }
 */
async function runPipeline({ seller, ip }) {
  const stepResults = []

  // ── Step 1: Profile completeness ──────────────────────────────────────────
  if (STEPS_ENABLED.profile) {
    const result = scoreProfile(seller)
    stepResults.push(result)
  }

  // ── Step 2: KYC — document check ─────────────────────────────────────────
  if (STEPS_ENABLED.kyc) {
    const kycResult = await checkKyc({
      documents: seller.documents,
      email: seller.email,
      name: seller.authorized_person_name || seller.company_name,
    })
    stepResults.push({
      step: 'kyc',
      passed: kycResult.passed,
      score_penalty: kycResult.score_penalty,
      reason: kycResult.reason,
    })
  }

  // ── Step 3: VAT validation ────────────────────────────────────────────────
  if (STEPS_ENABLED.vat) {
    const vatResult = await checkVat({
      vat_id: seller.vat_id,
      company_name: seller.company_name,
      country: seller.business_address?.country,
    })
    stepResults.push({
      step: 'vat',
      passed: vatResult.valid,
      score_penalty: vatResult.score_penalty,
      reason: vatResult.valid ? null : `VAT format check failed: ${seller.vat_id || 'not provided'}`,
    })
  }

  // ── Step 4: IP risk ───────────────────────────────────────────────────────
  if (STEPS_ENABLED.ip_risk && ip) {
    const ipResult = await checkIpRisk({ ip })
    stepResults.push({
      step: 'ip_risk',
      passed: ipResult.risk_level === 'low',
      score_penalty: ipResult.score_penalty,
      reason: ipResult.is_vpn
        ? `VPN / proxy detected (${ip})`
        : ipResult.risk_level !== 'low'
        ? `Elevated IP risk level: ${ipResult.risk_level}`
        : null,
    })
  }

  const { score: totalScore, decision, breakdown } = score(stepResults)

  return {
    score: totalScore,
    decision,
    steps: breakdown,
    ran_at: new Date().toISOString(),
  }
}

module.exports = { runPipeline, STEPS_ENABLED }
