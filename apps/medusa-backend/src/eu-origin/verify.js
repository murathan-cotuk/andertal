const { EU_ORIGIN_STATUS } = require('./constants')
const { pickEuOriginFields, buildVerifiedEuOriginPatch } = require('./metadata')
const { getEuOriginProvider } = require('./providers')
const { enqueueEuOriginPending, resolveEuOriginPending } = require('./queue')

/**
 * Phase 1: superuser manual verify, or stub provider → always pending unless manual=true.
 */
async function verifyEuOriginForProduct({
  dbQ,
  productId,
  existingMeta,
  isSuperuser,
  manual = false,
  verifiedBy = null,
  providerId = null,
  pendingQueueId = null,
}) {
  const fields = pickEuOriginFields(existingMeta)

  if (manual && isSuperuser) {
    const nextMeta = buildVerifiedEuOriginPatch(existingMeta, {
      verifiedBy,
      provider: providerId || fields.eu_origin_provider || 'manual',
    })
    if (pendingQueueId) {
      await resolveEuOriginPending(dbQ, pendingQueueId, { status: 'verified', note: 'Superuser manual verify' })
    }
    return {
      ok: true,
      metadata: nextMeta,
      status: EU_ORIGIN_STATUS.VERIFIED,
      mode: 'manual',
    }
  }

  const provider = getEuOriginProvider(providerId || fields.eu_origin_provider || 'stub')
  const lookup = await provider.lookup({
    registryId: fields.eu_origin_registry_id,
    country: fields.eu_origin_country,
    documentUrl: fields.eu_origin_document_url,
  })

  if (lookup.ok === true) {
    const nextMeta = buildVerifiedEuOriginPatch(existingMeta, {
      verifiedBy,
      provider: provider.id,
    })
    return { ok: true, metadata: nextMeta, status: EU_ORIGIN_STATUS.VERIFIED, mode: 'provider', provider: provider.id }
  }

  await enqueueEuOriginPending(dbQ, {
    productId,
    sellerId: verifiedBy,
    meta: existingMeta,
    note: lookup.message || 'Awaiting manual review',
  })

  const pendingMeta = {
    ...(existingMeta && typeof existingMeta === 'object' ? existingMeta : {}),
    eu_origin_status: EU_ORIGIN_STATUS.PENDING,
    eu_origin_provider: provider.id,
  }
  delete pendingMeta.eu_origin_verified_at

  return {
    ok: false,
    pending: true,
    metadata: pendingMeta,
    status: EU_ORIGIN_STATUS.PENDING,
    mode: 'provider',
    provider: provider.id,
    message: lookup.message || 'Verification pending manual review',
  }
}

module.exports = {
  verifyEuOriginForProduct,
}
