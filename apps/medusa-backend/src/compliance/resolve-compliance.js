'use strict'

/**
 * Compliance resolution (docs/HUKUKI.md Faz 1, module resolve-compliance.js).
 *
 * Merges a product-type compliance profile (with inheritance) + a marketplace
 * (country) overlay into a flat set of required / optional / blocking fields,
 * then validates a product's metadata against it.
 *
 * Pure, dependency-free. Data lives in compliance-profiles.json and
 * marketplace-overlays.json. NOT legal advice.
 *
 * NOTE (status): this module is a foundation. It is NOT yet wired into the
 * product create/update flow — that requires category → profile assignment
 * (Faz 1 step 3) so we don't block sellers with the wrong profile. See
 * docs/HUKUKI.md status report at the bottom of that file.
 */

const profilesData = require('./compliance-profiles.json')
const overlaysData = require('./marketplace-overlays.json')

const PROFILES = profilesData.profiles || {}
const FIELD_DEFS = profilesData.field_definitions || {}
const OVERLAYS = overlaysData.overlays || {}

const DEFAULT_PROFILE_ID = 'general_consumer_gpsr'
const DEFAULT_MARKETPLACE = 'DE'

function uniq(arr) {
  return [...new Set((arr || []).filter(Boolean))]
}

/**
 * Resolve a single profile with `inherits` chain flattened.
 * @param {string} profileId
 * @returns {{ id, label, required_fields, optional_fields, blocked_publish_without, superuser_only } | null}
 */
function resolveProfile(profileId) {
  const id = String(profileId || '').trim() || DEFAULT_PROFILE_ID
  const seen = new Set()
  let required = []
  let optional = []
  let blocked = []
  let superuserOnly = false
  let label = null

  let cursorId = id
  // Walk inheritance chain child → parent, guarding against cycles.
  while (cursorId && PROFILES[cursorId] && !seen.has(cursorId)) {
    seen.add(cursorId)
    const p = PROFILES[cursorId]
    if (label == null) label = p.label || cursorId
    required = required.concat(p.required_fields || [])
    optional = optional.concat(p.optional_fields || [])
    blocked = blocked.concat(p.blocked_publish_without || [])
    if (p.superuser_only) superuserOnly = true
    cursorId = p.inherits || null
  }

  if (!PROFILES[id]) return null

  return {
    id,
    label: label || id,
    required_fields: uniq(required),
    optional_fields: uniq(optional).filter((f) => !required.includes(f)),
    blocked_publish_without: uniq(blocked),
    superuser_only: superuserOnly,
  }
}

/**
 * Merge a resolved profile with a marketplace overlay.
 * @param {string} profileId
 * @param {string} marketplace  e.g. 'DE', 'FR', 'EU'
 */
function resolveComplianceProfile(profileId, marketplace = DEFAULT_MARKETPLACE) {
  const base = resolveProfile(profileId) || resolveProfile(DEFAULT_PROFILE_ID)
  const mp = String(marketplace || DEFAULT_MARKETPLACE).toUpperCase()
  const overlay = OVERLAYS[mp] || OVERLAYS.EU || { extra_required_fields: [], national_register_fields: [], label_language: null }

  // National register fields are CONDITIONAL: only required when the base profile
  // already requires their trigger field (e.g. weee_number_fr only if the product
  // type needs WEEE). requires_if_base_field=null → suggested (optional), never blocks.
  const baseRequiredSet = new Set(base.required_fields || [])
  const nationalRequired = []
  const nationalSuggested = []
  for (const entry of overlay.national_register_fields || []) {
    const nf = typeof entry === 'string' ? { field: entry, requires_if_base_field: null } : entry
    if (!nf || !nf.field) continue
    if (nf.requires_if_base_field && baseRequiredSet.has(nf.requires_if_base_field)) {
      nationalRequired.push(nf.field)
    } else {
      nationalSuggested.push(nf.field)
    }
  }

  const overlayRequired = uniq([...(overlay.extra_required_fields || []), ...nationalRequired])

  const required_fields = uniq([...(base.required_fields || []), ...overlayRequired])
  const optional_fields = uniq([...(base.optional_fields || []), ...nationalSuggested].filter((f) => !required_fields.includes(f)))
  const blocked_publish_without = uniq([...(base.blocked_publish_without || []), ...overlayRequired])

  return {
    profile_id: base.id,
    profile_label: base.label,
    marketplace: mp,
    label_language: overlay.label_language || null,
    superuser_only: base.superuser_only === true,
    required_fields,
    optional_fields,
    blocked_publish_without,
    field_definitions: buildFieldDefs([...required_fields, ...optional_fields]),
  }
}

function buildFieldDefs(keys) {
  const out = {}
  for (const k of uniq(keys)) {
    out[k] = FIELD_DEFS[k] || { type: 'text', label_i18n: {}, validation_regex: null, help_text_i18n: {} }
  }
  return out
}

function hasValue(v) {
  if (v == null) return false
  if (typeof v === 'string') return v.trim().length > 0
  if (Array.isArray(v)) return v.length > 0
  if (typeof v === 'number') return true
  if (typeof v === 'object') return Object.keys(v).length > 0
  return Boolean(v)
}

/**
 * Validate a product's metadata against a resolved compliance profile.
 * @param {object} metadata      product metadata
 * @param {string} profileId
 * @param {string} marketplace
 * @param {object} [opts] { forPublish: boolean } — when true, only blocked_publish_without gate.
 * @returns {{ ok, missing: string[], invalid: string[], resolved }}
 */
function validateProductCompliance(metadata, profileId, marketplace = DEFAULT_MARKETPLACE, opts = {}) {
  const resolved = resolveComplianceProfile(profileId, marketplace)
  const meta = metadata && typeof metadata === 'object' ? metadata : {}
  const forPublish = opts.forPublish === true

  const fieldsToCheck = forPublish ? resolved.blocked_publish_without : resolved.required_fields
  const missing = []
  const invalid = []

  for (const key of fieldsToCheck) {
    if (!hasValue(meta[key])) { missing.push(key); continue }
    const def = resolved.field_definitions[key]
    if (def && def.validation_regex) {
      try {
        const re = new RegExp(def.validation_regex)
        if (!re.test(String(meta[key]))) invalid.push(key)
      } catch (_) { /* bad regex in data → skip */ }
    }
  }

  return { ok: missing.length === 0 && invalid.length === 0, missing, invalid, resolved }
}

function listProfiles() {
  return Object.keys(PROFILES).map((id) => {
    const r = resolveProfile(id)
    return { id, label: r ? r.label : id, superuser_only: r ? r.superuser_only : false }
  })
}

function listMarketplaces() {
  return Object.keys(OVERLAYS).map((id) => ({ id, label: OVERLAYS[id].label || id }))
}

module.exports = {
  DEFAULT_PROFILE_ID,
  DEFAULT_MARKETPLACE,
  resolveProfile,
  resolveComplianceProfile,
  validateProductCompliance,
  listProfiles,
  listMarketplaces,
}
