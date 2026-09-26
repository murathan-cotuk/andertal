'use strict'

/**
 * Shared S3/R2 upload helper.
 * Cloudflare R2 needs a custom endpoint + forcePathStyle.
 * Env (see docs/CloudflareKurulum.md):
 *   S3_UPLOAD_BUCKET, S3_UPLOAD_REGION (use "auto" for R2),
 *   S3_UPLOAD_ENDPOINT, S3_UPLOAD_ACCESS_KEY_ID, S3_UPLOAD_SECRET_ACCESS_KEY,
 *   S3_UPLOAD_PUBLIC_BASE_URL, optional S3_UPLOAD_ACL
 */

function isS3Configured() {
  return !!(process.env.S3_UPLOAD_BUCKET && process.env.S3_UPLOAD_REGION)
}

function publicBaseUrl() {
  if (!isS3Configured()) return null
  const bucket = process.env.S3_UPLOAD_BUCKET
  const region = process.env.S3_UPLOAD_REGION || 'auto'
  return String(
    process.env.S3_UPLOAD_PUBLIC_BASE_URL || `https://${bucket}.s3.${region}.amazonaws.com`
  ).replace(/\/$/, '')
}

function createS3Client() {
  const { S3Client } = require('@aws-sdk/client-s3')
  const region = process.env.S3_UPLOAD_REGION || 'auto'
  const endpoint = (process.env.S3_UPLOAD_ENDPOINT || '').trim()
  return new S3Client({
    region,
    ...(endpoint ? { endpoint, forcePathStyle: true } : {}),
    ...(process.env.S3_UPLOAD_ACCESS_KEY_ID && process.env.S3_UPLOAD_SECRET_ACCESS_KEY
      ? {
          credentials: {
            accessKeyId: process.env.S3_UPLOAD_ACCESS_KEY_ID,
            secretAccessKey: process.env.S3_UPLOAD_SECRET_ACCESS_KEY,
          },
        }
      : {}),
  })
}

/**
 * @param {Buffer} buffer
 * @param {string} key - object key without leading slash (e.g. "media/shop/x.webp")
 * @param {string} contentType
 * @returns {Promise<string>} public absolute URL
 */
async function uploadBufferToS3(buffer, key, contentType) {
  if (!isS3Configured()) {
    throw new Error('S3_UPLOAD_BUCKET / S3_UPLOAD_REGION not configured')
  }
  const { PutObjectCommand } = require('@aws-sdk/client-s3')
  const bucket = process.env.S3_UPLOAD_BUCKET
  const normalizedKey = String(key || '').replace(/^\/+/, '')
  const s3 = createS3Client()
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: normalizedKey,
      Body: buffer,
      ContentType: contentType || 'application/octet-stream',
      CacheControl: 'public, max-age=31536000, immutable',
      ...(process.env.S3_UPLOAD_ACL ? { ACL: process.env.S3_UPLOAD_ACL } : {}),
    })
  )
  const base = publicBaseUrl()
  return `${base}/${normalizedKey}`
}

/**
 * Map a site-relative /uploads/... path to the public object URL (R2/S3).
 * Disk paths are /uploads/media/...; R2 keys are media/... (no "uploads" segment).
 */
function publicUrlForUploadsPath(uploadsPath) {
  const base = publicBaseUrl()
  if (!base || !uploadsPath) return null
  let p = String(uploadsPath).trim()
  if (!p) return null
  try {
    if (p.startsWith('http://') || p.startsWith('https://') || p.startsWith('//')) {
      const abs = p.startsWith('//') ? `https:${p}` : p
      p = new URL(abs).pathname
    }
  } catch (_) {
    return null
  }
  p = p.replace(/^\/+/, '')
  if (p.startsWith('uploads/')) p = p.slice('uploads/'.length)
  return `${base}/${p}`
}

module.exports = {
  isS3Configured,
  publicBaseUrl,
  createS3Client,
  uploadBufferToS3,
  publicUrlForUploadsPath,
}
