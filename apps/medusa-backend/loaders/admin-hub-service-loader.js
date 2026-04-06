/**
 * Admin Hub Service Loader (JavaScript)
 * Render'da .ts require sorunlarını önlemek için JS; TypeORM + AdminHubService TS modüllerini require eder.
 * server.js bu dosyayı require eder (ts-node zaten yüklü).
 */

const path = require('path')
const { DataSource } = require('typeorm')

const DATABASE_URL = process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/medusa'
const isPostgres = DATABASE_URL.startsWith('postgres')
const isRender = DATABASE_URL.includes('render.com')

let adminHubDataSource = null

async function adminHubServiceLoader(container) {
  let manager
  try {
    // TS modülleri (server.js ts-node/register çağırdığı için require ile yüklenebilir)
    const AdminHubServiceModule = require(path.join(__dirname, '..', 'services', 'admin-hub-service.ts'))
    const AdminHubService = AdminHubServiceModule.default || AdminHubServiceModule
    const catMod = require(path.join(__dirname, '..', 'models', 'admin-hub-category.ts'))
    const banMod = require(path.join(__dirname, '..', 'models', 'admin-hub-banner.ts'))
    const menuMod = require(path.join(__dirname, '..', 'models', 'admin-hub-menu.ts'))
    const menuItemMod = require(path.join(__dirname, '..', 'models', 'admin-hub-menu-item.ts'))
    const brandMod = require(path.join(__dirname, '..', 'models', 'admin-hub-brand.ts'))
    const AdminHubCategory = catMod.AdminHubCategory || catMod.default || catMod
    const AdminHubBanner = banMod.AdminHubBanner || banMod.default || banMod
    const AdminHubMenu = menuMod.AdminHubMenu || menuMod.default || menuMod
    const AdminHubMenuItem = menuItemMod.AdminHubMenuItem || menuItemMod.default || menuItemMod
    const AdminHubBrand = brandMod.AdminHubBrand || brandMod.default || brandMod
    const entities = [AdminHubCategory, AdminHubBanner, AdminHubMenu, AdminHubMenuItem, AdminHubBrand].filter(Boolean)

    if (!AdminHubService) {
      throw new Error('AdminHubService could not be loaded from admin-hub-service.ts')
    }

    try {
      const medusaManager = container.resolve('manager')
      if (medusaManager && typeof medusaManager.getRepository === 'function') {
        manager = medusaManager
      } else {
        throw new Error('Medusa manager not TypeORM')
      }
    } catch (managerErr) {
      if (managerErr && managerErr.message) {
        console.warn('Admin Hub: Medusa manager not available:', managerErr.message)
      }
      const config = {
        type: isPostgres ? 'postgres' : 'sqlite',
        entities,
        synchronize: false,
        logging: false,
      }
      if (isPostgres) {
        config.url = DATABASE_URL
        if (isRender) {
          config.extra = { ssl: { rejectUnauthorized: false } }
        }
      } else {
        config.database = (DATABASE_URL || '').replace(/^file:/, '') || 'medusa.db'
      }
      adminHubDataSource = new DataSource(config)
      await adminHubDataSource.initialize()
      manager = adminHubDataSource.manager
      console.log('✅ Admin Hub: Kendi TypeORM DataSource kullanılıyor')
    }

    let productCollectionService
    try {
      productCollectionService = container.resolve('productCollectionService')
    } catch (e) {
      console.warn('⚠️  ProductCollectionService not available, collection sync will be disabled')
    }

    const MenuServiceModule = require(path.join(__dirname, '..', 'services', 'menu-service.ts'))
    const MenuService = MenuServiceModule.default || MenuServiceModule

    container.register({
      adminHubService: {
        resolve: () => {
          return new AdminHubService({
            manager,
            productCollectionService,
          })
        },
      },
      menuService: {
        resolve: () => new MenuService(manager),
      },
    })

    console.log('✅ AdminHubService container\'a register edildi')
    if (MenuService) console.log('✅ MenuService container\'a register edildi')
  } catch (err) {
    console.error('❌ adminHubServiceLoader failed:', err && err.message)
    if (err && err.stack) console.error(err.stack)
    if (err && err.message && err.message.includes('relation') && err.message.includes('does not exist')) {
      console.error('💡 Admin Hub tabloları yok. Migration çalıştır: node apps/medusa-backend/scripts/run-migrations.js')
    }
    throw err
  }
}

module.exports = adminHubServiceLoader
module.exports.default = adminHubServiceLoader
