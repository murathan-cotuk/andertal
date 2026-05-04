/**
 * Medusa v2 Backend Server
 * dotenv + MedusaAppLoader + app.load() + listen + graceful shutdown.
 * Render: Start Command = node server.js
 * Custom API routes: src/api (Medusa v2 discovers them from here when ts-node is registered).
 */
require('dotenv').config()
try {
  require('dotenv').config({ path: '.env.local' })
} catch (e) {}

// TypeScript API routes (src/api) yüklenebilsin
try {
  require('ts-node/register')
} catch (_) {}

const path = require('path')
const fs = require('fs')
const { runAutomationFlowsForOrder } = require('./src/flow-automation')
const { resolveSmtpSenderIdentity } = require('./src/smtp-sender-resolve')
const { renderInvoicePdfDocument } = require('./src/order-pdf-buffers')
const { resolveOrderPaidTotalCents } = require('./src/order-money')

let backendLinkModulesPath
try {
  backendLinkModulesPath = require.resolve('@medusajs/link-modules', { paths: [__dirname] })
} catch (_) {
  const distIndex = path.resolve(__dirname, 'node_modules', '@medusajs', 'link-modules', 'dist', 'index.js')
  if (fs.existsSync(distIndex)) {
    backendLinkModulesPath = distIndex
  } else {
    const pkgDir = path.join(__dirname, 'node_modules', '@medusajs', 'link-modules')
    const pkgPath = path.join(pkgDir, 'package.json')
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
        const main = pkg.main || pkg.module || 'dist/index.js'
        const candidate = path.resolve(pkgDir, main)
        if (fs.existsSync(candidate)) backendLinkModulesPath = candidate
      } catch (__) {}
    }
  }
  if (typeof backendLinkModulesPath === 'undefined') backendLinkModulesPath = null
}

// Require hook: @medusajs/medusa/link-modules -> { discoveryPath } (framework bu path'i yükleyip resources doldurur)
const Module = require('module')
const origRequire = Module.prototype.require
const patchedRequire = function (id) {
  if (id === '@medusajs/medusa/link-modules') {
    if (backendLinkModulesPath) {
      return { discoveryPath: backendLinkModulesPath }
    }
    return origRequire.call(this, '@medusajs/link-modules')
  }
  return origRequire.apply(this, arguments)
}
patchedRequire.resolve = function (id, options) {
  if (id === '@medusajs/medusa/link-modules') {
    if (backendLinkModulesPath) return backendLinkModulesPath
    return origRequire.resolve.call(this, '@medusajs/link-modules', options)
  }
  return origRequire.resolve.apply(this, arguments)
}
Module.prototype.require = patchedRequire

// Runtime patch: tüm kopyalara da yaz (yazılabiliyorsa); hook yoksa yedek
const linkContent = "module.exports = require('@medusajs/link-modules')\n"

function collectNodeModulesRoots(startDir, maxDepth = 15) {
  const roots = new Set()
  let dir = path.resolve(startDir)
  let depth = 0
  while (dir && depth < maxDepth) {
    const nm = path.join(dir, 'node_modules')
    if (fs.existsSync(nm)) roots.add(dir)
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
    depth++
  }
  return roots
}

function findMedusaInNodeModules(nodeModulesPath, found, depth = 0) {
  if (depth > 8) return
  try {
    const names = fs.readdirSync(nodeModulesPath, { withFileTypes: true })
    const atMedusa = path.join(nodeModulesPath, '@medusajs', 'medusa')
    if (fs.existsSync(atMedusa)) found.add(atMedusa)
    for (const e of names) {
      if (e.isDirectory() && e.name === 'node_modules') {
        findMedusaInNodeModules(path.join(nodeModulesPath, e.name), found, depth + 1)
      } else if (e.isDirectory() && !e.name.startsWith('.')) {
        const sub = path.join(nodeModulesPath, e.name)
        const subNm = path.join(sub, 'node_modules')
        if (fs.existsSync(subNm)) findMedusaInNodeModules(subNm, found, depth + 1)
      }
    }
  } catch (_) {}
}

const roots = new Set([
  ...collectNodeModulesRoots(__dirname),
  ...collectNodeModulesRoots(process.cwd())
])
const repoRoot = path.resolve(__dirname, '..', '..')
if (fs.existsSync(path.join(repoRoot, 'node_modules'))) roots.add(repoRoot)

const allMedusaDirs = new Set()
for (const root of roots) {
  const nm = path.join(root, 'node_modules')
  findMedusaInNodeModules(nm, allMedusaDirs)
}

let patchApplied = false
for (const medusaDir of allMedusaDirs) {
  try {
    fs.writeFileSync(path.join(medusaDir, 'link-modules.js'), linkContent)
    const pkgPath = path.join(medusaDir, 'package.json')
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
    if (!pkg.exports) pkg.exports = {}
    if (typeof pkg.exports === 'object' && !Array.isArray(pkg.exports)) {
      pkg.exports['./link-modules'] = './link-modules.js'
      fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2))
    }
    log.info('link-modules patch applied at:', medusaDir)
    patchApplied = true
  } catch (e) {
    console.warn('link-modules runtime patch skipped:', medusaDir, e.message)
  }
}
if (!patchApplied) {
  try {
    require.resolve('@medusajs/medusa/link-modules')
    patchApplied = true
  } catch (_) {}
}
if (!patchApplied) {
  console.error('link-modules: no @medusajs/medusa found or all patches failed. Render: Root Directory = apps/medusa-backend, Build = npm install, Start = npm run start')
  process.exit(1)
}

const { MedusaAppLoader, configLoader, pgConnectionLoader, container } = require('@medusajs/framework')
const { logger } = require('@medusajs/framework/logger')
const { asValue } = require('@medusajs/framework/awilix')
const { ContainerRegistrationKeys } = require('@medusajs/utils')
const express = require('express')
const cors = require('cors')
const rateLimit = require('express-rate-limit')

const PORT = process.env.PORT || 9000
const HOST = process.env.HOST || '0.0.0.0'

// ── Centralized logger ────────────────────────────────────────────────────────
// info  → suppressed in production (dev/debug noise)
// warn  → always shown (recoverable issues worth knowing)
// error → always shown (failures that need attention)
const _isProd = process.env.NODE_ENV === 'production'
const log = {
  info:  (...a) => { if (!_isProd) console.log(...a) },
  warn:  (...a) => console.warn(...a),
  error: (...a) => console.error(...a),
}

// ── Zod validation helper ─────────────────────────────────────────────────────
// Usage: const parsed = validate(MySchema, req.body, res)
//        if (!parsed) return   ← res already sent with 400
const { z } = require('zod')
function validate(schema, body, res) {
  const result = schema.safeParse(body)
  if (!result.success) {
    const first = result.error.errors[0]
    const msg = first ? `${first.path.join('.') || 'field'}: ${first.message}` : 'Invalid input'
    res.status(400).json({ message: msg })
    return null
  }
  return result.data
}

// Common field schemas reused across multiple endpoints
const zEmail    = z.string().email('Invalid email address').max(254)
const zPassword = z.string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[a-zA-Z]/, 'Password must contain at least one letter')
  .regex(/[0-9]/, 'Password must contain at least one number')
const zUrl      = z.string().url('Invalid URL').or(z.literal('')).optional()

// ── TOTP secret encryption (AES-256-GCM) ─────────────────────────────────────
// Env: TOTP_ENCRYPTION_KEY — exactly 64 hex chars (32 bytes).
// REQUIRED in all environments — no fallback. Generate with:
//   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
if (!process.env.TOTP_ENCRYPTION_KEY) {
  throw new Error('TOTP_ENCRYPTION_KEY is required. Generate with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"')
}
if (process.env.TOTP_ENCRYPTION_KEY.length !== 64) {
  throw new Error('TOTP_ENCRYPTION_KEY must be exactly 64 hex chars (32 bytes)')
}
const _totpKeyBuf = Buffer.from(process.env.TOTP_ENCRYPTION_KEY, 'hex')

/**
 * Encrypt a TOTP base32 secret for storage.
 * Returns: "enc:<iv_hex>:<authTag_hex>:<ciphertext_hex>"
 */
function encryptTotp(plaintext) {
  const crypto = require('crypto')
  const iv     = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', _totpKeyBuf, iv)
  const enc    = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag    = cipher.getAuthTag()
  return `enc:${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`
}

/**
 * Decrypt a stored TOTP secret.
 * Backward-compat: if value doesn't start with "enc:", return as-is (legacy plain secrets).
 * Returns null on decryption failure (invalid key or tampered data).
 */
function decryptTotp(stored) {
  if (!stored || !stored.startsWith('enc:')) return stored // legacy plaintext — pass through
  const crypto = require('crypto')
  const parts  = stored.split(':')
  if (parts.length !== 4) return stored // malformed — pass through
  const [, ivHex, tagHex, ctHex] = parts
  try {
    const iv       = Buffer.from(ivHex, 'hex')
    const tag      = Buffer.from(tagHex, 'hex')
    const ct       = Buffer.from(ctHex, 'hex')
    const decipher = crypto.createDecipheriv('aes-256-gcm', _totpKeyBuf, iv)
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8')
  } catch (e) {
    console.error('TOTP decrypt failed:', e.message)
    return null
  }
}

// ── Production security check (startup) ───────────────────────────────────────
if (process.env.NODE_ENV === 'production') {
  const missing = []
  if (!process.env.SELLER_JWT_SECRET && !process.env.JWT_SECRET) missing.push('SELLER_JWT_SECRET')
  if (!process.env.CUSTOMER_JWT_SECRET && !process.env.JWT_SECRET) missing.push('CUSTOMER_JWT_SECRET')
  if (!process.env.DATABASE_URL) missing.push('DATABASE_URL')
  if (missing.length) {
    console.error(`[SECURITY] Missing required environment variables in production: ${missing.join(', ')}`)
    console.error('[SECURITY] Server startup aborted. Set these variables in your deployment environment.')
    process.exit(1)
  }
}

// CORS: Vercel/Render'da frontend origin'leri env ile verin (virgülle ayrılmış).
// Örnek: CORS_ORIGINS=https://andertal-sellercentral.vercel.app,https://andertal-shop.vercel.app
// Production'da CORS_ORIGINS ayarlanmazsa yalnızca localhost'a izin verilir — "herkese aç" bırakılmaz.
function getAllowedOrigins() {
  const isProduction = process.env.NODE_ENV === 'production'
  const env = process.env.CORS_ORIGINS || process.env.ALLOWED_ORIGINS
  if (env) {
    return env.split(',').map((o) => o.trim()).filter(Boolean)
  }
  const store = (process.env.STORE_CORS || '').split(',').map((o) => o.trim()).filter(Boolean)
  const admin = (process.env.ADMIN_CORS || '').split(',').map((o) => o.trim()).filter(Boolean)
  const combined = [...new Set([...store, ...admin])]
  if (combined.length) return combined
  if (isProduction) {
    // Production'da hiçbir env tanımlanmamışsa: CORS'u kapat, boş liste = herkesi reddet
    console.warn('[SECURITY] CORS_ORIGINS env var is not set in production! All cross-origin requests will be blocked. Set CORS_ORIGINS to allow your frontend domains.')
    return []
  }
  return ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:3002']
}

async function start() {
  try {
    log.info('\n🚀 Medusa v2 backend başlatılıyor...\n')
    await configLoader(path.resolve(__dirname), 'medusa-config')
    await pgConnectionLoader()
    if (!container.hasRegistration(ContainerRegistrationKeys.LOGGER)) {
      container.register(ContainerRegistrationKeys.LOGGER, asValue(logger))
    }

    const app = express()
    const jsonBodyLimit = process.env.JSON_BODY_LIMIT || '10mb'
    // Preserve raw Buffer on req.rawBody for Stripe webhook signature verification.
    // express.json() still parses normally; webhook handler reads req.rawBody instead of req.body.
    app.use(express.json({
      limit: jsonBodyLimit,
      verify: (req, _res, buf) => { req.rawBody = buf },
    }))
    app.use(express.urlencoded({ extended: true, limit: jsonBodyLimit }))
    const allowedOrigins = getAllowedOrigins()
    log.info('CORS allowed origins:', allowedOrigins.length ? allowedOrigins.join(', ') : '(localhost only — set CORS_ORIGINS in production)')
    app.use(cors({
      origin: (origin, cb) => {
        if (!origin) return cb(null, true) // same-origin / server-to-server / Postman
        // Geliştirme ortamında localhost her zaman kabul edilir
        if (/^https?:\/\/localhost(:\d+)?$/.test(origin)) return cb(null, true)
        if (allowedOrigins.includes(origin)) return cb(null, true)
        return cb(null, false)
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'sentry-trace', 'baggage', 'sentry-baggage'],
    }))
    // ── Rate limiting — per-endpoint granular limits ──────────────────────────
    const _rl = (opts) => rateLimit({ standardHeaders: 'draft-7', legacyHeaders: false, ...opts })

    // General catch-all — high ceiling, just prevents floods
    const generalLimiter = _rl({
      windowMs: 60 * 1000,
      max: 300,
      skip: (req) => req.path === '/health',
    })

    // Seller login — 10 attempts per 15 min; only failed requests count
    const authLimiter = _rl({
      windowMs: 15 * 60 * 1000,
      max: 10,
      skipSuccessfulRequests: true,
      message: { error: 'Too many login attempts. Please try again in 15 minutes.' },
    })

    // New account registrations — 5 per hour per IP
    const registerLimiter = _rl({
      windowMs: 60 * 60 * 1000,
      max: 5,
      skipSuccessfulRequests: true,
      message: { error: 'Too many registration attempts. Please try again later.' },
    })

    // Customer login (/store/auth/token) — 15 attempts per 15 min
    const customerAuthLimiter = _rl({
      windowMs: 15 * 60 * 1000,
      max: 15,
      skipSuccessfulRequests: true,
      message: { error: 'Too many login attempts. Please try again in 15 minutes.' },
    })

    // 2FA endpoints — TOTP has 1 000 000 combinations; tight window is the only defense
    const totpLimiter = _rl({
      windowMs: 15 * 60 * 1000,
      max: 5,
      skipSuccessfulRequests: true,
      message: { error: 'Too many 2FA attempts. Please try again in 15 minutes.' },
    })

    // Password change — 5 per hour
    const passwordChangeLimiter = _rl({
      windowMs: 60 * 60 * 1000,
      max: 5,
      skipSuccessfulRequests: true,
      message: { error: 'Too many password change attempts. Please try again later.' },
    })

    // Payment intent creation — 10 per minute
    const paymentLimiter = _rl({
      windowMs: 60 * 1000,
      max: 10,
      message: { error: 'Too many payment requests. Please slow down.' },
    })

    app.use(generalLimiter)
    app.use('/admin-hub/auth/login',           authLimiter)
    app.use('/admin-hub/auth/register',        registerLimiter)
    app.use('/admin-hub/auth/2fa/setup',       totpLimiter)
    app.use('/admin-hub/auth/2fa/verify',      totpLimiter)
    app.use('/admin-hub/auth/2fa/disable',     totpLimiter)
    app.use('/admin-hub/v1/seller/password',   passwordChangeLimiter)
    app.use('/store/customers',                registerLimiter)   // customer register
    app.use('/store/auth/token',               customerAuthLimiter)
    app.use('/store/payment-intent',           paymentLimiter)

    // ── DB connection helper ─────────────────────────────────────────────────
    // Wraps connect → fn(client) → end in a guaranteed finally so connections
    // are always released even on early returns or thrown errors.
    // Usage: const result = await withClient(getSellerDbClient, async (client) => { ... })
    async function withClient(getClient, fn) {
      const client = getClient()
      if (!client) throw Object.assign(new Error('Database not configured'), { status: 503 })
      await client.connect()
      try {
        return await fn(client)
      } finally {
        await client.end().catch(() => {})
      }
    }

    // ── Password strength validation ──────────────────────────────────────────
    // Returns an error string if the password is too weak, or null if it's ok.
    // Rules: min 8 chars, at least 1 letter, at least 1 digit.
    function validatePasswordStrength(password) {
      if (!password || typeof password !== 'string') return 'Password is required.'
      if (password.length < 8) return 'Password must be at least 8 characters.'
      if (!/[a-zA-Z]/.test(password)) return 'Password must contain at least one letter.'
      if (!/[0-9]/.test(password)) return 'Password must contain at least one number.'
      return null
    }

    // ── Seller registration email notification ────────────────────────────────
    // Sends an email to every SUPERUSER_EMAILS address when a new seller registers.
    // Requires SMTP_HOST (and optionally SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM).
    // If SMTP is not configured the function silently skips — registration still works.
    async function notifySuperusersNewSeller({ email, store_name, seller_id, first_name, last_name }) {
      if (!process.env.SMTP_HOST) return // SMTP not configured — skip silently
      const superuserEmails = (process.env.SUPERUSER_EMAILS || '').split(',').map(e => e.trim()).filter(Boolean)
      if (!superuserEmails.length) return
      const nodemailer = require('nodemailer')
      const transport = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: process.env.SMTP_SECURE === 'true',
        auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
      })
      const sellerCentralUrl = process.env.SELLER_CENTRAL_URL || 'https://andertal-sellercentral.vercel.app'
      const displayName = [first_name, last_name].filter(Boolean).join(' ') || email
      const subject = `Neuer Seller registriert: ${store_name || email}`
      const html = `
<div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;color:#1f2937">
  <div style="font-size:22px;font-weight:900;letter-spacing:0.14em;color:#111;margin-bottom:24px">ANDERTAL</div>
  <h2 style="font-size:17px;font-weight:700;margin:0 0 16px">Neuer Seller registriert</h2>
  <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:24px">
    <tr><td style="padding:7px 0;color:#6b7280;width:120px">Name</td><td style="padding:7px 0;font-weight:500">${displayName}</td></tr>
    <tr><td style="padding:7px 0;color:#6b7280">E-Mail</td><td style="padding:7px 0">${email}</td></tr>
    <tr><td style="padding:7px 0;color:#6b7280">Shop-Name</td><td style="padding:7px 0">${store_name || '—'}</td></tr>
    <tr><td style="padding:7px 0;color:#6b7280">Seller ID</td><td style="padding:7px 0;font-family:monospace;font-size:12px">${seller_id}</td></tr>
    <tr><td style="padding:7px 0;color:#6b7280">Registriert</td><td style="padding:7px 0">${new Date().toLocaleString('de-DE', { timeZone: 'Europe/Berlin' })}</td></tr>
  </table>
  <a href="${sellerCentralUrl}/de/settings/users-permissions"
     style="display:inline-block;padding:11px 22px;background:#ff971c;color:#fff;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px">
    Seller freischalten →
  </a>
  <p style="margin-top:24px;font-size:12px;color:#9ca3af">Diese E-Mail wurde automatisch generiert.</p>
</div>`
      await transport.sendMail({
        from: process.env.SMTP_FROM || '"Andertal Sellercentral" <noreply@andertal.de>',
        to: superuserEmails.join(', '),
        subject,
        html,
        text: `Neuer Seller registriert\n\nName: ${displayName}\nE-Mail: ${email}\nShop: ${store_name || '—'}\nSeller ID: ${seller_id}\n\nFreischalten: ${sellerCentralUrl}/de/settings/users-permissions`,
      })
      log.info(`[notify] Seller registration email sent to ${superuserEmails.join(', ')}`)
    }

    // Root ve health: "Cannot GET /" yerine JSON döner
    app.get('/', (req, res) => {
      res.json({ ok: true, service: 'medusa-backend', timestamp: new Date().toISOString() })
    })
    app.get('/health', (req, res) => {
      res.json({ status: 'ok', timestamp: new Date().toISOString() })
    })
    // Uploads: use UPLOAD_DIR for a persistent volume path, or S3 when S3_UPLOAD_* env is set.
    // Otherwise __dirname/uploads (ephemeral on many hosts). See docs/UPLOADS.md.
    const uploadDir = process.env.UPLOAD_DIR
      ? path.resolve(process.env.UPLOAD_DIR)
      : path.join(__dirname, 'uploads')
    const useS3 = !!(process.env.S3_UPLOAD_BUCKET && process.env.S3_UPLOAD_REGION)
    if (!useS3) {
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true })
      }
      app.use('/uploads', express.static(uploadDir))
    }
    const appLoader = new MedusaAppLoader({ cwd: path.resolve(__dirname) })

    let medusaApp
    try {
      medusaApp = await appLoader.load()
    } catch (loadErr) {
      console.error('\n❌ app.load() failed:', loadErr.code || loadErr.name, loadErr.message)
      if (loadErr.stack) console.error(loadErr.stack)
      process.exit(1)
    }

    const { expressLoader } = require('@medusajs/framework/http')
    const { app: httpApp } = await expressLoader({ app, container })

    // Helper: resolve relative upload URLs to absolute using the current server URL.
    // Old uploads stored as absolute localhost URLs are returned as-is; new uploads
    // stored as relative paths (/uploads/...) get the current SERVER_URL prepended.
    const CURRENT_SERVER_URL = (process.env.SERVER_URL || `http://localhost:${PORT}`).replace(/\/$/, '')
    /** Accepts string, { url }, { src }, { path }, or other primitives; avoids url.startsType errors. */
    const resolveUploadUrl = (url) => {
      if (url == null || url === '') return null
      if (typeof url === 'object' && url !== null) {
        const nested = url.url != null ? url.url : url.src != null ? url.src : url.path != null ? url.path : null
        if (nested != null && nested !== url) return resolveUploadUrl(nested)
        return null
      }
      const s = typeof url === 'string' ? url : String(url)
      const t = s.trim()
      if (!t) return null
      // Handle JSON-array-encoded URLs: '["https://..."]' stored by old media picker bug
      if (t.startsWith('[')) {
        try {
          const arr = JSON.parse(t)
          if (Array.isArray(arr) && arr[0]) return resolveUploadUrl(arr[0])
        } catch (_) {}
        return null
      }
      if (t.startsWith('http') || t.startsWith('//')) return t
      return `${CURRENT_SERVER_URL}${t.startsWith('/') ? '' : '/'}${t}`
    }

    // Explicit OPTIONS preflight handler on httpApp so Medusa's own CORS does not
    // override the custom allowed headers (sentry-trace, baggage etc.) for all routes.
    const ALLOWED_HEADERS = 'Content-Type,Authorization,sentry-trace,baggage,sentry-baggage'
    httpApp.options('*', (req, res) => {
      const origin = req.headers.origin
      const allowAllOrigins = getAllowedOrigins() === null
      const allowed = allowAllOrigins || !origin || /^https?:\/\/localhost(:\d+)?$/.test(origin) || (getAllowedOrigins() || []).includes(origin)
      if (origin && allowed) res.setHeader('Access-Control-Allow-Origin', origin)
      else if (!origin) res.setHeader('Access-Control-Allow-Origin', '*')
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS')
      res.setHeader('Access-Control-Allow-Headers', ALLOWED_HEADERS)
      res.setHeader('Access-Control-Allow-Credentials', 'true')
      res.setHeader('Access-Control-Max-Age', '86400')
      res.status(204).end()
    })

    // Admin Hub tabloları yoksa oluştur (menüs/categories deploy sonrası çalışsın diye)
    const DATABASE_URL = process.env.DATABASE_URL || ''
    if (DATABASE_URL && DATABASE_URL.startsWith('postgres')) {
      try {
        const { Client } = require('pg')
        const dbUrl = DATABASE_URL.replace(/^postgresql:\/\//, 'postgres://')
        const isRender = dbUrl.includes('render.com')
        const client = new Client({ connectionString: dbUrl, ssl: isRender ? { rejectUnauthorized: false } : false })
        await client.connect()
        await client.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";')
        await client.query(`
          CREATE TABLE IF NOT EXISTS admin_hub_menus (
            id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
            name varchar(100) NOT NULL,
            slug varchar(100) NOT NULL UNIQUE,
            location varchar(50) DEFAULT 'main',
            categories_with_products boolean DEFAULT false,
            created_at timestamp DEFAULT now(),
            updated_at timestamp DEFAULT now()
          );
        `)
        await client.query(`
          CREATE TABLE IF NOT EXISTS admin_hub_menu_items (
            id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
            menu_id uuid NOT NULL REFERENCES admin_hub_menus(id) ON DELETE CASCADE,
            label varchar(255) NOT NULL,
            slug varchar(255),
            link_type varchar(50) DEFAULT 'url',
            link_value text,
            parent_id uuid REFERENCES admin_hub_menu_items(id) ON DELETE CASCADE,
            sort_order integer DEFAULT 0,
            created_at timestamp DEFAULT now(),
            updated_at timestamp DEFAULT now()
          );
        `)
        await client.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_hub_menus_slug ON admin_hub_menus(slug);')
        try {
          await client.query('ALTER TABLE admin_hub_menus ADD COLUMN IF NOT EXISTS location varchar(50) DEFAULT \'main\';')
        } catch (e) {
          if (e.code !== '42701') throw e
        }
        try {
          await client.query('ALTER TABLE admin_hub_menus ADD COLUMN IF NOT EXISTS categories_with_products boolean DEFAULT false;')
        } catch (e) {
          if (e.code !== '42701') throw e
        }
        try {
          await client.query('ALTER TABLE admin_hub_menu_items ADD COLUMN IF NOT EXISTS slug varchar(255);')
        } catch (e) {
          if (e.code !== '42701') throw e
        }
        await client.query('CREATE INDEX IF NOT EXISTS idx_admin_hub_menus_location ON admin_hub_menus(location);')
        await client.query('CREATE INDEX IF NOT EXISTS idx_admin_hub_menu_items_menu_id ON admin_hub_menu_items(menu_id);')
        await client.query('CREATE INDEX IF NOT EXISTS idx_admin_hub_menu_items_parent_id ON admin_hub_menu_items(parent_id);')
        // Fix: normalize empty string location to NULL so they don't get misread as "main"
        await client.query(`UPDATE admin_hub_menus SET location = NULL WHERE location = ''`).catch(() => {})
        await client.query(`
          CREATE TABLE IF NOT EXISTS admin_hub_menu_locations (
            id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
            slug varchar(50) NOT NULL UNIQUE,
            label varchar(255) NOT NULL,
            html_id varchar(50),
            sort_order integer DEFAULT 0
          );
        `)
        await client.query(`
          INSERT INTO admin_hub_menu_locations (slug, label, html_id, sort_order) VALUES
            ('main', 'Main menu (dropdown)', NULL, 0),
            ('second', 'Second menu (navbar bar)', 'subnav', 1),
            ('footer1', 'Footer column 1', NULL, 10),
            ('footer2', 'Footer column 2', NULL, 11),
            ('footer3', 'Footer column 3', NULL, 12),
            ('footer4', 'Footer column 4', NULL, 13)
          ON CONFLICT (slug) DO NOTHING;
        `)
        await client.query(`
          CREATE TABLE IF NOT EXISTS admin_hub_media (
            id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
            filename varchar(255) NOT NULL,
            url text NOT NULL,
            mime_type varchar(100),
            size integer DEFAULT 0,
            alt varchar(255),
            created_at timestamp DEFAULT now(),
            updated_at timestamp DEFAULT now()
          );
        `)
        await client.query(`
          CREATE TABLE IF NOT EXISTS admin_hub_pages (
            id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
            title varchar(255) NOT NULL,
            slug varchar(255) NOT NULL UNIQUE,
            body text,
            status varchar(50) DEFAULT 'draft',
            created_at timestamp DEFAULT now(),
            updated_at timestamp DEFAULT now()
          );
        `)
        await client.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_hub_pages_slug ON admin_hub_pages(slug);')
        await client.query(`ALTER TABLE admin_hub_pages ADD COLUMN IF NOT EXISTS page_type varchar(50) DEFAULT 'page';`).catch(() => {})
        await client.query(`ALTER TABLE admin_hub_pages ADD COLUMN IF NOT EXISTS featured_image text;`).catch(() => {})
        await client.query(`ALTER TABLE admin_hub_pages ADD COLUMN IF NOT EXISTS excerpt text;`).catch(() => {})
        await client.query(`ALTER TABLE admin_hub_pages ADD COLUMN IF NOT EXISTS meta_title varchar(512);`).catch(() => {})
        await client.query(`ALTER TABLE admin_hub_pages ADD COLUMN IF NOT EXISTS meta_description text;`).catch(() => {})
        await client.query(`ALTER TABLE admin_hub_pages ADD COLUMN IF NOT EXISTS meta_keywords varchar(512);`).catch(() => {})
        await client.query(`UPDATE admin_hub_pages SET page_type = 'page' WHERE page_type IS NULL`).catch(() => {})
        await client.query(`
          CREATE TABLE IF NOT EXISTS admin_hub_collections (
            id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
            title varchar(255) NOT NULL,
            handle varchar(255) NOT NULL UNIQUE,
            created_at timestamp DEFAULT now(),
            updated_at timestamp DEFAULT now()
          );
        `)
        await client.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_hub_collections_handle ON admin_hub_collections(handle);')
        try {
          await client.query('ALTER TABLE admin_hub_collections ADD COLUMN metadata jsonb;')
        } catch (e) {
          if (e.code !== '42701') throw e
        }
        await client.query(`
          CREATE TABLE IF NOT EXISTS admin_hub_seller_settings (
            seller_id varchar(255) PRIMARY KEY DEFAULT 'default',
            store_name varchar(255),
            updated_at timestamp DEFAULT now()
          );
        `)
        await client.query(`
          CREATE TABLE IF NOT EXISTS admin_hub_brands (
            id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
            name varchar(255) NOT NULL,
            handle varchar(255) NOT NULL UNIQUE,
            logo_image text,
            banner_image text,
            address text,
            created_at timestamp DEFAULT now(),
            updated_at timestamp DEFAULT now()
          );
        `)
        await client.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_hub_brands_handle ON admin_hub_brands(handle);')
        await client.query('ALTER TABLE admin_hub_brands ADD COLUMN IF NOT EXISTS banner_image text;')
        await client.query('ALTER TABLE admin_hub_brands ADD COLUMN IF NOT EXISTS seller_id varchar(255) DEFAULT NULL;')
        await client.query(`
          CREATE TABLE IF NOT EXISTS store_carts (
            id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
            created_at timestamp DEFAULT now(),
            updated_at timestamp DEFAULT now()
          );
        `)
        await client.query(`ALTER TABLE store_carts ADD COLUMN IF NOT EXISTS bonus_points_reserved integer NOT NULL DEFAULT 0`).catch(() => {})
        await client.query(`ALTER TABLE store_carts ADD COLUMN IF NOT EXISTS email text`).catch(() => {})
        await client.query(`ALTER TABLE store_carts ADD COLUMN IF NOT EXISTS first_name text`).catch(() => {})
        await client.query(`ALTER TABLE store_carts ADD COLUMN IF NOT EXISTS last_name text`).catch(() => {})
        await client.query(`ALTER TABLE store_carts ADD COLUMN IF NOT EXISTS phone text`).catch(() => {})
        await client.query(`ALTER TABLE store_carts ADD COLUMN IF NOT EXISTS coupon_code text`).catch(() => {})
        await client.query(`ALTER TABLE store_carts ADD COLUMN IF NOT EXISTS coupon_discount_cents integer NOT NULL DEFAULT 0`).catch(() => {})
        await client.query(`ALTER TABLE store_orders ADD COLUMN IF NOT EXISTS coupon_code text`).catch(() => {})
        await client.query(`ALTER TABLE store_orders ADD COLUMN IF NOT EXISTS coupon_discount_cents integer NOT NULL DEFAULT 0`).catch(() => {})
        await client.query(`
          CREATE TABLE IF NOT EXISTS admin_hub_coupons (
            id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
            seller_id varchar(255) NOT NULL DEFAULT 'default',
            code varchar(100) NOT NULL,
            discount_type varchar(20) NOT NULL DEFAULT 'percent',
            discount_value integer NOT NULL,
            min_subtotal_cents integer NOT NULL DEFAULT 0,
            usage_limit integer,
            used_count integer NOT NULL DEFAULT 0,
            active boolean NOT NULL DEFAULT true,
            expires_at timestamp,
            created_at timestamp DEFAULT now(),
            updated_at timestamp DEFAULT now()
          );
        `).catch(() => {})
        await client.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_hub_coupons_seller_code ON admin_hub_coupons(seller_id, lower(code));').catch(() => {})
        await client.query(`
          CREATE TABLE IF NOT EXISTS store_cart_items (
            id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
            cart_id uuid NOT NULL REFERENCES store_carts(id) ON DELETE CASCADE,
            variant_id text NOT NULL,
            product_id text NOT NULL,
            quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
            unit_price_cents integer NOT NULL DEFAULT 0,
            title text,
            thumbnail text,
            product_handle text,
            created_at timestamp DEFAULT now(),
            updated_at timestamp DEFAULT now()
          );
        `)
        await client.query('CREATE INDEX IF NOT EXISTS idx_store_cart_items_cart_id ON store_cart_items(cart_id);')

        // Orders (Stripe checkout sonrası)
        await client.query(`
          CREATE TABLE IF NOT EXISTS store_orders (
            id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
            cart_id uuid REFERENCES store_carts(id) ON DELETE SET NULL,
            payment_intent_id text,
            status varchar(50) NOT NULL DEFAULT 'pending',
            email text,
            first_name text,
            last_name text,
            phone text,
            address_line1 text,
            address_line2 text,
            city text,
            postal_code text,
            country text,
            subtotal_cents integer NOT NULL DEFAULT 0,
            total_cents integer NOT NULL DEFAULT 0,
            currency text NOT NULL DEFAULT 'eur',
            created_at timestamp DEFAULT now(),
            updated_at timestamp DEFAULT now()
          );
        `)
        await client.query(`
          ALTER TABLE store_orders ADD COLUMN IF NOT EXISTS order_number BIGINT GENERATED ALWAYS AS IDENTITY (START WITH 100001 INCREMENT BY 1);
        `).catch(() => {})
        await client.query(`
  ALTER TABLE store_orders ADD COLUMN IF NOT EXISTS payment_status varchar(50) NOT NULL DEFAULT 'bezahlt';
`).catch(() => {})
        await client.query(`
  ALTER TABLE store_orders ADD COLUMN IF NOT EXISTS delivery_status varchar(50) NOT NULL DEFAULT 'offen';
`).catch(() => {})
        await client.query(`
  ALTER TABLE store_orders ADD COLUMN IF NOT EXISTS order_status varchar(50) NOT NULL DEFAULT 'offen';
`).catch(() => {})
        await client.query(`
  ALTER TABLE store_orders ADD COLUMN IF NOT EXISTS seller_id varchar(255) DEFAULT 'default';
`).catch(() => {})
        await client.query(`ALTER TABLE store_orders ADD COLUMN IF NOT EXISTS payment_method varchar(100);`).catch(() => {})
        await client.query(`ALTER TABLE store_orders ADD COLUMN IF NOT EXISTS billing_address_line1 text;`).catch(() => {})
        await client.query(`ALTER TABLE store_orders ADD COLUMN IF NOT EXISTS billing_address_line2 text;`).catch(() => {})
        await client.query(`ALTER TABLE store_orders ADD COLUMN IF NOT EXISTS billing_city text;`).catch(() => {})
        await client.query(`ALTER TABLE store_orders ADD COLUMN IF NOT EXISTS billing_postal_code varchar(20);`).catch(() => {})
        await client.query(`ALTER TABLE store_orders ADD COLUMN IF NOT EXISTS billing_country varchar(10);`).catch(() => {})
        await client.query(`ALTER TABLE store_orders ADD COLUMN IF NOT EXISTS billing_same_as_shipping boolean DEFAULT true;`).catch(() => {})
        await client.query(`ALTER TABLE store_orders ADD COLUMN IF NOT EXISTS is_guest boolean DEFAULT true;`).catch(() => {})
        await client.query(`ALTER TABLE store_orders ADD COLUMN IF NOT EXISTS newsletter_opted_in boolean DEFAULT false;`).catch(() => {})
        await client.query(`ALTER TABLE store_orders ADD COLUMN IF NOT EXISTS customer_id uuid;`).catch(() => {})
        await client.query(`ALTER TABLE store_orders ADD COLUMN IF NOT EXISTS tracking_number varchar(200);`).catch(() => {})
        await client.query(`ALTER TABLE store_orders ADD COLUMN IF NOT EXISTS carrier_name varchar(100);`).catch(() => {})
        await client.query(`ALTER TABLE store_orders ADD COLUMN IF NOT EXISTS shipped_at timestamp;`).catch(() => {})
        await client.query(`ALTER TABLE store_orders ADD COLUMN IF NOT EXISTS notes text;`).catch(() => {})
        await client.query(`ALTER TABLE store_orders ADD COLUMN IF NOT EXISTS delivery_date timestamp;`).catch(() => {})
        await client.query(`ALTER TABLE store_orders ADD COLUMN IF NOT EXISTS stripe_transfer_status varchar(50) NOT NULL DEFAULT 'legacy_skipped';`).catch(() => {})
        await client.query(`ALTER TABLE store_orders ADD COLUMN IF NOT EXISTS stripe_transfer_id text;`).catch(() => {})
        await client.query(`ALTER TABLE store_orders ADD COLUMN IF NOT EXISTS stripe_transfer_error text;`).catch(() => {})
        await client.query(`ALTER TABLE store_orders ADD COLUMN IF NOT EXISTS stripe_transfer_at timestamp;`).catch(() => {})
        // Destination Charges + Manual Payouts fields
        await client.query(`ALTER TABLE store_orders ADD COLUMN IF NOT EXISTS stripe_account_id text;`).catch(() => {})
        await client.query(`ALTER TABLE store_orders ADD COLUMN IF NOT EXISTS stripe_application_fee_cents integer;`).catch(() => {})
        await client.query(`ALTER TABLE store_orders ADD COLUMN IF NOT EXISTS stripe_payout_status varchar(50);`).catch(() => {})
        await client.query(`ALTER TABLE store_orders ADD COLUMN IF NOT EXISTS stripe_payout_id text;`).catch(() => {})
        await client.query(`CREATE INDEX IF NOT EXISTS idx_orders_stripe_payout_id ON store_orders (stripe_payout_id) WHERE stripe_payout_id IS NOT NULL;`).catch(() => {})
        await client.query(`CREATE INDEX IF NOT EXISTS idx_orders_stripe_payout_status ON store_orders (stripe_payout_status) WHERE stripe_payout_status IS NOT NULL;`).catch(() => {})
        await client.query(`ALTER TABLE store_orders ADD COLUMN IF NOT EXISTS discount_cents integer NOT NULL DEFAULT 0`).catch(() => {})
        await client.query(`ALTER TABLE store_orders ADD COLUMN IF NOT EXISTS shipping_cents integer NOT NULL DEFAULT 0`).catch(() => {})
        await client.query(`
          CREATE TABLE IF NOT EXISTS store_platform_checkout (
            id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
            stripe_publishable_key text,
            stripe_secret_key text,
            pay_card boolean NOT NULL DEFAULT true,
            pay_paypal boolean NOT NULL DEFAULT false,
            pay_klarna boolean NOT NULL DEFAULT false,
            paypal_client_id text,
            paypal_client_secret text,
            updated_at timestamp DEFAULT now()
          );
        `).catch(() => {})
        await client.query(`INSERT INTO store_platform_checkout (id) VALUES (1) ON CONFLICT (id) DO NOTHING`).catch(() => {})
        await client.query(`ALTER TABLE store_platform_checkout ADD COLUMN IF NOT EXISTS payment_method_layout text DEFAULT 'grid'`).catch(() => {})
        await client.query(`ALTER TABLE store_platform_checkout ADD COLUMN IF NOT EXISTS payment_method_types_json jsonb`).catch(() => {})
        await client.query(`ALTER TABLE admin_hub_seller_settings ADD COLUMN IF NOT EXISTS free_shipping_thresholds jsonb`).catch(() => {})
        await client.query(`ALTER TABLE admin_hub_seller_settings ADD COLUMN IF NOT EXISTS shop_logo_url text`).catch(() => {})
        await client.query(`ALTER TABLE admin_hub_seller_settings ADD COLUMN IF NOT EXISTS shop_favicon_url text`).catch(() => {})
        await client.query(`ALTER TABLE admin_hub_seller_settings ADD COLUMN IF NOT EXISTS sellercentral_logo_url text`).catch(() => {})
        await client.query(`ALTER TABLE admin_hub_seller_settings ADD COLUMN IF NOT EXISTS sellercentral_favicon_url text`).catch(() => {})
        await client.query(`ALTER TABLE admin_hub_seller_settings ADD COLUMN IF NOT EXISTS shop_logo_height integer DEFAULT 34`).catch(() => {})
        await client.query(`ALTER TABLE admin_hub_seller_settings ADD COLUMN IF NOT EXISTS sellercentral_logo_height integer DEFAULT 30`).catch(() => {})
        await client.query(`ALTER TABLE admin_hub_seller_settings ADD COLUMN IF NOT EXISTS platform_name text`).catch(() => {})
        await client.query(`ALTER TABLE admin_hub_seller_settings ADD COLUMN IF NOT EXISTS support_email text`).catch(() => {})
        await client.query(`ALTER TABLE admin_hub_seller_settings ADD COLUMN IF NOT EXISTS announcement_bar_items jsonb`).catch(() => {})
        await client.query(`
          CREATE TABLE IF NOT EXISTS admin_hub_banners (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            title text NOT NULL DEFAULT '',
            subtitle text,
            image_url text,
            link_url text,
            button_text text,
            is_active boolean NOT NULL DEFAULT true,
            position integer NOT NULL DEFAULT 0,
            created_at timestamptz NOT NULL DEFAULT now(),
            updated_at timestamptz NOT NULL DEFAULT now()
          )
        `).catch(() => {})
        await client.query(`ALTER TABLE store_orders ADD COLUMN IF NOT EXISTS bonus_points_redeemed integer NOT NULL DEFAULT 0`).catch(() => {})
        await client.query(`
          CREATE TABLE IF NOT EXISTS store_shipping_carriers (
            id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
            name varchar(100) NOT NULL,
            tracking_url_template text,
            api_key text,
            api_secret text,
            seller_id varchar(255),
            is_active boolean DEFAULT true,
            sort_order integer DEFAULT 0,
            created_at timestamp DEFAULT now(),
            updated_at timestamp DEFAULT now()
          );
        `).catch(() => {})
        await client.query(`ALTER TABLE store_shipping_carriers ADD COLUMN IF NOT EXISTS seller_id varchar(255)`).catch(() => {})
        await client.query(`
          CREATE TABLE IF NOT EXISTS store_shipment_events (
            id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
            order_id uuid REFERENCES store_orders(id) ON DELETE CASCADE,
            status varchar(50) NOT NULL DEFAULT 'manual',
            description text,
            location varchar(200),
            event_time timestamp DEFAULT now(),
            source varchar(50) DEFAULT 'manual',
            created_at timestamp DEFAULT now()
          );
        `).catch(() => {})
        await client.query(`CREATE INDEX IF NOT EXISTS idx_shipment_events_order ON store_shipment_events(order_id)`).catch(() => {})
        await client.query(`ALTER TABLE store_shipping_carriers ADD COLUMN IF NOT EXISTS logo_url text`).catch(() => {})
        await client.query(`
          CREATE TABLE IF NOT EXISTS store_integrations (
            id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
            name varchar(100) NOT NULL,
            slug varchar(100) NOT NULL UNIQUE,
            logo_url text,
            api_key text,
            api_secret text,
            webhook_url text,
            config jsonb DEFAULT '{}',
            is_active boolean DEFAULT false,
            category varchar(50) DEFAULT 'other',
            created_at timestamp DEFAULT now(),
            updated_at timestamp DEFAULT now()
          );
        `).catch(() => {})
        await client.query(`ALTER TABLE store_integrations ADD COLUMN IF NOT EXISTS seller_scope_key text`).catch(() => {})
        // customer_number may be missing if table was created before this column was added
        await client.query(`
          DO $$ BEGIN
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='store_customers' AND column_name='customer_number') THEN
              ALTER TABLE store_customers ADD COLUMN customer_number BIGINT GENERATED ALWAYS AS IDENTITY (START WITH 10001 INCREMENT BY 1);
            END IF;
          END $$;
        `).catch(() => {})
        await client.query(`ALTER TABLE store_customers ADD COLUMN IF NOT EXISTS password_hash text;`).catch(() => {})
        await client.query(`ALTER TABLE store_customers ADD COLUMN IF NOT EXISTS account_type varchar(20) DEFAULT 'privat';`).catch(() => {})
        await client.query(`ALTER TABLE store_customers ADD COLUMN IF NOT EXISTS gender varchar(10);`).catch(() => {})
        await client.query(`ALTER TABLE store_customers ADD COLUMN IF NOT EXISTS birth_date date;`).catch(() => {})
        await client.query(`ALTER TABLE store_customers ADD COLUMN IF NOT EXISTS address_line1 text;`).catch(() => {})
        await client.query(`ALTER TABLE store_customers ADD COLUMN IF NOT EXISTS address_line2 text;`).catch(() => {})
        await client.query(`ALTER TABLE store_customers ADD COLUMN IF NOT EXISTS zip_code varchar(20);`).catch(() => {})
        await client.query(`ALTER TABLE store_customers ADD COLUMN IF NOT EXISTS city text;`).catch(() => {})
        await client.query(`ALTER TABLE store_customers ADD COLUMN IF NOT EXISTS country varchar(100);`).catch(() => {})
        await client.query(`ALTER TABLE store_customers ADD COLUMN IF NOT EXISTS company_name text;`).catch(() => {})
        await client.query(`ALTER TABLE store_customers ADD COLUMN IF NOT EXISTS vat_number text;`).catch(() => {})
        // Fix duplicate + NULL customer_numbers and restore identity sequence.
        // Uses a row-by-row DO block so every assignment is guaranteed unique.
        await client.query(`
          DO $$
          DECLARE
            rec    RECORD;
            new_num BIGINT;
          BEGIN
            -- 1. Drop GENERATED ALWAYS identity so we can write to the column directly
            BEGIN
              ALTER TABLE store_customers ALTER COLUMN customer_number DROP IDENTITY;
            EXCEPTION WHEN OTHERS THEN NULL;
            END;

            -- 2. Starting point = current max (or 100000 if table is empty)
            SELECT COALESCE(MAX(customer_number), 100000) INTO new_num FROM store_customers;

            -- 3. Assign fresh numbers to every duplicate (keep the earliest row's number)
            FOR rec IN
              SELECT id FROM (
                SELECT id,
                  ROW_NUMBER() OVER (PARTITION BY customer_number ORDER BY created_at ASC) AS rn
                FROM store_customers
                WHERE customer_number IS NOT NULL
              ) t
              WHERE rn > 1
              ORDER BY rn
            LOOP
              new_num := new_num + 1;
              UPDATE store_customers SET customer_number = new_num WHERE id = rec.id;
            END LOOP;

            -- 4. Also fill in any NULL customer_numbers
            FOR rec IN
              SELECT id FROM store_customers WHERE customer_number IS NULL ORDER BY created_at
            LOOP
              new_num := new_num + 1;
              UPDATE store_customers SET customer_number = new_num WHERE id = rec.id;
            END LOOP;

            -- 5. Restore GENERATED ALWAYS AS IDENTITY starting after the new max
            BEGIN
              EXECUTE format(
                'ALTER TABLE store_customers ALTER COLUMN customer_number ADD GENERATED ALWAYS AS IDENTITY (START WITH %s INCREMENT BY 1)',
                new_num + 1
              );
            EXCEPTION WHEN OTHERS THEN NULL;
            END;
          END $$
        `).catch(e => console.warn('customer_number dedup migration:', e?.message))
        // Ensure uniqueness index exists (safe to run repeatedly)
        await client.query(`
          CREATE UNIQUE INDEX IF NOT EXISTS store_customers_customer_number_unique
          ON store_customers(customer_number) WHERE customer_number IS NOT NULL;
        `).catch(() => {})
        await client.query(`ALTER TABLE store_customers ADD COLUMN IF NOT EXISTS notes text;`).catch(() => {})
        await client.query(`ALTER TABLE store_customers ADD COLUMN IF NOT EXISTS email_marketing_consent boolean DEFAULT false;`).catch(() => {})
        await client.query(`ALTER TABLE store_customers ADD COLUMN IF NOT EXISTS bonus_points integer DEFAULT 0;`).catch(() => {})
        await client.query(`ALTER TABLE store_customers ADD COLUMN IF NOT EXISTS billing_address_line1 text;`).catch(() => {})
        await client.query(`ALTER TABLE store_customers ADD COLUMN IF NOT EXISTS billing_address_line2 text;`).catch(() => {})
        await client.query(`ALTER TABLE store_customers ADD COLUMN IF NOT EXISTS billing_zip_code varchar(20);`).catch(() => {})
        await client.query(`ALTER TABLE store_customers ADD COLUMN IF NOT EXISTS billing_city text;`).catch(() => {})
        await client.query(`ALTER TABLE store_customers ADD COLUMN IF NOT EXISTS billing_country varchar(100);`).catch(() => {})
        await client.query(`ALTER TABLE store_customers ADD COLUMN IF NOT EXISTS stripe_customer_id text;`).catch(() => {})
        await client.query(`
          CREATE TABLE IF NOT EXISTS store_messages (
            id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
            order_id uuid REFERENCES store_orders(id) ON DELETE SET NULL,
            sender_type varchar(20) NOT NULL,
            sender_email text,
            recipient_email text,
            subject text,
            body text NOT NULL,
            is_read_by_seller boolean NOT NULL DEFAULT false,
            is_read_by_customer boolean NOT NULL DEFAULT false,
            created_at timestamp NOT NULL DEFAULT now()
          );
        `).catch(() => {})
        await client.query(`
          CREATE TABLE IF NOT EXISTS store_smtp_settings (
            seller_id varchar(255) PRIMARY KEY DEFAULT 'default',
            provider varchar(50),
            host text,
            port integer DEFAULT 587,
            secure boolean DEFAULT false,
            username text,
            password_enc text,
            from_name text,
            from_email text,
            updated_at timestamp DEFAULT now()
          );
        `).catch(() => {})
        await client.query(`ALTER TABLE admin_hub_seller_settings ADD COLUMN IF NOT EXISTS notifications_seen_at timestamp;`).catch(() => {})
        await client.query(`ALTER TABLE admin_hub_seller_settings ADD COLUMN IF NOT EXISTS billbee_api_key text;`).catch(() => {})
        await client.query(`ALTER TABLE admin_hub_seller_settings ADD COLUMN IF NOT EXISTS billbee_basic_username text;`).catch(() => {})
        await client.query(`ALTER TABLE admin_hub_seller_settings ADD COLUMN IF NOT EXISTS billbee_basic_password text;`).catch(() => {})
        await client.query(`ALTER TABLE admin_hub_seller_settings ADD COLUMN IF NOT EXISTS billbee_updated_at timestamp;`).catch(() => {})
        await client.query(`ALTER TABLE admin_hub_seller_settings ADD COLUMN IF NOT EXISTS billbee_connection_name text;`).catch(() => {})
        await client.query(`CREATE TABLE IF NOT EXISTS admin_hub_notifications (
          id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
          type varchar(50) NOT NULL,
          title text,
          body text,
          seller_id varchar(255),
          reference_id text,
          seen_at timestamp,
          created_at timestamp NOT NULL DEFAULT now()
        )`).catch(() => {})
        await client.query(`CREATE TABLE IF NOT EXISTS seller_hub_notification_state (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          recipient_key varchar(255) NOT NULL,
          source_type varchar(64) NOT NULL,
          source_id uuid NOT NULL,
          read_at timestamptz,
          deleted_at timestamptz,
          created_at timestamptz NOT NULL DEFAULT now(),
          UNIQUE (recipient_key, source_type, source_id)
        )`).catch(() => {})
        await client.query(`CREATE INDEX IF NOT EXISTS idx_seller_notif_state_recipient ON seller_hub_notification_state(recipient_key)`).catch(() => {})
        await client.query(`
          CREATE TABLE IF NOT EXISTS admin_hub_flows (
            id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
            name varchar(255) NOT NULL,
            trigger_key varchar(80) NOT NULL,
            status varchar(20) NOT NULL DEFAULT 'draft',
            sent_count integer NOT NULL DEFAULT 0,
            created_at timestamptz NOT NULL DEFAULT now(),
            updated_at timestamptz NOT NULL DEFAULT now()
          )
        `).catch(() => {})
        await client.query(`
          CREATE TABLE IF NOT EXISTS admin_hub_flow_steps (
            id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
            flow_id uuid NOT NULL REFERENCES admin_hub_flows(id) ON DELETE CASCADE,
            step_order integer NOT NULL DEFAULT 0,
            step_type varchar(40) NOT NULL,
            wait_hours integer,
            email_subject text,
            email_body text,
            created_at timestamptz NOT NULL DEFAULT now(),
            updated_at timestamptz NOT NULL DEFAULT now()
          )
        `).catch(() => {})
        await client.query(`ALTER TABLE admin_hub_flow_steps ADD COLUMN IF NOT EXISTS email_i18n jsonb DEFAULT NULL`).catch(() => {})
        await client.query(`ALTER TABLE admin_hub_flow_steps ADD COLUMN IF NOT EXISTS email_attachments jsonb DEFAULT NULL`).catch(() => {})
        await client.query(`
          CREATE TABLE IF NOT EXISTS store_smtp_sender_profiles (
            id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
            seller_id varchar(255) NOT NULL DEFAULT 'default',
            from_email varchar(512) NOT NULL,
            from_name text,
            is_default boolean NOT NULL DEFAULT false,
            last_test_ok boolean,
            last_test_at timestamptz,
            last_test_message text,
            created_at timestamptz NOT NULL DEFAULT now(),
            UNIQUE(seller_id, from_email)
          );
        `).catch(() => {})
        await client.query(`CREATE INDEX IF NOT EXISTS idx_store_smtp_sender_profiles_seller ON store_smtp_sender_profiles(seller_id)`).catch(() => {})
        await client.query(`
          INSERT INTO store_smtp_sender_profiles (seller_id, from_email, from_name, is_default)
          SELECT 'default', TRIM(from_email), NULLIF(TRIM(from_name), ''), true
          FROM store_smtp_settings WHERE seller_id = 'default'
            AND from_email IS NOT NULL AND TRIM(from_email) <> ''
            AND NOT EXISTS (SELECT 1 FROM store_smtp_sender_profiles p WHERE p.seller_id = 'default')
        `).catch(() => {})
        await client.query(
          `ALTER TABLE admin_hub_flow_steps ADD COLUMN IF NOT EXISTS smtp_sender_id uuid REFERENCES store_smtp_sender_profiles(id) ON DELETE SET NULL`,
        ).catch(() => {})
        await client.query(`ALTER TABLE admin_hub_flows ADD COLUMN IF NOT EXISTS audience varchar(20) NOT NULL DEFAULT 'customer'`).catch(() => {})
        await client.query(`CREATE INDEX IF NOT EXISTS idx_admin_hub_flow_steps_flow ON admin_hub_flow_steps(flow_id, step_order)`).catch(() => {})
        await client.query(`ALTER TABLE seller_users ADD COLUMN IF NOT EXISTS iban text;`).catch(() => {})
        await client.query(`ALTER TABLE seller_users ADD COLUMN IF NOT EXISTS payment_account_holder text;`).catch(() => {})
        await client.query(`ALTER TABLE seller_users ADD COLUMN IF NOT EXISTS payment_bic text;`).catch(() => {})
        await client.query(`ALTER TABLE seller_users ADD COLUMN IF NOT EXISTS payment_bank_name text;`).catch(() => {})
        await client.query(`ALTER TABLE seller_users ADD COLUMN IF NOT EXISTS stripe_custom_account_id text;`).catch(() => {})
        await client.query(`ALTER TABLE seller_users ADD COLUMN IF NOT EXISTS permissions jsonb DEFAULT NULL;`).catch(() => {})
        await client.query(`ALTER TABLE seller_users ADD COLUMN IF NOT EXISTS commission_rate numeric(5,4) NOT NULL DEFAULT 0.12;`).catch(() => {})
        await client.query(`ALTER TABLE seller_users ALTER COLUMN commission_rate SET DEFAULT 0.12`).catch(() => {})
        await client.query(`UPDATE seller_users SET commission_rate = 0.12 WHERE commission_rate = 0.10`).catch(() => {})
        await client.query(`ALTER TABLE seller_users ADD COLUMN IF NOT EXISTS sub_of_seller_id varchar(255) DEFAULT NULL;`).catch(() => {})
        await client.query(`ALTER TABLE seller_users ADD COLUMN IF NOT EXISTS first_name varchar(255) DEFAULT NULL;`).catch(() => {})
        await client.query(`ALTER TABLE seller_users ADD COLUMN IF NOT EXISTS last_name varchar(255) DEFAULT NULL;`).catch(() => {})
        // Message channel support (customer vs support)
        await client.query(`ALTER TABLE store_messages ADD COLUMN IF NOT EXISTS channel varchar(20) DEFAULT 'customer';`).catch(() => {})
        await client.query(`ALTER TABLE store_messages ADD COLUMN IF NOT EXISTS seller_id varchar(255) DEFAULT NULL;`).catch(() => {})
        await client.query(`ALTER TABLE store_messages ADD COLUMN IF NOT EXISTS is_read_by_support boolean NOT NULL DEFAULT false;`).catch(() => {})
        // Seller onboarding / approval fields
        await client.query(`ALTER TABLE seller_users ADD COLUMN IF NOT EXISTS approval_status varchar(30) DEFAULT 'registered';`).catch(() => {})
        await client.query(`ALTER TABLE seller_users ADD COLUMN IF NOT EXISTS company_name varchar(255) DEFAULT NULL;`).catch(() => {})
        await client.query(`ALTER TABLE seller_users ADD COLUMN IF NOT EXISTS tax_id varchar(100) DEFAULT NULL;`).catch(() => {})
        await client.query(`ALTER TABLE seller_users ADD COLUMN IF NOT EXISTS vat_id varchar(100) DEFAULT NULL;`).catch(() => {})
        await client.query(`ALTER TABLE seller_users ADD COLUMN IF NOT EXISTS business_address jsonb DEFAULT NULL;`).catch(() => {})
        await client.query(`ALTER TABLE seller_users ADD COLUMN IF NOT EXISTS warehouse_address jsonb DEFAULT NULL;`).catch(() => {})
        await client.query(`ALTER TABLE seller_users ADD COLUMN IF NOT EXISTS phone varchar(100) DEFAULT NULL;`).catch(() => {})
        await client.query(`ALTER TABLE seller_users ADD COLUMN IF NOT EXISTS website varchar(255) DEFAULT NULL;`).catch(() => {})
        await client.query(`ALTER TABLE seller_users ADD COLUMN IF NOT EXISTS documents jsonb DEFAULT NULL;`).catch(() => {})
        await client.query(`ALTER TABLE seller_users ADD COLUMN IF NOT EXISTS rejection_reason text DEFAULT NULL;`).catch(() => {})
        await client.query(`ALTER TABLE seller_users ADD COLUMN IF NOT EXISTS approved_at timestamp DEFAULT NULL;`).catch(() => {})
        await client.query(`ALTER TABLE seller_users ADD COLUMN IF NOT EXISTS approved_by varchar(255) DEFAULT NULL;`).catch(() => {})
        await client.query(`ALTER TABLE seller_users ADD COLUMN IF NOT EXISTS agreement_accepted boolean NOT NULL DEFAULT false;`).catch(() => {})
        await client.query(`ALTER TABLE seller_users ADD COLUMN IF NOT EXISTS agreement_accepted_at timestamp DEFAULT NULL;`).catch(() => {})
        await client.query(`ALTER TABLE seller_users ADD COLUMN IF NOT EXISTS agreement_version varchar(20) DEFAULT NULL;`).catch(() => {})
        await client.query(`ALTER TABLE seller_users ADD COLUMN IF NOT EXISTS agreement_ip varchar(60) DEFAULT NULL;`).catch(() => {})
        await client.query(`ALTER TABLE seller_users ADD COLUMN IF NOT EXISTS authorized_person_name varchar(255) DEFAULT NULL;`).catch(() => {})
        // Verification pipeline columns
        await client.query(`ALTER TABLE seller_users ADD COLUMN IF NOT EXISTS risk_score integer DEFAULT NULL;`).catch(() => {})
        await client.query(`ALTER TABLE seller_users ADD COLUMN IF NOT EXISTS verification_steps jsonb DEFAULT NULL;`).catch(() => {})
        await client.query(`ALTER TABLE seller_users ADD COLUMN IF NOT EXISTS verification_started_at timestamp DEFAULT NULL;`).catch(() => {})
        // Stripe Connect columns
        await client.query(`ALTER TABLE seller_users ADD COLUMN IF NOT EXISTS stripe_account_id varchar(255) DEFAULT NULL;`).catch(() => {})
        await client.query(`ALTER TABLE seller_users ADD COLUMN IF NOT EXISTS stripe_onboarding_complete boolean NOT NULL DEFAULT false;`).catch(() => {})
        // 2FA / TOTP columns
        await client.query(`ALTER TABLE seller_users ADD COLUMN IF NOT EXISTS totp_secret text DEFAULT NULL;`).catch(() => {})
        await client.query(`ALTER TABLE seller_users ADD COLUMN IF NOT EXISTS totp_enabled boolean NOT NULL DEFAULT false;`).catch(() => {})
        await client.query(`ALTER TABLE seller_users ADD COLUMN IF NOT EXISTS andertal_billbee_api_key text`).catch(() => {})
        await client.query(`ALTER TABLE seller_users ADD COLUMN IF NOT EXISTS andertal_billbee_api_secret text`).catch(() => {})
        await client.query(`ALTER TABLE seller_users ADD COLUMN IF NOT EXISTS billbee_integration_enabled boolean NOT NULL DEFAULT true`).catch(() => {})
        await client.query(
          `CREATE UNIQUE INDEX IF NOT EXISTS idx_seller_users_andertal_billbee_api_key ON seller_users(andertal_billbee_api_key) WHERE andertal_billbee_api_key IS NOT NULL`,
        ).catch(() => {})

        // ── Ranking infrastructure ──────────────────────────────────────────────
        await client.query(`
          CREATE TABLE IF NOT EXISTS product_events (
            id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
            event_type varchar(30) NOT NULL,
            product_id text NOT NULL,
            seller_id varchar(255),
            category_id text,
            strategy varchar(50) DEFAULT 'default',
            session_id varchar(255),
            position integer,
            created_at timestamp DEFAULT now()
          )
        `).catch(() => {})
        await client.query(`CREATE INDEX IF NOT EXISTS idx_product_events_product ON product_events(product_id, created_at)`).catch(() => {})
        await client.query(`CREATE INDEX IF NOT EXISTS idx_product_events_type_at ON product_events(event_type, created_at)`).catch(() => {})

        await client.query(`
          CREATE TABLE IF NOT EXISTS product_ranking_features (
            product_id text PRIMARY KEY,
            seller_id varchar(255),
            collection_id text,
            sales_7d integer DEFAULT 0,
            sales_30d integer DEFAULT 0,
            sales_90d integer DEFAULT 0,
            gmv_30d_cents bigint DEFAULT 0,
            impressions_30d integer DEFAULT 0,
            clicks_30d integer DEFAULT 0,
            ctr_30d numeric(6,4) DEFAULT 0,
            add_to_cart_30d integer DEFAULT 0,
            review_avg numeric(3,2) DEFAULT 0,
            review_count integer DEFAULT 0,
            return_count_30d integer DEFAULT 0,
            price_cents integer DEFAULT 0,
            compare_at_price_cents integer DEFAULT 0,
            discount_pct numeric(5,2) DEFAULT 0,
            inventory integer DEFAULT 0,
            content_score numeric(4,3) DEFAULT 0,
            published_at timestamp,
            popularity_score numeric(8,6) DEFAULT 0,
            freshness_score numeric(8,6) DEFAULT 0,
            velocity_score numeric(8,6) DEFAULT 0,
            final_score numeric(8,6) DEFAULT 0,
            updated_at timestamp DEFAULT now()
          )
        `).catch(() => {})

        await client.query(`
          CREATE TABLE IF NOT EXISTS ranking_config (
            strategy varchar(50) PRIMARY KEY,
            config jsonb NOT NULL DEFAULT '{}',
            updated_at timestamp DEFAULT now()
          )
        `).catch(() => {})

        await client.query(`
          INSERT INTO ranking_config (strategy, config) VALUES
            ('default',     '{"w_popularity":0.45,"w_freshness":0.15,"w_content":0.10,"w_discount":0.15,"w_seller":0.10,"w_velocity":0.05,"freshness_halflife_days":30,"exploration_k":0.25,"diversity_max_consecutive":3,"urgency_threshold":5}'),
            ('neuheiten',   '{"w_popularity":0.15,"w_freshness":0.55,"w_content":0.10,"w_discount":0.08,"w_seller":0.07,"w_velocity":0.05,"freshness_halflife_days":14,"exploration_k":0.40,"diversity_max_consecutive":3,"urgency_threshold":5}'),
            ('bestsellers', '{"w_popularity":0.65,"w_freshness":0.00,"w_content":0.05,"w_discount":0.12,"w_seller":0.15,"w_velocity":0.03,"freshness_halflife_days":90,"exploration_k":0.10,"diversity_max_consecutive":2,"urgency_threshold":5}'),
            ('sales',       '{"w_popularity":0.25,"w_freshness":0.08,"w_content":0.05,"w_discount":0.48,"w_seller":0.09,"w_velocity":0.05,"freshness_halflife_days":21,"exploration_k":0.15,"diversity_max_consecutive":4,"urgency_threshold":5}'),
            ('search',      '{"w_popularity":0.35,"w_freshness":0.10,"w_content":0.08,"w_discount":0.15,"w_seller":0.12,"w_velocity":0.20,"freshness_halflife_days":30,"exploration_k":0.10,"diversity_max_consecutive":5,"urgency_threshold":5}')
          ON CONFLICT (strategy) DO NOTHING
        `).catch(() => {})

        // Normalize store_name: convert empty string to NULL so sub-users don't conflict
        await client.query(`UPDATE seller_users SET store_name = NULL WHERE store_name = ''`).catch(() => {})
        await client.query(`ALTER TABLE seller_invitations ADD COLUMN IF NOT EXISTS first_name varchar(255) DEFAULT NULL;`).catch(() => {})
        await client.query(`ALTER TABLE seller_invitations ADD COLUMN IF NOT EXISTS last_name varchar(255) DEFAULT NULL;`).catch(() => {})
        await client.query(`ALTER TABLE seller_invitations ADD COLUMN IF NOT EXISTS permissions jsonb DEFAULT NULL;`).catch(() => {})
        await client.query(`
          CREATE TABLE IF NOT EXISTS seller_payouts (
            id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
            seller_id varchar(255) NOT NULL,
            period_start date NOT NULL,
            period_end date NOT NULL,
            total_cents bigint NOT NULL DEFAULT 0,
            commission_cents bigint NOT NULL DEFAULT 0,
            payout_cents bigint NOT NULL DEFAULT 0,
            iban text,
            status varchar(30) NOT NULL DEFAULT 'offen',
            proof_url text,
            paid_at timestamp,
            notes text,
            created_at timestamp DEFAULT now(),
            updated_at timestamp DEFAULT now()
          );
        `).catch(() => {})
        await client.query(`
          CREATE TABLE IF NOT EXISTS seller_payout_auto_runs (
            run_key varchar(64) PRIMARY KEY,
            period_start date NOT NULL,
            period_end date NOT NULL,
            executed_at timestamp NOT NULL DEFAULT now(),
            source_iban text,
            created_count integer NOT NULL DEFAULT 0
          );
        `).catch(() => {})
        await client.query(`
          CREATE TABLE IF NOT EXISTS seller_invitations (
            id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
            email varchar(255) UNIQUE NOT NULL,
            invited_by_seller_id varchar(255) NOT NULL,
            token varchar(255) UNIQUE NOT NULL,
            expires_at timestamp NOT NULL,
            accepted_at timestamp,
            created_at timestamp DEFAULT now()
          );
        `).catch(() => {})
        await client.query(`
          CREATE TABLE IF NOT EXISTS store_customer_discounts (
            id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
            customer_id uuid NOT NULL REFERENCES store_customers(id) ON DELETE CASCADE,
            code varchar(100) NOT NULL,
            type varchar(20) NOT NULL DEFAULT 'percentage',
            value numeric(10,2) NOT NULL DEFAULT 0,
            min_order_cents integer DEFAULT 0,
            max_uses integer DEFAULT 1,
            used_count integer DEFAULT 0,
            expires_at timestamp,
            notes text,
            created_at timestamp DEFAULT now()
          );
        `).catch(() => {})
        await client.query(`
          CREATE TABLE IF NOT EXISTS store_customer_bonus_ledger (
            id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
            customer_id uuid NOT NULL REFERENCES store_customers(id) ON DELETE CASCADE,
            occurred_at timestamptz NOT NULL DEFAULT now(),
            points_delta integer NOT NULL,
            description text NOT NULL,
            source varchar(40) NOT NULL DEFAULT 'manual',
            order_id uuid REFERENCES store_orders(id) ON DELETE SET NULL,
            created_at timestamptz DEFAULT now(),
            updated_at timestamptz DEFAULT now()
          );
        `).catch(() => {})
        await client.query('CREATE INDEX IF NOT EXISTS idx_store_customer_bonus_ledger_customer ON store_customer_bonus_ledger(customer_id)').catch(() => {})
        await client.query(`
  CREATE TABLE IF NOT EXISTS store_customers (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_number BIGINT GENERATED ALWAYS AS IDENTITY (START WITH 10001 INCREMENT BY 1),
    email text UNIQUE NOT NULL,
    first_name text,
    last_name text,
    phone text,
    email_marketing_consent boolean DEFAULT false,
    notes text,
    created_at timestamp DEFAULT now(),
    updated_at timestamp DEFAULT now()
  );
`).catch(() => {})
        await client.query(`
          CREATE TABLE IF NOT EXISTS store_customer_wishlist (
            id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
            customer_id uuid NOT NULL REFERENCES store_customers(id) ON DELETE CASCADE,
            product_id uuid NOT NULL REFERENCES admin_hub_products(id) ON DELETE CASCADE,
            created_at timestamptz DEFAULT now(),
            UNIQUE(customer_id, product_id)
          );
        `).catch(() => {})
        await client.query('CREATE INDEX IF NOT EXISTS idx_store_customer_wishlist_customer ON store_customer_wishlist(customer_id)').catch(() => {})
        await client.query(`
          CREATE TABLE IF NOT EXISTS store_customer_addresses (
            id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
            customer_id uuid NOT NULL REFERENCES store_customers(id) ON DELETE CASCADE,
            label text,
            address_line1 text NOT NULL,
            address_line2 text,
            zip_code varchar(20),
            city text,
            country varchar(10),
            is_default_shipping boolean NOT NULL DEFAULT false,
            is_default_billing boolean NOT NULL DEFAULT false,
            created_at timestamptz DEFAULT now(),
            updated_at timestamptz DEFAULT now()
          );
        `).catch(() => {})
        await client.query('CREATE INDEX IF NOT EXISTS idx_store_customer_addresses_customer ON store_customer_addresses(customer_id)').catch(() => {})
        await client.query(`ALTER TABLE store_customer_addresses ALTER COLUMN country TYPE varchar(100)`).catch(() => {})
        await client.query(`
          INSERT INTO store_customer_addresses (customer_id, address_line1, address_line2, zip_code, city, country, is_default_shipping, is_default_billing)
          SELECT c.id, c.address_line1, c.address_line2, c.zip_code, c.city, COALESCE(NULLIF(TRIM(c.country), ''), 'DE'), true, true
          FROM store_customers c
          WHERE c.address_line1 IS NOT NULL AND TRIM(c.address_line1) <> ''
            AND NOT EXISTS (SELECT 1 FROM store_customer_addresses a WHERE a.customer_id = c.id)
        `).catch(() => {})
        await client.query(`
  CREATE TABLE IF NOT EXISTS store_returns (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    return_number BIGINT GENERATED ALWAYS AS IDENTITY (START WITH 200001 INCREMENT BY 1),
    order_id uuid REFERENCES store_orders(id) ON DELETE SET NULL,
    status varchar(50) NOT NULL DEFAULT 'offen',
    reason text,
    notes text,
    items jsonb,
    created_at timestamp DEFAULT now(),
    updated_at timestamp DEFAULT now()
  );
`).catch(() => {})
        // Migrations: add refund fields to store_returns
        await client.query(`ALTER TABLE store_returns ADD COLUMN IF NOT EXISTS refund_amount_cents integer`).catch(() => {})
        await client.query(`ALTER TABLE store_returns ADD COLUMN IF NOT EXISTS refund_status varchar(50)`).catch(() => {})
        await client.query(`ALTER TABLE store_returns ADD COLUMN IF NOT EXISTS refund_note text`).catch(() => {})
        await client.query(`ALTER TABLE store_returns ADD COLUMN IF NOT EXISTS approved_at timestamp`).catch(() => {})
        await client.query(`ALTER TABLE store_returns ADD COLUMN IF NOT EXISTS rejected_at timestamp`).catch(() => {})
        await client.query(`ALTER TABLE store_returns ADD COLUMN IF NOT EXISTS label_sent_at timestamp`).catch(() => {})
        await client.query(`ALTER TABLE store_orders ADD COLUMN IF NOT EXISTS order_status varchar(50) DEFAULT 'offen'`).catch(() => {})

        await client.query(`
          CREATE TABLE IF NOT EXISTS store_order_items (
            id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
            order_id uuid NOT NULL REFERENCES store_orders(id) ON DELETE CASCADE,
            variant_id text,
            product_id text,
            quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
            unit_price_cents integer NOT NULL DEFAULT 0,
            title text,
            thumbnail text,
            product_handle text,
            created_at timestamp DEFAULT now(),
            updated_at timestamp DEFAULT now()
          );
        `)

        await client.query('CREATE INDEX IF NOT EXISTS idx_store_order_items_order_id ON store_order_items(order_id);')
        await client.query('CREATE INDEX IF NOT EXISTS idx_store_orders_payment_intent_id ON store_orders(payment_intent_id);')
        await client.query(`
          CREATE TABLE IF NOT EXISTS store_product_reviews (
            id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
            order_id uuid NOT NULL REFERENCES store_orders(id) ON DELETE CASCADE,
            product_id text NOT NULL,
            customer_id uuid REFERENCES store_customers(id) ON DELETE SET NULL,
            rating integer NOT NULL CHECK (rating >= 1 AND rating <= 5),
            comment text,
            customer_name text,
            created_at timestamptz DEFAULT now(),
            updated_at timestamptz DEFAULT now(),
            UNIQUE(order_id, product_id)
          );
        `).catch(() => {})
        await client.query(`
  CREATE TABLE IF NOT EXISTS store_shipping_groups (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    carrier_id uuid REFERENCES store_shipping_carriers(id) ON DELETE SET NULL,
    name varchar(200) NOT NULL,
    created_at timestamp DEFAULT now(),
    updated_at timestamp DEFAULT now()
  );
`).catch(() => {})
        await client.query(`
  CREATE TABLE IF NOT EXISTS store_shipping_prices (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    group_id uuid NOT NULL REFERENCES store_shipping_groups(id) ON DELETE CASCADE,
    country_code varchar(10) NOT NULL,
    price_cents integer NOT NULL DEFAULT 0,
    created_at timestamp DEFAULT now(),
    UNIQUE(group_id, country_code)
  );
`).catch(() => {})
        await client.query(`ALTER TABLE store_shipping_groups ADD COLUMN IF NOT EXISTS seller_id varchar(255) DEFAULT NULL`).catch(() => {})
        await client.query(`ALTER TABLE store_order_items ADD COLUMN IF NOT EXISTS product_id text`).catch(() => {})
        // Backfill product_id for old order items that have a product_handle
        await client.query(`
          UPDATE store_order_items soi
          SET product_id = p.id::text
          FROM admin_hub_products p
          WHERE soi.product_id IS NULL
            AND soi.product_handle IS NOT NULL
            AND soi.product_handle <> ''
            AND p.handle = soi.product_handle
        `).catch(() => {})
        await client.query('CREATE INDEX IF NOT EXISTS idx_store_product_reviews_product ON store_product_reviews(product_id)').catch(() => {})
        await client.query('CREATE INDEX IF NOT EXISTS idx_store_product_reviews_customer ON store_product_reviews(customer_id)').catch(() => {})
        await client.query(`ALTER TABLE store_product_reviews ADD COLUMN IF NOT EXISTS seller_id varchar(255)`).catch(() => {})
        await client.query('CREATE INDEX IF NOT EXISTS idx_store_product_reviews_seller ON store_product_reviews(seller_id)').catch(() => {})
        await client.query(`UPDATE store_product_reviews r SET seller_id = p.seller_id FROM admin_hub_products p WHERE r.seller_id IS NULL AND p.id::text = r.product_id`).catch(() => {})
        await client.query(`ALTER TABLE admin_hub_seller_settings ADD COLUMN IF NOT EXISTS review_avg numeric(4,2)`).catch(() => {})
        await client.query(`ALTER TABLE admin_hub_seller_settings ADD COLUMN IF NOT EXISTS review_count integer NOT NULL DEFAULT 0`).catch(() => {})
        await client.query(`
          INSERT INTO admin_hub_seller_settings (seller_id, review_avg, review_count, updated_at)
          SELECT r.seller_id,
                 ROUND(AVG(r.rating)::numeric, 2)::float,
                 COUNT(*)::int,
                 now()
          FROM store_product_reviews r
          WHERE r.seller_id IS NOT NULL AND TRIM(COALESCE(r.seller_id, '')) <> ''
          GROUP BY r.seller_id
          ON CONFLICT (seller_id) DO UPDATE SET
            review_avg = EXCLUDED.review_avg,
            review_count = EXCLUDED.review_count,
            updated_at = now()
        `).catch(() => {})
        await client.query(`
  CREATE TABLE IF NOT EXISTS admin_hub_landing_page (
    id INTEGER PRIMARY KEY DEFAULT 1,
    containers JSONB NOT NULL DEFAULT '[]',
    updated_at TIMESTAMPTZ DEFAULT NOW()
  );
`).catch(() => {})
        await client.query(`
  CREATE TABLE IF NOT EXISTS admin_hub_landing_pages (
    page_id varchar(100) PRIMARY KEY,
    containers JSONB NOT NULL DEFAULT '[]',
    updated_at TIMESTAMPTZ DEFAULT NOW()
  );
`).catch(() => {})
        await client.query(`
  CREATE TABLE IF NOT EXISTS admin_hub_landing_categories (
    category_id varchar(255) PRIMARY KEY,
    containers JSONB NOT NULL DEFAULT '[]',
    settings JSONB NOT NULL DEFAULT '{}',
    updated_at TIMESTAMPTZ DEFAULT NOW()
  );
`).catch(() => {})
        await client.query(`ALTER TABLE admin_hub_landing_page ADD COLUMN IF NOT EXISTS settings JSONB NOT NULL DEFAULT '{}'::jsonb`).catch(() => {})
        await client.query(`ALTER TABLE admin_hub_landing_pages ADD COLUMN IF NOT EXISTS settings JSONB NOT NULL DEFAULT '{}'::jsonb`).catch(() => {})
        await client.query(`
  CREATE TABLE IF NOT EXISTS admin_hub_styles (
    key varchar(50) PRIMARY KEY,
    value JSONB
  );
`).catch(() => {})
        // Seller users table for authentication
        await client.query(`
  CREATE TABLE IF NOT EXISTS seller_users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email varchar(255) UNIQUE NOT NULL,
    password_hash varchar(255) NOT NULL,
    store_name varchar(255) DEFAULT '',
    seller_id varchar(255) UNIQUE NOT NULL,
    is_superuser boolean DEFAULT false,
    created_at timestamp DEFAULT now(),
    updated_at timestamp DEFAULT now()
  );
`).catch(() => {})
        // Seller product groups (dynamic product groups for campaigns)
        await client.query(`
          CREATE TABLE IF NOT EXISTS seller_product_groups (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            seller_id text NOT NULL,
            name text NOT NULL,
            description text DEFAULT '',
            product_ids jsonb NOT NULL DEFAULT '[]',
            filter_rules jsonb DEFAULT '{}',
            created_at timestamptz DEFAULT now(),
            updated_at timestamptz DEFAULT now()
          );
        `).catch(() => {})
        await client.query(`CREATE INDEX IF NOT EXISTS idx_spg_seller ON seller_product_groups(seller_id)`).catch(() => {})
        // Seller campaigns (Aktionen/Kampagnen)
        await client.query(`
          CREATE TABLE IF NOT EXISTS seller_campaigns (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            seller_id text NOT NULL,
            name text NOT NULL,
            description text DEFAULT '',
            status text NOT NULL DEFAULT 'draft',
            start_at timestamptz,
            end_at timestamptz,
            discount_type text NOT NULL DEFAULT 'percentage',
            discount_value numeric(10,2) NOT NULL DEFAULT 0,
            target_type text NOT NULL DEFAULT 'products',
            product_ids jsonb NOT NULL DEFAULT '[]',
            group_ids jsonb NOT NULL DEFAULT '[]',
            settings jsonb DEFAULT '{}',
            created_at timestamptz DEFAULT now(),
            updated_at timestamptz DEFAULT now()
          );
        `).catch(() => {})
        await client.query(`CREATE INDEX IF NOT EXISTS idx_sc_seller ON seller_campaigns(seller_id)`).catch(() => {})
        await client.query(`CREATE INDEX IF NOT EXISTS idx_sc_status ON seller_campaigns(status)`).catch(() => {})
        // PPC ad columns on seller_campaigns
        await client.query(`ALTER TABLE seller_campaigns ADD COLUMN IF NOT EXISTS campaign_type text NOT NULL DEFAULT 'internal'`).catch(() => {})
        await client.query(`ALTER TABLE seller_campaigns ADD COLUMN IF NOT EXISTS budget_daily_cents integer NOT NULL DEFAULT 0`).catch(() => {})
        await client.query(`ALTER TABLE seller_campaigns ADD COLUMN IF NOT EXISTS bid_strategy text NOT NULL DEFAULT 'cpc'`).catch(() => {})
        await client.query(`ALTER TABLE seller_campaigns ADD COLUMN IF NOT EXISTS ad_platforms jsonb NOT NULL DEFAULT '[]'`).catch(() => {})
        await client.query(`ALTER TABLE seller_campaigns ADD COLUMN IF NOT EXISTS ad_status text NOT NULL DEFAULT 'draft'`).catch(() => {})
        await client.query(`ALTER TABLE seller_campaigns ADD COLUMN IF NOT EXISTS external_campaign_ids jsonb NOT NULL DEFAULT '{}'`).catch(() => {})
        await client.query(`ALTER TABLE seller_campaigns ADD COLUMN IF NOT EXISTS stripe_charge_id text`).catch(() => {})
        await client.query(`ALTER TABLE seller_campaigns ADD COLUMN IF NOT EXISTS variant_ids jsonb NOT NULL DEFAULT '[]'`).catch(() => {})
        // Platform marketing accounts (superuser-managed)
        await client.query(`
          CREATE TABLE IF NOT EXISTS platform_marketing_accounts (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            platform text NOT NULL,
            display_name text NOT NULL DEFAULT '',
            credentials jsonb NOT NULL DEFAULT '{}',
            is_active boolean NOT NULL DEFAULT true,
            created_at timestamptz DEFAULT now(),
            updated_at timestamptz DEFAULT now()
          );
        `).catch(() => {})
        await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_pma_platform ON platform_marketing_accounts(platform)`).catch(() => {})
        await client.end()
        log.info('Admin Hub: seller_campaigns (PPC columns), platform_marketing_accounts tabloları hazır')
      } catch (migErr) {
        console.warn('Admin Hub migration (menus) skipped or failed:', migErr && migErr.message)
      }
    }

    // Proje loader'ları: adminHubService ve regionService container'a register edilir (.js = Render'da güvenilir)
    try {
      const adminHubServiceLoader = require(path.join(__dirname, 'loaders', 'admin-hub-service-loader.js'))
      const load = adminHubServiceLoader.default || adminHubServiceLoader
      await load(container)
    } catch (e) {
      console.error('adminHubServiceLoader failed:', e && e.message)
      if (e && e.stack) console.error(e.stack)
    }
    try {
      const regionServiceLoader = require(path.join(__dirname, 'loaders', 'region-service-loader.js'))
      const loadRegion = regionServiceLoader.default || regionServiceLoader
      await loadRegion(container)
    } catch (e) {
      console.error('regionServiceLoader failed:', e && e.message)
      if (e && e.stack) console.error(e.stack)
    }

    // Custom route'lar için scope (container kullan; adminHubService, regionService, productService)
    httpApp.use(['/admin-hub', '/admin', '/store'], (req, res, next) => {
      if (!req.scope) req.scope = container
      next()
    })

    // Public store endpoints: stale-while-revalidate cache headers
    // Private paths (cart, orders, customer, payment) must NOT be cached publicly.
    httpApp.use('/store', (req, res, next) => {
      if (req.method !== 'GET') return next()
      const p = req.path // e.g. /products, /products/my-handle, /collections
      // Never cache personal / transactional endpoints
      const noCache = ['/carts', '/orders', '/customers', '/payment', '/wishlist', '/payment-methods', '/public-payment-config']
      if (noCache.some((prefix) => p === prefix || p.startsWith(prefix + '/'))) return next()
      // Menus and categories change rarely
      if (p === '/menus' || p === '/menu-locations') {
        res.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=3600')
      } else if (p === '/categories' || p.startsWith('/categories/')) {
        res.set('Cache-Control', 'public, max-age=120, stale-while-revalidate=600')
      } else if (p === '/collections' || p.startsWith('/collections/')) {
        res.set('Cache-Control', 'public, max-age=120, stale-while-revalidate=600')
      } else if (p === '/brands' || p.startsWith('/brands/')) {
        res.set('Cache-Control', 'public, max-age=120, stale-while-revalidate=600')
      } else if (p === '/products' || p.startsWith('/products/')) {
        res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300')
        res.set('Vary', 'Accept-Encoding')
      } else if (p.startsWith('/seller-settings') || p.startsWith('/seller-profile') || p.startsWith('/approved-seller-ids')) {
        res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300')
      } else if (p.startsWith('/page-by-label-slug/')) {
        res.set('Cache-Control', 'public, max-age=120, stale-while-revalidate=3600')
      }
      // All others: no explicit cache header (Express default: no Cache-Control)
      next()
    })

    // --- Kategoriler: Route'lar her zaman kayıtlı; handler içinde adminHubService resolve edilir (404 yerine 503 döner) ---
    const resolveAdminHub = () => {
      try {
        return container.resolve('adminHubService')
      } catch (e) {
        return null
      }
    }

    /** Row mapper + PG fallback when AdminHubService loader fails (Medusa manager / TypeORM init issues). */
    const mapAdminHubCategoryPgRow = (row) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      description: row.description,
      parent_id: row.parent_id,
      active: row.active,
      is_visible: row.is_visible,
      has_collection: row.has_collection,
      sort_order: row.sort_order,
      seo_title: row.seo_title,
      seo_description: row.seo_description,
      long_content: row.long_content,
      banner_image_url: row.banner_image_url,
      metadata: row.metadata,
      created_at: row.created_at,
      updated_at: row.updated_at,
    })

    const buildAdminHubCategoryTreeFromFlat = (flat) => {
      const categoryMap = new Map()
      flat.forEach((cat) => categoryMap.set(cat.id, { ...cat, children: [] }))
      const roots = []
      flat.forEach((cat) => {
        const node = categoryMap.get(cat.id)
        if (cat.parent_id && categoryMap.has(cat.parent_id)) {
          categoryMap.get(cat.parent_id).children.push(node)
        } else {
          roots.push(node)
        }
      })
      const sortCategories = (cats) =>
        cats
          .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
          .map((cat) => ({
            ...cat,
            children: cat.children && cat.children.length ? sortCategories(cat.children) : [],
          }))
      return sortCategories(roots)
    }

    /** PG client for Admin Hub categories (routes register before getProductsDbClient in this file). */
    const getCategoriesPgClient = () => {
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      if (!dbUrl || !dbUrl.startsWith('postgres')) return null
      const { Client } = require('pg')
      return new Client({
        connectionString: dbUrl,
        ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false,
      })
    }

    const categoriesPgUnavailable = (res) =>
      res.status(503).json({
        message:
          'DATABASE_URL yok veya postgres değil. Render/hosting ortamında Postgres bağlantı dizesini ayarlayın (postgresql:// veya postgres://). Admin Hub TypeORM servisi kapalı olsa bile kategoriler veritabanından okunabilir.',
        code: 'DATABASE_URL_MISSING',
      })

    const syncCategoryCmsToCollectionFromBody = async (body) => {
      try {
        const meta = (body && typeof body.metadata === 'object' && body.metadata) || {}
        const linkedId = (meta.collection_id || '').toString().trim()
        if (!linkedId) return
        const patchMeta = {
          ...(meta.display_title !== undefined ? { display_title: meta.display_title || null } : {}),
          ...(meta.meta_title !== undefined ? { meta_title: meta.meta_title || null } : {}),
          ...(meta.meta_description !== undefined ? { meta_description: meta.meta_description || null } : {}),
          ...(meta.keywords !== undefined ? { keywords: meta.keywords || null } : {}),
          ...(meta.richtext !== undefined ? { richtext: meta.richtext || null } : {}),
          ...(meta.image_url !== undefined ? { image_url: meta.image_url || null } : {}),
          ...(meta.banner_image_url !== undefined ? { banner_image_url: meta.banner_image_url || null } : {}),
        }
        if (Object.keys(patchMeta).length === 0) return
        await updateAdminHubCollectionDb(linkedId, null, null, patchMeta)
      } catch (e) {
        console.warn('syncCategoryCmsToCollectionFromBody:', e && e.message)
      }
    }

    const adminHubCategoriesPOST_fallbackPg = async (req, res) => {
      const client = getCategoriesPgClient()
      if (!client) return categoriesPgUnavailable(res)
      const b = req.body || {}
      const name = b.name
      const slug = b.slug
      if (!name || !slug) return res.status(400).json({ message: 'name ve slug zorunludur' })
      try {
        await client.connect()
        const dup = await client.query(`SELECT id FROM admin_hub_categories WHERE LOWER(TRIM(slug)) = LOWER(TRIM($1)) LIMIT 1`, [String(slug).trim()])
        if (dup.rows[0]) {
          await client.end()
          return res.status(409).json({ message: 'Bu slug zaten kullanılıyor' })
        }
        const metaVal = b.metadata !== undefined && b.metadata !== null && typeof b.metadata === 'object' ? JSON.stringify(b.metadata) : null
        const ir = await client.query(
          `INSERT INTO admin_hub_categories
            (name, slug, description, parent_id, active, is_visible, has_collection, sort_order, seo_title, seo_description, long_content, banner_image_url, metadata)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,CASE WHEN $13::text IS NULL THEN NULL ELSE $13::jsonb END)
           RETURNING *`,
          [
            String(name).trim(),
            String(slug).trim(),
            b.description != null ? String(b.description) : null,
            b.parent_id || null,
            b.active !== undefined ? !!b.active : true,
            b.is_visible !== undefined ? !!b.is_visible : true,
            b.has_collection !== undefined ? !!b.has_collection : false,
            parseInt(b.sort_order, 10) || 0,
            b.seo_title != null ? String(b.seo_title) : null,
            b.seo_description != null ? String(b.seo_description) : null,
            b.long_content != null ? String(b.long_content) : null,
            b.banner_image_url != null ? String(b.banner_image_url) : null,
            metaVal,
          ]
        )
        await client.end()
        const category = mapAdminHubCategoryPgRow(ir.rows[0])
        await syncCategoryCmsToCollectionFromBody(b)
        return res.status(201).json({ category })
      } catch (e) {
        try {
          await client.end()
        } catch (_) {}
        console.error('Admin Hub Categories POST (PG fallback):', e)
        return res.status(500).json({ message: (e && e.message) || 'Internal server error' })
      }
    }

    const adminHubCategoryByIdGET_fallbackPg = async (req, res) => {
      const client = getCategoriesPgClient()
      if (!client) return categoriesPgUnavailable(res)
      const id = (req.params.id || '').trim()
      if (!id) return res.status(400).json({ message: 'id required' })
      try {
        await client.connect()
        const r = await client.query(`SELECT * FROM admin_hub_categories WHERE id = $1::uuid`, [id])
        await client.end()
        if (!r.rows[0]) return res.status(404).json({ message: 'Category not found' })
        return res.json({ category: mapAdminHubCategoryPgRow(r.rows[0]) })
      } catch (e) {
        try {
          await client.end()
        } catch (_) {}
        console.error('Admin Hub Category GET (PG fallback):', e)
        return res.status(500).json({ message: (e && e.message) || 'Internal server error' })
      }
    }

    const adminHubCategoryByIdPUT_fallbackPg = async (req, res) => {
      const client = getCategoriesPgClient()
      if (!client) return categoriesPgUnavailable(res)
      const id = (req.params.id || '').trim()
      const body = req.body || {}
      if (!id) return res.status(400).json({ message: 'id required' })
      try {
        await client.connect()
        const ex = await client.query(`SELECT * FROM admin_hub_categories WHERE id = $1::uuid`, [id])
        if (!ex.rows[0]) {
          await client.end()
          return res.status(404).json({ message: 'Category not found' })
        }
        const row = ex.rows[0]
        if (body.slug != null && String(body.slug).trim() !== String(row.slug || '').trim()) {
          const dup = await client.query(
            `SELECT id FROM admin_hub_categories WHERE LOWER(TRIM(slug)) = LOWER(TRIM($1)) AND id <> $2::uuid LIMIT 1`,
            [String(body.slug).trim(), id]
          )
          if (dup.rows[0]) {
            await client.end()
            return res.status(409).json({ message: 'Bu slug zaten kullanılıyor' })
          }
        }
        let mergedMeta = row.metadata && typeof row.metadata === 'object' ? { ...row.metadata } : {}
        if (body.metadata !== undefined && body.metadata !== null && typeof body.metadata === 'object') {
          mergedMeta = { ...mergedMeta, ...body.metadata }
        }
        const next = {
          name: body.name !== undefined ? String(body.name).trim() : row.name,
          slug: body.slug !== undefined ? String(body.slug).trim() : row.slug,
          description: body.description !== undefined ? (body.description === '' ? null : String(body.description)) : row.description,
          parent_id: body.parent_id !== undefined ? body.parent_id || null : row.parent_id,
          active: body.active !== undefined ? !!body.active : row.active,
          is_visible: body.is_visible !== undefined ? !!body.is_visible : row.is_visible,
          has_collection: body.has_collection !== undefined ? !!body.has_collection : row.has_collection,
          sort_order: body.sort_order !== undefined ? parseInt(body.sort_order, 10) || 0 : row.sort_order,
          seo_title: body.seo_title !== undefined ? (body.seo_title === '' ? null : String(body.seo_title)) : row.seo_title,
          seo_description: body.seo_description !== undefined ? (body.seo_description === '' ? null : String(body.seo_description)) : row.seo_description,
          long_content: body.long_content !== undefined ? (body.long_content === '' ? null : String(body.long_content)) : row.long_content,
          banner_image_url: body.banner_image_url !== undefined ? (body.banner_image_url === '' ? null : String(body.banner_image_url)) : row.banner_image_url,
          metadata: Object.keys(mergedMeta).length ? mergedMeta : null,
        }
        const ur = await client.query(
          `UPDATE admin_hub_categories SET
            name = $1, slug = $2, description = $3, parent_id = $4, active = $5, is_visible = $6, has_collection = $7,
            sort_order = $8, seo_title = $9, seo_description = $10, long_content = $11, banner_image_url = $12,
            metadata = CASE WHEN $13::text IS NULL THEN NULL ELSE $13::jsonb END, updated_at = now()
           WHERE id = $14::uuid RETURNING *`,
          [
            next.name,
            next.slug,
            next.description,
            next.parent_id,
            next.active,
            next.is_visible,
            next.has_collection,
            next.sort_order,
            next.seo_title,
            next.seo_description,
            next.long_content,
            next.banner_image_url,
            next.metadata ? JSON.stringify(next.metadata) : null,
            id,
          ]
        )
        await client.end()
        const category = mapAdminHubCategoryPgRow(ur.rows[0])
        try {
          const meta = (body.metadata && typeof body.metadata === 'object' && body.metadata) || {}
          const categoryMeta = category.metadata && typeof category.metadata === 'object' ? category.metadata : {}
          const linkedId = (meta.collection_id || categoryMeta.collection_id || '').toString().trim()
          if (linkedId) {
            const patchMeta = {
              ...(meta.display_title !== undefined ? { display_title: meta.display_title || null } : {}),
              ...(meta.meta_title !== undefined ? { meta_title: meta.meta_title || body.seo_title || null } : {}),
              ...(meta.meta_description !== undefined ? { meta_description: meta.meta_description || body.seo_description || null } : {}),
              ...(meta.keywords !== undefined ? { keywords: meta.keywords || null } : {}),
              ...(meta.richtext !== undefined ? { richtext: meta.richtext || body.long_content || null } : {}),
              ...(meta.image_url !== undefined ? { image_url: meta.image_url || null } : {}),
              ...(meta.banner_image_url !== undefined ? { banner_image_url: meta.banner_image_url || body.banner_image_url || null } : {}),
            }
            if (Object.keys(patchMeta).length > 0) {
              await updateAdminHubCollectionDb(linkedId, null, null, patchMeta)
            }
          }
        } catch (cmsErr) {
          console.warn('syncCategoryCmsToCollection (PUT PG):', cmsErr && cmsErr.message)
        }
        return res.json({ category })
      } catch (e) {
        try {
          await client.end()
        } catch (_) {}
        console.error('Admin Hub Category PUT (PG fallback):', e)
        return res.status(500).json({ message: (e && e.message) || 'Internal server error' })
      }
    }

    const adminHubCategoryByIdDELETE_fallbackPg = async (req, res) => {
      const client = getCategoriesPgClient()
      if (!client) return categoriesPgUnavailable(res)
      const id = (req.params.id || '').trim()
      if (!id) return res.status(400).json({ message: 'id required' })
      try {
        await client.connect()
        const ch = await client.query(`SELECT COUNT(*)::int AS n FROM admin_hub_categories WHERE parent_id = $1::uuid`, [id])
        if (Number(ch.rows[0]?.n || 0) > 0) {
          await client.end()
          return res.status(400).json({ message: 'Alt kategoriler varken silinemez. Önce alt kategorileri taşıyın veya silin.' })
        }
        const dr = await client.query(`DELETE FROM admin_hub_categories WHERE id = $1::uuid RETURNING id`, [id])
        await client.end()
        if (!dr.rows[0]) return res.status(404).json({ message: 'Category not found' })
        return res.status(200).json({ deleted: true })
      } catch (e) {
        try {
          await client.end()
        } catch (_) {}
        console.error('Admin Hub Category DELETE (PG fallback):', e)
        return res.status(500).json({ message: (e && e.message) || 'Internal server error' })
      }
    }

    const slugFromImportKeyPg = (key) => {
      const slug = String(key || '')
        .toLowerCase()
        .trim()
        .replace(/\|/g, '-')
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '') || 'category'
      return slug.slice(0, 255)
    }

    const adminHubCategoriesImportPOST_fallbackPg = async (req, res) => {
      const client = getCategoriesPgClient()
      if (!client) return categoriesPgUnavailable(res)
      const { items } = req.body || {}
      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ message: 'items array is required and must not be empty' })
      }
      const idByKey = new Map()
      const slugCount = new Map()
      const categories = []
      try {
        await client.connect()
        for (const item of items) {
          const key = String(item.key || '').trim()
          const label = String(item.label || '').trim()
          if (!key || !label) continue
          let baseSlug = slugFromImportKeyPg(key)
          const sc = (slugCount.get(baseSlug) || 0) + 1
          slugCount.set(baseSlug, sc)
          const slug = sc === 1 ? baseSlug : `${baseSlug}-${sc - 1}`
          const parent_id = item.parentKey === '' || item.parentKey == null ? null : idByKey.get(String(item.parentKey).trim()) || null
          const sort_order = Number(item.sortOrder) || 0
          const ir = await client.query(
            `INSERT INTO admin_hub_categories
              (name, slug, description, parent_id, active, is_visible, has_collection, sort_order, metadata)
             VALUES ($1,$2,NULL,$3,true,true,false,$4,NULL)
             RETURNING *`,
            [label, slug, parent_id, sort_order]
          )
          const row = ir.rows[0]
          idByKey.set(key, row.id)
          categories.push(mapAdminHubCategoryPgRow(row))
        }
        await client.end()
        return res.status(201).json({ imported: categories.length, categories })
      } catch (e) {
        try {
          await client.end()
        } catch (_) {}
        console.error('Admin Hub Categories import (PG fallback):', e)
        return res.status(500).json({ message: (e && e.message) || 'Import failed' })
      }
    }

    const adminHubCategoriesGET_fallbackPg = async (req, res) => {
      const client = getCategoriesPgClient()
      if (!client) return categoriesPgUnavailable(res)
      try {
        await client.connect()
        const { active, parent_id, tree, is_visible, slug } = req.query

        if (slug && typeof slug === 'string') {
          const r = await client.query(`SELECT * FROM admin_hub_categories WHERE slug = $1 LIMIT 1`, [slug])
          if (!r.rows[0]) return res.status(404).json({ message: 'Category not found' })
          const category = mapAdminHubCategoryPgRow(r.rows[0])
          return res.json({ category, categories: [category], count: 1 })
        }

        if (tree === 'true') {
          const r = await client.query(
            `SELECT * FROM admin_hub_categories WHERE active = true ORDER BY sort_order ASC, name ASC`
          )
          let filtered = r.rows.map(mapAdminHubCategoryPgRow)
          if (is_visible !== undefined) {
            const vis = is_visible === 'true'
            filtered = filtered.filter((c) => c.is_visible === vis)
          }
          const categoryTree = buildAdminHubCategoryTreeFromFlat(filtered)
          return res.json({ tree: categoryTree, categories: categoryTree, count: categoryTree.length })
        }

        let sql = `SELECT * FROM admin_hub_categories WHERE 1=1`
        const params = []
        let i = 1
        if (active !== undefined) {
          sql += ` AND active = $${i++}`
          params.push(active === 'true')
        }
        if (parent_id !== undefined) {
          if (parent_id === 'null' || parent_id === '') {
            sql += ` AND parent_id IS NULL`
          } else {
            sql += ` AND parent_id = $${i++}`
            params.push(parent_id)
          }
        }
        if (is_visible !== undefined) {
          sql += ` AND is_visible = $${i++}`
          params.push(is_visible === 'true')
        }
        sql += ` ORDER BY sort_order ASC, name ASC`
        const r = await client.query(sql, params)
        const categories = r.rows.map(mapAdminHubCategoryPgRow)
        return res.json({ categories, count: categories.length })
      } catch (e) {
        const msg = e && e.message ? String(e.message) : ''
        if (msg.includes('does not exist') || msg.includes('admin_hub_categories')) {
          console.warn('Admin Hub Categories GET (PG fallback): table missing?', msg)
          return res.json({ categories: [], count: 0 })
        }
        console.error('Admin Hub Categories GET (PG fallback) error:', e)
        return res.status(500).json({ message: msg || 'Internal server error' })
      } finally {
        await client.end().catch(() => {})
      }
    }

    const adminHubCategoriesGET = async (req, res) => {
      const adminHubService = resolveAdminHub()
      if (adminHubService) {
        try {
          const { active, parent_id, tree, is_visible, slug } = req.query
          if (slug && typeof slug === 'string') {
            const category = await adminHubService.getCategoryBySlug(slug)
            if (!category) return res.status(404).json({ message: 'Category not found' })
            return res.json({ category, categories: [category], count: 1 })
          }
          if (tree === 'true') {
            const filters = {}
            if (is_visible !== undefined) filters.is_visible = is_visible === 'true'
            const categoryTree = await adminHubService.getCategoryTree(filters)
            return res.json({ tree: categoryTree, categories: categoryTree, count: categoryTree.length })
          }
          const filters = {}
          if (active !== undefined) filters.active = active === 'true'
          if (parent_id !== undefined) filters.parent_id = parent_id === 'null' ? null : parent_id
          if (is_visible !== undefined) filters.is_visible = is_visible === 'true'
          const categories = await adminHubService.listCategories(filters)
          return res.json({ categories, count: categories.length })
        } catch (err) {
          console.warn('Admin Hub Categories GET (service) failed, PG fallback:', err && err.message)
        }
      } else {
        console.warn('Admin Hub Categories GET: adminHubService not loaded — PG fallback')
      }
      return adminHubCategoriesGET_fallbackPg(req, res)
    }
    const adminHubCategoriesPOST = async (req, res) => {
      const adminHubService = resolveAdminHub()
      const b = req.body || {}
      const name = b.name
      const slug = b.slug
      if (!name || !slug) return res.status(400).json({ message: 'name ve slug zorunludur' })
      if (adminHubService) {
        try {
          const category = await adminHubService.createCategory({
            name,
            slug,
            description: b.description || undefined,
            parent_id: b.parent_id || null,
            active: b.active !== undefined ? b.active : true,
            is_visible: b.is_visible !== undefined ? b.is_visible : true,
            has_collection: b.has_collection !== undefined ? b.has_collection : false,
            sort_order: b.sort_order || 0,
            seo_title: b.seo_title || null,
            seo_description: b.seo_description || null,
            long_content: b.long_content || null,
            banner_image_url: b.banner_image_url || null,
            metadata: b.metadata,
          })
          await syncCategoryCmsToCollectionFromBody(b)
          return res.status(201).json({ category })
        } catch (err) {
          console.warn('Admin Hub Categories POST (service) failed, PG fallback:', err && err.message)
        }
      } else {
        console.warn('Admin Hub Categories POST: adminHubService not loaded — PG fallback')
      }
      return adminHubCategoriesPOST_fallbackPg(req, res)
    }
    const adminHubCategoriesImportPOST = async (req, res) => {
      const { items } = req.body || {}
      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ message: 'items array is required and must not be empty' })
      }
      const adminHubService = resolveAdminHub()
      if (adminHubService) {
        try {
          const { imported, categories } = await adminHubService.importCategories(items)
          return res.status(201).json({ imported, categories })
        } catch (err) {
          console.warn('Admin Hub Categories import (service) failed, PG fallback:', err && err.message)
        }
      } else {
        console.warn('Admin Hub Categories import: adminHubService not loaded — PG fallback')
      }
      return adminHubCategoriesImportPOST_fallbackPg(req, res)
    }
    const adminHubCategoryByIdGET = async (req, res) => {
      const adminHubService = resolveAdminHub()
      if (adminHubService) {
        try {
          const category = await adminHubService.getCategoryById(req.params.id)
          if (!category) return res.status(404).json({ message: 'Category not found' })
          return res.json({ category })
        } catch (err) {
          console.warn('Admin Hub Category GET (service) failed, PG fallback:', err && err.message)
        }
      } else {
        console.warn('Admin Hub Category GET: adminHubService not loaded — PG fallback')
      }
      return adminHubCategoryByIdGET_fallbackPg(req, res)
    }
    const adminHubCategoryByIdPUT = async (req, res) => {
      const adminHubService = resolveAdminHub()
      const body = req.body || {}
      if (adminHubService) {
        try {
          const category = await adminHubService.updateCategory(req.params.id, body)
          try {
            const meta = (body && typeof body.metadata === 'object' && body.metadata) || {}
            const categoryMeta = category && category.metadata && typeof category.metadata === 'object' ? category.metadata : {}
            const linkedId = (meta.collection_id || categoryMeta.collection_id || '').toString().trim()
            if (linkedId) {
              const patchMeta = {
                ...(meta.display_title !== undefined ? { display_title: meta.display_title || null } : {}),
                ...(meta.meta_title !== undefined ? { meta_title: meta.meta_title || body.seo_title || null } : {}),
                ...(meta.meta_description !== undefined ? { meta_description: meta.meta_description || body.seo_description || null } : {}),
                ...(meta.keywords !== undefined ? { keywords: meta.keywords || null } : {}),
                ...(meta.richtext !== undefined ? { richtext: meta.richtext || body.long_content || null } : {}),
                ...(meta.image_url !== undefined ? { image_url: meta.image_url || null } : {}),
                ...(meta.banner_image_url !== undefined ? { banner_image_url: meta.banner_image_url || body.banner_image_url || null } : {}),
              }
              if (Object.keys(patchMeta).length > 0) {
                await updateAdminHubCollectionDb(linkedId, null, null, patchMeta)
              }
            }
          } catch (e) {
            console.warn('syncCategoryCmsToCollection (PUT):', e && e.message)
          }
          return res.json({ category })
        } catch (err) {
          console.warn('Admin Hub Category PUT (service) failed, PG fallback:', err && err.message)
        }
      } else {
        console.warn('Admin Hub Category PUT: adminHubService not loaded — PG fallback')
      }
      return adminHubCategoryByIdPUT_fallbackPg(req, res)
    }
    const adminHubCategoryByIdDELETE = async (req, res) => {
      const adminHubService = resolveAdminHub()
      if (adminHubService) {
        try {
          await adminHubService.deleteCategory(req.params.id)
          return res.status(200).json({ deleted: true })
        } catch (err) {
          console.warn('Admin Hub Category DELETE (service) failed, PG fallback:', err && err.message)
        }
      } else {
        console.warn('Admin Hub Category DELETE: adminHubService not loaded — PG fallback')
      }
      return adminHubCategoryByIdDELETE_fallbackPg(req, res)
    }
    httpApp.get('/admin-hub/categories', (req, res) => adminHubCategoriesGET(req, res))
    httpApp.post('/admin-hub/categories', (req, res) => adminHubCategoriesPOST(req, res))
    httpApp.post('/admin-hub/categories/import', (req, res) => adminHubCategoriesImportPOST(req, res))
    httpApp.get('/admin-hub/categories/:id', (req, res) => adminHubCategoryByIdGET(req, res))
    httpApp.put('/admin-hub/categories/:id', (req, res) => adminHubCategoryByIdPUT(req, res))
    httpApp.delete('/admin-hub/categories/:id', (req, res) => adminHubCategoryByIdDELETE(req, res))
    httpApp.get('/admin-hub/v1/categories', (req, res) => adminHubCategoriesGET(req, res))
    httpApp.post('/admin-hub/v1/categories', (req, res) => adminHubCategoriesPOST(req, res))
    httpApp.get('/admin-hub/v1/categories/:id', (req, res) => adminHubCategoryByIdGET(req, res))
    httpApp.put('/admin-hub/v1/categories/:id', (req, res) => adminHubCategoryByIdPUT(req, res))
    httpApp.delete('/admin-hub/v1/categories/:id', (req, res) => adminHubCategoryByIdDELETE(req, res))

    // --- Ürünler: fallback her zaman kayıtlı (404 önlenir); .ts route varsa kullanılır ---
    const runHandler = (handler, req, res) => {
      Promise.resolve(handler(req, res)).catch((err) => {
        console.error('Route handler error:', err)
        res.status(500).json({ message: (err && err.message) || 'Internal server error' })
      })
    }
    const adminProductsFallbackGET = async (req, res) => {
      try {
        const scope = req.scope || container
        let list = []
        const keys = ['productModuleService', 'product_service', 'productService']
        for (const k of keys) {
          try {
            const svc = scope.resolve(k)
            if (!svc) continue
            if (typeof svc.listAndCount === 'function') {
              const [products, count] = await svc.listAndCount({}, { take: 100, skip: 0 })
              list = Array.isArray(products) ? products : (products?.data || [])
              return res.json({ products: list, count: list.length })
            }
            if (typeof svc.listAndCountProducts === 'function') {
              const [products, count] = await svc.listAndCountProducts({}, { take: 100, skip: 0 })
              list = Array.isArray(products) ? products : (products?.data || [])
              return res.json({ products: list, count: list.length })
            }
          } catch (_) {}
        }
        return res.json({ products: [], count: 0 })
      } catch (err) {
        console.error('Admin products GET fallback error:', err)
        return res.json({ products: [], count: 0 })
      }
    }
    let adminProducts = null
    try {
      adminProducts = require(path.join(__dirname, 'api', 'admin', 'products', 'route.ts'))
    } catch (e) {
      console.warn('Load admin/products route (ts):', e.message)
    }
    if (adminProducts && typeof adminProducts.GET === 'function') {
      httpApp.get('/admin/products', (req, res) => runHandler(adminProducts.GET, req, res))
    } else {
      httpApp.get('/admin/products', adminProductsFallbackGET)
    }
    if (adminProducts && typeof adminProducts.POST === 'function') {
      httpApp.post('/admin/products', (req, res) => runHandler(adminProducts.POST, req, res))
    }
    try {
      const adminProductsId = require(path.join(__dirname, 'api', 'admin', 'products', '[id]', 'route.ts'))
      if (adminProductsId && typeof adminProductsId.GET === 'function') {
        httpApp.get('/admin/products/:id', (req, res) => runHandler(adminProductsId.GET, req, res))
      }
    } catch (e) {
      console.warn('Load admin/products/[id] route:', e.message)
    }
    // Store products: serve from Admin Hub so shop shows image, price, EAN (seller central products)
    // Store products list/detail: served from Admin Hub so shop shows image, price, EAN (see admin hub block below)

    // GET /admin/orders – Medusa order servisi varsa listele; yoksa boş liste (404 yerine 200)
    const adminOrdersGET = async (req, res) => {
      try {
        const scope = req.scope || container
        const keys = []
        try {
          const { Modules } = require('@medusajs/framework/utils')
          if (Modules && Modules.ORDER) keys.push(Modules.ORDER)
        } catch (_) {}
        keys.push('orderModuleService', 'order_service', 'orderService')
        for (const key of keys) {
          try {
            const orderService = scope.resolve(key)
            if (!orderService) continue
            const listAndCount = orderService.listAndCountOrders || orderService.listAndCount
            if (typeof listAndCount === 'function') {
              const [orders, count] = await listAndCount.call(orderService, {}, { take: 100, skip: 0 })
              const list = Array.isArray(orders) ? orders : (orders && orders.data ? orders.data : [])
              return res.json({ orders: list, count: typeof count === 'number' ? count : list.length })
            }
            const list = orderService.listOrders || orderService.list
            if (typeof list === 'function') {
              const orders = await list.call(orderService, {}, { take: 100, skip: 0 })
              const arr = Array.isArray(orders) ? orders : (orders && orders.data ? orders.data : [])
              return res.json({ orders: arr, count: arr.length })
            }
          } catch (_) {}
        }
        res.json({ orders: [], count: 0 })
      } catch (err) {
        console.error('Admin orders GET error:', err)
        res.status(500).json({ message: (err && err.message) || 'Internal server error' })
      }
    }
    httpApp.get('/admin/orders', (req, res) => adminOrdersGET(req, res))

    // Title → URL handle (ü→u, ö→o, ı→i, ç→c, ğ→g, ä→ae, ß→ss)
    const slugifyTitle = (str) => {
      if (!str || typeof str !== 'string') return ''
      const map = { ü: 'u', Ü: 'u', ö: 'o', Ö: 'o', ı: 'i', I: 'i', İ: 'i', ç: 'c', Ç: 'c', ğ: 'g', Ğ: 'g', ä: 'ae', Ä: 'ae', ß: 'ss' }
      let s = str.trim()
      for (const [from, to] of Object.entries(map)) s = s.split(from).join(to)
      return s.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
    }

    // Standalone collections (admin_hub_collections) – kategoriye bağlı olmadan
    const listAdminHubCollectionsDb = async () => {
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      if (!dbUrl || !dbUrl.startsWith('postgres')) return []
      try {
        const { Client } = require('pg')
        const isRender = dbUrl.includes('render.com')
        const client = new Client({ connectionString: dbUrl, ssl: isRender ? { rejectUnauthorized: false } : false })
        await client.connect()
        try {
          const res = await client.query('SELECT id, title, handle, metadata FROM admin_hub_collections ORDER BY title')
          return (res.rows || []).map(r => {
            const meta = r.metadata && typeof r.metadata === 'object' ? r.metadata : {}
            return { id: r.id, title: r.title, handle: r.handle, image_url: meta.image_url || null, banner_image_url: meta.banner_image_url || null }
          })
        } finally { await client.end().catch(() => {}) }
      } catch (_) { return [] }
    }
    const createAdminHubCollectionDb = async (title, handle) => {
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      if (!dbUrl || !dbUrl.startsWith('postgres')) return null
      try {
        const { Client } = require('pg')
        const isRender = dbUrl.includes('render.com')
        const client = new Client({ connectionString: dbUrl, ssl: isRender ? { rejectUnauthorized: false } : false })
        await client.connect()
        try {
          const res = await client.query(
            'INSERT INTO admin_hub_collections (title, handle) VALUES ($1, $2) ON CONFLICT (handle) DO UPDATE SET title = $1 RETURNING id, title, handle',
            [title, handle]
          )
          return res.rows && res.rows[0] ? res.rows[0] : null
        } finally { await client.end().catch(() => {}) }
      } catch (e) {
        console.warn('createAdminHubCollectionDb:', e && e.message)
        return null
      }
    }
    const isUuid = (v) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(v || '').trim())
    const updateAdminHubCollectionDb = async (id, title, handle, metadata) => {
      const idStr = (id != null && id !== '') ? String(id).trim() : null
      if (!idStr) return null
      if (!isUuid(idStr)) return null
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      if (!dbUrl || !dbUrl.startsWith('postgres')) return null
      try {
        const { Client } = require('pg')
        const isRender = dbUrl.includes('render.com')
        const client = new Client({ connectionString: dbUrl, ssl: isRender ? { rejectUnauthorized: false } : false })
        await client.connect()
        const idParam = idStr.toLowerCase()
        let metaJson = null
        if (metadata != null && typeof metadata === 'object' && Object.keys(metadata).length > 0) {
          const existing = await client.query('SELECT metadata FROM admin_hub_collections WHERE id = $1::uuid', [idParam])
          const existingMeta = (existing.rows && existing.rows[0] && existing.rows[0].metadata) || {}
          const merged = { ...(typeof existingMeta === 'object' ? existingMeta : {}), ...metadata }
          metaJson = JSON.stringify(merged)
        }
        const res = await client.query(
          'UPDATE admin_hub_collections SET title = COALESCE(NULLIF($2, \'\'), title), handle = COALESCE(NULLIF($3, \'\'), handle), metadata = COALESCE($4, metadata), updated_at = now() WHERE id = $1::uuid RETURNING id, title, handle, metadata',
          [idParam, title || '', handle || '', metaJson]
        )
        await client.end()
        return res.rows && res.rows[0] ? res.rows[0] : null
      } catch (e) {
        console.warn('updateAdminHubCollectionDb:', e && e.message)
        return null
      }
    }
    const deleteAdminHubCollectionDb = async (id) => {
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      if (!dbUrl || !dbUrl.startsWith('postgres')) return false
      try {
        const { Client } = require('pg')
        const isRender = dbUrl.includes('render.com')
        const client = new Client({ connectionString: dbUrl, ssl: isRender ? { rejectUnauthorized: false } : false })
        await client.connect()
        try {
          const res = await client.query('DELETE FROM admin_hub_collections WHERE id = $1 RETURNING id', [id])
          return res.rowCount > 0
        } finally { await client.end().catch(() => {}) }
      } catch (e) {
        console.warn('deleteAdminHubCollectionDb:', e && e.message)
        return false
      }
    }
    const getAdminHubCollectionByIdDb = async (id) => {
      const idStr = (id != null && id !== '') ? String(id).trim() : null
      if (!idStr) return null
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      if (!dbUrl || !dbUrl.startsWith('postgres')) return null
      try {
        const { Client } = require('pg')
        const isRender = dbUrl.includes('render.com')
        const client = new Client({ connectionString: dbUrl, ssl: isRender ? { rejectUnauthorized: false } : false })
        await client.connect()
        const res = await client.query(
          isUuid(idStr)
            ? 'SELECT id, title, handle, metadata FROM admin_hub_collections WHERE id = $1::uuid'
            : 'SELECT id, title, handle, metadata FROM admin_hub_collections WHERE id::text = $1',
          [isUuid(idStr) ? idStr.toLowerCase() : idStr]
        )
        await client.end()
        const r = res.rows && res.rows[0]
        if (!r) return null
        const meta = r.metadata && typeof r.metadata === 'object' ? r.metadata : {}
        return {
          id: r.id,
          title: r.title,
          handle: r.handle,
          category_id: meta.linked_category_id != null && String(meta.linked_category_id).trim() !== '' ? String(meta.linked_category_id).trim() : null,
          display_title: meta.display_title,
          meta_title: meta.meta_title,
          meta_description: meta.meta_description,
          keywords: meta.keywords,
          richtext: meta.richtext,
          description_html: meta.richtext,
          image_url: meta.image_url,
          banner_image_url: meta.banner_image_url,
          recommended_product_ids: Array.isArray(meta.recommended_product_ids) ? meta.recommended_product_ids : [],
        }
      } catch (_) { return null }
    }
    const getAdminHubCollectionByHandleDb = async (handle) => {
      if (!handle || typeof handle !== 'string') return null
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      if (!dbUrl || !dbUrl.startsWith('postgres')) return null
      try {
        const { Client } = require('pg')
        const isRender = dbUrl.includes('render.com')
        const client = new Client({ connectionString: dbUrl, ssl: isRender ? { rejectUnauthorized: false } : false })
        await client.connect()
        try {
          const res = await client.query('SELECT id, title, handle, metadata FROM admin_hub_collections WHERE LOWER(handle) = LOWER($1)', [handle.trim()])
          return res.rows && res.rows[0] ? res.rows[0] : null
        } finally { await client.end().catch(() => {}) }
      } catch (_) { return null }
    }

    // GET /admin/collections – Medusa + has_collection kategorileri + admin_hub_collections (standalone)
    const adminCollectionsGET = async (req, res) => {
      try {
        const scope = req.scope || container
        const medusaOnly = req.query.medusa_only === 'true' || req.query.medusa_only === '1'
        let list = []
        try {
          const svc = scope.resolve('productCollectionService')
          if (svc && typeof svc.list === 'function') {
            const raw = await svc.list({}, { take: 200 })
            list = Array.isArray(raw) ? raw : (raw?.data || [])
          }
        } catch (_) {}
        if (!medusaOnly) {
          const existingIds = new Set(list.map(c => c.id))
          try {
            const standalone = await listAdminHubCollectionsDb()
            standalone.forEach(s => { if (s && s.id && !existingIds.has(s.id)) { existingIds.add(s.id); list.push({ id: s.id, title: s.title, handle: s.handle, _standalone: true }) } })
          } catch (_) {}
          try {
            const adminHub = resolveAdminHub()
            if (adminHub) {
              const categories = await adminHub.listCategories({})
              const withCollection = (categories || []).filter(c => c.has_collection === true)
              for (const c of withCollection) {
                if (!c || !c.id) continue
                const linkedId = c.metadata && typeof c.metadata === 'object' ? c.metadata.collection_id : null
                if (linkedId && !existingIds.has(linkedId)) {
                  const coll = await getAdminHubCollectionByIdDb(linkedId)
                  if (coll) {
                    existingIds.add(coll.id)
                    list.push({ id: coll.id, title: coll.title, handle: coll.handle })
                  }
                } else if (!linkedId && !existingIds.has(c.id)) {
                  existingIds.add(c.id)
                  list.push({ id: c.id, title: c.name, handle: c.slug, _fromCategory: true })
                }
              }
            }
          } catch (_) {}
        }
        res.json({ collections: list, count: list.length })
      } catch (err) {
        console.error('Admin collections GET error:', err)
        res.status(500).json({ message: (err && err.message) || 'Internal server error' })
      }
    }
    httpApp.get('/admin/collections', (req, res) => adminCollectionsGET(req, res))

    const adminCollectionsPOST = async (req, res) => {
      try {
        const scope = req.scope || container
        const b = req.body || {}
        const title = (b.title || '').trim()
        if (!title) return res.status(400).json({ message: 'title is required' })
        const handle = (b.handle || '').trim() || slugifyTitle(title)
        const standalone = b.standalone === true || b.standalone === 'true'
        const categoryId = (b.category_id || '').trim() || null
        if (standalone) {
          const row = await createAdminHubCollectionDb(title, handle)
          if (row) {
            if (categoryId) {
              try {
                const adminHub = resolveAdminHub()
                if (adminHub) {
                  const cat = await adminHub.getCategoryById(categoryId)
                  const prevMeta = cat && cat.metadata && typeof cat.metadata === 'object' ? { ...cat.metadata } : {}
                  const collIdStr = row.id != null ? String(row.id).trim() : row.id
                  await adminHub.updateCategory(categoryId, { has_collection: true, metadata: { ...prevMeta, collection_id: collIdStr } })
                  await updateAdminHubCollectionDb(collIdStr, undefined, undefined, { linked_category_id: categoryId })
                }
              } catch (e) {
                console.warn('createAdminHubCollection link category:', e && e.message)
              }
            }
            const idForClient = row.id != null ? String(row.id).trim() : row.id
            return res.status(201).json({ collection: { id: idForClient, title: row.title, handle: row.handle } })
          }
          return res.status(500).json({ message: 'Failed to create standalone collection' })
        }
        let svc = null
        try { svc = scope.resolve('productCollectionService') } catch (_) {}
        if (!svc) try { svc = scope.resolve('productModuleService') } catch (_) {}
        if (svc) {
          let collection = null
          if (typeof svc.create === 'function') {
            collection = await svc.create({ title, handle })
          } else if (typeof svc.createProductCollections === 'function') {
            const created = await svc.createProductCollections([{ title, handle }])
            collection = Array.isArray(created) ? created[0] : created
          }
          if (collection) return res.status(201).json({ collection })
        }
        const adminHub = resolveAdminHub()
        if (!adminHub) {
          const row = await createAdminHubCollectionDb(title, handle)
          if (row) {
            const idForClient = row.id != null ? String(row.id).trim() : row.id
            return res.status(201).json({ collection: { id: idForClient, title: row.title, handle: row.handle } })
          }
          return res.status(503).json({
            message: 'Collection service not available. Run: node apps/medusa-backend/scripts/run-admin-hub-sql.js',
            code: 'COLLECTION_SERVICE_UNAVAILABLE'
          })
        }
        const row = await createAdminHubCollectionDb(title, handle)
        if (!row) return res.status(500).json({ message: 'Failed to create collection' })
        const category = await adminHub.createCategory({
          name: title,
          slug: handle,
          has_collection: true,
          active: true,
          is_visible: true
        })
        try {
          await adminHub.updateCategory(category.id, { has_collection: true, metadata: { collection_id: row.id } })
        } catch (_) {}
        const idForClient = row.id != null ? String(row.id).trim() : row.id
        res.status(201).json({
          collection: { id: idForClient, title: row.title, handle: row.handle }
        })
      } catch (err) {
        console.error('Admin collections POST error:', err)
        res.status(500).json({ message: (err && err.message) || 'Internal server error' })
      }
    }
    httpApp.post('/admin/collections', (req, res) => adminCollectionsPOST(req, res))
    const adminCollectionByIdPATCH = async (req, res) => {
      try {
        let id = (req.params.id || '').toString().trim().replace(/^\{|\}$/g, '')
        if (!id) return res.status(400).json({ message: 'id is required' })
        const uuidLower = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id) ? id.toLowerCase() : id
        const b = req.body || {}
        const title = (b.title || '').trim()
        const handle = (b.handle || '').trim()
        const categoryId = (b.category_id || '').trim() || null
        const metadata = {}
        if (b.display_title !== undefined) metadata.display_title = b.display_title
        if (b.meta_title !== undefined) metadata.meta_title = b.meta_title
        if (b.meta_description !== undefined) metadata.meta_description = b.meta_description
        if (b.keywords !== undefined) metadata.keywords = b.keywords
        if (b.richtext !== undefined) metadata.richtext = b.richtext
        if (b.image_url !== undefined) metadata.image_url = b.image_url
        if (b.banner_image_url !== undefined) metadata.banner_image_url = b.banner_image_url
        if (b.recommended_product_ids !== undefined) metadata.recommended_product_ids = Array.isArray(b.recommended_product_ids) ? b.recommended_product_ids : []
        const metaObj = Object.keys(metadata).length ? metadata : undefined
        let collectionId = id
        let updated = isUuid(id) ? await updateAdminHubCollectionDb(uuidLower, title || undefined, handle || undefined, metaObj) : null
        if (!updated && isUuid(id) && uuidLower !== id) updated = await updateAdminHubCollectionDb(id, title || undefined, handle || undefined, metaObj)
        if (!updated && !isUuid(id)) {
          const adminHub = resolveAdminHub()
          if (adminHub) {
            try {
              const category = await adminHub.getCategoryById(id)
              if (category && category.has_collection) {
                let linkedId = category.metadata && typeof category.metadata === 'object' ? category.metadata.collection_id : null
                if (linkedId) {
                  updated = await updateAdminHubCollectionDb(linkedId, title || undefined, handle || undefined, metaObj)
                  if (updated) collectionId = linkedId != null ? String(linkedId) : collectionId
                } else {
                  const collTitle = title || category.name || ''
                  const collHandle = handle || (category.slug || slugifyTitle(collTitle))
                  const newRow = await createAdminHubCollectionDb(collTitle, collHandle)
                  if (newRow) {
                    try { await adminHub.updateCategory(category.id, { has_collection: true, metadata: { ...(category.metadata || {}), collection_id: newRow.id } }) } catch (_) {}
                    updated = await updateAdminHubCollectionDb(newRow.id, collTitle || undefined, collHandle || undefined, metaObj)
                    if (updated) collectionId = newRow.id != null ? String(newRow.id) : collectionId
                  }
                }
              }
            } catch (_) {}
          }
          if (!updated && handle) {
            const byHandle = await getAdminHubCollectionByHandleDb(handle)
            if (byHandle) {
              updated = await updateAdminHubCollectionDb(byHandle.id, title || undefined, handle || undefined, metaObj)
              if (updated) collectionId = byHandle.id != null ? String(byHandle.id) : collectionId
            }
          }
        }
        if (!updated && isUuid(id)) {
          const existingById = await getAdminHubCollectionByIdDb(uuidLower)
          const existing = existingById || (id !== uuidLower ? await getAdminHubCollectionByIdDb(id) : null)
          if (existing && existing.id != null) {
            const dbId = String(existing.id).trim()
            updated = await updateAdminHubCollectionDb(dbId, title || undefined, handle || undefined, metaObj)
            if (updated) collectionId = dbId
          }
        }
        if (!updated && handle) {
          const byHandle = await getAdminHubCollectionByHandleDb(handle)
          if (byHandle) {
            updated = await updateAdminHubCollectionDb(byHandle.id, title || undefined, handle || undefined, metaObj)
            if (updated) collectionId = byHandle.id != null ? String(byHandle.id) : collectionId
          }
        }
        if (!updated) {
          const adminHub = resolveAdminHub()
          if (adminHub) {
            try {
              const category = await adminHub.getCategoryById(id)
              if (category && category.has_collection) {
                let linkedId = category.metadata && typeof category.metadata === 'object' ? category.metadata.collection_id : null
                if (linkedId) {
                  updated = await updateAdminHubCollectionDb(linkedId, title || undefined, handle || undefined, metaObj)
                  if (updated) collectionId = linkedId != null ? String(linkedId) : collectionId
                } else {
                  const collTitle = title || category.name || ''
                  const collHandle = handle || (category.slug || slugifyTitle(collTitle))
                  const newRow = await createAdminHubCollectionDb(collTitle, collHandle)
                  if (newRow) {
                    try { await adminHub.updateCategory(category.id, { has_collection: true, metadata: { ...(category.metadata || {}), collection_id: newRow.id } }) } catch (_) {}
                    updated = await updateAdminHubCollectionDb(newRow.id, collTitle || undefined, collHandle || undefined, metaObj)
                    if (updated) collectionId = newRow.id != null ? String(newRow.id) : collectionId
                  }
                }
              }
            } catch (_) {}
          }
        }
        if (!updated && title && handle) {
          const upserted = await createAdminHubCollectionDb(title, handle)
          if (upserted) {
            updated = await updateAdminHubCollectionDb(upserted.id, title, handle, metaObj) || upserted
            if (updated && updated.id) collectionId = String(updated.id)
          }
        }
        if (!updated) return res.status(404).json({ message: 'Collection not found (only standalone collections can be updated here)' })
        const collUuid = String((updated && updated.id) ? updated.id : collectionId).trim()
        const adminHubForLink = resolveAdminHub()
        const hadCategoryLink = (b && Object.prototype.hasOwnProperty.call(b, 'category_id'))
        if (adminHubForLink) {
          try {
            if (categoryId) {
              const rowBeforeLink = await getAdminHubCollectionByIdDb(collUuid)
              const previousCatId = rowBeforeLink && rowBeforeLink.category_id
              if (previousCatId && String(previousCatId) !== String(categoryId)) {
                try {
                  const prevCat = await adminHubForLink.getCategoryById(previousCatId)
                  const pm = prevCat && prevCat.metadata && typeof prevCat.metadata === 'object' ? { ...prevCat.metadata } : {}
                  delete pm.collection_id
                  await adminHubForLink.updateCategory(previousCatId, { has_collection: false, metadata: pm })
                } catch (_) {}
              }
              const cat = await adminHubForLink.getCategoryById(categoryId)
              const prevMeta = cat && cat.metadata && typeof cat.metadata === 'object' ? { ...cat.metadata } : {}
              await adminHubForLink.updateCategory(categoryId, {
                has_collection: true,
                metadata: { ...prevMeta, collection_id: collUuid },
              })
              await updateAdminHubCollectionDb(collUuid, undefined, undefined, { linked_category_id: categoryId })
            } else if (hadCategoryLink && (b.category_id === null || b.category_id === '')) {
              const rowBeforeUnlink = await getAdminHubCollectionByIdDb(collUuid)
              const oldCatId = rowBeforeUnlink && rowBeforeUnlink.category_id
              if (oldCatId) {
                try {
                  const oldCat = await adminHubForLink.getCategoryById(oldCatId)
                  const om = oldCat && oldCat.metadata && typeof oldCat.metadata === 'object' ? { ...oldCat.metadata } : {}
                  delete om.collection_id
                  await adminHubForLink.updateCategory(oldCatId, { has_collection: false, metadata: om })
                } catch (_) {}
              }
              await updateAdminHubCollectionDb(collUuid, undefined, undefined, { linked_category_id: null })
            }
          } catch (e) {
            console.warn('adminCollectionByIdPATCH category link:', e && e.message)
          }
        }
        const finalRow = await getAdminHubCollectionByIdDb(collUuid)
        if (finalRow) return res.json({ collection: { ...finalRow } })
        const meta = (updated.metadata && typeof updated.metadata === 'object') ? updated.metadata : {}
        return res.json({
          collection: {
            id: collectionId,
            title: updated.title,
            handle: updated.handle,
            category_id: meta.linked_category_id || null,
            display_title: meta.display_title,
            meta_title: meta.meta_title,
            meta_description: meta.meta_description,
            keywords: meta.keywords,
            richtext: meta.richtext,
            image_url: meta.image_url,
            banner_image_url: meta.banner_image_url,
            recommended_product_ids: Array.isArray(meta.recommended_product_ids) ? meta.recommended_product_ids : [],
          }
        })
      } catch (err) {
        console.error('Admin collection PATCH error:', err)
        res.status(500).json({ message: (err && err.message) || 'Internal server error' })
      }
    }
    const adminCollectionByIdDELETE = async (req, res) => {
      try {
        const id = (req.params.id || '').toString().trim()
        if (!id) return res.status(400).json({ message: 'id is required' })
        const deleted = await deleteAdminHubCollectionDb(id)
        if (deleted) return res.status(200).json({ deleted: true })
        try {
          const adminHub = resolveAdminHub()
          if (adminHub) {
            const category = await adminHub.getCategoryById(id)
            if (category && category.has_collection) {
              const linkedId = category.metadata && typeof category.metadata === 'object' ? category.metadata.collection_id : null
              if (linkedId) await deleteAdminHubCollectionDb(linkedId)
              await adminHub.updateCategory(id, { has_collection: false, metadata: {} })
              return res.status(200).json({ deleted: true })
            }
          }
        } catch (_) {}
        return res.status(404).json({ message: 'Collection not found' })
      } catch (err) {
        console.error('Admin collection DELETE error:', err)
        res.status(500).json({ message: (err && err.message) || 'Internal server error' })
      }
    }
    const adminCollectionByIdGET = async (req, res) => {
      try {
        const id = (req.params.id || '').toString().trim().replace(/^\{|\}$/g, '')
        if (!id) return res.status(400).json({ message: 'id is required' })
        let row = await getAdminHubCollectionByIdDb(id)
        if (row) return res.json({ collection: { ...row } })
        const adminHub = resolveAdminHub()
        if (adminHub) {
          try {
            const category = await adminHub.getCategoryById(id)
            if (category && category.has_collection) {
              let linkedId = category.metadata && typeof category.metadata === 'object' ? category.metadata.collection_id : null
              if (linkedId) {
                row = await getAdminHubCollectionByIdDb(linkedId)
                if (row) return res.json({ collection: { ...row } })
              }
              const handle = (category.slug || category.name || '').trim() || slugifyTitle(category.name || '')
              const title = (category.name || '').trim() || handle
              const newRow = await createAdminHubCollectionDb(title, handle)
              if (newRow) {
                try {
                  await adminHub.updateCategory(category.id, { has_collection: true, metadata: { ...(category.metadata || {}), collection_id: newRow.id } })
                } catch (_) {}
                row = await getAdminHubCollectionByIdDb(newRow.id)
                if (row) return res.json({ collection: { ...row } })
              }
              return res.json({ collection: { id: category.id, title: category.name, handle: category.slug, display_title: category.name, _fromCategory: true } })
            }
          } catch (_) {}
        }
        return res.status(404).json({ message: 'Collection not found' })
      } catch (err) {
        console.error('Admin collection GET by id error:', err)
        res.status(500).json({ message: (err && err.message) || 'Internal server error' })
      }
    }
    httpApp.get('/admin-hub/collections', (req, res) => adminCollectionsGET(req, res))
    httpApp.get('/admin-hub/collections/:id', (req, res) => adminCollectionByIdGET(req, res))
    httpApp.post('/admin-hub/collections', (req, res) => adminCollectionsPOST(req, res))
    httpApp.patch('/admin-hub/collections/:id', (req, res) => adminCollectionByIdPATCH(req, res))
    httpApp.delete('/admin-hub/collections/:id', (req, res) => adminCollectionByIdDELETE(req, res))

    // --- Admin Hub Brands (serbest text yasak: product'ta sadece bu listeden seçilir) ---
    const getBrandsDbClient = () => {
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      if (!dbUrl || !dbUrl.startsWith('postgres')) return null
      const { Client } = require('pg')
      return new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
    }
    const adminBrandsGET = async (req, res) => {
      const client = getBrandsDbClient()
      if (!client) return res.status(500).json({ message: 'Database unavailable' })
      try {
        await client.connect()
        // Return ALL brands so the frontend can split into "my brands" vs "other brands"
        // seller_id is included so frontend knows ownership
        const r = await client.query('SELECT id, name, handle, logo_image, banner_image, address, seller_id, created_at FROM admin_hub_brands ORDER BY name')
        await client.end()
        res.json({ brands: (r.rows || []).map((row) => ({ id: row.id, name: row.name, handle: row.handle, logo_image: row.logo_image || null, banner_image: row.banner_image || null, address: row.address || null, seller_id: row.seller_id || null, created_at: row.created_at })) })
      } catch (e) {
        try { await client.end() } catch (_) {}
        console.error('Brands GET:', e)
        res.status(500).json({ message: (e && e.message) || 'Internal server error' })
      }
    }
    const adminBrandsPOST = async (req, res) => {
      const body = req.body || {}
      const name = (body.name || '').trim()
      if (!name) return res.status(400).json({ message: 'name is required' })
      const handle = (body.handle || '').trim() || slugifyTitle(name) || ('brand-' + Date.now())
      const logo_image = (body.logo_image || body.logo || '').trim() || null
      const banner_image = (body.banner_image || '').trim() || null
      const address = (body.address || '').trim() || null
      const callerSellerId = req.sellerUser?.is_superuser ? null : (req.sellerUser?.seller_id || null)
      const client = getBrandsDbClient()
      if (!client) return res.status(500).json({ message: 'Database unavailable' })
      try {
        await client.connect()
        const r = await client.query(
          'INSERT INTO admin_hub_brands (name, handle, logo_image, banner_image, address, seller_id) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (handle) DO UPDATE SET name = $1, logo_image = $3, banner_image = $4, address = $5, updated_at = now() RETURNING id, name, handle, logo_image, banner_image, address, seller_id, created_at',
          [name, handle, logo_image, banner_image, address, callerSellerId]
        )
        await client.end()
        const row = r.rows && r.rows[0]
        res.status(201).json({ brand: row })
      } catch (e) {
        try { await client.end() } catch (_) {}
        console.error('Brands POST:', e)
        res.status(500).json({ message: (e && e.message) || 'Internal server error' })
      }
    }
    const adminBrandsPatchDelete = async (req, res, isPatch) => {
      const id = (req.params.id || '').trim()
      if (!id) return res.status(400).json({ message: 'id required' })
      const isSuperuserReq = req.sellerUser?.is_superuser === true
      const callerSellerId = req.sellerUser?.seller_id || null
      const client = getBrandsDbClient()
      if (!client) return res.status(500).json({ message: 'Database unavailable' })
      try {
        await client.connect()
        // Fetch existing brand to check ownership
        const existing = await client.query('SELECT id, seller_id FROM admin_hub_brands WHERE id = $1', [id])
        if (!existing.rows || !existing.rows[0]) {
          await client.end()
          return res.status(404).json({ message: 'Brand not found' })
        }
        const brandOwnerId = existing.rows[0].seller_id
        const isOwner = callerSellerId && brandOwnerId === callerSellerId
        if (!isSuperuserReq && !isOwner) {
          await client.end()
          return res.status(403).json({ message: 'You can only edit your own brands' })
        }
        if (isPatch) {
          const body = req.body || {}
          const updates = []
          const params = []
          let n = 1
          // Only superusers can change name and handle
          if (isSuperuserReq) {
            const name = (body.name || '').trim()
            const handle = (body.handle || '').trim()
            if (name) { updates.push('name = $' + n); params.push(name); n++ }
            if (handle) { updates.push('handle = $' + n); params.push(handle); n++ }
          }
          // Owners and superusers can change logo, banner, address
          const logo_image = body.logo_image !== undefined ? (typeof body.logo_image === 'string' ? body.logo_image.trim() : null) : undefined
          const banner_image = body.banner_image !== undefined ? (typeof body.banner_image === 'string' ? body.banner_image.trim() : null) : undefined
          const address = body.address !== undefined ? (typeof body.address === 'string' ? body.address.trim() : null) : undefined
          if (logo_image !== undefined) { updates.push('logo_image = $' + n); params.push(logo_image || null); n++ }
          if (banner_image !== undefined) { updates.push('banner_image = $' + n); params.push(banner_image || null); n++ }
          if (address !== undefined) { updates.push('address = $' + n); params.push(address || null); n++ }
          if (updates.length === 0) {
            const r = await client.query('SELECT id, name, handle, logo_image, banner_image, address, seller_id, created_at FROM admin_hub_brands WHERE id = $1', [id])
            await client.end()
            return res.json({ brand: r.rows[0] })
          }
          updates.push('updated_at = now()')
          params.push(id)
          const r = await client.query('UPDATE admin_hub_brands SET ' + updates.join(', ') + ' WHERE id = $' + n + ' RETURNING id, name, handle, logo_image, banner_image, address, seller_id, created_at', params)
          await client.end()
          if (!r.rows || !r.rows[0]) return res.status(404).json({ message: 'Brand not found' })
          res.json({ brand: r.rows[0] })
        } else {
          // Delete: only superusers or owner
          const r = await client.query('DELETE FROM admin_hub_brands WHERE id = $1 RETURNING id', [id])
          await client.end()
          if (!r.rows || !r.rows[0]) return res.status(404).json({ message: 'Brand not found' })
          res.status(200).json({ deleted: true })
        }
      } catch (e) {
        try { await client.end() } catch (_) {}
        console.error('Brands PATCH/DELETE:', e)
        res.status(500).json({ message: (e && e.message) || 'Internal server error' })
      }
    }
    httpApp.get('/admin-hub/brands', requireSellerAuth, adminBrandsGET)
    httpApp.post('/admin-hub/brands', requireSellerAuth, adminBrandsPOST)
    httpApp.patch('/admin-hub/brands/:id', requireSellerAuth, (req, res) => adminBrandsPatchDelete(req, res, true))
    httpApp.delete('/admin-hub/brands/:id', requireSellerAuth, (req, res) => adminBrandsPatchDelete(req, res, false))

    // ── Banners CRUD (superuser) ──────────────────────────────────────────────
    const getBannersDb = async () => {
      const client = getSellerDbClient()
      if (!client) return []
      try {
        await client.connect()
        const r = await client.query('SELECT id, title, subtitle, image_url, link_url, button_text, is_active, position, created_at FROM admin_hub_banners ORDER BY position ASC, created_at ASC')
        await client.end()
        return r.rows || []
      } catch (e) { try { await client.end() } catch (_) {}; return [] }
    }
    httpApp.get('/admin-hub/v1/banners', requireSellerAuth, requireSuperuser, async (req, res) => {
      res.json({ banners: await getBannersDb() })
    })
    httpApp.post('/admin-hub/v1/banners', requireSellerAuth, requireSuperuser, async (req, res) => {
      const b = req.body || {}
      const title = (b.title || '').trim()
      if (!title) return res.status(400).json({ message: 'Title is required' })
      const client = getSellerDbClient()
      if (!client) return res.status(503).json({ message: 'Database not configured' })
      try {
        await client.connect()
        const r = await client.query(
          `INSERT INTO admin_hub_banners (title, subtitle, image_url, link_url, button_text, is_active, position)
           VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
          [title, b.subtitle || null, b.image_url || null, b.link_url || null, b.button_text || null, b.is_active !== false, Number(b.position) || 0]
        )
        await client.end()
        res.status(201).json({ banner: r.rows[0] })
      } catch (e) { try { await client.end() } catch (_) {}; console.error('Banners POST:', e); res.status(500).json({ message: e.message }) }
    })
    httpApp.put('/admin-hub/v1/banners/:id', requireSellerAuth, requireSuperuser, async (req, res) => {
      const { id } = req.params
      const b = req.body || {}
      const client = getSellerDbClient()
      if (!client) return res.status(503).json({ message: 'Database not configured' })
      try {
        await client.connect()
        const r = await client.query(
          `UPDATE admin_hub_banners SET title=$1, subtitle=$2, image_url=$3, link_url=$4, button_text=$5, is_active=$6, position=$7, updated_at=now() WHERE id=$8 RETURNING *`,
          [(b.title || '').trim() || null, b.subtitle || null, b.image_url || null, b.link_url || null, b.button_text || null, b.is_active !== false, Number(b.position) || 0, id]
        )
        await client.end()
        if (!r.rows[0]) return res.status(404).json({ message: 'Not found' })
        res.json({ banner: r.rows[0] })
      } catch (e) { try { await client.end() } catch (_) {}; console.error('Banners PUT:', e); res.status(500).json({ message: e.message }) }
    })
    httpApp.delete('/admin-hub/v1/banners/:id', requireSellerAuth, requireSuperuser, async (req, res) => {
      const client = getSellerDbClient()
      if (!client) return res.status(503).json({ message: 'Database not configured' })
      try {
        await client.connect()
        await client.query('DELETE FROM admin_hub_banners WHERE id=$1', [req.params.id])
        await client.end()
        res.json({ ok: true })
      } catch (e) { try { await client.end() } catch (_) {}; console.error('Banners DELETE:', e); res.status(500).json({ message: e.message }) }
    })

    // --- Metafield Definitions ---
    const dbQ = async (sql, params = []) => {
      const { Client } = require('pg')
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      const client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
      await client.connect()
      try { const r = await client.query(sql, params); return r } finally { await client.end() }
    }

    // Ensure table exists
    dbQ(`CREATE TABLE IF NOT EXISTS admin_hub_metafield_definitions (
      key varchar(120) PRIMARY KEY,
      label varchar(255),
      values JSONB NOT NULL DEFAULT '[]',
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`).catch(() => {})
    dbQ(`CREATE TABLE IF NOT EXISTS admin_hub_metafield_pending (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      key varchar(120) NOT NULL,
      label varchar(255),
      proposed_values JSONB NOT NULL DEFAULT '[]',
      seller_id varchar(255),
      status varchar(20) NOT NULL DEFAULT 'pending',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`).catch(() => {})
    dbQ(`CREATE INDEX IF NOT EXISTS idx_metafield_pending_status ON admin_hub_metafield_pending(status)`).catch(() => {})

    // GET /admin-hub/metafield-definitions
    // Returns merged: stored definitions + values found in products
    httpApp.get('/admin-hub/metafield-definitions', async (req, res) => {
      try {
        // 1. Load stored definitions
        const storedRes = await dbQ('SELECT key, label, values FROM admin_hub_metafield_definitions ORDER BY key')
        const stored = {}
        for (const row of storedRes.rows) {
          stored[row.key] = { label: row.label || row.key, values: Array.isArray(row.values) ? row.values : [] }
        }

        // 2. Scan product metafields for additional values
        const prodRes = await dbQ('SELECT metadata FROM admin_hub_products WHERE metadata IS NOT NULL')
        const SYSTEM_KEYS = new Set(['media','image_url','image','thumbnail','ean','sku','bullet_points',
          'translations','variation_groups','metafields','shipping_group_id','collection_id','collection_ids',
          'admin_category_id','category_id','seller_id','product_id','brand_id','brand_logo','brand_handle',
          'brand','brand_name','shop_name','store_name','seller_name','hersteller','hersteller_information',
          'verantwortliche_person_information','seo_keywords','seo_meta_title','seo_meta_description',
          'publish_date','return_days','return_cost','return_kostenlos','related_product_ids',
          'dimensions','dimensions_length','dimensions_width','dimensions_height','weight','weight_grams',
          'unit_type','unit_value','unit_reference','shipping_info','versand','rabattpreis_cents',
          'uvp_cents','price_cents','compare_at_price_cents','sale_price_cents','review_count',
          'review_avg','sold_last_month','is_new','badge','sale'])

        const fromProducts = {} // key → Set of values
        for (const row of prodRes.rows) {
          const meta = typeof row.metadata === 'object' && row.metadata ? row.metadata : {}
          // Flat meta keys
          for (const [k, v] of Object.entries(meta)) {
            if (SYSTEM_KEYS.has(k) || k.startsWith('_')) continue
            if (v == null || v === '') continue
            if (typeof v === 'object' && !Array.isArray(v)) continue
            const vals = Array.isArray(v) ? v : [v]
            if (vals.length > 0 && typeof vals[0] === 'object') continue
            if (!fromProducts[k]) fromProducts[k] = new Set()
            vals.forEach(x => { const s = String(x).trim(); if (s && s.length <= 120) fromProducts[k].add(s) })
          }
          // metafields array
          if (Array.isArray(meta.metafields)) {
            for (const { key, value } of meta.metafields) {
              if (!key || !value || SYSTEM_KEYS.has(key) || key.startsWith('_')) continue
              if (!fromProducts[key]) fromProducts[key] = new Set()
              const s = String(value).trim()
              if (s && s.length <= 120) fromProducts[key].add(s)
            }
          }
        }

        // 3. Merge: stored + fromProducts
        const allKeys = new Set([...Object.keys(stored), ...Object.keys(fromProducts)])
        const definitions = {}
        for (const key of allKeys) {
          const storedVals = new Set(stored[key]?.values || [])
          const prodVals = fromProducts[key] || new Set()
          const merged = [...new Set([...storedVals, ...prodVals])].sort()
          definitions[key] = { label: stored[key]?.label || key, values: merged }
        }

        res.json({ definitions })
      } catch (err) {
        console.error('metafield-definitions GET:', err)
        res.status(500).json({ error: err.message })
      }
    })

    // PUT /admin-hub/metafield-definitions/:key  — upsert values for a key (superuser only)
    httpApp.put('/admin-hub/metafield-definitions/:key', async (req, res) => {
      try {
        const auth = req.headers['authorization'] || ''
        const token = auth.startsWith('Bearer ') ? auth.slice(7) : null
        const jwtPayload = token ? verifySellerToken(token) : null
        if (!jwtPayload || !jwtPayload.is_superuser) {
          return res.status(403).json({ message: 'Superuser access required' })
        }
        const key = (req.params.key || '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '_')
        if (!key) return res.status(400).json({ error: 'key required' })
        const { label, values } = req.body || {}
        const safeValues = (Array.isArray(values) ? values : []).map(v => String(v).trim()).filter(Boolean)
        const safeLabel = (label || key).toString().trim()
        await dbQ(
          `INSERT INTO admin_hub_metafield_definitions (key, label, values, updated_at)
           VALUES ($1, $2, $3, NOW())
           ON CONFLICT (key) DO UPDATE SET label = $2, values = $3, updated_at = NOW()`,
          [key, safeLabel, JSON.stringify(safeValues)]
        )
        res.json({ ok: true, key, label: safeLabel, values: safeValues })
      } catch (err) {
        console.error('metafield-definitions PUT:', err)
        res.status(500).json({ error: err.message })
      }
    })

    // DELETE /admin-hub/metafield-definitions/:key (superuser only)
    httpApp.delete('/admin-hub/metafield-definitions/:key', async (req, res) => {
      try {
        const auth = req.headers['authorization'] || ''
        const token = auth.startsWith('Bearer ') ? auth.slice(7) : null
        const jwtPayload = token ? verifySellerToken(token) : null
        if (!jwtPayload || !jwtPayload.is_superuser) {
          return res.status(403).json({ message: 'Superuser access required' })
        }
        await dbQ('DELETE FROM admin_hub_metafield_definitions WHERE key = $1', [req.params.key])
        res.json({ ok: true })
      } catch (err) {
        res.status(500).json({ error: err.message })
      }
    })

    const normalizeMetaKey = (raw) => (String(raw || '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '') || '')
    const metafieldProposalNormalizeValues = (arr) => {
      const out = []
      const seen = new Set()
      for (const v of Array.isArray(arr) ? arr : []) {
        const s = String(v ?? '').trim()
        if (!s || s.length > 500) continue
        if (seen.has(s.toLowerCase())) continue
        seen.add(s.toLowerCase())
        out.push(s)
      }
      return out
    }

    // GET /admin-hub/metafield-definitions/pending — superuser: all pending proposals
    httpApp.get('/admin-hub/metafield-definitions/pending', async (req, res) => {
      try {
        const auth = req.headers['authorization'] || ''
        const token = auth.startsWith('Bearer ') ? auth.slice(7) : null
        const jwtPayload = token ? verifySellerToken(token) : null
        if (!jwtPayload || !jwtPayload.is_superuser) {
          return res.status(403).json({ message: 'Superuser access required' })
        }
        const r = await dbQ(
          `SELECT id, key, label, proposed_values, seller_id, status, created_at
           FROM admin_hub_metafield_pending WHERE status = 'pending' ORDER BY created_at ASC`
        )
        const rows = (r.rows || []).map((row) => ({
          id: row.id,
          key: row.key,
          label: row.label,
          proposed_values: Array.isArray(row.proposed_values) ? row.proposed_values : [],
          seller_id: row.seller_id,
          status: row.status,
          created_at: row.created_at,
        }))
        res.json({ pending: rows })
      } catch (err) {
        console.error('metafield-definitions pending GET:', err)
        res.status(500).json({ error: err.message })
      }
    })

    // POST /admin-hub/metafield-definitions/proposals — authenticated seller proposes new catalog entry; superuser applies immediately
    httpApp.post('/admin-hub/metafield-definitions/proposals', async (req, res) => {
      try {
        const auth = req.headers['authorization'] || ''
        const token = auth.startsWith('Bearer ') ? auth.slice(7) : null
        const jwtPayload = token ? verifySellerToken(token) : null
        if (!jwtPayload || !jwtPayload.seller_id) {
          return res.status(401).json({ message: 'Unauthorized' })
        }
        const body = req.body || {}
        let key = normalizeMetaKey(body.key)
        const labelIn = (body.label != null ? String(body.label) : '').trim()
        if (!labelIn) return res.status(400).json({ message: 'label required' })
        if (!key) key = normalizeMetaKey(labelIn.replace(/\s+/g, '_'))
        if (!key) return res.status(400).json({ message: 'could not derive key' })
        const proposed = metafieldProposalNormalizeValues(body.values)
        if (proposed.length === 0) return res.status(400).json({ message: 'values required' })

        if (jwtPayload.is_superuser) {
          const exist = await dbQ('SELECT label, values FROM admin_hub_metafield_definitions WHERE key = $1', [key])
          const prev = exist.rows[0]
          const prevVals = Array.isArray(prev?.values) ? prev.values : []
          const mergedVals = [...new Set([...prevVals.map(String), ...proposed])].sort()
          const safeLabel = labelIn || prev?.label || key
          await dbQ(
            `INSERT INTO admin_hub_metafield_definitions (key, label, values, updated_at)
             VALUES ($1, $2, $3, NOW())
             ON CONFLICT (key) DO UPDATE SET label = $2, values = $3, updated_at = NOW()`,
            [key, safeLabel, JSON.stringify(mergedVals)]
          )
          return res.json({ ok: true, applied: true, key, label: safeLabel, values: mergedVals })
        }

        const ins = await dbQ(
          `INSERT INTO admin_hub_metafield_pending (key, label, proposed_values, seller_id, status)
           VALUES ($1, $2, $3, $4, 'pending')
           RETURNING id, key, label, proposed_values, seller_id, status, created_at`,
          [key, labelIn, JSON.stringify(proposed), String(jwtPayload.seller_id).trim()]
        )
        const row = ins.rows[0]
        res.status(201).json({
          ok: true,
          applied: false,
          proposal: {
            id: row.id,
            key: row.key,
            label: row.label,
            proposed_values: Array.isArray(row.proposed_values) ? row.proposed_values : proposed,
            seller_id: row.seller_id,
            status: row.status,
            created_at: row.created_at,
          },
        })
      } catch (err) {
        console.error('metafield-definitions proposals POST:', err)
        res.status(500).json({ error: err.message })
      }
    })

    // POST approve — merge into live definitions
    httpApp.post('/admin-hub/metafield-definitions/pending/:id/approve', async (req, res) => {
      try {
        const auth = req.headers['authorization'] || ''
        const token = auth.startsWith('Bearer ') ? auth.slice(7) : null
        const jwtPayload = token ? verifySellerToken(token) : null
        if (!jwtPayload || !jwtPayload.is_superuser) {
          return res.status(403).json({ message: 'Superuser access required' })
        }
        const id = String(req.params.id || '').trim()
        if (!id) return res.status(400).json({ message: 'id required' })
        const pr = await dbQ(`SELECT * FROM admin_hub_metafield_pending WHERE id = $1::uuid AND status = 'pending'`, [id])
        const pending = pr.rows[0]
        if (!pending) return res.status(404).json({ message: 'Proposal not found' })
        const key = pending.key
        const proposed = Array.isArray(pending.proposed_values) ? pending.proposed_values.map(String) : []
        const exist = await dbQ('SELECT label, values FROM admin_hub_metafield_definitions WHERE key = $1', [key])
        const prev = exist.rows[0]
        const prevVals = Array.isArray(prev?.values) ? prev.values.map(String) : []
        const mergedVals = [...new Set([...prevVals, ...proposed])].sort()
        const safeLabel = (pending.label && String(pending.label).trim()) || prev?.label || key
        await dbQ(
          `INSERT INTO admin_hub_metafield_definitions (key, label, values, updated_at)
           VALUES ($1, $2, $3, NOW())
           ON CONFLICT (key) DO UPDATE SET label = $2, values = $3, updated_at = NOW()`,
          [key, safeLabel, JSON.stringify(mergedVals)]
        )
        await dbQ(`DELETE FROM admin_hub_metafield_pending WHERE id = $1::uuid`, [id])
        res.json({ ok: true, key, label: safeLabel, values: mergedVals })
      } catch (err) {
        console.error('metafield pending approve:', err)
        res.status(500).json({ error: err.message })
      }
    })

    httpApp.post('/admin-hub/metafield-definitions/pending/:id/reject', async (req, res) => {
      try {
        const auth = req.headers['authorization'] || ''
        const token = auth.startsWith('Bearer ') ? auth.slice(7) : null
        const jwtPayload = token ? verifySellerToken(token) : null
        if (!jwtPayload || !jwtPayload.is_superuser) {
          return res.status(403).json({ message: 'Superuser access required' })
        }
        const id = String(req.params.id || '').trim()
        if (!id) return res.status(400).json({ message: 'id required' })
        const del = await dbQ(`DELETE FROM admin_hub_metafield_pending WHERE id = $1::uuid AND status = 'pending'`, [id])
        if (!del.rowCount) return res.status(404).json({ message: 'Proposal not found' })
        res.json({ ok: true })
      } catch (err) {
        console.error('metafield pending reject:', err)
        res.status(500).json({ error: err.message })
      }
    })


    // --- Admin Hub Menus (service or raw DB fallback when loader fails) ---
    const resolveMenuService = () => {
      try {
        return container.resolve('menuService')
      } catch (e) {
        return null
      }
    }
    const getMenuDbClient = () => {
      const raw = process.env.DATABASE_URL || process.env.POSTGRES_URL || ''
      const dbUrl = raw.replace(/^postgresql:\/\//, 'postgres://')
      if (!dbUrl || !dbUrl.startsWith('postgres')) return null
      try {
        const { Client } = require('pg')
        const isRender = dbUrl.includes('render.com')
        return new Client({ connectionString: dbUrl, ssl: isRender ? { rejectUnauthorized: false } : false })
      } catch (e) {
        console.warn('Menu DB: pg client create failed', e && e.message)
        return null
      }
    }
    const runWithMenuDb = async (fn) => {
      const client = getMenuDbClient()
      if (!client) return null
      try {
        await client.connect()
        return await fn(client)
      } catch (err) {
        console.warn('Menu DB fallback error:', err && err.message)
        return null
      } finally {
        try { await client.end() } catch (_) {}
      }
    }
    const menusListGET = async (req, res) => {
      try {
        const menusFromDb = await runWithMenuDb(async (client) => {
          const r = await client.query('SELECT id, name, slug, location, categories_with_products FROM admin_hub_menus ORDER BY name')
          return (r.rows || []).map((row) => ({
            id: row.id,
            name: row.name,
            slug: row.slug,
            location: (row.location === null || row.location === undefined) ? 'main' : String(row.location).trim().toLowerCase(),
            categories_with_products: Boolean(row.categories_with_products),
          }))
        })
        if (menusFromDb && Array.isArray(menusFromDb)) return res.status(200).json({ menus: menusFromDb, count: menusFromDb.length })
        const svc = resolveMenuService()
        if (svc) {
          try {
            const menus = await svc.listMenus()
            return res.status(200).json({ menus: menus || [], count: (menus || []).length })
          } catch (err) {
            console.error('Menus GET service error:', err && err.message)
          }
        }
      } catch (err) {
        console.warn('Menus GET error:', err && err.message)
      }
      return res.status(200).json({ menus: [], count: 0 })
    }
    const menusCreatePOST = async (req, res) => {
      const b = req.body || {}
      if (!b.name || !b.slug) return res.status(400).json({ message: 'name and slug required' })
      let menu = await runWithMenuDb(async (client) => {
        const r = await client.query(
          'INSERT INTO admin_hub_menus (name, slug, location, categories_with_products) VALUES ($1, $2, $3, $4) RETURNING id, name, slug, location, categories_with_products',
          [b.name, b.slug, b.location || 'main', Boolean(b.categories_with_products)]
        )
        return r.rows && r.rows[0]
          ? {
              id: r.rows[0].id,
              name: r.rows[0].name,
              slug: r.rows[0].slug,
              location: r.rows[0].location || 'main',
              categories_with_products: Boolean(r.rows[0].categories_with_products),
            }
          : null
      })
      if (menu) return res.status(201).json({ menu })
      const svc = resolveMenuService()
      if (svc) {
        try {
          menu = await svc.createMenu({ name: b.name, slug: b.slug, location: b.location })
          return res.status(201).json({ menu })
        } catch (err) {
          console.error('Menus POST error:', err)
          return res.status(500).json({ message: (err && err.message) || 'Internal server error' })
        }
      }
      console.warn('Menus create: DB and menuService both unavailable')
      return res.status(500).json({ message: 'Database unavailable. Check DATABASE_URL.' })
    }
    const menuByIdGET = async (req, res) => {
      let menu = await runWithMenuDb(async (client) => {
        const r = await client.query('SELECT id, name, slug, location, categories_with_products FROM admin_hub_menus WHERE id = $1', [req.params.id])
        const row = r.rows && r.rows[0]
        return row
          ? {
              id: row.id,
              name: row.name,
              slug: row.slug,
              location: (row.location === null || row.location === undefined) ? 'main' : String(row.location).trim().toLowerCase(),
              categories_with_products: Boolean(row.categories_with_products),
            }
          : null
      })
      if (menu) return res.json({ menu })
      const svc = resolveMenuService()
      if (svc) {
        try {
          menu = await svc.getMenuById(req.params.id)
          if (menu) return res.json({ menu })
        } catch (err) {
          console.error('Menu GET error:', err)
          return res.status(500).json({ message: (err && err.message) || 'Internal server error' })
        }
      }
      return res.status(404).json({ message: 'Menu not found' })
    }
    const menuByIdPUT = async (req, res) => {
      const body = req.body || {}
      const menu = await runWithMenuDb(async (client) => {
        const updates = []
        const vals = []
        let n = 1
        if (body.name !== undefined) { updates.push(`name = $${n++}`); vals.push(body.name) }
        if (body.slug !== undefined) { updates.push(`slug = $${n++}`); vals.push(body.slug) }
        // Store null/empty as '' (empty string) so it's clearly "unassigned" and not misread as "main" (NULL maps to main in getStoreMenusFromDb)
        if (body.location !== undefined) { updates.push(`location = $${n++}`); vals.push((body.location === null || body.location === '') ? '' : body.location) }
        if (body.categories_with_products !== undefined) { updates.push(`categories_with_products = $${n++}`); vals.push(Boolean(body.categories_with_products)) }
        const normalize = (loc) => (loc === null || loc === undefined) ? 'main' : String(loc).trim().toLowerCase()
        if (updates.length === 0) {
          const r = await client.query('SELECT id, name, slug, location, categories_with_products FROM admin_hub_menus WHERE id = $1', [req.params.id])
          return r.rows && r.rows[0]
            ? {
                id: r.rows[0].id,
                name: r.rows[0].name,
                slug: r.rows[0].slug,
                location: normalize(r.rows[0].location),
                categories_with_products: Boolean(r.rows[0].categories_with_products),
              }
            : null
        }
        vals.push(req.params.id)
        const r = await client.query(`UPDATE admin_hub_menus SET ${updates.join(', ')}, updated_at = now() WHERE id = $${n} RETURNING id, name, slug, location, categories_with_products`, vals)
        return r.rows && r.rows[0]
          ? {
              id: r.rows[0].id,
              name: r.rows[0].name,
              slug: r.rows[0].slug,
              location: normalize(r.rows[0].location),
              categories_with_products: Boolean(r.rows[0].categories_with_products),
            }
          : null
      })
      if (!menu) return res.status(404).json({ message: 'Menu not found' })
      return res.json({ menu })
    }
    const menuByIdDELETE = async (req, res) => {
      const svc = resolveMenuService()
      if (svc) {
        try {
          await svc.deleteMenu(req.params.id)
          return res.status(200).json({ deleted: true })
        } catch (err) {
          console.error('Menu DELETE error:', err)
          return res.status(500).json({ message: (err && err.message) || 'Internal server error' })
        }
      }
      const ok = await runWithMenuDb(async (client) => {
        const r = await client.query('DELETE FROM admin_hub_menus WHERE id = $1', [req.params.id])
        return (r.rowCount || 0) > 0
      })
      if (ok) return res.status(200).json({ deleted: true })
      return res.status(404).json({ message: 'Menu not found' })
    }
    const menuItemsGET = async (req, res) => {
      const itemsFromDb = await runWithMenuDb(async (client) => {
        const r = await client.query(
          'SELECT id, menu_id, label, slug, link_type, link_value, parent_id, sort_order FROM admin_hub_menu_items WHERE menu_id = $1 ORDER BY sort_order ASC, label ASC',
          [req.params.menuId]
        )
        return (r.rows || []).map((row) => ({
          id: row.id,
          menu_id: row.menu_id,
          label: row.label,
          slug: row.slug,
          link_type: row.link_type || 'url',
          link_value: row.link_value,
          parent_id: row.parent_id,
          sort_order: row.sort_order != null ? row.sort_order : 0,
        }))
      })
      if (itemsFromDb) return res.json({ items: itemsFromDb, count: itemsFromDb.length })
      const svc = resolveMenuService()
      if (svc) {
        try {
          const items = await svc.listMenuItems(req.params.menuId)
          return res.json({ items: items || [], count: (items || []).length })
        } catch (err) {
          console.error('Menu items GET error:', err)
          return res.status(500).json({ message: (err && err.message) || 'Internal server error' })
        }
      }
      return res.json({ items: [], count: 0 })
    }
    const menuItemsPOST = async (req, res) => {
      const b = req.body || {}
      if (!b.label) return res.status(400).json({ message: 'label required' })
      const menuId = req.params.menuId
      let item = await runWithMenuDb(async (client) => {
        const r = await client.query(
          'INSERT INTO admin_hub_menu_items (menu_id, label, slug, link_type, link_value, parent_id, sort_order) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, menu_id, label, slug, link_type, link_value, parent_id, sort_order',
          [menuId, b.label, b.slug || null, b.link_type || 'url', b.link_value || null, b.parent_id || null, b.sort_order != null ? b.sort_order : 0]
        )
        const row = r.rows && r.rows[0]
        return row ? { id: row.id, menu_id: row.menu_id, label: row.label, slug: row.slug, link_type: row.link_type || 'url', link_value: row.link_value, parent_id: row.parent_id, sort_order: row.sort_order != null ? row.sort_order : 0 } : null
      })
      if (item) return res.status(201).json({ item })
      const svc = resolveMenuService()
      if (svc) {
        try {
          item = await svc.createMenuItem({
            menu_id: menuId,
            label: b.label,
            slug: b.slug || null,
            link_type: b.link_type || 'url',
            link_value: b.link_value || null,
            parent_id: b.parent_id || null,
            sort_order: b.sort_order || 0,
          })
          return res.status(201).json({ item })
        } catch (err) {
          console.error('Menu items POST error:', err)
          return res.status(500).json({ message: (err && err.message) || 'Internal server error' })
        }
      }
      return res.status(500).json({ message: 'Database unavailable. Check DATABASE_URL.' })
    }
    const menuItemByIdPUT = async (req, res) => {
      const body = req.body || {}
      const svc = resolveMenuService()
      if (svc) {
        try {
          const item = await svc.updateMenuItem(req.params.itemId, body)
          return res.json({ item })
        } catch (err) {
          console.error('Menu item PUT error:', err)
          return res.status(500).json({ message: (err && err.message) || 'Internal server error' })
        }
      }
      const item = await runWithMenuDb(async (client) => {
        const updates = []
        const vals = []
        let n = 1
        if (body.label !== undefined) { updates.push(`label = $${n++}`); vals.push(body.label) }
        if (body.slug !== undefined) { updates.push(`slug = $${n++}`); vals.push(body.slug) }
        if (body.link_type !== undefined) { updates.push(`link_type = $${n++}`); vals.push(body.link_type) }
        if (body.link_value !== undefined) { updates.push(`link_value = $${n++}`); vals.push(body.link_value) }
        if (body.parent_id !== undefined) { updates.push(`parent_id = $${n++}`); vals.push(body.parent_id) }
        if (body.sort_order !== undefined) { updates.push(`sort_order = $${n++}`); vals.push(body.sort_order) }
        if (updates.length === 0) {
          const r = await client.query('SELECT id, menu_id, label, slug, link_type, link_value, parent_id, sort_order FROM admin_hub_menu_items WHERE id = $1', [req.params.itemId])
          const row = r.rows && r.rows[0]
          return row ? { id: row.id, menu_id: row.menu_id, label: row.label, slug: row.slug, link_type: row.link_type || 'url', link_value: row.link_value, parent_id: row.parent_id, sort_order: row.sort_order != null ? row.sort_order : 0 } : null
        }
        vals.push(req.params.itemId)
        const r = await client.query(`UPDATE admin_hub_menu_items SET ${updates.join(', ')}, updated_at = now() WHERE id = $${n} RETURNING id, menu_id, label, slug, link_type, link_value, parent_id, sort_order`, vals)
        const row = r.rows && r.rows[0]
        return row ? { id: row.id, menu_id: row.menu_id, label: row.label, slug: row.slug, link_type: row.link_type || 'url', link_value: row.link_value, parent_id: row.parent_id, sort_order: row.sort_order != null ? row.sort_order : 0 } : null
      })
      if (!item) return res.status(404).json({ message: 'Menu item not found' })
      return res.json({ item })
    }
    const menuItemByIdDELETE = async (req, res) => {
      const svc = resolveMenuService()
      if (svc) {
        try {
          await svc.deleteMenuItem(req.params.itemId)
          return res.status(200).json({ deleted: true })
        } catch (err) {
          console.error('Menu item DELETE error:', err)
          return res.status(500).json({ message: (err && err.message) || 'Internal server error' })
        }
      }
      const ok = await runWithMenuDb(async (client) => {
        const r = await client.query('DELETE FROM admin_hub_menu_items WHERE id = $1', [req.params.itemId])
        return (r.rowCount || 0) > 0
      })
      if (ok) return res.status(200).json({ deleted: true })
      return res.status(404).json({ message: 'Menu item not found' })
    }
    httpApp.get('/admin-hub/menus', menusListGET)
    httpApp.post('/admin-hub/menus', menusCreatePOST)
    httpApp.get('/admin-hub/menus/:id', menuByIdGET)
    httpApp.put('/admin-hub/menus/:id', menuByIdPUT)
    httpApp.delete('/admin-hub/menus/:id', menuByIdDELETE)
    httpApp.get('/admin-hub/menus/:menuId/items', menuItemsGET)
    httpApp.post('/admin-hub/menus/:menuId/items', menuItemsPOST)
    httpApp.put('/admin-hub/menus/:menuId/items/:itemId', menuItemByIdPUT)
    httpApp.delete('/admin-hub/menus/:menuId/items/:itemId', menuItemByIdDELETE)
    const getMenuLocationsFromDb = async () => {
      const raw = process.env.DATABASE_URL || process.env.POSTGRES_URL || ''
      const dbUrl = raw.replace(/^postgresql:\/\//, 'postgres://')
      if (!dbUrl || !dbUrl.startsWith('postgres')) return null
      try {
        const { Client } = require('pg')
        const isRender = dbUrl.includes('render.com')
        const client = new Client({ connectionString: dbUrl, ssl: isRender ? { rejectUnauthorized: false } : false })
        await client.connect()
        try {
          const res = await client.query('SELECT id, slug, label, html_id, sort_order FROM admin_hub_menu_locations ORDER BY sort_order ASC, slug ASC')
          const list = (res.rows || []).map((r) => ({ id: r.id, slug: r.slug, label: r.label, html_id: r.html_id || null, sort_order: r.sort_order ?? 0 }))
          return list
        } finally { await client.end().catch(() => {}) }
      } catch (e) {
        console.warn('Menu locations from DB:', e && e.message)
        return null
      }
    }
    const menuLocationsGET = async (req, res) => {
      try {
        let list = await getMenuLocationsFromDb()
        if (!list || list.length === 0) {
          list = [
            { id: 'main', slug: 'main', label: 'Main menu (dropdown)', html_id: null, sort_order: 0 },
            { id: 'second', slug: 'second', label: 'Second menu (navbar bar)', html_id: 'subnav', sort_order: 1 },
            { id: 'footer1', slug: 'footer1', label: 'Footer column 1', html_id: null, sort_order: 10 },
            { id: 'footer2', slug: 'footer2', label: 'Footer column 2', html_id: null, sort_order: 11 },
            { id: 'footer3', slug: 'footer3', label: 'Footer column 3', html_id: null, sort_order: 12 },
            { id: 'footer4', slug: 'footer4', label: 'Footer column 4', html_id: null, sort_order: 13 },
          ]
        }
        res.json({ locations: list })
      } catch (err) {
        console.error('Menu locations GET error:', err)
        res.status(500).json({ message: (err && err.message) || 'Internal server error' })
      }
    }
    httpApp.get('/admin-hub/menu-locations', menuLocationsGET)
    httpApp.get('/store/menu-locations', menuLocationsGET)

    // --- Admin Hub Products (DB: admin_hub_products, collections/menus gibi) ---
    const getProductsDbClient = () => {
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      if (!dbUrl || !dbUrl.startsWith('postgres')) return null
      const { Client } = require('pg')
      const isRender = dbUrl.includes('render.com')
      return new Client({ connectionString: dbUrl, ssl: isRender ? { rejectUnauthorized: false } : false })
    }
    const listAdminHubProductsDb = async (query = {}) => {
      const client = getProductsDbClient()
      if (!client) return []
      try {
        await client.connect()
        const categoryQ = (query.category || query.category_slug || '').toString().trim()
        const collScope = (query.collection_id || '').toString().trim()
        const hasScope = !!(categoryQ || collScope)
        const rawLimit = parseInt(query.limit, 10) || (hasScope ? 3000 : 100)
        const maxCap = hasScope || rawLimit > 200 ? 5000 : 200
        const limit = Math.min(Math.max(rawLimit, 1), maxCap)
        const offset = parseInt(query.offset, 10) || 0
        const sellerId = (query.seller_id || query.seller || '').trim()
        const status = (query.status || '').trim()
        const collectionId = (query.collection_id || '').toString().trim()
        const skuFilter = (query.sku || '').toString().trim()
        let sql = 'SELECT id, title, handle, sku, description, status, seller_id, collection_id, price_cents, inventory, metadata, variants, created_at, updated_at FROM admin_hub_products'
        const params = []
        const where = []
        if (sellerId) {
          const p = params.length + 1
          where.push(
            '(' +
              'seller_id = $' + p +
              ' OR COALESCE(NULLIF(TRIM(metadata->>\'seller_id\'), \'\'), NULL) = $' + p +
              ' OR COALESCE(NULLIF(TRIM(metadata->>\'seller\'), \'\'), NULL) = $' + p +
            ')'
          )
          params.push(sellerId)
        }
        if (status) { where.push('status = $' + (params.length + 1)); params.push(status) }
        if (collectionId) {
          where.push(
            '(' +
              'LOWER(COALESCE(collection_id::text, \'\')) = LOWER($' + (params.length + 1) + ')' +
              ' OR EXISTS (' +
                'SELECT 1 FROM jsonb_array_elements_text(COALESCE(metadata->\'collection_ids\', \'[]\'::jsonb)) AS cid(val) ' +
                'WHERE LOWER(cid.val) = LOWER($' + (params.length + 1) + ')' +
              ')' +
            ')'
          )
          params.push(collectionId)
        }
        if (skuFilter) {
          where.push('LOWER(TRIM(sku)) = LOWER($' + (params.length + 1) + ')')
          params.push(skuFilter)
        }
        const catAllow = query.category_id_allowlist
        if (Array.isArray(catAllow) && catAllow.length > 0) {
          const arr = catAllow.map((x) => String(x || '').trim().toLowerCase()).filter(Boolean)
          if (arr.length > 0) {
            const p = params.length + 1
            where.push(
              '(' +
                'LOWER(TRIM(COALESCE(metadata->>\'admin_category_id\', \'\'))) = ANY($' + p + '::text[])' +
                ' OR LOWER(TRIM(COALESCE(metadata->>\'category_id\', \'\'))) = ANY($' + p + '::text[])' +
                ' OR EXISTS (' +
                  'SELECT 1 FROM jsonb_array_elements_text(' +
                    'CASE WHEN jsonb_typeof(COALESCE(metadata->\'category_ids\', \'[]\'::jsonb)) = \'array\'' +
                    ' THEN COALESCE(metadata->\'category_ids\', \'[]\'::jsonb) ELSE \'[]\'::jsonb END' +
                  ') AS _cat_el(value)' +
                  ' WHERE LOWER(TRIM(_cat_el.value)) = ANY($' + p + '::text[])' +
                ')' +
              ')'
            )
            params.push(arr)
          }
        }
        if (where.length) sql += ' WHERE ' + where.join(' AND ')
        sql += ' ORDER BY created_at DESC LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2)
        params.push(limit, offset)
        const res = await client.query(sql, params)
        await client.end()
        return (res.rows || []).map((r) => {
          const meta = r.metadata || {};
          const mediaArr = Array.isArray(meta.media) ? meta.media : (meta.media ? [meta.media] : []);
          const thumbnail = meta.thumbnail || (mediaArr[0] ? (typeof mediaArr[0] === 'string' ? mediaArr[0] : (mediaArr[0]?.url || null)) : null);
          return {
            id: r.id,
            title: r.title,
            handle: r.handle,
            slug: r.handle,
            sku: r.sku,
            description: r.description,
            status: r.status,
            seller_id: r.seller_id,
            seller: r.seller_id,
            collection_id: r.collection_id,
            price: r.price_cents != null ? r.price_cents / 100 : 0,
            price_cents: r.price_cents,
            inventory: r.inventory != null ? r.inventory : 0,
            thumbnail,
            metadata: r.metadata,
            variants: r.variants,
            created_at: r.created_at,
            updated_at: r.updated_at,
          }
        })
      } catch (e) {
        try { await client.end() } catch (_) {}
        console.warn('listAdminHubProductsDb:', e && e.message)
        return []
      }
    }
    const BULLET_POINT_MAX_LEN = 120
    const normalizeEanValue = (v) => {
      if (v == null) return ''
      return String(v).trim()
    }
    const collectVariantEans = (variants) => {
      const out = []
      if (!Array.isArray(variants)) return out
      for (const v of variants) {
        const e = normalizeEanValue(v && v.ean)
        if (e) out.push(e)
      }
      return out
    }
    const validateProductEansDb = async (client, parentEan, variantEans, excludeProductId) => {
      const values = []
      const seen = new Set()
      const p = normalizeEanValue(parentEan)
      if (p) { seen.add(p); values.push(p) }
      for (const ve of variantEans || []) {
        const e = normalizeEanValue(ve)
        if (!e) continue
        if (p && e === p) return { ok: false, message: 'Variant EAN must be different from parent EAN' }
        if (seen.has(e)) return { ok: false, message: `Duplicate EAN in request payload: ${e}` }
        seen.add(e)
        values.push(e)
      }
      if (!values.length) return { ok: true }
      const sql =
        'SELECT id, sku, metadata, variants FROM admin_hub_products ' +
        (excludeProductId ? 'WHERE id <> $1' : '')
      const params = excludeProductId ? [excludeProductId] : []
      const res = await client.query(sql, params)
      const dbEans = new Set()
      for (const row of (res.rows || [])) {
        const pm = row && row.metadata && typeof row.metadata === 'object' ? row.metadata : {}
        const pe = normalizeEanValue(pm.ean)
        if (pe) dbEans.add(pe)
        const vv = Array.isArray(row && row.variants) ? row.variants : []
        for (const ve of collectVariantEans(vv)) dbEans.add(ve)
      }
      for (const e of values) {
        if (dbEans.has(e)) return { ok: false, message: `EAN already exists: ${e}` }
      }
      return { ok: true }
    }
    const normalizeProductMetadata = (meta) => {
      if (!meta || typeof meta !== 'object') return meta
      const out = { ...meta }
      if (Array.isArray(out.bullet_points)) {
        out.bullet_points = out.bullet_points.map((b) => String(b || '').slice(0, BULLET_POINT_MAX_LEN))
      }
      return out
    }
    const validateRequiredGpsrMetadata = (meta) => {
      const m = meta && typeof meta === 'object' ? meta : {}
      const hasManufacturer = String(m.hersteller || '').trim().length > 0
      const hasManufacturerInfo = String(m.hersteller_information || '').trim().length > 0
      const hasResponsiblePerson = String(m.verantwortliche_person_information || '').trim().length > 0
      if (hasManufacturer && hasManufacturerInfo && hasResponsiblePerson) return { ok: true }
      const missing = []
      if (!hasManufacturer) missing.push('hersteller')
      if (!hasManufacturerInfo) missing.push('hersteller_information')
      if (!hasResponsiblePerson) missing.push('verantwortliche_person_information')
      return { ok: false, message: `GPSR required fields missing: ${missing.join(', ')}` }
    }
    const createAdminHubProductDb = async (body) => {
      const client = getProductsDbClient()
      if (!client) return null
      try {
        await client.connect()
        const title = (body.title || '').trim() || 'Untitled'
        const handle = (body.handle || body.slug || slugifyTitle(title) || 'product-' + Date.now()).trim()
        const price = typeof body.price === 'number' ? Math.round(body.price * 100) : parseInt(body.price, 10) || 0
        const inventory = parseInt(body.inventory, 10) || 0
        const metaObj = body.metadata && typeof body.metadata === 'object' ? normalizeProductMetadata(body.metadata) : null
        const gpsrValidation = validateRequiredGpsrMetadata(metaObj || {})
        if (!gpsrValidation.ok) {
          await client.end()
          return { __error: gpsrValidation.message || 'GPSR validation failed' }
        }
        const metadata = metaObj ? JSON.stringify(metaObj) : null
        const variantsArr = body.variants && Array.isArray(body.variants) ? body.variants : null
        const variants = variantsArr ? JSON.stringify(variantsArr) : null
        const eanValidation = await validateProductEansDb(client, metaObj && metaObj.ean, collectVariantEans(variantsArr || []), null)
        if (!eanValidation.ok) {
          await client.end()
          return { __error: eanValidation.message || 'EAN validation failed' }
        }
        const res = await client.query(
          `INSERT INTO admin_hub_products (title, handle, sku, description, status, seller_id, collection_id, price_cents, inventory, metadata, variants)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
           RETURNING id, title, handle, sku, description, status, seller_id, collection_id, price_cents, inventory, metadata, variants, created_at, updated_at`,
          [
            title,
            handle,
            (body.sku || '').trim() || null,
            (body.description || '').trim() || null,
            (body.status || 'draft').trim() || 'draft',
            (body.seller || body.seller_id || '').trim() || null,
            body.collection_id || null,
            price,
            inventory,
            metadata,
            variants,
          ]
        )
        await client.end()
        const r = res.rows && res.rows[0]
        if (!r) return null
        return {
          id: r.id,
          title: r.title,
          handle: r.handle,
          slug: r.handle,
          sku: r.sku,
          description: r.description,
          status: r.status,
          seller_id: r.seller_id,
          seller: r.seller_id,
          collection_id: r.collection_id,
          price: r.price_cents != null ? r.price_cents / 100 : 0,
          inventory: r.inventory != null ? r.inventory : 0,
          metadata: r.metadata,
          variants: r.variants,
          created_at: r.created_at,
          updated_at: r.updated_at,
        }
      } catch (e) {
        try { await client.end() } catch (_) {}
        console.warn('createAdminHubProductDb:', e && e.message)
        return null
      }
    }
    const adminHubProductsGET = async (req, res) => {
      try {
        const q = { ...(req.query || {}) }
        const auth = req.headers['authorization'] || ''
        const token = auth.startsWith('Bearer ') ? auth.slice(7) : null
        const payload = token ? verifySellerToken(token) : null
        if (payload && !payload.is_superuser && payload.seller_id) {
          q.seller_id = String(payload.seller_id).trim()
        }
        const products = await listAdminHubProductsDb(q)
        res.json({ products, count: products.length })
      } catch (err) {
        console.error('Admin Hub products GET error:', err)
        res.status(500).json({ message: (err && err.message) || 'Internal server error' })
      }
    }
    const adminHubProductsPOST = async (req, res) => {
      try {
        const body = { ...(req.body || {}) }
        const auth = req.headers['authorization'] || ''
        const token = auth.startsWith('Bearer ') ? auth.slice(7) : null
        const payload = token ? verifySellerToken(token) : null
        const isSuperuserCaller = payload?.is_superuser || false
        const callerSellerId = (!isSuperuserCaller && payload?.seller_id) ? String(payload.seller_id).trim() : null
        if (callerSellerId) {
          body.seller_id = callerSellerId
          body.seller = callerSellerId
          body.metadata = body.metadata && typeof body.metadata === 'object' ? { ...body.metadata } : {}
          body.metadata.seller_id = callerSellerId
        }

        // EAN deduplication: check if a master product with this EAN already exists
        const incomingMeta = body.metadata && typeof body.metadata === 'object' ? body.metadata : {}
        const incomingEan = normalizeStoreEan(incomingMeta.ean || body.ean || '')
        let masterProduct = null
        let isNewMaster = true

        if (incomingEan) {
          const allProds = await listAdminHubProductsDb({ limit: 5000 })
          // Prefer true master products (seller_id = null) — they are the canonical catalog entry
          // Fall back to any product with this EAN (legacy mode where sellers own their rows)
          const truemaster = allProds.find((p) => extractEanFromHubProductRow(p) === incomingEan && !p.seller_id)
          masterProduct = truemaster || allProds.find((p) => extractEanFromHubProductRow(p) === incomingEan) || null
        }

        if (masterProduct) {
          isNewMaster = false
          // EAN already exists — link this seller to the master product via a listing
          const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
          const { Client } = require('pg')
          const lc = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
          await lc.connect()
          const effectiveSellerId = callerSellerId || (isSuperuserCaller ? null : null)
          let listing = null
          if (effectiveSellerId) {
            const existListing = await lc.query(
              'SELECT id, price_cents, inventory, status FROM admin_hub_seller_listings WHERE product_id = $1 AND seller_id = $2',
              [masterProduct.id, effectiveSellerId]
            )
            if (existListing.rows[0]) {
              listing = existListing.rows[0]
            } else {
              const priceCents = typeof body.price === 'number' ? Math.round(body.price * 100) : parseInt(body.price, 10) || 0
              const inventory = parseInt(body.inventory, 10) || 0
              const lr = await lc.query(
                'INSERT INTO admin_hub_seller_listings (product_id, seller_id, price_cents, inventory, status) VALUES ($1,$2,$3,$4,$5) RETURNING *',
                [masterProduct.id, effectiveSellerId, priceCents || masterProduct.price_cents || 0, inventory, 'active']
              )
              listing = lr.rows[0]
            }
          }
          await lc.end()
          // Seller onboarding copy: keep shared catalog data, but clear seller-owned fields.
          const sellerViewProduct = {
            ...masterProduct,
            status: 'draft',
            sku: null,
            price: 0,
            inventory: 0,
            metadata: {
              ...(masterProduct.metadata && typeof masterProduct.metadata === 'object' ? masterProduct.metadata : {}),
              publish_date: null,
              seller_name: null,
              shop_name: null,
              brand_id: null,
              shipping_group_id: null,
              related_product_ids: [],
            },
            variants: Array.isArray(masterProduct.variants)
              ? masterProduct.variants.map((v) => ({
                  ...(v || {}),
                  sku: null,
                  price: undefined,
                  price_cents: 0,
                  compare_at_price: undefined,
                  compare_at_price_cents: undefined,
                  inventory: 0,
                  inventory_quantity: 0,
                  metadata: {
                    ...(v?.metadata && typeof v.metadata === 'object' ? v.metadata : {}),
                    brand_id: null,
                    shipping_group_id: null,
                  },
                }))
              : [],
          }
          return res.status(200).json({ product: sellerViewProduct, listing, deduplicated: true, is_new_master: false })
        }

        // New product — create master (seller_id = null → superuser-owned)
        const masterBody = { ...body, seller_id: null, seller: null }
        if (masterBody.metadata) masterBody.metadata.seller_id = undefined
        const row = await createAdminHubProductDb(masterBody)
        if (row && row.__error) return res.status(400).json({ message: row.__error })
        if (!row) return res.status(503).json({ message: 'Database not configured or insert failed' })

        // Create listing for the seller who submitted
        let listing = null
        if (callerSellerId && row.id) {
          const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
          const { Client } = require('pg')
          const lc = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
          try {
            await lc.connect()
            const lr = await lc.query(
              'INSERT INTO admin_hub_seller_listings (product_id, seller_id, price_cents, inventory, status) VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING RETURNING *',
              [row.id, callerSellerId, row.price_cents || 0, row.inventory || 0, 'active']
            )
            listing = lr.rows[0] || null
            await lc.end()
          } catch (_) { try { await lc.end() } catch (__) {} }
        }
        res.status(201).json({ product: row, listing, deduplicated: false, is_new_master: true })
      } catch (err) {
        console.error('Admin Hub products POST error:', err)
        res.status(500).json({ message: (err && err.message) || 'Internal server error' })
      }
    }
    const getAdminHubProductByIdOrHandleDb = async (idOrHandle) => {
      const client = getProductsDbClient()
      if (!client) return null
      try {
        await client.connect()
        const val = String(idOrHandle || '').trim()
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val)
        let res
        if (isUuid) {
          res = await client.query(
            'SELECT id, title, handle, sku, description, status, seller_id, collection_id, price_cents, inventory, metadata, variants, created_at, updated_at FROM admin_hub_products WHERE id = $1',
            [val]
          )
        } else {
          res = await client.query(
            'SELECT id, title, handle, sku, description, status, seller_id, collection_id, price_cents, inventory, metadata, variants, created_at, updated_at FROM admin_hub_products WHERE LOWER(handle) = LOWER($1)',
            [val]
          )
          if (!res.rows || !res.rows[0]) {
            res = await client.query(
              'SELECT id, title, handle, sku, description, status, seller_id, collection_id, price_cents, inventory, metadata, variants, created_at, updated_at FROM admin_hub_products WHERE EXISTS (SELECT 1 FROM jsonb_each(COALESCE(metadata->\'translations\', \'{}\'::jsonb)) AS tr(locale_key, tr_data) WHERE tr_data ? \'handle\' AND LENGTH(TRIM(COALESCE(tr_data->>\'handle\', \'\'))) > 0 AND LOWER(TRIM(tr_data->>\'handle\')) = LOWER($1)) LIMIT 1',
              [val]
            )
          }
        }
        await client.end()
        const r = res.rows && res.rows[0]
        if (!r) return null
        return {
          id: r.id,
          title: r.title,
          handle: r.handle,
          slug: r.handle,
          sku: r.sku,
          description: r.description,
          status: r.status,
          seller_id: r.seller_id,
          seller: r.seller_id,
          collection_id: r.collection_id,
          price: r.price_cents != null ? r.price_cents / 100 : 0,
          inventory: r.inventory != null ? r.inventory : 0,
          metadata: r.metadata,
          variants: r.variants,
          created_at: r.created_at,
          updated_at: r.updated_at,
        }
      } catch (e) {
        try { await client.end() } catch (_) {}
        console.warn('getAdminHubProductByIdOrHandleDb:', e && e.message)
        return null
      }
    }
    const adminHubProductByIdGET = async (req, res) => {
      try {
        const product = await getAdminHubProductByIdOrHandleDb(req.params.id)
        if (!product) {
          res.status(404).json({ message: 'Product not found' })
          return
        }
        res.json({ product })
      } catch (err) {
        console.error('Admin Hub product GET error:', err)
        res.status(500).json({ message: (err && err.message) || 'Internal server error' })
      }
    }
    const updateAdminHubProductDb = async (id, body) => {
      const client = getProductsDbClient()
      if (!client) return null
      try {
        const existing = await getAdminHubProductByIdOrHandleDb(id)
        if (!existing) return null
        const uuid = existing.id
        await client.connect()
        const title = body.title !== undefined ? String(body.title).trim() || existing.title : existing.title
        const handle = body.handle !== undefined ? String(body.handle).trim() || existing.handle : existing.handle
        const sku = body.sku !== undefined ? (body.sku === '' ? null : String(body.sku).trim()) : existing.sku
        const description = body.description !== undefined ? (body.description === '' ? null : String(body.description)) : existing.description
        const status = body.status !== undefined ? String(body.status).trim() || 'draft' : existing.status
        const price = body.price !== undefined ? Math.round(Number(body.price) * 100) : (existing.price != null ? Math.round(Number(existing.price) * 100) : 0)
        const inventory = body.inventory !== undefined ? parseInt(body.inventory, 10) || 0 : (existing.inventory ?? 0)
        let metadataObj = existing.metadata && typeof existing.metadata === 'object' ? { ...existing.metadata } : {}
        if (body.metadata !== undefined && body.metadata && typeof body.metadata === 'object') {
          metadataObj = normalizeProductMetadata({ ...metadataObj, ...body.metadata })
        }
        const bodyKeys = Object.keys(body || {})
        const onlyVariantPatch = bodyKeys.length > 0 && bodyKeys.every((k) => k === 'variants')
        if (!onlyVariantPatch) {
          const gpsrValidation = validateRequiredGpsrMetadata(metadataObj || {})
          if (!gpsrValidation.ok) {
            await client.end()
            return { __error: gpsrValidation.message || 'GPSR validation failed' }
          }
        }
        const nextVariantsArr = body.variants !== undefined
          ? (Array.isArray(body.variants) ? body.variants : [])
          : (Array.isArray(existing.variants) ? existing.variants : [])
        const eanValidation = await validateProductEansDb(client, metadataObj && metadataObj.ean, collectVariantEans(nextVariantsArr), uuid)
        if (!eanValidation.ok) {
          await client.end()
          return { __error: eanValidation.message || 'EAN validation failed' }
        }
        const metadata = Object.keys(metadataObj).length ? JSON.stringify(metadataObj) : null
        const variants = body.variants !== undefined ? (Array.isArray(body.variants) ? JSON.stringify(body.variants) : null) : (existing.variants ? JSON.stringify(existing.variants) : null)
        const collection_id = body.collection_id !== undefined ? body.collection_id || null : existing.collection_id
        await client.query(
          `UPDATE admin_hub_products SET title = $1, handle = $2, sku = $3, description = $4, status = $5, price_cents = $6, inventory = $7, metadata = $8, variants = $9, collection_id = $10, updated_at = now() WHERE id = $11`,
          [title, handle, sku, description, status, price, inventory, metadata, variants, collection_id, uuid]
        )
        await client.end()
        const updated = await getAdminHubProductByIdOrHandleDb(uuid)
        return updated
      } catch (e) {
        try { await client.end() } catch (_) {}
        console.warn('updateAdminHubProductDb:', e && e.message)
        return null
      }
    }
    const adminHubProductByIdPUT = async (req, res) => {
      try {
        const body = req.body || {}
        const auth = req.headers['authorization'] || ''
        const token = auth.startsWith('Bearer ') ? auth.slice(7) : null
        const sellerPayload = token ? verifySellerToken(token) : null
        const isSuperuserCaller = sellerPayload?.is_superuser || false
        const callerSellerId = (!isSuperuserCaller && sellerPayload?.seller_id) ? String(sellerPayload.seller_id).trim() : null
        const existing = await getAdminHubProductByIdOrHandleDb(req.params.id)

        // EAN immutability: once created, EANs can never be changed by anyone.
        if (existing) {
          const normalizeEan = (v) => {
            if (v == null) return ''
            return String(v).trim()
          }
          const existingMeta = existing && existing.metadata && typeof existing.metadata === 'object' ? existing.metadata : {}
          const existingVariants = Array.isArray(existing?.variants) ? existing.variants : []
          const incomingMeta = body?.metadata && typeof body.metadata === 'object' ? body.metadata : {}
          const incomingVariants = Array.isArray(body?.variants) ? body.variants : []

          const exMetaEan = normalizeEan(existingMeta?.ean)
          const inMetaEan = normalizeEan(incomingMeta?.ean)
          if (inMetaEan && exMetaEan && inMetaEan !== exMetaEan) {
            return res.status(400).json({ message: 'EAN cannot be changed.' })
          }

          // Compare variant EANs by SKU
          const exBySku = new Map(
            existingVariants
              .filter((v) => v && String(v.sku || '').trim())
              .map((v) => [String(v.sku || '').trim(), v])
          )
          for (const iv of incomingVariants) {
            const sku = String(iv?.sku || '').trim()
            const inEan = normalizeEan(iv?.ean)
            if (!sku || !inEan) continue
            const ev = exBySku.get(sku)
            if (!ev) continue
            const exEan = normalizeEan(ev?.ean)
            if (exEan && inEan !== exEan) {
              return res.status(400).json({ message: 'EAN cannot be changed.' })
            }
          }
        }

        // Seller-specific fields that can be saved to the listing without superuser approval
        const SELLER_LISTING_FIELDS = ['price', 'inventory', 'status', 'sku']
        const SELLER_LISTING_META_FIELDS = ['shipping_group_id', 'brand_id', 'publish_date', 'seller_name', 'shop_name']

        // Non-owner sellers may only propose shared changes (shared content); never update shared content directly.
        if (callerSellerId && existing && existing.seller_id && String(existing.seller_id).trim() !== callerSellerId && !isSuperuserCaller) {
          const existingMeta = existing && existing.metadata && typeof existing.metadata === 'object' ? existing.metadata : {}
          const incomingMeta = body?.metadata && typeof body.metadata === 'object' ? body.metadata : {}

          const stringifyVal = (v) => {
            if (v == null) return ''
            if (typeof v === 'object') return JSON.stringify(v)
            return String(v)
          }

          const mergePrices = (a, b) => {
            const out = { ...(a || {}) }
            const inPrices = (b && typeof b === 'object') ? b : {}
            for (const [country, val] of Object.entries(inPrices)) {
              out[country] = { ...(out[country] || {}), ...(val && typeof val === 'object' ? val : {}) }
            }
            return out
          }

          const mergeTranslations = (a, b) => {
            const out = { ...(a || {}) }
            const inTr = (b && typeof b === 'object') ? b : {}
            for (const [lang, val] of Object.entries(inTr)) {
              out[lang] = { ...(out[lang] || {}), ...(val && typeof val === 'object' ? val : {}) }
            }
            return out
          }

          const sharedMetaKeys = Object.keys(incomingMeta).filter((k) => !SELLER_LISTING_META_FIELDS.includes(k))
          const sharedTitleChanged = body?.title !== undefined && String(body.title || '').trim() !== String(existing?.title || '').trim()
          const sharedDescChanged = body?.description !== undefined && String(body.description || '') !== String(existing?.description || '')

          // If seller tries to change any shared content key → create change requests and block direct update.
          const sharedMetaKeysChanged = sharedMetaKeys.filter((metaKey) => {
            const oldVal = existingMeta?.[metaKey]
            let newVal = incomingMeta?.[metaKey]
            if (metaKey === 'prices') newVal = mergePrices(existingMeta?.prices, newVal)
            if (metaKey === 'translations') newVal = mergeTranslations(existingMeta?.translations, newVal)
            const oldStr = stringifyVal(oldVal)
            const newStr = stringifyVal(newVal)
            return oldStr !== newStr
          })
          const wantsSharedChange = sharedTitleChanged || sharedDescChanged || sharedMetaKeysChanged.length > 0
          if (wantsSharedChange) {
            const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
            const { Client } = require('pg')
            const qc = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
            try {
              await qc.connect()
              // title/description
              if (sharedTitleChanged) {
                await qc.query(
                  `INSERT INTO admin_hub_product_change_requests (product_id, seller_id, status, field_name, old_value, new_value)
                   VALUES ($1,$2,'pending','title',$3,$4)`,
                  [existing.id, callerSellerId, existing.title || null, body.title || '']
                )
              }
              if (sharedDescChanged) {
                await qc.query(
                  `INSERT INTO admin_hub_product_change_requests (product_id, seller_id, status, field_name, old_value, new_value)
                   VALUES ($1,$2,'pending','description',$3,$4)`,
                  [existing.id, callerSellerId, existing.description || null, body.description || '']
                )
              }
              // metadata keys
              for (const metaKey of sharedMetaKeysChanged) {
                const oldVal = existingMeta?.[metaKey]
                let newVal = incomingMeta?.[metaKey]
                // Prevent wiping unrelated object content on approval by merging.
                if (metaKey === 'prices') newVal = mergePrices(existingMeta?.prices, newVal)
                if (metaKey === 'translations') newVal = mergeTranslations(existingMeta?.translations, newVal)
                await qc.query(
                  `INSERT INTO admin_hub_product_change_requests (product_id, seller_id, status, field_name, old_value, new_value)
                   VALUES ($1,$2,'pending',$3,$4,$5)`,
                  [
                    existing.id,
                    callerSellerId,
                    `metadata.${metaKey}`,
                    oldVal == null ? null : String(typeof oldVal === 'object' ? JSON.stringify(oldVal) : oldVal),
                    newVal == null ? '' : String(typeof newVal === 'object' ? JSON.stringify(newVal) : newVal),
                  ]
                )
              }
            } finally {
              try { await qc.end() } catch (_) {}
            }
            return res.status(202).json({ message: 'Change proposal submitted. A superuser will review it.', suggestion_submitted: true })
          }

          // Shared content change yoksa: sadece satıcıya özel listing alanlarını güncelle.
          // (Bu sayede non-owner doğrudan shared ürün verisini değiştiremez.)
          const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
          const { Client } = require('pg')
          const lc = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
          await lc.connect()
          const existingListing = await lc.query(
            'SELECT id FROM admin_hub_seller_listings WHERE product_id = $1 AND seller_id = $2 LIMIT 1',
            [existing.id, callerSellerId]
          )
          const priceCents = body.price !== undefined ? Math.max(0, Math.round(Number(body.price || 0) * 100)) : null
          const inventory = body.inventory !== undefined ? Math.max(0, parseInt(body.inventory, 10) || 0) : null
          const status = body.status !== undefined ? String(body.status || 'active') : null
          const skuVal = body.sku !== undefined ? (body.sku || null) : null
          const meta = body.metadata && typeof body.metadata === 'object' ? body.metadata : {}
          const shippingGroupId = meta.shipping_group_id !== undefined ? (meta.shipping_group_id || null) : null
          const brandId = meta.brand_id !== undefined ? (meta.brand_id || null) : null
          const publishDate = meta.publish_date !== undefined ? (meta.publish_date || null) : null

          let listing = null
          if (existingListing.rows[0]) {
            const lid = existingListing.rows[0].id
            const ur = await lc.query(
              `UPDATE admin_hub_seller_listings
               SET price_cents = COALESCE($1, price_cents),
                   inventory = COALESCE($2, inventory),
                   status = COALESCE($3, status),
                   sku = COALESCE($4, sku),
                   shipping_group_id = COALESCE($5, shipping_group_id),
                   brand_id = COALESCE($6, brand_id),
                   publish_date = COALESCE($7, publish_date),
                   updated_at = now()
               WHERE id = $8
               RETURNING *`,
              [priceCents, inventory, status, skuVal, shippingGroupId, brandId, publishDate, lid]
            )
            listing = ur.rows[0] || null
          } else {
            const ir = await lc.query(
              `INSERT INTO admin_hub_seller_listings (product_id, seller_id, price_cents, inventory, status, sku, shipping_group_id, brand_id, publish_date)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
               RETURNING *`,
              [existing.id, callerSellerId, priceCents || 0, inventory || 0, status || 'draft', skuVal, shippingGroupId, brandId, publishDate]
            )
            listing = ir.rows[0] || null
          }
          await lc.end()

          res.json({
            product: {
              ...existing,
              price: (listing?.price_cents || 0) / 100,
              price_cents: listing?.price_cents || 0,
              inventory: listing?.inventory || 0,
              status: listing?.status || existing.status,
              sku: listing?.sku || null,
              metadata: {
                ...(existing.metadata && typeof existing.metadata === 'object' ? existing.metadata : {}),
                ...(listing?.shipping_group_id ? { shipping_group_id: listing.shipping_group_id } : {}),
                ...(listing?.brand_id ? { brand_id: listing.brand_id } : {}),
                ...(listing?.publish_date ? { publish_date: listing.publish_date } : {}),
              },
            },
            listing,
            listing_saved: true,
            shared_change_blocked: true,
          })
        }

        if (callerSellerId && existing && !existing.seller_id) {
          // Master product: non-superuser may only persist seller-owned listing fields.
          // Check if only seller-specific fields are being changed
          const bodyKeys = Object.keys(body).filter((k) => k !== 'metadata')
          const metaKeys = body.metadata && typeof body.metadata === 'object' ? Object.keys(body.metadata).filter((k) => k !== 'translations') : []
          const hasSharedBodyChange = bodyKeys.some((k) => !SELLER_LISTING_FIELDS.includes(k))
          const hasSharedMetaChange = metaKeys.some((k) => !SELLER_LISTING_META_FIELDS.includes(k))
          const wantsSharedChange = hasSharedBodyChange || hasSharedMetaChange
          if (wantsSharedChange) {
            const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
            const { Client } = require('pg')
            const qc = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
            try {
              await qc.connect()
              const sharedKeys = Object.keys(body || {}).filter((k) => !['price', 'inventory', 'status'].includes(k))
              for (const key of sharedKeys) {
                const oldVal = existing && existing[key] !== undefined ? existing[key] : (existing?.metadata && existing.metadata[key] !== undefined ? existing.metadata[key] : null)
                await qc.query(
                  `INSERT INTO admin_hub_product_change_requests (product_id, seller_id, status, field_name, old_value, new_value)
                   VALUES ($1,$2,'pending',$3,$4,$5)`,
                  [
                    existing.id,
                    callerSellerId,
                    String(key),
                    oldVal == null ? null : String(typeof oldVal === 'object' ? JSON.stringify(oldVal) : oldVal),
                    body[key] == null ? '' : String(typeof body[key] === 'object' ? JSON.stringify(body[key]) : body[key]),
                  ]
                )
              }
              await qc.end()
            } catch (_) {
              try { await qc.end() } catch (__) {}
            }
            res.status(202).json({ message: 'Degisiklik oneriniz superuser onayina gonderildi.', suggestion_submitted: true })
            return
          }
          const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
          const { Client } = require('pg')
          const lc = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
          await lc.connect()
          const existingListing = await lc.query(
            'SELECT id FROM admin_hub_seller_listings WHERE product_id = $1 AND seller_id = $2 LIMIT 1',
            [existing.id, callerSellerId]
          )
          const priceCents = body.price !== undefined ? Math.max(0, Math.round(Number(body.price || 0) * 100)) : null
          const inventory = body.inventory !== undefined ? Math.max(0, parseInt(body.inventory, 10) || 0) : null
          const status = body.status !== undefined ? String(body.status || 'active') : null
          const skuVal = body.sku !== undefined ? (body.sku || null) : null
          const meta = body.metadata && typeof body.metadata === 'object' ? body.metadata : {}
          const shippingGroupId = meta.shipping_group_id !== undefined ? (meta.shipping_group_id || null) : null
          const brandId = meta.brand_id !== undefined ? (meta.brand_id || null) : null
          const publishDate = meta.publish_date !== undefined ? (meta.publish_date || null) : null
          let listing = null
          if (existingListing.rows[0]) {
            const lid = existingListing.rows[0].id
            const ur = await lc.query(
              `UPDATE admin_hub_seller_listings
               SET price_cents = COALESCE($1, price_cents),
                   inventory = COALESCE($2, inventory),
                   status = COALESCE($3, status),
                   sku = COALESCE($4, sku),
                   shipping_group_id = COALESCE($5, shipping_group_id),
                   brand_id = COALESCE($6, brand_id),
                   publish_date = COALESCE($7, publish_date),
                   updated_at = now()
               WHERE id = $8
               RETURNING *`,
              [priceCents, inventory, status, skuVal, shippingGroupId, brandId, publishDate, lid]
            )
            listing = ur.rows[0] || null
          } else {
            const ir = await lc.query(
              `INSERT INTO admin_hub_seller_listings (product_id, seller_id, price_cents, inventory, status, sku, shipping_group_id, brand_id, publish_date)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
               RETURNING *`,
              [existing.id, callerSellerId, priceCents || 0, inventory || 0, status || 'draft', skuVal, shippingGroupId, brandId, publishDate]
            )
            listing = ir.rows[0] || null
          }
          await lc.end()
          // Merge listing fields into the product response so frontend can show current seller values
          const productWithListingData = {
            ...existing,
            price: (listing?.price_cents || 0) / 100,
            price_cents: listing?.price_cents || 0,
            inventory: listing?.inventory || 0,
            status: listing?.status || existing.status,
            sku: listing?.sku || null,
            metadata: {
              ...(existing.metadata && typeof existing.metadata === 'object' ? existing.metadata : {}),
              ...(listing?.shipping_group_id ? { shipping_group_id: listing.shipping_group_id } : {}),
              ...(listing?.brand_id ? { brand_id: listing.brand_id } : {}),
              ...(listing?.publish_date ? { publish_date: listing.publish_date } : {}),
            },
          }
          res.json({ product: productWithListingData, listing, listing_saved: true, shared_change_blocked: false })
          return
        }
        const product = await updateAdminHubProductDb(req.params.id, body)
        if (product && product.__error) {
          res.status(400).json({ message: product.__error })
          return
        }
        if (!product) {
          res.status(404).json({ message: 'Product not found' })
          return
        }
        res.json({ product })
      } catch (err) {
        console.error('Admin Hub product PUT error:', err)
        res.status(500).json({ message: (err && err.message) || 'Internal server error' })
      }
    }
    const adminHubProductByIdDELETE = async (req, res) => {
      const client = getProductsDbClient()
      if (!client) return res.status(503).json({ message: 'Database not configured' })
      try {
        const existing = await getAdminHubProductByIdOrHandleDb(req.params.id)
        if (!existing) return res.status(404).json({ message: 'Product not found' })
        await client.connect()
        // Remove deleted product id from other products' related_product_ids to avoid stale references in sellercentral UI
        await client.query(
          `UPDATE admin_hub_products
             SET metadata = jsonb_set(
               COALESCE(metadata, '{}'::jsonb),
               '{related_product_ids}',
               COALESCE(
                 (
                   SELECT jsonb_agg(to_jsonb(v))
                   FROM (
                     SELECT elem AS v
                     FROM jsonb_array_elements_text(COALESCE(metadata->'related_product_ids', '[]'::jsonb)) AS elem
                     WHERE LOWER(elem) <> LOWER($1::text)
                   ) t
                 ),
                 '[]'::jsonb
               ),
               true
             ),
             updated_at = now()
           WHERE id <> $2
             AND COALESCE(metadata->'related_product_ids', '[]'::jsonb) @> to_jsonb(ARRAY[$1::text])`,
          [existing.id, existing.id]
        )
        await client.query('DELETE FROM admin_hub_products WHERE id = $1', [existing.id])
        await client.end()
        res.status(200).json({ deleted: true })
      } catch (err) {
        try { await client.end() } catch (_) {}
        console.error('Admin Hub product DELETE error:', err)
        res.status(500).json({ message: (err && err.message) || 'Internal server error' })
      }
    }
    httpApp.get('/admin-hub/products', adminHubProductsGET)
    httpApp.post('/admin-hub/products', adminHubProductsPOST)
    // EAN lookup — returns master product by EAN without seller filter (read-only, catalog fields only)
    httpApp.get('/admin-hub/products/ean-lookup', requireSellerAuth, async (req, res) => {
      try {
        const ean = String(req.query.ean || '').trim()
        if (!ean) return res.status(400).json({ message: 'ean query param required' })
        const normEan = normalizeStoreEan(ean)
        const allProds = await listAdminHubProductsDb({ limit: 5000 })
        const master = allProds.find((p) => extractEanFromHubProductRow(p) === normEan && !p.seller_id)
          || allProds.find((p) => extractEanFromHubProductRow(p) === normEan)
          || null
        if (!master) return res.status(404).json({ message: 'No product found with this EAN' })
        // Return catalog-only fields (strip seller pricing)
        const catalogProduct = {
          id: master.id,
          title: master.title,
          handle: master.handle,
          description: master.description,
          metadata: master.metadata && typeof master.metadata === 'object' ? { ...master.metadata } : {},
          variants: Array.isArray(master.variants)
            ? master.variants.map((v) => ({ ...v, sku: undefined, ean: (v && v.ean) || undefined, price: undefined, price_cents: 0, inventory: 0, inventory_quantity: 0 }))
            : [],
        }
        res.json({ product: catalogProduct, found: true })
      } catch (err) {
        res.status(500).json({ message: err?.message || 'Lookup failed' })
      }
    })
    httpApp.get('/admin-hub/products/:id', adminHubProductByIdGET)
    httpApp.put('/admin-hub/products/:id', adminHubProductByIdPUT)
    httpApp.delete('/admin-hub/products/:id', adminHubProductByIdDELETE)
    // PATCH /admin-hub/products/:id/variants — variant-only update (no GPSR validation)
    httpApp.patch('/admin-hub/products/:id/variants', requireSellerAuth, async (req, res) => {
      try {
        const body = req.body || {}
        if (!Array.isArray(body.variants)) {
          return res.status(400).json({ message: 'variants array required' })
        }
        const existing = await getAdminHubProductByIdOrHandleDb(req.params.id)
        if (!existing) return res.status(404).json({ message: 'Product not found' })
        const isSuperuser = req.sellerUser?.is_superuser || false
        const callerSellerId = (!isSuperuser && req.sellerUser?.seller_id) ? String(req.sellerUser.seller_id).trim() : null
        // Sellers can only update their own products
        if (callerSellerId && existing.seller_id && String(existing.seller_id).trim() !== callerSellerId) {
          return res.status(403).json({ message: 'Forbidden' })
        }

        // EAN immutability for variant-level updates
        const normalizeEan = (v) => {
          if (v == null) return ''
          return String(v).trim()
        }
        const existingVariants = Array.isArray(existing?.variants) ? existing.variants : []
        const incomingVariants = Array.isArray(body?.variants) ? body.variants : []
        const existingBySku = new Map(
          existingVariants
            .filter((v) => v && String(v?.sku || '').trim())
            .map((v) => [String(v.sku || '').trim(), v])
        )
        for (const iv of incomingVariants) {
          const sku = String(iv?.sku || '').trim()
          const inEan = normalizeEan(iv?.ean)
          if (!sku || !inEan) continue
          const ev = existingBySku.get(sku)
          if (!ev) continue
          const exEan = normalizeEan(ev?.ean)
          if (exEan && inEan !== exEan) {
            return res.status(400).json({ message: 'EAN cannot be changed.' })
          }
        }

        const client = getProductsDbClient()
        if (!client) return res.status(503).json({ message: 'Database not configured' })
        await client.connect()
        const variantsJson = JSON.stringify(body.variants)
        await client.query('UPDATE admin_hub_products SET variants = $1, updated_at = now() WHERE id = $2', [variantsJson, existing.id])
        await client.end()
        const updated = await getAdminHubProductByIdOrHandleDb(existing.id)
        res.json({ product: updated })
      } catch (err) {
        console.error('PATCH product variants error:', err)
        res.status(500).json({ message: (err && err.message) || 'Internal server error' })
      }
    })

    /** ISO2 uppercase; UK → GB. Invalid → ''. */
    const normalizeHubCountryCode = (code) => {
      if (code == null || code === '') return ''
      const s = String(code).trim().toUpperCase()
      if (s === 'UK') return 'GB'
      return /^[A-Z]{2}$/.test(s) ? s : ''
    }
    const normalizeThresholdsObject = (raw) => {
      if (!raw || typeof raw !== 'object') return null
      const out = {}
      for (const [k, v] of Object.entries(raw)) {
        const nk = normalizeHubCountryCode(k)
        if (!nk) continue
        out[nk] = v
      }
      return out
    }

    // Seller settings (store name) – persisted in DB so shop shows correct Verkäufer
    const getSellerStoreName = async (sellerId) => {
      const id = (sellerId || 'default').toString().trim() || 'default'
      const client = getProductsDbClient()
      if (!client) return null
      try {
        await client.connect()
        const res = await client.query('SELECT store_name FROM admin_hub_seller_settings WHERE seller_id = $1', [id])
        await client.end()
        const row = res.rows && res.rows[0]
        const name = row && row.store_name != null && String(row.store_name).trim() !== '' ? String(row.store_name).trim() : null
        return name
      } catch (e) {
        try { await client.end() } catch (_) {}
        return null
      }
    }
    const getApprovedSellerIdsSet = async () => {
      const client = getProductsDbClient()
      if (!client) return new Set()
      try {
        await client.connect()
        const res = await client.query(
          `SELECT seller_id
           FROM seller_users
           WHERE seller_id IS NOT NULL
             AND LENGTH(TRIM(seller_id)) > 0
             AND LOWER(COALESCE(approval_status, '')) NOT IN ('rejected', 'suspended')`
        )
        await client.end()
        return new Set((res.rows || []).map((r) => String(r.seller_id || '').trim()).filter(Boolean))
      } catch (_) {
        try { await client.end() } catch (_) {}
        return new Set()
      }
    }
    const isStoreVisibleSellerProduct = (product, approvedSellerIds) => {
      const sid = String(product?.seller_id || '').trim()
      if (!sid || sid === 'default') return true
      return approvedSellerIds.has(sid)
    }
    const approvedSellerIdsStoreGET = async (_req, res) => {
      try {
        const approvedSellerIds = await getApprovedSellerIdsSet()
        return res.json({ seller_ids: [...approvedSellerIds] })
      } catch (_) {
        return res.json({ seller_ids: [] })
      }
    }
    httpApp.get('/store/approved-seller-ids', approvedSellerIdsStoreGET)
    const sellerSettingsGET = async (req, res) => {
      const sellerId = (req.query.seller_id || 'default').toString().trim() || 'default'
      const client = getProductsDbClient()
      if (!client) return res.json({ store_name: '' })
      try {
        await client.connect()
        try {
          const r = await client.query('SELECT store_name, free_shipping_thresholds, shop_logo_url, shop_favicon_url, sellercentral_logo_url, sellercentral_favicon_url, shop_logo_height, sellercentral_logo_height, platform_name, support_email FROM admin_hub_seller_settings WHERE seller_id = $1', [sellerId])
          const row = r.rows && r.rows[0]
          const store_name = row && row.store_name != null ? String(row.store_name) : ''
          let free_shipping_thresholds = (row && row.free_shipping_thresholds) || null
          if (free_shipping_thresholds && typeof free_shipping_thresholds === 'object') {
            free_shipping_thresholds = normalizeThresholdsObject(free_shipping_thresholds)
          }
          const shop_logo_url = row && row.shop_logo_url ? String(row.shop_logo_url) : ''
          const shop_favicon_url = row && row.shop_favicon_url ? String(row.shop_favicon_url) : ''
          const sellercentral_logo_url = row && row.sellercentral_logo_url ? String(row.sellercentral_logo_url) : ''
          const sellercentral_favicon_url = row && row.sellercentral_favicon_url ? String(row.sellercentral_favicon_url) : ''
          const shop_logo_height = row && row.shop_logo_height != null ? Number(row.shop_logo_height) : 34
          const sellercentral_logo_height = row && row.sellercentral_logo_height != null ? Number(row.sellercentral_logo_height) : 30
          const platform_name = row && row.platform_name ? String(row.platform_name) : ''
          const support_email = row && row.support_email ? String(row.support_email) : ''
          res.json({ store_name, free_shipping_thresholds, shop_logo_url, shop_favicon_url, sellercentral_logo_url, sellercentral_favicon_url, shop_logo_height, sellercentral_logo_height, platform_name, support_email })
        } finally {
          await client.end().catch(() => {})
        }
      } catch (err) {
        console.error('sellerSettingsGET:', err)
        res.json({ store_name: '', shop_logo_url: '', shop_favicon_url: '', sellercentral_logo_url: '', sellercentral_favicon_url: '', shop_logo_height: 34, sellercentral_logo_height: 30 })
      }
    }
    const sellerSettingsPATCH = async (req, res) => {
      try {
        const body = req.body || {}
        const store_name = (body.store_name != null ? String(body.store_name) : '').trim()
        const sellerId = (body.seller_id || req.query.seller_id || 'default').toString().trim() || 'default'
        let free_shipping_thresholds = (body.free_shipping_thresholds && typeof body.free_shipping_thresholds === 'object')
          ? body.free_shipping_thresholds : null
        const shop_logo_url = body.shop_logo_url !== undefined ? (body.shop_logo_url ? String(body.shop_logo_url).trim() : null) : undefined
        const shop_favicon_url = body.shop_favicon_url !== undefined ? (body.shop_favicon_url ? String(body.shop_favicon_url).trim() : null) : undefined
        const sellercentral_logo_url = body.sellercentral_logo_url !== undefined ? (body.sellercentral_logo_url ? String(body.sellercentral_logo_url).trim() : null) : undefined
        const sellercentral_favicon_url = body.sellercentral_favicon_url !== undefined ? (body.sellercentral_favicon_url ? String(body.sellercentral_favicon_url).trim() : null) : undefined
        const shop_logo_height = body.shop_logo_height !== undefined && body.shop_logo_height !== null
          ? Math.max(20, Math.min(120, Number(body.shop_logo_height) || 34))
          : undefined
        const sellercentral_logo_height = body.sellercentral_logo_height !== undefined && body.sellercentral_logo_height !== null
          ? Math.max(20, Math.min(120, Number(body.sellercentral_logo_height) || 30))
          : undefined
        const platform_name = body.platform_name !== undefined ? (body.platform_name ? String(body.platform_name).trim() : null) : undefined
        const support_email = body.support_email !== undefined ? (body.support_email ? String(body.support_email).trim() : null) : undefined
        const announcement_bar_items = body.announcement_bar_items !== undefined
          ? (Array.isArray(body.announcement_bar_items) ? body.announcement_bar_items : null)
          : undefined
        if (free_shipping_thresholds) {
          free_shipping_thresholds = normalizeThresholdsObject(free_shipping_thresholds)
        }
        const client = getProductsDbClient()
        if (!client) return res.status(500).json({ message: 'Database unavailable' })
        await client.connect()
        const thresholdsJson = free_shipping_thresholds ? JSON.stringify(free_shipping_thresholds) : null
        log.info('[sellerSettingsPATCH] saving free_shipping_thresholds:', thresholdsJson)
        const announcementJson = announcement_bar_items !== undefined ? JSON.stringify(announcement_bar_items) : undefined
        await client.query(
          `INSERT INTO admin_hub_seller_settings (
             seller_id, store_name, free_shipping_thresholds, shop_logo_url, shop_favicon_url, sellercentral_logo_url, sellercentral_favicon_url, shop_logo_height, sellercentral_logo_height, platform_name, support_email, announcement_bar_items, updated_at
           ) VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, now())
           ON CONFLICT (seller_id) DO UPDATE SET
             store_name = COALESCE($2, admin_hub_seller_settings.store_name),
             free_shipping_thresholds = COALESCE($3::jsonb, admin_hub_seller_settings.free_shipping_thresholds),
             shop_logo_url = COALESCE($4, admin_hub_seller_settings.shop_logo_url),
             shop_favicon_url = COALESCE($5, admin_hub_seller_settings.shop_favicon_url),
             sellercentral_logo_url = COALESCE($6, admin_hub_seller_settings.sellercentral_logo_url),
             sellercentral_favicon_url = COALESCE($7, admin_hub_seller_settings.sellercentral_favicon_url),
             shop_logo_height = COALESCE($8, admin_hub_seller_settings.shop_logo_height),
             sellercentral_logo_height = COALESCE($9, admin_hub_seller_settings.sellercentral_logo_height),
             platform_name = COALESCE($10, admin_hub_seller_settings.platform_name),
             support_email = COALESCE($11, admin_hub_seller_settings.support_email),
             announcement_bar_items = COALESCE($12::jsonb, admin_hub_seller_settings.announcement_bar_items),
             updated_at = now()`,
          [sellerId, store_name || null, thresholdsJson, shop_logo_url, shop_favicon_url, sellercentral_logo_url, sellercentral_favicon_url, shop_logo_height, sellercentral_logo_height, platform_name, support_email, announcementJson !== undefined ? announcementJson : null]
        )
        await client.end()
        log.info('[sellerSettingsPATCH] saved OK')
        res.json({
          store_name: store_name || '',
          free_shipping_thresholds,
          shop_logo_url: shop_logo_url || '',
          shop_favicon_url: shop_favicon_url || '',
          sellercentral_logo_url: sellercentral_logo_url || '',
          sellercentral_favicon_url: sellercentral_favicon_url || '',
          shop_logo_height: shop_logo_height != null ? shop_logo_height : 34,
          sellercentral_logo_height: sellercentral_logo_height != null ? sellercentral_logo_height : 30,
        })
      } catch (err) {
        console.error('sellerSettingsPATCH:', err)
        res.status(500).json({ message: err && err.message })
      }
    }
    httpApp.get('/admin-hub/seller-settings', sellerSettingsGET)
    httpApp.patch('/admin-hub/seller-settings', sellerSettingsPATCH)

    // ── Seller Auth ───────────────────────────────────────────────────────────
    const _isProduction = process.env.NODE_ENV === 'production'
    const _rawSellerSecret = process.env.SELLER_JWT_SECRET || process.env.JWT_SECRET || ''
    if (!_rawSellerSecret && _isProduction) {
      console.error('[SECURITY] SELLER_JWT_SECRET env var is not set in production! Server cannot start safely.')
      process.exit(1)
    }
    const SELLER_JWT_SECRET = _rawSellerSecret || 'dev-only-seller-secret-do-not-use-in-prod'

    // Token lifetime: 7 days (previously 30 days — too long for stolen-token exposure window)
    const SELLER_TOKEN_TTL_SECONDS = 7 * 24 * 3600

    // Initial superuser email(s) — can also be managed via DB
    const INITIAL_SUPERUSER_EMAILS = (process.env.SUPERUSER_EMAILS || 'murathan.cotuk@gmail.com')
      .split(',').map((e) => e.trim().toLowerCase()).filter(Boolean)

    function signSellerToken(payload) {
      const _c = require('crypto')
      const header = Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url')
      const body = Buffer.from(JSON.stringify({ ...payload, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + SELLER_TOKEN_TTL_SECONDS })).toString('base64url')
      const sig = _c.createHmac('sha256', SELLER_JWT_SECRET).update(`${header}.${body}`).digest('base64url')
      return `${header}.${body}.${sig}`
    }

    function verifySellerToken(token) {
      if (!token) return null
      try {
        const _c = require('crypto')
        const parts = token.split('.')
        if (parts.length !== 3) return null
        const [header, body, sig] = parts
        const expected = _c.createHmac('sha256', SELLER_JWT_SECRET).update(`${header}.${body}`).digest('base64url')
        if (sig !== expected) return null
        const payload = JSON.parse(Buffer.from(body, 'base64url').toString())
        if (payload.exp && Math.floor(Date.now() / 1000) > payload.exp) return null
        return payload
      } catch { return null }
    }

    function hashSellerPassword(password) {
      const _c = require('crypto')
      const salt = _c.randomBytes(16).toString('hex')
      const hash = _c.scryptSync(password, salt, 64).toString('hex')
      return `${salt}:${hash}`
    }

    function verifySellerPassword(password, stored) {
      try {
        const _c = require('crypto')
        const [salt, hash] = stored.split(':')
        if (!salt || !hash) return false
        const attempt = _c.scryptSync(password, salt, 64).toString('hex')
        return attempt === hash
      } catch { return false }
    }

    function getSellerDbClient() {
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      if (!dbUrl || !dbUrl.startsWith('postgres')) return null
      const { Client } = require('pg')
      return new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
    }

    // Middleware: reads Bearer token from Authorization header, sets req.sellerUser
    function requireSellerAuth(req, res, next) {
      const auth = req.headers['authorization'] || ''
      const token = auth.startsWith('Bearer ') ? auth.slice(7) : null
      const payload = verifySellerToken(token)
      if (!payload) return res.status(401).json({ message: 'Unauthorized' })
      req.sellerUser = payload
      next()
    }

    function requireSuperuser(req, res, next) {
      if (!req.sellerUser?.is_superuser) return res.status(403).json({ message: 'Superuser access required' })
      next()
    }

    // POST /admin-hub/auth/register
    const SellerRegisterSchema = z.object({
      email:        zEmail,
      password:     zPassword,
      store_name:   z.string().max(120).optional(),
      storeName:    z.string().max(120).optional(),
      invite_token: z.string().max(200).optional(),
      first_name:   z.string().max(60).optional(),
      last_name:    z.string().max(60).optional(),
      agreement_accepted: z.boolean().optional(),
      agreement_version:  z.string().optional(),
    })
    const sellerAuthRegisterPOST = async (req, res) => {
      const parsed = validate(SellerRegisterSchema, req.body || {}, res)
      if (!parsed) return
      const body = parsed
      const email = body.email.trim().toLowerCase()
      const password = body.password
      const store_name = (body.store_name || body.storeName || '').trim()
      const invite_token = (body.invite_token || '').trim()
      const first_name = (body.first_name || '').trim()
      const last_name = (body.last_name || '').trim()
      const client = getSellerDbClient()
      if (!client) return res.status(503).json({ message: 'Database not configured' })
      try {
        await client.connect()
        const existing = await client.query('SELECT id FROM seller_users WHERE email = $1', [email])
        if (existing.rows.length > 0) {
          await client.end()
          return res.status(409).json({ message: 'An account with this email already exists' })
        }
        // Lookup pending invitation — first by token, then by email (so even without the link, invited users get linked)
        let invite = null
        if (invite_token) {
          const invRes = await client.query(
            `SELECT * FROM seller_invitations WHERE token = $1 AND accepted_at IS NULL AND expires_at > now()`,
            [invite_token]
          )
          if (invRes.rows.length > 0) invite = invRes.rows[0]
        }
        if (!invite) {
          // Always check by email — if someone was invited and registers without the link, still link them
          const invByEmail = await client.query(
            `SELECT * FROM seller_invitations WHERE LOWER(email) = $1 AND accepted_at IS NULL AND expires_at > now() ORDER BY created_at DESC LIMIT 1`,
            [email]
          )
          if (invByEmail.rows.length > 0) invite = invByEmail.rows[0]
        }
        // Check store name uniqueness (only for independent sellers, not sub-users)
        if (store_name && !invite) {
          const storeCheck = await client.query(
            `SELECT id FROM seller_users WHERE LOWER(store_name) = LOWER($1)`,
            [store_name]
          )
          if (storeCheck.rows.length > 0) {
            await client.end()
            return res.status(409).json({ message: 'Dieser Store-Name ist bereits vergeben. Bitte wählen Sie einen anderen Namen.' })
          }
          // Also check in seller_settings
          const settingsCheck = await client.query(
            `SELECT seller_id FROM admin_hub_seller_settings WHERE LOWER(store_name) = LOWER($1) LIMIT 1`,
            [store_name]
          ).catch(() => ({ rows: [] }))
          if (settingsCheck.rows.length > 0) {
            await client.end()
            return res.status(409).json({ message: 'Dieser Store-Name ist bereits vergeben. Bitte wählen Sie einen anderen Namen.' })
          }
        }
        const is_superuser = INITIAL_SUPERUSER_EMAILS.includes(email)
        const password_hash = hashSellerPassword(password)
        const own_seller_id = `seller_${require('crypto').randomBytes(8).toString('hex')}`
        // Sub-users: linked to the inviting seller; they don't get their own store
        const sub_of_seller_id = invite ? invite.invited_by_seller_id : null
        const effective_permissions = invite?.permissions || null
        const display_first = first_name || invite?.first_name || null
        const display_last = last_name || invite?.last_name || null
        // Sub-users never get their own store_name — they operate under the parent seller's account
        const effective_store_name = sub_of_seller_id ? null : (store_name || null)
        // Agreement tracking
        const agreement_accepted = !!body.agreement_accepted
        const agreement_accepted_at = agreement_accepted ? new Date().toISOString() : null
        const agreement_version = body.agreement_version || '1.0'
        const agreement_ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || null
        const r = await client.query(
          `INSERT INTO seller_users (email, password_hash, store_name, seller_id, is_superuser, sub_of_seller_id, permissions, first_name, last_name, agreement_accepted, agreement_accepted_at, agreement_version, agreement_ip)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
           RETURNING id, email, store_name, seller_id, is_superuser, sub_of_seller_id, permissions, first_name, last_name, created_at`,
          [email, password_hash, effective_store_name, own_seller_id, is_superuser, sub_of_seller_id, effective_permissions ? JSON.stringify(effective_permissions) : null, display_first, display_last, agreement_accepted, agreement_accepted_at, agreement_version, agreement_ip]
        )
        // Also upsert seller_settings so store name is available (only for main sellers, not sub-users)
        if (effective_store_name && !sub_of_seller_id) {
          await client.query(
            `INSERT INTO admin_hub_seller_settings (seller_id, store_name, updated_at) VALUES ($1, $2, now())
             ON CONFLICT (seller_id) DO UPDATE SET store_name = $2, updated_at = now()`,
            [own_seller_id, effective_store_name]
          ).catch(() => {})
        }
        // Mark invitation as accepted
        if (invite) {
          await client.query(
            `UPDATE seller_invitations SET accepted_at = now() WHERE id = $1`,
            [invite.id]
          ).catch(() => {})
        }
        const user = r.rows[0]
        // JWT uses effective seller_id (parent's if sub-user)
        const effectiveSellerId = user.sub_of_seller_id || user.seller_id
        // For sub-users: fetch parent's store_name so UI shows correct store
        let displayStoreName = user.store_name || ''
        if (user.sub_of_seller_id) {
          const parentRow = await client.query(
            `SELECT store_name FROM seller_users WHERE seller_id = $1 LIMIT 1`,
            [user.sub_of_seller_id]
          ).catch(() => ({ rows: [] }))
          displayStoreName = parentRow.rows[0]?.store_name || ''
        }
        await client.end()
        const token = signSellerToken({ id: user.id, email: user.email, seller_id: effectiveSellerId, is_superuser: user.is_superuser, store_name: displayStoreName })
        res.json({ token, user: { id: user.id, email: user.email, seller_id: effectiveSellerId, is_superuser: user.is_superuser, store_name: displayStoreName } })

        // Notify superusers about new seller registration (non-blocking — fires after response)
        if (!is_superuser && !sub_of_seller_id) {
          notifySuperusersNewSeller({
            email: user.email,
            store_name: displayStoreName,
            seller_id: effectiveSellerId,
            first_name: user.first_name,
            last_name: user.last_name,
          }).catch((e) => log.error('notifySuperusersNewSeller:', e.message))
        }
      } catch (err) {
        try { await client.end() } catch (_) {}
        console.error('sellerAuthRegisterPOST:', err)
        res.status(500).json({ message: err?.message || 'Registration failed' })
      }
    }

    // POST /admin-hub/auth/login
    const SellerLoginSchema = z.object({
      email:     zEmail,
      password:  z.string().min(1, 'Password is required').max(256),
      totp_code: z.string().max(8).optional(),
    })
    const sellerAuthLoginPOST = async (req, res) => {
      const parsed = validate(SellerLoginSchema, req.body || {}, res)
      if (!parsed) return
      const body = parsed
      const email = body.email.trim().toLowerCase()
      const password = body.password
      const totpCode = (body.totp_code || '').trim().replace(/\s/g, '')
      const client = getSellerDbClient()
      if (!client) return res.status(503).json({ message: 'Database not configured' })
      try {
        await client.connect()
        const r = await client.query('SELECT id, email, password_hash, store_name, seller_id, sub_of_seller_id, is_superuser, permissions, totp_secret, totp_enabled FROM seller_users WHERE email = $1', [email])
        const user = r.rows[0]
        if (!user) { await client.end(); return res.status(401).json({ message: 'Invalid email or password' }) }
        // Check if email is in initial superuser list (in case they registered before the list was set)
        const shouldBeSuperuser = user.is_superuser || INITIAL_SUPERUSER_EMAILS.includes(email)
        if (!verifySellerPassword(password, user.password_hash)) { await client.end(); return res.status(401).json({ message: 'Invalid email or password' }) }
        // 2FA check: if user has TOTP enabled, require the code
        if (user.totp_enabled && user.totp_secret) {
          if (!totpCode) {
            await client.end()
            return res.status(200).json({ totp_required: true, message: 'Two-factor authentication code required.' })
          }
          const speakeasy = require('speakeasy')
          const totpPlain = decryptTotp(user.totp_secret)
          if (!totpPlain) { await client.end(); return res.status(500).json({ message: 'Internal error during 2FA verification.' }) }
          const valid = speakeasy.totp.verify({ secret: totpPlain, encoding: 'base32', token: totpCode, window: 1 })
          if (!valid) {
            await client.end()
            return res.status(401).json({ message: 'Invalid two-factor authentication code.' })
          }
        }
        // Ensure superuser flag is up-to-date
        if (shouldBeSuperuser && !user.is_superuser) {
          await client.query('UPDATE seller_users SET is_superuser = true WHERE id = $1', [user.id]).catch(() => {})
          user.is_superuser = true
        }
        // Sub-users use parent's seller_id for data access
        const effectiveSellerId = user.sub_of_seller_id || user.seller_id
        let displayStoreName = (user.store_name || '').trim()
        if (user.sub_of_seller_id) {
          const pr = await client.query(
            `SELECT COALESCE(NULLIF(TRIM(ss.store_name), ''), NULLIF(TRIM(su.store_name), '')) AS sn
             FROM seller_users su
             LEFT JOIN admin_hub_seller_settings ss ON ss.seller_id = su.seller_id
             WHERE su.seller_id = $1 LIMIT 1`,
            [user.sub_of_seller_id]
          )
          displayStoreName = (pr.rows[0]?.sn || '').trim()
        }
        if (!displayStoreName && effectiveSellerId) {
          const ss = await client.query('SELECT store_name FROM admin_hub_seller_settings WHERE seller_id = $1', [effectiveSellerId])
          displayStoreName = (ss.rows[0]?.store_name || '').trim()
        }
        await client.end()
        const token = signSellerToken({ id: user.id, email: user.email, seller_id: effectiveSellerId, is_superuser: shouldBeSuperuser, store_name: displayStoreName })
        res.json({ token, user: { id: user.id, email: user.email, seller_id: effectiveSellerId, is_superuser: shouldBeSuperuser, store_name: displayStoreName, permissions: user.permissions || null } })
      } catch (err) {
        try { await client.end() } catch (_) {}
        console.error('sellerAuthLoginPOST:', err)
        res.status(500).json({ message: err?.message || 'Login failed' })
      }
    }

    // GET /admin-hub/auth/me
    const sellerAuthMeGET = async (req, res) => {
      const user = req.sellerUser
      if (!user) return res.status(401).json({ message: 'Unauthorized' })
      res.json({ user })
    }

    // POST /admin-hub/auth/2fa/setup — generate a TOTP secret + QR code for the logged-in user
    const sellerAuth2faSetupPOST = async (req, res) => {
      const sellerUser = req.sellerUser
      if (!sellerUser) return res.status(401).json({ message: 'Unauthorized' })
      try {
        const speakeasy = require('speakeasy')
        const QRCode = require('qrcode')
        const secret = speakeasy.generateSecret({
          name: `Andertal Sellercentral (${sellerUser.email})`,
          issuer: 'Andertal',
          length: 32,
        })
        // Store secret temporarily — it's confirmed/activated in the verify step
        const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
        const { Client } = require('pg')
        const lc = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await lc.connect()
        // Encrypt and save pending (not yet enabled) secret
        await lc.query(`UPDATE seller_users SET totp_secret = $1, totp_enabled = false WHERE id = $2`, [encryptTotp(secret.base32), sellerUser.id])
        await lc.end()
        const qrDataUrl = await QRCode.toDataURL(secret.otpauth_url)
        // Raw secret is only returned in dev for manual QR entry; production relies on the QR code
        res.json({
          qr_code: qrDataUrl,
          ...(process.env.NODE_ENV !== 'production' && { secret: secret.base32 }),
        })
      } catch (err) {
        console.error('2fa setup:', err)
        res.status(500).json({ message: err?.message || '2FA setup failed' })
      }
    }

    // POST /admin-hub/auth/2fa/verify — verify TOTP code and enable 2FA
    const sellerAuth2faVerifyPOST = async (req, res) => {
      const sellerUser = req.sellerUser
      if (!sellerUser) return res.status(401).json({ message: 'Unauthorized' })
      const code = String(req.body?.code || '').trim().replace(/\s/g, '')
      if (!code) return res.status(400).json({ message: 'Code is required' })
      try {
        const speakeasy = require('speakeasy')
        const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
        const { Client } = require('pg')
        const lc = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await lc.connect()
        const ur = await lc.query('SELECT totp_secret, totp_enabled FROM seller_users WHERE id = $1', [sellerUser.id])
        const row = ur.rows[0]
        if (!row || !row.totp_secret) { await lc.end(); return res.status(400).json({ message: 'No pending 2FA setup. Run setup first.' }) }
        const totpPlainVerify = decryptTotp(row.totp_secret)
        if (!totpPlainVerify) { await lc.end(); return res.status(500).json({ message: 'Internal error during 2FA verification.' }) }
        const valid = speakeasy.totp.verify({ secret: totpPlainVerify, encoding: 'base32', token: code, window: 1 })
        if (!valid) { await lc.end(); return res.status(400).json({ message: 'Invalid code. Check your authenticator app.' }) }
        await lc.query('UPDATE seller_users SET totp_enabled = true WHERE id = $1', [sellerUser.id])
        await lc.end()
        res.json({ ok: true, message: '2FA enabled successfully.' })
      } catch (err) {
        console.error('2fa verify:', err)
        res.status(500).json({ message: err?.message || '2FA verify failed' })
      }
    }

    // POST /admin-hub/auth/2fa/disable — disable 2FA (requires current TOTP code or password)
    const sellerAuth2faDisablePOST = async (req, res) => {
      const sellerUser = req.sellerUser
      if (!sellerUser) return res.status(401).json({ message: 'Unauthorized' })
      const code = String(req.body?.code || '').trim().replace(/\s/g, '')
      const password = String(req.body?.password || '')
      if (!code && !password) return res.status(400).json({ message: 'Provide current TOTP code or password to disable 2FA.' })
      try {
        const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
        const { Client } = require('pg')
        const lc = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await lc.connect()
        const ur = await lc.query('SELECT totp_secret, totp_enabled, password_hash FROM seller_users WHERE id = $1', [sellerUser.id])
        const row = ur.rows[0]
        if (!row) { await lc.end(); return res.status(404).json({ message: 'User not found' }) }
        if (!row.totp_enabled) { await lc.end(); return res.status(400).json({ message: '2FA is not enabled.' }) }
        let authorized = false
        if (code && row.totp_secret) {
          const speakeasy = require('speakeasy')
          const totpPlainDisable = decryptTotp(row.totp_secret)
          if (totpPlainDisable) {
            authorized = speakeasy.totp.verify({ secret: totpPlainDisable, encoding: 'base32', token: code, window: 1 })
          }
        }
        if (!authorized && password) {
          authorized = verifySellerPassword(password, row.password_hash)
        }
        if (!authorized) { await lc.end(); return res.status(401).json({ message: 'Invalid code or password.' }) }
        await lc.query('UPDATE seller_users SET totp_secret = NULL, totp_enabled = false WHERE id = $1', [sellerUser.id])
        await lc.end()
        res.json({ ok: true, message: '2FA disabled.' })
      } catch (err) {
        console.error('2fa disable:', err)
        res.status(500).json({ message: err?.message || '2FA disable failed' })
      }
    }

    // GET /admin-hub/auth/2fa/status — returns 2FA enabled status for current user
    const sellerAuth2faStatusGET = async (req, res) => {
      const sellerUser = req.sellerUser
      if (!sellerUser) return res.status(401).json({ message: 'Unauthorized' })
      try {
        const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
        const { Client } = require('pg')
        const lc = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await lc.connect()
        const ur = await lc.query('SELECT totp_enabled FROM seller_users WHERE id = $1', [sellerUser.id])
        await lc.end()
        res.json({ totp_enabled: ur.rows[0]?.totp_enabled || false })
      } catch (err) {
        res.status(500).json({ message: err?.message })
      }
    }

    // GET /admin-hub/users — list all seller users (superuser only)
    const sellerUsersGET = async (req, res) => {
      const client = getSellerDbClient()
      if (!client) return res.status(503).json({ message: 'Database not configured' })
      try {
        await client.connect()
        const r = await client.query(`SELECT id, email, store_name, seller_id, is_superuser, created_at,
          approval_status, company_name, authorized_person_name, tax_id, vat_id,
          business_address, phone, iban, documents, rejection_reason, approved_at, permissions
          FROM seller_users ORDER BY created_at DESC`)
        await client.end()
        res.json({ users: r.rows })
      } catch (err) {
        try { await client.end() } catch (_) {}
        res.status(500).json({ message: err?.message })
      }
    }

    // PATCH /admin-hub/users/:id/superuser — toggle superuser (superuser only)
    const sellerUserSuperuserPATCH = async (req, res) => {
      const { id } = req.params
      const { is_superuser } = req.body || {}
      const client = getSellerDbClient()
      if (!client) return res.status(503).json({ message: 'Database not configured' })
      try {
        await client.connect()
        const r = await client.query('UPDATE seller_users SET is_superuser = $1, updated_at = now() WHERE id = $2 RETURNING id, email, is_superuser', [!!is_superuser, id])
        await client.end()
        if (!r.rows.length) return res.status(404).json({ message: 'User not found' })
        res.json({ user: r.rows[0] })
      } catch (err) {
        try { await client.end() } catch (_) {}
        res.status(500).json({ message: err?.message })
      }
    }

    // POST /admin-hub/users — create seller user directly (superuser only)
    const sellerUserCreatePOST = async (req, res) => {
      const body = req.body || {}
      const email = (body.email || '').trim().toLowerCase()
      const password = (body.password || '').toString()
      const store_name = (body.store_name || '').trim()
      const is_superuser = !!body.is_superuser
      const permissions = body.permissions || null
      if (!email || !password) return res.status(400).json({ message: 'Email and password required' })
      const pwErrCreate = validatePasswordStrength(password)
      if (pwErrCreate) return res.status(400).json({ message: pwErrCreate })
      const client = getSellerDbClient()
      if (!client) return res.status(503).json({ message: 'Database not configured' })
      try {
        await client.connect()
        const existing = await client.query('SELECT id FROM seller_users WHERE email = $1', [email])
        if (existing.rows.length) { await client.end(); return res.status(409).json({ message: 'An account with this email already exists' }) }
        const password_hash = hashSellerPassword(password)
        const seller_id = `seller_${require('crypto').randomBytes(8).toString('hex')}`
        const r = await client.query(
          `INSERT INTO seller_users (email, password_hash, store_name, seller_id, is_superuser, permissions)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING id, email, store_name, seller_id, is_superuser, permissions, created_at`,
          [email, password_hash, store_name || null, seller_id, is_superuser, permissions ? JSON.stringify(permissions) : null]
        )
        if (store_name) {
          await client.query(
            `INSERT INTO admin_hub_seller_settings (seller_id, store_name, updated_at) VALUES ($1, $2, now())
             ON CONFLICT (seller_id) DO UPDATE SET store_name = $2, updated_at = now()`,
            [seller_id, store_name]
          ).catch(() => {})
        }
        await client.end()
        res.json({ user: r.rows[0] })
      } catch (err) {
        try { await client.end() } catch (_) {}
        res.status(500).json({ message: err?.message || 'Create failed' })
      }
    }

    // PATCH /admin-hub/users/:id — update user (store_name, permissions, password, is_superuser)
    const sellerUserUpdatePATCH = async (req, res) => {
      const { id } = req.params
      const body = req.body || {}
      const client = getSellerDbClient()
      if (!client) return res.status(503).json({ message: 'Database not configured' })
      try {
        await client.connect()
        const sets = ['updated_at = now()']
        const params = []
        if (body.store_name !== undefined) { params.push(body.store_name || null); sets.push(`store_name = $${params.length}`) }
        if (body.is_superuser !== undefined) { params.push(!!body.is_superuser); sets.push(`is_superuser = $${params.length}`) }
        if (body.permissions !== undefined) { params.push(body.permissions ? JSON.stringify(body.permissions) : null); sets.push(`permissions = $${params.length}`) }
        if (body.password) {
          const pwErrUpdate = validatePasswordStrength(body.password)
          if (pwErrUpdate) return res.status(400).json({ message: pwErrUpdate })
          params.push(hashSellerPassword(body.password)); sets.push(`password_hash = $${params.length}`)
        }
        params.push(id)
        const r = await client.query(
          `UPDATE seller_users SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING id, email, store_name, seller_id, is_superuser, permissions, created_at`,
          params
        )
        await client.end()
        if (!r.rows.length) return res.status(404).json({ message: 'User not found' })
        // Also sync store_name to seller settings
        const u = r.rows[0]
        if (body.store_name !== undefined && u.seller_id) {
          const c2 = getSellerDbClient()
          try {
            await c2.connect()
            await c2.query(
              `INSERT INTO admin_hub_seller_settings (seller_id, store_name, updated_at) VALUES ($1, $2, now()) ON CONFLICT (seller_id) DO UPDATE SET store_name = $2, updated_at = now()`,
              [u.seller_id, body.store_name || '']
            )
            await c2.end()
          } catch (_) {}
        }
        res.json({ user: u })
      } catch (err) {
        try { await client.end() } catch (_) {}
        res.status(500).json({ message: err?.message })
      }
    }

    // DELETE /admin-hub/users/:id — delete user (superuser only)
    const sellerUserDeleteDELETE = async (req, res) => {
      const { id } = req.params
      const myId = req.sellerUser?.id
      if (id === myId) return res.status(400).json({ message: 'Cannot delete yourself' })
      const client = getSellerDbClient()
      if (!client) return res.status(503).json({ message: 'Database not configured' })
      try {
        await client.connect()
        await client.query('DELETE FROM seller_users WHERE id = $1', [id])
        await client.end()
        res.json({ success: true })
      } catch (err) {
        try { await client.end() } catch (_) {}
        res.status(500).json({ message: err?.message })
      }
    }

    httpApp.post('/admin-hub/auth/register', sellerAuthRegisterPOST)
    httpApp.post('/admin-hub/auth/login', sellerAuthLoginPOST)
    httpApp.get('/admin-hub/auth/me', requireSellerAuth, sellerAuthMeGET)
    httpApp.get('/admin-hub/auth/2fa/status', requireSellerAuth, sellerAuth2faStatusGET)
    httpApp.post('/admin-hub/auth/2fa/setup', requireSellerAuth, sellerAuth2faSetupPOST)
    httpApp.post('/admin-hub/auth/2fa/verify', requireSellerAuth, sellerAuth2faVerifyPOST)
    httpApp.post('/admin-hub/auth/2fa/disable', requireSellerAuth, sellerAuth2faDisablePOST)
    httpApp.get('/admin-hub/users', requireSellerAuth, requireSuperuser, sellerUsersGET)
    httpApp.post('/admin-hub/users', requireSellerAuth, requireSuperuser, sellerUserCreatePOST)
    httpApp.patch('/admin-hub/users/:id', requireSellerAuth, requireSuperuser, sellerUserUpdatePATCH)
    httpApp.delete('/admin-hub/users/:id', requireSellerAuth, requireSuperuser, sellerUserDeleteDELETE)
    httpApp.patch('/admin-hub/users/:id/superuser', requireSellerAuth, requireSuperuser, sellerUserSuperuserPATCH)

    const loadPlatformCheckoutRow = async (pgClient) => {
      const r = await pgClient.query(
        `SELECT stripe_publishable_key, stripe_secret_key, pay_card, pay_paypal, pay_klarna, paypal_client_id, paypal_client_secret, payment_method_layout, payment_method_types_json
         FROM store_platform_checkout WHERE id = 1`,
      )
      return r.rows?.[0] || null
    }

    /** Shop-Checkout nutzt ausschließlich Sellercentral (DB). Render/Vercel STRIPE_* Env wird ignoriert. */
    const resolveStripeSecretKeyFromPlatform = (row) =>
      row ? (row.stripe_secret_key || '').toString().trim() : ''

    const resolveStripePublishableFromPlatform = (row) =>
      row ? (row.stripe_publishable_key || '').toString().trim() : ''

    const paymentMethodTypesFromPlatformRow = (row) => {
      if (Array.isArray(row?.payment_method_types_json) && row.payment_method_types_json.length > 0) {
        return row.payment_method_types_json
      }
      const payCard = !row || row.pay_card !== false
      const payPaypal = row && row.pay_paypal === true
      const payKlarna = row && row.pay_klarna === true
      const types = []
      if (payCard) types.push('card')
      if (payPaypal) types.push('paypal')
      if (payKlarna) types.push('klarna')
      if (!types.length) types.push('card')
      return types
    }

    const STRIPE_PM_TYPES = [
      'card','paypal','klarna','sepa_debit','ideal','bancontact','eps','p24','giropay',
      'sofort','link','affirm','afterpay_clearpay','blik','cashapp','mobilepay',
      'multibanco','oxxo','paynow','pix','promptpay','revolut_pay','swish','twint',
      'us_bank_account','wechat_pay','zip','amazon_pay','au_becs_debit','bacs_debit',
      'boleto','fpx','konbini','acss_debit',
    ]

    const stripePaymentMethodsGET = async (req, res) => {
      const client = getSellerDbClient()
      if (!client) return res.status(503).json({ message: 'Database not configured' })
      let dbClient
      try {
        dbClient = client
        await dbClient.connect()
        const row = await loadPlatformCheckoutRow(dbClient)
        await dbClient.end()
        const sk = resolveStripeSecretKeyFromPlatform(row)
        if (!sk) return res.json({ available: [], selected: paymentMethodTypesFromPlatformRow(row) })
        const stripe = new (require('stripe'))(sk)
        let available = []
        try {
          const configs = await stripe.paymentMethodConfigurations.list({ limit: 100 })
          const root = configs.data.find((c) => !c.parent) || configs.data[0]
          if (root) {
            for (const pmType of STRIPE_PM_TYPES) {
              const cfg = root[pmType]
              if (cfg && cfg.available === true) available.push(pmType)
            }
          }
        } catch (_) {
          available = []
        }
        const selected = paymentMethodTypesFromPlatformRow(row)
        res.json({ available, selected })
      } catch (err) {
        try { if (dbClient) await dbClient.end() } catch (_) {}
        console.error('stripePaymentMethodsGET:', err)
        res.status(500).json({ message: err?.message || 'Error' })
      }
    }

    /** Superuser: read platform checkout / Stripe config (secrets masked in response) */
    const platformCheckoutSettingsGET = async (req, res) => {
      const client = getSellerDbClient()
      if (!client) return res.status(503).json({ message: 'Database not configured' })
      try {
        await client.connect()
        const row = await loadPlatformCheckoutRow(client)
        await client.end()
        const sk = (row?.stripe_secret_key || '').toString()
        const pk = (row?.stripe_publishable_key || '').toString()
        const psec = (row?.paypal_client_secret || '').toString()
        const envSk = !!(process.env.STRIPE_SECRET_KEY || '').toString().trim()
        const envPk = !!(process.env.STRIPE_PUBLISHABLE_KEY || '').toString().trim()
        res.json({
          stripe_publishable_key: pk,
          stripe_secret_key_set: sk.length > 0,
          stripe_secret_key_hint: sk.length >= 4 ? `…${sk.slice(-4)}` : '',
          pay_card: row?.pay_card !== false,
          pay_paypal: row?.pay_paypal === true,
          pay_klarna: row?.pay_klarna === true,
          paypal_client_id: (row?.paypal_client_id || '').toString(),
          paypal_client_secret_set: psec.length > 0,
          paypal_client_secret_hint: psec.length >= 4 ? `…${psec.slice(-4)}` : '',
          payment_method_layout: (row?.payment_method_layout || 'grid').toString(),
          payment_method_types_json: Array.isArray(row?.payment_method_types_json) ? row.payment_method_types_json : null,
          env_stripe_secret: envSk,
          env_stripe_publishable: envPk,
        })
      } catch (err) {
        try { await client.end() } catch (_) {}
        console.error('platformCheckoutSettingsGET:', err)
        res.status(500).json({ message: (err && err.message) || 'Error' })
      }
    }

    /** Superuser: update platform checkout — empty stripe_secret_key leaves existing value */
    const platformCheckoutSettingsPUT = async (req, res) => {
      const body = req.body || {}
      const client = getSellerDbClient()
      if (!client) return res.status(503).json({ message: 'Database not configured' })
      try {
        await client.connect()
        const cur = (await loadPlatformCheckoutRow(client)) || {}
        const nextPk =
          body.stripe_publishable_key !== undefined
            ? (body.stripe_publishable_key || '').toString().trim()
            : (cur?.stripe_publishable_key || '').toString()
        let nextSk = (cur?.stripe_secret_key || '').toString()
        if (Object.prototype.hasOwnProperty.call(body, 'stripe_secret_key')) {
          const inc = (body.stripe_secret_key || '').toString().trim()
          if (inc) nextSk = inc
        }
        const pay_card = body.pay_card !== undefined ? !!body.pay_card : cur?.pay_card !== false
        const pay_paypal = body.pay_paypal !== undefined ? !!body.pay_paypal : cur?.pay_paypal === true
        const pay_klarna = body.pay_klarna !== undefined ? !!body.pay_klarna : cur?.pay_klarna === true
        let paypal_client_id =
          body.paypal_client_id !== undefined ? (body.paypal_client_id || '').toString().trim() : (cur?.paypal_client_id || '').toString()
        let paypal_client_secret = (cur?.paypal_client_secret || '').toString()
        if (Object.prototype.hasOwnProperty.call(body, 'paypal_client_secret')) {
          const inc = (body.paypal_client_secret || '').toString().trim()
          if (inc) paypal_client_secret = inc
        }
        const payment_method_layout = body.payment_method_layout === 'list' ? 'list' : (body.payment_method_layout === 'grid' ? 'grid' : (cur?.payment_method_layout || 'grid'))
        let payment_method_types_json = Array.isArray(cur?.payment_method_types_json) ? cur.payment_method_types_json : null
        if (Array.isArray(body.payment_method_types) && body.payment_method_types.length > 0) {
          payment_method_types_json = body.payment_method_types.filter((t) => typeof t === 'string' && t.length > 0)
        }
        await client.query(
          `INSERT INTO store_platform_checkout (id, stripe_publishable_key, stripe_secret_key, pay_card, pay_paypal, pay_klarna, paypal_client_id, paypal_client_secret, payment_method_layout, payment_method_types_json, updated_at)
           VALUES (1, $1, $2, $3, $4, $5, $6, $7, $8, $9, now())
           ON CONFLICT (id) DO UPDATE SET
             stripe_publishable_key = EXCLUDED.stripe_publishable_key,
             stripe_secret_key = EXCLUDED.stripe_secret_key,
             pay_card = EXCLUDED.pay_card,
             pay_paypal = EXCLUDED.pay_paypal,
             pay_klarna = EXCLUDED.pay_klarna,
             paypal_client_id = EXCLUDED.paypal_client_id,
             paypal_client_secret = EXCLUDED.paypal_client_secret,
             payment_method_layout = EXCLUDED.payment_method_layout,
             payment_method_types_json = EXCLUDED.payment_method_types_json,
             updated_at = now()`,
          [nextPk || null, nextSk || null, pay_card, pay_paypal, pay_klarna, paypal_client_id || null, paypal_client_secret || null, payment_method_layout, payment_method_types_json ? JSON.stringify(payment_method_types_json) : null],
        )
        await client.end()
        res.json({ ok: true })
      } catch (err) {
        try { await client.end() } catch (_) {}
        console.error('platformCheckoutSettingsPUT:', err)
        res.status(500).json({ message: (err && err.message) || 'Error' })
      }
    }

    /** Superuser: Stripe Secret gegen die API prüfen (balance.retrieve); optional PK/SK aus Body für Test vor dem Speichern */
    const platformCheckoutTestStripePOST = async (req, res) => {
      const body = req.body || {}
      const client = getSellerDbClient()
      if (!client) return res.status(503).json({ ok: false, message: 'Database not configured' })
      try {
        await client.connect()
        const row = await loadPlatformCheckoutRow(client)
        await client.end()

        const pkForm = (body.stripe_publishable_key || '').toString().trim()
        const skForm = (body.stripe_secret_key || '').toString().trim()
        const pkDb = (row?.stripe_publishable_key || '').toString().trim()
        const skDb = (row?.stripe_secret_key || '').toString().trim()
        const pk = pkForm || pkDb
        const sk = skForm || skDb

        if (!sk) {
          return res.json({
            ok: false,
            message:
              'Kein Secret Key — bitte im Formular eintragen oder zuerst mit „Speichern“ in der Datenbank speichern.',
          })
        }

        const stripeModeFromKey = (k) => {
          if (!k || typeof k !== 'string') return null
          if (k.includes('_test_')) return 'test'
          if (k.includes('_live_')) return 'live'
          return null
        }
        const skMode = stripeModeFromKey(sk)
        const pkMode = stripeModeFromKey(pk)
        if (pk && skMode && pkMode && skMode !== pkMode) {
          return res.json({
            ok: false,
            message:
              'Publishable Key und Secret Key passen nicht zum selben Modus (einer ist Test, der andere Live). Beide müssen aus demselben Stripe-Konto und derselben Umgebung stammen.',
          })
        }

        const stripe = new (require('stripe'))(sk)
        await stripe.balance.retrieve()
        return res.json({
          ok: true,
          message: 'Verbindung erfolgreich — Stripe hat den Secret Key akzeptiert.',
          mode: skMode || undefined,
        })
      } catch (err) {
        const raw = err && err.raw && typeof err.raw === 'object' ? err.raw : {}
        const msg = raw.message || err.message || String(err)
        const type = raw.type || err.type
        const code = raw.code || err.code
        return res.json({
          ok: false,
          message: msg,
          stripe_type: type,
          stripe_code: code,
        })
      }
    }

    httpApp.get('/admin-hub/v1/platform-checkout-settings', requireSellerAuth, requireSuperuser, platformCheckoutSettingsGET)
    httpApp.put('/admin-hub/v1/platform-checkout-settings', requireSellerAuth, requireSuperuser, platformCheckoutSettingsPUT)
    httpApp.get('/admin-hub/v1/stripe-payment-methods', requireSellerAuth, requireSuperuser, stripePaymentMethodsGET)
    httpApp.post(
      '/admin-hub/v1/platform-checkout-settings/test-stripe',
      requireSellerAuth,
      requireSuperuser,
      platformCheckoutTestStripePOST,
    )

    // Store API: public seller settings (store name) for "Sold by" on shop
    const storeSellerSettingsGET = async (req, res) => {
      try {
        const sellerId = (req.query.seller_id || 'default').toString().trim() || 'default'
        const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
        if (!dbUrl || !dbUrl.startsWith('postgres')) return res.json({ store_name: '', free_shipping_thresholds: null, shop_logo_url: '', shop_favicon_url: '', sellercentral_logo_url: '', sellercentral_favicon_url: '', shop_logo_height: 34, sellercentral_logo_height: 30 })
        const { Client } = require('pg')
        const client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        const r = await client.query('SELECT store_name, free_shipping_thresholds, shop_logo_url, shop_favicon_url, sellercentral_logo_url, sellercentral_favicon_url, shop_logo_height, sellercentral_logo_height, announcement_bar_items FROM admin_hub_seller_settings WHERE seller_id = $1', [sellerId])
        await client.end()
        const row = r.rows && r.rows[0]
        const store_name = row && row.store_name != null ? String(row.store_name) : ''
        let free_shipping_thresholds = (row && row.free_shipping_thresholds) || null
        if (free_shipping_thresholds && typeof free_shipping_thresholds === 'object') {
          free_shipping_thresholds = normalizeThresholdsObject(free_shipping_thresholds)
        }
        const shop_logo_url = row && row.shop_logo_url ? String(row.shop_logo_url) : ''
        const shop_favicon_url = row && row.shop_favicon_url ? String(row.shop_favicon_url) : ''
        const sellercentral_logo_url = row && row.sellercentral_logo_url ? String(row.sellercentral_logo_url) : ''
        const sellercentral_favicon_url = row && row.sellercentral_favicon_url ? String(row.sellercentral_favicon_url) : ''
        const shop_logo_height = row && row.shop_logo_height != null ? Number(row.shop_logo_height) : 34
        const sellercentral_logo_height = row && row.sellercentral_logo_height != null ? Number(row.sellercentral_logo_height) : 30
        const announcement_bar_items = Array.isArray(row && row.announcement_bar_items) ? row.announcement_bar_items : []
        log.info('[storeSellerSettingsGET] free_shipping_thresholds:', JSON.stringify(free_shipping_thresholds))
        res.json({ store_name, free_shipping_thresholds, shop_logo_url, shop_favicon_url, sellercentral_logo_url, sellercentral_favicon_url, shop_logo_height, sellercentral_logo_height, announcement_bar_items })
      } catch (err) {
        console.error('[storeSellerSettingsGET] error:', err && err.message)
        res.json({ store_name: '', free_shipping_thresholds: null, shop_logo_url: '', shop_favicon_url: '', sellercentral_logo_url: '', sellercentral_favicon_url: '', shop_logo_height: 34, sellercentral_logo_height: 30 })
      }
    }
    httpApp.get('/store/seller-settings', storeSellerSettingsGET)

    // GET /store/seller-profile/:seller_id — public seller profile (info + reviews + products)
    const storeSellerProfileGET = async (req, res) => {
      const seller_id = (req.params.seller_id || 'default').toString().trim() || 'default'
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      if (!dbUrl || !dbUrl.startsWith('postgres')) return res.json({ seller: null, reviews: [], products: [] })
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()

        // 1. Seller info + review aggregate
        const sellerR = await client.query(
          `SELECT store_name, shop_logo_url, shop_logo_height, review_avg, review_count
           FROM admin_hub_seller_settings WHERE seller_id = $1`,
          [seller_id]
        )
        const sellerRow = sellerR.rows[0] || null

        // 2. Rating distribution (count per star 1-5)
        const distR = await client.query(
          `SELECT rating, COUNT(*)::int as cnt FROM store_product_reviews WHERE seller_id = $1 GROUP BY rating ORDER BY rating DESC`,
          [seller_id]
        )
        const dist = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 }
        for (const row of distR.rows) dist[row.rating] = row.cnt

        // 3. Recent reviews (public — no email, just name + rating + comment)
        const revR = await client.query(
          `SELECT r.id, r.rating, r.comment, r.customer_name, r.created_at,
                  p.title as product_title, p.handle as product_handle
           FROM store_product_reviews r
           LEFT JOIN admin_hub_products p ON p.id::text = r.product_id
           WHERE r.seller_id = $1
           ORDER BY r.created_at DESC LIMIT 30`,
          [seller_id]
        )

        // 4. Published products by seller (limit 16 for profile page)
        const prodR = await client.query(
          `SELECT id, title, handle, price_cents, metadata FROM admin_hub_products
           WHERE seller_id = $1 AND status = 'published'
           ORDER BY created_at DESC LIMIT 16`,
          [seller_id]
        )

        await client.end()
        res.json({
          seller: sellerRow ? {
            seller_id,
            store_name: sellerRow.store_name || '',
            shop_logo_url: sellerRow.shop_logo_url || '',
            shop_logo_height: sellerRow.shop_logo_height || 34,
            review_avg: sellerRow.review_avg != null ? parseFloat(sellerRow.review_avg) : null,
            review_count: sellerRow.review_count != null ? Number(sellerRow.review_count) : 0,
            rating_distribution: dist,
          } : { seller_id, store_name: '', shop_logo_url: '', shop_logo_height: 34, review_avg: null, review_count: 0, rating_distribution: dist },
          reviews: revR.rows || [],
          products: (prodR.rows || []).map(p => ({
            id: p.id,
            title: p.title,
            handle: p.handle,
            price_cents: p.price_cents,
            metadata: p.metadata || {},
          })),
        })
      } catch (e) {
        if (client) try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }
    httpApp.get('/store/seller-profile/:seller_id', storeSellerProfileGET)

    const getBrandById = async (brandId) => {
      if (!brandId) return null
      const client = getBrandsDbClient()
      if (!client) return null
      try {
        await client.connect()
        const r = await client.query('SELECT id, name, handle, logo_image, banner_image FROM admin_hub_brands WHERE id = $1', [brandId])
        await client.end()
        return r.rows && r.rows[0] ? r.rows[0] : null
      } catch (e) {
        try { await client.end() } catch (_) {}
        return null
      }
    }

    // Store API: list/detail from Admin Hub so shop shows image, price, EAN, brand
    const mapAdminHubToStoreProduct = (p, marketCountry = 'DE') => {
      const meta = p.metadata && typeof p.metadata === 'object' ? p.metadata : {}
      const media = meta.media
      let rawMediaList = Array.isArray(media) ? media : (typeof media === 'string' && media ? [media] : [])
      if (rawMediaList.length === 0 && (meta.image_url || meta.image)) rawMediaList = [meta.image_url || meta.image]
      const thumb = resolveUploadUrl(rawMediaList[0] || null)
      const imagesResolved = rawMediaList.map((m) => resolveUploadUrl(typeof m === 'string' ? m : (m && m.url) || null)).filter(Boolean)
      const country = String(marketCountry || 'DE').toUpperCase()
      const parentPriceByCountry = meta.prices && typeof meta.prices === 'object' ? meta.prices[country] : null
      const priceCents =
        parentPriceByCountry && parentPriceByCountry.brutto_cents != null
          ? Number(parentPriceByCountry.brutto_cents)
          : (p.price != null ? Math.round(Number(p.price) * 100) : 0)
      const rawVariants = Array.isArray(p.variants) && p.variants.length > 0 ? p.variants : []
      const variationGroups = Array.isArray(meta.variation_groups) ? meta.variation_groups : null
      const variants = rawVariants.length > 0
        ? rawVariants.map((v, i) => {
            const vMeta = v.metadata && typeof v.metadata === 'object' ? v.metadata : {}
            const vPriceByCountry = vMeta.prices && typeof vMeta.prices === 'object' ? vMeta.prices[country] : null
            const vPriceCents = vPriceByCountry && vPriceByCountry.brutto_cents != null
              ? Number(vPriceByCountry.brutto_cents)
              : (v.price_cents != null ? Number(v.price_cents) : (v.price != null ? Math.round(Number(v.price) * 100) : priceCents))
            const vCompareCents = vPriceByCountry && vPriceByCountry.uvp_cents != null
              ? Number(vPriceByCountry.uvp_cents)
              : (v.compare_at_price_cents != null ? Number(v.compare_at_price_cents) : null)
            const optionValues = Array.isArray(v.option_values) ? v.option_values : (v.value != null ? [v.value] : null)
            let image_urls = null
            if (v.image_urls && typeof v.image_urls === 'object' && !Array.isArray(v.image_urls)) {
              const m = {}
              for (const [k, u] of Object.entries(v.image_urls)) {
                const rk = (k || '').toString().toLowerCase().trim()
                if (!rk) continue
                const resolved = resolveUploadUrl(u || null)
                if (resolved) m[rk] = resolved
              }
              if (Object.keys(m).length > 0) image_urls = m
            }
            const vMediaResolved = Array.isArray(vMeta.media)
              ? vMeta.media.map((u) => resolveUploadUrl(u)).filter(Boolean)
              : []
            // Resolve locale-specific media inside translations
            const vMetaOut = { ...vMeta }
            if (vMeta.translations && typeof vMeta.translations === 'object') {
              const trOut = {}
              for (const [loc, tr] of Object.entries(vMeta.translations)) {
                if (tr && typeof tr === 'object') {
                  trOut[loc] = { ...tr }
                  if (Array.isArray(tr.media)) trOut[loc].media = tr.media.map((u) => resolveUploadUrl(u)).filter(Boolean)
                }
              }
              vMetaOut.translations = trOut
            }
            if (vMediaResolved.length > 0) vMetaOut.media = vMediaResolved
            const row = {
              id: p.id + '-v-' + i,
              product_id: p.id,
              title:
                v.title ||
                (vMeta.translations && vMeta.translations.de && vMeta.translations.de.title) ||
                (optionValues && optionValues.length > 0 ? optionValues.join(' / ') : v.value) ||
                'Option ' + (i + 1),
              description:
                v.description ||
                (vMeta.translations && vMeta.translations.de && vMeta.translations.de.description) ||
                vMeta.description ||
                null,
              value: v.value,
              option_values: optionValues,
              sku: v.sku || null,
              ean: v.ean || null,
              prices: [{ amount: vPriceCents, currency_code: 'eur' }],
              compare_at_price_cents: vCompareCents,
              inventory_quantity: v.inventory != null ? v.inventory : 0,
              manage_inventory: true,
              image_url: resolveUploadUrl(v.image_url || v.image || null) || null,
              swatch_image_url: resolveUploadUrl(v.swatch_image_url || v.swatch_image || null) || null,
              metadata: vMetaOut,
            }
            if (image_urls) row.image_urls = image_urls
            return row
          })
        : [{
            id: p.id + '-variant',
            product_id: p.id,
            title: 'Standard',
            prices: [{ amount: priceCents, currency_code: 'eur' }],
            compare_at_price_cents: null,
            inventory_quantity: p.inventory != null ? p.inventory : 0,
            image_url: null,
          }]
      const out = {
        id: p.id,
        title: p.title,
        handle: p.handle,
        description: p.description,
        status: p.status,
        thumbnail: thumb || null,
        images: imagesResolved.length > 0 ? imagesResolved.map((url) => ({ url, alt: p.title || '' })) : (thumb ? [{ url: thumb, alt: p.title || '' }] : []),
        metadata: meta,
        variation_groups: variationGroups,
        variants,
      }
      if (p.seller_id != null && String(p.seller_id).trim() !== '') {
        out.seller_id = String(p.seller_id).trim()
      }
      if (p.collection) {
        out.collection = p.collection
      }
      return out
    }
    const getAdminHubCollectionIdByHandle = async (handle) => {
      if (!handle || typeof handle !== 'string') return null
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      if (!dbUrl || !dbUrl.startsWith('postgres')) return null
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        const r = await client.query('SELECT id FROM admin_hub_collections WHERE LOWER(handle) = LOWER($1)', [handle.trim()])
        const id = r.rows && r.rows[0] ? r.rows[0].id : null
        await client.end()
        return id ? String(id) : null
      } catch (e) {
        try { if (client) await client.end() } catch (_) {}
        return null
      }
    }
    const isUuidLike = (s) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test((s || '').trim())
    const BESTSELLER_CACHE_TTL_MS = 5 * 60 * 1000
    let bestsellerCache = { expiresAt: 0, ids: new Set() }
    const salesScoreFromMetadata = (metadata) => {
      const m = metadata && typeof metadata === 'object' ? metadata : {}
      const soldLastMonth = Number(m.sold_last_month ?? 0)
      if (Number.isFinite(soldLastMonth) && soldLastMonth > 0) return soldLastMonth
      const sold = Number(m.sold ?? m.sales_count ?? 0)
      return Number.isFinite(sold) && sold > 0 ? sold : 0
    }
    const productCollectionKeys = (p) => {
      const keys = []
      if (p && p.collection_id) keys.push(String(p.collection_id).trim().toLowerCase())
      const metaIds = Array.isArray(p?.metadata?.collection_ids) ? p.metadata.collection_ids : []
      for (const id of metaIds) {
        if (id == null) continue
        keys.push(String(id).trim().toLowerCase())
      }
      return [...new Set(keys.filter(Boolean))]
    }
    const getBestsellerProductIds = async () => {
      const now = Date.now()
      if (bestsellerCache.expiresAt > now && bestsellerCache.ids && bestsellerCache.ids.size > 0) {
        return bestsellerCache.ids
      }
      const approvedSellerIds = await getApprovedSellerIdsSet()
      let all = await listAdminHubProductsDb({ limit: 5000 })
      all = all.filter((p) => (p.status || '').toLowerCase() === 'published' && isStoreVisibleSellerProduct(p, approvedSellerIds))
      const byCollection = new Map()
      const byCategory = new Map()
      for (const p of all) {
        const score = salesScoreFromMetadata(p.metadata)
        if (!(score > 0)) continue
        const keys = productCollectionKeys(p)
        if (!keys.length) continue
        for (const key of keys) {
          const prev = byCollection.get(key)
          if (!prev || score > prev.score) byCollection.set(key, { id: String(p.id), score })
        }
        const categoryKeys = storeProductCategoryIds(p)
        for (const key of categoryKeys) {
          const prev = byCategory.get(key)
          if (!prev || score > prev.score) byCategory.set(key, { id: String(p.id), score })
        }
      }
      const ids = new Set([
        ...Array.from(byCollection.values()).map((x) => String(x.id)),
        ...Array.from(byCategory.values()).map((x) => String(x.id)),
      ])
      bestsellerCache = { expiresAt: now + BESTSELLER_CACHE_TTL_MS, ids }
      return ids
    }
    const collectCategorySubtreeIdsBySlug = (tree, slug) => {
      const norm = (s) => String(s || '').replace(/^\//, '').toLowerCase().trim()
      const target = norm(slug)
      const findNode = (nodes) => {
        for (const n of nodes || []) {
          if (!n) continue
          if (norm(n.slug) === target || norm(n.handle) === target) return n
          const x = findNode(n.children)
          if (x) return x
        }
        return null
      }
      const ids = new Set()
      const addTree = (n) => {
        if (!n || n.id == null) return
        ids.add(String(n.id).trim().toLowerCase())
        for (const c of n.children || []) addTree(c)
      }
      const roots = Array.isArray(tree) ? tree : []
      const node = findNode(roots)
      if (!node) return null
      addTree(node)
      return ids
    }
    const storeProductCategoryIds = (p) => {
      const meta = p?.metadata && typeof p.metadata === 'object' ? p.metadata : {}
      const out = []
      const push = (x) => {
        if (x == null) return
        const s = String(x).trim().toLowerCase()
        if (s) out.push(s)
      }
      push(meta.admin_category_id)
      push(meta.category_id)
      if (Array.isArray(meta.category_ids)) {
        meta.category_ids.forEach(push)
      } else if (typeof meta.category_ids === 'string' && meta.category_ids.trim().startsWith('[')) {
        try {
          const parsed = JSON.parse(meta.category_ids)
          if (Array.isArray(parsed)) parsed.forEach(push)
        } catch (_) {}
      }
      if (Array.isArray(p?.categories)) p.categories.forEach((c) => push(c?.id))
      return out
    }
    const storeProductsFromAdminHubGET = async (req, res) => {
      try {
        const query = req.query || {}
        const searchQ = (query.q || '').toString().trim().toLowerCase()
        const limitForSearch = searchQ ? 8 : (parseInt(query.limit, 10) || 100)
        const categorySlugFilter = (query.category || query.category_slug || '').toString().trim()
        let allowedCategoryIds = null
        if (categorySlugFilter) {
          const subtreeIdsForSlug = (tree) => collectCategorySubtreeIdsBySlug(tree, categorySlugFilter)
          const ah = resolveAdminHub()
          if (ah) {
            try {
              allowedCategoryIds = subtreeIdsForSlug(await ah.getCategoryTree({ is_visible: true }))
            } catch (_) {
              allowedCategoryIds = null
            }
          }
          // Same as GET /store/categories: if AdminHubService is unavailable or slug is missing from the
          // in-memory tree, rebuild visible categories from Postgres so category PLPs still resolve.
          if (!allowedCategoryIds || allowedCategoryIds.size === 0) {
            let fbClient
            try {
              fbClient = getProductsDbClient()
              if (fbClient) {
                await fbClient.connect()
                const cr = await fbClient.query(
                  `SELECT * FROM admin_hub_categories WHERE active = true ORDER BY sort_order ASC, name ASC`,
                )
                await fbClient.end()
                fbClient = null
                const flat = (cr.rows || [])
                  .map(mapAdminHubCategoryPgRow)
                  .filter((c) => c && c.is_visible !== false)
                allowedCategoryIds = subtreeIdsForSlug(buildAdminHubCategoryTreeFromFlat(flat))
              }
            } catch (__) {
              try {
                if (fbClient) await fbClient.end()
              } catch (___) {}
            }
          }
        }
        let collectionId = (query.collection_id || '').toString().trim()
        const collectionHandle = (query.collection_handle || query.collection || '').toString().trim()
        if (collectionId && !isUuidLike(collectionId)) {
          const resolvedId = await getAdminHubCollectionIdByHandle(collectionId)
          if (resolvedId) collectionId = resolvedId
        }
        if (!collectionId && collectionHandle) {
          const resolvedId = await getAdminHubCollectionIdByHandle(collectionHandle)
          if (resolvedId) collectionId = resolvedId
        }
        const queryWithId = collectionId ? { ...query, collection_id: collectionId } : query
        const categoryIdAllowlist =
          allowedCategoryIds && allowedCategoryIds.size > 0 ? [...allowedCategoryIds] : undefined
        let list = await listAdminHubProductsDb({
          ...queryWithId,
          limit: searchQ ? 200 : (categorySlugFilter ? Math.max(parseInt(query.limit, 10) || 3000, 500) : (query.limit || 100)),
          category: categorySlugFilter || undefined,
          category_id_allowlist: categoryIdAllowlist,
        })
        if (collectionId) {
          const norm = (s) => (s || '').toString().trim().toLowerCase()
          const cidNorm = norm(collectionId)
          list = list.filter((p) => {
            const primaryMatch = norm(p.collection_id) === cidNorm
            const metaIds = Array.isArray(p?.metadata?.collection_ids)
              ? p.metadata.collection_ids.map((x) => norm(x))
              : []
            return primaryMatch || metaIds.includes(cidNorm)
          })
        }
        // Only published products from approved sellers are visible in store
        const approvedSellerIds = await getApprovedSellerIdsSet()
        list = list.filter((p) => (p.status || '').toLowerCase() === 'published' && isStoreVisibleSellerProduct(p, approvedSellerIds))
        if (searchQ) {
          list = list.filter((p) => {
            const t = (p.title || '').toLowerCase()
            const d = (p.description || '').toLowerCase()
            const h = (p.handle || '').toLowerCase()
            const sku = (p.sku || '').toLowerCase()
            const ean = (p.metadata?.ean != null ? String(p.metadata.ean) : '').toLowerCase()
            if (t.includes(searchQ) || d.includes(searchQ) || h.includes(searchQ) || sku.includes(searchQ) || ean.includes(searchQ)) return true
            // Search variant SKUs and EANs
            return Array.isArray(p.variants) && p.variants.some((v) =>
              (v.sku || '').toLowerCase().includes(searchQ) || (v.ean != null ? String(v.ean) : '').toLowerCase().includes(searchQ)
            )
          }).slice(0, limitForSearch)
        }
        const sellerIds = [...new Set(list.map((p) => (p.seller_id || 'default').toString().trim() || 'default').filter(Boolean))]
        const storeNamesBySeller = {}
        await Promise.all(sellerIds.map(async (id) => { storeNamesBySeller[id] = await getSellerStoreName(id) }))
        const brandIds = [...new Set(list.map((p) => (p.metadata && p.metadata.brand_id) || null).filter(Boolean))]
        const brandsById = {}
        await Promise.all(brandIds.map(async (bid) => { const b = await getBrandById(bid); if (b) brandsById[bid] = b }))
        const collIds = [...new Set(list.flatMap((p) => {
          const ids = []
          if (p.collection_id) ids.push(String(p.collection_id).trim())
          const m = Array.isArray(p?.metadata?.collection_ids) ? p.metadata.collection_ids : []
          for (const x of m) {
            if (x != null && String(x).trim()) ids.push(String(x).trim())
          }
          return ids
        }))].filter((id) => id && isUuidLike(id))
        const collToLinkedCat = new Map()
        if (collIds.length > 0) {
          const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
          if (dbUrl && dbUrl.startsWith('postgres')) {
            let cClient
            try {
              const { Client } = require('pg')
              cClient = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
              await cClient.connect()
              const cr = await cClient.query(
                'SELECT id, metadata FROM admin_hub_collections WHERE id = ANY($1::uuid[])',
                [collIds],
              )
              await cClient.end()
              cClient = null
              for (const row of cr.rows || []) {
                const cmeta = row.metadata && typeof row.metadata === 'object' ? row.metadata : {}
                const lc = cmeta.linked_category_id != null ? String(cmeta.linked_category_id).trim() : ''
                if (lc) collToLinkedCat.set(String(row.id).trim().toLowerCase(), lc.trim().toLowerCase())
              }
            } catch (e) {
              try { if (cClient) await cClient.end() } catch (_) {}
              console.warn('Store products: linked_category from collections:', e?.message)
            }
          }
        }
        const mergeCategoryIdsFromCollections = (p, mapped) => {
          if (!collToLinkedCat.size) return
          const linked = []
          const addColl = (cid) => {
            if (!cid) return
            const catId = collToLinkedCat.get(String(cid).trim().toLowerCase())
            if (catId && !linked.includes(catId)) linked.push(catId)
          }
          if (p.collection_id) addColl(p.collection_id)
          if (Array.isArray(p?.metadata?.collection_ids)) {
            for (const c of p.metadata.collection_ids) addColl(c)
          }
          if (!linked.length) return
          const meta = { ...(mapped.metadata || {}) }
          const existingArr = Array.isArray(meta.category_ids) ? meta.category_ids.map((x) => String(x).trim().toLowerCase()) : []
          for (const catId of linked) {
            if (!existingArr.includes(catId)) existingArr.push(catId)
          }
          meta.category_ids = existingArr
          const primary = linked[0]
          if (!meta.admin_category_id) meta.admin_category_id = primary
          if (!meta.category_id) meta.category_id = primary
          mapped.metadata = meta
        }
        const bestsellerIds = await getBestsellerProductIds()
        let products = list.map((p) => {
          const mapped = mapAdminHubToStoreProduct(p, query.country || 'DE')
          mergeCategoryIdsFromCollections(p, mapped)
          const existingSeller = (mapped.metadata && (mapped.metadata.seller_name || mapped.metadata.shop_name)) || ''
          if (!existingSeller && p.seller_id && storeNamesBySeller[(p.seller_id || 'default').toString().trim()]) {
            const storeName = storeNamesBySeller[(p.seller_id || 'default').toString().trim()]
            mapped.metadata = { ...(mapped.metadata || {}), seller_name: storeName, shop_name: storeName }
          }
          const brandId = mapped.metadata && mapped.metadata.brand_id
          if (brandId && brandsById[brandId]) {
            const b = brandsById[brandId]
            mapped.metadata = { ...(mapped.metadata || {}), brand_name: b.name, brand_logo: b.logo_image || null, brand_handle: b.handle || null }
          }
          if (bestsellerIds.has(String(p.id))) {
            mapped.metadata = { ...(mapped.metadata || {}), is_bestseller: true }
          }
          return mapped
        })
        if (categorySlugFilter) {
          if (!allowedCategoryIds || allowedCategoryIds.size === 0) {
            products = []
          } else {
            products = products.filter((p) => {
              const ids = storeProductCategoryIds(p)
              return ids.some((id) => allowedCategoryIds.has(id))
            })
          }
        }
        res.json({ products, count: products.length })
      } catch (err) {
        console.error('Store products GET (admin hub):', err)
        res.status(500).json({ message: (err && err.message) || 'Internal server error' })
      }
    }
    const getAdminHubCollectionById = async (collectionId) => {
      if (!collectionId) return null
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      if (!dbUrl || !dbUrl.startsWith('postgres')) return null
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        const res = await client.query('SELECT id, title, handle FROM admin_hub_collections WHERE id = $1', [collectionId])
        const r = res.rows && res.rows[0]
        return r ? { id: r.id, title: r.title, handle: r.handle } : null
      } catch (e) {
        return null
      } finally {
        try { if (client) await client.end() } catch (_) {}
      }
    }

    const normalizeStoreEan = (raw) => {
      if (raw == null || raw === '') return ''
      const d = String(raw).replace(/\D/g, '')
      return d.length >= 8 ? d : ''
    }
    const parseVariantsArray = (p) => {
      const v = p && p.variants
      if (Array.isArray(v)) return v
      if (typeof v === 'string' && v) {
        try {
          const j = JSON.parse(v)
          return Array.isArray(j) ? j : []
        } catch (_) {
          return []
        }
      }
      return []
    }
    const extractEanFromHubProductRow = (p) => {
      if (!p) return ''
      const meta = p.metadata && typeof p.metadata === 'object' ? p.metadata : {}
      let e = normalizeStoreEan(meta.ean)
      if (e) return e
      for (const row of parseVariantsArray(p)) {
        e = normalizeStoreEan(row && row.ean)
        if (e) return e
      }
      return ''
    }
    const primaryPriceCentsHubProduct = (p) => {
      const meta = p.metadata && typeof p.metadata === 'object' ? p.metadata : {}
      const prices = meta.prices && typeof meta.prices === 'object' ? meta.prices : {}
      const pick = prices.DE || prices.AT || prices.CH || Object.values(prices)[0]
      if (pick && typeof pick === 'object') {
        const sale = pick.sale_cents != null ? Number(pick.sale_cents) : null
        const brut = pick.brutto_cents != null ? Number(pick.brutto_cents) : null
        const c = sale != null && sale > 0 ? sale : brut
        if (c != null && c > 0) return Math.round(c)
      }
      for (const v of parseVariantsArray(p)) {
        if (v && v.price_cents != null && Number(v.price_cents) > 0) return Math.round(Number(v.price_cents))
      }
      if (p.price_cents != null && Number(p.price_cents) > 0) return Math.round(Number(p.price_cents))
      if (p.price != null && Number(p.price) > 0) return Math.round(Number(p.price) * 100)
      return 0
    }
    const totalInventoryHubProduct = (p) => {
      const vars = parseVariantsArray(p)
      if (vars.length) {
        return vars.reduce((s, v) => s + (parseInt(v && v.inventory, 10) || 0), 0)
      }
      return parseInt(p.inventory, 10) || 0
    }
    const computeBuyBoxScore = (priceCents, sellerAvg, sellerCount, inv) => {
      const p = Number(priceCents) || 0
      const priceScore = p > 0 ? 10000000 / p : 0
      const ratingScore = (Number(sellerAvg) || 0) * 2500
      const countScore = Math.log1p(Math.max(0, Number(sellerCount) || 0)) * 200
      const stockScore = inv > 0 ? 1200 : -8000
      return priceScore + ratingScore + countScore + stockScore
    }
    const loadSellerReviewStatsBatch = async (sellerIds) => {
      const ids = [...new Set((sellerIds || []).map((s) => String(s || '').trim()).filter(Boolean))]
      if (!ids.length) return new Map()
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      if (!dbUrl || !dbUrl.startsWith('postgres')) return new Map()
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        const r = await client.query(
          `SELECT seller_id,
                  ROUND(AVG(rating)::numeric, 2)::float AS avg,
                  COUNT(*)::int AS cnt
           FROM store_product_reviews
           WHERE seller_id = ANY($1::text[])
           GROUP BY seller_id`,
          [ids]
        )
        await client.end()
        client = null
        const m = new Map()
        for (const row of r.rows || []) {
          m.set(String(row.seller_id).trim(), { avg: parseFloat(row.avg || 0), count: row.cnt || 0 })
        }
        for (const id of ids) {
          if (!m.has(id)) m.set(id, { avg: 0, count: 0 })
        }
        return m
      } catch (_) {
        try { if (client) await client.end() } catch (__) {}
        return new Map()
      }
    }
    const findEanOffersFromHub = async (canonicalEan, approvedSellerIds) => {
      const ean = normalizeStoreEan(canonicalEan)
      if (!ean) return []
      // First: scan all published + visible products
      let list = await listAdminHubProductsDb({ limit: 5000 })
      list = list.filter((row) => (row.status || '').toLowerCase() === 'published' && isStoreVisibleSellerProduct(row, approvedSellerIds))
      const legacyOffers = list.filter((row) => extractEanFromHubProductRow(row) === ean && row.seller_id)
      // Second: listings table — query for both true master (seller_id=null) AND legacy products
      // This covers both new-model (master+listings) and old-model (seller product used as listings base)
      const masterRow = list.find((row) => extractEanFromHubProductRow(row) === ean && !row.seller_id)
      // Also include legacy products that could have listings (e.g. created before deduplication)
      const allEanPublishedRows = masterRow
        ? [masterRow, ...legacyOffers]
        : legacyOffers
      let listingOffers = []
      const productIdsForListings = [...new Set(allEanPublishedRows.map((r) => String(r.id)))]
      if (productIdsForListings.length > 0) {
        const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
        if (dbUrl && dbUrl.startsWith('postgres')) {
          try {
            const { Client } = require('pg')
            const lc = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
            await lc.connect()
            const lr = await lc.query(
              `SELECT seller_id, price_cents, inventory, status, orders_count, product_id::text AS product_id
               FROM admin_hub_seller_listings
               WHERE product_id = ANY($1::uuid[]) AND status = 'active'`,
              [productIdsForListings]
            )
            await lc.end()
            // Build a map from product_id → product row (prefer masterRow for catalog data)
            const productById = new Map(allEanPublishedRows.map((r) => [String(r.id), r]))
            listingOffers = (lr.rows || [])
              .filter((l) => !approvedSellerIds || approvedSellerIds.size === 0 || approvedSellerIds.has(l.seller_id))
              .map((l) => {
                const baseRow = productById.get(String(l.product_id)) || masterRow || legacyOffers[0]
                return {
                  ...baseRow,
                  id: String(l.product_id) + '-listing-' + l.seller_id, // synthetic id for scoring
                  _listing_id: String(l.product_id),
                  seller_id: l.seller_id,
                  price_cents: l.price_cents,
                  inventory: l.inventory,
                  _orders_count: l.orders_count,
                }
              })
          } catch (_) {}
        }
      }
      // Merge: listings take priority over legacy rows for the same seller_id
      const sellersCoveredByListings = new Set(listingOffers.map((o) => o.seller_id))
      const filteredLegacy = legacyOffers.filter((o) => !sellersCoveredByListings.has(o.seller_id))
      return [...listingOffers, ...filteredLegacy]
    }
    const enrichMappedStoreProduct = async (productRow, mapped) => {
      const existingSeller = (mapped.metadata && (mapped.metadata.seller_name || mapped.metadata.shop_name)) || ''
      if (!existingSeller && productRow.seller_id) {
        const storeName = await getSellerStoreName(productRow.seller_id)
        if (storeName) {
          mapped.metadata = { ...(mapped.metadata || {}), seller_name: storeName, shop_name: storeName }
        }
      }
      const brandId = mapped.metadata && mapped.metadata.brand_id
      if (brandId) {
        const brand = await getBrandById(brandId)
        if (brand) {
          mapped.metadata = { ...(mapped.metadata || {}), brand_name: brand.name, brand_logo: brand.logo_image || null, brand_handle: brand.handle || null }
        }
      }
      const bestsellerIds = await getBestsellerProductIds()
      if (bestsellerIds.has(String(productRow.id))) {
        mapped.metadata = { ...(mapped.metadata || {}), is_bestseller: true }
      }
      const sid = String(productRow.seller_id || '').trim()
      if (sid) {
        const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
        if (dbUrl && dbUrl.startsWith('postgres')) {
          let client
          try {
            const { Client } = require('pg')
            client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
            await client.connect()
            const sr = await client.query(
              'SELECT review_avg, review_count FROM admin_hub_seller_settings WHERE seller_id = $1',
              [sid]
            )
            await client.end()
            client = null
            const row = sr.rows && sr.rows[0]
            if (row && (Number(row.review_count) > 0 || row.review_avg != null)) {
              mapped.metadata = {
                ...(mapped.metadata || {}),
                seller_review_avg: row.review_avg != null ? parseFloat(row.review_avg) : null,
                seller_review_count: row.review_count != null ? Number(row.review_count) : 0,
              }
            }
          } catch (_) {
            try { if (client) await client.end() } catch (__) {}
          }
        }
      }
      return mapped
    }

    const storeProductByIdFromAdminHubGET = async (req, res) => {
      try {
        const idOrHandle = (req.params.idOrHandle || req.params.id || '').toString().trim()
        if (!idOrHandle) {
          res.status(400).json({ message: 'Product id or handle required' })
          return
        }
        const landed = await getAdminHubProductByIdOrHandleDb(idOrHandle)
        const approvedSellerIds = await getApprovedSellerIdsSet()
        if (!landed || (landed.status || '').toLowerCase() !== 'published' || !isStoreVisibleSellerProduct(landed, approvedSellerIds)) {
          res.status(404).json({ message: 'Product not found' })
          return
        }
        const canonicalEan = extractEanFromHubProductRow(landed)
        let winnerRow = landed
        let multiOffer = null

        if (canonicalEan) {
          const offers = await findEanOffersFromHub(canonicalEan, approvedSellerIds)
          if (offers.length >= 1) {
            const sellerKeys = offers.map((p) => String(p.seller_id || 'default').trim() || 'default')
            const statsMap = await loadSellerReviewStatsBatch(sellerKeys)
            const scored = offers.map((p) => {
              const sid = String(p.seller_id || 'default').trim() || 'default'
              const st = statsMap.get(sid) || { avg: 0, count: 0 }
              const price = primaryPriceCentsHubProduct(p)
              const inv = totalInventoryHubProduct(p)
              const score = computeBuyBoxScore(price, st.avg, st.count, inv)
              return { p, score, price, inv, stats: st, sid }
            })
            scored.sort((a, b) => b.score - a.score)
            winnerRow = scored[0].p
            const uniqueSellers = [...new Set(scored.map((x) => x.sid))]
            const storeNames = {}
            await Promise.all(uniqueSellers.map(async (sid) => {
              storeNames[sid] = (await getSellerStoreName(sid)) || sid
            }))
            const reviewProductIds = offers.map((p) => String(p._listing_id || p.id))
            const otherSellers = scored.slice(1).map(({ p, price, stats, sid }) => {
              const realProductId = p._listing_id || String(p.id)
              const masterP = p._listing_id ? (scored.find((x) => String(x.p.id) === p._listing_id)?.p || p) : p
              const m = masterP.metadata && typeof masterP.metadata === 'object' ? masterP.metadata : {}
              const media = m.media
              const rawMediaList = Array.isArray(media) ? media : (typeof media === 'string' && media ? [media] : [])
              const thumb = resolveUploadUrl((typeof rawMediaList[0] === 'string' ? rawMediaList[0] : (rawMediaList[0] && rawMediaList[0].url) || null) || m.thumbnail || null)
              return {
                product_id: realProductId,
                handle: masterP.handle || p.handle,
                title: masterP.title || p.title || '',
                seller_id: sid,
                store_name: storeNames[sid] || sid,
                price_cents: price,
                seller_review_avg: stats.avg,
                seller_review_count: stats.count,
                in_stock: (p.inventory != null ? p.inventory : totalInventoryHubProduct(p)) > 0,
                thumbnail: thumb || null,
              }
            })
            // Only set multiOffer (shows "Other sellers" card) when there are 2+ sellers
            if (offers.length > 1) {
              multiOffer = {
                canonical_ean: canonicalEan,
                review_product_ids: reviewProductIds,
                landed_product_id: String(landed.id),
                buy_box_product_id: String(winnerRow._listing_id || winnerRow.id),
                other_sellers: otherSellers,
              }
            }
          }
        }

        if (winnerRow.collection_id) {
          const collection = await getAdminHubCollectionById(winnerRow.collection_id)
          if (collection) winnerRow.collection = collection
        }
        const mapped = mapAdminHubToStoreProduct(winnerRow, (req.query && req.query.country) || 'DE')
        await enrichMappedStoreProduct(winnerRow, mapped)
        res.json({ product: mapped, multi_offer: multiOffer })
      } catch (err) {
        console.error('Store product by id GET (admin hub):', err)
        res.status(500).json({ message: (err && err.message) || 'Internal server error' })
      }
    }
    httpApp.get('/store/products', storeProductsFromAdminHubGET)
    httpApp.get('/store/products/:idOrHandle', storeProductByIdFromAdminHubGET)
    httpApp.get('/store/brands', async (_req, res) => {
      const client = getBrandsDbClient()
      if (!client) return res.status(500).json({ message: 'Database unavailable' })
      try {
        const approvedSellerIds = await getApprovedSellerIdsSet()
        let visibleProducts = await listAdminHubProductsDb({ limit: 5000 })
        visibleProducts = visibleProducts.filter((p) => (p.status || '').toLowerCase() === 'published' && isStoreVisibleSellerProduct(p, approvedSellerIds))
        const visibleBrandIds = new Set(
          visibleProducts
            .map((p) => p?.metadata?.brand_id != null ? String(p.metadata.brand_id).trim() : '')
            .filter(Boolean)
        )
        if (visibleBrandIds.size === 0) return res.json({ brands: [], count: 0 })
        await client.connect()
        const r = await client.query(
          `SELECT id, name, handle, logo_image, banner_image, address
           FROM admin_hub_brands
           WHERE handle IS NOT NULL AND LENGTH(TRIM(handle)) > 0
           ORDER BY LOWER(name), created_at DESC`
        )
        await client.end()
        const brands = (r.rows || [])
          .filter((row) => visibleBrandIds.has(String(row.id)))
          .map((row) => ({
          id: row.id,
          name: row.name,
          handle: row.handle,
          logo_image: row.logo_image || null,
          banner_image: row.banner_image || null,
          address: row.address || null,
        }))
        res.json({ brands, count: brands.length })
      } catch (e) {
        try { await client.end() } catch (_) {}
        console.error('Store brands list GET:', e)
        res.status(500).json({ message: (e && e.message) || 'Internal server error' })
      }
    })
    httpApp.get('/store/brands/:handle', async (req, res) => {
      const handle = (req.params.handle || '').trim().toLowerCase()
      if (!handle) return res.status(400).json({ message: 'handle required' })
      const client = getBrandsDbClient()
      if (!client) return res.status(500).json({ message: 'Database unavailable' })
      try {
        await client.connect()
        const r = await client.query('SELECT id, name, handle, logo_image, banner_image, address FROM admin_hub_brands WHERE LOWER(handle) = $1', [handle])
        await client.end()
        const brand = r.rows && r.rows[0]
        if (!brand) return res.status(404).json({ message: 'Brand not found' })
        // Fetch products for this brand
        const approvedSellerIds = await getApprovedSellerIdsSet()
        let list = await listAdminHubProductsDb({ limit: 5000 })
        list = list.filter((p) =>
          (p.status || '').toLowerCase() === 'published' &&
          isStoreVisibleSellerProduct(p, approvedSellerIds) &&
          p.metadata &&
          String(p.metadata.brand_id) === String(brand.id)
        )
        if (!list.length) return res.status(404).json({ message: 'Brand not found' })
        const sellerIds = [...new Set(list.map((p) => (p.seller_id || 'default').toString().trim()).filter(Boolean))]
        const storeNamesBySeller = {}
        await Promise.all(sellerIds.map(async (id) => { storeNamesBySeller[id] = await getSellerStoreName(id) }))
        const bestsellerIds = await getBestsellerProductIds()
        const products = list.map((p) => {
          const mapped = mapAdminHubToStoreProduct(p, (req.query && req.query.country) || 'DE')
          const existingSeller = (mapped.metadata && (mapped.metadata.seller_name || mapped.metadata.shop_name)) || ''
          if (!existingSeller && p.seller_id && storeNamesBySeller[(p.seller_id || 'default').toString().trim()]) {
            const storeName = storeNamesBySeller[(p.seller_id || 'default').toString().trim()]
            mapped.metadata = { ...(mapped.metadata || {}), seller_name: storeName, shop_name: storeName }
          }
          mapped.metadata = { ...(mapped.metadata || {}), brand_name: brand.name, brand_logo: brand.logo_image || null, brand_handle: brand.handle || null }
          if (bestsellerIds.has(String(p.id))) {
            mapped.metadata = { ...(mapped.metadata || {}), is_bestseller: true }
          }
          return mapped
        })
        res.json({ brand, products, count: products.length })
      } catch (e) {
        console.error('Store brands GET:', e)
        res.status(500).json({ message: (e && e.message) || 'Internal server error' })
      }
    })

    // --- Store Carts (session cart: create, get, add/update/remove line-items) ---
    const productIdFromVariantId = (variantId) => {
      if (!variantId || typeof variantId !== 'string') return null
      if (variantId.endsWith('-variant')) return variantId.slice(0, -'-variant'.length)
      const idx = variantId.indexOf('-v-')
      return idx > 0 ? variantId.slice(0, idx) : variantId
    }

    const BONUS_POINTS_PER_EURO_DISCOUNT = 25
    const BONUS_SIGNUP_POINTS = 100
    const STRIPE_MIN_CHARGE_CENTS_EUR = 50
    const COUPON_CODE_MAX_LEN = 100

    const discountCentsFromBonusPoints = (points) => {
      const p = Math.max(0, Number(points || 0))
      return Math.floor((p / BONUS_POINTS_PER_EURO_DISCOUNT) * 100)
    }

    const normalizeCouponCode = (code) =>
      String(code || '').trim().toUpperCase().slice(0, COUPON_CODE_MAX_LEN)

    const resolveCouponDiscountCents = (couponRow, subtotalCents) => {
      if (!couponRow) return 0
      const sub = Math.max(0, Number(subtotalCents || 0))
      const minSub = Math.max(0, Number(couponRow.min_subtotal_cents || 0))
      if (sub < minSub) return 0
      const type = String(couponRow.discount_type || 'percent').toLowerCase()
      const val = Math.max(0, Number(couponRow.discount_value || 0))
      if (type === 'fixed') return Math.min(sub, Math.floor(val))
      const pct = Math.min(100, val)
      return Math.min(sub, Math.floor((sub * pct) / 100))
    }

    const loadValidCouponForSeller = async (client, sellerId, code) => {
      const normalizedCode = normalizeCouponCode(code)
      if (!normalizedCode) return null
      const effectiveSellerId = String(sellerId || 'default')
      // Try seller-specific coupon first, then fall back to platform-wide ('default') coupons
      const sellerIds = effectiveSellerId === 'default'
        ? ['default']
        : [effectiveSellerId, 'default']
      const r = await client.query(
        `SELECT *
         FROM admin_hub_coupons
         WHERE seller_id = ANY($1)
           AND lower(code) = lower($2)
           AND active = true
           AND (expires_at IS NULL OR expires_at > now())
         ORDER BY CASE WHEN seller_id = $3 THEN 0 ELSE 1 END
         LIMIT 1`,
        [sellerIds, normalizedCode, effectiveSellerId],
      )
      const row = r.rows?.[0]
      if (!row) return null
      const usageLimit = row.usage_limit == null ? null : Number(row.usage_limit)
      const usedCount = Number(row.used_count || 0)
      if (usageLimit != null && usedCount >= usageLimit) return null
      return row
    }

    const bonusPointsEarnedFromOrderPaidCents = (paidCents) =>
      Math.ceil(Number(paidCents || 0) / 100)

    /** Seller commission/payout basis: merchandise at list price (subtotal), before bonus discount. Bonus is platform-funded. */
    const sellerOrderRevenueBasisCents = (row) => {
      const sub = row.subtotal_cents != null ? Number(row.subtotal_cents) : NaN
      if (Number.isFinite(sub) && sub > 0) return Math.round(sub)
      const tot = row.total_cents != null ? Number(row.total_cents) : 0
      return Math.max(0, Math.round(tot))
    }

    const clampCartBonusRedemption = (requestedPoints, balance, subtotalCents) => {
      let p = Math.max(0, Math.min(Number(requestedPoints) || 0, Number(balance) || 0))
      p = Math.floor(p)
      if (subtotalCents < STRIPE_MIN_CHARGE_CENTS_EUR) return 0
      let disc = discountCentsFromBonusPoints(p)
      const maxDiscount = subtotalCents - STRIPE_MIN_CHARGE_CENTS_EUR
      if (disc > maxDiscount) {
        p = Math.floor((maxDiscount * BONUS_POINTS_PER_EURO_DISCOUNT) / 100)
      }
      return p
    }

    /** Single source for PI amount + order verification (bonus/coupon + Versand). */
    const computeCartCheckoutMoney = (cart, shippingCentsInput) => {
      const items = Array.isArray(cart?.items) ? cart.items : []
      const subtotalCents = items.reduce(
        (sum, it) => sum + Number(it.unit_price_cents || 0) * Number(it.quantity || 1),
        0,
      )
      const reservedPts = Number(cart.bonus_points_reserved || 0)
      const bonusDiscountCents = discountCentsFromBonusPoints(reservedPts)
      const couponDiscountCents = Math.max(0, Number(cart.coupon_discount_cents || 0))
      const discountCents = Math.max(0, bonusDiscountCents + couponDiscountCents)
      const shippingCents = Math.max(0, Number(shippingCentsInput || 0))
      const merchandiseAfterDiscount = Math.max(0, subtotalCents - discountCents)
      const payTotalCents = Math.max(0, merchandiseAfterDiscount + shippingCents)
      return {
        subtotalCents,
        bonusDiscountCents,
        couponDiscountCents,
        discountCents,
        shippingCents,
        merchandiseAfterDiscount,
        payTotalCents,
      }
    }

    const clearCartBonusReserve = async (client, cartId) => {
      await client.query('UPDATE store_carts SET bonus_points_reserved = 0, updated_at = now() WHERE id = $1', [cartId]).catch(() => {})
    }

    /**
     * @param {import('pg').Client} client
     * @param {{ customerId: string, pointsDelta: number, description: string, source?: string, orderId?: string|null, occurredAt?: string|Date|null, skipBalanceUpdate?: boolean }} opts
     */
    const appendBonusLedger = async (client, opts) => {
      const {
        customerId,
        pointsDelta,
        description,
        source = 'manual',
        orderId = null,
        occurredAt = null,
        skipBalanceUpdate = false,
      } = opts
      if (!customerId || !Number.isFinite(Number(pointsDelta))) return
      const at = occurredAt ? new Date(occurredAt).toISOString() : null
      await client.query(
        `INSERT INTO store_customer_bonus_ledger (customer_id, occurred_at, points_delta, description, source, order_id)
         VALUES ($1::uuid, COALESCE($2::timestamptz, NOW()), $3, $4, $5, $6::uuid)`,
        [customerId, at, Number(pointsDelta), String(description || '').trim() || '—', String(source).slice(0, 40), orderId || null],
      )
      if (!skipBalanceUpdate) {
        await client.query(
          `UPDATE store_customers SET bonus_points = COALESCE(bonus_points, 0) + $1, updated_at = NOW() WHERE id = $2::uuid`,
          [Number(pointsDelta), customerId],
        )
      }
    }

    /** Legacy ledger rows ended with " inkl. Versand (+N Punkte)" — strip for display/API. */
    const stripLegacyBonusLedgerVersandSuffix = (desc) => {
      if (desc == null || desc === '') return desc
      const s = String(desc).replace(/\s+inkl\.\s*Versand\s*\(\+[0-9]+\s+Punkte\)\s*$/i, '').trim()
      return s || desc
    }

    const getCartWithItems = async (client, cartId) => {
      const cartRes = await client.query(
        'SELECT id, created_at, updated_at, COALESCE(bonus_points_reserved, 0) AS bonus_points_reserved, coupon_code, COALESCE(coupon_discount_cents, 0) AS coupon_discount_cents FROM store_carts WHERE id = $1',
        [cartId],
      )
      const cartRow = cartRes.rows && cartRes.rows[0]
      if (!cartRow) return null
      const itemsRes = await client.query(
        `SELECT ci.id, ci.variant_id, ci.product_id, ci.quantity, ci.unit_price_cents, ci.title, ci.thumbnail, ci.product_handle,
         COALESCE(p1.metadata->>'shipping_group_id', p2.metadata->>'shipping_group_id') AS shipping_group_id,
         COALESCE(p1.title, p2.title) AS product_title,
         COALESCE(p1.metadata, p2.metadata) AS product_metadata
         FROM store_cart_items ci
         LEFT JOIN admin_hub_products p1 ON p1.id::text = ci.product_id
         LEFT JOIN admin_hub_products p2 ON p1.id IS NULL AND p2.handle = ci.product_handle
         WHERE ci.cart_id = $1 ORDER BY ci.created_at`,
        [cartId]
      )
      const bestsellerIds = await getBestsellerProductIds().catch(() => new Set())
      const items = (itemsRes.rows || []).map((r) => {
        let pm = r.product_metadata
        if (pm != null && typeof pm === 'string') {
          try {
            pm = JSON.parse(pm)
          } catch (_) {
            pm = null
          }
        }
        const isBestseller = bestsellerIds.has(String(r.product_id || '')) || (pm && bestsellerIds.has(String(pm.id || '')))
        const metadataOut = pm && typeof pm === 'object'
          ? (isBestseller ? { ...pm, is_bestseller: true } : pm)
          : (isBestseller ? { is_bestseller: true } : null)
        return {
          id: r.id,
          variant_id: r.variant_id,
          product_id: r.product_id,
          quantity: r.quantity,
          unit_price_cents: r.unit_price_cents,
          title: r.title,
          thumbnail: r.thumbnail,
          product_handle: r.product_handle,
          shipping_group_id: r.shipping_group_id || null,
          product_title: r.product_title || null,
          product_metadata: metadataOut,
        }
      })
      return {
        id: cartRow.id,
        created_at: cartRow.created_at,
        updated_at: cartRow.updated_at,
        bonus_points_reserved: Number(cartRow.bonus_points_reserved || 0),
        coupon_code: cartRow.coupon_code || null,
        coupon_discount_cents: Number(cartRow.coupon_discount_cents || 0),
        items,
      }
    }
    const storeCartsPOST = async (req, res) => {
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      if (!dbUrl || !dbUrl.startsWith('postgres')) return res.status(503).json({ message: 'Database not configured' })
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        const r = await client.query('INSERT INTO store_carts DEFAULT VALUES RETURNING id, created_at, updated_at')
        const row = r.rows && r.rows[0]
        if (!row) { await client.end(); return res.status(500).json({ message: 'Failed to create cart' }) }
        const cart = await getCartWithItems(client, row.id)
        await client.end()
        res.status(201).json({ cart })
      } catch (err) {
        if (client) try { await client.end() } catch (_) {}
        console.error('Store carts POST:', err)
        res.status(500).json({ message: (err && err.message) || 'Internal server error' })
      }
    }
    const storeCartGET = async (req, res) => {
      const cartId = (req.params.id || req.params.cartId || '').toString().trim()
      if (!cartId) return res.status(400).json({ message: 'Cart id required' })
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      if (!dbUrl || !dbUrl.startsWith('postgres')) return res.status(503).json({ message: 'Database not configured' })
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        const cart = await getCartWithItems(client, cartId)
        await client.end()
        if (!cart) return res.status(404).json({ message: 'Cart not found' })
        res.json({ cart })
      } catch (err) {
        if (client) try { await client.end() } catch (_) {}
        console.error('Store cart GET:', err)
        res.status(500).json({ message: (err && err.message) || 'Internal server error' })
      }
    }

    /** PATCH /store/carts/:id — bonus_points_reserved + customer contact info */
    const storeCartPATCH = async (req, res) => {
      const cartId = (req.params.id || req.params.cartId || '').toString().trim()
      if (!cartId) return res.status(400).json({ message: 'Cart id required' })
      const body = req.body || {}
      const rawReq = body.bonus_points_reserved ?? body.bonus_points_to_redeem
      const requested = Math.max(0, parseInt(rawReq, 10) || 0)
      const couponCodeRaw = body.coupon_code

      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      if (!dbUrl || !dbUrl.startsWith('postgres')) return res.status(503).json({ message: 'Database not configured' })

      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        const cart = await getCartWithItems(client, cartId)
        if (!cart) {
          await client.end()
          return res.status(404).json({ message: 'Cart not found' })
        }
        const items = Array.isArray(cart.items) ? cart.items : []
        const subtotalCents = items.reduce((sum, it) => sum + (Number(it.unit_price_cents || 0) * Number(it.quantity || 1)), 0)

        let sellerId = 'default'
        try {
          const firstItem = items[0]
          if (firstItem && firstItem.product_id) {
            const sellerRow = await client.query('SELECT seller_id FROM admin_hub_products WHERE id = $1', [firstItem.product_id])
            if (sellerRow.rows && sellerRow.rows[0] && sellerRow.rows[0].seller_id) {
              sellerId = sellerRow.rows[0].seller_id
            }
          }
        } catch (_) {}

        let reserved = 0
        if (requested > 0) {
          const authHeader = req.headers.authorization || ''
          const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
          const payload = verifyCustomerToken(token)
          if (!payload?.id) {
            await client.end()
            return res.status(401).json({ message: 'Anmeldung erforderlich, um Bonuspunkte einzulösen' })
          }
          const balR = await client.query(
            'SELECT COALESCE(bonus_points, 0) AS bp FROM store_customers WHERE id = $1::uuid',
            [payload.id],
          )
          const balance = Number(balR.rows?.[0]?.bp || 0)
          reserved = clampCartBonusRedemption(requested, balance, subtotalCents)
        }

        let nextCouponCode = cart.coupon_code || null
        let couponDiscountCents = 0
        if (couponCodeRaw !== undefined) {
          const incoming = normalizeCouponCode(couponCodeRaw)
          nextCouponCode = incoming || null
        }
        if (nextCouponCode) {
          const couponRow = await loadValidCouponForSeller(client, sellerId, nextCouponCode)
          if (!couponRow) {
            await client.end()
            return res.status(400).json({ message: 'Ungültiger oder abgelaufener Coupon-Code' })
          }
          nextCouponCode = normalizeCouponCode(couponRow.code)
          couponDiscountCents = resolveCouponDiscountCents(couponRow, subtotalCents)
        }

        // Save customer contact info if provided
        if (body.email !== undefined || body.first_name !== undefined || body.last_name !== undefined || body.phone !== undefined) {
          const fields = []; const vals = []
          if (body.email !== undefined) { vals.push(body.email || null); fields.push(`email = $${vals.length}`) }
          if (body.first_name !== undefined) { vals.push(body.first_name || null); fields.push(`first_name = $${vals.length}`) }
          if (body.last_name !== undefined) { vals.push(body.last_name || null); fields.push(`last_name = $${vals.length}`) }
          if (body.phone !== undefined) { vals.push(body.phone || null); fields.push(`phone = $${vals.length}`) }
          vals.push(cartId)
          await client.query(`UPDATE store_carts SET ${fields.join(', ')}, updated_at = now() WHERE id = $${vals.length}`, vals)
        }
        await client.query(
          'UPDATE store_carts SET bonus_points_reserved = $1, coupon_code = $2, coupon_discount_cents = $3, updated_at = now() WHERE id = $4',
          [reserved, nextCouponCode, couponDiscountCents, cartId],
        )
        const updated = await getCartWithItems(client, cartId)
        await client.end()
        res.json({
          cart: updated,
          bonus_discount_cents: discountCentsFromBonusPoints(reserved),
          coupon_discount_cents: couponDiscountCents,
          bonus_points_reserved: reserved,
          coupon_code: nextCouponCode,
        })
      } catch (err) {
        if (client) try { await client.end() } catch (_) {}
        console.error('Store cart PATCH:', err)
        res.status(500).json({ message: (err && err.message) || 'Internal server error' })
      }
    }

    const storeCartLineItemsPOST = async (req, res) => {
      const cartId = (req.params.id || req.params.cartId || '').toString().trim()
      if (!cartId) return res.status(400).json({ message: 'Cart id required' })
      const body = req.body || {}
      const variantId = (body.variant_id || body.variantId || '').toString().trim()
      const quantity = Math.max(1, parseInt(body.quantity, 10) || 1)
      const chosenSellerId = (body.seller_id || '').toString().trim() || null
      if (!variantId) return res.status(400).json({ message: 'variant_id required' })
      const productId = productIdFromVariantId(variantId)
      if (!productId) return res.status(400).json({ message: 'Invalid variant_id' })
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      if (!dbUrl || !dbUrl.startsWith('postgres')) return res.status(503).json({ message: 'Database not configured' })
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        const product = await getAdminHubProductByIdOrHandleDb(productId)
        if (!product) { await client.end(); return res.status(404).json({ message: 'Product not found' }) }
        const meta = product.metadata && typeof product.metadata === 'object' ? product.metadata : {}
        const media = meta.media
        const thumb = Array.isArray(media) && media[0] ? (typeof media[0] === 'string' ? media[0] : media[0].url) : (typeof media === 'string' ? media : null)
        const priceCents = product.price_cents != null ? Number(product.price_cents) : Math.round(Number(product.price || 0) * 100)
        const rawVariants = Array.isArray(product.variants) && product.variants.length > 0 ? product.variants : []
        let unitPriceCents = priceCents
        const variantIndex = variantId.includes('-v-') ? parseInt(variantId.split('-v-')[1], 10) : null
        let variantLabel = ''
        if (rawVariants.length && variantIndex >= 0 && rawVariants[variantIndex]) {
          const v = rawVariants[variantIndex]
          if (v.price_cents != null) unitPriceCents = Number(v.price_cents)
          else if (v.price != null) unitPriceCents = Math.round(Number(v.price) * 100)
          const optVals = Array.isArray(v.option_values) && v.option_values.length > 0 ? v.option_values : null
          const variationGroups = Array.isArray(meta.variation_groups) ? meta.variation_groups : null
          if (optVals && variationGroups && variationGroups.length === optVals.length) {
            const toUpper = (g) => (g && g.name ? String(g.name).toUpperCase() : '')
            variantLabel = variationGroups.map((g, i) => `${toUpper(g)}: ${optVals[i] || ''}`).join(' / ')
          } else if (optVals) {
            variantLabel = optVals.join(' / ')
          } else {
            variantLabel = v.title || v.value || ''
          }
        }
        // If a specific seller is chosen, override price from their listing
        if (chosenSellerId) {
          const listingRow = await client.query(
            `SELECT price_cents FROM admin_hub_seller_listings WHERE product_id = $1 AND seller_id = $2 AND status = 'active' LIMIT 1`,
            [String(product.id || productId), chosenSellerId]
          )
          if (listingRow.rows[0]) unitPriceCents = Number(listingRow.rows[0].price_cents)
        }
        const sellerForCamp = chosenSellerId || (product.seller_id ? String(product.seller_id).trim() : '')
        if (sellerForCamp) {
          try {
            const campRow = await findBestSellerCampaignDiscountRow(client, {
              productId: String(product.id || productId),
              variantId,
              sellerId: sellerForCamp,
            })
            if (campRow) unitPriceCents = applySellerCampaignToPriceCents(unitPriceCents, campRow)
          } catch (_) {}
        }
        const title = (product.title || 'Product') + (variantLabel ? ` (${variantLabel})` : '')
        const handle = product.handle || product.id
        const cartExists = await client.query('SELECT id FROM store_carts WHERE id = $1', [cartId])
        if (!cartExists.rows || !cartExists.rows[0]) { await client.end(); return res.status(404).json({ message: 'Cart not found' }) }
        const existing = await client.query('SELECT id, quantity FROM store_cart_items WHERE cart_id = $1 AND variant_id = $2', [cartId, variantId])
        if (existing.rows && existing.rows[0]) {
          const newQty = (existing.rows[0].quantity || 0) + quantity
          await client.query('UPDATE store_cart_items SET quantity = $1, seller_id = COALESCE($2, seller_id), updated_at = now() WHERE id = $3', [newQty, chosenSellerId, existing.rows[0].id])
        } else {
          await client.query(
            'INSERT INTO store_cart_items (cart_id, variant_id, product_id, quantity, unit_price_cents, title, thumbnail, product_handle, seller_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
            [cartId, variantId, String(product.id || productId), quantity, unitPriceCents, title, thumb, handle, chosenSellerId]
          )
        }
        await clearCartBonusReserve(client, cartId)
        const cart = await getCartWithItems(client, cartId)
        await client.end()
        res.json({ cart })
      } catch (err) {
        if (client) try { await client.end() } catch (_) {}
        console.error('Store cart line-items POST:', err)
        res.status(500).json({ message: (err && err.message) || 'Internal server error' })
      }
    }
    const storeCartLineItemPATCH = async (req, res) => {
      const cartId = (req.params.id || req.params.cartId || '').toString().trim()
      const lineId = (req.params.lineId || req.params.line_id || '').toString().trim()
      if (!cartId || !lineId) return res.status(400).json({ message: 'Cart id and line item id required' })
      const quantity = Math.max(0, parseInt((req.body || {}).quantity, 10))
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      if (!dbUrl || !dbUrl.startsWith('postgres')) return res.status(503).json({ message: 'Database not configured' })
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        if (quantity === 0) {
          await client.query('DELETE FROM store_cart_items WHERE cart_id = $1 AND id = $2', [cartId, lineId])
        } else {
          const up = await client.query('UPDATE store_cart_items SET quantity = $1, updated_at = now() WHERE cart_id = $2 AND id = $3 RETURNING id', [quantity, cartId, lineId])
          if (!up.rows || !up.rows[0]) { await client.end(); return res.status(404).json({ message: 'Line item not found' }) }
        }
        await clearCartBonusReserve(client, cartId)
        const cart = await getCartWithItems(client, cartId)
        await client.end()
        res.json({ cart })
      } catch (err) {
        if (client) try { await client.end() } catch (_) {}
        console.error('Store cart line-item PATCH:', err)
        res.status(500).json({ message: (err && err.message) || 'Internal server error' })
      }
    }
    const storeCartLineItemDELETE = async (req, res) => {
      const cartId = (req.params.id || req.params.cartId || '').toString().trim()
      const lineId = (req.params.lineId || req.params.line_id || '').toString().trim()
      if (!cartId || !lineId) return res.status(400).json({ message: 'Cart id and line item id required' })
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      if (!dbUrl || !dbUrl.startsWith('postgres')) return res.status(503).json({ message: 'Database not configured' })
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        const del = await client.query('DELETE FROM store_cart_items WHERE cart_id = $1 AND id = $2 RETURNING id', [cartId, lineId])
        if (!del.rows || !del.rows[0]) { await client.end(); return res.status(404).json({ message: 'Line item not found' }) }
        await clearCartBonusReserve(client, cartId)
        const cart = await getCartWithItems(client, cartId)
        await client.end()
        res.json({ cart })
      } catch (err) {
        if (client) try { await client.end() } catch (_) {}
        console.error('Store cart line-item DELETE:', err)
        res.status(500).json({ message: (err && err.message) || 'Internal server error' })
      }
    }

    // Clear cart: delete all line items
    const storeCartClearDELETE = async (req, res) => {
      const cartId = (req.params.id || req.params.cartId || '').toString().trim()
      if (!cartId) return res.status(400).json({ message: 'Cart id required' })
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      if (!dbUrl || !dbUrl.startsWith('postgres')) return res.status(503).json({ message: 'Database not configured' })
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        // Ensure cart exists
        const cartExists = await client.query('SELECT id FROM store_carts WHERE id = $1', [cartId])
        if (!cartExists.rows || !cartExists.rows[0]) { await client.end(); return res.status(404).json({ message: 'Cart not found' }) }
        await client.query('DELETE FROM store_cart_items WHERE cart_id = $1', [cartId])
        await clearCartBonusReserve(client, cartId)
        const cart = await getCartWithItems(client, cartId)
        await client.end()
        res.json({ cart })
      } catch (err) {
        if (client) try { await client.end() } catch (_) {}
        console.error('Store cart clear DELETE:', err)
        res.status(500).json({ message: (err && err.message) || 'Internal server error' })
      }
    }
    httpApp.post('/store/carts', storeCartsPOST)
    httpApp.get('/store/carts/:id', storeCartGET)
    httpApp.patch('/store/carts/:id', storeCartPATCH)
    httpApp.post('/store/carts/:id/line-items', storeCartLineItemsPOST)
    httpApp.patch('/store/carts/:id/line-items/:lineId', storeCartLineItemPATCH)
    httpApp.delete('/store/carts/:id/line-items/:lineId', storeCartLineItemDELETE)
    httpApp.delete('/store/carts/:id/line-items', storeCartClearDELETE)

    /** store_name → company_name → first/last — für Stripe-Beschreibungen */
    async function resolveSellerDisplayNameForStripe(client, sellerId) {
      const sid = String(sellerId || '').trim()
      if (!sid || sid === 'default') return ''
      try {
        const r = await client.query(
          `SELECT store_name, company_name, first_name, last_name FROM seller_users WHERE seller_id = $1 LIMIT 1`,
          [sid],
        )
        const row = r.rows?.[0]
        if (!row) return sid
        const store = String(row.store_name || '').trim()
        const company = String(row.company_name || '').trim()
        const person = [row.first_name, row.last_name].filter(Boolean).join(' ').trim()
        return store || company || person || sid
      } catch (_) {
        return sid
      }
    }

    function truncateForStripeDescription(s, maxLen = 120) {
      let out = String(s || '').replace(/\s+/g, ' ').trim()
      if (!out) return ''
      if (out.length > maxLen) out = `${out.slice(0, Math.max(0, maxLen - 1))}…`
      return out
    }

    // --- Store Payment Intent (Stripe) ---
    const storePaymentIntentPOST = async (req, res) => {
      const body = req.body || {}
      const cartId = (body.cart_id || body.cartId || '').toString().trim()
      if (!cartId) return res.status(400).json({ message: 'cart_id required' })

      const { Client } = require('pg')
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      if (!dbUrl || !dbUrl.startsWith('postgres')) return res.status(503).json({ message: 'Database not configured' })

      let client
      try {
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        const cart = await getCartWithItems(client, cartId)
        if (!cart) {
          await client.end()
          return res.status(404).json({ message: 'Cart not found' })
        }

        const items = Array.isArray(cart.items) ? cart.items : []
        if (!items.length) {
          await client.end()
          return res.status(400).json({ message: 'Cart is empty' })
        }
        
        const shippingCentsRaw = Math.max(0, Number(body.shipping_cents || 0))
        const money = computeCartCheckoutMoney(cart, shippingCentsRaw)
        const {
          subtotalCents,
          bonusDiscountCents,
          couponDiscountCents,
          discountCents,
          shippingCents,
          payTotalCents: payCents,
        } = money
        if (payCents <= 0) {
          await client.end()
          return res.status(400).json({
            message:
              'Der Bestellbetrag ist 0 €. Vollständige Bezahlung nur mit Bonuspunkten ist derzeit nicht möglich — bitte Punkte reduzieren oder Artikel hinzufügen.',
          })
        }

        let cartSellerId = 'default'
        try {
          const fi = items[0]
          if (fi && fi.product_id) {
            const sr = await client.query('SELECT seller_id FROM admin_hub_products WHERE id = $1', [fi.product_id])
            if (sr.rows?.[0]?.seller_id) cartSellerId = sr.rows[0].seller_id
          }
        } catch (_) {}
        const cartSellerDisplay = await resolveSellerDisplayNameForStripe(client, cartSellerId)
        const cartSellerLabel =
          truncateForStripeDescription(cartSellerDisplay) ||
          (cartSellerId === 'default' ? 'Marketplace' : String(cartSellerId))

        const platformRow = await loadPlatformCheckoutRow(client)
        const secretKeyResolved = resolveStripeSecretKeyFromPlatform(platformRow)
        if (!secretKeyResolved) {
          await client.end()
          return res.status(503).json({ message: 'Stripe Secret Key nicht konfiguriert — Sellercentral → Einstellungen → Checkout speichern.' })
        }

        const paymentMethodTypes = paymentMethodTypesFromPlatformRow(platformRow)
        const stripe = new (require('stripe'))(secretKeyResolved)
        const authHdr = (req.headers.authorization || '').toString()
        const bearerTok = authHdr.startsWith('Bearer ') ? authHdr.slice(7).trim() : ''
        let stripeCustomerId = null
        /** Set when logged-in store row exists — used to recover stale Stripe customer ids */
        let stripeCustomerRecovery = null
        if (bearerTok) {
          const payload = verifyCustomerToken(bearerTok)
          if (payload?.id) {
            const custR = await client.query(
              'SELECT id, email, first_name, last_name, stripe_customer_id FROM store_customers WHERE id = $1::uuid',
              [String(payload.id)],
            )
            const c = custR.rows?.[0]
            if (c) {
              stripeCustomerRecovery = {
                dbId: c.id,
                email: c.email || payload.email || null,
                first_name: c.first_name,
                last_name: c.last_name,
              }
              stripeCustomerId = c.stripe_customer_id || null
              if (!stripeCustomerId) {
                const sc = await stripe.customers.create({
                  email: c.email || payload.email || undefined,
                  name: [c.first_name, c.last_name].filter(Boolean).join(' ').trim() || undefined,
                  metadata: { andertal_customer_id: c.id },
                })
                stripeCustomerId = sc.id
                await client.query('UPDATE store_customers SET stripe_customer_id = $1 WHERE id = $2::uuid', [stripeCustomerId, c.id])
              }
            }
          }
        }
        const reservedPts = Number(cart.bonus_points_reserved || 0)
        const piBody = {
          amount: payCents,
          currency: 'eur',
          payment_method_types: paymentMethodTypes,
          description: `Checkout — ${cartSellerLabel}`,
          metadata: {
            cart_id: cartId,
            seller_id: String(cartSellerId),
            seller_name: truncateForStripeDescription(cartSellerDisplay, 500) || cartSellerLabel,
            subtotal_cents: String(subtotalCents),
            /** Seller/commerce basis before bonus (same as subtotal lines); bonus is platform-funded. */
            seller_settlement_basis_cents: String(subtotalCents),
            platform_bonus_subsidy_cents: String(bonusDiscountCents),
            discount_cents: String(discountCents),
            coupon_discount_cents: String(couponDiscountCents),
            coupon_code: String(cart.coupon_code || ''),
            bonus_points_redeemed: String(reservedPts),
            shipping_cents_snapshot: String(shippingCents),
            pay_total_cents: String(payCents),
          },
        }
        if (stripeCustomerId) piBody.customer = stripeCustomerId

        const cancelPiId = (body.cancel_payment_intent_id || '').toString().trim()
        if (cancelPiId && cancelPiId.startsWith('pi_')) {
          try {
            const prev = await stripe.paymentIntents.retrieve(cancelPiId)
            const prevCart = String(prev.metadata?.cart_id || '').trim()
            if (
              prevCart === cartId &&
              prev.status !== 'succeeded' &&
              prev.status !== 'canceled'
            ) {
              await stripe.paymentIntents.cancel(cancelPiId).catch(() => {})
            }
          } catch (_) {}
        }

        let paymentIntent
        try {
          paymentIntent = await stripe.paymentIntents.create(piBody)
        } catch (stripeErr) {
          const code = stripeErr && stripeErr.code
          const param = stripeErr && stripeErr.param
          const errMsg = String((stripeErr && stripeErr.message) || '')
          const noSuchCustomer =
            (code === 'resource_missing' && param === 'customer') ||
            /\bno such customer\b/i.test(errMsg)
          if (noSuchCustomer && stripeCustomerId && stripeCustomerRecovery) {
            await client.query('UPDATE store_customers SET stripe_customer_id = NULL WHERE id = $1::uuid', [
              stripeCustomerRecovery.dbId,
            ])
            const sc = await stripe.customers.create({
              email: stripeCustomerRecovery.email || undefined,
              name: [stripeCustomerRecovery.first_name, stripeCustomerRecovery.last_name].filter(Boolean).join(' ').trim() || undefined,
              metadata: { andertal_customer_id: stripeCustomerRecovery.dbId },
            })
            const newStripeId = sc.id
            await client.query('UPDATE store_customers SET stripe_customer_id = $1 WHERE id = $2::uuid', [
              newStripeId,
              stripeCustomerRecovery.dbId,
            ])
            piBody.customer = newStripeId
            paymentIntent = await stripe.paymentIntents.create(piBody)
          } else {
            throw stripeErr
          }
        }

        await client.end()
        res.json({
          client_secret: paymentIntent.client_secret,
          payment_intent_id: paymentIntent.id,
          amount_cents: payCents,
          subtotal_cents: subtotalCents,
          shipping_cents: shippingCents,
          bonus_discount_cents: bonusDiscountCents,
          coupon_discount_cents: couponDiscountCents,
          discount_cents: discountCents,
          coupon_code: cart.coupon_code || null,
          bonus_points_reserved: reservedPts,
        })
      } catch (err) {
        if (client) try { await client.end() } catch (_) {}
        console.error('Store payment-intent POST:', err)
        res.status(500).json({ message: (err && err.message) || 'Internal server error' })
      }
    }

    // --- Store Orders (Stripe payment success sonrası) ---
    const getOrderWithItems = async (client, orderId) => {
      const oRes = await client.query(
        `SELECT id, order_number, cart_id, payment_intent_id, status, order_status, payment_status, delivery_status, email, first_name, last_name, phone, address_line1, address_line2, city, postal_code, country, billing_address_line1, billing_address_line2, billing_city, billing_postal_code, billing_country, billing_same_as_shipping, payment_method, customer_id, is_guest, newsletter_opted_in, subtotal_cents, total_cents, COALESCE(shipping_cents,0) AS shipping_cents, COALESCE(discount_cents,0) AS discount_cents, COALESCE(coupon_discount_cents,0) AS coupon_discount_cents, coupon_code, COALESCE(bonus_points_redeemed,0) AS bonus_points_redeemed, currency, created_at, updated_at FROM store_orders WHERE id = $1`,
        [orderId]
      )
      const oRow = oRes.rows && oRes.rows[0]
      if (!oRow) return null

      const itemsRes = await client.query(
        `SELECT oi.id, oi.variant_id, oi.product_id, oi.quantity, oi.unit_price_cents, oi.title, oi.thumbnail, oi.product_handle,
         COALESCE(p1.title, p2.title) AS product_title,
         COALESCE(p1.metadata, p2.metadata) AS product_metadata
         FROM store_order_items oi
         LEFT JOIN admin_hub_products p1 ON p1.id::text = oi.product_id
         LEFT JOIN admin_hub_products p2 ON p1.id IS NULL AND p2.handle = oi.product_handle
         WHERE oi.order_id = $1 ORDER BY oi.created_at`,
        [orderId]
      )
      const items = (itemsRes.rows || []).map((r) => {
        let pm = r.product_metadata
        if (pm != null && typeof pm === 'string') { try { pm = JSON.parse(pm) } catch (_) { pm = null } }
        return {
          id: r.id,
          variant_id: r.variant_id,
          product_id: r.product_id,
          quantity: r.quantity,
          unit_price_cents: r.unit_price_cents,
          title: r.title,
          thumbnail: r.thumbnail,
          product_handle: r.product_handle,
          product_title: r.product_title || null,
          product_metadata: pm && typeof pm === 'object' ? pm : null,
        }
      })

      return {
        id: oRow.id,
        order_number: oRow.order_number ? Number(oRow.order_number) : null,
        cart_id: oRow.cart_id,
        payment_intent_id: oRow.payment_intent_id,
        payment_method: oRow.payment_method,
        billing_address_line1: oRow.billing_address_line1,
        billing_address_line2: oRow.billing_address_line2,
        billing_city: oRow.billing_city,
        billing_postal_code: oRow.billing_postal_code,
        billing_country: oRow.billing_country,
        billing_same_as_shipping: oRow.billing_same_as_shipping !== false,
        customer_id: oRow.customer_id,
        is_guest: oRow.is_guest !== false,
        newsletter_opted_in: oRow.newsletter_opted_in === true,
        status: oRow.status,
        order_status: oRow.order_status,
        payment_status: oRow.payment_status,
        delivery_status: oRow.delivery_status,
        email: oRow.email,
        first_name: oRow.first_name,
        last_name: oRow.last_name,
        phone: oRow.phone,
        address_line1: oRow.address_line1,
        address_line2: oRow.address_line2,
        city: oRow.city,
        postal_code: oRow.postal_code,
        country: oRow.country,
        subtotal_cents: oRow.subtotal_cents,
        shipping_cents: Number(oRow.shipping_cents || 0),
        discount_cents: Number(oRow.discount_cents || 0),
        coupon_discount_cents: Number(oRow.coupon_discount_cents || 0),
        coupon_code: oRow.coupon_code || null,
        bonus_points_redeemed: Number(oRow.bonus_points_redeemed || 0),
        total_cents: resolveOrderPaidTotalCents(oRow),
        currency: oRow.currency,
        created_at: oRow.created_at,
        updated_at: oRow.updated_at,
        items,
      }
    }

    // ── Customer Auth Helpers ─────────────────────────────────────────────
    const _crypto = require('crypto')
    const _rawCustomerSecret = process.env.CUSTOMER_JWT_SECRET || process.env.JWT_SECRET || ''
    if (!_rawCustomerSecret && _isProduction) {
      console.error('[SECURITY] CUSTOMER_JWT_SECRET env var is not set in production! Server cannot start safely.')
      process.exit(1)
    }
    const CUSTOMER_JWT_SECRET = _rawCustomerSecret || 'dev-only-customer-secret-do-not-use-in-prod'
    // Token lifetime: 7 days (same as seller tokens)
    const CUSTOMER_TOKEN_TTL_SECONDS = 7 * 24 * 3600

    function hashPassword(password) {
      const salt = _crypto.randomBytes(16).toString('hex')
      const hash = _crypto.scryptSync(password, salt, 64).toString('hex')
      return `${salt}:${hash}`
    }

    function verifyPassword(password, stored) {
      try {
        const [salt, hash] = stored.split(':')
        if (!salt || !hash) return false
        const attempt = _crypto.scryptSync(password, salt, 64).toString('hex')
        return attempt === hash
      } catch { return false }
    }

    function signCustomerToken(payload) {
      const header = Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url')
      const body = Buffer.from(JSON.stringify({ ...payload, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + CUSTOMER_TOKEN_TTL_SECONDS })).toString('base64url')
      const sig = _crypto.createHmac('sha256', CUSTOMER_JWT_SECRET).update(`${header}.${body}`).digest('base64url')
      return `${header}.${body}.${sig}`
    }

    function verifyCustomerToken(token) {
      if (!token) return null
      try {
        const parts = token.split('.')
        if (parts.length !== 3) return null
        const [header, body, sig] = parts
        const expected = _crypto.createHmac('sha256', CUSTOMER_JWT_SECRET).update(`${header}.${body}`).digest('base64url')
        if (sig !== expected) return null
        const payload = JSON.parse(Buffer.from(body, 'base64url').toString())
        if (payload.exp && Math.floor(Date.now() / 1000) > payload.exp) return null
        return payload
      } catch { return null }
    }

    const _CUSTOMER_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    function customerIdForPg(payload) {
      if (!payload?.id) return null
      const raw = String(payload.id).trim()
      return _CUSTOMER_UUID_RE.test(raw) ? raw : null
    }

    // POST /store/customers — register customer
    const CustomerRegisterSchema = z.object({
      email:      zEmail,
      password:   zPassword,
      first_name: z.string().max(60).optional(),
      last_name:  z.string().max(60).optional(),
      phone:      z.string().max(30).optional(),
    })
    const storeCustomerRegisterPOST = async (req, res) => {
      const parsed = validate(CustomerRegisterSchema, req.body || {}, res)
      if (!parsed) return
      const body = parsed
      const email = body.email.trim().toLowerCase()
      const password = body.password
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      if (!dbUrl) return res.status(503).json({ message: 'Database not configured' })
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        const existing = await client.query(
          'SELECT id, password_hash FROM store_customers WHERE LOWER(TRIM(email)) = LOWER(TRIM($1))',
          [email],
        )
        const rows = existing.rows || []
        // Any row with a password = registered account (handles duplicate email rows from pre-normalization)
        if (rows.some((r) => r.password_hash)) {
          await client.end()
          return res.status(409).json({ message: 'An account with this email already exists' })
        }
        // Multiple guest-only rows (e.g. same email different casing) — remove and insert one clean row
        if (rows.length > 1) {
          await client.query('DELETE FROM store_customers WHERE LOWER(TRIM(email)) = LOWER(TRIM($1))', [email])
        }
        const existingRow = rows.length === 1 ? rows[0] : null
        const password_hash = hashPassword(password)
        const first_name = (body.first_name || '').trim() || null
        const last_name = (body.last_name || '').trim() || null
        const phone = (body.phone || '').trim() || null
        const account_type = ['privat', 'gewerbe'].includes(body.account_type) ? body.account_type : 'privat'
        const gender = (body.gender || '').trim() || null
        const birth_date = (body.birth_date || '').trim() || null
        const address_line1 = (body.address_line1 || '').trim() || null
        const address_line2 = (body.address_line2 || '').trim() || null
        const zip_code = (body.zip_code || '').trim() || null
        const city = (body.city || '').trim() || null
        const country = (body.country || '').trim() || null
        const company_name = (body.company_name || '').trim() || null
        const vat_number = (body.vat_number || '').trim() || null
        let r
        if (existingRow) {
          // Guest entry exists — upgrade to registered account
          r = await client.query(
            `UPDATE store_customers SET password_hash=$1, first_name=$2, last_name=$3, phone=$4, account_type=$5,
             gender=$6, birth_date=$7::date, address_line1=$8, address_line2=$9, zip_code=$10, city=$11,
             country=$12, company_name=$13, vat_number=$14,
             bonus_points = COALESCE(bonus_points, 0) + ${BONUS_SIGNUP_POINTS}, updated_at=NOW()
             WHERE id=$15
             RETURNING id, customer_number, email, first_name, last_name, phone, account_type, company_name, created_at`,
            [password_hash, first_name, last_name, phone, account_type, gender, birth_date || null,
             address_line1, address_line2, zip_code, city, country, company_name, vat_number, existingRow.id]
          )
        }
        // UPDATE 0 rows (satır silinmiş / yarış) → INSERT; misafir yokken de INSERT
        if (!existingRow || !r.rows[0]) {
          r = await client.query(
            `INSERT INTO store_customers (email, password_hash, first_name, last_name, phone, account_type, gender, birth_date, address_line1, address_line2, zip_code, city, country, company_name, vat_number, bonus_points)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8::date,$9,$10,$11,$12,$13,$14,$15,$16)
             RETURNING id, customer_number, email, first_name, last_name, phone, account_type, company_name, created_at`,
            [email, password_hash, first_name, last_name, phone, account_type, gender, birth_date || null, address_line1, address_line2, zip_code, city, country, company_name, vat_number, BONUS_SIGNUP_POINTS]
          )
        }
        const customer = { ...r.rows[0], customer_number: r.rows[0].customer_number ? Number(r.rows[0].customer_number) : null }
        const cid = r.rows[0].id
        try {
          await appendBonusLedger(client, {
            customerId: cid,
            pointsDelta: BONUS_SIGNUP_POINTS,
            description: `Registrierung — Willkommensbonus (+${BONUS_SIGNUP_POINTS} Punkte)`,
            source: 'registration',
            skipBalanceUpdate: true,
          })
        } catch (le) {
          console.warn('bonus ledger registration:', le?.message || le)
        }
        await client.end()
        res.status(201).json({ customer })
      } catch (e) {
        if (client) try { await client.end() } catch (_) {}
        if (e.code === '23505') return res.status(409).json({ message: 'An account with this email already exists' })
        res.status(500).json({ message: e?.message || 'Registration failed' })
      }
    }

    // PATCH /store/customers/me — update own profile/address
    const storeCustomerMePATCH = async (req, res) => {
      const authHeader = req.headers.authorization || ''
      const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
      const payload = verifyCustomerToken(token)
      if (!payload) return res.status(401).json({ message: 'Unauthorized' })
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      const body = req.body || {}
      const allowed = ['first_name','last_name','phone','account_type','address_line1','address_line2','zip_code','city','country','company_name','vat_number']
      const sets = []
      const vals = []
      for (const key of allowed) {
        if (key in body) { vals.push(body[key] || null); sets.push(`${key} = $${vals.length}`) }
      }
      if (!sets.length) return res.status(400).json({ message: 'Nothing to update' })
      vals.push(payload.id)
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        const r = await client.query(
          `UPDATE store_customers SET ${sets.join(', ')}, updated_at=NOW() WHERE id=$${vals.length}::uuid
           RETURNING id, customer_number, email, first_name, last_name, phone, account_type, gender, birth_date, address_line1, address_line2, zip_code, city, country, company_name, vat_number, COALESCE(bonus_points,0) AS bonus_points, created_at`,
          vals
        )
        await client.end()
        const row = r.rows[0]
        if (!row) return res.status(404).json({ message: 'Customer not found' })
        res.json({
          customer: {
            ...row,
            customer_number: row.customer_number ? Number(row.customer_number) : null,
            bonus_points: Number(row.bonus_points || 0),
          },
        })
      } catch (e) {
        if (client) try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Update failed' })
      }
    }

    // DELETE /store/customers/me — self-service account deletion (GDPR); requires password if account has one
    const storeCustomerMeDELETE = async (req, res) => {
      const authHeader = req.headers.authorization || ''
      const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
      const payload = verifyCustomerToken(token)
      if (!payload) return res.status(401).json({ message: 'Unauthorized' })
      const body = req.body || {}
      const password = (body.password ?? '').toString()
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        const found = await client.query(
          'SELECT id, password_hash FROM store_customers WHERE id = $1::uuid',
          [payload.id],
        )
        const row = found.rows[0]
        if (!row) {
          await client.end()
          return res.status(404).json({ message: 'Customer not found' })
        }
        if (row.password_hash) {
          if (!password.trim()) {
            await client.end()
            return res.status(400).json({ message: 'Password required to delete your account' })
          }
          if (!verifyPassword(password, row.password_hash)) {
            await client.end()
            return res.status(401).json({ message: 'Invalid password' })
          }
        } else {
          if (body.confirm !== true) {
            await client.end()
            return res.status(400).json({ message: 'Set confirm: true to delete this account' })
          }
        }
        await client.query('DELETE FROM store_customers WHERE id = $1::uuid', [payload.id])
        await client.end()
        res.json({ success: true })
      } catch (e) {
        if (client) try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Could not delete account' })
      }
    }

    // POST /store/auth/token — login customer
    const storeAuthTokenPOST = async (req, res) => {
      const body = req.body || {}
      const email = (body.email || '').trim().toLowerCase()
      const password = (body.password || '').toString()
      if (!email || !password) return res.status(400).json({ message: 'Email and password are required' })
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        const r = await client.query('SELECT * FROM store_customers WHERE email = $1', [email])
        await client.end()
        const row = r.rows[0]
        if (!row || !row.password_hash) return res.status(401).json({ message: 'Invalid email or password' })
        if (!verifyPassword(password, row.password_hash)) return res.status(401).json({ message: 'Invalid email or password' })
        const token = signCustomerToken({
          id: row.id,
          email: row.email,
          role: 'customer',
          first_name: row.first_name || null,
          last_name: row.last_name || null,
          customer_number: row.customer_number != null ? Number(row.customer_number) : null,
        })
        const customer = { id: row.id, customer_number: row.customer_number ? Number(row.customer_number) : null, email: row.email, first_name: row.first_name, last_name: row.last_name, phone: row.phone, account_type: row.account_type, company_name: row.company_name }
        res.json({ customer, token, access_token: token })
      } catch (e) {
        if (client) try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Login failed' })
      }
    }

    // GET /store/customers/me — current customer by JWT
    const storeCustomersMeGET = async (req, res) => {
      const authHeader = req.headers.authorization || ''
      const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
      const payload = verifyCustomerToken(token)
      if (!payload) return res.status(401).json({ message: 'Unauthorized' })
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        const r = await client.query(
          'SELECT id, customer_number, email, first_name, last_name, phone, account_type, gender, birth_date, address_line1, address_line2, zip_code, city, country, company_name, vat_number, COALESCE(bonus_points,0) AS bonus_points, created_at FROM store_customers WHERE id = $1',
          [payload.id]
        )
        const row = r.rows[0]
        if (!row) {
          await client.end()
          return res.status(404).json({ message: 'Customer not found' })
        }
        let addresses = []
        let wishlist_product_ids = []
        try {
          const ar = await client.query(
            `SELECT id, label, address_line1, address_line2, zip_code, city, country, is_default_shipping, is_default_billing, created_at
             FROM store_customer_addresses WHERE customer_id = $1::uuid ORDER BY created_at ASC`,
            [payload.id],
          )
          addresses = ar.rows || []
        } catch (_) {}
        try {
          const wr = await client.query(
            'SELECT product_id FROM store_customer_wishlist WHERE customer_id = $1::uuid ORDER BY created_at DESC',
            [payload.id],
          )
          wishlist_product_ids = (wr.rows || []).map((x) => x.product_id)
        } catch (_) {}
        let bonus_ledger = []
        try {
          const lr = await client.query(
            `SELECT id, occurred_at, points_delta, description, source, order_id, created_at
             FROM store_customer_bonus_ledger
             WHERE customer_id = $1::uuid
             ORDER BY occurred_at DESC NULLS LAST, id DESC
             LIMIT 200`,
            [payload.id],
          )
          bonus_ledger = (lr.rows || []).map((e) => ({
            ...e,
            description: stripLegacyBonusLedgerVersandSuffix(e.description),
          }))
        } catch (_) {}
        await client.end()
        res.json({
          customer: {
            ...row,
            customer_number: row.customer_number ? Number(row.customer_number) : null,
            bonus_points: Number(row.bonus_points || 0),
            bonus_ledger,
            addresses,
            wishlist_product_ids,
          },
        })
      } catch (e) {
        if (client) try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    // GET /store/reviews?product_id=... or ?product_ids=id1,id2 (same EAN / multi-seller PDP)
    const storeReviewsGET = async (req, res) => {
      const productId = (req.query.product_id || '').trim()
      const idsRaw = (req.query.product_ids || '').toString().trim()
      const productIds = idsRaw ? idsRaw.split(',').map((s) => s.trim()).filter(Boolean) : []
      if (!productId && !productIds.length) return res.json({ reviews: [] })
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        let r
        if (productIds.length > 0) {
          r = await client.query(
            `SELECT r.id, r.product_id, r.rating, r.comment, r.customer_name, r.created_at, r.seller_id,
                    COALESCE(c.first_name, '') as first_name, COALESCE(c.last_name, '') as last_name
             FROM store_product_reviews r
             LEFT JOIN store_customers c ON c.id = r.customer_id
             WHERE r.product_id = ANY($1::text[])
             ORDER BY r.created_at DESC`,
            [productIds]
          )
        } else {
          r = await client.query(
            `SELECT r.id, r.product_id, r.rating, r.comment, r.customer_name, r.created_at, r.seller_id,
                    COALESCE(c.first_name, '') as first_name, COALESCE(c.last_name, '') as last_name
             FROM store_product_reviews r
             LEFT JOIN store_customers c ON c.id = r.customer_id
             WHERE r.product_id = $1
             ORDER BY r.created_at DESC`,
            [productId]
          )
        }
        await client.end()
        res.json({ reviews: r.rows || [] })
      } catch (e) {
        if (client) try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    // POST /store/reviews — submit a product review (auth required)
    const storeReviewsPOST = async (req, res) => {
      const authHeader = req.headers.authorization || ''
      const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
      if (!token) return res.status(401).json({ message: 'Unauthorized' })
      const payload = verifyCustomerToken(token)
      if (!payload?.id) return res.status(401).json({ message: 'Invalid token' })
      const { order_id, product_id, rating, comment } = req.body || {}
      if (!product_id) return res.status(400).json({ message: 'product_id required' })
      if (!order_id) return res.status(400).json({ message: 'order_id required' })
      const ratingNum = Number(rating)
      if (!ratingNum || ratingNum < 1 || ratingNum > 5) return res.status(400).json({ message: 'rating must be 1-5' })
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        const orderCheck = await client.query(
          `SELECT id, seller_id FROM store_orders WHERE id = $1::uuid AND (customer_id = $2::uuid OR email = (SELECT email FROM store_customers WHERE id = $2::uuid))`,
          [order_id, payload.id]
        )
        if (!orderCheck.rows[0]) {
          await client.end()
          return res.status(403).json({ message: 'Order not found or access denied' })
        }
        const custR = await client.query('SELECT first_name, last_name FROM store_customers WHERE id = $1', [payload.id])
        const cust = custR.rows[0]
        const customer_name = cust ? [cust.first_name, cust.last_name].filter(Boolean).join(' ') || null : null
        const pid = String(product_id || '').trim()
        const orderSellerId =
          orderCheck.rows && orderCheck.rows[0] && orderCheck.rows[0].seller_id != null && String(orderCheck.rows[0].seller_id).trim() !== ''
            ? String(orderCheck.rows[0].seller_id).trim()
            : null
        const pr = await client.query('SELECT seller_id FROM admin_hub_products WHERE id::text = $1 LIMIT 1', [pid])
        const productSellerId =
          pr.rows && pr.rows[0] && pr.rows[0].seller_id != null && String(pr.rows[0].seller_id).trim() !== ''
            ? String(pr.rows[0].seller_id).trim()
            : null
        // Prefer seller from order (multi-offer / buybox flow); fallback to product row owner.
        const sellerIdForReview = orderSellerId || productSellerId || null
        const r = await client.query(
          `INSERT INTO store_product_reviews (order_id, product_id, customer_id, rating, comment, customer_name, seller_id)
           VALUES ($1::uuid, $2, $3::uuid, $4, $5, $6, $7)
           ON CONFLICT (order_id, product_id) DO UPDATE SET rating=$4, comment=$5, customer_name=$6, seller_id=$7, updated_at=now()
           RETURNING *`,
          [order_id, product_id, payload.id, ratingNum, comment?.trim() || null, customer_name, sellerIdForReview]
        )
        const statsR = await client.query(
          `SELECT COUNT(*)::int as cnt, ROUND(AVG(rating)::numeric, 2)::float as avg FROM store_product_reviews WHERE product_id = $1`,
          [product_id]
        )
        const stats = statsR.rows[0]
        await client.query(
          `UPDATE admin_hub_products SET metadata = COALESCE(metadata, '{}'::jsonb) || $1::jsonb WHERE id::text = $2`,
          [JSON.stringify({ review_count: stats.cnt, review_avg: parseFloat(stats.avg || 0) }), product_id]
        ).catch(() => {})
        if (sellerIdForReview) {
          const aggR = await client.query(
            `SELECT ROUND(AVG(rating)::numeric, 2)::float as avg, COUNT(*)::int as cnt FROM store_product_reviews WHERE seller_id = $1`,
            [sellerIdForReview]
          )
          const ar = aggR.rows && aggR.rows[0]
          const savg = ar && ar.avg != null ? parseFloat(ar.avg) : 0
          const scnt = ar && ar.cnt != null ? Number(ar.cnt) : 0
          await client.query(
            `INSERT INTO admin_hub_seller_settings (seller_id, review_avg, review_count, updated_at)
             VALUES ($1, $2, $3, now())
             ON CONFLICT (seller_id) DO UPDATE SET
               review_avg = EXCLUDED.review_avg,
               review_count = EXCLUDED.review_count,
               updated_at = now()`,
            [sellerIdForReview, scnt > 0 ? savg : null, scnt]
          ).catch(() => {})
        }
        await client.end()
        res.json({ review: r.rows[0] })
      } catch (e) {
        if (client) try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    // --- Shipping Groups CRUD ---
    const adminHubShippingGroupsGET = async (req, res) => {
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        const isSuperuser = req.sellerUser?.is_superuser || false
        const callerSellerId = req.sellerUser?.seller_id
        let groups
        if (!isSuperuser && callerSellerId) {
          groups = await client.query(
            `
          SELECT g.*, c.name AS carrier_name
          FROM store_shipping_groups g
          LEFT JOIN store_shipping_carriers c ON c.id = g.carrier_id
          WHERE g.seller_id = $1
          ORDER BY g.created_at ASC
        `,
            [String(callerSellerId).trim()]
          )
        } else {
          groups = await client.query(`
          SELECT g.*, c.name AS carrier_name
          FROM store_shipping_groups g
          LEFT JOIN store_shipping_carriers c ON c.id = g.carrier_id
          ORDER BY g.created_at ASC
        `)
        }
        const prices = await client.query('SELECT * FROM store_shipping_prices ORDER BY country_code')
        await client.end()
        const pricesByGroup = {}
        for (const p of (prices.rows || [])) {
          if (!pricesByGroup[p.group_id]) pricesByGroup[p.group_id] = []
          const cc = normalizeHubCountryCode(p.country_code)
          if (!cc) continue
          pricesByGroup[p.group_id].push({ ...p, country_code: cc })
        }
        const result = (groups.rows || []).map(g => ({ ...g, prices: pricesByGroup[g.id] || [] }))
        res.json({ groups: result })
      } catch (e) {
        if (client) try { await client.end() } catch (_) {}
        res.json({ groups: [] })
      }
    }

    const adminHubShippingGroupPOST = async (req, res) => {
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      const { name, carrier_id, prices } = req.body || {}
      if (!name) return res.status(400).json({ message: 'name required' })
      const callerSellerId = req.sellerUser?.seller_id || null
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        const r = await client.query(
          `INSERT INTO store_shipping_groups (name, carrier_id, seller_id) VALUES ($1, $2, $3) RETURNING *`,
          [name.trim(), carrier_id || null, callerSellerId]
        )
        const group = r.rows[0]
        if (Array.isArray(prices) && prices.length > 0) {
          for (const p of prices) {
            const cc = normalizeHubCountryCode(p.country_code)
            if (!cc) continue
            await client.query(
              `INSERT INTO store_shipping_prices (group_id, country_code, price_cents) VALUES ($1,$2,$3)
               ON CONFLICT (group_id, country_code) DO UPDATE SET price_cents=$3`,
              [group.id, cc, Math.round(Number(p.price_cents) || 0)]
            )
          }
        }
        await client.end()
        res.status(201).json({ group })
      } catch (e) {
        if (client) try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    const adminHubShippingGroupPATCH = async (req, res) => {
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      const id = (req.params.id || '').trim()
      const { name, carrier_id, prices } = req.body || {}
      const isSuperuser = req.sellerUser?.is_superuser || false
      const callerSellerId = req.sellerUser?.seller_id
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        // Ownership check for non-superusers
        if (!isSuperuser) {
          const own = await client.query(`SELECT id FROM store_shipping_groups WHERE id=$1::uuid AND seller_id=$2`, [id, callerSellerId])
          if (!own.rows.length) { await client.end(); return res.status(403).json({ message: 'Nicht erlaubt' }) }
        }
        if (name !== undefined || carrier_id !== undefined) {
          const sets = []; const vals = []
          if (name !== undefined) { vals.push(name.trim()); sets.push(`name=$${vals.length}`) }
          if (carrier_id !== undefined) { vals.push(carrier_id || null); sets.push(`carrier_id=$${vals.length}`) }
          sets.push(`updated_at=now()`)
          vals.push(id)
          await client.query(`UPDATE store_shipping_groups SET ${sets.join(',')} WHERE id=$${vals.length}::uuid`, vals)
        }
        if (Array.isArray(prices)) {
          for (const p of prices) {
            const cc = normalizeHubCountryCode(p.country_code)
            if (!cc) continue
            await client.query(
              `INSERT INTO store_shipping_prices (group_id, country_code, price_cents) VALUES ($1,$2,$3)
               ON CONFLICT (group_id, country_code) DO UPDATE SET price_cents=$3`,
              [id, cc, Math.round(Number(p.price_cents) || 0)]
            )
          }
        }
        const r = await client.query(`SELECT g.*, c.name AS carrier_name FROM store_shipping_groups g LEFT JOIN store_shipping_carriers c ON c.id=g.carrier_id WHERE g.id=$1::uuid`, [id])
        const pr = await client.query('SELECT * FROM store_shipping_prices WHERE group_id=$1 ORDER BY country_code', [id])
        await client.end()
        const normPrices = (pr.rows || [])
          .map((row) => {
            const cc = normalizeHubCountryCode(row.country_code)
            return cc ? { ...row, country_code: cc } : null
          })
          .filter(Boolean)
        const group = r.rows[0] ? { ...r.rows[0], prices: normPrices } : null
        res.json({ group })
      } catch (e) {
        if (client) try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    const adminHubShippingGroupDELETE = async (req, res) => {
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      const id = (req.params.id || '').trim()
      const isSuperuser = req.sellerUser?.is_superuser || false
      const callerSellerId = req.sellerUser?.seller_id
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        if (!isSuperuser) {
          const own = await client.query(`SELECT id FROM store_shipping_groups WHERE id=$1::uuid AND seller_id=$2`, [id, callerSellerId])
          if (!own.rows.length) { await client.end(); return res.status(403).json({ message: 'Nicht erlaubt' }) }
        }
        await client.query('DELETE FROM store_shipping_groups WHERE id=$1::uuid', [id])
        await client.end()
        res.json({ success: true })
      } catch (e) {
        if (client) try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    // GET /store/shipping-groups — public, for shop to show prices
    const storeShippingGroupsGET = async (req, res) => {
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        const groups = await client.query('SELECT id, name FROM store_shipping_groups ORDER BY created_at ASC')
        const prices = await client.query('SELECT group_id, country_code, price_cents FROM store_shipping_prices')
        await client.end()
        const pricesByGroup = {}
        for (const p of (prices.rows || [])) {
          if (!pricesByGroup[p.group_id]) pricesByGroup[p.group_id] = {}
          const cc = normalizeHubCountryCode(p.country_code)
          if (!cc) continue
          pricesByGroup[p.group_id][cc] = Number(p.price_cents)
        }
        const result = (groups.rows || []).map(g => ({ id: g.id, name: g.name, prices: pricesByGroup[g.id] || {} }))
        res.json({ groups: result })
      } catch (e) {
        if (client) try { await client.end() } catch (_) {}
        res.json({ groups: [] })
      }
    }

    // GET /store/orders/:id/invoice — customer downloads their own invoice as PDF
    const storeOrderInvoicePdfGET = async (req, res) => {
      const orderId = (req.params.id || '').trim()
      if (!orderId) return res.status(400).json({ message: 'id required' })
      const authHeader = req.headers.authorization || ''
      const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
      if (!token) return res.status(401).json({ message: 'Unauthorized' })
      const payload = verifyCustomerToken(token)
      if (!payload?.email) return res.status(401).json({ message: 'Invalid token' })
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      let client
      try {
        const PDFDocument = require('pdfkit')
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        // Verify order belongs to this customer
        const oRes = await client.query(
          `SELECT * FROM store_orders WHERE id = $1::uuid
            AND (LOWER(TRIM(email)) = LOWER(TRIM($2)) OR (customer_id IS NOT NULL AND customer_id = $3::uuid))`,
          [orderId, payload.email, payload.id]
        )
        const row = oRes.rows && oRes.rows[0]
        if (!row) { await client.end(); return res.status(404).json({ message: 'Order not found' }) }
        const iRes = await client.query('SELECT * FROM store_order_items WHERE order_id = $1 ORDER BY created_at', [orderId])
        const itemRows = iRes.rows || []
        await client.end(); client = null
        const on = row.order_number != null ? String(row.order_number) : String(orderId).slice(0, 8)
        const shopName = process.env.SHOP_INVOICE_NAME || 'Andertal'
        res.setHeader('Content-Type', 'application/pdf')
        res.setHeader('Content-Disposition', `attachment; filename="Rechnung-${on}.pdf"`)
        const doc = new PDFDocument({ margin: 42, size: 'A4', compress: false, pdfVersion: '1.7' })
        doc.pipe(res)
        renderInvoicePdfDocument(doc, {
          row,
          itemRows,
          orderId,
          invoiceNumber: on,
          shopName,
        })
        doc.end()
      } catch (e) {
        if (client) try { await client.end() } catch (_) {}
        if (!res.headersSent) res.status(500).json({ message: e?.message || 'PDF error' })
      }
    }

    const storeReturnPdfLatin = (s) => {
      if (s == null || s === undefined) return ''
      return String(s)
        .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue')
        .replace(/Ä/g, 'Ae').replace(/Ö/g, 'Oe').replace(/Ü/g, 'Ue')
        .replace(/ß/g, 'ss')
    }
    const storeReturnPdfFmtDate = (d) => {
      if (!d) return '—'
      try {
        return new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
      } catch (_) {
        return '—'
      }
    }

    /** Approved return only — customer Retourenschein PDF */
    const storeOrderReturnRetourenscheinGET = async (req, res) => {
      const orderId = (req.params.id || '').trim()
      if (!orderId) return res.status(400).json({ message: 'id required' })
      const authHeader = req.headers.authorization || ''
      const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
      if (!token) return res.status(401).json({ message: 'Unauthorized' })
      const payload = verifyCustomerToken(token)
      if (!payload?.email) return res.status(401).json({ message: 'Invalid token' })
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      let client
      try {
        const PDFDocument = require('pdfkit')
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        const oRes = await client.query(
          `SELECT * FROM store_orders WHERE id = $1::uuid
            AND (LOWER(TRIM(email)) = LOWER(TRIM($2)) OR (customer_id IS NOT NULL AND customer_id = $3::uuid))`,
          [orderId, payload.email, payload.id],
        )
        if (!oRes.rows?.[0]) { await client.end(); return res.status(404).json({ message: 'Order not found' }) }
        const row = oRes.rows[0]
        const rRes = await client.query(
          `SELECT * FROM store_returns WHERE order_id = $1::uuid AND status = 'genehmigt' ORDER BY created_at DESC LIMIT 1`,
          [orderId],
        )
        const ret = rRes.rows?.[0]
        if (!ret) { await client.end(); return res.status(404).json({ message: 'Keine genehmigte Retoure' }) }
        await client.end()
        client = null
        const rn = ret.return_number != null ? `R-${ret.return_number}` : 'R-—'
        const on = row.order_number != null ? String(row.order_number) : String(orderId).slice(0, 8)
        res.setHeader('Content-Type', 'application/pdf')
        res.setHeader('Content-Disposition', `attachment; filename="Retourenschein-${on}.pdf"`)
        const doc = new PDFDocument({ margin: 48, size: 'A4' })
        doc.pipe(res)
        doc.fontSize(20).fillColor('#111').text('Retourenschein', { align: 'center' })
        doc.moveDown(0.8)
        doc.fontSize(11).fillColor('#374151').text(`Retoure-Nr.: ${rn}   ·   Bestellung: #${on}`, { align: 'center' })
        doc.moveDown(1.2)
        doc.fontSize(10).font('Helvetica-Bold').text('Retoure-Nummer (gut sichtbar aufs Paket kleben)')
        doc.moveDown(0.4)
        const boxTop = doc.y
        doc.lineWidth(2).rect(72, boxTop, 450, 72).stroke('#111827')
        doc.fontSize(30).font('Helvetica-Bold').text(rn, 72, boxTop + 16, { width: 450, align: 'center' })
        doc.y = boxTop + 88
        doc.moveDown(0.5)
        doc.font('Helvetica').fontSize(10)
        doc.text(`Erstellt am: ${storeReturnPdfFmtDate(ret.created_at)}`)
        if (ret.approved_at) doc.text(`Genehmigt am: ${storeReturnPdfFmtDate(ret.approved_at)}`)
        doc.moveDown(0.6)
        doc.font('Helvetica-Bold').text('Rückgabegrund')
        doc.font('Helvetica').text(storeReturnPdfLatin(ret.reason || '—'))
        if (ret.notes) {
          doc.moveDown(0.4)
          doc.font('Helvetica-Bold').text('Anmerkungen')
          doc.font('Helvetica').text(storeReturnPdfLatin(ret.notes))
        }
        doc.moveDown(1)
        doc.fontSize(9).fillColor('#666').text(
          'Bitte legen Sie diesen Schein dem Paket bei. Ohne sichtbare Retoure-Nummer kann die Zuordnung verzögert werden.',
          { width: 480 },
        )
        doc.end()
      } catch (e) {
        if (client) try { await client.end() } catch (_) {}
        if (!res.headersSent) res.status(500).json({ message: e?.message || 'PDF error' })
      }
    }

    /** Compact shipping label style PDF — gleiche Retoure-Nr., zum Ausschneiden/Kleben */
    const storeOrderReturnEtikettGET = async (req, res) => {
      const orderId = (req.params.id || '').trim()
      if (!orderId) return res.status(400).json({ message: 'id required' })
      const authHeader = req.headers.authorization || ''
      const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
      if (!token) return res.status(401).json({ message: 'Unauthorized' })
      const payload = verifyCustomerToken(token)
      if (!payload?.email) return res.status(401).json({ message: 'Invalid token' })
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      let client
      try {
        const PDFDocument = require('pdfkit')
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        const oRes = await client.query(
          `SELECT * FROM store_orders WHERE id = $1::uuid
            AND (LOWER(TRIM(email)) = LOWER(TRIM($2)) OR (customer_id IS NOT NULL AND customer_id = $3::uuid))`,
          [orderId, payload.email, payload.id],
        )
        if (!oRes.rows?.[0]) { await client.end(); return res.status(404).json({ message: 'Order not found' }) }
        const row = oRes.rows[0]
        const rRes = await client.query(
          `SELECT * FROM store_returns WHERE order_id = $1::uuid AND status = 'genehmigt' ORDER BY created_at DESC LIMIT 1`,
          [orderId],
        )
        const ret = rRes.rows?.[0]
        if (!ret) { await client.end(); return res.status(404).json({ message: 'Keine genehmigte Retoure' }) }
        await client.end()
        client = null
        const rn = ret.return_number != null ? `R-${ret.return_number}` : 'R-—'
        const on = row.order_number != null ? String(row.order_number) : String(orderId).slice(0, 8)
        const cust = [row.first_name, row.last_name].filter(Boolean).join(' ')
        res.setHeader('Content-Type', 'application/pdf')
        res.setHeader('Content-Disposition', `attachment; filename="Ruecksende-Etikett-${on}.pdf"`)
        const doc = new PDFDocument({ margin: 24, size: [288, 432] })
        doc.pipe(res)
        doc.fontSize(9).fillColor('#666').text('Rücksendung', { align: 'center' })
        doc.moveDown(0.2)
        doc.fontSize(22).font('Helvetica-Bold').fillColor('#111').text(rn, { align: 'center' })
        doc.moveDown(0.3)
        doc.font('Helvetica').fontSize(9).fillColor('#374151').text(`Bestellung #${on}`, { align: 'center' })
        if (cust) doc.text(storeReturnPdfLatin(cust), { align: 'center' })
        doc.text(storeReturnPdfLatin([row.address_line1, [row.postal_code, row.city].filter(Boolean).join(' ')].filter(Boolean).join(', ') || '—'), { align: 'center', width: 240 })
        doc.moveDown(0.5)
        doc.fontSize(7).fillColor('#9ca3af').text('Bitte gut sichtbar auf dem Paket anbringen.', { align: 'center', width: 240 })
        doc.end()
      } catch (e) {
        if (client) try { await client.end() } catch (_) {}
        if (!res.headersSent) res.status(500).json({ message: e?.message || 'PDF error' })
      }
    }

    // GET /store/reviews/my — customer's own reviews
    const storeReviewsMyGET = async (req, res) => {
      const authHeader = req.headers.authorization || ''
      const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
      if (!token) return res.status(401).json({ message: 'Unauthorized' })
      const payload = verifyCustomerToken(token)
      if (!payload?.id) return res.status(401).json({ message: 'Invalid token' })
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        const r = await client.query(
          `SELECT id, order_id, product_id, rating, comment, created_at FROM store_product_reviews WHERE customer_id = $1::uuid ORDER BY created_at DESC`,
          [payload.id]
        )
        await client.end()
        res.json({ reviews: r.rows || [] })
      } catch (e) {
        if (client) try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    // GET /admin-hub/reviews — all reviews for seller central
    const adminHubReviewsGET = async (req, res) => {
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        const isSuperuser = req.sellerUser?.is_superuser || false
        const sellerSellerId = req.sellerUser?.seller_id
        let sellerFilter = ''
        const params = []
        if (!isSuperuser && sellerSellerId) {
          params.push(sellerSellerId)
          sellerFilter = `WHERE p.seller_id = $${params.length}`
        }
        const r = await client.query(
          `SELECT r.id, r.order_id, r.product_id, r.rating, r.comment, r.customer_name, r.created_at,
                  r.seller_id,
                  o.order_number,
                  p.title as product_title, p.handle as product_handle, p.metadata->>'sku' as product_sku,
                  s.store_name as seller_store_name
           FROM store_product_reviews r
           LEFT JOIN store_orders o ON o.id = r.order_id
           LEFT JOIN admin_hub_products p ON p.id::text = r.product_id
           LEFT JOIN admin_hub_seller_settings s ON s.seller_id = r.seller_id
           ${sellerFilter}
           ORDER BY r.created_at DESC
           LIMIT 1000`,
          params
        )
        await client.end()
        // Aggregate stats
        const rows = r.rows || []
        const totalCount = rows.length
        const avgRating = totalCount > 0 ? rows.reduce((s, x) => s + (x.rating || 0), 0) / totalCount : null
        const dist = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 }
        for (const row of rows) dist[row.rating] = (dist[row.rating] || 0) + 1
        res.json({ reviews: rows, stats: { total: totalCount, avg: avgRating ? Math.round(avgRating * 10) / 10 : null, distribution: dist } })
      } catch (e) {
        if (client) try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    const storeWishlistGET = async (req, res) => {
      const authHeader = req.headers.authorization || ''
      const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
      const payload = verifyCustomerToken(token)
      if (!payload?.id) return res.status(401).json({ message: 'Unauthorized' })
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        const r = await client.query(
          'SELECT product_id, created_at FROM store_customer_wishlist WHERE customer_id = $1::uuid ORDER BY created_at DESC',
          [payload.id],
        )
        await client.end()
        res.json({ items: (r.rows || []).map((x) => ({ product_id: x.product_id, created_at: x.created_at })) })
      } catch (e) {
        if (client) try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    const storeWishlistPOST = async (req, res) => {
      const authHeader = req.headers.authorization || ''
      const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
      const payload = verifyCustomerToken(token)
      if (!payload?.id) return res.status(401).json({ message: 'Unauthorized' })
      const productId = (req.body?.product_id || req.body?.productId || '').toString().trim()
      if (!productId) return res.status(400).json({ message: 'product_id required' })
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        const ex = await client.query('SELECT id FROM admin_hub_products WHERE id = $1::uuid', [productId])
        if (!ex.rows?.[0]) {
          await client.end()
          return res.status(404).json({ message: 'Product not found' })
        }
        await client.query(
          `INSERT INTO store_customer_wishlist (customer_id, product_id) VALUES ($1::uuid, $2::uuid) ON CONFLICT (customer_id, product_id) DO NOTHING`,
          [payload.id, productId],
        )
        await client.end()
        res.status(201).json({ ok: true })
      } catch (e) {
        if (client) try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    const storeWishlistDELETE = async (req, res) => {
      const authHeader = req.headers.authorization || ''
      const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
      const payload = verifyCustomerToken(token)
      if (!payload?.id) return res.status(401).json({ message: 'Unauthorized' })
      const productId = (req.params?.productId || '').toString().trim()
      if (!productId) return res.status(400).json({ message: 'product id required' })
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        await client.query('DELETE FROM store_customer_wishlist WHERE customer_id = $1::uuid AND product_id = $2::uuid', [payload.id, productId])
        await client.end()
        res.json({ ok: true })
      } catch (e) {
        if (client) try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    const storeCustomerAddressesGET = async (req, res) => {
      const authHeader = req.headers.authorization || ''
      const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
      const payload = verifyCustomerToken(token)
      if (!payload?.id) return res.status(401).json({ message: 'Unauthorized' })
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        const r = await client.query(
          `SELECT id, label, address_line1, address_line2, zip_code, city, country, is_default_shipping, is_default_billing, created_at
           FROM store_customer_addresses WHERE customer_id = $1::uuid ORDER BY created_at ASC`,
          [payload.id],
        )
        await client.end()
        res.json({ addresses: r.rows || [] })
      } catch (e) {
        if (client) try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    const storeCustomerAddressesPOST = async (req, res) => {
      const authHeader = req.headers.authorization || ''
      const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
      const payload = verifyCustomerToken(token)
      if (!payload?.id) return res.status(401).json({ message: 'Unauthorized' })
      const b = req.body || {}
      const address_line1 = (
        b.address_line1 ??
        b.line1 ??
        b.street ??
        b.address1 ??
        b.address?.line1 ??
        b.address?.address_line1 ??
        ''
      )
        .toString()
        .trim()
      if (!address_line1) return res.status(400).json({ message: 'address_line1 required' })
      const label = (b.label || '').toString().trim() || null
      const address_line2 = (b.address_line2 || '').toString().trim() || null
      const zip_code = (b.zip_code || b.postal_code || '').toString().trim() || null
      const city = (b.city || '').toString().trim() || null
      const country = (b.country || 'DE').toString().trim() || 'DE'
      let is_default_shipping = b.is_default_shipping === true
      let is_default_billing = b.is_default_billing === true
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        const cntR = await client.query('SELECT COUNT(*)::int AS n FROM store_customer_addresses WHERE customer_id = $1::uuid', [payload.id])
        const n = Number(cntR.rows?.[0]?.n || 0)
        if (n === 0) {
          is_default_shipping = true
          is_default_billing = true
        }
        if (is_default_shipping) {
          await client.query('UPDATE store_customer_addresses SET is_default_shipping = false WHERE customer_id = $1::uuid', [payload.id])
        }
        if (is_default_billing) {
          await client.query('UPDATE store_customer_addresses SET is_default_billing = false WHERE customer_id = $1::uuid', [payload.id])
        }
        const ins = await client.query(
          `INSERT INTO store_customer_addresses (customer_id, label, address_line1, address_line2, zip_code, city, country, is_default_shipping, is_default_billing)
           VALUES ($1::uuid,$2,$3,$4,$5,$6,$7,$8,$9)
           RETURNING id, label, address_line1, address_line2, zip_code, city, country, is_default_shipping, is_default_billing, created_at`,
          [payload.id, label, address_line1, address_line2, zip_code, city, country, is_default_shipping, is_default_billing],
        )
        await client.end()
        res.status(201).json({ address: ins.rows[0] })
      } catch (e) {
        if (client) try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    const storeCustomerAddressesPATCH = async (req, res) => {
      const authHeader = req.headers.authorization || ''
      const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
      const payload = verifyCustomerToken(token)
      if (!payload?.id) return res.status(401).json({ message: 'Unauthorized' })
      const addressId = (req.params?.addressId || '').toString().trim()
      if (!addressId) return res.status(400).json({ message: 'address id required' })
      const b = req.body || {}
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        const own = await client.query(
          'SELECT id FROM store_customer_addresses WHERE id = $1::uuid AND customer_id = $2::uuid',
          [addressId, payload.id],
        )
        if (!own.rows?.[0]) {
          await client.end()
          return res.status(404).json({ message: 'Address not found' })
        }
        const sets = []
        const vals = []
        const push = (col, v) => {
          vals.push(v)
          sets.push(`${col} = $${vals.length}`)
        }
        if ('label' in b) push('label', (b.label || '').toString().trim() || null)
        if (
          'address_line1' in b ||
          'line1' in b ||
          'street' in b ||
          'address1' in b
        ) {
          const v = (
            b.address_line1 ??
            b.line1 ??
            b.street ??
            b.address1 ??
            ''
          )
            .toString()
            .trim()
          if (!v) {
            await client.end()
            return res.status(400).json({ message: 'address_line1 required' })
          }
          push('address_line1', v)
        }
        if ('address_line2' in b) push('address_line2', (b.address_line2 || '').toString().trim() || null)
        if ('zip_code' in b || 'postal_code' in b) push('zip_code', (b.zip_code || b.postal_code || '').toString().trim() || null)
        if ('city' in b) push('city', (b.city || '').toString().trim() || null)
        if ('country' in b) push('country', (b.country || '').toString().trim() || null)
        if (b.is_default_shipping === true) {
          await client.query('UPDATE store_customer_addresses SET is_default_shipping = false WHERE customer_id = $1::uuid', [payload.id])
          sets.push('is_default_shipping = true')
        } else if (b.is_default_shipping === false) {
          sets.push('is_default_shipping = false')
        }
        if (b.is_default_billing === true) {
          await client.query('UPDATE store_customer_addresses SET is_default_billing = false WHERE customer_id = $1::uuid', [payload.id])
          sets.push('is_default_billing = true')
        } else if (b.is_default_billing === false) {
          sets.push('is_default_billing = false')
        }
        if (!sets.length) {
          await client.end()
          return res.status(400).json({ message: 'Nothing to update' })
        }
        sets.push('updated_at = NOW()')
        const idPos = vals.length + 1
        const custPos = vals.length + 2
        const r = await client.query(
          `UPDATE store_customer_addresses SET ${sets.join(', ')} WHERE id = $${idPos}::uuid AND customer_id = $${custPos}::uuid
           RETURNING id, label, address_line1, address_line2, zip_code, city, country, is_default_shipping, is_default_billing, created_at, updated_at`,
          [...vals, addressId, payload.id],
        )
        await client.end()
        res.json({ address: r.rows[0] })
      } catch (e) {
        if (client) try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    const storeCustomerAddressesDELETE = async (req, res) => {
      const authHeader = req.headers.authorization || ''
      const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
      const payload = verifyCustomerToken(token)
      if (!payload?.id) return res.status(401).json({ message: 'Unauthorized' })
      const addressId = (req.params?.addressId || '').toString().trim()
      if (!addressId) return res.status(400).json({ message: 'address id required' })
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        const del = await client.query(
          'DELETE FROM store_customer_addresses WHERE id = $1::uuid AND customer_id = $2::uuid RETURNING is_default_shipping, is_default_billing',
          [addressId, payload.id],
        )
        const deleted = del.rows?.[0]
        if (!deleted) {
          await client.end()
          return res.status(404).json({ message: 'Address not found' })
        }
        if (deleted.is_default_shipping) {
          await client.query('UPDATE store_customer_addresses SET is_default_shipping = false WHERE customer_id = $1::uuid', [payload.id])
          const n = await client.query(
            'SELECT id FROM store_customer_addresses WHERE customer_id = $1::uuid ORDER BY created_at ASC LIMIT 1',
            [payload.id],
          )
          if (n.rows?.[0]?.id) {
            await client.query('UPDATE store_customer_addresses SET is_default_shipping = true WHERE id = $1::uuid', [n.rows[0].id])
          }
        }
        if (deleted.is_default_billing) {
          await client.query('UPDATE store_customer_addresses SET is_default_billing = false WHERE customer_id = $1::uuid', [payload.id])
          const n = await client.query(
            'SELECT id FROM store_customer_addresses WHERE customer_id = $1::uuid ORDER BY created_at ASC LIMIT 1',
            [payload.id],
          )
          if (n.rows?.[0]?.id) {
            await client.query('UPDATE store_customer_addresses SET is_default_billing = true WHERE id = $1::uuid', [n.rows[0].id])
          }
        }
        await client.end()
        res.json({ ok: true })
      } catch (e) {
        if (client) try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    // GET /store/orders/me — orders for authenticated customer
    const storeOrdersMeGET = async (req, res) => {
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      const authHeader = req.headers.authorization || ''
      const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
      if (!token) return res.status(401).json({ message: 'Unauthorized' })
      const payload = verifyCustomerToken(token)
      if (!payload?.email) return res.status(401).json({ message: 'Invalid token' })
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        const custId = customerIdForPg(payload)
        const custEmail = payload.email ? String(payload.email).trim() : ''
        const ordersR = await client.query(
          `SELECT id, order_number, order_status, payment_status, delivery_status,
                  stripe_transfer_status,
                  total_cents, subtotal_cents, shipping_cents, discount_cents, currency,
                  first_name, last_name, phone, email,
                  address_line1, address_line2, city, postal_code, country,
                  billing_address_line1, billing_city, billing_postal_code, billing_country, billing_same_as_shipping,
                  payment_method, tracking_number, carrier_name, shipped_at, delivery_date, notes,
                  newsletter_opted_in, created_at, updated_at
           FROM store_orders
           WHERE ($2::uuid IS NOT NULL AND customer_id = $2::uuid)
              OR (email IS NOT NULL AND TRIM(email) <> '' AND LOWER(TRIM(email)) = LOWER(TRIM($1)))
           ORDER BY created_at DESC`,
          [custEmail, custId || null]
        )
        const orderIds = (ordersR.rows || []).map(r => r.id)
        let itemsMap = {}
        if (orderIds.length > 0) {
          try {
            const itemsR = await client.query(
              `SELECT id, order_id, title, quantity, unit_price_cents, product_id, product_handle, thumbnail
               FROM store_order_items WHERE order_id = ANY($1::uuid[])`,
              [orderIds]
            )
            for (const it of (itemsR.rows || [])) {
              if (!itemsMap[it.order_id]) itemsMap[it.order_id] = []
              itemsMap[it.order_id].push(it)
            }
          } catch {
            // fallback without product_id if column not yet migrated
            const itemsR = await client.query(
              `SELECT id, order_id, title, quantity, unit_price_cents, product_handle, thumbnail
               FROM store_order_items WHERE order_id = ANY($1::uuid[])`,
              [orderIds]
            )
            for (const it of (itemsR.rows || [])) {
              if (!itemsMap[it.order_id]) itemsMap[it.order_id] = []
              itemsMap[it.order_id].push(it)
            }
          }
        }
        // Also fetch return requests
        let returnsMap = {}
        if (orderIds.length > 0) {
          try {
            const returnsR = await client.query(
              `SELECT id, order_id, status, reason, notes, return_number, refund_status, refund_amount_cents, label_sent_at, created_at FROM store_returns WHERE order_id = ANY($1::uuid[]) ORDER BY created_at DESC`,
              [orderIds]
            )
            for (const r of (returnsR.rows || [])) {
              if (!returnsMap[r.order_id]) returnsMap[r.order_id] = []
              returnsMap[r.order_id].push(r)
            }
          } catch (_) {}
        }
        const cancelTz = String(process.env.STORE_POLICY_TIMEZONE || 'Europe/Berlin').trim() || 'Europe/Berlin'
        let cancelWindowMap = {}
        if (orderIds.length > 0) {
          try {
            const cr = await client.query(
              `SELECT id,
                (
                  (NOW() <= created_at + interval '15 minutes')
                  OR (
                    (EXTRACT(HOUR FROM (created_at AT TIME ZONE $1::text)) * 60
                     + EXTRACT(MINUTE FROM (created_at AT TIME ZONE $1::text))) < (7 * 60)
                    AND NOW() < (
                      (date_trunc('day', (created_at AT TIME ZONE $1::text)::timestamp) + interval '7 hours')
                      AT TIME ZONE $1::text
                    )
                  )
                ) AS policy_cancel_ok
               FROM store_orders WHERE id = ANY($2::uuid[])`,
              [cancelTz, orderIds],
            )
            for (const x of cr.rows || []) cancelWindowMap[x.id] = x.policy_cancel_ok === true
          } catch (ce) {
            console.warn('storeOrdersMeGET cancellation window:', ce?.message || ce)
          }
        }

        await client.end()
        const blockedOs = new Set(['storniert', 'refunded', 'retoure', 'retoure_anfrage'])
        const blockedDs = new Set(['versendet', 'zugestellt', 'shipped', 'delivered'])
        const orders = (ordersR.rows || []).map(row => {
          let cancellation_allowed = !!cancelWindowMap[row.id]
          const os = String(row.order_status || '').toLowerCase()
          const ds = String(row.delivery_status || 'offen').toLowerCase()
          if (blockedOs.has(os)) cancellation_allowed = false
          if (blockedDs.has(ds)) cancellation_allowed = false
          const trk = row.tracking_number != null && String(row.tracking_number).trim() !== ''
          if (trk) cancellation_allowed = false
          const tst = String(row.stripe_transfer_status || '').toLowerCase()
          if (tst === 'completed') cancellation_allowed = false
          return {
            ...row,
            total_cents: resolveOrderPaidTotalCents(row),
            order_number: row.order_number ? Number(row.order_number) : null,
            items: itemsMap[row.id] || [],
            returns: returnsMap[row.id] || [],
            cancellation_allowed,
          }
        })
        res.json({ orders })
      } catch (e) {
        if (client) try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    // POST /store/orders/:id/return-request — customer requests a return
    const storeReturnRequestPOST = async (req, res) => {
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      const authHeader = req.headers.authorization || ''
      const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
      if (!token) return res.status(401).json({ message: 'Unauthorized' })
      const orderId = (req.params.id || '').trim()
      if (!orderId) return res.status(400).json({ message: 'order id required' })
      const payload = verifyCustomerToken(token)
      if (!payload?.email) return res.status(401).json({ message: 'Invalid token' })
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        // Verify order belongs to customer
        const orderR = await client.query(
          `SELECT id, order_number, delivery_status, delivery_date, total_cents FROM store_orders WHERE id = $1::uuid
           AND (
             ($3::uuid IS NOT NULL AND customer_id = $3::uuid)
             OR (email IS NOT NULL AND LOWER(TRIM(email)) = LOWER(TRIM($2)))
           )`,
          [orderId, payload.email, customerIdForPg(payload)],
        )
        if (!orderR.rows[0]) { await client.end(); return res.status(404).json({ message: 'Order not found' }) }
        const order = orderR.rows[0]
        // Check 14-day window
        const deliveryDate = order.delivery_date ? new Date(order.delivery_date) : null
        if (deliveryDate) {
          const daysSince = (Date.now() - deliveryDate.getTime()) / (1000 * 60 * 60 * 24)
          if (daysSince > 14) {
            await client.end()
            return res.status(400).json({ message: 'Rückgabefrist abgelaufen. Rückgabe ist nur innerhalb von 14 Tagen nach Lieferung möglich.' })
          }
        }
        // Check for existing open return
        const existR = await client.query(
          "SELECT id FROM store_returns WHERE order_id = $1::uuid AND status NOT IN ('abgelehnt','abgeschlossen')",
          [orderId]
        )
        if (existR.rows.length > 0) { await client.end(); return res.status(409).json({ message: 'Es gibt bereits eine offene Retouranfrage für diese Bestellung.' }) }
        const { reason = '', notes = '', items } = req.body || {}
        const r = await client.query(
          `INSERT INTO store_returns (order_id, status, reason, notes, items)
           VALUES ($1::uuid, 'offen', $2, $3, $4)
           RETURNING id, return_number, status, created_at`,
          [orderId, reason, notes||null, items ? JSON.stringify(items) : null]
        )
        await client.query(
          `UPDATE store_orders SET order_status = 'retoure_anfrage', updated_at = now() WHERE id = $1::uuid`,
          [orderId],
        )
        await client.end()
        const ret = r.rows[0]
        res.json({ return_request: { ...ret, return_number: ret.return_number ? Number(ret.return_number) : null } })
      } catch (e) {
        if (client) try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    // POST /store/orders/:id/cancel — customer self-cancel within policy window (15 min or night orders until 07:00 local)
    const storeOrdersCancelPOST = async (req, res) => {
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      const authHeader = req.headers.authorization || ''
      const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
      if (!token) return res.status(401).json({ message: 'Unauthorized' })
      const orderId = (req.params.id || '').trim()
      if (!orderId) return res.status(400).json({ message: 'order id required' })
      const payload = verifyCustomerToken(token)
      if (!payload?.email) return res.status(401).json({ message: 'Invalid token' })
      const cancelTz = String(process.env.STORE_POLICY_TIMEZONE || 'Europe/Berlin').trim() || 'Europe/Berlin'

      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()

        const orderR = await client.query(
          `SELECT id, order_number, customer_id, payment_intent_id, payment_status, order_status, delivery_status,
                  tracking_number, stripe_transfer_status, stripe_payout_status, total_cents,
                  COALESCE(bonus_points_redeemed, 0)::int AS bonus_points_redeemed, created_at,
                  (
                    (NOW() <= created_at + interval '15 minutes')
                    OR (
                      (EXTRACT(HOUR FROM (created_at AT TIME ZONE $2::text)) * 60
                       + EXTRACT(MINUTE FROM (created_at AT TIME ZONE $2::text))) < (7 * 60)
                      AND NOW() < (
                        (date_trunc('day', (created_at AT TIME ZONE $2::text)::timestamp) + interval '7 hours')
                        AT TIME ZONE $2::text
                      )
                    )
                  ) AS policy_cancel_ok
           FROM store_orders WHERE id = $1::uuid
             AND (
               ($4::uuid IS NOT NULL AND customer_id = $4::uuid)
               OR (email IS NOT NULL AND LOWER(TRIM(email)) = LOWER(TRIM($3)))
             )`,
          [orderId, cancelTz, payload.email, customerIdForPg(payload)],
        )
        const row = orderR.rows[0]
        if (!row) {
          await client.end()
          return res.status(404).json({ message: 'Order not found' })
        }

        const os = String(row.order_status || '').toLowerCase()
        if (os === 'storniert') {
          await client.end()
          return res.json({
            success: true,
            already_cancelled: true,
            order: { id: row.id, order_status: 'storniert', payment_status: row.payment_status },
          })
        }
        if (['refunded', 'retoure', 'retoure_anfrage'].includes(os)) {
          await client.end()
          return res.status(400).json({ message: 'Diese Bestellung kann nicht mehr storniert werden.' })
        }
        const ds = String(row.delivery_status || 'offen').toLowerCase()
        if (['versendet', 'zugestellt', 'shipped', 'delivered'].includes(ds)) {
          await client.end()
          return res.status(400).json({ message: 'Die Bestellung wurde bereits versendet.' })
        }
        if (row.tracking_number != null && String(row.tracking_number).trim() !== '') {
          await client.end()
          return res.status(400).json({ message: 'Sendungsverfolgung aktiv — Stornierung nicht möglich.' })
        }
        if (
          String(row.stripe_transfer_status || '').toLowerCase() === 'completed' ||
          String(row.stripe_payout_status || '').toLowerCase() === 'paid'
        ) {
          await client.end()
          return res.status(400).json({ message: 'Auszahlung bereits erfolgt — bitte den Support kontaktieren.' })
        }
        if (!row.policy_cancel_ok) {
          await client.end()
          return res.status(400).json({ message: 'Stornierungsfrist abgelaufen.' })
        }

        const totalCents = Number(row.total_cents || 0)
        const piId = row.payment_intent_id ? String(row.payment_intent_id).trim() : ''

        const platformRow = await loadPlatformCheckoutRow(client)
        const secretKey = resolveStripeSecretKeyFromPlatform(platformRow)

        if (totalCents > 0) {
          if (!piId) {
            await client.end()
            return res.status(400).json({ message: 'Keine Zahlungsreferenz — bitte den Support kontaktieren.' })
          }
          if (!secretKey) {
            await client.end()
            return res.status(503).json({ message: 'Zahlungsrückbuchung ist nicht konfiguriert.' })
          }
          try {
            const stripe = new (require('stripe'))(secretKey)
            const pi = await stripe.paymentIntents.retrieve(piId)
            if (pi.status === 'requires_capture') {
              await stripe.paymentIntents.cancel(piId)
            } else if (pi.status === 'succeeded') {
              const ch = pi.latest_charge
              const chargeId = typeof ch === 'string' ? ch : ch?.id
              if (!chargeId) {
                await client.end()
                return res.status(400).json({ message: 'Keine Charge für Erstattung gefunden.' })
              }
              // Destination charge: reverse the transfer and refund the application fee too
              const isDestinationCharge = !!(pi.transfer_data?.destination)
              const refundParams = { charge: chargeId }
              if (isDestinationCharge) {
                refundParams.reverse_transfer = true
                refundParams.refund_application_fee = true
              }
              await stripe.refunds.create(refundParams)
            } else if (pi.status === 'canceled' || pi.status === 'requires_payment_method') {
              /* bereits storniert / unbezahlt */
            } else {
              await client.end()
              return res.status(400).json({ message: `Zahlungsstatus „${pi.status}” — automatische Stornierung nicht möglich.` })
            }
          } catch (se) {
            await client.end()
            return res.status(502).json({ message: se?.message || 'Stripe-Rückbuchung fehlgeschlagen' })
          }
        }

        const custId = row.customer_id
        if (custId) {
          try {
            const doneEarn = await client.query(
              `SELECT id FROM store_customer_bonus_ledger WHERE order_id = $1::uuid AND source = 'order_cancel_earn' LIMIT 1`,
              [orderId],
            )
            const doneRedeem = await client.query(
              `SELECT id FROM store_customer_bonus_ledger WHERE order_id = $1::uuid AND source = 'order_cancel_redeem' LIMIT 1`,
              [orderId],
            )
            const earned = await client.query(
              `SELECT COALESCE(SUM(points_delta), 0)::int AS total FROM store_customer_bonus_ledger WHERE order_id = $1::uuid AND source = 'order_earn'`,
              [orderId],
            )
            const earnedPts = Number(earned.rows[0]?.total || 0)
            const redeemed = await client.query(
              `SELECT COALESCE(SUM(points_delta), 0)::int AS total FROM store_customer_bonus_ledger WHERE order_id = $1::uuid AND source = 'order_redeem'`,
              [orderId],
            )
            const redeemedPts = Number(redeemed.rows[0]?.total || 0)
            if (earnedPts > 0 && !doneEarn.rows.length) {
              await appendBonusLedger(client, {
                customerId: custId,
                pointsDelta: -earnedPts,
                description: `Storno Bestellung #${row.order_number} — Punkte zurückgebucht (−${earnedPts})`,
                source: 'order_cancel_earn',
                orderId,
              })
            }
            const redeemedFromOrder = Number(row.bonus_points_redeemed || 0)
            const pointsToGiveBack = redeemedPts < 0 ? -redeemedPts : redeemedFromOrder
            if (pointsToGiveBack > 0 && !doneRedeem.rows.length) {
              await appendBonusLedger(client, {
                customerId: custId,
                pointsDelta: pointsToGiveBack,
                description: `Storno Bestellung #${row.order_number} — eingelöste Punkte zurück (+${pointsToGiveBack})`,
                source: 'order_cancel_redeem',
                orderId,
              })
            }
          } catch (be) {
            console.warn('bonus reversal cancel:', be?.message || be)
          }
        }

        await client.query(
          `UPDATE store_orders SET order_status = 'storniert',
             payment_status = CASE WHEN $2::bigint > 0 THEN 'refunded' ELSE payment_status END,
             updated_at = now()
           WHERE id = $1::uuid`,
          [orderId, totalCents],
        )

        await client.end()
        res.json({
          success: true,
          order: {
            id: row.id,
            order_status: 'storniert',
            payment_status: totalCents > 0 ? 'refunded' : row.payment_status,
          },
        })
      } catch (e) {
        if (client) try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    const storeOrdersPOST = async (req, res) => {
      const body = req.body || {}
      const cartId = (body.cart_id || body.cartId || '').toString().trim()
      const paymentIntentId = (body.payment_intent_id || body.paymentIntentId || '').toString().trim()
      if (!cartId) return res.status(400).json({ message: 'cart_id required' })
      if (!paymentIntentId) return res.status(400).json({ message: 'payment_intent_id required' })

      const authHdr = (req.headers.authorization || '').toString()
      const bearerTok = authHdr.startsWith('Bearer ') ? authHdr.slice(7).trim() : ''
      let jwtCustomerId = null
      let jwtEmail = null
      if (bearerTok) {
        const jp = verifyCustomerToken(bearerTok)
        if (jp?.id && jp?.email) {
          jwtCustomerId = String(jp.id).trim()
          jwtEmail = String(jp.email).trim()
        }
      }

      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      if (!dbUrl || !dbUrl.startsWith('postgres')) return res.status(503).json({ message: 'Database not configured' })

      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()

        const cart = await getCartWithItems(client, cartId)
        if (!cart) { await client.end(); return res.status(404).json({ message: 'Cart not found' }) }
        const items = Array.isArray(cart.items) ? cart.items : []
        if (!items.length) { await client.end(); return res.status(400).json({ message: 'Cart is empty' }) }

        let email = (body.email || '').toString().trim() || null
        let first_name = (body.first_name || '').toString().trim() || null
        let last_name = (body.last_name || '').toString().trim() || null
        let phone = (body.phone || '').toString().trim() || null
        const address_line1 = (body.address_line1 || '').toString().trim() || null
        const address_line2 = (body.address_line2 || '').toString().trim() || null
        const city = (body.city || '').toString().trim() || null
        const postal_code = (body.postal_code || '').toString().trim() || null
        const country = (body.country || '').toString().trim() || null
        const billingSame = body.billing_same_as_shipping !== false
        const billing_address_line1 = billingSame ? (body.address_line1 || '').toString().trim() || null : (body.billing_address_line1 || '').toString().trim() || null
        const billing_address_line2 = billingSame ? (body.address_line2 || '').toString().trim() || null : (body.billing_address_line2 || '').toString().trim() || null
        const billing_city = billingSame ? (body.city || '').toString().trim() || null : (body.billing_city || '').toString().trim() || null
        const billing_postal_code = billingSame ? (body.postal_code || '').toString().trim() || null : (body.billing_postal_code || '').toString().trim() || null
        const billing_country = billingSame ? (body.country || '').toString().trim() || null : (body.billing_country || '').toString().trim() || null
        const newsletter_opted_in = body.newsletter_opted_in === true

        // Determine seller_id from the first cart item's product
        let sellerId = 'default'
        try {
          const firstItem = items[0]
          if (firstItem && firstItem.product_id) {
            const sellerRow = await client.query('SELECT seller_id FROM admin_hub_products WHERE id = $1', [firstItem.product_id])
            if (sellerRow.rows && sellerRow.rows[0] && sellerRow.rows[0].seller_id) {
              sellerId = sellerRow.rows[0].seller_id
            }
          }
        } catch (_) {}

        const sellerDisplayForStripe = await resolveSellerDisplayNameForStripe(client, sellerId)
        const sellerLabelShort =
          truncateForStripeDescription(sellerDisplayForStripe) ||
          (sellerId === 'default' ? 'Marketplace' : String(sellerId))

        // Customer: angemeldet → immer Konto-E-Mail + customer_id (Bestellungen unter „Meine Bestellungen“)
        let customerId = null
        let isGuest = true
        try {
          if (jwtCustomerId && jwtEmail) {
            email = jwtEmail
            const accR = await client.query(
              'SELECT id, account_type, first_name, last_name, phone, email FROM store_customers WHERE id = $1::uuid',
              [jwtCustomerId],
            )
            const acc = accR.rows?.[0]
            if (acc) {
              customerId = acc.id
              isGuest = acc.account_type === 'gastkunde'
              if (!first_name && acc.first_name) first_name = acc.first_name
              if (!last_name && acc.last_name) last_name = acc.last_name
              if (!phone && acc.phone) phone = acc.phone
              if (acc.email) email = String(acc.email).trim()
            }
          } else if (email) {
            const custRes = await client.query('SELECT id, account_type FROM store_customers WHERE LOWER(TRIM(email)) = LOWER(TRIM($1))', [email])
            if (custRes.rows && custRes.rows[0]) {
              customerId = custRes.rows[0].id
              isGuest = custRes.rows[0].account_type === 'gastkunde'
            } else {
              const insC = await client.query(
                `INSERT INTO store_customers (email, first_name, last_name, phone, account_type, address_line1, zip_code, city, country)
                 VALUES ($1,$2,$3,$4,'gastkunde',$5,$6,$7,$8)
                 ON CONFLICT (email) DO UPDATE SET
                   first_name = COALESCE(EXCLUDED.first_name, store_customers.first_name),
                   last_name  = COALESCE(EXCLUDED.last_name,  store_customers.last_name),
                   updated_at = now()
                 RETURNING id`,
                [email, first_name, last_name, phone, address_line1, postal_code, city, country],
              )
              if (insC.rows && insC.rows[0]) customerId = insC.rows[0].id
              isGuest = true
            }
          }
        } catch (_) {}

        // Get payment method from Stripe + verify paid amount matches PI snapshot & cart (bonus + Versand)
        const shippingFromBody = Math.max(0, Number(body.shipping_cents || 0))
        let shippingCentsOrder = shippingFromBody
        let orderPaidTotalCents = 0
        let paidCentsFromStripe = 0

        const platformRowOrders = await loadPlatformCheckoutRow(client)
        const secretKey = resolveStripeSecretKeyFromPlatform(platformRowOrders)
        let paymentMethod = 'card'
        let stripeInst = null
        let piStripeAccountId = null   // connected account from destination charge
        let piAppFeeCents = null       // application_fee_amount from destination charge
        if (secretKey) {
          try {
            stripeInst = new (require('stripe'))(secretKey)
            const pi = await stripeInst.paymentIntents.retrieve(paymentIntentId, { expand: ['payment_method'] })
            paidCentsFromStripe = Number(pi.amount)
            const m = pi.metadata || {}
            const snapPay = parseInt(String(m.pay_total_cents || ''), 10)
            const snapShip = parseInt(String(m.shipping_cents_snapshot || ''), 10)

            if (Number.isFinite(snapPay) && Number.isFinite(snapShip) && snapPay === paidCentsFromStripe) {
              const verifyMoney = computeCartCheckoutMoney(cart, snapShip)
              if (verifyMoney.payTotalCents !== paidCentsFromStripe || verifyMoney.payTotalCents !== snapPay) {
                await client.end()
                return res.status(400).json({ message: 'Zahlungsbetrag stimmt nicht mit dem Warenkorb überein. Bitte Checkout neu laden.' })
              }
              shippingCentsOrder = snapShip
              orderPaidTotalCents = paidCentsFromStripe
            } else {
              const fb = computeCartCheckoutMoney(cart, shippingFromBody)
              orderPaidTotalCents = fb.payTotalCents
              if (paidCentsFromStripe !== orderPaidTotalCents) {
                await client.end()
                return res.status(400).json({ message: 'Zahlungsbetrag stimmt nicht mit dem Warenkorb überein. Bitte Checkout neu laden.' })
              }
            }

            const pm = pi.payment_method
            if (pm && typeof pm === 'object') {
              if (pm.type === 'card' && pm.card && pm.card.brand) { paymentMethod = pm.card.brand }
              else if (pm.type) { paymentMethod = pm.type }
            } else if (pi.payment_method_types && pi.payment_method_types[0]) {
              paymentMethod = pi.payment_method_types[0]
            }
            piStripeAccountId = (typeof pi.transfer_data?.destination === 'string' ? pi.transfer_data.destination : pi.transfer_data?.destination?.id) || null
            piAppFeeCents = pi.application_fee_amount || null
          } catch (e) {
            await client.end()
            return res.status(400).json({ message: e?.message || 'Zahlung konnte nicht verifiziert werden' })
          }
        } else {
          const fb = computeCartCheckoutMoney(cart, shippingFromBody)
          orderPaidTotalCents = fb.payTotalCents
          console.warn('storeOrdersPOST: Stripe secret missing — skipping PaymentIntent amount verification')
        }

        const moneyInsert = computeCartCheckoutMoney(cart, shippingCentsOrder)
        const subtotalCents = moneyInsert.subtotalCents
        const discountCents = moneyInsert.discountCents
        const couponDiscountCents = moneyInsert.couponDiscountCents
        const bonusPointsRedeemed = Number(cart.bonus_points_reserved || 0)
        if (secretKey && moneyInsert.payTotalCents !== paidCentsFromStripe) {
          await client.end()
          return res.status(400).json({ message: 'Zahlungsbetrag stimmt nicht mit dem Warenkorb überein. Bitte Checkout neu laden.' })
        }

        if (bonusPointsRedeemed > 0 && customerId) {
          const chk = await client.query('SELECT COALESCE(bonus_points,0) AS bp FROM store_customers WHERE id = $1::uuid', [customerId])
          const bal = Number(chk.rows?.[0]?.bp || 0)
          if (bal < bonusPointsRedeemed) {
            await client.end()
            return res.status(400).json({ message: 'Bonuspunkte reichen nicht mehr. Bitte Checkout neu laden.' })
          }
        }

        const ins = await client.query(
          `INSERT INTO store_orders
            (cart_id, payment_intent_id, status, seller_id, email, first_name, last_name, phone,
             address_line1, address_line2, city, postal_code, country,
             billing_address_line1, billing_address_line2, billing_city, billing_postal_code, billing_country, billing_same_as_shipping,
             payment_method, customer_id, is_guest, newsletter_opted_in,
             order_status, payment_status, stripe_transfer_status,
             stripe_account_id, stripe_application_fee_cents, stripe_payout_status,
             subtotal_cents, discount_cents, coupon_code, coupon_discount_cents, shipping_cents, bonus_points_redeemed, total_cents, currency)
           VALUES ($1,$2,'paid',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,'in_bearbeitung','bezahlt',
             'not_applicable',NULL,NULL,'pending',
             $23,$24,$25,$26,$27,$28,$29,'eur')
           RETURNING id, order_number`,
          [cartId, paymentIntentId, sellerId, email, first_name, last_name, phone,
           address_line1, address_line2, city, postal_code, country,
           billing_address_line1, billing_address_line2, billing_city, billing_postal_code, billing_country, billingSame,
           paymentMethod, customerId, isGuest, newsletter_opted_in,
           subtotalCents, discountCents, cart.coupon_code || null, couponDiscountCents, shippingCentsOrder, bonusPointsRedeemed, orderPaidTotalCents]
        )

        const orderId = ins.rows && ins.rows[0] ? ins.rows[0].id : null
        const orderNumber = ins.rows && ins.rows[0] ? ins.rows[0].order_number : null
        if (!orderId) { await client.end(); return res.status(500).json({ message: 'Order insert failed' }) }

        // Update Stripe payment intent with order number and seller display name (merge metadata — keep PI snapshot keys)
        if (secretKey && orderNumber) {
          try {
            const stripeForUpdate = stripeInst || new (require('stripe'))(secretKey)
            const curPi = await stripeForUpdate.paymentIntents.retrieve(paymentIntentId)
            const prevMeta = curPi.metadata && typeof curPi.metadata === 'object' ? curPi.metadata : {}
            await stripeForUpdate.paymentIntents.update(paymentIntentId, {
              description: `#${orderNumber} — ${sellerLabelShort}`,
              metadata: {
                ...prevMeta,
                order_number: String(orderNumber),
                order_id: String(orderId),
                seller_id: String(sellerId),
                seller_name: truncateForStripeDescription(sellerDisplayForStripe, 500) || sellerLabelShort,
              },
            })
          } catch (_) {}
        }

        // Stripe Connect transfer is intentionally NOT sent at order creation.
        // It is dispatched by scheduled job after delivery + 14 days.

        for (const it of items) {
          await client.query(
            `INSERT INTO store_order_items
              (order_id, variant_id, product_id, quantity, unit_price_cents, title, thumbnail, product_handle)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
            [
              orderId,
              it.variant_id,
              it.product_id,
              it.quantity,
              it.unit_price_cents,
              it.title,
              it.thumbnail,
              it.product_handle,
            ]
          )
        }

        if (bonusPointsRedeemed > 0 && customerId) {
          await client.query(
            `UPDATE store_customers SET bonus_points = bonus_points - $1, updated_at = NOW() WHERE id = $2::uuid AND bonus_points >= $1`,
            [bonusPointsRedeemed, customerId],
          )
          try {
            await appendBonusLedger(client, {
              customerId,
              pointsDelta: -bonusPointsRedeemed,
              description: `Bestellung #${orderNumber} — Bonus an der Kasse eingelöst (−${bonusPointsRedeemed} Punkte)`,
              source: 'order_redeem',
              orderId,
              skipBalanceUpdate: true,
            })
          } catch (le) {
            console.warn('bonus ledger order_redeem:', le?.message || le)
          }
        }
        if (!isGuest && customerId) {
          const earned = bonusPointsEarnedFromOrderPaidCents(orderPaidTotalCents)
          if (earned > 0) {
            await client.query(
              `UPDATE store_customers SET bonus_points = COALESCE(bonus_points, 0) + $1, updated_at = NOW() WHERE id = $2::uuid`,
              [earned, customerId],
            )
            try {
              await appendBonusLedger(client, {
                customerId,
                pointsDelta: earned,
                description: `Bestellung #${orderNumber} (+${earned} Punkte)`,
                source: 'order_earn',
                orderId,
                skipBalanceUpdate: true,
              })
            } catch (le) {
              console.warn('bonus ledger order_earn:', le?.message || le)
            }
          }
        }

        await clearCartBonusReserve(client, cartId)
        await client.query('UPDATE store_carts SET coupon_code = NULL, coupon_discount_cents = 0, updated_at = now() WHERE id = $1', [cartId]).catch(() => {})

        // Clear cart items so user can't reorder accidentally
        await client.query('DELETE FROM store_cart_items WHERE cart_id = $1', [cartId])

        const order = await getOrderWithItems(client, orderId)
        await client.end()
        res.status(201).json({ order })
        setImmediate(() => {
          runAutomationFlowsForOrder({ triggerKey: 'order_placed', orderId }).catch((fe) => {
            console.warn('runAutomationFlowsForOrder order_placed:', fe?.message || fe)
          })
        })
      } catch (err) {
        if (client) try { await client.end() } catch (_) {}
        console.error('Store orders POST:', err)
        res.status(500).json({ message: (err && err.message) || 'Internal server error' })
      }
    }

    const storeOrdersGET = async (req, res) => {
      const orderId = (req.params.id || '').toString().trim()
      if (!orderId) return res.status(400).json({ message: 'Order id required' })
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      if (!dbUrl || !dbUrl.startsWith('postgres')) return res.status(503).json({ message: 'Database not configured' })

      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        const order = await getOrderWithItems(client, orderId)
        await client.end()
        if (!order) return res.status(404).json({ message: 'Order not found' })
        res.json({ order })
      } catch (err) {
        if (client) try { await client.end() } catch (_) {}
        console.error('Store orders GET:', err)
        res.status(500).json({ message: (err && err.message) || 'Internal server error' })
      }
    }

    const storePublicPaymentConfigGET = async (_req, res) => {
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      if (!dbUrl || !dbUrl.startsWith('postgres')) {
        return res.json({ stripe_publishable_key: null, payment_method_types: paymentMethodTypesFromPlatformRow(null) })
      }
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        const row = await loadPlatformCheckoutRow(client)
        await client.end()
        const dbPk = resolveStripePublishableFromPlatform(row)
        res.json({
          stripe_publishable_key: dbPk || null,
          payment_method_types: paymentMethodTypesFromPlatformRow(row),
          payment_method_layout: (row?.payment_method_layout || 'grid').toString(),
        })
      } catch (err) {
        if (client) try { await client.end() } catch (_) {}
        console.error('storePublicPaymentConfigGET:', err)
        res.json({ stripe_publishable_key: null, payment_method_types: ['card'] })
      }
    }

    // Routes
    httpApp.get('/store/public-payment-config', storePublicPaymentConfigGET)
    httpApp.post('/store/payment-intent', storePaymentIntentPOST)
    httpApp.post('/store/orders', storeOrdersPOST)
    httpApp.get('/store/orders/me', storeOrdersMeGET)
    httpApp.get('/store/orders/:id', storeOrdersGET)

    const storeCollectionsGET = async (req, res) => {
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      if (!dbUrl || !dbUrl.startsWith('postgres')) return res.json({ collections: [] })
      const handleQuery = (req.query.handle || req.query.slug || '').toString().trim()
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        if (handleQuery) {
          const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(handleQuery.trim())
          let r = await client.query('SELECT id, title, handle, metadata FROM admin_hub_collections WHERE LOWER(handle) = LOWER($1)', [handleQuery])
          if ((!r.rows || !r.rows[0]) && isUuid) {
            r = await client.query('SELECT id, title, handle, metadata FROM admin_hub_collections WHERE id = $1::uuid', [handleQuery.trim().toLowerCase()])
          }
          const row = r.rows && r.rows[0]
          if (!row) {
            try { await client.end() } catch (_) {}
            return res.status(404).json({ message: 'Collection not found' })
          }
          const meta = row.metadata && typeof row.metadata === 'object' ? row.metadata : {}
          const bannerResolved = resolveUploadUrl(meta.banner_image_url || meta.image_url || null)
          const collection = {
            id: row.id,
            title: row.title,
            handle: row.handle,
            display_title: meta.display_title || row.title,
            meta_title: meta.meta_title || null,
            meta_description: meta.meta_description || null,
            banner: bannerResolved,
            banner_image_url: meta.banner_image_url || null,
            image_url: meta.image_url || null,
            description: meta.richtext || meta.description_html || null,
            recommended_product_ids: Array.isArray(meta.recommended_product_ids) ? meta.recommended_product_ids : [],
          }
          try { await client.end() } catch (_) {}
          return res.json({ collection })
        }
        const r = await client.query('SELECT id, title, handle, metadata FROM admin_hub_collections ORDER BY title')
        const collections = (r.rows || []).map((row) => {
          const meta = row.metadata && typeof row.metadata === 'object' ? row.metadata : {}
          return {
            id: row.id,
            title: row.title,
            handle: row.handle,
            display_title: meta.display_title || row.title,
            banner: resolveUploadUrl(meta.banner_image_url || meta.image_url || null),
            banner_image_url: meta.banner_image_url || null,
            image_url: meta.image_url || null,
            description: meta.richtext || meta.description_html || null,
            recommended_product_ids: Array.isArray(meta.recommended_product_ids) ? meta.recommended_product_ids : [],
          }
        })
        res.json({ collections })
      } catch (e) {
        if (handleQuery) return res.status(500).json({ message: (e && e.message) || 'Internal server error' })
        res.json({ collections: [] })
      } finally {
        try { if (client) await client.end() } catch (_) {}
      }
    }
    httpApp.get('/store/collections', storeCollectionsGET)

    // GET /store/menus – Public menüler (Shop). Her menü SADECE kendi menu_id'sine ait item'ları alır (raw DB).
    let storeCategoriesTreeCache = { at: 0, payload: null }
    const STORE_CATEGORIES_TREE_TTL_MS = 45_000
    const storeCategoriesGET = async (req, res) => {
      const adminHubService = resolveAdminHub()
      try {
        const slug = (req.query.slug || '').toString().trim()
        if (slug) {
          if (adminHubService) {
            const category = await adminHubService.getCategoryBySlug(slug)
            if (!category || category.active === false || category.is_visible === false) return res.status(404).json({ message: 'Category not found' })
            const meta = category.metadata && typeof category.metadata === 'object' ? category.metadata : {}
            const collectionId = category.has_collection && meta.collection_id ? meta.collection_id : null
            const rawBanner = category.banner_image_url != null ? category.banner_image_url : meta.banner_image_url
            const cat = {
              id: category.id, name: category.name, slug: category.slug,
              title: category.name, handle: category.slug,
              description: category.description || null,
              long_content: category.long_content || null,
              banner_image_url: resolveUploadUrl(rawBanner) || null,
              has_collection: category.has_collection,
              collection_id: collectionId || null,
            }
            return res.json({ category: cat, categories: [cat], count: 1 })
          }
          // DB fallback
          const client = getProductsDbClient()
          if (!client) return res.status(404).json({ message: 'Category not found' })
          await client.connect()
          const r = await client.query(`SELECT * FROM admin_hub_categories WHERE slug = $1 AND active = true LIMIT 1`, [slug])
          await client.end()
          if (!r.rows[0]) return res.status(404).json({ message: 'Category not found' })
          const category = mapAdminHubCategoryPgRow(r.rows[0])
          const meta = category.metadata && typeof category.metadata === 'object' ? category.metadata : {}
          const rawBanner = category.banner_image_url != null ? category.banner_image_url : meta.banner_image_url
          const cat = {
            id: category.id, name: category.name, slug: category.slug,
            title: category.name, handle: category.slug,
            description: category.description || null,
            long_content: category.long_content || null,
            banner_image_url: resolveUploadUrl(rawBanner) || null,
            has_collection: category.has_collection,
            collection_id: category.has_collection && meta.collection_id ? meta.collection_id : null,
          }
          return res.json({ category: cat, categories: [cat], count: 1 })
        }

        const now = Date.now()
        if (storeCategoriesTreeCache.payload && now - storeCategoriesTreeCache.at < STORE_CATEGORIES_TREE_TTL_MS) {
          return res.json(storeCategoriesTreeCache.payload)
        }

        let tree
        if (adminHubService) {
          tree = await adminHubService.getCategoryTree({ is_visible: true })
        } else {
          // DB fallback
          const client = getProductsDbClient()
          if (!client) return res.status(200).json({ categories: [], tree: [], count: 0 })
          await client.connect()
          const r = await client.query(`SELECT * FROM admin_hub_categories WHERE active = true ORDER BY sort_order ASC, name ASC`)
          await client.end()
          let flat = r.rows.map(mapAdminHubCategoryPgRow)
          flat = flat.filter((c) => c.is_visible !== false)
          tree = buildAdminHubCategoryTreeFromFlat(flat)
        }

        let categoryIdsWithProducts = new Set()
        try {
          const allProducts = await listAdminHubProductsDb({ limit: 10000 })
          const approvedIds = await getApprovedSellerIdsSet()
          for (const p of allProducts) {
            if ((p.status || '').toLowerCase() !== 'published') continue
            if (!isStoreVisibleSellerProduct(p, approvedIds)) continue
            for (const cid of storeProductCategoryIds(p)) categoryIdsWithProducts.add(cid)
          }
        } catch (_) {}

        const annotateTree = (nodes) => {
          for (const n of nodes || []) {
            if (!n) continue
            annotateTree(n.children)
            const directHit = categoryIdsWithProducts.has(String(n.id).trim().toLowerCase())
            const childHit = (n.children || []).some((c) => c && c.has_products)
            n.has_products = directHit || childHit
          }
        }
        annotateTree(tree)
        const hasAny = (nodes) => (nodes || []).some((n) => n?.has_products || hasAny(n?.children))
        if (Array.isArray(tree) && tree.length > 0 && !hasAny(tree)) {
          const relaxAll = (nodes) => { for (const n of nodes || []) { if (n) { n.has_products = true; relaxAll(n.children) } } }
          relaxAll(tree)
        }

        const categories = (tree || []).map((c) => ({ id: c.id, name: c.name, slug: c.slug, title: c.name, handle: c.slug }))
        const payload = { categories, tree, count: categories.length }
        storeCategoriesTreeCache = { at: now, payload }
        res.json(payload)
      } catch (err) {
        console.error('Store categories GET error:', err)
        res.status(200).json({ categories: [], tree: [], count: 0 })
      }
    }
    httpApp.get('/store/categories', storeCategoriesGET)

    const getStoreMenusFromDb = async () => {
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      if (!dbUrl || !dbUrl.startsWith('postgres')) return null
      try {
        const { Client } = require('pg')
        const isRender = dbUrl.includes('render.com')
        const client = new Client({ connectionString: dbUrl, ssl: isRender ? { rejectUnauthorized: false } : false })
        await client.connect()
        const menusRes = await client.query('SELECT id, name, slug, location, categories_with_products FROM admin_hub_menus ORDER BY name')
        const menus = (menusRes.rows || []).map((r) => ({
          id: r.id,
          name: r.name,
          slug: r.slug,
          // null/'' → '' (unassigned). Only explicitly set 'main' is treated as main.
          location: (r.location === null || r.location === undefined || String(r.location).trim() === '') ? '' : String(r.location).trim().toLowerCase(),
          categories_with_products: Boolean(r.categories_with_products),
        }))
        const menusWithItems = []
        const collectionKeys = new Set() // handle or id from link_value
        const collectionIds = new Set()
        const categoryKeys = new Set() // slug or id for link_type=category
        for (const menu of menus) {
          const itemsRes = await client.query(
            'SELECT id, menu_id, label, link_type, link_value, parent_id, sort_order FROM admin_hub_menu_items WHERE menu_id = $1 ORDER BY sort_order ASC, label ASC',
            [menu.id]
          )
          const rows = itemsRes.rows || []
          for (const r of rows) {
            const lt = (r.link_type || 'url').toLowerCase()
            if (lt === 'collection' && r.link_value) {
              let h = (r.link_value || '').toString().trim()
              let parsedId = null
              if (h.startsWith('{')) {
                try {
                  const p = JSON.parse(h)
                  h = p.handle || p.slug || p.id || h
                  if (p.id) parsedId = String(p.id).trim()
                } catch (_) {}
              }
              if (h) collectionKeys.add(h)
              if (parsedId) collectionIds.add(parsedId)
            }
            if (lt === 'category' && r.link_value) {
              let v = (r.link_value || '').toString().trim()
              if (v.startsWith('{')) {
                try {
                  const p = JSON.parse(v)
                  v = p.slug || p.handle || p.id || v
                } catch (_) {}
              }
              if (v) categoryKeys.add(v)
            }
          }
          const items = rows.map((r) => ({
            id: r.id,
            menu_id: r.menu_id,
            label: r.label,
            link_type: r.link_type || 'url',
            link_value: r.link_value,
            parent_id: r.parent_id,
            sort_order: r.sort_order != null ? r.sort_order : 0,
          }))
          menusWithItems.push({ ...menu, items, _rows: rows })
        }
        const handleToBanner = {}
        const idToCollection = {}
        const idToBanner = {} // collection id -> banner url (for category->collection lookup)
        const categoryToCollectionId = {} // category slug/id -> collection id
        const handlesList = Array.from(collectionKeys).filter((k) => !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(k))
        const idsList = Array.from(collectionIds)
        if (handlesList.length > 0) {
          const collRes = await client.query(
            'SELECT id, title, handle, metadata FROM admin_hub_collections WHERE LOWER(handle) = ANY($1)',
            [handlesList.map((h) => h.toLowerCase())]
          )
          for (const row of collRes.rows || []) {
            const meta = row.metadata && typeof row.metadata === 'object' ? row.metadata : {}
            const url = resolveUploadUrl(meta.banner_image_url || meta.image_url || null)
            if (url) {
              handleToBanner[(row.handle || '').toLowerCase()] = url
              idToBanner[String(row.id)] = url
            }
            idToCollection[String(row.id)] = { id: row.id, title: row.title, handle: row.handle }
          }
        }
        if (idsList.length > 0) {
          const byIdRes = await client.query(
            'SELECT id, title, handle, metadata FROM admin_hub_collections WHERE id = ANY($1)',
            [idsList]
          )
          for (const row of byIdRes.rows || []) {
            const meta = row.metadata && typeof row.metadata === 'object' ? row.metadata : {}
            const url = resolveUploadUrl(meta.banner_image_url || meta.image_url || null)
            if (url) {
              handleToBanner[(row.handle || '').toLowerCase()] = url
              idToBanner[String(row.id)] = url
            }
            idToCollection[String(row.id)] = { id: row.id, title: row.title, handle: row.handle }
          }
        }
        // Resolve category -> collection_id for menu items with link_type=category (collection banner in menu)
        if (categoryKeys.size > 0) {
          const catSlugs = Array.from(categoryKeys).filter((k) => !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(k))
          const catIds = Array.from(categoryKeys).filter((k) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(k))
          const categoryCollectionIds = new Set()
          if (catSlugs.length > 0) {
            const catRes = await client.query(
              'SELECT id, slug, metadata FROM admin_hub_categories WHERE LOWER(slug) = ANY($1)',
              [catSlugs.map((s) => s.toLowerCase())]
            )
            for (const row of catRes.rows || []) {
              const meta = row.metadata && typeof row.metadata === 'object' ? row.metadata : {}
              const cid = meta.collection_id
              if (cid) {
                categoryToCollectionId[(row.slug || '').toLowerCase()] = String(cid)
                categoryToCollectionId[String(row.id)] = String(cid)
                categoryCollectionIds.add(String(cid))
              }
            }
          }
          if (catIds.length > 0) {
            const catByIdRes = await client.query(
              'SELECT id, slug, metadata FROM admin_hub_categories WHERE id = ANY($1)',
              [catIds]
            )
            for (const row of catByIdRes.rows || []) {
              const meta = row.metadata && typeof row.metadata === 'object' ? row.metadata : {}
              const cid = meta.collection_id
              if (cid) {
                categoryToCollectionId[(row.slug || '').toLowerCase()] = String(cid)
                categoryToCollectionId[String(row.id)] = String(cid)
                categoryCollectionIds.add(String(cid))
              }
            }
          }
          const collIdsToFetch = Array.from(categoryCollectionIds).filter((id) => !idToBanner[id])
          if (collIdsToFetch.length > 0) {
            const collByCatRes = await client.query(
              'SELECT id, title, handle, metadata FROM admin_hub_collections WHERE id = ANY($1)',
              [collIdsToFetch]
            )
            for (const row of collByCatRes.rows || []) {
              const meta = row.metadata && typeof row.metadata === 'object' ? row.metadata : {}
              const url = resolveUploadUrl(meta.banner_image_url || meta.image_url || null)
              if (url) idToBanner[String(row.id)] = url
            }
          }
        }
        for (const m of menusWithItems) {
          const rows = m._rows || []
          delete m._rows
          m.items = m.items.map((it, idx) => {
            const r = rows[idx]
            if (!r) return it
            const lt = (r.link_type || 'url').toLowerCase()
            let banner_url = null
            if (lt === 'collection' && r.link_value) {
              let h = (r.link_value || '').toString().trim()
              let parsed = null
              if (h.startsWith('{')) {
                try {
                  parsed = JSON.parse(h)
                  h = parsed.handle || parsed.slug || parsed.id || h
                } catch (_) {}
              }
              const resolved = (parsed && parsed.id && idToCollection[String(parsed.id)]) ? idToCollection[String(parsed.id)] : null
              const resolvedHandle = resolved ? resolved.handle : (h && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(h) ? h : null)
              banner_url = resolvedHandle ? (handleToBanner[resolvedHandle.toLowerCase()] || null) : null
              const linkValueForShop = resolvedHandle
                ? JSON.stringify({ id: resolved?.id || parsed?.id, title: resolved?.title || parsed?.title, handle: resolvedHandle })
                : it.link_value
              return { ...it, ...(linkValueForShop !== it.link_value ? { link_value: linkValueForShop } : {}), ...(banner_url ? { banner_url } : {}) }
            }
            if (lt === 'category' && r.link_value) {
              let v = (r.link_value || '').toString().trim()
              let key = v
              if (v.startsWith('{')) {
                try {
                  const p = JSON.parse(v)
                  key = p.slug || p.handle || p.id || v
                } catch (_) {}
              }
              const collectionId = key ? (categoryToCollectionId[key.toLowerCase()] || categoryToCollectionId[String(key)]) : null
              banner_url = collectionId ? (idToBanner[collectionId] || null) : null
              return { ...it, ...(banner_url ? { banner_url } : {}) }
            }
            return it
          })
        }
        await client.end()
        return menusWithItems
      } catch (e) {
        console.warn('Store menus from DB:', e && e.message)
        return null
      }
    }
    const storeMenusGET = async (req, res) => {
      try {
        const location = (req.query.location || '').trim()
        let menusWithItems = await getStoreMenusFromDb()
        if (!menusWithItems) {
          const svc = resolveMenuService()
          if (!svc) return res.status(200).json({ menus: [], count: 0 })
          let menus = await svc.listMenus()
          if (location) menus = menus.filter((m) => m.location === location)
          menusWithItems = await Promise.all(
            menus.map(async (menu) => {
              const items = await svc.listMenuItems(menu.id).catch(() => [])
              return { ...menu, items: items || [] }
            })
          )
        } else {
          if (location) menusWithItems = menusWithItems.filter((m) => m.location === location)
        }
        res.json({ menus: menusWithItems, count: menusWithItems.length })
      } catch (err) {
        console.error('Store menus GET error:', err)
        res.status(500).json({ message: (err && err.message) || 'Internal server error' })
      }
    }
    httpApp.get('/store/menus', storeMenusGET)

    // GET /store/page-by-label-slug/:slug — finds a page linked to a menu item by label_slug
    httpApp.get('/store/page-by-label-slug/:slug', async (req, res) => {
      const client = getDbClient()
      if (!client) return res.status(404).json({ message: 'Not found' })
      try {
        await client.connect()
        const slug = req.params.slug
        const r = await client.query(
          `SELECT link_value FROM admin_hub_menu_items WHERE link_type = 'page' AND link_value::text LIKE $1`,
          [`%"label_slug":"${slug}"%`]
        )
        if (!r.rows[0]) return res.status(404).json({ message: 'Not found' })
        const lv = JSON.parse(r.rows[0].link_value)
        if (!lv?.id) return res.status(404).json({ message: 'Not found' })
        const pr = await client.query(
          `SELECT id, title, slug, body, featured_image, excerpt, page_type, meta_title, meta_description, meta_keywords FROM admin_hub_pages WHERE id = $1`,
          [lv.id]
        )
        if (!pr.rows[0]) return res.status(404).json({ message: 'Not found' })
        res.json(pr.rows[0])
      } catch { res.status(404).json({ message: 'Not found' }) } finally { await client.end().catch(() => {}) }
    })

    // --- Admin Hub Media (GET list, POST upload, GET :id, DELETE :id) ---
    const getDbClient = () => {
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      if (!dbUrl || !dbUrl.startsWith('postgres')) return null
      const { Client } = require('pg')
      const isRender = dbUrl.includes('render.com')
      return new Client({ connectionString: dbUrl, ssl: isRender ? { rejectUnauthorized: false } : false })
    }
    const sanitizeSellerMediaFolderSegment = (storeName, sellerId) => {
      const raw = (storeName || '').trim()
      let s = raw
        .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
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
            const safe = (file.originalname || 'file').replace(/[^a-zA-Z0-9._-]/g, '_')
            cb(null, `${Date.now()}-${safe}`)
          },
        })
    const upload = multer({ storage: uploadStorage })

    const mediaListGET = async (req, res) => {
      const client = getDbClient()
      if (!client) return res.status(503).json({ message: 'Database not configured' })
      try {
        await client.connect()
        const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100)
        const offset = parseInt(req.query.offset, 10) || 0
        const r = await client.query(
          'SELECT id, filename, url, mime_type, size, alt, created_at FROM admin_hub_media ORDER BY created_at DESC LIMIT $1 OFFSET $2',
          [limit, offset]
        )
        const countRes = await client.query('SELECT COUNT(*)::int AS c FROM admin_hub_media')
        res.json({ media: r.rows, count: countRes.rows[0].c })
      } catch (err) {
        console.error('Media list error:', err)
        res.status(500).json({ message: (err && err.message) || 'Internal server error' })
      } finally {
        await client.end().catch(() => {})
      }
    }
    const mediaRowVisibleToUser = (row, u) => {
      if (!u) return false
      if (u.is_superuser) return true
      const sid = row?.seller_id
      if (sid == null || String(sid).trim() === '') return false
      return String(sid) === String(u.seller_id)
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
          const key = `media/${mediaSeg}/${Date.now()}-${(req.file.originalname || 'file').replace(/[^a-zA-Z0-9._-]/g, '_')}`
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
      const uploadSellerId = req.sellerUser?.is_superuser ? null : (req.sellerUser?.seller_id || null)
      const dbFilename = isProductImage ? outFilename : (req.file.originalname || req.file.filename)
      try {
        await client.connect()
        const r = await client.query(
          `INSERT INTO admin_hub_media (filename, url, mime_type, size, alt, folder_id, seller_id) VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING id, filename, url, mime_type, size, alt, folder_id, seller_id, created_at`,
          [dbFilename, fileUrl, outMime, outSize, alt, folderId, uploadSellerId]
        )
        const row = r.rows[0]
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
        res.json(r.rows[0])
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
        const name = filename || url.split('/').pop()?.split('?')[0] || 'image'
        const urlSellerId = req.sellerUser?.is_superuser ? null : (req.sellerUser?.seller_id || null)
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
        res.json({ media: r.rows, count: countRes.rows[0].c })
      } catch (err) {
        console.error('Media list error:', err)
        res.status(500).json({ message: (err && err.message) || 'Internal server error' })
      } finally {
        await client.end().catch(() => {})
      }
    }

    // Batch-register image URLs from Excel import into seller's media folder
    const mediaImportUrlsPOST = async (req, res) => {
      const { urls, folder_name } = req.body || {}
      if (!Array.isArray(urls) || urls.length === 0) return res.status(400).json({ message: 'urls array required' })
      const client = getDbClient()
      if (!client) return res.status(503).json({ message: 'DB not configured' })
      try {
        await client.connect()
        const u = req.sellerUser
        const sellerId = u?.is_superuser ? null : (u?.seller_id || null)
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
          const filename = url.split('/').pop()?.split('?')[0] || 'image'
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

    httpApp.get('/admin-hub/v1/media', requireSellerAuth, mediaListWithFolderGET)
    httpApp.post('/admin-hub/v1/media', requireSellerAuth, prepareSellerMediaUploadPath, upload.single('file'), mediaUploadPOST)
    httpApp.get('/admin-hub/v1/media/folders', requireSellerAuth, mediaFoldersGET)
    httpApp.post('/admin-hub/v1/media/folders', requireSellerAuth, mediaFoldersPOST)
    httpApp.delete('/admin-hub/v1/media/folders/:id', requireSellerAuth, mediaFolderDELETE)
    httpApp.get('/admin-hub/v1/media/:id', requireSellerAuth, mediaByIdGET)
    httpApp.patch('/admin-hub/v1/media/:id', requireSellerAuth, mediaPATCH)
    httpApp.post('/admin-hub/v1/media/add-url', requireSellerAuth, mediaAddByUrlPOST)
    httpApp.post('/admin-hub/v1/media/import-urls', requireSellerAuth, mediaImportUrlsPOST)
    httpApp.delete('/admin-hub/v1/media/:id', requireSellerAuth, mediaByIdDELETE)

    // ── Admin Hub Orders ──────────────────────────────────────────
    const adminHubOrdersGET = async (req, res) => {
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      if (!dbUrl) return res.json({ orders: [], count: 0 })
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        const { search = '', order_status = '', payment_status = '', delivery_status = '', seller_id = '', sort = 'created_at_desc', limit = '50', offset = '0' } = req.query
        const conditions = []
        const params = []
        if (search) {
          params.push(`%${search}%`)
          conditions.push(`(o.email ILIKE $${params.length} OR o.first_name ILIKE $${params.length} OR o.last_name ILIKE $${params.length} OR CAST(o.order_number AS TEXT) ILIKE $${params.length})`)
        }
        if (order_status) { params.push(order_status); conditions.push(`o.order_status = $${params.length}`) }
        if (payment_status) { params.push(payment_status); conditions.push(`o.payment_status = $${params.length}`) }
        if (delivery_status) { params.push(delivery_status); conditions.push(`o.delivery_status = $${params.length}`) }
        if (seller_id) { params.push(seller_id); conditions.push(`o.seller_id = $${params.length}`) }
        const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : ''
        const sortMap = {
          created_at_desc: 'o.created_at DESC', created_at_asc: 'o.created_at ASC',
          order_number_desc: 'o.order_number DESC', order_number_asc: 'o.order_number ASC',
          total_desc: 'o.total_cents DESC', total_asc: 'o.total_cents ASC',
          name_asc: 'o.last_name ASC, o.first_name ASC', name_desc: 'o.last_name DESC, o.first_name DESC',
          status_asc: 'o.order_status ASC', status_desc: 'o.order_status DESC',
          country_asc: 'o.country ASC', country_desc: 'o.country DESC',
        }
        const orderBy = sortMap[sort] || 'o.created_at DESC'
        const lim = Math.min(Number(limit) || 50, 200)
        const off = Number(offset) || 0
        const r = await client.query(`SELECT o.id, o.order_number, o.order_status, o.payment_status, o.delivery_status, o.seller_id, o.email, o.first_name, o.last_name, o.phone, o.address_line1, o.address_line2, o.city, o.postal_code, o.country, o.subtotal_cents, o.total_cents, o.shipping_cents, o.discount_cents, o.currency, o.payment_intent_id, o.cart_id, o.created_at, o.is_guest, o.tracking_number, o.carrier_name, o.shipped_at, c.customer_number, c.id AS customer_id, (c.password_hash IS NOT NULL) AS c_is_registered FROM store_orders o LEFT JOIN store_customers c ON LOWER(c.email) = LOWER(o.email) ${where} ORDER BY ${orderBy} LIMIT $${params.length+1} OFFSET $${params.length+2}`, [...params, lim, off])
        const countR = await client.query(`SELECT COUNT(*) FROM store_orders o ${where}`, params)
        const orders = (r.rows || []).map(row => ({
          id: row.id, order_number: row.order_number ? Number(row.order_number) : null,
          order_status: row.order_status || 'offen', payment_status: row.payment_status || 'bezahlt',
          delivery_status: row.delivery_status || 'offen',
          seller_id: row.seller_id || 'default',
          email: row.email, first_name: row.first_name, last_name: row.last_name, phone: row.phone,
          address_line1: row.address_line1, address_line2: row.address_line2, city: row.city,
          postal_code: row.postal_code, country: row.country,
          subtotal_cents: row.subtotal_cents,
          shipping_cents: Number(row.shipping_cents || 0),
          discount_cents: Number(row.discount_cents || 0),
          total_cents: resolveOrderPaidTotalCents(row),
          currency: row.currency,
          payment_intent_id: row.payment_intent_id, created_at: row.created_at,
          tracking_number: row.tracking_number || null,
          carrier_name: row.carrier_name || null,
          shipped_at: row.shipped_at || null,
          customer_number: row.customer_number ? Number(row.customer_number) : null,
          customer_id: row.customer_id || null,
          is_guest: !(row.c_is_registered === true || row.c_is_registered === 't'),
        }))
        await client.end()
        res.json({ orders, count: Number(countR.rows[0]?.count || 0) })
      } catch (e) {
        if (client) try { await client.end() } catch (_) {}
        res.json({ orders: [], count: 0 })
      }
    }

    const adminHubOrderByIdGET = async (req, res) => {
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      const id = (req.params.id || '').trim()
      if (!id) return res.status(400).json({ message: 'id required' })
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        const oRes = await client.query('SELECT * FROM store_orders WHERE id = $1::uuid', [id])
        const row = oRes.rows && oRes.rows[0]
        if (!row) { await client.end(); return res.status(404).json({ message: 'Order not found' }) }
        const iRes = await client.query('SELECT * FROM store_order_items WHERE order_id = $1 ORDER BY created_at', [id])
        const items = (iRes.rows || []).map(r => ({ id: r.id, variant_id: r.variant_id, product_id: r.product_id, quantity: r.quantity, unit_price_cents: r.unit_price_cents, title: r.title, thumbnail: r.thumbnail, product_handle: r.product_handle }))
        // Look up customer info by email
        let customerNumber = null
        let isFirstOrder = false
        let isRegistered = false
        if (row.email) {
          try {
            const custR = await client.query('SELECT id, customer_number FROM store_customers WHERE email = $1', [row.email])
            if (custR.rows && custR.rows[0]) { customerNumber = Number(custR.rows[0].customer_number); isRegistered = true }
            const prevR = await client.query('SELECT COUNT(*) AS cnt FROM store_orders WHERE email = $1 AND created_at < $2', [row.email, row.created_at])
            isFirstOrder = Number(prevR.rows[0]?.cnt || 0) === 0
          } catch (_) {}
        }
        await client.end()
        res.json({
          order: {
            ...row,
            total_cents: resolveOrderPaidTotalCents(row),
            order_number: row.order_number ? Number(row.order_number) : null,
            items,
            customer_number: customerNumber,
            is_registered: isRegistered,
            is_first_order: isFirstOrder,
          },
        })
      } catch (e) {
        if (client) try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    const pdfDeLatin = (s) => {
      if (s == null || s === undefined) return ''
      return String(s)
        .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue')
        .replace(/Ä/g, 'Ae').replace(/Ö/g, 'Oe').replace(/Ü/g, 'Ue')
        .replace(/ß/g, 'ss')
    }
    const pdfFmtDate = (d) => {
      if (!d) return '—'
      try {
        return new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
      } catch (_) {
        return '—'
      }
    }
    const adminHubOrderPdfInvoiceGET = async (req, res) => {
      const id = (req.params.id || '').trim()
      if (!id) return res.status(400).json({ message: 'id required' })
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      if (!dbUrl) return res.status(503).json({ message: 'Database not configured' })
      let client
      try {
        const PDFDocument = require('pdfkit')
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        const oRes = await client.query('SELECT * FROM store_orders WHERE id = $1::uuid', [id])
        const row = oRes.rows && oRes.rows[0]
        if (!row) {
          await client.end()
          return res.status(404).json({ message: 'Order not found' })
        }
        const iRes = await client.query('SELECT * FROM store_order_items WHERE order_id = $1 ORDER BY created_at', [id])
        const itemRows = iRes.rows || []
        await client.end()
        client = null
        const on = row.order_number != null ? String(row.order_number) : String(id).slice(0, 8)
        const shopName = process.env.SHOP_INVOICE_NAME || 'Andertal'
        res.setHeader('Content-Type', 'application/pdf')
        res.setHeader('Content-Disposition', `attachment; filename="Rechnung-${on}.pdf"`)
        const doc = new PDFDocument({ margin: 42, size: 'A4', compress: false, pdfVersion: '1.7' })
        doc.pipe(res)
        renderInvoicePdfDocument(doc, {
          row,
          itemRows,
          orderId: id,
          invoiceNumber: on,
          shopName,
        })
        doc.end()
      } catch (e) {
        if (client) try { await client.end() } catch (_) {}
        if (!res.headersSent) res.status(500).json({ message: e?.message || 'PDF error' })
      }
    }

    const adminHubOrderPdfLieferscheinGET = async (req, res) => {
      const id = (req.params.id || '').trim()
      if (!id) return res.status(400).json({ message: 'id required' })
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      if (!dbUrl) return res.status(503).json({ message: 'Database not configured' })
      let client
      try {
        const PDFDocument = require('pdfkit')
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        const oRes = await client.query('SELECT * FROM store_orders WHERE id = $1::uuid', [id])
        const row = oRes.rows && oRes.rows[0]
        if (!row) {
          await client.end()
          return res.status(404).json({ message: 'Order not found' })
        }
        const iRes = await client.query('SELECT * FROM store_order_items WHERE order_id = $1 ORDER BY created_at', [id])
        const itemRows = iRes.rows || []
        await client.end()
        client = null
        const on = row.order_number != null ? String(row.order_number) : String(id).slice(0, 8)
        const shopName = process.env.SHOP_INVOICE_NAME || 'Andertal'
        res.setHeader('Content-Type', 'application/pdf')
        res.setHeader('Content-Disposition', `attachment; filename="Lieferschein-${on}.pdf"`)
        const doc = new PDFDocument({ margin: 48, size: 'A4' })
        doc.pipe(res)
        doc.fontSize(20).fillColor('#111').text(pdfDeLatin('Lieferschein'), { align: 'right' })
        doc.moveDown(0.2)
        doc.fontSize(9).fillColor('#666').text(pdfDeLatin(shopName), { align: 'right' })
        doc.fillColor('#111')
        doc.moveDown(1.2)
        doc.fontSize(10).text(`Lieferschein-Nr.: ${on}`)
        doc.text(`Datum: ${pdfFmtDate(row.created_at)}`)
        doc.moveDown(0.6)
        doc.fontSize(10).font('Helvetica-Bold').text(pdfDeLatin('Lieferadresse'))
        doc.font('Helvetica').fontSize(9)
        const custName = [row.first_name, row.last_name].filter(Boolean).join(' ')
        ;[custName, row.address_line1, row.address_line2, [row.postal_code, row.city].filter(Boolean).join(' '), row.country].filter(Boolean).forEach((line) => doc.text(pdfDeLatin(line)))
        doc.moveDown(0.8)
        if (row.carrier_name || row.tracking_number) {
          doc.fontSize(10).font('Helvetica-Bold').text(pdfDeLatin('Versand'))
          doc.font('Helvetica').fontSize(9)
          if (row.carrier_name) doc.text(pdfDeLatin(String(row.carrier_name)))
          if (row.tracking_number) doc.text(`Tracking: ${pdfDeLatin(String(row.tracking_number))}`)
          doc.moveDown(0.6)
        }
        doc.fontSize(10).font('Helvetica-Bold').text(pdfDeLatin('Packstücke / Artikel'))
        doc.font('Helvetica').fontSize(9)
        itemRows.forEach((it) => {
          const qty = Number(it.quantity || 1)
          doc.text(`${qty} x ${pdfDeLatin(it.title || 'Artikel')}${it.product_handle ? ` (${pdfDeLatin(it.product_handle)})` : ''}`, { width: 500 })
        })
        doc.font('Helvetica').fontSize(8).fillColor('#666')
        doc.moveDown(1)
        doc.text(pdfDeLatin('Dieser Lieferschein dient der Zuordnung der Sendung. Keine Rechnung.'), { width: 480 })
        doc.end()
      } catch (e) {
        if (client) try { await client.end() } catch (_) {}
        if (!res.headersSent) res.status(500).json({ message: e?.message || 'PDF error' })
      }
    }

    const adminHubOrderPATCH = async (req, res) => {
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      const id = (req.params.id || '').trim()
      if (!id) return res.status(400).json({ message: 'id required' })
      const { order_status, payment_status, delivery_status, notes, tracking_number, carrier_name, shipped_at, delivery_date } = req.body || {}
      const sets = []; const params = []
      if (order_status) { params.push(order_status); sets.push(`order_status = $${params.length}`) }
      if (payment_status) { params.push(payment_status); sets.push(`payment_status = $${params.length}`) }
      if (delivery_status) { params.push(delivery_status); sets.push(`delivery_status = $${params.length}`) }
      if (notes !== undefined) { params.push(notes); sets.push(`notes = $${params.length}`) }
      if (tracking_number !== undefined) { params.push(tracking_number); sets.push(`tracking_number = $${params.length}`) }
      if (carrier_name !== undefined) { params.push(carrier_name); sets.push(`carrier_name = $${params.length}`) }
      if (shipped_at !== undefined) { params.push(shipped_at); sets.push(`shipped_at = $${params.length}`) }
      if (delivery_date !== undefined) { params.push(delivery_date); sets.push(`delivery_date = $${params.length}`) }
      if (!sets.length) return res.status(400).json({ message: 'Nothing to update' })
      sets.push('updated_at = now()')
      params.push(id)
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        // Fetch previous state to detect tracking_number changes
        const prevRes = await client.query('SELECT tracking_number, carrier_name, delivery_status FROM store_orders WHERE id = $1::uuid', [id])
        const prevRow = prevRes.rows[0] || {}
        await client.query(`UPDATE store_orders SET ${sets.join(', ')} WHERE id = $${params.length}::uuid`, params)
        // Auto-set delivery_date when marking as delivered (triggers 14-day Stripe payout window)
        if (delivery_status === 'zugestellt' && delivery_date === undefined) {
          await client.query(`UPDATE store_orders SET delivery_date = COALESCE(delivery_date, now()), updated_at = now() WHERE id = $1::uuid`, [id])
        }
        // Auto-complete: if payment is paid and delivery is delivered, mark order as completed — do not override Retoure / Rückgabe / Erstattung
        await client.query(
          `UPDATE store_orders SET order_status = 'abgeschlossen', updated_at = now()
           WHERE id = $1::uuid AND payment_status = 'bezahlt' AND delivery_status = 'zugestellt'
           AND order_status NOT IN ('abgeschlossen','retoure','retoure_anfrage','refunded','storniert')`,
          [id]
        )
        // Auto-create shipment events for status transitions
        const newTracking = tracking_number !== undefined ? String(tracking_number || '').trim() : (prevRow.tracking_number || '')
        const newCarrier = carrier_name !== undefined ? String(carrier_name || '').trim() : (prevRow.carrier_name || '')
        const effectiveDeliveryStatus = delivery_status || prevRow.delivery_status
        // Create "versendet" event if tracking number newly set or delivery_status newly set to versendet
        const trackingChanged = tracking_number !== undefined && String(tracking_number || '').trim() && String(tracking_number || '').trim() !== String(prevRow.tracking_number || '').trim()
        const deliveryStatusChangedToVersendet = delivery_status === 'versendet' && prevRow.delivery_status !== 'versendet'
        const deliveryStatusChangedToZugestellt = delivery_status === 'zugestellt' && prevRow.delivery_status !== 'zugestellt'
        if (trackingChanged || deliveryStatusChangedToVersendet) {
          const existingVersendet = await client.query(`SELECT id FROM store_shipment_events WHERE order_id=$1::uuid AND status='versendet' LIMIT 1`, [id])
          if (!existingVersendet.rows.length) {
            const desc = newCarrier ? `Paket bei ${newCarrier} aufgegeben${newTracking ? ` (${newTracking})` : ''}` : 'Paket wurde versendet'
            await client.query(
              `INSERT INTO store_shipment_events (order_id, status, description, source, event_time) VALUES ($1::uuid, 'versendet', $2, 'auto', now())`,
              [id, desc]
            )
          }
        }
        if (deliveryStatusChangedToZugestellt) {
          const existingZugestellt = await client.query(`SELECT id FROM store_shipment_events WHERE order_id=$1::uuid AND status='zugestellt' LIMIT 1`, [id])
          if (!existingZugestellt.rows.length) {
            await client.query(
              `INSERT INTO store_shipment_events (order_id, status, description, source, event_time) VALUES ($1::uuid, 'zugestellt', 'Paket wurde zugestellt', 'auto', now())`,
              [id]
            )
          }
        }
        const fireOrderShipped = trackingChanged || deliveryStatusChangedToVersendet
        const oRes = await client.query('SELECT * FROM store_orders WHERE id = $1::uuid', [id])
        const row = oRes.rows && oRes.rows[0]
        const iRes = await client.query('SELECT * FROM store_order_items WHERE order_id = $1 ORDER BY created_at', [id])
        const items = (iRes.rows || []).map(r => ({ id: r.id, variant_id: r.variant_id, product_id: r.product_id, quantity: r.quantity, unit_price_cents: r.unit_price_cents, title: r.title, thumbnail: r.thumbnail, product_handle: r.product_handle }))
        await client.end()
        res.json({
          order: {
            ...row,
            total_cents: resolveOrderPaidTotalCents(row),
            order_number: row.order_number ? Number(row.order_number) : null,
            items,
          },
        })
        if (fireOrderShipped) {
          setImmediate(() => {
            runAutomationFlowsForOrder({ triggerKey: 'order_shipped', orderId: id }).catch((fe) => {
              console.warn('runAutomationFlowsForOrder order_shipped:', fe?.message || fe)
            })
          })
        }
      } catch (e) {
        if (client) try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    const adminHubOrderDELETE = async (req, res) => {
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      const id = (req.params.id || '').trim()
      if (!id) return res.status(400).json({ message: 'id required' })
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        await client.query('DELETE FROM store_orders WHERE id = $1::uuid', [id])
        await client.end()
        res.json({ success: true })
      } catch (e) {
        if (client) try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    const adminHubOrderPOST = async (req, res) => {
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        const {
          email, first_name, last_name, phone, country,
          address_line1, address_line2, zip_code, city,
          items = [], shipping_cents = 0, discount_cents = 0,
          order_status = 'offen', payment_status = 'offen', delivery_status = 'offen',
          payment_method = '', currency = 'EUR', notes = '',
          newsletter_opted_in = false,
        } = req.body || {}
        if (!email) return res.status(400).json({ message: 'email required' })
        // Auto-complete: if both paid and delivered, set completed
        const effectiveOrderStatus = (payment_status === 'bezahlt' && delivery_status === 'zugestellt') ? 'abgeschlossen' : order_status
        // Calculate total
        const itemsTotal = items.reduce((s, it) => s + (Number(it.unit_price_cents||0) * Number(it.quantity||1)), 0)
        const total_cents = itemsTotal + Number(shipping_cents||0) - Number(discount_cents||0)
        const subtotal_cents = itemsTotal
        // Insert order
        const orderR = await client.query(
          `INSERT INTO store_orders (email, first_name, last_name, phone, country, address_line1, address_line2, zip_code, city,
            total_cents, subtotal_cents, shipping_cents, discount_cents,
            order_status, payment_status, delivery_status, payment_method, currency, notes, newsletter_opted_in)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
           RETURNING id, order_number`,
          [email, first_name||null, last_name||null, phone||null, country||null,
           address_line1||null, address_line2||null, zip_code||null, city||null,
           total_cents, subtotal_cents, Number(shipping_cents||0), Number(discount_cents||0),
           effectiveOrderStatus, payment_status, delivery_status, payment_method||null, currency, notes||null, newsletter_opted_in]
        )
        const order = orderR.rows[0]
        // Insert items
        for (const it of items) {
          await client.query(
            `INSERT INTO store_order_items (order_id, title, quantity, unit_price_cents, product_handle, thumbnail)
             VALUES ($1,$2,$3,$4,$5,$6)`,
            [order.id, it.title||'', Number(it.quantity||1), Number(it.unit_price_cents||0), it.product_handle||null, it.thumbnail||null]
          )
        }
        // Upsert customer
        if (email) {
          await client.query(
            `INSERT INTO store_customers (email, first_name, last_name, phone, country, address_line1, address_line2, zip_code, city, account_type)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'gastkunde')
             ON CONFLICT (email) DO UPDATE SET
               first_name = EXCLUDED.first_name, last_name = EXCLUDED.last_name,
               phone = COALESCE(EXCLUDED.phone, store_customers.phone),
               country = COALESCE(EXCLUDED.country, store_customers.country),
               address_line1 = COALESCE(EXCLUDED.address_line1, store_customers.address_line1),
               zip_code = COALESCE(EXCLUDED.zip_code, store_customers.zip_code),
               city = COALESCE(EXCLUDED.city, store_customers.city),
               updated_at = NOW()`,
            [email, first_name||null, last_name||null, phone||null, country||null, address_line1||null, address_line2||null, zip_code||null, city||null]
          )
        }
        await client.end()
        res.json({ order: { id: order.id, order_number: order.order_number ? Number(order.order_number) : null } })
      } catch (e) {
        if (client) try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    // ── Admin Hub Customers ───────────────────────────────────────
    const adminHubCustomersGET = async (req, res) => {
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        const { search = '', limit = '50', offset = '0' } = req.query
        const lim = Math.min(Number(limit)||50, 200)
        const off = Number(offset)||0
        // Seller isolation: non-superusers only see customers who ordered from them
        const isSuperuser = req.sellerUser?.is_superuser || false
        const sellerSellerId = req.sellerUser?.seller_id
        let whereParts = []
        let params = []
        // Restrict to seller's own customers
        if (!isSuperuser && sellerSellerId) {
          params.push(sellerSellerId)
          whereParts.push(`EXISTS (SELECT 1 FROM store_orders o WHERE LOWER(o.email) = LOWER(c.email) AND o.seller_id = $${params.length})`)
        }
        if (search) {
          params.push(`%${search}%`)
          whereParts.push(`(c.email ILIKE $${params.length} OR c.first_name ILIKE $${params.length} OR c.last_name ILIKE $${params.length})`)
          const numSearch = search.replace(/^#/, '').trim()
          if (/^\d+$/.test(numSearch)) {
            params.push(Number(numSearch))
            whereParts.push(`c.customer_number = $${params.length}`)
          }
        }
        const where = whereParts.length > 0 ? 'WHERE ' + whereParts.join(' AND ') : ''
        // For stats, also filter by seller if not superuser
        const orderStatsSeller = (!isSuperuser && sellerSellerId) ? `WHERE seller_id = '${sellerSellerId.replace(/'/g,"''")}'` : ''
        const q = `
          SELECT c.id, c.customer_number, c.email, c.first_name, c.last_name, c.phone, c.country,
                 c.account_type, c.created_at,
                 c.password_hash IS NOT NULL AS is_registered,
                 COALESCE(s.order_count,0) AS order_count,
                 COALESCE(s.total_spent,0) AS total_spent,
                 s.first_order, s.last_order,
                 COALESCE(s.newsletter_opted_in, false) AS newsletter_opted_in,
                 (SELECT seller_id FROM store_orders WHERE LOWER(email) = LOWER(c.email) AND seller_id IS NOT NULL AND seller_id != 'default' ORDER BY created_at DESC LIMIT 1) AS main_seller_id
          FROM store_customers c
          LEFT JOIN (
            SELECT email, COUNT(*) AS order_count, SUM(total_cents) AS total_spent,
                   MIN(created_at) AS first_order, MAX(created_at) AS last_order,
                   BOOL_OR(newsletter_opted_in) AS newsletter_opted_in
            FROM store_orders ${orderStatsSeller} GROUP BY email
          ) s ON LOWER(s.email) = LOWER(c.email)
          ${where}
          ORDER BY c.created_at DESC
          LIMIT $${params.length+1} OFFSET $${params.length+2}
        `
        params.push(lim, off)
        const r = await client.query(q, params)
        await client.end()
        res.json({ customers: (r.rows || []).map(row => ({
          ...row,
          customer_number: row.customer_number ? Number(row.customer_number) : null,
          is_registered: row.is_registered === true || row.is_registered === 't',
          newsletter_opted_in: row.newsletter_opted_in === true || row.newsletter_opted_in === 't',
        })) })
      } catch (e) {
        if (client) try { await client.end() } catch (_) {}
        res.json({ customers: [] })
      }
    }

    const adminHubCustomerPOST = async (req, res) => {
      if (!req.sellerUser?.is_superuser) return res.status(403).json({ message: 'Superuser access required' })
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        const { email, first_name, last_name, phone, account_type, address_line1, address_line2, zip_code, city, country, company_name, vat_number } = req.body || {}
        if (!email) return res.status(400).json({ message: 'email required' })
        const r = await client.query(
          `INSERT INTO store_customers (email, first_name, last_name, phone, account_type, address_line1, address_line2, zip_code, city, country, company_name, vat_number)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
           RETURNING id, customer_number, email, first_name, last_name, phone, account_type, address_line1, address_line2, zip_code, city, country, company_name, vat_number, created_at`,
          [email, first_name||null, last_name||null, phone||null, account_type||'privat', address_line1||null, address_line2||null, zip_code||null, city||null, country||null, company_name||null, vat_number||null]
        )
        await client.end()
        const row = r.rows[0]
        res.json({ customer: { ...row, customer_number: row.customer_number ? Number(row.customer_number) : null } })
      } catch (e) {
        if (client) try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    const adminHubCustomerPATCH = async (req, res) => {
      if (!req.sellerUser?.is_superuser) return res.status(403).json({ message: 'Superuser access required' })
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      const id = (req.params.id || '').trim()
      if (!id) return res.status(400).json({ message: 'id required' })
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        const allowed = ['email','first_name','last_name','phone','account_type','address_line1','address_line2','zip_code','city','country','company_name','vat_number','billing_address_line1','billing_address_line2','billing_zip_code','billing_city','billing_country','gender','birth_date','notes','email_marketing_consent','bonus_points']
        const body = req.body || {}
        const sets = []
        const vals = []
        for (const key of allowed) {
          if (key in body) { vals.push(body[key]); sets.push(`${key} = $${vals.length}`) }
        }
        if (sets.length === 0) return res.status(400).json({ message: 'no fields to update' })
        vals.push(id)
        const r = await client.query(
          `UPDATE store_customers SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${vals.length}::uuid
           RETURNING id, customer_number, email, first_name, last_name, phone, account_type, address_line1, address_line2, zip_code, city, country, company_name, vat_number, created_at, updated_at`,
          vals
        )
        await client.end()
        if (!r.rows[0]) return res.status(404).json({ message: 'Customer not found' })
        const row = r.rows[0]
        res.json({ customer: { ...row, customer_number: row.customer_number ? Number(row.customer_number) : null } })
      } catch (e) {
        if (client) try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    const adminHubCustomerDELETE = async (req, res) => {
      if (!req.sellerUser?.is_superuser) return res.status(403).json({ message: 'Superuser access required' })
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      const id = (req.params.id || '').trim()
      if (!id) return res.status(400).json({ message: 'id required' })
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        const found = await client.query('SELECT email FROM store_customers WHERE id = $1::uuid', [id])
        const emailRow = found.rows[0]
        if (!emailRow) {
          await client.end()
          return res.status(404).json({ message: 'Customer not found' })
        }
        // UNIQUE(email) is case-sensitive in PostgreSQL; remove every row for this address so shop register works again
        const del = await client.query(
          'DELETE FROM store_customers WHERE LOWER(TRIM(email)) = LOWER(TRIM($1)) RETURNING id',
          [emailRow.email],
        )
        await client.end()
        res.json({ success: true, deleted: (del.rows || []).length })
      } catch (e) {
        if (client) try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    const adminHubCustomerDiscountPOST = async (req, res) => {
      if (!req.sellerUser?.is_superuser) return res.status(403).json({ message: 'Superuser access required' })
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      const customerId = (req.params.id || '').trim()
      if (!customerId) return res.status(400).json({ message: 'id required' })
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        const { code, type = 'percentage', value = 0, min_order_cents = 0, max_uses = 1, expires_at, notes } = req.body || {}
        if (!code) return res.status(400).json({ message: 'code required' })
        const r = await client.query(
          `INSERT INTO store_customer_discounts (customer_id, code, type, value, min_order_cents, max_uses, expires_at, notes)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
           RETURNING id, code, type, value, min_order_cents, max_uses, used_count, expires_at, notes, created_at`,
          [customerId, code.toUpperCase(), type, Number(value), Number(min_order_cents||0), Number(max_uses||1), expires_at||null, notes||null]
        )
        await client.end()
        res.json({ discount: r.rows[0] })
      } catch (e) {
        if (client) try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    const adminHubCustomerDiscountDELETE = async (req, res) => {
      if (!req.sellerUser?.is_superuser) return res.status(403).json({ message: 'Superuser access required' })
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      const { customerId, discountId } = req.params
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        await client.query('DELETE FROM store_customer_discounts WHERE id = $1::uuid AND customer_id = $2::uuid', [discountId, customerId])
        await client.end()
        res.json({ success: true })
      } catch (e) {
        if (client) try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    const adminHubCustomerBonusLedgerPOST = async (req, res) => {
      if (!req.sellerUser?.is_superuser) return res.status(403).json({ message: 'Superuser access required' })
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      const customerId = (req.params.id || '').trim()
      if (!customerId) return res.status(400).json({ message: 'id required' })
      const body = req.body || {}
      const description = (body.description || '').toString().trim()
      const delta = parseInt(body.points_delta, 10)
      if (!description) return res.status(400).json({ message: 'description required' })
      if (!Number.isFinite(delta) || delta === 0) return res.status(400).json({ message: 'points_delta must be non-zero integer' })
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        const ex = await client.query('SELECT id FROM store_customers WHERE id = $1::uuid', [customerId])
        if (!ex.rows?.[0]) {
          await client.end()
          return res.status(404).json({ message: 'Customer not found' })
        }
        const occurredAt = body.occurred_at ? new Date(body.occurred_at).toISOString() : null
        await appendBonusLedger(client, {
          customerId,
          pointsDelta: delta,
          description,
          source: 'manual',
          occurredAt,
          skipBalanceUpdate: false,
        })
        const insR = await client.query(
          `SELECT id, occurred_at, points_delta, description, source, order_id, created_at, updated_at
           FROM store_customer_bonus_ledger WHERE customer_id = $1::uuid ORDER BY id DESC LIMIT 1`,
          [customerId],
        )
        const row = insR.rows?.[0]
        const balR = await client.query('SELECT COALESCE(bonus_points,0) AS bp FROM store_customers WHERE id = $1::uuid', [customerId])
        await client.end()
        res.status(201).json({
          entry: row
            ? {
                id: row.id,
                occurred_at: row.occurred_at,
                points_delta: Number(row.points_delta),
                description: row.description,
                source: row.source,
                order_id: row.order_id,
                created_at: row.created_at,
                updated_at: row.updated_at,
              }
            : null,
          bonus_points: Number(balR.rows?.[0]?.bp || 0),
        })
      } catch (e) {
        if (client) try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    const adminHubCustomerBonusLedgerPATCH = async (req, res) => {
      if (!req.sellerUser?.is_superuser) return res.status(403).json({ message: 'Superuser access required' })
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      const customerId = (req.params.customerId || '').trim()
      const entryId = (req.params.entryId || '').trim()
      if (!customerId || !entryId) return res.status(400).json({ message: 'customerId and entryId required' })
      const body = req.body || {}
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        const curR = await client.query(
          'SELECT id, points_delta, description, occurred_at FROM store_customer_bonus_ledger WHERE id = $1::uuid AND customer_id = $2::uuid',
          [entryId, customerId],
        )
        const cur = curR.rows?.[0]
        if (!cur) {
          await client.end()
          return res.status(404).json({ message: 'Entry not found' })
        }
        const oldDelta = Number(cur.points_delta)
        let newDelta = oldDelta
        if (body.points_delta !== undefined && body.points_delta !== null) {
          newDelta = parseInt(body.points_delta, 10)
          if (!Number.isFinite(newDelta) || newDelta === 0) {
            await client.end()
            return res.status(400).json({ message: 'points_delta must be non-zero integer' })
          }
        }
        const newDesc = body.description != null ? String(body.description).trim() : cur.description
        if (!newDesc) {
          await client.end()
          return res.status(400).json({ message: 'description required' })
        }
        let newOccurred = cur.occurred_at
        if (body.occurred_at != null && body.occurred_at !== '') {
          newOccurred = new Date(body.occurred_at).toISOString()
        }
        const diff = newDelta - oldDelta
        await client.query(
          `UPDATE store_customer_bonus_ledger SET description = $1, points_delta = $2, occurred_at = $3::timestamptz, updated_at = NOW()
           WHERE id = $4::uuid AND customer_id = $5::uuid`,
          [newDesc, newDelta, newOccurred, entryId, customerId],
        )
        if (diff !== 0) {
          await client.query(
            `UPDATE store_customers SET bonus_points = COALESCE(bonus_points, 0) + $1, updated_at = NOW() WHERE id = $2::uuid`,
            [diff, customerId],
          )
        }
        const outR = await client.query(
          'SELECT id, occurred_at, points_delta, description, source, order_id, created_at, updated_at FROM store_customer_bonus_ledger WHERE id = $1::uuid',
          [entryId],
        )
        const balR = await client.query('SELECT COALESCE(bonus_points,0) AS bp FROM store_customers WHERE id = $1::uuid', [customerId])
        await client.end()
        const row = outR.rows?.[0]
        res.json({
          entry: row
            ? {
                id: row.id,
                occurred_at: row.occurred_at,
                points_delta: Number(row.points_delta),
                description: row.description,
                source: row.source,
                order_id: row.order_id,
                created_at: row.created_at,
                updated_at: row.updated_at,
              }
            : null,
          bonus_points: Number(balR.rows?.[0]?.bp || 0),
        })
      } catch (e) {
        if (client) try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    const adminHubCustomerBonusLedgerDELETE = async (req, res) => {
      if (!req.sellerUser?.is_superuser) return res.status(403).json({ message: 'Superuser access required' })
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      const customerId = (req.params.customerId || '').trim()
      const entryId = (req.params.entryId || '').trim()
      if (!customerId || !entryId) return res.status(400).json({ message: 'customerId and entryId required' })
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        const curR = await client.query(
          'SELECT points_delta FROM store_customer_bonus_ledger WHERE id = $1::uuid AND customer_id = $2::uuid',
          [entryId, customerId],
        )
        const cur = curR.rows?.[0]
        if (!cur) {
          await client.end()
          return res.status(404).json({ message: 'Entry not found' })
        }
        const oldDelta = Number(cur.points_delta)
        await client.query('DELETE FROM store_customer_bonus_ledger WHERE id = $1::uuid AND customer_id = $2::uuid', [entryId, customerId])
        await client.query(
          `UPDATE store_customers SET bonus_points = COALESCE(bonus_points, 0) - $1, updated_at = NOW() WHERE id = $2::uuid`,
          [oldDelta, customerId],
        )
        const balR = await client.query('SELECT COALESCE(bonus_points,0) AS bp FROM store_customers WHERE id = $1::uuid', [customerId])
        await client.end()
        res.json({ success: true, bonus_points: Number(balR.rows?.[0]?.bp || 0) })
      } catch (e) {
        if (client) try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    const adminHubCustomerByIdGET = async (req, res) => {
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      const id = (req.params.id || '').trim()
      if (!id) return res.status(400).json({ message: 'id required' })
      const isSuperuser = req.sellerUser?.is_superuser || false
      const sellerSellerId = req.sellerUser?.seller_id || null
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        const custR = await client.query(
          `SELECT id, customer_number, email, first_name, last_name, phone, account_type,
                  address_line1, address_line2, zip_code, city, country, company_name, vat_number,
                  billing_address_line1, billing_address_line2, billing_zip_code, billing_city, billing_country,
                  password_hash IS NOT NULL AS is_registered,
                  gender, birth_date, notes, email_marketing_consent,
                  COALESCE(bonus_points, 0) AS bonus_points,
                  created_at, updated_at
           FROM store_customers WHERE id = $1::uuid`,
          [id]
        )
        if (!custR.rows || !custR.rows[0]) { await client.end(); return res.status(404).json({ message: 'Customer not found' }) }
        const row = custR.rows[0]
        if (!isSuperuser && sellerSellerId) {
          const acc = await client.query(
            `SELECT 1 FROM store_customers c
             WHERE c.id = $1::uuid AND EXISTS (
               SELECT 1 FROM store_orders o WHERE LOWER(o.email) = LOWER(c.email) AND o.seller_id = $2
             )`,
            [id, sellerSellerId],
          )
          if (!acc.rows?.[0]) {
            await client.end()
            return res.status(404).json({ message: 'Customer not found' })
          }
        }
        let ordersQ = `SELECT id, order_number, order_status, payment_status, delivery_status,
                  total_cents, currency, newsletter_opted_in, created_at
           FROM store_orders WHERE LOWER(email) = LOWER($1)`
        const ordersParams = [row.email]
        if (!isSuperuser && sellerSellerId) {
          ordersParams.push(sellerSellerId)
          ordersQ += ` AND seller_id = $2`
        }
        ordersQ += ' ORDER BY created_at DESC'
        const ordersR = await client.query(ordersQ, ordersParams)
        const orders = (ordersR.rows || []).map(r => ({ ...r, order_number: r.order_number ? Number(r.order_number) : null }))
        const newsletterOptedIn = orders.some(o => o.newsletter_opted_in)
        const discountsR = await client.query(
          `SELECT id, code, type, value, min_order_cents, max_uses, used_count, expires_at, notes, created_at
           FROM store_customer_discounts WHERE customer_id = $1 ORDER BY created_at DESC`,
          [id]
        )
        const discounts = discountsR.rows || []
        let bonus_ledger = []
        if (isSuperuser) {
          try {
            const ledR = await client.query(
              `SELECT id, occurred_at, points_delta, description, source, order_id, created_at, updated_at
               FROM store_customer_bonus_ledger WHERE customer_id = $1::uuid
               ORDER BY occurred_at DESC NULLS LAST, created_at DESC`,
              [id],
            )
            bonus_ledger = (ledR.rows || []).map((e) => ({
              id: e.id,
              occurred_at: e.occurred_at,
              points_delta: Number(e.points_delta),
              description: stripLegacyBonusLedgerVersandSuffix(e.description),
              source: e.source,
              order_id: e.order_id,
              created_at: e.created_at,
              updated_at: e.updated_at,
            }))
          } catch (_) {
            bonus_ledger = []
          }
        }
        await client.end()
        const { bonus_points: _rowBonus, ...rowWithoutBonus } = row
        const customerBase = {
          ...rowWithoutBonus,
          customer_number: row.customer_number ? Number(row.customer_number) : null,
          is_registered: row.is_registered === true || row.is_registered === 't',
          newsletter_opted_in: newsletterOptedIn,
          birth_date: row.birth_date || null,
          orders,
          discounts,
        }
        if (isSuperuser) {
          customerBase.bonus_points = Number(row.bonus_points || 0)
          customerBase.bonus_ledger = bonus_ledger
        }
        res.json({ customer: customerBase })
      } catch (e) {
        if (client) try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    const adminHubCarriersGET = async (req, res) => {
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      const isSuperuser = req.sellerUser?.is_superuser === true
      const callerSellerId = req.sellerUser?.seller_id || null
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        let r
        if (isSuperuser) {
          r = await client.query('SELECT * FROM store_shipping_carriers ORDER BY sort_order ASC, created_at ASC')
        } else {
          r = await client.query(
            `SELECT * FROM store_shipping_carriers
             WHERE seller_id = $1
             ORDER BY sort_order ASC, created_at ASC`,
            [callerSellerId]
          )
        }
        await client.end()
        res.json({ carriers: r.rows || [] })
      } catch (e) {
        if (client) try { await client.end() } catch (_) {}
        res.json({ carriers: [] })
      }
    }

    const adminHubCarrierPOST = async (req, res) => {
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      const isSuperuser = req.sellerUser?.is_superuser === true
      const callerSellerId = req.sellerUser?.seller_id || null
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        const { name, tracking_url_template, api_key, api_secret, is_active = true, sort_order = 0 } = req.body || {}
        if (!name) return res.status(400).json({ message: 'name required' })
        const r = await client.query(
          `INSERT INTO store_shipping_carriers (name, tracking_url_template, api_key, api_secret, seller_id, is_active, sort_order)
           VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
          [name, tracking_url_template||null, api_key||null, api_secret||null, isSuperuser ? null : callerSellerId, is_active, Number(sort_order||0)]
        )
        await client.end()
        res.json({ carrier: r.rows[0] })
      } catch (e) {
        if (client) try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    const adminHubCarrierPATCH = async (req, res) => {
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      const id = (req.params.id || '').trim()
      const isSuperuser = req.sellerUser?.is_superuser === true
      const callerSellerId = req.sellerUser?.seller_id || null
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        if (!isSuperuser) {
          const own = await client.query('SELECT id FROM store_shipping_carriers WHERE id = $1::uuid AND seller_id = $2', [id, callerSellerId])
          if (!own.rows[0]) {
            await client.end()
            return res.status(403).json({ message: 'Forbidden' })
          }
        }
        const allowed = ['name','tracking_url_template','api_key','api_secret','is_active','sort_order']
        const body = req.body || {}
        const sets = []; const vals = []
        for (const key of allowed) { if (key in body) { vals.push(body[key]); sets.push(`${key} = $${vals.length}`) } }
        if (sets.length === 0) return res.status(400).json({ message: 'no fields to update' })
        vals.push(id)
        const r = await client.query(
          `UPDATE store_shipping_carriers SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${vals.length}::uuid RETURNING *`, vals
        )
        await client.end()
        if (!r.rows[0]) return res.status(404).json({ message: 'Not found' })
        res.json({ carrier: r.rows[0] })
      } catch (e) {
        if (client) try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    const adminHubCarrierDELETE = async (req, res) => {
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      const id = (req.params.id || '').trim()
      const isSuperuser = req.sellerUser?.is_superuser === true
      const callerSellerId = req.sellerUser?.seller_id || null
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        if (!isSuperuser) {
          const own = await client.query('SELECT id FROM store_shipping_carriers WHERE id = $1::uuid AND seller_id = $2', [id, callerSellerId])
          if (!own.rows[0]) {
            await client.end()
            return res.status(403).json({ message: 'Forbidden' })
          }
        }
        await client.query('DELETE FROM store_shipping_carriers WHERE id = $1::uuid', [id])
        await client.end()
        res.json({ success: true })
      } catch (e) {
        if (client) try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    // ─── Shipment Events & Tracking ───────────────────────────────────────────

    const DEFAULT_TRACKING_URLS = {
      'dhl': 'https://www.dhl.de/de/privatkunden/pakete-empfangen/verfolgen.html?lang=de&idc={tracking_number}',
      'dpd': 'https://tracking.dpd.de/status/de_DE/parcel/{tracking_number}',
      'gls': 'https://gls-group.com/track/{tracking_number}',
      'ups': 'https://www.ups.com/track?tracknum={tracking_number}&loc=de_DE',
      'fedex': 'https://www.fedex.com/fedextrack/?trknbr={tracking_number}',
      'hermes': 'https://www.myhermes.de/empfangen/sendungsverfolgung/#/search?trackNumber={tracking_number}',
      'go! express': 'https://www.general-overnight.com/sendungsverfolgung/?tracking={tracking_number}',
      'go express': 'https://www.general-overnight.com/sendungsverfolgung/?tracking={tracking_number}',
    }
    function buildTrackingUrl(carrierName, trackingNumber, urlTemplate) {
      if (!trackingNumber) return null
      const tn = encodeURIComponent(String(trackingNumber).trim())
      const applyTemplate = (tpl) => tpl.replace(/\{tracking_number\}/g, tn).replace(/\{tracking\}/g, tn)
      if (urlTemplate) return applyTemplate(urlTemplate)
      const key = (carrierName || '').toLowerCase().trim()
      const tpl = DEFAULT_TRACKING_URLS[key]
      if (tpl) return applyTemplate(tpl)
      return null
    }

    const adminHubShipmentEventsGET = async (req, res) => {
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      const isSuperuser = req.sellerUser?.is_superuser === true
      const callerSellerId = isSuperuser ? null : (req.sellerUser?.seller_id || null)
      const id = (req.params.id || '').trim()
      if (!id) return res.status(400).json({ message: 'order id required' })
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        const ownerCheck = await client.query(
          'SELECT id, carrier_name, tracking_number FROM store_orders WHERE id=$1::uuid' + (isSuperuser ? '' : ' AND seller_id=$2'),
          isSuperuser ? [id] : [id, callerSellerId]
        )
        if (!ownerCheck.rows[0]) { await client.end(); return res.status(404).json({ message: 'Order not found' }) }
        const order = ownerCheck.rows[0]
        const evRes = await client.query('SELECT * FROM store_shipment_events WHERE order_id=$1::uuid ORDER BY event_time ASC, created_at ASC', [id])
        const carrierRes = await client.query(`SELECT tracking_url_template FROM store_shipping_carriers WHERE LOWER(TRIM(name))=LOWER(TRIM($1)) AND is_active=true LIMIT 1`, [order.carrier_name || ''])
        const urlTemplate = carrierRes.rows[0]?.tracking_url_template || null
        const trackingUrl = buildTrackingUrl(order.carrier_name, order.tracking_number, urlTemplate)
        await client.end()
        res.json({ events: evRes.rows || [], trackingUrl })
      } catch (e) {
        if (client) try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    const adminHubShipmentEventPOST = async (req, res) => {
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      const isSuperuser = req.sellerUser?.is_superuser === true
      const callerSellerId = isSuperuser ? null : (req.sellerUser?.seller_id || null)
      const id = (req.params.id || '').trim()
      if (!id) return res.status(400).json({ message: 'order id required' })
      const { status, description, location, event_time } = req.body || {}
      if (!status) return res.status(400).json({ message: 'status required' })
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        const ownerCheck = await client.query(
          'SELECT id FROM store_orders WHERE id=$1::uuid' + (isSuperuser ? '' : ' AND seller_id=$2'),
          isSuperuser ? [id] : [id, callerSellerId]
        )
        if (!ownerCheck.rows[0]) { await client.end(); return res.status(404).json({ message: 'Order not found' }) }
        const evRes = await client.query(
          `INSERT INTO store_shipment_events (order_id, status, description, location, event_time, source) VALUES ($1::uuid, $2, $3, $4, $5, 'manual') RETURNING *`,
          [id, status, description || null, location || null, event_time ? new Date(event_time).toISOString() : new Date().toISOString()]
        )
        const event = evRes.rows[0]
        if (status === 'zugestellt') {
          await client.query(`UPDATE store_orders SET delivery_status='zugestellt', delivery_date=COALESCE(delivery_date, now()), updated_at=now() WHERE id=$1::uuid AND delivery_status != 'zugestellt'`, [id])
          await client.query(`UPDATE store_orders SET order_status='abgeschlossen', updated_at=now() WHERE id=$1::uuid AND payment_status='bezahlt' AND delivery_status='zugestellt' AND order_status NOT IN ('abgeschlossen','retoure','retoure_anfrage','refunded','storniert')`, [id])
        } else if (status === 'versendet') {
          await client.query(`UPDATE store_orders SET delivery_status='versendet', updated_at=now() WHERE id=$1::uuid AND delivery_status NOT IN ('versendet','zugestellt')`, [id])
        }
        await client.end()
        res.json({ event })
      } catch (e) {
        if (client) try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    const adminHubShipmentEventDELETE = async (req, res) => {
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      const isSuperuser = req.sellerUser?.is_superuser === true
      const callerSellerId = isSuperuser ? null : (req.sellerUser?.seller_id || null)
      const eventId = (req.params.eventId || '').trim()
      if (!eventId) return res.status(400).json({ message: 'eventId required' })
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        const ownerCheck = await client.query(
          `SELECT e.id FROM store_shipment_events e JOIN store_orders o ON o.id=e.order_id WHERE e.id=$1::uuid` + (isSuperuser ? '' : ' AND o.seller_id=$2'),
          isSuperuser ? [eventId] : [eventId, callerSellerId]
        )
        if (!ownerCheck.rows[0]) { await client.end(); return res.status(404).json({ message: 'Event not found' }) }
        await client.query('DELETE FROM store_shipment_events WHERE id=$1::uuid', [eventId])
        await client.end()
        res.json({ success: true })
      } catch (e) {
        if (client) try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    // ─── Carrier API Tracking Refresh ─────────────────────────────────────────

    /**
     * Maps DHL event status codes / descriptions to our internal status values.
     * https://developer.dhl.com/api-reference/shipment-tracking
     * Packstation/Filiale: pickup by consignee = final delivery for our order flow → zugestellt
     */
    function mapDhlStatus(event) {
      const st = event?.status && typeof event.status === 'object' ? event.status : {}
      const code = String(st.statusCode || event?.statusCode || '').toUpperCase().replace(/-/g, '_')
      const desc = String(st.description || st.status || event?.description || '').toLowerCase()
      // Delivered to door or parcel locker / Filiale pickup (customer has the parcel)
      if (
        code === 'DELIVERED' ||
        code === 'PICKED_UP' ||
        code === 'PICKED_UP_BY_CONSIGNEE' ||
        code === 'CONSIGNMENT_PICKED_UP' ||
        code === 'SUCCESSFULLY_DELIVERED'
      ) return 'zugestellt'
      if (desc.includes('zugestellt') || desc.includes('successfully delivered') || desc.includes('erfolgreich zugestellt')) return 'zugestellt'
      if (desc.includes('abholung in der filiale') || desc.includes('abholung in der packstation')) return 'zugestellt'
      if (desc.includes('filiale') && desc.includes('abholung') && (desc.includes('erfolgt') || desc.includes('erfolgreich'))) return 'zugestellt'
      if (desc.includes('packstation') && (desc.includes('abgeholt') || desc.includes('abholung'))) return 'zugestellt'
      if (desc.includes('wunschfiliale') && desc.includes('bereit')) return 'in_transit'
      if (code === 'OUT_FOR_DELIVERY' || desc.includes('zur zustellung') || desc.includes('out for delivery')) return 'in_transit'
      if (code === 'IN_TRANSIT' || code === 'TRANSIT' || desc.includes('transport') || desc.includes('weitertransport') || desc.includes('in transit')) return 'in_transit'
      if (code === 'EXCEPTION' || desc.includes('ausnahme') || desc.includes('exception') || desc.includes('fehler')) return 'exception'
      if (code === 'PRE_TRANSIT' || desc.includes('aufgegeben') || desc.includes('pre-transit') || desc.includes('vorbereitung') || desc.includes('elektronisch angekündigt')) return 'versendet'
      return 'in_transit'
    }

    const adminHubOrderRefreshTrackingPOST = async (req, res) => {
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      const isSuperuser = req.sellerUser?.is_superuser === true
      const callerSellerId = isSuperuser ? null : (req.sellerUser?.seller_id || null)
      const id = (req.params.id || '').trim()
      if (!id) return res.status(400).json({ message: 'order id required' })
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        const ownerQ = await client.query(
          'SELECT id, carrier_name, tracking_number, postal_code FROM store_orders WHERE id=$1::uuid' + (isSuperuser ? '' : ' AND seller_id=$2'),
          isSuperuser ? [id] : [id, callerSellerId]
        )
        if (!ownerQ.rows[0]) { await client.end(); return res.status(404).json({ message: 'Order not found' }) }
        const order = ownerQ.rows[0]
        if (!order.tracking_number) { await client.end(); return res.json({ events: [], message: 'No tracking number' }) }

        // Look up carrier API key + tracking URL template from DB (env fallback so tracking works without per-carrier key)
        const carrierQ = await client.query(
          'SELECT name, tracking_url_template, api_key FROM store_shipping_carriers WHERE LOWER(TRIM(name))=LOWER(TRIM($1)) AND is_active=true LIMIT 1',
          [order.carrier_name || '']
        )
        const carrierRow = carrierQ.rows[0] || {}
        const carrierName = String(order.carrier_name || '').trim().toLowerCase()
        const trackingNumber = String(order.tracking_number || '').trim()
        const envDhlKey = (process.env.DHL_API_KEY || process.env.DHL_TRACK_API_KEY || process.env.DHLPARCEL_API_KEY || '').toString().trim()
        const apiKey = (carrierRow.api_key && String(carrierRow.api_key).trim()) || envDhlKey || null

        let newEvents = []
        let fetchError = null

        // ── DHL API ──────────────────────────────────────────────────────────
        if (carrierName === 'dhl' || carrierName.startsWith('dhl')) {
          if (!apiKey) {
            fetchError = 'DHL-API-Key fehlt: unter Einstellungen → Versand → Versanddienstleister „DHL“ einen API-Key eintragen, oder Umgebungsvariable DHL_API_KEY setzen.'
          } else try {
            const https = require('https')
            const pc = String(order.postal_code || '').trim().replace(/\s+/g, '')
            let path = `/track/shipments?trackingNumber=${encodeURIComponent(trackingNumber)}`
            if (pc) path += `&recipientPostalCode=${encodeURIComponent(pc)}`
            const dhlData = await new Promise((resolve, reject) => {
              const r = https.request(
                { hostname: 'api-eu.dhl.com', path, method: 'GET', headers: { 'DHL-API-Key': apiKey, Accept: 'application/json' } },
                (resp) => {
                  let body = ''
                  resp.on('data', (d) => { body += d })
                  resp.on('end', () => {
                    let parsed = {}
                    try {
                      parsed = JSON.parse(body || '{}')
                    } catch {
                      parsed = { _raw: body }
                    }
                    parsed._httpStatus = resp.statusCode
                    resolve(parsed)
                  })
                }
              )
              r.on('error', reject)
              r.end()
            })
            if (dhlData._httpStatus >= 400) {
              const detail = dhlData.detail || dhlData.title || dhlData.message || JSON.stringify(dhlData).slice(0, 200)
              fetchError = `DHL API (${dhlData._httpStatus}): ${detail}`
            } else {
              const shipment = dhlData?.shipments?.[0] || dhlData?.shipment || null
              let events = Array.isArray(shipment?.events) ? shipment.events : []
              if (!events.length && shipment?.status) {
                events = [{ timestamp: shipment.timestamp, status: shipment.status, location: shipment.location }]
              }
              for (const ev of events) {
                const tsRaw = ev.timestamp || ev.eventTimestamp || ev.status?.timestamp
                const ts = tsRaw ? new Date(tsRaw).toISOString() : new Date().toISOString()
                const addr = ev.location?.address || {}
                const location = [addr.addressLocality, addr.countryCode].filter(Boolean).join(', ') || null
                const desc = (ev.description || ev.status?.description || ev.status?.status || '').trim()
                const status = mapDhlStatus(ev)
                newEvents.push({ status, description: desc || '—', location, event_time: ts })
              }
              newEvents.sort((a, b) => new Date(a.event_time) - new Date(b.event_time))
            }
          } catch (e) {
            fetchError = e?.message || 'DHL API error'
          }
        }
        // ── DPD API ──────────────────────────────────────────────────────────
        // (DPD uses a SOAP API — add api_key support here if needed)
        // ── UPS API ──────────────────────────────────────────────────────────
        // (UPS uses OAuth2 — add here if needed)

        if (!newEvents.length) {
          const evFallback = await client.query('SELECT * FROM store_shipment_events WHERE order_id=$1::uuid ORDER BY event_time ASC, created_at ASC', [id])
          await client.end()
          let msg = fetchError
          if (!msg) {
            if (carrierName === 'dhl' || carrierName.startsWith('dhl')) {
              msg = 'Keine neuen Ereignisse von DHL — ggf. bereits synchron oder Sendung noch nicht im DHL-System.'
            } else {
              msg = 'Automatischer API-Abruf für diesen Versanddienst ist noch nicht angebunden.'
            }
          }
          return res.json({
            events: evFallback.rows || [],
            inserted: 0,
            message: msg,
            trackingUrl: buildTrackingUrl(order.carrier_name, trackingNumber, carrierRow.tracking_url_template),
          })
        }

        // Upsert events: insert only new ones (Zeit + Status + Beschreibung wie DHL liefert)
        let inserted = 0
        for (const ev of newEvents) {
          const exists = await client.query(
            `SELECT id FROM store_shipment_events WHERE order_id=$1::uuid AND status=$2 AND event_time=$3::timestamptz AND description IS NOT DISTINCT FROM $4 LIMIT 1`,
            [id, ev.status, ev.event_time, ev.description || null]
          )
          if (!exists.rows.length) {
            await client.query(
              `INSERT INTO store_shipment_events (order_id, status, description, location, event_time, source) VALUES ($1::uuid, $2, $3, $4, $5::timestamptz, 'api')`,
              [id, ev.status, ev.description || null, ev.location || null, ev.event_time]
            )
            inserted++
          }
        }
        const mostRecentEvent = newEvents[newEvents.length - 1]
        const mostRecentStatus = mostRecentEvent?.status
        if (mostRecentStatus === 'zugestellt') {
          await client.query(`UPDATE store_orders SET delivery_status='zugestellt', delivery_date=COALESCE(delivery_date, now()), updated_at=now() WHERE id=$1::uuid AND delivery_status != 'zugestellt'`, [id])
          await client.query(`UPDATE store_orders SET order_status='abgeschlossen', updated_at=now() WHERE id=$1::uuid AND payment_status='bezahlt' AND delivery_status='zugestellt' AND order_status NOT IN ('abgeschlossen','retoure','retoure_anfrage','refunded','storniert')`, [id])
        } else if (mostRecentStatus === 'versendet' || mostRecentStatus === 'in_transit') {
          await client.query(`UPDATE store_orders SET delivery_status='versendet', updated_at=now() WHERE id=$1::uuid AND delivery_status NOT IN ('versendet','zugestellt')`, [id])
        }
        const allEvents = await client.query('SELECT * FROM store_shipment_events WHERE order_id=$1::uuid ORDER BY event_time ASC, created_at ASC', [id])
        await client.end()
        res.json({ events: allEvents.rows || [], inserted, trackingUrl: buildTrackingUrl(order.carrier_name, trackingNumber, carrierRow.tracking_url_template) })
      } catch (e) {
        if (client) try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    // ──────────────────────────────────────────────────────────────────────────

    /** Row key in admin_hub_seller_settings for Billbee: real seller_id, or billbee_user_<seller_users.id> if missing. Never "default". */
    function getBillbeeAdminHubSellerSettingsKey(userPayload) {
      if (!userPayload || typeof userPayload !== 'object') return null
      const sid = userPayload.seller_id != null ? String(userPayload.seller_id).trim() : ''
      if (sid) return sid
      const uid = userPayload.id != null ? String(userPayload.id).trim() : ''
      if (uid) return `billbee_user_${uid}`
      return null
    }

    const adminHubIntegrationsGET = async (req, res) => {
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      const auth = req.headers['authorization'] || ''
      const token = auth.startsWith('Bearer ') ? auth.slice(7) : null
      const payload = token ? verifySellerToken(token) : null
      const scope = payload ? getBillbeeAdminHubSellerSettingsKey(payload) : null
      if (!scope) return res.json({ integrations: [] })
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        const r = await client.query(
          `SELECT id, name, slug, logo_url, api_key, is_active, category, created_at, updated_at
           FROM store_integrations
           WHERE seller_scope_key = $1
           ORDER BY name ASC`,
          [scope],
        )
        await client.end()
        res.json({ integrations: r.rows || [] })
      } catch (e) {
        if (client) try { await client.end() } catch (_) {}
        res.json({ integrations: [] })
      }
    }

    const adminHubIntegrationPOST = async (req, res) => {
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      const settingsKey = getBillbeeAdminHubSellerSettingsKey(req.sellerUser)
      if (!settingsKey) return res.status(401).json({ message: 'Invalid session' })
      const _c = require('crypto')
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        const { name, logo_url, webhook_url, config, is_active = true, category = 'custom' } = req.body || {}
        if (!name || !String(name).trim()) return res.status(400).json({ message: 'name required' })
        const genSlug = `int_${_c.randomBytes(16).toString('hex')}`
        const genKey = `andertal_zug_${_c.randomBytes(12).toString('hex')}`
        const genSec = `andertal_ssk_${_c.randomBytes(18).toString('hex')}`
        const r = await client.query(
          `INSERT INTO store_integrations (name, slug, logo_url, api_key, api_secret, webhook_url, config, is_active, category, seller_scope_key)
           VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10)
           RETURNING id, name, slug, logo_url, api_key, api_secret, is_active, category, created_at, updated_at`,
          [
            String(name).trim(),
            genSlug,
            logo_url || null,
            genKey,
            genSec,
            webhook_url || null,
            config ? JSON.stringify(config) : '{}',
            is_active !== false,
            category || 'custom',
            settingsKey,
          ],
        )
        const integration = r.rows && r.rows[0] ? r.rows[0] : null

        await client.end()
        res.json({ integration })
      } catch (e) {
        if (client) try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    const adminHubIntegrationPATCH = async (req, res) => {
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      const settingsKey = getBillbeeAdminHubSellerSettingsKey(req.sellerUser)
      if (!settingsKey) return res.status(401).json({ message: 'Invalid session' })
      const id = (req.params.id || '').trim()
      const _c = require('crypto')
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        const slugRow = await client.query(
          'SELECT slug, seller_scope_key FROM store_integrations WHERE id = $1::uuid',
          [id],
        )
        if (!slugRow.rows[0]) { await client.end(); return res.status(404).json({ message: 'Not found' }) }
        const rowSlug = slugRow.rows[0]
        const isBillbee = String(rowSlug.slug || '').toLowerCase() === 'billbee'
        if (!isBillbee && rowSlug.seller_scope_key !== settingsKey) {
          await client.end()
          return res.status(403).json({ message: 'Forbidden' })
        }
        const body = { ...(req.body || {}) }
        if (body.regenerate_secret === true || body.regenerate_secret === 'true') {
          const newSec = `andertal_ssk_${_c.randomBytes(18).toString('hex')}`
          const ur = await client.query(
            `UPDATE store_integrations SET api_secret = $2, updated_at = NOW() WHERE id = $1::uuid RETURNING id, name, slug, logo_url, api_key, api_secret, is_active, category, created_at, updated_at`,
            [id, newSec],
          )
          await client.end()
          if (!ur.rows[0]) return res.status(404).json({ message: 'Not found' })
          return res.json({ integration: ur.rows[0] })
        }
        if (isBillbee) {
          delete body.api_key
          delete body.api_secret
          delete body.webhook_url
        } else {
          delete body.api_key
          delete body.api_secret
        }
        delete body.regenerate_secret
        const allowed = ['name','logo_url','api_key','api_secret','webhook_url','config','is_active','category']
        const sets = []; const vals = []
        for (const key of allowed) { if (key in body) { vals.push(key === 'config' ? JSON.stringify(body[key]) : body[key]); sets.push(`${key} = $${vals.length}`) } }
        if (sets.length === 0) { await client.end(); return res.status(400).json({ message: 'no fields to update' }) }
        vals.push(id)
        const r = await client.query(
          `UPDATE store_integrations SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${vals.length}::uuid RETURNING id, name, slug, logo_url, is_active, category, updated_at`, vals
        )
        if (!r.rows[0]) { await client.end(); return res.status(404).json({ message: 'Not found' }) }
        const integration = r.rows[0]

        if (integration?.slug && String(integration.slug).toLowerCase() === 'billbee') {
          const cfg = body.config && typeof body.config === 'object' ? body.config : {}
          const basicUsername = cfg.basic_auth_username || cfg.username || ''
          const basicPassword = cfg.basic_auth_password || cfg.password || ''
          const billbeeApiKey = (req.body || {}).api_key || ''
          const billbeeConnName = (cfg.connection_name != null ? String(cfg.connection_name) : '').trim().slice(0, 200)

          if (billbeeApiKey && basicUsername && basicPassword) {
            await client.query(
              `INSERT INTO admin_hub_seller_settings (seller_id, billbee_api_key, billbee_basic_username, billbee_basic_password, billbee_connection_name, billbee_updated_at, updated_at)
               VALUES ($1, $2, $3, $4, $5, now(), now())
               ON CONFLICT (seller_id) DO UPDATE SET
                 billbee_api_key = EXCLUDED.billbee_api_key,
                 billbee_basic_username = EXCLUDED.billbee_basic_username,
                 billbee_basic_password = EXCLUDED.billbee_basic_password,
                 billbee_connection_name = COALESCE(NULLIF(EXCLUDED.billbee_connection_name, ''), admin_hub_seller_settings.billbee_connection_name),
                 billbee_updated_at = now(),
                 updated_at = now()`,
              [settingsKey, billbeeApiKey, basicUsername, basicPassword, billbeeConnName || null],
            )
          } else if (billbeeConnName) {
            await client.query(
              `INSERT INTO admin_hub_seller_settings (seller_id, billbee_connection_name, updated_at)
               VALUES ($1, $2, now())
               ON CONFLICT (seller_id) DO UPDATE SET
                 billbee_connection_name = EXCLUDED.billbee_connection_name,
                 updated_at = now()`,
              [settingsKey, billbeeConnName],
            )
          }
        }

        await client.end()
        res.json({ integration })
      } catch (e) {
        if (client) try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    const adminHubIntegrationDELETE = async (req, res) => {
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      const settingsKey = getBillbeeAdminHubSellerSettingsKey(req.sellerUser)
      if (!settingsKey) return res.status(401).json({ message: 'Invalid session' })
      const id = (req.params.id || '').trim()
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        const slugRow = await client.query(
          'SELECT slug, seller_scope_key FROM store_integrations WHERE id = $1::uuid',
          [id],
        )
        if (!slugRow.rows[0]) { await client.end(); return res.status(404).json({ message: 'Not found' }) }
        const isBillbee = String(slugRow.rows[0].slug || '').toLowerCase() === 'billbee'
        if (!isBillbee && slugRow.rows[0].seller_scope_key !== settingsKey) {
          await client.end()
          return res.status(403).json({ message: 'Forbidden' })
        }
        if (isBillbee) {
          await client.query(
            `UPDATE admin_hub_seller_settings SET
               billbee_api_key = NULL,
               billbee_basic_username = NULL,
               billbee_basic_password = NULL,
               billbee_connection_name = NULL,
               billbee_updated_at = NULL,
               updated_at = now()
             WHERE seller_id = $1`,
            [settingsKey],
          )
          await client.end()
          return res.json({ success: true })
        }
        await client.query('DELETE FROM store_integrations WHERE id = $1::uuid', [id])
        await client.end()
        res.json({ success: true })
      } catch (e) {
        if (client) try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    /** Shop TrustBox: slug `trustpilot`, api_key = Business Unit ID (public in embeds). Superuser only. */
    const TRUSTPILOT_PLATFORM_SCOPE = 'platform'

    const adminHubTrustpilotGET = async (req, res) => {
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        const r = await client.query(
          `SELECT api_key, config, is_active FROM store_integrations WHERE LOWER(TRIM(slug)) = 'trustpilot' LIMIT 1`,
        )
        await client.end()
        const row = r.rows[0]
        if (!row) {
          return res.json({ configured: false, business_unit_id: '', template_id: '', evaluate_url: '', is_active: false })
        }
        let cfg = {}
        try {
          const c = row.config
          cfg = typeof c === 'string' ? JSON.parse(c) : (c && typeof c === 'object' ? c : {})
        } catch (_) {}
        const tid = (cfg.template_id || cfg.templateId || '').toString().trim()
        const evaluateUrl = (cfg.evaluate_url || cfg.evaluateUrl || '').toString().trim()
        res.json({
          configured: true,
          business_unit_id: row.api_key ? String(row.api_key).trim() : '',
          template_id: tid,
          evaluate_url: evaluateUrl,
          is_active: row.is_active !== false,
        })
      } catch (e) {
        if (client) try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    const adminHubTrustpilotPUT = async (req, res) => {
      const body = req.body || {}
      const bu = String(body.business_unit_id ?? body.businessUnitId ?? '').trim()
      const is_active = body.is_active !== false && body.is_active !== 'false'
      if (!bu) return res.status(400).json({ message: 'business_unit_id required' })
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        const prev = await client.query(
          `SELECT config FROM store_integrations WHERE LOWER(TRIM(slug)) = 'trustpilot' LIMIT 1`,
        )
        let cfg = {}
        try {
          const c = prev.rows[0] && prev.rows[0].config
          cfg = typeof c === 'string' ? JSON.parse(c) : c && typeof c === 'object' ? { ...c } : {}
        } catch (_) {
          cfg = {}
        }
        if (Object.prototype.hasOwnProperty.call(body, 'template_id') || Object.prototype.hasOwnProperty.call(body, 'templateId')) {
          const templateRaw = body.template_id ?? body.templateId
          const t = templateRaw != null ? String(templateRaw).trim() : ''
          if (t) cfg.template_id = t
          else delete cfg.template_id
        }
        if (Object.prototype.hasOwnProperty.call(body, 'evaluate_url') || Object.prototype.hasOwnProperty.call(body, 'evaluateUrl')) {
          const evaluateRaw = body.evaluate_url ?? body.evaluateUrl
          const u = evaluateRaw != null ? String(evaluateRaw).trim() : ''
          if (u) {
            const ok = /^https:\/\//i.test(u)
            if (!ok) {
              await client.end()
              return res.status(400).json({ message: 'evaluate_url must be an https URL' })
            }
            cfg.evaluate_url = u
          } else delete cfg.evaluate_url
        }
        const configJson = JSON.stringify(cfg)
        const r = await client.query(
          `INSERT INTO store_integrations (name, slug, logo_url, api_key, api_secret, webhook_url, config, is_active, category, seller_scope_key)
           VALUES ('Trustpilot', 'trustpilot', NULL, $1, NULL, NULL, $2::jsonb, $3, 'reviews', $4)
           ON CONFLICT (slug) DO UPDATE SET
             api_key = EXCLUDED.api_key,
             config = EXCLUDED.config,
             is_active = EXCLUDED.is_active,
             updated_at = NOW()
           RETURNING id, name, slug, is_active, updated_at`,
          [bu, configJson, is_active, TRUSTPILOT_PLATFORM_SCOPE],
        )
        await client.end()
        res.json({ success: true, integration: r.rows[0] })
      } catch (e) {
        if (client) try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    const ensureSellerBillbeeCredentials = async (client, sellerId, forceRegenerate = false) => {
      const existing = await client.query(
        'SELECT billbee_api_key, billbee_basic_username, billbee_basic_password FROM admin_hub_seller_settings WHERE seller_id = $1 LIMIT 1',
        [sellerId],
      )
      const row = existing.rows && existing.rows[0]
      const hasAll = row && row.billbee_api_key && row.billbee_basic_username && row.billbee_basic_password
      if (hasAll && !forceRegenerate) {
        return {
          api_key: String(row.billbee_api_key),
          basic_auth_username: String(row.billbee_basic_username),
          basic_auth_password: String(row.billbee_basic_password),
        }
      }
      // We cannot invent Billbee credentials. They must come from the Billbee integration UI.
      // If credentials are missing, return empty values so the user can enter them manually.
      if (!hasAll) {
        if (forceRegenerate) {
          throw new Error('Billbee credentials are missing. Please enter the credentials from Billbee (Schlüssel + Basic Auth username/password) and save.');
        }
        return { api_key: '', basic_auth_username: '', basic_auth_password: '' }
      }

      // If only regenerate was requested but we already have values, keep them.
      if (hasAll && forceRegenerate) {
        return {
          api_key: String(row.billbee_api_key),
          basic_auth_username: String(row.billbee_basic_username),
          basic_auth_password: String(row.billbee_basic_password),
        }
      }
    }

    const getBillbeePublicBaseUrl = () =>
      (process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || '').replace(/\/$/, '') || 'https://andertal-medusa-backend.onrender.com'

    const adminHubBillbeeCredentialsGET = async (req, res) => {
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      const settingsKey = getBillbeeAdminHubSellerSettingsKey(req.sellerUser)
      if (!settingsKey) return res.status(401).json({ message: 'Invalid session' })
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        const r = await client.query(
          `SELECT billbee_api_key, billbee_basic_username, billbee_basic_password, store_name, billbee_connection_name
           FROM admin_hub_seller_settings WHERE seller_id = $1 LIMIT 1`,
          [settingsKey],
        )
        const row = r.rows && r.rows[0]
        await client.end()
        const creds =
          row && row.billbee_api_key && row.billbee_basic_username && row.billbee_basic_password
            ? {
                api_key: String(row.billbee_api_key),
                basic_auth_username: String(row.billbee_basic_username),
                basic_auth_password: String(row.billbee_basic_password),
              }
            : { api_key: '', basic_auth_username: '', basic_auth_password: '' }
        const store_name = row && row.store_name != null ? String(row.store_name).trim() : ''
        const connection_name = row && row.billbee_connection_name != null ? String(row.billbee_connection_name).trim() : ''
        const name_for_billbee = connection_name || store_name || 'Andertal'
        const base = getBillbeePublicBaseUrl()
        const webhook_url = `${base}/admin-hub/v1/integrations/billbee/webhook`
        const has_credentials = !!(creds.api_key && creds.basic_auth_username && creds.basic_auth_password)
        return res.json({
          credentials: creds,
          seller_id: settingsKey,
          generated: has_credentials,
          webhook_url,
          connection_name,
          name_for_billbee,
          store_name,
        })
      } catch (e) {
        if (client) try { await client.end() } catch (_) {}
        return res.status(500).json({ message: e?.message || 'Billbee credentials unavailable' })
      }
    }

    const adminHubBillbeeCredentialsPATCH = async (req, res) => {
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      const settingsKey = getBillbeeAdminHubSellerSettingsKey(req.sellerUser)
      if (!settingsKey) return res.status(401).json({ message: 'Invalid session' })
      const body = req.body || {}
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        const r = await client.query(
          `SELECT billbee_api_key, billbee_basic_username, billbee_basic_password, store_name, billbee_connection_name
           FROM admin_hub_seller_settings WHERE seller_id = $1 LIMIT 1`,
          [settingsKey],
        )
        const row = r.rows && r.rows[0] ? r.rows[0] : {}
        let api = row.billbee_api_key != null ? String(row.billbee_api_key).trim() : ''
        let user = row.billbee_basic_username != null ? String(row.billbee_basic_username).trim() : ''
        let pass = row.billbee_basic_password != null ? String(row.billbee_basic_password) : ''
        let conn = row.billbee_connection_name != null ? String(row.billbee_connection_name).trim() : ''

        if ('api_key' in body) api = String(body.api_key ?? '').trim()
        if ('basic_auth_username' in body) user = String(body.basic_auth_username ?? '').trim()
        if ('basic_auth_password' in body && String(body.basic_auth_password ?? '').length > 0) {
          pass = String(body.basic_auth_password)
        }
        if ('connection_name' in body) conn = String(body.connection_name ?? '').trim().slice(0, 200)

        const credPresentInBody =
          'api_key' in body ||
          'basic_auth_username' in body ||
          ('basic_auth_password' in body && String(body.basic_auth_password ?? '').length > 0)
        if (credPresentInBody && (!api || !user || !pass)) {
          await client.end()
          return res.status(400).json({
            message:
              'Schlüssel, Basic-Auth Benutzername und Basic-Auth Passwort sind vollständig erforderlich, sobald du eines dieser Felder mitsendest.',
          })
        }

        const billbeeUpdatedAt =
          api && user && pass ? new Date() : null
        await client.query(
          `INSERT INTO admin_hub_seller_settings (
             seller_id, billbee_api_key, billbee_basic_username, billbee_basic_password, billbee_connection_name, billbee_updated_at, updated_at
           ) VALUES ($1, $2, $3, $4, $5, $6, now())
           ON CONFLICT (seller_id) DO UPDATE SET
             billbee_api_key = $2::text,
             billbee_basic_username = $3::text,
             billbee_basic_password = $4::text,
             billbee_connection_name = NULLIF($5::text, ''),
             billbee_updated_at = CASE
               WHEN $2::text <> '' AND $3::text <> '' AND $4::text <> '' THEN COALESCE($6::timestamp, now())
               ELSE admin_hub_seller_settings.billbee_updated_at
             END,
             updated_at = now()`,
          [settingsKey, api || null, user || null, pass || null, conn || null, billbeeUpdatedAt],
        )
        await client.end()

        const base = getBillbeePublicBaseUrl()
        const webhook_url = `${base}/admin-hub/v1/integrations/billbee/webhook`
        const store_name = row.store_name != null ? String(row.store_name).trim() : ''
        const name_for_billbee = conn || store_name || 'Andertal'
        const has_credentials = !!(api && user && pass)
        return res.json({
          credentials: {
            api_key: api,
            basic_auth_username: user,
            basic_auth_password: pass,
          },
          seller_id: settingsKey,
          generated: has_credentials,
          webhook_url,
          connection_name: conn,
          name_for_billbee,
          store_name,
        })
      } catch (e) {
        if (client) try { await client.end() } catch (_) {}
        return res.status(500).json({ message: e?.message || 'Billbee settings could not be saved' })
      }
    }

    const adminHubBillbeeCredentialsPOST = async (req, res) => {
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      const settingsKey = getBillbeeAdminHubSellerSettingsKey(req.sellerUser)
      if (!settingsKey) return res.status(401).json({ message: 'Invalid session' })
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        const creds = await ensureSellerBillbeeCredentials(client, settingsKey, true)
        await client.end()
        return res.json({ credentials: creds, seller_id: settingsKey, regenerated: true })
      } catch (e) {
        if (client) try { await client.end() } catch (_) {}
        return res.status(500).json({ message: e?.message || 'Billbee credentials could not be regenerated' })
      }
    }

    const adminHubBillbeeIntegrationTestPOST = async (req, res) => {
      try {
        const body = req.body || {}
        const apiKey = String(body.api_key || '').trim()
        const username = String(body.basic_auth_username || '').trim()
        const password = String(body.basic_auth_password || '').trim()
        if (!apiKey || !username || !password) {
          return res.status(400).json({ message: 'api_key, basic_auth_username and basic_auth_password are required' })
        }

        const authBase64 = Buffer.from(`${username}:${password}`).toString('base64')
        const response = await fetch('https://app.billbee.io/api/v1/orders?top=1', {
          method: 'GET',
          headers: {
            Accept: 'application/json',
            'X-Billbee-Api-Key': apiKey,
            Authorization: `Basic ${authBase64}`,
          },
        })

        if (!response.ok) {
          const raw = await response.text().catch(() => '')
          const detail = raw ? ` — ${String(raw).slice(0, 180)}` : ''
          return res.status(400).json({ message: `Billbee connection failed (HTTP ${response.status})${detail}` })
        }

        return res.json({ ok: true, message: 'Billbee connection successful.' })
      } catch (e) {
        return res.status(500).json({ message: e?.message || 'Billbee test failed' })
      }
    }

    const getBillbeeAuthFromReq = (req) => {
      // Billbee fields:
      // - "Schlüssel" -> API key (we accept X-Billbee-Api-Key header)
      // - Basic Auth Benutzername/Passwort -> HTTP Basic auth
      const apiKey =
        String(req.headers['x-billbee-api-key'] || req.headers['x-billbee-apikey'] || req.query?.api_key || '').trim()
      const authHeader = String(req.headers.authorization || '')
      if (!authHeader.startsWith('Basic ')) {
        return { apiKey, username: '', password: '', basicOk: false }
      }
      try {
        const raw = Buffer.from(authHeader.slice('Basic '.length), 'base64').toString('utf8')
        const idx = raw.indexOf(':')
        const username = idx >= 0 ? raw.slice(0, idx) : raw
        const password = idx >= 0 ? raw.slice(idx + 1) : ''
        return { apiKey, username: String(username).trim(), password: String(password), basicOk: true }
      } catch {
        return { apiKey, username: '', password: '', basicOk: false }
      }
    }

    const adminHubBillbeeWebhookGET = async (req, res) => {
      // Connection test / health-check endpoint.
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      if (!dbUrl) return res.status(503).json({ message: 'Database not configured' })
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        try {
          const { apiKey, username, password, basicOk } = getBillbeeAuthFromReq(req)
          if (!basicOk || !username || !password) {
            return res.status(401).json({ message: 'Unauthorized' })
          }

          let q
          if (apiKey) {
            q = await client.query(
              `SELECT seller_id, billbee_basic_username, billbee_basic_password
               FROM admin_hub_seller_settings
               WHERE billbee_api_key = $1::text
               LIMIT 1`,
              [apiKey],
            )
          } else {
            q = await client.query(
              `SELECT seller_id, billbee_basic_username, billbee_basic_password
               FROM admin_hub_seller_settings
               WHERE billbee_basic_username = $1::text AND billbee_basic_password = $2::text
               LIMIT 1`,
              [username, password],
            )
          }
          const row = q.rows && q.rows[0]
          if (!row) return res.status(401).json({ message: 'Unauthorized' })
          const ok = String(row.billbee_basic_username || '') === username && String(row.billbee_basic_password || '') === password
          if (!ok) return res.status(401).json({ message: 'Unauthorized' })
          res.json({ ok: true, type: 'billbee_webhook', message: 'Billbee connection ok.' })
        } finally {
          await client.end().catch(() => {})
        }
      } catch (e) {
        res.status(500).json({ message: e?.message || 'Billbee webhook error' })
      }
    }

    const adminHubBillbeeWebhookPOST = async (req, res) => {
      // For now we only accept & acknowledge events.
      // Later we can map payload -> orders/labels in admin-hub tables.
      return adminHubBillbeeWebhookGET(req, res)
    }

    const adminHubBillbeeWebhookUrlGET = async (req, res) => {
      const base = getBillbeePublicBaseUrl()
      return res.json({
        url: `${base}/admin-hub/v1/integrations/billbee/webhook`,
        method: 'POST (Billbee may also call GET)',
      })
    }

    // ── Admin Hub Abandoned Carts ─────────────────────────────────
    const adminHubAbandonedCartsGET = async (req, res) => {
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        // Carts that have items but no corresponding order
        const r = await client.query(`
      SELECT c.id, c.created_at, c.updated_at,
        c.email, c.first_name, c.last_name, c.phone,
        json_agg(json_build_object('id',ci.id,'title',ci.title,'quantity',ci.quantity,'unit_price_cents',ci.unit_price_cents,'thumbnail',ci.thumbnail,'product_handle',ci.product_handle)) as items,
        COUNT(ci.id)::int as item_count,
        SUM(ci.unit_price_cents * ci.quantity) as cart_total
      FROM store_carts c
      JOIN store_cart_items ci ON ci.cart_id = c.id
      WHERE NOT EXISTS (SELECT 1 FROM store_orders o WHERE o.cart_id = c.id)
      GROUP BY c.id, c.created_at, c.updated_at, c.email, c.first_name, c.last_name, c.phone
      ORDER BY c.updated_at DESC
      LIMIT 100
    `)
        await client.end()
        res.json({ carts: r.rows || [] })
      } catch (e) {
        if (client) try { await client.end() } catch (_) {}
        res.json({ carts: [] })
      }
    }

    // ── Admin Hub Returns ─────────────────────────────────────────
    const adminHubReturnsGET = async (req, res) => {
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        const sellerId = (req.query.seller_id || '').trim()
        const params = []
        let where = ''
        if (sellerId) { params.push(sellerId); where = `WHERE o.seller_id = $${params.length}` }
        const r = await client.query(`SELECT r.*, o.order_number, o.email, o.first_name, o.last_name, o.total_cents, o.payment_method, o.seller_id FROM store_returns r LEFT JOIN store_orders o ON o.id = r.order_id ${where} ORDER BY r.created_at DESC LIMIT 100`, params)
        await client.end()
        res.json({ returns: (r.rows || []).map(row => ({ ...row, return_number: row.return_number ? Number(row.return_number) : null, order_number: row.order_number ? Number(row.order_number) : null })) })
      } catch (e) {
        if (client) try { await client.end() } catch (_) {}
        res.json({ returns: [] })
      }
    }

    const adminHubReturnsPOST = async (req, res) => {
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      const { order_id, reason, notes, items } = req.body || {}
      if (!order_id) return res.status(400).json({ message: 'order_id required' })
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        const r = await client.query('INSERT INTO store_returns (order_id, reason, notes, items) VALUES ($1::uuid, $2, $3, $4) RETURNING *', [order_id, reason || null, notes || null, items ? JSON.stringify(items) : null])
        const row = r.rows && r.rows[0]
        await client.end()
        res.status(201).json({ return: { ...row, return_number: row?.return_number ? Number(row.return_number) : null } })
      } catch (e) {
        if (client) try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    const adminHubReturnPATCH = async (req, res) => {
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      const id = (req.params.id || '').trim()
      const { status, notes, refund_amount_cents, refund_status, refund_note } = req.body || {}
      const sets = []; const params = []
      if (status) {
        params.push(status); sets.push(`status = $${params.length}`)
        if (status === 'genehmigt') { sets.push('approved_at = now()') }
        if (status === 'abgelehnt') { sets.push('rejected_at = now()') }
      }
      if (notes !== undefined) { params.push(notes); sets.push(`notes = $${params.length}`) }
      if (refund_amount_cents !== undefined) { params.push(refund_amount_cents); sets.push(`refund_amount_cents = $${params.length}`) }
      if (refund_status !== undefined) { params.push(refund_status); sets.push(`refund_status = $${params.length}`) }
      if (refund_note !== undefined) { params.push(refund_note); sets.push(`refund_note = $${params.length}`) }
      if (!sets.length) return res.status(400).json({ message: 'Nothing to update' })
      sets.push('updated_at = now()')
      params.push(id)
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        await client.query(`UPDATE store_returns SET ${sets.join(', ')} WHERE id = $${params.length}::uuid`, params)
        if (status === 'genehmigt') {
          await client.query(
            `UPDATE store_orders SET order_status = 'retoure', updated_at = now() WHERE id = (SELECT order_id FROM store_returns WHERE id = $1::uuid)`,
            [id],
          ).catch(() => {})
        }
        if (status === 'abgelehnt') {
          await client.query(
            `UPDATE store_orders SET order_status = CASE
               WHEN payment_status = 'bezahlt' AND delivery_status = 'zugestellt' THEN 'abgeschlossen'
               ELSE order_status
             END, updated_at = now()
             WHERE id = (SELECT order_id FROM store_returns WHERE id = $1::uuid)`,
            [id],
          ).catch(() => {})
        }
        // If refund processed, also mark order as refunded
        if (refund_status === 'erstattet') {
          await client.query(
            `UPDATE store_orders SET order_status = 'refunded', updated_at = now() WHERE id = (SELECT order_id FROM store_returns WHERE id = $1::uuid)`,
            [id]
          ).catch(() => {})
          // Auto-reverse bonus points on refund
          try {
            const retRow = await client.query(
              `SELECT r.order_id, o.customer_id, o.order_number, COALESCE(o.bonus_points_redeemed, 0)::int AS bonus_points_redeemed
               FROM store_returns r
               LEFT JOIN store_orders o ON o.id = r.order_id
               WHERE r.id = $1::uuid`,
              [id]
            )
            const rr = retRow.rows[0]
            if (rr?.customer_id && rr?.order_id) {
              const alreadyEarnedDone = await client.query(
                `SELECT id FROM store_customer_bonus_ledger WHERE order_id = $1::uuid AND source = 'order_return_earn' LIMIT 1`,
                [rr.order_id]
              )
              const alreadyRedeemDone = await client.query(
                `SELECT id FROM store_customer_bonus_ledger WHERE order_id = $1::uuid AND source = 'order_return_redeem' LIMIT 1`,
                [rr.order_id]
              )
              if (!alreadyEarnedDone.rows.length || !alreadyRedeemDone.rows.length) {
                const earned = await client.query(
                  `SELECT COALESCE(SUM(points_delta), 0)::int AS total FROM store_customer_bonus_ledger WHERE order_id = $1::uuid AND source = 'order_earn'`,
                  [rr.order_id]
                )
                const earnedPts = Number(earned.rows[0]?.total || 0)
                const redeemed = await client.query(
                  `SELECT COALESCE(SUM(points_delta), 0)::int AS total FROM store_customer_bonus_ledger WHERE order_id = $1::uuid AND source = 'order_redeem'`,
                  [rr.order_id]
                )
                const redeemedPts = Number(redeemed.rows[0]?.total || 0)
                if (earnedPts > 0 && !alreadyEarnedDone.rows.length) {
                  await appendBonusLedger(client, {
                    customerId: rr.customer_id, pointsDelta: -earnedPts,
                    description: `Retoure Bestellung #${rr.order_number} — Punkte zurückgebucht (−${earnedPts} Punkte)`,
                    source: 'order_return_earn', orderId: rr.order_id,
                  })
                }
                const redeemedFromOrder = Number(rr.bonus_points_redeemed || 0)
                const pointsToGiveBack = redeemedPts < 0 ? -redeemedPts : redeemedFromOrder
                if (pointsToGiveBack > 0 && !alreadyRedeemDone.rows.length) {
                  await appendBonusLedger(client, {
                    customerId: rr.customer_id, pointsDelta: pointsToGiveBack,
                    description: `Retoure Bestellung #${rr.order_number} — eingelöste Punkte zurückgegeben (+${pointsToGiveBack} Punkte)`,
                    source: 'order_return_redeem', orderId: rr.order_id,
                  })
                }
              }
            }
          } catch (bonusErr) {
            console.warn('bonus reversal on return:', bonusErr?.message)
          }
        }
        const r = await client.query(`SELECT r.*, o.order_number, o.email, o.first_name, o.last_name, o.total_cents, o.payment_method FROM store_returns r LEFT JOIN store_orders o ON o.id = r.order_id WHERE r.id = $1::uuid`, [id])
        await client.end()
        const row = r.rows && r.rows[0]
        res.json({ return: { ...row, return_number: row?.return_number ? Number(row.return_number) : null, order_number: row?.order_number ? Number(row.order_number) : null } })
      } catch (e) {
        if (client) try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    // ── Saved payment methods ────────────────────────────────────────────
    const getOrCreateStripeCustomer = async (client, customerId, email) => {
      const platformRow = await loadPlatformCheckoutRow(client)
      const secretKey = resolveStripeSecretKeyFromPlatform(platformRow)
      if (!secretKey) throw new Error('Stripe secret key not configured in Sellercentral settings')
      const stripe = new (require('stripe'))(secretKey)
      const row = await client.query('SELECT stripe_customer_id FROM store_customers WHERE id = $1::uuid', [customerId])
      let stripeCustomerId = row.rows[0]?.stripe_customer_id
      if (stripeCustomerId) {
        try {
          await stripe.customers.retrieve(stripeCustomerId)
        } catch (stripeErr) {
          const code = stripeErr && stripeErr.code
          const param = stripeErr && stripeErr.param
          const errMsg = String((stripeErr && stripeErr.message) || '')
          const noSuchCustomer =
            (code === 'resource_missing' && param === 'customer') ||
            /\bno such customer\b/i.test(errMsg)
          if (noSuchCustomer) {
            await client.query('UPDATE store_customers SET stripe_customer_id = NULL WHERE id = $1::uuid', [customerId])
            stripeCustomerId = null
          } else {
            throw stripeErr
          }
        }
      }
      if (!stripeCustomerId) {
        const sc = await stripe.customers.create({ email, metadata: { andertal_customer_id: customerId } })
        stripeCustomerId = sc.id
        await client.query('UPDATE store_customers SET stripe_customer_id = $1 WHERE id = $2::uuid', [stripeCustomerId, customerId])
      }
      return { stripe, stripeCustomerId }
    }

    const storePaymentMethodsGET = async (req, res) => {
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      const token = (req.headers.authorization || '').replace('Bearer ', '').trim()
      if (!token) return res.status(401).json({ message: 'Unauthorized' })
      const payload = verifyCustomerToken(token)
      if (!payload?.id) return res.status(401).json({ message: 'Invalid token' })
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        const { stripe, stripeCustomerId } = await getOrCreateStripeCustomer(client, payload.id, payload.email)
        const pms = await stripe.paymentMethods.list({ customer: stripeCustomerId, type: 'card' })
        await client.end()
        res.json({ payment_methods: pms.data })
      } catch (e) {
        if (client) try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    const storePaymentMethodsSetupPOST = async (req, res) => {
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      const token = (req.headers.authorization || '').replace('Bearer ', '').trim()
      if (!token) return res.status(401).json({ message: 'Unauthorized' })
      const payload = verifyCustomerToken(token)
      if (!payload?.id) return res.status(401).json({ message: 'Invalid token' })
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        const { stripe, stripeCustomerId } = await getOrCreateStripeCustomer(client, payload.id, payload.email)
        const setupIntent = await stripe.setupIntents.create({
          customer: stripeCustomerId,
          automatic_payment_methods: { enabled: true },
        })
        await client.end()
        res.json({ client_secret: setupIntent.client_secret })
      } catch (e) {
        if (client) try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    const storePaymentMethodsDELETE = async (req, res) => {
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      const token = (req.headers.authorization || '').replace('Bearer ', '').trim()
      if (!token) return res.status(401).json({ message: 'Unauthorized' })
      const payload = verifyCustomerToken(token)
      if (!payload?.id) return res.status(401).json({ message: 'Invalid token' })
      const pmId = (req.params.pmId || '').trim()
      if (!pmId) return res.status(400).json({ message: 'pmId required' })
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        const { stripe, stripeCustomerId } = await getOrCreateStripeCustomer(client, payload.id, payload.email)
        // Verify PM belongs to this customer
        const pm = await stripe.paymentMethods.retrieve(pmId)
        if (pm.customer !== stripeCustomerId) { await client.end(); return res.status(403).json({ message: 'Forbidden' }) }
        await stripe.paymentMethods.detach(pmId)
        await client.end()
        res.json({ success: true })
      } catch (e) {
        if (client) try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }
    // ────────────────────────────────────────────────────────────────────

    httpApp.post('/store/customers', storeCustomerRegisterPOST)
    httpApp.post('/store/auth/token', storeAuthTokenPOST)
    httpApp.get('/store/customers/me', storeCustomersMeGET)
    httpApp.patch('/store/customers/me', storeCustomerMePATCH)
    httpApp.delete('/store/customers/me', storeCustomerMeDELETE)
    httpApp.get('/store/customers/me/addresses', storeCustomerAddressesGET)
    httpApp.post('/store/customers/me/addresses', storeCustomerAddressesPOST)
    httpApp.patch('/store/customers/me/addresses/:addressId', storeCustomerAddressesPATCH)
    httpApp.delete('/store/customers/me/addresses/:addressId', storeCustomerAddressesDELETE)
    httpApp.get('/store/payment-methods', storePaymentMethodsGET)
    httpApp.post('/store/payment-methods/setup', storePaymentMethodsSetupPOST)
    httpApp.delete('/store/payment-methods/:pmId', storePaymentMethodsDELETE)
    httpApp.get('/store/wishlist', storeWishlistGET)
    httpApp.post('/store/wishlist', storeWishlistPOST)
    httpApp.delete('/store/wishlist/:productId', storeWishlistDELETE)
    httpApp.post('/store/orders/:id/cancel', storeOrdersCancelPOST)
    httpApp.post('/store/orders/:id/return-request', storeReturnRequestPOST)
    httpApp.get('/admin-hub/v1/shipping-groups', requireSellerAuth, adminHubShippingGroupsGET)
    httpApp.post('/admin-hub/v1/shipping-groups', requireSellerAuth, adminHubShippingGroupPOST)
    httpApp.patch('/admin-hub/v1/shipping-groups/:id', requireSellerAuth, adminHubShippingGroupPATCH)
    httpApp.delete('/admin-hub/v1/shipping-groups/:id', requireSellerAuth, adminHubShippingGroupDELETE)
    httpApp.get('/store/shipping-groups', storeShippingGroupsGET)
    httpApp.get('/store/orders/:id/invoice', storeOrderInvoicePdfGET)
    httpApp.get('/store/orders/:id/return-retourenschein', storeOrderReturnRetourenscheinGET)
    httpApp.get('/store/orders/:id/return-etikett', storeOrderReturnEtikettGET)
    httpApp.get('/store/reviews/my', storeReviewsMyGET)
    httpApp.get('/store/reviews', storeReviewsGET)
    httpApp.post('/store/reviews', storeReviewsPOST)
    httpApp.get('/admin-hub/reviews', requireSellerAuth, adminHubReviewsGET)

    httpApp.get('/admin-hub/v1/orders', adminHubOrdersGET)
    httpApp.post('/admin-hub/v1/orders', adminHubOrderPOST)
    httpApp.get('/admin-hub/v1/orders/:id/pdf/invoice', adminHubOrderPdfInvoiceGET)
    httpApp.get('/admin-hub/v1/orders/:id/pdf/lieferschein', adminHubOrderPdfLieferscheinGET)
    httpApp.get('/admin-hub/v1/orders/:id', adminHubOrderByIdGET)
    httpApp.patch('/admin-hub/v1/orders/:id', adminHubOrderPATCH)
    httpApp.delete('/admin-hub/v1/orders/:id', adminHubOrderDELETE)
    httpApp.get('/admin-hub/v1/orders/:id/shipment-events', requireSellerAuth, adminHubShipmentEventsGET)
    httpApp.post('/admin-hub/v1/orders/:id/shipment-events', requireSellerAuth, adminHubShipmentEventPOST)
    httpApp.delete('/admin-hub/v1/shipment-events/:eventId', requireSellerAuth, adminHubShipmentEventDELETE)
    httpApp.post('/admin-hub/v1/orders/:id/refresh-tracking', requireSellerAuth, adminHubOrderRefreshTrackingPOST)
    httpApp.get('/admin-hub/v1/customers', requireSellerAuth, adminHubCustomersGET)
    httpApp.post('/admin-hub/v1/customers', requireSellerAuth, adminHubCustomerPOST)
    httpApp.patch('/admin-hub/v1/customers/:id', requireSellerAuth, adminHubCustomerPATCH)
    httpApp.delete('/admin-hub/v1/customers/:id', requireSellerAuth, adminHubCustomerDELETE)
    httpApp.get('/admin-hub/v1/customers/:id', requireSellerAuth, adminHubCustomerByIdGET)
    httpApp.post('/admin-hub/v1/customers/:id/discounts', requireSellerAuth, adminHubCustomerDiscountPOST)
    httpApp.delete('/admin-hub/v1/customers/:customerId/discounts/:discountId', requireSellerAuth, adminHubCustomerDiscountDELETE)
    httpApp.post('/admin-hub/v1/customers/:id/bonus-ledger', requireSellerAuth, adminHubCustomerBonusLedgerPOST)
    httpApp.patch('/admin-hub/v1/customers/:customerId/bonus-ledger/:entryId', requireSellerAuth, adminHubCustomerBonusLedgerPATCH)
    httpApp.delete('/admin-hub/v1/customers/:customerId/bonus-ledger/:entryId', requireSellerAuth, adminHubCustomerBonusLedgerDELETE)
    httpApp.get('/admin-hub/v1/shipping-carriers', requireSellerAuth, adminHubCarriersGET)
    httpApp.post('/admin-hub/v1/shipping-carriers', requireSellerAuth, adminHubCarrierPOST)
    httpApp.patch('/admin-hub/v1/shipping-carriers/:id', requireSellerAuth, adminHubCarrierPATCH)
    httpApp.delete('/admin-hub/v1/shipping-carriers/:id', requireSellerAuth, adminHubCarrierDELETE)
    httpApp.get('/admin-hub/v1/integrations/trustpilot', requireSellerAuth, requireSuperuser, adminHubTrustpilotGET)
    httpApp.put('/admin-hub/v1/integrations/trustpilot', requireSellerAuth, requireSuperuser, adminHubTrustpilotPUT)
    httpApp.get('/admin-hub/v1/integrations', adminHubIntegrationsGET)
    httpApp.post('/admin-hub/v1/integrations', requireSellerAuth, adminHubIntegrationPOST)
    httpApp.patch('/admin-hub/v1/integrations/:id', requireSellerAuth, adminHubIntegrationPATCH)
    httpApp.delete('/admin-hub/v1/integrations/:id', requireSellerAuth, adminHubIntegrationDELETE)
    httpApp.get('/admin-hub/v1/integrations/billbee/credentials', requireSellerAuth, adminHubBillbeeCredentialsGET)
    httpApp.patch('/admin-hub/v1/integrations/billbee/credentials', requireSellerAuth, adminHubBillbeeCredentialsPATCH)
    httpApp.post('/admin-hub/v1/integrations/billbee/credentials', requireSellerAuth, adminHubBillbeeCredentialsPOST)
    httpApp.post('/admin-hub/v1/integrations/billbee/test', requireSellerAuth, adminHubBillbeeIntegrationTestPOST)
    // Billbee calls this URL to verify/authenticate the integration.
    // Must be reachable from the Billbee backend.
    httpApp.get('/admin-hub/v1/integrations/billbee/webhook-url', requireSellerAuth, adminHubBillbeeWebhookUrlGET)
    httpApp.get('/admin-hub/v1/integrations/billbee/webhook', adminHubBillbeeWebhookGET)
    httpApp.post('/admin-hub/v1/integrations/billbee/webhook', adminHubBillbeeWebhookPOST)

    const ensureAndertalBillbeeApiKeys = async (client, userId) => {
      const _c = require('crypto')
      const r = await client.query(
        `SELECT id, email, seller_id, andertal_billbee_api_key, andertal_billbee_api_secret FROM seller_users WHERE id = $1`,
        [userId],
      )
      const row = r.rows && r.rows[0]
      if (!row) return null
      if (row.andertal_billbee_api_key && row.andertal_billbee_api_secret) return row
      const k = `andertal_seller_${_c.randomBytes(12).toString('hex')}`
      const sec = _c.randomBytes(24).toString('hex')
      const u = await client.query(
        `UPDATE seller_users SET andertal_billbee_api_key = $2, andertal_billbee_api_secret = $3, updated_at = now()
         WHERE id = $1 AND (andertal_billbee_api_key IS NULL OR andertal_billbee_api_secret IS NULL)
         RETURNING id, email, seller_id, andertal_billbee_api_key, andertal_billbee_api_secret`,
        [userId, k, sec],
      )
      if (u.rows[0]) return u.rows[0]
      const again = await client.query(
        `SELECT id, email, seller_id, andertal_billbee_api_key, andertal_billbee_api_secret FROM seller_users WHERE id = $1`,
        [userId],
      )
      return again.rows[0]
    }

    const publicAndertalBillbeeApiBase = () =>
      (process.env.PUBLIC_API_BASE_URL || process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || '').replace(/\/$/, '') ||
      'https://andertal-medusa-backend.onrender.com'

    const adminHubBillbeeMarketplaceConnectionGET = async (req, res) => {
      const userId = req.sellerUser?.id
      if (!userId) return res.status(401).json({ message: 'Unauthorized' })
      let client
      try {
        client = getSellerDbClient()
        if (!client) return res.status(503).json({ message: 'Database unavailable' })
        await client.connect()
        const row = await ensureAndertalBillbeeApiKeys(client, userId)
        await client.end()
        client = null
        if (!row) return res.status(404).json({ message: 'User not found' })
        const base = publicAndertalBillbeeApiBase()
        const apiBase = `${base}/api/billbee`
        res.json({
          name: 'Andertal Marketplace',
          api_base_url: apiBase,
          orders_url: `${base}/api/billbee/orders`,
          products_url: `${base}/api/billbee/products`,
          stock_url: `${base}/api/billbee/stock`,
          webhook_url: `${base}/api/billbee/webhook/order-update`,
          api_key: row.andertal_billbee_api_key,
          basic_auth_username: row.email,
          basic_auth_password: row.andertal_billbee_api_secret,
          billbee_integration_enabled: true,
          hint:
            'Billbee Shopverbindung: URL oft die Basis-URL (api_base_url). Schlüssel = api_key. Basic Auth Benutzername = E-Mail, Passwort = gespeichertes Secret. Empfohlen: zusätzlich HTTP-Header X-Andertal-Api-Key mit demselben api_key.',
        })
      } catch (e) {
        if (client) try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    const adminHubBillbeeMarketplaceConnectionRotatePOST = async (req, res) => {
      const userId = req.sellerUser?.id
      if (!userId) return res.status(401).json({ message: 'Unauthorized' })
      const _c = require('crypto')
      let client
      try {
        client = getSellerDbClient()
        if (!client) return res.status(503).json({ message: 'Database unavailable' })
        await client.connect()
        const sec = _c.randomBytes(24).toString('hex')
        const r = await client.query(
          `UPDATE seller_users SET andertal_billbee_api_secret = $2, updated_at = now() WHERE id = $1 RETURNING andertal_billbee_api_secret`,
          [userId, sec],
        )
        await client.end()
        client = null
        if (!r.rows[0]) return res.status(404).json({ message: 'Not found' })
        res.json({ ok: true, basic_auth_password: r.rows[0].andertal_billbee_api_secret })
      } catch (e) {
        if (client) try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    httpApp.get('/admin-hub/v1/billbee/connection', requireSellerAuth, adminHubBillbeeMarketplaceConnectionGET)
    httpApp.post('/admin-hub/v1/billbee/connection/rotate-secret', requireSellerAuth, adminHubBillbeeMarketplaceConnectionRotatePOST)

    httpApp.get('/admin-hub/v1/abandoned-carts', adminHubAbandonedCartsGET)
    // POST /admin-hub/v1/returns/:id/send-label — mark label sent + send email to customer
    const adminHubReturnSendLabelPOST = async (req, res) => {
      const id = (req.params.id || '').trim()
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        const r = await client.query(
          `SELECT r.*, o.order_number, o.email, o.first_name, o.last_name, o.total_cents, o.payment_method
           FROM store_returns r LEFT JOIN store_orders o ON o.id = r.order_id WHERE r.id = $1::uuid`,
          [id]
        )
        const row = r.rows && r.rows[0]
        if (!row) { await client.end(); return res.status(404).json({ message: 'Return not found' }) }
        await client.query(`UPDATE store_returns SET label_sent_at = now(), updated_at = now() WHERE id = $1::uuid`, [id])
        await client.end()

        let emailSent = false
        if (row.email && process.env.SMTP_HOST) {
          try {
            const nodemailer = require('nodemailer')
            const transport = nodemailer.createTransport({
              host: process.env.SMTP_HOST,
              port: parseInt(process.env.SMTP_PORT || '587'),
              secure: process.env.SMTP_SECURE === 'true',
              auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
            })
            const customerName = [row.first_name, row.last_name].filter(Boolean).join(' ') || row.email
            const fmtDate = (d) => d ? new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'
            const labelHtml = `<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8"><title>Retoureschein</title></head><body style="font-family:Arial,sans-serif;margin:40px;color:#111">
<h1 style="font-size:22px">Retoureschein</h1>
<p style="color:#6b7280;font-size:13px;margin-bottom:24px">Retoure-Nr.: <strong>R-${row.return_number || '—'}</strong> · Bestellung: <strong>#${row.order_number || '—'}</strong></p>
<div style="border:2px dashed #e5e7eb;border-radius:8px;padding:20px;text-align:center;margin:24px 0">
  <div style="font-size:32px;font-weight:800;letter-spacing:4px">R-${row.return_number || '—'}</div>
  <small style="color:#6b7280;font-size:11px">Retoure-Nummer – bitte gut sichtbar auf das Paket kleben</small>
</div>
<p><strong>Rückgabegrund:</strong> ${row.reason || 'Kein Grund angegeben'}</p>
${row.notes ? `<p style="color:#6b7280;font-size:13px">${row.notes}</p>` : ''}
<p style="margin-top:32px;font-size:11px;color:#9ca3af;border-top:1px solid #e5e7eb;padding-top:16px">
  Erstellt am ${fmtDate(row.created_at)} · Bitte legen Sie diesen Schein dem Paket bei.
</p>
</body></html>`
            await transport.sendMail({
              from: process.env.SMTP_FROM || '"Andertal Shop" <noreply@andertal.de>',
              to: row.email,
              subject: `Ihr Retoureschein R-${row.return_number} – Bestellung #${row.order_number}`,
              html: `<p>Hallo ${customerName},</p><p>Ihre Retouranfrage wurde genehmigt. Anbei finden Sie Ihren Retoureschein.</p><p>Bitte legen Sie den Retoureschein dem Paket bei und senden Sie es an uns zurück.</p>${labelHtml}`,
            })
            emailSent = true
          } catch (emailErr) {
            console.error('Return label email error:', emailErr?.message)
          }
        }
        res.json({ success: true, emailSent, label_sent_at: new Date().toISOString() })
      } catch (e) {
        if (client) try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    httpApp.get('/admin-hub/v1/returns', adminHubReturnsGET)
    httpApp.post('/admin-hub/v1/returns', adminHubReturnsPOST)
    httpApp.patch('/admin-hub/v1/returns/:id', adminHubReturnPATCH)
    httpApp.post('/admin-hub/v1/returns/:id/send-label', adminHubReturnSendLabelPOST)

    // --- Admin Hub Pages (CRUD) + Store pages (published only) ---
    const pagesListGET = async (req, res) => {
      const client = getDbClient()
      if (!client) return res.status(503).json({ message: 'Database not configured' })
      try {
        await client.connect()
        const status = (req.query.status || '').trim() || null
        const pageType = (req.query.page_type || '').trim() || null
        const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100)
        const offset = parseInt(req.query.offset, 10) || 0
        let q = `SELECT id, title, slug, body, status, page_type, featured_image, excerpt, meta_title, meta_description, meta_keywords, created_at, updated_at
          FROM admin_hub_pages WHERE 1=1`
        const params = []
        if (status) { params.push(status); q += ` AND status = $${params.length}` }
        if (pageType) { params.push(pageType); q += ` AND page_type = $${params.length}` }
        q += ' ORDER BY updated_at DESC LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2)
        params.push(limit, offset)
        const r = await client.query(q, params)
        let countSql = 'SELECT COUNT(*)::int AS c FROM admin_hub_pages WHERE 1=1'
        const countParams = []
        if (status) { countParams.push(status); countSql += ` AND status = $${countParams.length}` }
        if (pageType) { countParams.push(pageType); countSql += ` AND page_type = $${countParams.length}` }
        const countRes = await client.query(countSql, countParams)
        res.json({ pages: r.rows, count: countRes.rows[0].c })
      } catch (err) {
        console.error('Pages list error:', err)
        res.status(500).json({ message: (err && err.message) || 'Internal server error' })
      } finally {
        await client.end().catch(() => {})
      }
    }
    const pagesCreatePOST = async (req, res) => {
      const client = getDbClient()
      if (!client) return res.status(503).json({ message: 'Database not configured' })
      const b = req.body || {}
      let title = (b.title || '').trim()
      let slug = (b.slug || '').trim()
      if (!title) return res.status(400).json({ message: 'title is required' })
      if (!slug) slug = title.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
      const body = (b.body != null ? b.body : '')
      const status = (b.status === 'published' ? 'published' : 'draft')
      const page_type = (b.page_type === 'blog' ? 'blog' : 'page')
      const featured_image = b.featured_image != null ? String(b.featured_image).trim() || null : null
      const excerpt = b.excerpt != null ? String(b.excerpt) : null
      const meta_title = b.meta_title != null ? String(b.meta_title).trim() || null : null
      const meta_description = b.meta_description != null ? String(b.meta_description) : null
      const meta_keywords = b.meta_keywords != null ? String(b.meta_keywords).trim() || null : null
      try {
        await client.connect()
        const r = await client.query(
          `INSERT INTO admin_hub_pages (title, slug, body, status, page_type, featured_image, excerpt, meta_title, meta_description, meta_keywords)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           RETURNING id, title, slug, body, status, page_type, featured_image, excerpt, meta_title, meta_description, meta_keywords, created_at, updated_at`,
          [title, slug, body, status, page_type, featured_image, excerpt, meta_title, meta_description, meta_keywords]
        )
        res.status(201).json(r.rows[0])
      } catch (err) {
        if (err.code === '23505') return res.status(400).json({ message: 'Slug already exists' })
        console.error('Pages create error:', err)
        res.status(500).json({ message: (err && err.message) || 'Internal server error' })
      } finally {
        await client.end().catch(() => {})
      }
    }
    const pageByIdGET = async (req, res) => {
      const client = getDbClient()
      if (!client) return res.status(503).json({ message: 'Database not configured' })
      try {
        await client.connect()
        const r = await client.query(
          `SELECT id, title, slug, body, status, page_type, featured_image, excerpt, meta_title, meta_description, meta_keywords, created_at, updated_at
           FROM admin_hub_pages WHERE id = $1`,
          [req.params.id]
        )
        if (r.rows.length === 0) return res.status(404).json({ message: 'Page not found' })
        res.json(r.rows[0])
      } catch (err) {
        console.error('Page get error:', err)
        res.status(500).json({ message: (err && err.message) || 'Internal server error' })
      } finally {
        await client.end().catch(() => {})
      }
    }
    const pageByIdPUT = async (req, res) => {
      const client = getDbClient()
      if (!client) return res.status(503).json({ message: 'Database not configured' })
      const b = req.body || {}
      const updates = []
      const values = []
      let i = 1
      if (b.title !== undefined) { updates.push(`title = $${i++}`); values.push(b.title) }
      if (b.slug !== undefined) { updates.push(`slug = $${i++}`); values.push(b.slug) }
      if (b.body !== undefined) { updates.push(`body = $${i++}`); values.push(b.body) }
      if (b.status !== undefined) { updates.push(`status = $${i++}`); values.push(b.status === 'published' ? 'published' : 'draft') }
      if (b.page_type !== undefined) { updates.push(`page_type = $${i++}`); values.push(b.page_type === 'blog' ? 'blog' : 'page') }
      if (b.featured_image !== undefined) { updates.push(`featured_image = $${i++}`); values.push(b.featured_image ? String(b.featured_image).trim() : null) }
      if (b.excerpt !== undefined) { updates.push(`excerpt = $${i++}`); values.push(b.excerpt) }
      if (b.meta_title !== undefined) { updates.push(`meta_title = $${i++}`); values.push(b.meta_title ? String(b.meta_title).trim() : null) }
      if (b.meta_description !== undefined) { updates.push(`meta_description = $${i++}`); values.push(b.meta_description) }
      if (b.meta_keywords !== undefined) { updates.push(`meta_keywords = $${i++}`); values.push(b.meta_keywords ? String(b.meta_keywords).trim() : null) }
      if (updates.length === 0) return res.status(400).json({ message: 'No fields to update' })
      updates.push(`updated_at = now()`)
      values.push(req.params.id)
      try {
        await client.connect()
        const r = await client.query(
          `UPDATE admin_hub_pages SET ${updates.join(', ')} WHERE id = $${i} RETURNING id, title, slug, body, status, page_type, featured_image, excerpt, meta_title, meta_description, meta_keywords, created_at, updated_at`,
          values
        )
        if (r.rows.length === 0) return res.status(404).json({ message: 'Page not found' })
        res.json(r.rows[0])
      } catch (err) {
        if (err.code === '23505') return res.status(400).json({ message: 'Slug already exists' })
        console.error('Page update error:', err)
        res.status(500).json({ message: (err && err.message) || 'Internal server error' })
      } finally {
        await client.end().catch(() => {})
      }
    }
    const pageByIdDELETE = async (req, res) => {
      const client = getDbClient()
      if (!client) return res.status(503).json({ message: 'Database not configured' })
      try {
        await client.connect()
        const r = await client.query('DELETE FROM admin_hub_pages WHERE id = $1 RETURNING id', [req.params.id])
        if (r.rows.length === 0) return res.status(404).json({ message: 'Page not found' })
        res.status(200).json({ deleted: true })
      } catch (err) {
        console.error('Page delete error:', err)
        res.status(500).json({ message: (err && err.message) || 'Internal server error' })
      } finally {
        await client.end().catch(() => {})
      }
    }

    httpApp.get('/admin-hub/v1/pages', pagesListGET)
    httpApp.post('/admin-hub/v1/pages', pagesCreatePOST)
    httpApp.get('/admin-hub/v1/pages/:id', pageByIdGET)
    httpApp.put('/admin-hub/v1/pages/:id', pageByIdPUT)
    httpApp.delete('/admin-hub/v1/pages/:id', pageByIdDELETE)

    const storePagesListGET = async (req, res) => {
      const client = getDbClient()
      if (!client) return res.status(503).json({ message: 'Database not configured' })
      try {
        await client.connect()
        const pageType = (req.query.page_type || '').trim() || null
        let q = `SELECT id, title, slug, body, excerpt, featured_image, page_type, meta_title, meta_description, meta_keywords, updated_at
          FROM admin_hub_pages WHERE status = $1`
        const params = ['published']
        if (pageType) { params.push(pageType); q += ` AND page_type = $2` }
        q += ' ORDER BY updated_at DESC'
        const r = await client.query(q, params)
        res.json({ pages: r.rows, count: r.rows.length })
      } catch (err) {
        console.error('Store pages list error:', err)
        res.status(500).json({ message: (err && err.message) || 'Internal server error' })
      } finally {
        await client.end().catch(() => {})
      }
    }
    const storePageBySlugGET = async (req, res) => {
      const client = getDbClient()
      if (!client) return res.status(503).json({ message: 'Database not configured' })
      try {
        await client.connect()
        const r = await client.query(
          `SELECT id, title, slug, body, excerpt, featured_image, page_type, meta_title, meta_description, meta_keywords, updated_at
           FROM admin_hub_pages WHERE slug = $1 AND status = 'published'`,
          [req.params.slug]
        )
        if (r.rows.length === 0) return res.status(404).json({ message: 'Page not found' })
        res.json(r.rows[0])
      } catch (err) {
        console.error('Store page by slug error:', err)
        res.status(500).json({ message: (err && err.message) || 'Internal server error' })
      } finally {
        await client.end().catch(() => {})
      }
    }

    httpApp.get('/store/pages', storePagesListGET)
    httpApp.get('/store/pages/:slug', storePageBySlugGET)

    // ── Landing Page CMS ──────────────────────────────────────────────────

    // Enrich collections_carousel containers with live image_url from DB
    const enrichCollectionImages = async (containers, client) => {
      if (!Array.isArray(containers)) return containers
      // Collect all collection IDs that are missing images
      const missingIds = new Set()
      containers.forEach(c => {
        if (c.type === 'collections_carousel' && Array.isArray(c.collections)) {
          c.collections.forEach(col => { if (!col.image && col.id) missingIds.add(col.id) })
        }
      })
      if (!missingIds.size) return containers
      // Fetch images for missing IDs
      const idList = [...missingIds]
      const placeholders = idList.map((_, i) => `$${i + 1}`).join(',')
      let imageMap = {}
      try {
        const res = await client.query(
          `SELECT id, metadata FROM admin_hub_collections WHERE id::text = ANY($1::text[])`,
          [idList]
        )
        res.rows.forEach(row => {
          const meta = row.metadata && typeof row.metadata === 'object' ? row.metadata : {}
          // Main image only — not banner (carousel cards must match Kollektion “Main image” in Seller)
          const img = meta.image_url || null
          if (img) imageMap[row.id] = img
        })
      } catch (_) {}
      // Inject images into containers
      return containers.map(c => {
        if (c.type !== 'collections_carousel' || !Array.isArray(c.collections)) return c
        return {
          ...c,
          collections: c.collections.map(col => {
            if (col.image || !imageMap[col.id]) return col
            return { ...col, image: imageMap[col.id] }
          })
        }
      })
    }

    const _previewPlain = (html, max) => {
      const t = String(html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
      return t.length <= max ? t : t.slice(0, max - 1) + '…'
    }

    const enrichBlogCarousel = async (containers, client) => {
      if (!Array.isArray(containers)) return containers
      const ids = new Set()
      containers.forEach((c) => {
        if (c.type === 'blog_carousel' && Array.isArray(c.posts)) {
          c.posts.forEach((p) => {
            if (p && p.page_id) ids.add(String(p.page_id))
          })
        }
      })
      if (!ids.size) return containers
      const idList = [...ids]
      let rows = []
      try {
        const r = await client.query(
          `SELECT id, title, slug, body, excerpt, featured_image, page_type, status
           FROM admin_hub_pages
           WHERE id = ANY($1::uuid[]) AND status = 'published' AND page_type = 'blog'`,
          [idList]
        )
        rows = r.rows
      } catch (_) {}
      const map = {}
      rows.forEach((row) => {
        map[String(row.id)] = row
      })
      return containers.map((c) => {
        if (c.type !== 'blog_carousel' || !Array.isArray(c.posts)) return c
        const posts = c.posts
          .map((p) => {
            if (!p || !p.page_id) return p
            const row = map[String(p.page_id)]
            if (!row) return null
            const excerpt = row.excerpt ? String(row.excerpt) : _previewPlain(row.body, 280)
            return {
              ...p,
              title: row.title,
              excerpt,
              body: row.body,
              image: row.featured_image || p.image || '',
              href: (p.href && String(p.href).trim()) || `pages/${row.slug}`,
            }
          })
          .filter(Boolean)
        return { ...c, posts }
      })
    }

    const enrichLandingContainers = async (containers, client) => {
      let list = containers
      list = await enrichCollectionImages(list, client)
      list = await enrichBlogCarousel(list, client)
      return list
    }

    const landingPageGET = async (req, res) => {
      const client = getDbClient()
      if (!client) return res.status(503).json({ message: 'Database not configured' })
      try {
        await client.connect()
        const r = await client.query('SELECT containers, settings, updated_at FROM admin_hub_landing_page WHERE id = 1')
        const containers = await enrichLandingContainers(r.rows[0]?.containers || [], client)
        const settings =
          r.rows[0]?.settings && typeof r.rows[0].settings === 'object' ? r.rows[0].settings : {}
        res.json({ containers, settings, updated_at: r.rows[0]?.updated_at || null })
      } catch (err) {
        console.error('Landing page GET error:', err)
        res.status(500).json({ message: (err && err.message) || 'Internal server error' })
      } finally {
        await client.end().catch(() => {})
      }
    }
    const landingPagePUT = async (req, res) => {
      const client = getDbClient()
      if (!client) return res.status(503).json({ message: 'Database not configured' })
      try {
        await client.connect()
        const containers = Array.isArray(req.body?.containers) ? req.body.containers : []
        const settings = req.body?.settings && typeof req.body.settings === 'object' ? req.body.settings : {}
        await client.query(
          `INSERT INTO admin_hub_landing_page (id, containers, settings, updated_at) VALUES (1, $1, $2, NOW())
           ON CONFLICT (id) DO UPDATE SET containers = $1, settings = $2, updated_at = NOW()`,
          [JSON.stringify(containers), JSON.stringify(settings)]
        )
        res.json({ ok: true, containers, settings })
      } catch (err) {
        console.error('Landing page PUT error:', err)
        res.status(500).json({ message: (err && err.message) || 'Internal server error' })
      } finally {
        await client.end().catch(() => {})
      }
    }
    httpApp.get('/admin-hub/landing-page', landingPageGET)
    httpApp.put('/admin-hub/landing-page', landingPagePUT)
    httpApp.get('/store/landing-page', landingPageGET)

    // ── Landing layout by category (containers + settings; must register before /landing-page/:pageId)
    const landingCategoryGET = async (req, res) => {
      const client = getDbClient()
      if (!client) return res.status(503).json({ message: 'Database not configured' })
      const categoryId = (req.params.categoryId || '').trim()
      if (!categoryId) return res.json({ containers: [], settings: {}, updated_at: null })
      try {
        await client.connect()
        const r = await client.query(
          'SELECT containers, settings, updated_at FROM admin_hub_landing_categories WHERE category_id = $1',
          [categoryId]
        )
        if (!r.rows[0]) {
          return res.json({ containers: [], settings: {}, updated_at: null })
        }
        const rawSettings = r.rows[0].settings && typeof r.rows[0].settings === 'object' ? r.rows[0].settings : {}
        const containers = await enrichLandingContainers(r.rows[0].containers || [], client)
        res.json({
          containers,
          settings: rawSettings,
          updated_at: r.rows[0].updated_at || null,
        })
      } catch (err) {
        console.error('Landing category GET error:', err)
        res.status(500).json({ message: (err && err.message) || 'Internal server error' })
      } finally {
        await client.end().catch(() => {})
      }
    }
    const landingCategoryPUT = async (req, res) => {
      const client = getDbClient()
      if (!client) return res.status(503).json({ message: 'Database not configured' })
      const categoryId = (req.params.categoryId || '').trim()
      if (!categoryId) return res.status(400).json({ message: 'categoryId required' })
      try {
        await client.connect()
        const containers = Array.isArray(req.body?.containers) ? req.body.containers : []
        const settings = req.body?.settings && typeof req.body.settings === 'object' ? req.body.settings : {}
        await client.query(
          `INSERT INTO admin_hub_landing_categories (category_id, containers, settings, updated_at)
           VALUES ($1, $2, $3, NOW())
           ON CONFLICT (category_id) DO UPDATE SET containers = $2, settings = $3, updated_at = NOW()`,
          [categoryId, JSON.stringify(containers), JSON.stringify(settings)]
        )
        res.json({ ok: true, containers, settings })
      } catch (err) {
        console.error('Landing category PUT error:', err)
        res.status(500).json({ message: (err && err.message) || 'Internal server error' })
      } finally {
        await client.end().catch(() => {})
      }
    }
    httpApp.get('/admin-hub/landing-page/category/:categoryId', landingCategoryGET)
    httpApp.put('/admin-hub/landing-page/category/:categoryId', landingCategoryPUT)
    httpApp.get('/store/landing-page/category/:categoryId', landingCategoryGET)

    // ── Landing page by page_id ──────────────────────────────────────────────
    const landingPageByIdGET = async (req, res) => {
      const client = getDbClient()
      if (!client) return res.status(503).json({ message: 'Database not configured' })
      try {
        await client.connect()
        const pageId = req.params.pageId
        const r = await client.query('SELECT containers, settings, updated_at FROM admin_hub_landing_pages WHERE page_id = $1', [pageId])
        if (r.rows[0]) {
          const containers = await enrichLandingContainers(r.rows[0].containers || [], client)
          const settings =
            r.rows[0].settings && typeof r.rows[0].settings === 'object' ? r.rows[0].settings : {}
          return res.json({ containers, settings, updated_at: r.rows[0].updated_at || null })
        }
        // One-time fallback: only for the oldest page when new table is completely empty
        const newCount = await client.query('SELECT COUNT(*) FROM admin_hub_landing_pages')
        if (parseInt(newCount.rows[0].count) === 0) {
          const firstPage = await client.query('SELECT id FROM admin_hub_pages ORDER BY id ASC LIMIT 1')
          if (firstPage.rows[0] && String(firstPage.rows[0].id) === String(pageId)) {
            const old = await client.query('SELECT containers, settings FROM admin_hub_landing_page WHERE id = 1')
            if (old.rows[0]?.containers?.length) {
              const containers = await enrichLandingContainers(old.rows[0].containers, client)
              const settings =
                old.rows[0].settings && typeof old.rows[0].settings === 'object' ? old.rows[0].settings : {}
              return res.json({ containers, settings, updated_at: null, _migrated: true })
            }
          }
        }
        res.json({ containers: [], settings: {}, updated_at: null })
      } catch (err) {
        res.status(500).json({ message: (err && err.message) || 'Internal server error' })
      } finally {
        await client.end().catch(() => {})
      }
    }
    const landingPageByIdPUT = async (req, res) => {
      const client = getDbClient()
      if (!client) return res.status(503).json({ message: 'Database not configured' })
      try {
        await client.connect()
        const pageId = req.params.pageId
        const containers = Array.isArray(req.body?.containers) ? req.body.containers : []
        const settings = req.body?.settings && typeof req.body.settings === 'object' ? req.body.settings : {}
        await client.query(
          `INSERT INTO admin_hub_landing_pages (page_id, containers, settings, updated_at) VALUES ($1, $2, $3, NOW())
           ON CONFLICT (page_id) DO UPDATE SET containers = $2, settings = $3, updated_at = NOW()`,
          [pageId, JSON.stringify(containers), JSON.stringify(settings)]
        )
        res.json({ ok: true, containers, settings })
      } catch (err) {
        res.status(500).json({ message: (err && err.message) || 'Internal server error' })
      } finally {
        await client.end().catch(() => {})
      }
    }
    httpApp.get('/admin-hub/landing-page/:pageId', landingPageByIdGET)
    httpApp.put('/admin-hub/landing-page/:pageId', landingPageByIdPUT)
    httpApp.get('/store/landing-page/:pageId', landingPageByIdGET)

    // ── Styles ───────────────────────────────────────────────────────────────
    const stylesGET = async (req, res) => {
      const client = getDbClient()
      if (!client) return res.status(503).json({ message: 'Database not configured' })
      try {
        await client.connect()
        const r = await client.query('SELECT key, value FROM admin_hub_styles')
        const data = {}
        r.rows.forEach(row => { data[row.key] = row.value })
        res.set('Cache-Control', 'no-store, max-age=0')
        res.json({ styles: data.styles || { colors: {}, buttons: {} } })
      } catch (err) {
        res.status(500).json({ message: (err && err.message) || 'Internal server error' })
      } finally {
        await client.end().catch(() => {})
      }
    }
    const stylesPUT = async (req, res) => {
      const client = getDbClient()
      if (!client) return res.status(503).json({ message: 'Database not configured' })
      try {
        await client.connect()
        const styles = req.body?.styles || { colors: {}, buttons: {} }
        await client.query(
          `INSERT INTO admin_hub_styles (key, value) VALUES ('styles', $1)
           ON CONFLICT (key) DO UPDATE SET value = $1`,
          [JSON.stringify(styles)]
        )
        res.json({ ok: true, styles })
      } catch (err) {
        res.status(500).json({ message: (err && err.message) || 'Internal server error' })
      } finally {
        await client.end().catch(() => {})
      }
    }
    httpApp.get('/admin-hub/styles', stylesGET)
    httpApp.put('/admin-hub/styles', stylesPUT)
    httpApp.get('/store/styles', stylesGET) // public — no auth

    // ── Public Trustpilot widget config (Business Unit ID is public in TrustBox embeds) ──
    const storeTrustpilotConfigGET = async (req, res) => {
      const client = getDbClient()
      if (!client) return res.json({ enabled: false, businessUnitId: null, templateId: null, evaluateUrl: null })
      try {
        await client.connect()
        const r = await client.query(
          `SELECT api_key, config FROM store_integrations WHERE LOWER(TRIM(slug)) = 'trustpilot' AND is_active = true LIMIT 1`
        )
        const row = r.rows[0]
        const bu = row && row.api_key ? String(row.api_key).trim() : ''
        if (!bu) return res.json({ enabled: false, businessUnitId: null, templateId: null, evaluateUrl: null })
        let cfg = {}
        try {
          const c = row.config
          cfg = typeof c === 'string' ? JSON.parse(c) : (c && typeof c === 'object' ? c : {})
        } catch (_) {}
        const templateId = (cfg.template_id || cfg.templateId || '').toString().trim() || '5419b732-fbfb-4c9d-8b9d-0a9952a935df'
        const evaluateUrl = (cfg.evaluate_url || cfg.evaluateUrl || '').toString().trim()
        const evaluateOut = /^https:\/\//i.test(evaluateUrl) ? evaluateUrl : null
        res.json({ enabled: true, businessUnitId: bu, templateId, evaluateUrl: evaluateOut })
      } catch (err) {
        console.error('storeTrustpilotConfigGET:', err)
        res.json({ enabled: false, businessUnitId: null, templateId: null, evaluateUrl: null })
      } finally {
        await client.end().catch(() => {})
      }
    }
    httpApp.get('/store/trustpilot-config', storeTrustpilotConfigGET)


    // ── Notifications (per-recipient read/delete state: seller_hub_notification_state) ──
    const getNotifRecipientContext = (req) => {
      const u = req.sellerUser
      if (!u) return null
      const isSuperuser = !!u.is_superuser
      const sellerId = String(u.seller_id || '').trim()
      if (!isSuperuser && !sellerId) return null
      return { isSuperuser, sellerId, recipientKey: isSuperuser ? '__superuser__' : sellerId }
    }

    const markAllNotificationsRead = async (client, recipientKey, isSuperuser, sellerId) => {
      const sup = !!isSuperuser
      const sid = sellerId || ''
      await client.query(
        `INSERT INTO seller_hub_notification_state (recipient_key, source_type, source_id, read_at)
         SELECT $1::varchar, 'order', o.id, now() FROM store_orders o
         WHERE ($2::boolean OR o.seller_id = $3)
         ON CONFLICT (recipient_key, source_type, source_id)
         DO UPDATE SET read_at = now() WHERE seller_hub_notification_state.deleted_at IS NULL`,
        [recipientKey, sup, sid],
      )
      await client.query(
        `INSERT INTO seller_hub_notification_state (recipient_key, source_type, source_id, read_at)
         SELECT $1::varchar, 'return', r.id, now()
         FROM store_returns r INNER JOIN store_orders o ON o.id = r.order_id
         WHERE ($2::boolean OR o.seller_id = $3)
         ON CONFLICT (recipient_key, source_type, source_id)
         DO UPDATE SET read_at = now() WHERE seller_hub_notification_state.deleted_at IS NULL`,
        [recipientKey, sup, sid],
      )
      if (sup) {
        await client.query(
          `INSERT INTO seller_hub_notification_state (recipient_key, source_type, source_id, read_at)
           SELECT $1::varchar, 'verification', n.id, now()
           FROM admin_hub_notifications n WHERE n.type = 'verification_submitted'
           ON CONFLICT (recipient_key, source_type, source_id)
           DO UPDATE SET read_at = now() WHERE seller_hub_notification_state.deleted_at IS NULL`,
          [recipientKey],
        )
        await client.query(
          `INSERT INTO seller_hub_notification_state (recipient_key, source_type, source_id, read_at)
           SELECT $1::varchar, 'product_change_request', cr.id, now()
           FROM admin_hub_product_change_requests cr
           WHERE cr.status = 'pending'
           ON CONFLICT (recipient_key, source_type, source_id)
           DO UPDATE SET read_at = now() WHERE seller_hub_notification_state.deleted_at IS NULL`,
          [recipientKey],
        )
      }
    }

    const adminHubNotificationsUnreadGET = async (req, res) => {
      const ctx = getNotifRecipientContext(req)
      if (!ctx) return res.status(401).json({ message: 'Unauthorized' })
      const { recipientKey: rk, isSuperuser: sup, sellerId: sid } = ctx
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        let messagesR
        if (!sup) {
          messagesR = await client.query(
            `SELECT COUNT(*)::int AS c FROM store_messages m
             WHERE m.is_read_by_seller = false
               AND (
                 (
                   (m.channel = 'customer' OR m.channel IS NULL)
                   AND m.sender_type = 'customer'
                   AND m.order_id IN (SELECT id FROM store_orders WHERE seller_id = $1)
                 )
                 OR (
                   m.channel = 'support' AND m.seller_id = $1 AND m.sender_type = 'seller'
                 )
               )`,
            [sid],
          )
        } else {
          messagesR = await client.query(
            `SELECT COUNT(*)::int AS c FROM store_messages m
             WHERE (
                 (
                   (m.channel = 'customer' OR m.channel IS NULL)
                   AND m.sender_type = 'customer'
                   AND m.is_read_by_seller = false
                 )
                 OR (
                   m.channel = 'support' AND m.sender_type = 'seller' AND m.is_read_by_seller = false
                 )
                 OR (
                   m.channel = 'support' AND m.sender_type = 'customer' AND m.is_read_by_support = false
                 )
               )`,
          )
        }
        const ordersUnreadQ = `
          SELECT COUNT(*)::int AS c FROM store_orders o
          LEFT JOIN seller_hub_notification_state s
            ON s.recipient_key = $1 AND s.source_type = 'order' AND s.source_id = o.id
          WHERE ($2::boolean OR o.seller_id = $3)
            AND (s.id IS NULL OR s.deleted_at IS NULL)
            AND (s.id IS NULL OR s.read_at IS NULL)`
        const returnsUnreadQ = `
          SELECT COUNT(*)::int AS c FROM store_returns r
          INNER JOIN store_orders o ON o.id = r.order_id
          LEFT JOIN seller_hub_notification_state s
            ON s.recipient_key = $1 AND s.source_type = 'return' AND s.source_id = r.id
          WHERE ($2::boolean OR o.seller_id = $3)
            AND (s.id IS NULL OR s.deleted_at IS NULL)
            AND (s.id IS NULL OR s.read_at IS NULL)`
        const verificationsUnreadQ = sup
          ? `
          SELECT COUNT(*)::int AS c FROM admin_hub_notifications n
          LEFT JOIN seller_hub_notification_state s
            ON s.recipient_key = $1 AND s.source_type = 'verification' AND s.source_id = n.id
          WHERE n.type = 'verification_submitted'
            AND (s.id IS NULL OR s.deleted_at IS NULL)
            AND (s.id IS NULL OR s.read_at IS NULL)`
          : `SELECT 0::int AS c`
        const crUnreadQ = `
          SELECT COUNT(*)::int AS c FROM admin_hub_product_change_requests cr
          LEFT JOIN seller_hub_notification_state s
            ON s.recipient_key = $1 AND s.source_type = 'product_change_request' AND s.source_id = cr.id
          WHERE cr.status = 'pending'
            AND (s.id IS NULL OR s.deleted_at IS NULL)
            AND (s.id IS NULL OR s.read_at IS NULL)`

        const [ordersR, returnsR, verificationsR, changeReqR] = await Promise.all([
          client.query(ordersUnreadQ, [rk, sup, sid]),
          client.query(returnsUnreadQ, [rk, sup, sid]),
          sup ? client.query(verificationsUnreadQ, [rk]).catch(() => ({ rows: [{ c: 0 }] })) : { rows: [{ c: 0 }] },
          sup ? client.query(crUnreadQ, [rk]).catch(() => ({ rows: [{ c: 0 }] })) : { rows: [{ c: 0 }] },
        ])

        const recentOrders = await client.query(
          `SELECT o.id, o.order_number, o.first_name, o.last_name, o.total_cents, o.created_at,
                  (s.read_at IS NOT NULL) AS read
           FROM store_orders o
           LEFT JOIN seller_hub_notification_state s
             ON s.recipient_key = $1 AND s.source_type = 'order' AND s.source_id = o.id
           WHERE ($2::boolean OR o.seller_id = $3)
             AND (s.id IS NULL OR s.deleted_at IS NULL)
           ORDER BY o.created_at DESC LIMIT 8`,
          [rk, sup, sid],
        )
        const recentReturns = await client.query(
          `SELECT r.id, r.return_number, r.status, r.created_at, o.order_number,
                  (s.read_at IS NOT NULL) AS read
           FROM store_returns r
           INNER JOIN store_orders o ON o.id = r.order_id
           LEFT JOIN seller_hub_notification_state s
             ON s.recipient_key = $1 AND s.source_type = 'return' AND s.source_id = r.id
           WHERE ($2::boolean OR o.seller_id = $3)
             AND (s.id IS NULL OR s.deleted_at IS NULL)
           ORDER BY r.created_at DESC LIMIT 8`,
          [rk, sup, sid],
        )
        let recentVerifications = { rows: [] }
        if (sup) {
          recentVerifications = await client.query(
            `SELECT n.id, n.title, n.body, n.seller_id, n.created_at,
                    (s.read_at IS NOT NULL) AS read
             FROM admin_hub_notifications n
             LEFT JOIN seller_hub_notification_state s
               ON s.recipient_key = $1 AND s.source_type = 'verification' AND s.source_id = n.id
             WHERE n.type = 'verification_submitted'
               AND (s.id IS NULL OR s.deleted_at IS NULL)
             ORDER BY n.created_at DESC LIMIT 8`,
            [rk],
          ).catch(() => ({ rows: [] }))
        }
        let recentChangeRequests = { rows: [] }
        if (sup) {
          recentChangeRequests = await client.query(
            `SELECT cr.id, cr.product_id, cr.seller_id, cr.field_name, cr.old_value, cr.new_value, cr.created_at, p.title AS product_title,
                    (s.read_at IS NOT NULL) AS read
             FROM admin_hub_product_change_requests cr
             LEFT JOIN admin_hub_products p ON p.id = cr.product_id
             LEFT JOIN seller_hub_notification_state s
               ON s.recipient_key = $1 AND s.source_type = 'product_change_request' AND s.source_id = cr.id
             WHERE cr.status = 'pending'
               AND (s.id IS NULL OR s.deleted_at IS NULL)
             ORDER BY cr.created_at DESC LIMIT 8`,
            [rk],
          ).catch(() => ({ rows: [] }))
        }

        await client.end()
        const verCount = verificationsR.rows[0]?.c || 0
        const crCount = changeReqR.rows[0]?.c || 0
        const ordCount = ordersR.rows[0]?.c || 0
        const retCount = returnsR.rows[0]?.c || 0
        res.json({
          unread: ordCount + retCount + (messagesR.rows[0]?.c || 0) + verCount + crCount,
          orders: ordCount,
          returns: retCount,
          messages: messagesR.rows[0]?.c || 0,
          verifications: verCount,
          change_requests: crCount,
          recent_orders: recentOrders.rows.map((r) => ({ ...r, order_number: r.order_number ? Number(r.order_number) : null })),
          recent_returns: recentReturns.rows.map((r) => ({ ...r, return_number: r.return_number ? Number(r.return_number) : null, order_number: r.order_number ? Number(r.order_number) : null })),
          recent_verifications: recentVerifications.rows,
          recent_product_change_requests: recentChangeRequests.rows || [],
        })
      } catch (e) {
        if (client) try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    const adminHubNotificationsMarkSeenPOST = async (req, res) => {
      const ctx = getNotifRecipientContext(req)
      if (!ctx) return res.status(401).json({ message: 'Unauthorized' })
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        await markAllNotificationsRead(client, ctx.recipientKey, ctx.isSuperuser, ctx.sellerId)
        await client.end()
        res.json({ success: true })
      } catch (e) {
        if (client) try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    const adminHubNotificationsFeedGET = async (req, res) => {
      const ctx = getNotifRecipientContext(req)
      if (!ctx) return res.status(401).json({ message: 'Unauthorized' })
      const lim = Math.min(Math.max(parseInt(req.query.limit, 10) || 40, 1), 200)
      const off = Math.max(parseInt(req.query.offset, 10) || 0, 0)
      const { recipientKey: rk, isSuperuser: sup, sellerId: sid } = ctx
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        const ordersQ = await client.query(
          `SELECT o.id, o.order_number, o.first_name, o.last_name, o.total_cents, o.created_at,
                  (s.read_at IS NOT NULL) AS read
           FROM store_orders o
           LEFT JOIN seller_hub_notification_state s
             ON s.recipient_key = $1 AND s.source_type = 'order' AND s.source_id = o.id
           WHERE ($2::boolean OR o.seller_id = $3)
             AND (s.id IS NULL OR s.deleted_at IS NULL)
           ORDER BY o.created_at DESC LIMIT 500`,
          [rk, sup, sid],
        )
        const returnsQ = await client.query(
          `SELECT r.id, r.return_number, r.status, r.created_at, o.order_number,
                  (s.read_at IS NOT NULL) AS read
           FROM store_returns r
           INNER JOIN store_orders o ON o.id = r.order_id
           LEFT JOIN seller_hub_notification_state s
             ON s.recipient_key = $1 AND s.source_type = 'return' AND s.source_id = r.id
           WHERE ($2::boolean OR o.seller_id = $3)
             AND (s.id IS NULL OR s.deleted_at IS NULL)
           ORDER BY r.created_at DESC LIMIT 500`,
          [rk, sup, sid],
        )
        let verQ = { rows: [] }
        if (sup) {
          verQ = await client.query(
            `SELECT n.id, n.title, n.body, n.seller_id, n.created_at,
                    (s.read_at IS NOT NULL) AS read
             FROM admin_hub_notifications n
             LEFT JOIN seller_hub_notification_state s
               ON s.recipient_key = $1 AND s.source_type = 'verification' AND s.source_id = n.id
             WHERE n.type = 'verification_submitted'
               AND (s.id IS NULL OR s.deleted_at IS NULL)
             ORDER BY n.created_at DESC LIMIT 500`,
            [rk],
          ).catch(() => ({ rows: [] }))
        }
        let crQ = { rows: [] }
        if (sup) {
          crQ = await client.query(
            `SELECT cr.id, cr.product_id, cr.seller_id, cr.field_name, cr.old_value, cr.new_value, cr.created_at, p.title AS product_title,
                    (s.read_at IS NOT NULL) AS read
             FROM admin_hub_product_change_requests cr
             LEFT JOIN admin_hub_products p ON p.id = cr.product_id
             LEFT JOIN seller_hub_notification_state s
               ON s.recipient_key = $1 AND s.source_type = 'product_change_request' AND s.source_id = cr.id
             WHERE cr.status = 'pending'
               AND (s.id IS NULL OR s.deleted_at IS NULL)
             ORDER BY cr.created_at DESC LIMIT 500`,
            [rk],
          ).catch(() => ({ rows: [] }))
        }
        await client.end()

        const crShortVal = (val) => {
          if (val == null || val === '') return '—'
          const s = String(val).trim()
          if (!s) return '—'
          try {
            const j = JSON.parse(s)
            if (j !== null && typeof j === 'object') {
              const t = JSON.stringify(j)
              return t.length > 90 ? `${t.slice(0, 89)}…` : t
            }
          } catch (_) { /* plain string */ }
          const one = s.replace(/\s+/g, ' ')
          return one.length > 100 ? `${one.slice(0, 99)}…` : one
        }
        const crFieldDe = (fn) => {
          const f = String(fn || '')
          if (f === 'title') return 'Titel'
          if (f === 'description') return 'Beschreibung'
          if (f.startsWith('metadata.')) return `Meta (${f.replace(/^metadata\./, '')})`
          return f || '—'
        }

        const orderFeedItems = []
        for (const r of ordersQ.rows || []) {
          orderFeedItems.push({
            source_type: 'order',
            source_id: r.id,
            read: !!r.read,
            created_at: r.created_at,
            title: `Neue Bestellung #${r.order_number != null ? r.order_number : '—'}`,
            subtitle: `${r.first_name || ''} ${r.last_name || ''}`.trim() + (r.total_cents ? ` · ${(Number(r.total_cents) / 100).toLocaleString('de-DE', { minimumFractionDigits: 2 })} €` : ''),
            href: `/orders/${r.id}`,
          })
        }
        const returnFeedItems = []
        for (const r of returnsQ.rows || []) {
          returnFeedItems.push({
            source_type: 'return',
            source_id: r.id,
            read: !!r.read,
            created_at: r.created_at,
            title: `Rückgabeanfrage R-${r.return_number != null ? r.return_number : '—'}`,
            subtitle: `Bestellung #${r.order_number != null ? r.order_number : '—'} · ${r.status || ''}`,
            href: '/orders/returns',
          })
        }
        const verificationFeedItems = []
        for (const r of verQ.rows || []) {
          verificationFeedItems.push({
            source_type: 'verification',
            source_id: r.id,
            read: !!r.read,
            created_at: r.created_at,
            title: r.title || 'Evrak',
            subtitle: r.body || '',
            href: r.seller_id ? `/sellers/${r.seller_id}` : '/sellers',
          })
        }
        const productChangeFeedItems = []
        for (const r of crQ.rows || []) {
          const pid = r.product_id ? String(r.product_id) : ''
          const sub = `${r.product_title || 'Produkt'} · ${crFieldDe(r.field_name)} — Aktuell: ${crShortVal(r.old_value)} → Vorschlag: ${crShortVal(r.new_value)}`
          productChangeFeedItems.push({
            source_type: 'product_change_request',
            source_id: r.id,
            read: !!r.read,
            created_at: r.created_at,
            title: 'Produktänderung ausstehend',
            subtitle: sub.length > 500 ? `${sub.slice(0, 499)}…` : sub,
            href: pid ? `/products/${pid}` : '/products/inventory',
            product_id: pid || undefined,
            field_name: r.field_name,
            old_value: r.old_value,
            new_value: r.new_value,
          })
        }

        const groupedMode = req.query.grouped === '1' || req.query.grouped === 'true'
        if (groupedMode) {
          const groups = [
            {
              key: 'order',
              label_de: 'Bestellungen',
              description_de: 'Neue Bestellungen und Bestellübersicht',
              items: orderFeedItems,
            },
            {
              key: 'return',
              label_de: 'Rücksendungen',
              description_de: 'Rückgabeanfragen und Erstattungen',
              items: returnFeedItems,
            },
          ]
          if (sup) {
            groups.push(
              {
                key: 'verification',
                label_de: 'Verifizierung & Evrak',
                description_de: 'Verkäufer-Verifizierung und eingereichte Dokumente',
                items: verificationFeedItems,
              },
              {
                key: 'product_change_request',
                label_de: 'Produktänderungen',
                description_de: 'Ausstehende Freigaben für Verkäufer-Änderungen',
                items: productChangeFeedItems,
              },
            )
          }
          const grand_total = groups.reduce((s, g) => s + g.items.length, 0)
          return res.json({
            grouped: true,
            groups: groups.map((g) => ({ ...g, total: g.items.length })),
            grand_total,
          })
        }

        const items = [...orderFeedItems, ...returnFeedItems, ...verificationFeedItems, ...productChangeFeedItems]
        items.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        const total = items.length
        const paged = items.slice(off, off + lim)
        res.json({ items: paged, total, offset: off, limit: lim })
      } catch (e) {
        if (client) try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    const adminHubNotificationsDeletePOST = async (req, res) => {
      const ctx = getNotifRecipientContext(req)
      if (!ctx) return res.status(401).json({ message: 'Unauthorized' })
      const body = req.body || {}
      const all = !!body.all
      const items = Array.isArray(body.items) ? body.items : []
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        const rk = ctx.recipientKey
        const sup = ctx.isSuperuser
        const sid = ctx.sellerId
        const markDeleted = async (sourceType, sourceId) => {
          await client.query(
            `INSERT INTO seller_hub_notification_state (recipient_key, source_type, source_id, deleted_at)
             VALUES ($1::varchar, $2::varchar, $3::uuid, now())
             ON CONFLICT (recipient_key, source_type, source_id)
             DO UPDATE SET deleted_at = now()`,
            [rk, sourceType, sourceId],
          )
        }
        if (all) {
          await client.query(
            `INSERT INTO seller_hub_notification_state (recipient_key, source_type, source_id, deleted_at)
             SELECT $1::varchar, 'order', o.id, now() FROM store_orders o
             WHERE ($2::boolean OR o.seller_id = $3)
             ON CONFLICT (recipient_key, source_type, source_id) DO UPDATE SET deleted_at = now()`,
            [rk, sup, sid],
          )
          await client.query(
            `INSERT INTO seller_hub_notification_state (recipient_key, source_type, source_id, deleted_at)
             SELECT $1::varchar, 'return', r.id, now()
             FROM store_returns r INNER JOIN store_orders o ON o.id = r.order_id
             WHERE ($2::boolean OR o.seller_id = $3)
             ON CONFLICT (recipient_key, source_type, source_id) DO UPDATE SET deleted_at = now()`,
            [rk, sup, sid],
          )
          if (sup) {
            await client.query(
              `INSERT INTO seller_hub_notification_state (recipient_key, source_type, source_id, deleted_at)
               SELECT $1::varchar, 'verification', n.id, now()
               FROM admin_hub_notifications n WHERE n.type = 'verification_submitted'
               ON CONFLICT (recipient_key, source_type, source_id) DO UPDATE SET deleted_at = now()`,
              [rk],
            )
            await client.query(
              `INSERT INTO seller_hub_notification_state (recipient_key, source_type, source_id, deleted_at)
               SELECT $1::varchar, 'product_change_request', cr.id, now()
               FROM admin_hub_product_change_requests cr
               WHERE cr.status = 'pending'
               ON CONFLICT (recipient_key, source_type, source_id) DO UPDATE SET deleted_at = now()`,
              [rk],
            )
          }
        } else {
          for (const it of items) {
            const st = String(it.source_type || '').trim()
            const id = it.source_id
            if (!st || !id) continue
            if (!sup && st === 'product_change_request') continue
            await markDeleted(st, id)
          }
        }
        await client.end()
        res.json({ success: true })
      } catch (e) {
        if (client) try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    // ── Messages ──────────────────────────────────────────────────────────
    const getSmtpTransport = async (client) => {
      let nodemailer
      try { nodemailer = require('nodemailer') } catch { return null }
      const r = await client.query(`SELECT * FROM store_smtp_settings WHERE seller_id = 'default' LIMIT 1`)
      const s = r.rows[0]
      if (!s?.host || !s?.username) return null
      return nodemailer.createTransport({
        host: s.host, port: s.port || 587, secure: !!s.secure,
        auth: { user: s.username, pass: s.password_enc || '' },
      })
    }

    const adminHubMessagesGET = async (req, res) => {
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        const orderId = req.query.order_id || null
        const sellerId = (req.query.seller_id || '').trim()
        const searchRaw = (req.query.q || req.query.search || '').trim()
        // channel: 'customer' (default) = customer<->seller msgs, 'support' = seller<->support team msgs
        const channel = (req.query.channel || 'customer').trim()
        const lim = Math.min(Math.max(parseInt(req.query.limit, 10) || (searchRaw ? 600 : 400), 1), 1000)
        let q
        const params = []
        const conditions = []
        if (channel === 'support') {
          q = `SELECT m.*,
            sh.store_name AS seller_store_name
            FROM store_messages m
            LEFT JOIN admin_hub_seller_settings sh ON sh.seller_id = m.seller_id`
          if (sellerId) { params.push(sellerId); conditions.push(`m.seller_id = $${params.length}`) }
          conditions.push(`m.channel = 'support'`)
          if (searchRaw) {
            const term = `%${searchRaw.replace(/%/g, '\\%').replace(/_/g, '\\_')}%`
            params.push(term)
            const n = params.length
            conditions.push(`(
              m.body ILIKE $${n} ESCAPE '\\'
              OR COALESCE(m.subject, '') ILIKE $${n} ESCAPE '\\'
              OR COALESCE(m.seller_id, '') ILIKE $${n} ESCAPE '\\'
              OR COALESCE(sh.store_name, '') ILIKE $${n} ESCAPE '\\'
            )`)
          }
        } else {
          q = `SELECT m.*,
            o.order_number, o.status AS order_status, o.order_status AS order_order_status,
            o.total_cents AS order_total_cents, o.first_name AS order_first_name,
            o.last_name AS order_last_name, o.email AS order_email,
            o.seller_id AS order_seller_id,
            c.customer_number AS customer_number,
            sh.store_name AS seller_store_name
            FROM store_messages m
            LEFT JOIN store_orders o ON o.id = m.order_id
            LEFT JOIN store_customers c ON c.email IS NOT NULL AND o.email IS NOT NULL
              AND LOWER(TRIM(c.email)) = LOWER(TRIM(o.email))
            LEFT JOIN admin_hub_seller_settings sh ON sh.seller_id = o.seller_id`
          conditions.push(`(m.channel = 'customer' OR m.channel IS NULL)`)
          if (orderId) { params.push(orderId); conditions.push(`m.order_id = $${params.length}::uuid`) }
          if (sellerId) { params.push(sellerId); conditions.push(`o.seller_id = $${params.length}`) }
          if (searchRaw) {
            const term = `%${searchRaw.replace(/%/g, '\\%').replace(/_/g, '\\_')}%`
            params.push(term)
            const n = params.length
            conditions.push(`(
              m.body ILIKE $${n} ESCAPE '\\'
              OR COALESCE(m.subject, '') ILIKE $${n} ESCAPE '\\'
              OR CAST(o.order_number AS TEXT) ILIKE $${n} ESCAPE '\\'
              OR CAST(c.customer_number AS TEXT) ILIKE $${n} ESCAPE '\\'
              OR COALESCE(o.first_name, '') ILIKE $${n} ESCAPE '\\'
              OR COALESCE(o.last_name, '') ILIKE $${n} ESCAPE '\\'
              OR TRIM(COALESCE(o.first_name, '') || ' ' || COALESCE(o.last_name, '')) ILIKE $${n} ESCAPE '\\'
              OR COALESCE(o.email, '') ILIKE $${n} ESCAPE '\\'
              OR COALESCE(m.sender_email, '') ILIKE $${n} ESCAPE '\\'
              OR COALESCE(sh.store_name, '') ILIKE $${n} ESCAPE '\\'
              OR COALESCE(o.seller_id, '') ILIKE $${n} ESCAPE '\\'
            )`)
          }
        }
        if (conditions.length) q += ' WHERE ' + conditions.join(' AND ')
        q += ` ORDER BY m.created_at ASC LIMIT ${lim}`
        const r = await client.query(q, params)
        // Unread count depends on channel
        let unreadR
        if (channel === 'support') {
          const unreadParams = sellerId ? [sellerId] : []
          const unreadWhere = sellerId ? `AND m2.seller_id = $1` : ''
          unreadR = await client.query(
            `SELECT COUNT(*)::int AS c FROM store_messages m2 WHERE m2.channel = 'support' AND m2.sender_type = 'customer' AND m2.is_read_by_seller = false ${unreadWhere}`,
            unreadParams
          )
        } else {
          const unreadWhere = sellerId ? `AND m2.order_id IN (SELECT id FROM store_orders WHERE seller_id = $1)` : ''
          unreadR = await client.query(
            `SELECT COUNT(*)::int AS c FROM store_messages m2 WHERE (m2.channel = 'customer' OR m2.channel IS NULL) AND m2.sender_type = 'customer' AND m2.is_read_by_seller = false ${unreadWhere}`,
            sellerId ? [sellerId] : []
          )
        }
        await client.end()
        res.json({
          messages: r.rows.map(row => ({
            ...row,
            order_number: row.order_number ? Number(row.order_number) : null,
            order_total_cents: row.order_total_cents != null ? Number(row.order_total_cents) : null,
            customer_number: row.customer_number != null ? Number(row.customer_number) : null,
          })),
          unread: unreadR.rows[0]?.c || 0,
        })
      } catch (e) {
        if (client) try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    const adminHubMessagesPOST = async (req, res) => {
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        const { order_id, body, subject, channel, sender_seller_id } = req.body || {}
        if (!body) { await client.end(); return res.status(400).json({ message: 'body required' }) }
        const { fromEmail: sellerEmail } = await resolveSmtpSenderIdentity(client, null)

        if (channel === 'support') {
          // Support channel: seller <-> support team (superusers)
          // sender_seller_id: if set, sender is a seller; if null, sender is support team
          const isSupportSide = !sender_seller_id
          const senderType = isSupportSide ? 'seller' : 'customer' // 'customer' = seller side, 'seller' = support side
          const msgSellerId = sender_seller_id || req.body.target_seller_id || null
          const r = await client.query(
            `INSERT INTO store_messages (order_id, sender_type, sender_email, recipient_email, subject, body, channel, seller_id, is_read_by_seller, is_read_by_support, is_read_by_customer)
             VALUES ($1, $2, $3, $4, $5, $6, 'support', $7, $8, $9, false) RETURNING *`,
            [
              null, senderType, sellerEmail, null, subject || null, body, msgSellerId,
              isSupportSide ? true : false, // is_read_by_seller: support side msgs are auto-read by support
              isSupportSide ? false : true,  // is_read_by_support: seller side msgs need to be read by support
            ]
          )
          await client.end()
          return res.status(201).json({ message: r.rows[0] })
        }

        // Customer channel (default)
        // Get order's customer email
        let recipientEmail = null
        if (order_id) {
          const oR = await client.query(`SELECT email FROM store_orders WHERE id = $1::uuid`, [order_id])
          recipientEmail = oR.rows[0]?.email || null
        }
        const r = await client.query(
          `INSERT INTO store_messages (order_id, sender_type, sender_email, recipient_email, subject, body, channel, is_read_by_seller, is_read_by_customer)
           VALUES ($1, 'seller', $2, $3, $4, $5, 'customer', true, false) RETURNING *`,
          [order_id || null, sellerEmail, recipientEmail, subject || null, body]
        )
        const msg = r.rows[0]
        // Send email via SMTP
        if (recipientEmail) {
          const transport = await getSmtpTransport(client)
          if (transport) {
            const _snR = await client.query(`SELECT from_name FROM store_smtp_settings WHERE seller_id = 'default' LIMIT 1`)
            const fromName = _snR.rows[0]?.from_name || 'Shop'
            const rawBody = String(body || '')
            const looksHtml = /<[a-z][\s\S]*>/i.test(rawBody)
            const plainFromHtml = (html) =>
              String(html || '')
                .replace(/<br\s*\/?>/gi, '\n')
                .replace(/<\/p>/gi, '\n\n')
                .replace(/<[^>]+>/g, '')
                .replace(/\n{3,}/g, '\n\n')
                .trim()
            const mailOpts = looksHtml
              ? {
                  text: plainFromHtml(rawBody) || rawBody.replace(/<[^>]+>/g, ''),
                  html: rawBody,
                }
              : { text: rawBody, html: `<p>${rawBody.replace(/\n/g, '<br>')}</p>` }
            transport.sendMail({
              from: `"${fromName}" <${sellerEmail}>`,
              to: recipientEmail,
              subject: subject || 'Nachricht vom Shop',
              ...mailOpts,
            }).catch((e) => console.error('[SMTP sendMail]', e.message))
          }
        }
        await client.end()
        res.status(201).json({ message: msg })
      } catch (e) {
        if (client) try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    const adminHubMessageMarkReadPATCH = async (req, res) => {
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      const id = (req.params.id || '').trim()
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        // Support channel: seller reads support-side msgs (sender_type seller); support reads seller msgs (sender_type customer).
        // Customer channel: seller marks customer msgs read (existing behavior).
        await client.query(
          `UPDATE store_messages SET
            is_read_by_seller = CASE
              WHEN channel = 'support' AND sender_type = 'seller' THEN true
              WHEN channel = 'customer' OR channel IS NULL THEN true
              ELSE is_read_by_seller END,
            is_read_by_support = CASE
              WHEN channel = 'support' AND sender_type = 'customer' THEN true
              ELSE is_read_by_support END
          WHERE id = $1::uuid`,
          [id]
        )
        await client.end()
        res.json({ success: true })
      } catch (e) {
        if (client) try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    // Mark all support-channel messages for a seller as read by support team
    const adminHubSupportMessagesMarkReadPATCH = async (req, res) => {
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        const { seller_id, mark_as, subject_thread } = req.body || {}
        if (!seller_id) { await client.end(); return res.status(400).json({ message: 'seller_id required' }) }
        const subj = (subject_thread === undefined || subject_thread === null) ? null : String(subject_thread).trim()
        const subjectClause =
          subj === null
            ? ''
            : subj === ''
              ? ` AND (subject IS NULL OR TRIM(subject) = '')`
              : ` AND TRIM(COALESCE(subject, '')) = $2`
        const params = subj === null || subj === '' ? [seller_id] : [seller_id, subj]
        if (mark_as === 'support') {
          await client.query(
            `UPDATE store_messages SET is_read_by_support = true WHERE channel = 'support' AND seller_id = $1 AND sender_type = 'customer'${subjectClause}`,
            params
          )
        } else {
          await client.query(
            `UPDATE store_messages SET is_read_by_seller = true WHERE channel = 'support' AND seller_id = $1 AND sender_type = 'seller'${subjectClause}`,
            params
          )
        }
        await client.end()
        res.json({ success: true })
      } catch (e) {
        if (client) try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    const ensureMessageTemplatesTable = async (client) => {
      await client.query(`
        CREATE TABLE IF NOT EXISTS admin_hub_message_templates (
          id bigserial PRIMARY KEY,
          seller_id text NOT NULL,
          name text NOT NULL,
          body text NOT NULL,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now()
        )
      `)
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_admin_hub_message_templates_seller_id
        ON admin_hub_message_templates (seller_id, updated_at DESC)
      `)
    }

    const adminHubMessageTemplatesGET = async (req, res) => {
      const client = getDbClient()
      if (!client) return res.status(503).json({ message: 'DB not configured' })
      try {
        await client.connect()
        await ensureMessageTemplatesTable(client)
        const sellerId = String(req.sellerUser?.seller_id || '').trim()
        if (!sellerId) {
          await client.end()
          return res.status(400).json({ message: 'seller_id missing in token' })
        }
        const r = await client.query(
          `SELECT id, seller_id, name, body, created_at, updated_at
           FROM admin_hub_message_templates
           WHERE seller_id = $1
           ORDER BY updated_at DESC, id DESC`,
          [sellerId],
        )
        await client.end()
        res.json({ templates: r.rows || [], count: r.rows?.length || 0 })
      } catch (e) {
        try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    const adminHubMessageTemplatesPOST = async (req, res) => {
      const client = getDbClient()
      if (!client) return res.status(503).json({ message: 'DB not configured' })
      try {
        await client.connect()
        await ensureMessageTemplatesTable(client)
        const sellerId = String(req.sellerUser?.seller_id || '').trim()
        if (!sellerId) {
          await client.end()
          return res.status(400).json({ message: 'seller_id missing in token' })
        }
        const name = String(req.body?.name || '').trim()
        const body = String(req.body?.body || '').trim()
        if (!name) {
          await client.end()
          return res.status(400).json({ message: 'name required' })
        }
        if (!body) {
          await client.end()
          return res.status(400).json({ message: 'body required' })
        }
        if (name.length > 120) {
          await client.end()
          return res.status(400).json({ message: 'name too long' })
        }
        if (body.length > 5000) {
          await client.end()
          return res.status(400).json({ message: 'body too long' })
        }
        const r = await client.query(
          `INSERT INTO admin_hub_message_templates (seller_id, name, body)
           VALUES ($1, $2, $3)
           RETURNING id, seller_id, name, body, created_at, updated_at`,
          [sellerId, name, body],
        )
        await client.end()
        res.status(201).json({ template: r.rows?.[0] || null })
      } catch (e) {
        try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    const adminHubMessageTemplatesDELETE = async (req, res) => {
      const client = getDbClient()
      if (!client) return res.status(503).json({ message: 'DB not configured' })
      try {
        await client.connect()
        await ensureMessageTemplatesTable(client)
        const sellerId = String(req.sellerUser?.seller_id || '').trim()
        const id = Number(req.params.id)
        if (!sellerId) {
          await client.end()
          return res.status(400).json({ message: 'seller_id missing in token' })
        }
        if (!Number.isFinite(id) || id <= 0) {
          await client.end()
          return res.status(400).json({ message: 'invalid id' })
        }
        await client.query(
          `DELETE FROM admin_hub_message_templates WHERE id = $1 AND seller_id = $2`,
          [id, sellerId],
        )
        await client.end()
        res.json({ success: true })
      } catch (e) {
        try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    const adminHubMessageTemplatesPATCH = async (req, res) => {
      const client = getDbClient()
      if (!client) return res.status(503).json({ message: 'DB not configured' })
      try {
        await client.connect()
        await ensureMessageTemplatesTable(client)
        const sellerId = String(req.sellerUser?.seller_id || '').trim()
        const id = Number(req.params.id)
        if (!sellerId) {
          await client.end()
          return res.status(400).json({ message: 'seller_id missing in token' })
        }
        if (!Number.isFinite(id) || id <= 0) {
          await client.end()
          return res.status(400).json({ message: 'invalid id' })
        }
        const nameRaw = req.body?.name
        const bodyRaw = req.body?.body
        const updates = []
        const vals = []
        let n = 0
        if (nameRaw !== undefined) {
          const name = String(nameRaw || '').trim()
          if (!name) {
            await client.end()
            return res.status(400).json({ message: 'name required' })
          }
          if (name.length > 120) {
            await client.end()
            return res.status(400).json({ message: 'name too long' })
          }
          n++
          updates.push(`name = $${n}`)
          vals.push(name)
        }
        if (bodyRaw !== undefined) {
          const body = String(bodyRaw || '').trim()
          if (!body) {
            await client.end()
            return res.status(400).json({ message: 'body required' })
          }
          if (body.length > 5000) {
            await client.end()
            return res.status(400).json({ message: 'body too long' })
          }
          n++
          updates.push(`body = $${n}`)
          vals.push(body)
        }
        if (!updates.length) {
          await client.end()
          return res.status(400).json({ message: 'nothing to update' })
        }
        const idPh = n + 1
        const sidPh = n + 2
        vals.push(id, sellerId)
        const r = await client.query(
          `UPDATE admin_hub_message_templates SET ${updates.join(', ')}, updated_at = now()
           WHERE id = $${idPh} AND seller_id = $${sidPh}
           RETURNING id, seller_id, name, body, created_at, updated_at`,
          vals,
        )
        await client.end()
        if (!r.rows?.length) return res.status(404).json({ message: 'template not found' })
        res.json({ template: r.rows[0] })
      } catch (e) {
        try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    const storeMessagesGET = async (req, res) => {
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      const token = (req.headers.authorization || '').replace('Bearer ', '').trim()
      if (!token) return res.status(401).json({ message: 'Unauthorized' })
      const payload = verifyCustomerToken(token)
      if (!payload?.email) return res.status(401).json({ message: 'Invalid token' })
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        const orderId = req.query.order_id || null
        let q = `SELECT m.*, o.order_number FROM store_messages m
          LEFT JOIN store_orders o ON o.id = m.order_id
          WHERE (m.sender_email = $1 OR m.recipient_email = $1
            OR (m.order_id IS NOT NULL AND m.order_id IN (
              SELECT id FROM store_orders WHERE LOWER(email) = LOWER($1)
            )))`
        const params = [payload.email]
        if (orderId) { params.push(orderId); q += ` AND m.order_id = $2::uuid` }
        q += ' ORDER BY m.created_at ASC'
        const r = await client.query(q, params)
        await client.end()
        res.json({ messages: r.rows.map(row => ({ ...row, order_number: row.order_number ? Number(row.order_number) : null })) })
      } catch (e) {
        if (client) try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    const storeMessagesPOST = async (req, res) => {
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      const token = (req.headers.authorization || '').replace('Bearer ', '').trim()
      if (!token) return res.status(401).json({ message: 'Unauthorized' })
      const payload = verifyCustomerToken(token)
      if (!payload?.email) return res.status(401).json({ message: 'Invalid token' })
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        const { order_id, body, subject } = req.body || {}
        if (!body) { await client.end(); return res.status(400).json({ message: 'body required' }) }
        const { fromEmail: sellerEmail } = await resolveSmtpSenderIdentity(client, null)
        const r = await client.query(
          `INSERT INTO store_messages (order_id, sender_type, sender_email, recipient_email, subject, body, is_read_by_seller, is_read_by_customer)
           VALUES ($1, 'customer', $2, $3, $4, $5, false, true) RETURNING *`,
          [order_id || null, payload.email, sellerEmail, subject || null, body]
        )
        // Forward to seller via SMTP
        if (sellerEmail) {
          const transport = await getSmtpTransport(client)
          if (transport) {
            transport.sendMail({
              from: `"Kunde" <${payload.email}>`,
              to: sellerEmail,
              replyTo: payload.email,
              subject: subject || `Neue Nachricht von Kunde${order_id ? ' (Bestellung)' : ''}`,
              text: body,
              html: `<p><strong>Von:</strong> ${payload.email}</p><p>${body.replace(/\n/g, '<br>')}</p>`,
            }).catch((e) => console.error('[SMTP sendMail]', e.message))
          }
        }
        await client.end()
        res.status(201).json({ message: r.rows[0] })
      } catch (e) {
        if (client) try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    // ── SMTP Settings ─────────────────────────────────────────────────────
    const syncDefaultSenderFromSmtpForm = async (client, fromEmail, fromName) => {
      const fe = String(fromEmail || '').trim()
      const fn = String(fromName || '').trim()
      if (!fe) return
      const def = await client.query(
        `SELECT id FROM store_smtp_sender_profiles WHERE seller_id = 'default' AND is_default = true LIMIT 1`,
      )
      if (def.rows[0]) {
        await client.query(`UPDATE store_smtp_sender_profiles SET from_email = $1, from_name = $2 WHERE id = $3::uuid`, [
          fe,
          fn || null,
          def.rows[0].id,
        ])
        return
      }
      const cnt = await client.query(`SELECT COUNT(*)::int AS n FROM store_smtp_sender_profiles WHERE seller_id = 'default'`)
      const first = Number(cnt.rows[0]?.n || 0) === 0
      await client.query(
        `INSERT INTO store_smtp_sender_profiles (seller_id, from_email, from_name, is_default) VALUES ('default', $1, $2, $3)`,
        [fe, fn || null, first],
      )
    }

    const adminHubSmtpSettingsGET = async (req, res) => {
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        const r = await client.query(`SELECT seller_id, provider, host, port, secure, username, from_name, from_email, updated_at FROM store_smtp_settings WHERE seller_id = 'default' LIMIT 1`)
        const row = r.rows[0] || null
        const smtpConfigured = !!(row?.host)
        let senders = []
        if (req.sellerUser?.is_superuser) {
          const sr = await client.query(
            `SELECT id, from_email, from_name, is_default, last_test_ok, last_test_at, last_test_message FROM store_smtp_sender_profiles WHERE seller_id = 'default' ORDER BY is_default DESC, created_at ASC`,
          )
          senders = sr.rows || []
        }
        await client.end()
        if (!req.sellerUser?.is_superuser) {
          return res.json({ smtp: null, smtp_configured: smtpConfigured, senders: [] })
        }
        res.json({ smtp: row, smtp_configured: smtpConfigured, senders })
      } catch (e) {
        if (client) try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    const adminHubSmtpSettingsPATCH = async (req, res) => {
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        const { provider, host, port, secure, username, password, from_name, from_email } = req.body || {}
        await client.query(
          `INSERT INTO store_smtp_settings (seller_id, provider, host, port, secure, username, password_enc, from_name, from_email, updated_at)
           VALUES ('default', $1, $2, $3, $4, $5, $6, $7, $8, now())
           ON CONFLICT (seller_id) DO UPDATE SET
             provider = EXCLUDED.provider, host = EXCLUDED.host, port = EXCLUDED.port,
             secure = EXCLUDED.secure, username = EXCLUDED.username,
             password_enc = CASE WHEN EXCLUDED.password_enc IS NOT NULL AND EXCLUDED.password_enc <> '' THEN EXCLUDED.password_enc ELSE store_smtp_settings.password_enc END,
             from_name = EXCLUDED.from_name, from_email = EXCLUDED.from_email, updated_at = now()`,
          [provider || null, host || null, port || 587, !!secure, username || null, password || null, from_name || null, from_email || null]
        )
        await syncDefaultSenderFromSmtpForm(client, from_email, from_name)
        await client.end()
        res.json({ success: true })
      } catch (e) {
        if (client) try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    const adminHubSmtpSettingsTestPOST = async (req, res) => {
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        const transport = await getSmtpTransport(client)
        await client.end()
        if (!transport) return res.status(400).json({ message: 'SMTP nicht konfiguriert' })
        await transport.verify()
        res.json({ success: true, message: 'Verbindung erfolgreich' })
      } catch (e) {
        if (client) try { await client.end() } catch (_) {}
        res.status(400).json({ message: e?.message || 'Verbindung fehlgeschlagen' })
      }
    }

    const SMTP_PROFILE_UUID_RE =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

    const adminHubSmtpSendersPOST = async (req, res) => {
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        const { from_email, from_name } = req.body || {}
        const fe = String(from_email || '').trim()
        if (!fe) {
          await client.end()
          return res.status(400).json({ message: 'from_email required' })
        }
        const cnt = await client.query(`SELECT COUNT(*)::int AS n FROM store_smtp_sender_profiles WHERE seller_id = 'default'`)
        const isFirst = Number(cnt.rows[0]?.n || 0) === 0
        const ins = await client.query(
          `INSERT INTO store_smtp_sender_profiles (seller_id, from_email, from_name, is_default)
           VALUES ('default', $1, $2, $3)
           RETURNING id, from_email, from_name, is_default, last_test_ok, last_test_at, last_test_message`,
          [fe, String(from_name || '').trim() || null, isFirst],
        )
        await client.end()
        res.status(201).json({ sender: ins.rows[0] })
      } catch (e) {
        if (client) try { await client.end() } catch (_) {}
        const msg = e?.code === '23505' ? 'This from_email already exists' : e?.message || 'Error'
        res.status(400).json({ message: msg })
      }
    }

    const adminHubSmtpSendersPATCH = async (req, res) => {
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        const id = String(req.params.id || '').trim()
        if (!SMTP_PROFILE_UUID_RE.test(id)) {
          await client.end()
          return res.status(400).json({ message: 'invalid id' })
        }
        const ex = await client.query(
          `SELECT id FROM store_smtp_sender_profiles WHERE id = $1::uuid AND seller_id = 'default'`,
          [id],
        )
        if (!ex.rows[0]) {
          await client.end()
          return res.status(404).json({ message: 'Sender not found' })
        }
        const { from_email, from_name } = req.body || {}
        const fe = String(from_email || '').trim()
        if (!fe) {
          await client.end()
          return res.status(400).json({ message: 'from_email required' })
        }
        const up = await client.query(
          `UPDATE store_smtp_sender_profiles SET from_email = $1, from_name = $2 WHERE id = $3::uuid AND seller_id = 'default'
           RETURNING id, from_email, from_name, is_default, last_test_ok, last_test_at, last_test_message`,
          [fe, String(from_name || '').trim() || null, id],
        )
        await client.end()
        res.json({ sender: up.rows[0] })
      } catch (e) {
        if (client) try { await client.end() } catch (_) {}
        const msg = e?.code === '23505' ? 'This from_email already exists' : e?.message || 'Error'
        res.status(400).json({ message: msg })
      }
    }

    const adminHubSmtpSendersDELETE = async (req, res) => {
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        const id = String(req.params.id || '').trim()
        if (!SMTP_PROFILE_UUID_RE.test(id)) {
          await client.end()
          return res.status(400).json({ message: 'invalid id' })
        }
        const row = await client.query(
          `SELECT id, is_default FROM store_smtp_sender_profiles WHERE id = $1::uuid AND seller_id = 'default'`,
          [id],
        )
        if (!row.rows[0]) {
          await client.end()
          return res.status(404).json({ message: 'Sender not found' })
        }
        const total = await client.query(`SELECT COUNT(*)::int AS n FROM store_smtp_sender_profiles WHERE seller_id = 'default'`)
        if (Number(total.rows[0]?.n || 0) <= 1) {
          await client.end()
          return res.status(400).json({ message: 'Cannot delete the only sender profile' })
        }
        await client.query(`DELETE FROM store_smtp_sender_profiles WHERE id = $1::uuid AND seller_id = 'default'`, [id])
        if (row.rows[0].is_default) {
          const pick = await client.query(
            `SELECT id FROM store_smtp_sender_profiles WHERE seller_id = 'default' ORDER BY created_at ASC LIMIT 1`,
          )
          if (pick.rows[0]?.id) {
            await client.query(`UPDATE store_smtp_sender_profiles SET is_default = true WHERE id = $1::uuid`, [pick.rows[0].id])
            const sync = await client.query(
              `SELECT from_email, from_name FROM store_smtp_sender_profiles WHERE id = $1::uuid`,
              [pick.rows[0].id],
            )
            if (sync.rows[0]?.from_email) {
              await client.query(
                `UPDATE store_smtp_settings SET from_email = $1, from_name = $2, updated_at = now() WHERE seller_id = 'default'`,
                [String(sync.rows[0].from_email).trim(), sync.rows[0].from_name || null],
              )
            }
          }
        }
        await client.end()
        res.json({ deleted: true })
      } catch (e) {
        if (client) try { await client.end() } catch (_) {}
        res.status(400).json({ message: e?.message || 'Error' })
      }
    }

    const adminHubSmtpSendersSetDefaultPOST = async (req, res) => {
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        const id = String(req.params.id || '').trim()
        if (!SMTP_PROFILE_UUID_RE.test(id)) {
          await client.end()
          return res.status(400).json({ message: 'invalid id' })
        }
        const ex = await client.query(
          `SELECT id FROM store_smtp_sender_profiles WHERE id = $1::uuid AND seller_id = 'default'`,
          [id],
        )
        if (!ex.rows[0]) {
          await client.end()
          return res.status(404).json({ message: 'Sender not found' })
        }
        await client.query(`UPDATE store_smtp_sender_profiles SET is_default = false WHERE seller_id = 'default'`)
        await client.query(`UPDATE store_smtp_sender_profiles SET is_default = true WHERE id = $1::uuid AND seller_id = 'default'`, [id])
        const sync = await client.query(
          `SELECT from_email, from_name FROM store_smtp_sender_profiles WHERE id = $1::uuid`,
          [id],
        )
        if (sync.rows[0]?.from_email) {
          await client.query(
            `UPDATE store_smtp_settings SET from_email = $1, from_name = $2, updated_at = now() WHERE seller_id = 'default'`,
            [String(sync.rows[0].from_email).trim(), sync.rows[0].from_name || null],
          )
        }
        await client.end()
        res.json({ success: true })
      } catch (e) {
        if (client) try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    const adminHubSmtpSendersTestPOST = async (req, res) => {
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        const id = String(req.params.id || '').trim()
        const body = req.body || {}
        const toRaw = String(body.to || '').trim()
        const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        if (!SMTP_PROFILE_UUID_RE.test(id)) {
          await client.end()
          return res.status(400).json({ message: 'invalid id' })
        }
        if (!toRaw || !emailRe.test(toRaw)) {
          await client.end()
          return res.status(400).json({ message: 'valid to email required' })
        }
        const ex = await client.query(
          `SELECT id FROM store_smtp_sender_profiles WHERE id = $1::uuid AND seller_id = 'default'`,
          [id],
        )
        if (!ex.rows[0]) {
          await client.end()
          return res.status(404).json({ message: 'Sender not found' })
        }
        const transport = await getSmtpTransport(client)
        const { fromEmail, fromName } = await resolveSmtpSenderIdentity(client, id)
        const msgOk = 'Test email sent'
        try {
          if (!transport) throw new Error('SMTP not configured')
          const fe = String(fromEmail || '').trim()
          if (!fe) throw new Error('From email not set for this sender')
          await transport.sendMail({
            from: `"${String(fromName).replace(/"/g, '')}" <${fe}>`,
            to: toRaw,
            subject: 'SMTP sender test',
            text: 'Andertal SMTP sender test — OK',
            html: '<p>Andertal SMTP sender test — OK</p>',
          })
          await client.query(
            `UPDATE store_smtp_sender_profiles SET last_test_ok = true, last_test_at = now(), last_test_message = $2 WHERE id = $1::uuid`,
            [id, msgOk],
          )
          await client.end()
          return res.json({ success: true, message: msgOk })
        } catch (sendErr) {
          const errMsg = String(sendErr?.message || sendErr || 'Send failed').slice(0, 500)
          await client.query(
            `UPDATE store_smtp_sender_profiles SET last_test_ok = false, last_test_at = now(), last_test_message = $2 WHERE id = $1::uuid`,
            [id, errMsg],
          )
          await client.end()
          return res.status(400).json({ message: errMsg })
        }
      } catch (e) {
        if (client) try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    httpApp.get('/admin-hub/v1/notifications/unread', requireSellerAuth, adminHubNotificationsUnreadGET)
    httpApp.post('/admin-hub/v1/notifications/mark-seen', requireSellerAuth, adminHubNotificationsMarkSeenPOST)
    httpApp.get('/admin-hub/v1/notifications/feed', requireSellerAuth, adminHubNotificationsFeedGET)
    httpApp.post('/admin-hub/v1/notifications/delete', requireSellerAuth, adminHubNotificationsDeletePOST)
    httpApp.get('/admin-hub/v1/messages', adminHubMessagesGET)
    httpApp.post('/admin-hub/v1/messages', adminHubMessagesPOST)
    httpApp.patch('/admin-hub/v1/messages/support/mark-read', adminHubSupportMessagesMarkReadPATCH)
    httpApp.patch('/admin-hub/v1/messages/:id/read', adminHubMessageMarkReadPATCH)
    httpApp.get('/admin-hub/v1/message-templates', requireSellerAuth, adminHubMessageTemplatesGET)
    httpApp.post('/admin-hub/v1/message-templates', requireSellerAuth, adminHubMessageTemplatesPOST)
    httpApp.patch('/admin-hub/v1/message-templates/:id', requireSellerAuth, adminHubMessageTemplatesPATCH)
    httpApp.delete('/admin-hub/v1/message-templates/:id', requireSellerAuth, adminHubMessageTemplatesDELETE)
    httpApp.get('/store/messages', storeMessagesGET)
    httpApp.post('/store/messages', storeMessagesPOST)

    const storeMessagesUnreadCountGET = async (req, res) => {
      const client = getDbClient()
      if (!client) return res.json({ count: 0 })
      try {
        await client.connect()
        const email = req.query.email
        if (!email) return res.json({ count: 0 })
        const r = await client.query(
          `SELECT COUNT(*)::int AS c FROM store_messages WHERE recipient_email = $1 AND sender_type = 'seller' AND is_read_by_customer = false`,
          [email]
        )
        res.json({ count: r.rows[0]?.c || 0 })
      } catch { res.json({ count: 0 }) } finally { await client.end().catch(() => {}) }
    }

    const storeMessagesMarkReadPATCH = async (req, res) => {
      const client = getDbClient()
      if (!client) return res.json({ ok: true })
      try {
        await client.connect()
        const { email, order_id } = req.body || {}
        if (!email) return res.json({ ok: true })
        let q = `UPDATE store_messages SET is_read_by_customer = true WHERE recipient_email = $1 AND sender_type = 'seller'`
        const params = [email]
        if (order_id) { params.push(order_id); q += ` AND order_id = $2` }
        else q += ` AND order_id IS NULL`
        await client.query(q, params)
        res.json({ ok: true })
      } catch { res.json({ ok: true }) } finally { await client.end().catch(() => {}) }
    }

    httpApp.get('/store/messages/unread-count', storeMessagesUnreadCountGET)
    httpApp.patch('/store/messages/mark-read', storeMessagesMarkReadPATCH)
    httpApp.get('/admin-hub/v1/smtp-settings', requireSellerAuth, adminHubSmtpSettingsGET)
    httpApp.patch('/admin-hub/v1/smtp-settings', requireSellerAuth, requireSuperuser, adminHubSmtpSettingsPATCH)
    httpApp.post('/admin-hub/v1/smtp-settings/test', requireSellerAuth, requireSuperuser, adminHubSmtpSettingsTestPOST)
    httpApp.post('/admin-hub/v1/smtp-senders', requireSellerAuth, requireSuperuser, adminHubSmtpSendersPOST)
    httpApp.patch('/admin-hub/v1/smtp-senders/:id', requireSellerAuth, requireSuperuser, adminHubSmtpSendersPATCH)
    httpApp.delete('/admin-hub/v1/smtp-senders/:id', requireSellerAuth, requireSuperuser, adminHubSmtpSendersDELETE)
    httpApp.post('/admin-hub/v1/smtp-senders/:id/set-default', requireSellerAuth, requireSuperuser, adminHubSmtpSendersSetDefaultPOST)
    httpApp.post('/admin-hub/v1/smtp-senders/:id/test', requireSellerAuth, requireSuperuser, adminHubSmtpSendersTestPOST)

    // ── Automation flows (Content → Flows; superuser) ───────────────────────────
    /** Dokumentation + Testdaten für Flow-E-Mails; Platzhalter {KEY} (Groß/Klein egal) */
    const FLOW_MERGE_CATEGORY_LABELS = {
      en: {
        customer: 'Customer',
        order: 'Order & amounts',
        shipping: 'Shipping address',
        product_cart: 'Product & cart',
        shop: 'Shop & links',
        engagement: 'Reviews & loyalty',
      },
      de: {
        customer: 'Kunde',
        order: 'Bestellung & Beträge',
        shipping: 'Lieferadresse',
        product_cart: 'Produkt & Warenkorb',
        shop: 'Shop & Links',
        engagement: 'Bewertung & Bonus',
      },
      tr: {
        customer: 'Müşteri',
        order: 'Sipariş ve tutarlar',
        shipping: 'Teslimat adresi',
        product_cart: 'Ürün ve sepet',
        shop: 'Mağaza ve bağlantılar',
        engagement: 'Yorum ve sadakat',
      },
      fr: {
        customer: 'Client',
        order: 'Commande & montants',
        shipping: 'Adresse de livraison',
        product_cart: 'Produit & panier',
        shop: 'Boutique & liens',
        engagement: 'Avis & fidélité',
      },
      it: {
        customer: 'Cliente',
        order: 'Ordine & importi',
        shipping: 'Indirizzo di spedizione',
        product_cart: 'Prodotto & carrello',
        shop: 'Negozio & link',
        engagement: 'Recensioni & punti',
      },
      es: {
        customer: 'Cliente',
        order: 'Pedido e importes',
        shipping: 'Dirección de envío',
        product_cart: 'Producto y carrito',
        shop: 'Tienda y enlaces',
        engagement: 'Reseñas y puntos',
      },
    }
    const FLOW_MERGE_SYNTAX = {
      en: 'Use curly braces. Names are not case-sensitive — {FIRST_NAME}, {first_name}, and {Customer_Name} all work.',
      de: 'Geschweifte Klammern verwenden; Groß-/Kleinschreibung ist egal ({FIRST_NAME} = {first_name}).',
      tr: 'Süslü parantez kullanın; büyük/küçük harf duyarlı değildir ({FIRST_NAME} = {first_name}).',
      fr: 'Accolades ; la casse est ignorée ({FIRST_NAME} = {first_name}).',
      it: 'Parentesi graffe ; maiuscole/minuscole equivalenti ({FIRST_NAME} = {first_name}).',
      es: 'Llaves ; mayúsculas/minúsculas equivalen ({FIRST_NAME} = {first_name}).',
    }
    const FLOW_MERGE_FIELDS = [
      {
        key: 'CUSTOMER_NAME',
        sample: 'Jane Doe',
        category: 'customer',
        triggers: ['*'],
        desc: {
          en: 'Full name (first + last)',
          de: 'Vollständiger Name',
          tr: 'Ad soyad',
          fr: 'Nom complet',
          it: 'Nome completo',
          es: 'Nombre completo',
        },
      },
      {
        key: 'CUSTOMER',
        sample: 'Jane Doe',
        category: 'customer',
        triggers: ['*'],
        desc: {
          en: 'Alias for customer display name',
          de: 'Alias für Anzeigename',
          tr: 'Müşteri görünen adı (alias)',
          fr: 'Alias du nom affiché',
          it: 'Alias nome visualizzato',
          es: 'Alias del nombre mostrado',
        },
      },
      {
        key: 'FIRST_NAME',
        sample: 'Jane',
        category: 'customer',
        triggers: ['*'],
        desc: { en: 'First name', de: 'Vorname', tr: 'Ad', fr: 'Prénom', it: 'Nome', es: 'Nombre' },
      },
      {
        key: 'LAST_NAME',
        sample: 'Doe',
        category: 'customer',
        triggers: ['*'],
        desc: { en: 'Last name', de: 'Nachname', tr: 'Soyad', fr: 'Nom', it: 'Cognome', es: 'Apellido' },
      },
      {
        key: 'EMAIL',
        sample: 'customer@example.com',
        category: 'customer',
        triggers: ['*'],
        desc: { en: 'Email address', de: 'E-Mail-Adresse', tr: 'E-posta', fr: 'E-mail', it: 'Email', es: 'Correo' },
      },
      {
        key: 'PHONE',
        sample: '+49 30 1234567',
        category: 'customer',
        triggers: ['*'],
        desc: { en: 'Phone if known', de: 'Telefon falls bekannt', tr: 'Telefon (varsa)', fr: 'Téléphone', it: 'Telefono', es: 'Teléfono' },
      },
      {
        key: 'GENDER',
        sample: 'female',
        category: 'customer',
        triggers: ['*'],
        desc: {
          en: 'Raw gender from profile (if set)',
          de: 'Geschlecht aus dem Profil (falls gesetzt)',
          tr: 'Profildeki cinsiyet (varsa)',
          fr: 'Genre du profil',
          it: 'Genere dal profilo',
          es: 'Género del perfil',
        },
      },
      {
        key: 'GREETING_DE',
        sample: 'Sehr geehrte Frau',
        category: 'customer',
        triggers: ['*'],
        desc: {
          en: 'Formal German greeting line (from gender when set)',
          de: 'Deutsche Anrede nach Geschlecht',
          tr: 'Almanca hitap satırı (cinsiyete göre)',
          fr: 'Formule allemande selon le genre',
          it: 'Formula tedesca in base al genere',
          es: 'Saludo formal DE según género',
        },
      },
      {
        key: 'GREETING_EN',
        sample: 'Dear Ms.',
        category: 'customer',
        triggers: ['*'],
        desc: {
          en: 'English greeting prefix from gender',
          de: 'Englische Anrede nach Geschlecht',
          tr: 'İngilizce hitap (cinsiyete göre)',
          fr: 'Formule anglaise selon le genre',
          it: 'Formula inglese',
          es: 'Saludo EN según género',
        },
      },
      {
        key: 'GREETING_TR',
        sample: 'Sayın Bayan',
        category: 'customer',
        triggers: ['*'],
        desc: {
          en: 'Turkish greeting from gender',
          de: 'Türkische Anrede nach Geschlecht',
          tr: 'Türkçe hitap (cinsiyete göre)',
          fr: 'Formule turque selon le genre',
          it: 'Formula turca',
          es: 'Saludo TR según género',
        },
      },
      {
        key: 'SALUTATION_DE',
        sample: 'Frau',
        category: 'customer',
        triggers: ['*'],
        desc: {
          en: 'German title only (Herr/Frau)',
          de: 'Anrede Kurzform',
          tr: 'Almanca unvan (Bay/Bayan)',
          fr: 'Civilité courte DE',
          it: 'Titolo DE',
          es: 'Tratamiento DE',
        },
      },
      {
        key: 'TRACKING_NUMBER',
        sample: '1Z999AA10123456784',
        category: 'shipping',
        triggers: ['order_shipped', 'order_delivered'],
        desc: {
          en: 'Carrier tracking number when shipped',
          de: 'Sendungsnummer (Versand)',
          tr: 'Kargo takip numarası',
          fr: 'Numéro de suivi',
          it: 'Numero di tracking',
          es: 'Número de seguimiento',
        },
      },
      {
        key: 'CARRIER_NAME',
        sample: 'DHL',
        category: 'shipping',
        triggers: ['order_shipped', 'order_delivered'],
        desc: {
          en: 'Shipping carrier name',
          de: 'Versanddienst',
          tr: 'Kargo firması',
          fr: 'Transporteur',
          it: 'Corriere',
          es: 'Transportista',
        },
      },
      {
        key: 'TRACKING_URL',
        sample: 'https://www.dhl.de/…',
        category: 'shipping',
        triggers: ['order_shipped', 'order_delivered'],
        desc: {
          en: 'Carrier tracking web URL when number + carrier are known',
          de: 'Tracking-Link (bekannte Carrier)',
          tr: 'Kargo takip linki',
          fr: 'Lien de suivi transporteur',
          it: 'URL tracking corriere',
          es: 'URL seguimiento del transportista',
        },
      },
      {
        key: 'TRACKING_LINK',
        sample: 'https://www.dhl.de/…',
        category: 'shipping',
        triggers: ['order_shipped', 'order_delivered'],
        desc: {
          en: 'Alias of TRACKING_URL',
          de: 'Alias für TRACKING_URL',
          tr: 'TRACKING_URL ile aynı',
          fr: 'Alias de TRACKING_URL',
          it: 'Alias di TRACKING_URL',
          es: 'Alias de TRACKING_URL',
        },
      },
      {
        key: 'SENDUNGSVERFOLGUNG_URL',
        sample: 'https://www.dhl.de/…',
        category: 'shipping',
        triggers: ['order_shipped', 'order_delivered', 'order_placed'],
        desc: {
          en: 'Tracking URL if known; otherwise falls back to ORDER_DETAIL_URL',
          de: 'Sendungsverfolgung; sonst Link zur Bestellung',
          tr: 'Takip varsa takip linki, yoksa sipariş detayı',
          fr: 'Suivi ou page commande',
          it: 'Tracking o dettaglio ordine',
          es: 'Seguimiento o detalle del pedido',
        },
      },
      {
        key: 'MY_ORDERS_URL',
        sample: 'https://shop.example.com/de/de/orders',
        category: 'shop',
        triggers: ['order_placed', 'order_shipped', 'order_delivered', 'review_request', 'win_back'],
        desc: {
          en: 'Orders page with market/language prefix (/country/lang/orders). Override links via STOREFRONT_EMAIL_MARKET / STOREFRONT_EMAIL_LANG if needed.',
          de: 'Bestellübersicht mit Markt-/Sprachpräfix. Optional Env STOREFRONT_EMAIL_MARKET / STOREFRONT_EMAIL_LANG.',
          tr: 'Siparişler sayfası (ülke/dil önekli). Env ile özelleştirilebilir.',
          fr: 'Page commandes avec préfixe marché/langue.',
          it: 'Pagina ordini con prefisso paese/lingua.',
          es: 'Pedidos con prefijo mercado/idioma.',
        },
      },
      {
        key: 'ORDER_DETAIL_URL',
        sample: 'https://shop.example.com/de/de/order/550e8400-e29b-41d4-a716-446655440000',
        category: 'shop',
        triggers: ['order_placed', 'order_shipped', 'order_delivered', 'review_request', 'win_back'],
        desc: {
          en: 'Direct link to this order’s detail page (uses ORDER_UUID)',
          de: 'Direktlink zur Bestellansicht (UUID in der URL)',
          tr: 'Bu siparişin detay sayfası',
          fr: 'Lien direct vers le détail de la commande',
          it: 'Link diretto al dettaglio ordine',
          es: 'Enlace al detalle del pedido',
        },
      },
      {
        key: 'ACCOUNT_URL',
        sample: 'https://shop.example.com/de/de/account',
        category: 'shop',
        triggers: ['order_placed', 'order_shipped', 'order_delivered', 'review_request', 'win_back'],
        desc: {
          en: 'Customer account / profile page',
          de: 'Kundenkonto / Profil',
          tr: 'Müşteri hesabı',
          fr: 'Page compte client',
          it: 'Pagina account cliente',
          es: 'Cuenta del cliente',
        },
      },
      {
        key: 'SHOP_HOME_URL',
        sample: 'https://shop.example.com/de/de/',
        category: 'shop',
        triggers: ['*'],
        desc: {
          en: 'Storefront home with market & language prefix (use instead of SITE_URL + manual /de)',
          de: 'Shop-Startseite mit Markt-/Sprachpräfix',
          tr: 'Mağaza ana sayfası (ülke/dil önekli)',
          fr: 'Accueil boutique avec préfixe',
          it: 'Home negozio con prefisso',
          es: 'Inicio de la tienda con prefijo',
        },
      },
      {
        key: 'LOGIN_URL',
        sample: 'https://shop.example.com/de/de/login',
        category: 'shop',
        triggers: ['*'],
        desc: {
          en: 'Shop login page (/market/lang/login)',
          de: 'Shop-Login',
          tr: 'Mağaza giriş sayfası',
          fr: 'Connexion boutique',
          it: 'Login negozio',
          es: 'Inicio de sesión tienda',
        },
      },
      {
        key: 'REGISTER_URL',
        sample: 'https://shop.example.com/de/de/register',
        category: 'shop',
        triggers: ['*'],
        desc: {
          en: 'Shop registration page',
          de: 'Shop-Registrierung',
          tr: 'Kayıt sayfası',
          fr: 'Inscription boutique',
          it: 'Registrazione',
          es: 'Registro tienda',
        },
      },
      {
        key: 'IMPRESSUM_URL',
        sample: 'https://shop.example.com/de/de/impressum',
        category: 'shop',
        triggers: ['*'],
        desc: {
          en: 'Legal imprint page URL',
          de: 'Impressum-URL',
          tr: 'Künye sayfası',
          fr: 'Page mentions légales',
          it: 'Pagina imprint',
          es: 'Aviso legal',
        },
      },
      {
        key: 'DATENSCHUTZ_URL',
        sample: 'https://shop.example.com/de/de/datenschutz',
        category: 'shop',
        triggers: ['*'],
        desc: {
          en: 'Privacy policy page URL',
          de: 'Datenschutz-URL',
          tr: 'Gizlilik sayfası',
          fr: 'Politique de confidentialité',
          it: 'Privacy',
          es: 'Privacidad',
        },
      },
      {
        key: 'MARKET_COUNTRY',
        sample: 'DE',
        category: 'shop',
        triggers: ['*'],
        desc: {
          en: 'Market segment used in storefront URLs (from shipping country, ISO2)',
          de: 'Marktsegment in der URL (aus Lieferland)',
          tr: 'URL pazar ülkesi (ISO2)',
          fr: 'Code pays marché (URL)',
          it: 'Paese mercato negli URL',
          es: 'País de mercado en URL',
        },
      },
      {
        key: 'STOREFRONT_LOCALE',
        sample: 'de',
        category: 'shop',
        triggers: ['*'],
        desc: {
          en: 'Language segment in storefront URLs (de/en/tr/fr/it/es)',
          de: 'Sprachsegment in Shop-URLs',
          tr: 'URL dil kodu',
          fr: 'Langue dans l’URL',
          it: 'Lingua nell’URL',
          es: 'Idioma en la URL',
        },
      },
      {
        key: 'ORDER_UUID',
        sample: '550e8400-e29b-41d4-a716-446655440000',
        category: 'order',
        triggers: ['order_placed', 'order_shipped', 'order_delivered', 'review_request', 'win_back'],
        desc: {
          en: 'Internal order UUID (not the display order number)',
          de: 'Interne Bestell-UUID',
          tr: 'Sipariş UUID',
          fr: 'UUID commande interne',
          it: 'UUID ordine',
          es: 'UUID interno del pedido',
        },
      },
      {
        key: 'ORDER_NUMBER',
        sample: '10042',
        category: 'order',
        triggers: ['order_placed', 'order_delivered', 'order_shipped', 'review_request', 'win_back'],
        desc: {
          en: 'Human-readable order number',
          de: 'Bestellnummer (anzeige)',
          tr: 'Sipariş numarası',
          fr: 'Numéro de commande',
          it: 'Numero ordine',
          es: 'Número de pedido',
        },
      },
      {
        key: 'ORDER_ID',
        sample: '10042',
        category: 'order',
        triggers: ['order_placed', 'order_shipped', 'order_delivered', 'review_request', 'win_back'],
        desc: { en: 'Same as order number in most cases', de: 'Meist wie Bestellnummer', tr: 'Genelde sipariş no ile aynı', fr: 'Souvent = numéro', it: 'Spesso = numero', es: 'A menudo = número' },
      },
      {
        key: 'ORDER_DATE',
        sample: '29.04.2026',
        category: 'order',
        triggers: ['order_placed', 'order_shipped', 'order_delivered', 'review_request', 'win_back'],
        desc: { en: 'Order date (localized)', de: 'Bestelldatum', tr: 'Sipariş tarihi', fr: 'Date', it: 'Data', es: 'Fecha' },
      },
      {
        key: 'ORDER_TOTAL',
        sample: '89,99 €',
        category: 'order',
        triggers: ['order_placed', 'order_shipped', 'order_delivered', 'review_request', 'win_back'],
        desc: { en: 'Grand total formatted', de: 'Gesamtbetrag formatiert', tr: 'Toplam (biçimli)', fr: 'Total formaté', it: 'Totale formattato', es: 'Total formateado' },
      },
      {
        key: 'ORDER_SUBTOTAL',
        sample: '79,99 €',
        category: 'order',
        triggers: ['order_placed', 'order_shipped', 'order_delivered', 'review_request', 'win_back'],
        desc: { en: 'Subtotal before shipping', de: 'Zwischensumme', tr: 'Ara toplam', fr: 'Sous-total', it: 'Subtotale', es: 'Subtotal' },
      },
      {
        key: 'ORDER_SHIPPING',
        sample: '5,00 €',
        category: 'order',
        triggers: ['order_placed', 'order_shipped', 'order_delivered', 'review_request', 'win_back'],
        desc: { en: 'Shipping cost', de: 'Versandkosten', tr: 'Kargo ücreti', fr: 'Frais de port', it: 'Spedizione', es: 'Envío' },
      },
      {
        key: 'ORDER_DISCOUNT',
        sample: '10,00 €',
        category: 'order',
        triggers: ['order_placed', 'order_shipped', 'order_delivered', 'review_request', 'win_back'],
        desc: { en: 'Discount amount if any', de: 'Rabattbetrag', tr: 'İndirim tutarı', fr: 'Remise', it: 'Sconto', es: 'Descuento' },
      },
      {
        key: 'ORDER_CURRENCY',
        sample: 'EUR',
        category: 'order',
        triggers: ['order_placed', 'order_delivered', 'review_request', 'win_back', 'abandoned_cart'],
        desc: { en: 'Currency code', de: 'Währungscode', tr: 'Para birimi', fr: 'Devise', it: 'Valuta', es: 'Moneda' },
      },
      {
        key: 'PAYMENT_METHOD',
        sample: 'Card',
        category: 'order',
        triggers: ['order_placed', 'order_delivered'],
        desc: { en: 'Payment method label', de: 'Zahlungsart', tr: 'Ödeme yöntemi', fr: 'Paiement', it: 'Pagamento', es: 'Pago' },
      },
      {
        key: 'SHIPPING_FULL_NAME',
        sample: 'Jane Doe',
        category: 'shipping',
        triggers: ['order_placed', 'order_delivered', 'review_request', 'win_back'],
        desc: { en: 'Recipient name on shipping', de: 'Empfängername', tr: 'Teslimat adı', fr: 'Destinataire', it: 'Destinatario', es: 'Destinatario' },
      },
      {
        key: 'ADDRESS_LINE1',
        sample: 'Musterstraße 1',
        category: 'shipping',
        triggers: ['order_placed', 'order_delivered', 'review_request', 'win_back'],
        desc: { en: 'Street line 1', de: 'Straße Zeile 1', tr: 'Adres satırı 1', fr: 'Ligne 1', it: 'Riga 1', es: 'Línea 1' },
      },
      {
        key: 'ADDRESS_LINE2',
        sample: '—',
        category: 'shipping',
        triggers: ['order_placed', 'order_delivered', 'review_request', 'win_back'],
        desc: { en: 'Street line 2 / apt', de: 'Adresszusatz', tr: 'Adres 2', fr: 'Ligne 2', it: 'Riga 2', es: 'Línea 2' },
      },
      {
        key: 'CITY',
        sample: 'Berlin',
        category: 'shipping',
        triggers: ['order_placed', 'order_delivered', 'review_request', 'win_back'],
        desc: { en: 'City', de: 'Stadt', tr: 'Şehir', fr: 'Ville', it: 'Città', es: 'Ciudad' },
      },
      {
        key: 'POSTAL_CODE',
        sample: '10115',
        category: 'shipping',
        triggers: ['order_placed', 'order_delivered', 'review_request', 'win_back'],
        desc: { en: 'ZIP / postal code', de: 'PLZ', tr: 'Posta kodu', fr: 'Code postal', it: 'CAP', es: 'CP' },
      },
      {
        key: 'ZIP_CODE',
        sample: '10115',
        category: 'shipping',
        triggers: ['order_placed', 'order_delivered', 'review_request', 'win_back'],
        desc: { en: 'Alias for POSTAL_CODE', de: 'Alias für PLZ', tr: 'POSTAL_CODE ile aynı', fr: '= code postal', it: '= CAP', es: '= CP' },
      },
      {
        key: 'COUNTRY',
        sample: 'DE',
        category: 'shipping',
        triggers: ['order_placed', 'order_delivered', 'review_request', 'win_back'],
        desc: { en: 'Country code', de: 'Land', tr: 'Ülke kodu', fr: 'Pays', it: 'Paese', es: 'País' },
      },
      {
        key: 'PRODUCT',
        sample: 'Sample Product',
        category: 'product_cart',
        triggers: ['*'],
        desc: { en: 'Primary product title', de: 'Produkttitel', tr: 'Ürün adı', fr: 'Produit', it: 'Prodotto', es: 'Producto' },
      },
      {
        key: 'PRODUCT_NAME',
        sample: 'Sample Product',
        category: 'product_cart',
        triggers: ['*'],
        desc: { en: 'Alias of PRODUCT', de: 'Alias für Produktname', tr: 'PRODUCT ile aynı', fr: '= produit', it: '= nome', es: '= nombre' },
      },
      {
        key: 'PRODUCT_SKU',
        sample: 'SKU-DEMO-1',
        category: 'product_cart',
        triggers: ['abandoned_cart', 'order_placed', 'order_delivered', 'review_request', 'win_back'],
        desc: { en: 'SKU when available', de: 'SKU falls vorhanden', tr: 'SKU', fr: 'SKU', it: 'SKU', es: 'SKU' },
      },
      {
        key: 'PRODUCT_URL',
        sample: 'https://shop.example.com/de/de/produkt/sample-product',
        category: 'product_cart',
        triggers: ['abandoned_cart', 'order_placed', 'order_delivered', 'review_request', 'win_back'],
        desc: {
          en: 'First order line / cart primary product page (/produkt/{handle})',
          de: 'Produktlink erste Position (/produkt/{handle})',
          tr: 'İlk ürün satırının ürün sayfası',
          fr: 'Lien produit (1ère ligne)',
          it: 'Link primo articolo',
          es: 'URL del primer artículo',
        },
      },
      {
        key: 'CART_URL',
        sample: 'https://shop.example/checkout?cart=…',
        category: 'product_cart',
        triggers: ['abandoned_cart'],
        desc: {
          en: 'Recovery link to cart / checkout',
          de: 'Link zurück zum Warenkorb',
          tr: 'Sepete dönüş bağlantısı',
          fr: 'Lien panier',
          it: 'Link carrello',
          es: 'Enlace carrito',
        },
      },
      {
        key: 'CHECKOUT_URL',
        sample: 'https://shop.example/checkout',
        category: 'product_cart',
        triggers: ['abandoned_cart', 'order_placed'],
        desc: { en: 'Checkout URL', de: 'Checkout-URL', tr: 'Ödeme URL', fr: 'URL paiement', it: 'Checkout', es: 'Checkout' },
      },
      {
        key: 'LINE_ITEMS_SUMMARY',
        sample: '2 Artikel · 79,99 €',
        category: 'product_cart',
        triggers: ['abandoned_cart', 'order_placed', 'order_shipped', 'order_delivered'],
        desc: {
          en: 'Short cart/order lines summary',
          de: 'Kurze Positionsübersicht',
          tr: 'Satır özeti',
          fr: 'Résumé lignes',
          it: 'Riepilogo righe',
          es: 'Resumen líneas',
        },
      },
      {
        key: 'PRODUCT_IMAGE',
        sample: 'https://shop.example/uploads/media/product.jpg',
        category: 'product_cart',
        triggers: ['order_placed', 'order_shipped', 'order_delivered', 'review_request', 'abandoned_cart'],
        desc: {
          en: 'Thumbnail URL of the first ordered product',
          de: 'Bild-URL des ersten Produkts',
          tr: 'İlk ürünün görseli (URL)',
          fr: 'Image du premier produit',
          it: 'Immagine primo prodotto',
          es: 'Imagen primer producto',
        },
      },
      {
        key: 'PRODUCT_IMAGE_HTML',
        sample: '<img src="https://shop.example/uploads/media/product.jpg" alt="Produkt" style="max-width:200px;width:100%;height:auto;display:block;border-radius:6px;" />',
        category: 'product_cart',
        triggers: ['order_placed', 'order_shipped', 'order_delivered', 'review_request', 'abandoned_cart'],
        desc: {
          en: 'Ready-to-use <img> tag of the first ordered product (embed directly in email body)',
          de: 'Fertiges <img>-Tag des ersten Produktbilds (direkt in E-Mail-Text einfügen)',
          tr: 'İlk ürünün görseli – e-posta gövdesine doğrudan eklenebilen <img> etiketi',
          fr: 'Balise <img> prête à l\'emploi de la première image produit',
          it: 'Tag <img> pronto per il corpo e-mail del primo prodotto',
          es: 'Etiqueta <img> lista para insertar en el cuerpo del email del primer producto',
        },
      },
      {
        key: 'ORDER_ITEMS_HTML',
        sample: '<table>…</table>',
        category: 'product_cart',
        triggers: ['order_placed', 'order_shipped', 'order_delivered', 'review_request'],
        desc: {
          en: 'HTML table of all ordered items (image, name, qty, price)',
          de: 'HTML-Tabelle aller Bestellpositionen (Bild, Name, Menge, Preis)',
          tr: 'Tüm sipariş kalemlerinin HTML tablosu (görsel, isim, miktar, fiyat)',
          fr: 'Tableau HTML des articles commandés',
          it: 'Tabella HTML degli articoli ordinati',
          es: 'Tabla HTML de artículos del pedido',
        },
      },
      {
        key: 'ITEM_1_NAME',
        sample: 'Produkt A',
        category: 'product_cart',
        triggers: ['order_placed', 'order_shipped', 'order_delivered'],
        desc: { en: 'Name of order item 1', de: 'Name von Artikel 1', tr: '1. ürün adı', fr: 'Nom article 1', it: 'Nome articolo 1', es: 'Nombre artículo 1' },
      },
      {
        key: 'ITEM_1_IMAGE',
        sample: 'https://shop.example/uploads/media/a.jpg',
        category: 'product_cart',
        triggers: ['order_placed', 'order_shipped', 'order_delivered'],
        desc: { en: 'Thumbnail URL of item 1', de: 'Bild-URL Artikel 1', tr: '1. ürün görseli', fr: 'Image article 1', it: 'Immagine articolo 1', es: 'Imagen artículo 1' },
      },
      {
        key: 'ITEM_1_QUANTITY',
        sample: '2',
        category: 'product_cart',
        triggers: ['order_placed', 'order_shipped', 'order_delivered'],
        desc: { en: 'Quantity of item 1', de: 'Menge Artikel 1', tr: '1. ürün adedi', fr: 'Quantité article 1', it: 'Quantità articolo 1', es: 'Cantidad artículo 1' },
      },
      {
        key: 'ITEM_1_PRICE',
        sample: '29,99 €',
        category: 'product_cart',
        triggers: ['order_placed', 'order_shipped', 'order_delivered'],
        desc: { en: 'Unit price of item 1', de: 'Einzelpreis Artikel 1', tr: '1. ürün birim fiyatı', fr: 'Prix unitaire article 1', it: 'Prezzo unitario articolo 1', es: 'Precio unitario artículo 1' },
      },
      {
        key: 'STORE_NAME',
        sample: 'Your Store',
        category: 'shop',
        triggers: ['*'],
        desc: { en: 'Shop / seller display name', de: 'Shop-Name', tr: 'Mağaza adı', fr: 'Nom boutique', it: 'Nome negozio', es: 'Nombre tienda' },
      },
      {
        key: 'SHOP_NAME',
        sample: 'Your Store',
        category: 'shop',
        triggers: ['*'],
        desc: { en: 'Alias for STORE_NAME', de: 'Alias Shop-Name', tr: 'STORE_NAME ile aynı', fr: '= boutique', it: '= negozio', es: '= tienda' },
      },
      {
        key: 'SITE_URL',
        sample: 'https://shop.example',
        category: 'shop',
        triggers: ['*'],
        desc: { en: 'Storefront base URL', de: 'Shop-Basis-URL', tr: 'Mağaza ana URL', fr: 'URL boutique', it: 'URL sito', es: 'URL tienda' },
      },
      {
        key: 'SUPPORT_EMAIL',
        sample: 'support@example.com',
        category: 'shop',
        triggers: ['*'],
        desc: { en: 'Support / contact email', de: 'Support-E-Mail', tr: 'Destek e-postası', fr: 'E-mail support', it: 'Supporto', es: 'Soporte' },
      },
      {
        key: 'REVIEW_LINK',
        sample: 'https://shop.example/review?token=…',
        category: 'engagement',
        triggers: ['review_request', 'order_delivered'],
        desc: { en: 'Link to leave a review', de: 'Link zur Bewertung', tr: 'Yorum linki', fr: 'Lien avis', it: 'Link recensione', es: 'Enlace reseña' },
      },
      {
        key: 'BONUS_POINTS_BALANCE',
        sample: '120',
        category: 'engagement',
        triggers: ['*'],
        desc: {
          en: 'Bonus points balance if known',
          de: 'Bonuspunkte-Stand',
          tr: 'Bonus puan bakiyesi',
          fr: 'Points fidélité',
          it: 'Punti bonus',
          es: 'Puntos bonus',
        },
      },
    ]
    const FLOW_EMAIL_SAMPLE_PLACEHOLDERS = (() => {
      const o = {}
      for (const f of FLOW_MERGE_FIELDS) {
        const k = String(f.key)
        const sample = f.sample != null && f.sample !== '' ? String(f.sample) : '—'
        o[k] = sample
        o[k.toUpperCase()] = sample
        o[k.toLowerCase()] = sample
      }
      return o
    })()
    const applyFlowEmailPlaceholders = (template, extra = {}) => {
      if (template == null) return ''
      const vars = { ...FLOW_EMAIL_SAMPLE_PLACEHOLDERS, ...extra }
      return String(template).replace(/\{([A-Za-z0-9_]+)\}/g, (_, rawKey) => {
        const keyUp = String(rawKey).toUpperCase()
        const raw =
          vars[keyUp] ??
          vars[String(rawKey)] ??
          vars[rawKey]
        const v = raw == null ? '' : String(raw).trim()
        if (v !== '') return v
        return `{${rawKey}}`
      })
    }
    const flowEmailHtmlToPlainText = (html) =>
      String(html || '')
        .replace(/\r\n/g, '\n')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/(p|div|h[1-6]|li|tr|table)>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/\n{3,}/g, '\n\n')
        .trim()

    const FLOW_TRIGGER_KEYS = new Set([
      'new_subscriber',
      'abandoned_cart',
      'order_placed',
      'order_shipped',
      'order_delivered',
      'review_request',
      'win_back',
    ])
    const mapFlowRow = (row) =>
      row
        ? {
            id: row.id,
            name: row.name,
            trigger: row.trigger_key,
            audience: row.audience || 'customer',
            status: row.status,
            sent_count: row.sent_count != null ? Number(row.sent_count) : 0,
            step_count: row.step_count != null ? Number(row.step_count) : undefined,
            created_at: row.created_at,
            updated_at: row.updated_at,
          }
        : null
    const mapStepRow = (row) => ({
      id: row.id,
      step_order: row.step_order != null ? Number(row.step_order) : 0,
      step_type: row.step_type,
      wait_hours: row.wait_hours != null ? Number(row.wait_hours) : null,
      email_subject: row.email_subject || '',
      email_body: row.email_body || '',
      email_i18n: row.email_i18n && typeof row.email_i18n === 'object' ? row.email_i18n : null,
      email_attachments: Array.isArray(row.email_attachments) ? row.email_attachments : [],
      smtp_sender_id: row.smtp_sender_id || null,
    })

    const adminHubFlowsListGET = async (req, res) => {
      const client = getDbClient()
      if (!client) return res.status(503).json({ message: 'DB not configured' })
      try {
        await client.connect()
        const r = await client.query(`
          SELECT f.*, (
            SELECT COUNT(*)::int FROM admin_hub_flow_steps s WHERE s.flow_id = f.id
          ) AS step_count
          FROM admin_hub_flows f
          ORDER BY f.updated_at DESC
        `)
        await client.end()
        res.json({ flows: (r.rows || []).map(mapFlowRow), count: r.rows?.length || 0 })
      } catch (e) {
        try {
          await client.end()
        } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    const adminHubFlowsPOST = async (req, res) => {
      const client = getDbClient()
      if (!client) return res.status(503).json({ message: 'DB not configured' })
      const body = req.body || {}
      const name = String(body.name || '').trim()
      const triggerKey = String(body.trigger || body.trigger_key || '').trim()
      const status = ['draft', 'active', 'paused'].includes(String(body.status || '').toLowerCase())
        ? String(body.status).toLowerCase()
        : 'draft'
      const audienceRaw = String(body.audience || 'customer').toLowerCase()
      const audience = audienceRaw === 'seller' ? 'seller' : 'customer'
      if (!name) return res.status(400).json({ message: 'name is required' })
      if (!FLOW_TRIGGER_KEYS.has(triggerKey)) return res.status(400).json({ message: 'invalid trigger' })
      try {
        await client.connect()
        const ins = await client.query(
          `INSERT INTO admin_hub_flows (name, trigger_key, status, audience) VALUES ($1, $2, $3, $4)
           RETURNING id, name, trigger_key, status, audience, sent_count, created_at, updated_at`,
          [name, triggerKey, status, audience],
        )
        await client.end()
        const flow = mapFlowRow({ ...ins.rows[0], step_count: 0 })
        res.status(201).json({ flow })
      } catch (e) {
        try {
          await client.end()
        } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    const adminHubFlowGET = async (req, res) => {
      const client = getDbClient()
      if (!client) return res.status(503).json({ message: 'DB not configured' })
      const id = String(req.params.id || '').trim()
      if (!id) return res.status(400).json({ message: 'id required' })
      try {
        await client.connect()
        const fr = await client.query(`SELECT * FROM admin_hub_flows WHERE id = $1`, [id])
        if (!fr.rows[0]) {
          await client.end()
          return res.status(404).json({ message: 'Flow not found' })
        }
        const sr = await client.query(
          `SELECT * FROM admin_hub_flow_steps WHERE flow_id = $1 ORDER BY step_order ASC`,
          [id],
        )
        await client.end()
        const flow = mapFlowRow({ ...fr.rows[0], step_count: sr.rows?.length || 0 })
        res.json({ flow, steps: (sr.rows || []).map(mapStepRow) })
      } catch (e) {
        try {
          await client.end()
        } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    const adminHubFlowPATCH = async (req, res) => {
      const client = getDbClient()
      if (!client) return res.status(503).json({ message: 'DB not configured' })
      const id = String(req.params.id || '').trim()
      if (!id) return res.status(400).json({ message: 'id required' })
      const body = req.body || {}
      try {
        await client.connect()
        const ex = await client.query(`SELECT id FROM admin_hub_flows WHERE id = $1`, [id])
        if (!ex.rows[0]) {
          await client.end()
          return res.status(404).json({ message: 'Flow not found' })
        }

        const sets = []
        const vals = []
        let vi = 1
        if (body.name !== undefined) {
          const n = String(body.name || '').trim()
          if (!n) {
            await client.end()
            return res.status(400).json({ message: 'name cannot be empty' })
          }
          sets.push(`name = $${vi++}`)
          vals.push(n)
        }
        if (body.trigger !== undefined || body.trigger_key !== undefined) {
          const tk = String(body.trigger || body.trigger_key || '').trim()
          if (!FLOW_TRIGGER_KEYS.has(tk)) {
            await client.end()
            return res.status(400).json({ message: 'invalid trigger' })
          }
          sets.push(`trigger_key = $${vi++}`)
          vals.push(tk)
        }
        if (body.status !== undefined) {
          const st = String(body.status || '').toLowerCase()
          if (!['draft', 'active', 'paused'].includes(st)) {
            await client.end()
            return res.status(400).json({ message: 'invalid status' })
          }
          sets.push(`status = $${vi++}`)
          vals.push(st)
        }
        if (body.audience !== undefined) {
          const au = String(body.audience || 'customer').toLowerCase() === 'seller' ? 'seller' : 'customer'
          sets.push(`audience = $${vi++}`)
          vals.push(au)
        }

        if (sets.length) {
          sets.push(`updated_at = now()`)
          vals.push(id)
          await client.query(`UPDATE admin_hub_flows SET ${sets.join(', ')} WHERE id = $${vi}`, vals)
        }

        if (Array.isArray(body.steps)) {
          const FLOW_SAVE_LOCALES = ['de', 'en', 'tr', 'fr', 'it', 'es']
          const FLOW_ATTACH_KEYS = new Set(['invoice_pdf', 'lieferschein_pdf'])
          const SMTP_SENDER_UUID_RE =
            /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
          /** Clone for PG jsonb — strips undefined / non-JSON types (avoids invalid json syntax). */
          const flowStepJsonbOrNull = (v) => {
            if (v === undefined || v === null) return null
            try {
              return JSON.parse(JSON.stringify(v))
            } catch {
              return null
            }
          }
          /** Client may send email_i18n as double-encoded JSON string. */
          const coerceFlowEmailI18nInput = (raw) => {
            if (raw === undefined || raw === null) return null
            let x = raw
            if (typeof x === 'string') {
              const t = String(x).trim()
              if (!t) return null
              try {
                x = JSON.parse(t)
              } catch {
                return null
              }
            }
            if (typeof x !== 'object' || x === null || Array.isArray(x)) return null
            return x
          }
          const normalized = []
          for (let i = 0; i < body.steps.length; i++) {
            const s = body.steps[i] || {}
            const stepType = String(s.step_type || '').trim()
            if (stepType !== 'wait_hours' && stepType !== 'send_email') {
              await client.end()
              return res.status(400).json({ message: `Invalid step_type at index ${i}` })
            }
            if (stepType === 'wait_hours') {
              normalized.push({
                order: i,
                step_type: stepType,
                wait_hours: Math.max(0, parseInt(s.wait_hours, 10) || 0),
                email_subject: null,
                email_body: null,
                email_i18n: null,
                email_attachments: null,
                smtp_sender_id: null,
              })
            } else {
              let emailI18nObj = null
              const i18nSrc = coerceFlowEmailI18nInput(s.email_i18n)
              if (i18nSrc) {
                emailI18nObj = {}
                for (const loc of FLOW_SAVE_LOCALES) {
                  const b = i18nSrc[loc]
                  if (!b || typeof b !== 'object') continue
                  const sj = String(b.subject || '').trim()
                  const bd = String(b.body || '').trim()
                  if (sj && bd) emailI18nObj[loc] = { subject: sj, body: bd }
                }
                if (!Object.keys(emailI18nObj).length) emailI18nObj = null
              }
              let subj = String(s.email_subject || '').trim()
              let emBody = String(s.email_body || '').trim()
              if (emailI18nObj) {
                const pri = ['de', 'en', 'tr', 'fr', 'it', 'es']
                let picked = null
                for (const loc of pri) {
                  if (emailI18nObj[loc]) {
                    picked = emailI18nObj[loc]
                    break
                  }
                }
                if (!picked) {
                  const fk = Object.keys(emailI18nObj)[0]
                  picked = emailI18nObj[fk]
                }
                subj = String(picked.subject || '').trim()
                emBody = String(picked.body || '').trim()
              }
              if (!subj || !emBody) {
                await client.end()
                return res.status(400).json({
                  message: `Email step at index ${i} needs subject and body (use locale tabs or legacy fields)`,
                })
              }
              let attachList = []
              if (Array.isArray(s.email_attachments)) {
                attachList = [...new Set(s.email_attachments.map(String).filter((k) => FLOW_ATTACH_KEYS.has(k)))]
              }
              let smtpSenderId = null
              const rawSid = s.smtp_sender_id
              if (rawSid != null && String(rawSid).trim() !== '') {
                const sid = String(rawSid).trim()
                if (!SMTP_SENDER_UUID_RE.test(sid)) {
                  await client.end()
                  return res.status(400).json({ message: `Invalid smtp_sender_id at index ${i}` })
                }
                const okSid = await client.query(
                  `SELECT 1 FROM store_smtp_sender_profiles WHERE id = $1::uuid AND seller_id = 'default'`,
                  [sid],
                )
                if (!okSid.rows[0]) {
                  await client.end()
                  return res.status(400).json({ message: `Unknown smtp_sender_id at index ${i}` })
                }
                smtpSenderId = sid
              }
              normalized.push({
                order: i,
                step_type: stepType,
                wait_hours: null,
                email_subject: subj,
                email_body: emBody,
                email_i18n: emailI18nObj,
                email_attachments: attachList.length ? attachList : null,
                smtp_sender_id: smtpSenderId,
              })
            }
          }
          await client.query('BEGIN')
          await client.query(`DELETE FROM admin_hub_flow_steps WHERE flow_id = $1`, [id])
          for (const row of normalized) {
            const jI18n = flowStepJsonbOrNull(row.email_i18n)
            const jAtt = flowStepJsonbOrNull(row.email_attachments)
            const uuidSender =
              row.smtp_sender_id != null && String(row.smtp_sender_id).trim() !== ''
                ? String(row.smtp_sender_id).trim()
                : null
            await client.query(
              `INSERT INTO admin_hub_flow_steps (flow_id, step_order, step_type, wait_hours, email_subject, email_body, email_i18n, email_attachments, smtp_sender_id)
               VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9::uuid)`,
              [
                id,
                row.order,
                row.step_type,
                row.wait_hours,
                row.email_subject,
                row.email_body,
                jI18n !== null ? JSON.stringify(jI18n) : null,
                jAtt !== null ? JSON.stringify(jAtt) : null,
                uuidSender,
              ],
            )
          }
          await client.query('COMMIT')
        }

        const fr = await client.query(`SELECT * FROM admin_hub_flows WHERE id = $1`, [id])
        const sr = await client.query(
          `SELECT * FROM admin_hub_flow_steps WHERE flow_id = $1 ORDER BY step_order ASC`,
          [id],
        )
        await client.end()
        const flow = mapFlowRow({ ...fr.rows[0], step_count: sr.rows?.length || 0 })
        res.json({ flow, steps: (sr.rows || []).map(mapStepRow) })
      } catch (e) {
        try { await client.query('ROLLBACK') } catch (_) {}
        try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    const adminHubFlowDELETE = async (req, res) => {
      const client = getDbClient()
      if (!client) return res.status(503).json({ message: 'DB not configured' })
      const id = String(req.params.id || '').trim()
      if (!id) return res.status(400).json({ message: 'id required' })
      try {
        await client.connect()
        const r = await client.query(`DELETE FROM admin_hub_flows WHERE id = $1 RETURNING id`, [id])
        await client.end()
        if (!r.rowCount) return res.status(404).json({ message: 'Flow not found' })
        res.json({ deleted: true })
      } catch (e) {
        try {
          await client.end()
        } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    const adminHubFlowTestEmailPOST = async (req, res) => {
      const client = getDbClient()
      if (!client) return res.status(503).json({ message: 'DB not configured' })
      const id = String(req.params.id || '').trim()
      const body = req.body || {}
      const toRaw = String(body.to || '').trim()
      const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!id) return res.status(400).json({ message: 'id required' })
      if (!toRaw || !emailRe.test(toRaw)) return res.status(400).json({ message: 'valid to email required' })
      try {
        await client.connect()
        const ex = await client.query(`SELECT id FROM admin_hub_flows WHERE id = $1`, [id])
        if (!ex.rows[0]) {
          await client.end()
          return res.status(404).json({ message: 'Flow not found' })
        }

        let subject
        let htmlBody
        let stepSmtpSenderId = null
        const stepOrderArg = body.step_order
        const hasStepOrder = stepOrderArg != null && stepOrderArg !== ''
        if (hasStepOrder) {
          const so = parseInt(stepOrderArg, 10)
          if (Number.isNaN(so) || so < 0) {
            await client.end()
            return res.status(400).json({ message: 'invalid step_order' })
          }
          const sr = await client.query(
            `SELECT email_subject, email_body, email_i18n, smtp_sender_id FROM admin_hub_flow_steps
             WHERE flow_id = $1 AND step_order = $2 AND step_type = 'send_email'`,
            [id, so],
          )
          if (!sr.rows[0]) {
            await client.end()
            return res.status(404).json({ message: 'send_email step not found for step_order' })
          }
          const tl = String(body.template_locale || body.locale || '')
            .toLowerCase()
            .slice(0, 5)
          const i18n = sr.rows[0].email_i18n
          let pickedSubj = sr.rows[0].email_subject
          let pickedBody = sr.rows[0].email_body
          const tryPick = (loc) => {
            if (!i18n || typeof i18n !== 'object') return false
            const b = i18n[loc]
            const sj = String(b?.subject || '').trim()
            const bd = String(b?.body || '').trim()
            if (sj && bd) {
              pickedSubj = sj
              pickedBody = bd
              return true
            }
            return false
          }
          if (tl && tryPick(tl)) {
            /* use locale tab */
          } else if (i18n && typeof i18n === 'object') {
            for (const loc of ['de', 'en', 'tr', 'fr', 'it', 'es']) tryPick(loc)
          }
          subject = pickedSubj
          htmlBody = pickedBody
          stepSmtpSenderId = sr.rows[0].smtp_sender_id || null
        } else {
          subject = String(body.email_subject || '').trim()
          htmlBody = String(body.email_body || '').trim()
          if (!subject || !htmlBody) {
            await client.end()
            return res.status(400).json({ message: 'email_subject and email_body required (or step_order)' })
          }
        }

        const customerIdRaw = String(body.customer_id || '').trim()
        let customerDerived = {}
        if (customerIdRaw) {
          const flowAutomation = require('./src/flow-automation')
          const built = await flowAutomation.buildFlowEmailPlaceholderVarsForCustomer(client, customerIdRaw)
          if (!built) {
            await client.end()
            return res.status(404).json({ message: 'Customer not found' })
          }
          customerDerived = built
        }

        let pdfAttachments = []
        const attachReq = Array.isArray(body.attachments) ? body.attachments : []
        const ALLOW_FLOW_TEST_ATTACH = new Set(['invoice_pdf', 'lieferschein_pdf'])
        const filteredAttach = [...new Set(attachReq.map(String).filter((k) => ALLOW_FLOW_TEST_ATTACH.has(k)))]
        if (filteredAttach.length && customerIdRaw) {
          try {
            const ordPick = await client.query(
              `SELECT id FROM store_orders WHERE customer_id = $1::uuid ORDER BY created_at DESC LIMIT 1`,
              [customerIdRaw],
            )
            if (ordPick.rows[0]?.id) {
              const { buildFlowEmailPdfAttachments } = require('./src/order-pdf-buffers')
              pdfAttachments = await buildFlowEmailPdfAttachments(client, ordPick.rows[0].id, filteredAttach)
            }
          } catch (attErr) {
            console.error('[flow-test-email] pdf attachments', attErr?.message || attErr)
          }
        }

        const transport = await getSmtpTransport(client)
        const bodySenderRaw = body.smtp_sender_id
        const bodySender =
          bodySenderRaw != null && String(bodySenderRaw).trim() !== '' ? String(bodySenderRaw).trim() : null
        const profileForSend = bodySender || (stepSmtpSenderId ? String(stepSmtpSenderId) : null)
        const { fromEmail, fromName } = await resolveSmtpSenderIdentity(client, profileForSend)
        await client.end()

        if (!transport) return res.status(400).json({ message: 'SMTP not configured' })
        const fromEmailTrim = String(fromEmail || '').trim()
        if (!fromEmailTrim) return res.status(400).json({ message: 'SMTP From email not set' })

        const extraVars =
          body.placeholders && typeof body.placeholders === 'object' && !Array.isArray(body.placeholders)
            ? body.placeholders
            : {}
        const mergedVars = { ...customerDerived, ...extraVars }
        const finalSubject = applyFlowEmailPlaceholders(subject, mergedVars)
        const finalHtml = applyFlowEmailPlaceholders(htmlBody, mergedVars)
        const plain = flowEmailHtmlToPlainText(finalHtml)

        await transport.sendMail({
          from: `"${String(fromName).replace(/"/g, '')}" <${fromEmailTrim}>`,
          to: toRaw,
          subject: finalSubject,
          html: finalHtml,
          text: plain || finalSubject,
          ...(pdfAttachments.length ? { attachments: pdfAttachments } : {}),
        })
        res.json({ success: true, message: 'Test email sent' })
      } catch (e) {
        try {
          await client.end()
        } catch (_) {}
        res.status(400).json({ message: e?.message || 'Send failed' })
      }
    }

    const adminHubFlowEmailMergeFieldsGET = async (req, res) => {
      const rawLoc = String(req.query.locale || 'en')
        .toLowerCase()
        .replace(/[^a-z]/g, '')
        .slice(0, 2)
      const lang = ['de', 'tr', 'fr', 'it', 'es'].includes(rawLoc) ? rawLoc : 'en'
      const trig = String(req.query.trigger || '').trim()
      const categoryLabels = FLOW_MERGE_CATEGORY_LABELS[lang] || FLOW_MERGE_CATEGORY_LABELS.en
      const matchesTrigger = (field, triggerKey) => {
        if (!triggerKey) return true
        const tr = field.triggers
        if (!tr || tr.includes('*')) return true
        return tr.includes(triggerKey)
      }
      const fields = FLOW_MERGE_FIELDS.filter((f) => matchesTrigger(f, trig)).map((f) => ({
        key: f.key,
        token: `{${f.key}}`,
        sample: f.sample != null && f.sample !== '' ? String(f.sample) : null,
        category: f.category,
        category_label: categoryLabels[f.category] || f.category,
        triggers: f.triggers,
        description: (f.desc && (f.desc[lang] || f.desc.en)) || '',
      }))
      res.json({
        syntax: FLOW_MERGE_SYNTAX[lang] || FLOW_MERGE_SYNTAX.en,
        locale: lang,
        categories: categoryLabels,
        fields,
      })
    }

    httpApp.get(
      '/admin-hub/v1/flows/email-merge-fields',
      requireSellerAuth,
      requireSuperuser,
      adminHubFlowEmailMergeFieldsGET,
    )

    const adminHubFlowTranslatePOST = async (req, res) => {
      const body = req.body || {}
      const sourceLocale = String(body.source_locale || 'de').toLowerCase().slice(0, 2)
      const targets = Array.isArray(body.target_locales) ? body.target_locales : []
      const subject = String(body.subject || '').trim()
      const html = String(body.html || '').trim()
      const key = String(process.env.DEEPL_AUTH_KEY || '').trim()
      if (!subject || !html)
        return res.status(400).json({ message: 'subject and html required' })
      if (!key) return res.status(400).json({ message: 'Set DEEPL_AUTH_KEY for automatic translation' })
      const deepLang = (loc) => {
        const u = String(loc || 'en').toUpperCase()
        const m = { EN: 'EN', DE: 'DE', TR: 'TR', FR: 'FR', IT: 'IT', ES: 'ES' }
        return m[u.slice(0, 2)] || 'EN'
      }
      const baseUrl =
        String(process.env.DEEPL_API_URL || '').trim() ||
        (key.endsWith(':fx') ? 'https://api-free.deepl.com/v2/translate' : 'https://api.deepl.com/v2/translate')
      const translateChunk = async (text, tgt) => {
        const params = new URLSearchParams({ auth_key: key, text, target_lang: deepLang(tgt) })
        if (sourceLocale && sourceLocale.length === 2) params.set('source_lang', deepLang(sourceLocale))
        const r = await fetch(baseUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: params.toString(),
        })
        const j = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(j.message || `DeepL HTTP ${r.status}`)
        return String(j.translations?.[0]?.text || '').trim()
      }
      try {
        const out = {}
        const allowed = new Set(['en', 'de', 'tr', 'fr', 'it', 'es'])
        for (const tgt of targets) {
          const lo = String(tgt).toLowerCase().slice(0, 2)
          if (!allowed.has(lo) || lo === sourceLocale) continue
          const sj = await translateChunk(subject, lo)
          const bd = await translateChunk(html, lo)
          out[lo] = { subject: sj, body: bd }
        }
        res.json({ translations: out })
      } catch (e) {
        res.status(400).json({ message: e?.message || 'translate failed' })
      }
    }

    httpApp.get('/admin-hub/v1/flows', requireSellerAuth, requireSuperuser, adminHubFlowsListGET)
    httpApp.post('/admin-hub/v1/flows/translate', requireSellerAuth, requireSuperuser, adminHubFlowTranslatePOST)
    httpApp.post('/admin-hub/v1/flows', requireSellerAuth, requireSuperuser, adminHubFlowsPOST)
    httpApp.post('/admin-hub/v1/flows/:id/test-email', requireSellerAuth, requireSuperuser, adminHubFlowTestEmailPOST)
    httpApp.get('/admin-hub/v1/flows/:id', requireSellerAuth, requireSuperuser, adminHubFlowGET)
    httpApp.patch('/admin-hub/v1/flows/:id', requireSellerAuth, requireSuperuser, adminHubFlowPATCH)
    httpApp.delete('/admin-hub/v1/flows/:id', requireSellerAuth, requireSuperuser, adminHubFlowDELETE)

    // ── Coupons ────────────────────────────────────────────────────────────────
    const adminHubCouponsGET = async (req, res) => {
      const client = getDbClient()
      if (!client) return res.status(503).json({ message: 'DB not configured' })
      try {
        await client.connect()
        const isSuperuser = req.sellerUser?.is_superuser || false
        const callerSellerId = req.sellerUser?.seller_id
        const sellerId = req.query.seller_id || (!isSuperuser ? callerSellerId : null)
        const params = []
        let where = ''
        if (sellerId) { params.push(sellerId); where = `WHERE seller_id = $1` }
        const r = await client.query(
          `SELECT id, seller_id, code, discount_type, discount_value, min_subtotal_cents, usage_limit, used_count, active, expires_at, created_at, updated_at
           FROM admin_hub_coupons ${where}
           ORDER BY created_at DESC
           LIMIT 500`,
          params,
        )
        await client.end()
        res.json({ coupons: r.rows || [], count: r.rows?.length || 0 })
      } catch (e) {
        try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    const adminHubCouponsPOST = async (req, res) => {
      const client = getDbClient()
      if (!client) return res.status(503).json({ message: 'DB not configured' })
      try {
        await client.connect()
        const isSuperuser = req.sellerUser?.is_superuser || false
        const callerSellerId = req.sellerUser?.seller_id
        const body = req.body || {}
        // Superuser without explicit seller_id → 'default' (platform-wide coupon)
        // Superuser with explicit seller_id → coupon for that specific seller
        // Normal seller → always their own seller_id
        const sellerId = isSuperuser
          ? String(body.seller_id || 'default')
          : String(callerSellerId || 'default')
        if (!isSuperuser && sellerId !== callerSellerId) {
          await client.end()
          return res.status(403).json({ message: 'Forbidden' })
        }
        const code = normalizeCouponCode(body.code)
        if (!code) {
          await client.end()
          return res.status(400).json({ message: 'Coupon code required' })
        }
        const discountType = String(body.discount_type || 'percent').toLowerCase() === 'fixed' ? 'fixed' : 'percent'
        const discountValue = Math.max(0, parseInt(body.discount_value, 10) || 0)
        const minSubtotalCents = Math.max(0, parseInt(body.min_subtotal_cents, 10) || 0)
        const usageLimitRaw = body.usage_limit == null || body.usage_limit === '' ? null : Math.max(0, parseInt(body.usage_limit, 10) || 0)
        const active = body.active !== false
        const expiresAt = body.expires_at ? new Date(body.expires_at) : null
        if (discountValue <= 0) {
          await client.end()
          return res.status(400).json({ message: 'discount_value must be > 0' })
        }
        const r = await client.query(
          `INSERT INTO admin_hub_coupons
           (seller_id, code, discount_type, discount_value, min_subtotal_cents, usage_limit, active, expires_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
           RETURNING *`,
          [sellerId, code, discountType, discountValue, minSubtotalCents, usageLimitRaw, active, expiresAt],
        )
        await client.end()
        res.json({ coupon: r.rows?.[0] || null })
      } catch (e) {
        try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    const adminHubCouponsPATCH = async (req, res) => {
      const id = String(req.params.id || '').trim()
      if (!id) return res.status(400).json({ message: 'id required' })
      const client = getDbClient()
      if (!client) return res.status(503).json({ message: 'DB not configured' })
      try {
        await client.connect()
        const isSuperuser = req.sellerUser?.is_superuser || false
        const callerSellerId = req.sellerUser?.seller_id
        const own = await client.query('SELECT seller_id FROM admin_hub_coupons WHERE id = $1', [id])
        const ownerSellerId = own.rows?.[0]?.seller_id
        if (!ownerSellerId) {
          await client.end()
          return res.status(404).json({ message: 'Coupon not found' })
        }
        if (!isSuperuser && ownerSellerId !== callerSellerId) {
          await client.end()
          return res.status(403).json({ message: 'Forbidden' })
        }
        const body = req.body || {}
        const sets = []
        const vals = []
        const put = (k, v) => { vals.push(v); sets.push(`${k} = $${vals.length}`) }
        if (body.code !== undefined) put('code', normalizeCouponCode(body.code))
        if (body.discount_type !== undefined) put('discount_type', String(body.discount_type || 'percent').toLowerCase() === 'fixed' ? 'fixed' : 'percent')
        if (body.discount_value !== undefined) put('discount_value', Math.max(0, parseInt(body.discount_value, 10) || 0))
        if (body.min_subtotal_cents !== undefined) put('min_subtotal_cents', Math.max(0, parseInt(body.min_subtotal_cents, 10) || 0))
        if (body.usage_limit !== undefined) put('usage_limit', body.usage_limit == null || body.usage_limit === '' ? null : Math.max(0, parseInt(body.usage_limit, 10) || 0))
        if (body.active !== undefined) put('active', body.active !== false)
        if (body.expires_at !== undefined) put('expires_at', body.expires_at ? new Date(body.expires_at) : null)
        if (!sets.length) {
          await client.end()
          return res.status(400).json({ message: 'No fields to update' })
        }
        sets.push('updated_at = now()')
        vals.push(id)
        const r = await client.query(`UPDATE admin_hub_coupons SET ${sets.join(', ')} WHERE id = $${vals.length} RETURNING *`, vals)
        await client.end()
        res.json({ coupon: r.rows?.[0] || null })
      } catch (e) {
        try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    const adminHubCouponsDELETE = async (req, res) => {
      const id = String(req.params.id || '').trim()
      if (!id) return res.status(400).json({ message: 'id required' })
      const client = getDbClient()
      if (!client) return res.status(503).json({ message: 'DB not configured' })
      try {
        await client.connect()
        const isSuperuser = req.sellerUser?.is_superuser || false
        const callerSellerId = req.sellerUser?.seller_id
        const own = await client.query('SELECT seller_id FROM admin_hub_coupons WHERE id = $1', [id])
        const ownerSellerId = own.rows?.[0]?.seller_id
        if (!ownerSellerId) {
          await client.end()
          return res.status(404).json({ message: 'Coupon not found' })
        }
        if (!isSuperuser && ownerSellerId !== callerSellerId) {
          await client.end()
          return res.status(403).json({ message: 'Forbidden' })
        }
        await client.query('DELETE FROM admin_hub_coupons WHERE id = $1', [id])
        await client.end()
        res.json({ ok: true })
      } catch (e) {
        try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    // ── Transactions ────────────────────────────────────────────────────────────
    // GET /admin-hub/v1/transactions — list eligible orders as transactions
    const adminHubTransactionsGET = async (req, res) => {
      const client = getDbClient()
      if (!client) return res.status(503).json({ message: 'DB not configured' })
      try {
        await client.connect()
        const isSuperuser = req.sellerUser?.is_superuser || false
        const callerSellerId = req.sellerUser?.seller_id
        const filterSellerId = req.query.seller_id || (!isSuperuser ? callerSellerId : null)
        const limitDays = parseInt(req.query.payout_days || '14', 10)
        const includePending = req.query.include_pending === 'true'
        const params = []
        const where = []
        // If include_pending: show all orders; otherwise only bezahlt + delivered 14+ days
        if (!includePending) {
          where.push(`o.payment_status = 'bezahlt'`)
          where.push(`o.delivery_date IS NOT NULL AND o.delivery_date <= now() - interval '${limitDays} days'`)
        }
        if (req.query.period_start) {
          params.push(req.query.period_start)
          where.push(`DATE(COALESCE(o.delivery_date::timestamp, o.created_at)) >= $${params.length}::date`)
        }
        if (req.query.period_end) {
          params.push(req.query.period_end)
          where.push(`DATE(COALESCE(o.delivery_date::timestamp, o.created_at)) <= $${params.length}::date`)
        }
        if (filterSellerId) { params.push(filterSellerId); where.push(`o.seller_id = $${params.length}`) }
        const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : ''
        const r = await client.query(
          `SELECT o.id, o.order_number, o.seller_id, o.subtotal_cents, o.total_cents, o.shipping_cents, o.discount_cents,
                  o.payment_status, o.delivery_status, o.delivery_date, o.created_at,
                  o.stripe_transfer_status, o.stripe_transfer_id, o.stripe_transfer_error, o.stripe_transfer_at,
                  o.first_name, o.last_name, o.email, o.currency,
                  s.store_name, s.commission_rate, s.iban,
                  (o.delivery_date IS NOT NULL AND o.delivery_date <= now() - interval '${limitDays} days') AS payout_eligible
           FROM store_orders o
           LEFT JOIN seller_users s ON s.seller_id = o.seller_id
           ${whereClause}
           ORDER BY o.created_at DESC
           LIMIT 1000`,
          params
        )
        // Also fetch returns for this seller in the same time window
        const returnWhere = []
        const returnParams = []
        if (filterSellerId) { returnParams.push(filterSellerId); returnWhere.push(`o.seller_id = $${returnParams.length}`) }
        if (req.query.period_start) {
          returnParams.push(req.query.period_start)
          returnWhere.push(`r.created_at >= $${returnParams.length}`)
        }
        if (req.query.period_end) {
          returnParams.push(req.query.period_end)
          returnWhere.push(`r.created_at < ($${returnParams.length}::date + interval '1 day')`)
        }
        const returnWhereClause = returnWhere.length ? `WHERE ${returnWhere.join(' AND ')}` : ''
        let returnRows = []
        try {
          const rr = await client.query(
            `SELECT r.id, r.return_number, r.order_id, r.status, r.created_at,
                    o.order_number, o.seller_id, o.first_name, o.last_name, o.currency,
                    s.commission_rate,
                    COALESCE((SELECT SUM(ri.refund_amount_cents) FROM return_items ri WHERE ri.return_id = r.id), 0) AS refund_cents
             FROM store_returns r
             LEFT JOIN store_orders o ON o.id = r.order_id
             LEFT JOIN seller_users s ON s.seller_id = o.seller_id
             ${returnWhereClause}
             ORDER BY r.created_at DESC
             LIMIT 500`,
            returnParams
          )
          returnRows = rr.rows
        } catch (_) { /* returns table may not exist yet */ }

        const transactions = r.rows.map(row => {
          const commRate = parseFloat(row.commission_rate ?? 0.12)
          const sellerBasis = sellerOrderRevenueBasisCents(row)
          const customerPaid = resolveOrderPaidTotalCents(row)
          const commission = Math.round(sellerBasis * commRate)
          const payout = sellerBasis - commission
          return {
            id: row.id,
            type: 'order',
            order_number: row.order_number,
            seller_id: row.seller_id,
            store_name: row.store_name || row.seller_id,
            total_cents: sellerBasis,
            customer_paid_cents: customerPaid,
            shipping_cents: row.shipping_cents || 0,
            discount_cents: row.discount_cents || 0,
            commission_rate: commRate,
            commission_cents: commission,
            payout_cents: payout,
            payout_eligible: row.payout_eligible === true || row.payout_eligible === 't',
            payment_status: row.payment_status || 'offen',
            delivery_status: row.delivery_status || null,
            iban: isSuperuser ? row.iban : undefined,
            stripe_transfer_status: row.stripe_transfer_status || null,
            stripe_transfer_id: row.stripe_transfer_id || null,
            stripe_transfer_error: row.stripe_transfer_error || null,
            stripe_transfer_at: row.stripe_transfer_at || null,
            stripe_payout_status: row.stripe_payout_status || null,
            stripe_payout_id: row.stripe_payout_id || null,
            stripe_account_id: isSuperuser ? (row.stripe_account_id || null) : undefined,
            delivery_date: row.delivery_date,
            created_at: row.created_at,
            first_name: row.first_name,
            last_name: row.last_name,
            currency: row.currency || 'EUR',
          }
        })
        // Append returns as negative transaction entries
        for (const row of returnRows) {
          const commRate = parseFloat(row.commission_rate ?? 0.12)
          const refund = Number(row.refund_cents || 0)
          transactions.push({
            id: `return-${row.id}`,
            type: 'return',
            order_number: row.order_number,
            return_number: row.return_number,
            seller_id: row.seller_id,
            total_cents: -refund,
            shipping_cents: 0,
            discount_cents: 0,
            commission_rate: commRate,
            commission_cents: refund > 0 ? -Math.round(refund * commRate) : 0,
            payout_cents: refund > 0 ? -(refund - Math.round(refund * commRate)) : 0,
            payout_eligible: false,
            payment_status: row.status || 'return',
            delivery_status: null,
            delivery_date: null,
            created_at: row.created_at,
            first_name: row.first_name,
            last_name: row.last_name,
            currency: row.currency || 'EUR',
          })
        }
        // Sort all by created_at desc
        transactions.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        // Group by seller if superuser
        const summary = {}
        for (const t of transactions) {
          const sid = t.seller_id
          if (!summary[sid]) summary[sid] = { seller_id: sid, store_name: t.store_name, total_cents: 0, commission_cents: 0, payout_cents: 0, order_count: 0, iban: t.iban }
          summary[sid].total_cents += t.total_cents
          summary[sid].commission_cents += t.commission_cents
          summary[sid].payout_cents += t.payout_cents
          summary[sid].order_count += 1
        }
        await client.end()
        res.json({ transactions, summary: Object.values(summary), count: transactions.length })
      } catch (e) {
        try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    // GET /admin-hub/v1/payouts — list payout records
    const adminHubPayoutsGET = async (req, res) => {
      const client = getDbClient()
      if (!client) return res.status(503).json({ message: 'DB not configured' })
      try {
        await client.connect()
        const isSuperuser = req.sellerUser?.is_superuser || false
        const callerSellerId = req.sellerUser?.seller_id
        const filterSellerId = req.query.seller_id || (!isSuperuser ? callerSellerId : null)
        const params = []
        let where = ''
        if (filterSellerId) { params.push(filterSellerId); where = `WHERE p.seller_id = $1` }
        const r = await client.query(
          `SELECT p.*, s.store_name FROM seller_payouts p LEFT JOIN seller_users s ON s.seller_id = p.seller_id ${where} ORDER BY p.period_start DESC LIMIT 200`,
          params
        )
        await client.end()
        res.json({ payouts: r.rows, count: r.rows.length })
      } catch (e) {
        try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    // POST /admin-hub/v1/payouts — create payout (superuser only)
    const adminHubPayoutsPOST = async (req, res) => {
      if (!req.sellerUser?.is_superuser) return res.status(403).json({ message: 'Superuser access required' })
      const client = getDbClient()
      if (!client) return res.status(503).json({ message: 'DB not configured' })
      try {
        await client.connect()
        const { seller_id, period_start, period_end, total_cents, commission_cents, payout_cents, iban, notes } = req.body || {}
        if (!seller_id || !period_start || !period_end) return res.status(400).json({ message: 'seller_id, period_start, period_end required' })
        const r = await client.query(
          `INSERT INTO seller_payouts (seller_id, period_start, period_end, total_cents, commission_cents, payout_cents, iban, notes, status)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'offen') RETURNING *`,
          [seller_id, period_start, period_end, total_cents || 0, commission_cents || 0, payout_cents || 0, iban || null, notes || null]
        )
        await client.end()
        res.json({ payout: r.rows[0] })
      } catch (e) {
        try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    // PATCH /admin-hub/v1/payouts/:id — update payout status / proof (superuser only)
    const adminHubPayoutsPATCH = async (req, res) => {
      if (!req.sellerUser?.is_superuser) return res.status(403).json({ message: 'Superuser access required' })
      const { id } = req.params
      const client = getDbClient()
      if (!client) return res.status(503).json({ message: 'DB not configured' })
      try {
        await client.connect()
        const { status, proof_url, notes, paid_at } = req.body || {}
        const sets = ['updated_at = now()']
        const params = []
        if (status !== undefined) { params.push(status); sets.push(`status = $${params.length}`) }
        if (proof_url !== undefined) { params.push(proof_url); sets.push(`proof_url = $${params.length}`) }
        if (notes !== undefined) { params.push(notes); sets.push(`notes = $${params.length}`) }
        if (paid_at !== undefined || status === 'bezahlt') { params.push(paid_at || new Date().toISOString()); sets.push(`paid_at = $${params.length}`) }
        params.push(id)
        const r = await client.query(`UPDATE seller_payouts SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`, params)
        await client.end()
        if (!r.rows.length) return res.status(404).json({ message: 'Payout not found' })
        res.json({ payout: r.rows[0] })
      } catch (e) {
        try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    // POST /admin-hub/v1/payouts/mark-paid — superuser marks a seller period as paid
    const adminHubPayoutsMarkPaidPOST = async (req, res) => {
      if (!req.sellerUser?.is_superuser) return res.status(403).json({ message: 'Superuser access required' })
      const client = getDbClient()
      if (!client) return res.status(503).json({ message: 'DB not configured' })
      try {
        await client.connect()
        const { seller_id, period_start, period_end, amount_cents, reference } = req.body || {}
        if (!seller_id || !period_start || !period_end) { await client.end(); return res.status(400).json({ message: 'seller_id, period_start, period_end required' }) }
        // Upsert: if a payout record exists for this seller+period, update it; otherwise create it
        const existing = await client.query(
          `SELECT id FROM seller_payouts WHERE seller_id = $1 AND period_start = $2 AND period_end = $3 LIMIT 1`,
          [seller_id, period_start, period_end]
        )
        let row
        if (existing.rows.length) {
          const r = await client.query(
            `UPDATE seller_payouts SET status = 'bezahlt', payout_cents = $1, notes = COALESCE($2, notes), paid_at = now(), updated_at = now() WHERE id = $3 RETURNING *`,
            [amount_cents || 0, reference || null, existing.rows[0].id]
          )
          row = r.rows[0]
        } else {
          const r = await client.query(
            `INSERT INTO seller_payouts (seller_id, period_start, period_end, payout_cents, notes, status, paid_at)
             VALUES ($1, $2, $3, $4, $5, 'bezahlt', now()) RETURNING *`,
            [seller_id, period_start, period_end, amount_cents || 0, reference || null]
          )
          row = r.rows[0]
        }
        await client.end()
        res.json({ payout: row })
      } catch (e) {
        try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    // GET /admin-hub/v1/payout-summary — seller's own summary for a period
    /** Settlement attribution: DATE(COALESCE(delivery_date, created_at)) ∈ [period_start, period_end] (same as transactions list). */
    const adminHubPayoutSummaryGET = async (req, res) => {
      const sellerId = req.sellerUser?.seller_id
      if (!sellerId) return res.status(401).json({ message: 'Unauthorized' })
      const client = getDbClient()
      if (!client) return res.status(503).json({ message: 'DB not configured' })
      try {
        await client.connect()
        const { period_start, period_end } = req.query
        const params = [sellerId]
        const dateFilter = period_start && period_end
          ? `AND DATE(COALESCE(o.delivery_date::timestamp, o.created_at)) >= $2::date
             AND DATE(COALESCE(o.delivery_date::timestamp, o.created_at)) <= $3::date`
          : ''
        if (period_start) params.push(period_start)
        if (period_end) params.push(period_end)
        const r = await client.query(
          `SELECT
             COALESCE(SUM(
               CASE WHEN COALESCE(o.subtotal_cents, 0) > 0 THEN o.subtotal_cents::bigint ELSE GREATEST(0, COALESCE(o.total_cents, 0))::bigint END
             ), 0)::bigint AS total_cents,
             COALESCE(SUM(
               ROUND(
                 (CASE WHEN COALESCE(o.subtotal_cents, 0) > 0 THEN o.subtotal_cents::numeric ELSE GREATEST(0, COALESCE(o.total_cents, 0))::numeric END)
                 * COALESCE(s.commission_rate::numeric, 0.12)
               )
             ), 0)::bigint AS commission_cents,
             COALESCE(SUM(o.shipping_cents), 0)::bigint AS shipping_cents,
             COUNT(*)::int AS paid_count,
             COALESCE(SUM(
               CASE WHEN COALESCE(o.subtotal_cents, 0) > 0 THEN o.subtotal_cents::bigint ELSE GREATEST(0, COALESCE(o.total_cents, 0))::bigint END
             ) FILTER (WHERE LOWER(TRIM(COALESCE(o.order_status, ''))) = 'refunded'), 0)::bigint AS refund_cents
           FROM store_orders o
           LEFT JOIN seller_users s ON s.seller_id = o.seller_id
           WHERE o.seller_id = $1 AND o.payment_status = 'bezahlt' ${dateFilter}`,
          params
        )
        const row = r.rows[0] || {}
        const basis = parseInt(row.total_cents, 10) || 0
        const commission = parseInt(row.commission_cents, 10) || 0
        const shipping = parseInt(row.shipping_cents, 10) || 0
        const refunds = parseInt(row.refund_cents, 10) || 0
        // Also get payout status for this period
        let payoutStatus = null
        if (period_start && period_end) {
          const po = await client.query(
            `SELECT status FROM seller_payouts WHERE seller_id = $1 AND period_start <= $3::date AND period_end >= $2::date ORDER BY created_at DESC LIMIT 1`,
            [sellerId, period_start, period_end]
          )
          payoutStatus = po.rows[0]?.status || null
        }
        await client.end()
        res.json({
          summary: {
            total_cents: basis,
            commission_cents: commission,
            shipping_cents: shipping,
            refund_cents: refunds,
            paid_count: parseInt(row.paid_count, 10) || 0,
            status: payoutStatus,
            ad_spend_cents: 0,
          },
        })
      } catch (e) {
        try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    // GET /admin-hub/v1/payout-overview — superuser: all sellers summary for a period
    const adminHubPayoutOverviewGET = async (req, res) => {
      if (!req.sellerUser?.is_superuser) return res.status(403).json({ message: 'Superuser access required' })
      const client = getDbClient()
      if (!client) return res.status(503).json({ message: 'DB not configured' })
      try {
        await client.connect()
        const { period_start, period_end } = req.query
        const params = []
        const dateFilter = period_start && period_end
          ? `AND DATE(COALESCE(o.delivery_date::timestamp, o.created_at)) >= $1::date
             AND DATE(COALESCE(o.delivery_date::timestamp, o.created_at)) <= $2::date`
          : ''
        if (period_start) params.push(period_start)
        if (period_end) params.push(period_end)
        const r = await client.query(
          `SELECT
             o.seller_id,
             s.store_name,
             s.email,
             COALESCE(SUM(
               CASE WHEN COALESCE(o.subtotal_cents, 0) > 0 THEN o.subtotal_cents::bigint ELSE GREATEST(0, COALESCE(o.total_cents, 0))::bigint END
             ), 0)::bigint AS total_cents,
             COUNT(*) AS order_count,
             COALESCE(SUM(
               ROUND(
                 (CASE WHEN COALESCE(o.subtotal_cents, 0) > 0 THEN o.subtotal_cents::numeric ELSE GREATEST(0, COALESCE(o.total_cents, 0))::numeric END)
                 * COALESCE(s.commission_rate::numeric, 0.12)
               )
             ), 0)::bigint AS commission_cents,
             COALESCE(SUM(
               (CASE WHEN COALESCE(o.subtotal_cents, 0) > 0 THEN o.subtotal_cents::bigint ELSE GREATEST(0, COALESCE(o.total_cents, 0))::bigint END)
               - ROUND(
                 (CASE WHEN COALESCE(o.subtotal_cents, 0) > 0 THEN o.subtotal_cents::numeric ELSE GREATEST(0, COALESCE(o.total_cents, 0))::numeric END)
                 * COALESCE(s.commission_rate::numeric, 0.12)
               )
             ), 0)::bigint AS payout_cents
           FROM store_orders o
           LEFT JOIN seller_users s ON s.seller_id = o.seller_id
           WHERE o.payment_status = 'bezahlt'
             AND o.delivery_date IS NOT NULL
             AND o.delivery_date <= now() - interval '14 days'
             ${dateFilter}
           GROUP BY o.seller_id, s.store_name, s.email
           ORDER BY total_cents DESC`,
          params
        )
        // Fetch payout statuses for this period
        const sellerIds = r.rows.map(row => row.seller_id)
        let payoutMap = {}
        if (sellerIds.length && period_start && period_end) {
          const po = await client.query(
            `SELECT DISTINCT ON (seller_id) seller_id, status, paid_at
             FROM seller_payouts
             WHERE seller_id = ANY($1) AND period_start <= $3 AND period_end >= $2
             ORDER BY seller_id, created_at DESC`,
            [sellerIds, period_start, period_end]
          )
          po.rows.forEach(p => { payoutMap[p.seller_id] = p })
        }
        await client.end()
        const sellers = r.rows.map(row => ({
          seller_id: row.seller_id,
          store_name: row.store_name || row.seller_id,
          email: row.email,
          total_cents: parseInt(row.total_cents) || 0,
          order_count: parseInt(row.order_count) || 0,
          commission_cents: parseInt(row.commission_cents) || 0,
          payout_cents: parseInt(row.payout_cents) || 0,
          status: payoutMap[row.seller_id]?.status || 'ausstehend',
          paid_at: payoutMap[row.seller_id]?.paid_at || null,
        }))
        res.json({ sellers })
      } catch (e) {
        try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    // Returns the day-of-month (1-based) of the nth Friday in year/month (month 0-indexed).
    const nthFridayOfMonth = (year, month, n) => {
      const dow = new Date(year, month, 1).getDay() // 0=Sun … 6=Sat
      const offset = (5 - dow + 7) % 7              // days until 1st Friday
      return 1 + offset + (n - 1) * 7
    }

    // Returns { is: true, n: 2|4 } when today is the 2nd or 4th Friday, else { is: false }.
    const isPayoutFridayToday = (d = new Date()) => {
      if (d.getDay() !== 5) return { is: false }
      const y = d.getFullYear(), m = d.getMonth(), day = d.getDate()
      if (day === nthFridayOfMonth(y, m, 2)) return { is: true, n: 2 }
      if (day === nthFridayOfMonth(y, m, 4)) return { is: true, n: 4 }
      return { is: false }
    }

    const autoPayoutPeriodForDate = (d = new Date()) => {
      const now = new Date(d)
      const y = now.getFullYear()
      const m = now.getMonth()
      const day = now.getDate()
      const fri = isPayoutFridayToday(now)
      if (!fri.is) return null

      const mm = String(m + 1).padStart(2, '0')
      const pad = (n) => String(n).padStart(2, '0')
      const iso = (yr, mo, da) => `${yr}-${String(mo + 1).padStart(2, '0')}-${pad(da)}`

      if (fri.n === 2) {
        // Period: (4th Friday of previous month + 1) → 2nd Friday of this month
        const prevM = m === 0 ? 11 : m - 1
        const prevY = m === 0 ? y - 1 : y
        const f4prev = nthFridayOfMonth(prevY, prevM, 4)
        const startDate = new Date(prevY, prevM, f4prev + 1)
        const periodStart = iso(startDate.getFullYear(), startDate.getMonth(), startDate.getDate())
        const periodEnd = iso(y, m, day)
        return { runKey: `AUTO-${y}-${mm}-F2`, periodStart, periodEnd }
      }
      // fri.n === 4
      // Period: (2nd Friday of this month + 1) → 4th Friday of this month
      const f2 = nthFridayOfMonth(y, m, 2)
      const startDate = new Date(y, m, f2 + 1)
      const periodStart = iso(startDate.getFullYear(), startDate.getMonth(), startDate.getDate())
      const periodEnd = iso(y, m, day)
      return { runKey: `AUTO-${y}-${mm}-F4`, periodStart, periodEnd }
    }

    const runAutomaticPayoutsIfDue = async () => {
      const period = autoPayoutPeriodForDate(new Date())
      if (!period) return
      const client = getDbClient()
      if (!client) return
      try {
        await client.connect()
        const already = await client.query('SELECT run_key FROM seller_payout_auto_runs WHERE run_key = $1 LIMIT 1', [period.runKey])
        if (already.rows.length) { await client.end(); return }
        const su = await client.query(
          `SELECT iban FROM seller_users
           WHERE is_superuser = true
             AND iban IS NOT NULL
             AND LENGTH(TRIM(iban)) > 0
           ORDER BY created_at ASC
           LIMIT 1`
        )
        const sourceIban = su.rows[0]?.iban ? String(su.rows[0].iban).trim() : null
        if (!sourceIban) { await client.end(); return }
        const summary = await client.query(
          `SELECT
             o.seller_id,
             ROUND(COALESCE(SUM(o.subtotal_cents), 0)) AS total_cents,
             ROUND((COALESCE(SUM(o.subtotal_cents), 0)::numeric * COALESCE(MAX(s.commission_rate), 0.12)))::bigint AS commission_cents,
             ROUND((COALESCE(SUM(o.subtotal_cents), 0)::numeric * (1 - COALESCE(MAX(s.commission_rate), 0.12))))::bigint AS payout_cents
           FROM store_orders o
           LEFT JOIN seller_users s ON s.seller_id = o.seller_id
           WHERE o.payment_status = 'bezahlt'
             AND o.delivery_date IS NOT NULL
             AND o.delivery_date <= now() - interval '14 days'
             AND o.created_at >= $1::date
             AND o.created_at < ($2::date + interval '1 day')
             AND LOWER(COALESCE(s.approval_status, '')) = 'approved'
           GROUP BY o.seller_id`,
          [period.periodStart, period.periodEnd]
        )
        let createdCount = 0
        for (const row of summary.rows || []) {
          const sellerId = String(row.seller_id || '').trim()
          if (!sellerId) continue
          const existing = await client.query(
            `SELECT id, status FROM seller_payouts
             WHERE seller_id = $1 AND period_start = $2::date AND period_end = $3::date
             ORDER BY created_at DESC LIMIT 1`,
            [sellerId, period.periodStart, period.periodEnd]
          )
          if (existing.rows.length) {
            const keepPaid = ['bezahlt', 'paid'].includes(String(existing.rows[0].status || '').toLowerCase())
            await client.query(
              `UPDATE seller_payouts
               SET total_cents = $1, commission_cents = $2, payout_cents = $3,
                   iban = COALESCE(iban, $4),
                   notes = COALESCE(notes, $5),
                   status = $6,
                   updated_at = now()
               WHERE id = $7`,
              [
                parseInt(row.total_cents) || 0,
                parseInt(row.commission_cents) || 0,
                parseInt(row.payout_cents) || 0,
                sourceIban,
                `AUTO-PAYOUT ${period.periodStart}..${period.periodEnd}`,
                keepPaid ? existing.rows[0].status : 'processing',
                existing.rows[0].id,
              ]
            )
          } else {
            await client.query(
              `INSERT INTO seller_payouts
               (seller_id, period_start, period_end, total_cents, commission_cents, payout_cents, iban, notes, status)
               VALUES ($1, $2::date, $3::date, $4, $5, $6, $7, $8, 'processing')`,
              [
                sellerId,
                period.periodStart,
                period.periodEnd,
                parseInt(row.total_cents) || 0,
                parseInt(row.commission_cents) || 0,
                parseInt(row.payout_cents) || 0,
                sourceIban,
                `AUTO-PAYOUT ${period.periodStart}..${period.periodEnd}`,
              ]
            )
          }
          createdCount += 1
        }
        await client.query(
          `INSERT INTO seller_payout_auto_runs (run_key, period_start, period_end, source_iban, created_count)
           VALUES ($1, $2::date, $3::date, $4, $5)`,
          [period.runKey, period.periodStart, period.periodEnd, sourceIban, createdCount]
        )
        await client.end()
      } catch (e) {
        try { await client.end() } catch (_) {}
        console.error('runAutomaticPayoutsIfDue:', e?.message || e)
      }
    }

    // Dispatch Stripe Connect transfers for delivered orders after 14 days.
    // This keeps funds on platform first, then releases seller share on payout-eligible date.
    const runStripeConnectTransfersIfDue = async () => {
      const client = getDbClient()
      if (!client) return
      try {
        await client.connect()
        const platformRow = await loadPlatformCheckoutRow(client)
        const secretKey = resolveStripeSecretKeyFromPlatform(platformRow)
        if (!secretKey) { await client.end(); return }
        const stripe = new (require('stripe'))(secretKey)

        const due = await client.query(
          `SELECT id, order_number, seller_id, payment_intent_id, subtotal_cents, cart_id
           FROM store_orders
           WHERE payment_status = 'bezahlt'
             AND delivery_date IS NOT NULL
             AND delivery_date <= now() - interval '14 days'
             AND payment_intent_id IS NOT NULL
             AND COALESCE(stripe_transfer_status, 'legacy_skipped') IN ('pending', 'failed', 'waiting_onboarding')
           ORDER BY delivery_date ASC
           LIMIT 200`
        )

        for (const row of due.rows || []) {
          const orderId = row.id
          const sellerId = String(row.seller_id || '').trim()
          if (!sellerId || sellerId === 'default') {
            await client.query(
              `UPDATE store_orders SET stripe_transfer_status = 'skipped', stripe_transfer_error = 'No eligible seller_id', stripe_transfer_at = now(), updated_at = now() WHERE id = $1::uuid`,
              [orderId]
            )
            continue
          }
          try {
            const sRes = await client.query(
              `SELECT stripe_account_id, stripe_onboarding_complete, commission_rate
               FROM seller_users WHERE seller_id = $1`,
              [sellerId]
            )
            const s = sRes.rows?.[0]
            if (!s?.stripe_account_id || !s?.stripe_onboarding_complete) {
              await client.query(
                `UPDATE store_orders SET stripe_transfer_status = 'waiting_onboarding', stripe_transfer_error = 'Seller Stripe onboarding incomplete', updated_at = now() WHERE id = $1::uuid`,
                [orderId]
              )
              continue
            }

            const pi = await stripe.paymentIntents.retrieve(String(row.payment_intent_id), { expand: ['latest_charge'] })
            const chargeId = typeof pi.latest_charge === 'object' ? pi.latest_charge?.id : pi.latest_charge
            if (!chargeId) throw new Error('No latest_charge on payment intent')

            const commissionRate = Number(s.commission_rate ?? 0.12)
            const subtotalCents = Number(row.subtotal_cents || 0)
            const transferAmount = Math.floor(subtotalCents * (1 - commissionRate))
            if (transferAmount <= 0) {
              await client.query(
                `UPDATE store_orders SET stripe_transfer_status = 'skipped', stripe_transfer_error = 'Computed transfer amount <= 0', stripe_transfer_at = now(), updated_at = now() WHERE id = $1::uuid`,
                [orderId]
              )
              continue
            }

            const xferSellerDisplay = await resolveSellerDisplayNameForStripe(client, sellerId)
            const xferSellerLabel =
              truncateForStripeDescription(xferSellerDisplay) ||
              sellerId

            const tr = await stripe.transfers.create({
              amount: transferAmount,
              currency: 'eur',
              destination: s.stripe_account_id,
              source_transaction: chargeId,
              transfer_group: `cart_${row.cart_id || ''}`,
              description: `Order #${row.order_number || ''} — ${xferSellerLabel}`,
              metadata: {
                order_id: orderId,
                order_number: String(row.order_number || ''),
                seller_id: sellerId,
                seller_name: truncateForStripeDescription(xferSellerDisplay, 500) || xferSellerLabel,
              },
            })

            await client.query(
              `UPDATE store_orders
               SET stripe_transfer_status = 'completed',
                   stripe_transfer_id = $2,
                   stripe_transfer_error = NULL,
                   stripe_transfer_at = now(),
                   updated_at = now()
               WHERE id = $1::uuid`,
              [orderId, tr.id]
            )
          } catch (e) {
            await client.query(
              `UPDATE store_orders
               SET stripe_transfer_status = 'failed',
                   stripe_transfer_error = LEFT($2, 500),
                   updated_at = now()
               WHERE id = $1::uuid`,
              [orderId, String(e?.message || 'Stripe transfer failed')]
            )
          }
        }
        await client.end()
      } catch (e) {
        try { await client.end() } catch (_) {}
        console.error('runStripeConnectTransfersIfDue:', e?.message || e)
      }
    }

    // Destination Charges + Manual Payouts: dispatch bank payouts for eligible delivered orders.
    // Orders using the new model have stripe_account_id set (destination charge) and
    // stripe_payout_status = 'pending'. After 14 days from delivery we create a Stripe payout
    // on the seller's connected account to move funds from their Stripe balance to their bank.
    const runStripePayoutsIfDue = async () => {
      const client = getDbClient()
      if (!client) return
      try {
        await client.connect()
        const platformRow = await loadPlatformCheckoutRow(client)
        const secretKey = resolveStripeSecretKeyFromPlatform(platformRow)
        if (!secretKey) { await client.end(); return }
        const stripe = new (require('stripe'))(secretKey)

        const due = await client.query(
          `SELECT o.id, o.order_number, o.seller_id, o.stripe_account_id,
                  o.subtotal_cents, o.total_cents, o.stripe_application_fee_cents
           FROM store_orders o
           WHERE o.stripe_payout_status = 'pending'
             AND o.stripe_account_id IS NOT NULL
             AND o.payment_status = 'bezahlt'
             AND o.delivery_date IS NOT NULL
             AND o.delivery_date <= now() - interval '14 days'
           ORDER BY o.delivery_date ASC
           LIMIT 200`
        )

        for (const row of due.rows || []) {
          const orderId = row.id
          const stripeAccountId = row.stripe_account_id

          // Mark as processing to prevent double-payout (idempotency guard)
          const guard = await client.query(
            `UPDATE store_orders SET stripe_payout_status = 'processing', updated_at = now()
             WHERE id = $1::uuid AND stripe_payout_status = 'pending'`,
            [orderId]
          )
          if (!guard.rowCount) continue // Another process already grabbed it

          try {
            // Payout amount = total paid - platform commission
            const totalCents = Number(row.total_cents || 0)
            const feeCents = Number(row.stripe_application_fee_cents || 0)
            const payoutAmount = totalCents - feeCents
            if (payoutAmount <= 0) {
              await client.query(
                `UPDATE store_orders SET stripe_payout_status = 'skipped', updated_at = now() WHERE id = $1::uuid`,
                [orderId]
              )
              continue
            }

            // Check available balance on connected account before creating payout
            const balance = await stripe.balance.retrieve({ stripeAccount: stripeAccountId })
            const available = balance.available?.find(b => b.currency === 'eur')?.amount || 0
            if (available < payoutAmount) {
              // Funds not yet settled — try again next run
              await client.query(
                `UPDATE store_orders SET stripe_payout_status = 'pending', updated_at = now() WHERE id = $1::uuid`,
                [orderId]
              )
              continue
            }

            const payout = await stripe.payouts.create(
              {
                amount: payoutAmount,
                currency: 'eur',
                description: `Order #${row.order_number || ''} — 14-day release`,
                metadata: {
                  order_id: orderId,
                  order_number: String(row.order_number || ''),
                  seller_id: row.seller_id || '',
                },
              },
              { stripeAccount: stripeAccountId }
            )

            await client.query(
              `UPDATE store_orders
               SET stripe_payout_status = 'paid',
                   stripe_payout_id = $2,
                   updated_at = now()
               WHERE id = $1::uuid`,
              [orderId, payout.id]
            )
          } catch (e) {
            await client.query(
              `UPDATE store_orders
               SET stripe_payout_status = CASE WHEN $2 ILIKE '%insufficient%funds%' THEN 'pending' ELSE 'failed' END,
                   updated_at = now()
               WHERE id = $1::uuid`,
              [orderId, String(e?.message || '')]
            )
            console.error(`[stripePayouts] Order #${row.order_number} payout failed:`, e?.message)
          }
        }
        await client.end()
      } catch (e) {
        try { await client.end() } catch (_) {}
        console.error('runStripePayoutsIfDue:', e?.message || e)
      }
    }

    // IBAN payout cron — runs hourly, pays sellers via their IBAN using Stripe Custom accounts
    // Finds orders: stripe_payout_status='pending', stripe_account_id IS NULL, delivery 14+ days ago
    // Groups by seller, transfers platform → custom account → IBAN
    const runSellerIbanPayoutsIfDue = async () => {
      if (!isPayoutFridayToday().is) return   // only execute on 2nd and 4th Friday of each month
      const client = getDbClient()
      if (!client) return
      try {
        await client.connect()

        // Idempotency: skip if we already ran this Friday's payout
        const todayKey = `IBAN-${new Date().toISOString().slice(0, 10)}`
        const alreadyRan = await client.query('SELECT run_key FROM seller_payout_auto_runs WHERE run_key = $1 LIMIT 1', [todayKey])
        if (alreadyRan.rows.length) { await client.end(); return }

        const platformRow = await loadPlatformCheckoutRow(client)
        const secretKey = resolveStripeSecretKeyFromPlatform(platformRow)
        if (!secretKey) { await client.end(); return }
        const stripeInst = new (require('stripe'))(secretKey)

        // Find eligible orders grouped by seller
        const due = await client.query(
          `SELECT o.seller_id, SUM(o.total_cents) AS total_cents,
                  s.commission_rate, s.iban, s.payment_account_holder, s.stripe_custom_account_id, s.email
           FROM store_orders o
           JOIN seller_users s ON s.seller_id = o.seller_id
           WHERE o.stripe_payout_status = 'pending'
             AND o.stripe_account_id IS NULL
             AND o.payment_status = 'bezahlt'
             AND o.delivery_date IS NOT NULL
             AND o.delivery_date <= now() - interval '14 days'
           GROUP BY o.seller_id, s.commission_rate, s.iban, s.payment_account_holder, s.stripe_custom_account_id, s.email`
        )

        for (const row of due.rows || []) {
          const { seller_id, total_cents, commission_rate, iban, payment_account_holder, email } = row
          let customAccountId = row.stripe_custom_account_id

          if (!iban) {
            console.warn(`runSellerIbanPayoutsIfDue: seller ${seller_id} has no IBAN, skipping`)
            continue
          }

          const commissionRate = Number(commission_rate || 0.12)
          const totalCents = Number(total_cents || 0)
          const commissionCents = Math.round(totalCents * commissionRate)
          const payoutCents = totalCents - commissionCents
          if (payoutCents <= 50) continue // Stripe minimum payout

          // Idempotency: mark all eligible orders as processing first
          const guard = await client.query(
            `UPDATE store_orders SET stripe_payout_status = 'processing', updated_at = now()
             WHERE seller_id = $1 AND stripe_payout_status = 'pending' AND stripe_account_id IS NULL
               AND payment_status = 'bezahlt' AND delivery_date IS NOT NULL AND delivery_date <= now() - interval '14 days'`,
            [seller_id]
          )
          if (!guard.rowCount) continue

          try {
            // Create Stripe Custom account if missing
            if (!customAccountId) {
              const acct = await stripeInst.accounts.create({
                type: 'custom',
                country: 'DE',
                email,
                capabilities: { transfers: { requested: true } },
                tos_acceptance: { service_agreement: 'recipient', date: Math.floor(Date.now() / 1000), ip: '0.0.0.0' },
              })
              customAccountId = acct.id
              const sellerClient = getSellerDbClient()
              if (sellerClient) {
                await sellerClient.connect()
                await sellerClient.query('UPDATE seller_users SET stripe_custom_account_id = $1 WHERE seller_id = $2', [customAccountId, seller_id])
                await sellerClient.end()
              }
              // Add IBAN as external account
              const cleanIban = iban.replace(/\s/g, '').toUpperCase()
              await stripeInst.accounts.createExternalAccount(customAccountId, {
                external_account: {
                  object: 'bank_account', country: 'DE', currency: 'eur',
                  account_number: cleanIban,
                  account_holder_name: payment_account_holder || 'Account Holder',
                  account_holder_type: 'individual',
                },
              })
            }

            // Transfer from platform to custom account
            const transfer = await stripeInst.transfers.create({
              amount: payoutCents,
              currency: 'eur',
              destination: customAccountId,
            })

            // Payout from custom account to IBAN
            const payout = await stripeInst.payouts.create(
              { amount: payoutCents, currency: 'eur' },
              { stripeAccount: customAccountId }
            )

            await client.query(
              `UPDATE store_orders SET stripe_payout_status = 'paid', stripe_payout_id = $1, updated_at = now()
               WHERE seller_id = $2 AND stripe_payout_status = 'processing' AND stripe_account_id IS NULL`,
              [payout.id, seller_id]
            )
            console.log(`runSellerIbanPayoutsIfDue: paid seller ${seller_id} ${payoutCents} EUR → ${customAccountId} (payout ${payout.id})`)
          } catch (e) {
            // Reset to pending so next run retries
            await client.query(
              `UPDATE store_orders SET stripe_payout_status = 'pending', updated_at = now()
               WHERE seller_id = $1 AND stripe_payout_status = 'processing' AND stripe_account_id IS NULL`,
              [seller_id]
            ).catch(() => {})
            console.error(`runSellerIbanPayoutsIfDue: seller ${seller_id} failed:`, e?.message)
          }
        }
        // Record that we ran this Friday so subsequent hourly ticks skip it
        await client.query(
          `INSERT INTO seller_payout_auto_runs (run_key, period_start, period_end, source_iban, created_count)
           VALUES ($1, $2::date, $3::date, '', 0) ON CONFLICT (run_key) DO NOTHING`,
          [todayKey, new Date().toISOString().slice(0, 10), new Date().toISOString().slice(0, 10)]
        ).catch(() => {})
        await client.end()
      } catch (e) {
        console.error('runSellerIbanPayoutsIfDue:', e?.message || e)
      }
    }

    // Fire once on boot and then every hour
    runAutomaticPayoutsIfDue().catch(() => {})
    runStripeConnectTransfersIfDue().catch(() => {})
    runStripePayoutsIfDue().catch(() => {})
    runSellerIbanPayoutsIfDue().catch(() => {})
    setInterval(() => {
      runAutomaticPayoutsIfDue().catch(() => {})
      runStripeConnectTransfersIfDue().catch(() => {})
      runStripePayoutsIfDue().catch(() => {})
      runSellerIbanPayoutsIfDue().catch(() => {})
    }, 60 * 60 * 1000)

    // PATCH /admin-hub/v1/seller/iban — save IBAN + payment info, create Stripe Custom account
    const adminHubSellerIbanPATCH = async (req, res) => {
      const sellerId = req.sellerUser?.seller_id
      const sellerEmail = req.sellerUser?.email
      if (!sellerId) return res.status(401).json({ message: 'Unauthorized' })
      const client = getSellerDbClient()
      if (!client) return res.status(503).json({ message: 'DB not configured' })
      try {
        await client.connect()
        const { iban, payment_account_holder, payment_bic, payment_bank_name } = req.body || {}
        const cleanIban = (iban || '').replace(/\s/g, '').toUpperCase() || null
        await client.query(
          `UPDATE seller_users SET iban = $1, payment_account_holder = $2, payment_bic = $3, payment_bank_name = $4, updated_at = now() WHERE seller_id = $5`,
          [cleanIban, payment_account_holder || null, payment_bic || null, payment_bank_name || null, sellerId]
        )

        // Create/update Stripe Custom account for IBAN payouts
        if (cleanIban) {
          const platformRow = await loadPlatformCheckoutRow(client)
          const secretKey = resolveStripeSecretKeyFromPlatform(platformRow)
          if (secretKey) {
            const stripeInst = new (require('stripe'))(secretKey)
            const sellerRow = (await client.query('SELECT email, stripe_custom_account_id FROM seller_users WHERE seller_id = $1', [sellerId])).rows[0]
            let customAccountId = sellerRow?.stripe_custom_account_id

            if (!customAccountId) {
              const acct = await stripeInst.accounts.create({
                type: 'custom',
                country: 'DE',
                email: sellerRow?.email || sellerEmail,
                capabilities: { transfers: { requested: true } },
                tos_acceptance: { service_agreement: 'recipient', date: Math.floor(Date.now() / 1000), ip: req.ip || '0.0.0.0' },
              })
              customAccountId = acct.id
              await client.query('UPDATE seller_users SET stripe_custom_account_id = $1 WHERE seller_id = $2', [customAccountId, sellerId])
            }

            // Replace external bank account with new IBAN
            try {
              const existing = await stripeInst.accounts.listExternalAccounts(customAccountId, { object: 'bank_account', limit: 10 })
              for (const ba of existing.data || []) {
                await stripeInst.accounts.deleteExternalAccount(customAccountId, ba.id).catch(() => {})
              }
            } catch (_) {}
            await stripeInst.accounts.createExternalAccount(customAccountId, {
              external_account: {
                object: 'bank_account',
                country: 'DE',
                currency: 'eur',
                account_number: cleanIban,
                account_holder_name: payment_account_holder || 'Account Holder',
                account_holder_type: 'individual',
              },
            })
          }
        }

        await client.end()
        res.json({ success: true })
      } catch (e) {
        try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    // GET /admin-hub/v1/seller/profile — get own profile (iban, commission_rate, etc.)
    const adminHubSellerProfileGET = async (req, res) => {
      const sellerId = req.sellerUser?.seller_id
      if (!sellerId) return res.status(401).json({ message: 'Unauthorized' })
      const client = getSellerDbClient()
      if (!client) return res.status(503).json({ message: 'DB not configured' })
      try {
        await client.connect()
        const r = await client.query('SELECT id, email, store_name, seller_id, is_superuser, iban, commission_rate, created_at FROM seller_users WHERE seller_id = $1', [sellerId])
        await client.end()
        const user = r.rows[0]
        if (!user) return res.status(404).json({ message: 'User not found' })
        res.json({ user })
      } catch (e) {
        try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    /** GET /admin-hub/v1/seller/account — angezeigter Benutzer exakt die eingeloggte Zeile (inkl. Team-Mitglieder) */
    const adminHubSellerAccountGET = async (req, res) => {
      const userId = req.sellerUser?.id
      if (!userId) return res.status(401).json({ message: 'Unauthorized' })
      const client = getSellerDbClient()
      if (!client) return res.status(503).json({ message: 'Database not configured' })
      try {
        await client.connect()
        const r = await client.query(
          `SELECT id, email, store_name, seller_id, is_superuser, sub_of_seller_id, first_name, last_name,
                  approval_status, created_at, iban, payment_account_holder, payment_bic, payment_bank_name,
                  company_name, authorized_person_name, tax_id, vat_id,
                  business_address, phone, documents, rejection_reason, approved_at,
                  commission_rate
           FROM seller_users WHERE id = $1`,
          [userId],
        )
        await client.end()
        const row = r.rows?.[0]
        if (!row) return res.status(404).json({ message: 'User not found' })
        res.json({
          sellerUser: {
            id: row.id,
            email: row.email,
            store_name: row.store_name,
            seller_id: row.seller_id,
            is_superuser: row.is_superuser === true,
            is_team_member: row.sub_of_seller_id != null && String(row.sub_of_seller_id).trim() !== '',
            approval_status: row.approval_status || 'registered',
            first_name: row.first_name,
            last_name: row.last_name,
            created_at: row.created_at,
            iban: row.iban,
            payment_account_holder: row.payment_account_holder,
            payment_bic: row.payment_bic,
            payment_bank_name: row.payment_bank_name,
            company_name: row.company_name,
            authorized_person_name: row.authorized_person_name,
            tax_id: row.tax_id,
            vat_id: row.vat_id,
            business_address: row.business_address,
            phone: row.phone,
            documents: row.documents,
            rejection_reason: row.rejection_reason,
            approved_at: row.approved_at,
            commission_rate: row.commission_rate != null ? parseFloat(row.commission_rate) : 0.12,
          },
          // legacy alias
          user: {
            id: row.id,
            email: row.email,
            store_name: row.store_name,
            seller_id: row.seller_id,
            is_superuser: row.is_superuser === true,
            approval_status: row.approval_status || 'registered',
            commission_rate: row.commission_rate != null ? parseFloat(row.commission_rate) : 0.12,
          },
        })
      } catch (e) {
        try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    const PasswordChangeSchema = z.object({
      current_password: z.string().min(1, 'Current password is required').max(256),
      new_password:     zPassword,
    })
    /** PATCH /admin-hub/v1/seller/password — eigenes Passwort (nur eingeloggter Benutzer) */
    const adminHubSellerPasswordPATCH = async (req, res) => {
      const userId = req.sellerUser?.id
      if (!userId) return res.status(401).json({ message: 'Unauthorized' })
      const parsed = validate(PasswordChangeSchema, req.body || {}, res)
      if (!parsed) return
      const cur = parsed.current_password
      const neu = parsed.new_password
      const client = getSellerDbClient()
      if (!client) return res.status(503).json({ message: 'Database not configured' })
      try {
        await client.connect()
        const r = await client.query('SELECT id, password_hash FROM seller_users WHERE id = $1', [userId])
        const row = r.rows?.[0]
        if (!row) {
          await client.end()
          return res.status(404).json({ message: 'Benutzer nicht gefunden.' })
        }
        if (!verifySellerPassword(cur, row.password_hash)) {
          await client.end()
          return res.status(400).json({ message: 'Das aktuelle Passwort ist nicht korrekt.' })
        }
        await client.query('UPDATE seller_users SET password_hash = $1, updated_at = now() WHERE id = $2', [
          hashSellerPassword(neu),
          userId,
        ])
        await client.end()
        res.json({ success: true })
      } catch (e) {
        try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    // POST /admin-hub/users/invite — invite a new seller sub-user
    const adminHubUsersInvitePOST = async (req, res) => {
      const inviterSellerId = req.sellerUser?.seller_id
      if (!inviterSellerId) return res.status(401).json({ message: 'Unauthorized' })
      const client = getSellerDbClient()
      if (!client) return res.status(503).json({ message: 'DB not configured' })
      try {
        await client.connect()
        const { email, first_name, last_name, permissions } = req.body || {}
        if (!email) { await client.end(); return res.status(400).json({ message: 'Email required' }) }
        const normalEmail = email.trim().toLowerCase()
        // Check if already registered as a seller user
        const existing = await client.query('SELECT id, sub_of_seller_id FROM seller_users WHERE email = $1', [normalEmail])
        if (existing.rows.length) {
          const row = existing.rows[0]
          if (row.sub_of_seller_id && row.sub_of_seller_id !== inviterSellerId) {
            await client.end()
            return res.status(409).json({ message: 'Dieser Benutzer ist bereits einem anderen Verkäufer-Konto zugeordnet.' })
          }
          if (row.sub_of_seller_id === inviterSellerId) {
            await client.end()
            return res.status(409).json({ message: 'Dieser Benutzer ist bereits Mitglied Ihres Teams.' })
          }
          // User registered but not linked (sub_of_seller_id IS NULL) — directly link them
          await client.query(
            `UPDATE seller_users SET sub_of_seller_id = $1, updated_at = now() WHERE email = $2 AND sub_of_seller_id IS NULL`,
            [inviterSellerId, normalEmail]
          ).catch(() => {})
          await client.end()
          return res.json({ success: true, linked: true })
        }
        // Check if pending invite from a different seller already exists
        const pendingInv = await client.query(
          `SELECT id, invited_by_seller_id FROM seller_invitations WHERE email = $1 AND accepted_at IS NULL AND expires_at > now()`,
          [normalEmail]
        )
        if (pendingInv.rows.length && pendingInv.rows[0].invited_by_seller_id !== inviterSellerId) {
          await client.end()
          return res.status(409).json({ message: 'Für diese E-Mail gibt es bereits eine ausstehende Einladung von einem anderen Verkäufer.' })
        }
        // Create/replace invitation token (upsert for same seller re-invite)
        const token = require('crypto').randomBytes(32).toString('hex')
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
        const permJson = permissions ? JSON.stringify(permissions) : null
        await client.query(
          `INSERT INTO seller_invitations (email, invited_by_seller_id, token, expires_at, first_name, last_name, permissions)
           VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
           ON CONFLICT (email) DO UPDATE SET token = $3, expires_at = $4, accepted_at = NULL, first_name = $5, last_name = $6, permissions = $7::jsonb
           WHERE seller_invitations.invited_by_seller_id = $2`,
          [normalEmail, inviterSellerId, token, expiresAt, first_name || null, last_name || null, permJson]
        )
        await client.end()
        // Try to send invitation email
        const inviteUrl = `${process.env.NEXT_PUBLIC_SELLERCENTRAL_URL || 'http://localhost:3001'}/register?invite=${token}&email=${encodeURIComponent(normalEmail)}`
        try {
          const dbClient2 = getDbClient()
          if (dbClient2) {
            await dbClient2.connect()
            const transport = await getSmtpTransport(dbClient2)
            await dbClient2.end()
            if (transport) {
              const displayName = [first_name, last_name].filter(Boolean).join(' ')
              await transport.sendMail({
                to: normalEmail,
                subject: 'Einladung zur Andertal Seller Platform',
                text: `${displayName ? `Hallo ${displayName},\n\n` : ''}Sie wurden eingeladen, der Andertal Seller Platform beizutreten.\n\nRegistrierungslink: ${inviteUrl}\n\nDieser Link ist 7 Tage gültig.`,
                html: `<p>${displayName ? `Hallo <strong>${displayName}</strong>,` : ''}</p><p>Sie wurden eingeladen, der <strong>Andertal Seller Platform</strong> beizutreten.</p><p><a href="${inviteUrl}">Jetzt registrieren</a></p><p>Dieser Link ist 7 Tage gültig.</p>`
              })
            }
          }
        } catch (_) { /* email sending is best-effort */ }
        res.json({ success: true, invite_url: inviteUrl })
      } catch (e) {
        try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    // GET /admin-hub/v1/subusers — list sub-users belonging to current seller
    const adminHubSubusersGET = async (req, res) => {
      const sellerId = req.sellerUser?.seller_id
      if (!sellerId) return res.status(401).json({ message: 'Unauthorized' })
      const client = getSellerDbClient()
      if (!client) return res.status(503).json({ message: 'DB not configured' })
      try {
        await client.connect()
        // Auto-link: find users who registered with an invited email but weren't linked yet
        const pendingToLink = await client.query(
          `SELECT si.id AS invite_id, si.email, si.permissions, si.first_name, si.last_name
           FROM seller_invitations si
           JOIN seller_users su ON LOWER(su.email) = LOWER(si.email) AND su.sub_of_seller_id IS NULL
           WHERE si.invited_by_seller_id = $1 AND si.accepted_at IS NULL`,
          [sellerId]
        )
        for (const row of (pendingToLink.rows || [])) {
          await client.query(
            `UPDATE seller_users SET sub_of_seller_id = $1, permissions = COALESCE(permissions, $2::jsonb), updated_at = now() WHERE LOWER(email) = LOWER($3) AND sub_of_seller_id IS NULL`,
            [sellerId, row.permissions ? JSON.stringify(row.permissions) : null, row.email]
          ).catch(() => {})
          await client.query(
            `UPDATE seller_invitations SET accepted_at = now() WHERE id = $1`,
            [row.invite_id]
          ).catch(() => {})
        }
        // Sub-users: those whose sub_of_seller_id matches our seller_id
        const r = await client.query(
          `SELECT id, email, first_name, last_name, permissions, created_at FROM seller_users WHERE sub_of_seller_id = $1 ORDER BY created_at ASC`,
          [sellerId]
        )
        // Pending invitations (not yet accepted, no matching registered user)
        const inv = await client.query(
          `SELECT si.id, si.email, si.first_name, si.last_name, si.permissions, si.expires_at, si.created_at
           FROM seller_invitations si
           WHERE si.invited_by_seller_id = $1 AND si.accepted_at IS NULL AND si.expires_at > now()
           AND NOT EXISTS (SELECT 1 FROM seller_users su WHERE LOWER(su.email) = LOWER(si.email))
           ORDER BY si.created_at DESC`,
          [sellerId]
        )
        await client.end()
        res.json({ subusers: r.rows || [], pending_invites: inv.rows || [] })
      } catch (e) {
        try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    // PATCH /admin-hub/v1/subusers/:id — update sub-user permissions
    const adminHubSubuserUpdatePATCH = async (req, res) => {
      const sellerId = req.sellerUser?.seller_id
      if (!sellerId) return res.status(401).json({ message: 'Unauthorized' })
      const { id } = req.params
      const { permissions } = req.body || {}
      const client = getSellerDbClient()
      if (!client) return res.status(503).json({ message: 'DB not configured' })
      try {
        await client.connect()
        // Ensure the sub-user belongs to this seller
        const check = await client.query('SELECT id FROM seller_users WHERE id = $1 AND sub_of_seller_id = $2', [id, sellerId])
        if (!check.rows.length) { await client.end(); return res.status(404).json({ message: 'Benutzer nicht gefunden' }) }
        const r = await client.query(
          `UPDATE seller_users SET permissions = $1::jsonb, updated_at = now() WHERE id = $2 RETURNING id, email, first_name, last_name, permissions`,
          [permissions ? JSON.stringify(permissions) : null, id]
        )
        await client.end()
        res.json({ user: r.rows[0] })
      } catch (e) {
        try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    // DELETE /admin-hub/v1/subusers/:id — delete sub-user
    const adminHubSubuserDeleteDELETE = async (req, res) => {
      const sellerId = req.sellerUser?.seller_id
      if (!sellerId) return res.status(401).json({ message: 'Unauthorized' })
      const { id } = req.params
      const client = getSellerDbClient()
      if (!client) return res.status(503).json({ message: 'DB not configured' })
      try {
        await client.connect()
        const check = await client.query('SELECT id FROM seller_users WHERE id = $1 AND sub_of_seller_id = $2', [id, sellerId])
        if (!check.rows.length) { await client.end(); return res.status(404).json({ message: 'Benutzer nicht gefunden' }) }
        await client.query('DELETE FROM seller_users WHERE id = $1', [id])
        await client.end()
        res.json({ success: true })
      } catch (e) {
        try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    // DELETE /admin-hub/v1/pending-invites/:id — cancel a pending invite
    const adminHubPendingInviteDeleteDELETE = async (req, res) => {
      const sellerId = req.sellerUser?.seller_id
      if (!sellerId) return res.status(401).json({ message: 'Unauthorized' })
      const { id } = req.params
      const client = getSellerDbClient()
      if (!client) return res.status(503).json({ message: 'DB not configured' })
      try {
        await client.connect()
        await client.query('DELETE FROM seller_invitations WHERE id = $1 AND invited_by_seller_id = $2', [id, sellerId])
        await client.end()
        res.json({ success: true })
      } catch (e) {
        try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    httpApp.get('/admin-hub/v1/transactions', requireSellerAuth, adminHubTransactionsGET)
    httpApp.get('/admin-hub/v1/coupons', requireSellerAuth, adminHubCouponsGET)
    httpApp.post('/admin-hub/v1/coupons', requireSellerAuth, adminHubCouponsPOST)
    httpApp.patch('/admin-hub/v1/coupons/:id', requireSellerAuth, adminHubCouponsPATCH)
    httpApp.delete('/admin-hub/v1/coupons/:id', requireSellerAuth, adminHubCouponsDELETE)
    httpApp.get('/admin-hub/v1/payouts', requireSellerAuth, adminHubPayoutsGET)
    httpApp.post('/admin-hub/v1/payouts', requireSellerAuth, adminHubPayoutsPOST)
    httpApp.patch('/admin-hub/v1/payouts/:id', requireSellerAuth, adminHubPayoutsPATCH)
    httpApp.post('/admin-hub/v1/payouts/mark-paid', requireSellerAuth, adminHubPayoutsMarkPaidPOST)
    httpApp.get('/admin-hub/v1/payout-summary', requireSellerAuth, adminHubPayoutSummaryGET)
    httpApp.get('/admin-hub/v1/payout-overview', requireSellerAuth, adminHubPayoutOverviewGET)
    httpApp.patch('/admin-hub/v1/seller/iban', requireSellerAuth, adminHubSellerIbanPATCH)
    httpApp.get('/admin-hub/v1/seller/account', requireSellerAuth, adminHubSellerAccountGET)
    httpApp.patch('/admin-hub/v1/seller/password', requireSellerAuth, adminHubSellerPasswordPATCH)
    httpApp.get('/admin-hub/v1/seller/profile', requireSellerAuth, adminHubSellerProfileGET)
    httpApp.post('/admin-hub/users/invite', requireSellerAuth, adminHubUsersInvitePOST)
    httpApp.get('/admin-hub/v1/subusers', requireSellerAuth, adminHubSubusersGET)
    httpApp.patch('/admin-hub/v1/subusers/:id', requireSellerAuth, adminHubSubuserUpdatePATCH)
    httpApp.delete('/admin-hub/v1/subusers/:id', requireSellerAuth, adminHubSubuserDeleteDELETE)
    httpApp.delete('/admin-hub/v1/pending-invites/:id', requireSellerAuth, adminHubPendingInviteDeleteDELETE)

    // ── Seller Product Groups ─────────────────────────────────────────────────
    const pgDbClient = () => {
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      const { Client } = require('pg')
      return new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
    }

    httpApp.get('/admin-hub/v1/product-groups', requireSellerAuth, async (req, res) => {
      const sellerId = req.sellerUser?.seller_id || null
      const isSuperuser = req.sellerUser?.is_superuser || false
      const c = pgDbClient(); try {
        await c.connect()
        const r = isSuperuser
          ? await c.query(`
              SELECT spg.*, su.store_name AS seller_store_name, su.email AS seller_email
              FROM seller_product_groups spg
              LEFT JOIN seller_users su ON su.seller_id = spg.seller_id
              ORDER BY COALESCE(su.store_name, su.email, spg.seller_id), spg.created_at DESC
            `)
          : await c.query(`SELECT * FROM seller_product_groups WHERE seller_id = $1 ORDER BY created_at DESC`, [sellerId])
        await c.end(); res.json({ groups: r.rows })
      } catch (e) { try { await c.end() } catch(_){} ; res.status(500).json({ message: e?.message }) }
    })

    httpApp.post('/admin-hub/v1/product-groups', requireSellerAuth, async (req, res) => {
      const sellerId = req.sellerUser?.seller_id || null
      if (!sellerId) return res.status(403).json({ message: 'Seller ID required' })
      const { name, description, product_ids, filter_rules } = req.body || {}
      if (!name?.trim()) return res.status(400).json({ message: 'name required' })
      const c = pgDbClient(); try {
        await c.connect()
        const r = await c.query(
          `INSERT INTO seller_product_groups (seller_id, name, description, product_ids, filter_rules) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
          [sellerId, name.trim(), description || '', JSON.stringify(Array.isArray(product_ids) ? product_ids : []), JSON.stringify(filter_rules || {})]
        )
        await c.end(); res.status(201).json({ group: r.rows[0] })
      } catch (e) { try { await c.end() } catch(_){} ; res.status(500).json({ message: e?.message }) }
    })

    httpApp.get('/admin-hub/v1/product-groups/:id', requireSellerAuth, async (req, res) => {
      const sellerId = req.sellerUser?.seller_id
      const isSuperuser = req.sellerUser?.is_superuser
      const c = pgDbClient(); try {
        await c.connect()
        const r = await c.query(`SELECT * FROM seller_product_groups WHERE id = $1`, [req.params.id])
        await c.end()
        const g = r.rows[0]
        if (!g) return res.status(404).json({ message: 'Not found' })
        if (!isSuperuser && g.seller_id !== sellerId) return res.status(403).json({ message: 'Forbidden' })
        res.json({ group: g })
      } catch (e) { try { await c.end() } catch(_){} ; res.status(500).json({ message: e?.message }) }
    })

    httpApp.put('/admin-hub/v1/product-groups/:id', requireSellerAuth, async (req, res) => {
      const sellerId = req.sellerUser?.seller_id
      const isSuperuser = req.sellerUser?.is_superuser
      const { name, description, product_ids, filter_rules } = req.body || {}
      const c = pgDbClient(); try {
        await c.connect()
        const exist = await c.query(`SELECT * FROM seller_product_groups WHERE id = $1`, [req.params.id])
        const g = exist.rows[0]
        if (!g) { await c.end(); return res.status(404).json({ message: 'Not found' }) }
        if (!isSuperuser && g.seller_id !== sellerId) { await c.end(); return res.status(403).json({ message: 'Forbidden' }) }
        const r = await c.query(
          `UPDATE seller_product_groups SET name=$1, description=$2, product_ids=$3, filter_rules=$4, updated_at=now() WHERE id=$5 RETURNING *`,
          [name?.trim() || g.name, description ?? g.description, JSON.stringify(Array.isArray(product_ids) ? product_ids : g.product_ids), JSON.stringify(filter_rules || g.filter_rules || {}), req.params.id]
        )
        await c.end(); res.json({ group: r.rows[0] })
      } catch (e) { try { await c.end() } catch(_){} ; res.status(500).json({ message: e?.message }) }
    })

    httpApp.delete('/admin-hub/v1/product-groups/:id', requireSellerAuth, async (req, res) => {
      const sellerId = req.sellerUser?.seller_id
      const isSuperuser = req.sellerUser?.is_superuser
      const c = pgDbClient(); try {
        await c.connect()
        const exist = await c.query(`SELECT * FROM seller_product_groups WHERE id = $1`, [req.params.id])
        const g = exist.rows[0]
        if (!g) { await c.end(); return res.status(404).json({ message: 'Not found' }) }
        if (!isSuperuser && g.seller_id !== sellerId) { await c.end(); return res.status(403).json({ message: 'Forbidden' }) }
        await c.query(`DELETE FROM seller_product_groups WHERE id=$1`, [req.params.id])
        await c.end(); res.json({ deleted: true })
      } catch (e) { try { await c.end() } catch(_){} ; res.status(500).json({ message: e?.message }) }
    })

    // ── Seller Campaigns (Aktionen/Kampagnen) ─────────────────────────────────
    // Helper: get all product IDs covered by a campaign (products + group products)
    const resolveCampaignProductIds = async (c, campaign) => {
      const ids = new Set(Array.isArray(campaign.product_ids) ? campaign.product_ids.map(String) : [])
      const groupIds = Array.isArray(campaign.group_ids) ? campaign.group_ids : []
      if (groupIds.length > 0) {
        for (const gid of groupIds) {
          const gr = await c.query(`SELECT product_ids FROM seller_product_groups WHERE id=$1`, [gid]).catch(() => ({ rows: [] }))
          const gProds = Array.isArray(gr.rows[0]?.product_ids) ? gr.rows[0].product_ids : []
          gProds.forEach((id) => ids.add(String(id)))
        }
      }
      return [...ids]
    }

    httpApp.get('/admin-hub/v1/campaigns', requireSellerAuth, async (req, res) => {
      const sellerId = req.sellerUser?.seller_id
      const isSuperuser = req.sellerUser?.is_superuser
      const c = pgDbClient(); try {
        await c.connect()
        const r = isSuperuser
          ? await c.query(`SELECT * FROM seller_campaigns ORDER BY created_at DESC`)
          : await c.query(`SELECT * FROM seller_campaigns WHERE seller_id=$1 ORDER BY created_at DESC`, [sellerId])
        await c.end(); res.json({ campaigns: r.rows })
      } catch (e) { try { await c.end() } catch(_){} ; res.status(500).json({ message: e?.message }) }
    })

    httpApp.post('/admin-hub/v1/campaigns', requireSellerAuth, async (req, res) => {
      const sellerId = req.sellerUser?.seller_id
      if (!sellerId) return res.status(403).json({ message: 'Seller ID required' })
      const { name, description, status, start_at, end_at, discount_type, discount_value, target_type, product_ids, group_ids, variant_ids, settings, campaign_type, budget_daily_cents, bid_strategy, ad_platforms } = req.body || {}
      if (!name?.trim()) return res.status(400).json({ message: 'name required' })
      const dType = String(discount_type || 'percentage').toLowerCase()
      const dVal = parseFloat(discount_value) || 0
      if (dVal < 0) return res.status(400).json({ message: 'discount_value must be >= 0' })
      if (dType === 'percentage' && dVal > 100) return res.status(400).json({ message: 'percentage discount must be 0–100' })
      const c = pgDbClient(); try {
        await c.connect()
        const r = await c.query(
          `INSERT INTO seller_campaigns (seller_id, name, description, status, start_at, end_at, discount_type, discount_value, target_type, product_ids, group_ids, variant_ids, settings, campaign_type, budget_daily_cents, bid_strategy, ad_platforms) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING *`,
          [sellerId, name.trim(), description || '', status || 'draft', start_at || null, end_at || null, discount_type || 'percentage', dVal, target_type || 'products', JSON.stringify(Array.isArray(product_ids) ? product_ids : []), JSON.stringify(Array.isArray(group_ids) ? group_ids : []), JSON.stringify(Array.isArray(variant_ids) ? variant_ids : []), JSON.stringify(settings || {}), campaign_type || 'internal', parseInt(budget_daily_cents) || 0, bid_strategy || 'cpc', JSON.stringify(Array.isArray(ad_platforms) ? ad_platforms : [])]
        )
        await c.end(); res.status(201).json({ campaign: r.rows[0] })
      } catch (e) { try { await c.end() } catch(_){} ; res.status(500).json({ message: e?.message }) }
    })

    httpApp.get('/admin-hub/v1/campaigns/:id', requireSellerAuth, async (req, res) => {
      const sellerId = req.sellerUser?.seller_id
      const isSuperuser = req.sellerUser?.is_superuser
      const c = pgDbClient(); try {
        await c.connect()
        const r = await c.query(`SELECT * FROM seller_campaigns WHERE id=$1`, [req.params.id])
        await c.end()
        const camp = r.rows[0]
        if (!camp) return res.status(404).json({ message: 'Not found' })
        if (!isSuperuser && camp.seller_id !== sellerId) return res.status(403).json({ message: 'Forbidden' })
        res.json({ campaign: camp })
      } catch (e) { try { await c.end() } catch(_){} ; res.status(500).json({ message: e?.message }) }
    })

    httpApp.put('/admin-hub/v1/campaigns/:id', requireSellerAuth, async (req, res) => {
      const sellerId = req.sellerUser?.seller_id
      const isSuperuser = req.sellerUser?.is_superuser
      const c = pgDbClient(); try {
        await c.connect()
        const exist = await c.query(`SELECT * FROM seller_campaigns WHERE id=$1`, [req.params.id])
        const camp = exist.rows[0]
        if (!camp) { await c.end(); return res.status(404).json({ message: 'Not found' }) }
        if (!isSuperuser && camp.seller_id !== sellerId) { await c.end(); return res.status(403).json({ message: 'Forbidden' }) }
        const b = req.body || {}
        const dVal = b.discount_value !== undefined ? parseFloat(b.discount_value) : Number(camp.discount_value)
        const dTypePut = String(b.discount_type || camp.discount_type || 'percentage').toLowerCase()
        if (dVal < 0 || !Number.isFinite(dVal)) {
          await c.end()
          return res.status(400).json({ message: 'discount_value invalid' })
        }
        if (dTypePut === 'percentage' && dVal > 100) {
          await c.end()
          return res.status(400).json({ message: 'percentage discount must be 0–100' })
        }
        let nextVariants = Array.isArray(b.variant_ids) ? b.variant_ids : camp.variant_ids
        if (!Array.isArray(nextVariants)) {
          try {
            nextVariants = camp.variant_ids != null && typeof camp.variant_ids === 'string' ? JSON.parse(camp.variant_ids) : []
          } catch (_) {
            nextVariants = []
          }
          if (!Array.isArray(nextVariants)) nextVariants = []
        }
        const r = await c.query(
          `UPDATE seller_campaigns SET name=$1, description=$2, status=$3, start_at=$4, end_at=$5, discount_type=$6, discount_value=$7, target_type=$8, product_ids=$9, group_ids=$10, variant_ids=$11, settings=$12, campaign_type=$13, budget_daily_cents=$14, bid_strategy=$15, ad_platforms=$16, updated_at=now() WHERE id=$17 RETURNING *`,
          [b.name?.trim() || camp.name, b.description ?? camp.description, b.status || camp.status, b.start_at !== undefined ? (b.start_at || null) : camp.start_at, b.end_at !== undefined ? (b.end_at || null) : camp.end_at, b.discount_type || camp.discount_type, dVal, b.target_type || camp.target_type, JSON.stringify(Array.isArray(b.product_ids) ? b.product_ids : camp.product_ids), JSON.stringify(Array.isArray(b.group_ids) ? b.group_ids : camp.group_ids), JSON.stringify(Array.isArray(nextVariants) ? nextVariants : []), JSON.stringify(b.settings || camp.settings || {}), b.campaign_type || camp.campaign_type || 'internal', b.budget_daily_cents !== undefined ? parseInt(b.budget_daily_cents) : (camp.budget_daily_cents || 0), b.bid_strategy || camp.bid_strategy || 'cpc', JSON.stringify(Array.isArray(b.ad_platforms) ? b.ad_platforms : (camp.ad_platforms || [])), req.params.id]
        )
        await c.end(); res.json({ campaign: r.rows[0] })
      } catch (e) { try { await c.end() } catch(_){} ; res.status(500).json({ message: e?.message }) }
    })

    httpApp.delete('/admin-hub/v1/campaigns/:id', requireSellerAuth, async (req, res) => {
      const sellerId = req.sellerUser?.seller_id
      const isSuperuser = req.sellerUser?.is_superuser
      const c = pgDbClient(); try {
        await c.connect()
        const exist = await c.query(`SELECT * FROM seller_campaigns WHERE id=$1`, [req.params.id])
        const camp = exist.rows[0]
        if (!camp) { await c.end(); return res.status(404).json({ message: 'Not found' }) }
        if (!isSuperuser && camp.seller_id !== sellerId) { await c.end(); return res.status(403).json({ message: 'Forbidden' }) }
        await c.query(`DELETE FROM seller_campaigns WHERE id=$1`, [req.params.id])
        await c.end(); res.json({ deleted: true })
      } catch (e) { try { await c.end() } catch(_){} ; res.status(500).json({ message: e?.message }) }
    })

    // Publish PPC campaign to ad platforms (superuser only)
    httpApp.post('/admin-hub/v1/campaigns/:id/publish', requireSellerAuth, requireSuperuser, async (req, res) => {
      const c = pgDbClient(); try {
        await c.connect()
        const exist = await c.query(`SELECT * FROM seller_campaigns WHERE id=$1`, [req.params.id])
        const camp = exist.rows[0]
        if (!camp) { await c.end(); return res.status(404).json({ message: 'Not found' }) }
        const platforms = Array.isArray(camp.ad_platforms) ? camp.ad_platforms : []
        if (!platforms.length) { await c.end(); return res.status(400).json({ message: 'Kampanya için reklam platformu seçilmemiş' }) }
        const maRows = await c.query(`SELECT * FROM platform_marketing_accounts WHERE platform = ANY($1) AND is_active = true`, [platforms])
        const accounts = maRows.rows
        if (!accounts.length) { await c.end(); return res.status(400).json({ message: 'Seçilen platformlar için bağlı pazarlama hesabı bulunamadı' }) }
        const budgetPerPlatform = Math.floor((camp.budget_daily_cents || 0) / accounts.length)
        const externalIds = {}
        for (const account of accounts) {
          externalIds[account.platform] = `sim_${account.platform}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
        }
        const r = await c.query(
          `UPDATE seller_campaigns SET ad_status='published', external_campaign_ids=$1, status='active', updated_at=now() WHERE id=$2 RETURNING *`,
          [JSON.stringify(externalIds), req.params.id]
        )
        await c.end()
        res.json({ campaign: r.rows[0], budget_per_platform_cents: budgetPerPlatform, platforms_published: accounts.map(a => a.platform) })
      } catch (e) { try { await c.end() } catch(_){} ; res.status(500).json({ message: e?.message }) }
    })

    // Pause published PPC campaign (superuser only)
    httpApp.post('/admin-hub/v1/campaigns/:id/pause', requireSellerAuth, requireSuperuser, async (req, res) => {
      const c = pgDbClient(); try {
        await c.connect()
        const r = await c.query(`UPDATE seller_campaigns SET ad_status='paused', status='paused', updated_at=now() WHERE id=$1 RETURNING *`, [req.params.id])
        if (!r.rows[0]) { await c.end(); return res.status(404).json({ message: 'Not found' }) }
        await c.end(); res.json({ campaign: r.rows[0] })
      } catch (e) { try { await c.end() } catch(_){} ; res.status(500).json({ message: e?.message }) }
    })

    // Resume paused PPC campaign (superuser only)
    httpApp.post('/admin-hub/v1/campaigns/:id/resume', requireSellerAuth, requireSuperuser, async (req, res) => {
      const c = pgDbClient(); try {
        await c.connect()
        const r = await c.query(`UPDATE seller_campaigns SET ad_status='published', status='active', updated_at=now() WHERE id=$1 RETURNING *`, [req.params.id])
        if (!r.rows[0]) { await c.end(); return res.status(404).json({ message: 'Not found' }) }
        await c.end(); res.json({ campaign: r.rows[0] })
      } catch (e) { try { await c.end() } catch(_){} ; res.status(500).json({ message: e?.message }) }
    })

    // ── Platform Marketing Accounts (superuser only) ──────────────────────────────
    httpApp.get('/admin-hub/v1/marketing-accounts', requireSellerAuth, requireSuperuser, async (req, res) => {
      const c = pgDbClient(); try {
        await c.connect()
        const r = await c.query(`SELECT * FROM platform_marketing_accounts ORDER BY platform`)
        await c.end(); res.json({ accounts: r.rows })
      } catch (e) { try { await c.end() } catch(_){} ; res.status(500).json({ message: e?.message }) }
    })

    httpApp.patch('/admin-hub/v1/marketing-accounts', requireSellerAuth, requireSuperuser, async (req, res) => {
      const { platform, display_name, credentials, is_active } = req.body || {}
      if (!platform) return res.status(400).json({ message: 'platform required' })
      const c = pgDbClient(); try {
        await c.connect()
        const existing = await c.query(`SELECT * FROM platform_marketing_accounts WHERE platform=$1`, [platform])
        let row
        if (existing.rows[0]) {
          const curr = existing.rows[0]
          const mergedCreds = { ...(curr.credentials || {}) }
          if (credentials && typeof credentials === 'object') {
            for (const [k, v] of Object.entries(credentials)) {
              if (v !== '' && v !== undefined) mergedCreds[k] = v
            }
          }
          const r = await c.query(
            `UPDATE platform_marketing_accounts SET display_name=$1, credentials=$2, is_active=$3, updated_at=now() WHERE platform=$4 RETURNING *`,
            [display_name ?? curr.display_name, JSON.stringify(mergedCreds), is_active !== undefined ? is_active : curr.is_active, platform]
          )
          row = r.rows[0]
        } else {
          const r = await c.query(
            `INSERT INTO platform_marketing_accounts (platform, display_name, credentials, is_active) VALUES ($1,$2,$3,$4) RETURNING *`,
            [platform, display_name || '', JSON.stringify(credentials || {}), is_active !== undefined ? is_active : true]
          )
          row = r.rows[0]
        }
        await c.end(); res.json({ account: row })
      } catch (e) { try { await c.end() } catch(_){} ; res.status(500).json({ message: e?.message }) }
    })

    /** Rabatt aus seller_campaigns auf Listenpreis (Cent) anwenden — fixed = € aus DB. */
    const applySellerCampaignToPriceCents = (priceCents, camp) => {
      const p = Math.max(0, Number(priceCents || 0))
      if (!camp || p <= 0) return p
      const t = String(camp.discount_type || 'percentage').toLowerCase()
      const v = Number(camp.discount_value || 0)
      if (t === 'fixed') {
        const off = Math.round(v * 100)
        return Math.max(0, p - off)
      }
      const pct = Math.min(100, Math.max(0, v))
      return Math.round(p * (1 - pct / 100))
    }

    const parseJsonbArray = (raw) => {
      if (raw == null) return []
      if (Array.isArray(raw)) return raw.map(String)
      if (typeof raw === 'string') {
        try {
          const x = JSON.parse(raw)
          return Array.isArray(x) ? x.map(String) : []
        } catch (_) {
          return []
        }
      }
      return []
    }

    async function sellerCampaignCoversProductVariant(c, camp, productId, variantId) {
      const pid = String(productId || '').trim()
      const vid = String(variantId || '').trim()
      const targetType = String(camp.target_type || 'products').toLowerCase()
      const variantIdsList = parseJsonbArray(camp.variant_ids)

      let productMatch = false
      if (targetType === 'all') {
        productMatch = true
      } else if (targetType === 'groups') {
        const groupIds = parseJsonbArray(camp.group_ids)
        for (const gid of groupIds) {
          const gr = await c.query(`SELECT product_ids FROM seller_product_groups WHERE id=$1`, [gid]).catch(() => ({ rows: [] }))
          const gProds = parseJsonbArray(gr.rows[0]?.product_ids)
          if (gProds.includes(pid)) {
            productMatch = true
            break
          }
        }
      } else {
        const productIds = parseJsonbArray(camp.product_ids)
        productMatch = productIds.includes(pid)
      }

      if (variantIdsList.length > 0) {
        if (!vid || !variantIdsList.includes(vid)) return false
        if (productMatch || targetType === 'all') return true
        return vid.startsWith(`${pid}-`)
      }
      return productMatch
    }

    async function findBestSellerCampaignDiscountRow(c, { productId, variantId, sellerId }) {
      const pid = String(productId || '').trim()
      const vid = String(variantId || '').trim()
      const sid = String(sellerId || '').trim()
      if (!pid || !sid) return null
      const nowIso = new Date().toISOString()
      const r = await c.query(
        `SELECT * FROM seller_campaigns
         WHERE seller_id = $1
           AND status = 'active'
           AND COALESCE(campaign_type, 'internal') = 'internal'
           AND (start_at IS NULL OR start_at <= $2::timestamptz)
           AND (end_at IS NULL OR end_at >= $2::timestamptz)
         ORDER BY discount_value DESC`,
        [sid, nowIso],
      )
      let bestDiscount = null
      for (const camp of r.rows || []) {
        const covered = await sellerCampaignCoversProductVariant(c, camp, pid, vid)
        if (covered) {
          if (!bestDiscount || parseFloat(camp.discount_value) > parseFloat(bestDiscount.discount_value)) {
            bestDiscount = camp
          }
        }
      }
      return bestDiscount
    }

    // Store API: active campaign discounts for a product + variant (shop PDP)
    httpApp.get('/store/campaigns/discount', async (req, res) => {
      const product_id = (req.query.product_id || '').toString().trim()
      const variant_id = (req.query.variant_id || '').toString().trim()
      const seller_id_query = (req.query.seller_id || '').toString().trim()
      if (!product_id) return res.status(400).json({ message: 'product_id required' })
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      const { Client } = require('pg')
      const c = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
      try {
        await c.connect()
        let sellerId = seller_id_query
        if (!sellerId) {
          const product = await getAdminHubProductByIdOrHandleDb(product_id)
          sellerId = product?.seller_id ? String(product.seller_id).trim() : ''
        }
        if (!sellerId) {
          await c.end()
          return res.json({ discount: null })
        }
        const bestDiscount = await findBestSellerCampaignDiscountRow(c, {
          productId: product_id,
          variantId: variant_id,
          sellerId,
        })
        await c.end()
        if (!bestDiscount) return res.json({ discount: null })
        let settings = bestDiscount.settings || {}
        if (typeof settings === 'string') {
          try {
            settings = JSON.parse(settings)
          } catch (_) {
            settings = {}
          }
        }
        res.json({
          discount: {
            campaign_id: bestDiscount.id,
            campaign_name: bestDiscount.name,
            discount_type: bestDiscount.discount_type,
            discount_value: parseFloat(bestDiscount.discount_value),
            show_badge: settings.show_badge !== false,
            badge_text: settings.badge_text ? String(settings.badge_text) : '',
          },
        })
      } catch (e) {
        try { await c.end() } catch (_) {}
        res.json({ discount: null })
      }
    })

    // ── Seller Listings CRUD ───────────────────────────────────────────────────
    httpApp.get('/admin-hub/v1/seller-listings', requireSellerAuth, async (req, res) => {
      const isSuperuser = req.sellerUser?.is_superuser || false
      const sellerId = req.sellerUser?.seller_id
      const { product_id } = req.query
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      const { Client } = require('pg')
      const c = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
      try {
        await c.connect()
        let rows
        if (product_id) {
          // Superuser: all listings for the product; Seller: only their own
          if (isSuperuser) {
            const r = await c.query(`SELECT l.*, p.title AS product_title FROM admin_hub_seller_listings l LEFT JOIN admin_hub_products p ON p.id = l.product_id WHERE l.product_id = $1 ORDER BY l.created_at ASC`, [product_id])
            rows = r.rows
          } else {
            const r = await c.query(`SELECT l.*, p.title AS product_title FROM admin_hub_seller_listings l LEFT JOIN admin_hub_products p ON p.id = l.product_id WHERE l.product_id = $1 AND l.seller_id = $2`, [product_id, sellerId])
            rows = r.rows
          }
        } else {
          const r = await c.query(`SELECT l.*, p.title AS product_title FROM admin_hub_seller_listings l LEFT JOIN admin_hub_products p ON p.id = l.product_id WHERE l.seller_id = $1 ORDER BY l.created_at DESC`, [isSuperuser ? sellerId : sellerId])
          rows = r.rows
        }
        await c.end()
        res.json({ listings: rows || [] })
      } catch (e) {
        try { await c.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    })
    httpApp.put('/admin-hub/v1/seller-listings/:id', requireSellerAuth, async (req, res) => {
      const sellerId = req.sellerUser?.seller_id
      const { id } = req.params
      const { price_cents, inventory, status } = req.body || {}
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      const { Client } = require('pg')
      const c = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
      try {
        await c.connect()
        const r = await c.query(
          `UPDATE admin_hub_seller_listings SET price_cents = COALESCE($1, price_cents), inventory = COALESCE($2, inventory), status = COALESCE($3, status), updated_at = now() WHERE id = $4::uuid AND seller_id = $5 RETURNING *`,
          [price_cents != null ? Number(price_cents) : null, inventory != null ? Number(inventory) : null, status || null, id, sellerId]
        )
        await c.end()
        if (!r.rows[0]) return res.status(404).json({ message: 'Listing not found' })
        res.json({ listing: r.rows[0] })
      } catch (e) {
        try { await c.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    })

    // ── Product Change Requests ────────────────────────────────────────────────
    httpApp.get('/admin-hub/v1/product-change-requests', requireSellerAuth, async (req, res) => {
      const isSuperuser = req.sellerUser?.is_superuser || false
      const sellerId = req.sellerUser?.seller_id
      const { status: statusFilter, product_id } = req.query
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      const { Client } = require('pg')
      const c = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
      try {
        await c.connect()
        const conditions = []
        const params = []
        if (!isSuperuser) { params.push(sellerId); conditions.push(`cr.seller_id = $${params.length}`) }
        if (statusFilter) { params.push(statusFilter); conditions.push(`cr.status = $${params.length}`) }
        if (product_id) { params.push(product_id); conditions.push(`cr.product_id = $${params.length}::uuid`) }
        const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : ''
        const r = await c.query(
          `SELECT
             cr.*,
             p.title AS product_title,
             su.store_name AS seller_store_name,
             su.company_name AS seller_company_name,
             su.email AS seller_email,
             COALESCE(NULLIF(su.store_name, ''), NULLIF(su.company_name, ''), NULLIF(su.email, ''), cr.seller_id) AS seller_label
           FROM admin_hub_product_change_requests cr
           LEFT JOIN admin_hub_products p ON p.id = cr.product_id
           LEFT JOIN seller_users su ON su.seller_id = cr.seller_id AND su.sub_of_seller_id IS NULL
           ${where}
           ORDER BY cr.created_at DESC`,
          params
        )
        await c.end()
        res.json({ change_requests: r.rows || [] })
      } catch (e) {
        try { await c.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    })
    httpApp.post('/admin-hub/v1/product-change-requests', requireSellerAuth, async (req, res) => {
      const sellerId = req.sellerUser?.seller_id
      if (!sellerId) return res.status(401).json({ message: 'Unauthorized' })
      const { product_id, field_name, new_value } = req.body || {}
      if (!product_id || !field_name || new_value == null) return res.status(400).json({ message: 'product_id, field_name, new_value required' })
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      const { Client } = require('pg')
      const c = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
      try {
        await c.connect()
        const prod = await c.query('SELECT title, description, metadata FROM admin_hub_products WHERE id = $1::uuid', [product_id])
        if (!prod.rows[0]) { await c.end(); return res.status(404).json({ message: 'Product not found' }) }
        const p = prod.rows[0]
        let oldValue = null
        if (field_name === 'title') oldValue = p.title
        else if (field_name === 'description') oldValue = p.description
        else if (field_name.startsWith('metadata.')) {
          const metaKey = field_name.replace('metadata.', '')
          oldValue = p.metadata ? JSON.stringify(p.metadata[metaKey]) : null
        }
        const r = await c.query(
          `INSERT INTO admin_hub_product_change_requests (product_id, seller_id, field_name, old_value, new_value) VALUES ($1::uuid,$2,$3,$4,$5) RETURNING *`,
          [product_id, sellerId, field_name, oldValue, String(new_value)]
        )
        await c.end()
        res.status(201).json({ change_request: r.rows[0] })
      } catch (e) {
        try { await c.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    })
    httpApp.post('/admin-hub/v1/product-change-requests/:id/approve', requireSellerAuth, async (req, res) => {
      if (!req.sellerUser?.is_superuser) return res.status(403).json({ message: 'Superuser only' })
      const { id } = req.params
      const { reviewer_note } = req.body || {}
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      const { Client } = require('pg')
      const c = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
      try {
        await c.connect()
        const cr = await c.query(`SELECT * FROM admin_hub_product_change_requests WHERE id = $1::uuid AND status = 'pending'`, [id])
        if (!cr.rows[0]) { await c.end(); return res.status(404).json({ message: 'Pending request not found' }) }
        const req_row = cr.rows[0]
        // Apply change to product
        if (req_row.field_name === 'title') {
          await c.query('UPDATE admin_hub_products SET title = $1, updated_at = now() WHERE id = $2::uuid', [req_row.new_value, req_row.product_id])
        } else if (req_row.field_name === 'description') {
          await c.query('UPDATE admin_hub_products SET description = $1, updated_at = now() WHERE id = $2::uuid', [req_row.new_value, req_row.product_id])
        } else if (req_row.field_name.startsWith('metadata.')) {
          const metaKey = req_row.field_name.replace('metadata.', '')
          let parsedVal
          try { parsedVal = JSON.parse(req_row.new_value) } catch (_) { parsedVal = req_row.new_value }
          await c.query(
            `UPDATE admin_hub_products SET metadata = jsonb_set(COALESCE(metadata,'{}'), $1, $2::jsonb, true), updated_at = now() WHERE id = $3::uuid`,
            ['{' + metaKey + '}', JSON.stringify(parsedVal), req_row.product_id]
          )
        }
        await c.query(`UPDATE admin_hub_product_change_requests SET status = 'approved', reviewer_note = $1, updated_at = now() WHERE id = $2::uuid`, [reviewer_note || null, id])
        await c.end()
        res.json({ success: true })
      } catch (e) {
        try { await c.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    })
    httpApp.post('/admin-hub/v1/product-change-requests/:id/reject', requireSellerAuth, async (req, res) => {
      if (!req.sellerUser?.is_superuser) return res.status(403).json({ message: 'Superuser only' })
      const { id } = req.params
      const { reviewer_note } = req.body || {}
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      const { Client } = require('pg')
      const c = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
      try {
        await c.connect()
        await c.query(`UPDATE admin_hub_product_change_requests SET status = 'rejected', reviewer_note = $1, updated_at = now() WHERE id = $2::uuid AND status = 'pending'`, [reviewer_note || null, id])
        await c.end()
        res.json({ success: true })
      } catch (e) {
        try { await c.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    })

    // ── SELLER MANAGEMENT (superuser) ─────────────────────────────────────────
    const SELLER_SELECT = `
      id, email, store_name, seller_id, is_superuser, created_at, updated_at,
      iban, commission_rate, first_name, last_name,
      approval_status, company_name, authorized_person_name, tax_id, vat_id,
      business_address, warehouse_address, phone, website,
      documents, rejection_reason, approved_at, approved_by,
      agreement_accepted, agreement_accepted_at, agreement_version, agreement_ip
    `

    // GET /admin-hub/v1/sellers — list all sellers (superuser only)
    const adminHubSellersGET = async (req, res) => {
      if (!req.sellerUser?.is_superuser) return res.status(403).json({ message: 'Superuser access required' })
      const client = getDbClient ? getDbClient() : getSellerDbClient()
      if (!client) return res.status(503).json({ message: 'DB not configured' })
      try {
        await client.connect()
        const r = await client.query(
          `SELECT ${SELLER_SELECT} FROM seller_users WHERE sub_of_seller_id IS NULL ORDER BY created_at DESC`
        )
        // For each seller, count products and aggregate revenue
        const sellerIds = r.rows.map(s => s.seller_id).filter(Boolean)
        let productCounts = {}
        let revenueTotals = {}
        if (sellerIds.length > 0) {
          // product counts (Sellercentral ürünleri admin_hub_products'ta; eski `product` tablosu bu akışta kullanılmıyor)
          try {
            const pc = await client.query(
              `SELECT seller_id, COUNT(*)::int as cnt FROM admin_hub_products WHERE seller_id = ANY($1) GROUP BY seller_id`,
              [sellerIds]
            )
            pc.rows.forEach(row => { productCounts[row.seller_id] = parseInt(row.cnt, 10) })
          } catch (_) {}
          // revenue totals (paid orders)
          try {
            const rv = await client.query(
              `SELECT seller_id, SUM(subtotal_cents) AS total_cents, COUNT(*) AS order_cnt
               FROM store_orders WHERE seller_id = ANY($1) AND payment_status = 'bezahlt'
               GROUP BY seller_id`,
              [sellerIds]
            )
            rv.rows.forEach(row => {
              revenueTotals[row.seller_id] = {
                total_cents: parseInt(row.total_cents) || 0,
                order_count: parseInt(row.order_cnt) || 0,
              }
            })
          } catch (_) {}
        }
        await client.end()
        const sellers = r.rows.map(s => ({
          ...s,
          product_count: productCounts[s.seller_id] || 0,
          revenue_cents: revenueTotals[s.seller_id]?.total_cents || 0,
          order_count: revenueTotals[s.seller_id]?.order_count || 0,
          commission_cents: Math.round((revenueTotals[s.seller_id]?.total_cents || 0) * (parseFloat(s.commission_rate) || 0.12)),
        }))
        res.json({ sellers, count: sellers.length })
      } catch (e) {
        try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    // GET /admin-hub/v1/sellers/:id — single seller detail (superuser only)
    const adminHubSellerByIdGET = async (req, res) => {
      if (!req.sellerUser?.is_superuser) return res.status(403).json({ message: 'Superuser access required' })
      const { id } = req.params
      const client = getDbClient ? getDbClient() : getSellerDbClient()
      if (!client) return res.status(503).json({ message: 'DB not configured' })
      try {
        await client.connect()
        const r = await client.query(`SELECT ${SELLER_SELECT} FROM seller_users WHERE id = $1`, [id])
        if (!r.rows[0]) { await client.end(); return res.status(404).json({ message: 'Seller not found' }) }
        const seller = r.rows[0]
        const sellerId = seller.seller_id

        // Products by category (admin_hub_products; slug veya kategori UUID üzerinden etiket)
        let productsByCategory = []
        try {
          const pc = await client.query(
            `WITH base AS (
               SELECT id,
                 NULLIF(TRIM(COALESCE(metadata->>'category_slug', '')), '') AS slug_direct,
                 NULLIF(TRIM(COALESCE(metadata->>'admin_category_id', metadata->>'category_id', '')), '') AS cat_id_ref
               FROM admin_hub_products
               WHERE seller_id = $1
             ),
             resolved AS (
               SELECT b.id,
                 COALESCE(
                   b.slug_direct,
                   c.slug,
                   CASE WHEN b.cat_id_ref IS NOT NULL THEN b.cat_id_ref END,
                   'Unkategorisiert'
                 ) AS category
               FROM base b
               LEFT JOIN admin_hub_categories c ON c.id::text = b.cat_id_ref
             )
             SELECT category, COUNT(*)::int AS cnt
             FROM resolved
             GROUP BY category
             ORDER BY cnt DESC`,
            [sellerId]
          )
          productsByCategory = pc.rows.map((r) => ({ category: r.category, count: parseInt(r.cnt, 10) || 0 }))
        } catch (_) {}

        // Monthly revenue (last 12 months)
        let monthlyRevenue = []
        try {
          const mv = await client.query(
            `SELECT DATE_TRUNC('month', created_at) AS month, SUM(subtotal_cents) AS total_cents, COUNT(*) AS order_cnt
             FROM store_orders WHERE seller_id = $1 AND payment_status = 'bezahlt'
             AND created_at >= NOW() - INTERVAL '12 months'
             GROUP BY 1 ORDER BY 1`,
            [sellerId]
          )
          monthlyRevenue = mv.rows.map(r => ({
            month: r.month,
            total_cents: parseInt(r.total_cents) || 0,
            order_count: parseInt(r.order_cnt) || 0,
          }))
        } catch (_) {}

        // Payout summary
        let payoutSummary = { total_paid_cents: 0, total_pending_cents: 0 }
        try {
          const ps = await client.query(
            `SELECT status, SUM(payout_cents) as total FROM seller_payouts WHERE seller_id = $1 GROUP BY status`,
            [sellerId]
          )
          ps.rows.forEach(r => {
            if (r.status === 'bezahlt') payoutSummary.total_paid_cents += parseInt(r.total) || 0
            else payoutSummary.total_pending_cents += parseInt(r.total) || 0
          })
        } catch (_) {}

        // Recent payouts
        let payouts = []
        try {
          const po = await client.query(
            `SELECT * FROM seller_payouts WHERE seller_id = $1 ORDER BY period_start DESC LIMIT 12`,
            [sellerId]
          )
          payouts = po.rows
        } catch (_) {}

        await client.end()
        res.json({ seller: { ...seller, products_by_category: productsByCategory, monthly_revenue: monthlyRevenue, payout_summary: payoutSummary, payouts } })
      } catch (e) {
        try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    // PATCH /admin-hub/v1/sellers/:id — update seller fields (superuser only)
    const adminHubSellerPATCH = async (req, res) => {
      if (!req.sellerUser?.is_superuser) return res.status(403).json({ message: 'Superuser access required' })
      const { id } = req.params
      const body = req.body || {}
      const allowed = ['commission_rate', 'iban', 'store_name', 'company_name', 'tax_id', 'vat_id',
        'business_address', 'warehouse_address', 'phone', 'website', 'documents', 'rejection_reason']
      const updates = []; const params = []; let n = 1
      for (const key of allowed) {
        if (body[key] !== undefined) { updates.push(`${key} = $${n}`); params.push(body[key]); n++ }
      }
      if (updates.length === 0) return res.status(400).json({ message: 'No fields to update' })
      updates.push(`updated_at = now()`)
      params.push(id)
      const client = getDbClient ? getDbClient() : getSellerDbClient()
      if (!client) return res.status(503).json({ message: 'DB not configured' })
      try {
        await client.connect()
        const r = await client.query(`UPDATE seller_users SET ${updates.join(', ')} WHERE id = $${n} RETURNING ${SELLER_SELECT}`, params)
        await client.end()
        if (!r.rows[0]) return res.status(404).json({ message: 'Seller not found' })
        res.json({ seller: r.rows[0] })
      } catch (e) {
        try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    // PATCH /admin-hub/v1/sellers/:id/approve — approve or reject seller (superuser only)
    const adminHubSellerApprovePATCH = async (req, res) => {
      if (!req.sellerUser?.is_superuser) return res.status(403).json({ message: 'Superuser access required' })
      const { id } = req.params
      const { status, rejection_reason } = req.body || {}
      const validStatuses = ['registered', 'documents_submitted', 'pending_approval', 'approved', 'rejected', 'suspended']
      if (!validStatuses.includes(status)) return res.status(400).json({ message: `status must be one of: ${validStatuses.join(', ')}` })
      const client = getDbClient ? getDbClient() : getSellerDbClient()
      if (!client) return res.status(503).json({ message: 'DB not configured' })
      try {
        await client.connect()
        const extraSets = []
        const extraParams = []
        if (status === 'approved') {
          extraSets.push(`approved_at = now()`, `approved_by = '${req.sellerUser.seller_id}'`)
        }
        if (status === 'rejected' && rejection_reason) {
          extraSets.push(`rejection_reason = $${extraParams.length + 3}`)
          extraParams.push(rejection_reason)
        }
        const allSets = [`approval_status = $1`, `updated_at = now()`, ...extraSets].join(', ')
        const r = await client.query(
          `UPDATE seller_users SET ${allSets} WHERE id = $2 RETURNING ${SELLER_SELECT}`,
          [status, id, ...extraParams]
        )
        if (!r.rows[0]) { await client.end(); return res.status(404).json({ message: 'Seller not found' }) }
        const seller = r.rows[0]

        // If approved: publish all their draft products
        if (status === 'approved' && seller.seller_id) {
          try {
            await client.query(
              `UPDATE product SET status = 'published' WHERE seller_id = $1 AND status = 'draft'`,
              [seller.seller_id]
            )
          } catch (e2) {
            console.warn('Could not auto-publish products for seller:', e2?.message)
          }
        }
        // If rejected/suspended: unpublish their products
        if ((status === 'rejected' || status === 'suspended') && seller.seller_id) {
          try {
            await client.query(
              `UPDATE product SET status = 'draft' WHERE seller_id = $1 AND status = 'published'`,
              [seller.seller_id]
            )
          } catch (e2) {
            console.warn('Could not unpublish products for seller:', e2?.message)
          }
        }

        await client.end()
        res.json({ seller })
      } catch (e) {
        try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    // PATCH /admin-hub/v1/seller/company-info — seller updates own company info
    const adminHubSellerCompanyInfoPATCH = async (req, res) => {
      const sellerId = req.sellerUser?.seller_id
      if (!sellerId) return res.status(401).json({ message: 'Unauthorized' })
      const body = req.body || {}
      const allowed = ['company_name', 'authorized_person_name', 'tax_id', 'vat_id', 'business_address', 'warehouse_address', 'phone', 'website', 'payment_account_holder', 'payment_bic', 'payment_bank_name']
      const updates = []; const params = []; let n = 1
      const toJsonOrNull = (val) => {
        if (val === undefined) return undefined
        if (val === null) return null
        if (typeof val === 'string') return val
        try { return JSON.stringify(val) } catch (_) { return null }
      }
      for (const key of allowed) {
        if (body[key] !== undefined) {
          const isJsonField = key === 'business_address' || key === 'warehouse_address'
          const nextVal = isJsonField ? toJsonOrNull(body[key]) : body[key]
          updates.push(`${key} = $${n}`)
          params.push(nextVal)
          n++
        }
      }
      // Allow submitting documents
      if (body.documents !== undefined) {
        if (body.documents !== null && !Array.isArray(body.documents)) {
          return res.status(400).json({ message: 'documents must be an array (or null).' })
        }
        updates.push(`documents = $${n}`)
        params.push(toJsonOrNull(body.documents))
        n++
      }
      // Auto-advance status if submitting docs
      if (body.documents !== undefined) {
        updates.push(`approval_status = CASE WHEN approval_status = 'registered' THEN 'documents_submitted' ELSE approval_status END`)
      }
      if (updates.length === 0) return res.status(400).json({ message: 'No fields to update' })
      updates.push(`updated_at = now()`)
      params.push(sellerId)
      const client = getDbClient ? getDbClient() : getSellerDbClient()
      if (!client) return res.status(503).json({ message: 'DB not configured' })
      try {
        await client.connect()
        const r = await client.query(
          `UPDATE seller_users SET ${updates.join(', ')} WHERE seller_id = $${n} RETURNING ${SELLER_SELECT}`,
          params
        )
        await client.end()
        if (!r.rows[0]) return res.status(404).json({ message: 'Seller not found' })
        res.json({ seller: r.rows[0] })
      } catch (e) {
        try { await client.end() } catch (_) {}
        if (String(e?.message || '').toLowerCase().includes('invalid input syntax for type json')) {
          return res.status(400).json({ message: 'Invalid verification data format. Please check address/documents fields.' })
        }
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    httpApp.get('/admin-hub/v1/sellers', requireSellerAuth, adminHubSellersGET)
    httpApp.get('/admin-hub/v1/sellers/:id', requireSellerAuth, adminHubSellerByIdGET)
    httpApp.patch('/admin-hub/v1/sellers/:id', requireSellerAuth, adminHubSellerPATCH)
    httpApp.patch('/admin-hub/v1/sellers/:id/approve', requireSellerAuth, adminHubSellerApprovePATCH)
    httpApp.patch('/admin-hub/v1/seller/company-info', requireSellerAuth, adminHubSellerCompanyInfoPATCH)

    // ── Verification Pipeline Routes ─────────────────────────────────────────
    // Lazy-load so the pipeline module is not required until first use
    const verificationPath = path.join(__dirname, 'verification', 'pipeline.js')
    let _runPipeline = null
    const getRunPipeline = () => {
      if (!_runPipeline) {
        try { _runPipeline = require(verificationPath).runPipeline } catch (e) {
          console.error('[verification] pipeline.js not found:', e.message)
        }
      }
      return _runPipeline
    }

    /**
     * POST /admin-hub/v1/verification/start
     * Seller triggers the verification pipeline against their own profile.
     * Returns the pipeline result and saves risk_score + verification_steps to DB.
     */
    httpApp.post('/admin-hub/v1/verification/start', requireSellerAuth, async (req, res) => {
      const userId = req.sellerUser?.id
      const sellerId = req.sellerUser?.seller_id
      if (!userId) return res.status(401).json({ message: 'Unauthorized' })

      const runPipeline = getRunPipeline()
      if (!runPipeline) return res.status(503).json({ message: 'Verification pipeline not available' })

      const client = getSellerDbClient()
      if (!client) return res.status(503).json({ message: 'Database not configured' })
      try {
        await client.connect()
        // Fetch full seller profile to run the pipeline
        const sellerRes = await client.query(
          `SELECT * FROM seller_users WHERE id = $1`, [userId]
        )
        const seller = sellerRes.rows[0]
        if (!seller) { await client.end(); return res.status(404).json({ message: 'Seller not found' }) }

        // Extract client IP (respects proxy headers set by Render/Vercel)
        const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()
          || req.socket?.remoteAddress || null

        const result = await runPipeline({ seller, ip })

        // Map pipeline decision to existing approval_status values
        const statusMap = { approved: 'approved', pending_review: 'pending_approval', rejected: 'rejected' }
        const newStatus = statusMap[result.decision] || 'pending_approval'

        // Only auto-advance status if currently in early stages (don't downgrade approved sellers)
        const currentStatus = String(seller.approval_status || 'registered').toLowerCase()
        const canAutoAdvance = ['registered', 'documents_submitted', 'pending_approval'].includes(currentStatus)

        const updates = [
          `risk_score = $1`,
          `verification_steps = $2`,
          `verification_started_at = COALESCE(verification_started_at, now())`,
          `updated_at = now()`,
        ]
        const params = [result.score, JSON.stringify(result.steps)]

        if (canAutoAdvance) {
          updates.push(`approval_status = $3`)
          params.push(newStatus)
          params.push(userId)
          updates.push(`updated_at = now()`)
        } else {
          params.push(userId)
        }

        await client.query(
          `UPDATE seller_users SET ${updates.join(', ')} WHERE id = $${params.length}`,
          params
        )
        await client.end()

        // Insert notification for superusers
        try {
          const notifClient = getProductsDbClient()
          if (notifClient) {
            await notifClient.connect()
            const storeName = seller.store_name || seller.email || sellerId || 'Bir satıcı'
            await notifClient.query(
              `INSERT INTO admin_hub_notifications (type, title, body, seller_id, reference_id)
               VALUES ('verification_submitted', $1, $2, $3, $4)`,
              [
                `${storeName} — Evrak Gönderildi`,
                `${storeName} doğrulama evraklarını gönderdi. Lütfen inceleyiniz.`,
                sellerId || null,
                userId,
              ]
            )
            await notifClient.end()
          }
        } catch (_) {}

        res.json({
          score: result.score,
          decision: result.decision,
          approval_status: canAutoAdvance ? newStatus : currentStatus,
          steps: result.steps,
          ran_at: result.ran_at,
        })
      } catch (e) {
        try { await client.end() } catch (_) {}
        console.error('[verification/start]', e.message)
        res.status(500).json({ message: e?.message || 'Verification failed' })
      }
    })

    /**
     * GET /admin-hub/v1/verification/status
     * Returns current verification state for the logged-in seller.
     * Accessible by the seller themselves OR superusers (with ?seller_id=).
     */
    httpApp.get('/admin-hub/v1/verification/status', requireSellerAuth, async (req, res) => {
      const isSuperuser = req.sellerUser?.is_superuser
      const targetSellerId = isSuperuser && req.query.seller_id
        ? req.query.seller_id
        : req.sellerUser?.id

      const client = getSellerDbClient()
      if (!client) return res.status(503).json({ message: 'Database not configured' })
      try {
        await client.connect()
        const r = await client.query(
          `SELECT id, email, store_name, seller_id, approval_status,
                  risk_score, verification_steps, verification_started_at,
                  company_name, authorized_person_name, tax_id, vat_id,
                  phone, business_address, documents,
                  agreement_accepted, agreement_accepted_at, agreement_version
           FROM seller_users WHERE ${isSuperuser && req.query.seller_id ? 'seller_id' : 'id'} = $1`,
          [targetSellerId]
        )
        await client.end()
        const row = r.rows[0]
        if (!row) return res.status(404).json({ message: 'Seller not found' })

        res.json({
          seller_id: row.seller_id,
          approval_status: row.approval_status || 'registered',
          risk_score: row.risk_score,
          verification_steps: row.verification_steps || [],
          verification_started_at: row.verification_started_at,
          profile_completeness: {
            company_name: !!row.company_name,
            authorized_person: !!row.authorized_person_name,
            tax_id: !!row.tax_id,
            vat_id: !!row.vat_id,
            phone: !!row.phone,
            address: !!(row.business_address?.street || row.business_address?.city),
            documents_count: Array.isArray(row.documents) ? row.documents.length : 0,
            agreement_accepted: !!row.agreement_accepted,
          },
        })
      } catch (e) {
        try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    })

    /**
     * POST /admin-hub/v1/verification/review
     * Superuser manually overrides the pipeline decision.
     * Body: { seller_id, action: 'approve'|'reject'|'flag', note? }
     */
    httpApp.post('/admin-hub/v1/verification/review', requireSellerAuth, async (req, res) => {
      if (!req.sellerUser?.is_superuser) return res.status(403).json({ message: 'Superuser access required' })
      const { seller_id, action, note } = req.body || {}
      if (!seller_id || !action) return res.status(400).json({ message: 'seller_id and action are required' })

      const actionStatusMap = { approve: 'approved', reject: 'rejected', flag: 'pending_approval', suspend: 'suspended' }
      const newStatus = actionStatusMap[action]
      if (!newStatus) return res.status(400).json({ message: `action must be one of: ${Object.keys(actionStatusMap).join(', ')}` })

      const client = getSellerDbClient()
      if (!client) return res.status(503).json({ message: 'Database not configured' })
      try {
        await client.connect()
        const r = await client.query(
          `UPDATE seller_users
           SET approval_status = $1,
               rejection_reason = CASE WHEN $1 = 'rejected' THEN $2 ELSE rejection_reason END,
               approved_at = CASE WHEN $1 = 'approved' THEN now() ELSE approved_at END,
               approved_by = CASE WHEN $1 = 'approved' THEN $3 ELSE approved_by END,
               updated_at = now()
           WHERE seller_id = $4
           RETURNING id, seller_id, approval_status, rejection_reason, approved_at`,
          [newStatus, note || null, req.sellerUser?.email || 'superuser', seller_id]
        )
        await client.end()
        if (!r.rows[0]) return res.status(404).json({ message: 'Seller not found' })

        // Sync product publish status (reuse existing logic pattern)
        if (newStatus === 'approved') {
          const prodClient = getSellerDbClient()
          if (prodClient) {
            prodClient.connect()
              .then(() => prodClient.query(`UPDATE admin_hub_products SET status = 'published' WHERE seller_id = $1 AND status = 'draft'`, [seller_id]))
              .then(() => prodClient.end())
              .catch(() => {})
          }
        } else if (newStatus === 'rejected' || newStatus === 'suspended') {
          const prodClient = getSellerDbClient()
          if (prodClient) {
            prodClient.connect()
              .then(() => prodClient.query(`UPDATE admin_hub_products SET status = 'draft' WHERE seller_id = $1 AND status = 'published'`, [seller_id]))
              .then(() => prodClient.end())
              .catch(() => {})
          }
        }

        res.json({ success: true, seller: r.rows[0] })
      } catch (e) {
        try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    })
    // ── End Verification Pipeline Routes ────────────────────────────────────

    // ── Stripe Connect Routes ────────────────────────────────────────────────
    const SELLERCENTRAL_URL = (process.env.SELLERCENTRAL_URL || 'http://localhost:3002').replace(/\/$/, '')

    // Helper: load platform checkout row using a fresh DB connection
    const loadPlatformCheckoutRowFresh = async () => {
      const c = getSellerDbClient()
      if (!c) return null
      try {
        await c.connect()
        const row = await loadPlatformCheckoutRow(c)
        await c.end()
        return row
      } catch (_) {
        try { await c.end() } catch (_2) {}
        return null
      }
    }

    /**
     * POST /admin-hub/v1/stripe-connect/onboard
     * Creates (or reuses) a Stripe Express account for the seller and returns
     * an Account Link URL they must visit to complete Stripe's own KYC.
     */
    httpApp.post('/admin-hub/v1/stripe-connect/onboard', requireSellerAuth, async (req, res) => {
      const userId = req.sellerUser?.id
      const sellerId = req.sellerUser?.seller_id
      const email = req.sellerUser?.email
      if (!userId) return res.status(401).json({ message: 'Unauthorized' })

      const platformRow = await loadPlatformCheckoutRowFresh()
      const secretKey = resolveStripeSecretKeyFromPlatform(platformRow)
      if (!secretKey) return res.status(503).json({ message: 'Stripe nicht konfiguriert — Sellercentral → Einstellungen → Checkout (Secret Key in DB).' })

      const stripe = new (require('stripe'))(secretKey)
      const client = getSellerDbClient()
      if (!client) return res.status(503).json({ message: 'Database not configured' })
      try {
        await client.connect()
        const sellerRes = await client.query(
          `SELECT stripe_account_id, stripe_onboarding_complete FROM seller_users WHERE id = $1`, [userId]
        )
        let stripeAccountId = sellerRes.rows?.[0]?.stripe_account_id || null

        // Create Express account if not yet created
        if (!stripeAccountId) {
          const account = await stripe.accounts.create({
            type: 'express',
            email,
            capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
            settings: { payouts: { schedule: { interval: 'manual' } } },
            metadata: { seller_id: sellerId, seller_user_id: userId },
          })
          stripeAccountId = account.id
          await client.query(
            `UPDATE seller_users SET stripe_account_id = $1, updated_at = now() WHERE id = $2`,
            [stripeAccountId, userId]
          )
        }

        // Create (or refresh) an Account Link for onboarding
        const accountLink = await stripe.accountLinks.create({
          account: stripeAccountId,
          refresh_url: `${SELLERCENTRAL_URL}/en/settings/stripe-connect?refresh=true`,
          return_url: `${SELLERCENTRAL_URL}/en/settings/stripe-connect?connected=true`,
          type: 'account_onboarding',
        })

        await client.end()
        res.json({ url: accountLink.url, stripe_account_id: stripeAccountId })
      } catch (e) {
        try { await client.end() } catch (_) {}
        console.error('[stripe-connect/onboard]', e.message)
        res.status(500).json({ message: e.message || 'Stripe Connect onboarding failed' })
      }
    })

    /**
     * GET /admin-hub/v1/stripe-connect/status
     * Returns current Connect status for the logged-in seller.
     * Also syncs onboarding_complete from Stripe if account exists.
     */
    httpApp.get('/admin-hub/v1/stripe-connect/status', requireSellerAuth, async (req, res) => {
      const userId = req.sellerUser?.id
      if (!userId) return res.status(401).json({ message: 'Unauthorized' })

      const client = getSellerDbClient()
      if (!client) return res.status(503).json({ message: 'Database not configured' })
      try {
        await client.connect()
        const sellerRes = await client.query(
          `SELECT stripe_account_id, stripe_onboarding_complete, commission_rate FROM seller_users WHERE id = $1`, [userId]
        )
        const row = sellerRes.rows?.[0] || {}
        let onboardingComplete = row.stripe_onboarding_complete || false
        const stripeAccountId = row.stripe_account_id || null

        let payoutBank = null
        // Sync from Stripe if account exists (and also expose payout destination summary)
        if (stripeAccountId && !onboardingComplete) {
          try {
            const platformRow = await loadPlatformCheckoutRowFresh()
            const secretKey = resolveStripeSecretKeyFromPlatform(platformRow)
            if (secretKey) {
              const stripe = new (require('stripe'))(secretKey)
              const account = await stripe.accounts.retrieve(stripeAccountId)
              onboardingComplete = account.details_submitted && account.charges_enabled
              // Ensure manual payout schedule (idempotent — safe to call multiple times)
              if (onboardingComplete) {
                try {
                  await stripe.accounts.update(stripeAccountId, { settings: { payouts: { schedule: { interval: 'manual' } } } })
                } catch (_) {}
              }
              try {
                const ext = await stripe.accounts.listExternalAccounts(stripeAccountId, { object: 'bank_account', limit: 1 })
                const bank = ext?.data?.[0]
                if (bank) {
                  payoutBank = {
                    bank_name: bank.bank_name || null,
                    country: bank.country || null,
                    currency: bank.currency || null,
                    last4: bank.last4 || null,
                    holder_name: bank.account_holder_name || null,
                    status: bank.status || null,
                  }
                }
              } catch (_) {}
              if (onboardingComplete) {
                await client.query(
                  `UPDATE seller_users SET stripe_onboarding_complete = true, updated_at = now() WHERE id = $1`, [userId]
                )
              }
            }
          } catch (_) {}
        } else if (stripeAccountId) {
          try {
            const platformRow = await loadPlatformCheckoutRowFresh()
            const secretKey = resolveStripeSecretKeyFromPlatform(platformRow)
            if (secretKey) {
              const stripe = new (require('stripe'))(secretKey)
              const ext = await stripe.accounts.listExternalAccounts(stripeAccountId, { object: 'bank_account', limit: 1 })
              const bank = ext?.data?.[0]
              if (bank) {
                payoutBank = {
                  bank_name: bank.bank_name || null,
                  country: bank.country || null,
                  currency: bank.currency || null,
                  last4: bank.last4 || null,
                  holder_name: bank.account_holder_name || null,
                  status: bank.status || null,
                }
              }
            }
          } catch (_) {}
        }

        await client.end()
        res.json({
          connected: !!stripeAccountId,
          onboarding_complete: onboardingComplete,
          stripe_account_id: stripeAccountId,
          commission_rate: Number(row.commission_rate ?? 0.12),
          payout_bank: payoutBank,
        })
      } catch (e) {
        try { await client.end() } catch (_) {}
        res.status(500).json({ message: e.message || 'Error' })
      }
    })

    /**
     * GET /admin-hub/v1/stripe-connect/dashboard-link
     * Returns a one-time Stripe Express dashboard URL so sellers can check their balance/payouts.
     */
    httpApp.get('/admin-hub/v1/stripe-connect/dashboard-link', requireSellerAuth, async (req, res) => {
      const userId = req.sellerUser?.id
      if (!userId) return res.status(401).json({ message: 'Unauthorized' })

      const client = getSellerDbClient()
      if (!client) return res.status(503).json({ message: 'Database not configured' })
      try {
        await client.connect()
        const sellerRes = await client.query(`SELECT stripe_account_id FROM seller_users WHERE id = $1`, [userId])
        const stripeAccountId = sellerRes.rows?.[0]?.stripe_account_id
        await client.end()

        if (!stripeAccountId) return res.status(404).json({ message: 'No Stripe account connected yet.' })

        const platformRow = await loadPlatformCheckoutRowFresh()
        const secretKey = resolveStripeSecretKeyFromPlatform(platformRow)
        if (!secretKey) return res.status(503).json({ message: 'Stripe not configured' })

        const stripe = new (require('stripe'))(secretKey)
        const loginLink = await stripe.accounts.createLoginLink(stripeAccountId)
        res.json({ url: loginLink.url })
      } catch (e) {
        try { await client.end() } catch (_) {}
        res.status(500).json({ message: e.message || 'Error' })
      }
    })

    /**
     * POST /admin-hub/v1/stripe-connect/disconnect
     * Superuser only — removes Connect linkage from a seller (does NOT delete Stripe account).
     */
    httpApp.post('/admin-hub/v1/stripe-connect/disconnect', requireSellerAuth, async (req, res) => {
      if (!req.sellerUser?.is_superuser) return res.status(403).json({ message: 'Superuser access required' })
      const { seller_id } = req.body || {}
      if (!seller_id) return res.status(400).json({ message: 'seller_id required' })
      const client = getSellerDbClient()
      if (!client) return res.status(503).json({ message: 'Database not configured' })
      try {
        await client.connect()
        await client.query(
          `UPDATE seller_users SET stripe_account_id = NULL, stripe_onboarding_complete = false, updated_at = now() WHERE seller_id = $1`,
          [seller_id]
        )
        await client.end()
        res.json({ success: true })
      } catch (e) {
        try { await client.end() } catch (_) {}
        res.status(500).json({ message: e.message || 'Error' })
      }
    })
    /**
     * POST /admin-hub/v1/stripe-connect/transfer/:orderId
     * Superuser — manually release funds for a specific order, bypassing the 14-day window.
     * Handles both models:
     *  - Destination charge (new): creates a payout from the connected account
     *  - Legacy transfer: creates a platform→seller transfer via source_transaction
     */
    httpApp.post('/admin-hub/v1/stripe-connect/transfer/:orderId', requireSellerAuth, requireSuperuser, async (req, res) => {
      const orderId = (req.params.orderId || '').trim()
      if (!orderId) return res.status(400).json({ message: 'orderId required' })

      const platformRow = await loadPlatformCheckoutRowFresh()
      const secretKey = resolveStripeSecretKeyFromPlatform(platformRow)
      if (!secretKey) return res.status(503).json({ message: 'Stripe not configured' })

      const { Client } = require('pg')
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      const client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
      try {
        await client.connect()
        const oRes = await client.query(
          `SELECT id, order_number, seller_id, payment_intent_id, subtotal_cents, total_cents, cart_id,
                  stripe_transfer_status, stripe_payout_status, stripe_account_id, stripe_application_fee_cents
           FROM store_orders WHERE id = $1::uuid`,
          [orderId]
        )
        const order = oRes.rows[0]
        if (!order) { await client.end(); return res.status(404).json({ message: 'Order not found' }) }
        if (order.stripe_payout_status === 'paid') { await client.end(); return res.status(400).json({ message: 'Payout already completed' }) }
        if (order.stripe_transfer_status === 'completed') { await client.end(); return res.status(400).json({ message: 'Transfer already completed' }) }

        const stripe = new (require('stripe'))(secretKey)

        if (order.stripe_account_id) {
          // ── Destination charge model: create payout on connected account ───
          const totalCents = Number(order.total_cents || 0)
          const feeCents = Number(order.stripe_application_fee_cents || Math.round(totalCents * 0.12))
          const payoutAmount = totalCents - feeCents
          if (payoutAmount <= 0) { await client.end(); return res.status(400).json({ message: 'Payout amount <= 0' }) }

          const payout = await stripe.payouts.create(
            {
              amount: payoutAmount,
              currency: 'eur',
              description: `Manual release — Order #${order.order_number || ''}`,
              metadata: { order_id: orderId, order_number: String(order.order_number || ''), seller_id: order.seller_id, manual: 'true' },
            },
            { stripeAccount: order.stripe_account_id }
          )
          await client.query(
            `UPDATE store_orders SET stripe_payout_status='paid', stripe_payout_id=$2, updated_at=now() WHERE id=$1::uuid`,
            [orderId, payout.id]
          )
          await client.end()
          res.json({ success: true, model: 'payout', payout_id: payout.id, amount: payoutAmount })

        } else {
          // ── Legacy model: platform → seller transfer ───────────────────────
          if (!order.payment_intent_id) { await client.end(); return res.status(400).json({ message: 'No payment intent on order' }) }

          const sRes = await client.query(
            `SELECT stripe_account_id, stripe_onboarding_complete, commission_rate FROM seller_users WHERE seller_id = $1`,
            [order.seller_id]
          )
          const seller = sRes.rows[0]
          if (!seller?.stripe_account_id || !seller?.stripe_onboarding_complete) {
            await client.end()
            return res.status(400).json({ message: 'Seller Stripe onboarding incomplete' })
          }

          const pi = await stripe.paymentIntents.retrieve(String(order.payment_intent_id), { expand: ['latest_charge'] })
          const chargeId = typeof pi.latest_charge === 'object' ? pi.latest_charge?.id : pi.latest_charge
          if (!chargeId) { await client.end(); return res.status(400).json({ message: 'No charge on payment intent' }) }

          const commRate = Number(seller.commission_rate ?? 0.12)
          const transferAmount = Math.floor(Number(order.subtotal_cents || 0) * (1 - commRate))
          if (transferAmount <= 0) { await client.end(); return res.status(400).json({ message: 'Transfer amount <= 0' }) }

          const sellerDisplay = await resolveSellerDisplayNameForStripe(client, order.seller_id)
          const tr = await stripe.transfers.create({
            amount: transferAmount,
            currency: 'eur',
            destination: seller.stripe_account_id,
            source_transaction: chargeId,
            transfer_group: `cart_${order.cart_id || ''}`,
            description: `Manual: Order #${order.order_number || ''} — ${truncateForStripeDescription(sellerDisplay) || order.seller_id}`,
            metadata: { order_id: orderId, order_number: String(order.order_number || ''), seller_id: order.seller_id, manual: 'true' },
          })
          await client.query(
            `UPDATE store_orders SET stripe_transfer_status='completed', stripe_transfer_id=$2, stripe_transfer_error=NULL, stripe_transfer_at=now(), updated_at=now() WHERE id=$1::uuid`,
            [orderId, tr.id]
          )
          await client.end()
          res.json({ success: true, model: 'transfer', transfer_id: tr.id, amount: transferAmount })
        }
      } catch (e) {
        try { await client.end() } catch (_) {}
        res.status(500).json({ message: e.message || 'Payout/transfer failed' })
      }
    })
    // ── End Stripe Connect Routes ────────────────────────────────────────────

    // ── Stripe Webhook ───────────────────────────────────────────────────────
    // req.rawBody is the raw Buffer preserved by the express.json() verify callback above.
    // constructEvent MUST receive the raw bytes — parsing to JSON breaks the signature.
    httpApp.post('/webhook/stripe', async (req, res) => {
      const sig = req.headers['stripe-signature']
      const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
      if (!webhookSecret) return res.status(400).json({ message: 'STRIPE_WEBHOOK_SECRET not configured' })

      const rawBody = req.rawBody
      if (!rawBody) return res.status(400).json({ message: 'Raw body missing — verify callback not running' })

      const platformRow = await loadPlatformCheckoutRowFresh()
      const secretKey = resolveStripeSecretKeyFromPlatform(platformRow)
      if (!secretKey) return res.status(400).json({ message: 'Stripe not configured' })

      let event
      try {
        const stripe = new (require('stripe'))(secretKey)
        event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret)
      } catch (err) {
        console.error('[webhook/stripe] Signature verification failed:', err.message)
        return res.status(400).json({ message: `Webhook signature invalid: ${err.message}` })
      }

      // Acknowledge immediately — Stripe retries if it doesn't get 2xx within 30s
      res.json({ received: true })

      setImmediate(async () => {
        const stripe = new (require('stripe'))(secretKey)
        const { Client } = require('pg')
        const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
        const mkClient = () => new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })

        // ── payment_intent.succeeded ──────────────────────────────────────────
        if (event.type === 'payment_intent.succeeded') {
          const pi = event.data.object
          const client = mkClient()
          try {
            await client.connect()
            // For destination charges: ensure stripe_payout_status = 'pending' (idempotent)
            await client.query(
              `UPDATE store_orders
               SET stripe_payout_status = COALESCE(stripe_payout_status, 'pending'),
                   updated_at = now()
               WHERE payment_intent_id = $1
                 AND stripe_account_id IS NOT NULL
                 AND stripe_payout_status IS NULL`,
              [pi.id]
            )
            // For legacy transfer orders: ensure stripe_transfer_status is initialised
            await client.query(
              `UPDATE store_orders
               SET stripe_transfer_status = COALESCE(stripe_transfer_status, 'pending'),
                   updated_at = now()
               WHERE payment_intent_id = $1
                 AND stripe_account_id IS NULL
                 AND (stripe_transfer_status IS NULL OR stripe_transfer_status = 'legacy_skipped')`,
              [pi.id]
            )
            await client.end()
          } catch (e) {
            try { await client.end() } catch (_) {}
            console.error('[webhook/stripe] payment_intent.succeeded error:', e.message)
          }
        }

        // ── charge.refunded ───────────────────────────────────────────────────
        else if (event.type === 'charge.refunded') {
          const charge = event.data.object
          const paymentIntentId = charge.payment_intent
          if (!paymentIntentId) return

          const client = mkClient()
          try {
            await client.connect()
            const oRes = await client.query(
              `SELECT id, order_number, stripe_account_id, stripe_payout_status,
                      stripe_transfer_id, stripe_transfer_status
               FROM store_orders WHERE payment_intent_id = $1 LIMIT 1`,
              [paymentIntentId]
            )
            const order = oRes.rows[0]
            if (!order) { await client.end(); return }

            if (order.stripe_account_id) {
              // Destination charge model: mark payout status
              const newStatus = order.stripe_payout_status === 'paid' ? 'refunded_post_payout' : 'refunded'
              await client.query(
                `UPDATE store_orders SET stripe_payout_status = $2, updated_at = now() WHERE id = $1::uuid`,
                [order.id, newStatus]
              )
              if (newStatus === 'refunded_post_payout') {
                console.warn(`[webhook/stripe] Post-payout refund on order #${order.order_number} — manual recovery may be needed`)
              }
            } else if (order.stripe_transfer_id && order.stripe_transfer_status === 'completed') {
              // Legacy transfer model: reverse the transfer
              try {
                const reversal = await stripe.transfers.createReversal(order.stripe_transfer_id, {
                  description: `Refund — order #${order.order_number || order.id}`,
                  metadata: { order_id: order.id, order_number: String(order.order_number || '') },
                })
                await client.query(
                  `UPDATE store_orders SET stripe_transfer_status = 'reversed', stripe_transfer_error = $2, updated_at = now() WHERE id = $1::uuid`,
                  [order.id, `Reversed: ${reversal.id}`]
                )
                console.log(`[webhook/stripe] Transfer reversed for order #${order.order_number}: ${reversal.id}`)
              } catch (re) {
                console.error('[webhook/stripe] Transfer reversal failed:', re.message)
              }
            }
            await client.end()
          } catch (e) {
            try { await client.end() } catch (_) {}
            console.error('[webhook/stripe] charge.refunded error:', e.message)
          }
        }

        // ── payout.paid ───────────────────────────────────────────────────────
        // Fires on the CONNECTED ACCOUNT (account: acct_xxx in event.account), not the platform.
        // Stripe delivers it to the platform webhook if you have Connect webhooks enabled.
        else if (event.type === 'payout.paid') {
          const payout = event.data.object
          const payoutId = payout.id
          const client = mkClient()
          try {
            await client.connect()
            await client.query(
              `UPDATE store_orders
               SET stripe_payout_status = 'paid',
                   stripe_payout_id = $2,
                   updated_at = now()
               WHERE stripe_payout_id = $2 AND stripe_payout_status != 'paid'`,
              [payoutId, payoutId]
            )
            await client.end()
          } catch (e) {
            try { await client.end() } catch (_) {}
            console.error('[webhook/stripe] payout.paid error:', e.message)
          }
        }

        // ── payout.failed ─────────────────────────────────────────────────────
        else if (event.type === 'payout.failed') {
          const payout = event.data.object
          const payoutId = payout.id
          const client = mkClient()
          try {
            await client.connect()
            await client.query(
              `UPDATE store_orders
               SET stripe_payout_status = 'failed',
                   updated_at = now()
               WHERE stripe_payout_id = $1 AND stripe_payout_status NOT IN ('paid', 'refunded')`,
              [payoutId]
            )
            await client.end()
            console.warn(`[webhook/stripe] Payout failed: ${payoutId}`)
          } catch (e) {
            try { await client.end() } catch (_) {}
            console.error('[webhook/stripe] payout.failed error:', e.message)
          }
        }
      })
    })
    // ── End Stripe Webhook ───────────────────────────────────────────────────

    // ── Ranking API ─────────────────────────────────────────────────────────

    // Core compute function — re-usable, called by scheduler + manual trigger
    async function computeRankingFeatures() {
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      const { Client } = require('pg')
      const client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
      try {
        await client.connect()
        const now = new Date()

        // 1. Aggregate raw signals from orders + events
        await client.query(`
          INSERT INTO product_ranking_features (
            product_id, seller_id, collection_id,
            sales_7d, sales_30d, sales_90d, gmv_30d_cents,
            impressions_30d, clicks_30d, add_to_cart_30d,
            review_avg, review_count, return_count_30d,
            price_cents, compare_at_price_cents, discount_pct,
            inventory, content_score, published_at,
            updated_at
          )
          SELECT
            p.id::text AS product_id,
            p.seller_id,
            p.collection_id::text,
            COALESCE(s7.cnt, 0) AS sales_7d,
            COALESCE(s30.cnt, 0) AS sales_30d,
            COALESCE(s90.cnt, 0) AS sales_90d,
            COALESCE(s30.gmv, 0) AS gmv_30d_cents,
            COALESCE(ev_imp.cnt, 0) AS impressions_30d,
            COALESCE(ev_clk.cnt, 0) AS clicks_30d,
            COALESCE(ev_atc.cnt, 0) AS add_to_cart_30d,
            COALESCE(rv.avg_rating, 0) AS review_avg,
            COALESCE(rv.cnt, 0) AS review_count,
            COALESCE(ret30.cnt, 0) AS return_count_30d,
            COALESCE(p.price_cents, 0) AS price_cents,
            COALESCE((p.metadata->>'compare_at_price_cents')::int, 0) AS compare_at_price_cents,
            CASE
              WHEN COALESCE((p.metadata->>'compare_at_price_cents')::int, 0) > COALESCE(p.price_cents, 0)
              THEN ROUND(((COALESCE((p.metadata->>'compare_at_price_cents')::int, 0) - COALESCE(p.price_cents, 0))::numeric
                   / NULLIF((p.metadata->>'compare_at_price_cents')::int, 0)::numeric) * 100, 2)
              ELSE 0
            END AS discount_pct,
            COALESCE(p.inventory, 0) AS inventory,
            -- Content score: title(0.25) + description(0.25) + price(0.25) + image(0.25)
            (
              CASE WHEN p.title IS NOT NULL AND p.title != '' THEN 0.25 ELSE 0 END +
              CASE WHEN p.description IS NOT NULL AND LENGTH(p.description) > 20 THEN 0.25 ELSE 0 END +
              CASE WHEN COALESCE(p.price_cents, 0) > 0 THEN 0.25 ELSE 0 END +
              CASE WHEN p.metadata->>'images' IS NOT NULL OR p.metadata->>'thumbnail' IS NOT NULL THEN 0.25 ELSE 0 END
            ) AS content_score,
            p.created_at AS published_at,
            NOW() AS updated_at
          FROM admin_hub_products p
          LEFT JOIN LATERAL (
            SELECT SUM(oi.quantity)::int AS cnt
            FROM store_order_items oi
            JOIN store_orders o ON o.id = oi.order_id
            WHERE oi.product_id = p.id::text
              AND o.created_at >= NOW() - INTERVAL '7 days'
              AND o.order_status NOT IN ('cancelled')
          ) s7 ON true
          LEFT JOIN LATERAL (
            SELECT SUM(oi.quantity)::int AS cnt, SUM(oi.quantity * oi.unit_price_cents)::bigint AS gmv
            FROM store_order_items oi
            JOIN store_orders o ON o.id = oi.order_id
            WHERE oi.product_id = p.id::text
              AND o.created_at >= NOW() - INTERVAL '30 days'
              AND o.order_status NOT IN ('cancelled')
          ) s30 ON true
          LEFT JOIN LATERAL (
            SELECT SUM(oi.quantity)::int AS cnt
            FROM store_order_items oi
            JOIN store_orders o ON o.id = oi.order_id
            WHERE oi.product_id = p.id::text
              AND o.created_at >= NOW() - INTERVAL '90 days'
              AND o.order_status NOT IN ('cancelled')
          ) s90 ON true
          LEFT JOIN LATERAL (
            SELECT COUNT(*)::int AS cnt FROM product_events
            WHERE product_id = p.id::text AND event_type = 'impression'
              AND created_at >= NOW() - INTERVAL '30 days'
          ) ev_imp ON true
          LEFT JOIN LATERAL (
            SELECT COUNT(*)::int AS cnt FROM product_events
            WHERE product_id = p.id::text AND event_type = 'click'
              AND created_at >= NOW() - INTERVAL '30 days'
          ) ev_clk ON true
          LEFT JOIN LATERAL (
            SELECT COUNT(*)::int AS cnt FROM product_events
            WHERE product_id = p.id::text AND event_type = 'add_to_cart'
              AND created_at >= NOW() - INTERVAL '30 days'
          ) ev_atc ON true
          LEFT JOIN LATERAL (
            SELECT ROUND(AVG(rating)::numeric, 2) AS avg_rating, COUNT(*)::int AS cnt
            FROM store_product_reviews WHERE product_id = p.id::text
          ) rv ON true
          LEFT JOIN LATERAL (
            SELECT COUNT(*)::int AS cnt
            FROM store_returns sr
            JOIN store_order_items oi ON oi.order_id = sr.order_id
            WHERE oi.product_id = p.id::text
              AND sr.created_at >= NOW() - INTERVAL '30 days'
          ) ret30 ON true
          WHERE p.status = 'published'
          ON CONFLICT (product_id) DO UPDATE SET
            seller_id           = EXCLUDED.seller_id,
            collection_id       = EXCLUDED.collection_id,
            sales_7d            = EXCLUDED.sales_7d,
            sales_30d           = EXCLUDED.sales_30d,
            sales_90d           = EXCLUDED.sales_90d,
            gmv_30d_cents       = EXCLUDED.gmv_30d_cents,
            impressions_30d     = EXCLUDED.impressions_30d,
            clicks_30d          = EXCLUDED.clicks_30d,
            add_to_cart_30d     = EXCLUDED.add_to_cart_30d,
            review_avg          = EXCLUDED.review_avg,
            review_count        = EXCLUDED.review_count,
            return_count_30d    = EXCLUDED.return_count_30d,
            price_cents         = EXCLUDED.price_cents,
            compare_at_price_cents = EXCLUDED.compare_at_price_cents,
            discount_pct        = EXCLUDED.discount_pct,
            inventory           = EXCLUDED.inventory,
            content_score       = EXCLUDED.content_score,
            published_at        = EXCLUDED.published_at,
            updated_at          = EXCLUDED.updated_at
        `)

        // 2. Normalize signals and compute scores
        // Get max values for normalization
        const maxR = await client.query(`
          SELECT
            GREATEST(MAX(sales_30d), 1)   AS max_sales,
            GREATEST(MAX(gmv_30d_cents), 1) AS max_gmv,
            GREATEST(MAX(clicks_30d), 1)  AS max_clicks,
            GREATEST(MAX(review_avg * LN(1 + review_count)), 0.001) AS max_review,
            GREATEST(MAX(sales_7d), 1)    AS max_sales_7d
          FROM product_ranking_features
        `)
        const mx = maxR.rows[0]

        await client.query(`
          UPDATE product_ranking_features SET
            -- CTR (avoid div/0)
            ctr_30d = CASE WHEN impressions_30d > 0 THEN ROUND((clicks_30d::numeric / impressions_30d), 4) ELSE 0 END,
            -- Popularity: weighted combination of normalized signals
            popularity_score = ROUND((
              0.40 * (LN(1 + sales_30d) / LN(1 + $1)) +
              0.30 * (LN(1 + gmv_30d_cents) / LN(1 + $2)) +
              0.20 * (LN(1 + clicks_30d) / LN(1 + $3)) +
              0.10 * (review_avg * LN(1 + review_count) / $4)
            )::numeric, 6),
            -- Freshness: exponential decay, half-life = 30d (overridden per strategy at query time)
            freshness_score = ROUND(EXP(-0.693 * GREATEST(0, EXTRACT(EPOCH FROM (NOW() - published_at)) / 86400) / 30.0)::numeric, 6),
            -- Velocity: recent 7d acceleration vs 30d baseline (trend signal)
            velocity_score = ROUND(CASE
              WHEN sales_30d > 0 THEN LEAST((sales_7d::numeric / sales_30d) / (7.0/30.0), 3.0) / 3.0
              WHEN sales_7d > 0 THEN 1.0
              ELSE 0.0
            END::numeric, 6),
            updated_at = NOW()
          WHERE true
        `, [mx.max_sales, mx.max_gmv, mx.max_clicks, mx.max_review])

        await client.end()
        log.info('[Ranking] Features computed for', (await (async () => {
          const c2 = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
          await c2.connect()
          const r = await c2.query('SELECT COUNT(*) FROM product_ranking_features')
          await c2.end()
          return r.rows[0].count
        })()), 'products at', new Date().toISOString())
      } catch (e) {
        console.error('[Ranking] Compute error:', e.message)
        try { await client.end() } catch (_) {}
      }
    }

    // GET /store/products/ranked — used by storefront to get sorted product IDs
    const storeProductsRankedGET = async (req, res) => {
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        const strategy = (req.query.strategy || 'default').replace(/[^a-z_]/g, '')
        const category_id = req.query.category_id || null
        const seller_id = req.query.seller_id || null
        const limit = Math.min(parseInt(req.query.limit) || 50, 200)
        const offset = parseInt(req.query.offset) || 0

        // Load strategy config
        const cfgR = await client.query(`SELECT config FROM ranking_config WHERE strategy = $1`, [strategy])
        const cfg = cfgR.rows[0]?.config || {}
        const w_pop     = parseFloat(cfg.w_popularity  ?? 0.45)
        const w_fresh   = parseFloat(cfg.w_freshness   ?? 0.15)
        const w_content = parseFloat(cfg.w_content     ?? 0.10)
        const w_disc    = parseFloat(cfg.w_discount    ?? 0.15)
        const w_seller  = parseFloat(cfg.w_seller      ?? 0.10)
        const w_vel     = parseFloat(cfg.w_velocity    ?? 0.05)
        const hl        = parseFloat(cfg.freshness_halflife_days ?? 30)
        const expl_k    = parseFloat(cfg.exploration_k ?? 0.25)
        const urgency_t = parseInt(cfg.urgency_threshold ?? 5)
        const diversity = parseInt(cfg.diversity_max_consecutive ?? 3)

        // Seller performance index (avg rating across their products)
        const sellerPerfR = await client.query(`
          SELECT seller_id,
            ROUND(AVG(review_avg) / 5.0, 4) AS perf
          FROM product_ranking_features
          WHERE review_count > 0
          GROUP BY seller_id
        `)
        const sellerPerf = {}
        for (const row of sellerPerfR.rows) sellerPerf[row.seller_id] = parseFloat(row.perf)

        // Build conditions
        const conditions = [`f.product_id IS NOT NULL`]
        const params = []
        if (category_id) { params.push(category_id); conditions.push(`f.collection_id = $${params.length}`) }
        if (seller_id)   { params.push(seller_id);   conditions.push(`f.seller_id = $${params.length}`) }
        // Strategy-specific filter: sales = must have discount
        if (strategy === 'sales') conditions.push(`f.discount_pct > 0`)

        const whereClause = conditions.join(' AND ')

        // Compute final score inline with strategy weights + freshness half-life override
        params.push(hl); const hlIdx = params.length
        params.push(expl_k); const exklIdx = params.length
        params.push(urgency_t); const urgIdx = params.length

        const r = await client.query(`
          SELECT
            f.product_id,
            f.seller_id,
            f.collection_id,
            f.sales_30d,
            f.gmv_30d_cents,
            f.review_avg,
            f.review_count,
            f.price_cents,
            f.discount_pct,
            f.inventory,
            f.content_score,
            f.published_at,
            f.popularity_score,
            f.velocity_score,
            -- Recompute freshness with strategy half-life
            ROUND(EXP(-0.693 * GREATEST(0, EXTRACT(EPOCH FROM (NOW() - f.published_at)) / 86400) / $${hlIdx})::numeric, 6) AS freshness,
            -- Exploration bonus: decays exponentially, stronger for newer products
            ROUND(($${exklIdx} * EXP(-0.693 * GREATEST(0, EXTRACT(EPOCH FROM (NOW() - f.published_at)) / 86400) / ($${hlIdx} * 0.5)))::numeric, 6) AS exploration_bonus,
            -- Low-stock urgency: tiny boost when near-selling-out
            CASE WHEN f.inventory > 0 AND f.inventory <= $${urgIdx} THEN 0.03 ELSE 0 END AS urgency_bonus,
            -- Return penalty
            CASE WHEN f.sales_30d > 0 THEN LEAST(f.return_count_30d::numeric / f.sales_30d, 0.5) * 0.15 ELSE 0 END AS return_penalty
          FROM product_ranking_features f
          JOIN admin_hub_products p ON p.id::text = f.product_id AND p.status = 'published'
          WHERE ${whereClause}
        `, params)

        // Score, apply seller performance, then diversity re-rank
        const rows = r.rows.map((row) => {
          const sp = sellerPerf[row.seller_id] ?? 0.5
          const score =
            w_pop     * parseFloat(row.popularity_score) +
            w_fresh   * parseFloat(row.freshness) +
            w_content * parseFloat(row.content_score) +
            w_disc    * Math.min(parseFloat(row.discount_pct) / 60.0, 1.0) +
            w_seller  * sp +
            w_vel     * parseFloat(row.velocity_score) +
            parseFloat(row.exploration_bonus) +
            parseFloat(row.urgency_bonus) -
            parseFloat(row.return_penalty)
          return { ...row, _score: score }
        })
        rows.sort((a, b) => b._score - a._score)

        // Diversity pass: smooth seller tax (not hard cap)
        const ranked = []
        const sellerConsec = {}
        for (const row of rows) {
          const sid = row.seller_id || '__none__'
          const consec = sellerConsec[sid] || 0
          // Apply diversity penalty: each additional consecutive slot from same seller = 15% score reduction
          const diversityPenalty = Math.max(0, consec - (diversity - 1)) * 0.15
          ranked.push({ ...row, _final_score: row._score - diversityPenalty })
          sellerConsec[sid] = consec + 1
          // Reset other sellers' consecutive count
          for (const k of Object.keys(sellerConsec)) {
            if (k !== sid) sellerConsec[k] = 0
          }
        }
        // Re-sort after diversity pass
        ranked.sort((a, b) => b._final_score - a._final_score)

        const paged = ranked.slice(offset, offset + limit)
        await client.end()
        res.json({
          strategy,
          total: ranked.length,
          offset,
          limit,
          products: paged.map((r) => ({
            product_id: r.product_id,
            seller_id: r.seller_id,
            score: parseFloat(r._final_score.toFixed(6)),
          })),
        })
      } catch (e) {
        if (client) try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    // GET /admin-hub/v1/ranking/products — ranked list with full breakdown (admin only)
    const adminRankingProductsGET = async (req, res) => {
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        const strategy = (req.query.strategy || 'default').replace(/[^a-z_]/g, '')
        const sellerId = req.sellerUser?.seller_id
        const isSuperuser = req.sellerUser?.is_superuser

        const cfgR = await client.query(`SELECT config FROM ranking_config WHERE strategy = $1`, [strategy])
        const cfg = cfgR.rows[0]?.config || {}
        const hl = parseFloat(cfg.freshness_halflife_days ?? 30)
        const expl_k = parseFloat(cfg.exploration_k ?? 0.25)

        const conditions = ['p.status = \'published\'']
        const params = [hl, expl_k]
        if (!isSuperuser && sellerId) { params.push(sellerId); conditions.push(`f.seller_id = $${params.length}`) }

        const r = await client.query(`
          SELECT
            f.*,
            p.title,
            p.handle,
            p.status,
            ROUND(EXP(-0.693 * GREATEST(0, EXTRACT(EPOCH FROM (NOW() - f.published_at)) / 86400) / $1)::numeric, 6) AS freshness_override,
            ROUND(($2 * EXP(-0.693 * GREATEST(0, EXTRACT(EPOCH FROM (NOW() - f.published_at)) / 86400) / ($1 * 0.5)))::numeric, 6) AS exploration_bonus,
            CASE WHEN f.inventory > 0 AND f.inventory <= 5 THEN 0.03 ELSE 0 END AS urgency_bonus,
            CASE WHEN f.sales_30d > 0 THEN LEAST(f.return_count_30d::numeric / f.sales_30d, 0.5) * 0.15 ELSE 0 END AS return_penalty
          FROM product_ranking_features f
          JOIN admin_hub_products p ON p.id::text = f.product_id
          WHERE ${conditions.join(' AND ')}
          ORDER BY f.final_score DESC
          LIMIT 500
        `, params)

        await client.end()
        res.json({ strategy, config: cfg, products: r.rows })
      } catch (e) {
        if (client) try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    // GET /admin-hub/v1/ranking/products/:id/breakdown — why is this product at this rank?
    const adminRankingBreakdownGET = async (req, res) => {
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        const productId = req.params.id
        const strategy = (req.query.strategy || 'default').replace(/[^a-z_]/g, '')

        const cfgR = await client.query(`SELECT config FROM ranking_config WHERE strategy = $1`, [strategy])
        const cfg = cfgR.rows[0]?.config || {}

        const r = await client.query(`
          SELECT f.*, p.title, p.handle
          FROM product_ranking_features f
          JOIN admin_hub_products p ON p.id::text = f.product_id
          WHERE f.product_id = $1
        `, [productId])
        if (!r.rows.length) { await client.end(); return res.status(404).json({ message: 'Product not found in ranking features. Compute first.' }) }
        const f = r.rows[0]

        // Rank position: how many products score higher?
        const hl = parseFloat(cfg.freshness_halflife_days ?? 30)
        const expl_k = parseFloat(cfg.exploration_k ?? 0.25)
        const w_pop = parseFloat(cfg.w_popularity ?? 0.45)
        const w_fresh = parseFloat(cfg.w_freshness ?? 0.15)
        const w_content = parseFloat(cfg.w_content ?? 0.10)
        const w_disc = parseFloat(cfg.w_discount ?? 0.15)
        const w_seller = parseFloat(cfg.w_seller ?? 0.10)
        const w_vel = parseFloat(cfg.w_velocity ?? 0.05)

        const daysSince = Math.max(0, (Date.now() - new Date(f.published_at)) / 86400000)
        const freshness = Math.exp(-0.693 * daysSince / hl)
        const exploration_bonus = expl_k * Math.exp(-0.693 * daysSince / (hl * 0.5))
        const urgency_bonus = (f.inventory > 0 && f.inventory <= 5) ? 0.03 : 0
        const return_penalty = f.sales_30d > 0 ? Math.min(f.return_count_30d / f.sales_30d, 0.5) * 0.15 : 0
        const discount_score = Math.min(parseFloat(f.discount_pct) / 60.0, 1.0)

        // Seller perf
        const spR = await client.query(`SELECT ROUND(AVG(review_avg)/5.0,4) AS perf FROM product_ranking_features WHERE seller_id=$1 AND review_count>0`, [f.seller_id])
        const seller_perf = parseFloat(spR.rows[0]?.perf ?? 0.5)

        const rankR = await client.query(`
          SELECT COUNT(*)::int AS rank
          FROM product_ranking_features f2
          JOIN admin_hub_products p2 ON p2.id::text = f2.product_id AND p2.status = 'published'
          WHERE f2.final_score > (SELECT final_score FROM product_ranking_features WHERE product_id = $1)
        `, [productId])

        await client.end()
        res.json({
          product_id: productId,
          title: f.title,
          strategy,
          config: cfg,
          rank_position: (rankR.rows[0]?.rank ?? 0) + 1,
          signals: {
            sales_7d: f.sales_7d,
            sales_30d: f.sales_30d,
            sales_90d: f.sales_90d,
            gmv_30d_cents: f.gmv_30d_cents,
            impressions_30d: f.impressions_30d,
            clicks_30d: f.clicks_30d,
            ctr_30d: f.ctr_30d,
            add_to_cart_30d: f.add_to_cart_30d,
            review_avg: f.review_avg,
            review_count: f.review_count,
            return_count_30d: f.return_count_30d,
            discount_pct: f.discount_pct,
            inventory: f.inventory,
            days_since_published: parseFloat(daysSince.toFixed(1)),
          },
          scores: {
            popularity: parseFloat(f.popularity_score),
            freshness: parseFloat(freshness.toFixed(6)),
            content: parseFloat(f.content_score),
            velocity: parseFloat(f.velocity_score),
            seller_performance: parseFloat(seller_perf),
            discount: parseFloat(discount_score.toFixed(4)),
          },
          bonuses: {
            exploration_bonus: parseFloat(exploration_bonus.toFixed(6)),
            urgency_bonus,
          },
          penalties: {
            return_penalty: parseFloat(return_penalty.toFixed(6)),
          },
          weighted_contributions: {
            popularity: parseFloat((w_pop * parseFloat(f.popularity_score)).toFixed(6)),
            freshness: parseFloat((w_fresh * freshness).toFixed(6)),
            content: parseFloat((w_content * parseFloat(f.content_score)).toFixed(6)),
            discount: parseFloat((w_disc * discount_score).toFixed(6)),
            seller: parseFloat((w_seller * seller_perf).toFixed(6)),
            velocity: parseFloat((w_vel * parseFloat(f.velocity_score)).toFixed(6)),
            exploration_bonus: parseFloat(exploration_bonus.toFixed(6)),
            urgency_bonus,
            return_penalty: parseFloat((-return_penalty).toFixed(6)),
          },
          final_score: parseFloat(f.final_score),
        })
      } catch (e) {
        if (client) try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    // POST /admin-hub/v1/ranking/compute — manual trigger (superuser only)
    const adminRankingComputePOST = async (req, res) => {
      if (!req.sellerUser?.is_superuser) return res.status(403).json({ message: 'Superuser required' })
      res.json({ ok: true, message: 'Computation started in background' })
      computeRankingFeatures().catch((e) => console.error('[Ranking] Manual compute error:', e.message))
    }

    // GET/PATCH /admin-hub/v1/ranking/config
    const adminRankingConfigGET = async (req, res) => {
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        const r = await client.query(`SELECT strategy, config, updated_at FROM ranking_config ORDER BY strategy`)
        await client.end()
        res.json({ configs: r.rows })
      } catch (e) {
        if (client) try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }
    const adminRankingConfigPATCH = async (req, res) => {
      if (!req.sellerUser?.is_superuser) return res.status(403).json({ message: 'Superuser required' })
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        const { strategy, config } = req.body || {}
        if (!strategy || !config) { await client.end(); return res.status(400).json({ message: 'strategy and config required' }) }
        await client.query(`
          INSERT INTO ranking_config (strategy, config, updated_at)
          VALUES ($1, $2::jsonb, NOW())
          ON CONFLICT (strategy) DO UPDATE SET config = $2::jsonb, updated_at = NOW()
        `, [strategy, JSON.stringify(config)])
        await client.end()
        res.json({ ok: true })
      } catch (e) {
        if (client) try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    // POST /store/events — storefront event logging (impression, click, add_to_cart)
    const storeEventsPOST = async (req, res) => {
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        const events = Array.isArray(req.body) ? req.body : [req.body]
        const allowed = ['impression', 'click', 'add_to_cart']
        for (const ev of events) {
          const { event_type, product_id, seller_id, category_id, strategy, session_id, position } = ev || {}
          if (!event_type || !product_id || !allowed.includes(event_type)) continue
          await client.query(
            `INSERT INTO product_events (event_type, product_id, seller_id, category_id, strategy, session_id, position)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [event_type, product_id, seller_id || null, category_id || null, strategy || 'default', session_id || null, position ?? null]
          )
        }
        await client.end()
        res.json({ ok: true })
      } catch (e) {
        if (client) try { await client.end() } catch (_) {}
        res.status(200).json({ ok: true }) // never fail event logging
      }
    }

    // ── Marketplace tables ────────────────────────────────────────────────────
    await dbQ(`CREATE TABLE IF NOT EXISTS admin_hub_seller_listings (
      id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      product_id  uuid NOT NULL REFERENCES admin_hub_products(id) ON DELETE CASCADE,
      seller_id   varchar(255) NOT NULL,
      price_cents integer NOT NULL DEFAULT 0,
      inventory   integer NOT NULL DEFAULT 0,
      status      varchar(50) NOT NULL DEFAULT 'active',
      orders_count integer NOT NULL DEFAULT 0,
      sku         text,
      shipping_group_id text,
      brand_id    text,
      publish_date text,
      seller_metadata jsonb DEFAULT NULL,
      created_at  timestamptz DEFAULT now(),
      updated_at  timestamptz DEFAULT now(),
      UNIQUE(product_id, seller_id)
    )`).catch(() => {})
    await dbQ(`ALTER TABLE admin_hub_seller_listings ADD COLUMN IF NOT EXISTS sku text`).catch(() => {})
    await dbQ(`ALTER TABLE admin_hub_seller_listings ADD COLUMN IF NOT EXISTS shipping_group_id text`).catch(() => {})
    await dbQ(`ALTER TABLE admin_hub_seller_listings ADD COLUMN IF NOT EXISTS brand_id text`).catch(() => {})
    await dbQ(`ALTER TABLE admin_hub_seller_listings ADD COLUMN IF NOT EXISTS publish_date text`).catch(() => {})
    await dbQ(`ALTER TABLE admin_hub_seller_listings ADD COLUMN IF NOT EXISTS seller_metadata jsonb DEFAULT NULL`).catch(() => {})
    await dbQ(`CREATE INDEX IF NOT EXISTS idx_seller_listings_product ON admin_hub_seller_listings(product_id)`).catch(() => {})
    await dbQ(`CREATE INDEX IF NOT EXISTS idx_seller_listings_seller  ON admin_hub_seller_listings(seller_id)`).catch(() => {})
    await dbQ(`CREATE TABLE IF NOT EXISTS admin_hub_product_change_requests (
      id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      product_id    uuid NOT NULL REFERENCES admin_hub_products(id) ON DELETE CASCADE,
      seller_id     varchar(255) NOT NULL,
      status        varchar(50) NOT NULL DEFAULT 'pending',
      field_name    varchar(255) NOT NULL,
      old_value     text,
      new_value     text NOT NULL,
      reviewer_note text,
      created_at    timestamptz DEFAULT now(),
      updated_at    timestamptz DEFAULT now()
    )`).catch(() => {})
    await dbQ(`CREATE INDEX IF NOT EXISTS idx_change_requests_status ON admin_hub_product_change_requests(status)`).catch(() => {})
    await dbQ(`ALTER TABLE store_cart_items ADD COLUMN IF NOT EXISTS seller_id varchar(255)`).catch(() => {})

    // Newsletter subscriber endpoint
    await dbQ(`CREATE TABLE IF NOT EXISTS store_newsletter_subscribers (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      email text NOT NULL,
      source text DEFAULT 'landing_page',
      subscribed_at timestamptz DEFAULT now(),
      UNIQUE(email)
    )`).catch(() => {})
    httpApp.post('/store/newsletter-subscribe', async (req, res) => {
      const { email } = req.body || {}
      if (!email || !String(email).includes('@')) return res.status(400).json({ message: 'Valid email required' })
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      const { Client } = require('pg')
      const c = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
      try {
        await c.connect()
        await c.query(
          `INSERT INTO store_newsletter_subscribers (email, source) VALUES ($1, 'landing_page') ON CONFLICT (email) DO NOTHING`,
          [String(email).trim().toLowerCase()]
        )
        await c.end()
        res.json({ ok: true })
      } catch (e) {
        try { await c.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    })
    httpApp.get('/admin-hub/v1/newsletter-subscribers', requireSellerAuth, async (req, res) => {
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      const { Client } = require('pg')
      const c = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
      try {
        await c.connect()
        const r = await c.query('SELECT * FROM store_newsletter_subscribers ORDER BY subscribed_at DESC LIMIT 500')
        await c.end()
        res.json({ subscribers: r.rows })
      } catch (e) {
        try { await c.end() } catch (_) {}
        res.json({ subscribers: [] })
      }
    })

    // Register ranking routes
    httpApp.get('/store/products/ranked', storeProductsRankedGET)
    httpApp.post('/store/events', storeEventsPOST)
    httpApp.get('/admin-hub/v1/ranking/config', requireSellerAuth, adminRankingConfigGET)
    httpApp.patch('/admin-hub/v1/ranking/config', requireSellerAuth, adminRankingConfigPATCH)
    httpApp.get('/admin-hub/v1/ranking/products', requireSellerAuth, adminRankingProductsGET)
    httpApp.post('/admin-hub/v1/ranking/compute', requireSellerAuth, adminRankingComputePOST)
    httpApp.get('/admin-hub/v1/ranking/products/:id/breakdown', requireSellerAuth, adminRankingBreakdownGET)

    // Auto-compute ranking features every 2 hours
    setTimeout(() => {
      computeRankingFeatures().catch(() => {})
      setInterval(() => computeRankingFeatures().catch(() => {}), 2 * 60 * 60 * 1000)
    }, 30 * 1000) // 30s delay after startup

    try {
      const { mountBillbeeMarketplaceApi } = require(path.join(__dirname, 'billbee-marketplace-api'))
      mountBillbeeMarketplaceApi(httpApp, { getSellerDbClient, getProductsDbClient })
    } catch (e) {
      console.warn('Billbee marketplace API mount failed:', e?.message || e)
    }

    httpApp.listen(PORT, HOST, () => {
      log.info(`\n✅ Medusa v2 backend başarıyla başlatıldı!`)
      log.info(`📍 Listening on ${HOST}:${PORT}\n`)
    })

    process.on('SIGTERM', () => {
      log.info('\nSIGTERM received, shutting down gracefully')
      httpApp.close(() => { process.exit(0) })
    })
    process.on('SIGINT', () => {
      log.info('\nSIGINT received, shutting down gracefully')
      httpApp.close(() => { process.exit(0) })
    })
  } catch (error) {
    console.error('\n❌ Medusa v2 başlatma hatası:', error.code || error.name, error.message)
    if (error.stack) console.error(error.stack)
    if (error.name === 'KnexTimeoutError' || (error.message && error.message.includes('acquiring a connection'))) {
      console.error('\n💡 PostgreSQL bağlantı hatası. Kontrol edin:')
      console.error('   - PostgreSQL servisi çalışıyor mu? (Windows: Servisler)')
      console.error('   - .env.local içinde DATABASE_URL doğru mu? (postgres://user:pass@localhost:5432/medusa)')
      console.error('   - "medusa" veritabanı oluşturuldu mu? (psql -U postgres -c "CREATE DATABASE medusa;")')
      console.error('   - Backend olmadan çalıştırmak için: npm run dev:web\n')
    }
    process.exit(1)
  }
}

start()