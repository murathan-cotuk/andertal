/**
 * Toplu Kategori Ekleme Script
 * 
 * Kullanım:
 * node scripts/add-categories.js
 * 
 * Kategorileri aşağıdaki CATEGORIES array'ine ekle
 */

require('dotenv').config()
try {
  require('dotenv').config({ path: '.env.local' })
} catch (e) {
  // .env.local yoksa sorun değil
}

const MEDUSA_BACKEND_URL = process.env.MEDUSA_BACKEND_URL || 'http://localhost:9000'

// ============================================
// KATEGORİLERİ BURAYA EKLE
// ============================================
// Bu dosyayı aç: apps/medusa-backend/scripts/add-categories.js
// Aşağıdaki CATEGORIES array'ine kategorilerini ekle
// Sonra: node scripts/add-categories.js
// ============================================
const CATEGORIES = [
  // ============================================
  // ÖRNEK: Ana Kategori + Subcategory
  // ============================================
  // 1. Önce ana kategoriyi ekle (parent_id: null veya parent_slug yok)
  {
    name: "Decorations",
    slug: "decorations",
    description: "Home decorations and accessories",
    parent_id: null, // Ana kategori
  },
  // 2. Sonra subcategory'yi ekle (parent_slug: ana kategorinin slug'ı)
  // Script otomatik olarak parent_slug'ı ID'ye çevirir
  {
    name: "Home Decor",
    slug: "home-decor",
    description: "Home decoration items",
    parent_slug: "decorations", // Ana kategorinin slug'ı (script otomatik ID'ye çevirir)
  },
  
  // ============================================
  // Daha fazla kategori ekle...
  // ============================================
  {
    name: "Electronics",
    slug: "electronics",
    description: "Electronic products and gadgets",
    parent_id: null, // Ana kategori
  },
  {
    name: "Clothing",
    slug: "clothing",
    description: "Clothing and apparel",
    parent_id: null, // Ana kategori
  },
  // Örnek: Electronics altında subcategory
  {
    name: "Smartphones",
    slug: "smartphones",
    description: "Smartphones and mobile devices",
    parent_slug: "electronics", // Electronics altında
  },
]

// ============================================
// SCRIPT KODU (DEĞİŞTİRME)
// ============================================

async function addCategories() {
  console.log('\n🚀 Toplu kategori ekleme başlatılıyor...\n')
  console.log(`📋 ${CATEGORIES.length} kategori eklenecek\n`)

  const results = []
  const errors = []
  const slugToIdMap = {} // Slug'dan ID'ye mapping (parent_id için)

  // İlk önce tüm ana kategorileri ekle (parent_id: null ve parent_slug yok)
  const mainCategories = CATEGORIES.filter(cat => !cat.parent_slug && !cat.parent_id)
  const subCategories = CATEGORIES.filter(cat => cat.parent_slug || cat.parent_id)

  console.log(`📌 ${mainCategories.length} ana kategori, ${subCategories.length} subcategory eklenecek\n`)

  // 1. Ana kategorileri ekle
  for (let i = 0; i < mainCategories.length; i++) {
    const category = mainCategories[i]
    const categoryNum = i + 1

    try {
      console.log(`[${categoryNum}/${mainCategories.length}] Ana kategori ekleniyor: ${category.name}...`)

      const response = await fetch(`${MEDUSA_BACKEND_URL}/admin-hub/v1/categories`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: category.name,
          slug: category.slug || category.name.toLowerCase().replace(/\s+/g, '-'),
          description: category.description || '',
          parent_id: null,
          active: true,
          sort_order: 0,
        }),
      })

      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: response.statusText }))
        throw new Error(error.message || `HTTP ${response.status}`)
      }

      const result = await response.json()
      const createdCategory = result.category
      results.push(createdCategory)
      slugToIdMap[createdCategory.slug] = createdCategory.id // Slug -> ID mapping
      console.log(`✅ ${category.name} eklendi (ID: ${createdCategory.id}, Slug: ${createdCategory.slug})`)

      // Rate limiting için kısa bekleme
      if (i < mainCategories.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 100))
      }
    } catch (error) {
      console.error(`❌ ${category.name} eklenemedi:`, error.message)
      errors.push({ category: category.name, error: error.message })
    }
  }

  // 2. Subcategory'leri ekle (parent_id ile)
  for (let i = 0; i < subCategories.length; i++) {
    const category = subCategories[i]
    const categoryNum = i + 1

    try {
      // parent_slug varsa, ID'ye çevir
      let parentId = category.parent_id || null
      if (category.parent_slug && slugToIdMap[category.parent_slug]) {
        parentId = slugToIdMap[category.parent_slug]
      } else if (category.parent_slug) {
        throw new Error(`Parent category '${category.parent_slug}' bulunamadı. Önce ana kategoriyi ekleyin.`)
      }

      console.log(`[${categoryNum}/${subCategories.length}] Subcategory ekleniyor: ${category.name} (Parent: ${category.parent_slug || 'N/A'})...`)

      const response = await fetch(`${MEDUSA_BACKEND_URL}/admin-hub/v1/categories`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: category.name,
          slug: category.slug || category.name.toLowerCase().replace(/\s+/g, '-'),
          description: category.description || '',
          parent_id: parentId,
          active: true,
          sort_order: 0,
        }),
      })

      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: response.statusText }))
        throw new Error(error.message || `HTTP ${response.status}`)
      }

      const result = await response.json()
      const createdCategory = result.category
      results.push(createdCategory)
      slugToIdMap[createdCategory.slug] = createdCategory.id
      console.log(`✅ ${category.name} eklendi (ID: ${createdCategory.id}, Parent ID: ${parentId || 'N/A'})`)

      // Rate limiting için kısa bekleme
      if (i < subCategories.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 100))
      }
    } catch (error) {
      console.error(`❌ ${category.name} eklenemedi:`, error.message)
      errors.push({ category: category.name, error: error.message })
    }
  }

  // Özet
  console.log('\n' + '='.repeat(50))
  console.log('📊 ÖZET')
  console.log('='.repeat(50))
  console.log(`✅ Başarılı: ${results.length}`)
  console.log(`❌ Hatalı: ${errors.length}`)
  console.log(`📋 Toplam: ${CATEGORIES.length}`)

  if (errors.length > 0) {
    console.log('\n❌ Hatalar:')
    errors.forEach(({ category, error }) => {
      console.log(`   - ${category}: ${error}`)
    })
  }

  if (results.length > 0) {
    console.log('\n✅ Eklenen kategoriler:')
    results.forEach((cat) => {
      const parentInfo = cat.parent_id ? ` (Parent ID: ${cat.parent_id})` : ' (Ana kategori)'
      console.log(`   - ${cat.name} (Slug: ${cat.slug})${parentInfo}`)
    })
  }

  console.log('\n')
}

// Script'i çalıştır
addCategories()
  .then(() => {
    console.log('✅ Script tamamlandı')
    process.exit(0)
  })
  .catch((error) => {
    console.error('❌ Script hatası:', error)
    process.exit(1)
  })
