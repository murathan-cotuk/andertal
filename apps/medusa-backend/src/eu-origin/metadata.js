const { EU_ORIGIN_META_KEYS, EU_ORIGIN_STATUS, EU_ORIGIN_PROTECTED_KEYS } = require('./constants')

function pickEuOriginFields(meta) {
  const m = meta && typeof meta === 'object' ? meta : {}
  return {
    eu_origin_provider: String(m.eu_origin_provider ?? '').trim(),
    eu_origin_registry_id: String(m.eu_origin_registry_id ?? '').trim(),
    eu_origin_document_url: String(m.eu_origin_document_url ?? '').trim(),
    eu_origin_status: String(m.eu_origin_status ?? '').trim().toLowerCase(),
    eu_origin_verified_at: String(m.eu_origin_verified_at ?? '').trim(),
    eu_origin_country: String(m.eu_origin_country ?? '').trim(),
  }
}

function isEuOriginVerified(meta) {
  return pickEuOriginFields(meta).eu_origin_status === EU_ORIGIN_STATUS.VERIFIED
}

/**
 * Sellers may edit registry/document/country/provider; verification fields are superuser-only.
 * When seller changes substantiating fields, status → pending (unless already verified and unchanged).
 */
function applyEuOriginMetadataPolicy(mergedMeta, existingMeta, { isSuperuser = false } = {}) {
  const out = mergedMeta && typeof mergedMeta === 'object' ? { ...mergedMeta } : {}
  const existing = pickEuOriginFields(existingMeta)
  const incoming = pickEuOriginFields(out)

  if (!isSuperuser) {
    for (const k of EU_ORIGIN_PROTECTED_KEYS) {
      if (Object.prototype.hasOwnProperty.call(out, k)) {
        out[k] = existing[k] || ''
      }
    }
    const substantiatingChanged =
      incoming.eu_origin_registry_id !== existing.eu_origin_registry_id ||
      incoming.eu_origin_document_url !== existing.eu_origin_document_url ||
      incoming.eu_origin_country !== existing.eu_origin_country ||
      incoming.eu_origin_provider !== existing.eu_origin_provider

    const hasSubstantiation =
      incoming.eu_origin_registry_id ||
      incoming.eu_origin_document_url ||
      incoming.eu_origin_country

    if (substantiatingChanged && hasSubstantiation) {
      if (existing.eu_origin_status !== EU_ORIGIN_STATUS.VERIFIED) {
        out.eu_origin_status = EU_ORIGIN_STATUS.PENDING
        out.eu_origin_verified_at = ''
      }
    }
  }

  for (const k of EU_ORIGIN_META_KEYS) {
    if (out[k] === '' || out[k] == null) delete out[k]
  }

  return out
}

function buildVerifiedEuOriginPatch(existingMeta, { verifiedBy = null, provider = null } = {}) {
  const base = existingMeta && typeof existingMeta === 'object' ? { ...existingMeta } : {}
  return {
    ...base,
    eu_origin_status: EU_ORIGIN_STATUS.VERIFIED,
    eu_origin_verified_at: new Date().toISOString(),
    ...(provider ? { eu_origin_provider: String(provider).trim() } : {}),
    ...(verifiedBy ? { _eu_origin_verified_by: String(verifiedBy) } : {}),
  }
}

module.exports = {
  pickEuOriginFields,
  isEuOriginVerified,
  applyEuOriginMetadataPolicy,
  buildVerifiedEuOriginPatch,
  EU_ORIGIN_META_KEYS,
}
