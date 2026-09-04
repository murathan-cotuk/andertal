/**
 * One-off backfill: re-processes images that were uploaded BEFORE the generic resize+WebP
 * pipeline existed (media.js's processGenericImageToWebp, added alongside the PageSpeed
 * performance work — see docs, "Shop homepage performance fix"). Every new non-product upload
 * already goes through that pipeline automatically; this script catches the pre-existing landing
 * banners / category / collection images that were stored raw (multi-MB PNGs etc.) and are still
 * being served byte-for-byte to every visitor.
 *
 * Scope:
 *   - image URLs embedded inside the landing-page "containers" JSON blobs —
 *     admin_hub_landing_page.containers (homepage), admin_hub_landing_categories.containers,
 *     admin_hub_landing_pages.containers
 *   - admin_hub_product_badges.image_url + i18n.<locale>.image_url (the "Made in Europe"/Sale/
 *     Bestseller corner badges — same raw-PNG problem, separate table, not JSON-embedded)
 * These are recursively scanned for string values that look like our own local-disk-hosted
 * (/uploads/...) or S3-hosted image URLs. Category/collection/brand cover images stored in their
 * own dedicated columns are NOT covered by this pass.
 *
 * Safety:
 *   - Defaults to --dry-run (no writes, no new files, no DB changes) unless --dry-run is REMOVED.
 *   - Never deletes the original file — writes a new file alongside it and only rewrites the URL
 *     reference in the JSON. Originals can be cleaned up separately once verified.
 *   - Per row, the whole `containers` array is rewritten in ONE atomic UPDATE — never partial.
 *   - Skips SVG/GIF/already-WebP-under-cap, same exclusions as the live upload pipeline.
 *
 * Usage (from apps/medusa-backend):
 *   node scripts/backfill-optimize-media.js               # dry run (default), prints a report
 *   node scripts/backfill-optimize-media.js --apply        # actually processes + writes
 *
 * Env: DATABASE_URL, UPLOAD_DIR (optional), S3_UPLOAD_* (optional) — same as the live server.
 */
require('dotenv').config()
try {
  require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.local') })
} catch (_) {}

const path = require('path')
const fs = require('fs')
const { Client } = require('pg')
const {
  processGenericImageToWebp,
  uploadBufferToS3,
  uploadDir,
  useS3,
  GENERIC_IMAGE_MAX_EDGE,
} = require('../src/routes/media')

const DATABASE_URL = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
const APPLY = process.argv.includes('--apply')
const DRY_RUN = !APPLY

const TABLES = [
  { table: 'admin_hub_landing_page', idCol: 'id', label: 'homepage' },
  { table: 'admin_hub_landing_categories', idCol: 'category_id', label: 'category landing' },
  { table: 'admin_hub_landing_pages', idCol: 'page_id', label: 'CMS page landing' },
]

const IMAGE_EXT_RE = /\.(png|jpe?g)(\?|#|$)/i

function s3BaseUrl() {
  if (!useS3 || !process.env.S3_UPLOAD_BUCKET) return null
  const bucket = process.env.S3_UPLOAD_BUCKET
  const region = process.env.S3_UPLOAD_REGION || 'eu-central-1'
  return (process.env.S3_UPLOAD_PUBLIC_BASE_URL || `https://${bucket}.s3.${region}.amazonaws.com`).replace(/\/$/, '')
}

/** Pathname of a URL string, or null if not parseable. */
function urlPathname(v) {
  if (typeof v !== 'string' || !v) return null
  if (v.startsWith('/')) return v.split('?')[0].split('#')[0]
  try {
    return new URL(v).pathname
  } catch (_) {
    return null
  }
}

/** Is this string one of OUR stored image URLs (not an external/seller-hotlinked image), and a
 * format the generic pipeline would actually touch (png/jpg — webp/svg/gif are pre-filtered here
 * so we don't even bother fetching them)?
 * Accepts relative `/uploads/...` and absolute hosts that still serve `/uploads/...`
 * (api.andertal.com, *.onrender.com, etc.). */
function isCandidateImageUrl(v) {
  if (typeof v !== 'string' || !v) return false
  if (!IMAGE_EXT_RE.test(v)) return false
  if (v.startsWith('/uploads/')) return true
  const s3Base = s3BaseUrl()
  if (s3Base && v.startsWith(s3Base + '/')) return true
  const pathname = urlPathname(v)
  if (pathname && pathname.startsWith('/uploads/') && /^https?:\/\//i.test(v)) {
    // Skip clearly foreign CDNs (Envato etc.) even if path somehow matches.
    if (/s3\.envato\.com|envato\.com/i.test(v)) return false
    return true
  }
  return false
}

/** Recursively collect every distinct candidate image URL referenced anywhere in the JSON. */
function collectImageUrls(node, out) {
  if (Array.isArray(node)) {
    for (const item of node) collectImageUrls(item, out)
  } else if (node && typeof node === 'object') {
    for (const v of Object.values(node)) collectImageUrls(v, out)
  } else if (isCandidateImageUrl(node)) {
    out.add(node)
  }
}

/** Replace every occurrence of `urlMap`'s keys with their mapped new URL, anywhere in the JSON. */
function rewriteImageUrls(node, urlMap) {
  if (Array.isArray(node)) return node.map((item) => rewriteImageUrls(item, urlMap))
  if (node && typeof node === 'object') {
    const next = {}
    for (const [k, v] of Object.entries(node)) next[k] = rewriteImageUrls(v, urlMap)
    return next
  }
  if (typeof node === 'string' && urlMap.has(node)) return urlMap.get(node)
  return node
}

function diskPathForUrl(urlOrPath) {
  // "/uploads/media/_platform/x.png" or "https://host/uploads/media/_platform/x.png"
  // -> file under uploadDir (which already ends in ".../uploads")
  const pathname = urlPathname(urlOrPath) || String(urlOrPath || '')
  const rel = pathname.replace(/^\/uploads\//, '').replace(/^uploads\//, '')
  return path.join(uploadDir, rel)
}

function s3KeyForUrl(url) {
  const base = s3BaseUrl()
  return url.slice(base.length + 1)
}

function publicUrlAfterStore(originalUrl, newRelUploadsPath) {
  // Keep absolute host if the CMS stored an absolute URL; otherwise relative /uploads/...
  if (/^https?:\/\//i.test(originalUrl)) {
    try {
      const u = new URL(originalUrl)
      return `${u.origin}${newRelUploadsPath}`
    } catch (_) {}
  }
  return newRelUploadsPath
}

async function fetchOriginalBuffer(url) {
  const pathname = urlPathname(url) || ''
  // On Render Shell, files live on disk even when CMS URLs are absolute https://…/uploads/…
  if (pathname.startsWith('/uploads/')) {
    const p = diskPathForUrl(pathname)
    if (fs.existsSync(p)) return fs.readFileSync(p)
  }
  if (url.startsWith('/uploads/')) {
    const p = diskPathForUrl(url)
    if (fs.existsSync(p)) return fs.readFileSync(p)
    throw new Error(`Local file missing: ${p}`)
  }
  if (!/^https?:\/\//i.test(url)) {
    throw new Error(`Unsupported URL: ${url}`)
  }
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`)
  return Buffer.from(await res.arrayBuffer())
}

async function storeProcessedBuffer(originalUrl, buffer) {
  const newFilename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-content.webp`
  const pathname = urlPathname(originalUrl) || ''

  if (useS3) {
    let keyDir = 'uploads/media/_platform'
    if (pathname.startsWith('/uploads/')) {
      keyDir = path.dirname(pathname.replace(/^\//, '')).replace(/\\/g, '/')
    }
    const key = `${keyDir}/${newFilename}`
    return uploadBufferToS3(buffer, key, 'image/webp')
  }

  // Local disk (Render): write next to the original under /uploads/...
  if (pathname.startsWith('/uploads/') || originalUrl.startsWith('/uploads/')) {
    const pathForDisk = pathname.startsWith('/uploads/') ? pathname : originalUrl
    const origDir = path.dirname(diskPathForUrl(pathForDisk))
    const newPath = path.join(origDir, newFilename)
    fs.mkdirSync(origDir, { recursive: true })
    fs.writeFileSync(newPath, buffer)
    const relDir = path.posix.dirname(pathForDisk.replace(/^\/uploads\//, ''))
    const newRel = relDir === '.' ? `/uploads/${newFilename}` : `/uploads/${relDir}/${newFilename}`
    return publicUrlAfterStore(originalUrl, newRel)
  }

  throw new Error(
    'Cannot write optimized file: not an /uploads/ URL and S3/R2 is not configured.',
  )
}

/** Finds every candidate image URL in `payload` (any JSON-shaped value — containers array, or a
 * plain { image_url, i18n } badge row), processes each once, and returns the url->newUrl map
 * (empty if DRY_RUN or nothing needed processing). Mutates `summary` in place. */
async function processPayloadImages(payload, rowLabel, summary) {
  const urls = new Set()
  collectImageUrls(payload, urls)
  const urlMap = new Map()
  for (const url of urls) {
    try {
      const original = await fetchOriginalBuffer(url)
      const mimetype = /\.png/i.test(url) ? 'image/png' : 'image/jpeg'
      const processed = await processGenericImageToWebp(original, mimetype)
      if (!processed) {
        summary.imagesSkipped += 1
        continue
      }
      summary.imagesProcessed += 1
      summary.bytesBefore += original.length
      summary.bytesAfter += processed.length
      console.log(`  ${url}`)
      console.log(`    ${(original.length / 1024).toFixed(0)} KB -> ${(processed.length / 1024).toFixed(0)} KB (max edge ${GENERIC_IMAGE_MAX_EDGE}px)`)
      if (!DRY_RUN) {
        const newUrl = await storeProcessedBuffer(url, processed)
        urlMap.set(url, newUrl)
      }
    } catch (e) {
      summary.errors.push(`${rowLabel}: ${url} -> ${e.message}`)
      console.log(`    ERROR: ${e.message}`)
    }
  }
  return urlMap
}

/** Product badges (admin_hub_product_badges) — flat image_url column + optional per-locale
 * i18n.<locale>.image_url overrides. Not covered by the landing-containers pass above, but the
 * exact same 672KB/189KB-raw-PNG problem the PageSpeed audit flagged for badge images. */
async function backfillProductBadges(client, summary) {
  let rows
  try {
    rows = (await client.query(`SELECT id, image_url, i18n FROM admin_hub_product_badges`)).rows
  } catch (e) {
    console.log(`  [admin_hub_product_badges] query failed (table may not exist here): ${e.message}`)
    return
  }
  console.log(`\n[product badges — admin_hub_product_badges] ${rows.length} row(s)`)

  for (const row of rows) {
    summary.rowsScanned += 1
    const payload = { image_url: row.image_url, i18n: row.i18n }
    const urlMap = await processPayloadImages(payload, `admin_hub_product_badges#${row.id}`, summary)
    if (!DRY_RUN && urlMap.size > 0) {
      const rewritten = rewriteImageUrls(payload, urlMap)
      await client.query(
        `UPDATE admin_hub_product_badges SET image_url = $1, i18n = $2 WHERE id = $3`,
        [rewritten.image_url, rewritten.i18n ? JSON.stringify(rewritten.i18n) : null, row.id],
      )
      summary.rowsChanged += 1
    }
  }
}

async function main() {
  if (!DATABASE_URL) {
    console.error('DATABASE_URL not set.')
    process.exit(1)
  }
  console.log(DRY_RUN
    ? 'DRY RUN — no files will be written, no DB rows will change. Pass --apply to actually run.'
    : 'APPLY MODE — this will write new image files and update DB rows.')

  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: DATABASE_URL.includes('render.com') ? { rejectUnauthorized: false } : false,
  })
  await client.connect()

  const summary = { rowsScanned: 0, rowsChanged: 0, imagesProcessed: 0, imagesSkipped: 0, bytesBefore: 0, bytesAfter: 0, errors: [] }

  try {
    for (const { table, idCol, label } of TABLES) {
      let rows
      try {
        rows = (await client.query(`SELECT ${idCol} AS row_id, containers FROM ${table}`)).rows
      } catch (e) {
        console.log(`  [${table}] query failed (table may not exist here): ${e.message}`)
        continue
      }
      console.log(`\n[${label} — ${table}] ${rows.length} row(s)`)

      for (const row of rows) {
        summary.rowsScanned += 1
        const containers = Array.isArray(row.containers) ? row.containers : []
        if (!containers.length) continue

        const urlMap = await processPayloadImages(containers, `${table}#${row.row_id}`, summary)

        if (!DRY_RUN && urlMap.size > 0) {
          const rewritten = rewriteImageUrls(containers, urlMap)
          await client.query(`UPDATE ${table} SET containers = $1 WHERE ${idCol} = $2`, [JSON.stringify(rewritten), row.row_id])
          summary.rowsChanged += 1
        }
      }
    }

    await backfillProductBadges(client, summary)

    console.log('\n--- Summary ---')
    console.log(`Rows scanned:     ${summary.rowsScanned}`)
    console.log(`Rows updated:     ${summary.rowsChanged}${DRY_RUN ? ' (dry run — would update)' : ''}`)
    console.log(`Images processed: ${summary.imagesProcessed}`)
    console.log(`Images skipped:   ${summary.imagesSkipped} (svg/gif/already-optimized)`)
    if (summary.imagesProcessed > 0) {
      const savedMb = (summary.bytesBefore - summary.bytesAfter) / (1024 * 1024)
      const pct = ((1 - summary.bytesAfter / summary.bytesBefore) * 100).toFixed(1)
      console.log(`Size before:      ${(summary.bytesBefore / (1024 * 1024)).toFixed(1)} MB`)
      console.log(`Size after:       ${(summary.bytesAfter / (1024 * 1024)).toFixed(1)} MB`)
      console.log(`Saved:            ${savedMb.toFixed(1)} MB (${pct}%)`)
    }
    if (summary.errors.length) {
      console.log(`\nErrors (${summary.errors.length}):`)
      summary.errors.forEach((e) => console.log(`  ${e}`))
    }
    console.log(DRY_RUN ? '\nDry run complete. Re-run with --apply to write changes.' : '\nDone.')
  } finally {
    await client.end().catch(() => {})
  }
}

main().catch((e) => {
  console.error('Fatal:', e)
  process.exit(1)
})
