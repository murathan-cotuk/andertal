/**
 * Risk Scorer — aggregates step results into a final score and decision.
 *
 * Score thresholds and penalties are configurable via environment variables
 * or the SCORING_CONFIG export below.
 *
 * Decision logic:
 *   0 – 20  → approved          (auto-approve)
 *   21 – 49 → pending_review    (manual review by superuser)
 *   50+     → rejected          (auto-reject)
 */

// ── Configurable penalties ────────────────────────────────────────────────────
const SCORING_CONFIG = {
  // Profile completeness
  missing_company_name:      parseInt(process.env.RISK_MISSING_COMPANY_NAME || '10'),
  missing_tax_id:            parseInt(process.env.RISK_MISSING_TAX_ID       || '10'),
  missing_vat_id:            parseInt(process.env.RISK_MISSING_VAT_ID       || '5'),
  missing_phone:             parseInt(process.env.RISK_MISSING_PHONE        || '5'),
  missing_address:           parseInt(process.env.RISK_MISSING_ADDRESS      || '5'),
  missing_authorized_person: parseInt(process.env.RISK_MISSING_AUTH_PERSON  || '5'),

  // Agreement
  no_agreement:              parseInt(process.env.RISK_NO_AGREEMENT         || '15'),

  // Thresholds
  threshold_approve:         parseInt(process.env.RISK_THRESHOLD_APPROVE    || '20'),
  threshold_reject:          parseInt(process.env.RISK_THRESHOLD_REJECT     || '50'),
}

/**
 * score(stepResults) → { score, decision, breakdown }
 *
 * stepResults: array of { step, passed, score_penalty, reason }
 */
function score(stepResults) {
  let total = 0
  const breakdown = []

  for (const result of stepResults) {
    const penalty = Number(result.score_penalty) || 0
    total += penalty
    breakdown.push({
      step: result.step,
      passed: result.passed,
      penalty,
      reason: result.reason || null,
    })
  }

  let decision
  if (total <= SCORING_CONFIG.threshold_approve) {
    decision = 'approved'
  } else if (total < SCORING_CONFIG.threshold_reject) {
    decision = 'pending_review'
  } else {
    decision = 'rejected'
  }

  return { score: total, decision, breakdown }
}

/**
 * scoreProfile(seller) → { step: 'profile', passed, score_penalty, reason }
 *
 * Checks basic profile completeness using existing seller_users fields.
 * Reuses existing data — no new fields needed.
 */
function scoreProfile(seller) {
  let penalty = 0
  const missing = []
  const cfg = SCORING_CONFIG

  if (!seller.company_name)         { penalty += cfg.missing_company_name;      missing.push('company_name') }
  if (!seller.tax_id)               { penalty += cfg.missing_tax_id;            missing.push('tax_id') }
  if (!seller.vat_id)               { penalty += cfg.missing_vat_id;            missing.push('vat_id') }
  if (!seller.phone)                { penalty += cfg.missing_phone;             missing.push('phone') }
  if (!seller.authorized_person_name) { penalty += cfg.missing_authorized_person; missing.push('authorized_person_name') }

  const addr = seller.business_address || {}
  if (!addr.street && !addr.city)   { penalty += cfg.missing_address;           missing.push('business_address') }

  if (!seller.agreement_accepted)   { penalty += cfg.no_agreement;              missing.push('agreement_accepted') }

  return {
    step: 'profile',
    passed: missing.length === 0,
    score_penalty: penalty,
    reason: missing.length ? `Incomplete profile: ${missing.join(', ')}` : null,
  }
}

module.exports = { score, scoreProfile, SCORING_CONFIG }
