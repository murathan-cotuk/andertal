/**
 * Admin Hub API Test Script
 * 
 * Bu script Admin Hub API'nin DB'ye yazıp yazmadığını test eder
 * 
 * Kullanım:
 * node scripts/test-admin-hub-api.js
 */

require('dotenv').config()
try {
  require('dotenv').config({ path: '.env.local' })
} catch (e) {
  // .env.local yoksa sorun değil
}

const MEDUSA_BACKEND_URL = process.env.MEDUSA_BACKEND_URL || 'http://localhost:9000'
const { DataSource } = require('typeorm')
// TypeScript dosyalarını require edemeyiz, direkt SQL kullanacağız

const DATABASE_URL = process.env.DATABASE_URL || 'file:./medusa.db'
const DATABASE_TYPE = process.env.DATABASE_TYPE || (DATABASE_URL.startsWith('postgres') ? 'postgres' : 'sqlite')

async function testAdminHubAPI() {
  console.log('\n🧪 Admin Hub API Test Başlatılıyor...\n')
  console.log(`Backend URL: ${MEDUSA_BACKEND_URL}\n`)

  try {
    // 1. API'ye kategori ekle
    console.log('1️⃣  Kategori ekleniyor...')
    const createResponse = await fetch(`${MEDUSA_BACKEND_URL}/admin-hub/v1/categories`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Test Category',
        slug: 'test-category',
        description: 'Test category for API verification',
      }),
    })

    if (!createResponse.ok) {
      const error = await createResponse.json().catch(() => ({ message: createResponse.statusText }))
      throw new Error(`API Error: ${error.message || createResponse.status}`)
    }

    const createResult = await createResponse.json()
    const categoryId = createResult.category?.id

    if (!categoryId) {
      throw new Error('Category ID dönmedi')
    }

    console.log(`✅ Kategori oluşturuldu: ${categoryId}`)
    console.log(`   Name: ${createResult.category.name}`)
    console.log(`   Slug: ${createResult.category.slug}\n`)

    // 2. DB'de kontrol et
    console.log('2️⃣  Database\'de kontrol ediliyor...')
    
    const dataSource = new DataSource({
      type: DATABASE_TYPE,
      url: DATABASE_URL,
      synchronize: false,
      logging: false,
    })

    await dataSource.initialize()
    
    // Direkt SQL ile kontrol et
    const queryRunner = dataSource.createQueryRunner()
    const dbCategory = await queryRunner.query(
      'SELECT * FROM admin_hub_categories WHERE id = $1',
      [categoryId]
    )

    if (!dbCategory || dbCategory.length === 0) {
      console.log('❌ HATA: Kategori DB\'de bulunamadı!')
      console.log('   API başarılı ama DB\'ye yazılmamış.')
      console.log('   admin-hub-service save() / repository yanlış olabilir.\n')
      await queryRunner.release()
      await dataSource.destroy()
      process.exit(1)
    }

    const category = dbCategory[0]
    console.log('✅ Kategori DB\'de bulundu!')
    console.log(`   ID: ${category.id}`)
    console.log(`   Name: ${category.name}`)
    console.log(`   Slug: ${category.slug}\n`)

    // 3. Test kategoriyi sil
    console.log('3️⃣  Test kategoriyi temizliyorum...')
    await queryRunner.query('DELETE FROM admin_hub_categories WHERE id = $1', [categoryId])
    console.log('✅ Test kategori silindi\n')
    
    await queryRunner.release()

    await dataSource.destroy()

    console.log('🎉 TÜM TESTLER BAŞARILI!')
    console.log('   ✅ API çalışıyor')
    console.log('   ✅ DB\'ye yazıyor')
    console.log('   ✅ DB\'den okuyor\n')

  } catch (error) {
    console.error('❌ Test hatası:', error.message)
    if (error.stack) {
      console.error(error.stack)
    }
    process.exit(1)
  }
}

testAdminHubAPI()
