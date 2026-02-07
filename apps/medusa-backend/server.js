/**
 * Medusa v2 Backend Server (opsiyonel – local’de "npm run dev" / medusa develop önerilir)
 *
 * Render’da "medusa start" kullanılır; bu dosya production’da çalıştırılmaz.
 * Sadece dotenv + MedusaAppLoader + listen + graceful shutdown.
 */

require('dotenv').config()
try {
  require('dotenv').config({ path: '.env.local' })
} catch (e) {}

const { MedusaAppLoader } = require('@medusajs/framework')
const path = require('path')

const PORT = process.env.PORT || 9000
const HOST = process.env.HOST || '0.0.0.0'

async function start() {
  try {
    console.log('\n🚀 Medusa v2 backend başlatılıyor...\n')
    const app = new MedusaAppLoader({
      cwd: path.resolve(__dirname),
    })
    const { app: expressApp } = await app.load()

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
