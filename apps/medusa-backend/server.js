/**
 * Medusa v2 Backend Server
 * dotenv + MedusaAppLoader + app.load() + listen + graceful shutdown.
 * Render: Start Command = node server.js
 */

require('dotenv').config()
try {
  require('dotenv').config({ path: '.env.local' })
} catch (e) {}

// Runtime patch: @medusajs/medusa/link-modules yok; node_modules/@medusajs/medusa/link-modules.js oluştur (require öncesi)
const path = require('path')
const fs = require('fs')
const linkModulesContent = "module.exports = require('@medusajs/link-modules')\n"
let dir = __dirname
for (let d = 0; d < 10; d++) {
  const medusaDir = path.join(dir, 'node_modules', '@medusajs', 'medusa')
  if (fs.existsSync(medusaDir)) {
    const filePath = path.join(medusaDir, 'link-modules.js')
    try {
      fs.writeFileSync(filePath, linkModulesContent)
      break
    } catch (_) {}
  }
  const parent = path.dirname(dir)
  if (parent === dir) break
  dir = parent
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
    const { app: expressApp } = await app.load()
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
    console.error('\n❌ Medusa v2 başlatma hatası:', error)
    process.exit(1)
  }
}

start()