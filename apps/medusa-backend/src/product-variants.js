'use strict'

/**
 * Variant matrix integrity: every variant is one unique combination of the product's
 * variation groups (Farbe × Größe …). Two variants with the same combination, or a variant
 * missing a group's value, cannot be selected in the shop. Problems already stored on the
 * product are tolerated (grandfathered) so old products stay editable.
 */

const comboKey = (v) =>
  JSON.stringify((Array.isArray(v && v.option_values) ? v.option_values : []).map((x) => String(x == null ? '' : x).trim().toLowerCase()))

const isRealVariant = (v) => v && Array.isArray(v.option_values) && v.option_values.length > 0

const matrixProblems = (metadata, variants) => {
  const groups = Array.isArray(metadata && metadata.variation_groups) ? metadata.variation_groups.length : 0
  const out = []
  const seen = new Set()
  for (const v of (Array.isArray(variants) ? variants : []).filter(isRealVariant)) {
    const key = comboKey(v)
    const label = v.option_values.join(' / ')
    if (seen.has(key)) out.push({ code: 'duplicate_combination', key, label })
    seen.add(key)
    if (groups && (v.option_values.length !== groups || v.option_values.some((x) => !String(x == null ? '' : x).trim()))) {
      out.push({ code: 'incomplete_combination', key, label })
    }
  }
  return out
}

/**
 * @returns {{ ok: true } | { ok: false, code: string, message: string }}
 */
const validateVariantMatrix = (metadata, variants, previous = null) => {
  const old = previous
    ? new Set(matrixProblems(previous.metadata, previous.variants).map((p) => `${p.code}|${p.key}`))
    : new Set()
  const fresh = matrixProblems(metadata, variants).filter((p) => !old.has(`${p.code}|${p.key}`))
  if (!fresh.length) return { ok: true }
  const p = fresh[0]
  return {
    ok: false,
    code: p.code,
    message: p.code === 'duplicate_combination'
      ? `Variant combination exists twice: ${p.label}`
      : `Variant needs a value for every variation group: ${p.label || '(empty)'}`,
  }
}

module.exports = { matrixProblems, validateVariantMatrix }
