'use strict'

/**
 * Download a remote image URL, normalize (WebP), store on R2/disk — same pipeline as
 * multipart product/content uploads. Used by CSV import (image_url_*) and media/add-url.
 *
 * Guards: timeout, max bytes, redirect limit, skip already-hosted URLs, soft failures.
 */

const path = require('path')
const fs = require('fs')
const { uploadBufferToS3, isS3Configured, publicBaseUrl } = require('./s3-upload')

const FETCH_TIMEOUT_MS = 20000
const MAX_DOWNLOAD_BYTES = 25 * 1024 * 1024
const MAX_REDIRECTS = 5
const USER_AGENT = 'AndertalMediaIngest/1.0 (+https://andertal.com)'

function isAlreadyHostedUrl(url) {
  const u = String(url || '').trim()
  if (!u) return true
  if (u.startsWith('/uploads/')) return true
  const base = publicBaseUrl()
  if (base && u.startsWith(base + '/')) return true
  try {
    const host = new URL(u).hostname.toLowerCase()
    if (host.endsWith('.r2.dev') || host.includes('.r2.cloudflarestorage.com')) return true
    const backend = (process.env.MEDUSA_BACKEND_URL || process.env.BACKEND_URL || '').trim()
    if (backend) {
      try {
        const bh = new URL(backend.startsWith('http') ? backend : `https://${backend}`).hostname.toLowerCase()
        if (bh && host === bh && new URL(u).pathname.startsWith('/uploads/')) return true
      } catch (_) {}
    }
  } catch (_) {}
  return false
}

function sniffMime(buffer, headerMime, url) {
  const h = String(headerMime || '').split(';')[0].trim().toLowerCase()
  if (h.startsWith('image/')) return h
  if (buffer && buffer.length >= 12) {
    if (buffer[0] === 0xff && buffer[1] === 0xd8) return 'image/jpeg'
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return 'image/png'
    if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46
      && buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50) {
      return 'image/webp'
    }
    if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) return 'image/gif'
  }
  const ext = String(url || '').split('?')[0].split('.').pop()?.toLowerCase()
  const map = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' }
  return map[ext] || 'application/octet-stream'
}

async function downloadImageBuffer(url) {
  let current = String(url || '').trim()
  if (!/^https?:\/\//i.test(current)) {
    const err = new Error('INVALID_URL')
    err.code = 'INVALID_URL'
    throw err
  }

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
    let res
    try {
      res = await fetch(current, {
        method: 'GET',
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          Accept: 'image/*,*/*;q=0.8',
          'User-Agent': USER_AGENT,
        },
      })
    } catch (e) {
      clearTimeout(timer)
      const err = new Error(e?.name === 'AbortError' ? 'FETCH_TIMEOUT' : 'FETCH_FAILED')
      err.code = e?.name === 'AbortError' ? 'FETCH_TIMEOUT' : 'FETCH_FAILED'
      err.cause = e
      throw err
    }
    clearTimeout(timer)

    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location')
      if (!loc) {
        const err = new Error('REDIRECT_NO_LOCATION')
        err.code = 'FETCH_FAILED'
        throw err
      }
      current = new URL(loc, current).toString()
      continue
    }

    if (!res.ok) {
      const err = new Error(`HTTP_${res.status}`)
      err.code = 'FETCH_HTTP'
      err.status = res.status
      throw err
    }

    const cl = parseInt(res.headers.get('content-length') || '0', 10)
    if (cl > MAX_DOWNLOAD_BYTES) {
      const err = new Error('IMAGE_TOO_LARGE')
      err.code = 'IMAGE_TOO_LARGE'
      throw err
    }

    const reader = res.body?.getReader?.()
    if (!reader) {
      const ab = Buffer.from(await res.arrayBuffer())
      if (ab.length > MAX_DOWNLOAD_BYTES) {
        const err = new Error('IMAGE_TOO_LARGE')
        err.code = 'IMAGE_TOO_LARGE'
        throw err
      }
      return { buffer: ab, mime: sniffMime(ab, res.headers.get('content-type'), current) }
    }

    const chunks = []
    let total = 0
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > MAX_DOWNLOAD_BYTES) {
        try { reader.cancel() } catch (_) {}
        const err = new Error('IMAGE_TOO_LARGE')
        err.code = 'IMAGE_TOO_LARGE'
        throw err
      }
      chunks.push(Buffer.from(value))
    }
    const buffer = Buffer.concat(chunks)
    return { buffer, mime: sniffMime(buffer, res.headers.get('content-type'), current) }
  }

  const err = new Error('TOO_MANY_REDIRECTS')
  err.code = 'FETCH_FAILED'
  throw err
}

/**
 * @param {object} opts
 * @param {string} opts.sourceUrl
 * @param {string} opts.mediaSeg - seller folder segment under media/
 * @param {string} [opts.purpose='product'] - product | content
 * @param {function} opts.processProductImageToSquareWebp
 * @param {function} opts.processGenericImageToWebp
 * @param {string} opts.uploadDir
 * @returns {Promise<{ url: string, mime: string, size: number, filename: string, source_url: string }>}
 */
async function ingestRemoteImageUrl(opts) {
  const sourceUrl = String(opts.sourceUrl || '').trim()
  if (!sourceUrl) {
    const err = new Error('INVALID_URL')
    err.code = 'INVALID_URL'
    throw err
  }
  if (isAlreadyHostedUrl(sourceUrl)) {
    return {
      url: sourceUrl.startsWith('/uploads/') ? sourceUrl : sourceUrl,
      mime: null,
      size: 0,
      filename: sourceUrl.split('/').pop()?.split('?')[0] || 'image',
      source_url: sourceUrl,
      skipped: true,
      skip_reason: 'already_hosted',
    }
  }

  const { buffer, mime } = await downloadImageBuffer(sourceUrl)
  const purpose = String(opts.purpose || 'product').toLowerCase()
  const mediaSeg = String(opts.mediaSeg || '_misc').slice(0, 120) || '_misc'
  const useS3 = isS3Configured()
  const uploadDir = opts.uploadDir

  let outBuffer = null
  let outMime = 'image/webp'
  let outFilename = `${Date.now()}-import.webp`

  if (purpose === 'product' && typeof opts.processProductImageToSquareWebp === 'function') {
    try {
      outBuffer = await opts.processProductImageToSquareWebp(buffer, mime)
      outFilename = `${Date.now()}-product.webp`
    } catch (pe) {
      // CSV sources are often smaller / already webp — fall back to generic resize.
      if (pe.code === 'PRODUCT_IMAGE_MIN_SIZE' || pe.code === 'PRODUCT_IMAGE_TYPE') {
        outBuffer = null
      } else if (pe.code === 'SHARP_UNAVAILABLE') {
        throw pe
      } else {
        outBuffer = null
      }
    }
  }

  if (!outBuffer && typeof opts.processGenericImageToWebp === 'function') {
    try {
      const processed = await opts.processGenericImageToWebp(buffer, mime)
      if (processed) {
        outBuffer = processed
        outFilename = `${Date.now()}-content.webp`
      }
    } catch (ge) {
      if (ge.code === 'IMAGE_TOO_LARGE') throw ge
      outBuffer = null
    }
  }

  if (!outBuffer) {
    // Last resort: store original bytes (still on our storage, not hotlinked).
    outBuffer = buffer
    outMime = mime && mime.startsWith('image/') ? mime : 'application/octet-stream'
    const ext = outMime === 'image/jpeg' ? 'jpg' : outMime === 'image/png' ? 'png' : outMime === 'image/webp' ? 'webp' : 'bin'
    outFilename = `${Date.now()}-import.${ext}`
  }

  let fileUrl
  const key = `media/${mediaSeg}/${outFilename}`
  if (useS3) {
    fileUrl = await uploadBufferToS3(outBuffer, key, outMime)
  } else {
    const destDir = path.join(uploadDir, 'media', mediaSeg)
    fs.mkdirSync(destDir, { recursive: true })
    fs.writeFileSync(path.join(destDir, outFilename), outBuffer)
    fileUrl = `/uploads/media/${mediaSeg}/${outFilename}`
  }

  return {
    url: fileUrl,
    mime: outMime,
    size: outBuffer.length,
    filename: outFilename,
    source_url: sourceUrl,
    skipped: false,
  }
}

/** Run async work over items with a concurrency limit. */
async function mapPool(items, concurrency, fn) {
  const results = new Array(items.length)
  let next = 0
  const workers = Array.from({ length: Math.max(1, concurrency) }, async () => {
    while (next < items.length) {
      const i = next++
      results[i] = await fn(items[i], i)
    }
  })
  await Promise.all(workers)
  return results
}

module.exports = {
  isAlreadyHostedUrl,
  downloadImageBuffer,
  ingestRemoteImageUrl,
  mapPool,
  FETCH_TIMEOUT_MS,
  MAX_DOWNLOAD_BYTES,
}
