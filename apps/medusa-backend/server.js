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

// ── Sentry init (S1.4) ──────────────────────────────────────────────────────
// Must run BEFORE other modules are required so OpenTelemetry can patch them.
// No-op if SENTRY_DSN is unset (typical for local dev) so nothing breaks.
const Sentry = require('@sentry/node')
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'development',
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
    sendDefaultPii: false,
    beforeSend(event, hint) {
      const error = hint?.originalException || hint?.syntheticException
      if (error && error.code === 'EPIPE') return null
      return event
    },
  })
}

// TypeScript API routes (src/api) yüklenebilsin
try {
  require('ts-node/register')
} catch (_) {}

const path = require('path')
const fs = require('fs')
const { runAutomationFlowsForOrder, runAutomationFlowsForCustomerEvent } = require('./src/flow-automation')
const {
  applyEuOriginMetadataPolicy,
  registerEuOriginRoutes,
  ensureEuOriginPendingTable,
} = require('./src/eu-origin')
const {
  decodeMultipartFilename,
  resolveUploadDisplayFilename,
  storageFilenameWithPrefix,
} = require('./src/media-filename')
const { enqueueFlowEvent, startFlowQueueWorker, getFlowQueueStatus } = require('./src/flow-queue')
const { pingForHealth } = require('./src/redis')
const { resolveSmtpSenderIdentity } = require('./src/smtp-sender-resolve')
const { renderInvoicePdfDocument, renderLieferscheinPdfDocument, renderProvisionsfakturPdfDocument, getOrderPdfFilename } = require('./src/order-pdf-buffers')
const { renderPeriodCommissionInvoiceDocument } = require('./src/order-pdf-layout')
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
// Production: REQUIRED. Generate with:
//   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
if (!process.env.TOTP_ENCRYPTION_KEY) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('TOTP_ENCRYPTION_KEY is required in production. Generate with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"')
  }
  // Development / fresh clone: allow `npm run dev` without configuring TOTP immediately.
  // Fixed weak key — only for localhost; NEVER deploy without a real rotation key.
  process.env.TOTP_ENCRYPTION_KEY = '0'.repeat(64)
  log.warn('[dev] TOTP_ENCRYPTION_KEY unset — using local-only placeholder. Add TOTP_ENCRYPTION_KEY to .env before real 2FA / shared DB.')
}
if (process.env.TOTP_ENCRYPTION_KEY.length !== 64) {
  throw new Error('TOTP_ENCRYPTION_KEY must be exactly 64 hex chars (32 bytes)')
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
    const dispatchOrderFlowEvent = async (triggerKey, orderId) => {
      const tk = String(triggerKey || '').trim()
      const oid = String(orderId || '').trim()
      if (!tk || !oid) return
      try {
        const queued = await enqueueFlowEvent('order-flow-event', { triggerKey: tk, orderId: oid })
        if (queued) return
      } catch (qe) {
        console.warn('[flow-queue] enqueue order event failed, fallback immediate:', qe?.message || qe)
      }
      setImmediate(() => {
        runAutomationFlowsForOrder({ triggerKey: tk, orderId: oid }).catch((fe) => {
          console.warn(`runAutomationFlowsForOrder ${tk}:`, fe?.message || fe)
        })
      })
    }
    const dispatchCustomerFlowEvent = async (triggerKey, payload = {}) => {
      const tk = String(triggerKey || '').trim()
      if (!tk) return
      try {
        const queued = await enqueueFlowEvent('customer-flow-event', { triggerKey: tk, ...payload })
        if (queued) return
      } catch (qe) {
        console.warn('[flow-queue] enqueue customer event failed, fallback immediate:', qe?.message || qe)
      }
      setImmediate(() => {
        runAutomationFlowsForCustomerEvent({ triggerKey: tk, ...payload }).catch((fe) => {
          console.warn(`runAutomationFlowsForCustomerEvent ${tk}:`, fe?.message || fe)
        })
      })
    }
    let logSellerError = async () => {}
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

    // Sends an email to every SUPERUSER_EMAILS address when a seller creates a new PPC campaign.
    async function notifySuperusersNewCampaign({ campaignId, campaignName, sellerDisplayName, sellerId, budgetCents }) {
      if (!process.env.SMTP_HOST) return
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
      const budgetEuro = ((parseInt(budgetCents, 10) || 0) / 100).toFixed(2)
      const subject = `Neue Werbekampagne von ${sellerDisplayName}: ${campaignName}`
      const html = `
<div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;color:#1f2937">
  <div style="font-size:22px;font-weight:900;letter-spacing:0.14em;color:#111;margin-bottom:24px">ANDERTAL</div>
  <h2 style="font-size:17px;font-weight:700;margin:0 0 16px">Neue Werbekampagne eingereicht</h2>
  <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:24px">
    <tr><td style="padding:7px 0;color:#6b7280;width:140px">Verkäufer</td><td style="padding:7px 0;font-weight:500">${sellerDisplayName}</td></tr>
    <tr><td style="padding:7px 0;color:#6b7280">Kampagne</td><td style="padding:7px 0">${campaignName}</td></tr>
    <tr><td style="padding:7px 0;color:#6b7280">Tagesbudget</td><td style="padding:7px 0">${budgetEuro} €</td></tr>
    <tr><td style="padding:7px 0;color:#6b7280">Seller ID</td><td style="padding:7px 0;font-family:monospace;font-size:12px">${sellerId}</td></tr>
    <tr><td style="padding:7px 0;color:#6b7280">Eingegangen</td><td style="padding:7px 0">${new Date().toLocaleString('de-DE', { timeZone: 'Europe/Berlin' })}</td></tr>
  </table>
  <a href="${sellerCentralUrl}/de/marketing/campaigns/${campaignId}"
     style="display:inline-block;padding:11px 22px;background:#ff971c;color:#fff;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px">
    Kampagne öffnen →
  </a>
  <p style="margin-top:24px;font-size:12px;color:#9ca3af">Diese E-Mail wurde automatisch generiert.</p>
</div>`
      await transport.sendMail({
        from: process.env.SMTP_FROM || '"Andertal Sellercentral" <noreply@andertal.de>',
        to: superuserEmails.join(', '),
        subject,
        html,
        text: `Neue Werbekampagne eingereicht\n\nVerkäufer: ${sellerDisplayName}\nKampagne: ${campaignName}\nTagesbudget: ${budgetEuro} €\nSeller ID: ${sellerId}\n\nÖffnen: ${sellerCentralUrl}/de/marketing/campaigns/${campaignId}`,
      })
      log.info(`[notify] New campaign email sent to ${superuserEmails.join(', ')}`)
    }

    // Root ve health: "Cannot GET /" yerine JSON döner
    app.get('/', (req, res) => {
      res.json({ ok: true, service: 'medusa-backend', timestamp: new Date().toISOString() })
    })
    app.get('/health', async (req, res) => {
      const redisPing = await pingForHealth()
      const notificationQueue = getFlowQueueStatus()
      res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        redis: {
          url_configured: redisPing.url_configured,
          ping_ok: redisPing.ping_ok,
          ...(redisPing.error ? { error: redisPing.error } : {}),
        },
        notification_queue: notificationQueue,
      })
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
        await client.query(`ALTER TABLE store_orders ADD COLUMN IF NOT EXISTS sendcloud_label_url text;`).catch(() => {})
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
        await client.query(`ALTER TABLE admin_hub_seller_settings ADD COLUMN IF NOT EXISTS logo_config jsonb`).catch(() => {})
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
        await client.query(`ALTER TABLE admin_hub_banners ADD COLUMN IF NOT EXISTS video_url text`).catch(() => {})
        await client.query(`ALTER TABLE store_orders ADD COLUMN IF NOT EXISTS bonus_points_redeemed integer NOT NULL DEFAULT 0`).catch(() => {})
        await client.query(`ALTER TABLE store_orders ADD COLUMN IF NOT EXISTS checkout_payment_kind varchar(32) NOT NULL DEFAULT 'stripe'`).catch(() => {})
        await client.query(`ALTER TABLE store_orders ADD COLUMN IF NOT EXISTS seller_net_after_commission_cents integer NOT NULL DEFAULT 0`).catch(() => {})
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
        await client.query(`ALTER TABLE admin_hub_seller_settings ADD COLUMN IF NOT EXISTS storefront_url text;`).catch(() => {})
        // ── Platform legal / company info ────────────────────────────────────
        await client.query(`ALTER TABLE admin_hub_seller_settings ADD COLUMN IF NOT EXISTS legal_company_name varchar(255)`).catch(() => {})
        await client.query(`ALTER TABLE admin_hub_seller_settings ADD COLUMN IF NOT EXISTS legal_representative varchar(255)`).catch(() => {})
        await client.query(`ALTER TABLE admin_hub_seller_settings ADD COLUMN IF NOT EXISTS legal_street varchar(255)`).catch(() => {})
        await client.query(`ALTER TABLE admin_hub_seller_settings ADD COLUMN IF NOT EXISTS legal_city varchar(255)`).catch(() => {})
        await client.query(`ALTER TABLE admin_hub_seller_settings ADD COLUMN IF NOT EXISTS legal_trade_register varchar(255)`).catch(() => {})
        await client.query(`ALTER TABLE admin_hub_seller_settings ADD COLUMN IF NOT EXISTS legal_register_court varchar(255)`).catch(() => {})
        await client.query(`ALTER TABLE admin_hub_seller_settings ADD COLUMN IF NOT EXISTS legal_vat_id varchar(100)`).catch(() => {})
        await client.query(`ALTER TABLE admin_hub_seller_settings ADD COLUMN IF NOT EXISTS legal_tax_id varchar(100)`).catch(() => {})
        await client.query(`ALTER TABLE admin_hub_seller_settings ADD COLUMN IF NOT EXISTS legal_email varchar(255)`).catch(() => {})
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
        await client.query(`
          CREATE TABLE IF NOT EXISTS admin_hub_flow_snapshots (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            flow_id uuid NOT NULL REFERENCES admin_hub_flows(id) ON DELETE CASCADE,
            version_num integer NOT NULL,
            flow_snapshot jsonb NOT NULL DEFAULT '{}',
            steps_snapshot jsonb NOT NULL DEFAULT '[]',
            created_at timestamptz NOT NULL DEFAULT now(),
            UNIQUE(flow_id, version_num)
          )
        `).catch(() => {})
        await client.query(
          `CREATE INDEX IF NOT EXISTS idx_flow_snapshots_flow_ver ON admin_hub_flow_snapshots(flow_id, version_num DESC)`,
        ).catch(() => {})
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
        await client.query(`
          CREATE TABLE IF NOT EXISTS seller_error_logs (
            id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
            seller_id varchar(255),
            error_code varchar(100),
            error_message text NOT NULL,
            terminal_output text,
            context varchar(255),
            resolution text,
            status varchar(20) NOT NULL DEFAULT 'open',
            is_read boolean NOT NULL DEFAULT false,
            created_at timestamp DEFAULT now(),
            updated_at timestamp DEFAULT now()
          );
          CREATE INDEX IF NOT EXISTS idx_seller_error_logs_seller_id ON seller_error_logs(seller_id);
          CREATE INDEX IF NOT EXISTS idx_seller_error_logs_status ON seller_error_logs(status);
          CREATE INDEX IF NOT EXISTS idx_seller_error_logs_created_at ON seller_error_logs(created_at DESC);
        `).catch(() => {})
        await client.query(`
          CREATE TABLE IF NOT EXISTS seller_locations (
            id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
            seller_id varchar(255) NOT NULL,
            name varchar(255) NOT NULL DEFAULT 'Hauptstandort',
            type varchar(30) NOT NULL DEFAULT 'warehouse',
            address_line1 text,
            address_line2 text,
            city varchar(255),
            postal_code varchar(20),
            country varchar(100) DEFAULT 'Deutschland',
            phone varchar(100),
            email varchar(255),
            is_primary boolean NOT NULL DEFAULT false,
            is_active boolean NOT NULL DEFAULT true,
            created_at timestamp DEFAULT now(),
            updated_at timestamp DEFAULT now()
          );
          CREATE INDEX IF NOT EXISTS idx_seller_locations_seller_id ON seller_locations(seller_id);
        `).catch(() => {})
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

        // ── Seller agreement signature ──────────────────────────────────────────
        await client.query(`ALTER TABLE seller_users ADD COLUMN IF NOT EXISTS signature_data text DEFAULT NULL`).catch(() => {})
        await client.query(`ALTER TABLE seller_users ADD COLUMN IF NOT EXISTS signature_at timestamptz DEFAULT NULL`).catch(() => {})
        await client.query(`ALTER TABLE seller_users ADD COLUMN IF NOT EXISTS signature_ip varchar(60) DEFAULT NULL`).catch(() => {})
        await client.query(`ALTER TABLE seller_users ADD COLUMN IF NOT EXISTS agreement_pdf_url text DEFAULT NULL`).catch(() => {})
        await client.query(`ALTER TABLE seller_users ADD COLUMN IF NOT EXISTS stripe_customer_id text DEFAULT NULL`).catch(() => {})
        await client.query(`ALTER TABLE seller_users ADD COLUMN IF NOT EXISTS stripe_payment_method_id text DEFAULT NULL`).catch(() => {})
        await client.query(`ALTER TABLE seller_users ADD COLUMN IF NOT EXISTS stripe_card_last4 varchar(4) DEFAULT NULL`).catch(() => {})
        await client.query(`ALTER TABLE seller_users ADD COLUMN IF NOT EXISTS stripe_card_brand varchar(30) DEFAULT NULL`).catch(() => {})
        await client.query(`ALTER TABLE seller_users ADD COLUMN IF NOT EXISTS stripe_card_exp_month integer DEFAULT NULL`).catch(() => {})
        await client.query(`ALTER TABLE seller_users ADD COLUMN IF NOT EXISTS stripe_card_exp_year integer DEFAULT NULL`).catch(() => {})
        await client.query(`
          CREATE TABLE IF NOT EXISTS seller_sign_tokens (
            token varchar(64) PRIMARY KEY,
            seller_id varchar(255) NOT NULL,
            locale varchar(10) NOT NULL DEFAULT 'de',
            used_at timestamptz DEFAULT NULL,
            created_at timestamptz NOT NULL DEFAULT now(),
            expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 minutes'),
            ip varchar(60) DEFAULT NULL
          )
        `).catch(() => {})
        await client.query(`ALTER TABLE seller_sign_tokens ADD COLUMN IF NOT EXISTS sign_session varchar(64) DEFAULT NULL`).catch(() => {})

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
        await client.query(`
          CREATE TABLE IF NOT EXISTS shop_live_presence (
            session_id varchar(64) PRIMARY KEY,
            ip_address varchar(45),
            country_code varchar(8),
            city varchar(120),
            region varchar(120),
            page_path text,
            page_title text,
            referrer text,
            user_agent text,
            device_type varchar(20),
            first_seen_at timestamptz NOT NULL DEFAULT now(),
            last_seen_at timestamptz NOT NULL DEFAULT now()
          );
        `).catch(() => {})
        await client.query(`CREATE INDEX IF NOT EXISTS idx_shop_live_presence_last_seen ON shop_live_presence(last_seen_at DESC)`).catch(() => {})
        await client.query(`CREATE INDEX IF NOT EXISTS idx_shop_live_presence_country ON shop_live_presence(country_code)`).catch(() => {})
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

    // --- Seller Auth: extracted to src/routes/seller-auth.js ---
    const { createSellerAuthRouter, requireSellerAuth, requireSuperuser, verifySellerToken, signSellerToken, validatePasswordStrength, encryptTotp, decryptTotp, hashSellerPassword, verifySellerPassword, getSellerDbClient } = require('./src/routes/seller-auth')
    // ── Auth gatekeeper for /admin-hub (S1.3) ─────────────────────────────
    // Default-deny on every /admin-hub/* request: must carry a valid seller
    // bearer token via requireSellerAuth (see ~line 5630) UNLESS the path
    // matches a known-public pattern below.
    //
    // Adding a new public endpoint requires updating ADMIN_HUB_PUBLIC_PATTERNS.
    // requireSellerAuth is a function declaration (hoisted within this scope)
    // so it is callable here at request time even though it is defined later
    // in the file.
    const ADMIN_HUB_PUBLIC_PATTERNS = [
      /^\/auth\/login(\/|\?|$)/,
      /^\/auth\/register(\/|\?|$)/,
      // Billbee integration callbacks use Basic Auth, not seller JWT.
      /^\/v1\/integrations\/billbee\/webhook(\/|\?|$)/,
    ]
    httpApp.use('/admin-hub', (req, res, next) => {
      if (req.method === 'OPTIONS') return next() // CORS preflight
      const reqPath = req.path || '/'
      if (ADMIN_HUB_PUBLIC_PATTERNS.some((re) => re.test(reqPath))) {
        return next()
      }
      return requireSellerAuth(req, res, next)
    })

    // ── Auth gatekeeper for /admin/* (S1.3b) ──────────────────────────────
    // The /admin-hub gatekeeper above does NOT cover /admin/*. Those routes
    // (registered around line 2474+) ARE called by the live sellercentral
    // MedusaAdminClient (see apps/sellercentral/src/lib/medusa-admin-client.js
    // — getProducts, createProduct, getMedusaCollections({adminHub:false}),
    // etc.) and were previously unauthenticated, allowing anyone to read or
    // modify the product catalog. This middleware adds requireSellerAuth on
    // the specific path prefixes we know are ours, leaving the rest of
    // /admin/* (Medusa-managed admin routes, including framework auth flows
    // like /admin/auth/*) untouched.
    const ADMIN_PROTECTED_PREFIXES = [
      '/admin/products',
      '/admin/orders',
      '/admin/collections',
      '/admin/product-categories',
      '/admin/regions',
    ]
    httpApp.use(ADMIN_PROTECTED_PREFIXES, (req, res, next) => {
      if (req.method === 'OPTIONS') return next() // CORS preflight
      return requireSellerAuth(req, res, next)
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

    // --- Categories: extracted to src/routes/categories.js ---
    const {
      resolveAdminHub,
      mapAdminHubCategoryPgRow,
      buildAdminHubCategoryTreeFromFlat,
      localizeCategoriesForRequest,
      localizeSingleCategoryForRequest,
    } = require('./src/categories-helpers')
    const {
      isUuid,
      updateAdminHubCollectionDb,
      deleteAdminHubCollectionDb,
      getAdminHubCollectionByIdDb,
      getAdminHubCollectionByHandleDb,
    } = require('./src/collections-db')
    const createCategoriesRouter = require('./src/routes/categories')
    httpApp.use('/', createCategoriesRouter())

    // --- Admin products/orders + collections: extracted to src/routes/collections.js ---
    const createCollectionsRouter = require('./src/routes/collections')
    httpApp.use('/', createCollectionsRouter())


    // --- Brands + Banners: extracted to src/routes/brands.js ---
    const createBrandsRouter = require('./src/routes/brands')
    httpApp.use('/', createBrandsRouter())

    // --- Metafield Definitions: extracted to src/routes/metafields.js ---
    const createMetafieldsRouter = require('./src/routes/metafields')
    httpApp.use('/', createMetafieldsRouter())

    // --- Admin Hub Menus: extracted to src/routes/menus.js ---
    const createMenusRouter = require('./src/routes/menus')
    httpApp.use('/', createMenusRouter())

    // --- Admin Hub Products: extracted to src/routes/admin-products.js ---
    const { createAdminProductsRouter, getAdminHubProductByIdOrHandleDb, updateAdminHubProductDb, getProductsDbClient } = require('./src/routes/admin-products')
    httpApp.use('/', createAdminProductsRouter())

    // --- Seller Settings: extracted to src/routes/seller-settings.js ---
    const { createSellerSettingsRouter, normalizeHubCountryCode, normalizeThresholdsObject, STORE_PUBLISHED_STATUSES, isStorePublishedStatus, storePublishedStatusSql, getSellerStoreName, getApprovedSellerIdsSet, isStoreVisibleSellerProduct } = require('./src/routes/seller-settings')
    httpApp.use('/', createSellerSettingsRouter())

    // ── Seller Auth ───────────────────────────────────────────────────────────
    httpApp.use('/', createSellerAuthRouter())

    // --- Platform Checkout + Store Public: extracted to src/routes/platform-checkout.js ---
    const { createPlatformCheckoutRouter, loadPlatformCheckoutRow, resolveStripeSecretKeyFromPlatform, resolveStripePublishableFromPlatform, paymentMethodTypesFromPlatformRow } = require('./src/routes/platform-checkout')
    httpApp.use('/', createPlatformCheckoutRouter({ requireSuperuser }))

    // --- Store Products + Brands: extracted to src/routes/store-products.js ---
    const { createStoreProductsRouter, normalizeStoreEan, parseVariantsArray, extractEanFromHubProductRow, resolveUploadUrl, mapAdminHubToStoreProduct, getBestsellerProductIds, isUuidLike, getAdminHubCollectionIdByHandle } = require('./src/routes/store-products')
    httpApp.use('/', createStoreProductsRouter())

    // --- Store Checkout (carts, payment intent, orders, customers, shipping groups): extracted to src/routes/store-checkout.js ---
    const { createStoreCheckoutRouter, verifyCustomerToken, signCustomerToken, customerIdForPg, appendBonusLedger, stripLegacyBonusLedgerVersandSuffix, buildOrderSettlementBreakdown, sellerOrderRevenueBasisCents, resolvePlatformApplicationFeeCents, platformCommissionCentsFromMerchandise, normalizeCouponCode, bonusPointsEarnedFromOrderPaidCents, getOrderWithItems, resolveSellerDisplayNameForStripe, truncateForStripeDescription, computeCartCheckoutMoney } = require('./src/routes/store-checkout')
    httpApp.use('/', createStoreCheckoutRouter())

    // --- Store Public (collections, categories, menus, page-by-label-slug): extracted to src/routes/store-public.js ---
    const createStorePublicRouter = require('./src/routes/store-public')
    httpApp.use('/', createStorePublicRouter())

    // --- Admin Hub Media: extracted to src/routes/media.js ---
    const createMediaRouter = require('./src/routes/media')
    httpApp.use('/', createMediaRouter())

    // Shared Postgres client factory — still used by many not-yet-extracted
    // admin-hub sections below (orders, pages, campaigns, etc.).
    const getDbClient = () => {
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      if (!dbUrl || !dbUrl.startsWith('postgres')) return null
      const { Client } = require('pg')
      const isRender = dbUrl.includes('render.com')
      return new Client({ connectionString: dbUrl, ssl: isRender ? { rejectUnauthorized: false } : false })
    }

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
        const r = await client.query(`SELECT o.id, o.order_number, o.order_status, o.payment_status, o.delivery_status, o.seller_id, o.email, o.first_name, o.last_name, o.phone, o.address_line1, o.address_line2, o.city, o.postal_code, o.country, o.subtotal_cents, o.total_cents, o.shipping_cents, o.discount_cents, o.currency, o.payment_intent_id, o.cart_id, o.created_at, o.is_guest, o.tracking_number, o.carrier_name, o.shipped_at, o.sendcloud_label_url, c.customer_number, c.id AS customer_id, (c.password_hash IS NOT NULL) AS c_is_registered FROM store_orders o LEFT JOIN store_customers c ON LOWER(c.email) = LOWER(o.email) ${where} ORDER BY ${orderBy} LIMIT $${params.length+1} OFFSET $${params.length+2}`, [...params, lim, off])
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
          sendcloud_label_url: row.sendcloud_label_url || null,
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
        let sellerInfoHub = null
        let shopLogoUrl = ''
        try {
          if (row.seller_id && row.seller_id !== 'default') {
            const sr = await client.query(
              `SELECT store_name, company_name, first_name, last_name, vat_id, email, business_address
                 FROM seller_users WHERE seller_id = $1 LIMIT 1`,
              [row.seller_id],
            )
            sellerInfoHub = sr.rows?.[0] || null
          }
          const lr = await client.query("SELECT shop_logo_url FROM admin_hub_seller_settings WHERE seller_id='default' LIMIT 1")
          shopLogoUrl = lr.rows?.[0]?.shop_logo_url || ''
        } catch (_) {}
        await client.end()
        client = null
        let shopLogoBuffer = null
        if (shopLogoUrl) {
          try {
            shopLogoBuffer = await new Promise((resolve) => {
              const mod = shopLogoUrl.startsWith('https') ? require('https') : require('http')
              const req = mod.get(shopLogoUrl, { timeout: 5000 }, (r) => {
                if (r.statusCode !== 200) { r.resume(); return resolve(null) }
                const chunks = []; r.on('data', (c) => chunks.push(c)); r.on('end', () => resolve(Buffer.concat(chunks))); r.on('error', () => resolve(null))
              })
              req.on('error', () => resolve(null)); req.on('timeout', () => { req.destroy(); resolve(null) })
            })
          } catch (_) {}
        }
        const on = row.order_number != null ? String(row.order_number) : String(id).slice(0, 8)
        const shopName = process.env.SHOP_INVOICE_NAME || 'Andertal'
        const pdfLocale = String(req.query?.locale || 'de').slice(0, 2).toLowerCase()
        res.setHeader('Content-Type', 'application/pdf')
        res.setHeader('Content-Disposition', `attachment; filename="${getOrderPdfFilename('invoice', on, pdfLocale)}"`)
        const doc = new PDFDocument({ margin: 42, size: 'A4', compress: false, pdfVersion: '1.7' })
        doc.pipe(res)
        renderInvoicePdfDocument(doc, {
          row,
          itemRows,
          orderId: id,
          invoiceNumber: on,
          shopName,
          sellerInfo: sellerInfoHub,
          shopLogoBuffer,
          locale: pdfLocale,
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
        let lieferscheinLogoUrl = ''
        try {
          const lr = await client.query("SELECT shop_logo_url FROM admin_hub_seller_settings WHERE seller_id='default' LIMIT 1")
          lieferscheinLogoUrl = lr.rows?.[0]?.shop_logo_url || ''
        } catch (_) {}
        await client.end()
        client = null
        let lieferscheinLogoBuffer = null
        if (lieferscheinLogoUrl) {
          try {
            lieferscheinLogoBuffer = await new Promise((resolve) => {
              const mod = lieferscheinLogoUrl.startsWith('https') ? require('https') : require('http')
              const req = mod.get(lieferscheinLogoUrl, { timeout: 5000 }, (r) => {
                if (r.statusCode !== 200) { r.resume(); return resolve(null) }
                const chunks = []; r.on('data', (c) => chunks.push(c)); r.on('end', () => resolve(Buffer.concat(chunks))); r.on('error', () => resolve(null))
              })
              req.on('error', () => resolve(null)); req.on('timeout', () => { req.destroy(); resolve(null) })
            })
          } catch (_) {}
        }
        const on = row.order_number != null ? String(row.order_number) : String(id).slice(0, 8)
        const shopName = process.env.SHOP_INVOICE_NAME || 'Andertal'
        const pdfLocale = String(req.query?.locale || 'de').slice(0, 2).toLowerCase()
        res.setHeader('Content-Type', 'application/pdf')
        res.setHeader('Content-Disposition', `attachment; filename="${getOrderPdfFilename('lieferschein', on, pdfLocale)}"`)
        const doc = new PDFDocument({ margin: 42, size: 'A4', compress: false, pdfVersion: '1.7' })
        doc.pipe(res)
        renderLieferscheinPdfDocument(doc, {
          row,
          itemRows,
          invoiceNumber: on,
          shopName,
          shopLogoBuffer: lieferscheinLogoBuffer,
          locale: pdfLocale,
        })
        doc.end()
      } catch (e) {
        if (client) try { await client.end() } catch (_) {}
        if (!res.headersSent) res.status(500).json({ message: e?.message || 'PDF error' })
      }
    }

    /**
     * GET /admin-hub/v1/orders/:id/pdf/provisionsfaktur
     * Generates a commission invoice (Provisionsfaktur) from the platform to the seller.
     * Accessible by the seller who owns the order or by platform admins.
     */
    const adminHubOrderPdfProvisionsfakturGET = async (req, res) => {
      const id = (req.params.id || '').trim()
      if (!id) return res.status(400).json({ message: 'id required' })
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      if (!dbUrl) return res.status(503).json({ message: 'Database not configured' })
      const loggedSellerId = req.sellerUser?.seller_id || null
      let client
      try {
        const PDFDocument = require('pdfkit')
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        const oRes = await client.query(
          `SELECT id, order_number, seller_id, created_at, subtotal_cents, total_cents,
                  stripe_application_fee_cents, seller_net_after_commission_cents
             FROM store_orders WHERE id = $1::uuid`,
          [id],
        )
        const order = oRes.rows?.[0]
        if (!order) { await client.end(); return res.status(404).json({ message: 'Order not found' }) }
        if (loggedSellerId && order.seller_id !== loggedSellerId) {
          await client.end()
          return res.status(403).json({ message: 'Access denied' })
        }

        let sellerInfo = null
        try {
          if (order.seller_id && order.seller_id !== 'default') {
            const sr = await client.query(
              `SELECT store_name, company_name, first_name, last_name, vat_id, email, business_address
                 FROM seller_users WHERE seller_id = $1 LIMIT 1`,
              [order.seller_id],
            )
            sellerInfo = sr.rows?.[0] || null
          }
        } catch (_) {}

        await client.end(); client = null

        const storedFee = Number(order.stripe_application_fee_cents)
        const subtotal = Number(order.subtotal_cents || order.total_cents || 0)
        const commissionCents = Number.isFinite(storedFee) && storedFee > 0
          ? storedFee
          : Math.round(subtotal * 0.12)
        let commissionRatePct = null
        if (subtotal > 0 && commissionCents > 0) {
          commissionRatePct = Math.round((commissionCents / subtotal) * 100 * 10) / 10
        }

        const shopName = process.env.SHOP_INVOICE_NAME || 'Andertal Marktplatz'
        const platformAddress = process.env.PLATFORM_INVOICE_ADDRESS || ''
        const platformVatId = process.env.PLATFORM_VAT_ID || ''
        const platformVatPercent = Number(process.env.PLATFORM_VAT_PERCENT || '0')
        const on = order.order_number != null ? String(order.order_number) : String(id).slice(0, 8)

        res.setHeader('Content-Type', 'application/pdf')
        res.setHeader('Content-Disposition', `attachment; filename="Provisionsfaktur-${on}.pdf"`)
        const doc = new PDFDocument({ margin: 42, size: 'A4', compress: false, pdfVersion: '1.7' })
        doc.pipe(res)
        renderProvisionsfakturPdfDocument(doc, {
          order,
          sellerInfo,
          shopName,
          commissionCents,
          commissionRatePct,
          platformAddress,
          platformVatId,
          platformVatPercent,
        })
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
        // Auto-complete: paid + delivered → abgeschlossen (never when only versendet)
        await client.query(
          `UPDATE store_orders SET order_status = 'abgeschlossen', updated_at = now()
           WHERE id = $1::uuid AND payment_status = 'bezahlt' AND delivery_status = 'zugestellt'
           AND order_status NOT IN ('abgeschlossen','retoure','retoure_anfrage','refunded','storniert')`,
          [id]
        )
        // Guard: abgeschlossen only valid when zugestellt — revert stale state after versendet/offen
        await client.query(
          `UPDATE store_orders SET order_status = 'in_bearbeitung', updated_at = now()
           WHERE id = $1::uuid AND order_status = 'abgeschlossen' AND delivery_status != 'zugestellt'
           AND order_status NOT IN ('retoure','retoure_anfrage','refunded','storniert')`,
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
        // Auto-set delivery_status to versendet when tracking number is first added
        if (trackingChanged && !['versendet', 'zugestellt', 'shipped', 'delivered'].includes(prevRow.delivery_status)) {
          await client.query(
            `UPDATE store_orders SET delivery_status='versendet', updated_at=now() WHERE id=$1::uuid AND delivery_status NOT IN ('versendet','zugestellt','shipped','delivered')`,
            [id]
          )
        }
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
          void dispatchOrderFlowEvent('order_shipped', id)
        }
        if (deliveryStatusChangedToZugestellt) {
          void dispatchOrderFlowEvent('order_delivered', id)
        }
      } catch (e) {
        if (client) try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    const adminHubOrderDELETE = async (req, res) => {
      if (!req.sellerUser?.is_superuser) {
        return res.status(403).json({ message: 'Superuser access required' })
      }
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

    const storePresenceHeartbeatPOST = async (req, res) => {
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      if (!dbUrl.startsWith('postgres')) return res.status(503).json({ message: 'Database unavailable' })
      const body = req.body || {}
      const sessionId = String(body.session_id || '').trim().slice(0, 64)
      if (!sessionId || sessionId.length < 8) return res.status(400).json({ message: 'session_id required' })
      const pagePath = String(body.path || body.page_path || '/').trim().slice(0, 2000)
      const pageTitle = String(body.title || body.page_title || '').trim().slice(0, 500)
      const referrer = String(body.referrer || '').trim().slice(0, 2000)
      const userAgent = String(req.headers['user-agent'] || body.user_agent || '').trim().slice(0, 500)
      const ip = getClientIpFromRequest(req).slice(0, 45)
      const countryCode = String(
        req.headers['cf-ipcountry'] ||
        req.headers['x-vercel-ip-country'] ||
        body.country_code ||
        '',
      ).trim().toUpperCase().slice(0, 8) || null
      const city = String(req.headers['cf-ipcity'] || req.headers['x-vercel-ip-city'] || body.city || '').trim().slice(0, 120) || null
      const region = String(req.headers['cf-region'] || req.headers['x-vercel-ip-country-region'] || body.region || '').trim().slice(0, 120) || null
      const deviceType = detectDeviceType(userAgent)
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        await client.query(`DELETE FROM shop_live_presence WHERE last_seen_at < now() - interval '3 minutes'`)
        await client.query(
          `INSERT INTO shop_live_presence (
            session_id, ip_address, country_code, city, region, page_path, page_title, referrer, user_agent, device_type, first_seen_at, last_seen_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now(), now())
          ON CONFLICT (session_id) DO UPDATE SET
            ip_address = EXCLUDED.ip_address,
            country_code = COALESCE(EXCLUDED.country_code, shop_live_presence.country_code),
            city = COALESCE(EXCLUDED.city, shop_live_presence.city),
            region = COALESCE(EXCLUDED.region, shop_live_presence.region),
            page_path = EXCLUDED.page_path,
            page_title = EXCLUDED.page_title,
            referrer = EXCLUDED.referrer,
            user_agent = EXCLUDED.user_agent,
            device_type = EXCLUDED.device_type,
            last_seen_at = now()`,
          [sessionId, ip || null, countryCode, city, region, pagePath, pageTitle || null, referrer || null, userAgent || null, deviceType],
        )
        await client.end()
        res.json({ ok: true })
      } catch (e) {
        if (client) try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    const adminHubLiveVisitorsGET = async (req, res) => {
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      if (!dbUrl.startsWith('postgres')) return res.status(503).json({ message: 'Database unavailable' })
      const sort = String(req.query.sort || 'last_seen_desc')
      const country = String(req.query.country || '').trim().toUpperCase()
      const q = String(req.query.q || '').trim().toLowerCase()
      let orderBy = 'last_seen_at DESC'
      if (sort === 'last_seen_asc') orderBy = 'last_seen_at ASC'
      else if (sort === 'country_asc') orderBy = 'country_code ASC NULLS LAST, last_seen_at DESC'
      else if (sort === 'page_asc') orderBy = 'page_path ASC NULLS LAST, last_seen_at DESC'
      else if (sort === 'ip_asc') orderBy = 'ip_address ASC NULLS LAST, last_seen_at DESC'
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        await client.query(`DELETE FROM shop_live_presence WHERE last_seen_at < now() - interval '3 minutes'`)
        const params = []
        const where = ["last_seen_at >= now() - interval '3 minutes'"]
        if (country) {
          params.push(country)
          where.push(`UPPER(COALESCE(country_code, '')) = $${params.length}`)
        }
        if (q) {
          params.push(`%${q}%`)
          const i = params.length
          where.push(`(
            LOWER(COALESCE(ip_address, '')) LIKE $${i}
            OR LOWER(COALESCE(city, '')) LIKE $${i}
            OR LOWER(COALESCE(page_path, '')) LIKE $${i}
            OR LOWER(COALESCE(page_title, '')) LIKE $${i}
            OR LOWER(COALESCE(region, '')) LIKE $${i}
          )`)
        }
        const sql = `SELECT session_id, ip_address, country_code, city, region, page_path, page_title, referrer, user_agent, device_type, first_seen_at, last_seen_at
          FROM shop_live_presence
          WHERE ${where.join(' AND ')}
          ORDER BY ${orderBy}`
        const { rows } = await client.query(sql, params)
        await client.end()
        res.json({ count: rows.length, visitors: rows })
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
                 (
                   COALESCE(s.newsletter_opted_in, false)
                   OR EXISTS (
                     SELECT 1
                     FROM store_newsletter_subscribers ns
                     WHERE LOWER(TRIM(ns.email)) = LOWER(TRIM(c.email))
                       AND ns.status = 'active'
                   )
                 ) AS newsletter_opted_in,
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
        const subR = await client.query(
          `SELECT 1
           FROM store_newsletter_subscribers
           WHERE LOWER(TRIM(email)) = LOWER(TRIM($1))
             AND status = 'active'
           LIMIT 1`,
          [row.email]
        )
        const newsletterOptedIn = orders.some(o => o.newsletter_opted_in) || !!subR.rows?.[0]
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

    // Returns order row if the caller has access (direct seller_id match OR via seller listings)
    const sellerOrderAccessSQL = (isSuperuser) => isSuperuser
      ? ''
      : ` AND (seller_id=$2 OR EXISTS (SELECT 1 FROM store_order_items oi WHERE oi.order_id=store_orders.id AND (EXISTS (SELECT 1 FROM admin_hub_seller_listings sl WHERE sl.product_id::text=oi.product_id::text AND sl.seller_id=$2) OR EXISTS (SELECT 1 FROM admin_hub_products ap WHERE ap.id::text=oi.product_id::text AND ap.seller_id=$2))))`

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
          'SELECT id, carrier_name, tracking_number FROM store_orders WHERE id=$1::uuid' + sellerOrderAccessSQL(isSuperuser),
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
          'SELECT id FROM store_orders WHERE id=$1::uuid' + sellerOrderAccessSQL(isSuperuser),
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
        const sellerEventAccessSQL = isSuperuser ? '' : ` AND (o.seller_id=$2 OR EXISTS (SELECT 1 FROM store_order_items oi WHERE oi.order_id=o.id AND (EXISTS (SELECT 1 FROM admin_hub_seller_listings sl WHERE sl.product_id::text=oi.product_id::text AND sl.seller_id=$2) OR EXISTS (SELECT 1 FROM admin_hub_products ap WHERE ap.id::text=oi.product_id::text AND ap.seller_id=$2))))`
        const ownerCheck = await client.query(
          `SELECT e.id FROM store_shipment_events e JOIN store_orders o ON o.id=e.order_id WHERE e.id=$1::uuid` + sellerEventAccessSQL,
          isSuperuser ? [eventId] : [eventId, callerSellerId]
        )
        if (!ownerCheck.rows[0]) { await client.end(); return res.status(404).json({ message: 'Event not found' }) }
        if (!isSuperuser) {
          await client.end()
          return res.status(403).json({ message: 'Shipment events cannot be deleted' })
        }
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
          'SELECT id, carrier_name, tracking_number, postal_code FROM store_orders WHERE id=$1::uuid' + sellerOrderAccessSQL(isSuperuser),
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
        // ── DPD API (public REST, no key required) ───────────────────────────
        else if (carrierName === 'dpd' || carrierName.startsWith('dpd')) {
          try {
            const https = require('https')
            const dpdData = await new Promise((resolve) => {
              const path = `/parcel/${encodeURIComponent(trackingNumber)}/de_DE/parcelstatus`
              const req2 = https.request(
                { hostname: 'tracking.dpd.de', path, method: 'GET', headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0' } },
                (resp) => {
                  let body = ''; resp.on('data', d => { body += d }); resp.on('end', () => { try { resolve({ data: JSON.parse(body), status: resp.statusCode }) } catch { resolve({ data: {}, status: resp.statusCode }) } })
                }
              )
              req2.on('error', () => resolve({ data: {}, status: 0 })); req2.end()
            })
            if (dpdData.status >= 400) {
              fetchError = `DPD (${dpdData.status}): Sendung nicht gefunden`
            } else {
              const steps = dpdData.data?.parcelStatusList || []
              for (const step of steps) {
                const desc = (step.label || step.description || '').trim()
                const rawDate = step.date || ''; const rawTime = step.time || '00:00:00'
                const ts = rawDate ? new Date(`${rawDate}T${rawTime}`).toISOString() : new Date().toISOString()
                const loc = step.city || null
                const descLower = desc.toLowerCase()
                let status = 'in_transit'
                if (descLower.includes('zugestellt') || descLower.includes('übergeben an') || descLower.includes('delivered')) status = 'zugestellt'
                else if (descLower.includes('aufgabe') || descLower.includes('übergabe an dpd') || descLower.includes('abgegeben')) status = 'versendet'
                newEvents.push({ status, description: desc || '—', location: loc, event_time: ts })
              }
              if (newEvents.length) newEvents.sort((a, b) => new Date(a.event_time) - new Date(b.event_time))
            }
          } catch (e) { fetchError = e?.message || 'DPD Tracking error' }
        }
        // ── GLS API (public REST, no key required) ───────────────────────────
        else if (carrierName === 'gls' || carrierName.startsWith('gls')) {
          try {
            const https = require('https')
            const glsData = await new Promise((resolve) => {
              const path = `/app/service/open/rest/DE/de/rstt001/?match=${encodeURIComponent(trackingNumber)}&type=standard&caller=witt&milis=${Date.now()}`
              const req2 = https.request(
                { hostname: 'gls-group.com', path, method: 'GET', headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0' } },
                (resp) => {
                  let body = ''; resp.on('data', d => { body += d }); resp.on('end', () => { try { resolve({ data: JSON.parse(body), status: resp.statusCode }) } catch { resolve({ data: {}, status: resp.statusCode }) } })
                }
              )
              req2.on('error', () => resolve({ data: {}, status: 0 })); req2.end()
            })
            if (glsData.status >= 400) {
              fetchError = `GLS (${glsData.status}): Sendung nicht gefunden`
            } else {
              const tuples = glsData.data?.tuples || []
              for (const tuple of tuples) {
                for (const ev of (tuple.history || [])) {
                  const desc = (ev.evtDscr || ev.description || '').trim()
                  const dateStr = ev.date || ''; const timeStr = ev.time || '00:00'
                  const ts = dateStr ? new Date(`${dateStr}T${timeStr}:00`).toISOString() : new Date().toISOString()
                  const loc = ev.location || null
                  const descLower = desc.toLowerCase()
                  let status = 'in_transit'
                  if (descLower.includes('zugestellt') || descLower.includes('delivered')) status = 'zugestellt'
                  else if (descLower.includes('aufgabe') || descLower.includes('einlieferung') || descLower.includes('paketshop')) status = 'versendet'
                  newEvents.push({ status, description: desc || '—', location: loc, event_time: ts })
                }
              }
              if (newEvents.length) newEvents.sort((a, b) => new Date(a.event_time) - new Date(b.event_time))
            }
          } catch (e) { fetchError = e?.message || 'GLS Tracking error' }
        }
        // ── UPS API (requires Client-ID + Secret as api_key:api_secret) ──────
        else if (carrierName === 'ups') {
          if (!apiKey) {
            fetchError = 'UPS Client-ID fehlt: unter Einstellungen → Versand → Versanddienstleister „UPS" API-Key (Client-ID) und ggf. API-Secret eintragen.'
          } else {
            try {
              const https = require('https')
              const apiSecret = (carrierRow.api_secret && String(carrierRow.api_secret).trim()) || ''
              const creds = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64')
              const tokenBody = 'grant_type=client_credentials'
              const tokenData = await new Promise((resolve) => {
                const req2 = https.request(
                  { hostname: 'onlinetools.ups.com', path: '/security/v1/oauth/token', method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Basic ${creds}`, 'Content-Length': Buffer.byteLength(tokenBody) } },
                  (resp) => { let b = ''; resp.on('data', d => { b += d }); resp.on('end', () => { try { resolve(JSON.parse(b)) } catch { resolve({}) } }) }
                )
                req2.on('error', () => resolve({})); req2.write(tokenBody); req2.end()
              })
              const accessToken = tokenData.access_token
              if (!accessToken) {
                fetchError = 'UPS OAuth2 fehlgeschlagen — Client-ID und Secret prüfen.'
              } else {
                const upsData = await new Promise((resolve) => {
                  const req2 = https.request(
                    { hostname: 'onlinetools.ups.com', path: `/api/track/v1/details/${encodeURIComponent(trackingNumber)}`, method: 'GET', headers: { Authorization: `Bearer ${accessToken}`, transId: `order-${id}`, transactionSrc: 'andertal', Accept: 'application/json' } },
                    (resp) => { let b = ''; resp.on('data', d => { b += d }); resp.on('end', () => { try { resolve({ data: JSON.parse(b), status: resp.statusCode }) } catch { resolve({ data: {}, status: resp.statusCode }) } }) }
                  )
                  req2.on('error', () => resolve({ data: {}, status: 0 })); req2.end()
                })
                if (upsData.status >= 400) {
                  fetchError = `UPS API (${upsData.status}): ${upsData.data?.response?.errors?.[0]?.message || 'Fehler'}`
                } else {
                  const activities = upsData.data?.trackResponse?.shipment?.[0]?.package?.[0]?.activity || []
                  for (const act of activities) {
                    const desc = (act.status?.description || '').trim()
                    const loc = [act.location?.address?.city, act.location?.address?.countryCode].filter(Boolean).join(', ') || null
                    const d = act.date || ''; const t = act.time || '000000'
                    const ts = d.length === 8 ? new Date(`${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}T${t.slice(0,2)}:${t.slice(2,4)}:${t.slice(4,6)}`).toISOString() : new Date().toISOString()
                    const statusCode = String(act.status?.type || '').toUpperCase()
                    let status = 'in_transit'
                    if (statusCode === 'D' || statusCode === 'P') status = 'zugestellt'
                    else if (statusCode === 'M' || statusCode === 'O') status = 'versendet'
                    newEvents.push({ status, description: desc || '—', location: loc, event_time: ts })
                  }
                  if (newEvents.length) newEvents.sort((a, b) => new Date(a.event_time) - new Date(b.event_time))
                }
              }
            } catch (e) { fetchError = e?.message || 'UPS API error' }
          }
        }

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

    // ── Sendcloud label purchase flow ─────────────────────────────────────────

    const sellerTechnicalMessage = (locale) => {
      const loc = String(locale || 'de').slice(0, 2).toLowerCase()
      if (loc === 'tr') return 'Teknik bir sorun nedeniyle işlem şu an tamamlanamıyor. Ekibimiz bilgilendirildi — en kısa sürede ilgileneceğiz.'
      if (loc === 'en') return 'This action could not be completed due to a technical issue. Our team has been notified and will resolve it shortly.'
      return 'Aus technischen Gründen konnte die Aktion nicht abgeschlossen werden. Unser Team wurde informiert und kümmert sich darum.'
    }

    const respondSellerSystemError = async (req, res, { status = 503, errorCode, errorMessage, terminalOutput, context, sellerId }) => {
      const isSuperuser = req.sellerUser?.is_superuser === true
      const locale = req.body?.locale || req.query?.locale || 'de'
      await logSellerError(sellerId || req.sellerUser?.seller_id || null, {
        errorCode: errorCode || 'SYSTEM_ERROR',
        errorMessage: errorMessage || 'Unbekannter Systemfehler',
        terminalOutput: terminalOutput || null,
        context: context || null,
      })
      const userMessage = isSuperuser ? (errorMessage || sellerTechnicalMessage(locale)) : sellerTechnicalMessage(locale)
      return res.status(status).json({ message: userMessage, code: errorCode || 'SYSTEM_ERROR' })
    }

    const getSendcloudCredentials = async (pgClient) => {
      const r = await pgClient.query(
        `SELECT api_key, api_secret, config FROM store_integrations WHERE LOWER(TRIM(slug))='sendcloud' AND seller_scope_key='platform' LIMIT 1`
      )
      const row = r.rows[0]
      if (!row) return { public_key: '', secret_key: '', markup_pct: 5 }
      let extraCfg = {}
      try { extraCfg = typeof row.config === 'string' ? JSON.parse(row.config) : (row.config || {}) } catch (_) {}
      return { public_key: row.api_key || '', secret_key: row.api_secret || '', markup_pct: extraCfg.markup_pct ?? 5 }
    }

    const sendcloudRequest = async (path, { public_key, secret_key }, opts = {}) => {
      const https = require('https')
      const creds = Buffer.from(`${public_key}:${secret_key}`).toString('base64')
      const url = new URL('https://panel.sendcloud.sc' + path)
      return new Promise((resolve, reject) => {
        const req = https.request({ hostname: url.hostname, path: url.pathname + url.search, method: opts.method || 'GET',
          headers: { 'Authorization': `Basic ${creds}`, 'Content-Type': 'application/json', 'Accept': 'application/json' }
        }, (resp) => {
          let body = ''
          resp.on('data', d => { body += d })
          resp.on('end', () => {
            try { resolve({ status: resp.statusCode, data: JSON.parse(body || '{}') }) }
            catch { resolve({ status: resp.statusCode, data: {} }) }
          })
        })
        req.on('error', reject)
        if (opts.body) req.write(opts.body)
        req.end()
      })
    }

    const adminHubLabelRatesPOST = async (req, res) => {
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      const id = (req.params.id || '').trim()
      const isSuperuser = req.sellerUser?.is_superuser === true
      const callerSellerId = req.sellerUser?.seller_id || null
      if (!id) return res.status(400).json({ message: 'id required' })
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        const ownerCheck = await client.query(
          'SELECT id, country, postal_code FROM store_orders WHERE id=$1::uuid' + sellerOrderAccessSQL(isSuperuser),
          isSuperuser ? [id] : [id, callerSellerId]
        )
        if (!ownerCheck.rows[0]) { await client.end(); return res.status(404).json({ message: 'Order not found' }) }
        const order = ownerCheck.rows[0]
        const sc = await getSendcloudCredentials(client)
        await client.end()
        if (!sc.public_key || !sc.secret_key) {
          return respondSellerSystemError(req, res, {
            errorCode: 'SENDCLOUD_NOT_CONFIGURED',
            errorMessage: 'Sendcloud nicht konfiguriert (API-Schlüssel fehlen)',
            sellerId: callerSellerId,
            context: JSON.stringify({ order_id: id, endpoint: 'label/rates' }),
          })
        }
        const { weight_kg = 1, length_cm = 30, width_cm = 20, height_cm = 15, locale = 'de' } = req.body || {}
        const weightG = Math.round(Number(weight_kg) * 1000) || 1000
        const toCountry = (order.country || 'DE').trim().toUpperCase().slice(0, 2)
        const length = Math.round(Number(length_cm) || 30)
        const width = Math.round(Number(width_cm) || 20)
        const height = Math.round(Number(height_cm) || 15)
        const qs = `?from_country=DE&to_country=${toCountry}&weight=${weightG}&length=${length}&width=${width}&height=${height}`
        const resp = await sendcloudRequest('/api/v2/shipping_products' + qs, sc)
        if (resp.status >= 400) {
          return respondSellerSystemError(req, res, {
            errorCode: 'SENDCLOUD_API_ERROR',
            errorMessage: `Sendcloud API ${resp.status}: ${JSON.stringify(resp.data?.error || resp.data)}`,
            terminalOutput: JSON.stringify(resp.data || {}),
            sellerId: callerSellerId,
            context: JSON.stringify({ order_id: id, endpoint: 'label/rates', qs }),
          })
        }
        const products = resp.data?.shipping_products || []
        const markup = 1 + (Number(sc.markup_pct) || 5) / 100
        const rates = []
        for (const prod of products) {
          for (const method of (prod.methods || [])) {
            const price = method.price?.total_price ?? null
            if (price == null) continue
            const leadHours = method.lead_time_hours != null ? Number(method.lead_time_hours) : null
            let deliveryDays = null
            if (leadHours != null) {
              if (leadHours <= 24) deliveryDays = 'Lieferung am nächsten Werktag'
              else if (leadHours <= 48) deliveryDays = 'Lieferung in 1–2 Werktagen'
              else if (leadHours <= 72) deliveryDays = 'Lieferung in 2–3 Werktagen'
              else deliveryDays = `Lieferung in ca. ${Math.ceil(leadHours / 24)} Werktagen`
            }
            rates.push({
              service_id: method.id,
              name: `${prod.name}${method.name && method.name !== prod.name ? ' — ' + method.name : ''}`,
              carrier: prod.carrier?.code || (prod.name || '').toLowerCase(),
              price_eur: Math.round(Number(price) * markup * 100) / 100,
              price_base: Math.round(Number(price) * 100) / 100,
              min_weight: method.min_weight,
              max_weight: method.max_weight,
              delivery_days: deliveryDays,
              tracking: method.tracking != null ? Boolean(method.tracking) : true,
            })
          }
        }
        rates.sort((a, b) => a.price_eur - b.price_eur)
        if (rates.length === 0) {
          return respondSellerSystemError(req, res, {
            errorCode: 'SENDCLOUD_NO_RATES',
            errorMessage: `Keine Versandoptionen für ${toCountry}, ${weightG}g, ${length}×${width}×${height} cm. Sendcloud-Produkte: ${products.length}`,
            sellerId: callerSellerId,
            context: JSON.stringify({ order_id: id, endpoint: 'label/rates', to_country: toCountry, weight_g: weightG, products_count: products.length }),
          })
        }
        res.json({ rates, to_country: toCountry, markup_pct: sc.markup_pct })
      } catch (e) {
        if (client) try { await client.end() } catch (_) {}
        return respondSellerSystemError(req, res, {
          errorCode: 'LABEL_RATES_ERROR',
          errorMessage: e?.message || 'Versandoptionen konnten nicht geladen werden',
          terminalOutput: e?.stack || null,
          sellerId: callerSellerId,
          context: JSON.stringify({ order_id: id, endpoint: 'label/rates' }),
        })
      }
    }

    const adminHubLabelCheckoutPOST = async (req, res) => {
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      const id = (req.params.id || '').trim()
      const isSuperuser = req.sellerUser?.is_superuser === true
      const callerSellerId = req.sellerUser?.seller_id || null
      if (!id) return res.status(400).json({ message: 'id required' })
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        const ownerCheck = await client.query(
          'SELECT id, first_name, last_name, email, country, postal_code, city, address_line1, address_line2 FROM store_orders WHERE id=$1::uuid' + sellerOrderAccessSQL(isSuperuser),
          isSuperuser ? [id] : [id, callerSellerId]
        )
        if (!ownerCheck.rows[0]) { await client.end(); return res.status(404).json({ message: 'Order not found' }) }
        const checkoutRow = await loadPlatformCheckoutRow(client)
        const secretKey = resolveStripeSecretKeyFromPlatform(checkoutRow)
        await client.end()
        if (!secretKey) {
          return respondSellerSystemError(req, res, {
            errorCode: 'STRIPE_NOT_CONFIGURED',
            errorMessage: 'Stripe nicht konfiguriert (Label-Checkout)',
            sellerId: callerSellerId,
            context: JSON.stringify({ order_id: id, endpoint: 'label/checkout' }),
          })
        }
        const { service_id, service_name, carrier, price_eur, weight_kg, length_cm, width_cm, height_cm, locale = 'de' } = req.body || {}
        if (!service_id || !price_eur) return res.status(400).json({ message: 'service_id und price_eur erforderlich' })
        const stripe = new (require('stripe'))(secretKey)
        const SELLERCENTRAL_URL = (process.env.SELLERCENTRAL_URL || 'http://localhost:3002').replace(/\/$/, '')
        const session = await stripe.checkout.sessions.create({
          payment_method_types: ['card'],
          mode: 'payment',
          line_items: [{
            price_data: {
              currency: 'eur',
              product_data: { name: `Versandetikett — ${service_name || carrier || 'Sendcloud'}`, description: `Bestellung #${ownerCheck.rows[0].id.slice(0,8)}` },
              unit_amount: Math.round(Number(price_eur) * 100),
            },
            quantity: 1,
          }],
          metadata: { order_id: id, service_id: String(service_id), service_name: service_name || '', carrier: carrier || '', weight_kg: String(weight_kg||1), length_cm: String(length_cm||30), width_cm: String(width_cm||20), height_cm: String(height_cm||15), seller_id: callerSellerId || 'platform' },
          success_url: `${SELLERCENTRAL_URL}/${locale}/orders?label_session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${SELLERCENTRAL_URL}/${locale}/orders?label_cancel=1`,
        })
        res.json({ checkout_url: session.url })
      } catch (e) {
        if (client) try { await client.end() } catch (_) {}
        return respondSellerSystemError(req, res, {
          errorCode: 'LABEL_CHECKOUT_ERROR',
          errorMessage: e?.message || 'Checkout konnte nicht erstellt werden',
          terminalOutput: e?.stack || null,
          sellerId: callerSellerId,
          context: JSON.stringify({ order_id: id, endpoint: 'label/checkout' }),
        })
      }
    }

    const adminHubLabelFulfillPOST = async (req, res) => {
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      const { session_id } = req.body || {}
      if (!session_id) return res.status(400).json({ message: 'session_id required' })
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        const checkoutRow = await loadPlatformCheckoutRow(client)
        const secretKey = resolveStripeSecretKeyFromPlatform(checkoutRow)
        if (!secretKey) {
          await client.end()
          return respondSellerSystemError(req, res, {
            errorCode: 'STRIPE_NOT_CONFIGURED',
            errorMessage: 'Stripe nicht konfiguriert (Label-Fulfill)',
            sellerId: req.sellerUser?.seller_id || null,
            context: JSON.stringify({ session_id, endpoint: 'label/fulfill' }),
          })
        }
        const stripe = new (require('stripe'))(secretKey)
        const session = await stripe.checkout.sessions.retrieve(session_id)
        if (session.payment_status !== 'paid') { await client.end(); return res.status(400).json({ message: 'Zahlung nicht abgeschlossen' }) }
        const meta = session.metadata || {}
        const orderId = meta.order_id
        if (!orderId) { await client.end(); return res.status(400).json({ message: 'Keine Bestell-ID in Session' }) }
        // Check if already fulfilled (tracking already set via this session)
        const labelCheckR = await client.query(`SELECT sendcloud_label_url, tracking_number FROM store_orders WHERE id=$1::uuid`, [orderId])
        const existing = labelCheckR.rows[0]
        if (existing?.sendcloud_label_url) {
          await client.end()
          return res.json({ label_url: existing.sendcloud_label_url, tracking_number: existing.tracking_number, already_fulfilled: true })
        }
        const orderR = await client.query(`SELECT id, first_name, last_name, email, phone, country, postal_code, city, address_line1, address_line2 FROM store_orders WHERE id=$1::uuid`, [orderId])
        const order = orderR.rows[0]
        if (!order) { await client.end(); return res.status(404).json({ message: 'Bestellung nicht gefunden' }) }
        const sc = await getSendcloudCredentials(client)
        if (!sc.public_key || !sc.secret_key) {
          await client.end()
          return respondSellerSystemError(req, res, {
            errorCode: 'SENDCLOUD_NOT_CONFIGURED',
            errorMessage: 'Sendcloud nicht konfiguriert (Label-Erstellung nach Zahlung)',
            sellerId: meta.seller_id || req.sellerUser?.seller_id || null,
            context: JSON.stringify({ order_id: orderId, session_id, endpoint: 'label/fulfill' }),
          })
        }
        const parcelBody = JSON.stringify({ parcel: {
          name: [order.first_name, order.last_name].filter(Boolean).join(' ') || order.email || 'Kunde',
          address: order.address_line1 || '',
          address_2: order.address_line2 || '',
          city: order.city || '',
          postal_code: order.postal_code || '',
          country: { iso_2: (order.country || 'DE').toUpperCase() },
          telephone: order.phone || '',
          email: order.email || '',
          weight: String(Number(meta.weight_kg) || 1),
          length: meta.length_cm || '30',
          width: meta.width_cm || '20',
          height: meta.height_cm || '15',
          shipment: { id: Number(meta.service_id) },
          request_label: true,
          order_number: orderId.slice(0, 8),
        }})
        const scResp = await sendcloudRequest('/api/v2/parcels', sc, { method: 'POST', body: parcelBody })
        if (scResp.status >= 400) {
          await client.end()
          return respondSellerSystemError(req, res, {
            errorCode: 'SENDCLOUD_PARCEL_ERROR',
            errorMessage: `Sendcloud Fehler: ${JSON.stringify(scResp.data?.error || scResp.data)}`,
            terminalOutput: JSON.stringify(scResp.data || {}),
            sellerId: meta.seller_id || req.sellerUser?.seller_id || null,
            context: JSON.stringify({ order_id: orderId, session_id, service_id: meta.service_id, endpoint: 'label/fulfill' }),
          })
        }
        const parcel = scResp.data?.parcel || {}
        const trackingNumber = parcel.tracking_number || ''
        const labelUrl = parcel.label?.label_printer || parcel.label?.normal_printer || ''
        const carrierName = meta.carrier || meta.service_name || 'Sendcloud'
        await client.query(
          `UPDATE store_orders SET tracking_number=$1, carrier_name=$2, sendcloud_label_url=$3, delivery_status='versendet', shipped_at=COALESCE(shipped_at,now()), updated_at=now() WHERE id=$4::uuid`,
          [trackingNumber, carrierName, labelUrl, orderId]
        )
        await client.end()
        res.json({ label_url: labelUrl, tracking_number: trackingNumber, carrier_name: carrierName })
      } catch (e) {
        if (client) try { await client.end() } catch (_) {}
        return respondSellerSystemError(req, res, {
          errorCode: 'LABEL_FULFILL_ERROR',
          errorMessage: e?.message || 'Etikett konnte nicht erstellt werden',
          terminalOutput: e?.stack || null,
          sellerId: req.sellerUser?.seller_id || null,
          context: JSON.stringify({ session_id, endpoint: 'label/fulfill' }),
        })
      }
    }

    // ── Marketing Automations ─────────────────────────────────────────────────

    const adminHubAutomationsGET = async (req, res) => {
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      const sellerId = req.sellerUser?.seller_id || null
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        const rRules = await client.query(
          `SELECT type, is_active, config, triggered_count, updated_at FROM store_automation_rules WHERE seller_id=$1 ORDER BY type`,
          [sellerId || 'default']
        )
        const rStats = await client.query(
          `SELECT rule_type AS type, COUNT(*) AS count FROM store_automation_logs WHERE seller_id=$1 AND status='sent' GROUP BY rule_type`,
          [sellerId || 'default']
        )
        await client.end()
        const rules = (rRules.rows || []).map(r => ({
          type: r.type, is_active: r.is_active,
          config: typeof r.config === 'string' ? JSON.parse(r.config || '{}') : (r.config || {}),
          triggered_count: Number(r.triggered_count || 0),
          updated_at: r.updated_at,
        }))
        const stats = (rStats.rows || []).map(s => ({ type: s.type, count: Number(s.count) }))
        res.json({ rules, stats })
      } catch (e) {
        if (client) try { await client.end() } catch (_) {}
        res.json({ rules: [], stats: [] })
      }
    }

    const adminHubAutomationPUT = async (req, res) => {
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      const type = (req.params.type || '').trim()
      const sellerId = req.sellerUser?.seller_id || 'default'
      const { is_active = false, config = {} } = req.body || {}
      if (!type) return res.status(400).json({ message: 'type required' })
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        const configStr = JSON.stringify(config)
        await client.query(
          `INSERT INTO store_automation_rules (seller_id, type, is_active, config, triggered_count, created_at, updated_at)
           VALUES ($1,$2,$3,$4::jsonb,0,now(),now())
           ON CONFLICT (seller_id, type) DO UPDATE SET is_active=$3, config=$4::jsonb, updated_at=now()`,
          [sellerId, type, is_active, configStr]
        ).catch(async () => {
          // Fallback if jsonb cast fails — store as text
          const exists = await client.query(`SELECT id FROM store_automation_rules WHERE seller_id=$1 AND type=$2`, [sellerId, type])
          if (exists.rows[0]) {
            await client.query(`UPDATE store_automation_rules SET is_active=$3, config=$4, updated_at=now() WHERE seller_id=$1 AND type=$2`, [sellerId, type, is_active, configStr])
          } else {
            await client.query(`INSERT INTO store_automation_rules (seller_id, type, is_active, config, triggered_count) VALUES ($1,$2,$3,$4,0)`, [sellerId, type, is_active, configStr])
          }
        })
        await client.end()
        res.json({ ok: true })
      } catch (e) {
        if (client) try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    // Background automation runner (every 60 min)
    const runAutomations = async () => {
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      if (!dbUrl) return
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        const transport = await getSmtpTransport(client)
        if (!transport) { await client.end(); return }
        const fromAddr = process.env.SMTP_FROM || '"Andertal" <noreply@andertal.de>'

        // Fetch all active rules
        const rulesR = await client.query(`SELECT seller_id, type, config FROM store_automation_rules WHERE is_active=true`)
        for (const rule of (rulesR.rows || [])) {
          const cfg = typeof rule.config === 'string' ? JSON.parse(rule.config || '{}') : (rule.config || {})
          try {
            if (rule.type === 'low_stock_alert') {
              const threshold = Number(cfg.threshold) || 5
              const alertEmail = (cfg.alert_email || '').trim()
              if (!alertEmail) continue
              const products = await client.query(
                `SELECT id, title, inventory FROM admin_hub_products WHERE seller_id=$1 AND inventory <= $2 AND inventory IS NOT NULL AND status='published'`,
                [rule.seller_id, threshold]
              )
              for (const p of (products.rows || [])) {
                // Check not already alerted today
                const already = await client.query(
                  `SELECT id FROM store_automation_logs WHERE seller_id=$1 AND rule_type='low_stock_alert' AND target_id=$2 AND triggered_at > now()-interval '24 hours'`,
                  [rule.seller_id, p.id]
                )
                if (already.rows[0]) continue
                await transport.sendMail({
                  from: fromAddr, to: alertEmail,
                  subject: `⚠ Lagerbestand niedrig: ${p.title}`,
                  html: `<p>Das Produkt <strong>${p.title}</strong> hat nur noch <strong>${p.inventory}</strong> Einheiten auf Lager (Schwellenwert: ${threshold}).</p><p>Bitte bestand aufstocken.</p>`,
                })
                await client.query(
                  `INSERT INTO store_automation_logs (seller_id, rule_type, target_id, status, triggered_at) VALUES ($1,'low_stock_alert',$2,'sent',now())`,
                  [rule.seller_id, p.id]
                ).catch(() => {})
                await client.query(`UPDATE store_automation_rules SET triggered_count=triggered_count+1 WHERE seller_id=$1 AND type='low_stock_alert'`, [rule.seller_id]).catch(() => {})
              }
            }

            if (rule.type === 'review_request') {
              const delayDays = Number(cfg.delay_days) || 3
              const subject = cfg.email_subject || 'Wie war Ihre Bestellung? Ihre Meinung zählt!'
              const orders = await client.query(
                `SELECT id, email, first_name, last_name, order_number FROM store_orders
                 WHERE delivery_status='zugestellt' AND email IS NOT NULL
                 AND delivery_date <= now() - interval '${delayDays} days'
                 AND (seller_id=$1 OR seller_id='default')
                 LIMIT 50`,
                [rule.seller_id]
              )
              for (const o of (orders.rows || [])) {
                if (!o.email) continue
                const already = await client.query(
                  `SELECT id FROM store_automation_logs WHERE seller_id=$1 AND rule_type='review_request' AND target_id=$2`,
                  [rule.seller_id, o.id]
                )
                if (already.rows[0]) continue
                const name = [o.first_name, o.last_name].filter(Boolean).join(' ') || 'Kunde'
                await transport.sendMail({
                  from: fromAddr, to: o.email,
                  subject,
                  html: `<p>Hallo ${name},</p><p>wir hoffen, Ihre Bestellung #${o.order_number || ''} ist gut bei Ihnen angekommen. Wir würden uns sehr über Ihre Bewertung freuen!</p><p>Vielen Dank für Ihr Vertrauen.</p>`,
                })
                await client.query(
                  `INSERT INTO store_automation_logs (seller_id, rule_type, target_id, status, triggered_at) VALUES ($1,'review_request',$2,'sent',now())`,
                  [rule.seller_id, o.id]
                ).catch(() => {})
                await client.query(`UPDATE store_automation_rules SET triggered_count=triggered_count+1 WHERE seller_id=$1 AND type='review_request'`, [rule.seller_id]).catch(() => {})
              }
            }

            if (rule.type === 'welcome_email') {
              const subject = cfg.email_subject || 'Willkommen — danke für Ihr Vertrauen!'
              const orders = await client.query(
                `SELECT o.id, o.email, o.first_name, o.last_name, o.order_number
                 FROM store_orders o
                 WHERE (o.seller_id=$1 OR o.seller_id='default') AND o.email IS NOT NULL
                 AND NOT EXISTS (
                   SELECT 1 FROM store_orders o2 WHERE LOWER(o2.email)=LOWER(o.email) AND o2.id != o.id AND o2.created_at < o.created_at
                 )
                 AND NOT EXISTS (
                   SELECT 1 FROM store_automation_logs l WHERE l.seller_id=$1 AND l.rule_type='welcome_email' AND l.target_id=o.id
                 )
                 AND o.payment_status='bezahlt'
                 LIMIT 30`,
                [rule.seller_id]
              )
              for (const o of (orders.rows || [])) {
                if (!o.email) continue
                const name = [o.first_name, o.last_name].filter(Boolean).join(' ') || 'Kunde'
                await transport.sendMail({
                  from: fromAddr, to: o.email,
                  subject,
                  html: `<p>Hallo ${name},</p><p>herzlich willkommen! Wir freuen uns, Sie als neuen Kunden begrüßen zu dürfen. Ihre Bestellung #${o.order_number || ''} wird schnellstmöglich bearbeitet.</p>`,
                })
                await client.query(
                  `INSERT INTO store_automation_logs (seller_id, rule_type, target_id, status, triggered_at) VALUES ($1,'welcome_email',$2,'sent',now())`,
                  [rule.seller_id, o.id]
                ).catch(() => {})
                await client.query(`UPDATE store_automation_rules SET triggered_count=triggered_count+1 WHERE seller_id=$1 AND type='welcome_email'`, [rule.seller_id]).catch(() => {})
              }
            }
          } catch (ruleErr) {
            // Per-rule errors don't abort other rules
          }
        }
        await client.end()
      } catch (_) {
        if (client) try { await client.end() } catch (__) {}
      }
    }
    setTimeout(() => runAutomations().catch(() => {}), 5 * 60 * 1000)
    setInterval(() => runAutomations().catch(() => {}), 60 * 60 * 1000)

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

    // --- Sendcloud Platform Config: extracted to src/routes/store-integrations.js ---
    const createStoreIntegrationsRouter = require('./src/routes/store-integrations')
    httpApp.use('/', createStoreIntegrationsRouter())

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
      (process.env.PUBLIC_API_BASE_URL || process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || '').replace(/\/$/, '') ||
      'https://api.andertal.com'

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

    httpApp.get('/store/payment-methods', storePaymentMethodsGET)
    httpApp.post('/store/payment-methods/setup', storePaymentMethodsSetupPOST)
    httpApp.delete('/store/payment-methods/:pmId', storePaymentMethodsDELETE)
    httpApp.post('/store/presence/heartbeat', storePresenceHeartbeatPOST)

    httpApp.get('/admin-hub/v1/orders', adminHubOrdersGET)
    httpApp.post('/admin-hub/v1/orders', adminHubOrderPOST)
    httpApp.get('/admin-hub/v1/orders/:id/pdf/invoice', adminHubOrderPdfInvoiceGET)
    httpApp.get('/admin-hub/v1/orders/:id/pdf/lieferschein', adminHubOrderPdfLieferscheinGET)
    httpApp.get('/admin-hub/v1/orders/:id/pdf/provisionsfaktur', adminHubOrderPdfProvisionsfakturGET)
    httpApp.get('/admin-hub/v1/orders/:id/pdf/versandlabel', async (req, res) => {
      const id = (req.params.id || '').trim()
      if (!id) return res.status(400).json({ message: 'id required' })
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      if (!dbUrl) return res.status(503).json({ message: 'Database not configured' })
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        const r = await client.query('SELECT sendcloud_label_url, tracking_number FROM store_orders WHERE id=$1::uuid', [id])
        await client.end(); client = null
        const row = r.rows?.[0]
        if (!row) return res.status(404).json({ message: 'Order not found' })
        const labelUrl = row.sendcloud_label_url
        if (!labelUrl) return res.status(404).json({ message: 'Kein Versandlabel für diese Bestellung vorhanden.' })
        return res.redirect(302, labelUrl)
      } catch (e) {
        if (client) try { await client.end() } catch (_) {}
        if (!res.headersSent) res.status(500).json({ message: e?.message || 'Error' })
      }
    })
    httpApp.get('/admin-hub/v1/orders/:id/pdf/retoure', async (req, res) => {
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
        const oRes = await client.query('SELECT * FROM store_orders WHERE id=$1::uuid', [id])
        const row = oRes.rows?.[0]
        if (!row) { await client.end(); return res.status(404).json({ message: 'Order not found' }) }
        const rRes = await client.query('SELECT * FROM store_returns WHERE order_id=$1 ORDER BY created_at DESC LIMIT 1', [id])
        const returnRow = rRes.rows?.[0] || null
        await client.end(); client = null
        const on = row.order_number != null ? String(row.order_number) : String(id).slice(0, 8)
        const rn = returnRow?.return_number || `R-${on}`
        res.setHeader('Content-Type', 'application/pdf')
        res.setHeader('Content-Disposition', `attachment; filename="Retoure-${on}.pdf"`)
        const doc = new PDFDocument({ margin: 48, size: 'A4' })
        doc.pipe(res)
        doc.fontSize(20).fillColor('#111').text(pdfDeLatin('Retourenschein'), { align: 'center' })
        doc.moveDown(0.4)
        doc.fontSize(11).fillColor('#374151').text(pdfDeLatin(`Retoure-Nr.: ${rn}   ·   Bestellung: #${on}`), { align: 'center' })
        doc.moveDown(1.2)
        const boxTop = doc.y
        doc.rect(72, boxTop, 450, 60).fill('#f3f4f6')
        doc.fontSize(10).font('Helvetica-Bold').fillColor('#111827').text(pdfDeLatin('Retoure-Nummer (gut sichtbar aufs Paket kleben)'), 80, boxTop + 8, { width: 434, align: 'center' })
        doc.fontSize(30).font('Helvetica-Bold').text(rn, 72, boxTop + 18, { width: 450, align: 'center' })
        doc.y = boxTop + 70
        doc.font('Helvetica').fontSize(10).fillColor('#374151')
        doc.moveDown(1)
        const custName = [row.first_name, row.last_name].filter(Boolean).join(' ')
        doc.font('Helvetica-Bold').text(pdfDeLatin('Absender (Kunde)'))
        doc.font('Helvetica')
        ;[custName, row.address_line1, row.address_line2, [row.postal_code, row.city].filter(Boolean).join(' '), row.country].filter(Boolean).forEach((l) => doc.text(pdfDeLatin(l)))
        doc.moveDown(0.8)
        if (returnRow?.items && Array.isArray(returnRow.items)) {
          doc.font('Helvetica-Bold').text(pdfDeLatin('Zurückgesendete Artikel'))
          doc.font('Helvetica')
          returnRow.items.forEach((it) => {
            doc.text(pdfDeLatin(`- ${it.title || 'Artikel'} (Menge: ${it.quantity || 1})`))
          })
          doc.moveDown(0.6)
        }
        doc.font('Helvetica').fontSize(8.5).fillColor('#6b7280')
        doc.text(pdfDeLatin('Bitte legen Sie diesen Retourenschein gut sichtbar in das Paket. Vielen Dank!'), { width: 450 })
        doc.end()
      } catch (e) {
        if (client) try { await client.end() } catch (_) {}
        if (!res.headersSent) res.status(500).json({ message: e?.message || 'PDF error' })
      }
    })
    httpApp.get('/admin-hub/v1/orders/:id', adminHubOrderByIdGET)
    httpApp.patch('/admin-hub/v1/orders/:id', adminHubOrderPATCH)
    httpApp.delete('/admin-hub/v1/orders/:id', adminHubOrderDELETE)
    httpApp.get('/admin-hub/v1/orders/:id/shipment-events', adminHubShipmentEventsGET)
    httpApp.post('/admin-hub/v1/orders/:id/shipment-events', adminHubShipmentEventPOST)
    httpApp.delete('/admin-hub/v1/shipment-events/:eventId', adminHubShipmentEventDELETE)
    httpApp.post('/admin-hub/v1/orders/:id/refresh-tracking', adminHubOrderRefreshTrackingPOST)
    httpApp.post('/admin-hub/v1/orders/:id/label/rates', adminHubLabelRatesPOST)
    httpApp.post('/admin-hub/v1/orders/:id/label/checkout', adminHubLabelCheckoutPOST)
    httpApp.post('/admin-hub/v1/label/fulfill', adminHubLabelFulfillPOST)
    httpApp.get('/admin-hub/v1/live-visitors', requireSuperuser, adminHubLiveVisitorsGET)
    httpApp.get('/admin-hub/v1/customers', adminHubCustomersGET)
    httpApp.post('/admin-hub/v1/customers', adminHubCustomerPOST)
    httpApp.patch('/admin-hub/v1/customers/:id', adminHubCustomerPATCH)
    httpApp.delete('/admin-hub/v1/customers/:id', adminHubCustomerDELETE)
    httpApp.get('/admin-hub/v1/customers/:id', adminHubCustomerByIdGET)
    httpApp.post('/admin-hub/v1/customers/:id/discounts', adminHubCustomerDiscountPOST)
    httpApp.delete('/admin-hub/v1/customers/:customerId/discounts/:discountId', adminHubCustomerDiscountDELETE)
    httpApp.post('/admin-hub/v1/customers/:id/bonus-ledger', adminHubCustomerBonusLedgerPOST)
    httpApp.patch('/admin-hub/v1/customers/:customerId/bonus-ledger/:entryId', adminHubCustomerBonusLedgerPATCH)
    httpApp.delete('/admin-hub/v1/customers/:customerId/bonus-ledger/:entryId', adminHubCustomerBonusLedgerDELETE)
    httpApp.get('/admin-hub/v1/shipping-carriers', adminHubCarriersGET)
    httpApp.post('/admin-hub/v1/shipping-carriers', adminHubCarrierPOST)
    httpApp.patch('/admin-hub/v1/shipping-carriers/:id', adminHubCarrierPATCH)
    httpApp.delete('/admin-hub/v1/shipping-carriers/:id', adminHubCarrierDELETE)
    httpApp.get('/admin-hub/v1/integrations/trustpilot', requireSuperuser, adminHubTrustpilotGET)
    httpApp.put('/admin-hub/v1/integrations/trustpilot', requireSuperuser, adminHubTrustpilotPUT)
    httpApp.get('/admin-hub/v1/integrations', adminHubIntegrationsGET)
    httpApp.post('/admin-hub/v1/integrations', adminHubIntegrationPOST)
    httpApp.patch('/admin-hub/v1/integrations/:id', adminHubIntegrationPATCH)
    httpApp.delete('/admin-hub/v1/integrations/:id', adminHubIntegrationDELETE)
    httpApp.get('/admin-hub/v1/integrations/billbee/credentials', adminHubBillbeeCredentialsGET)
    httpApp.patch('/admin-hub/v1/integrations/billbee/credentials', adminHubBillbeeCredentialsPATCH)
    httpApp.post('/admin-hub/v1/integrations/billbee/credentials', adminHubBillbeeCredentialsPOST)
    httpApp.post('/admin-hub/v1/integrations/billbee/test', adminHubBillbeeIntegrationTestPOST)
    // Billbee calls this URL to verify/authenticate the integration.
    // Must be reachable from the Billbee backend.
    httpApp.get('/admin-hub/v1/integrations/billbee/webhook-url', adminHubBillbeeWebhookUrlGET)
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
      'https://api.andertal.com'

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
            'Billbee: Einstellungen → Kanäle → Shop hinzufügen → „Eigener Webshop (Billbee API)“. Shop-URL = api_base_url. Basic-Benutzername entweder den Schlüssel (andertal_seller_…) ODER die angezeigte E-Mail; Basic-Passwort = das angezeigte Secret (beides aus Sellercentral kopieren). Kein separates Billbee.io API-Token nötig — Andertal ist der aufgerufene Server.',
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

    httpApp.get('/admin-hub/v1/billbee/connection', adminHubBillbeeMarketplaceConnectionGET)
    httpApp.post('/admin-hub/v1/billbee/connection/rotate-secret', adminHubBillbeeMarketplaceConnectionRotatePOST)

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
      if (!slug) slug = title.toLowerCase()
        .replace(/ü/g,'ue').replace(/ö/g,'oe').replace(/ä/g,'ae').replace(/ß/g,'ss')
        .replace(/[àáâã]/g,'a').replace(/[èéêë]/g,'e').replace(/[ìíîï]/g,'i')
        .replace(/[òóôõ]/g,'o').replace(/[ùúû]/g,'u').replace(/ç/g,'c').replace(/ñ/g,'n')
        .replace(/\s+/g,'-').replace(/[^a-z0-9-]/g,'').replace(/-{2,}/g,'-').replace(/^-+|-+$/g,'')
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

    // Enrich collections_carousel containers with live name + image_url from DB (always refresh)
    const enrichCollectionImages = async (containers, client) => {
      if (!Array.isArray(containers)) return containers
      // Collect ALL collection IDs across all carousels (always refresh, not only missing)
      const allIds = new Set()
      containers.forEach(c => {
        if (c.type === 'collections_carousel' && Array.isArray(c.collections)) {
          c.collections.forEach(col => { if (col.id) allIds.add(String(col.id)) })
        }
      })
      if (!allIds.size) return containers
      const idList = [...allIds]
      let collectionMap = {}
      try {
        const res = await client.query(
          `SELECT id, title, handle, metadata FROM admin_hub_collections WHERE id::text = ANY($1::text[])`,
          [idList]
        )
        res.rows.forEach(row => {
          const meta = row.metadata && typeof row.metadata === 'object' ? row.metadata : {}
          collectionMap[String(row.id)] = {
            title: row.title || null,
            handle: row.handle || null,
            image: meta.image_url || null,
          }
        })
      } catch (_) {}
      // Inject fresh name + image for every collection in carousel
      return containers.map(c => {
        if (c.type !== 'collections_carousel' || !Array.isArray(c.collections)) return c
        return {
          ...c,
          collections: c.collections.map(col => {
            const live = collectionMap[String(col.id)]
            if (!live) return col
            return {
              ...col,
              image: live.image || col.image || null,
              title: live.title || col.title || null,
              handle: live.handle || col.handle || null,
            }
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
        await client.query(
          `INSERT INTO seller_hub_notification_state (recipient_key, source_type, source_id, read_at)
           SELECT $1::varchar, 'metafield_pending', mp.id, now()
           FROM admin_hub_metafield_pending mp
           WHERE mp.status = 'pending'
           ON CONFLICT (recipient_key, source_type, source_id)
           DO UPDATE SET read_at = now() WHERE seller_hub_notification_state.deleted_at IS NULL`,
          [recipientKey],
        ).catch(() => {})
        await client.query(
          `INSERT INTO seller_hub_notification_state (recipient_key, source_type, source_id, read_at)
           SELECT $1::varchar, 'campaign_submitted', n.id, now()
           FROM admin_hub_notifications n WHERE n.type = 'campaign_submitted'
           ON CONFLICT (recipient_key, source_type, source_id)
           DO UPDATE SET read_at = now() WHERE seller_hub_notification_state.deleted_at IS NULL`,
          [recipientKey],
        ).catch(() => {})
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
        const campaignsUnreadQ = sup
          ? `
          SELECT COUNT(*)::int AS c FROM admin_hub_notifications n
          LEFT JOIN seller_hub_notification_state s
            ON s.recipient_key = $1 AND s.source_type = 'campaign_submitted' AND s.source_id = n.id
          WHERE n.type = 'campaign_submitted'
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
        const metafieldUnreadQ = `
          SELECT COUNT(*)::int AS c FROM admin_hub_metafield_pending mp
          LEFT JOIN seller_hub_notification_state s
            ON s.recipient_key = $1 AND s.source_type = 'metafield_pending' AND s.source_id = mp.id
          WHERE mp.status = 'pending'
            AND (s.id IS NULL OR s.deleted_at IS NULL)
            AND (s.id IS NULL OR s.read_at IS NULL)`
        const sellerNoticeUnreadQ = `
          SELECT COUNT(*)::int AS c FROM admin_hub_notifications n
          LEFT JOIN seller_hub_notification_state s
            ON s.recipient_key = $1 AND s.source_type = 'seller_notice' AND s.source_id = n.id
          WHERE n.type IN ('product_change_request_reviewed', 'metafield_proposal_reviewed')
            AND n.seller_id = $2
            AND (s.id IS NULL OR s.deleted_at IS NULL)
            AND (s.id IS NULL OR s.read_at IS NULL)`
        const sellerErrorsUnreadQ = sup
          ? `SELECT COUNT(*)::int AS c FROM seller_error_logs WHERE is_read = false`
          : `SELECT 0::int AS c`

        const [ordersR, returnsR, verificationsR, changeReqR, metafieldR, sellerNoticeR, campaignsR, sellerErrorsR] = await Promise.all([
          client.query(ordersUnreadQ, [rk, sup, sid]),
          client.query(returnsUnreadQ, [rk, sup, sid]),
          sup ? client.query(verificationsUnreadQ, [rk]).catch(() => ({ rows: [{ c: 0 }] })) : { rows: [{ c: 0 }] },
          sup ? client.query(crUnreadQ, [rk]).catch(() => ({ rows: [{ c: 0 }] })) : { rows: [{ c: 0 }] },
          sup ? client.query(metafieldUnreadQ, [rk]).catch(() => ({ rows: [{ c: 0 }] })) : { rows: [{ c: 0 }] },
          !sup && sid ? client.query(sellerNoticeUnreadQ, [rk, sid]).catch(() => ({ rows: [{ c: 0 }] })) : { rows: [{ c: 0 }] },
          sup ? client.query(campaignsUnreadQ, [rk]).catch(() => ({ rows: [{ c: 0 }] })) : { rows: [{ c: 0 }] },
          sup ? client.query(sellerErrorsUnreadQ).catch(() => ({ rows: [{ c: 0 }] })) : { rows: [{ c: 0 }] },
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
        let recentCampaignSubmitted = { rows: [] }
        if (sup) {
          recentCampaignSubmitted = await client.query(
            `SELECT n.id, n.title, n.body, n.seller_id, n.reference_id, n.created_at,
                    (s.read_at IS NOT NULL) AS read
             FROM admin_hub_notifications n
             LEFT JOIN seller_hub_notification_state s
               ON s.recipient_key = $1 AND s.source_type = 'campaign_submitted' AND s.source_id = n.id
             WHERE n.type = 'campaign_submitted'
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
        let recentMetafieldPending = { rows: [] }
        if (sup) {
          recentMetafieldPending = await client.query(
            `SELECT mp.id, mp.key, mp.label, mp.proposed_values, mp.seller_id, mp.created_at,
                    (s.read_at IS NOT NULL) AS read
             FROM admin_hub_metafield_pending mp
             LEFT JOIN seller_hub_notification_state s
               ON s.recipient_key = $1 AND s.source_type = 'metafield_pending' AND s.source_id = mp.id
             WHERE mp.status = 'pending'
               AND (s.id IS NULL OR s.deleted_at IS NULL)
             ORDER BY mp.created_at DESC LIMIT 8`,
            [rk],
          ).catch(() => ({ rows: [] }))
        }
        let recentSellerNotices = { rows: [] }
        if (!sup && sid) {
          recentSellerNotices = await client.query(
            `SELECT n.id, n.title, n.body, n.reference_id, n.created_at,
                    (s.read_at IS NOT NULL) AS read
             FROM admin_hub_notifications n
             LEFT JOIN seller_hub_notification_state s
               ON s.recipient_key = $1 AND s.source_type = 'seller_notice' AND s.source_id = n.id
             WHERE n.type IN ('product_change_request_reviewed', 'metafield_proposal_reviewed')
               AND n.seller_id = $2
               AND (s.id IS NULL OR s.deleted_at IS NULL)
             ORDER BY n.created_at DESC LIMIT 8`,
            [rk, sid],
          ).catch(() => ({ rows: [] }))
        }

        let recentSellerErrors = { rows: [] }
        if (sup) {
          recentSellerErrors = await client.query(
            `SELECT e.id, e.seller_id, e.error_code, e.error_message, e.context, e.created_at, e.is_read,
                    s.store_name, s.email AS seller_email
             FROM seller_error_logs e
             LEFT JOIN seller_users s ON s.seller_id = e.seller_id
             WHERE e.is_read = false
             ORDER BY e.created_at DESC LIMIT 8`,
          ).catch(() => ({ rows: [] }))
        }

        await client.end()
        const verCount = verificationsR.rows[0]?.c || 0
        const crCount = changeReqR.rows[0]?.c || 0
        const mfCount = metafieldR.rows[0]?.c || 0
        const sellerNoticeCount = sellerNoticeR.rows[0]?.c || 0
        const campaignCount = campaignsR.rows[0]?.c || 0
        const sellerErrorsCount = sellerErrorsR.rows[0]?.c || 0
        const ordCount = ordersR.rows[0]?.c || 0
        const retCount = returnsR.rows[0]?.c || 0
        res.json({
          unread: ordCount + retCount + (messagesR.rows[0]?.c || 0) + verCount + crCount + mfCount + sellerNoticeCount + campaignCount + sellerErrorsCount,
          orders: ordCount,
          returns: retCount,
          messages: messagesR.rows[0]?.c || 0,
          verifications: verCount,
          change_requests: crCount + mfCount,
          campaigns: campaignCount,
          seller_errors: sellerErrorsCount,
          recent_orders: recentOrders.rows.map((r) => ({ ...r, order_number: r.order_number ? Number(r.order_number) : null })),
          recent_returns: recentReturns.rows.map((r) => ({ ...r, return_number: r.return_number ? Number(r.return_number) : null, order_number: r.order_number ? Number(r.order_number) : null })),
          recent_verifications: recentVerifications.rows,
          recent_product_change_requests: [...(recentChangeRequests.rows || []), ...(recentMetafieldPending.rows || [])],
          recent_seller_notices: recentSellerNotices.rows || [],
          recent_campaigns_submitted: recentCampaignSubmitted.rows || [],
          recent_seller_errors: recentSellerErrors.rows || [],
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
                    su.id AS seller_user_id,
                    (s.read_at IS NOT NULL) AS read
             FROM admin_hub_notifications n
             LEFT JOIN seller_users su ON su.seller_id = n.seller_id AND su.sub_of_seller_id IS NULL
             LEFT JOIN seller_hub_notification_state s
               ON s.recipient_key = $1 AND s.source_type = 'verification' AND s.source_id = n.id
             WHERE n.type = 'verification_submitted'
               AND (s.id IS NULL OR s.deleted_at IS NULL)
             ORDER BY n.created_at DESC LIMIT 500`,
            [rk],
          ).catch(() => ({ rows: [] }))
        }
        let campaignSubmittedQ = { rows: [] }
        if (sup) {
          campaignSubmittedQ = await client.query(
            `SELECT n.id, n.title, n.body, n.seller_id, n.reference_id, n.created_at,
                    (s.read_at IS NOT NULL) AS read
             FROM admin_hub_notifications n
             LEFT JOIN seller_hub_notification_state s
               ON s.recipient_key = $1 AND s.source_type = 'campaign_submitted' AND s.source_id = n.id
             WHERE n.type = 'campaign_submitted'
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
        let metaPendingQ = { rows: [] }
        if (sup) {
          metaPendingQ = await client.query(
            `SELECT mp.id, mp.key, mp.label, mp.proposed_values, mp.seller_id, mp.created_at,
                    (s.read_at IS NOT NULL) AS read
             FROM admin_hub_metafield_pending mp
             LEFT JOIN seller_hub_notification_state s
               ON s.recipient_key = $1 AND s.source_type = 'metafield_pending' AND s.source_id = mp.id
             WHERE mp.status = 'pending'
               AND (s.id IS NULL OR s.deleted_at IS NULL)
             ORDER BY mp.created_at DESC LIMIT 500`,
            [rk],
          ).catch(() => ({ rows: [] }))
        }
        let sellerNoticeQ = { rows: [] }
        if (!sup && sid) {
          sellerNoticeQ = await client.query(
            `SELECT n.id, n.title, n.body, n.reference_id, n.created_at,
                    (s.read_at IS NOT NULL) AS read
             FROM admin_hub_notifications n
             LEFT JOIN seller_hub_notification_state s
               ON s.recipient_key = $1 AND s.source_type = 'seller_notice' AND s.source_id = n.id
             WHERE n.type IN ('product_change_request_reviewed', 'metafield_proposal_reviewed')
               AND n.seller_id = $2
               AND (s.id IS NULL OR s.deleted_at IS NULL)
             ORDER BY n.created_at DESC LIMIT 500`,
            [rk, sid],
          ).catch(() => ({ rows: [] }))
        }
        const metaDefByKey = {}
        if (sup && (metaPendingQ.rows || []).length > 0) {
          const keys = [...new Set((metaPendingQ.rows || []).map((r) => r.key).filter(Boolean))]
          if (keys.length > 0) {
            const defQ = await client.query(
              `SELECT key, label, values FROM admin_hub_metafield_definitions WHERE key = ANY($1::varchar[])`,
              [keys],
            ).catch(() => ({ rows: [] }))
            for (const row of defQ.rows || []) {
              metaDefByKey[row.key] = row
            }
          }
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
            order_number: r.order_number,
            first_name: r.first_name,
            last_name: r.last_name,
            total_cents: r.total_cents,
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
            return_number: r.return_number,
            order_number: r.order_number,
            status: r.status,
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
            href: r.seller_user_id ? `/sellers/${r.seller_user_id}` : (r.seller_id ? `/sellers/${r.seller_id}` : '/sellers'),
          })
        }
        const campaignSubmittedFeedItems = []
        for (const r of campaignSubmittedQ.rows || []) {
          const campId = r.reference_id ? String(r.reference_id) : ''
          campaignSubmittedFeedItems.push({
            source_type: 'campaign_submitted',
            source_id: r.id,
            read: !!r.read,
            created_at: r.created_at,
            title: r.title || 'Neue Werbekampagne',
            subtitle: r.body || '',
            href: campId ? `/marketing/campaigns/${campId}` : '/marketing/campaigns',
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
            product_title: r.product_title || undefined,
            seller_id: r.seller_id || undefined,
            field_name: r.field_name,
            old_value: r.old_value,
            new_value: r.new_value,
          })
        }
        const metafieldSuggestionFeedItems = []
        for (const r of metaPendingQ.rows || []) {
          const def = metaDefByKey[r.key]
          const currentVals = Array.isArray(def?.values) ? def.values : []
          const proposedVals = Array.isArray(r.proposed_values) ? r.proposed_values : []
          metafieldSuggestionFeedItems.push({
            source_type: 'metafield_pending',
            source_id: r.id,
            read: !!r.read,
            created_at: r.created_at,
            title: 'Metafield-Änderungsvorschlag',
            subtitle: `${r.label || r.key} · Vorschläge: ${proposedVals.join(', ')}`,
            href: '/content/metaobjects',
            metafield_key: r.key,
            metafield_label: r.label || def?.label || r.key,
            field_name: `metafield.${r.key}`,
            old_value: JSON.stringify(currentVals),
            new_value: JSON.stringify(proposedVals),
            seller_id: r.seller_id || undefined,
          })
        }
        const sellerNoticeFeedItems = []
        for (const r of sellerNoticeQ.rows || []) {
          const ref = r.reference_id ? String(r.reference_id) : ''
          sellerNoticeFeedItems.push({
            source_type: 'seller_notice',
            source_id: r.id,
            read: !!r.read,
            created_at: r.created_at,
            title: r.title || 'Hinweis',
            subtitle: r.body || '',
            href: ref ? `/products/${ref}` : '/products/inventory',
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
                key: 'change_suggestion',
                label_de: 'Änderungsvorschläge',
                description_de: 'Ausstehende Freigaben für Produkt- und Metafield-Änderungen',
                items: [...productChangeFeedItems, ...metafieldSuggestionFeedItems].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)),
              },
              {
                key: 'campaign_submitted',
                label_de: 'Werbekampagnen',
                description_de: 'Neue PPC-Kampagnen von Verkäufern',
                items: campaignSubmittedFeedItems,
              },
            )
          }
          if (!sup) {
            groups.push({
              key: 'seller_notice',
              label_de: 'Freigabe-Ergebnisse',
              description_de: 'Ergebnisse zu Ihren Vorschlägen mit Produkt-Link',
              items: sellerNoticeFeedItems,
            })
          }
          const grand_total = groups.reduce((s, g) => s + g.items.length, 0)
          return res.json({
            grouped: true,
            groups: groups.map((g) => ({ ...g, total: g.items.length })),
            grand_total,
          })
        }

        const items = [...orderFeedItems, ...returnFeedItems, ...verificationFeedItems, ...productChangeFeedItems, ...metafieldSuggestionFeedItems, ...sellerNoticeFeedItems, ...campaignSubmittedFeedItems]
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
            await client.query(
              `INSERT INTO seller_hub_notification_state (recipient_key, source_type, source_id, deleted_at)
               SELECT $1::varchar, 'metafield_pending', mp.id, now()
               FROM admin_hub_metafield_pending mp
               WHERE mp.status = 'pending'
               ON CONFLICT (recipient_key, source_type, source_id) DO UPDATE SET deleted_at = now()`,
              [rk],
            ).catch(() => {})
            await client.query(
              `INSERT INTO seller_hub_notification_state (recipient_key, source_type, source_id, deleted_at)
               SELECT $1::varchar, 'campaign_submitted', n.id, now()
               FROM admin_hub_notifications n WHERE n.type = 'campaign_submitted'
               ON CONFLICT (recipient_key, source_type, source_id) DO UPDATE SET deleted_at = now()`,
              [rk],
            ).catch(() => {})
          } else if (sid) {
            await client.query(
              `INSERT INTO seller_hub_notification_state (recipient_key, source_type, source_id, deleted_at)
               SELECT $1::varchar, 'seller_notice', n.id, now()
               FROM admin_hub_notifications n
               WHERE n.type IN ('product_change_request_reviewed', 'metafield_proposal_reviewed')
                 AND n.seller_id = $2
               ON CONFLICT (recipient_key, source_type, source_id) DO UPDATE SET deleted_at = now()`,
              [rk, sid],
            ).catch(() => {})
          }
        } else {
          for (const it of items) {
            const st = String(it.source_type || '').trim()
            const id = it.source_id
            if (!st || !id) continue
            if (!sup && (st === 'product_change_request' || st === 'metafield_pending' || st === 'verification' || st === 'campaign_submitted')) continue
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

    httpApp.get('/admin-hub/v1/notifications/unread', adminHubNotificationsUnreadGET)
    httpApp.post('/admin-hub/v1/notifications/mark-seen', adminHubNotificationsMarkSeenPOST)
    httpApp.get('/admin-hub/v1/notifications/feed', adminHubNotificationsFeedGET)
    httpApp.post('/admin-hub/v1/notifications/delete', adminHubNotificationsDeletePOST)
    httpApp.get('/admin-hub/v1/messages', adminHubMessagesGET)
    httpApp.post('/admin-hub/v1/messages', adminHubMessagesPOST)
    httpApp.patch('/admin-hub/v1/messages/support/mark-read', adminHubSupportMessagesMarkReadPATCH)
    httpApp.patch('/admin-hub/v1/messages/:id/read', adminHubMessageMarkReadPATCH)
    httpApp.get('/admin-hub/v1/message-templates', adminHubMessageTemplatesGET)
    httpApp.post('/admin-hub/v1/message-templates', adminHubMessageTemplatesPOST)
    httpApp.patch('/admin-hub/v1/message-templates/:id', adminHubMessageTemplatesPATCH)
    httpApp.delete('/admin-hub/v1/message-templates/:id', adminHubMessageTemplatesDELETE)
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
    httpApp.get('/admin-hub/v1/smtp-settings', adminHubSmtpSettingsGET)
    httpApp.patch('/admin-hub/v1/smtp-settings', requireSuperuser, adminHubSmtpSettingsPATCH)
    httpApp.post('/admin-hub/v1/smtp-settings/test', requireSuperuser, adminHubSmtpSettingsTestPOST)
    httpApp.post('/admin-hub/v1/smtp-senders', requireSuperuser, adminHubSmtpSendersPOST)
    httpApp.patch('/admin-hub/v1/smtp-senders/:id', requireSuperuser, adminHubSmtpSendersPATCH)
    httpApp.delete('/admin-hub/v1/smtp-senders/:id', requireSuperuser, adminHubSmtpSendersDELETE)
    httpApp.post('/admin-hub/v1/smtp-senders/:id/set-default', requireSuperuser, adminHubSmtpSendersSetDefaultPOST)
    httpApp.post('/admin-hub/v1/smtp-senders/:id/test', requireSuperuser, adminHubSmtpSendersTestPOST)

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

    const adminHubFlowSnapshotsGET = async (req, res) => {
      const client = getDbClient()
      if (!client) return res.status(503).json({ message: 'DB not configured' })
      const flowId = String(req.params.id || '').trim()
      const full = String(req.query.full || '').trim() === '1'
      const lim = Math.min(80, Math.max(1, parseInt(String(req.query.limit || '24'), 10) || 24))
      if (!flowId) return res.status(400).json({ message: 'id required' })
      try {
        await client.connect()
        const ex = await client.query(`SELECT id FROM admin_hub_flows WHERE id = $1::uuid`, [flowId])
        if (!ex.rows[0]) {
          await client.end()
          return res.status(404).json({ message: 'Flow not found' })
        }
        const cols = full
          ? 'version_num, created_at, flow_snapshot, steps_snapshot'
          : 'version_num, created_at'
        const r = await client.query(
          `SELECT ${cols} FROM admin_hub_flow_snapshots WHERE flow_id = $1::uuid ORDER BY version_num DESC LIMIT $2`,
          [flowId, lim],
        )
        await client.end()
        res.json({ snapshots: r.rows || [], count: r.rows?.length || 0 })
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
                  if (sj && bd) {
                    const bundle = { subject: sj, body: bd }
                    const s2 = String(b.subject_b || '').trim()
                    if (s2) bundle.subject_b = s2
                    emailI18nObj[loc] = bundle
                  }
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
          try {
            const frSnap = await client.query(
              `SELECT id, name, trigger_key, status, audience, sent_count, created_at, updated_at FROM admin_hub_flows WHERE id = $1::uuid`,
              [id],
            )
            const srSnap = await client.query(
              `SELECT * FROM admin_hub_flow_steps WHERE flow_id = $1::uuid ORDER BY step_order ASC`,
              [id],
            )
            const vq = await client.query(
              `SELECT COALESCE(MAX(version_num), 0) + 1 AS v FROM admin_hub_flow_snapshots WHERE flow_id = $1::uuid`,
              [id],
            )
            const vn = Math.max(1, parseInt(String(vq.rows[0]?.v || '1'), 10) || 1)
            await client.query(
              `INSERT INTO admin_hub_flow_snapshots (flow_id, version_num, flow_snapshot, steps_snapshot)
               VALUES ($1::uuid, $2, $3::jsonb, $4::jsonb)`,
              [id, vn, JSON.stringify(frSnap.rows[0] || {}), JSON.stringify(srSnap.rows || [])],
            )
          } catch (snapErr) {
            console.warn('[flow-snapshot]', snapErr?.message || snapErr)
          }
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

        const { resolveFlowMailProvider, sendFlowOutboundEmail } = require('./src/email-providers')
        const useResend = resolveFlowMailProvider() === 'resend'
        let transport = null
        if (!useResend) {
          transport = await getSmtpTransport(client)
          if (!transport) {
            await client.end()
            return res.status(400).json({ message: 'SMTP not configured' })
          }
        } else if (!String(process.env.RESEND_API_KEY || '').trim()) {
          await client.end()
          return res.status(400).json({ message: 'RESEND_API_KEY required when FLOW_MAIL_PROVIDER=resend' })
        }
        const bodySenderRaw = body.smtp_sender_id
        const bodySender =
          bodySenderRaw != null && String(bodySenderRaw).trim() !== '' ? String(bodySenderRaw).trim() : null
        const profileForSend = bodySender || (stepSmtpSenderId ? String(stepSmtpSenderId) : null)
        const { fromEmail, fromName } = await resolveSmtpSenderIdentity(client, profileForSend)
        await client.end()

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

        await sendFlowOutboundEmail({
          transport,
          from: `"${String(fromName).replace(/"/g, '')}" <${fromEmailTrim}>`,
          to: toRaw,
          subject: finalSubject,
          html: finalHtml,
          text: plain || finalSubject,
          attachments: pdfAttachments.length ? pdfAttachments : undefined,
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

    httpApp.get('/admin-hub/v1/flows', requireSuperuser, adminHubFlowsListGET)
    httpApp.post('/admin-hub/v1/flows/translate', requireSuperuser, adminHubFlowTranslatePOST)
    httpApp.post('/admin-hub/v1/flows', requireSuperuser, adminHubFlowsPOST)
    httpApp.post('/admin-hub/v1/flows/:id/test-email', requireSuperuser, adminHubFlowTestEmailPOST)
    httpApp.get('/admin-hub/v1/flows/:id/snapshots', requireSuperuser, adminHubFlowSnapshotsGET)
    httpApp.get('/admin-hub/v1/flows/:id', requireSuperuser, adminHubFlowGET)
    httpApp.patch('/admin-hub/v1/flows/:id', requireSuperuser, adminHubFlowPATCH)
    httpApp.delete('/admin-hub/v1/flows/:id', requireSuperuser, adminHubFlowDELETE)

    const adminHubFlowExecutionLogsStatsGET = async (req, res) => {
      const client = getDbClient()
      if (!client) return res.status(503).json({ message: 'DB not configured' })
      const days = Math.min(90, Math.max(1, parseInt(String(req.query.days || '30'), 10) || 30))
      const params = []
      const conds = [`l.created_at >= now() - ($${1}::int * interval '1 day')`]
      params.push(days)
      let n = 2
      const isSuperuser = !!(req.sellerUser?.is_superuser === true || req.sellerUser?.is_superuser === 'true')
      const callerSellerId = String(req.sellerUser?.seller_id || '').trim()
      if (!isSuperuser) {
        if (!callerSellerId) return res.status(403).json({ message: 'Seller context required' })
        conds.push(`EXISTS (SELECT 1 FROM store_orders o WHERE o.id = l.order_id AND o.seller_id = $${n++})`)
        params.push(callerSellerId)
      }
      const where = `WHERE ${conds.join(' AND ')}`
      try {
        await client.connect()
        const [st, tr, tot, prov] = await Promise.all([
          client.query(
            `SELECT l.status, COUNT(*)::int AS c FROM store_flow_execution_logs l ${where} GROUP BY l.status ORDER BY c DESC`,
            params,
          ),
          client.query(
            `SELECT l.trigger_key, COUNT(*)::int AS c FROM store_flow_execution_logs l ${where} GROUP BY l.trigger_key ORDER BY c DESC LIMIT 40`,
            params,
          ),
          client.query(`SELECT COUNT(*)::int AS c FROM store_flow_execution_logs l ${where}`, params),
          client.query(
            `SELECT COALESCE(l.metadata->>'mail_provider', 'smtp') AS provider, COUNT(*)::int AS c
             FROM store_flow_execution_logs l ${where} AND l.status = 'sent'
             GROUP BY 1 ORDER BY c DESC`,
            params,
          ),
        ])
        await client.end()
        res.json({
          days,
          total_in_window: tot.rows[0]?.c ?? 0,
          by_status: st.rows || [],
          by_trigger: tr.rows || [],
          by_mail_provider: prov.rows || [],
        })
      } catch (e) {
        try {
          await client.end()
        } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    const adminHubFlowExecutionLogsGET = async (req, res) => {
      const client = getDbClient()
      if (!client) return res.status(503).json({ message: 'DB not configured' })
      const lim = Math.min(200, Math.max(1, parseInt(String(req.query.limit || '50'), 10) || 50))
      const off = Math.max(0, parseInt(String(req.query.offset || '0'), 10) || 0)
      const statusRaw = String(req.query.status || '').trim().toLowerCase()
      const triggerKey = String(req.query.trigger_key || '').trim().toLowerCase()
      const flowId = String(req.query.flow_id || '').trim()
      const allowedStatus = new Set(['pending', 'sent', 'skipped', 'failed'])
      const params = []
      const conds = []
      let n = 1
      if (statusRaw && allowedStatus.has(statusRaw)) {
        conds.push(`l.status = $${n++}`)
        params.push(statusRaw)
      }
      if (triggerKey) {
        conds.push(`LOWER(TRIM(l.trigger_key)) = $${n++}`)
        params.push(triggerKey)
      }
      if (flowId) {
        conds.push(`l.flow_id = $${n++}::uuid`)
        params.push(flowId)
      }
      const isSuperuser = !!(req.sellerUser?.is_superuser === true || req.sellerUser?.is_superuser === 'true')
      const callerSellerId = String(req.sellerUser?.seller_id || '').trim()
      if (!isSuperuser) {
        if (!callerSellerId) {
          return res.status(403).json({ message: 'Seller context required' })
        }
        conds.push(`EXISTS (SELECT 1 FROM store_orders o WHERE o.id = l.order_id AND o.seller_id = $${n++})`)
        params.push(callerSellerId)
      }
      const where = conds.length ? `WHERE ${conds.join(' AND ')}` : ''
      try {
        await client.connect()
        const countR = await client.query(`SELECT COUNT(*)::int AS c FROM store_flow_execution_logs l ${where}`, params)
        const total = countR.rows[0]?.c ?? 0
        const listParams = [...params, lim, off]
        const limP = n
        const offP = n + 1
        const dataR = await client.query(
          `SELECT l.id, l.trigger_key, l.flow_id, l.step_order, l.audience, l.recipient_email,
                  l.order_id, l.customer_id, l.status, l.attempts, l.error_message,
                  l.sent_at, l.created_at, l.updated_at, l.metadata,
                  f.name AS flow_name
           FROM store_flow_execution_logs l
           LEFT JOIN admin_hub_flows f ON f.id = l.flow_id
           ${where}
           ORDER BY l.created_at DESC
           LIMIT $${limP} OFFSET $${offP}`,
          listParams,
        )
        await client.end()
        res.json({
          logs: dataR.rows || [],
          count: dataR.rows?.length || 0,
          total,
          limit: lim,
          offset: off,
        })
      } catch (e) {
        try {
          await client.end()
        } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    const adminHubFlowExecutionLogGET = async (req, res) => {
      const client = getDbClient()
      if (!client) return res.status(503).json({ message: 'DB not configured' })
      const id = String(req.params.id || '').trim()
      if (!id) return res.status(400).json({ message: 'id required' })
      const isSuperuser = !!(req.sellerUser?.is_superuser === true || req.sellerUser?.is_superuser === 'true')
      const callerSellerId = String(req.sellerUser?.seller_id || '').trim()
      if (!isSuperuser && !callerSellerId) return res.status(403).json({ message: 'Seller context required' })
      try {
        await client.connect()
        const r = isSuperuser
          ? await client.query(
              `SELECT l.*, f.name AS flow_name
               FROM store_flow_execution_logs l
               LEFT JOIN admin_hub_flows f ON f.id = l.flow_id
               WHERE l.id = $1::uuid`,
              [id],
            )
          : await client.query(
              `SELECT l.*, f.name AS flow_name
               FROM store_flow_execution_logs l
               LEFT JOIN admin_hub_flows f ON f.id = l.flow_id
               INNER JOIN store_orders o ON o.id = l.order_id
               WHERE l.id = $1::uuid AND o.seller_id = $2`,
              [id, callerSellerId],
            )
        await client.end()
        if (!r.rows[0]) return res.status(404).json({ message: 'Log not found' })
        res.json({ log: r.rows[0] })
      } catch (e) {
        try {
          await client.end()
        } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    httpApp.get('/admin-hub/v1/flow-execution-logs/stats', adminHubFlowExecutionLogsStatsGET)
    httpApp.get('/admin-hub/v1/flow-execution-logs', adminHubFlowExecutionLogsGET)
    httpApp.get('/admin-hub/v1/flow-execution-logs/:id', adminHubFlowExecutionLogGET)

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
        const sellerId = (isSuperuser
          ? String(body.seller_id || 'default')
          : String(callerSellerId || 'default')).trim() || 'default'
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
        let sellerParamNum = null
        if (filterSellerId) {
          params.push(filterSellerId)
          sellerParamNum = params.length
          // Match orders directly assigned to this seller OR orders whose items link to this seller via listings/products
          where.push(`(
            o.seller_id = $${sellerParamNum}
            OR EXISTS (
              SELECT 1 FROM store_order_items oi WHERE oi.order_id = o.id AND (
                EXISTS (SELECT 1 FROM admin_hub_seller_listings sl WHERE sl.product_id::text = oi.product_id::text AND sl.seller_id = $${sellerParamNum})
                OR EXISTS (SELECT 1 FROM admin_hub_products ap WHERE ap.id::text = oi.product_id::text AND ap.seller_id = $${sellerParamNum})
              )
            )
          )`)
        }
        const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : ''
        // Join seller_users using the actual seller or falling back to filterSellerId for 'default' orders
        const sellerJoin = sellerParamNum
          ? `LEFT JOIN seller_users s ON s.seller_id = CASE WHEN o.seller_id IS NOT NULL AND o.seller_id != 'default' THEN o.seller_id ELSE $${sellerParamNum}::varchar END`
          : `LEFT JOIN seller_users s ON s.seller_id = o.seller_id`
        const r = await client.query(
          `SELECT o.id, o.order_number, o.seller_id, o.subtotal_cents, o.total_cents, o.shipping_cents, o.discount_cents,
                  o.payment_status, o.delivery_status, o.delivery_date, o.created_at,
                  o.stripe_transfer_status, o.stripe_transfer_id, o.stripe_transfer_error, o.stripe_transfer_at,
                  o.payment_intent_id, COALESCE(o.checkout_payment_kind, 'stripe') AS checkout_payment_kind,
                  o.stripe_application_fee_cents,
                  COALESCE(o.seller_net_after_commission_cents, 0)::bigint AS seller_net_after_commission_cents,
                  o.stripe_payout_status, o.stripe_payout_id, o.stripe_account_id,
                  o.first_name, o.last_name, o.email, o.currency,
                  s.store_name, s.commission_rate, s.iban,
                  (o.delivery_date IS NOT NULL AND o.delivery_date <= now() - interval '${limitDays} days') AS payout_eligible
           FROM store_orders o
           ${sellerJoin}
           ${whereClause}
           ORDER BY o.created_at DESC
           LIMIT 1000`,
          params
        )
        // Also fetch returns for this seller in the same time window
        const returnWhere = []
        const returnParams = []
        let returnSellerParamNum = null
        if (filterSellerId) {
          returnParams.push(filterSellerId)
          returnSellerParamNum = returnParams.length
          returnWhere.push(`(
            o.seller_id = $${returnSellerParamNum}
            OR EXISTS (
              SELECT 1 FROM store_order_items oi WHERE oi.order_id = o.id AND (
                EXISTS (SELECT 1 FROM admin_hub_seller_listings sl WHERE sl.product_id::text = oi.product_id::text AND sl.seller_id = $${returnSellerParamNum})
                OR EXISTS (SELECT 1 FROM admin_hub_products ap WHERE ap.id::text = oi.product_id::text AND ap.seller_id = $${returnSellerParamNum})
              )
            )
          )`)
        }
        if (req.query.period_start) {
          returnParams.push(req.query.period_start)
          returnWhere.push(`r.created_at >= $${returnParams.length}`)
        }
        if (req.query.period_end) {
          returnParams.push(req.query.period_end)
          returnWhere.push(`r.created_at < ($${returnParams.length}::date + interval '1 day')`)
        }
        const returnWhereClause = returnWhere.length ? `WHERE ${returnWhere.join(' AND ')}` : ''
        const returnSellerJoin = returnSellerParamNum
          ? `LEFT JOIN seller_users s ON s.seller_id = CASE WHEN o.seller_id IS NOT NULL AND o.seller_id != 'default' THEN o.seller_id ELSE $${returnSellerParamNum}::varchar END`
          : `LEFT JOIN seller_users s ON s.seller_id = o.seller_id`
        let returnRows = []
        try {
          const rr = await client.query(
            `SELECT r.id, r.return_number, r.order_id, r.status, r.created_at,
                    o.order_number, o.seller_id, o.first_name, o.last_name, o.currency,
                    s.commission_rate,
                    COALESCE((SELECT SUM(ri.refund_amount_cents) FROM return_items ri WHERE ri.return_id = r.id), 0) AS refund_cents
             FROM store_returns r
             LEFT JOIN store_orders o ON o.id = r.order_id
             ${returnSellerJoin}
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
          const commission = resolvePlatformApplicationFeeCents(row, commRate)
          const storedNet = Number(row.seller_net_after_commission_cents)
          const payout =
            Number.isFinite(storedNet) && storedNet >= 0 ? storedNet : Math.max(0, sellerBasis - commission)
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
            checkout_payment_kind: row.checkout_payment_kind || 'stripe',
            payment_intent_id: row.payment_intent_id || null,
            settlement_breakdown: buildOrderSettlementBreakdown(row, commRate),
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

    // GET /admin-hub/v1/commission-invoices — billing tab: lists seller_payouts as commission invoices
    const adminHubCommissionInvoicesGET = async (req, res) => {
      const client = getDbClient()
      if (!client) return res.status(503).json({ message: 'DB not configured' })
      try {
        await client.connect()
        const isSuperuser = req.sellerUser?.is_superuser || false
        const callerSellerId = req.sellerUser?.seller_id
        const params = []
        let where = ''
        if (!isSuperuser && callerSellerId) { params.push(callerSellerId); where = 'WHERE p.seller_id = $1' }
        const r = await client.query(
          `SELECT p.id, p.seller_id, p.period_start, p.period_end,
                  p.total_cents, p.commission_cents, p.payout_cents,
                  p.status, p.paid_at, p.created_at,
                  s.store_name
             FROM seller_payouts p
             LEFT JOIN seller_users s ON s.seller_id = p.seller_id
             ${where}
             ORDER BY p.period_start DESC LIMIT 200`,
          params
        )
        await client.end()
        const invoices = r.rows.map((row) => {
          const ps = new Date(row.period_start)
          const pe = new Date(row.period_end)
          const fmtD = (d) => d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
          return {
            id: row.id,
            seller_id: row.seller_id,
            store_name: row.store_name || null,
            period: `${fmtD(ps)} – ${fmtD(pe)}`,
            period_label: `${ps.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })}`,
            period_start: row.period_start,
            period_end: row.period_end,
            amount_cents: Number(row.commission_cents || 0),
            total_cents: Number(row.total_cents || 0),
            payout_cents: Number(row.payout_cents || 0),
            status: row.status || 'offen',
            paid_at: row.paid_at || null,
            created_at: row.created_at,
            pdf_url: `/admin-hub/v1/seller-payouts/${row.id}/pdf`,
          }
        })
        res.json({ invoices, count: invoices.length })
      } catch (e) {
        try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    // GET /admin-hub/v1/seller-payouts/:id/pdf — Provisionsfaktur PDF for a payout period
    const adminHubSellerPayoutPdfGET = async (req, res) => {
      const { id } = req.params
      if (!id) return res.status(400).json({ message: 'id required' })
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      if (!dbUrl) return res.status(503).json({ message: 'Database not configured' })
      const loggedSellerId = req.sellerUser?.seller_id
      const isSuperuser = req.sellerUser?.is_superuser || false
      let client
      try {
        const PDFDocument = require('pdfkit')
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        const pRes = await client.query(
          `SELECT p.*, s.store_name, s.company_name, s.first_name, s.last_name,
                  s.vat_id, s.email, s.business_address, s.commission_rate, s.iban
             FROM seller_payouts p
             LEFT JOIN seller_users s ON s.seller_id = p.seller_id
             WHERE p.id = $1::uuid LIMIT 1`,
          [id]
        )
        const payout = pRes.rows?.[0]
        if (!payout) { await client.end(); return res.status(404).json({ message: 'Payout not found' }) }
        if (!isSuperuser && loggedSellerId && payout.seller_id !== loggedSellerId) {
          await client.end(); return res.status(403).json({ message: 'Access denied' })
        }

        // Load orders for this period
        const oRes = await client.query(
          `SELECT order_number, created_at, subtotal_cents, stripe_application_fee_cents, seller_net_after_commission_cents
             FROM store_orders
             WHERE seller_id = $1
               AND created_at >= $2::date
               AND created_at < ($3::date + interval '1 day')
               AND payment_status != 'storniert'
             ORDER BY created_at ASC LIMIT 200`,
          [payout.seller_id, payout.period_start, payout.period_end]
        )
        const orders = oRes.rows || []
        await client.end(); client = null

        const shopName = process.env.SHOP_INVOICE_NAME || 'Andertal Marktplatz'
        const platformAddress = process.env.PLATFORM_INVOICE_ADDRESS || ''
        const platformVatId = process.env.PLATFORM_VAT_ID || ''
        const platformVatPercent = Number(process.env.PLATFORM_VAT_PERCENT || '0')

        const ps = new Date(payout.period_start)
        const pe = new Date(payout.period_end)
        const periodLabel = `${ps.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })} – ${pe.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })}`
        const invoiceNum = `PROV-${String(payout.period_start).slice(0, 7).replace('-', '')}`

        const doc = new PDFDocument({ margin: 42, size: 'A4', compress: false, pdfVersion: '1.7' })
        res.setHeader('Content-Type', 'application/pdf')
        res.setHeader('Content-Disposition', `attachment; filename="Provisionsfaktur-${invoiceNum}.pdf"`)
        doc.pipe(res)
        renderPeriodCommissionInvoiceDocument(doc, {
          payout,
          orders,
          shopName,
          platformAddress,
          platformVatId,
          platformVatPercent,
          invoiceNumber: invoiceNum,
          periodLabel,
        })
        doc.end()
      } catch (e) {
        if (client) try { await client.end() } catch (_) {}
        if (!res.headersSent) res.status(500).json({ message: e?.message || 'PDF error' })
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

    // POST /admin-hub/v1/payouts/backfill — superuser generates missing payout records for all past months
    const adminHubPayoutsBackfillPOST = async (req, res) => {
      if (!req.sellerUser?.is_superuser) return res.status(403).json({ message: 'Superuser access required' })
      const client = getDbClient()
      if (!client) return res.status(503).json({ message: 'DB not configured' })
      try {
        await client.connect()
        const r = await client.query(
          `SELECT
             o.seller_id,
             date_trunc('month', o.created_at)::date AS month_start,
             (date_trunc('month', o.created_at) + interval '1 month' - interval '1 day')::date AS month_end,
             COALESCE(SUM(o.subtotal_cents), 0)::bigint AS total_cents,
             ROUND(COALESCE(SUM(o.subtotal_cents), 0)::numeric * COALESCE(MAX(s.commission_rate), 0.12))::bigint AS commission_cents,
             ROUND(COALESCE(SUM(o.subtotal_cents), 0)::numeric * (1 - COALESCE(MAX(s.commission_rate), 0.12)))::bigint AS payout_cents
           FROM store_orders o
           LEFT JOIN seller_users s ON s.seller_id = o.seller_id
           WHERE o.payment_status = 'bezahlt'
             AND date_trunc('month', o.created_at) < date_trunc('month', now())
             AND o.seller_id IS NOT NULL
             AND LOWER(COALESCE(s.approval_status, 'approved')) = 'approved'
           GROUP BY o.seller_id, date_trunc('month', o.created_at)
           ORDER BY month_start ASC`
        )
        let created = 0
        let skipped = 0
        for (const row of r.rows || []) {
          const ex = await client.query(
            `SELECT id FROM seller_payouts WHERE seller_id = $1 AND period_start = $2::date AND period_end = $3::date LIMIT 1`,
            [row.seller_id, row.month_start, row.month_end]
          )
          if (ex.rows.length) { skipped++; continue }
          await client.query(
            `INSERT INTO seller_payouts (seller_id, period_start, period_end, total_cents, commission_cents, payout_cents, notes, status)
             VALUES ($1, $2::date, $3::date, $4, $5, $6, 'Rückwirkend automatisch erstellt', 'offen')`,
            [row.seller_id, row.month_start, row.month_end, row.total_cents, row.commission_cents, row.payout_cents]
          )
          created++
        }
        await client.end()
        res.json({ message: `Backfill abgeschlossen: ${created} erstellt, ${skipped} übersprungen`, created, skipped })
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
           LEFT JOIN seller_users s ON s.seller_id = CASE WHEN o.seller_id IS NOT NULL AND o.seller_id != 'default' THEN o.seller_id ELSE $1::varchar END
           WHERE (
             o.seller_id = $1
             OR EXISTS (
               SELECT 1 FROM store_order_items oi WHERE oi.order_id = o.id AND (
                 EXISTS (SELECT 1 FROM admin_hub_seller_listings sl WHERE sl.product_id::text = oi.product_id::text AND sl.seller_id = $1)
                 OR EXISTS (SELECT 1 FROM admin_hub_products ap WHERE ap.id::text = oi.product_id::text AND ap.seller_id = $1)
               )
             )
           ) AND o.payment_status = 'bezahlt' ${dateFilter}`,
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

    // GET /admin-hub/v1/analytics/marketing — impressions, clicks, conversions for reports
    const adminHubAnalyticsMarketingGET = async (req, res) => {
      const sellerId = req.sellerUser?.seller_id
      const isSuperuser = req.sellerUser?.is_superuser
      if (!sellerId && !isSuperuser) return res.status(401).json({ message: 'Unauthorized' })
      const client = getDbClient()
      if (!client) return res.status(503).json({ message: 'DB not configured' })
      const from = String(req.query.from || '').slice(0, 10)
      const to = String(req.query.to || '').slice(0, 10)
      if (!from || !to) return res.status(400).json({ message: 'from and to required (YYYY-MM-DD)' })
      try {
        await client.connect()
        const sellerFilter = isSuperuser ? '' : 'AND seller_id = $1'
        const evParams = isSuperuser ? [from, to] : [sellerId, from, to]
        const evR = await client.query(
          `SELECT event_type, COUNT(*)::int AS cnt
           FROM product_events
           WHERE created_at >= $${isSuperuser ? 1 : 2}::date
             AND created_at < ($${isSuperuser ? 2 : 3}::date + interval '1 day')
             AND event_type IN ('impression', 'click', 'add_to_cart')
             ${sellerFilter}
           GROUP BY event_type`,
          evParams,
        )
        const dailyEvR = await client.query(
          `SELECT DATE(created_at) AS day, event_type, COUNT(*)::int AS cnt
           FROM product_events
           WHERE created_at >= $${isSuperuser ? 1 : 2}::date
             AND created_at < ($${isSuperuser ? 2 : 3}::date + interval '1 day')
             AND event_type IN ('impression', 'click')
             ${sellerFilter}
           GROUP BY DATE(created_at), event_type
           ORDER BY day`,
          evParams,
        )
        const orderParams = isSuperuser ? [from, to] : [sellerId, from, to]
        const orderSellerFilter = isSuperuser ? '' : 'AND o.seller_id = $1'
        const ordersR = await client.query(
          `SELECT
             DATE(COALESCE(o.delivery_date::timestamp, o.created_at)) AS day,
             COUNT(*)::int AS orders,
             COALESCE(SUM(
               CASE WHEN COALESCE(o.subtotal_cents, 0) > 0 THEN o.subtotal_cents::bigint
                    ELSE GREATEST(0, COALESCE(o.total_cents, 0))::bigint END
             ), 0)::bigint AS revenue_cents
           FROM store_orders o
           WHERE o.payment_status = 'bezahlt'
             AND o.order_status NOT IN ('storniert', 'cancelled')
             AND DATE(COALESCE(o.delivery_date::timestamp, o.created_at)) >= $${isSuperuser ? 1 : 2}::date
             AND DATE(COALESCE(o.delivery_date::timestamp, o.created_at)) <= $${isSuperuser ? 2 : 3}::date
             ${orderSellerFilter}
           GROUP BY DATE(COALESCE(o.delivery_date::timestamp, o.created_at))
           ORDER BY day`,
          orderParams,
        )
        const spendR = await client.query(
          `SELECT COALESCE(SUM(budget_daily_cents), 0)::bigint AS daily_budget
           FROM seller_campaigns
           WHERE campaign_type = 'ppc'
             AND ad_status IN ('active', 'running', 'approved', 'live', 'paused')
             ${isSuperuser ? '' : 'AND seller_id = $1'}`,
          isSuperuser ? [] : [sellerId],
        )
        await client.end()

        const totals = { impressions: 0, clicks: 0, add_to_cart: 0, orders: 0, revenue_cents: 0, spend_cents: 0 }
        for (const row of evR.rows || []) {
          if (row.event_type === 'impression') totals.impressions = row.cnt
          if (row.event_type === 'click') totals.clicks = row.cnt
          if (row.event_type === 'add_to_cart') totals.add_to_cart = row.cnt
        }
        for (const row of ordersR.rows || []) {
          totals.orders += row.orders
          totals.revenue_cents += Number(row.revenue_cents) || 0
        }
        const dayMs = Math.max(1, Math.round((new Date(to) - new Date(from)) / 86400000) + 1)
        totals.spend_cents = (Number(spendR.rows[0]?.daily_budget) || 0) * dayMs

        const dailyMap = new Map()
        const ensureDay = (dayKey) => {
          const k = String(dayKey).slice(0, 10)
          if (!dailyMap.has(k)) {
            dailyMap.set(k, { date: k, impressions: 0, clicks: 0, orders: 0, revenue_cents: 0 })
          }
          return dailyMap.get(k)
        }
        for (const row of dailyEvR.rows || []) {
          const d = ensureDay(row.day)
          if (row.event_type === 'impression') d.impressions = row.cnt
          if (row.event_type === 'click') d.clicks = row.cnt
        }
        for (const row of ordersR.rows || []) {
          const d = ensureDay(row.day)
          d.orders = row.orders
          d.revenue_cents = Number(row.revenue_cents) || 0
        }

        const ctr = totals.impressions > 0 ? totals.clicks / totals.impressions : null
        const conversion_rate = totals.clicks > 0 ? totals.orders / totals.clicks : null
        const roas = totals.spend_cents > 0 ? totals.revenue_cents / totals.spend_cents : null

        res.json({
          totals,
          derived: { ctr, conversion_rate, roas },
          daily: [...dailyMap.values()].sort((a, b) => a.date.localeCompare(b.date)),
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

    // Gregorian weekday (0=Sun … 5=Fri) for Y-M-D — timezone-independent.
    const utcWeekday = (year, month0, day) => new Date(Date.UTC(year, month0, day)).getUTCDay()

    // Day-of-month (1-based) of the nth Friday in year/month (month 0-indexed).
    const nthFridayOfMonth = (year, month, n) => {
      const dow = utcWeekday(year, month, 1)
      const offset = (5 - dow + 7) % 7
      return 1 + offset + (n - 1) * 7
    }

    /** Civil date (Y-M-D) in Europe/Berlin — drives payout calendar regardless of server TZ. */
    const civilDatePartsBerlin = (instant = new Date()) => {
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Europe/Berlin',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).formatToParts(instant)
      let y
      let mo
      let da
      for (const p of parts) {
        if (p.type === 'year') y = Number(p.value)
        if (p.type === 'month') mo = Number(p.value) - 1
        if (p.type === 'day') da = Number(p.value)
      }
      return { y, m: mo, d: da }
    }

    // Returns { is: true, n: 2|4 } when today (Berlin) is the 2nd or 4th Friday, else { is: false }.
    const isPayoutFridayToday = () => {
      const { y, m, d } = civilDatePartsBerlin()
      if (utcWeekday(y, m, d) !== 5) return { is: false }
      if (d === nthFridayOfMonth(y, m, 2)) return { is: true, n: 2 }
      if (d === nthFridayOfMonth(y, m, 4)) return { is: true, n: 4 }
      return { is: false }
    }

    /** Orders eligible for seller payout: paid, delivered 14d+, no refund flow / open return. */
    const payoutEligibleOrderSql = `o.payment_status = 'bezahlt'
             AND o.delivery_date IS NOT NULL
             AND o.delivery_date <= now() - interval '14 days'
             AND COALESCE(o.order_status, '') NOT IN ('storniert', 'refunded', 'retoure', 'retoure_anfrage')
             AND NOT EXISTS (
               SELECT 1 FROM store_returns r
               WHERE r.order_id = o.id
                 AND COALESCE(r.status, '') NOT IN ('abgelehnt', 'abgeschlossen')
             )`

    /** ISO 13616 MOD-97 IBAN check — SEPA-capable accounts use standard IBAN. */
    const validateSepaIbanChecksum = (raw) => {
      const iban = String(raw || '').replace(/\s/g, '').toUpperCase()
      if (!iban) return { ok: false, message: 'IBAN erforderlich' }
      if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]+$/.test(iban)) return { ok: false, message: 'Ungültiges IBAN-Format' }
      if (iban.length < 15 || iban.length > 34) return { ok: false, message: 'IBAN-Länge ungültig' }
      const rearranged = iban.slice(4) + iban.slice(0, 4)
      let expanded = ''
      for (let i = 0; i < rearranged.length; i++) {
        const c = rearranged[i]
        if (c >= 'A' && c <= 'Z') expanded += String(c.charCodeAt(0) - 55)
        else expanded += c
      }
      let rem = 0
      for (let i = 0; i < expanded.length; i++) {
        const d = expanded.charCodeAt(i) - 48
        if (d < 0 || d > 9) return { ok: false, message: 'Ungültiges IBAN-Format' }
        rem = (rem * 10 + d) % 97
      }
      if (rem !== 1) return { ok: false, message: 'IBAN-Prüfziffer ungültig' }
      return { ok: true, iban }
    }

    const autoPayoutPeriodForDate = () => {
      const fri = isPayoutFridayToday()
      if (!fri.is) return null
      const { y, m, day } = civilDatePartsBerlin()

      const mm = String(m + 1).padStart(2, '0')
      const pad = (n) => String(n).padStart(2, '0')
      const iso = (yr, mo, da) => `${yr}-${String(mo + 1).padStart(2, '0')}-${pad(da)}`

      if (fri.n === 2) {
        // Period: (4th Friday of previous month + 1) → 2nd Friday of this month
        const prevM = m === 0 ? 11 : m - 1
        const prevY = m === 0 ? y - 1 : y
        const f4prev = nthFridayOfMonth(prevY, prevM, 4)
        const sd = new Date(Date.UTC(prevY, prevM, f4prev + 1))
        const periodStart = iso(sd.getUTCFullYear(), sd.getUTCMonth(), sd.getUTCDate())
        const periodEnd = iso(y, m, day)
        return { runKey: `AUTO-${y}-${mm}-F2`, periodStart, periodEnd }
      }
      // fri.n === 4
      // Period: (2nd Friday of this month + 1) → 4th Friday of this month
      const f2 = nthFridayOfMonth(y, m, 2)
      const sd = new Date(Date.UTC(y, m, f2 + 1))
      const periodStart = iso(sd.getUTCFullYear(), sd.getUTCMonth(), sd.getUTCDate())
      const periodEnd = iso(y, m, day)
      return { runKey: `AUTO-${y}-${mm}-F4`, periodStart, periodEnd }
    }

    const runAutomaticPayoutsIfDue = async () => {
      const period = autoPayoutPeriodForDate()
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
           WHERE ${payoutEligibleOrderSql}
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

    // Stripe Connect transfers to seller Connect accounts are disabled — all settlements use Sellercentral IBAN (SEPA)
    // via runSellerIbanPayoutsIfDue (platform → Stripe Custom recipient → bank payout).
    const runStripeConnectTransfersIfDue = async () => {}

    const runStripePayoutsIfDue = async () => {}

    // IBAN / SEPA payout — Sellercentral bank account (seller_users.iban). Platform PI funds settle here.
    // Eligible: stripe_payout_status pending, order stripe_account_id NULL (all store orders today), 14d + no open return.
    const runSellerIbanPayoutsIfDue = async () => {
      if (!isPayoutFridayToday().is) return   // 2nd / 4th Friday (Europe/Berlin)
      const client = getDbClient()
      if (!client) return
      try {
        await client.connect()

        const { y: by, m: bm, d: bd } = civilDatePartsBerlin()
        const berlinIso = `${by}-${String(bm + 1).padStart(2, '0')}-${String(bd).padStart(2, '0')}`
        // Idempotency: one batch per payout calendar day (Berlin)
        const todayKey = `IBAN-${berlinIso}`
        const alreadyRan = await client.query('SELECT run_key FROM seller_payout_auto_runs WHERE run_key = $1 LIMIT 1', [todayKey])
        if (alreadyRan.rows.length) { await client.end(); return }

        const platformRow = await loadPlatformCheckoutRow(client)
        const secretKey = resolveStripeSecretKeyFromPlatform(platformRow)
        if (!secretKey) { await client.end(); return }
        const stripeInst = new (require('stripe'))(secretKey)

        // Per-order seller net (stored at checkout); fallback = merchandise × (1 − commission).
        const due = await client.query(
          `SELECT o.seller_id,
                  SUM(
                    GREATEST(0,
                      COALESCE(o.seller_net_after_commission_cents::bigint,
                        FLOOR(o.subtotal_cents::numeric * (1 - COALESCE(s.commission_rate, 0.12)))::bigint)
                    )
                  )::bigint AS payout_cents_sum,
                  s.commission_rate, s.iban, s.payment_account_holder, s.stripe_custom_account_id, s.email
           FROM store_orders o
           JOIN seller_users s ON s.seller_id = o.seller_id
           WHERE o.stripe_payout_status = 'pending'
             AND o.stripe_account_id IS NULL
             AND ${payoutEligibleOrderSql}
           GROUP BY o.seller_id, s.commission_rate, s.iban, s.payment_account_holder, s.stripe_custom_account_id, s.email`
        )

        for (const row of due.rows || []) {
          const { seller_id, iban, payment_account_holder, email } = row
          let customAccountId = row.stripe_custom_account_id

          if (!iban) {
            console.warn(`runSellerIbanPayoutsIfDue: seller ${seller_id} has no IBAN, skipping`)
            continue
          }
          const ibChk = validateSepaIbanChecksum(iban)
          if (!ibChk.ok) {
            console.warn(`runSellerIbanPayoutsIfDue: seller ${seller_id} invalid IBAN — ${ibChk.message}`)
            continue
          }

          const payoutCents = Math.floor(Number(row.payout_cents_sum || 0))
          if (payoutCents <= 50) continue // Stripe minimum payout

          // Idempotency: mark all eligible orders as processing first
          const guard = await client.query(
            `UPDATE store_orders SET stripe_payout_status = 'processing', updated_at = now()
             WHERE seller_id = $1 AND stripe_payout_status = 'pending' AND stripe_account_id IS NULL
               AND ${payoutEligibleOrderSql.replace(/\bo\./g, 'store_orders.')}`,
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
                tos_acceptance: { service_agreement: 'full', date: Math.floor(Date.now() / 1000), ip: '127.0.0.1' },
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
          [todayKey, berlinIso, berlinIso]
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

    // Background tracking refresh: every 3 hours, refresh DHL tracking for all in-transit orders
    const runAutoTrackingRefresh = async () => {
      const client = getDbClient()
      if (!client) return
      try {
        await client.connect()
        const r = await client.query(
          `SELECT o.id, o.carrier_name, o.tracking_number, o.postal_code
           FROM store_orders o
           WHERE o.tracking_number IS NOT NULL AND o.tracking_number != ''
             AND o.delivery_status NOT IN ('zugestellt', 'storniert')
             AND o.created_at > now() - interval '60 days'
           ORDER BY o.created_at DESC
           LIMIT 200`
        )
        await client.end()
        for (const order of r.rows) {
          const cn = String(order.carrier_name || '').toLowerCase().trim()
          const isDHL = cn === 'dhl' || cn.startsWith('dhl')
          const isDPD = cn === 'dpd' || cn.startsWith('dpd')
          const isGLS = cn === 'gls' || cn.startsWith('gls')
          if (!isDHL && !isDPD && !isGLS) continue
          try {
            const dbUrl2 = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
            const { Client: PgClient2 } = require('pg')
            const c2 = new PgClient2({ connectionString: dbUrl2, ssl: dbUrl2.includes('render.com') ? { rejectUnauthorized: false } : false })
            await c2.connect()
            const trackingNumber = String(order.tracking_number).trim()
            const https = require('https')
            let bgEvents = []

            if (isDHL) {
              const envDhlKey = (process.env.DHL_API_KEY || process.env.DHL_TRACK_API_KEY || process.env.DHLPARCEL_API_KEY || '').toString().trim()
              const cq = await c2.query('SELECT api_key FROM store_shipping_carriers WHERE LOWER(TRIM(name)) LIKE $1 AND is_active=true LIMIT 1', ['dhl%'])
              const apiKey = (cq.rows[0]?.api_key && String(cq.rows[0].api_key).trim()) || envDhlKey
              if (!apiKey) { await c2.end(); continue }
              const pc = String(order.postal_code || '').trim().replace(/\s+/g, '')
              let path = `/track/shipments?trackingNumber=${encodeURIComponent(trackingNumber)}`
              if (pc) path += `&recipientPostalCode=${encodeURIComponent(pc)}`
              const dhlData = await new Promise((resolve) => {
                const req2 = https.request(
                  { hostname: 'api-eu.dhl.com', path, method: 'GET', headers: { 'DHL-API-Key': apiKey, Accept: 'application/json' } },
                  (resp) => { let body = ''; resp.on('data', (d) => { body += d }); resp.on('end', () => { try { resolve(JSON.parse(body || '{}')); } catch { resolve({}) } }) }
                )
                req2.on('error', () => resolve({})); req2.end()
              })
              const shipment = dhlData?.shipments?.[0] || null
              const events = Array.isArray(shipment?.events) ? shipment.events : (shipment?.status ? [{ timestamp: shipment.timestamp, status: shipment.status, location: shipment.location }] : [])
              for (const ev of events) {
                const ts = ev.timestamp ? new Date(ev.timestamp).toISOString() : new Date().toISOString()
                const addr = ev.location?.address || {}
                const loc = [addr.addressLocality, addr.countryCode].filter(Boolean).join(', ') || null
                const desc = (ev.description || ev.status?.description || '').trim()
                bgEvents.push({ status: mapDhlStatus(ev), description: desc || null, location: loc, event_time: ts })
              }
            } else if (isDPD) {
              const dpdData = await new Promise((resolve) => {
                const path = `/parcel/${encodeURIComponent(trackingNumber)}/de_DE/parcelstatus`
                const req2 = https.request(
                  { hostname: 'tracking.dpd.de', path, method: 'GET', headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0' } },
                  (resp) => { let body = ''; resp.on('data', d => { body += d }); resp.on('end', () => { try { resolve({ data: JSON.parse(body), ok: resp.statusCode < 400 }) } catch { resolve({ data: {}, ok: false }) } }) }
                )
                req2.on('error', () => resolve({ data: {}, ok: false })); req2.end()
              })
              if (dpdData.ok) {
                for (const step of (dpdData.data?.parcelStatusList || [])) {
                  const desc = (step.label || step.description || '').trim()
                  const ts = step.date ? new Date(`${step.date}T${step.time || '00:00:00'}`).toISOString() : new Date().toISOString()
                  const descLower = desc.toLowerCase()
                  let status = 'in_transit'
                  if (descLower.includes('zugestellt') || descLower.includes('übergeben an') || descLower.includes('delivered')) status = 'zugestellt'
                  else if (descLower.includes('aufgabe') || descLower.includes('übergabe an dpd') || descLower.includes('abgegeben')) status = 'versendet'
                  bgEvents.push({ status, description: desc || null, location: step.city || null, event_time: ts })
                }
              }
            } else if (isGLS) {
              const glsData = await new Promise((resolve) => {
                const path = `/app/service/open/rest/DE/de/rstt001/?match=${encodeURIComponent(trackingNumber)}&type=standard&caller=witt&milis=${Date.now()}`
                const req2 = https.request(
                  { hostname: 'gls-group.com', path, method: 'GET', headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0' } },
                  (resp) => { let body = ''; resp.on('data', d => { body += d }); resp.on('end', () => { try { resolve({ data: JSON.parse(body), ok: resp.statusCode < 400 }) } catch { resolve({ data: {}, ok: false }) } }) }
                )
                req2.on('error', () => resolve({ data: {}, ok: false })); req2.end()
              })
              if (glsData.ok) {
                for (const tuple of (glsData.data?.tuples || [])) {
                  for (const ev of (tuple.history || [])) {
                    const desc = (ev.evtDscr || ev.description || '').trim()
                    const ts = ev.date ? new Date(`${ev.date}T${ev.time || '00:00'}:00`).toISOString() : new Date().toISOString()
                    const descLower = desc.toLowerCase()
                    let status = 'in_transit'
                    if (descLower.includes('zugestellt') || descLower.includes('delivered')) status = 'zugestellt'
                    else if (descLower.includes('aufgabe') || descLower.includes('einlieferung') || descLower.includes('paketshop')) status = 'versendet'
                    bgEvents.push({ status, description: desc || null, location: ev.location || null, event_time: ts })
                  }
                }
              }
            }

            let mostRecentStatus = null
            for (const ev of bgEvents) {
              mostRecentStatus = ev.status
              const exists = await c2.query(
                `SELECT id FROM store_shipment_events WHERE order_id=$1::uuid AND status=$2 AND event_time=$3::timestamptz AND description IS NOT DISTINCT FROM $4 LIMIT 1`,
                [order.id, ev.status, ev.event_time, ev.description || null]
              )
              if (!exists.rows.length) {
                await c2.query(
                  `INSERT INTO store_shipment_events (order_id, status, description, location, event_time, source) VALUES ($1::uuid,$2,$3,$4,$5::timestamptz,'auto')`,
                  [order.id, ev.status, ev.description || null, ev.location || null, ev.event_time]
                )
              }
            }
            if (mostRecentStatus === 'zugestellt') {
              await c2.query(`UPDATE store_orders SET delivery_status='zugestellt', delivery_date=COALESCE(delivery_date,now()), updated_at=now() WHERE id=$1::uuid AND delivery_status != 'zugestellt'`, [order.id])
              await c2.query(`UPDATE store_orders SET order_status='abgeschlossen', updated_at=now() WHERE id=$1::uuid AND payment_status='bezahlt' AND delivery_status='zugestellt' AND order_status NOT IN ('abgeschlossen','retoure','retoure_anfrage','refunded','storniert')`, [order.id])
            } else if (mostRecentStatus === 'versendet' || mostRecentStatus === 'in_transit') {
              await c2.query(`UPDATE store_orders SET delivery_status='versendet', updated_at=now() WHERE id=$1::uuid AND delivery_status NOT IN ('versendet','zugestellt')`, [order.id])
            }
            await c2.end()
          } catch (_) {}
        }
      } catch (_) {
        try { await client.end() } catch (_2) {}
      }
    }
    // Run 5 min after boot, then every 3 hours
    setTimeout(() => runAutoTrackingRefresh().catch(() => {}), 5 * 60 * 1000)
    setInterval(() => runAutoTrackingRefresh().catch(() => {}), 3 * 60 * 60 * 1000)

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
        if (cleanIban) {
          const ichk = validateSepaIbanChecksum(cleanIban)
          if (!ichk.ok) {
            await client.end()
            return res.status(400).json({ message: ichk.message || 'Ungültige IBAN' })
          }
        }
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
                tos_acceptance: { service_agreement: 'full', date: Math.floor(Date.now() / 1000), ip: req.ip || '127.0.0.1' },
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

    // ── Seller Error Logs ─────────────────────────────────────────────────────
    /** Call this anywhere in the backend to log a seller error */
    logSellerError = async (sellerId, { errorCode, errorMessage, terminalOutput, context }) => {
      const client = getDbClient()
      if (!client) return
      try {
        await client.connect()
        await client.query(
          `INSERT INTO seller_error_logs (seller_id, error_code, error_message, terminal_output, context)
           VALUES ($1, $2, $3, $4, $5)`,
          [sellerId || null, errorCode || null, errorMessage || '(Unbekannt)', terminalOutput || null, context || null]
        )
        await client.end()
      } catch (_) {
        try { await client.end() } catch (_2) {}
      }
    }

    const adminHubSellerErrorLogsGET = async (req, res) => {
      if (!req.sellerUser?.is_superuser) return res.status(403).json({ message: 'Superuser required' })
      const client = getDbClient()
      if (!client) return res.status(503).json({ message: 'DB not configured' })
      try {
        await client.connect()
        const { seller_id, status } = req.query
        const params = []; const wheres = []
        if (seller_id) { params.push(seller_id); wheres.push(`e.seller_id = $${params.length}`) }
        if (status && status !== 'all') { params.push(status); wheres.push(`e.status = $${params.length}`) }
        const where = wheres.length ? 'WHERE ' + wheres.join(' AND ') : ''
        const r = await client.query(
          `SELECT e.*, s.store_name, s.email AS seller_email, s.company_name
             FROM seller_error_logs e
             LEFT JOIN seller_users s ON s.seller_id = e.seller_id
             ${where}
             ORDER BY e.created_at DESC LIMIT 500`,
          params
        )
        const unread = await client.query('SELECT COUNT(*) FROM seller_error_logs WHERE is_read = false')
        await client.end()
        res.json({ errors: r.rows, unread_count: parseInt(unread.rows[0]?.count || '0') })
      } catch (e) {
        try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    const adminHubSellerErrorLogsPOST = async (req, res) => {
      if (!req.sellerUser?.is_superuser) return res.status(403).json({ message: 'Superuser required' })
      const client = getDbClient()
      if (!client) return res.status(503).json({ message: 'DB not configured' })
      try {
        await client.connect()
        const { seller_id, error_code, error_message, terminal_output, context } = req.body || {}
        if (!error_message) { await client.end(); return res.status(400).json({ message: 'error_message required' }) }
        const r = await client.query(
          `INSERT INTO seller_error_logs (seller_id, error_code, error_message, terminal_output, context)
           VALUES ($1, $2, $3, $4, $5) RETURNING *`,
          [seller_id || null, error_code || null, error_message, terminal_output || null, context || null]
        )
        await client.end()
        res.json({ error: r.rows[0] })
      } catch (e) {
        try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    /** Sellers report client/API errors — visible in /sellers/errors for superusers */
    const adminHubSellerErrorsReportPOST = async (req, res) => {
      const sellerId = req.sellerUser?.seller_id
      if (!sellerId) return res.status(401).json({ message: 'Unauthorized' })
      if (req.sellerUser?.is_superuser) return res.json({ ok: true, skipped: true })
      const body = req.body || {}
      const error_message = String(body.error_message || '').trim()
      if (!error_message) return res.status(400).json({ message: 'error_message required' })
      const error_code = String(body.error_code || 'CLIENT_ERROR').slice(0, 100)
      const context = String(body.context || body.page_url || '').slice(0, 255) || null
      const terminal_output = body.terminal_output ? String(body.terminal_output).slice(0, 8000) : null
      const client = getDbClient()
      if (!client) return res.status(503).json({ message: 'DB not configured' })
      try {
        await client.connect()
        const dup = await client.query(
          `SELECT id FROM seller_error_logs
           WHERE seller_id = $1 AND error_code = $2 AND COALESCE(context, '') = COALESCE($3::varchar, '')
             AND created_at > now() - interval '15 minutes'
           LIMIT 1`,
          [sellerId, error_code, context],
        )
        if (dup.rows?.length) {
          await client.end()
          return res.json({ ok: true, duplicate: true })
        }
        const storeQ = await client.query(
          `SELECT store_name, email FROM seller_users WHERE seller_id = $1 LIMIT 1`,
          [sellerId],
        ).catch(() => ({ rows: [] }))
        const storeName = storeQ.rows?.[0]?.store_name || storeQ.rows?.[0]?.email || sellerId
        const r = await client.query(
          `INSERT INTO seller_error_logs (seller_id, error_code, error_message, terminal_output, context)
           VALUES ($1, $2, $3, $4, $5) RETURNING id`,
          [sellerId, error_code, error_message, terminal_output, context],
        )
        const logId = r.rows?.[0]?.id
        const notifTitle = `Seller-Fehler: ${storeName}`
        const notifBody = `[${error_code}] ${error_message.slice(0, 400)}${context ? ` · ${context}` : ''}`
        await client.query(
          `INSERT INTO admin_hub_notifications (type, title, body, seller_id, reference_id)
           VALUES ('seller_client_error', $1, $2, $3, $4)`,
          [notifTitle, notifBody, sellerId, logId ? String(logId) : null],
        ).catch(() => {})
        await client.end()
        res.json({ ok: true, id: logId })
      } catch (e) {
        try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    const adminHubSellerErrorLogsPATCH = async (req, res) => {
      if (!req.sellerUser?.is_superuser) return res.status(403).json({ message: 'Superuser required' })
      const { id } = req.params
      const client = getDbClient()
      if (!client) return res.status(503).json({ message: 'DB not configured' })
      try {
        await client.connect()
        const { status, resolution, is_read } = req.body || {}
        const sets = []; const params = []
        if (status !== undefined) { params.push(status); sets.push(`status = $${params.length}`) }
        if (resolution !== undefined) { params.push(resolution); sets.push(`resolution = $${params.length}`) }
        if (is_read !== undefined) { params.push(is_read ? true : false); sets.push(`is_read = $${params.length}`) }
        if (!sets.length) { await client.end(); return res.status(400).json({ message: 'Nothing to update' }) }
        sets.push('updated_at = now()')
        params.push(id)
        const r = await client.query(`UPDATE seller_error_logs SET ${sets.join(', ')} WHERE id = $${params.length}::uuid RETURNING *`, params)
        await client.end()
        res.json({ error: r.rows[0] })
      } catch (e) {
        try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    const adminHubSellerErrorLogsDELETE = async (req, res) => {
      if (!req.sellerUser?.is_superuser) return res.status(403).json({ message: 'Superuser required' })
      const { id } = req.params
      const client = getDbClient()
      if (!client) return res.status(503).json({ message: 'DB not configured' })
      try {
        await client.connect()
        await client.query('DELETE FROM seller_error_logs WHERE id = $1::uuid', [id])
        await client.end()
        res.json({ success: true })
      } catch (e) {
        try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    // ── Seller Locations CRUD ─────────────────────────────────────────────────
    const adminHubLocationsGET = async (req, res) => {
      const sellerId = req.sellerUser?.seller_id
      if (!sellerId) return res.status(401).json({ message: 'Unauthorized' })
      const client = getDbClient()
      if (!client) return res.status(503).json({ message: 'DB not configured' })
      try {
        await client.connect()
        const r = await client.query(
          'SELECT * FROM seller_locations WHERE seller_id = $1 ORDER BY is_primary DESC, created_at ASC',
          [sellerId]
        )
        // If no locations yet, seed from warehouse_address
        if (r.rows.length === 0) {
          const su = await client.query('SELECT warehouse_address, business_address FROM seller_users WHERE seller_id = $1 LIMIT 1', [sellerId])
          const seed = su.rows?.[0]
          const addr = seed?.warehouse_address || seed?.business_address
          if (addr) {
            const a = typeof addr === 'string' ? JSON.parse(addr) : addr
            await client.query(
              `INSERT INTO seller_locations (seller_id, name, address_line1, address_line2, city, postal_code, country, is_primary, type)
               VALUES ($1, 'Hauptstandort', $2, $3, $4, $5, $6, true, 'warehouse') ON CONFLICT DO NOTHING`,
              [sellerId, a.address_line1 || a.street || null, a.address_line2 || null, a.city || null, a.postal_code || a.zip || null, a.country || 'Deutschland']
            )
            const r2 = await client.query('SELECT * FROM seller_locations WHERE seller_id = $1 ORDER BY is_primary DESC, created_at ASC', [sellerId])
            await client.end()
            return res.json({ locations: r2.rows })
          }
        }
        await client.end()
        res.json({ locations: r.rows })
      } catch (e) {
        try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    const adminHubLocationsPOST = async (req, res) => {
      const sellerId = req.sellerUser?.seller_id
      if (!sellerId) return res.status(401).json({ message: 'Unauthorized' })
      const client = getDbClient()
      if (!client) return res.status(503).json({ message: 'DB not configured' })
      try {
        await client.connect()
        const { name, type, address_line1, address_line2, city, postal_code, country, phone, email, is_primary } = req.body || {}
        if (!name) { await client.end(); return res.status(400).json({ message: 'Name erforderlich' }) }
        if (is_primary) await client.query('UPDATE seller_locations SET is_primary = false WHERE seller_id = $1', [sellerId])
        const r = await client.query(
          `INSERT INTO seller_locations (seller_id, name, type, address_line1, address_line2, city, postal_code, country, phone, email, is_primary)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
          [sellerId, name, type || 'warehouse', address_line1 || null, address_line2 || null, city || null, postal_code || null, country || 'Deutschland', phone || null, email || null, is_primary ? true : false]
        )
        await client.end()
        res.json({ location: r.rows[0] })
      } catch (e) {
        try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    const adminHubLocationsPATCH = async (req, res) => {
      const sellerId = req.sellerUser?.seller_id
      if (!sellerId) return res.status(401).json({ message: 'Unauthorized' })
      const { id } = req.params
      const client = getDbClient()
      if (!client) return res.status(503).json({ message: 'DB not configured' })
      try {
        await client.connect()
        const chk = await client.query('SELECT id FROM seller_locations WHERE id = $1::uuid AND seller_id = $2 LIMIT 1', [id, sellerId])
        if (!chk.rows.length) { await client.end(); return res.status(404).json({ message: 'Not found' }) }
        const { name, type, address_line1, address_line2, city, postal_code, country, phone, email, is_primary, is_active } = req.body || {}
        if (is_primary) await client.query('UPDATE seller_locations SET is_primary = false WHERE seller_id = $1', [sellerId])
        const sets = []; const params = []
        const add = (col, val) => { if (val !== undefined) { params.push(val); sets.push(`${col} = $${params.length}`) } }
        add('name', name); add('type', type); add('address_line1', address_line1); add('address_line2', address_line2)
        add('city', city); add('postal_code', postal_code); add('country', country)
        add('phone', phone); add('email', email)
        if (is_primary !== undefined) { params.push(is_primary ? true : false); sets.push(`is_primary = $${params.length}`) }
        if (is_active !== undefined) { params.push(is_active ? true : false); sets.push(`is_active = $${params.length}`) }
        if (!sets.length) { await client.end(); return res.status(400).json({ message: 'Nothing to update' }) }
        sets.push('updated_at = now()')
        params.push(id)
        const r = await client.query(`UPDATE seller_locations SET ${sets.join(', ')} WHERE id = $${params.length}::uuid RETURNING *`, params)
        await client.end()
        res.json({ location: r.rows[0] })
      } catch (e) {
        try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    const adminHubLocationsDELETE = async (req, res) => {
      const sellerId = req.sellerUser?.seller_id
      if (!sellerId) return res.status(401).json({ message: 'Unauthorized' })
      const { id } = req.params
      const client = getDbClient()
      if (!client) return res.status(503).json({ message: 'DB not configured' })
      try {
        await client.connect()
        await client.query('DELETE FROM seller_locations WHERE id = $1::uuid AND seller_id = $2', [id, sellerId])
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

    httpApp.get('/admin-hub/v1/transactions', adminHubTransactionsGET)
    httpApp.get('/admin-hub/v1/coupons', adminHubCouponsGET)
    httpApp.post('/admin-hub/v1/coupons', adminHubCouponsPOST)
    httpApp.patch('/admin-hub/v1/coupons/:id', adminHubCouponsPATCH)
    httpApp.delete('/admin-hub/v1/coupons/:id', adminHubCouponsDELETE)
    httpApp.get('/admin-hub/v1/commission-invoices', adminHubCommissionInvoicesGET)
    httpApp.get('/admin-hub/v1/seller-payouts/:id/pdf', adminHubSellerPayoutPdfGET)
    httpApp.get('/admin-hub/v1/payouts', adminHubPayoutsGET)
    httpApp.post('/admin-hub/v1/payouts', adminHubPayoutsPOST)
    httpApp.patch('/admin-hub/v1/payouts/:id', adminHubPayoutsPATCH)
    httpApp.post('/admin-hub/v1/payouts/mark-paid', adminHubPayoutsMarkPaidPOST)
    httpApp.post('/admin-hub/v1/payouts/backfill', adminHubPayoutsBackfillPOST)
    httpApp.get('/admin-hub/v1/payout-summary', adminHubPayoutSummaryGET)
    httpApp.get('/admin-hub/v1/analytics/marketing', adminHubAnalyticsMarketingGET)
    httpApp.get('/admin-hub/v1/payout-overview', adminHubPayoutOverviewGET)
    httpApp.patch('/admin-hub/v1/seller/iban', adminHubSellerIbanPATCH)
    httpApp.get('/admin-hub/v1/seller/account', adminHubSellerAccountGET)
    httpApp.patch('/admin-hub/v1/seller/password', adminHubSellerPasswordPATCH)
    httpApp.get('/admin-hub/v1/seller/profile', adminHubSellerProfileGET)
    httpApp.get('/admin-hub/v1/seller/locations', adminHubLocationsGET)
    httpApp.post('/admin-hub/v1/seller/locations', adminHubLocationsPOST)
    httpApp.patch('/admin-hub/v1/seller/locations/:id', adminHubLocationsPATCH)
    httpApp.delete('/admin-hub/v1/seller/locations/:id', adminHubLocationsDELETE)
    httpApp.get('/admin-hub/v1/seller-errors', adminHubSellerErrorLogsGET)
    httpApp.post('/admin-hub/v1/seller-errors', adminHubSellerErrorLogsPOST)
    httpApp.post('/admin-hub/v1/seller-errors/report', adminHubSellerErrorsReportPOST)
    httpApp.patch('/admin-hub/v1/seller-errors/:id', adminHubSellerErrorLogsPATCH)
    httpApp.delete('/admin-hub/v1/seller-errors/:id', adminHubSellerErrorLogsDELETE)
    httpApp.post('/admin-hub/users/invite', adminHubUsersInvitePOST)
    httpApp.get('/admin-hub/v1/subusers', adminHubSubusersGET)
    httpApp.patch('/admin-hub/v1/subusers/:id', adminHubSubuserUpdatePATCH)
    httpApp.delete('/admin-hub/v1/subusers/:id', adminHubSubuserDeleteDELETE)
    httpApp.delete('/admin-hub/v1/pending-invites/:id', adminHubPendingInviteDeleteDELETE)

    // ── Seller Product Groups ─────────────────────────────────────────────────
    const pgDbClient = () => {
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      const { Client } = require('pg')
      return new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
    }

    httpApp.get('/admin-hub/v1/product-groups', async (req, res) => {
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

    httpApp.post('/admin-hub/v1/product-groups', async (req, res) => {
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

    httpApp.get('/admin-hub/v1/product-groups/:id', async (req, res) => {
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

    httpApp.put('/admin-hub/v1/product-groups/:id', async (req, res) => {
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

    httpApp.delete('/admin-hub/v1/product-groups/:id', async (req, res) => {
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

    httpApp.get('/admin-hub/v1/campaigns', async (req, res) => {
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

    httpApp.post('/admin-hub/v1/campaigns', async (req, res) => {
      const sellerId = req.sellerUser?.seller_id
      if (!sellerId) return res.status(403).json({ message: 'Seller ID required' })
      const { name, description, status, start_at, end_at, discount_type, discount_value, target_type, product_ids, group_ids, variant_ids, settings, campaign_type, budget_daily_cents, bid_strategy, ad_platforms } = req.body || {}
      if (!name?.trim()) return res.status(400).json({ message: 'name required' })
      const dType = String(discount_type || 'percentage').toLowerCase()
      const dVal = parseFloat(discount_value) || 0
      if (dVal < 0) return res.status(400).json({ message: 'discount_value must be >= 0' })
      if (dType === 'percentage' && dVal > 100) return res.status(400).json({ message: 'percentage discount must be 0–100' })
      const finalCampaignType = campaign_type || 'internal'
      const isPpc = finalCampaignType === 'ppc'
      const c = pgDbClient(); try {
        await c.connect()
        const r = await c.query(
          `INSERT INTO seller_campaigns (seller_id, name, description, status, start_at, end_at, discount_type, discount_value, target_type, product_ids, group_ids, variant_ids, settings, campaign_type, budget_daily_cents, bid_strategy, ad_platforms, ad_status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING *`,
          [sellerId, name.trim(), description || '', status || 'draft', start_at || null, end_at || null, discount_type || 'percentage', dVal, target_type || 'products', JSON.stringify(Array.isArray(product_ids) ? product_ids : []), JSON.stringify(Array.isArray(group_ids) ? group_ids : []), JSON.stringify(Array.isArray(variant_ids) ? variant_ids : []), JSON.stringify(settings || {}), finalCampaignType, parseInt(budget_daily_cents) || 0, bid_strategy || 'cpc', JSON.stringify(Array.isArray(ad_platforms) ? ad_platforms : []), isPpc ? 'pending' : 'draft']
        )
        const created = r.rows[0]
        // For PPC campaigns: notify all superusers (in-app + email)
        if (isPpc) {
          try {
            const sellerNameR = await c.query(
              `SELECT s.store_name AS settings_store_name, u.store_name AS user_store_name,
                      u.company_name, u.first_name, u.last_name, u.email
               FROM seller_users u
               LEFT JOIN admin_hub_seller_settings s ON s.seller_id = u.seller_id
               WHERE u.seller_id = $1 AND u.sub_of_seller_id IS NULL
               LIMIT 1`,
              [sellerId],
            )
            const sRow = sellerNameR.rows[0] || {}
            const sellerDisplayName =
              (sRow.settings_store_name && String(sRow.settings_store_name).trim()) ||
              (sRow.user_store_name && String(sRow.user_store_name).trim()) ||
              (sRow.company_name && String(sRow.company_name).trim()) ||
              [sRow.first_name, sRow.last_name].filter(Boolean).join(' ').trim() ||
              sRow.email ||
              sellerId
            await c.query(
              `INSERT INTO admin_hub_notifications (type, title, body, seller_id, reference_id)
               VALUES ('campaign_submitted', $1, $2, $3, $4)`,
              [
                `Neue Werbekampagne: ${created.name}`,
                `${sellerDisplayName} hat eine neue PPC-Kampagne erstellt. Budget: ${((parseInt(created.budget_daily_cents, 10) || 0) / 100).toFixed(2)} €/Tag.`,
                sellerId,
                created.id,
              ],
            ).catch(() => {})
            // Fire-and-forget email
            notifySuperusersNewCampaign({
              campaignId: created.id,
              campaignName: created.name,
              sellerDisplayName,
              sellerId,
              budgetCents: parseInt(created.budget_daily_cents, 10) || 0,
            }).catch((e) => log.error('notifySuperusersNewCampaign:', e?.message))
          } catch (notifErr) {
            log.error('campaign_submitted notification failed:', notifErr?.message)
          }
        }
        await c.end(); res.status(201).json({ campaign: created })
      } catch (e) { try { await c.end() } catch(_){} ; res.status(500).json({ message: e?.message }) }
    })

    httpApp.get('/admin-hub/v1/campaigns/:id', async (req, res) => {
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

    httpApp.put('/admin-hub/v1/campaigns/:id', async (req, res) => {
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

    httpApp.delete('/admin-hub/v1/campaigns/:id', async (req, res) => {
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

    // ── Google Ads API helpers ────────────────────────────────────────────────
    const GADS_API_VER = 'v19'

    async function gadsRefreshToken (creds) {
      const params = new URLSearchParams({
        client_id: creds.oauth_client_id || '',
        client_secret: creds.oauth_client_secret || '',
        refresh_token: creds.refresh_token || '',
        grant_type: 'refresh_token',
      })
      const r = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(`Google OAuth token refresh fehlgeschlagen: ${d.error_description || d.error || r.status}`)
      return d.access_token
    }

    async function gadsCall (resource, body, creds, accessToken) {
      const cid = String(creds.customer_id || '').replace(/-/g, '')
      const url = `https://googleads.googleapis.com/${GADS_API_VER}/customers/${cid}/${resource}:mutate`
      const headers = {
        'Authorization': `Bearer ${accessToken}`,
        'developer-token': String(creds.developer_token || ''),
        'Content-Type': 'application/json',
      }
      const mcc = String(creds.login_customer_id || '').replace(/-/g, '')
      if (mcc) headers['login-customer-id'] = mcc
      const r = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) })
      const d = await r.json()
      if (!r.ok) {
        const msg = d?.error?.message
          || d?.error?.details?.[0]?.errors?.[0]?.message
          || JSON.stringify(d).slice(0, 300)
        throw new Error(`Google Ads API [${resource}]: ${msg}`)
      }
      return d
    }

    async function publishToGoogleAds (account, camp, budgetDailyCents) {
      const creds = account.credentials || {}
      const cid = String(creds.customer_id || '').replace(/-/g, '')
      if (!cid || !creds.developer_token || !creds.refresh_token)
        throw new Error('Google Ads Zugangsdaten unvollständig (customer_id, developer_token, refresh_token erforderlich). Zugangsdaten unter Apps & Integrationen → Marketing konfigurieren.')
      if (!creds.oauth_client_id || !creds.oauth_client_secret)
        throw new Error('Google Ads OAuth Client ID/Secret fehlen. Zugangsdaten unter Apps & Integrationen → Marketing konfigurieren.')

      // Parse campaign settings for ad details
      let settings = {}
      try { settings = typeof camp.settings === 'string' ? JSON.parse(camp.settings) : (camp.settings || {}) } catch (_) {}

      const gadsHeadlines = Array.isArray(settings.gads_headlines) ? settings.gads_headlines.filter(h => h && h.trim()) : []
      const gadsDescriptions = Array.isArray(settings.gads_descriptions) ? settings.gads_descriptions.filter(d => d && d.trim()) : []
      const gadsKeywords = Array.isArray(settings.gads_keywords) ? settings.gads_keywords.filter(k => k && k.trim()) : []
      const gadsFinalUrl = settings.gads_final_url || process.env.SHOP_URL || process.env.NEXT_PUBLIC_SHOP_URL || 'https://andertal.de'
      const gadsGeoTargets = Array.isArray(settings.gads_geo_targets) && settings.gads_geo_targets.length > 0
        ? settings.gads_geo_targets
        : ['2276'] // Default: Germany
      const gadsLanguage = settings.gads_target_language || '1001' // Default: German
      const gadsCpcBidMicros = String(Math.max((Number(settings.gads_cpc_bid_cents) || 50), 10) * 10000)

      // Build headlines list (min 3, max 15, each max 30 chars)
      const campNameHeadline = (camp.name || 'Entdecke Angebote').slice(0, 30)
      const allHeadlines = [
        campNameHeadline,
        ...gadsHeadlines.map(h => h.slice(0, 30)),
      ]
      const fallbackHeadlines = ['Jetzt entdecken', 'Qualität online', 'Jetzt bestellen', 'Top Angebote', 'Direkt kaufen']
      for (const fb of fallbackHeadlines) {
        if (allHeadlines.length >= 5) break
        if (!allHeadlines.includes(fb)) allHeadlines.push(fb)
      }
      const headlines = allHeadlines.slice(0, 15).map(text => ({ text }))

      // Build descriptions list (min 2, max 4, each max 90 chars)
      const campDesc = (camp.description || '').slice(0, 90)
      const allDescriptions = [
        ...(campDesc ? [campDesc] : []),
        ...gadsDescriptions.map(d => d.slice(0, 90)),
      ]
      const fallbackDescs = ['Schnelle Lieferung · Sichere Zahlung', 'Jetzt bestellen und sparen', 'Top Qualität zum besten Preis']
      for (const fb of fallbackDescs) {
        if (allDescriptions.length >= 4) break
        if (!allDescriptions.includes(fb)) allDescriptions.push(fb)
      }
      const descriptions = allDescriptions.slice(0, 4).map(text => ({ text }))

      const token = await gadsRefreshToken(creds)
      const yyyymmdd = d => d ? new Date(d).toISOString().slice(0, 10).replace(/-/g, '') : null

      // 1 ── Campaign Budget (min 1 EUR = 1 000 000 micros; budgetDailyCents in cents)
      const budgetAmountMicros = String(Math.max(budgetDailyCents, 100) * 10000)
      const budgetRes = await gadsCall('campaignBudgets', {
        operations: [{ create: {
          name: `Andertal — ${camp.name} — ${Date.now()}`,
          amountMicros: budgetAmountMicros,
          deliveryMethod: 'STANDARD',
          explicitlyShared: false,
        }}]
      }, creds, token)
      const budgetResourceName = budgetRes.results?.[0]?.resourceName
      if (!budgetResourceName) throw new Error('Google Ads: Budget wurde erstellt aber kein resourceName zurückgegeben')
      const budgetId = budgetResourceName.split('/').pop()

      // 2 ── Campaign (SEARCH, bid strategy based on settings)
      const startDate = yyyymmdd(camp.start_at) || yyyymmdd(new Date())
      const bidStrategy = String(camp.bid_strategy || 'cpc').toLowerCase()
      const campCreate = {
        name: `${camp.name} — Andertal`,
        advertisingChannelType: 'SEARCH',
        status: 'ENABLED',
        campaignBudget: `customers/${cid}/campaignBudgets/${budgetId}`,
        networkSettings: { targetGoogleSearch: true, targetSearchNetwork: true, targetContentNetwork: false },
        startDate,
      }
      // Bid strategy
      if (bidStrategy === 'target_roas') {
        campCreate.targetRoas = { targetRoas: 3.0 }
      } else if (bidStrategy === 'cpm') {
        campCreate.targetSpend = { cpcBidCeilingMicros: gadsCpcBidMicros }
      } else {
        // cpc → Maximize Clicks with CPC ceiling
        campCreate.targetSpend = { cpcBidCeilingMicros: gadsCpcBidMicros }
      }
      const endDate = yyyymmdd(camp.end_at)
      if (endDate) campCreate.endDate = endDate
      const campRes = await gadsCall('campaigns', { operations: [{ create: campCreate }] }, creds, token)
      const campaignResourceName = campRes.results?.[0]?.resourceName
      if (!campaignResourceName) throw new Error('Google Ads: Kampagne erstellt aber kein resourceName zurückgegeben')
      const campaignId = campaignResourceName.split('/').pop()

      // 3 ── Geo targeting (campaignCriteria locations)
      if (gadsGeoTargets.length > 0) {
        const geoOps = gadsGeoTargets.map(geoId => ({
          create: {
            campaign: `customers/${cid}/campaigns/${campaignId}`,
            location: { geoTargetConstant: `geoTargetConstants/${geoId}` },
          }
        }))
        await gadsCall('campaignCriteria', { operations: geoOps }, creds, token).catch(e => {
          console.warn('[gads] geo targeting warning:', e?.message)
        })
      }

      // 4 ── Language targeting
      await gadsCall('campaignCriteria', {
        operations: [{
          create: {
            campaign: `customers/${cid}/campaigns/${campaignId}`,
            language: { languageConstant: `languageConstants/${gadsLanguage}` },
          }
        }]
      }, creds, token).catch(e => {
        console.warn('[gads] language targeting warning:', e?.message)
      })

      // 5 ── Ad Group
      const agRes = await gadsCall('adGroups', {
        operations: [{ create: {
          name: `${camp.name} — Gruppe`,
          campaign: `customers/${cid}/campaigns/${campaignId}`,
          status: 'ENABLED',
          type: 'SEARCH_STANDARD',
          cpcBidMicros: gadsCpcBidMicros,
        }}]
      }, creds, token)
      const adGroupResourceName = agRes.results?.[0]?.resourceName
      if (!adGroupResourceName) throw new Error('Google Ads: Ad Group erstellt aber kein resourceName zurückgegeben')
      const adGroupId = adGroupResourceName.split('/').pop()

      // 6 ── Keywords (BROAD match; at least one required for Search to show)
      const keywordsToAdd = gadsKeywords.length > 0 ? gadsKeywords : ['online kaufen', 'produkte kaufen', camp.name || 'angebote']
      const kwOps = keywordsToAdd.slice(0, 20).map(kwText => ({
        create: {
          adGroup: `customers/${cid}/adGroups/${adGroupId}`,
          status: 'ENABLED',
          keyword: { text: kwText.slice(0, 80), matchType: 'BROAD' },
        }
      }))
      await gadsCall('adGroupCriteria', { operations: kwOps }, creds, token)

      // 7 ── Responsive Search Ad
      await gadsCall('adGroupAds', {
        operations: [{ create: {
          adGroup: `customers/${cid}/adGroups/${adGroupId}`,
          status: 'ENABLED',
          ad: {
            responsiveSearchAd: { headlines, descriptions },
            finalUrls: [gadsFinalUrl],
          },
        }}]
      }, creds, token)

      return { campaignId, budgetId, adGroupId }
    }

    // Publish PPC campaign to ad platforms (superuser only)
    httpApp.post('/admin-hub/v1/campaigns/:id/publish', requireSuperuser, async (req, res) => {
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
        await c.end()

        const budgetPerPlatform = Math.floor((camp.budget_daily_cents || 0) / accounts.length)
        const externalIds = {}
        const publishErrors = []

        for (const account of accounts) {
          try {
            if (account.platform === 'google_ads') {
              const ids = await publishToGoogleAds(account, camp, budgetPerPlatform)
              externalIds['google_ads'] = `gads_${ids.campaignId}`
              externalIds['google_ads_budget_id'] = ids.budgetId
              externalIds['google_ads_adgroup_id'] = ids.adGroupId
            } else {
              // Other platforms: simulation placeholder until implemented
              externalIds[account.platform] = `sim_${account.platform}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
            }
          } catch (err) {
            console.error(`[publish] ${account.platform} error:`, err?.message)
            publishErrors.push({ platform: account.platform, error: err?.message || String(err) })
          }
        }

        const adStatus = publishErrors.length >= accounts.length ? 'draft' : (publishErrors.length > 0 ? 'partial' : 'published')
        const c2 = pgDbClient()
        await c2.connect()
        const r = await c2.query(
          `UPDATE seller_campaigns SET ad_status=$1, external_campaign_ids=$2, status='active', updated_at=now() WHERE id=$3 RETURNING *`,
          [adStatus, JSON.stringify(externalIds), req.params.id]
        )
        await c2.end()
        const successPlatforms = accounts.filter(a => !publishErrors.some(e => e.platform === a.platform)).map(a => a.platform)
        res.json({
          campaign: r.rows[0],
          budget_per_platform_cents: budgetPerPlatform,
          platforms_published: successPlatforms,
          errors: publishErrors.length ? publishErrors : undefined,
          warning: publishErrors.length >= accounts.length
            ? 'Externe Plattformen fehlgeschlagen — Kampagne ist intern aktiv. Zugangsdaten unter Apps & Integrationen prüfen.'
            : undefined,
        })
      } catch (e) { try { await c.end() } catch(_){} ; res.status(500).json({ message: e?.message }) }
    })

    // Pause published PPC campaign (superuser only)
    httpApp.post('/admin-hub/v1/campaigns/:id/pause', requireSuperuser, async (req, res) => {
      const c = pgDbClient(); try {
        await c.connect()
        const r = await c.query(`UPDATE seller_campaigns SET ad_status='paused', status='paused', updated_at=now() WHERE id=$1 RETURNING *`, [req.params.id])
        if (!r.rows[0]) { await c.end(); return res.status(404).json({ message: 'Not found' }) }
        await c.end(); res.json({ campaign: r.rows[0] })
      } catch (e) { try { await c.end() } catch(_){} ; res.status(500).json({ message: e?.message }) }
    })

    // Resume paused PPC campaign (superuser only)
    httpApp.post('/admin-hub/v1/campaigns/:id/resume', requireSuperuser, async (req, res) => {
      const c = pgDbClient(); try {
        await c.connect()
        const r = await c.query(`UPDATE seller_campaigns SET ad_status='published', status='active', updated_at=now() WHERE id=$1 RETURNING *`, [req.params.id])
        if (!r.rows[0]) { await c.end(); return res.status(404).json({ message: 'Not found' }) }
        await c.end(); res.json({ campaign: r.rows[0] })
      } catch (e) { try { await c.end() } catch(_){} ; res.status(500).json({ message: e?.message }) }
    })

    // Campaign budget prepayment via Stripe Checkout (seller-initiated)
    httpApp.post('/admin-hub/v1/campaigns/:id/checkout', async (req, res) => {
      const sellerId = req.sellerUser?.seller_id
      if (!sellerId) return res.status(403).json({ message: 'Seller ID required' })
      const campaignId = req.params.id
      const { success_url, cancel_url } = req.body || {}
      const c = pgDbClient(); try {
        await c.connect()
        const cr = await c.query(`SELECT * FROM seller_campaigns WHERE id=$1`, [campaignId])
        const camp = cr.rows[0]
        if (!camp) { await c.end(); return res.status(404).json({ message: 'Campaign not found' }) }
        if (!req.sellerUser?.is_superuser && camp.seller_id !== sellerId) { await c.end(); return res.status(403).json({ message: 'Forbidden' }) }
        const platformRow = await loadPlatformCheckoutRow(c)
        await c.end()
        const sk = resolveStripeSecretKeyFromPlatform(platformRow)
        if (!sk) return res.status(400).json({ message: 'Stripe nicht konfiguriert.' })
        const stripe = new (require('stripe'))(sk)
        const dailyCents = parseInt(camp.budget_daily_cents || 0, 10)
        if (dailyCents <= 0) return res.status(400).json({ message: 'Tagesbudget muss > 0 sein.' })
        const totalCents = dailyCents * 30 // 30-day prepayment
        const sellerCentral = process.env.NEXT_PUBLIC_SELLERCENTRAL_URL || 'https://sellercentral.andertal.de'
        const session = await stripe.checkout.sessions.create({
          mode: 'payment',
          line_items: [{
            quantity: 1,
            price_data: {
              currency: 'eur',
              unit_amount: totalCents,
              product_data: {
                name: `Werbekampagne: ${camp.name}`,
                description: `30-Tage-Vorauszahlung · ${(dailyCents / 100).toFixed(2)} €/Tag`,
              },
            },
          }],
          metadata: { type: 'campaign_budget', campaign_id: campaignId, seller_id: sellerId },
          success_url: success_url || `${sellerCentral}/de/marketing/campaigns/${campaignId}?payment=success`,
          cancel_url: cancel_url || `${sellerCentral}/de/marketing/campaigns/${campaignId}?payment=cancelled`,
        })
        res.json({ checkout_url: session.url, session_id: session.id })
      } catch (e) { try { await c.end() } catch(_){} ; res.status(500).json({ message: e?.message }) }
    })

    // ── Automation Rules (superuser only) ────────────────────────────────────────
    const VALID_AUTOMATION_TYPES = ['review_request', 'welcome_email', 'reorder_reminder', 'abandoned_cart', 'low_stock_alert', 'loyalty_reward', 'price_drop_alert']

    const ensureAutomationTable = async (client) => {
      await client.query(`
        CREATE TABLE IF NOT EXISTS admin_hub_automation_rules (
          type TEXT PRIMARY KEY,
          is_active BOOLEAN NOT NULL DEFAULT false,
          config JSONB NOT NULL DEFAULT '{}',
          triggered_count INTEGER NOT NULL DEFAULT 0,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `)
    }

    httpApp.get('/admin-hub/v1/automations', requireSuperuser, async (req, res) => {
      const c = pgDbClient(); try {
        await c.connect()
        await ensureAutomationTable(c)
        const r = await c.query(`SELECT * FROM admin_hub_automation_rules ORDER BY type`)
        let statsRows = []
        try {
          const sr = await c.query(
            `SELECT trigger_key AS type, COUNT(*)::int AS count FROM store_flow_execution_logs WHERE trigger_key = ANY($1) GROUP BY trigger_key`,
            [VALID_AUTOMATION_TYPES]
          )
          statsRows = sr.rows
        } catch (_) {}
        await c.end()
        res.json({ rules: r.rows, stats: statsRows })
      } catch (e) { try { await c.end() } catch(_){} ; res.status(500).json({ message: e?.message }) }
    })

    httpApp.put('/admin-hub/v1/automations/:type', requireSuperuser, async (req, res) => {
      const { type } = req.params
      if (!VALID_AUTOMATION_TYPES.includes(type)) return res.status(400).json({ message: 'Invalid automation type' })
      const { is_active, config } = req.body || {}
      const c = pgDbClient(); try {
        await c.connect()
        await ensureAutomationTable(c)
        const r = await c.query(
          `INSERT INTO admin_hub_automation_rules (type, is_active, config, updated_at)
           VALUES ($1, $2, $3, now())
           ON CONFLICT (type) DO UPDATE SET is_active=$2, config=$3, updated_at=now()
           RETURNING *`,
          [type, is_active !== undefined ? Boolean(is_active) : false, JSON.stringify(config || {})]
        )
        await c.end()
        res.json({ rule: r.rows[0] })
      } catch (e) { try { await c.end() } catch(_){} ; res.status(500).json({ message: e?.message }) }
    })

    // ── Platform Marketing Accounts (superuser only) ──────────────────────────────
    httpApp.get('/admin-hub/v1/marketing-accounts', requireSuperuser, async (req, res) => {
      const c = pgDbClient(); try {
        await c.connect()
        const r = await c.query(`SELECT * FROM platform_marketing_accounts ORDER BY platform`)
        await c.end(); res.json({ accounts: r.rows })
      } catch (e) { try { await c.end() } catch(_){} ; res.status(500).json({ message: e?.message }) }
    })

    httpApp.patch('/admin-hub/v1/marketing-accounts', requireSuperuser, async (req, res) => {
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
    httpApp.get('/admin-hub/v1/seller-listings', async (req, res) => {
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
    httpApp.put('/admin-hub/v1/seller-listings/:id', async (req, res) => {
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
    httpApp.get('/admin-hub/v1/product-change-requests', async (req, res) => {
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
    httpApp.post('/admin-hub/v1/product-change-requests', async (req, res) => {
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
    httpApp.post('/admin-hub/v1/product-change-requests/:id/approve', async (req, res) => {
      if (!req.sellerUser?.is_superuser) return res.status(403).json({ message: 'Superuser only' })
      const { id } = req.params
      const { reviewer_note, new_value } = req.body || {}
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      const { Client } = require('pg')
      const c = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
      try {
        await c.connect()
        const cr = await c.query(`SELECT * FROM admin_hub_product_change_requests WHERE id = $1::uuid AND status = 'pending'`, [id])
        if (!cr.rows[0]) { await c.end(); return res.status(404).json({ message: 'Pending request not found' }) }
        const req_row = cr.rows[0]
        const appliedValue = (new_value != null) ? String(new_value) : req_row.new_value
        // Apply change to product
        if (req_row.field_name === 'title') {
          await c.query('UPDATE admin_hub_products SET title = $1, updated_at = now() WHERE id = $2::uuid', [appliedValue, req_row.product_id])
        } else if (req_row.field_name === 'description') {
          await c.query('UPDATE admin_hub_products SET description = $1, updated_at = now() WHERE id = $2::uuid', [appliedValue, req_row.product_id])
        } else if (req_row.field_name.startsWith('metadata.')) {
          const metaKey = req_row.field_name.replace('metadata.', '')
          let parsedVal
          try { parsedVal = JSON.parse(appliedValue) } catch (_) { parsedVal = appliedValue }
          await c.query(
            `UPDATE admin_hub_products SET metadata = jsonb_set(COALESCE(metadata,'{}'), $1, $2::jsonb, true), updated_at = now() WHERE id = $3::uuid`,
            ['{' + metaKey + '}', JSON.stringify(parsedVal), req_row.product_id]
          )
        }
        const p = await c.query(`SELECT id, handle FROM admin_hub_products WHERE id = $1::uuid`, [req_row.product_id]).catch(() => ({ rows: [] }))
        const productHandle = p.rows?.[0]?.handle ? String(p.rows[0].handle) : ''
        const productLink = productHandle ? `/produkt/${productHandle}` : `/products/${req_row.product_id}`
        await c.query(`UPDATE admin_hub_product_change_requests SET status = 'approved', reviewer_note = $1, new_value = $2, updated_at = now() WHERE id = $3::uuid`, [reviewer_note || null, appliedValue, id])
        if (req_row.seller_id) {
          await c.query(
            `INSERT INTO admin_hub_notifications (type, title, body, seller_id, reference_id)
             VALUES ('product_change_request_reviewed', $1, $2, $3, $4)`,
            [
              'Produkt wurde freigegeben',
              `Ihr Änderungsvorschlag wurde freigegeben. Produkt-Link: ${productLink}`,
              req_row.seller_id,
              req_row.product_id,
            ],
          ).catch(() => {})
        }
        await c.end()
        res.json({ success: true })
      } catch (e) {
        try { await c.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    })
    httpApp.post('/admin-hub/v1/product-change-requests/:id/reject', async (req, res) => {
      if (!req.sellerUser?.is_superuser) return res.status(403).json({ message: 'Superuser only' })
      const { id } = req.params
      const { reviewer_note } = req.body || {}
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      const { Client } = require('pg')
      const c = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
      try {
        await c.connect()
        const cr = await c.query(`SELECT * FROM admin_hub_product_change_requests WHERE id = $1::uuid AND status = 'pending'`, [id])
        const req_row = cr.rows?.[0]
        await c.query(`UPDATE admin_hub_product_change_requests SET status = 'rejected', reviewer_note = $1, updated_at = now() WHERE id = $2::uuid AND status = 'pending'`, [reviewer_note || null, id])
        if (req_row?.seller_id) {
          await c.query(
            `INSERT INTO admin_hub_notifications (type, title, body, seller_id, reference_id)
             VALUES ('product_change_request_reviewed', $1, $2, $3, $4)`,
            [
              'Produktänderung abgelehnt',
              `Ihr Änderungsvorschlag wurde abgelehnt.${reviewer_note ? ` Not: ${reviewer_note}` : ''}`,
              req_row.seller_id,
              req_row.product_id,
            ],
          ).catch(() => {})
        }
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
      agreement_accepted, agreement_accepted_at, agreement_version, agreement_ip,
      signature_at, signature_ip, signature_data
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

    // POST /admin-hub/v1/sellers/:id/impersonate — generate a token for a seller (superuser only)
    const adminHubSellerImpersonatePOST = async (req, res) => {
      if (!req.sellerUser?.is_superuser) return res.status(403).json({ message: 'Superuser access required' })
      const { id } = req.params
      try {
        const c = getSellerDbClient()
        await c.connect()
        const r = await c.query(
          `SELECT su.id, su.email, su.seller_id, su.is_superuser, ss.store_name
           FROM seller_users su
           LEFT JOIN admin_hub_seller_settings ss ON ss.seller_id = su.seller_id
           WHERE su.id::text = $1 OR su.seller_id = $1
           LIMIT 1`,
          [id]
        )
        await c.end()
        if (!r.rows.length) return res.status(404).json({ message: 'Seller not found' })
        const u = r.rows[0]
        const token = signSellerToken({ id: u.id, email: u.email, seller_id: u.seller_id, is_superuser: u.is_superuser, store_name: u.store_name || '' })
        res.json({ token, seller: { id: u.id, email: u.email, seller_id: u.seller_id, store_name: u.store_name || '', is_superuser: u.is_superuser } })
      } catch (e) {
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    httpApp.get('/admin-hub/v1/sellers', adminHubSellersGET)
    httpApp.get('/admin-hub/v1/sellers/:id', adminHubSellerByIdGET)
    httpApp.patch('/admin-hub/v1/sellers/:id', adminHubSellerPATCH)
    httpApp.patch('/admin-hub/v1/sellers/:id/approve', adminHubSellerApprovePATCH)
    httpApp.post('/admin-hub/v1/sellers/:id/impersonate', adminHubSellerImpersonatePOST)
    httpApp.patch('/admin-hub/v1/seller/company-info', adminHubSellerCompanyInfoPATCH)

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
    httpApp.post('/admin-hub/v1/verification/start', async (req, res) => {
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
    httpApp.get('/admin-hub/v1/verification/status', async (req, res) => {
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
    httpApp.post('/admin-hub/v1/verification/review', async (req, res) => {
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

    // ── Seller Agreement Signing Routes ─────────────────────────────────────
    ;(() => {
      const CONTRACT_SECTIONS_SIGN = {
        de: [
          { heading: 'Praeambel', body: 'Diese Haendler-Plattform-Vereinbarung (nachfolgend "Vereinbarung") regelt die Rechtsbeziehung zwischen der Andertal GmbH (nachfolgend "Plattform") und dem registrierten gewerblichen Verkaeufer (nachfolgend "Verkaeufer"). Mit elektronischer Unterzeichnung erklaert sich der Verkaeufer mit allen nachfolgenden Bedingungen einverstanden. Die Vereinbarung entspricht den Anforderungen der Verordnung (EU) 2022/2065 (Digital Services Act, "DSA"), der Verordnung (EU) 2019/1150 ueber die Foerderung von Fairness und Transparenz fuer gewerbliche Nutzer von Online-Vermittlungsdiensten (P2B-Verordnung), der Verordnung (EU) 2016/679 (Datenschutz-Grundverordnung, "DSGVO"), dem Gesetz gegen den unlauteren Wettbewerb (UWG), dem deutschen Buergerlichen Gesetzbuch (BGB) sowie allen weiteren anwendbaren nationalen und europaeischen Rechtsakten.' },
          { heading: 'SS 1 - Vertragsgegenstand und Plattformleistungen', body: 'Die Plattform stellt dem Verkaeufer eine technische Online-Infrastruktur zur Verfuegung, die es ermoeglicht, Waren gegenueber Endverbrauchern anzubieten, zu verwalten und zu verkaufen. Zu den Plattformleistungen gehoeren insbesondere: Bereitstellung einer Produktlistungs- und Katalogverwaltung, Abwicklung des Zahlungsverkehrs ueber zertifizierte Zahlungsdienstleister, Logistikunterstuetzung und Versandverfolgung, Bereitstellung von Verkaeufer-Analysewerkzeugen sowie Kundensupport-Schnittstellen. Der Verkaeufer tritt als eigenverantwortlicher gewerblicher Haendler im eigenen Namen und auf eigene Rechnung auf. Die Plattform ist kein Vertragspartner der Kaufvertraege zwischen Verkaeufer und Endkunden und tritt nicht als Kommissionaer auf. Die Plattform behaelt sich das Recht vor, den Leistungsumfang bei angemessener Vorabkuendigung (mindestens 30 Tage) zu aendern, sofern keine wesentliche Beeintraechtigung des Verkaeufers entsteht.' },
          { heading: 'SS 2 - Registrierung und Verifizierung', body: 'Der Zugang zur Plattform setzt eine vollstaendige Registrierung und erfolgreiche Identitaets- und Unternehmensverifizierung voraus. Der Verkaeufer ist verpflichtet: (a) wahrheitsgemaesse, vollstaendige und aktuelle Angaben zu Person, Unternehmen, Steuernummer (USt-IdNr.), Bankverbindung (IBAN/BIC) und Handelsregisternummer zu machen; (b) unverzueglich, spaetestens binnen 7 Werktagen, Aktualisierungen bei wesentlichen Aenderungen dieser Daten vorzunehmen; (c) Pruefungsunterlagen (Personalausweis, Handelsregisterauszug, Nachweis der Steuernummer) auf Anforderung der Plattform innerhalb von 10 Werktagen einzureichen. Falsche Angaben bei der Registrierung berechtigen die Plattform zur sofortigen Kontosperrung und ggf. zur Strafanzeige. Die Plattform erhebt und verarbeitet Registrierungsdaten gemaess ihrer Datenschutzerklaerung.' },
          { heading: 'SS 3 - Produktlistung und Inhaltspflichten', body: 'Der Verkaeufer ist fuer alle von ihm eingestellten Produkte und Inhalte allein verantwortlich. Er verpflichtet sich: (a) ausschliesslich Waren anzubieten, die den geltenden Produktsicherheitsvorschriften (EU-Produktsicherheitsverordnung 2023/988), CE-Kennzeichnungspflichten, Verpackungsgesetz (VerpackG) und sonstigen Kennzeichnungsvorschriften entsprechen; (b) Produktbeschreibungen, Bilder, Preisangaben und technische Daten vollstaendig, korrekt und nicht irrefuehrend bereitzustellen gemaess SS 5 UWG und Preisangabenverordnung (PAngV); (c) verbotene Waren (Waffen, Betaeubungsmittel, gefaelschte Markenartikel, urheberrechtsverletzendes Material, Waren mit Exportbeschraenkungen) unter keinen Umstaenden anzubieten; (d) alle erforderlichen Lizenzen, Zulassungen und Genehmigungen fuer die angebotenen Waren zu besitzen und der Plattform auf Anfrage nachzuweisen; (e) Preisauszeichnungen gemaess PAngV vorzunehmen, einschliesslich Grundpreisangabe bei mengenabhaengiger Preisgestaltung.' },
          { heading: 'SS 4 - Bestellabwicklung und Lieferpflichten', body: 'Der Verkaeufer verpflichtet sich zu einer zuverlaessigen und termingerechten Bestellabwicklung. Konkret gilt: (a) Bestellungen sind innerhalb der im Angebot angegebenen Lieferzeit zu erfuellen; eine maximale Lieferzeit von 14 Werktagen innerhalb der EU darf grundsaetzlich nicht ueberschritten werden; (b) bei Lieferverzoegerungen oder Nichtverfuegbarkeit ist der Kunde unverzueglich, spaetestens innerhalb von 24 Stunden nach Bekanntwerden der Verzoegerung, zu benachrichtigen; (c) Verbrauchern ist ein gesetzliches 14-taegiges Widerrufsrecht gemaess SS 355 ff. BGB in Verbindung mit der EU-Verbraucherrechterichtlinie 2011/83/EU zu gewaehren; (d) der Verkaeufer stellt dem Kaeufer eine ordentliche Rechnung gemaess SS 14 UStG aus und bewahrt Kopien fuer mindestens 10 Jahre auf; (e) die Verpackungsvorschriften des VerpackG sind einzuhalten, insbesondere die Pflicht zur Registrierung im LUCID-Register.' },
          { heading: 'SS 5 - Gewaehrleistung und Retouren', body: 'Der Verkaeufer gewaehrt Endkunden alle gesetzlichen Gewaehrleistungsrechte gemaess SS 434 ff. BGB. Dies umfasst: (a) eine Gewaehrleistungsfrist von 2 Jahren ab Lieferung fuer Neuware und 1 Jahr fuer gebrauchte Ware (bei entsprechender Kennzeichnung); (b) das Recht des Kaeufern auf Nacherfuellung (Reparatur oder Ersatzlieferung), Minderung oder Ruecktritt bei mangelhafter Ware; (c) ein Retourenmanagement, das eine unkomplizierte Ruecksendung gewaehrleistet; Retourenkosten innerhalb der EU traegt der Verkaeufer, sofern keine abweichende gesetzliche Regelung gilt; (d) Gutschriften oder Erstattungen sind innerhalb von 14 Tagen nach Eingang der Retoure abzuwickeln; (e) bei Warenmaengeln, die ein Sicherheitsrisiko darstellen, ist die Plattform unverzueglich zu benachrichtigen und ggf. ein Produktrueckruf einzuleiten.' },
          { heading: 'SS 6 - Datenschutz und Vertraulichkeit (DSGVO)', body: 'Der Verkaeufer verarbeitet personenbezogene Daten von Endkunden (Name, Anschrift, E-Mail, Bestelldaten, Zahlungsdaten) ausschliesslich zum Zweck der Vertragserfuellung (Art. 6 Abs. 1 lit. b DSGVO) und darf diese Daten nicht fuer andere Zwecke, insbesondere nicht fuer Werbung, verwenden, sofern keine gesonderte Einwilligung vorliegt. Folgende Pflichten gelten: (a) Einrichtung und Aufrechterhaltung angemessener technischer und organisatorischer Massnahmen (TOMs) zum Schutz personenbezogener Daten gemaess Art. 32 DSGVO; (b) Meldung von Datenpannen, die Kundendaten betreffen, gegenueber der Plattform innerhalb von 24 Stunden und gegenueber der zust. Aufsichtsbehoerde binnen 72 Stunden gemaess Art. 33 DSGVO; (c) Abschluss eines Auftragsverarbeitungsvertrags (AVV) mit der Plattform gemaess Art. 28 DSGVO, soweit eine Auftragsverarbeitung stattfindet; (d) Beantwortung von Betroffenenanfragen (Auskunft, Loeschung, Berichtigung, Einschraenkung) innerhalb von 30 Kalendertagen; (e) keine Datenuebertragung in Drittlaender ohne angemessenes Schutzniveau gemaess Art. 44 ff. DSGVO.' },
          { heading: 'SS 7 - Provisionen und Abrechnungsmodalitaeten', body: 'Fuer die Nutzung der Plattform erhebt die Plattform eine Transaktionsgebuehr gemaess der zum Zeitpunkt des Vertragsschlusses gueltigen Preisliste, die dem Verkaeufer im Seller-Dashboard zugaenglich ist. Es gelten folgende Regelungen: (a) Provisionen werden automatisch bei Auftragsabschluss (Zahlungseingang) vom Transaktionsbetrag abgezogen; (b) Auszahlungen an den Verkaeufer erfolgen nach einer Sicherheitshaltefrist von 7 bis 14 Werktagen nach Lieferbesraetigung, um Retouren und Chargebacks abzufedern; (c) die Plattform ist berechtigt, Betraege bei begruendeten Rueckforderungen (Chargebacks, Retouren, Betrug, Produktmaengeln) einzubehalten oder zu verrechnen; (d) bei Verzug mit etwaigen Gebuehrenzahlungen werden Verzugszinsen in Hoehe von 9 Prozentpunkten ueber dem Basiszinssatz gemaess SS 288 Abs. 2 BGB faellig; (e) Abrechnungen und Kontoauszuege werden dem Verkaeufer monatlich im Seller-Dashboard bereitgestellt und gelten als anerkannt, wenn keine Beanstandung innerhalb von 30 Tagen erhoben wird.' },
          { heading: 'SS 7a - Zahlungsermaechtigung und Zahlungsfluss', body: 'Der Verkaeufer bevollmaechtigt die Plattform und deren Zahlungsdienstleister (insbesondere Stripe Connect), Zahlungen von Endkunden in seinem Namen und auf seine Rechnung entgegenzunehmen. Der Zahlungseingang beim Zahlungsdienstleister oder der Plattform gilt als Zahlungseingang beim Verkaeufer. Zahlungen werden ueber Stripe Connect oder gleichwertige zertifizierte Zahlungsdienstleister abgewickelt. Der Verkaeufer nimmt zur Kenntnis, dass Gelder zunaechst auf einem von der Plattform verwalteten Treuhandkonto eingehen, bevor sie nach Ablauf der Sicherheitshaltefrist an den Verkaeufer ausgezahlt werden.' },
          { heading: 'SS 7b - Provisionserstattung bei Retouren', body: 'Nimmt ein Kaeufer sein Widerrufsrecht wahr oder wird eine Retoure verarbeitet, wird der zugehoerige Bestellbetrag einschliesslich der einbehaltenen Provision storniert. Die Provision wird dem Verkaeufer erstattet, sofern der volle Kaufpreis zurueckgebucht wurde. Bei Teilretouren wird die Provision anteilig erstattet. Chargebacks (Rueckbuchungen durch den Zahlungsdienstleister) fuehren zum vollstaendigen Einbehalt des Transaktionsbetrags; die Plattform leitet das Chargeback-Verfahren ein und informiert den Verkaeufer.' },
          { heading: 'SS 8 - Geistiges Eigentum und Markenrechte', body: 'Der Verkaeufer sichert zu, dass die von ihm eingestellten Inhalte (Texte, Bilder, Logos, Produktbeschreibungen) keine Rechte Dritter verletzen. Im Einzelnen gilt: (a) der Verkaeufer raeumt der Plattform eine nicht-exklusive, weltweite, kostenfreie Lizenz zur Nutzung der eingestellten Inhalte fuer Marketingzwecke der Plattform ein, soweit dies zur Darstellung der Produkte erforderlich ist; (b) der Verkaeufer haftet fuer alle Ansprueche, die aus der Verletzung von Urheber-, Marken-, Patent- oder sonstigen Schutzrechten Dritter entstehen, und stellt die Plattform von derartigen Anspruechen frei; (c) die Plattform behaelt sich das Recht vor, Listings, die Hinweise auf Rechtsverletzungen enthalten, ohne Vorankuendigung zu entfernen; (d) der Verkaeufer darf ohne ausdrueckliche schriftliche Genehmigung der Plattform keine Marken, Logos oder andere Schutzrechte der Plattform verwenden.' },
          { heading: 'SS 9 - Ranking und Sichtbarkeit (P2B-Verordnung)', body: 'Gemaess Art. 5 der EU-Verordnung 2019/1150 legt die Plattform die wesentlichen Parameter ihres Ranking-Algorithmus transparent offen. Die Sichtbarkeit eines Verkaeufers und seiner Produkte wird durch folgende Faktoren beeinflusst: (a) Produktqualitaet und Vollstaendigkeit der Produktdaten (Beschreibung, Bilder, Attribute); (b) Kundenbewertungen und -rezensionen (Durchschnittsnote, Anzahl, Aktualitaet); (c) Bestellabwicklungsrate und durchschnittliche Lieferzeit; (d) Preiswettbewerbsfaehigkeit im Vergleich zu aehnlichen Produkten; (e) Konto-Compliance (keine offenen Vertragsverletzungen, vollstaendige Verifizierung); (f) Konversionsdaten und Klickrate. Bezahlte Rankingfoerderungen werden als "Gesponsert" oder "Werbeanzeige" deutlich gekennzeichnet und beeinflussen das organische Ranking nicht. Die Plattform verpflichtet sich, keine Ungleichbehandlung eigener Angebote gegenueber Drittanbietern vorzunehmen.' },
          { heading: 'SS 10 - Verhaltenskodex und Verbotene Praktiken', body: 'Der Verkaeufer verpflichtet sich zur Einhaltung eines fairen und rechtskonformen Verhaltens. Verboten sind insbesondere: (a) Preisabsprachen oder sonstige wettbewerbswidrige Absprachen mit anderen Verkaeufeern (Kartellrecht); (b) das Einstellen gefaelschter, irrefuehrender oder manipulierter Kundenbewertungen; (c) der Einsatz von Methoden zur kuenstlichen Beeinflussung des Rankings, z.B. durch Klickfarmen oder automatisierte Skripte; (d) das Abwerben von Kunden der Plattform auf andere Verkaufskanaele ausserhalb der Plattform (Direktabschluss); (e) die Nutzung von Kundendaten der Plattform fuer eigene Marketingzwecke ausserhalb der Plattform; (f) jegliche Form von Betrug, Identitaetstaeusching, Geldwaescheverdacht oder Finanzierung illegaler Aktivitaeten; (g) das Einstellen von Produkten, die gegen Exportkontrollvorschriften, Sanktionslisten oder UN-Embargos verstossen.' },
          { heading: 'SS 11 - Kontosperrung, Massnahmen und Kuendigung', body: 'Die Plattform kann bei Verstoessen gegen diese Vereinbarung folgende Massnahmen ergreifen: (a) Verwarnung mit Fristsetzung zur Abhilfe; (b) vorlaeufige Einschraenkung oder Sperrung einzelner Listings; (c) vorlaeufige Kontoeinfrierung (Escrow der ausstehenden Auszahlungen); (d) dauerhafte Kontosperrung bei schwerwiegenden oder wiederholten Verstoessen. Vor einer dauerhaften Sperrung erhaelt der Verkaeufer, sofern kein Notfall vorliegt, eine schriftliche Begruendung und eine Frist von 7 Werktagen zur Stellungnahme. Der Verkaeufer kann das Konto jederzeit mit einer Kuendigungsfrist von 30 Tagen schriftlich kuendigen. Die Plattform kann die Vereinbarung mit 30 Tagen Frist ordentlich kuendigen; eine ausserordentliche Kuendigung aus wichtigem Grund ist jederzeit moeglich. Nach Beendigung werden noch ausstehende Auszahlungen nach Abzug offener Forderungen ausgezahlt, sofern keine Sperr- oder Einbehaltungsgruende bestehen.' },
          { heading: 'SS 12 - Haftung des Verkaefers und Freistellung', body: 'Der Verkaeufer haftet gegenueber der Plattform fuer alle Schaeden, die der Plattform durch schuldhafte Verletzung dieser Vereinbarung entstehen. Insbesondere gilt: (a) der Verkaeufer stellt die Plattform vollstaendig von Anspruechen Dritter frei, die aus Produktmaengeln, Rechtsverletzungen oder sonstigen Pflichtverletzungen des Verkaefers resultieren, einschliesslich Anwalts- und Gerichtskosten; (b) fuer Schaeden durch Datenschutzverletzungen, die in den Verantwortungsbereich des Verkaefers fallen, haftet der Verkaeufer unbegrenzt gemaess DSGVO Art. 82; (c) die Haftung fuer reine Vermoegensschaeden, die nicht auf Vorsatz oder grober Fahrlaessigkeit beruhen, ist auf den Wert der betreffenden Transaktionen der letzten 12 Monate beschraenkt.' },
          { heading: 'SS 13 - Haftungsbeschraenkung der Plattform', body: 'Die Haftung der Plattform gegenueber dem Verkaeufer ist wie folgt beschraenkt: (a) die Plattform haftet unbegrenzt fuer Schaeden aus der Verletzung des Lebens, des Koerpers oder der Gesundheit sowie fuer vorsaetzlich oder grob fahrlaessig verursachte Schaeden; (b) fuer leicht fahrlaessig verursachte Schaeden haftet die Plattform nur bei Verletzung wesentlicher Vertragspflichten (Kardinalpflichten) und auch nur in Hoehe des fuer die Plattform vorhersehbaren und vertragsty pischen Schadens; (c) eine Haftung fuer mittelbare Schaeden, entgangenen Gewinn, Datenverlust oder Folgeschaeden ist - ausser in den Faellen der lit. a - ausgeschlossen; (d) die Plattform haftet nicht fuer Ausfaelle oder Stoerungen, die auf hoehere Gewalt, Angriffe Dritter (z.B. DDoS), Stoerungen des Internets oder externe Dienstleister zurueckzufuehren sind.' },
          { heading: 'SS 14 - Aenderungen der Plattformbedingungen (DSA-Konformitaet)', body: 'Aenderungen dieser Vereinbarung werden dem Verkaeufer gemaess Art. 3 Abs. 3 der P2B-Verordnung und Art. 14 DSA wie folgt mitgeteilt: (a) per E-Mail an die hinterlegte Adresse sowie per In-App-Benachrichtigung mindestens 15 Tage vor Inkrafttreten; (b) bei Aenderungen aufgrund rechtlicher Anforderungen (neue Gesetze, Gerichtsurteile, Aufsichtsbehoerdenentscheidungen) kann die Frist auf 3 Tage verkuerzt werden; (c) der Verkaeufer kann der Aenderung durch schriftliche Kuendigung des Vertrages innerhalb der Ankuendigungsfrist widersprechen; verbleibt der Verkaeufer nach Ablauf der Frist auf der Plattform, gilt die Zustimmung als erteilt; (d) die jeweils aktuelle Vereinbarung ist jederzeit im Seller-Dashboard abrufbar.' },
          { heading: 'SS 15 - Schlichtung und Streitbeilegung (DSA / P2B)', body: 'Streitigkeiten zwischen Plattform und Verkaeufer werden durch folgendes mehrstufiges Verfahren geloest: (a) Interne Beschwerdebehandlung: Der Verkaeufer kann jede Entscheidung der Plattform innerhalb von 14 Tagen schriftlich anfechten (info@andertal.com); die Plattform bearbeitet Beschwerden kostenlos und zuegig gemaess Art. 11 P2B-Verordnung; (b) Externe Schlichtung: Als anerkannte Schlichtungsstelle steht der Centre for Effective Dispute Resolution (CEDR) sowie das Online-Streitbeilegungsportal der EU-Kommission (https://ec.europa.eu/consumers/odr/) zur Verfuegung; (c) Gerichtlicher Rechtsweg: Es gilt deutsches Recht unter Ausschluss des UN-Kaufrechts (CISG). Gerichtsstand fuer alle Streitigkeiten aus oder im Zusammenhang mit dieser Vereinbarung ist Berlin, sofern der Verkaeufer Kaufmann ist.' },
          { heading: 'SS 16 - Compliance und regulatorische Anforderungen', body: 'Der Verkaeufer verpflichtet sich zur Einhaltung aller anwendbaren regulatorischen und gesetzlichen Anforderungen. Hierzu gehoeren: (a) Einhaltung der EU-Taxiverordnung (DAC7) und automatischer Informationsaustausch mit Steuerbhoerden; der Verkaeufer nimmt zur Kenntnis, dass die Plattform zur Meldung von Umsaetzen an Finanzbehoerden verpflichtet sein kann; (b) Einhaltung der Geldwaesche-Richtlinie (EU) 2015/849 und Bereitstellung entsprechender KYC-Dokumente (Know Your Customer) auf Anforderung; (c) Einhaltung des Lieferkettensorgfaltspflichtengesetzes (LkSG), soweit anwendbar, und Vorlage entsprechender Selbsterklaerungen; (d) Einhaltung der Batterieverordnung (EU) 2023/1542 und des Elektro- und Elektronikgeraetegesetzes (ElektroG) fuer einschlaegige Produkte; (e) Compliance mit dem Marktueberw achungsrecht gemaess Verordnung (EU) 2019/1020.' },
          { heading: 'SS 17 - Schlussbestimmungen', body: 'Diese Vereinbarung stellt die vollstaendige Einigung zwischen den Parteien hinsichtlich des Gegenstandes dar und ersetzt alle vorherigen muendlichen oder schriftlichen Vereinbarungen. Salvatorische Klausel: Sollten einzelne Bestimmungen dieser Vereinbarung unwirksam oder undurchfuehrbar sein oder werden, bleibt die Wirksamkeit der uebrigen Bestimmungen hiervon ungberuehrt. Die Parteien verpflichten sich, die unwirksame Bestimmung durch eine wirksame Regelung zu ersetzen, die dem wirtschaftlichen Zweck der unwirksamen Bestimmung am naechsten kommt. Schriftformerfordernis: Aenderungen und Ergaenzungen dieser Vereinbarung beduerfen zu ihrer Wirksamkeit der Schriftform (einschliesslich E-Mail mit Lesebestaetigung). Abtretungsverbot: Rechte und Pflichten aus dieser Vereinbarung sind ohne vorherige schriftliche Zustimmung der jeweils anderen Partei nicht abtretbar. Diese Vereinbarung unterliegt deutschem Recht. Letzte Aktualisierung: April 2026.' },
        ],
        tr: [
          { heading: 'Oensoz', body: 'Bu Satici-Platform Sozlesmesi (bundan boyle "Sozlesme"), Andertal platformunun isletmecisi (bundan boyle "Platform") ile kayitli ticari satici (bundan boyle "Satici") arasindaki hukuki iliskiyi duzenler. Sozlesme; AB Dijital Hizmetler Yasasi (DSA) (AB) 2022/2065, Cevrimici Aracilik Hizmetleri Tuzugu (P2B) (AB) 2019/1150, Genel Veri Koruma Tuzugu (GDPR) (AB) 2016/679, Turk Ticaret Kanunu (TTK), Tuketiciyi Koruma Kanunu (TKHK) ve diger gecerli ulusal ve uluslararasi mevzuat hukumleri cercevesinde hazirlanmistir. Sozlesmenin elektronik olarak imzalanmasi, Saticinin tum sart ve kosullari kabul ettigini ifade eder.' },
          { heading: 'Madde 1 - Sozlesmenin Konusu ve Platform Hizmetleri', body: 'Platform, Saticiya son tuketicilere urun listeleme, yonetme ve satma amacıyla teknik bir cevrimici altyapi saglar. Platform hizmetleri sunlari kapsar: urun listeleme ve katalog yonetimi, sertifikali odeme servis saglayicilari araciligiyla odeme isleme, lojistik destegi ve kargo takibi, satis analiz araclari ve muster destek arayuzleri. Satici, kendi adina ve kendi hesabina bagimsiz bir ticari satici olarak hareket eder; Platform, Satici ile son musteri arasindaki satis sozlesmelerinin tarafi degildir. Platform, Saticiya en az 30 gun onceden bildirimde bulunarak hizmet kapsamini degistirme hakkini sakli tutar.' },
          { heading: 'Madde 2 - Kayit ve Dogrulama', body: 'Platforma erisim, eksiksiz kayit ve basarili kimlik ile isletme dogrulamasini gerektirir. Satici su yukuklulukleri ustlenir: (a) gercekci, eksiksiz ve guncel kisisel, isletme, vergi numarasi (TICARI UNVAN, vergi kimlik numarasi), IBAN ve ticaret sicil bilgileri sunmak; (b) bu bilgilerde onemli degisiklikleri 7 is gunu icinde guncellemek; (c) talep uzerine 10 is gunu icinde dogrulama belgelerini (kimlik belgesi, ticaret sicil gazetesi, vergi levhasi) ibraz etmek. Yanlis beyan, Platformun hesabi aninda askiya alma ve yasal islem baslat ma hakkini verir.' },
          { heading: 'Madde 3 - Urun Listeleme ve Icerik Yukumlulukler', body: 'Satici, listelenen tum urunler ve iceriklerin hukuki uygunlugundan tek basina sorumludur. Satici su yukumlulukler kabul eder: (a) yalnizca AB Urun Guvenligi Yonetmeligi 2023/988, CE isareti zorunlulugu ve diger etiketleme mevzuatına uygun urunler listelemek; (b) urun aciklamalarini, gorsellerini, fiyatlarini ve teknik bilgilerini dogru ve yaniltici olmayan sekilde sunmak; (c) silah, uyusturucu, sahte markalı urunler, telif hakkı ihlali iceren materyaller veya ihracat kisitlamasi olan mallari kesinlikle listelememe; (d) listelenen urunler icin gerekli tum lisans, izin ve sertifikalara sahip olmak ve talep uzerine Platforma ibraz etmek; (e) adet bazli fiyatlandirmada birim fiyat gosterimine iliskin Turk mevzuatına ve AB PAngV duzenlemelerine uymak.' },
          { heading: 'Madde 4 - Siparis Karsilama ve Teslimat Yukumlulukler', body: 'Satici, guvenilir ve zamaninda siparis karsilamayı taahhut eder: (a) siparisler listede belirtilen teslimat suresi icinde karsilanmalidir; AB icinde en fazla 14 is gunluk teslimat suresine uyulmalidir; (b) gecikme veya stok yoklugu durumunda musteriye aninda, en gec gecikmenin ogrenilmesinden itibaren 24 saat icinde bildirim yapilmalidir; (c) tuketicilere AB Tuketici Haklari Direktifi 2011/83/AB ve TKHK kapsaminda 14 gunluk cayma hakki taninmalidir; (d) alicilara Turk Vergi Usul Kanunu uyarinca usulune uygun fatura duzenlenmeli ve kopyalar en az 10 yil saklanmalidir; (e) ambalaj duzenlemeleri ile varsa ulusal geri donusum ve atik yonetimi yukumlulukleri yerine getirilmelidir.' },
          { heading: 'Madde 5 - Garanti ve Iade', body: 'Satici, son musterilere TKHK ve ilgili AB mevzuati kapsamindaki tum yasal garanti haklarini saglar: (a) yeni urunler icin teslimattan itibaren 2 yil, ikinci el urunler icin 1 yil garanti (acikca belirtilmis olmasi sartiyla); (b) kusurlu mallarda alicinin ayni ifaya (tamir veya degisim), bedel indirimine veya sozlesmeden donmeye hakki; (c) kolay iade imkani saglayan bir iade yonetimi; AB icinde iade giderleri aksi yasal zorunluluk olmadikca Satici tarafindan karsilanir; (d) iade alinan urunler icin geri odeme, iadeye girisinden itibaren 14 gun icinde tamamlanmalidir; (e) guvenlik riski olusturan urun kusurlarinda Platform derhal bilgilendirilmeli ve gerekirse urun geri cagrilmalidir.' },
          { heading: 'Madde 6 - Kisisel Verilerin Korunmasi (KVKK / GDPR)', body: 'Satici, son musterilere ait kisisel verileri (ad, adres, e-posta, siparis ve odeme bilgileri) yalnizca sozlesmenin ifasi amaciyla isler (GDPR Madde 6(1)(b)). Su yukumlulukler gecerlidir: (a) GDPR Madde 32 uyarinca kisisel verilerin korunmasi icin uygun teknik ve idari onlemler almak; (b) musteri verilerini etkileyen veri ihlallerini Platforma 24 saat, yetkili denetim otoritesine 72 saat icinde bildirmek (GDPR Madde 33); (c) gerekli hallerde GDPR Madde 28 uyarinca Platform ile veri isleme sozlesmesi imzalamak; (d) ilgili kisi taleplerine (erisim, silme, duzeltme, itiraz) 30 takvim gunu icinde yanit vermek; (e) uygun koruma duzeyi olmaksizin ucuncu ulkelere veri aktarimi yapmamak (GDPR Madde 44 vd).' },
          { heading: 'Madde 7 - Komisyonlar ve Odeme Kosullari', body: 'Platform, Satici Dashboard\'inda yayimlanan gecerli fiyat listesine gore islem komisyonu alir: (a) komisyonlar, odeme alimindan (siparis tamamlanmasindan) itibaren otomatik olarak kesilirir; (b) Saticiya odemeler, iadeleri ve itirazlari karsilamak uzere teslimat onayindan sonra 7-14 is gunluk guvenlik suresinin ardından yapilir; (c) Platform, itiraz, iade, dolandiricilik veya urun kusuru durumlarinda tutarlari askiya alma veya mahsup etme hakkini sakli tutar; (d) vadesi gecmis odemelerde BGB SS 288(2) uyarinca temerrut faizi uygulanir; (e) aylik hesap ozetleri Satici Dashboard\'inda sunulur; 30 gun icerisinde itiraz edilmemesi halinde onaylanmis sayilir.' },
          { heading: 'Madde 7a - Odeme Yetkisi ve Odeme Akisi', body: 'Satici, Platformu ve odeme servis saglayicilarini (ozellikle Stripe Connect) kendi adina ve hesabina musterilerden odeme tahsil etmek uzere yetkilendirir. Odeme servis saglayicisina veya Platforma yapilan odeme, Saticiya yapilmis odeme olarak kabul edilir. Odemeler Stripe Connect veya esdeger sertifikali odeme servis saglayicilari araciligiyla islenir. Fonlar once Platform tarafindan yonetilen bir emanet hesabina alinir; guvenlik suresinin dolmasinin ardindan Saticiya odenir.' },
          { heading: 'Madde 7b - Iadelerde Komisyon Iadesi', body: 'Bir alici cayma hakkini kullanir veya iade islenir ise ilgili siparis tutari ve kesilen komisyon iptal edilir. Tam satis fiyati iade edildiyse komisyon Saticiya iade edilir; kismi iadelerde komisyon orantili olarak iade edilir. Platform tarafindan baslatilan chargeback (odeme iptali) islemlerinde islem tutarinin tamami alikoy ulur; Platform Saticiya bildirimde bulunur.' },
          { heading: 'Madde 8 - Fikri Mulkiyet ve Marka Haklari', body: 'Satici, yuklenen iceriklerin (metin, gorsel, logo, urun aciklamalari) ucuncu sahis haklarini ihlal etmedigini beyan ve taahhut eder: (a) Satici, Platforma listelenen icerikleri urunlerin sergilenmesi amaciyla kullanmak uzere dunya genelinde, bedelsiz, ozel olmayan bir lisans tanimlar; (b) Satici, urun kusurlari, hak ihlalleri veya diger sozlesme ihlallerinden kaynaklanan tum ucuncu sahis taleplerinden Platformu tazmin eder ve muaf tutar (avukatlik ucretleri dahil); (c) Platform, hak ihlali icerdigi anlasilan listeleri onceden haber vermeksizin kaldirma hakkini sakli tutar; (d) Satici, Platformun onceden yazili izni olmaksizin Platform markalarini, logolarini veya fikirdi mulkiyet unsurlarini kullanamaz.' },
          { heading: 'Madde 9 - Siralama ve Gorunurluk (P2B Tuzugu)', body: 'AB P2B Tuzugu Madde 5 uyarinca Platform, siralama algoritmasinin temel parametrelerini seffaf bicimde aciklar: (a) urun kalitesi ve veri eksiksizligi (aciklama, gorsel, ozellikler); (b) musteri degerlendirmeleri (ortalama puan, sayi, guncellik); (c) siparis karsilama orani ve ortalama teslimat suresi; (d) benzer urunlerle kiyaslandığında fiyat rekabetciligii; (e) hesap uyumlulugu (acik sozlesme ihlali yok, tam dogrulama); (f) donusum verileri ve tiklanma orani. Odeme karsiligi siralama artirimi "Sponsorlu" veya "Reklam" olarak acikca etiketlenir; organik siralamayı etkilemez. Platform, kendi urunlerini ucuncu taraf saticilardan farkli muameleye tabi tutmamayı taahhut eder.' },
          { heading: 'Madde 10 - Davranis Kurallari ve Yasakli Uygulamalar', body: 'Satici, adil ve hukuka uygun davrananis ilkelerine baglidir. Su uygulamalar kesinlikle yasaktir: (a) rekabet hukukuna aykiri fiyat anlasmalari veya diger kartellesmeler; (b) sahte, yaniltici veya manipule edilmis musteri degerlendirmeleri; (c) tiklanma cerceveleri veya otomatik komut dosyalariyla siralama manipulasyonu; (d) musteri iletisim bilgilerini Platform disinda dogrudan satis icin kullanmak (Platform dis satin alim yonlendirmesi); (e) Platform musteri verilerini Platform disindaki pazarlama amaclarinda kullanmak; (f) dolandiricilik, kimlik sahteciligi, kara para aklama veya yasadisi faaliyetlerin finansmani; (g) ihracat kontrol duzenleme lerine, yaptirimlara veya BM ambargosu kapsamindaki mallari listelemek.' },
          { heading: 'Madde 11 - Hesap Askiya Alma, Onlemler ve Fesih', body: 'Platform, sozlesme ihlallerinde su onlemleri alabilir: (a) duzeltme icin sure iceren uyari; (b) bireysel listelemelerin gecici kisitlanmasi veya askiya alinmasi; (c) bekleyen odemelerin donduruldugu gecici hesap aski (emanet hesap); (d) agir veya tekrarlayan ihlallerde kalici hesap kapatma. Kalici kapatmadan once, acil bir durum olmadigi surece Saticiya yazili gerekceli bildirim ve 7 is gunu icerisinde yanit hakki verilir. Satici, 30 gun onceden yazili bildiriimle herhangi bir zamanda feshedebilir; Platform de 30 gun onceden bildirimle olagan fesih hakkina sahiptir. Sozlesme sona erdikten sonra acik alacaklar dusuldukten sonra bekleyen odemeler yapilir.' },
          { heading: 'Madde 12 - Saticinin Sorumlulugu ve Tazminat', body: 'Satici, sozlesme ihlallerinden kaynaklanan tum zararlari tazmin eder: (a) urun kusurlari, hak ihlalleri veya diger ihlallerden dogan avukatlik ucretleri dahil tum ucuncu sahis taleplerinden Platformu tamamen muaf tutar; (b) veri ihlalleri icin Saticinin sorumluluk alanina giren kisimda GDPR Madde 82 uyarinca sinirsiz sorumluluk; (c) kast veya agir ihmal temel olusturmayan saf mali zararlar icin sorumluluk, son 12 ayin ilgili islem degerlerindeki zararla sinirlidir.' },
          { heading: 'Madde 13 - Platformun Sorumluluk Sinirlamasi', body: 'Platformun sorumlulugu sunlarla sinirlidir: (a) Platform, can, vucut butunlugu veya saglik zararlari ile kasitli veya agir ihmalden kaynaklanan zararlarda sinirsiz sorumludur; (b) hafif ihmalle olusan zararlarda Platform, yalnizca temel sozlesme yukumluluklerinin (kardinal yukumlulukler) ihlali halinde ve yalnizca ongoreelebilir ve tipik sozlesme zarariyla orantili bigimde sorumludur; (c) lit. a durumlarinin disinda dolayli zararlar, kazanc kayiplari, veri kayiplari ve sonucsal zararlar kapsami disindadir; (d) Platform, mucbir sebepler, ucuncu sahis saldirilari (orn. DDoS), internet kesintileri veya harici servis saglayicilarindan kaynaklanan kesinti ve bozulmalarda sorumlu degildir.' },
          { heading: 'Madde 14 - Degisiklikler (DSA Uyumlulugu)', body: 'Sozlesme degisiklikleri P2B Tuzugu Madde 3(3) ve DSA Madde 14 uyarinca bildirilir: (a) yururluge girmeden en az 15 gun once kayitli e-posta adresine ve uygulama icin bildirimle; (b) yasal gerekliliklerden (yeni mevzuat, mahkeme kararlari, duzenleyici kararlar) kaynaklanan degisikliklerde sure 3 gune indirilebilir; (c) Satici, bildirim suresi icinde yazili fesih yoluyla degisikliklere itiraz edebilir; sure dolduktan sonra Platformda kalmak devam eden kullanim olarak kabul gorur; (d) guncel sozlesme her zaman Satici Panelinde erisime aciktir.' },
          { heading: 'Madde 15 - Uzlasma ve Uyusmazlik Cozumu (DSA / P2B)', body: 'Uyusmazliklar asagidaki cok asamali prosedurle cozulur: (a) Dahili sikayet islemleri: Satici, P2B Tuzugu Madde 11 uyarinca herhangi bir Platform kararini 14 gun icinde yazili olarak (info@andertal.com) itiraz edebilir; Platform sikayetleri ucretsiz ve hizli biimde ele alir; (b) Harici tahkim: Taninmis tahkim kurumu olarak CEDR ve AB Komisyonunun cevrimici uyusmazlik cozum portali (https://ec.europa.eu/consumers/odr/) mevcuttur; (c) Yargı yolu: Sozlesme Alman hukukuna tabidir (CISG haric). Saticinin tacir olmasi durumunda tum uyusmazliklar icin Berlin mahkemeleri yetkilidir.' },
          { heading: 'Madde 16 - Uyum ve Duzenleyici Gereklilikler', body: 'Satici, tum gecerli duzenleyici ve yasal gerekliliklere uymayı kabul eder: (a) DAC7 AB Vergi Tuzugu uyarinca Platform, ilgili makamlara gelir raporlamasi yapma yukumluluguine tabi olabilir; (b) AB Kara Para Aklamayla Mucadele Direktifi 2015/849 ve FATF standartlari uyarinca KYC belgelerinin saglanmasi; (c) uygulanabilir oldugu durumlarda AB Kurum Durum Tespiti Direktifi kapsaminda tedarik zinciri oz bildirimlerinin sunulmasi; (d) ilgili urunler icin AB Batarya Yonetmeligi 2023/1542 ve elektrik/elektronik atik direktifi gerekliliklerine uymak; (e) Urun Guvenligi Yonetmeligi (AB) 2023/988 ve piyasa gozetim mevzuatına uyumun saglanmasi.' },
          { heading: 'Madde 17 - Son Hukumler', body: 'Bu Sozlesme, konusu bakimindan taraflar arasindaki tam mutabakati olusturur ve onceki tum mutabakatlarin yerini alir. Bolunebilirlik: Herhangi bir hukmun gecersiz veya uygulanamaz olmasi durumunda, geri kalan hukumler gecerliliGini korur; taraflar gecersiz hukmun ekonomik amacina en yakin gecerli duzenlemeyi koymayi taahhut eder. Yazili sekil sart: Bu sozlesmedeki degisiklikler ve ekler yazili sekil sartina tabidir (okuma bildirimi istenen e-posta dahil). Temlik yasagi: Taraflarin haklarini veya yukumlulukleri, diger tarafin onceden yazili izni olmaksizin devredemez. Sozlesme, Alman hukukuna tabidir. Son guncelleme: Nisan 2026.' },
        ],
        en: [
          { heading: 'Preamble', body: 'This Seller-Platform Agreement (hereinafter "Agreement") governs the legal relationship between Andertal GmbH (hereinafter "Platform") and the registered commercial seller (hereinafter "Seller"). By electronically signing this Agreement, the Seller accepts all terms and conditions set forth herein. This Agreement is prepared in compliance with the Digital Services Act (EU) 2022/2065 ("DSA"), the P2B Regulation (EU) 2019/1150 on promoting fairness and transparency for business users of online intermediation services, the General Data Protection Regulation (EU) 2016/679 ("GDPR"), and all applicable national and European legislation.' },
          { heading: 'Article 1 - Subject Matter and Platform Services', body: 'The Platform provides the Seller with technical online infrastructure to list, manage, and sell goods to end consumers. Platform services include: product listing and catalog management, payment processing via certified payment service providers, logistics support and shipment tracking, seller analytics tools, and customer support interfaces. The Seller acts as an independent commercial trader in their own name and on their own account. The Platform is not a party to sales contracts concluded between the Seller and end customers and does not act as a commission agent. The Platform reserves the right to amend the scope of services with at least 30 days prior notice, provided no material detriment to the Seller results.' },
          { heading: 'Article 2 - Registration and Verification', body: 'Access to the Platform requires complete registration and successful identity and business verification. The Seller undertakes to: (a) provide truthful, complete and current personal, business, tax ID (VAT number), IBAN and commercial register information; (b) update this information within 7 business days of any material change; (c) submit verification documents (identity card, commercial register extract, tax certificate) within 10 business days upon Platform request. False statements entitle the Platform to immediately suspend the account and, if applicable, initiate legal proceedings.' },
          { heading: 'Article 3 - Product Listing and Content Obligations', body: 'The Seller is solely responsible for all products and content listed. The Seller undertakes to: (a) list only products complying with EU Product Safety Regulation 2023/988, CE marking requirements, and all applicable labeling regulations; (b) provide product descriptions, images, prices, and technical data accurately and without misleading content; (c) under no circumstances list prohibited goods (weapons, narcotics, counterfeit branded goods, copyright-infringing material, goods subject to export restrictions); (d) hold all required licenses, approvals, and certifications for listed products and present them to the Platform upon request; (e) comply with unit pricing disclosure requirements under applicable consumer protection law.' },
          { heading: 'Article 4 - Order Fulfillment and Delivery Obligations', body: 'The Seller commits to reliable and timely order fulfillment: (a) orders must be fulfilled within the delivery time stated in the listing; a maximum delivery time of 14 business days within the EU generally applies; (b) in the event of delay or unavailability, customers must be notified immediately, at most within 24 hours of learning of the delay; (c) consumers must be granted a 14-day right of withdrawal under EU Consumer Rights Directive 2011/83/EU; (d) buyers must receive proper invoices in accordance with applicable tax law, with copies retained for at least 10 years; (e) applicable packaging regulations and national recycling/waste management obligations must be observed.' },
          { heading: 'Article 5 - Warranty and Returns', body: 'The Seller provides end customers with all statutory warranty rights under applicable law: (a) a warranty period of 2 years from delivery for new goods and 1 year for used goods (provided clearly indicated); (b) the buyer\'s right to remedy (repair or replacement), price reduction, or withdrawal in the event of defective goods; (c) a return management system ensuring easy returns; within the EU, return costs are borne by the Seller unless otherwise required by law; (d) refunds for returned goods must be processed within 14 days of receipt of the return; (e) product defects posing a safety risk must be reported to the Platform immediately and a product recall initiated if necessary.' },
          { heading: 'Article 6 - Data Protection (GDPR)', body: 'The Seller processes personal data of end customers (name, address, email, order and payment data) solely for the purpose of contract performance (Art. 6(1)(b) GDPR). The following obligations apply: (a) implement appropriate technical and organizational measures (TOMs) to protect personal data pursuant to Art. 32 GDPR; (b) report data breaches affecting customer data to the Platform within 24 hours and to the competent supervisory authority within 72 hours per Art. 33 GDPR; (c) conclude a data processing agreement (DPA) with the Platform pursuant to Art. 28 GDPR where applicable; (d) respond to data subject requests (access, erasure, rectification, restriction) within 30 calendar days; (e) refrain from transferring data to third countries without an adequate level of protection pursuant to Art. 44 et seq. GDPR.' },
          { heading: 'Article 7 - Fees and Payment Terms', body: 'The Platform charges a transaction fee pursuant to the price list current at the time of the transaction, accessible in the Seller Dashboard: (a) commissions are automatically deducted at order completion (payment receipt); (b) payouts to the Seller are made after a security holding period of 7-14 business days following delivery confirmation to absorb returns and chargebacks; (c) the Platform reserves the right to withhold or offset amounts in cases of chargebacks, returns, fraud, or product defects; (d) overdue payments attract default interest at 9 percentage points above the base rate per Sec. 288(2) BGB; (e) monthly account statements are provided in the Seller Dashboard and are deemed approved unless disputed within 30 days.' },
          { heading: 'Article 7a - Payment Authorization and Payment Flow', body: 'The Seller authorizes the Platform and its payment service providers (in particular Stripe Connect) to collect payments from customers on the Seller\'s behalf and for the Seller\'s account. Receipt of payment by the payment service provider or the Platform shall be deemed receipt of payment by the Seller. Payments are processed via Stripe Connect or equivalent certified payment service providers. Funds are first received into an escrow account managed by the Platform and disbursed to the Seller after the applicable security holding period.' },
          { heading: 'Article 7b - Commission Refund on Returns', body: 'If a buyer exercises their right of withdrawal or a return is processed, the corresponding order amount including the deducted commission is cancelled. The commission is refunded to the Seller if the full purchase price has been reversed; for partial returns, the commission is refunded proportionally. Chargebacks initiated by the payment service provider result in full withholding of the transaction amount; the Platform initiates the chargeback procedure and notifies the Seller.' },
          { heading: 'Article 8 - Intellectual Property and Trademark Rights', body: 'The Seller warrants that uploaded content (texts, images, logos, product descriptions) does not infringe third-party rights: (a) the Seller grants the Platform a non-exclusive, worldwide, royalty-free license to use listed content for the purpose of displaying the products; (b) the Seller fully indemnifies the Platform against all third-party claims arising from product defects, IP infringements, or other breaches, including attorney and court costs; (c) the Platform reserves the right to remove listings containing indications of rights violations without prior notice; (d) the Seller may not use the Platform\'s trademarks, logos, or other IP without prior written authorization.' },
          { heading: 'Article 9 - Ranking and Visibility (P2B Regulation)', body: 'Pursuant to Art. 5 of EU Regulation 2019/1150, the Platform transparently discloses the main parameters of its ranking algorithm: (a) product quality and data completeness (description, images, attributes); (b) customer ratings and reviews (average score, volume, recency); (c) order fulfillment rate and average delivery time; (d) price competitiveness compared to similar products; (e) account compliance (no open contract violations, complete verification); (f) conversion data and click-through rate. Paid ranking promotion is clearly labeled as "Sponsored" or "Advertisement" and does not affect organic ranking. The Platform commits to not treating its own products differently from third-party sellers.' },
          { heading: 'Article 10 - Code of Conduct and Prohibited Practices', body: 'The Seller is committed to fair and lawful conduct. The following practices are strictly prohibited: (a) price-fixing or other anti-competitive agreements with other sellers (competition law); (b) posting fake, misleading, or manipulated customer reviews; (c) manipulating rankings through click farms or automated scripts; (d) using customer contact data to solicit off-platform purchases; (e) using Platform customer data for own marketing purposes outside the Platform; (f) any form of fraud, identity deception, money laundering, or financing of illegal activities; (g) listing products subject to export control regulations, sanctions lists, or UN embargoes.' },
          { heading: 'Article 11 - Account Suspension, Measures, and Termination', body: 'In the event of violations, the Platform may take the following measures: (a) warning with a deadline for remedy; (b) temporary restriction or suspension of individual listings; (c) temporary account freeze (escrow of outstanding payouts); (d) permanent account closure for serious or repeated violations. Prior to permanent closure, the Seller receives, unless an emergency exists, a written statement of reasons and a 7-business-day response period. The Seller may terminate the account at any time with 30 days\' written notice; the Platform may also terminate with 30 days\' notice. After termination, outstanding payouts are remitted after deduction of open claims.' },
          { heading: 'Article 12 - Seller Liability and Indemnification', body: 'The Seller is liable for all damages arising from breaches of this Agreement: (a) the Seller fully indemnifies the Platform against all third-party claims arising from product defects, IP infringements, or other breaches, including attorney and court costs; (b) for data protection violations within the Seller\'s sphere of responsibility, the Seller bears unlimited liability pursuant to GDPR Art. 82; (c) liability for pure financial losses not based on intent or gross negligence is limited to the value of the relevant transactions over the preceding 12 months.' },
          { heading: 'Article 13 - Platform Limitation of Liability', body: 'The Platform\'s liability is limited as follows: (a) the Platform bears unlimited liability for damages arising from injury to life, limb, or health, and for intentional or grossly negligent conduct; (b) for lightly negligent causation of damage, the Platform is liable only for breaches of material contractual obligations (cardinal obligations) and only to the extent of foreseeable and typical contractual damages; (c) liability for indirect damages, lost profits, data loss, and consequential damages is excluded except in the cases of lit. a; (d) the Platform is not liable for outages or disruptions attributable to force majeure, third-party attacks (e.g. DDoS), internet disruptions, or external service providers.' },
          { heading: 'Article 14 - Amendments (DSA Compliance)', body: 'Amendments to this Agreement are communicated pursuant to P2B Regulation Art. 3(3) and DSA Art. 14: (a) by email to the registered address and by in-app notification at least 15 days before entry into force; (b) for amendments required by law (new legislation, court decisions, regulatory orders), the notice period may be reduced to 3 days; (c) the Seller may object to amendments by written termination of the contract within the notice period; remaining on the Platform after expiry of the period constitutes acceptance; (d) the current Agreement is always accessible in the Seller Dashboard.' },
          { heading: 'Article 15 - Dispute Resolution (DSA / P2B)', body: 'Disputes are resolved through the following multi-stage procedure: (a) Internal complaint handling: the Seller may contest any Platform decision in writing within 14 days (info@andertal.com); the Platform handles complaints free of charge and promptly pursuant to P2B Regulation Art. 11; (b) External mediation: recognized mediation bodies include the Centre for Effective Dispute Resolution (CEDR) and the EU Commission\'s Online Dispute Resolution portal (https://ec.europa.eu/consumers/odr/); (c) Judicial recourse: this Agreement is governed by German law excluding the UN Convention on Contracts for the International Sale of Goods (CISG). Berlin courts have exclusive jurisdiction for all disputes arising from or in connection with this Agreement where the Seller is a merchant.' },
          { heading: 'Article 16 - Compliance and Regulatory Requirements', body: 'The Seller agrees to comply with all applicable regulatory and legal requirements: (a) under DAC7 EU Tax Regulation, the Platform may be required to report revenues to tax authorities; (b) provision of KYC documents pursuant to EU Anti-Money Laundering Directive 2015/849 and FATF standards; (c) supply chain due diligence self-declarations under applicable EU corporate sustainability directives; (d) compliance with EU Battery Regulation 2023/1542 and WEEE Directive requirements for relevant products; (e) compliance with the Product Safety Regulation (EU) 2023/988 and market surveillance law.' },
          { heading: 'Article 17 - Final Provisions', body: 'This Agreement constitutes the entire agreement between the parties with respect to its subject matter and supersedes all prior oral or written agreements. Severability: Should any provision prove invalid or unenforceable, the remaining provisions remain in full force; the parties undertake to replace the invalid provision with a valid arrangement that most closely achieves the economic purpose of the invalid provision. Written form requirement: Amendments and supplements to this Agreement require written form to be effective (including email with read receipt). Assignment prohibition: Rights and obligations under this Agreement may not be assigned without prior written consent of the respective other party. This Agreement is governed by German law. Last updated: April 2026.' },
        ],
      }

      const signPdfDeLatin = (s) => {
        if (s == null) return ''
        return String(s)
          .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue')
          .replace(/Ä/g, 'Ae').replace(/Ö/g, 'Oe').replace(/Ü/g, 'Ue')
          .replace(/ß/g, 'ss')
          .replace(/ş/g, 's').replace(/ğ/g, 'g').replace(/ı/g, 'i').replace(/ç/g, 'c').replace(/İ/g, 'I').replace(/Ş/g, 'S').replace(/Ğ/g, 'G').replace(/Ç/g, 'C')
          .replace(/é/g, 'e').replace(/è/g, 'e').replace(/ê/g, 'e').replace(/ë/g, 'e')
          .replace(/à/g, 'a').replace(/â/g, 'a').replace(/á/g, 'a')
          .replace(/ù/g, 'u').replace(/û/g, 'u').replace(/ú/g, 'u')
          .replace(/ô/g, 'o').replace(/ò/g, 'o').replace(/ó/g, 'o')
          .replace(/î/g, 'i').replace(/ï/g, 'i').replace(/í/g, 'i')
          .replace(/ñ/g, 'n').replace(/ã/g, 'a').replace(/õ/g, 'o')
      }

      const buildAgreementPdf = async (seller, locale, signatureDataUrl, signedAt, signedIp, platformInfo) => {
        const PDFDocument = require('pdfkit')
        const sections = CONTRACT_SECTIONS_SIGN[locale] || CONTRACT_SECTIONS_SIGN.en
        const signedDate = signedAt ? new Date(signedAt).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'medium' }) : new Date().toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'medium' })
        const pi = platformInfo || {}
        const platName = pi.legal_company_name || 'Andertal GmbH'
        const platRep = pi.legal_representative || ''
        const platAddr = [pi.legal_street, pi.legal_city].filter(Boolean).join(', ')
        const platReg = [pi.legal_trade_register, pi.legal_register_court ? `(${pi.legal_register_court})` : ''].filter(Boolean).join(' ')
        const platVat = pi.legal_vat_id || ''
        const platTax = pi.legal_tax_id || ''
        const platEmail = pi.legal_email || 'info@andertal.com'

        return new Promise((resolve, reject) => {
          try {
            const doc = new PDFDocument({ margin: 48, size: 'A4', compress: false, pdfVersion: '1.7' })
            const chunks = []
            doc.on('data', (c) => chunks.push(c))
            doc.on('end', () => resolve(Buffer.concat(chunks)))
            doc.on('error', reject)

            // Header
            doc.fontSize(18).font('Helvetica-Bold').fillColor('#111').text(
              locale === 'de' ? 'Haendler-Plattform-Vereinbarung' : locale === 'tr' ? 'Satici-Platform Sozlesmesi' : 'Seller-Platform Agreement',
              { align: 'center' }
            )
            doc.moveDown(0.3)
            doc.fontSize(9).font('Helvetica').fillColor('#666').text(
              `${signPdfDeLatin(platName)} | ` + (locale === 'de' ? 'Unterzeichnetes Exemplar' : locale === 'tr' ? 'Imzali Kopya' : 'Signed Copy'),
              { align: 'center' }
            )
            doc.moveDown(0.5)
            doc.moveTo(48, doc.y).lineTo(547, doc.y).strokeColor('#ddd').lineWidth(0.5).stroke()
            doc.moveDown(0.4)

            // Platform operator block
            const platOpLabel = locale === 'de' ? 'Plattformbetreiber' : locale === 'tr' ? 'Platform Isletmecisi' : 'Platform Operator'
            doc.fontSize(9).font('Helvetica-Bold').fillColor('#333').text(signPdfDeLatin(platOpLabel) + ':')
            doc.fontSize(8).font('Helvetica').fillColor('#555')
            doc.text(signPdfDeLatin(platName))
            if (platRep) doc.text(signPdfDeLatin((locale === 'de' ? 'Vertreten durch: ' : locale === 'tr' ? 'Temsilen: ' : 'Represented by: ') + platRep))
            if (platAddr) doc.text(signPdfDeLatin(platAddr))
            if (platReg) doc.text(signPdfDeLatin((locale === 'de' ? 'Handelsregister: ' : locale === 'tr' ? 'Ticaret Sicil: ' : 'Commercial Register: ') + platReg))
            if (platVat) doc.text(signPdfDeLatin((locale === 'de' ? 'USt-IdNr.: ' : locale === 'tr' ? 'KDV No: ' : 'VAT ID: ') + platVat))
            if (platTax) doc.text(signPdfDeLatin((locale === 'de' ? 'Steuernummer: ' : locale === 'tr' ? 'Vergi No: ' : 'Tax ID: ') + platTax))
            doc.text(signPdfDeLatin((locale === 'de' ? 'E-Mail: ' : 'Email: ') + platEmail))
            doc.moveDown(0.5)
            doc.moveTo(48, doc.y).lineTo(547, doc.y).strokeColor('#ddd').lineWidth(0.5).stroke()
            doc.moveDown(0.5)

            // Contract sections
            for (const sec of sections) {
              doc.fontSize(10).font('Helvetica-Bold').fillColor('#111').text(signPdfDeLatin(sec.heading))
              doc.moveDown(0.15)
              doc.fontSize(9).font('Helvetica').fillColor('#333').text(signPdfDeLatin(sec.body), { lineGap: 2 })
              doc.moveDown(0.5)
            }

            doc.moveDown(0.5)
            doc.moveTo(48, doc.y).lineTo(547, doc.y).strokeColor('#ddd').lineWidth(0.5).stroke()
            doc.moveDown(0.5)

            // Seller signature block (left) + platform block (right)
            const sigLabel = locale === 'de' ? 'Unterschrift des Verkaeufers' : locale === 'tr' ? 'Satici Imzasi' : 'Seller Signature'
            const dateLabel = locale === 'de' ? 'Datum & Uhrzeit' : locale === 'tr' ? 'Tarih & Saat' : 'Date & Time'
            const ipLabel = locale === 'de' ? 'IP-Adresse' : locale === 'tr' ? 'IP Adresi' : 'IP Address'
            const nameLabel = locale === 'de' ? 'Name / Unternehmen' : locale === 'tr' ? 'Ad / Firma' : 'Name / Company'
            const usernameLabel = locale === 'de' ? 'Benutzername' : locale === 'tr' ? 'Kullanici Adi' : 'Username'

            doc.fontSize(10).font('Helvetica-Bold').fillColor('#111').text(
              locale === 'de' ? 'Unterschriftsblock' : locale === 'tr' ? 'Imza Blogu' : 'Signature Block'
            )
            doc.moveDown(0.3)
            doc.fontSize(9).font('Helvetica').fillColor('#333')
            doc.text(`${dateLabel}: ${signPdfDeLatin(signedDate)}`)
            doc.text(`${ipLabel}: ${signPdfDeLatin(signedIp || '—')}`)
            doc.text(`${nameLabel}: ${signPdfDeLatin([seller.authorized_person_name, seller.company_name].filter(Boolean).join(' / ') || '—')}`)
            doc.text(`${usernameLabel}: ${signPdfDeLatin(seller.seller_name || seller.email || '—')}`)
            doc.moveDown(0.5)
            doc.text(`${sigLabel}:`)
            doc.moveDown(0.3)

            if (signatureDataUrl && signatureDataUrl.startsWith('data:image/png;base64,')) {
              const imgBuf = Buffer.from(signatureDataUrl.split(',')[1], 'base64')
              doc.image(imgBuf, { fit: [200, 80], align: 'left' })
              doc.moveDown(0.3)
            }

            doc.moveTo(48, doc.y).lineTo(248, doc.y).strokeColor('#999').lineWidth(0.5).stroke()
            doc.moveDown(0.2)
            doc.fontSize(8).fillColor('#666').text(signPdfDeLatin(`${seller.authorized_person_name || seller.seller_name || ''}, ${seller.company_name || ''}`), { width: 200 })

            // Platform representative block below signature
            doc.moveDown(0.8)
            const platSigLabel = locale === 'de' ? 'Plattformbetreiber (Andertal)' : locale === 'tr' ? 'Platform Isletmecisi (Andertal)' : 'Platform Operator (Andertal)'
            doc.fontSize(9).font('Helvetica-Bold').fillColor('#333').text(signPdfDeLatin(platSigLabel))
            doc.fontSize(8).font('Helvetica').fillColor('#555')
            doc.text(signPdfDeLatin(platName))
            if (platRep) doc.text(signPdfDeLatin(platRep))
            if (platAddr) doc.text(signPdfDeLatin(platAddr))
            if (platReg) doc.text(signPdfDeLatin(platReg))
            if (platVat) doc.text(signPdfDeLatin(platVat))

            doc.end()
          } catch (e) {
            reject(e)
          }
        })
      }

      // POST /admin-hub/v1/seller/sign-token — create a signing session token + QR code
      httpApp.post('/admin-hub/v1/seller/sign-token', async (req, res) => {
        const sellerUser = req.sellerUser
        if (!sellerUser) return res.status(401).json({ message: 'Unauthorized' })
        const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
        if (!dbUrl) return res.status(503).json({ message: 'Database not configured' })
        try {
          const crypto = require('crypto')
          const QRCode = require('qrcode')
          const { Client } = require('pg')
          const token = crypto.randomBytes(32).toString('hex')
          const locale = String(req.body?.locale || sellerUser.locale || 'de').slice(0, 10)
          const client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
          await client.connect()
          await client.query(
            `INSERT INTO seller_sign_tokens (token, seller_id, locale, ip) VALUES ($1, $2, $3, $4)`,
            [token, String(sellerUser.id), locale, req.ip || null]
          )
          await client.end()
          const sellercentralUrl = (process.env.NEXT_PUBLIC_SELLERCENTRAL_URL || process.env.SELLERCENTRAL_PUBLIC_URL || 'https://sellercentral.andertal.com').replace(/\/$/, '')
          const signUrl = `${sellercentralUrl}/${locale}/sign/${token}`
          const qrDataUrl = await QRCode.toDataURL(signUrl, { width: 256, margin: 2 })
          res.json({ token, sign_url: signUrl, qr_data_url: qrDataUrl })
        } catch (e) {
          console.error('sign-token:', e)
          res.status(500).json({ message: e?.message || 'Error' })
        }
      })

      // GET /public/sign/:token — info endpoint, called from sellercentral sign page (no auth)
      httpApp.get('/public/sign/:token', async (req, res) => {
        const token = String(req.params.token || '').trim()
        if (!token) return res.status(400).json({ message: 'Token required' })
        const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
        if (!dbUrl) return res.status(503).json({ message: 'Database not configured' })
        try {
          const { Client } = require('pg')
          const client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
          await client.connect()
          const tr = await client.query(
            `SELECT st.locale, st.used_at, st.expires_at, su.store_name, su.company_name, su.authorized_person_name
             FROM seller_sign_tokens st
             JOIN seller_users su ON su.id::text = st.seller_id
             WHERE st.token = $1`,
            [token]
          )
          await client.end()
          if (!tr.rows.length || new Date(tr.rows[0].expires_at) < new Date()) return res.status(404).json({ message: 'Token not found or expired' })
          const row = tr.rows[0]
          if (row.used_at) return res.status(410).json({ message: 'Already signed', signed: true })
          res.json({ valid: true, locale: row.locale, seller_name: row.store_name || null, company_name: row.company_name || null, authorized_person_name: row.authorized_person_name || null })
        } catch (e) {
          console.error('public-sign-get:', e)
          res.status(500).json({ message: e?.message || 'Error' })
        }
      })


      // POST /seller/sign/:token/auth — validate seller credentials, return sign_session
      httpApp.post('/seller/sign/:token/auth', async (req, res) => {
        const token = String(req.params.token || '').trim()
        const { email, password } = req.body || {}
        if (!token || !email || !password) return res.status(400).json({ message: 'Token, email and password required' })
        const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
        if (!dbUrl) return res.status(503).json({ message: 'Service unavailable' })
        try {
          const { Client } = require('pg')
          const crypto = require('crypto')
          const client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
          await client.connect()
          const tr = await client.query(
            `SELECT st.seller_id, st.used_at, st.expires_at FROM seller_sign_tokens st WHERE st.token = $1`,
            [token]
          )
          if (!tr.rows.length || new Date(tr.rows[0].expires_at) < new Date()) {
            await client.end()
            return res.status(404).json({ message: 'Token not found or expired' })
          }
          if (tr.rows[0].used_at) {
            await client.end()
            return res.status(410).json({ message: 'Already signed' })
          }
          const sellerId = tr.rows[0].seller_id
          const sr = await client.query(
            `SELECT id, email, password_hash FROM seller_users WHERE id::text = $1 AND LOWER(TRIM(email)) = LOWER(TRIM($2))`,
            [sellerId, email]
          )
          if (!sr.rows.length || !verifySellerPassword(password, sr.rows[0].password_hash)) {
            await client.end()
            return res.status(401).json({ message: 'Invalid email or password' })
          }
          const signSession = crypto.randomBytes(32).toString('hex')
          await client.query(`UPDATE seller_sign_tokens SET sign_session = $1 WHERE token = $2`, [signSession, token])
          await client.end()
          res.json({ sign_session: signSession })
        } catch (e) {
          console.error('sign-auth:', e)
          res.status(500).json({ message: e?.message || 'Error' })
        }
      })

      // POST /seller/sign/:token/submit — save signature (requires sign_session)
      httpApp.post('/seller/sign/:token/submit', async (req, res) => {
        const token = String(req.params.token || '').trim()
        const { sign_session, signature_data } = req.body || {}
        if (!token || !sign_session) return res.status(400).json({ message: 'Token and sign_session required' })
        if (!signature_data || typeof signature_data !== 'string' || !signature_data.startsWith('data:image/png;base64,')) {
          return res.status(400).json({ message: 'Valid signature_data (PNG base64 data URL) required' })
        }
        const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
        if (!dbUrl) return res.status(503).json({ message: 'Service unavailable' })
        try {
          const { Client } = require('pg')
          const client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
          await client.connect()
          const tr = await client.query(
            `SELECT st.*, su.company_name, su.authorized_person_name, su.store_name, su.email
             FROM seller_sign_tokens st
             JOIN seller_users su ON su.id::text = st.seller_id
             WHERE st.token = $1 AND st.sign_session = $2 AND st.expires_at > now() AND st.used_at IS NULL`,
            [token, sign_session]
          )
          if (!tr.rows.length) {
            await client.end()
            return res.status(403).json({ message: 'Invalid session, token expired or already signed' })
          }
          const row = tr.rows[0]
          const signedAt = new Date()
          const signedIp = req.ip || null
          // Fetch platform legal info for PDF
          let platformInfo = {}
          try {
            const pc = getProductsDbClient()
            if (pc) {
              await pc.connect()
              const pr = await pc.query(
                `SELECT legal_company_name, legal_representative, legal_street, legal_city, legal_trade_register, legal_register_court, legal_vat_id, legal_tax_id, legal_email FROM admin_hub_seller_settings WHERE seller_id = 'default'`
              )
              await pc.end()
              platformInfo = pr.rows[0] || {}
            }
          } catch (_) {}
          const pdfBuf = await buildAgreementPdf(
            { company_name: row.company_name, authorized_person_name: row.authorized_person_name, seller_name: row.store_name, email: row.email },
            row.locale,
            signature_data,
            signedAt,
            signedIp,
            platformInfo
          )
          const pdfBase64 = 'data:application/pdf;base64,' + pdfBuf.toString('base64')
          await client.query(
            `UPDATE seller_users SET signature_data = $1, signature_at = $2, signature_ip = $3, agreement_pdf_url = $4 WHERE id::text = $5`,
            [signature_data, signedAt, signedIp, pdfBase64, row.seller_id]
          )
          await client.query(`UPDATE seller_sign_tokens SET used_at = $1, ip = $2 WHERE token = $3`, [signedAt, signedIp, token])
          await client.end()
          res.json({ success: true })
        } catch (e) {
          console.error('sign-submit:', e)
          res.status(500).json({ message: e?.message || 'Error' })
        }
      })

      // GET /admin-hub/v1/seller/sign-status — poll for signature completion
      httpApp.get('/admin-hub/v1/seller/sign-status', async (req, res) => {
        const sellerUser = req.sellerUser
        if (!sellerUser) return res.status(401).json({ message: 'Unauthorized' })
        const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
        if (!dbUrl) return res.status(503).json({ message: 'Database not configured' })
        try {
          const { Client } = require('pg')
          const client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
          await client.connect()
          const r = await client.query(`SELECT signature_at, agreement_pdf_url FROM seller_users WHERE id = $1`, [String(sellerUser.id)])
          await client.end()
          const row = r.rows[0] || {}
          res.json({ signed: !!row.signature_at, signature_at: row.signature_at || null, has_pdf: !!row.agreement_pdf_url })
        } catch (e) {
          res.status(500).json({ message: e?.message || 'Error' })
        }
      })

      // GET /admin-hub/v1/seller/agreement-pdf — download signed PDF (seller or superuser)
      httpApp.get('/admin-hub/v1/seller/agreement-pdf', async (req, res) => {
        const sellerUser = req.sellerUser
        if (!sellerUser) return res.status(401).json({ message: 'Unauthorized' })
        const targetSellerId = req.query.seller_id && sellerUser.is_superuser ? String(req.query.seller_id) : String(sellerUser.id)
        const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
        if (!dbUrl) return res.status(503).json({ message: 'Database not configured' })
        try {
          const { Client } = require('pg')
          const client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
          await client.connect()
          const r = await client.query(`SELECT agreement_pdf_url FROM seller_users WHERE id = $1`, [targetSellerId])
          await client.end()
          const pdfData = r.rows[0]?.agreement_pdf_url
          if (!pdfData) return res.status(404).json({ message: 'No signed agreement found' })
          if (pdfData.startsWith('data:application/pdf;base64,')) {
            const buf = Buffer.from(pdfData.split(',')[1], 'base64')
            res.set('Content-Type', 'application/pdf')
            res.set('Content-Disposition', 'attachment; filename="andertal-agreement.pdf"')
            return res.send(buf)
          }
          res.status(500).json({ message: 'Invalid PDF data' })
        } catch (e) {
          res.status(500).json({ message: e?.message || 'Error' })
        }
      })
    })()
    // ── End Seller Agreement Signing Routes ──────────────────────────────────

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
    httpApp.post('/admin-hub/v1/stripe-connect/onboard', async (req, res) => {
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
    httpApp.get('/admin-hub/v1/stripe-connect/status', async (req, res) => {
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
    httpApp.get('/admin-hub/v1/stripe-connect/dashboard-link', async (req, res) => {
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
    httpApp.post('/admin-hub/v1/stripe-connect/disconnect', async (req, res) => {
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
    httpApp.post('/admin-hub/v1/stripe-connect/transfer/:orderId', requireSuperuser, async (req, res) => {
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
          const sRateRow = await client.query(
            'SELECT commission_rate FROM seller_users WHERE seller_id = $1 LIMIT 1',
            [order.seller_id],
          )
          const commRt = Number(sRateRow.rows?.[0]?.commission_rate ?? 0.12)
          const totalCents = Number(order.total_cents || 0)
          const feeCents = resolvePlatformApplicationFeeCents(order, commRt)
          const payoutAmount = Math.max(0, totalCents - feeCents)
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

    // ── Seller Credit Card Routes ─────────────────────────────────────────────

    /** GET /admin-hub/v1/stripe-publishable-key — returns Stripe publishable key for card form */
    httpApp.get('/admin-hub/v1/stripe-publishable-key', async (req, res) => {
      try {
        const platformRow = await loadPlatformCheckoutRowFresh()
        const pk = (platformRow?.stripe_publishable_key || '').toString().trim()
        res.json({ publishable_key: pk || null })
      } catch (e) {
        res.status(500).json({ message: e.message || 'Error' })
      }
    })

    /** POST /admin-hub/v1/seller/card/setup-intent — creates Stripe SetupIntent for saving a card */
    httpApp.post('/admin-hub/v1/seller/card/setup-intent', async (req, res) => {
      const userId = req.sellerUser?.id
      const email = req.sellerUser?.email
      if (!userId) return res.status(401).json({ message: 'Unauthorized' })
      const platformRow = await loadPlatformCheckoutRowFresh()
      const secretKey = resolveStripeSecretKeyFromPlatform(platformRow)
      if (!secretKey) return res.status(503).json({ message: 'Stripe nicht konfiguriert' })
      const stripe = new (require('stripe'))(secretKey)
      const client = getSellerDbClient()
      if (!client) return res.status(503).json({ message: 'Database not configured' })
      try {
        await client.connect()
        const row = await client.query(`SELECT stripe_customer_id FROM seller_users WHERE id = $1`, [userId])
        let customerId = row.rows?.[0]?.stripe_customer_id || null
        if (!customerId) {
          const customer = await stripe.customers.create({ email, metadata: { seller_user_id: userId } })
          customerId = customer.id
          await client.query(`UPDATE seller_users SET stripe_customer_id = $1, updated_at = now() WHERE id = $2`, [customerId, userId])
        }
        const si = await stripe.setupIntents.create({ customer: customerId, usage: 'off_session' })
        await client.end()
        res.json({ client_secret: si.client_secret })
      } catch (e) {
        try { await client.end() } catch (_) {}
        res.status(500).json({ message: e.message || 'Setup intent failed' })
      }
    })

    /** POST /admin-hub/v1/seller/card/confirm — saves PM details after Stripe.js setup */
    httpApp.post('/admin-hub/v1/seller/card/confirm', async (req, res) => {
      const userId = req.sellerUser?.id
      const { payment_method_id } = req.body || {}
      if (!userId) return res.status(401).json({ message: 'Unauthorized' })
      if (!payment_method_id) return res.status(400).json({ message: 'payment_method_id required' })
      const platformRow = await loadPlatformCheckoutRowFresh()
      const secretKey = resolveStripeSecretKeyFromPlatform(platformRow)
      if (!secretKey) return res.status(503).json({ message: 'Stripe nicht konfiguriert' })
      const stripe = new (require('stripe'))(secretKey)
      const client = getSellerDbClient()
      if (!client) return res.status(503).json({ message: 'Database not configured' })
      try {
        await client.connect()
        const pm = await stripe.paymentMethods.retrieve(payment_method_id)
        const card = pm.card || {}
        const existing = await client.query(`SELECT stripe_payment_method_id FROM seller_users WHERE id = $1`, [userId])
        const oldPmId = existing.rows?.[0]?.stripe_payment_method_id
        if (oldPmId && oldPmId !== payment_method_id) {
          try { await stripe.paymentMethods.detach(oldPmId) } catch (_) {}
        }
        await client.query(
          `UPDATE seller_users SET stripe_payment_method_id = $1, stripe_card_last4 = $2, stripe_card_brand = $3, stripe_card_exp_month = $4, stripe_card_exp_year = $5, updated_at = now() WHERE id = $6`,
          [payment_method_id, card.last4 || null, card.brand || null, card.exp_month || null, card.exp_year || null, userId]
        )
        await client.end()
        res.json({ ok: true, last4: card.last4, brand: card.brand, exp_month: card.exp_month, exp_year: card.exp_year })
      } catch (e) {
        try { await client.end() } catch (_) {}
        res.status(500).json({ message: e.message || 'Confirm failed' })
      }
    })

    /** GET /admin-hub/v1/seller/card — returns current saved card info (masked) */
    httpApp.get('/admin-hub/v1/seller/card', async (req, res) => {
      const userId = req.sellerUser?.id
      if (!userId) return res.status(401).json({ message: 'Unauthorized' })
      const client = getSellerDbClient()
      if (!client) return res.status(503).json({ message: 'Database not configured' })
      try {
        await client.connect()
        const row = await client.query(
          `SELECT stripe_payment_method_id, stripe_card_last4, stripe_card_brand, stripe_card_exp_month, stripe_card_exp_year FROM seller_users WHERE id = $1`,
          [userId]
        )
        await client.end()
        const r = row.rows?.[0] || {}
        res.json({
          has_card: !!r.stripe_payment_method_id,
          last4: r.stripe_card_last4 || null,
          brand: r.stripe_card_brand || null,
          exp_month: r.stripe_card_exp_month || null,
          exp_year: r.stripe_card_exp_year || null,
        })
      } catch (e) {
        try { await client.end() } catch (_) {}
        res.status(500).json({ message: e.message || 'Error' })
      }
    })

    /** DELETE /admin-hub/v1/seller/card — detaches and removes saved card */
    httpApp.delete('/admin-hub/v1/seller/card', async (req, res) => {
      const userId = req.sellerUser?.id
      if (!userId) return res.status(401).json({ message: 'Unauthorized' })
      const platformRow = await loadPlatformCheckoutRowFresh()
      const secretKey = resolveStripeSecretKeyFromPlatform(platformRow)
      const client = getSellerDbClient()
      if (!client) return res.status(503).json({ message: 'Database not configured' })
      try {
        await client.connect()
        const row = await client.query(`SELECT stripe_payment_method_id FROM seller_users WHERE id = $1`, [userId])
        const pmId = row.rows?.[0]?.stripe_payment_method_id
        if (pmId && secretKey) {
          const stripe = new (require('stripe'))(secretKey)
          try { await stripe.paymentMethods.detach(pmId) } catch (_) {}
        }
        await client.query(
          `UPDATE seller_users SET stripe_payment_method_id = NULL, stripe_card_last4 = NULL, stripe_card_brand = NULL, stripe_card_exp_month = NULL, stripe_card_exp_year = NULL, updated_at = now() WHERE id = $1`,
          [userId]
        )
        await client.end()
        res.json({ ok: true })
      } catch (e) {
        try { await client.end() } catch (_) {}
        res.status(500).json({ message: e.message || 'Error' })
      }
    })

    /** GET /admin-hub/v1/sellers/:id/card — superuser: view seller's card */
    httpApp.get('/admin-hub/v1/sellers/:id/card', requireSuperuser, async (req, res) => {
      const sellerId = req.params.id
      const client = getSellerDbClient()
      if (!client) return res.status(503).json({ message: 'Database not configured' })
      try {
        await client.connect()
        const row = await client.query(
          `SELECT stripe_payment_method_id, stripe_card_last4, stripe_card_brand, stripe_card_exp_month, stripe_card_exp_year FROM seller_users WHERE seller_id = $1 ORDER BY created_at LIMIT 1`,
          [sellerId]
        )
        await client.end()
        const r = row.rows?.[0] || {}
        res.json({
          has_card: !!r.stripe_payment_method_id,
          last4: r.stripe_card_last4 || null,
          brand: r.stripe_card_brand || null,
          exp_month: r.stripe_card_exp_month || null,
          exp_year: r.stripe_card_exp_year || null,
        })
      } catch (e) {
        try { await client.end() } catch (_) {}
        res.status(500).json({ message: e.message || 'Error' })
      }
    })

    /** DELETE /admin-hub/v1/sellers/:id/card — superuser: detach and remove seller's card */
    httpApp.delete('/admin-hub/v1/sellers/:id/card', requireSuperuser, async (req, res) => {
      const sellerId = req.params.id
      const platformRow = await loadPlatformCheckoutRowFresh()
      const secretKey = resolveStripeSecretKeyFromPlatform(platformRow)
      const client = getSellerDbClient()
      if (!client) return res.status(503).json({ message: 'Database not configured' })
      try {
        await client.connect()
        const row = await client.query(
          `SELECT id, stripe_payment_method_id FROM seller_users WHERE seller_id = $1 ORDER BY created_at LIMIT 1`,
          [sellerId]
        )
        const r = row.rows?.[0]
        if (!r) { await client.end(); return res.status(404).json({ message: 'Seller not found' }) }
        if (r.stripe_payment_method_id && secretKey) {
          const stripe = new (require('stripe'))(secretKey)
          try { await stripe.paymentMethods.detach(r.stripe_payment_method_id) } catch (_) {}
        }
        await client.query(
          `UPDATE seller_users SET stripe_payment_method_id = NULL, stripe_card_last4 = NULL, stripe_card_brand = NULL, stripe_card_exp_month = NULL, stripe_card_exp_year = NULL, updated_at = now() WHERE id = $1`,
          [r.id]
        )
        await client.end()
        res.json({ ok: true })
      } catch (e) {
        try { await client.end() } catch (_) {}
        res.status(500).json({ message: e.message || 'Error' })
      }
    })

    // ── End Seller Credit Card Routes ─────────────────────────────────────────

    // ── Sendcloud Webhook ────────────────────────────────────────────────────
    // Maps Sendcloud parcel status IDs to internal delivery statuses
    function mapSendcloudStatus(statusId) {
      // https://support.sendcloud.com/hc/en-us/articles/360024967051
      const id = Number(statusId)
      if ([11, 12, 22, 26].includes(id)) return 'zugestellt'      // Delivered / at pickup point
      if ([15, 29].includes(id)) return 'exception'                 // Exception / error
      if ([31, 32, 33].includes(id)) return 'retour'               // Return
      if ([8, 24].includes(id)) return 'in_transit'                // Out for delivery
      if ([1, 2, 3, 4, 5, 6, 7, 13, 21, 23, 25].includes(id)) return 'versendet'
      return 'in_transit'
    }

    httpApp.post('/webhook/sendcloud', async (req, res) => {
      // Sendcloud sends JSON — no raw body signature needed unless SENDCLOUD_WEBHOOK_SECRET is set
      const secret = process.env.SENDCLOUD_WEBHOOK_SECRET
      if (secret) {
        const _c = require('crypto')
        const given = req.headers['sendcloud-signature'] || req.headers['x-sendcloud-signature'] || ''
        const expected = _c.createHmac('sha256', secret).update(JSON.stringify(req.body)).digest('hex')
        if (given !== expected) return res.status(401).json({ message: 'Invalid signature' })
      }
      res.json({ received: true }) // ack immediately
      try {
        const payload = req.body || {}
        const action = payload.action || ''
        if (action !== 'parcel_status_changed') return
        const parcel = payload.parcel || {}
        const trackingNumber = String(parcel.tracking_number || parcel.awb_number || '').trim()
        const statusId = parcel.status?.id ?? parcel.status_id
        if (!trackingNumber || statusId == null) return
        const internalStatus = mapSendcloudStatus(statusId)
        const statusMessage = parcel.status?.message || parcel.status_message || ''
        const location = parcel.carrier_code ? String(parcel.carrier_code).toUpperCase() : null
        const ts = parcel.updated_at ? new Date(parcel.updated_at).toISOString() : new Date().toISOString()
        const client = getDbClient()
        if (!client) return
        await client.connect()
        // Find the order by tracking number
        const orderRes = await client.query(
          `SELECT id, delivery_status FROM store_orders WHERE tracking_number = $1 LIMIT 1`,
          [trackingNumber]
        )
        const order = orderRes.rows[0]
        if (order) {
          // Upsert shipment event
          const exists = await client.query(
            `SELECT id FROM store_shipment_events WHERE order_id=$1::uuid AND status=$2 AND event_time=$3::timestamptz LIMIT 1`,
            [order.id, internalStatus, ts]
          )
          if (!exists.rows.length) {
            await client.query(
              `INSERT INTO store_shipment_events (order_id, status, description, location, event_time, source) VALUES ($1::uuid,$2,$3,$4,$5::timestamptz,'sendcloud')`,
              [order.id, internalStatus, statusMessage || null, location, ts]
            )
          }
          // Update order status
          if (internalStatus === 'zugestellt' && order.delivery_status !== 'zugestellt') {
            await client.query(`UPDATE store_orders SET delivery_status='zugestellt', delivery_date=COALESCE(delivery_date,now()), updated_at=now() WHERE id=$1::uuid`, [order.id])
            await client.query(`UPDATE store_orders SET order_status='abgeschlossen', updated_at=now() WHERE id=$1::uuid AND payment_status='bezahlt' AND delivery_status='zugestellt' AND order_status NOT IN ('abgeschlossen','retoure','retoure_anfrage','refunded','storniert')`, [order.id])
          } else if (internalStatus === 'versendet' || internalStatus === 'in_transit') {
            await client.query(`UPDATE store_orders SET delivery_status='versendet', updated_at=now() WHERE id=$1::uuid AND delivery_status NOT IN ('versendet','zugestellt')`, [order.id])
          }
        }
        await client.end()
      } catch (_) {}
    })

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

        // ── checkout.session.completed (campaign budget prepayment) ──────────
        else if (event.type === 'checkout.session.completed') {
          const session = event.data.object
          const meta = session.metadata || {}
          if (meta.type === 'campaign_budget' && meta.campaign_id) {
            const client = mkClient()
            try {
              await client.connect()
              await client.query(
                `UPDATE seller_campaigns SET stripe_charge_id=$1, ad_status='pending', updated_at=now() WHERE id=$2`,
                [session.payment_intent || session.id, meta.campaign_id]
              )
              await client.query(
                `INSERT INTO admin_hub_notifications (type, title, body, seller_id, reference_id)
                 VALUES ('campaign_paid', $1, $2, $3, $4)
                 ON CONFLICT DO NOTHING`,
                [
                  'Kampagne bezahlt',
                  `Budget für Kampagne ${meta.campaign_id} wurde über Stripe beglichen.`,
                  meta.seller_id || null,
                  meta.campaign_id,
                ]
              ).catch(() => {})
              await client.end()
            } catch (e) {
              try { await client.end() } catch (_) {}
              console.error('[webhook/stripe] campaign_budget error:', e.message)
            }
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
          WHERE ${storePublishedStatusSql('p.status')}
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
          JOIN admin_hub_products p ON p.id::text = f.product_id AND ${storePublishedStatusSql('p.status')}
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

        const conditions = [storePublishedStatusSql('p.status')]
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
          JOIN admin_hub_products p2 ON p2.id::text = f2.product_id AND ${storePublishedStatusSql('p2.status')}
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
    await ensureEuOriginPendingTable(dbQ).catch(() => {})
    await dbQ(`ALTER TABLE store_cart_items ADD COLUMN IF NOT EXISTS seller_id varchar(255)`).catch(() => {})

    // Newsletter subscriber endpoint
    await dbQ(`CREATE TABLE IF NOT EXISTS store_newsletter_subscribers (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      email text NOT NULL,
      source text DEFAULT 'landing_page',
      status text NOT NULL DEFAULT 'active',
      first_name text,
      last_name text,
      preferred_locale varchar(8),
      notes text,
      subscribed_at timestamptz DEFAULT now(),
      unsubscribed_at timestamptz,
      updated_at timestamptz DEFAULT now(),
      UNIQUE(email)
    )`).catch(() => {})
    await dbQ(`ALTER TABLE store_newsletter_subscribers ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active'`).catch(() => {})
    await dbQ(`ALTER TABLE store_newsletter_subscribers ADD COLUMN IF NOT EXISTS unsubscribed_at timestamptz`).catch(() => {})
    await dbQ(`ALTER TABLE store_newsletter_subscribers ADD COLUMN IF NOT EXISTS first_name text`).catch(() => {})
    await dbQ(`ALTER TABLE store_newsletter_subscribers ADD COLUMN IF NOT EXISTS last_name text`).catch(() => {})
    await dbQ(`ALTER TABLE store_newsletter_subscribers ADD COLUMN IF NOT EXISTS preferred_locale varchar(8)`).catch(() => {})
    await dbQ(`ALTER TABLE store_newsletter_subscribers ADD COLUMN IF NOT EXISTS notes text`).catch(() => {})
    await dbQ(`ALTER TABLE store_newsletter_subscribers ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now()`).catch(() => {})
    await dbQ(`CREATE TABLE IF NOT EXISTS store_newsletter_email_logs (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      subscriber_id uuid REFERENCES store_newsletter_subscribers(id) ON DELETE SET NULL,
      recipient_email text NOT NULL,
      subject text,
      provider text,
      delivery_status text NOT NULL DEFAULT 'sent',
      flow_trigger_key text,
      sent_at timestamptz DEFAULT now()
    )`).catch(() => {})
    await dbQ(`CREATE INDEX IF NOT EXISTS idx_newsletter_logs_subscriber ON store_newsletter_email_logs(subscriber_id, sent_at DESC)`).catch(() => {})
    // Flow execution log: idempotency + status tracking (incremental, backwards-compatible)
    await dbQ(`CREATE TABLE IF NOT EXISTS store_flow_execution_logs (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      trigger_key text NOT NULL,
      flow_id uuid REFERENCES admin_hub_flows(id) ON DELETE CASCADE,
      step_order integer NOT NULL DEFAULT 0,
      audience text NOT NULL DEFAULT 'customer',
      recipient_email text,
      order_id uuid REFERENCES store_orders(id) ON DELETE SET NULL,
      customer_id uuid REFERENCES store_customers(id) ON DELETE SET NULL,
      idempotency_key text NOT NULL,
      status text NOT NULL DEFAULT 'pending',
      attempts integer NOT NULL DEFAULT 1,
      error_message text,
      metadata jsonb,
      sent_at timestamptz,
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now(),
      UNIQUE(idempotency_key)
    )`).catch(() => {})
    await dbQ(`CREATE INDEX IF NOT EXISTS idx_flow_exec_trigger_created ON store_flow_execution_logs(trigger_key, created_at DESC)`).catch(() => {})
    await dbQ(`CREATE INDEX IF NOT EXISTS idx_flow_exec_status_created ON store_flow_execution_logs(status, created_at DESC)`).catch(() => {})
    await dbQ(`
      INSERT INTO store_newsletter_subscribers (email, source, status, first_name, last_name, subscribed_at, updated_at)
      SELECT DISTINCT LOWER(TRIM(c.email)) AS email,
             'legacy_customer' AS source,
             'active' AS status,
             NULLIF(TRIM(c.first_name), ''),
             NULLIF(TRIM(c.last_name), ''),
             now(),
             now()
      FROM store_customers c
      WHERE c.email IS NOT NULL
        AND TRIM(c.email) <> ''
        AND (
          COALESCE(c.email_marketing_consent, false) = true
          OR EXISTS (
            SELECT 1
            FROM store_orders o
            WHERE LOWER(TRIM(o.email)) = LOWER(TRIM(c.email))
              AND COALESCE(o.newsletter_opted_in, false) = true
          )
        )
      ON CONFLICT (email) DO NOTHING
    `).catch(() => {})
    httpApp.post('/store/newsletter-subscribe', async (req, res) => {
      const { email, source, first_name, last_name, preferred_locale } = req.body || {}
      if (!email || !String(email).includes('@')) return res.status(400).json({ message: 'Valid email required' })
      const allowedSources = new Set(['landing_page', 'register', 'checkout', 'manual'])
      const sourceValue = allowedSources.has(String(source || '').trim()) ? String(source).trim() : 'landing_page'
      const localeRaw = String(preferred_locale || '').trim().toLowerCase()
      const localeValue = ['de', 'en', 'tr', 'fr', 'it', 'es'].includes(localeRaw) ? localeRaw : null
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      const { Client } = require('pg')
      const c = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
      try {
        await c.connect()
        await c.query(
          `INSERT INTO store_newsletter_subscribers (email, source, status, first_name, last_name, preferred_locale, subscribed_at, unsubscribed_at, updated_at)
           VALUES ($1, $2, 'active', $3, $4, $5, now(), NULL, now())
           ON CONFLICT (email) DO UPDATE
           SET source = EXCLUDED.source,
               status = 'active',
               first_name = COALESCE(EXCLUDED.first_name, store_newsletter_subscribers.first_name),
               last_name = COALESCE(EXCLUDED.last_name, store_newsletter_subscribers.last_name),
               preferred_locale = COALESCE(EXCLUDED.preferred_locale, store_newsletter_subscribers.preferred_locale),
               subscribed_at = now(),
               unsubscribed_at = NULL,
               updated_at = now()`,
          [String(email).trim().toLowerCase(), sourceValue, first_name ? String(first_name).trim() : null, last_name ? String(last_name).trim() : null, localeValue]
        )
        await c.query(
          `UPDATE store_customers
           SET email_marketing_consent = true, updated_at = now()
           WHERE LOWER(TRIM(email)) = LOWER(TRIM($1))`,
          [String(email).trim().toLowerCase()]
        ).catch(() => {})
        await c.end()
        res.json({ ok: true })
        void dispatchCustomerFlowEvent('new_subscriber', {
          email: String(email).trim().toLowerCase(),
        })
      } catch (e) {
        try { await c.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    })
    httpApp.post('/store/newsletter-unsubscribe', async (req, res) => {
      const { email } = req.body || {}
      if (!email || !String(email).includes('@')) return res.status(400).json({ message: 'Valid email required' })
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      const { Client } = require('pg')
      const c = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
      try {
        await c.connect()
        await c.query(
          `UPDATE store_newsletter_subscribers
           SET status = 'unsubscribed', unsubscribed_at = now()
           WHERE email = $1`,
          [String(email).trim().toLowerCase()]
        )
        await c.query(
          `UPDATE store_customers
           SET email_marketing_consent = false, updated_at = now()
           WHERE LOWER(TRIM(email)) = LOWER(TRIM($1))`,
          [String(email).trim().toLowerCase()]
        ).catch(() => {})
        await c.end()
        res.json({ ok: true })
      } catch (e) {
        try { await c.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    })
    httpApp.get('/admin-hub/v1/newsletter-subscribers', async (req, res) => {
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      const { Client } = require('pg')
      const c = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
      try {
        await c.connect()
        const q = String(req.query?.q || '').trim().toLowerCase()
        const status = String(req.query?.status || '').trim().toLowerCase()
        const where = []
        const vals = []
        if (q) {
          vals.push(`%${q}%`)
          where.push(`(LOWER(email) LIKE $${vals.length} OR LOWER(COALESCE(first_name,'')) LIKE $${vals.length} OR LOWER(COALESCE(last_name,'')) LIKE $${vals.length})`)
        }
        if (['active', 'unsubscribed', 'deactivated'].includes(status)) {
          vals.push(status)
          where.push(`status = $${vals.length}`)
        }
        const sql = `SELECT * FROM store_newsletter_subscribers ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY subscribed_at DESC NULLS LAST LIMIT 500`
        const r = await c.query(sql, vals)
        await c.end()
        res.json({ subscribers: r.rows })
      } catch (e) {
        try { await c.end() } catch (_) {}
        res.json({ subscribers: [] })
      }
    })
    httpApp.post('/admin-hub/v1/newsletter-subscribers', async (req, res) => {
      const user = req.sellerUser || {}
      if (String(user.is_superuser || '').toLowerCase() !== 'true' && user.is_superuser !== true) {
        return res.status(403).json({ message: 'Forbidden' })
      }
      const body = req.body || {}
      const email = String(body.email || '').trim().toLowerCase()
      if (!email || !email.includes('@')) return res.status(400).json({ message: 'Valid email required' })
      const status = ['active', 'unsubscribed', 'deactivated'].includes(String(body.status || '').trim()) ? String(body.status).trim() : 'active'
      const localeRaw = String(body.preferred_locale || '').trim().toLowerCase()
      const localeValue = ['de', 'en', 'tr', 'fr', 'it', 'es'].includes(localeRaw) ? localeRaw : null
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      const { Client } = require('pg')
      const c = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
      try {
        await c.connect()
        const r = await c.query(
          `INSERT INTO store_newsletter_subscribers (email, source, status, first_name, last_name, preferred_locale, notes, subscribed_at, unsubscribed_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, now(), CASE WHEN $3 = 'unsubscribed' THEN now() ELSE NULL END, now())
           ON CONFLICT (email) DO UPDATE
           SET source = EXCLUDED.source, status = EXCLUDED.status, first_name = EXCLUDED.first_name, last_name = EXCLUDED.last_name,
               preferred_locale = EXCLUDED.preferred_locale, notes = EXCLUDED.notes, updated_at = now(),
               unsubscribed_at = CASE WHEN EXCLUDED.status = 'unsubscribed' THEN now() ELSE NULL END
           RETURNING *`,
          [email, String(body.source || 'manual').trim() || 'manual', status, body.first_name ? String(body.first_name).trim() : null, body.last_name ? String(body.last_name).trim() : null, localeValue, body.notes ? String(body.notes) : null]
        )
        await c.end()
        res.json({ subscriber: r.rows[0] || null })
      } catch (e) {
        try { await c.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    })
    httpApp.get('/admin-hub/v1/newsletter-subscribers/:id', async (req, res) => {
      const id = String(req.params?.id || '').trim()
      if (!id) return res.status(400).json({ message: 'id is required' })
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      const { Client } = require('pg')
      const c = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
      try {
        await c.connect()
        const sr = await c.query(`SELECT * FROM store_newsletter_subscribers WHERE id = $1::uuid LIMIT 1`, [id])
        if (!sr.rows?.length) {
          await c.end()
          return res.status(404).json({ message: 'Not found' })
        }
        const er = await c.query(
          `SELECT id, recipient_email, subject, provider, delivery_status, flow_trigger_key, sent_at
           FROM store_newsletter_email_logs
           WHERE subscriber_id = $1::uuid OR recipient_email = $2
           ORDER BY sent_at DESC
           LIMIT 200`,
          [id, String(sr.rows[0].email || '').trim().toLowerCase()]
        )
        await c.end()
        res.json({ subscriber: sr.rows[0], emails: er.rows || [] })
      } catch (e) {
        try { await c.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    })
    httpApp.patch('/admin-hub/v1/newsletter-subscribers/:id', async (req, res) => {
      const user = req.sellerUser || {}
      if (String(user.is_superuser || '').toLowerCase() !== 'true' && user.is_superuser !== true) {
        return res.status(403).json({ message: 'Forbidden' })
      }
      const id = String(req.params?.id || '').trim()
      const status = String(req.body?.status || '').trim().toLowerCase()
      if (!id) return res.status(400).json({ message: 'id is required' })
      if (!['active', 'deactivated', 'unsubscribed'].includes(status)) {
        return res.status(400).json({ message: 'Invalid status' })
      }
      const localeRaw = String(req.body?.preferred_locale || '').trim().toLowerCase()
      const localeValue = ['de', 'en', 'tr', 'fr', 'it', 'es'].includes(localeRaw) ? localeRaw : null
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      const { Client } = require('pg')
      const c = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
      try {
        await c.connect()
        const r = await c.query(
          `UPDATE store_newsletter_subscribers
           SET status = $2,
               first_name = COALESCE($3, first_name),
               last_name = COALESCE($4, last_name),
               preferred_locale = COALESCE($5, preferred_locale),
               notes = COALESCE($6, notes),
               updated_at = now(),
               unsubscribed_at = CASE WHEN $2 = 'unsubscribed' THEN now() ELSE NULL END
           WHERE id = $1
           RETURNING *`,
          [id, status, req.body?.first_name !== undefined ? (req.body.first_name ? String(req.body.first_name).trim() : null) : null, req.body?.last_name !== undefined ? (req.body.last_name ? String(req.body.last_name).trim() : null) : null, req.body?.preferred_locale !== undefined ? localeValue : null, req.body?.notes !== undefined ? (req.body.notes ? String(req.body.notes) : null) : null]
        )
        await c.end()
        if (!r.rows?.length) return res.status(404).json({ message: 'Not found' })
        res.json({ subscriber: r.rows[0] })
      } catch (e) {
        try { await c.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    })
    httpApp.delete('/admin-hub/v1/newsletter-subscribers/:id', async (req, res) => {
      const user = req.sellerUser || {}
      if (String(user.is_superuser || '').toLowerCase() !== 'true' && user.is_superuser !== true) {
        return res.status(403).json({ message: 'Forbidden' })
      }
      const id = String(req.params?.id || '').trim()
      if (!id) return res.status(400).json({ message: 'id is required' })
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      const { Client } = require('pg')
      const c = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
      try {
        await c.connect()
        await c.query(`DELETE FROM store_newsletter_subscribers WHERE id = $1::uuid`, [id])
        await c.end()
        res.json({ ok: true })
      } catch (e) {
        try { await c.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    })
    httpApp.get('/admin-hub/v1/newsletter-subscribers-active', async (req, res) => {
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      const { Client } = require('pg')
      const c = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
      try {
        await c.connect()
        const r = await c.query(
          `SELECT * FROM store_newsletter_subscribers
           WHERE status = 'active'
           ORDER BY subscribed_at DESC NULLS LAST
           LIMIT 500`
        )
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
    httpApp.get('/admin-hub/v1/ranking/config', adminRankingConfigGET)
    httpApp.patch('/admin-hub/v1/ranking/config', adminRankingConfigPATCH)
    httpApp.get('/admin-hub/v1/ranking/products', adminRankingProductsGET)
    httpApp.post('/admin-hub/v1/ranking/compute', adminRankingComputePOST)
    httpApp.get('/admin-hub/v1/ranking/products/:id/breakdown', adminRankingBreakdownGET)

    // Auto-compute ranking features every 2 hours
    setTimeout(() => {
      computeRankingFeatures().catch(() => {})
      setInterval(() => computeRankingFeatures().catch(() => {}), 2 * 60 * 60 * 1000)
    }, 30 * 1000) // 30s delay after startup

    startFlowQueueWorker({
      onOrderEvent: async (jobData) => {
        await runAutomationFlowsForOrder({
          triggerKey: String(jobData?.triggerKey || '').trim(),
          orderId: String(jobData?.orderId || '').trim(),
        })
      },
      onCustomerEvent: async (jobData) => {
        await runAutomationFlowsForCustomerEvent({
          triggerKey: String(jobData?.triggerKey || '').trim(),
          customerId: String(jobData?.customerId || '').trim(),
          email: String(jobData?.email || '').trim(),
        })
      },
    })

    try {
      const { mountBillbeeMarketplaceApi } = require(path.join(__dirname, 'billbee-marketplace-api'))
      mountBillbeeMarketplaceApi(httpApp, { getSellerDbClient, getProductsDbClient })
    } catch (e) {
      console.warn('Billbee marketplace API mount failed:', e?.message || e)
    }

    // ── Sentry Express error handler (S1.4) ──────────────────────────────
    // Must be added AFTER all route handlers (so it sees their errors) and
    // BEFORE listen(). No-op if Sentry was not initialized (no DSN).
    if (process.env.SENTRY_DSN) {
      try {
        Sentry.setupExpressErrorHandler(httpApp)
      } catch (e) {
        console.warn('Sentry.setupExpressErrorHandler failed:', e?.message || e)
      }
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
