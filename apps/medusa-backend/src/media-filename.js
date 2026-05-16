/**
 * Multipart upload filenames: fix UTF-8 mojibake (weiß → WeiÃ) and keep Unicode in display names.
 */

const PATH_UNSAFE = /[\u0000-\u001f<>:"/\\|?*]/g

/** Multer/busboy often exposes UTF-8 bytes as a Latin-1 string (Ã, Â, etc.). */
function fixUtf8Mojibake(str) {
  if (!str || typeof str !== 'string') return ''
  if (!/[\u0080-\u00ff]/.test(str)) return str
  try {
    const repaired = Buffer.from(str, 'latin1').toString('utf8')
    if (repaired && !repaired.includes('\uFFFD') && repaired !== str) {
      return repaired
    }
  } catch (_) {}
  return str
}

/**
 * @param {string} input
 * @returns {string} basename, NFC, UTF-8 corrected
 */
function decodeMultipartFilename(input) {
  let name = String(input ?? '').trim()
  if (!name) return 'file'
  try {
    if (/%[0-9a-fA-F]{2}/.test(name)) {
      name = decodeURIComponent(name.replace(/\+/g, ' '))
    }
  } catch (_) {}
  name = fixUtf8Mojibake(name)
  name = name.replace(/^.*[/\\]/, '').replace(/\0/g, '')
  if (!name || name === '.' || name === '..') return 'file'
  return name.normalize('NFC')
}

/** Safe on-disk / S3 segment — keeps letters in all scripts, strips path chars only. */
function sanitizeStorageBasename(name) {
  const base = decodeMultipartFilename(name)
  let s = base.replace(PATH_UNSAFE, '_').replace(/\s+/g, ' ').trim()
  if (!s || s === '.' || s === '..') s = 'file'
  return s.slice(0, 200)
}

function storageFilenameWithPrefix(name) {
  return `${Date.now()}-${sanitizeStorageBasename(name)}`
}

/**
 * Prefer explicit UTF-8 field from client (FormData), then multer originalname.
 * @param {import('express').Request} req
 */
function resolveUploadDisplayFilename(req) {
  const body = req.body && typeof req.body === 'object' ? req.body : {}
  const explicit =
    body.display_filename ||
    body.filename_utf8 ||
    body.original_filename
  if (explicit) return decodeMultipartFilename(explicit)
  const file = req.file
  return decodeMultipartFilename(file?.originalname || file?.filename || 'file')
}

module.exports = {
  decodeMultipartFilename,
  fixUtf8Mojibake,
  sanitizeStorageBasename,
  storageFilenameWithPrefix,
  resolveUploadDisplayFilename,
}
