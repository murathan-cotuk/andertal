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
            created_at timestamp DEFAULT now(),
            updated_at timestamp DEFAULT now()
          );
        `)
        await client.query(`
          CREATE TABLE IF NOT EXISTS admin_hub_menu_items (
            id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
            menu_id uuid NOT NULL REFERENCES admin_hub_menus(id) ON DELETE CASCADE,
            label varchar(255) NOT NULL,
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
        await client.query('CREATE INDEX IF NOT EXISTS idx_admin_hub_menus_location ON admin_hub_menus(location);')
        await client.query('CREATE INDEX IF NOT EXISTS idx_admin_hub_menu_items_menu_id ON admin_hub_menu_items(menu_id);')
        await client.query('CREATE INDEX IF NOT EXISTS idx_admin_hub_menu_items_parent_id ON admin_hub_menu_items(parent_id);')
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
        await client.query(`ALTER TABLE store_orders ADD COLUMN IF NOT EXISTS discount_cents integer NOT NULL DEFAULT 0`).catch(() => {})
        await client.query(`ALTER TABLE store_orders ADD COLUMN IF NOT EXISTS shipping_cents integer NOT NULL DEFAULT 0`).catch(() => {})
        await client.query(`ALTER TABLE admin_hub_seller_settings ADD COLUMN IF NOT EXISTS free_shipping_thresholds jsonb`).catch(() => {})
        await client.query(`ALTER TABLE store_orders ADD COLUMN IF NOT EXISTS bonus_points_redeemed integer NOT NULL DEFAULT 0`).catch(() => {})
        await client.query(`
          CREATE TABLE IF NOT EXISTS store_shipping_carriers (
            id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
            name varchar(100) NOT NULL,
            tracking_url_template text,
            api_key text,
            api_secret text,
            is_active boolean DEFAULT true,
            sort_order integer DEFAULT 0,
            created_at timestamp DEFAULT now(),
            updated_at timestamp DEFAULT now()
          );
        `).catch(() => {})
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
          metadata: b.metadata,
        })
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
        const category = await adminHubService.updateCategory(req.params.id, req.body || {})
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
        const res = await client.query('SELECT id, title, handle FROM admin_hub_collections ORDER BY title')
        await client.end()
        return res.rows || []
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
                if (adminHub) await adminHub.updateCategory(categoryId, { has_collection: true, metadata: { collection_id: row.id } })
              } catch (_) {}
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
        if (categoryId) {
          try {
            const adminHub = resolveAdminHub()
            if (adminHub) await adminHub.updateCategory(categoryId, { has_collection: true, metadata: { collection_id: id } })
          } catch (_) {}
        }
        const meta = (updated.metadata && typeof updated.metadata === 'object') ? updated.metadata : {}
        res.json({
          collection: {
            id: collectionId,
            title: updated.title,
            handle: updated.handle,
            display_title: meta.display_title,
            meta_title: meta.meta_title,
            meta_description: meta.meta_description,
            keywords: meta.keywords,
            richtext: meta.richtext,
            image_url: meta.image_url,
            banner_image_url: meta.banner_image_url,
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
        const r = await client.query('SELECT id, name, handle, logo_image, banner_image, address, created_at FROM admin_hub_brands ORDER BY name')
        await client.end()
        res.json({ brands: (r.rows || []).map((row) => ({ id: row.id, name: row.name, handle: row.handle, logo_image: row.logo_image || null, banner_image: row.banner_image || null, address: row.address || null, created_at: row.created_at })) })
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
      const client = getBrandsDbClient()
      if (!client) return res.status(500).json({ message: 'Database unavailable' })
      try {
        await client.connect()
        const r = await client.query(
          'INSERT INTO admin_hub_brands (name, handle, logo_image, banner_image, address) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (handle) DO UPDATE SET name = $1, logo_image = $3, banner_image = $4, address = $5, updated_at = now() RETURNING id, name, handle, logo_image, banner_image, address, created_at',
          [name, handle, logo_image, banner_image, address]
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
      const client = getBrandsDbClient()
      if (!client) return res.status(500).json({ message: 'Database unavailable' })
      try {
        await client.connect()
        if (isPatch) {
          const body = req.body || {}
          const name = (body.name || '').trim()
          const handle = (body.handle || '').trim()
          const logo_image = (body.logo_image || body.logo || '').trim()
          const banner_image = typeof body.banner_image === 'string' ? body.banner_image.trim() : undefined
          const address = (body.address || '').trim()
          const updates = []
          const params = []
          let n = 1
          if (name) { updates.push('name = $' + n); params.push(name); n++ }
          if (handle) { updates.push('handle = $' + n); params.push(handle); n++ }
          if (logo_image !== undefined) { updates.push('logo_image = $' + n); params.push(logo_image || null); n++ }
          if (banner_image !== undefined) { updates.push('banner_image = $' + n); params.push(banner_image || null); n++ }
          if (address !== undefined) { updates.push('address = $' + n); params.push(address || null); n++ }
          if (updates.length === 0) {
            const r = await client.query('SELECT id, name, handle, logo_image, banner_image, address, created_at FROM admin_hub_brands WHERE id = $1', [id])
            await client.end()
            if (!r.rows || !r.rows[0]) return res.status(404).json({ message: 'Brand not found' })
            return res.json({ brand: r.rows[0] })
          }
          updates.push('updated_at = now()')
          params.push(id)
          const r = await client.query('UPDATE admin_hub_brands SET ' + updates.join(', ') + ' WHERE id = $' + n + ' RETURNING id, name, handle, logo_image, banner_image, address, created_at', params)
          await client.end()
          if (!r.rows || !r.rows[0]) return res.status(404).json({ message: 'Brand not found' })
          res.json({ brand: r.rows[0] })
        } else {
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
    httpApp.get('/admin-hub/brands', adminBrandsGET)
    httpApp.post('/admin-hub/brands', adminBrandsPOST)
    httpApp.patch('/admin-hub/brands/:id', (req, res) => adminBrandsPatchDelete(req, res, true))
    httpApp.delete('/admin-hub/brands/:id', (req, res) => adminBrandsPatchDelete(req, res, false))
    console.log('Admin route: GET/POST /admin-hub/brands, PATCH/DELETE /admin-hub/brands/:id')

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
          const r = await client.query('SELECT id, name, slug, location FROM admin_hub_menus ORDER BY name')
          return (r.rows || []).map((row) => ({ id: row.id, name: row.name, slug: row.slug, location: row.location || 'main' }))
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
          'INSERT INTO admin_hub_menus (name, slug, location) VALUES ($1, $2, $3) RETURNING id, name, slug, location',
          [b.name, b.slug, b.location || 'main']
        )
        return r.rows && r.rows[0] ? { id: r.rows[0].id, name: r.rows[0].name, slug: r.rows[0].slug, location: r.rows[0].location || 'main' } : null
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
        const r = await client.query('SELECT id, name, slug, location FROM admin_hub_menus WHERE id = $1', [req.params.id])
        return r.rows && r.rows[0] ? { id: r.rows[0].id, name: r.rows[0].name, slug: r.rows[0].slug, location: r.rows[0].location || 'main' } : null
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
        if (body.location !== undefined) { updates.push(`location = $${n++}`); vals.push(body.location) }
        if (updates.length === 0) {
          const r = await client.query('SELECT id, name, slug, location FROM admin_hub_menus WHERE id = $1', [req.params.id])
          return r.rows && r.rows[0] ? { id: r.rows[0].id, name: r.rows[0].name, slug: r.rows[0].slug, location: r.rows[0].location || 'main' } : null
        }
        vals.push(req.params.id)
        const r = await client.query(`UPDATE admin_hub_menus SET ${updates.join(', ')}, updated_at = now() WHERE id = $${n} RETURNING id, name, slug, location`, vals)
        return r.rows && r.rows[0] ? { id: r.rows[0].id, name: r.rows[0].name, slug: r.rows[0].slug, location: r.rows[0].location || 'main' } : null
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
          'SELECT id, menu_id, label, link_type, link_value, parent_id, sort_order FROM admin_hub_menu_items WHERE menu_id = $1 ORDER BY sort_order ASC, label ASC',
          [req.params.menuId]
        )
        return (r.rows || []).map((row) => ({
          id: row.id,
          menu_id: row.menu_id,
          label: row.label,
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
          'INSERT INTO admin_hub_menu_items (menu_id, label, link_type, link_value, parent_id, sort_order) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, menu_id, label, link_type, link_value, parent_id, sort_order',
          [menuId, b.label, b.link_type || 'url', b.link_value || null, b.parent_id || null, b.sort_order != null ? b.sort_order : 0]
        )
        const row = r.rows && r.rows[0]
        return row ? { id: row.id, menu_id: row.menu_id, label: row.label, link_type: row.link_type || 'url', link_value: row.link_value, parent_id: row.parent_id, sort_order: row.sort_order != null ? row.sort_order : 0 } : null
      })
      if (item) return res.status(201).json({ item })
      const svc = resolveMenuService()
      if (svc) {
        try {
          item = await svc.createMenuItem({
            menu_id: menuId,
            label: b.label,
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
        if (body.link_type !== undefined) { updates.push(`link_type = $${n++}`); vals.push(body.link_type) }
        if (body.link_value !== undefined) { updates.push(`link_value = $${n++}`); vals.push(body.link_value) }
        if (body.parent_id !== undefined) { updates.push(`parent_id = $${n++}`); vals.push(body.parent_id) }
        if (body.sort_order !== undefined) { updates.push(`sort_order = $${n++}`); vals.push(body.sort_order) }
        if (updates.length === 0) {
          const r = await client.query('SELECT id, menu_id, label, link_type, link_value, parent_id, sort_order FROM admin_hub_menu_items WHERE id = $1', [req.params.itemId])
          const row = r.rows && r.rows[0]
          return row ? { id: row.id, menu_id: row.menu_id, label: row.label, link_type: row.link_type || 'url', link_value: row.link_value, parent_id: row.parent_id, sort_order: row.sort_order != null ? row.sort_order : 0 } : null
        }
        vals.push(req.params.itemId)
        const r = await client.query(`UPDATE admin_hub_menu_items SET ${updates.join(', ')}, updated_at = now() WHERE id = $${n} RETURNING id, menu_id, label, link_type, link_value, parent_id, sort_order`, vals)
        const row = r.rows && r.rows[0]
        return row ? { id: row.id, menu_id: row.menu_id, label: row.label, link_type: row.link_type || 'url', link_value: row.link_value, parent_id: row.parent_id, sort_order: row.sort_order != null ? row.sort_order : 0 } : null
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
        const limit = Math.min(parseInt(query.limit, 10) || 100, 200)
        const offset = parseInt(query.offset, 10) || 0
        const sellerId = (query.seller_id || query.seller || '').trim()
        const status = (query.status || '').trim()
        const collectionId = (query.collection_id || '').toString().trim()
        let sql = 'SELECT id, title, handle, sku, description, status, seller_id, collection_id, price_cents, inventory, metadata, variants, created_at, updated_at FROM admin_hub_products'
        const params = []
        const where = []
        if (sellerId) { where.push('seller_id = $' + (params.length + 1)); params.push(sellerId) }
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
    const normalizeProductMetadata = (meta) => {
      if (!meta || typeof meta !== 'object') return meta
      const out = { ...meta }
      if (Array.isArray(out.bullet_points)) {
        out.bullet_points = out.bullet_points.map((b) => String(b || '').slice(0, BULLET_POINT_MAX_LEN))
      }
      return out
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
        const metadata = metaObj ? JSON.stringify(metaObj) : null
        const variants = body.variants && Array.isArray(body.variants) ? JSON.stringify(body.variants) : null
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
        const products = await listAdminHubProductsDb(req.query || {})
        res.json({ products, count: products.length })
      } catch (err) {
        console.error('Admin Hub products GET error:', err)
        res.status(500).json({ message: (err && err.message) || 'Internal server error' })
      }
    }
    const adminHubProductsPOST = async (req, res) => {
      try {
        const row = await createAdminHubProductDb(req.body || {})
        if (!row) {
          res.status(503).json({ message: 'Database not configured or insert failed' })
          return
        }
        res.status(201).json({ product: row })
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
        const product = await updateAdminHubProductDb(req.params.id, req.body || {})
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
    const sellerSettingsGET = async (req, res) => {
      try {
        const sellerId = (req.query.seller_id || 'default').toString().trim() || 'default'
        const client = getProductsDbClient()
        if (!client) return res.json({ store_name: '' })
        await client.connect()
        const r = await client.query('SELECT store_name, free_shipping_thresholds FROM admin_hub_seller_settings WHERE seller_id = $1', [sellerId])
        await client.end()
        const row = r.rows && r.rows[0]
        const store_name = row && row.store_name != null ? String(row.store_name) : ''
        let free_shipping_thresholds = (row && row.free_shipping_thresholds) || null
        if (free_shipping_thresholds && typeof free_shipping_thresholds === 'object') {
          free_shipping_thresholds = normalizeThresholdsObject(free_shipping_thresholds)
        }
        res.json({ store_name, free_shipping_thresholds })
      } catch (err) {
        console.error('sellerSettingsGET:', err)
        res.json({ store_name: '' })
      }
    }
    const sellerSettingsPATCH = async (req, res) => {
      try {
        const body = req.body || {}
        const store_name = (body.store_name != null ? String(body.store_name) : '').trim()
        const sellerId = (body.seller_id || req.query.seller_id || 'default').toString().trim() || 'default'
        let free_shipping_thresholds = (body.free_shipping_thresholds && typeof body.free_shipping_thresholds === 'object')
          ? body.free_shipping_thresholds : null
        if (free_shipping_thresholds) {
          free_shipping_thresholds = normalizeThresholdsObject(free_shipping_thresholds)
        }
        const client = getProductsDbClient()
        if (!client) return res.status(500).json({ message: 'Database unavailable' })
        await client.connect()
        const thresholdsJson = free_shipping_thresholds ? JSON.stringify(free_shipping_thresholds) : null
        console.log('[sellerSettingsPATCH] saving free_shipping_thresholds:', thresholdsJson)
        await client.query(
          `INSERT INTO admin_hub_seller_settings (seller_id, store_name, free_shipping_thresholds, updated_at) VALUES ($1, $2, $3::jsonb, now())
           ON CONFLICT (seller_id) DO UPDATE SET store_name = $2, free_shipping_thresholds = COALESCE($3::jsonb, admin_hub_seller_settings.free_shipping_thresholds), updated_at = now()`,
          [sellerId, store_name || null, thresholdsJson]
        )
        await client.end()
        console.log('[sellerSettingsPATCH] saved OK')
        res.json({ store_name: store_name || '', free_shipping_thresholds })
      } catch (err) {
        console.error('sellerSettingsPATCH:', err)
        res.status(500).json({ message: err && err.message })
      }
    }
    httpApp.get('/admin-hub/seller-settings', sellerSettingsGET)
    httpApp.patch('/admin-hub/seller-settings', sellerSettingsPATCH)
    console.log('Admin Hub routes: GET/PATCH /admin-hub/seller-settings')

    // Store API: public seller settings (store name) for "Sold by" on shop
    const storeSellerSettingsGET = async (req, res) => {
      try {
        const sellerId = (req.query.seller_id || 'default').toString().trim() || 'default'
        const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
        if (!dbUrl || !dbUrl.startsWith('postgres')) return res.json({ store_name: '', free_shipping_thresholds: null })
        const { Client } = require('pg')
        const client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        const r = await client.query('SELECT store_name, free_shipping_thresholds FROM admin_hub_seller_settings WHERE seller_id = $1', [sellerId])
        await client.end()
        const row = r.rows && r.rows[0]
        const store_name = row && row.store_name != null ? String(row.store_name) : ''
        let free_shipping_thresholds = (row && row.free_shipping_thresholds) || null
        if (free_shipping_thresholds && typeof free_shipping_thresholds === 'object') {
          free_shipping_thresholds = normalizeThresholdsObject(free_shipping_thresholds)
        }
        console.log('[storeSellerSettingsGET] free_shipping_thresholds:', JSON.stringify(free_shipping_thresholds))
        res.json({ store_name, free_shipping_thresholds })
      } catch (err) {
        console.error('[storeSellerSettingsGET] error:', err && err.message)
        res.json({ store_name: '', free_shipping_thresholds: null })
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
    const mapAdminHubToStoreProduct = (p) => {
      const meta = p.metadata && typeof p.metadata === 'object' ? p.metadata : {}
      const media = meta.media
      let rawMediaList = Array.isArray(media) ? media : (typeof media === 'string' && media ? [media] : [])
      if (rawMediaList.length === 0 && (meta.image_url || meta.image)) rawMediaList = [meta.image_url || meta.image]
      const thumb = resolveUploadUrl(rawMediaList[0] || null)
      const imagesResolved = rawMediaList.map((m) => resolveUploadUrl(typeof m === 'string' ? m : (m && m.url) || null)).filter(Boolean)
      const priceCents = p.price != null ? Math.round(Number(p.price) * 100) : 0
      const rawVariants = Array.isArray(p.variants) && p.variants.length > 0 ? p.variants : []
      const variationGroups = Array.isArray(meta.variation_groups) ? meta.variation_groups : null
      const variants = rawVariants.length > 0
        ? rawVariants.map((v, i) => {
            const vPriceCents = v.price_cents != null ? Number(v.price_cents) : (v.price != null ? Math.round(Number(v.price) * 100) : priceCents)
            const vCompareCents = v.compare_at_price_cents != null ? Number(v.compare_at_price_cents) : null
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
            const row = {
              id: p.id + '-v-' + i,
              product_id: p.id,
              title: v.title || (optionValues && optionValues.length > 0 ? optionValues.join(' / ') : v.value) || 'Option ' + (i + 1),
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
    const storeProductsFromAdminHubGET = async (req, res) => {
      try {
        const query = req.query || {}
        const searchQ = (query.q || '').toString().trim().toLowerCase()
        const limitForSearch = searchQ ? 8 : (parseInt(query.limit, 10) || 100)
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
        let list = await listAdminHubProductsDb({ ...queryWithId, limit: searchQ ? 200 : (query.limit || 100) })
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
        // Only published products visible in store
        list = list.filter((p) => (p.status || '').toLowerCase() === 'published')
        if (searchQ) {
          list = list.filter((p) => {
            const t = (p.title || '').toLowerCase()
            const d = (p.description || '').toLowerCase()
            const h = (p.handle || '').toLowerCase()
            return t.includes(searchQ) || d.includes(searchQ) || h.includes(searchQ)
          }).slice(0, limitForSearch)
        }
        const sellerIds = [...new Set(list.map((p) => (p.seller_id || 'default').toString().trim() || 'default').filter(Boolean))]
        const storeNamesBySeller = {}
        await Promise.all(sellerIds.map(async (id) => { storeNamesBySeller[id] = await getSellerStoreName(id) }))
        const brandIds = [...new Set(list.map((p) => (p.metadata && p.metadata.brand_id) || null).filter(Boolean))]
        const brandsById = {}
        await Promise.all(brandIds.map(async (bid) => { const b = await getBrandById(bid); if (b) brandsById[bid] = b }))
        const products = list.map((p) => {
          const mapped = mapAdminHubToStoreProduct(p)
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
          return mapped
        })
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
    const storeProductByIdFromAdminHubGET = async (req, res) => {
      try {
        const idOrHandle = (req.params.idOrHandle || req.params.id || '').toString().trim()
        if (!idOrHandle) {
          res.status(400).json({ message: 'Product id or handle required' })
          return
        }
        const product = await getAdminHubProductByIdOrHandleDb(idOrHandle)
        if (!product || (product.status || '').toLowerCase() !== 'published') {
          res.status(404).json({ message: 'Product not found' })
          return
        }
        if (product.collection_id) {
          const collection = await getAdminHubCollectionById(product.collection_id)
          if (collection) product.collection = collection
        }
        const mapped = mapAdminHubToStoreProduct(product)
        const existingSeller = (mapped.metadata && (mapped.metadata.seller_name || mapped.metadata.shop_name)) || ''
        if (!existingSeller && product.seller_id) {
          const storeName = await getSellerStoreName(product.seller_id)
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
        res.json({ product: mapped })
      } catch (err) {
        console.error('Store product by id GET (admin hub):', err)
        res.status(500).json({ message: (err && err.message) || 'Internal server error' })
      }
    }
    httpApp.get('/store/products', storeProductsFromAdminHubGET)
    httpApp.get('/store/products/:idOrHandle', storeProductByIdFromAdminHubGET)
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
        let list = await listAdminHubProductsDb({ limit: 200 })
        list = list.filter((p) => (p.status || '').toLowerCase() === 'published' && p.metadata && String(p.metadata.brand_id) === String(brand.id))
        const sellerIds = [...new Set(list.map((p) => (p.seller_id || 'default').toString().trim()).filter(Boolean))]
        const storeNamesBySeller = {}
        await Promise.all(sellerIds.map(async (id) => { storeNamesBySeller[id] = await getSellerStoreName(id) }))
        const products = list.map((p) => {
          const mapped = mapAdminHubToStoreProduct(p)
          const existingSeller = (mapped.metadata && (mapped.metadata.seller_name || mapped.metadata.shop_name)) || ''
          if (!existingSeller && p.seller_id && storeNamesBySeller[(p.seller_id || 'default').toString().trim()]) {
            const storeName = storeNamesBySeller[(p.seller_id || 'default').toString().trim()]
            mapped.metadata = { ...(mapped.metadata || {}), seller_name: storeName, shop_name: storeName }
          }
          mapped.metadata = { ...(mapped.metadata || {}), brand_name: brand.name, brand_logo: brand.logo_image || null, brand_handle: brand.handle || null }
          return mapped
        })
        res.json({ brand, products, count: products.length })
      } catch (e) {
        console.error('Store brands GET:', e)
        res.status(500).json({ message: (e && e.message) || 'Internal server error' })
      }
    })
    console.log('Store routes: GET /store/products, GET /store/products/:idOrHandle, GET /store/brands/:handle (from Admin Hub)')

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

    const discountCentsFromBonusPoints = (points) => {
      const blocks = Math.floor(Number(points || 0) / BONUS_POINTS_PER_EURO_DISCOUNT)
      return blocks * 100
    }

    const bonusPointsEarnedFromOrderPaidCents = (paidCents) =>
      Math.ceil(Number(paidCents || 0) / 100)

    const clampCartBonusRedemption = (requestedPoints, balance, subtotalCents) => {
      let p = Math.max(0, Math.min(Number(requestedPoints) || 0, Number(balance) || 0))
      p = Math.floor(p / BONUS_POINTS_PER_EURO_DISCOUNT) * BONUS_POINTS_PER_EURO_DISCOUNT
      if (subtotalCents < STRIPE_MIN_CHARGE_CENTS_EUR) return 0
      let disc = discountCentsFromBonusPoints(p)
      const maxDiscount = subtotalCents - STRIPE_MIN_CHARGE_CENTS_EUR
      if (disc > maxDiscount) {
        const maxBlocks = Math.floor(maxDiscount / 100)
        p = maxBlocks * BONUS_POINTS_PER_EURO_DISCOUNT
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
        'SELECT id, created_at, updated_at, COALESCE(bonus_points_reserved, 0) AS bonus_points_reserved FROM store_carts WHERE id = $1',
        [cartId],
      )
      const cartRow = cartRes.rows && cartRes.rows[0]
      if (!cartRow) return null
      const itemsRes = await client.query(
        `SELECT ci.id, ci.variant_id, ci.product_id, ci.quantity, ci.unit_price_cents, ci.title, ci.thumbnail, ci.product_handle,
         p.metadata->>'shipping_group_id' AS shipping_group_id,
         p.title AS product_title,
         p.metadata AS product_metadata
         FROM store_cart_items ci
         LEFT JOIN admin_hub_products p ON p.id::text = ci.product_id
         WHERE ci.cart_id = $1 ORDER BY ci.created_at`,
        [cartId]
      )
      const items = (itemsRes.rows || []).map((r) => {
        let pm = r.product_metadata
        if (pm != null && typeof pm === 'string') {
          try {
            pm = JSON.parse(pm)
          } catch (_) {
            pm = null
          }
        }
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
          product_metadata: pm && typeof pm === 'object' ? pm : null,
        }
      })
      return {
        id: cartRow.id,
        created_at: cartRow.created_at,
        updated_at: cartRow.updated_at,
        bonus_points_reserved: Number(cartRow.bonus_points_reserved || 0),
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
        await client.query('UPDATE store_carts SET bonus_points_reserved = $1, updated_at = now() WHERE id = $2', [
          reserved,
          cartId,
        ])
        const updated = await getCartWithItems(client, cartId)
        await client.end()
        res.json({
          cart: updated,
          bonus_discount_cents: discountCentsFromBonusPoints(reserved),
          bonus_points_reserved: reserved,
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
        const title = (product.title || 'Product') + (variantLabel ? ` (${variantLabel})` : '')
        const handle = product.handle || product.id
        const cartExists = await client.query('SELECT id FROM store_carts WHERE id = $1', [cartId])
        if (!cartExists.rows || !cartExists.rows[0]) { await client.end(); return res.status(404).json({ message: 'Cart not found' }) }
        const existing = await client.query('SELECT id, quantity FROM store_cart_items WHERE cart_id = $1 AND variant_id = $2', [cartId, variantId])
        if (existing.rows && existing.rows[0]) {
          const newQty = (existing.rows[0].quantity || 0) + quantity
          await client.query('UPDATE store_cart_items SET quantity = $1, updated_at = now() WHERE id = $2', [newQty, existing.rows[0].id])
        } else {
          await client.query(
            'INSERT INTO store_cart_items (cart_id, variant_id, product_id, quantity, unit_price_cents, title, thumbnail, product_handle) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
            [cartId, variantId, productId, quantity, unitPriceCents, title, thumb, handle]
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

      const secretKey = (process.env.STRIPE_SECRET_KEY || '').toString().trim()
      if (!secretKey) return res.status(503).json({ message: 'STRIPE_SECRET_KEY not configured' })

      const { Client } = require('pg')
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      if (!dbUrl || !dbUrl.startsWith('postgres')) return res.status(503).json({ message: 'Database not configured' })

      let client
      try {
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        const cart = await getCartWithItems(client, cartId)
        await client.end()
        if (!cart) return res.status(404).json({ message: 'Cart not found' })

        const items = Array.isArray(cart.items) ? cart.items : []
        if (!items.length) return res.status(400).json({ message: 'Cart is empty' })

        const subtotalCents = items.reduce((sum, it) => sum + (Number(it.unit_price_cents || 0) * Number(it.quantity || 1)), 0)
        const reservedPts = Number(cart.bonus_points_reserved || 0)
        const discountCents = discountCentsFromBonusPoints(reservedPts)
        const shippingCents = Math.max(0, Number(body.shipping_cents || 0))
        const payCents = Math.max(0, subtotalCents - discountCents + shippingCents)
        if (payCents <= 0) {
          return res.status(400).json({
            message:
              'Der Bestellbetrag ist 0 €. Vollständige Bezahlung nur mit Bonuspunkten ist derzeit nicht möglich — bitte Punkte reduzieren oder Artikel hinzufügen.',
          })
        }
        const stripe = new (require('stripe'))(secretKey)

        // PaymentElement uyumu için automatic_payment_methods kullanıyoruz
        const paymentIntent = await stripe.paymentIntents.create({
          amount: payCents,
          currency: 'eur',
          automatic_payment_methods: { enabled: true },
          metadata: {
            cart_id: cartId,
            subtotal_cents: String(subtotalCents),
            discount_cents: String(discountCents),
            bonus_points_redeemed: String(reservedPts),
          },
        })

        res.json({
          client_secret: paymentIntent.client_secret,
          payment_intent_id: paymentIntent.id,
          amount_cents: payCents,
          subtotal_cents: subtotalCents,
          shipping_cents: shippingCents,
          bonus_discount_cents: discountCents,
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
        'SELECT id, variant_id, product_id, quantity, unit_price_cents, title, thumbnail, product_handle FROM store_order_items WHERE order_id = $1 ORDER BY created_at',
        [orderId]
      )
      const items = (itemsRes.rows || []).map((r) => ({
        id: r.id,
        variant_id: r.variant_id,
        product_id: r.product_id,
        quantity: r.quantity,
        unit_price_cents: r.unit_price_cents,
        title: r.title,
        thumbnail: r.thumbnail,
        product_handle: r.product_handle,
      }))

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
        await client.end()
        res.json({
          customer: {
            ...row,
            customer_number: row.customer_number ? Number(row.customer_number) : null,
            bonus_points: Number(row.bonus_points || 0),
            addresses,
            wishlist_product_ids,
          },
        })
      } catch (e) {
        if (client) try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    // GET /store/reviews?product_id=... — public product reviews
    const storeReviewsGET = async (req, res) => {
      const productId = (req.query.product_id || '').trim()
      if (!productId) return res.json({ reviews: [] })
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        const r = await client.query(
          `SELECT r.id, r.product_id, r.rating, r.comment, r.customer_name, r.created_at,
                  COALESCE(c.first_name, '') as first_name, COALESCE(c.last_name, '') as last_name
           FROM store_product_reviews r
           LEFT JOIN store_customers c ON c.id = r.customer_id
           WHERE r.product_id = $1
           ORDER BY r.created_at DESC`,
          [productId]
        )
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
          `SELECT id FROM store_orders WHERE id = $1::uuid AND (customer_id = $2::uuid OR email = (SELECT email FROM store_customers WHERE id = $2::uuid))`,
          [order_id, payload.id]
        )
        if (!orderCheck.rows[0]) {
          await client.end()
          return res.status(403).json({ message: 'Order not found or access denied' })
        }
        const custR = await client.query('SELECT first_name, last_name FROM store_customers WHERE id = $1', [payload.id])
        const cust = custR.rows[0]
        const customer_name = cust ? [cust.first_name, cust.last_name].filter(Boolean).join(' ') || null : null
        const r = await client.query(
          `INSERT INTO store_product_reviews (order_id, product_id, customer_id, rating, comment, customer_name)
           VALUES ($1::uuid, $2, $3::uuid, $4, $5, $6)
           ON CONFLICT (order_id, product_id) DO UPDATE SET rating=$4, comment=$5, customer_name=$6, updated_at=now()
           RETURNING *`,
          [order_id, product_id, payload.id, ratingNum, comment?.trim() || null, customer_name]
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
        const groups = await client.query(`
          SELECT g.*, c.name AS carrier_name
          FROM store_shipping_groups g
          LEFT JOIN store_shipping_carriers c ON c.id = g.carrier_id
          ORDER BY g.created_at ASC
        `)
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
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        const r = await client.query(
          `INSERT INTO store_shipping_groups (name, carrier_id) VALUES ($1, $2) RETURNING *`,
          [name.trim(), carrier_id || null]
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
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
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
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
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
        const r = await client.query(
          `SELECT r.id, r.order_id, r.product_id, r.rating, r.comment, r.customer_name, r.created_at,
                  o.order_number,
                  p.title as product_title, p.handle as product_handle
           FROM store_product_reviews r
           LEFT JOIN store_orders o ON o.id = r.order_id
           LEFT JOIN admin_hub_products p ON p.id::text = r.product_id
           ORDER BY r.created_at DESC
           LIMIT 1000`
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
        const custId = payload.id ? String(payload.id).trim() : null
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
          [orderId, payload.email, payload.id || null],
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
        const discountCents = discountCentsFromBonusPoints(reservedPts)
        const totalCents = Math.max(0, subtotalCents - discountCents)
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

        // Get payment method from Stripe + verify paid amount matches cart (incl. bonus discount)
        const secretKey = (process.env.STRIPE_SECRET_KEY || '').toString().trim()
        let paymentMethod = 'card'
        let stripeInst = null
        if (secretKey) {
          try {
            stripeInst = new (require('stripe'))(secretKey)
            const pi = await stripeInst.paymentIntents.retrieve(paymentIntentId, { expand: ['payment_method'] })
            const paidCents = Number(pi.amount)
            if (paidCents !== totalCents) {
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
        } else if (totalCents > 0) {
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
             subtotal_cents, discount_cents, bonus_points_redeemed, total_cents, currency)
           VALUES ($1,$2,'paid',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,'eur')
           RETURNING id, order_number`,
          [cartId, paymentIntentId, sellerId, email, first_name, last_name, phone,
           address_line1, address_line2, city, postal_code, country,
           billing_address_line1, billing_address_line2, billing_city, billing_postal_code, billing_country, billingSame,
           paymentMethod, customerId, isGuest, newsletter_opted_in,
           subtotalCents, discountCents, bonusPointsRedeemed, totalCents]
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
          const earned = bonusPointsEarnedFromOrderPaidCents(totalCents)
          if (earned > 0) {
            await client.query(
              `UPDATE store_customers SET bonus_points = COALESCE(bonus_points, 0) + $1, updated_at = NOW() WHERE id = $2::uuid`,
              [earned, customerId],
            )
            try {
              await appendBonusLedger(client, {
                customerId,
                pointsDelta: earned,
                description: `Bestellung #${orderNumber} — Punkte aus Zahlungsbetrag (+${earned} Punkte)`,
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

    // Routes
    httpApp.post('/store/payment-intent', storePaymentIntentPOST)
    httpApp.post('/store/orders', storeOrdersPOST)
    httpApp.get('/store/orders/me', storeOrdersMeGET)
    httpApp.get('/store/orders/:id', storeOrdersGET)
    console.log('Store routes: POST /store/payment-intent, POST /store/orders, GET /store/orders/me, GET /store/orders/:id')

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
          if (!category) return res.status(404).json({ message: 'Category not found' })
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
        const menusRes = await client.query('SELECT id, name, slug, location FROM admin_hub_menus ORDER BY name')
        const menus = (menusRes.rows || []).map((r) => ({
          id: r.id,
          name: r.name,
          slug: r.slug,
          location: String(r.location || 'main').trim().toLowerCase() || 'main',
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
          if (location) menus = menus.filter((m) => (m.location || 'main') === location)
          menusWithItems = await Promise.all(
            menus.map(async (menu) => {
              const items = await svc.listMenuItems(menu.id).catch(() => [])
              return { ...menu, items: items || [] }
            })
          )
        } else {
          if (location) menusWithItems = menusWithItems.filter((m) => (m.location || 'main') === location)
        }
        res.json({ menus: menusWithItems, count: menusWithItems.length })
      } catch (err) {
        console.error('Store menus GET error:', err)
        res.status(500).json({ message: (err && err.message) || 'Internal server error' })
      }
    }
    httpApp.get('/store/menus', storeMenusGET)
    console.log('Store route: GET /store/menus')

    // --- Admin Hub Media (GET list, POST upload, GET :id, DELETE :id) ---
    const getDbClient = () => {
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      if (!dbUrl || !dbUrl.startsWith('postgres')) return null
      const { Client } = require('pg')
      const isRender = dbUrl.includes('render.com')
      return new Client({ connectionString: dbUrl, ssl: isRender ? { rejectUnauthorized: false } : false })
    }
    const multer = require('multer')
    const storage = useS3
      ? multer.memoryStorage()
      : multer.diskStorage({
          destination: (req, file, cb) => cb(null, uploadDir),
          filename: (req, file, cb) => {
            const safe = (file.originalname || 'file').replace(/[^a-zA-Z0-9._-]/g, '_')
            cb(null, `${Date.now()}-${safe}`)
          },
        })
    const upload = multer({ storage })

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
    const mediaUploadPOST = async (req, res) => {
      if (!req.file) return res.status(400).json({ message: 'No file uploaded' })
      const client = getDbClient()
      if (!client) return res.status(503).json({ message: 'Database not configured' })
      let fileUrl
      if (useS3 && req.file.buffer && process.env.S3_UPLOAD_BUCKET) {
        try {
          const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3')
          const bucket = process.env.S3_UPLOAD_BUCKET
          const region = process.env.S3_UPLOAD_REGION || 'eu-central-1'
          const key = `uploads/${Date.now()}-${(req.file.originalname || 'file').replace(/[^a-zA-Z0-9._-]/g, '_')}`
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
        fileUrl = `/uploads/${req.file.filename}`
      }
      const alt = (req.body && req.body.alt) || null
      const folderId = (req.body && req.body.folder_id) || null
      try {
        await client.connect()
        const r = await client.query(
          `INSERT INTO admin_hub_media (filename, url, mime_type, size, alt, folder_id) VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING id, filename, url, mime_type, size, alt, folder_id, created_at`,
          [req.file.originalname || req.file.filename, fileUrl, req.file.mimetype || null, req.file.size || 0, alt, folderId]
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
          'SELECT id, filename, url, mime_type, size, alt, created_at, updated_at FROM admin_hub_media WHERE id = $1',
          [req.params.id]
        )
        if (r.rows.length === 0) return res.status(404).json({ message: 'Media not found' })
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
        const r = await client.query('SELECT url FROM admin_hub_media WHERE id = $1', [req.params.id])
        if (r.rows.length === 0) return res.status(404).json({ message: 'Media not found' })
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
        await mediaFolderMigrClient.query(`ALTER TABLE admin_hub_media ADD COLUMN IF NOT EXISTS folder_id uuid REFERENCES admin_hub_media_folders(id) ON DELETE SET NULL`).catch(() => {})
        await mediaFolderMigrClient.query(`ALTER TABLE admin_hub_media ADD COLUMN IF NOT EXISTS source_url text`).catch(() => {}) // for URL-added images
        await mediaFolderMigrClient.end().catch(() => {})
      }).catch(() => {})
    }

    // Media folder CRUD
    const mediaFoldersGET = async (req, res) => {
      const client = getDbClient()
      if (!client) return res.json({ folders: [] })
      try {
        await client.connect()
        const r = await client.query('SELECT f.*, COUNT(m.id)::int AS media_count FROM admin_hub_media_folders f LEFT JOIN admin_hub_media m ON m.folder_id = f.id GROUP BY f.id ORDER BY f.name ASC')
        res.json({ folders: r.rows })
      } catch { res.json({ folders: [] }) } finally { await client.end().catch(() => {}) }
    }
    const mediaFoldersPOST = async (req, res) => {
      const { name } = req.body || {}
      if (!name) return res.status(400).json({ message: 'name required' })
      const client = getDbClient()
      if (!client) return res.status(503).json({ message: 'DB not configured' })
      try {
        await client.connect()
        const r = await client.query('INSERT INTO admin_hub_media_folders (name) VALUES ($1) RETURNING *', [name.trim()])
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
        const r = await client.query(
          `INSERT INTO admin_hub_media (filename, url, source_url, mime_type, size, alt, folder_id) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
          [name, url, url, null, 0, alt || null, folder_id || null]
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
        const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : ''
        const r = await client.query(
          `SELECT m.id, m.filename, m.url, m.source_url, m.mime_type, m.size, m.alt, m.folder_id, f.name AS folder_name, m.created_at FROM admin_hub_media m LEFT JOIN admin_hub_media_folders f ON f.id = m.folder_id ${whereClause} ORDER BY m.created_at DESC LIMIT $${params.length+1} OFFSET $${params.length+2}`,
          [...params, limit, offset]
        )
        const countRes = await client.query(`SELECT COUNT(*)::int AS c FROM admin_hub_media m ${whereClause}`, params)
        res.json({ media: r.rows, count: countRes.rows[0].c })
      } catch (err) {
        console.error('Media list error:', err)
        res.status(500).json({ message: (err && err.message) || 'Internal server error' })
      } finally {
        await client.end().catch(() => {})
      }
    }

    httpApp.get('/admin-hub/v1/media', mediaListWithFolderGET)
    httpApp.post('/admin-hub/v1/media', upload.single('file'), mediaUploadPOST)
    httpApp.get('/admin-hub/v1/media/folders', mediaFoldersGET)
    httpApp.post('/admin-hub/v1/media/folders', mediaFoldersPOST)
    httpApp.delete('/admin-hub/v1/media/folders/:id', mediaFolderDELETE)
    httpApp.get('/admin-hub/v1/media/:id', mediaByIdGET)
    httpApp.patch('/admin-hub/v1/media/:id', mediaPATCH)
    httpApp.post('/admin-hub/v1/media/add-url', mediaAddByUrlPOST)
    httpApp.delete('/admin-hub/v1/media/:id', mediaByIdDELETE)
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
        const { search = '', order_status = '', payment_status = '', delivery_status = '', sort = 'created_at_desc', limit = '50', offset = '0' } = req.query
        const conditions = []
        const params = []
        if (search) {
          params.push(`%${search}%`)
          conditions.push(`(o.email ILIKE $${params.length} OR o.first_name ILIKE $${params.length} OR o.last_name ILIKE $${params.length} OR CAST(o.order_number AS TEXT) ILIKE $${params.length})`)
        }
        if (order_status) { params.push(order_status); conditions.push(`o.order_status = $${params.length}`) }
        if (payment_status) { params.push(payment_status); conditions.push(`o.payment_status = $${params.length}`) }
        if (delivery_status) { params.push(delivery_status); conditions.push(`o.delivery_status = $${params.length}`) }
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
        let whereParts = []
        let params = []
        if (search) {
          params.push(`%${search}%`)
          whereParts.push(`(c.email ILIKE $${params.length} OR c.first_name ILIKE $${params.length} OR c.last_name ILIKE $${params.length})`)
          // Also search by customer_number if search looks numeric
          const numSearch = search.replace(/^#/, '').trim()
          if (/^\d+$/.test(numSearch)) {
            params.push(Number(numSearch))
            whereParts.push(`c.customer_number = $${params.length}`)
          }
        }
        const where = whereParts.length > 0 ? 'WHERE ' + whereParts.join(' OR ') : ''
        const q = `
          SELECT c.id, c.customer_number, c.email, c.first_name, c.last_name, c.phone, c.country,
                 c.account_type, c.created_at,
                 c.password_hash IS NOT NULL AS is_registered,
                 COALESCE(s.order_count,0) AS order_count,
                 COALESCE(s.total_spent,0) AS total_spent,
                 s.first_order, s.last_order,
                 COALESCE(s.newsletter_opted_in, false) AS newsletter_opted_in
          FROM store_customers c
          LEFT JOIN (
            SELECT email, COUNT(*) AS order_count, SUM(total_cents) AS total_spent,
                   MIN(created_at) AS first_order, MAX(created_at) AS last_order,
                   BOOL_OR(newsletter_opted_in) AS newsletter_opted_in
            FROM store_orders GROUP BY email
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
        const ordersR = await client.query(
          `SELECT id, order_number, order_status, payment_status, delivery_status,
                  total_cents, currency, newsletter_opted_in, created_at
           FROM store_orders WHERE LOWER(email) = LOWER($1) ORDER BY created_at DESC`,
          [row.email]
        )
        const orders = (ordersR.rows || []).map(r => ({ ...r, order_number: r.order_number ? Number(r.order_number) : null }))
        const newsletterOptedIn = orders.some(o => o.newsletter_opted_in)
        const discountsR = await client.query(
          `SELECT id, code, type, value, min_order_cents, max_uses, used_count, expires_at, notes, created_at
           FROM store_customer_discounts WHERE customer_id = $1 ORDER BY created_at DESC`,
          [id]
        )
        const discounts = discountsR.rows || []
        let bonus_ledger = []
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
        await client.end()
        res.json({
          customer: {
            ...row,
            customer_number: row.customer_number ? Number(row.customer_number) : null,
            is_registered: row.is_registered === true || row.is_registered === 't',
            newsletter_opted_in: newsletterOptedIn,
            bonus_points: Number(row.bonus_points || 0),
            birth_date: row.birth_date || null,
            orders,
            discounts,
            bonus_ledger,
          }
        })
      } catch (e) {
        if (client) try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    const adminHubCarriersGET = async (req, res) => {
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        const r = await client.query('SELECT * FROM store_shipping_carriers ORDER BY sort_order ASC, created_at ASC')
        await client.end()
        res.json({ carriers: r.rows || [] })
      } catch (e) {
        if (client) try { await client.end() } catch (_) {}
        res.json({ carriers: [] })
      }
    }

    const adminHubCarrierPOST = async (req, res) => {
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
        const { name, tracking_url_template, api_key, api_secret, is_active = true, sort_order = 0 } = req.body || {}
        if (!name) return res.status(400).json({ message: 'name required' })
        const r = await client.query(
          `INSERT INTO store_shipping_carriers (name, tracking_url_template, api_key, api_secret, is_active, sort_order)
           VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
          [name, tracking_url_template||null, api_key||null, api_secret||null, is_active, Number(sort_order||0)]
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
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
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
      let client
      try {
        const { Client } = require('pg')
        client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
        await client.connect()
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
        const r = await client.query(`SELECT r.*, o.order_number, o.email, o.first_name, o.last_name, o.total_cents, o.payment_method FROM store_returns r LEFT JOIN store_orders o ON o.id = r.order_id ORDER BY r.created_at DESC LIMIT 100`)
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
    httpApp.get('/admin-hub/v1/shipping-groups', adminHubShippingGroupsGET)
    httpApp.post('/admin-hub/v1/shipping-groups', adminHubShippingGroupPOST)
    httpApp.patch('/admin-hub/v1/shipping-groups/:id', adminHubShippingGroupPATCH)
    httpApp.delete('/admin-hub/v1/shipping-groups/:id', adminHubShippingGroupDELETE)
    httpApp.get('/store/shipping-groups', storeShippingGroupsGET)
    httpApp.get('/store/orders/:id/invoice', storeOrderInvoicePdfGET)
    httpApp.get('/store/orders/:id/return-retourenschein', storeOrderReturnRetourenscheinGET)
    httpApp.get('/store/orders/:id/return-etikett', storeOrderReturnEtikettGET)
    httpApp.get('/store/reviews/my', storeReviewsMyGET)
    httpApp.get('/store/reviews', storeReviewsGET)
    httpApp.post('/store/reviews', storeReviewsPOST)
    httpApp.get('/admin-hub/reviews', adminHubReviewsGET)

    httpApp.get('/admin-hub/v1/orders', adminHubOrdersGET)
    httpApp.post('/admin-hub/v1/orders', adminHubOrderPOST)
    httpApp.get('/admin-hub/v1/orders/:id/pdf/invoice', adminHubOrderPdfInvoiceGET)
    httpApp.get('/admin-hub/v1/orders/:id/pdf/lieferschein', adminHubOrderPdfLieferscheinGET)
    httpApp.get('/admin-hub/v1/orders/:id', adminHubOrderByIdGET)
    httpApp.patch('/admin-hub/v1/orders/:id', adminHubOrderPATCH)
    httpApp.delete('/admin-hub/v1/orders/:id', adminHubOrderDELETE)
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
        const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100)
        const offset = parseInt(req.query.offset, 10) || 0
        let q = 'SELECT id, title, slug, body, status, created_at, updated_at FROM admin_hub_pages WHERE 1=1'
        const params = []
        if (status) { params.push(status); q += ` AND status = $${params.length}` }
        q += ' ORDER BY updated_at DESC LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2)
        params.push(limit, offset)
        const r = await client.query(q, params)
        const countRes = await client.query(
          status ? 'SELECT COUNT(*)::int AS c FROM admin_hub_pages WHERE status = $1' : 'SELECT COUNT(*)::int AS c FROM admin_hub_pages',
          status ? [status] : []
        )
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
      try {
        await client.connect()
        const r = await client.query(
          `INSERT INTO admin_hub_pages (title, slug, body, status) VALUES ($1, $2, $3, $4)
           RETURNING id, title, slug, body, status, created_at, updated_at`,
          [title, slug, body, status]
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
          'SELECT id, title, slug, body, status, created_at, updated_at FROM admin_hub_pages WHERE id = $1',
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
      if (updates.length === 0) return res.status(400).json({ message: 'No fields to update' })
      updates.push(`updated_at = now()`)
      values.push(req.params.id)
      try {
        await client.connect()
        const r = await client.query(
          `UPDATE admin_hub_pages SET ${updates.join(', ')} WHERE id = $${i} RETURNING id, title, slug, body, status, created_at, updated_at`,
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
        const r = await client.query(
          'SELECT id, title, slug, body, updated_at FROM admin_hub_pages WHERE status = $1 ORDER BY updated_at DESC',
          ['published']
        )
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
          'SELECT id, title, slug, body, updated_at FROM admin_hub_pages WHERE slug = $1 AND status = $2',
          [req.params.slug, 'published']
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
        const [ordersR, returnsR, messagesR] = await Promise.all([
          client.query(`SELECT COUNT(*)::int AS c FROM store_orders WHERE created_at > $1`, [seenAt]),
          client.query(`SELECT COUNT(*)::int AS c FROM store_returns WHERE created_at > $1`, [seenAt]),
          client.query(`SELECT COUNT(*)::int AS c FROM store_messages WHERE created_at > $1 AND sender_type = 'customer' AND is_read_by_seller = false`, [seenAt]),
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
        let q = `SELECT m.*, o.order_number FROM store_messages m LEFT JOIN store_orders o ON o.id = m.order_id`
        const params = []
        if (orderId) { params.push(orderId); q += ` WHERE m.order_id = $1::uuid` }
        q += ' ORDER BY m.created_at DESC LIMIT 100'
        const r = await client.query(q, params)
        const unreadR = await client.query(`SELECT COUNT(*)::int AS c FROM store_messages WHERE sender_type = 'customer' AND is_read_by_seller = false`)
        await client.end()
        res.json({ messages: r.rows.map(row => ({ ...row, order_number: row.order_number ? Number(row.order_number) : null })), unread: unreadR.rows[0]?.c || 0 })
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
        const { order_id, body, subject } = req.body || {}
        if (!body) { await client.end(); return res.status(400).json({ message: 'body required' }) }
        // Get seller from_email
        const smtpR = await client.query(`SELECT from_email, from_name FROM store_smtp_settings WHERE seller_id = 'default' LIMIT 1`)
        const sellerEmail = smtpR.rows[0]?.from_email || ''
        // Get order's customer email
        let recipientEmail = null
        if (order_id) {
          const oR = await client.query(`SELECT email FROM store_orders WHERE id = $1::uuid`, [order_id])
          recipientEmail = oR.rows[0]?.email || null
        }
        const r = await client.query(
          `INSERT INTO store_messages (order_id, sender_type, sender_email, recipient_email, subject, body, is_read_by_seller, is_read_by_customer)
           VALUES ($1, 'seller', $2, $3, $4, $5, true, false) RETURNING *`,
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
        await client.query(`UPDATE store_messages SET is_read_by_seller = true WHERE id = $1::uuid`, [id])
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
    httpApp.patch('/admin-hub/v1/messages/:id/read', adminHubMessageMarkReadPATCH)
    httpApp.get('/store/messages', storeMessagesGET)
    httpApp.post('/store/messages', storeMessagesPOST)
    httpApp.get('/admin-hub/v1/smtp-settings', adminHubSmtpSettingsGET)
    httpApp.patch('/admin-hub/v1/smtp-settings', adminHubSmtpSettingsPATCH)
    httpApp.post('/admin-hub/v1/smtp-settings/test', adminHubSmtpSettingsTestPOST)

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