'use strict'
const { Router } = require('express')
const { getPooledClient } = require('../db-pool')

const getDbClient = () => getPooledClient()

// Purely a Sellercentral organizational tool: lets a seller fold several of their OWN
// inventory rows into a collapsible folder on the Inventory page. Never a product, never
// sellable, never touches admin_hub_products/admin_hub_seller_listings, never shown on the
// shop — each seller only ever sees their own groups (see docs comment on InventoryPage.jsx).

const inventoryGroupsGET = async (req, res) => {
  const sellerId = String(req.sellerUser?.seller_id || '').trim()
  if (!sellerId) return res.status(403).json({ message: 'Forbidden' })
  const client = getDbClient()
  if (!client) return res.status(503).json({ message: 'Database not configured' })
  try {
    await client.connect()
    const r = await client.query(
      `SELECT id, name, sku, member_ids, collapsed, created_at, updated_at
       FROM admin_hub_inventory_groups WHERE seller_id = $1 ORDER BY created_at ASC`,
      [sellerId]
    )
    await client.end()
    res.json({ groups: r.rows || [] })
  } catch (e) {
    try { await client.end() } catch (_) {}
    console.error('inventory-groups GET:', e)
    res.status(500).json({ message: e?.message || 'Internal server error' })
  }
}

const inventoryGroupsPOST = async (req, res) => {
  const sellerId = String(req.sellerUser?.seller_id || '').trim()
  if (!sellerId) return res.status(403).json({ message: 'Forbidden' })
  const body = req.body || {}
  const name = String(body.name || '').trim()
  const sku = String(body.sku || '').trim()
  const memberIds = Array.isArray(body.member_ids) ? [...new Set(body.member_ids.map((x) => String(x || '').trim()).filter(Boolean))] : []
  if (!name) return res.status(400).json({ message: 'name is required' })
  if (memberIds.length < 2) return res.status(400).json({ message: 'Select at least 2 products to group' })
  const client = getDbClient()
  if (!client) return res.status(503).json({ message: 'Database not configured' })
  try {
    await client.connect()
    const r = await client.query(
      `INSERT INTO admin_hub_inventory_groups (seller_id, name, sku, member_ids, collapsed)
       VALUES ($1, $2, $3, $4::jsonb, true) RETURNING id, name, sku, member_ids, collapsed, created_at, updated_at`,
      [sellerId, name, sku || null, JSON.stringify(memberIds)]
    )
    await client.end()
    res.status(201).json({ group: r.rows[0] })
  } catch (e) {
    try { await client.end() } catch (_) {}
    console.error('inventory-groups POST:', e)
    res.status(500).json({ message: e?.message || 'Internal server error' })
  }
}

const inventoryGroupsPatch = async (req, res) => {
  const sellerId = String(req.sellerUser?.seller_id || '').trim()
  if (!sellerId) return res.status(403).json({ message: 'Forbidden' })
  const id = (req.params.id || '').trim()
  if (!id) return res.status(400).json({ message: 'id required' })
  const body = req.body || {}
  const client = getDbClient()
  if (!client) return res.status(503).json({ message: 'Database not configured' })
  try {
    await client.connect()
    const owned = await client.query('SELECT id FROM admin_hub_inventory_groups WHERE id = $1 AND seller_id = $2', [id, sellerId])
    if (!owned.rows[0]) { await client.end(); return res.status(404).json({ message: 'Group not found' }) }
    const sets = []
    const params = []
    if (body.name !== undefined) { params.push(String(body.name || '').trim()); sets.push(`name = $${params.length}`) }
    if (body.sku !== undefined) { params.push(String(body.sku || '').trim() || null); sets.push(`sku = $${params.length}`) }
    if (Array.isArray(body.member_ids)) {
      const memberIds = [...new Set(body.member_ids.map((x) => String(x || '').trim()).filter(Boolean))]
      params.push(JSON.stringify(memberIds)); sets.push(`member_ids = $${params.length}::jsonb`)
    }
    if (body.collapsed !== undefined) { params.push(!!body.collapsed); sets.push(`collapsed = $${params.length}`) }
    if (sets.length === 0) { await client.end(); return res.status(400).json({ message: 'Nothing to update' }) }
    sets.push('updated_at = now()')
    params.push(id)
    const r = await client.query(
      `UPDATE admin_hub_inventory_groups SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING id, name, sku, member_ids, collapsed, created_at, updated_at`,
      params
    )
    await client.end()
    res.json({ group: r.rows[0] })
  } catch (e) {
    try { await client.end() } catch (_) {}
    console.error('inventory-groups PATCH:', e)
    res.status(500).json({ message: e?.message || 'Internal server error' })
  }
}

const inventoryGroupsDelete = async (req, res) => {
  const sellerId = String(req.sellerUser?.seller_id || '').trim()
  if (!sellerId) return res.status(403).json({ message: 'Forbidden' })
  const id = (req.params.id || '').trim()
  if (!id) return res.status(400).json({ message: 'id required' })
  const client = getDbClient()
  if (!client) return res.status(503).json({ message: 'Database not configured' })
  try {
    await client.connect()
    const r = await client.query('DELETE FROM admin_hub_inventory_groups WHERE id = $1 AND seller_id = $2 RETURNING id', [id, sellerId])
    await client.end()
    if (!r.rows[0]) return res.status(404).json({ message: 'Group not found' })
    res.json({ deleted: true })
  } catch (e) {
    try { await client.end() } catch (_) {}
    console.error('inventory-groups DELETE:', e)
    res.status(500).json({ message: e?.message || 'Internal server error' })
  }
}

module.exports = function createInventoryGroupsRouter() {
  const router = Router()
  router.get('/admin-hub/inventory-groups', inventoryGroupsGET)
  router.post('/admin-hub/inventory-groups', inventoryGroupsPOST)
  router.patch('/admin-hub/inventory-groups/:id', inventoryGroupsPatch)
  router.delete('/admin-hub/inventory-groups/:id', inventoryGroupsDelete)
  return router
}
