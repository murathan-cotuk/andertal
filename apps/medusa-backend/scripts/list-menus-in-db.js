/**
 * Veritabanındaki Admin Hub menülerini ve öğelerini listeler.
 * Tablolar: admin_hub_menus, admin_hub_menu_items
 * Kullanım: node scripts/list-menus-in-db.js
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
    const menusRes = await client.query(`
      SELECT id, name, slug, location, created_at
      FROM admin_hub_menus
      ORDER BY name
    `)
    if (menusRes.rows.length === 0) {
      console.log('admin_hub_menus tablosunda kayıt yok.')
      await client.end()
      return
    }
    console.log('Admin Hub Menüler (admin_hub_menus):\n')
    console.table(
      menusRes.rows.map((r) => ({
        id: String(r.id).slice(0, 8) + '...',
        name: r.name,
        slug: r.slug,
        location: r.location || 'main',
        created_at: r.created_at,
      }))
    )
    const itemsRes = await client.query(`
      SELECT id, menu_id, label, link_type, link_value, sort_order
      FROM admin_hub_menu_items
      ORDER BY menu_id, sort_order, label
    `)
    if (itemsRes.rows.length > 0) {
      console.log('\nAdmin Hub Menü Öğeleri (admin_hub_menu_items):\n')
      console.table(
        itemsRes.rows.map((r) => ({
          id: String(r.id).slice(0, 8) + '...',
          menu_id: String(r.menu_id).slice(0, 8) + '...',
          label: (r.label || '').slice(0, 30),
          link_type: r.link_type || 'url',
          link_value: (r.link_value || '-').slice(0, 40),
          sort_order: r.sort_order,
        }))
      )
    }
    console.log('\nToplam:', menusRes.rows.length, 'menü,', itemsRes.rows.length, 'öğe')
  } catch (err) {
    if (err.code === '42P01') {
      console.error('Hata: admin_hub_menus veya admin_hub_menu_items tablosu bulunamadı.')
    } else {
      console.error('Hata:', err.message)
    }
    process.exit(1)
  } finally {
    await client.end()
  }
}

main()
