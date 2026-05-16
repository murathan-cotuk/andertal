/**
 * Registry provider adapters — Phase 1: stub only; manual superuser verification.
 * @typedef {{ registryId: string, country?: string, documentUrl?: string }} RegistryLookupInput
 * @typedef {{ ok: boolean, pending?: boolean, message?: string, registryValid?: boolean }} RegistryLookupResult
 */

/** @type {Record<string, { id: string, label: string, lookup: (input: RegistryLookupInput) => Promise<RegistryLookupResult> }>} */
const providers = {
  stub: {
    id: 'stub',
    label: 'Stub (manual review)',
    async lookup({ registryId, country }) {
      const id = String(registryId || '').trim()
      if (!id) {
        return { ok: false, pending: false, message: 'registry_id required' }
      }
      return {
        ok: false,
        pending: true,
        registryValid: null,
        message: `Stub provider: registry "${id}"${country ? ` (${country})` : ''} queued for manual review`,
      }
    },
  },
}

function getEuOriginProvider(id) {
  const key = String(id || 'stub').trim().toLowerCase() || 'stub'
  return providers[key] || providers.stub
}

function listEuOriginProviders() {
  return Object.values(providers).map((p) => ({ id: p.id, label: p.label }))
}

module.exports = {
  getEuOriginProvider,
  listEuOriginProviders,
  providers,
}
