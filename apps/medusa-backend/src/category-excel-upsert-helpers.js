'use strict'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const EXCEL_LANGS = ['de', 'en', 'tr', 'fr', 'it', 'es']
/**
 * Soft max for leaf slugs. Always cut on a hyphen (never mid-word like "…compressor-sea").
 * Stored slugs are English; German umlaut names must not drive the URL.
 */
const LEAF_SLUG_MAX = 100
/**
 * Amazon/Excel path roots. Dash-count alone is NOT enough — long English leaves
 * can also have several hyphens.
 */
const PATH_ROOT_RE = /^(automotive|arts-crafts|arts-crafts-sewing|electronics|movies-tv|home-kitchen|home-and-kitchen|computers|industrial|sports|sports-outdoors|toys-games|toys-and-games|beauty|beauty-personal-care|clothing|clothing-shoes-jewelry|books|office-products|grocery|pet-supplies|baby-products|appliances|garden|tools|handmade|software|video-games|musical-instruments|health|cell-phones|amazon-devices)(-|$)/i
/** Slugs derived from German labels (fuer/ue/oe/ae stems, Kfz, …) — regenerate from name_en. */
const GERMAN_SLUG_RE = /(^|-)(fuer|und|der|die|das|dem|den|kfz|ersatz|motorrad|haushalts?|geraete|raeder|schlaeuche|huellen|kuehl|wasch|spuel|geschirr|zierleisten|innenraum|karosserie|reifens?)(-|$)/i

function isUuid(v) {
  return UUID_RE.test(String(v || '').trim())
}

function slugFromImportKeyPg(key, maxLen = 255) {
  const lim = Number.isFinite(maxLen) && maxLen > 0 ? maxLen : 255
  let s = String(key || '').toLowerCase().trim()
    .replace(/\|/g, '-')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'category'
  if (s.length <= lim) return s
  // Truncate on a hyphen boundary — never leave a mid-word stump ("…compressor-sea").
  s = s.slice(0, lim)
  const lastDash = s.lastIndexOf('-')
  if (lastDash >= Math.floor(lim * 0.4)) s = s.slice(0, lastDash)
  return s.replace(/-$/g, '') || 'category'
}

function slugFromCategoryName(name, maxLen = LEAF_SLUG_MAX) {
  let s = String(name || '').toLowerCase()
  const map = {
    ü: 'ue', ö: 'oe', ä: 'ae', ß: 'ss', ç: 'c', ğ: 'g', ı: 'i', ş: 's',
    é: 'e', è: 'e', ê: 'e', à: 'a', ù: 'u', ò: 'o', ì: 'i',
  }
  for (const [from, to] of Object.entries(map)) s = s.split(from).join(to)
  return slugFromImportKeyPg(s, maxLen)
}

/** True when slug looks like a concatenated Amazon/path hierarchy, not a leaf niche. */
function isPathLikeSlug(raw) {
  const s = String(raw || '').toLowerCase().trim()
  if (!s) return false
  if (s.length > LEAF_SLUG_MAX) return true
  if (PATH_ROOT_RE.test(s)) return true
  // Identical half repeated (bad collision disambiguator): foo-bar-foo-bar
  const parts = s.split('-').filter(Boolean)
  if (parts.length >= 6) {
    const half = Math.floor(parts.length / 2)
    if (parts.slice(0, half).join('-') === parts.slice(half).join('-')) return true
  }
  // Truncation stump: long slug ending in 1–3 letter fragment
  const last = parts[parts.length - 1] || ''
  if (s.length >= LEAF_SLUG_MAX - 5 && last.length > 0 && last.length <= 3) {
    const keep = new Set(['dvd', 'suv', 'usb', 'led', 'gps', 'tv', 'pc', 'xl', 'atc', 'oem', 'abs', 'kit', 'set', 'and', 'und', 'der', 'die', 'das', 'for', 'the'])
    if (!keep.has(last)) return true
  }
  return false
}

/** True when slug was (or would be) produced from a German label. */
function looksGermanSlug(raw) {
  const s = String(raw || '').toLowerCase().trim()
  if (!s) return false
  return GERMAN_SLUG_RE.test(s)
}

/**
 * Normalize an Excel slug the same way INSERT/UPDATE will store it for *lookup*.
 * Raw spreadsheet values often contain spaces (Amazon path + EN leaf name).
 * Keeps up to 255 so long path slugs still match existing DB rows during upsert.
 * nameFallback should be English (name_en) when available.
 */
function normalizeExcelSlug(rawSlug, nameFallback) {
  const fromRaw = slugFromCategoryName(String(rawSlug || '').trim(), 255)
  if (fromRaw && fromRaw !== 'category') return fromRaw
  const fromName = slugFromCategoryName(String(nameFallback || '').trim())
  return fromName || ''
}

/**
 * Desired *stored* slug — always English when name_en is provided.
 * Keeps a custom English slug only if it equals/extends the English leaf
 * (e.g. adhesive-sheets-pro). Path / German / unrelated leaves are replaced.
 */
function preferredLeafSlug(rawSlug, englishName) {
  const fromEn = slugFromCategoryName(String(englishName || '').trim())
  const raw = String(rawSlug || '').trim()
  const fromRaw = raw ? slugFromCategoryName(raw) : ''
  if (fromEn && fromEn !== 'category') {
    if (!fromRaw || fromRaw === 'category' || isPathLikeSlug(fromRaw) || looksGermanSlug(fromRaw)) {
      return fromEn
    }
    if (fromRaw === fromEn || fromRaw.startsWith(`${fromEn}-`)) return fromRaw
    return fromEn
  }
  if (fromRaw && fromRaw !== 'category' && !isPathLikeSlug(fromRaw) && !looksGermanSlug(fromRaw)) {
    return fromRaw
  }
  return fromEn || fromRaw || 'category'
}

/**
 * Resolve the slug we persist on excel upsert / create.
 * Priority: name_en leaf (stable English URL) → safe raw → any fallback.
 */
function resolveStoredCategorySlug({ rawSlug, nameEn, nameFallback } = {}) {
  const en = String(nameEn || '').trim()
  if (en) return preferredLeafSlug(rawSlug, en)
  const raw = String(rawSlug || '').trim()
  if (raw && !isPathLikeSlug(raw) && !looksGermanSlug(raw)) {
    const fromRaw = slugFromCategoryName(raw)
    if (fromRaw && fromRaw !== 'category') return fromRaw
  }
  const fb = slugFromCategoryName(String(nameFallback || '').trim())
  if (fb && fb !== 'category' && !looksGermanSlug(fb)) return fb
  return preferredLeafSlug(rawSlug, nameFallback) || 'category'
}

/**
 * Allocate a unique leaf slug. Collision order:
 * 1) base
 * 2) base-<disambiguator> for each short parent/context token
 * 3) base-2, base-3, ...
 */
function allocateUniqueLeafSlug(base, takenSet, disambiguators = []) {
  const root = slugFromCategoryName(base) || 'category'
  if (!takenSet.has(root)) return root
  for (const d of disambiguators) {
    // Never glue Amazon path fragments onto a leaf slug.
    if (isPathLikeSlug(d) || PATH_ROOT_RE.test(String(d || '').toLowerCase())) continue
    const token = slugFromCategoryName(d, 40)
    if (!token || token === 'category' || token === root) continue
    if (isPathLikeSlug(token)) continue
    const candidate = slugFromCategoryName(`${root}-${token}`)
    if (candidate && !takenSet.has(candidate)) return candidate
  }
  let n = 2
  while (takenSet.has(`${root}-${n}`)) n += 1
  return `${root}-${n}`
}

/**
 * Resolve the row to update. Slug conflict always means UPDATE that owner —
 * never invent a `-1` / `-2` suffix.
 */
function resolveExcelUpsertTarget({ id, slug, byId, bySlug }) {
  const idKey = id && isUuid(id) ? String(id).trim().toLowerCase() : ''
  const slugKey = slug ? String(slug).trim().toLowerCase() : ''

  if (idKey && byId.has(idKey)) {
    return { existing: byId.get(idKey), match: 'id' }
  }
  if (slugKey && bySlug.has(slugKey)) {
    return { existing: bySlug.get(slugKey), match: 'slug' }
  }
  return { existing: null, match: null }
}

/**
 * Desired slug for an upsert row. If another category already owns it and we
 * matched by id, keep our current slug (do not steal / do not suffix).
 */
function nextSlugForExcelUpsert({ desiredSlug, existingRow, takenSlugs }) {
  const want = desiredSlug ? String(desiredSlug).trim().toLowerCase() : ''
  if (!existingRow) {
    return want || 'category'
  }
  const current = String(existingRow.slug || '').toLowerCase()
  if (!want || want === current) return existingRow.slug
  const owner = takenSlugs.get(want)
  if (!owner || String(owner) === String(existingRow.id)) return want
  // Slug owned by someone else → keep ours (never uniqueSlug to -1)
  return existingRow.slug
}

module.exports = {
  UUID_RE,
  EXCEL_LANGS,
  LEAF_SLUG_MAX,
  PATH_ROOT_RE,
  GERMAN_SLUG_RE,
  isUuid,
  slugFromImportKeyPg,
  slugFromCategoryName,
  isPathLikeSlug,
  looksGermanSlug,
  normalizeExcelSlug,
  preferredLeafSlug,
  resolveStoredCategorySlug,
  allocateUniqueLeafSlug,
  resolveExcelUpsertTarget,
  nextSlugForExcelUpsert,
}
