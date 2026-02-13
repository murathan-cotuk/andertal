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