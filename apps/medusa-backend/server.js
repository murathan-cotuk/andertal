/**
 * Medusa v2 Backend Server
 * 
 * GERÇEK Medusa v2 framework kullanıyor
 */

// Environment variables yükle (en üstte)
require('dotenv').config()
try {
  require('dotenv').config({ path: '.env.local' })
} catch (e) {
  // .env.local yoksa sorun değil
}

const { MedusaAppLoader } = require('@medusajs/framework')
const path = require('path')

const PORT = process.env.PORT || 9000
const HOST = process.env.HOST || '0.0.0.0'

async function start() {
  try {
    console.log('\n🚀 Medusa v2 backend başlatılıyor...\n')

    // Config ve PostgreSQL bağlantısını yükle (MedusaAppLoader'dan önce)
    try {
      // Medusa v2 config loader'ını dene
      let configLoader
      try {
        configLoader = require('@medusajs/framework/dist/config/loader').configLoader
      } catch (e1) {
        try {
          configLoader = require('@medusajs/framework/config/loader').configLoader
        } catch (e2) {
          // Config loader bulunamadı, MedusaAppLoader kendi yükler
          console.log('ℹ️  Config loader bulunamadı, MedusaAppLoader kendi yükleyecek')
        }
      }

      if (configLoader) {
        console.log('📋 Config yükleniyor...')
        await configLoader(path.resolve(__dirname), 'medusa-config')
        console.log('✅ Config yüklendi')
      }

      // PostgreSQL connection loader'ını dene
      let pgConnectionLoader
      try {
        pgConnectionLoader = require('@medusajs/framework/dist/database/pg-connection-loader').pgConnectionLoader
      } catch (e1) {
        try {
          pgConnectionLoader = require('@medusajs/framework/database/pg-connection-loader').pgConnectionLoader
        } catch (e2) {
          // PG connection loader bulunamadı, MedusaAppLoader kendi yükler
          console.log('ℹ️  PG connection loader bulunamadı, MedusaAppLoader kendi yükleyecek')
        }
      }

      if (pgConnectionLoader) {
        console.log('🗄️  PostgreSQL bağlantısı yükleniyor...')
        await pgConnectionLoader()
        console.log('✅ PostgreSQL bağlantısı yüklendi')
      }
    } catch (configError) {
      console.warn('⚠️  Config/PG loader hatası (MedusaAppLoader kendi yükleyecek):', configError.message)
    }

    // MedusaAppLoader'ı başlat
    const app = new MedusaAppLoader({
      directory: path.resolve(__dirname),
      // Alternatif: medusaConfigPath ve cwd kullanılabilir
      // medusaConfigPath: path.join(__dirname, 'medusa-config.js'),
      // cwd: __dirname,
    })

    const { app: expressApp, container } = await app.load()

    // RegionService'in register edildiğini kontrol et
    try {
      const regionService = container.resolve("regionService")
      console.log("✅ RegionService container'da mevcut")
    } catch (e) {
      console.warn("⚠️  RegionService container'da bulunamadı, loader çalıştırılıyor...")
      const regionServiceLoader = require("./loaders/region-service-loader").default
      await regionServiceLoader(container)
    }

    // AdminHubService'in register edildiğini kontrol et
    try {
      const adminHubService = container.resolve("adminHubService")
      console.log("✅ AdminHubService container'da mevcut")
    } catch (e) {
      console.warn("⚠️  AdminHubService container'da bulunamadı, loader çalıştırılıyor...")
      const adminHubServiceLoader = require("./loaders/admin-hub-service-loader").default
      await adminHubServiceLoader(container)
    }

    // Server'ı başlat
    expressApp.listen(PORT, HOST, () => {
      console.log(`\n✅ GERÇEK Medusa v2 backend başarıyla başlatıldı!`)
      console.log(`📍 Listening on ${HOST}:${PORT}`)
      console.log(`🌐 Health check: http://localhost:${PORT}/health`)
      console.log(`🛍️  Store API: http://localhost:${PORT}/store`)
      console.log(`⚙️  Admin API: http://localhost:${PORT}/admin`)
      console.log(`\n📝 Mode: GERÇEK Medusa v2 (Production-ready)`)
      console.log(`🗄️  Database: ${process.env.DATABASE_TYPE || 'PostgreSQL'}`)
      console.log(`\n✅ Sellercentral → Medusa ProductService → PostgreSQL → Shop app`)
      console.log(`🌍 Region/Market desteği aktif`)
      console.log(`\n📋 Custom Endpoints (Medusa v2 native):`)
      console.log(`   POST /admin/regions - Yeni region oluştur`)
      console.log(`   GET /admin/regions - Region'ları listele`)
      console.log(`   POST /admin/regions/:id/products - Ürünü region'a bağla`)
      console.log(`   DELETE /admin/regions/:id/products/:productId - Ürünü region'dan ayır`)
      console.log(`   GET /admin/product-categories - Kategorileri listele`)
      console.log(`   POST /admin/product-categories - Yeni kategori oluştur`)
      console.log(`   GET /store/products?region=DE - Medusa ProductService + RegionService filtre`)
      console.log(`\n🎯 Admin Hub Endpoints (Super Admin):`)
      console.log(`   GET /admin-hub/categories - Kategorileri listele`)
      console.log(`   POST /admin-hub/categories - Yeni kategori oluştur`)
      console.log(`   PUT /admin-hub/categories/:id - Kategori güncelle`)
      console.log(`   DELETE /admin-hub/categories/:id - Kategori sil`)
      console.log(`   GET /admin-hub/banners - Banner'ları listele`)
      console.log(`   POST /admin-hub/banners - Yeni banner oluştur`)
      console.log(`   PUT /admin-hub/banners/:id - Banner güncelle`)
      console.log(`   DELETE /admin-hub/banners/:id - Banner sil\n`)
    })

    // Graceful shutdown
    process.on('SIGTERM', () => {
      console.log('\nSIGTERM received, shutting down gracefully')
      expressApp.close(() => {
        console.log('Server closed')
        process.exit(0)
      })
    })

    process.on('SIGINT', () => {
      console.log('\nSIGINT received, shutting down gracefully')
      expressApp.close(() => {
        console.log('Server closed')
        process.exit(0)
      })
    })

  } catch (error) {
    console.error('\n❌ Medusa v2 başlatma hatası:')
    console.error(error)
    process.exit(1)
  }
}

start()
