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
            address text,
            created_at timestamp DEFAULT now(),
            updated_at timestamp DEFAULT now()
          );
        `)
        await client.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_hub_brands_handle ON admin_hub_brands(handle);')
        await client.query(`
          CREATE TABLE IF NOT EXISTS store_carts (
            id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
            created_at timestamp DEFAULT now(),
            updated_at timestamp DEFAULT now()
          );
        `)
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
    const updateAdminHubCollectionDb = async (id, title, handle, metadata) => {
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      if (!dbUrl || !dbUrl.startsWith('postgres')) return null
      try {
        const { Client } = require('pg')
        const isRender = dbUrl.includes('render.com')
        const client = new Client({ connectionString: dbUrl, ssl: isRender ? { rejectUnauthorized: false } : false })
        await client.connect()
        const metaJson = metadata != null && typeof metadata === 'object' ? JSON.stringify(metadata) : null
        const res = await client.query(
          'UPDATE admin_hub_collections SET title = COALESCE(NULLIF($2, \'\'), title), handle = COALESCE(NULLIF($3, \'\'), handle), metadata = COALESCE($4, metadata), updated_at = now() WHERE id = $1 RETURNING id, title, handle, metadata',
          [id, title || '', handle || '', metaJson]
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
      const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
      if (!dbUrl || !dbUrl.startsWith('postgres')) return null
      try {
        const { Client } = require('pg')
        const isRender = dbUrl.includes('render.com')
        const client = new Client({ connectionString: dbUrl, ssl: isRender ? { rejectUnauthorized: false } : false })
        await client.connect()
        const res = await client.query('SELECT id, title, handle, metadata FROM admin_hub_collections WHERE id = $1', [id])
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
        }
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
              withCollection.forEach(c => {
                if (c && c.id && !existingIds.has(c.id)) {
                  existingIds.add(c.id)
                  list.push({ id: c.id, title: c.name, handle: c.slug, _fromCategory: true })
                }
              })
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
            return res.status(201).json({ collection: { id: row.id, title: row.title, handle: row.handle } })
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
          if (row) return res.status(201).json({ collection: { id: row.id, title: row.title, handle: row.handle } })
          return res.status(503).json({
            message: 'Collection service not available. Run: node apps/medusa-backend/scripts/run-admin-hub-sql.js',
            code: 'COLLECTION_SERVICE_UNAVAILABLE'
          })
        }
        const category = await adminHub.createCategory({
          name: title,
          slug: handle,
          has_collection: true,
          active: true,
          is_visible: true
        })
        res.status(201).json({
          collection: { id: category.id, title: category.name, handle: category.slug, _fromCategory: true }
        })
      } catch (err) {
        console.error('Admin collections POST error:', err)
        res.status(500).json({ message: (err && err.message) || 'Internal server error' })
      }
    }
    httpApp.post('/admin/collections', (req, res) => adminCollectionsPOST(req, res))
    const adminCollectionByIdPATCH = async (req, res) => {
      try {
        const id = req.params.id
        if (!id) return res.status(400).json({ message: 'id is required' })
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
        let collectionId = id
        let updated = await updateAdminHubCollectionDb(id, title || undefined, handle || undefined, Object.keys(metadata).length ? metadata : undefined)
        if (!updated) {
          const adminHub = resolveAdminHub()
          if (adminHub) {
            try {
              const category = await adminHub.getCategoryById(id)
              const linkedId = category?.metadata && typeof category.metadata === 'object' ? category.metadata.collection_id : null
              if (linkedId) {
                updated = await updateAdminHubCollectionDb(linkedId, title || undefined, handle || undefined, Object.keys(metadata).length ? metadata : undefined)
                if (updated) collectionId = linkedId
              }
            } catch (_) {}
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
            id: id,
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
        const id = req.params.id
        if (!id) return res.status(400).json({ message: 'id is required' })
        const deleted = await deleteAdminHubCollectionDb(id)
        if (deleted) return res.status(200).json({ deleted: true })
        try {
          const adminHub = resolveAdminHub()
          if (adminHub) {
            await adminHub.updateCategory(id, { has_collection: false, metadata: {} })
            return res.status(200).json({ deleted: true, unlinked: true })
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
        const id = req.params.id
        if (!id) return res.status(400).json({ message: 'id is required' })
        let row = await getAdminHubCollectionByIdDb(id)
        if (row) return res.json({ collection: { ...row, _standalone: true } })
        const adminHub = resolveAdminHub()
        if (adminHub) {
          try {
            const category = await adminHub.getCategoryById(id)
            if (category && category.has_collection) {
              const linkedId = category.metadata && typeof category.metadata === 'object' ? category.metadata.collection_id : null
              if (linkedId) {
                row = await getAdminHubCollectionByIdDb(linkedId)
                if (row) return res.json({ collection: { ...row, id, title: row.title || category.name, handle: row.handle || category.slug, _fromCategory: true } })
              }
              return res.json({ collection: { id: category.id, title: category.name, handle: category.slug, _fromCategory: true } })
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
        const r = await client.query('SELECT id, name, handle, logo_image, address, created_at FROM admin_hub_brands ORDER BY name')
        await client.end()
        res.json({ brands: (r.rows || []).map((row) => ({ id: row.id, name: row.name, handle: row.handle, logo_image: row.logo_image || null, address: row.address || null, created_at: row.created_at })) })
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
      const address = (body.address || '').trim() || null
      const client = getBrandsDbClient()
      if (!client) return res.status(500).json({ message: 'Database unavailable' })
      try {
        await client.connect()
        const r = await client.query(
          'INSERT INTO admin_hub_brands (name, handle, logo_image, address) VALUES ($1, $2, $3, $4) ON CONFLICT (handle) DO UPDATE SET name = $1, logo_image = $3, address = $4, updated_at = now() RETURNING id, name, handle, logo_image, address, created_at',
          [name, handle, logo_image, address]
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
          const address = (body.address || '').trim()
          const updates = []
          const params = []
          let n = 1
          if (name) { updates.push('name = $' + n); params.push(name); n++ }
          if (handle) { updates.push('handle = $' + n); params.push(handle); n++ }
          if (logo_image !== undefined) { updates.push('logo_image = $' + n); params.push(logo_image || null); n++ }
          if (address !== undefined) { updates.push('address = $' + n); params.push(address || null); n++ }
          if (updates.length === 0) {
            const r = await client.query('SELECT id, name, handle, logo_image, address, created_at FROM admin_hub_brands WHERE id = $1', [id])
            await client.end()
            if (!r.rows || !r.rows[0]) return res.status(404).json({ message: 'Brand not found' })
            return res.json({ brand: r.rows[0] })
          }
          updates.push('updated_at = now()')
          params.push(id)
          const r = await client.query('UPDATE admin_hub_brands SET ' + updates.join(', ') + ' WHERE id = $' + n + ' RETURNING id, name, handle, logo_image, address, created_at', params)
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
        if (collectionId) { where.push('collection_id = $' + (params.length + 1)); params.push(collectionId) }
        if (where.length) sql += ' WHERE ' + where.join(' AND ')
        sql += ' ORDER BY created_at DESC LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2)
        params.push(limit, offset)
        const res = await client.query(sql, params)
        await client.end()
        return (res.rows || []).map((r) => ({
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
          metadata: r.metadata,
          variants: r.variants,
          created_at: r.created_at,
          updated_at: r.updated_at,
        }))
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
        const r = await client.query('SELECT store_name FROM admin_hub_seller_settings WHERE seller_id = $1', [sellerId])
        await client.end()
        const row = r.rows && r.rows[0]
        const store_name = row && row.store_name != null ? String(row.store_name) : ''
        res.json({ store_name })
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
        const client = getProductsDbClient()
        if (!client) return res.status(500).json({ message: 'Database unavailable' })
        await client.connect()
        await client.query(
          `INSERT INTO admin_hub_seller_settings (seller_id, store_name, updated_at) VALUES ($1, $2, now())
           ON CONFLICT (seller_id) DO UPDATE SET store_name = $2, updated_at = now()`,
          [sellerId, store_name || null]
        )
        await client.end()
        res.json({ store_name: store_name || '' })
      } catch (err) {
        console.error('sellerSettingsPATCH:', err)
        res.status(500).json({ message: err && err.message })
      }
    }
    httpApp.get('/admin-hub/seller-settings', sellerSettingsGET)
    httpApp.patch('/admin-hub/seller-settings', sellerSettingsPATCH)
    console.log('Admin Hub routes: GET/PATCH /admin-hub/seller-settings')

    const getBrandById = async (brandId) => {
      if (!brandId) return null
      const client = getBrandsDbClient()
      if (!client) return null
      try {
        await client.connect()
        const r = await client.query('SELECT id, name, handle, logo_image FROM admin_hub_brands WHERE id = $1', [brandId])
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
      const rawThumb = Array.isArray(media) && media[0] ? media[0] : (typeof media === 'string' && media ? media : null)
      const thumb = resolveUploadUrl(rawThumb)
      const priceCents = p.price != null ? Math.round(Number(p.price) * 100) : 0
      const rawVariants = Array.isArray(p.variants) && p.variants.length > 0 ? p.variants : []
      const variants = rawVariants.length > 0
        ? rawVariants.map((v, i) => {
            const vPriceCents = v.price_cents != null ? Number(v.price_cents) : (v.price != null ? Math.round(Number(v.price) * 100) : priceCents)
            const vCompareCents = v.compare_at_price_cents != null ? Number(v.compare_at_price_cents) : null
            return {
              id: p.id + '-v-' + i,
              product_id: p.id,
              title: v.title || v.value || 'Option ' + (i + 1),
              value: v.value,
              sku: v.sku || null,
              ean: v.ean || null,
              prices: [{ amount: vPriceCents, currency_code: 'eur' }],
              compare_at_price_cents: vCompareCents,
              inventory_quantity: v.inventory != null ? v.inventory : 0,
              image_url: v.image_url || v.image || null,
            }
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
        images: thumb ? [{ url: thumb, alt: p.title || '' }] : [],
        metadata: meta,
        variants,
      }
      if (p.collection) {
        out.collection = p.collection
      }
      return out
    }
    const storeProductsFromAdminHubGET = async (req, res) => {
      try {
        const query = req.query || {}
        const searchQ = (query.q || '').toString().trim().toLowerCase()
        const limitForSearch = searchQ ? 8 : (parseInt(query.limit, 10) || 100)
        let list = await listAdminHubProductsDb({ ...query, limit: searchQ ? 200 : (query.limit || 100) })
        const collectionId = (query.collection_id || '').toString().trim()
        if (collectionId) {
          list = list.filter((p) => (p.collection_id || '') === collectionId || (p.handle || '') === collectionId)
        }
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
            mapped.metadata = { ...(mapped.metadata || {}), brand_name: b.name, brand_logo: b.logo_image || null }
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
        if (!product) {
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
            mapped.metadata = { ...(mapped.metadata || {}), brand_name: brand.name, brand_logo: brand.logo_image || null }
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
    console.log('Store routes: GET /store/products, GET /store/products/:idOrHandle (from Admin Hub)')

    // --- Store Carts (session cart: create, get, add/update/remove line-items) ---
    const productIdFromVariantId = (variantId) => {
      if (!variantId || typeof variantId !== 'string') return null
      if (variantId.endsWith('-variant')) return variantId.slice(0, -'-variant'.length)
      const idx = variantId.indexOf('-v-')
      return idx > 0 ? variantId.slice(0, idx) : variantId
    }
    const getCartWithItems = async (client, cartId) => {
      const cartRes = await client.query('SELECT id, created_at, updated_at FROM store_carts WHERE id = $1', [cartId])
      const cartRow = cartRes.rows && cartRes.rows[0]
      if (!cartRow) return null
      const itemsRes = await client.query(
        'SELECT id, variant_id, product_id, quantity, unit_price_cents, title, thumbnail, product_handle FROM store_cart_items WHERE cart_id = $1 ORDER BY created_at',
        [cartId]
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
      return { id: cartRow.id, created_at: cartRow.created_at, updated_at: cartRow.updated_at, items }
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
        if (rawVariants.length && variantIndex >= 0 && rawVariants[variantIndex]) {
          const v = rawVariants[variantIndex]
          if (v.price_cents != null) unitPriceCents = Number(v.price_cents)
          else if (v.price != null) unitPriceCents = Math.round(Number(v.price) * 100)
        }
        const title = product.title || 'Product'
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
        const cart = await getCartWithItems(client, cartId)
        await client.end()
        res.json({ cart })
      } catch (err) {
        if (client) try { await client.end() } catch (_) {}
        console.error('Store cart line-item DELETE:', err)
        res.status(500).json({ message: (err && err.message) || 'Internal server error' })
      }
    }
    httpApp.post('/store/carts', storeCartsPOST)
    httpApp.get('/store/carts/:id', storeCartGET)
    httpApp.post('/store/carts/:id/line-items', storeCartLineItemsPOST)
    httpApp.patch('/store/carts/:id/line-items/:lineId', storeCartLineItemPATCH)
    httpApp.delete('/store/carts/:id/line-items/:lineId', storeCartLineItemDELETE)
    console.log('Store routes: POST/GET /store/carts, POST/PATCH/DELETE line-items')

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
          const r = await client.query('SELECT id, title, handle, metadata FROM admin_hub_collections WHERE LOWER(handle) = LOWER($1)', [handleQuery])
          const row = r.rows && r.rows[0]
          if (!row) {
            try { await client.end() } catch (_) {}
            return res.status(404).json({ message: 'Collection not found' })
          }
          const meta = row.metadata && typeof row.metadata === 'object' ? row.metadata : {}
          const collection = {
            id: row.id,
            title: row.title,
            handle: row.handle,
            display_title: meta.display_title || row.title,
            meta_title: meta.meta_title || null,
            meta_description: meta.meta_description || null,
            banner: resolveUploadUrl(meta.banner_image_url || meta.image_url || null),
            description: meta.richtext || meta.description_html || null,
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
            description: meta.richtext || meta.description_html || null,
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
          const cat = { id: category.id, name: category.name, slug: category.slug, title: category.name, handle: category.slug }
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
        for (const menu of menus) {
          const itemsRes = await client.query(
            'SELECT id, menu_id, label, link_type, link_value, parent_id, sort_order FROM admin_hub_menu_items WHERE menu_id = $1 ORDER BY sort_order ASC, label ASC',
            [menu.id]
          )
          const items = (itemsRes.rows || []).map((r) => ({
            id: r.id,
            menu_id: r.menu_id,
            label: r.label,
            link_type: r.link_type || 'url',
            link_value: r.link_value,
            parent_id: r.parent_id,
            sort_order: r.sort_order != null ? r.sort_order : 0,
          }))
          menusWithItems.push({ ...menu, items })
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
      try {
        await client.connect()
        const r = await client.query(
          `INSERT INTO admin_hub_media (filename, url, mime_type, size, alt) VALUES ($1, $2, $3, $4, $5)
           RETURNING id, filename, url, mime_type, size, alt, created_at`,
          [req.file.originalname || req.file.filename, fileUrl, req.file.mimetype || null, req.file.size || 0, alt]
        )
        const row = r.rows[0]
        res.status(201).json({ id: row.id, url: row.url, filename: row.filename, mime_type: row.mime_type, size: row.size, created_at: row.created_at })
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

    httpApp.get('/admin-hub/v1/media', mediaListGET)
    httpApp.post('/admin-hub/v1/media', upload.single('file'), mediaUploadPOST)
    httpApp.get('/admin-hub/v1/media/:id', mediaByIdGET)
    httpApp.delete('/admin-hub/v1/media/:id', mediaByIdDELETE)
    console.log('Admin Hub routes: GET/POST /admin-hub/v1/media, GET/DELETE /admin-hub/v1/media/:id')

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