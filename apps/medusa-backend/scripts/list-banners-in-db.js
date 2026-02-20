/**
 * Veritabanındaki Admin Hub banner'larını listeler.
 * Tablo: admin_hub_banners
 * Kullanım: node scripts/list-banners-in-db.js
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') })
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env.local') })

const url = process.env.DATABASE_URL
if (!url || !url.startsWith('postgres')) {
  console.error('Hata: DATABASE_URL gerekli.')
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
    const res = await client.query(`
      SELECT id, title, position, active, sort_order, created_at
      FROM admin_hub_banners
      ORDER BY sort_order ASC, title ASC
    `)
    if (res.rows.length === 0) {
      console.log('admin_hub_banners tablosunda kayıt yok.')
      return
    }
    console.log('Admin Hub Banner\'lar (admin_hub_banners):\n')
    console.table(
      res.rows.map((r) => ({
        id: String(r.id).slice(0, 8) + '...',
        title: (r.title || '').slice(0, 36),
        position: r.position || 'home',
        active: r.active,
        sort_order: r.sort_order,
        created_at: r.created_at,
      }))
    )
    console.log('Toplam:', res.rows.length, 'banner')
  } catch (err) {
    if (err.code === '42P01') {
      console.error('Hata: admin_hub_banners tablosu bulunamadı.')
    } else {
      console.error('Hata:', err.message)
    }
    process.exit(1)
  } finally {
    await client.end()
  }
}

main()
