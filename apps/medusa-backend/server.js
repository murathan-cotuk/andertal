/**
 * Medusa v2 Backend Server
 * dotenv + MedusaAppLoader + app.load() + listen + graceful shutdown.
 * Render: Start Command = node server.js
 */

require('dotenv').config()
try {
  require('dotenv').config({ path: '.env.local' })
} catch (e) {}

// Runtime patch: @medusajs/medusa/link-modules — __dirname ve process.cwd()'den yukarı çık, her bulunan kopyaya uygula
const path = require('path')
const fs = require('fs')
const linkContent = "module.exports = require('@medusajs/link-modules')\n"

function collectMedusaDirs(startDir, maxDepth = 15) {
  const found = new Set()
  let dir = startDir
  let depth = 0
  while (dir && depth < maxDepth) {
    const medusaDir = path.join(dir, 'node_modules', '@medusajs', 'medusa')
    if (fs.existsSync(medusaDir)) found.add(medusaDir)
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
    depth++
  }
  return found
}

const allMedusaDirs = new Set([
  ...collectMedusaDirs(__dirname),
  ...collectMedusaDirs(process.cwd())
])

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
    // Read-only FS (e.g. Render): build-time patch may have already run
    console.warn('link-modules runtime patch skipped (read-only?):', medusaDir, e.message)
  }
}
// Build-time patch might have run; verify resolution before failing
if (!patchApplied) {
  try {
    require.resolve('@medusajs/medusa/link-modules')
    patchApplied = true
  } catch (_) {}
}
if (!patchApplied) {
  console.error('link-modules: @medusajs/medusa not found or unpatched. Render: Root Directory = empty, Build = npm install && node apps/medusa-backend/scripts/patch-link-modules.js, Start = node apps/medusa-backend/server.js')
  process.exit(1)
}

const { MedusaAppLoader, configLoader, pgConnectionLoader, container } = require('@medusajs/framework')
const { logger } = require('@medusajs/framework/logger')
const { asValue } = require('@medusajs/framework/awilix')
const { ContainerRegistrationKeys } = require('@medusajs/utils')

const PORT = process.env.PORT || 9000
const HOST = process.env.HOST || '0.0.0.0'

async function start() {
  try {
    console.log('\n🚀 Medusa v2 backend başlatılıyor...\n')
    await configLoader(path.resolve(__dirname), 'medusa-config')
    await pgConnectionLoader()
    if (!container.hasRegistration(ContainerRegistrationKeys.LOGGER)) {
      container.register(ContainerRegistrationKeys.LOGGER, asValue(logger))
    }
    const app = new MedusaAppLoader({
      cwd: path.resolve(__dirname),
    })
    let expressApp
    try {
      const result = await app.load()
      expressApp = result && result.app
    } catch (loadErr) {
      console.error('\n❌ app.load() failed:', loadErr.code || loadErr.name, loadErr.message)
      if (loadErr.stack) console.error(loadErr.stack)
      console.error('\n❌ MedusaAppLoader did not return Express app (e.g. link-modules failed)')
      process.exit(1)
    }
    if (!expressApp) {
      console.error('\n❌ MedusaAppLoader did not return Express app (e.g. link-modules failed)')
      process.exit(1)
    }
    expressApp.listen(PORT, HOST, () => {
      console.log(`\n✅ Medusa v2 backend başarıyla başlatıldı!`)
      console.log(`📍 Listening on ${HOST}:${PORT}\n`)
    })

    process.on('SIGTERM', () => {
      console.log('\nSIGTERM received, shutting down gracefully')
      expressApp.close(() => { process.exit(0) })
    })
    process.on('SIGINT', () => {
      console.log('\nSIGINT received, shutting down gracefully')
      expressApp.close(() => { process.exit(0) })
    })
  } catch (error) {
    console.error('\n❌ Medusa v2 başlatma hatası:', error.code || error.name, error.message)
    if (error.stack) console.error(error.stack)
    process.exit(1)
  }
}

start()