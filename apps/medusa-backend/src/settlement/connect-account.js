'use strict'

/**
 * Stripe Connect **Custom** connected accounts for seller payouts (Phase 17/18) — same account
 * model as before, but KYC is no longer fabricated:
 *   - Terms-of-service acceptance is recorded only when the seller actively accepts it, with the
 *     real client IP, user agent and timestamp of that request (never 127.0.0.1 / "now" at payout)
 *   - country, business type and legal data come from the seller's own legal profile; missing data
 *     is reported, never defaulted (no silent 'DE' / 'individual')
 *   - everything else Stripe needs is collected by Stripe-hosted onboarding (Account Links work
 *     for Custom accounts), and the account state is mirrored from account.updated webhooks
 *   - payout readiness = Stripe's own payouts_enabled + transfers capability, never self-asserted
 */

const { auditFinance } = require('./ledger')

const norm = (s) => String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/\b(gmbh|ug|haftungsbeschrankt|ag|kg|ohg|e\.?k\.?|ltd|inc|co)\b/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim()

/** Holder name vs. legal entity (Phase 18): exact after normalisation, else flagged for review. */
function holderMatchesLegalEntity(holderName, seller) {
  const h = norm(holderName)
  if (!h) return false
  const candidates = [
    seller.legal_name,
    seller.company_name,
    [seller.first_name, seller.last_name].filter(Boolean).join(' '),
    [seller.last_name, seller.first_name].filter(Boolean).join(' '),
  ].map(norm).filter(Boolean)
  return candidates.includes(h)
}

/** Real client IP behind Render's proxy. Returns null rather than inventing one. */
function clientIpFromRequest(req) {
  // The LEFTMOST X-Forwarded-For entry can be sent by the client itself; the entry appended by
  // our edge proxy (rightmost) or a CDN's client-IP header is what the proxy actually saw.
  const h = req?.headers || {}
  const cdn = String(h['cf-connecting-ip'] || h['true-client-ip'] || '').trim()
  const xffParts = String(h['x-forwarded-for'] || '').split(',').map((x) => x.trim()).filter(Boolean)
  const raw = cdn || xffParts[xffParts.length - 1] || String(req?.ip || req?.socket?.remoteAddress || '').trim()
  const ip = raw.replace(/^::ffff:/, '')
  if (!ip || ip === '127.0.0.1' || ip === '::1') return null
  return ip
}

const addr = (seller) => {
  const a = seller.business_address && typeof seller.business_address === 'object' ? seller.business_address : {}
  return {
    line1: a.street || a.line1 || a.address_line1 || null,
    line2: a.line2 || a.address_line2 || null,
    postal_code: a.postal_code || a.zip || null,
    city: a.city || null,
    country: String(a.country || '').trim().toUpperCase().slice(0, 2) || null,
  }
}

/**
 * Legal data → Stripe account params. Throws { missing: [...] } instead of guessing.
 * (Stripe may still require more — that is collected by hosted onboarding.)
 */
function buildAccountIdentity(seller) {
  const missing = []
  const type = String(seller.legal_entity_type || '').trim().toLowerCase()
  if (type !== 'individual' && type !== 'company') missing.push('legal_entity_type')
  const a = addr(seller)
  if (!a.country) missing.push('business_address.country')
  if (missing.length) throw Object.assign(new Error(`Fehlende Pflichtangaben: ${missing.join(', ')}`), { status: 400, missing })
  const address = Object.fromEntries(Object.entries(a).filter(([k, v]) => v && k !== 'country').concat([['country', a.country]]))
  const params = { country: a.country, business_type: type }
  if (type === 'individual') {
    const ind = { address }
    if (seller.first_name) ind.first_name = seller.first_name
    if (seller.last_name) ind.last_name = seller.last_name
    if (seller.email) ind.email = seller.email
    if (seller.date_of_birth) {
      const d = new Date(seller.date_of_birth)
      if (!Number.isNaN(d.getTime())) ind.dob = { day: d.getUTCDate(), month: d.getUTCMonth() + 1, year: d.getUTCFullYear() }
    }
    params.individual = ind
  } else {
    const co = { address }
    const name = seller.legal_name || seller.company_name
    if (name) co.name = name
    if (seller.tax_id) co.tax_id = seller.tax_id
    if (seller.vat_id) co.vat_id = seller.vat_id
    if (seller.business_registration_number) co.registration_number = seller.business_registration_number
    params.company = co
  }
  return params
}

async function loadSeller(client, sellerId) {
  return (await client.query(
    `SELECT * FROM seller_users WHERE seller_id = $1 AND sub_of_seller_id IS NULL ORDER BY created_at ASC LIMIT 1`,
    [sellerId],
  )).rows[0]
}

/**
 * Creates the Custom account (or updates its identity). Terms acceptance is passed ONLY when the
 * seller accepted in this request (`tos` = { ip, userAgent, date }), and stored with it.
 */
async function ensureCustomAccount(client, stripe, sellerId, { tos = null, actor = 'seller' } = {}) {
  const seller = await loadSeller(client, sellerId)
  if (!seller) throw Object.assign(new Error('Seller not found'), { status: 404 })
  const identity = buildAccountIdentity(seller)
  const tosParams = tos && tos.ip
    ? { tos_acceptance: { date: Math.floor(new Date(tos.date || Date.now()).getTime() / 1000), ip: tos.ip, ...(tos.userAgent ? { user_agent: String(tos.userAgent).slice(0, 500) } : {}) } }
    : {}
  if (seller.stripe_custom_account_id && seller.stripe_service_agreement && seller.stripe_service_agreement !== 'recipient') {
    // Created before the recipient fix (platform-filled 'full' acceptance). Stripe does not let
    // us switch the agreement silently — a new recipient account is a human decision (report).
    throw Object.assign(new Error('Bestehendes Stripe-Konto hat die Vereinbarung „full“ — Neuanlage als Recipient-Konto erforderlich (Superuser-Entscheidung).'), { status: 409, code: 'service_agreement_not_recipient' })
  }
  let accountId = seller.stripe_custom_account_id
  let account
  if (!accountId) {
    const { country, business_type, ...rest } = identity
    account = await stripe.accounts.create({
      type: 'custom',
      country,
      business_type,
      email: seller.email || undefined,
      // Sellers never take card payments themselves (platform is merchant of record, SCT):
      // recipient service agreement + transfers capability only (Stripe guidance 2026-10).
      capabilities: { transfers: { requested: true } },
      settings: { payouts: { schedule: { interval: 'manual' } } },
      metadata: { seller_id: sellerId },
      ...rest,
      tos_acceptance: { service_agreement: 'recipient', ...(tosParams.tos_acceptance || {}) },
    })
    accountId = account.id
    await client.query('UPDATE seller_users SET stripe_custom_account_id = $1, updated_at = now() WHERE seller_id = $2 AND sub_of_seller_id IS NULL', [accountId, sellerId])
  } else {
    const { country, ...rest } = identity // country of an existing account cannot change
    account = await stripe.accounts.update(accountId, {
      ...rest,
      settings: { payouts: { schedule: { interval: 'manual' } } },
      ...tosParams,
    })
  }
  if (!seller.stripe_custom_account_id) {
    await client.query(`UPDATE seller_users SET stripe_service_agreement = 'recipient' WHERE seller_id = $1 AND sub_of_seller_id IS NULL`, [sellerId])
  }
  if (tosParams.tos_acceptance) {
    await client.query(
      `UPDATE seller_users SET stripe_tos_accepted_at = $2, stripe_tos_ip = $3, stripe_tos_user_agent = $4 WHERE seller_id = $1 AND sub_of_seller_id IS NULL`,
      [sellerId, new Date(tosParams.tos_acceptance.date * 1000), tos.ip, tos.userAgent || null],
    )
  }
  await syncConnectedAccount(client, account)
  await auditFinance(client, { actor, action: seller.stripe_custom_account_id ? 'connect_account_updated' : 'connect_account_created', entityType: 'seller', entityId: sellerId, sellerId, details: { account: accountId, tos_recorded: !!tosParams.tos_acceptance } })
  return account
}

/**
 * Replaces the payout bank account. The holder type follows the legal entity; the holder ↔
 * legal-entity match is stored, and the status shown is Stripe's own — never "verified" by us.
 */
async function setPayoutBankAccount(client, stripe, sellerId, { iban, holderName, actor = 'seller' }) {
  const seller = await loadSeller(client, sellerId)
  if (!seller?.stripe_custom_account_id) throw Object.assign(new Error('Kein Stripe-Auszahlungskonto — zuerst Auszahlungskonto einrichten'), { status: 409 })
  const type = String(seller.legal_entity_type || '').toLowerCase()
  if (type !== 'individual' && type !== 'company') throw Object.assign(new Error('legal_entity_type fehlt'), { status: 400, missing: ['legal_entity_type'] })
  const country = String(iban || '').slice(0, 2).toUpperCase()
  const ba = await stripe.accounts.createExternalAccount(seller.stripe_custom_account_id, {
    external_account: {
      object: 'bank_account', country, currency: 'eur', account_number: iban,
      account_holder_name: holderName, account_holder_type: type,
    },
    default_for_currency: true,
  })
  try {
    const list = await stripe.accounts.listExternalAccounts(seller.stripe_custom_account_id, { object: 'bank_account', limit: 20 })
    for (const old of list.data || []) {
      if (old.id !== ba.id) await stripe.accounts.deleteExternalAccount(seller.stripe_custom_account_id, old.id).catch(() => {})
    }
  } catch (_) {}
  const matches = holderMatchesLegalEntity(holderName, seller)
  await client.query(
    `UPDATE seller_users SET stripe_external_account_id = $2, stripe_external_account_status = $3,
            stripe_external_account_last4 = $4, bank_holder_matches_legal_entity = $5, updated_at = now()
      WHERE seller_id = $1 AND sub_of_seller_id IS NULL`,
    [sellerId, ba.id, ba.status || 'new', ba.last4 || null, matches],
  )
  await auditFinance(client, { actor, action: 'payout_bank_account_set', entityType: 'seller', entityId: sellerId, sellerId, details: { external_account: ba.id, last4: ba.last4, holder_matches_legal_entity: matches } })
  return { bankAccount: ba, holderMatchesLegalEntity: matches }
}

/** Stripe-hosted onboarding for whatever Stripe still requires (works for Custom accounts). */
async function createOnboardingLink(stripe, accountId, { refreshUrl, returnUrl }) {
  return stripe.accountLinks.create({
    account: accountId, type: 'account_onboarding', collection: 'eventually_due',
    refresh_url: refreshUrl, return_url: returnUrl,
  })
}

/** Mirrors Stripe's account state (account.updated webhook / API responses) onto seller_users. */
async function syncConnectedAccount(client, account) {
  if (!account?.id) return
  const ext = (account.external_accounts?.data || []).find((x) => x.default_for_currency) || (account.external_accounts?.data || [])[0] || null
  await client.query(
    `UPDATE seller_users SET
        stripe_payouts_enabled = $2,
        stripe_transfers_capability = $3,
        stripe_requirements = $4::jsonb,
        stripe_disabled_reason = $5,
        stripe_service_agreement = COALESCE($9, stripe_service_agreement),
        -- Acceptance recorded by Stripe (hosted onboarding) is trusted only on recipient accounts
        -- created by the fixed flow; legacy 'full' accounts carry platform-filled data.
        stripe_tos_accepted_at = COALESCE(stripe_tos_accepted_at, CASE WHEN $9 = 'recipient' AND $10::bigint IS NOT NULL AND $11::text IS NOT NULL THEN to_timestamp($10::bigint) END),
        stripe_tos_ip = COALESCE(stripe_tos_ip, CASE WHEN $9 = 'recipient' AND $10::bigint IS NOT NULL THEN $11::text END),
        stripe_account_synced_at = now(),
        stripe_external_account_id = COALESCE($6, stripe_external_account_id),
        stripe_external_account_status = COALESCE($7, stripe_external_account_status),
        stripe_external_account_last4 = COALESCE($8, stripe_external_account_last4)
      WHERE stripe_custom_account_id = $1`,
    [
      account.id, account.payouts_enabled === true, account.capabilities?.transfers || null,
      JSON.stringify({
        currently_due: account.requirements?.currently_due || [],
        eventually_due: account.requirements?.eventually_due || [],
        past_due: account.requirements?.past_due || [],
        pending_verification: account.requirements?.pending_verification || [],
        errors: account.requirements?.errors || [],
        current_deadline: account.requirements?.current_deadline || null,
      }),
      account.requirements?.disabled_reason || null,
      ext?.id || null, ext?.status || null, ext?.last4 || null,
      account.tos_acceptance?.service_agreement || null,
      account.tos_acceptance?.date || null,
      account.tos_acceptance?.ip || null,
    ],
  )
}

module.exports = {
  holderMatchesLegalEntity,
  clientIpFromRequest,
  buildAccountIdentity,
  ensureCustomAccount,
  setPayoutBankAccount,
  createOnboardingLink,
  syncConnectedAccount,
}
