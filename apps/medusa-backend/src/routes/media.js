'use strict'
const { Router } = require('express')
const path = require('path')
const fs = require('fs')
const {
  decodeMultipartFilename,
  resolveUploadDisplayFilename,
  storageFilenameWithPrefix,
} = require('../media-filename')

// Uploads: use UPLOAD_DIR for a persistent volume path, or S3 when S3_UPLOAD_* env is set.
// Otherwise <medusa-backend>/uploads (ephemeral on many hosts). See docs/UPLOADS.md.
const uploadDir = process.env.UPLOAD_DIR
  ? path.resolve(process.env.UPLOAD_DIR)
  : path.join(__dirname, '..', '..', 'uploads')
const useS3 = !!(process.env.S3_UPLOAD_BUCKET && process.env.S3_UPLOAD_REGION)

const getDbClient = () => {
  const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
  if (!dbUrl || !dbUrl.startsWith('postgres')) return null
  const { Client } = require('pg')
  const isRender = dbUrl.includes('render.com')
  return new Client({ connectionString: dbUrl, ssl: isRender ? { rejectUnauthorized: false } : false })
}
const FORBIDDEN_FOLDER_CHARS = '<>:"/\\|?*'
const sanitizeSellerMediaFolderSegment = (storeName, sellerId) => {
  const raw = (storeName || '').trim()
  let s = raw
    .split('').filter((ch) => ch.charCodeAt(0) > 31 && !FORBIDDEN_FOLDER_CHARS.includes(ch)).join('')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^_+|_+$/g, '')
  if (!s) {
    const id = String(sellerId || 'seller').replace(/[^a-zA-Z0-9_-]+/g, '_')
    return (id || 'seller').slice(0, 120)
  }
  return s.slice(0, 120)
}
const resolveSellerMediaFolderSegment = async (sellerUser) => {
  if (!sellerUser) return 'unknown'
  if (sellerUser.is_superuser) return '_platform'
  const client = getDbClient()
  if (!client) return sanitizeSellerMediaFolderSegment(sellerUser.store_name || '', sellerUser.seller_id)
  try {
    await client.connect()
    const s1 = await client.query('SELECT store_name FROM admin_hub_seller_settings WHERE seller_id = $1', [sellerUser.seller_id])
    let sn = (s1.rows[0]?.store_name || '').trim()
    if (!sn) {
      const s2 = await client.query(
        'SELECT store_name FROM seller_users WHERE seller_id = $1 LIMIT 1',
        [sellerUser.seller_id]
      )
      sn = (s2.rows[0]?.store_name || '').trim()
    }
    if (!sn) sn = (sellerUser.store_name || '').trim()
    return sanitizeSellerMediaFolderSegment(sn, sellerUser.seller_id)
  } finally {
    await client.end().catch(() => {})
  }
}
const prepareSellerMediaUploadPath = async (req, res, next) => {
  try {
    req._sellerMediaFolderSegment = await resolveSellerMediaFolderSegment(req.sellerUser)
    next()
  } catch (e) {
    console.error('prepareSellerMediaUploadPath:', e)
    next(e)
  }
}
const multer = require('multer')
const uploadStorage = useS3
  ? multer.memoryStorage()
  : multer.diskStorage({
      destination: (req, file, cb) => {
        const seg = req._sellerMediaFolderSegment || '_misc'
        const dest = path.join(uploadDir, 'media', seg)
        try {
          fs.mkdirSync(dest, { recursive: true })
          cb(null, dest)
        } catch (err) {
          cb(err)
        }
      },
      filename: (req, file, cb) => {
        cb(null, storageFilenameWithPrefix(file.originalname || 'file'))
      },
    })
const upload = multer({ storage: uploadStorage })

const mediaRowVisibleToUser = (row, u) => {
  if (!u) return false
  if (u.is_superuser) return true
  const sid = row?.seller_id
  if (sid == null || String(sid).trim() === '') return false
  return String(sid) === String(u.seller_id)
}
const mapMediaRowForApi = (row) => {
  if (!row) return row
  return { ...row, filename: decodeMultipartFilename(row.filename) }
}

/** Product gallery / variant images: min 1000px edge, center square crop, store as WebP (JPEG/PNG in). */
const PRODUCT_IMAGE_MIN_EDGE = 1000
const PRODUCT_IMAGE_OUT_SIZE = 1000
const processProductImageToSquareWebp = async (inputBuffer, mimetype) => {
  const mt = String(mimetype || '').toLowerCase()
  if (mt !== 'image/jpeg' && mt !== 'image/png' && mt !== 'image/jpg') {
    const err = new Error('PRODUCT_IMAGE_TYPE')
    err.code = 'PRODUCT_IMAGE_TYPE'
    throw err
  }
  let sharp
  try {
    sharp = require('sharp')
  } catch (_) {
    const err = new Error('SHARP_UNAVAILABLE')
    err.code = 'SHARP_UNAVAILABLE'
    throw err
  }
  const meta = await sharp(inputBuffer).metadata()
  const w = meta.width || 0
  const h = meta.height || 0
  if (w < PRODUCT_IMAGE_MIN_EDGE || h < PRODUCT_IMAGE_MIN_EDGE) {
    const err = new Error('PRODUCT_IMAGE_MIN_SIZE')
    err.code = 'PRODUCT_IMAGE_MIN_SIZE'
    throw err
  }
  const side = Math.min(w, h)
  const left = Math.floor((w - side) / 2)
  const top = Math.floor((h - side) / 2)
  return sharp(inputBuffer)
    .extract({ left, top, width: side, height: side })
    .resize(PRODUCT_IMAGE_OUT_SIZE, PRODUCT_IMAGE_OUT_SIZE, { fit: 'fill' })
    .webp({ quality: 85 })
    .toBuffer()
}

const mediaUploadPOST = async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'No file uploaded' })
  const client = getDbClient()
  if (!client) return res.status(503).json({ message: 'Database not configured' })
  const mediaSeg = req._sellerMediaFolderSegment || '_misc'
  const purpose = String((req.query && req.query.purpose) || (req.body && req.body.purpose) || '').toLowerCase()
  const isProductImage = purpose === 'product'

  let fileUrl
  let outFilename
  let outMime = req.file.mimetype || null
  let outSize = req.file.size || 0
  let outBuffer = req.file.buffer || null
  let diskPathWritten = null

  if (isProductImage) {
    let inputBuffer = outBuffer
    if (!inputBuffer && req.file.path) {
      try {
        inputBuffer = fs.readFileSync(req.file.path)
      } catch (e) {
        return res.status(400).json({ message: 'Could not read uploaded file' })
      }
    }
    if (!inputBuffer) return res.status(400).json({ message: 'No file data' })
    try {
      outBuffer = await processProductImageToSquareWebp(inputBuffer, req.file.mimetype)
    } catch (pe) {
      if (req.file.path && fs.existsSync(req.file.path)) {
        try { fs.unlinkSync(req.file.path) } catch (_) {}
      }
      if (pe.code === 'PRODUCT_IMAGE_MIN_SIZE') {
        return res.status(400).json({
          message: `Produktbild: mindestens ${PRODUCT_IMAGE_MIN_EDGE}×${PRODUCT_IMAGE_MIN_EDGE} Pixel (JPEG oder PNG).`,
        })
      }
      if (pe.code === 'PRODUCT_IMAGE_TYPE') {
        return res.status(400).json({
          message: 'Produktbild: nur JPEG- oder PNG-Dateien.',
        })
      }
      if (pe.code === 'SHARP_UNAVAILABLE') {
        console.error('sharp module missing; run npm install in medusa-backend')
        return res.status(500).json({ message: 'Bildverarbeitung nicht verfügbar' })
      }
      console.error('processProductImageToSquareWebp:', pe)
      return res.status(500).json({ message: (pe && pe.message) || 'Bildverarbeitung fehlgeschlagen' })
    }
    outMime = 'image/webp'
    outSize = outBuffer.length
    outFilename = `${Date.now()}-product.webp`
    if (req.file.path && fs.existsSync(req.file.path)) {
      try { fs.unlinkSync(req.file.path) } catch (_) {}
    }
    if (useS3 && process.env.S3_UPLOAD_BUCKET) {
      try {
        const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3')
        const bucket = process.env.S3_UPLOAD_BUCKET
        const region = process.env.S3_UPLOAD_REGION || 'eu-central-1'
        const key = `media/${mediaSeg}/${outFilename}`
        const s3 = new S3Client({
          region,
          ...(process.env.S3_UPLOAD_ENDPOINT && { endpoint: process.env.S3_UPLOAD_ENDPOINT }),
          ...(process.env.S3_UPLOAD_ACCESS_KEY_ID && process.env.S3_UPLOAD_SECRET_ACCESS_KEY
            ? { credentials: { accessKeyId: process.env.S3_UPLOAD_ACCESS_KEY_ID, secretAccessKey: process.env.S3_UPLOAD_SECRET_ACCESS_KEY } }
            : {})
        })
        await s3.send(new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: outBuffer,
          ContentType: 'image/webp',
          ...(process.env.S3_UPLOAD_ACL && { ACL: process.env.S3_UPLOAD_ACL })
        }))
        const baseUrl = process.env.S3_UPLOAD_PUBLIC_BASE_URL || `https://${bucket}.s3.${region}.amazonaws.com`
        fileUrl = `${baseUrl.replace(/\/$/, '')}/${key}`
      } catch (s3Err) {
        console.error('S3 upload error (product webp):', s3Err)
        return res.status(500).json({ message: 'Upload to storage failed' })
      }
    } else {
      const destDir = path.join(uploadDir, 'media', mediaSeg)
      try {
        fs.mkdirSync(destDir, { recursive: true })
      } catch (e) {
        return res.status(500).json({ message: 'Could not create upload directory' })
      }
      diskPathWritten = path.join(destDir, outFilename)
      fs.writeFileSync(diskPathWritten, outBuffer)
      fileUrl = `/uploads/media/${mediaSeg}/${outFilename}`
    }
  } else if (useS3 && req.file.buffer && process.env.S3_UPLOAD_BUCKET) {
    try {
      const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3')
      const bucket = process.env.S3_UPLOAD_BUCKET
      const region = process.env.S3_UPLOAD_REGION || 'eu-central-1'
      const key = `media/${mediaSeg}/${storageFilenameWithPrefix(req.file.originalname || 'file')}`
      const s3 = new S3Client({
        region,
        ...(process.env.S3_UPLOAD_ENDPOINT && { endpoint: process.env.S3_UPLOAD_ENDPOINT }),
        ...(process.env.S3_UPLOAD_ACCESS_KEY_ID && process.env.S3_UPLOAD_SECRET_ACCESS_KEY
          ? { credentials: { accessKeyId: process.env.S3_UPLOAD_ACCESS_KEY_ID, secretAccessKey: process.env.S3_UPLOAD_SECRET_ACCESS_KEY } }
          : {})
      })
      await s3.send(new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: req.file.buffer,
        ContentType: req.file.mimetype || 'application/octet-stream',
        ...(process.env.S3_UPLOAD_ACL && { ACL: process.env.S3_UPLOAD_ACL })
      }))
      const baseUrl = process.env.S3_UPLOAD_PUBLIC_BASE_URL || `https://${bucket}.s3.${region}.amazonaws.com`
      fileUrl = `${baseUrl.replace(/\/$/, '')}/${key}`
    } catch (s3Err) {
      console.error('S3 upload error:', s3Err)
      return res.status(500).json({ message: 'Upload to storage failed' })
    }
  } else {
    fileUrl = `/uploads/media/${mediaSeg}/${req.file.filename}`
  }

  const alt = (req.body && req.body.alt) || null
  const folderId = (req.body && req.body.folder_id) || null
  // Every seller_users row — including superuser accounts — has its own real seller_id; a
  // superuser's own upload must be tagged with it too instead of being left NULL/ownerless.
  const uploadSellerId = req.sellerUser?.seller_id || null
  const dbFilename = isProductImage ? outFilename : resolveUploadDisplayFilename(req)
  try {
    await client.connect()
    const r = await client.query(
      `INSERT INTO admin_hub_media (filename, url, mime_type, size, alt, folder_id, seller_id) VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, filename, url, mime_type, size, alt, folder_id, seller_id, created_at`,
      [dbFilename, fileUrl, outMime, outSize, alt, folderId, uploadSellerId]
    )
    const row = mapMediaRowForApi(r.rows[0])
    res.status(201).json({ id: row.id, url: row.url, filename: row.filename, mime_type: row.mime_type, size: row.size, folder_id: row.folder_id, created_at: row.created_at })
  } catch (err) {
    if (diskPathWritten && fs.existsSync(diskPathWritten)) {
      try { fs.unlinkSync(diskPathWritten) } catch (_) {}
    }
    console.error('Media upload error:', err)
    res.status(500).json({ message: (err && err.message) || 'Internal server error' })
  } finally {
    await client.end().catch(() => {})
  }
}
const mediaByIdGET = async (req, res) => {
  const client = getDbClient()
  if (!client) return res.status(503).json({ message: 'Database not configured' })
  try {
    await client.connect()
    const r = await client.query(
      'SELECT id, filename, url, mime_type, size, alt, folder_id, seller_id, created_at, updated_at FROM admin_hub_media WHERE id = $1',
      [req.params.id]
    )
    if (r.rows.length === 0) return res.status(404).json({ message: 'Media not found' })
    if (!mediaRowVisibleToUser(r.rows[0], req.sellerUser)) return res.status(403).json({ message: 'Forbidden' })
    res.json(mapMediaRowForApi(r.rows[0]))
  } catch (err) {
    console.error('Media get error:', err)
    res.status(500).json({ message: (err && err.message) || 'Internal server error' })
  } finally {
    await client.end().catch(() => {})
  }
}
const mediaByIdDELETE = async (req, res) => {
  const client = getDbClient()
  if (!client) return res.status(503).json({ message: 'Database not configured' })
  try {
    await client.connect()
    const r = await client.query('SELECT url, seller_id FROM admin_hub_media WHERE id = $1', [req.params.id])
    if (r.rows.length === 0) return res.status(404).json({ message: 'Media not found' })
    if (!mediaRowVisibleToUser(r.rows[0], req.sellerUser)) return res.status(403).json({ message: 'Forbidden' })
    const urlPath = r.rows[0].url
    await client.query('DELETE FROM admin_hub_media WHERE id = $1', [req.params.id])
    if (urlPath && urlPath.startsWith('/uploads/')) {
      const filePath = path.join(uploadDir, urlPath.replace(/^\/uploads\//, ''))
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
    }
    // S3 URLs are not deleted here; optionally add S3 DeleteObject if needed
    res.status(200).json({ deleted: true })
  } catch (err) {
    console.error('Media delete error:', err)
    res.status(500).json({ message: (err && err.message) || 'Internal server error' })
  } finally {
    await client.end().catch(() => {})
  }
}

// Media folder migrations
const mediaFolderMigrClient = getDbClient()
if (mediaFolderMigrClient) {
  mediaFolderMigrClient.connect().then(async () => {
    await mediaFolderMigrClient.query(`CREATE TABLE IF NOT EXISTS admin_hub_media_folders (
      id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
      name varchar(255) NOT NULL,
      created_at timestamp DEFAULT now()
    )`).catch(() => {})
    await mediaFolderMigrClient.query(`ALTER TABLE admin_hub_media_folders ADD COLUMN IF NOT EXISTS seller_id varchar(255) DEFAULT NULL`).catch(() => {})
    await mediaFolderMigrClient.query(`ALTER TABLE admin_hub_media ADD COLUMN IF NOT EXISTS folder_id uuid REFERENCES admin_hub_media_folders(id) ON DELETE SET NULL`).catch(() => {})
    await mediaFolderMigrClient.query(`ALTER TABLE admin_hub_media ADD COLUMN IF NOT EXISTS source_url text`).catch(() => {}) // for URL-added images
    await mediaFolderMigrClient.query(`ALTER TABLE admin_hub_media ADD COLUMN IF NOT EXISTS seller_id varchar(255)`).catch(() => {})
    await mediaFolderMigrClient.end().catch(() => {})
  }).catch(() => {})
}

// Media folder CRUD
const mediaFoldersGET = async (req, res) => {
  const client = getDbClient()
  if (!client) return res.json({ folders: [] })
  try {
    await client.connect()
    const isSuperuserReq = req.sellerUser?.is_superuser === true
    const callerSellerId = req.sellerUser?.seller_id
    let r
    if (isSuperuserReq) {
      r = await client.query(`SELECT f.*, COUNT(m.id)::int AS media_count, sh.store_name AS seller_store_name
        FROM admin_hub_media_folders f
        LEFT JOIN admin_hub_media m ON m.folder_id = f.id
        LEFT JOIN admin_hub_seller_settings sh ON sh.seller_id = f.seller_id
        GROUP BY f.id, sh.store_name ORDER BY f.seller_id NULLS FIRST, f.name ASC`)
    } else {
      r = await client.query(`SELECT f.*, COUNT(m.id)::int AS media_count, sh.store_name AS seller_store_name
        FROM admin_hub_media_folders f
        LEFT JOIN admin_hub_media m ON m.folder_id = f.id
        LEFT JOIN admin_hub_seller_settings sh ON sh.seller_id = f.seller_id
        WHERE f.seller_id = $1 GROUP BY f.id, sh.store_name ORDER BY f.name ASC`, [callerSellerId])
    }
    res.json({ folders: r.rows })
  } catch { res.json({ folders: [] }) } finally { await client.end().catch(() => {}) }
}
const mediaFoldersPOST = async (req, res) => {
  const { name } = req.body || {}
  if (!name) return res.status(400).json({ message: 'name required' })
  const callerSellerId = req.sellerUser?.seller_id || null
  const client = getDbClient()
  if (!client) return res.status(503).json({ message: 'DB not configured' })
  try {
    await client.connect()
    const r = await client.query('INSERT INTO admin_hub_media_folders (name, seller_id) VALUES ($1, $2) RETURNING *', [name.trim(), callerSellerId])
    res.status(201).json({ folder: r.rows[0] })
  } catch (e) { res.status(500).json({ message: e?.message }) } finally { await client.end().catch(() => {}) }
}
const mediaFolderDELETE = async (req, res) => {
  const client = getDbClient()
  if (!client) return res.status(503).json({ message: 'DB not configured' })
  try {
    await client.connect()
    await client.query('DELETE FROM admin_hub_media_folders WHERE id = $1', [req.params.id])
    res.json({ success: true })
  } catch (e) { res.status(500).json({ message: e?.message }) } finally { await client.end().catch(() => {}) }
}
// Move media to folder / update alt
const mediaPATCH = async (req, res) => {
  const { folder_id, alt } = req.body || {}
  const client = getDbClient()
  if (!client) return res.status(503).json({ message: 'DB not configured' })
  try {
    await client.connect()
    const chk = await client.query('SELECT id, seller_id FROM admin_hub_media WHERE id = $1', [req.params.id])
    if (!chk.rows.length) return res.status(404).json({ message: 'Media not found' })
    if (!mediaRowVisibleToUser(chk.rows[0], req.sellerUser)) return res.status(403).json({ message: 'Forbidden' })
    const sets = []; const params = []
    if (folder_id !== undefined) { params.push(folder_id || null); sets.push(`folder_id = $${params.length}`) }
    if (alt !== undefined) { params.push(alt || null); sets.push(`alt = $${params.length}`) }
    if (!sets.length) return res.status(400).json({ message: 'Nothing to update' })
    sets.push('updated_at = now()')
    params.push(req.params.id)
    await client.query(`UPDATE admin_hub_media SET ${sets.join(', ')} WHERE id = $${params.length}`, params)
    const r = await client.query('SELECT * FROM admin_hub_media WHERE id = $1', [req.params.id])
    res.json({ media: r.rows[0] })
  } catch (e) { res.status(500).json({ message: e?.message }) } finally { await client.end().catch(() => {}) }
}
// Add media by URL
const mediaAddByUrlPOST = async (req, res) => {
  const { url, alt, folder_id, filename } = req.body || {}
  if (!url) return res.status(400).json({ message: 'url required' })
  const client = getDbClient()
  if (!client) return res.status(503).json({ message: 'DB not configured' })
  try {
    await client.connect()
    const name = decodeMultipartFilename(filename || url.split('/').pop()?.split('?')[0] || 'image')
    const urlSellerId = req.sellerUser?.seller_id || null
    const r = await client.query(
      `INSERT INTO admin_hub_media (filename, url, source_url, mime_type, size, alt, folder_id, seller_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [name, url, url, null, 0, alt || null, folder_id || null, urlSellerId]
    )
    res.status(201).json({ media: r.rows[0] })
  } catch (e) { res.status(500).json({ message: e?.message }) } finally { await client.end().catch(() => {}) }
}

// Update mediaListGET to support folder_id filter
const mediaListWithFolderGET = async (req, res) => {
  const client = getDbClient()
  if (!client) return res.status(503).json({ message: 'Database not configured' })
  try {
    await client.connect()
    const limit = Math.min(parseInt(req.query.limit, 10) || 100, 300)
    const offset = parseInt(req.query.offset, 10) || 0
    const folderId = req.query.folder_id || ''
    const search = (req.query.search || '').trim()
    const params = []
    const where = []
    if (folderId === 'none') { where.push('m.folder_id IS NULL') }
    else if (folderId) { params.push(folderId); where.push(`m.folder_id = $${params.length}`) }
    if (search) { params.push(`%${search}%`); where.push(`m.filename ILIKE $${params.length}`) }
    const u = req.sellerUser
    if (u && !u.is_superuser) {
      params.push(u.seller_id)
      where.push(`m.seller_id = $${params.length}`)
    } else if (u?.is_superuser) {
      const filterSid = (req.query.seller_id || '').trim()
      if (filterSid === '__null') {
        where.push('m.seller_id IS NULL')
      } else if (filterSid) {
        params.push(filterSid)
        where.push(`m.seller_id = $${params.length}`)
      }
    }
    const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : ''
    const r = await client.query(
      `SELECT m.id, m.filename, m.url, m.source_url, m.mime_type, m.size, m.alt, m.folder_id, m.seller_id,
        sh.store_name AS seller_store_name,
        f.name AS folder_name, m.created_at
       FROM admin_hub_media m
       LEFT JOIN admin_hub_media_folders f ON f.id = m.folder_id
       LEFT JOIN admin_hub_seller_settings sh ON sh.seller_id = m.seller_id
       ${whereClause} ORDER BY m.created_at DESC LIMIT $${params.length+1} OFFSET $${params.length+2}`,
      [...params, limit, offset]
    )
    const countRes = await client.query(
      `SELECT COUNT(*)::int AS c FROM admin_hub_media m
       LEFT JOIN admin_hub_media_folders f ON f.id = m.folder_id
       LEFT JOIN admin_hub_seller_settings sh ON sh.seller_id = m.seller_id
       ${whereClause}`,
      params
    )
    res.json({ media: r.rows.map(mapMediaRowForApi), count: countRes.rows[0].c })
  } catch (err) {
    console.error('Media list error:', err)
    res.status(500).json({ message: (err && err.message) || 'Internal server error' })
  } finally {
    await client.end().catch(() => {})
  }
}

// Batch-register image URLs from Excel import into seller's media folder
const mediaImportUrlsPOST = async (req, res) => {
  const { urls, folder_name, target_seller_id } = req.body || {}
  if (!Array.isArray(urls) || urls.length === 0) return res.status(400).json({ message: 'urls array required' })
  const client = getDbClient()
  if (!client) return res.status(503).json({ message: 'DB not configured' })
  try {
    await client.connect()
    const u = req.sellerUser
    // Superuser can pass target_seller_id to register images under a specific seller; with no
    // target specified it's their own import, so it should still be tagged with their own real
    // seller_id rather than left ownerless.
    const sellerId = u?.is_superuser
      ? (target_seller_id ? String(target_seller_id).trim() : (u?.seller_id || null))
      : (u?.seller_id || null)
    // Resolve folder: get or create "Excel Import" folder for this seller
    let folderName = (folder_name || '').trim()
    if (!folderName) {
      // Use seller's store name if available
      let storeName = null
      if (sellerId) {
        const sRow = await client.query('SELECT store_name FROM admin_hub_seller_settings WHERE seller_id = $1 LIMIT 1', [sellerId])
        storeName = sRow.rows[0]?.store_name || null
      }
      folderName = storeName ? `${storeName} — Excel Import` : 'Excel Import'
    }
    // Get or create the folder
    let folder = null
    const fCheck = sellerId
      ? await client.query('SELECT * FROM admin_hub_media_folders WHERE name = $1 AND seller_id = $2 LIMIT 1', [folderName, sellerId])
      : await client.query('SELECT * FROM admin_hub_media_folders WHERE name = $1 AND seller_id IS NULL LIMIT 1', [folderName])
    if (fCheck.rows[0]) {
      folder = fCheck.rows[0]
    } else {
      const fIns = await client.query(
        'INSERT INTO admin_hub_media_folders (name, seller_id) VALUES ($1, $2) RETURNING *',
        [folderName, sellerId]
      )
      folder = fIns.rows[0]
    }
    // Register each URL (skip duplicates for this seller)
    let registered = 0, skipped = 0
    for (const rawUrl of urls) {
      const url = (rawUrl || '').trim()
      if (!url || !url.startsWith('http')) { skipped++; continue }
      // Check duplicate
      const dupCheck = sellerId
        ? await client.query('SELECT id FROM admin_hub_media WHERE url = $1 AND seller_id = $2 LIMIT 1', [url, sellerId])
        : await client.query('SELECT id FROM admin_hub_media WHERE url = $1 AND seller_id IS NULL LIMIT 1', [url])
      if (dupCheck.rows[0]) { skipped++; continue }
      const filename = decodeMultipartFilename(url.split('/').pop()?.split('?')[0] || 'image')
      // Detect image mime type from extension
      const ext = (filename.split('.').pop() || '').toLowerCase()
      const mimeMap = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', svg: 'image/svg+xml', avif: 'image/avif' }
      const mimeType = mimeMap[ext] || 'image/jpeg'
      await client.query(
        'INSERT INTO admin_hub_media (filename, url, source_url, mime_type, size, folder_id, seller_id) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [filename, url, url, mimeType, 0, folder.id, sellerId]
      )
      registered++
    }
    res.json({ ok: true, registered, skipped, folder: { id: folder.id, name: folder.name } })
  } catch (e) {
    console.error('mediaImportUrlsPOST error:', e)
    res.status(500).json({ message: e?.message || 'Internal server error' })
  } finally {
    await client.end().catch(() => {})
  }
}

module.exports = function createMediaRouter() {
  const router = Router()

  router.get('/admin-hub/v1/media', mediaListWithFolderGET)
  router.post('/admin-hub/v1/media', prepareSellerMediaUploadPath, upload.single('file'), mediaUploadPOST)
  router.get('/admin-hub/v1/media/folders', mediaFoldersGET)
  router.post('/admin-hub/v1/media/folders', mediaFoldersPOST)
  router.delete('/admin-hub/v1/media/folders/:id', mediaFolderDELETE)
  router.get('/admin-hub/v1/media/:id', mediaByIdGET)
  router.patch('/admin-hub/v1/media/:id', mediaPATCH)
  router.post('/admin-hub/v1/media/add-url', mediaAddByUrlPOST)
  router.post('/admin-hub/v1/media/import-urls', mediaImportUrlsPOST)
  router.delete('/admin-hub/v1/media/:id', mediaByIdDELETE)

  return router
}
