'use strict'
const { Router } = require('express')

const pgDbClient = () => {
  const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
  const { Client } = require('pg')
  return new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
}

module.exports = function createProductGroupsRouter() {
  const router = Router()

  router.get('/admin-hub/v1/product-groups', async (req, res) => {
    const sellerId = req.sellerUser?.seller_id || null
    const isSuperuser = req.sellerUser?.is_superuser || false
    const c = pgDbClient(); try {
      await c.connect()
      const r = isSuperuser
        ? await c.query(`
            SELECT spg.*, su.store_name AS seller_store_name, su.email AS seller_email
            FROM seller_product_groups spg
            LEFT JOIN seller_users su ON su.seller_id = spg.seller_id
            ORDER BY COALESCE(su.store_name, su.email, spg.seller_id), spg.created_at DESC
          `)
        : await c.query(`SELECT * FROM seller_product_groups WHERE seller_id = $1 ORDER BY created_at DESC`, [sellerId])
      await c.end(); res.json({ groups: r.rows })
    } catch (e) { try { await c.end() } catch(_){} ; res.status(500).json({ message: e?.message }) }
  })

  router.post('/admin-hub/v1/product-groups', async (req, res) => {
    const sellerId = req.sellerUser?.seller_id || null
    if (!sellerId) return res.status(403).json({ message: 'Seller ID required' })
    const { name, description, product_ids, filter_rules } = req.body || {}
    if (!name?.trim()) return res.status(400).json({ message: 'name required' })
    const c = pgDbClient(); try {
      await c.connect()
      const r = await c.query(
        `INSERT INTO seller_product_groups (seller_id, name, description, product_ids, filter_rules) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
        [sellerId, name.trim(), description || '', JSON.stringify(Array.isArray(product_ids) ? product_ids : []), JSON.stringify(filter_rules || {})]
      )
      await c.end(); res.status(201).json({ group: r.rows[0] })
    } catch (e) { try { await c.end() } catch(_){} ; res.status(500).json({ message: e?.message }) }
  })

  router.get('/admin-hub/v1/product-groups/:id', async (req, res) => {
    const sellerId = req.sellerUser?.seller_id
    const isSuperuser = req.sellerUser?.is_superuser
    const c = pgDbClient(); try {
      await c.connect()
      const r = await c.query(`SELECT * FROM seller_product_groups WHERE id = $1`, [req.params.id])
      await c.end()
      const g = r.rows[0]
      if (!g) return res.status(404).json({ message: 'Not found' })
      if (!isSuperuser && g.seller_id !== sellerId) return res.status(403).json({ message: 'Forbidden' })
      res.json({ group: g })
    } catch (e) { try { await c.end() } catch(_){} ; res.status(500).json({ message: e?.message }) }
  })

  router.put('/admin-hub/v1/product-groups/:id', async (req, res) => {
    const sellerId = req.sellerUser?.seller_id
    const isSuperuser = req.sellerUser?.is_superuser
    const { name, description, product_ids, filter_rules } = req.body || {}
    const c = pgDbClient(); try {
      await c.connect()
      const exist = await c.query(`SELECT * FROM seller_product_groups WHERE id = $1`, [req.params.id])
      const g = exist.rows[0]
      if (!g) { await c.end(); return res.status(404).json({ message: 'Not found' }) }
      if (!isSuperuser && g.seller_id !== sellerId) { await c.end(); return res.status(403).json({ message: 'Forbidden' }) }
      const r = await c.query(
        `UPDATE seller_product_groups SET name=$1, description=$2, product_ids=$3, filter_rules=$4, updated_at=now() WHERE id=$5 RETURNING *`,
        [name?.trim() || g.name, description ?? g.description, JSON.stringify(Array.isArray(product_ids) ? product_ids : g.product_ids), JSON.stringify(filter_rules || g.filter_rules || {}), req.params.id]
      )
      await c.end(); res.json({ group: r.rows[0] })
    } catch (e) { try { await c.end() } catch(_){} ; res.status(500).json({ message: e?.message }) }
  })

  router.delete('/admin-hub/v1/product-groups/:id', async (req, res) => {
    const sellerId = req.sellerUser?.seller_id
    const isSuperuser = req.sellerUser?.is_superuser
    const c = pgDbClient(); try {
      await c.connect()
      const exist = await c.query(`SELECT * FROM seller_product_groups WHERE id = $1`, [req.params.id])
      const g = exist.rows[0]
      if (!g) { await c.end(); return res.status(404).json({ message: 'Not found' }) }
      if (!isSuperuser && g.seller_id !== sellerId) { await c.end(); return res.status(403).json({ message: 'Forbidden' }) }
      await c.query(`DELETE FROM seller_product_groups WHERE id=$1`, [req.params.id])
      await c.end(); res.json({ deleted: true })
    } catch (e) { try { await c.end() } catch(_){} ; res.status(500).json({ message: e?.message }) }
  })

  return router
}
