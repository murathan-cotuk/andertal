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
      allowedHeaders: ['Content-Type', 'Authorization'],
    }))
    // Root ve health: "Cannot GET /" yerine JSON döner
    app.get('/', (req, res) => {
      res.json({ ok: true, service: 'medusa-backend', timestamp: new Date().toISOString() })
    })
    app.get('/health', (req, res) => {
      res.json({ status: 'ok', timestamp: new Date().toISOString() })
    })
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
    httpApp.get('/admin-hub/categories/:id', (req, res) => adminHubCategoryByIdGET(req, res))
    httpApp.put('/admin-hub/categories/:id', (req, res) => adminHubCategoryByIdPUT(req, res))
    httpApp.delete('/admin-hub/categories/:id', (req, res) => adminHubCategoryByIdDELETE(req, res))
    httpApp.get('/admin-hub/v1/categories', (req, res) => adminHubCategoriesGET(req, res))
    httpApp.post('/admin-hub/v1/categories', (req, res) => adminHubCategoriesPOST(req, res))
    httpApp.get('/admin-hub/v1/categories/:id', (req, res) => adminHubCategoryByIdGET(req, res))
    httpApp.put('/admin-hub/v1/categories/:id', (req, res) => adminHubCategoryByIdPUT(req, res))
    httpApp.delete('/admin-hub/v1/categories/:id', (req, res) => adminHubCategoryByIdDELETE(req, res))
    console.log('Admin Hub categories routes: GET/POST /admin-hub/categories ve /admin-hub/v1/categories (+ :id GET/PUT/DELETE)')

    // --- Ürünler: .ts route yükle (productService/productModuleService aşağıda düzeltildi) ---
    const runHandler = (handler, req, res) => {
      Promise.resolve(handler(req, res)).catch((err) => {
        console.error('Route handler error:', err)
        res.status(500).json({ message: (err && err.message) || 'Internal server error' })
      })
    }
    try {
      const adminProducts = require(path.join(__dirname, 'api', 'admin', 'products', 'route.ts'))
      httpApp.get('/admin/products', (req, res) => runHandler(adminProducts.GET, req, res))
      httpApp.post('/admin/products', (req, res) => runHandler(adminProducts.POST, req, res))
    } catch (e) {
      console.error('Load admin/products route:', e.message)
    }
    try {
      const adminProductsId = require(path.join(__dirname, 'api', 'admin', 'products', '[id]', 'route.ts'))
      httpApp.get('/admin/products/:id', (req, res) => runHandler(adminProductsId.GET, req, res))
    } catch (e) {
      console.error('Load admin/products/[id] route:', e.message)
    }
    try {
      const storeProducts = require(path.join(__dirname, 'api', 'store', 'products', 'route.ts'))
      httpApp.get('/store/products', (req, res) => runHandler(storeProducts.GET, req, res))
      console.log('Store route: GET /store/products')
    } catch (e) {
      console.error('Load store/products route:', e.message)
    }

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

    // GET /admin/collections – Medusa koleksiyon listesi (kategori formunda manuel bağlama için)
    const adminCollectionsGET = async (req, res) => {
      try {
        const scope = req.scope || container
        let list = []
        try {
          const svc = scope.resolve('productCollectionService')
          if (svc && typeof svc.list === 'function') {
            const raw = await svc.list({}, { take: 200 })
            list = Array.isArray(raw) ? raw : (raw?.data || [])
          }
        } catch (_) {}
        res.json({ collections: list, count: list.length })
      } catch (err) {
        console.error('Admin collections GET error:', err)
        res.status(500).json({ message: (err && err.message) || 'Internal server error' })
      }
    }
    httpApp.get('/admin/collections', (req, res) => adminCollectionsGET(req, res))
    console.log('Admin route: GET /admin/collections')

    // --- Admin Hub Menus ---
    const resolveMenuService = () => {
      try {
        return container.resolve('menuService')
      } catch (e) {
        return null
      }
    }
    const menusListGET = async (req, res) => {
      const svc = resolveMenuService()
      if (!svc) return res.status(503).json({ message: 'Menu service not available' })
      try {
        const menus = await svc.listMenus()
        res.json({ menus, count: menus.length })
      } catch (err) {
        console.error('Menus GET error:', err)
        res.status(500).json({ message: (err && err.message) || 'Internal server error' })
      }
    }
    const menusCreatePOST = async (req, res) => {
      const svc = resolveMenuService()
      if (!svc) return res.status(503).json({ message: 'Menu service not available' })
      try {
        const b = req.body || {}
        if (!b.name || !b.slug) return res.status(400).json({ message: 'name and slug required' })
        const menu = await svc.createMenu({ name: b.name, slug: b.slug, location: b.location })
        res.status(201).json({ menu })
      } catch (err) {
        console.error('Menus POST error:', err)
        res.status(500).json({ message: (err && err.message) || 'Internal server error' })
      }
    }
    const menuByIdGET = async (req, res) => {
      const svc = resolveMenuService()
      if (!svc) return res.status(503).json({ message: 'Menu service not available' })
      try {
        const menu = await svc.getMenuById(req.params.id)
        if (!menu) return res.status(404).json({ message: 'Menu not found' })
        res.json({ menu })
      } catch (err) {
        console.error('Menu GET error:', err)
        res.status(500).json({ message: (err && err.message) || 'Internal server error' })
      }
    }
    const menuByIdPUT = async (req, res) => {
      const svc = resolveMenuService()
      if (!svc) return res.status(503).json({ message: 'Menu service not available' })
      try {
        const menu = await svc.updateMenu(req.params.id, req.body || {})
        res.json({ menu })
      } catch (err) {
        console.error('Menu PUT error:', err)
        res.status(500).json({ message: (err && err.message) || 'Internal server error' })
      }
    }
    const menuByIdDELETE = async (req, res) => {
      const svc = resolveMenuService()
      if (!svc) return res.status(503).json({ message: 'Menu service not available' })
      try {
        await svc.deleteMenu(req.params.id)
        res.status(200).json({ deleted: true })
      } catch (err) {
        console.error('Menu DELETE error:', err)
        res.status(500).json({ message: (err && err.message) || 'Internal server error' })
      }
    }
    const menuItemsGET = async (req, res) => {
      const svc = resolveMenuService()
      if (!svc) return res.status(503).json({ message: 'Menu service not available' })
      try {
        const items = await svc.listMenuItems(req.params.menuId)
        res.json({ items, count: items.length })
      } catch (err) {
        console.error('Menu items GET error:', err)
        res.status(500).json({ message: (err && err.message) || 'Internal server error' })
      }
    }
    const menuItemsPOST = async (req, res) => {
      const svc = resolveMenuService()
      if (!svc) return res.status(503).json({ message: 'Menu service not available' })
      try {
        const b = req.body || {}
        const menuId = req.params.menuId
        if (!b.label) return res.status(400).json({ message: 'label required' })
        const item = await svc.createMenuItem({
          menu_id: menuId,
          label: b.label,
          link_type: b.link_type || 'url',
          link_value: b.link_value || null,
          parent_id: b.parent_id || null,
          sort_order: b.sort_order || 0,
        })
        res.status(201).json({ item })
      } catch (err) {
        console.error('Menu items POST error:', err)
        res.status(500).json({ message: (err && err.message) || 'Internal server error' })
      }
    }
    const menuItemByIdPUT = async (req, res) => {
      const svc = resolveMenuService()
      if (!svc) return res.status(503).json({ message: 'Menu service not available' })
      try {
        const item = await svc.updateMenuItem(req.params.itemId, req.body || {})
        res.json({ item })
      } catch (err) {
        console.error('Menu item PUT error:', err)
        res.status(500).json({ message: (err && err.message) || 'Internal server error' })
      }
    }
    const menuItemByIdDELETE = async (req, res) => {
      const svc = resolveMenuService()
      if (!svc) return res.status(503).json({ message: 'Menu service not available' })
      try {
        await svc.deleteMenuItem(req.params.itemId)
        res.status(200).json({ deleted: true })
      } catch (err) {
        console.error('Menu item DELETE error:', err)
        res.status(500).json({ message: (err && err.message) || 'Internal server error' })
      }
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
    console.log('Admin Hub routes: /admin-hub/menus (+ :id, :menuId/items, :itemId)')

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