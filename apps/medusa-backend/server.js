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
    console.log('link-modules patch applied at:', medusaDir)
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

const PORT = process.env.PORT || 9000
const HOST = process.env.HOST || '0.0.0.0'

// CORS: Vercel/Render'da frontend origin'leri env ile verin (virgülle ayrılmış).
// Örnek: CORS_ORIGINS=https://belucha-sellercentral.vercel.app,https://belucha-shop.vercel.app
// Render'da bu değişkeni ayarlamazsanız production'da tüm origin'lere izin verilir (güvenlik için ayarlamanız önerilir).
function getAllowedOrigins() {
  const env = process.env.CORS_ORIGINS || process.env.ALLOWED_ORIGINS
  if (env) {
    return env.split(',').map((o) => o.trim()).filter(Boolean)
  }
  const store = (process.env.STORE_CORS || '').split(',').map((o) => o.trim()).filter(Boolean)
  const admin = (process.env.ADMIN_CORS || '').split(',').map((o) => o.trim()).filter(Boolean)
  const combined = [...new Set([...store, ...admin])]
  if (combined.length) return combined
  if (process.env.NODE_ENV === 'production') return null // null = allow all origins (Render'da CORS_ORIGINS yoksa)
  return ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:3002']
}

async function start() {
  try {
    console.log('\n🚀 Medusa v2 backend başlatılıyor...\n')
    await configLoader(path.resolve(__dirname), 'medusa-config')
    await pgConnectionLoader()
    if (!container.hasRegistration(ContainerRegistrationKeys.LOGGER)) {
      container.register(ContainerRegistrationKeys.LOGGER, asValue(logger))
    }

    const app = express()
    app.use(express.json())
    const allowedOrigins = getAllowedOrigins()
    const allowAllOrigins = allowedOrigins === null
    if (allowAllOrigins) {
      console.log('CORS: allowing all origins (production, CORS_ORIGINS not set). Set CORS_ORIGINS on Render for stricter security.')
    } else {
      console.log('CORS allowed origins:', allowedOrigins.join(', ') || '(none)')
    }
    app.use(cors({
      origin: (origin, cb) => {
        if (!origin) return cb(null, true) // same-origin / Postman
        if (allowAllOrigins) return cb(null, true)
        // Yerel geliştirme: localhost her zaman kabul (Render'da CORS_ORIGINS sadece Vercel olsa bile)
        if (/^https?:\/\/localhost(:\d+)?$/.test(origin)) return cb(null, true)
        if (allowedOrigins.includes(origin)) return cb(null, true)
        return cb(null, false)
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'sentry-trace', 'sentry-baggage'],
    }))
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
    const resolveUploadUrl = (url) => {
      if (!url) return null
      if (url.startsWith('http') || url.startsWith('//')) return url
      return `${CURRENT_SERVER_URL}${url.startsWith('/') ? '' : '/'}${url}`
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
        await client.query(`ALTER TABLE admin_hub_seller_settings ADD COLUMN IF NOT EXISTS free_shipping_thresholds jsonb`).catch(() => {})
        await client.query(`ALTER TABLE admin_hub_seller_settings ADD COLUMN IF NOT EXISTS shop_logo_url text`).catch(() => {})
        await client.query(`ALTER TABLE admin_hub_seller_settings ADD COLUMN IF NOT EXISTS shop_favicon_url text`).catch(() => {})
        await client.query(`ALTER TABLE admin_hub_seller_settings ADD COLUMN IF NOT EXISTS sellercentral_logo_url text`).catch(() => {})
        await client.query(`ALTER TABLE admin_hub_seller_settings ADD COLUMN IF NOT EXISTS sellercentral_favicon_url text`).catch(() => {})
        await client.query(`ALTER TABLE admin_hub_seller_settings ADD COLUMN IF NOT EXISTS shop_logo_height integer DEFAULT 34`).catch(() => {})
        await client.query(`ALTER TABLE admin_hub_seller_settings ADD COLUMN IF NOT EXISTS sellercentral_logo_height integer DEFAULT 30`).catch(() => {})
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
        await client.query(`ALTER TABLE seller_users ADD COLUMN IF NOT EXISTS iban text;`).catch(() => {})
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
        await client.end()
        console.log('Admin Hub: admin_hub_menus, admin_hub_menu_locations, admin_hub_media, admin_hub_pages, admin_hub_collections, admin_hub_seller_settings, admin_hub_brands, store_carts, store_cart_items tabloları hazır')
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

    // --- Kategoriler: Route'lar her zaman kayıtlı; handler içinde adminHubService resolve edilir (404 yerine 503 döner) ---
    const resolveAdminHub = () => {
      try {
        return container.resolve('adminHubService')
      } catch (e) {
        return null
      }
    }
    const adminHubCategoriesGET = async (req, res) => {
      const adminHubService = resolveAdminHub()
      if (!adminHubService) {
        return res.status(503).json({ message: 'Admin Hub service not available', code: 'ADMIN_HUB_NOT_LOADED' })
      }
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
        const categories = await adminHubService.listCategories(filters)
        res.json({ categories, count: categories.length })
      } catch (err) {
        console.error('Admin Hub Categories GET error:', err)
        res.status(500).json({ message: (err && err.message) || 'Internal server error' })
      }
    }
    const adminHubCategoriesPOST = async (req, res) => {
      const adminHubService = resolveAdminHub()
      if (!adminHubService) {
        return res.status(503).json({ message: 'Admin Hub service not available', code: 'ADMIN_HUB_NOT_LOADED' })
      }
      try {
        const b = req.body || {}
        const name = b.name
        const slug = b.slug
        if (!name || !slug) return res.status(400).json({ message: 'name ve slug zorunludur' })
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
        const syncCategoryCmsToCollection = async (cat, body) => {
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
            console.warn('syncCategoryCmsToCollection (POST):', e && e.message)
          }
        }
        await syncCategoryCmsToCollection(category, b)
        res.status(201).json({ category })
      } catch (err) {
        console.error('Admin Hub Categories POST error:', err)
        res.status(500).json({ message: (err && err.message) || 'Internal server error' })
      }
    }
    const adminHubCategoriesImportPOST = async (req, res) => {
      const adminHubService = resolveAdminHub()
      if (!adminHubService) {
        return res.status(503).json({ message: 'Admin Hub service not available', code: 'ADMIN_HUB_NOT_LOADED' })
      }
      try {
        const { items } = req.body || {}
        if (!Array.isArray(items) || items.length === 0) {
          return res.status(400).json({ message: 'items array is required and must not be empty' })
        }
        const { imported, categories } = await adminHubService.importCategories(items)
        res.status(201).json({ imported, categories })
      } catch (err) {
        console.error('Admin Hub Categories import error:', err)
        res.status(500).json({ message: (err && err.message) || 'Import failed' })
      }
    }
    const adminHubCategoryByIdGET = async (req, res) => {
      const adminHubService = resolveAdminHub()
      if (!adminHubService) return res.status(503).json({ message: 'Admin Hub service not available', code: 'ADMIN_HUB_NOT_LOADED' })
      try {
        const category = await adminHubService.getCategoryById(req.params.id)
        if (!category) return res.status(404).json({ message: 'Category not found' })
        res.json({ category })
      } catch (err) {
        console.error('Admin Hub Category GET error:', err)
        res.status(500).json({ message: (err && err.message) || 'Internal server error' })
      }
    }
    const adminHubCategoryByIdPUT = async (req, res) => {
      const adminHubService = resolveAdminHub()
      if (!adminHubService) return res.status(503).json({ message: 'Admin Hub service not available', code: 'ADMIN_HUB_NOT_LOADED' })
      try {
        const body = req.body || {}
        const category = await adminHubService.updateCategory(req.params.id, body)
        try {
          const meta = (body && typeof body.metadata === 'object' && body.metadata) || {}
          const categoryMeta = (category && category.metadata && typeof category.metadata === 'object') ? category.metadata : {}
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
        res.json({ category })
      } catch (err) {
        console.error('Admin Hub Category PUT error:', err)
        res.status(500).json({ message: (err && err.message) || 'Internal server error' })
      }
    }
    const adminHubCategoryByIdDELETE = async (req, res) => {
      const adminHubService = resolveAdminHub()
      if (!adminHubService) return res.status(503).json({ message: 'Admin Hub service not available', code: 'ADMIN_HUB_NOT_LOADED' })
      try {
        await adminHubService.deleteCategory(req.params.id)
        res.status(200).json({ deleted: true })
      } catch (err) {
        console.error('Admin Hub Category DELETE error:', err)
        res.status(500).json({ message: (err && err.message) || 'Internal server error' })
      }
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
    console.log('Admin Hub categories routes: GET/POST /admin-hub/categories ve /admin-hub/v1/categories (+ :id GET/PUT/DELETE)')

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
      console.log('Admin route: GET /admin/products (fallback)')
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
    console.log('Admin route: GET /admin/orders')

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
        const res = await client.query('SELECT id, title, handle, metadata FROM admin_hub_collections ORDER BY title')
        await client.end()
        return (res.rows || []).map(r => {
          const meta = r.metadata && typeof r.metadata === 'object' ? r.metadata : {}
          return { id: r.id, title: r.title, handle: r.handle, image_url: meta.image_url || null, banner_image_url: meta.banner_image_url || null }
        })
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
        const res = await client.query(
          'INSERT INTO admin_hub_collections (title, handle) VALUES ($1, $2) ON CONFLICT (handle) DO UPDATE SET title = $1 RETURNING id, title, handle',
          [title, handle]
        )
        await client.end()
        return res.rows && res.rows[0] ? res.rows[0] : null
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
        const res = await client.query('DELETE FROM admin_hub_collections WHERE id = $1 RETURNING id', [id])
        await client.end()
        return res.rowCount > 0
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
        const res = await client.query('SELECT id, title, handle, metadata FROM admin_hub_collections WHERE LOWER(handle) = LOWER($1)', [handle.trim()])
        await client.end()
        return res.rows && res.rows[0] ? res.rows[0] : null
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
    console.log('Admin route: GET/POST/PATCH/DELETE /admin-hub/collections, GET /admin-hub/collections/:id')

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
    console.log('Admin route: GET/POST /admin-hub/brands, PATCH/DELETE /admin-hub/brands/:id')

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

    console.log('Admin route: GET/PUT/DELETE /admin-hub/metafield-definitions (+ pending, proposals)')

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
        const res = await client.query('SELECT id, slug, label, html_id, sort_order FROM admin_hub_menu_locations ORDER BY sort_order ASC, slug ASC')
        const list = (res.rows || []).map((r) => ({ id: r.id, slug: r.slug, label: r.label, html_id: r.html_id || null, sort_order: r.sort_order ?? 0 }))
        await client.end()
        return list
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
    console.log('Admin Hub routes: /admin-hub/menus (+ :id, :menuId/items, :itemId), /admin-hub/menu-locations, /store/menu-locations')

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
          masterProduct = allProds.find((p) => extractEanFromHubProductRow(p) === incomingEan) || null
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
        // Seller-specific fields that can be saved to the listing without superuser approval
        const SELLER_LISTING_FIELDS = ['price', 'inventory', 'status', 'sku']
        const SELLER_LISTING_META_FIELDS = ['shipping_group_id', 'brand_id', 'publish_date', 'seller_name', 'shop_name']
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
    httpApp.get('/admin-hub/products/:id', adminHubProductByIdGET)
    httpApp.put('/admin-hub/products/:id', adminHubProductByIdPUT)
    httpApp.delete('/admin-hub/products/:id', adminHubProductByIdDELETE)
    console.log('Admin Hub routes: GET/POST /admin-hub/products, GET/PUT/DELETE /admin-hub/products/:id')

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
             AND LOWER(COALESCE(approval_status, '')) = 'approved'`
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
      try {
        const sellerId = (req.query.seller_id || 'default').toString().trim() || 'default'
        const client = getProductsDbClient()
        if (!client) return res.json({ store_name: '' })
        await client.connect()
        const r = await client.query('SELECT store_name, free_shipping_thresholds, shop_logo_url, shop_favicon_url, sellercentral_logo_url, sellercentral_favicon_url, shop_logo_height, sellercentral_logo_height FROM admin_hub_seller_settings WHERE seller_id = $1', [sellerId])
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
        res.json({ store_name, free_shipping_thresholds, shop_logo_url, shop_favicon_url, sellercentral_logo_url, sellercentral_favicon_url, shop_logo_height, sellercentral_logo_height })
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
        if (free_shipping_thresholds) {
          free_shipping_thresholds = normalizeThresholdsObject(free_shipping_thresholds)
        }
        const client = getProductsDbClient()
        if (!client) return res.status(500).json({ message: 'Database unavailable' })
        await client.connect()
        const thresholdsJson = free_shipping_thresholds ? JSON.stringify(free_shipping_thresholds) : null
        console.log('[sellerSettingsPATCH] saving free_shipping_thresholds:', thresholdsJson)
        await client.query(
          `INSERT INTO admin_hub_seller_settings (
             seller_id, store_name, free_shipping_thresholds, shop_logo_url, shop_favicon_url, sellercentral_logo_url, sellercentral_favicon_url, shop_logo_height, sellercentral_logo_height, updated_at
           ) VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7, $8, $9, now())
           ON CONFLICT (seller_id) DO UPDATE SET
             store_name = COALESCE($2, admin_hub_seller_settings.store_name),
             free_shipping_thresholds = COALESCE($3::jsonb, admin_hub_seller_settings.free_shipping_thresholds),
             shop_logo_url = COALESCE($4, admin_hub_seller_settings.shop_logo_url),
             shop_favicon_url = COALESCE($5, admin_hub_seller_settings.shop_favicon_url),
             sellercentral_logo_url = COALESCE($6, admin_hub_seller_settings.sellercentral_logo_url),
             sellercentral_favicon_url = COALESCE($7, admin_hub_seller_settings.sellercentral_favicon_url),
             shop_logo_height = COALESCE($8, admin_hub_seller_settings.shop_logo_height),
             sellercentral_logo_height = COALESCE($9, admin_hub_seller_settings.sellercentral_logo_height),
             updated_at = now()`,
          [sellerId, store_name || null, thresholdsJson, shop_logo_url, shop_favicon_url, sellercentral_logo_url, sellercentral_favicon_url, shop_logo_height, sellercentral_logo_height]
        )
        await client.end()
        console.log('[sellerSettingsPATCH] saved OK')
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
    console.log('Admin Hub routes: GET/PATCH /admin-hub/seller-settings')

    // ── Seller Auth ───────────────────────────────────────────────────────────
    const SELLER_JWT_SECRET = (process.env.JWT_SECRET || 'belucha-seller-secret-2025')
    // Initial superuser email(s) — can also be managed via DB
    const INITIAL_SUPERUSER_EMAILS = (process.env.SUPERUSER_EMAILS || 'murathan.cotuk@gmail.com')
      .split(',').map((e) => e.trim().toLowerCase()).filter(Boolean)

    function signSellerToken(payload) {
      const _c = require('crypto')
      const header = Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url')
      const body = Buffer.from(JSON.stringify({ ...payload, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 30 * 24 * 3600 })).toString('base64url')
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
    const sellerAuthRegisterPOST = async (req, res) => {
      const body = req.body || {}
      const email = (body.email || '').trim().toLowerCase()
      const password = (body.password || '').toString()
      const store_name = (body.store_name || body.storeName || '').trim()
      const invite_token = (body.invite_token || '').trim()
      const first_name = (body.first_name || '').trim()
      const last_name = (body.last_name || '').trim()
      if (!email || !password) return res.status(400).json({ message: 'Email and password are required' })
      if (password.length < 6) return res.status(400).json({ message: 'Password must be at least 6 characters' })
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
      } catch (err) {
        try { await client.end() } catch (_) {}
        console.error('sellerAuthRegisterPOST:', err)
        res.status(500).json({ message: err?.message || 'Registration failed' })
      }
    }

    // POST /admin-hub/auth/login
    const sellerAuthLoginPOST = async (req, res) => {
      const body = req.body || {}
      const email = (body.email || '').trim().toLowerCase()
      const password = (body.password || '').toString()
      if (!email || !password) return res.status(400).json({ message: 'Email and password are required' })
      const client = getSellerDbClient()
      if (!client) return res.status(503).json({ message: 'Database not configured' })
      try {
        await client.connect()
        const r = await client.query('SELECT id, email, password_hash, store_name, seller_id, sub_of_seller_id, is_superuser, permissions FROM seller_users WHERE email = $1', [email])
        const user = r.rows[0]
        if (!user) { await client.end(); return res.status(401).json({ message: 'Invalid email or password' }) }
        // Check if email is in initial superuser list (in case they registered before the list was set)
        const shouldBeSuperuser = user.is_superuser || INITIAL_SUPERUSER_EMAILS.includes(email)
        if (!verifySellerPassword(password, user.password_hash)) { await client.end(); return res.status(401).json({ message: 'Invalid email or password' }) }
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
      if (password.length < 6) return res.status(400).json({ message: 'Password must be at least 6 characters' })
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
        if (body.password && body.password.length >= 6) { params.push(hashSellerPassword(body.password)); sets.push(`password_hash = $${params.length}`) }
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
    httpApp.get('/admin-hub/users', requireSellerAuth, requireSuperuser, sellerUsersGET)
    httpApp.post('/admin-hub/users', requireSellerAuth, requireSuperuser, sellerUserCreatePOST)
    httpApp.patch('/admin-hub/users/:id', requireSellerAuth, requireSuperuser, sellerUserUpdatePATCH)
    httpApp.delete('/admin-hub/users/:id', requireSellerAuth, requireSuperuser, sellerUserDeleteDELETE)
    httpApp.patch('/admin-hub/users/:id/superuser', requireSellerAuth, requireSuperuser, sellerUserSuperuserPATCH)
    console.log('Admin Hub routes: seller auth + users')

    const loadPlatformCheckoutRow = async (pgClient) => {
      const r = await pgClient.query(
        `SELECT stripe_publishable_key, stripe_secret_key, pay_card, pay_paypal, pay_klarna, paypal_client_id, paypal_client_secret
         FROM store_platform_checkout WHERE id = 1`,
      )
      return r.rows?.[0] || null
    }

    const resolveStripeSecretKeyFromPlatform = (row) => {
      const envKey = (process.env.STRIPE_SECRET_KEY || '').toString().trim()
      if (envKey) return envKey
      return row ? (row.stripe_secret_key || '').toString().trim() : ''
    }

    const paymentMethodTypesFromPlatformRow = (row) => {
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
          env_stripe_secret: !!(process.env.STRIPE_SECRET_KEY || '').toString().trim(),
          env_stripe_publishable:
            !!(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || process.env.STRIPE_PUBLISHABLE_KEY || '').toString().trim(),
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
        await client.query(
          `INSERT INTO store_platform_checkout (id, stripe_publishable_key, stripe_secret_key, pay_card, pay_paypal, pay_klarna, paypal_client_id, paypal_client_secret, updated_at)
           VALUES (1, $1, $2, $3, $4, $5, $6, $7, now())
           ON CONFLICT (id) DO UPDATE SET
             stripe_publishable_key = EXCLUDED.stripe_publishable_key,
             stripe_secret_key = EXCLUDED.stripe_secret_key,
             pay_card = EXCLUDED.pay_card,
             pay_paypal = EXCLUDED.pay_paypal,
             pay_klarna = EXCLUDED.pay_klarna,
             paypal_client_id = EXCLUDED.paypal_client_id,
             paypal_client_secret = EXCLUDED.paypal_client_secret,
             updated_at = now()`,
          [nextPk || null, nextSk || null, pay_card, pay_paypal, pay_klarna, paypal_client_id || null, paypal_client_secret || null],
        )
        await client.end()
        res.json({ ok: true })
      } catch (err) {
        try { await client.end() } catch (_) {}
        console.error('platformCheckoutSettingsPUT:', err)
        res.status(500).json({ message: (err && err.message) || 'Error' })
      }
    }

    httpApp.get('/admin-hub/v1/platform-checkout-settings', requireSellerAuth, requireSuperuser, platformCheckoutSettingsGET)
    httpApp.put('/admin-hub/v1/platform-checkout-settings', requireSellerAuth, requireSuperuser, platformCheckoutSettingsPUT)
    console.log('Admin Hub routes: platform-checkout-settings (superuser)')

    // Store API: public seller settings (store name) for "Sold by" on shop
    const storeSellerSettingsGET = async (req, res) => {
      try {
        const sellerId = (req.query.seller_id || 'default').toString().trim() || 'default'
        const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
        if (!dbUrl || !dbUrl.startsWith('postgres')) return res.json({ store_name: '', free_shipping_thresholds: null, shop_logo_url: '', shop_favicon_url: '', sellercentral_logo_url: '', sellercentral_favicon_url: '', shop_logo_height: 34, sellercentral_logo_height: 30 })
        const { Client } = require('pg')
        const client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        const r = await client.query('SELECT store_name, free_shipping_thresholds, shop_logo_url, shop_favicon_url, sellercentral_logo_url, sellercentral_favicon_url, shop_logo_height, sellercentral_logo_height FROM admin_hub_seller_settings WHERE seller_id = $1', [sellerId])
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
        console.log('[storeSellerSettingsGET] free_shipping_thresholds:', JSON.stringify(free_shipping_thresholds))
        res.json({ store_name, free_shipping_thresholds, shop_logo_url, shop_favicon_url, sellercentral_logo_url, sellercentral_favicon_url, shop_logo_height, sellercentral_logo_height })
      } catch (err) {
        console.error('[storeSellerSettingsGET] error:', err && err.message)
        res.json({ store_name: '', free_shipping_thresholds: null, shop_logo_url: '', shop_favicon_url: '', sellercentral_logo_url: '', sellercentral_favicon_url: '', shop_logo_height: 34, sellercentral_logo_height: 30 })
      }
    }
    httpApp.get('/store/seller-settings', storeSellerSettingsGET)
    console.log('Store routes: GET /store/seller-settings')

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
      if (Array.isArray(meta.category_ids)) meta.category_ids.forEach(push)
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
          const ah = resolveAdminHub()
          if (ah) {
            try {
              const tree = await ah.getCategoryTree({ is_visible: true })
              allowedCategoryIds = collectCategorySubtreeIdsBySlug(tree, categorySlugFilter)
            } catch (_) {
              allowedCategoryIds = null
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
        let list = await listAdminHubProductsDb({
          ...queryWithId,
          limit: searchQ ? 200 : (categorySlugFilter ? Math.max(parseInt(query.limit, 10) || 3000, 500) : (query.limit || 100)),
          category: categorySlugFilter || undefined,
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
      // First: legacy scan (product rows per seller, old model)
      let list = await listAdminHubProductsDb({ limit: 5000 })
      list = list.filter((row) => (row.status || '').toLowerCase() === 'published' && isStoreVisibleSellerProduct(row, approvedSellerIds))
      const legacyOffers = list.filter((row) => extractEanFromHubProductRow(row) === ean && row.seller_id)
      // Second: listings table (new model — master product + per-seller listings)
      const masterRow = list.find((row) => extractEanFromHubProductRow(row) === ean && !row.seller_id)
      let listingOffers = []
      if (masterRow) {
        const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
        if (dbUrl && dbUrl.startsWith('postgres')) {
          try {
            const { Client } = require('pg')
            const lc = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
            await lc.connect()
            const lr = await lc.query(
              `SELECT seller_id, price_cents, inventory, status, orders_count FROM admin_hub_seller_listings WHERE product_id = $1 AND status = 'active'`,
              [masterRow.id]
            )
            await lc.end()
            listingOffers = (lr.rows || [])
              .filter((l) => !approvedSellerIds || approvedSellerIds.has(l.seller_id))
              .map((l) => ({
                ...masterRow,
                id: masterRow.id + '-listing-' + l.seller_id, // synthetic id for scoring
                _listing_id: masterRow.id,
                seller_id: l.seller_id,
                price_cents: l.price_cents,
                inventory: l.inventory,
                _orders_count: l.orders_count,
              }))
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
          if (offers.length > 1) {
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
            const reviewProductIds = offers.map((p) => String(p.id))
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
            multiOffer = {
              canonical_ean: canonicalEan,
              review_product_ids: reviewProductIds,
              landed_product_id: String(landed.id),
              buy_box_product_id: String(winnerRow.id),
              other_sellers: otherSellers,
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
    console.log('Store routes: GET /store/products, GET /store/products/:idOrHandle, GET /store/brands, GET /store/brands/:handle (from Admin Hub)')

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
    console.log('Store routes: POST/GET /store/carts, PATCH cart, POST/PATCH/DELETE line-items')

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
        
        const subtotalCents = items.reduce((sum, it) => sum + (Number(it.unit_price_cents || 0) * Number(it.quantity || 1)), 0)
        const reservedPts = Number(cart.bonus_points_reserved || 0)
        const bonusDiscountCents = discountCentsFromBonusPoints(reservedPts)
        const couponDiscountCents = Math.max(0, Number(cart.coupon_discount_cents || 0))
        const discountCents = Math.max(0, bonusDiscountCents + couponDiscountCents)
        const shippingCents = Math.max(0, Number(body.shipping_cents || 0))
        const payCents = Math.max(0, subtotalCents - discountCents + shippingCents)
        if (payCents <= 0) {
          await client.end()
          return res.status(400).json({
            message:
              'Der Bestellbetrag ist 0 €. Vollständige Bezahlung nur mit Bonuspunkten ist derzeit nicht möglich — bitte Punkte reduzieren oder Artikel hinzufügen.',
          })
        }

        const platformRow = await loadPlatformCheckoutRow(client)
        const secretKeyResolved = resolveStripeSecretKeyFromPlatform(platformRow)
        if (!secretKeyResolved) {
          await client.end()
          return res.status(503).json({ message: 'STRIPE_SECRET_KEY not configured (set in environment or Sellercentral → Settings → Checkout)' })
        }

        const paymentMethodTypes = paymentMethodTypesFromPlatformRow(platformRow)
        const stripe = new (require('stripe'))(secretKeyResolved)
        const authHdr = (req.headers.authorization || '').toString()
        const bearerTok = authHdr.startsWith('Bearer ') ? authHdr.slice(7).trim() : ''
        let stripeCustomerId = null
        if (bearerTok) {
          const payload = verifyCustomerToken(bearerTok)
          if (payload?.id) {
            const custR = await client.query(
              'SELECT id, email, first_name, last_name, stripe_customer_id FROM store_customers WHERE id = $1::uuid',
              [String(payload.id)],
            )
            const c = custR.rows?.[0]
            if (c) {
              stripeCustomerId = c.stripe_customer_id || null
              if (!stripeCustomerId) {
                const sc = await stripe.customers.create({
                  email: c.email || payload.email || undefined,
                  name: [c.first_name, c.last_name].filter(Boolean).join(' ').trim() || undefined,
                  metadata: { belucha_customer_id: c.id },
                })
                stripeCustomerId = sc.id
                await client.query('UPDATE store_customers SET stripe_customer_id = $1 WHERE id = $2::uuid', [stripeCustomerId, c.id])
              }
            }
          }
        }
        const piBody = {
          amount: payCents,
          currency: 'eur',
          payment_method_types: paymentMethodTypes,
          // transfer_group links this charge to seller Transfers created at order completion
          transfer_group: `cart_${cartId}`,
          metadata: {
            cart_id: cartId,
            subtotal_cents: String(subtotalCents),
            discount_cents: String(discountCents),
            coupon_discount_cents: String(couponDiscountCents),
            coupon_code: String(cart.coupon_code || ''),
            bonus_points_redeemed: String(reservedPts),
          },
        }
        if (stripeCustomerId) piBody.customer = stripeCustomerId
        const paymentIntent = await stripe.paymentIntents.create(piBody)

        await client.end()
        res.json({
          client_secret: paymentIntent.client_secret,
          payment_intent_id: paymentIntent.id,
          amount_cents: payCents,
          subtotal_cents: subtotalCents,
          shipping_cents: shippingCents,
          bonus_discount_cents: discountCents,
          coupon_discount_cents: couponDiscountCents,
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
        'SELECT id, order_number, cart_id, payment_intent_id, status, order_status, payment_status, delivery_status, email, first_name, last_name, phone, address_line1, address_line2, city, postal_code, country, billing_address_line1, billing_address_line2, billing_city, billing_postal_code, billing_country, billing_same_as_shipping, payment_method, customer_id, is_guest, newsletter_opted_in, subtotal_cents, total_cents, COALESCE(discount_cents,0) AS discount_cents, COALESCE(bonus_points_redeemed,0) AS bonus_points_redeemed, currency, created_at, updated_at FROM store_orders WHERE id = $1',
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
        discount_cents: Number(oRow.discount_cents || 0),
        bonus_points_redeemed: Number(oRow.bonus_points_redeemed || 0),
        total_cents: oRow.total_cents,
        currency: oRow.currency,
        created_at: oRow.created_at,
        updated_at: oRow.updated_at,
        items,
      }
    }

    // ── Customer Auth Helpers ─────────────────────────────────────────────
    const _crypto = require('crypto')
    const CUSTOMER_JWT_SECRET = (process.env.JWT_SECRET || 'belucha-jwt-secret-change-in-prod')

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
      const body = Buffer.from(JSON.stringify({ ...payload, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 30 * 24 * 3600 })).toString('base64url')
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
    const storeCustomerRegisterPOST = async (req, res) => {
      const body = req.body || {}
      const email = (body.email || '').trim().toLowerCase()
      const password = (body.password || '').toString()
      if (!email || !password) return res.status(400).json({ message: 'Email and password are required' })
      if (password.length < 6) return res.status(400).json({ message: 'Password must be at least 6 characters' })
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
        const token = signCustomerToken({ id: row.id, email: row.email, role: 'customer' })
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
          bonus_ledger = lr.rows || []
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
        const shopName = process.env.SHOP_INVOICE_NAME || 'Belucha'
        res.setHeader('Content-Type', 'application/pdf')
        res.setHeader('Content-Disposition', `attachment; filename="Rechnung-${on}.pdf"`)
        const doc = new PDFDocument({ margin: 48, size: 'A4' })
        doc.pipe(res)
        doc.fontSize(20).fillColor('#111').text(pdfDeLatin('Rechnung'), { align: 'right' })
        doc.moveDown(0.2)
        doc.fontSize(9).fillColor('#666').text(pdfDeLatin(shopName), { align: 'right' })
        doc.fillColor('#111')
        doc.moveDown(1.2)
        doc.fontSize(10).text(`Rechnungs-Nr.: ${on}`)
        doc.text(`Datum: ${pdfFmtDate(row.created_at)}`)
        doc.text(`Bestell-ID: ${orderId}`)
        doc.moveDown(0.6)
        const custName = [row.first_name, row.last_name].filter(Boolean).join(' ')
        doc.text(`Kunde: ${pdfDeLatin(custName || '—')}`)
        if (row.email) doc.text(`E-Mail: ${pdfDeLatin(row.email)}`)
        doc.moveDown(0.6)
        doc.fontSize(10).font('Helvetica-Bold').text(pdfDeLatin('Lieferadresse'))
        doc.font('Helvetica').fontSize(9)
        ;[custName, row.address_line1, row.address_line2, [row.postal_code, row.city].filter(Boolean).join(' '), row.country].filter(Boolean).forEach((line) => doc.text(pdfDeLatin(line)))
        const billDiff = row.billing_same_as_shipping === false && row.billing_address_line1
        if (billDiff) {
          doc.moveDown(0.5)
          doc.fontSize(10).font('Helvetica-Bold').text(pdfDeLatin('Rechnungsadresse'))
          doc.font('Helvetica').fontSize(9)
          ;[[row.first_name, row.last_name].filter(Boolean).join(' '), row.billing_address_line1, row.billing_address_line2, [row.billing_postal_code, row.billing_city].filter(Boolean).join(' '), row.billing_country].filter(Boolean).forEach((line) => doc.text(pdfDeLatin(line)))
        }
        doc.moveDown(0.8)
        doc.fontSize(10).font('Helvetica-Bold').text(pdfDeLatin('Positionen'))
        doc.font('Helvetica').fontSize(9)
        itemRows.forEach((it) => {
          const qty = Number(it.quantity || 1)
          const unit = Number(it.unit_price_cents || 0)
          doc.text(`${qty} x ${pdfDeLatin(it.title || 'Artikel')} — ${pdfCents(unit)} / Stk. — ${pdfCents(unit * qty)}`, { width: 500 })
        })
        doc.moveDown(0.6)
        const sub = row.subtotal_cents != null ? Number(row.subtotal_cents) : itemRows.reduce((s, it) => s + Number(it.unit_price_cents || 0) * Number(it.quantity || 1), 0)
        const ship = Number(row.shipping_cents || 0)
        const disc = Number(row.discount_cents || 0)
        doc.text(`Zwischensumme: ${pdfCents(sub)}`)
        doc.text(`Versand: ${ship > 0 ? pdfCents(ship) : '0,00 EUR (kostenlos)'}`)
        if (disc > 0) doc.text(`Rabatt: -${pdfCents(disc)}`)
        doc.font('Helvetica-Bold').fontSize(11).text(`Gesamt: ${pdfCents(row.total_cents != null ? row.total_cents : sub + ship - disc)}`)
        doc.font('Helvetica').fontSize(8).fillColor('#666').moveDown(1)
        doc.text(pdfDeLatin('Hinweis: Es handelt sich um eine vereinfachte Rechnung. Bei Fragen wenden Sie sich an den Verkäufer.'), { width: 480 })
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
                  o.order_number,
                  p.title as product_title, p.handle as product_handle
           FROM store_product_reviews r
           LEFT JOIN store_orders o ON o.id = r.order_id
           LEFT JOIN admin_hub_products p ON p.id::text = r.product_id
           ${sellerFilter}
           ORDER BY r.created_at DESC
           LIMIT 1000`,
          params
        )
        await client.end()
        res.json({ reviews: r.rows || [] })
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
        await client.end()
        const orders = (ordersR.rows || []).map(row => ({
          ...row,
          order_number: row.order_number ? Number(row.order_number) : null,
          items: itemsMap[row.id] || [],
          returns: returnsMap[row.id] || [],
        }))
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

        const subtotalCents = items.reduce((sum, it) => sum + (Number(it.unit_price_cents || 0) * Number(it.quantity || 1)), 0)
        const reservedPts = Number(cart.bonus_points_reserved || 0)
        const bonusDiscountCents = discountCentsFromBonusPoints(reservedPts)
        const couponDiscountCents = Math.max(0, Number(cart.coupon_discount_cents || 0))
        const discountCents = Math.max(0, bonusDiscountCents + couponDiscountCents)
        const shippingCentsOrder = Math.max(0, Number(body.shipping_cents || 0))
        const merchandiseAfterDiscount = Math.max(0, subtotalCents - discountCents)
        const orderPaidTotalCents = Math.max(0, merchandiseAfterDiscount + shippingCentsOrder)
        const bonusPointsRedeemed = reservedPts

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

        // Get payment method from Stripe + verify paid amount matches cart (incl. bonus + Versand)
        const platformRowOrders = await loadPlatformCheckoutRow(client)
        const secretKey = resolveStripeSecretKeyFromPlatform(platformRowOrders)
        let paymentMethod = 'card'
        let stripeInst = null
        if (secretKey) {
          try {
            stripeInst = new (require('stripe'))(secretKey)
            const pi = await stripeInst.paymentIntents.retrieve(paymentIntentId, { expand: ['payment_method'] })
            const paidCents = Number(pi.amount)
            if (paidCents !== orderPaidTotalCents) {
              await client.end()
              return res.status(400).json({ message: 'Zahlungsbetrag stimmt nicht mit dem Warenkorb überein. Bitte Checkout neu laden.' })
            }
            const pm = pi.payment_method
            if (pm && typeof pm === 'object') {
              if (pm.type === 'card' && pm.card && pm.card.brand) { paymentMethod = pm.card.brand }
              else if (pm.type) { paymentMethod = pm.type }
            } else if (pi.payment_method_types && pi.payment_method_types[0]) {
              paymentMethod = pi.payment_method_types[0]
            }
          } catch (e) {
            await client.end()
            return res.status(400).json({ message: e?.message || 'Zahlung konnte nicht verifiziert werden' })
          }
        } else if (orderPaidTotalCents > 0) {
          console.warn('storeOrdersPOST: STRIPE_SECRET_KEY missing — skipping PaymentIntent amount verification')
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
             subtotal_cents, discount_cents, coupon_code, coupon_discount_cents, shipping_cents, bonus_points_redeemed, total_cents, currency)
           VALUES ($1,$2,'paid',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,'in_bearbeitung','bezahlt','pending',$23,$24,$25,$26,$27,$28,$29,'eur')
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

        // Update Stripe payment intent with order number and seller id
        if (secretKey && orderNumber) {
          try {
            const stripeForUpdate = stripeInst || new (require('stripe'))(secretKey)
            await stripeForUpdate.paymentIntents.update(paymentIntentId, {
              description: `Order #${orderNumber} - ${sellerId}`,
              metadata: { order_number: String(orderNumber), order_id: orderId, seller_id: sellerId },
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
      const envPk = (process.env.STRIPE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || '').toString().trim()
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      if (!dbUrl || !dbUrl.startsWith('postgres')) {
        return res.json({ stripe_publishable_key: envPk || null, payment_method_types: paymentMethodTypesFromPlatformRow(null) })
      }
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        const row = await loadPlatformCheckoutRow(client)
        await client.end()
        const dbPk = (row?.stripe_publishable_key || '').toString().trim()
        res.json({
          stripe_publishable_key: envPk || dbPk || null,
          payment_method_types: paymentMethodTypesFromPlatformRow(row),
        })
      } catch (err) {
        if (client) try { await client.end() } catch (_) {}
        console.error('storePublicPaymentConfigGET:', err)
        res.json({ stripe_publishable_key: envPk || null, payment_method_types: ['card'] })
      }
    }

    // Routes
    httpApp.get('/store/public-payment-config', storePublicPaymentConfigGET)
    httpApp.post('/store/payment-intent', storePaymentIntentPOST)
    httpApp.post('/store/orders', storeOrdersPOST)
    httpApp.get('/store/orders/me', storeOrdersMeGET)
    httpApp.get('/store/orders/:id', storeOrdersGET)
    console.log('Store routes: GET /store/public-payment-config, POST /store/payment-intent, POST /store/orders, GET /store/orders/me, GET /store/orders/:id')

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
    console.log('Store route: GET /store/collections')

    // GET /store/menus – Public menüler (Shop). Her menü SADECE kendi menu_id’sine ait item’ları alır (raw DB).
    const storeCategoriesGET = async (req, res) => {
      const adminHubService = resolveAdminHub()
      if (!adminHubService) return res.status(200).json({ categories: [], tree: [], count: 0 })
      try {
        const slug = (req.query.slug || '').toString().trim()
        if (slug) {
          const category = await adminHubService.getCategoryBySlug(slug)
          if (!category || category.active === false || category.is_visible === false) return res.status(404).json({ message: 'Category not found' })
          const meta = category.metadata && typeof category.metadata === 'object' ? category.metadata : {}
          const collectionId = category.has_collection && meta.collection_id ? meta.collection_id : null
          const cat = {
            id: category.id,
            name: category.name,
            slug: category.slug,
            title: category.name,
            handle: category.slug,
            description: category.description || null,
            long_content: category.long_content || null,
            banner_image_url: resolveUploadUrl(category.banner_image_url || meta.banner_image_url || null) || null,
            has_collection: category.has_collection,
            collection_id: collectionId || null,
          }
          return res.json({ category: cat, categories: [cat], count: 1 })
        }
        const tree = await adminHubService.getCategoryTree({ is_visible: true })
        const categories = (tree || []).map((c) => ({ id: c.id, name: c.name, slug: c.slug, title: c.name, handle: c.slug }))
        res.json({ categories, tree, count: categories.length })
      } catch (err) {
        console.error('Store categories GET error:', err)
        res.status(200).json({ categories: [], tree: [], count: 0 })
      }
    }
    httpApp.get('/store/categories', storeCategoriesGET)
    console.log('Store route: GET /store/categories')

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
    console.log('Store route: GET /store/menus, GET /store/page-by-label-slug/:slug')

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

    const mediaUploadPOST = async (req, res) => {
      if (!req.file) return res.status(400).json({ message: 'No file uploaded' })
      const client = getDbClient()
      if (!client) return res.status(503).json({ message: 'Database not configured' })
      const mediaSeg = req._sellerMediaFolderSegment || '_misc'
      let fileUrl
      if (useS3 && req.file.buffer && process.env.S3_UPLOAD_BUCKET) {
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
      try {
        await client.connect()
        const r = await client.query(
          `INSERT INTO admin_hub_media (filename, url, mime_type, size, alt, folder_id, seller_id) VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING id, filename, url, mime_type, size, alt, folder_id, seller_id, created_at`,
          [req.file.originalname || req.file.filename, fileUrl, req.file.mimetype || null, req.file.size || 0, alt, folderId, uploadSellerId]
        )
        const row = r.rows[0]
        res.status(201).json({ id: row.id, url: row.url, filename: row.filename, mime_type: row.mime_type, size: row.size, folder_id: row.folder_id, created_at: row.created_at })
      } catch (err) {
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
          r = await client.query('SELECT f.*, COUNT(m.id)::int AS media_count FROM admin_hub_media_folders f LEFT JOIN admin_hub_media m ON m.folder_id = f.id GROUP BY f.id ORDER BY f.name ASC')
        } else {
          r = await client.query('SELECT f.*, COUNT(m.id)::int AS media_count FROM admin_hub_media_folders f LEFT JOIN admin_hub_media m ON m.folder_id = f.id WHERE f.seller_id = $1 GROUP BY f.id ORDER BY f.name ASC', [callerSellerId])
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

    httpApp.get('/admin-hub/v1/media', requireSellerAuth, mediaListWithFolderGET)
    httpApp.post('/admin-hub/v1/media', requireSellerAuth, prepareSellerMediaUploadPath, upload.single('file'), mediaUploadPOST)
    httpApp.get('/admin-hub/v1/media/folders', requireSellerAuth, mediaFoldersGET)
    httpApp.post('/admin-hub/v1/media/folders', requireSellerAuth, mediaFoldersPOST)
    httpApp.delete('/admin-hub/v1/media/folders/:id', requireSellerAuth, mediaFolderDELETE)
    httpApp.get('/admin-hub/v1/media/:id', requireSellerAuth, mediaByIdGET)
    httpApp.patch('/admin-hub/v1/media/:id', requireSellerAuth, mediaPATCH)
    httpApp.post('/admin-hub/v1/media/add-url', requireSellerAuth, mediaAddByUrlPOST)
    httpApp.delete('/admin-hub/v1/media/:id', requireSellerAuth, mediaByIdDELETE)
    console.log('Admin Hub routes: GET/POST /admin-hub/v1/media, GET/DELETE /admin-hub/v1/media/:id')

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
        const r = await client.query(`SELECT o.id, o.order_number, o.order_status, o.payment_status, o.delivery_status, o.seller_id, o.email, o.first_name, o.last_name, o.phone, o.address_line1, o.address_line2, o.city, o.postal_code, o.country, o.subtotal_cents, o.total_cents, o.currency, o.payment_intent_id, o.cart_id, o.created_at, o.is_guest, o.tracking_number, o.carrier_name, o.shipped_at, c.customer_number, c.id AS customer_id, (c.password_hash IS NOT NULL) AS c_is_registered FROM store_orders o LEFT JOIN store_customers c ON LOWER(c.email) = LOWER(o.email) ${where} ORDER BY ${orderBy} LIMIT $${params.length+1} OFFSET $${params.length+2}`, [...params, lim, off])
        const countR = await client.query(`SELECT COUNT(*) FROM store_orders o ${where}`, params)
        const orders = (r.rows || []).map(row => ({
          id: row.id, order_number: row.order_number ? Number(row.order_number) : null,
          order_status: row.order_status || 'offen', payment_status: row.payment_status || 'bezahlt',
          delivery_status: row.delivery_status || 'offen',
          seller_id: row.seller_id || 'default',
          email: row.email, first_name: row.first_name, last_name: row.last_name, phone: row.phone,
          address_line1: row.address_line1, address_line2: row.address_line2, city: row.city,
          postal_code: row.postal_code, country: row.country,
          subtotal_cents: row.subtotal_cents, total_cents: row.total_cents, currency: row.currency,
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
        res.json({ order: { ...row, order_number: row.order_number ? Number(row.order_number) : null, items, customer_number: customerNumber, is_registered: isRegistered, is_first_order: isFirstOrder } })
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
    const pdfCents = (c) => (Number(c || 0) / 100).toLocaleString('de-DE', { minimumFractionDigits: 2 }) + ' EUR'

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
        const shopName = process.env.SHOP_INVOICE_NAME || 'Belucha'
        res.setHeader('Content-Type', 'application/pdf')
        res.setHeader('Content-Disposition', `attachment; filename="Rechnung-${on}.pdf"`)
        const doc = new PDFDocument({ margin: 48, size: 'A4' })
        doc.pipe(res)
        doc.fontSize(20).fillColor('#111').text(pdfDeLatin('Rechnung'), { align: 'right' })
        doc.moveDown(0.2)
        doc.fontSize(9).fillColor('#666').text(pdfDeLatin(shopName), { align: 'right' })
        doc.fillColor('#111')
        doc.moveDown(1.2)
        doc.fontSize(10).text(`Rechnungs-Nr.: ${on}`)
        doc.text(`Datum: ${pdfFmtDate(row.created_at)}`)
        doc.text(`Bestell-ID: ${id}`)
        doc.moveDown(0.6)
        const custName = [row.first_name, row.last_name].filter(Boolean).join(' ')
        doc.text(`Kunde: ${pdfDeLatin(custName || '—')}`)
        if (row.email) doc.text(`E-Mail: ${pdfDeLatin(row.email)}`)
        doc.moveDown(0.6)
        doc.fontSize(10).font('Helvetica-Bold').text(pdfDeLatin('Lieferadresse'))
        doc.font('Helvetica').fontSize(9)
        ;[custName, row.address_line1, row.address_line2, [row.postal_code, row.city].filter(Boolean).join(' '), row.country].filter(Boolean).forEach((line) => doc.text(pdfDeLatin(line)))
        const billDiff = row.billing_same_as_shipping === false && row.billing_address_line1
        if (billDiff) {
          doc.moveDown(0.5)
          doc.fontSize(10).font('Helvetica-Bold').text(pdfDeLatin('Rechnungsadresse'))
          doc.font('Helvetica').fontSize(9)
          ;[
            [row.first_name, row.last_name].filter(Boolean).join(' '),
            row.billing_address_line1,
            row.billing_address_line2,
            [row.billing_postal_code, row.billing_city].filter(Boolean).join(' '),
            row.billing_country,
          ]
            .filter(Boolean)
            .forEach((line) => doc.text(pdfDeLatin(line)))
        }
        doc.moveDown(0.8)
        doc.fontSize(10).font('Helvetica-Bold').text(pdfDeLatin('Positionen'))
        doc.font('Helvetica').fontSize(9)
        itemRows.forEach((it) => {
          const qty = Number(it.quantity || 1)
          const unit = Number(it.unit_price_cents || 0)
          const lineTotal = unit * qty
          doc.text(
            `${qty} x ${pdfDeLatin(it.title || 'Artikel')} — ${pdfCents(unit)} / Stk. — ${pdfCents(lineTotal)}`,
            { width: 500 },
          )
        })
        doc.moveDown(0.6)
        const sub = row.subtotal_cents != null ? Number(row.subtotal_cents) : itemRows.reduce((s, it) => s + Number(it.unit_price_cents || 0) * Number(it.quantity || 1), 0)
        const ship = Number(row.shipping_cents || 0)
        const disc = Number(row.discount_cents || 0)
        doc.text(`Zwischensumme: ${pdfCents(sub)}`)
        doc.text(`Versand: ${ship > 0 ? pdfCents(ship) : '0,00 EUR (kostenlos)'}`)
        if (disc > 0) doc.text(`Rabatt: -${pdfCents(disc)}`)
        doc.font('Helvetica-Bold').fontSize(11).text(`Gesamt: ${pdfCents(row.total_cents != null ? row.total_cents : sub + ship - disc)}`)
        doc.font('Helvetica').fontSize(8).fillColor('#666')
        doc.moveDown(1)
        doc.text(pdfDeLatin('Hinweis: Es handelt sich um eine vereinfachte Rechnung. Bei Fragen wenden Sie sich an den Verkäufer.'), { width: 480 })
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
        const shopName = process.env.SHOP_INVOICE_NAME || 'Belucha'
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
        await client.query(`UPDATE store_orders SET ${sets.join(', ')} WHERE id = $${params.length}::uuid`, params)
        // Auto-complete: if payment is paid and delivery is delivered, mark order as completed — do not override Retoure / Rückgabe / Erstattung
        await client.query(
          `UPDATE store_orders SET order_status = 'abgeschlossen', updated_at = now()
           WHERE id = $1::uuid AND payment_status = 'bezahlt' AND delivery_status = 'zugestellt'
           AND order_status NOT IN ('abgeschlossen','retoure','retoure_anfrage','refunded','storniert')`,
          [id]
        )
        const oRes = await client.query('SELECT * FROM store_orders WHERE id = $1::uuid', [id])
        const row = oRes.rows && oRes.rows[0]
        const iRes = await client.query('SELECT * FROM store_order_items WHERE order_id = $1 ORDER BY created_at', [id])
        const items = (iRes.rows || []).map(r => ({ id: r.id, variant_id: r.variant_id, product_id: r.product_id, quantity: r.quantity, unit_price_cents: r.unit_price_cents, title: r.title, thumbnail: r.thumbnail, product_handle: r.product_handle }))
        await client.end()
        res.json({ order: { ...row, order_number: row.order_number ? Number(row.order_number) : null, items } })
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
              description: e.description,
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

    const adminHubIntegrationsGET = async (req, res) => {
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        const r = await client.query('SELECT id, name, slug, logo_url, is_active, category, created_at, updated_at FROM store_integrations ORDER BY name ASC')
        await client.end()
        res.json({ integrations: r.rows || [] })
      } catch (e) {
        if (client) try { await client.end() } catch (_) {}
        res.json({ integrations: [] })
      }
    }

    const adminHubIntegrationPOST = async (req, res) => {
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        const { name, slug, logo_url, api_key, api_secret, webhook_url, config, is_active = false, category = 'other' } = req.body || {}
        if (!name || !slug) return res.status(400).json({ message: 'name and slug required' })
        const r = await client.query(
          `INSERT INTO store_integrations (name, slug, logo_url, api_key, api_secret, webhook_url, config, is_active, category)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
           ON CONFLICT (slug) DO UPDATE SET name=EXCLUDED.name, logo_url=EXCLUDED.logo_url, api_key=EXCLUDED.api_key, api_secret=EXCLUDED.api_secret, webhook_url=EXCLUDED.webhook_url, config=EXCLUDED.config, is_active=EXCLUDED.is_active, updated_at=NOW()
           RETURNING id, name, slug, logo_url, is_active, category, created_at, updated_at`,
          [name, slug, logo_url||null, api_key||null, api_secret||null, webhook_url||null, config ? JSON.stringify(config) : '{}', is_active, category]
        )
        await client.end()
        res.json({ integration: r.rows[0] })
      } catch (e) {
        if (client) try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    const adminHubIntegrationPATCH = async (req, res) => {
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      const id = (req.params.id || '').trim()
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        const allowed = ['name','logo_url','api_key','api_secret','webhook_url','config','is_active','category']
        const body = req.body || {}
        const sets = []; const vals = []
        for (const key of allowed) { if (key in body) { vals.push(key === 'config' ? JSON.stringify(body[key]) : body[key]); sets.push(`${key} = $${vals.length}`) } }
        if (sets.length === 0) return res.status(400).json({ message: 'no fields to update' })
        vals.push(id)
        const r = await client.query(
          `UPDATE store_integrations SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${vals.length}::uuid RETURNING id, name, slug, logo_url, is_active, category, updated_at`, vals
        )
        await client.end()
        if (!r.rows[0]) return res.status(404).json({ message: 'Not found' })
        res.json({ integration: r.rows[0] })
      } catch (e) {
        if (client) try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    const adminHubIntegrationDELETE = async (req, res) => {
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      const id = (req.params.id || '').trim()
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        await client.query('DELETE FROM store_integrations WHERE id = $1::uuid', [id])
        await client.end()
        res.json({ success: true })
      } catch (e) {
        if (client) try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
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
      const secretKey = (process.env.STRIPE_SECRET_KEY || '').trim()
      if (!secretKey) throw new Error('STRIPE_SECRET_KEY not configured')
      const stripe = new (require('stripe'))(secretKey)
      const row = await client.query('SELECT stripe_customer_id FROM store_customers WHERE id = $1::uuid', [customerId])
      let stripeCustomerId = row.rows[0]?.stripe_customer_id
      if (!stripeCustomerId) {
        const sc = await stripe.customers.create({ email, metadata: { belucha_customer_id: customerId } })
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
    httpApp.get('/admin-hub/v1/integrations', adminHubIntegrationsGET)
    httpApp.post('/admin-hub/v1/integrations', adminHubIntegrationPOST)
    httpApp.patch('/admin-hub/v1/integrations/:id', adminHubIntegrationPATCH)
    httpApp.delete('/admin-hub/v1/integrations/:id', adminHubIntegrationDELETE)
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
              from: process.env.SMTP_FROM || '"Belucha Shop" <noreply@belucha.de>',
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
    console.log('Admin Hub routes: orders, customers, abandoned-carts, returns')

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
    console.log('Admin Hub routes: GET/POST /admin-hub/v1/pages, GET/PUT/DELETE /admin-hub/v1/pages/:id')

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
    console.log('Store routes: GET /store/pages, GET /store/pages/:slug')

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
          const img = meta.image_url || meta.banner_image_url || null
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
      if (!client) return res.json({ enabled: false, businessUnitId: null, templateId: null })
      try {
        await client.connect()
        const r = await client.query(
          `SELECT api_key, config FROM store_integrations WHERE LOWER(TRIM(slug)) = 'trustpilot' AND is_active = true LIMIT 1`
        )
        const row = r.rows[0]
        const bu = row && row.api_key ? String(row.api_key).trim() : ''
        if (!bu) return res.json({ enabled: false, businessUnitId: null, templateId: null })
        let cfg = {}
        try {
          const c = row.config
          cfg = typeof c === 'string' ? JSON.parse(c) : (c && typeof c === 'object' ? c : {})
        } catch (_) {}
        const templateId = (cfg.template_id || cfg.templateId || '').toString().trim() || '5419b732-fbfb-4c9d-8b9d-0a9952a935df'
        res.json({ enabled: true, businessUnitId: bu, templateId })
      } catch (err) {
        console.error('storeTrustpilotConfigGET:', err)
        res.json({ enabled: false, businessUnitId: null, templateId: null })
      } finally {
        await client.end().catch(() => {})
      }
    }
    httpApp.get('/store/trustpilot-config', storeTrustpilotConfigGET)

    console.log('Landing page routes: GET/PUT /admin-hub/landing-page, GET /store/landing-page, GET /store/styles, GET /store/trustpilot-config')

    // ── Notifications ─────────────────────────────────────────────────────
    const adminHubNotificationsUnreadGET = async (req, res) => {
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        const seenR = await client.query(`SELECT notifications_seen_at FROM admin_hub_seller_settings WHERE seller_id = 'default' LIMIT 1`)
        const seenAt = seenR.rows[0]?.notifications_seen_at || new Date(0)
        const sellerIdParam = (req.query.seller_id || '').toString().trim()
        // Inbox badge: use per-message read flags only (not notifications_seen_at — that is for the bell’s orders/returns “since last open”).
        let messagesR
        if (sellerIdParam) {
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
            [sellerIdParam],
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
        const [ordersR, returnsR] = await Promise.all([
          client.query(`SELECT COUNT(*)::int AS c FROM store_orders WHERE created_at > $1`, [seenAt]),
          client.query(`SELECT COUNT(*)::int AS c FROM store_returns WHERE created_at > $1`, [seenAt]),
        ])
        const recentOrders = await client.query(`SELECT id, order_number, first_name, last_name, total_cents, created_at FROM store_orders WHERE created_at > $1 ORDER BY created_at DESC LIMIT 5`, [seenAt])
        const recentReturns = await client.query(`SELECT r.id, r.return_number, r.status, r.created_at, o.order_number FROM store_returns r LEFT JOIN store_orders o ON o.id = r.order_id WHERE r.created_at > $1 ORDER BY r.created_at DESC LIMIT 5`, [seenAt])
        await client.end()
        res.json({
          unread: (ordersR.rows[0]?.c || 0) + (returnsR.rows[0]?.c || 0) + (messagesR.rows[0]?.c || 0),
          orders: ordersR.rows[0]?.c || 0,
          returns: returnsR.rows[0]?.c || 0,
          messages: messagesR.rows[0]?.c || 0,
          recent_orders: recentOrders.rows.map(r => ({ ...r, order_number: r.order_number ? Number(r.order_number) : null })),
          recent_returns: recentReturns.rows.map(r => ({ ...r, return_number: r.return_number ? Number(r.return_number) : null, order_number: r.order_number ? Number(r.order_number) : null })),
          seen_at: seenAt,
        })
      } catch (e) {
        if (client) try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    const adminHubNotificationsMarkSeenPOST = async (req, res) => {
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        await client.query(`INSERT INTO admin_hub_seller_settings (seller_id, notifications_seen_at) VALUES ('default', now()) ON CONFLICT (seller_id) DO UPDATE SET notifications_seen_at = now()`)
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
        // Get seller from_email
        const smtpR = await client.query(`SELECT from_email, from_name FROM store_smtp_settings WHERE seller_id = 'default' LIMIT 1`)
        const sellerEmail = smtpR.rows[0]?.from_email || ''

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
            const fromName = smtpR.rows[0]?.from_name || 'Shop'
            transport.sendMail({
              from: `"${fromName}" <${sellerEmail}>`,
              to: recipientEmail,
              subject: subject || 'Nachricht vom Shop',
              text: body,
              html: `<p>${body.replace(/\n/g, '<br>')}</p>`,
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
        const smtpR = await client.query(`SELECT from_email, from_name FROM store_smtp_settings WHERE seller_id = 'default' LIMIT 1`)
        const sellerEmail = smtpR.rows[0]?.from_email || ''
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
    const adminHubSmtpSettingsGET = async (req, res) => {
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        const r = await client.query(`SELECT seller_id, provider, host, port, secure, username, from_name, from_email, updated_at FROM store_smtp_settings WHERE seller_id = 'default' LIMIT 1`)
        await client.end()
        res.json({ smtp: r.rows[0] || null })
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

    httpApp.get('/admin-hub/v1/notifications/unread', adminHubNotificationsUnreadGET)
    httpApp.post('/admin-hub/v1/notifications/mark-seen', adminHubNotificationsMarkSeenPOST)
    httpApp.get('/admin-hub/v1/messages', adminHubMessagesGET)
    httpApp.post('/admin-hub/v1/messages', adminHubMessagesPOST)
    httpApp.patch('/admin-hub/v1/messages/support/mark-read', adminHubSupportMessagesMarkReadPATCH)
    httpApp.patch('/admin-hub/v1/messages/:id/read', adminHubMessageMarkReadPATCH)
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
    httpApp.patch('/admin-hub/v1/smtp-settings', adminHubSmtpSettingsPATCH)
    httpApp.post('/admin-hub/v1/smtp-settings/test', adminHubSmtpSettingsTestPOST)

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
        // Only paid orders
        where.push(`o.payment_status = 'bezahlt'`)
        // If include_pending: all paid orders; otherwise only delivered 14+ days ago
        if (!includePending) {
          where.push(`o.delivery_date IS NOT NULL AND o.delivery_date <= now() - interval '${limitDays} days'`)
        }
        if (req.query.period_start) {
          params.push(req.query.period_start)
          where.push(`o.created_at >= $${params.length}`)
        }
        if (req.query.period_end) {
          params.push(req.query.period_end)
          where.push(`o.created_at < ($${params.length}::date + interval '1 day')`)
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
        const transactions = r.rows.map(row => {
          const commRate = parseFloat(row.commission_rate ?? 0.12)
          const sellerBasis = sellerOrderRevenueBasisCents(row)
          const customerPaid = Number(row.total_cents || 0)
          const commission = Math.round(sellerBasis * commRate)
          const payout = sellerBasis - commission
          return {
            id: row.id,
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
            iban: isSuperuser ? row.iban : undefined,
            stripe_transfer_status: row.stripe_transfer_status || null,
            stripe_transfer_id: row.stripe_transfer_id || null,
            stripe_transfer_error: row.stripe_transfer_error || null,
            stripe_transfer_at: row.stripe_transfer_at || null,
            delivery_date: row.delivery_date,
            created_at: row.created_at,
            first_name: row.first_name,
            last_name: row.last_name,
            currency: row.currency || 'EUR',
          }
        })
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
          ? `AND o.created_at >= $2 AND o.created_at <= $3`
          : ''
        if (period_start) params.push(period_start)
        if (period_end) params.push(period_end)
        const r = await client.query(
          `SELECT
             COALESCE(SUM(o.subtotal_cents), 0) AS total_cents,
             COALESCE(SUM(o.shipping_cents), 0) AS shipping_cents,
             COUNT(*) FILTER (WHERE o.payment_status = 'bezahlt') AS paid_count,
             COALESCE(SUM(o.subtotal_cents) FILTER (WHERE o.refund_status = 'refunded'), 0) AS refund_cents
           FROM store_orders o
           WHERE o.seller_id = $1 AND o.payment_status = 'bezahlt' ${dateFilter}`,
          params
        )
        const row = r.rows[0] || {}
        // Also get payout status for this period
        let payoutStatus = null
        if (period_start && period_end) {
          const po = await client.query(
            `SELECT status FROM seller_payouts WHERE seller_id = $1 AND period_start <= $3 AND period_end >= $2 ORDER BY created_at DESC LIMIT 1`,
            [sellerId, period_start, period_end]
          )
          payoutStatus = po.rows[0]?.status || null
        }
        await client.end()
        res.json({ summary: {
          total_cents: parseInt(row.total_cents) || 0,
          shipping_cents: parseInt(row.shipping_cents) || 0,
          refund_cents: parseInt(row.refund_cents) || 0,
          paid_count: parseInt(row.paid_count) || 0,
          status: payoutStatus,
        }})
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
          ? `AND o.created_at >= $1 AND o.created_at <= $2`
          : ''
        if (period_start) params.push(period_start)
        if (period_end) params.push(period_end)
        const r = await client.query(
          `SELECT
             o.seller_id,
             s.store_name,
             s.email,
             COALESCE(SUM(o.subtotal_cents), 0) AS total_cents,
             COUNT(*) AS order_count,
             ROUND((COALESCE(SUM(o.subtotal_cents), 0)::numeric * COALESCE(MAX(s.commission_rate), 0.12)))::bigint AS commission_cents,
             ROUND((COALESCE(SUM(o.subtotal_cents), 0)::numeric * (1 - COALESCE(MAX(s.commission_rate), 0.12))))::bigint AS payout_cents
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

    const autoPayoutPeriodForDate = (d = new Date()) => {
      const now = new Date(d)
      const day = now.getDate()
      const y = now.getFullYear()
      const m = now.getMonth()
      if (day === 1) {
        const prevMonthDate = new Date(y, m - 1, 1)
        const py = prevMonthDate.getFullYear()
        const pm = prevMonthDate.getMonth()
        const endDay = new Date(py, pm + 1, 0).getDate()
        return {
          runKey: `AUTO-${y}-${String(m + 1).padStart(2, '0')}-01`,
          periodStart: `${py}-${String(pm + 1).padStart(2, '0')}-16`,
          periodEnd: `${py}-${String(pm + 1).padStart(2, '0')}-${String(endDay).padStart(2, '0')}`,
        }
      }
      if (day === 15) {
        return {
          runKey: `AUTO-${y}-${String(m + 1).padStart(2, '0')}-15`,
          periodStart: `${y}-${String(m + 1).padStart(2, '0')}-01`,
          periodEnd: `${y}-${String(m + 1).padStart(2, '0')}-15`,
        }
      }
      return null
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

            const tr = await stripe.transfers.create({
              amount: transferAmount,
              currency: 'eur',
              destination: s.stripe_account_id,
              source_transaction: chargeId,
              transfer_group: `cart_${row.cart_id || ''}`,
              description: `Order #${row.order_number || ''} seller ${sellerId}`,
              metadata: { order_id: orderId, order_number: String(row.order_number || ''), seller_id: sellerId },
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

    // Fire once on boot and then hourly: creates payout records automatically on 1st and 15th.
    runAutomaticPayoutsIfDue().catch(() => {})
    runStripeConnectTransfersIfDue().catch(() => {})
    setInterval(() => {
      runAutomaticPayoutsIfDue().catch(() => {})
      runStripeConnectTransfersIfDue().catch(() => {})
    }, 60 * 60 * 1000)

    // PATCH /admin-hub/v1/seller/iban — set own IBAN
    const adminHubSellerIbanPATCH = async (req, res) => {
      const sellerId = req.sellerUser?.seller_id
      if (!sellerId) return res.status(401).json({ message: 'Unauthorized' })
      const client = getSellerDbClient()
      if (!client) return res.status(503).json({ message: 'DB not configured' })
      try {
        await client.connect()
        const { iban } = req.body || {}
        await client.query('UPDATE seller_users SET iban = $1, updated_at = now() WHERE seller_id = $2', [iban || null, sellerId])
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
                  approval_status, created_at, iban,
                  company_name, authorized_person_name, tax_id, vat_id,
                  business_address, phone, documents, rejection_reason, approved_at
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
            company_name: row.company_name,
            authorized_person_name: row.authorized_person_name,
            tax_id: row.tax_id,
            vat_id: row.vat_id,
            business_address: row.business_address,
            phone: row.phone,
            documents: row.documents,
            rejection_reason: row.rejection_reason,
            approved_at: row.approved_at,
          },
          // legacy alias
          user: {
            id: row.id,
            email: row.email,
            store_name: row.store_name,
            seller_id: row.seller_id,
            is_superuser: row.is_superuser === true,
            approval_status: row.approval_status || 'registered',
          },
        })
      } catch (e) {
        try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    /** PATCH /admin-hub/v1/seller/password — eigenes Passwort (nur eingeloggter Benutzer) */
    const adminHubSellerPasswordPATCH = async (req, res) => {
      const userId = req.sellerUser?.id
      if (!userId) return res.status(401).json({ message: 'Unauthorized' })
      const { current_password, new_password } = req.body || {}
      const cur = (current_password || '').toString()
      const neu = (new_password || '').toString()
      if (!cur || !neu) return res.status(400).json({ message: 'Aktuelles und neues Passwort sind erforderlich.' })
      if (neu.length < 6) return res.status(400).json({ message: 'Neues Passwort muss mindestens 6 Zeichen haben.' })
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
                subject: 'Einladung zur Belucha Seller Platform',
                text: `${displayName ? `Hallo ${displayName},\n\n` : ''}Sie wurden eingeladen, der Belucha Seller Platform beizutreten.\n\nRegistrierungslink: ${inviteUrl}\n\nDieser Link ist 7 Tage gültig.`,
                html: `<p>${displayName ? `Hallo <strong>${displayName}</strong>,` : ''}</p><p>Sie wurden eingeladen, der <strong>Belucha Seller Platform</strong> beizutreten.</p><p><a href="${inviteUrl}">Jetzt registrieren</a></p><p>Dieser Link ist 7 Tage gültig.</p>`
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
          `SELECT cr.*, p.title AS product_title FROM admin_hub_product_change_requests cr LEFT JOIN admin_hub_products p ON p.id = cr.product_id ${where} ORDER BY cr.created_at DESC`,
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
          // product counts (Sellercentral ürünleri admin_hub_products’ta; eski `product` tablosu bu akışta kullanılmıyor)
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
      const allowed = ['company_name', 'authorized_person_name', 'tax_id', 'vat_id', 'business_address', 'warehouse_address', 'phone', 'website']
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
    console.log('Seller mgmt routes: GET/PATCH /admin-hub/v1/sellers, PATCH /admin-hub/v1/sellers/:id/approve')

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

        if (typeof window === 'undefined' && result.decision !== 'approved') {
          // Could trigger admin notification here (webhook, email, etc.)
        }

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
      if (!secretKey) return res.status(503).json({ message: 'Stripe not configured. Set STRIPE_SECRET_KEY in Settings → Checkout.' })

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
    // ── End Stripe Connect Routes ────────────────────────────────────────────

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
        console.log('[Ranking] Features computed for', (await (async () => {
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
    console.log('Ranking routes registered: /store/products/ranked, /store/events, /admin-hub/v1/ranking/*')

    // Auto-compute ranking features every 2 hours
    setTimeout(() => {
      computeRankingFeatures().catch(() => {})
      setInterval(() => computeRankingFeatures().catch(() => {}), 2 * 60 * 60 * 1000)
    }, 30 * 1000) // 30s delay after startup

    httpApp.listen(PORT, HOST, () => {
      console.log(`\n✅ Medusa v2 backend başarıyla başlatıldı!`)
      console.log(`📍 Listening on ${HOST}:${PORT}\n`)
    })

    process.on('SIGTERM', () => {
      console.log('\nSIGTERM received, shutting down gracefully')
      httpApp.close(() => { process.exit(0) })
    })
    process.on('SIGINT', () => {
      console.log('\nSIGINT received, shutting down gracefully')
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