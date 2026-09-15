'use strict'

const { glossaryLookup } = require('./amazon-category-name-glossary')

const TARGET_LOCALES = ['de', 'tr', 'fr', 'es', 'it']

function normalizeName(s) {
  return String(s || '').trim()
}

function namesEqual(a, b) {
  return normalizeName(a).toLowerCase() === normalizeName(b).toLowerCase()
}

/** Empty or still-English copied names may be filled. Distinct manual names are kept. */
function shouldFillName(existing, sourceName, force) {
  if (force) return true
  const cur = normalizeName(existing)
  if (!cur) return true
  return namesEqual(cur, sourceName)
}

function applyCategoryLocaleNames(category, nameByLocale, opts = {}) {
  const sourceName = normalizeName(opts.sourceName || category?.name)
  const meta =
    category?.metadata && typeof category.metadata === 'object' ? { ...category.metadata } : {}
  const tr = { ...(meta.translations && typeof meta.translations === 'object' ? meta.translations : {}) }
  let changed = false

  if (sourceName) {
    const enBlock = { ...(tr.en || {}) }
    if (enBlock.name !== sourceName) {
      enBlock.name = sourceName
      tr.en = enBlock
      changed = true
    }
  }

  for (const loc of TARGET_LOCALES) {
    const next = normalizeName(nameByLocale?.[loc] || glossaryLookup(sourceName, loc))
    if (!next) continue
    const prev = tr[loc] && typeof tr[loc] === 'object' ? tr[loc] : {}
    if (!shouldFillName(prev.name, sourceName, opts.force)) continue
    if (prev.name === next && prev._auto?.name) continue
    const auto = { ...(prev._auto && typeof prev._auto === 'object' ? prev._auto : {}), name: true }
    tr[loc] = { ...prev, name: next, _auto: auto }
    changed = true
  }

  return { changed, metadata: { ...meta, translations: tr } }
}

module.exports = {
  TARGET_LOCALES,
  normalizeName,
  namesEqual,
  shouldFillName,
  applyCategoryLocaleNames,
}
