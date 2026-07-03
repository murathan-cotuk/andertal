'use strict'
const { Router } = require('express')
const { container } = require('@medusajs/framework')

const resolveMenuService = () => {
  try { return container.resolve('menuService') } catch { return null }
}

const getMenuDbClient = () => {
  const raw = process.env.DATABASE_URL || process.env.POSTGRES_URL || ''
  const dbUrl = raw.replace(/^postgresql:\/\//, 'postgres://')
  if (!dbUrl || !dbUrl.startsWith('postgres')) return null
  try {
    const { Client } = require('pg')
    return new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
  } catch (e) {
    console.warn('Menu DB: pg client create failed', e && e.message)
    return null
  }
}

const runWithMenuDb = async (fn) => {
  const client = getMenuDbClient()
  if (!client) return null
  try {
    await client.connect()
    return await fn(client)
  } catch (err) {
    console.warn('Menu DB fallback error:', err && err.message)
    return null
  } finally {
    try { await client.end() } catch (_) {}
  }
}

const normalizeLocation = (loc) =>
  (loc === null || loc === undefined) ? 'main' : String(loc).trim().toLowerCase()

// ── Menus ─────────────────────────────────────────────────────────────────────

const menusListGET = async (req, res) => {
  try {
    const menusFromDb = await runWithMenuDb(async (client) => {
      const r = await client.query('SELECT id, name, slug, location, categories_with_products FROM admin_hub_menus ORDER BY name')
      return (r.rows || []).map((row) => ({
        id: row.id,
        name: row.name,
        slug: row.slug,
        location: normalizeLocation(row.location),
        categories_with_products: Boolean(row.categories_with_products),
      }))
    })
    if (menusFromDb && Array.isArray(menusFromDb)) return res.status(200).json({ menus: menusFromDb, count: menusFromDb.length })
    const svc = resolveMenuService()
    if (svc) {
      try {
        const menus = await svc.listMenus()
        return res.status(200).json({ menus: menus || [], count: (menus || []).length })
      } catch (err) {
        console.error('Menus GET service error:', err && err.message)
      }
    }
  } catch (err) {
    console.warn('Menus GET error:', err && err.message)
  }
  return res.status(200).json({ menus: [], count: 0 })
}

const menusCreatePOST = async (req, res) => {
  const b = req.body || {}
  if (!b.name || !b.slug) return res.status(400).json({ message: 'name and slug required' })
  let menu = await runWithMenuDb(async (client) => {
    const r = await client.query(
      'INSERT INTO admin_hub_menus (name, slug, location, categories_with_products) VALUES ($1, $2, $3, $4) RETURNING id, name, slug, location, categories_with_products',
      [b.name, b.slug, b.location || 'main', Boolean(b.categories_with_products)]
    )
    return r.rows && r.rows[0]
      ? { id: r.rows[0].id, name: r.rows[0].name, slug: r.rows[0].slug, location: r.rows[0].location || 'main', categories_with_products: Boolean(r.rows[0].categories_with_products) }
      : null
  })
  if (menu) return res.status(201).json({ menu })
  const svc = resolveMenuService()
  if (svc) {
    try {
      menu = await svc.createMenu({ name: b.name, slug: b.slug, location: b.location })
      return res.status(201).json({ menu })
    } catch (err) {
      console.error('Menus POST error:', err)
      return res.status(500).json({ message: (err && err.message) || 'Internal server error' })
    }
  }
  console.warn('Menus create: DB and menuService both unavailable')
  return res.status(500).json({ message: 'Database unavailable. Check DATABASE_URL.' })
}

const menuByIdGET = async (req, res) => {
  let menu = await runWithMenuDb(async (client) => {
    const r = await client.query('SELECT id, name, slug, location, categories_with_products FROM admin_hub_menus WHERE id = $1', [req.params.id])
    const row = r.rows && r.rows[0]
    return row ? { id: row.id, name: row.name, slug: row.slug, location: normalizeLocation(row.location), categories_with_products: Boolean(row.categories_with_products) } : null
  })
  if (menu) return res.json({ menu })
  const svc = resolveMenuService()
  if (svc) {
    try {
      menu = await svc.getMenuById(req.params.id)
      if (menu) return res.json({ menu })
    } catch (err) {
      console.error('Menu GET error:', err)
      return res.status(500).json({ message: (err && err.message) || 'Internal server error' })
    }
  }
  return res.status(404).json({ message: 'Menu not found' })
}

const menuByIdPUT = async (req, res) => {
  const body = req.body || {}
  const menu = await runWithMenuDb(async (client) => {
    const updates = []
    const vals = []
    let n = 1
    if (body.name !== undefined) { updates.push(`name = $${n++}`); vals.push(body.name) }
    if (body.slug !== undefined) { updates.push(`slug = $${n++}`); vals.push(body.slug) }
    if (body.location !== undefined) { updates.push(`location = $${n++}`); vals.push((body.location === null || body.location === '') ? '' : body.location) }
    if (body.categories_with_products !== undefined) { updates.push(`categories_with_products = $${n++}`); vals.push(Boolean(body.categories_with_products)) }
    if (updates.length === 0) {
      const r = await client.query('SELECT id, name, slug, location, categories_with_products FROM admin_hub_menus WHERE id = $1', [req.params.id])
      return r.rows && r.rows[0]
        ? { id: r.rows[0].id, name: r.rows[0].name, slug: r.rows[0].slug, location: normalizeLocation(r.rows[0].location), categories_with_products: Boolean(r.rows[0].categories_with_products) }
        : null
    }
    vals.push(req.params.id)
    const r = await client.query(`UPDATE admin_hub_menus SET ${updates.join(', ')}, updated_at = now() WHERE id = $${n} RETURNING id, name, slug, location, categories_with_products`, vals)
    return r.rows && r.rows[0]
      ? { id: r.rows[0].id, name: r.rows[0].name, slug: r.rows[0].slug, location: normalizeLocation(r.rows[0].location), categories_with_products: Boolean(r.rows[0].categories_with_products) }
      : null
  })
  if (!menu) return res.status(404).json({ message: 'Menu not found' })
  return res.json({ menu })
}

const menuByIdDELETE = async (req, res) => {
  const svc = resolveMenuService()
  if (svc) {
    try {
      await svc.deleteMenu(req.params.id)
      return res.status(200).json({ deleted: true })
    } catch (err) {
      console.error('Menu DELETE error:', err)
      return res.status(500).json({ message: (err && err.message) || 'Internal server error' })
    }
  }
  const ok = await runWithMenuDb(async (client) => {
    const r = await client.query('DELETE FROM admin_hub_menus WHERE id = $1', [req.params.id])
    return (r.rowCount || 0) > 0
  })
  if (ok) return res.status(200).json({ deleted: true })
  return res.status(404).json({ message: 'Menu not found' })
}

// ── Menu Items ────────────────────────────────────────────────────────────────

const mapMenuItemRow = (row) => ({
  id: row.id,
  menu_id: row.menu_id,
  label: row.label,
  slug: row.slug,
  link_type: row.link_type || 'url',
  link_value: row.link_value,
  parent_id: row.parent_id,
  sort_order: row.sort_order != null ? row.sort_order : 0,
})

const menuItemsGET = async (req, res) => {
  const itemsFromDb = await runWithMenuDb(async (client) => {
    const r = await client.query(
      'SELECT id, menu_id, label, slug, link_type, link_value, parent_id, sort_order FROM admin_hub_menu_items WHERE menu_id = $1 ORDER BY sort_order ASC, label ASC',
      [req.params.menuId]
    )
    return (r.rows || []).map(mapMenuItemRow)
  })
  if (itemsFromDb) return res.json({ items: itemsFromDb, count: itemsFromDb.length })
  const svc = resolveMenuService()
  if (svc) {
    try {
      const items = await svc.listMenuItems(req.params.menuId)
      return res.json({ items: items || [], count: (items || []).length })
    } catch (err) {
      console.error('Menu items GET error:', err)
      return res.status(500).json({ message: (err && err.message) || 'Internal server error' })
    }
  }
  return res.json({ items: [], count: 0 })
}

const menuItemsPOST = async (req, res) => {
  const b = req.body || {}
  if (!b.label) return res.status(400).json({ message: 'label required' })
  const menuId = req.params.menuId
  let item = await runWithMenuDb(async (client) => {
    const r = await client.query(
      'INSERT INTO admin_hub_menu_items (menu_id, label, slug, link_type, link_value, parent_id, sort_order) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, menu_id, label, slug, link_type, link_value, parent_id, sort_order',
      [menuId, b.label, b.slug || null, b.link_type || 'url', b.link_value || null, b.parent_id || null, b.sort_order != null ? b.sort_order : 0]
    )
    return r.rows && r.rows[0] ? mapMenuItemRow(r.rows[0]) : null
  })
  if (item) return res.status(201).json({ item })
  const svc = resolveMenuService()
  if (svc) {
    try {
      item = await svc.createMenuItem({ menu_id: menuId, label: b.label, slug: b.slug || null, link_type: b.link_type || 'url', link_value: b.link_value || null, parent_id: b.parent_id || null, sort_order: b.sort_order || 0 })
      return res.status(201).json({ item })
    } catch (err) {
      console.error('Menu items POST error:', err)
      return res.status(500).json({ message: (err && err.message) || 'Internal server error' })
    }
  }
  return res.status(500).json({ message: 'Database unavailable. Check DATABASE_URL.' })
}

const menuItemByIdPUT = async (req, res) => {
  const body = req.body || {}
  const svc = resolveMenuService()
  if (svc) {
    try {
      const item = await svc.updateMenuItem(req.params.itemId, body)
      return res.json({ item })
    } catch (err) {
      console.error('Menu item PUT error:', err)
      return res.status(500).json({ message: (err && err.message) || 'Internal server error' })
    }
  }
  const item = await runWithMenuDb(async (client) => {
    const updates = []
    const vals = []
    let n = 1
    if (body.label !== undefined) { updates.push(`label = $${n++}`); vals.push(body.label) }
    if (body.slug !== undefined) { updates.push(`slug = $${n++}`); vals.push(body.slug) }
    if (body.link_type !== undefined) { updates.push(`link_type = $${n++}`); vals.push(body.link_type) }
    if (body.link_value !== undefined) { updates.push(`link_value = $${n++}`); vals.push(body.link_value) }
    if (body.parent_id !== undefined) { updates.push(`parent_id = $${n++}`); vals.push(body.parent_id) }
    if (body.sort_order !== undefined) { updates.push(`sort_order = $${n++}`); vals.push(body.sort_order) }
    if (updates.length === 0) {
      const r = await client.query('SELECT id, menu_id, label, slug, link_type, link_value, parent_id, sort_order FROM admin_hub_menu_items WHERE id = $1', [req.params.itemId])
      return r.rows && r.rows[0] ? mapMenuItemRow(r.rows[0]) : null
    }
    vals.push(req.params.itemId)
    const r = await client.query(`UPDATE admin_hub_menu_items SET ${updates.join(', ')}, updated_at = now() WHERE id = $${n} RETURNING id, menu_id, label, slug, link_type, link_value, parent_id, sort_order`, vals)
    return r.rows && r.rows[0] ? mapMenuItemRow(r.rows[0]) : null
  })
  if (!item) return res.status(404).json({ message: 'Menu item not found' })
  return res.json({ item })
}

const menuItemByIdDELETE = async (req, res) => {
  const svc = resolveMenuService()
  if (svc) {
    try {
      await svc.deleteMenuItem(req.params.itemId)
      return res.status(200).json({ deleted: true })
    } catch (err) {
      console.error('Menu item DELETE error:', err)
      return res.status(500).json({ message: (err && err.message) || 'Internal server error' })
    }
  }
  const ok = await runWithMenuDb(async (client) => {
    const r = await client.query('DELETE FROM admin_hub_menu_items WHERE id = $1', [req.params.itemId])
    return (r.rowCount || 0) > 0
  })
  if (ok) return res.status(200).json({ deleted: true })
  return res.status(404).json({ message: 'Menu item not found' })
}

// ── Menu Locations ────────────────────────────────────────────────────────────

const DEFAULT_LOCATIONS = [
  { id: 'main', slug: 'main', label: 'Main menu (dropdown)', html_id: null, sort_order: 0 },
  { id: 'second', slug: 'second', label: 'Second menu (navbar bar)', html_id: 'subnav', sort_order: 1 },
  { id: 'footer1', slug: 'footer1', label: 'Footer column 1', html_id: null, sort_order: 10 },
  { id: 'footer2', slug: 'footer2', label: 'Footer column 2', html_id: null, sort_order: 11 },
  { id: 'footer3', slug: 'footer3', label: 'Footer column 3', html_id: null, sort_order: 12 },
  { id: 'footer4', slug: 'footer4', label: 'Footer column 4', html_id: null, sort_order: 13 },
]

const menuLocationsGET = async (req, res) => {
  try {
    const list = await runWithMenuDb(async (client) => {
      const r = await client.query('SELECT id, slug, label, html_id, sort_order FROM admin_hub_menu_locations ORDER BY sort_order ASC, slug ASC')
      return (r.rows || []).map((row) => ({ id: row.id, slug: row.slug, label: row.label, html_id: row.html_id || null, sort_order: row.sort_order ?? 0 }))
    })
    res.json({ locations: (list && list.length > 0) ? list : DEFAULT_LOCATIONS })
  } catch (err) {
    console.error('Menu locations GET error:', err)
    res.status(500).json({ message: (err && err.message) || 'Internal server error' })
  }
}

// ── Router ────────────────────────────────────────────────────────────────────

module.exports = function createMenusRouter() {
  const router = Router()

  router.get('/admin-hub/menus', menusListGET)
  router.post('/admin-hub/menus', menusCreatePOST)
  router.get('/admin-hub/menus/:id', menuByIdGET)
  router.put('/admin-hub/menus/:id', menuByIdPUT)
  router.delete('/admin-hub/menus/:id', menuByIdDELETE)
  router.get('/admin-hub/menus/:menuId/items', menuItemsGET)
  router.post('/admin-hub/menus/:menuId/items', menuItemsPOST)
  router.put('/admin-hub/menus/:menuId/items/:itemId', menuItemByIdPUT)
  router.delete('/admin-hub/menus/:menuId/items/:itemId', menuItemByIdDELETE)
  router.get('/admin-hub/menu-locations', menuLocationsGET)
  router.get('/store/menu-locations', menuLocationsGET)

  return router
}

module.exports.resolveMenuService = resolveMenuService
