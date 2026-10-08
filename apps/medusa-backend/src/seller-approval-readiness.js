'use strict'

/**
 * What must be on file before a seller may be approved (= may sell).
 *
 * Blockers (approval refused):
 *   - agreement_not_accepted   Verkäufervertrag accepted (seller_users.agreement_accepted)
 *   - legal_name_missing       company / legal / authorised person name (Impressum, invoices)
 *   - business_address_missing street, postal code, city, country
 *   - tax_number_missing       USt-IdNr or Steuernummer (Marktplatzhaftung §§22f, 25e UStG)
 *   - lucid_number_missing     LUCID registration (VerpackG §9, platform check §7 Abs. 7)
 * Warnings (shown, approval allowed — collected later):
 *   - payout_account_missing   Stripe recipient account / IBAN (payouts stay blocked meanwhile)
 *   - dac7_birth_date_missing  natural persons (PStTG)
 *   - vat_id_not_vies_valid    VAT ID present but not (yet) VIES-confirmed
 */

const s = (v) => String(v == null ? '' : v).trim()

function addressComplete(a) {
  let addr = a
  if (typeof addr === 'string') { try { addr = JSON.parse(addr) } catch (_) { addr = null } }
  if (!addr || typeof addr !== 'object') return false
  const street = s(addr.street || addr.address_line1 || addr.line1 || addr.address)
  const zip = s(addr.zip || addr.postal_code || addr.postcode || addr.plz)
  const city = s(addr.city || addr.ort)
  const country = s(addr.country || addr.country_code)
  return !!(street && zip && city && country)
}

function approvalReadiness(seller) {
  const x = seller || {}
  const blockers = []
  const warnings = []
  if (x.agreement_accepted !== true) blockers.push('agreement_not_accepted')
  if (!s(x.company_name) && !s(x.legal_name) && !s(x.authorized_person_name) && !(s(x.first_name) && s(x.last_name))) blockers.push('legal_name_missing')
  if (!addressComplete(x.business_address)) blockers.push('business_address_missing')
  if (!s(x.vat_id) && !s(x.tax_id)) blockers.push('tax_number_missing')
  if (!s(x.lucid_number)) blockers.push('lucid_number_missing')
  if (!s(x.stripe_account_id) && !s(x.stripe_custom_account_id) && !s(x.iban)) warnings.push('payout_account_missing')
  if (s(x.legal_entity_type).toLowerCase() === 'individual' && !x.date_of_birth) warnings.push('dac7_birth_date_missing')
  if (s(x.vat_id) && x.vat_id_vies_valid !== true) warnings.push('vat_id_not_vies_valid')
  return { ready: blockers.length === 0, blockers, warnings }
}

/** Seller statuses whose products are sold in the shop. */
const SELLING_STATUSES = ['approved', 'active']
const isSellingStatus = (st) => SELLING_STATUSES.includes(s(st).toLowerCase())

module.exports = { approvalReadiness, addressComplete, SELLING_STATUSES, isSellingStatus }
