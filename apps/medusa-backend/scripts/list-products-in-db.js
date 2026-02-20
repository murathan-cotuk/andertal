/**
 * Veritabanındaki Medusa v2 ürünlerini listeler.
 * Tablo: product (id, title, handle, status, created_at vb.)
 * Kullanım: node scripts/list-products-in-db.js
 * .env / .env.local veya DATABASE_URL ortam değişkeni.
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') })
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env.local') })

const url = process.env.DATABASE_URL
if (!url || !url.startsWith('postgres')) {
  console.error('Hata: DATABASE_URL gerekli.')
  console.error('Kullanım: DATABASE_URL="postgresql://..." node scripts/list-products-in-db.js')
  process.exit(1)
}

const { Client } = require('pg')
const client = new Client({
  connectionString: url,
  ssl: url.includes('render.com') ? { rejectUnauthorized: false } : undefined,
})

async function main() {
  await client.connect()

  try {
    // Medusa v2: product tablosu (snake_case kolonlar)
    const res = await client.query(`
      SELECT id, title, handle, status, created_at
      FROM product
      ORDER BY created_at DESC NULLS LAST
    `)
    if (res.rows.length === 0) {
      console.log('product tablosunda kayıt yok.')
      return
    }
    console.log('Medusa Ürünleri (product):\n')
    console.table(
      res.rows.map((r) => ({
        id: r.id ? String(r.id).slice(0, 8) + '...' : '-',
        title: (r.title || '').slice(0, 40),
        handle: (r.handle || '').slice(0, 24),
        status: r.status || '-',
        created_at: r.created_at,
      }))
    )
    console.log('Toplam:', res.rows.length, 'ürün')
  } catch (err) {
    if (err.code === '42P01') {
      console.error('Hata: product tablosu bulunamadı. Medusa migration çalıştırın: npm run db:migrate')
      console.error('Not: Medusa v2 link-modules ile product tablosu oluşturulur.')
    } else {
      console.error('Hata:', err.message)
    }
    process.exit(1)
  } finally {
    await client.end()
  }
}

main()
