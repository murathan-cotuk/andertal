'use strict'
const { isValidScope, isShopAppOnlyScope } = require('./scope-registry')

const VALID_TYPES      = new Set(['shop_app', 'integration_app'])
const VALID_CATEGORIES = new Set(['shipping-fulfillment', 'accounting', 'marketing', 'analytics', 'inventory', 'reviews', 'storefront', 'other'])
const VALID_PRICING    = new Set(['free', 'monthly', 'usage'])
const HANDLE_RE        = /^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]$/
const SEMVER_RE        = /^\d+\.\d+\.\d+/

function validateManifest(manifest) {
  const errors = []
  if (!manifest || typeof manifest !== 'object') return ['manifest must be a JSON object']

  if (manifest.schema_version !== '1') errors.push('schema_version must be "1"')

  if (!manifest.handle || !HANDLE_RE.test(manifest.handle))
    errors.push('handle must be 3–64 chars, lowercase letters, digits, hyphens (not start/end with hyphen)')

  if (!manifest.name || typeof manifest.name !== 'string' || !manifest.name.trim())
    errors.push('name is required (string)')

  if (!VALID_TYPES.has(manifest.type))
    errors.push(`type must be one of: ${[...VALID_TYPES].join(', ')}`)

  if (!manifest.version || !SEMVER_RE.test(manifest.version))
    errors.push('version must follow semver (e.g. "1.0.0")')

  if (!manifest.developer_id || typeof manifest.developer_id !== 'string')
    errors.push('developer_id is required')

  const desc = manifest.description
  if (!desc || (typeof desc !== 'string' && typeof desc !== 'object'))
    errors.push('description is required (string or {de, en, …} object)')

  if (!VALID_CATEGORIES.has(manifest.category))
    errors.push(`category must be one of: ${[...VALID_CATEGORIES].join(', ')}`)

  if (!manifest.support?.privacy_policy_url)
    errors.push('support.privacy_policy_url is required')

  if (!Array.isArray(manifest.scopes)) {
    errors.push('scopes must be an array')
  } else {
    for (const s of manifest.scopes) {
      if (!isValidScope(s)) errors.push(`Unknown scope: "${s}"`)
    }
  }

  if (manifest.pricing) {
    if (!VALID_PRICING.has(manifest.pricing.model))
      errors.push(`pricing.model must be one of: ${[...VALID_PRICING].join(', ')}`)
    if (manifest.pricing.model !== 'free' && !(manifest.pricing.amount_eur >= 0))
      errors.push('pricing.amount_eur is required for paid apps')
  }

  if (manifest.oauth) {
    if (!Array.isArray(manifest.oauth.redirect_urls) || !manifest.oauth.redirect_urls.length)
      errors.push('oauth.redirect_urls must be a non-empty array when oauth is defined')
    for (const url of (manifest.oauth.redirect_urls || [])) {
      try { new URL(url) } catch { errors.push(`oauth.redirect_urls: "${url}" is not a valid URL`) }
    }
  }

  return errors
}

function validateTierTypeMatch(manifest, developer) {
  if (manifest.type === 'shop_app' && !developer.is_superuser_developer) {
    return 'Only platform-owned developer accounts (Tier 1) can publish shop_app'
  }
  for (const s of (manifest.scopes || [])) {
    if (isShopAppOnlyScope(s) && !developer.is_superuser_developer) {
      return `Scope "${s}" is only available to Tier 1 developers`
    }
  }
  return null
}

module.exports = { validateManifest, validateTierTypeMatch }
