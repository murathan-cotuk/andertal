'use strict'
const path = require('path')
const { Router } = require('express')
const { container } = require('@medusajs/framework')
const { resolveAdminHub } = require('../categories-helpers')
const {
  isUuid,
  updateAdminHubCollectionDb,
  deleteAdminHubCollectionDb,
  getAdminHubCollectionByIdDb,
  getAdminHubCollectionByHandleDb,
} = require('../collections-db')

const slugifyTitle = (str) => {
  if (!str || typeof str !== 'string') return ''
  const map = { ü: 'u', Ü: 'u', ö: 'o', Ö: 'o', ı: 'i', I: 'i', İ: 'i', ç: 'c', Ç: 'c', ğ: 'g', Ğ: 'g', ä: 'ae', Ä: 'ae', ß: 'ss' }
  let s = str.trim()
  for (const [from, to] of Object.entries(map)) s = s.split(from).join(to)
  return s.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
}

const runHandler = (handler, req, res) => {
  Promise.resolve(handler(req, res)).catch((err) => {
    console.error('Route handler error:', err)
    res.status(500).json({ message: (err && err.message) || 'Internal server error' })
  })
}

// ── DB helpers ────────────────────────────────────────────────────────────────

const listAdminHubCollectionsDb = async () => {
  const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
  if (!dbUrl || !dbUrl.startsWith('postgres')) return []
  try {
    const { Client } = require('pg')
    const client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
    await client.connect()
    try {
      const res = await client.query('SELECT id, title, handle, metadata FROM admin_hub_collections ORDER BY title')
      return (res.rows || []).map((r) => {
        const meta = r.metadata && typeof r.metadata === 'object' ? r.metadata : {}
        return { id: r.id, title: r.title, handle: r.handle, image_url: meta.image_url || null, banner_image_url: meta.banner_image_url || null }
      })
    } finally { await client.end().catch(() => {}) }
  } catch (_) { return [] }
}

const createAdminHubCollectionDb = async (title, handle) => {
  const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
  if (!dbUrl || !dbUrl.startsWith('postgres')) return null
  try {
    const { Client } = require('pg')
    const client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
    await client.connect()
    try {
      const res = await client.query(
        'INSERT INTO admin_hub_collections (title, handle) VALUES ($1, $2) ON CONFLICT (handle) DO UPDATE SET title = $1 RETURNING id, title, handle',
        [title, handle]
      )
      return res.rows && res.rows[0] ? res.rows[0] : null
    } finally { await client.end().catch(() => {}) }
  } catch (e) {
    console.warn('createAdminHubCollectionDb:', e && e.message)
    return null
  }
}

// ── Admin Medusa Products Fallback ────────────────────────────────────────────

const adminProductsFallbackGET = async (req, res) => {
  try {
    const scope = req.scope || container
    const keys = ['productModuleService', 'product_service', 'productService']
    for (const k of keys) {
      try {
        const svc = scope.resolve(k)
        if (!svc) continue
        if (typeof svc.listAndCount === 'function') {
          const [products] = await svc.listAndCount({}, { take: 100, skip: 0 })
          const list = Array.isArray(products) ? products : (products?.data || [])
          return res.json({ products: list, count: list.length })
        }
        if (typeof svc.listAndCountProducts === 'function') {
          const [products] = await svc.listAndCountProducts({}, { take: 100, skip: 0 })
          const list = Array.isArray(products) ? products : (products?.data || [])
          return res.json({ products: list, count: list.length })
        }
      } catch (_) {}
    }
    return res.json({ products: [], count: 0 })
  } catch (err) {
    console.error('Admin products GET fallback error:', err)
    return res.json({ products: [], count: 0 })
  }
}

const adminOrdersGET = async (req, res) => {
  try {
    const scope = req.scope || container
    const keys = []
    try {
      const { Modules } = require('@medusajs/framework/utils')
      if (Modules && Modules.ORDER) keys.push(Modules.ORDER)
    } catch (_) {}
    keys.push('orderModuleService', 'order_service', 'orderService')
    for (const key of keys) {
      try {
        const orderService = scope.resolve(key)
        if (!orderService) continue
        const listAndCount = orderService.listAndCountOrders || orderService.listAndCount
        if (typeof listAndCount === 'function') {
          const [orders, count] = await listAndCount.call(orderService, {}, { take: 100, skip: 0 })
          const list = Array.isArray(orders) ? orders : (orders && orders.data ? orders.data : [])
          return res.json({ orders: list, count: typeof count === 'number' ? count : list.length })
        }
        const listFn = orderService.listOrders || orderService.list
        if (typeof listFn === 'function') {
          const orders = await listFn.call(orderService, {}, { take: 100, skip: 0 })
          const arr = Array.isArray(orders) ? orders : (orders && orders.data ? orders.data : [])
          return res.json({ orders: arr, count: arr.length })
        }
      } catch (_) {}
    }
    res.json({ orders: [], count: 0 })
  } catch (err) {
    console.error('Admin orders GET error:', err)
    res.status(500).json({ message: (err && err.message) || 'Internal server error' })
  }
}

// ── Collections ───────────────────────────────────────────────────────────────

const adminCollectionsGET = async (req, res) => {
  try {
    const scope = req.scope || container
    const medusaOnly = req.query.medusa_only === 'true' || req.query.medusa_only === '1'
    let list = []
    try {
      const svc = scope.resolve('productCollectionService')
      if (svc && typeof svc.list === 'function') {
        const raw = await svc.list({}, { take: 200 })
        list = Array.isArray(raw) ? raw : (raw?.data || [])
      }
    } catch (_) {}
    if (!medusaOnly) {
      const existingIds = new Set(list.map((c) => c.id))
      try {
        const standalone = await listAdminHubCollectionsDb()
        standalone.forEach((s) => {
          if (s && s.id && !existingIds.has(s.id)) { existingIds.add(s.id); list.push({ id: s.id, title: s.title, handle: s.handle, _standalone: true }) }
        })
      } catch (_) {}
      try {
        const adminHub = resolveAdminHub()
        if (adminHub) {
          const categories = await adminHub.listCategories({})
          const withCollection = (categories || []).filter((c) => c.has_collection === true)
          for (const c of withCollection) {
            if (!c || !c.id) continue
            const linkedId = c.metadata && typeof c.metadata === 'object' ? c.metadata.collection_id : null
            if (linkedId && !existingIds.has(linkedId)) {
              const coll = await getAdminHubCollectionByIdDb(linkedId)
              if (coll) { existingIds.add(coll.id); list.push({ id: coll.id, title: coll.title, handle: coll.handle }) }
            } else if (!linkedId && !existingIds.has(c.id)) {
              existingIds.add(c.id)
              list.push({ id: c.id, title: c.name, handle: c.slug, _fromCategory: true })
            }
          }
        }
      } catch (_) {}
    }
    res.json({ collections: list, count: list.length })
  } catch (err) {
    console.error('Admin collections GET error:', err)
    res.status(500).json({ message: (err && err.message) || 'Internal server error' })
  }
}

const adminCollectionsPOST = async (req, res) => {
  try {
    const scope = req.scope || container
    const b = req.body || {}
    const title = (b.title || '').trim()
    if (!title) return res.status(400).json({ message: 'title is required' })
    const handle = (b.handle || '').trim() || slugifyTitle(title)
    const standalone = b.standalone === true || b.standalone === 'true'
    const categoryId = (b.category_id || '').trim() || null
    if (standalone) {
      const row = await createAdminHubCollectionDb(title, handle)
      if (row) {
        if (categoryId) {
          try {
            const adminHub = resolveAdminHub()
            if (adminHub) {
              const cat = await adminHub.getCategoryById(categoryId)
              const prevMeta = cat && cat.metadata && typeof cat.metadata === 'object' ? { ...cat.metadata } : {}
              const collIdStr = row.id != null ? String(row.id).trim() : row.id
              await adminHub.updateCategory(categoryId, { has_collection: true, metadata: { ...prevMeta, collection_id: collIdStr } })
              await updateAdminHubCollectionDb(collIdStr, undefined, undefined, { linked_category_id: categoryId })
            }
          } catch (e) {
            console.warn('createAdminHubCollection link category:', e && e.message)
          }
        }
        const idForClient = row.id != null ? String(row.id).trim() : row.id
        return res.status(201).json({ collection: { id: idForClient, title: row.title, handle: row.handle } })
      }
      return res.status(500).json({ message: 'Failed to create standalone collection' })
    }
    let svc = null
    try { svc = scope.resolve('productCollectionService') } catch (_) {}
    if (!svc) try { svc = scope.resolve('productModuleService') } catch (_) {}
    if (svc) {
      let collection = null
      if (typeof svc.create === 'function') {
        collection = await svc.create({ title, handle })
      } else if (typeof svc.createProductCollections === 'function') {
        const created = await svc.createProductCollections([{ title, handle }])
        collection = Array.isArray(created) ? created[0] : created
      }
      if (collection) return res.status(201).json({ collection })
    }
    const adminHub = resolveAdminHub()
    if (!adminHub) {
      const row = await createAdminHubCollectionDb(title, handle)
      if (row) {
        const idForClient = row.id != null ? String(row.id).trim() : row.id
        return res.status(201).json({ collection: { id: idForClient, title: row.title, handle: row.handle } })
      }
      return res.status(503).json({ message: 'Collection service not available.', code: 'COLLECTION_SERVICE_UNAVAILABLE' })
    }
    const row = await createAdminHubCollectionDb(title, handle)
    if (!row) return res.status(500).json({ message: 'Failed to create collection' })
    const category = await adminHub.createCategory({ name: title, slug: handle, has_collection: true, active: true, is_visible: true })
    try { await adminHub.updateCategory(category.id, { has_collection: true, metadata: { collection_id: row.id } }) } catch (_) {}
    const idForClient = row.id != null ? String(row.id).trim() : row.id
    res.status(201).json({ collection: { id: idForClient, title: row.title, handle: row.handle } })
  } catch (err) {
    console.error('Admin collections POST error:', err)
    res.status(500).json({ message: (err && err.message) || 'Internal server error' })
  }
}

const adminCollectionByIdPATCH = async (req, res) => {
  try {
    let id = (req.params.id || '').toString().trim().replace(/^\{|\}$/g, '')
    if (!id) return res.status(400).json({ message: 'id is required' })
    const uuidLower = isUuid(id) ? id.toLowerCase() : id
    const b = req.body || {}
    const title = (b.title || '').trim()
    const handle = (b.handle || '').trim()
    const categoryId = (b.category_id || '').trim() || null
    const metadata = {}
    if (b.display_title !== undefined) metadata.display_title = b.display_title
    if (b.meta_title !== undefined) metadata.meta_title = b.meta_title
    if (b.meta_description !== undefined) metadata.meta_description = b.meta_description
    if (b.keywords !== undefined) metadata.keywords = b.keywords
    if (b.richtext !== undefined) metadata.richtext = b.richtext
    if (b.image_url !== undefined) metadata.image_url = b.image_url
    if (b.banner_image_url !== undefined) metadata.banner_image_url = b.banner_image_url
    if (b.banner_video_url !== undefined) metadata.banner_video_url = b.banner_video_url
    if (b.recommended_product_ids !== undefined) metadata.recommended_product_ids = Array.isArray(b.recommended_product_ids) ? b.recommended_product_ids : []
    const metaObj = Object.keys(metadata).length ? metadata : undefined
    let collectionId = id
    let updated = isUuid(id) ? await updateAdminHubCollectionDb(uuidLower, title || undefined, handle || undefined, metaObj) : null
    if (!updated && isUuid(id) && uuidLower !== id) updated = await updateAdminHubCollectionDb(id, title || undefined, handle || undefined, metaObj)
    if (!updated && !isUuid(id)) {
      const adminHub = resolveAdminHub()
      if (adminHub) {
        try {
          const category = await adminHub.getCategoryById(id)
          if (category && category.has_collection) {
            let linkedId = category.metadata && typeof category.metadata === 'object' ? category.metadata.collection_id : null
            if (linkedId) {
              updated = await updateAdminHubCollectionDb(linkedId, title || undefined, handle || undefined, metaObj)
              if (updated) collectionId = linkedId != null ? String(linkedId) : collectionId
            } else {
              const collTitle = title || category.name || ''
              const collHandle = handle || (category.slug || slugifyTitle(collTitle))
              const newRow = await createAdminHubCollectionDb(collTitle, collHandle)
              if (newRow) {
                try { await adminHub.updateCategory(category.id, { has_collection: true, metadata: { ...(category.metadata || {}), collection_id: newRow.id } }) } catch (_) {}
                updated = await updateAdminHubCollectionDb(newRow.id, collTitle || undefined, collHandle || undefined, metaObj)
                if (updated) collectionId = newRow.id != null ? String(newRow.id) : collectionId
              }
            }
          }
        } catch (_) {}
      }
      if (!updated && handle) {
        const byHandle = await getAdminHubCollectionByHandleDb(handle)
        if (byHandle) {
          updated = await updateAdminHubCollectionDb(byHandle.id, title || undefined, handle || undefined, metaObj)
          if (updated) collectionId = byHandle.id != null ? String(byHandle.id) : collectionId
        }
      }
    }
    if (!updated && isUuid(id)) {
      const existingById = await getAdminHubCollectionByIdDb(uuidLower)
      const existing = existingById || (id !== uuidLower ? await getAdminHubCollectionByIdDb(id) : null)
      if (existing && existing.id != null) {
        const dbId = String(existing.id).trim()
        updated = await updateAdminHubCollectionDb(dbId, title || undefined, handle || undefined, metaObj)
        if (updated) collectionId = dbId
      }
    }
    if (!updated && handle) {
      const byHandle = await getAdminHubCollectionByHandleDb(handle)
      if (byHandle) {
        updated = await updateAdminHubCollectionDb(byHandle.id, title || undefined, handle || undefined, metaObj)
        if (updated) collectionId = byHandle.id != null ? String(byHandle.id) : collectionId
      }
    }
    if (!updated) {
      const adminHub = resolveAdminHub()
      if (adminHub) {
        try {
          const category = await adminHub.getCategoryById(id)
          if (category && category.has_collection) {
            let linkedId = category.metadata && typeof category.metadata === 'object' ? category.metadata.collection_id : null
            if (linkedId) {
              updated = await updateAdminHubCollectionDb(linkedId, title || undefined, handle || undefined, metaObj)
              if (updated) collectionId = linkedId != null ? String(linkedId) : collectionId
            } else {
              const collTitle = title || category.name || ''
              const collHandle = handle || (category.slug || slugifyTitle(collTitle))
              const newRow = await createAdminHubCollectionDb(collTitle, collHandle)
              if (newRow) {
                try { await adminHub.updateCategory(category.id, { has_collection: true, metadata: { ...(category.metadata || {}), collection_id: newRow.id } }) } catch (_) {}
                updated = await updateAdminHubCollectionDb(newRow.id, collTitle || undefined, collHandle || undefined, metaObj)
                if (updated) collectionId = newRow.id != null ? String(newRow.id) : collectionId
              }
            }
          }
        } catch (_) {}
      }
    }
    if (!updated && title && handle) {
      const upserted = await createAdminHubCollectionDb(title, handle)
      if (upserted) {
        updated = await updateAdminHubCollectionDb(upserted.id, title, handle, metaObj) || upserted
        if (updated && updated.id) collectionId = String(updated.id)
      }
    }
    if (!updated) return res.status(404).json({ message: 'Collection not found (only standalone collections can be updated here)' })
    const collUuid = String((updated && updated.id) ? updated.id : collectionId).trim()
    const adminHubForLink = resolveAdminHub()
    const hadCategoryLink = b && Object.prototype.hasOwnProperty.call(b, 'category_id')
    if (adminHubForLink) {
      try {
        if (categoryId) {
          const rowBeforeLink = await getAdminHubCollectionByIdDb(collUuid)
          const previousCatId = rowBeforeLink && rowBeforeLink.category_id
          if (previousCatId && String(previousCatId) !== String(categoryId)) {
            try {
              const prevCat = await adminHubForLink.getCategoryById(previousCatId)
              const pm = prevCat && prevCat.metadata && typeof prevCat.metadata === 'object' ? { ...prevCat.metadata } : {}
              delete pm.collection_id
              await adminHubForLink.updateCategory(previousCatId, { has_collection: false, metadata: pm })
            } catch (_) {}
          }
          const cat = await adminHubForLink.getCategoryById(categoryId)
          const prevMeta = cat && cat.metadata && typeof cat.metadata === 'object' ? { ...cat.metadata } : {}
          await adminHubForLink.updateCategory(categoryId, { has_collection: true, metadata: { ...prevMeta, collection_id: collUuid } })
          await updateAdminHubCollectionDb(collUuid, undefined, undefined, { linked_category_id: categoryId })
        } else if (hadCategoryLink && (b.category_id === null || b.category_id === '')) {
          const rowBeforeUnlink = await getAdminHubCollectionByIdDb(collUuid)
          const oldCatId = rowBeforeUnlink && rowBeforeUnlink.category_id
          if (oldCatId) {
            try {
              const oldCat = await adminHubForLink.getCategoryById(oldCatId)
              const om = oldCat && oldCat.metadata && typeof oldCat.metadata === 'object' ? { ...oldCat.metadata } : {}
              delete om.collection_id
              await adminHubForLink.updateCategory(oldCatId, { has_collection: false, metadata: om })
            } catch (_) {}
          }
          await updateAdminHubCollectionDb(collUuid, undefined, undefined, { linked_category_id: null })
        }
      } catch (e) {
        console.warn('adminCollectionByIdPATCH category link:', e && e.message)
      }
    }
    const finalRow = await getAdminHubCollectionByIdDb(collUuid)
    if (finalRow) return res.json({ collection: { ...finalRow } })
    const meta = updated.metadata && typeof updated.metadata === 'object' ? updated.metadata : {}
    return res.json({
      collection: {
        id: collectionId, title: updated.title, handle: updated.handle,
        category_id: meta.linked_category_id || null, display_title: meta.display_title,
        meta_title: meta.meta_title, meta_description: meta.meta_description,
        keywords: meta.keywords, richtext: meta.richtext,
        image_url: meta.image_url, banner_image_url: meta.banner_image_url,
        recommended_product_ids: Array.isArray(meta.recommended_product_ids) ? meta.recommended_product_ids : [],
      },
    })
  } catch (err) {
    console.error('Admin collection PATCH error:', err)
    res.status(500).json({ message: (err && err.message) || 'Internal server error' })
  }
}

const adminCollectionByIdDELETE = async (req, res) => {
  try {
    const id = (req.params.id || '').toString().trim()
    if (!id) return res.status(400).json({ message: 'id is required' })
    const deleted = await deleteAdminHubCollectionDb(id)
    if (deleted) return res.status(200).json({ deleted: true })
    try {
      const adminHub = resolveAdminHub()
      if (adminHub) {
        const category = await adminHub.getCategoryById(id)
        if (category && category.has_collection) {
          const linkedId = category.metadata && typeof category.metadata === 'object' ? category.metadata.collection_id : null
          if (linkedId) await deleteAdminHubCollectionDb(linkedId)
          await adminHub.updateCategory(id, { has_collection: false, metadata: {} })
          return res.status(200).json({ deleted: true })
        }
      }
    } catch (_) {}
    return res.status(404).json({ message: 'Collection not found' })
  } catch (err) {
    console.error('Admin collection DELETE error:', err)
    res.status(500).json({ message: (err && err.message) || 'Internal server error' })
  }
}

const adminCollectionByIdGET = async (req, res) => {
  try {
    const id = (req.params.id || '').toString().trim().replace(/^\{|\}$/g, '')
    if (!id) return res.status(400).json({ message: 'id is required' })
    let row = await getAdminHubCollectionByIdDb(id)
    if (row) return res.json({ collection: { ...row } })
    const adminHub = resolveAdminHub()
    if (adminHub) {
      try {
        const category = await adminHub.getCategoryById(id)
        if (category && category.has_collection) {
          let linkedId = category.metadata && typeof category.metadata === 'object' ? category.metadata.collection_id : null
          if (linkedId) {
            row = await getAdminHubCollectionByIdDb(linkedId)
            if (row) return res.json({ collection: { ...row } })
          }
          const handle = (category.slug || category.name || '').trim() || slugifyTitle(category.name || '')
          const title = (category.name || '').trim() || handle
          const newRow = await createAdminHubCollectionDb(title, handle)
          if (newRow) {
            try { await adminHub.updateCategory(category.id, { has_collection: true, metadata: { ...(category.metadata || {}), collection_id: newRow.id } }) } catch (_) {}
            row = await getAdminHubCollectionByIdDb(newRow.id)
            if (row) return res.json({ collection: { ...row } })
          }
          return res.json({ collection: { id: category.id, title: category.name, handle: category.slug, display_title: category.name, _fromCategory: true } })
        }
      } catch (_) {}
    }
    return res.status(404).json({ message: 'Collection not found' })
  } catch (err) {
    console.error('Admin collection GET by id error:', err)
    res.status(500).json({ message: (err && err.message) || 'Internal server error' })
  }
}

// ── Router ────────────────────────────────────────────────────────────────────

module.exports = function createCollectionsRouter() {
  const router = Router()

  // Admin Medusa products/orders fallback
  let adminProducts = null
  try {
    adminProducts = require(path.join(__dirname, '..', '..', 'api', 'admin', 'products', 'route.ts'))
  } catch (e) {
    console.warn('Load admin/products route (ts):', e.message)
  }
  if (adminProducts && typeof adminProducts.GET === 'function') {
    router.get('/admin/products', (req, res) => runHandler(adminProducts.GET, req, res))
  } else {
    router.get('/admin/products', adminProductsFallbackGET)
  }
  if (adminProducts && typeof adminProducts.POST === 'function') {
    router.post('/admin/products', (req, res) => runHandler(adminProducts.POST, req, res))
  }
  try {
    const adminProductsId = require(path.join(__dirname, '..', '..', 'api', 'admin', 'products', '[id]', 'route.ts'))
    if (adminProductsId && typeof adminProductsId.GET === 'function') {
      router.get('/admin/products/:id', (req, res) => runHandler(adminProductsId.GET, req, res))
    }
  } catch (e) {
    console.warn('Load admin/products/[id] route:', e.message)
  }

  router.get('/admin/orders', (req, res) => adminOrdersGET(req, res))

  // Collections
  router.get('/admin/collections', (req, res) => adminCollectionsGET(req, res))
  router.post('/admin/collections', (req, res) => adminCollectionsPOST(req, res))
  router.get('/admin-hub/collections', (req, res) => adminCollectionsGET(req, res))
  router.get('/admin-hub/collections/:id', (req, res) => adminCollectionByIdGET(req, res))
  router.post('/admin-hub/collections', (req, res) => adminCollectionsPOST(req, res))
  router.patch('/admin-hub/collections/:id', (req, res) => adminCollectionByIdPATCH(req, res))
  router.delete('/admin-hub/collections/:id', (req, res) => adminCollectionByIdDELETE(req, res))

  return router
}
