'use strict'

const isUuid = (v) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(v || '').trim())

function _getDbUrl() {
  return (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
}

function _makeClient(dbUrl) {
  const { Client } = require('pg')
  return new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
}

const updateAdminHubCollectionDb = async (id, title, handle, metadata) => {
  const idStr = (id != null && id !== '') ? String(id).trim() : null
  if (!idStr) return null
  if (!isUuid(idStr)) return null
  const dbUrl = _getDbUrl()
  if (!dbUrl || !dbUrl.startsWith('postgres')) return null
  try {
    const client = _makeClient(dbUrl)
    await client.connect()
    const idParam = idStr.toLowerCase()
    let metaJson = null
    if (metadata != null && typeof metadata === 'object' && Object.keys(metadata).length > 0) {
      const existing = await client.query('SELECT metadata FROM admin_hub_collections WHERE id = $1::uuid', [idParam])
      const existingMeta = (existing.rows && existing.rows[0] && existing.rows[0].metadata) || {}
      const merged = { ...(typeof existingMeta === 'object' ? existingMeta : {}), ...metadata }
      metaJson = JSON.stringify(merged)
    }
    const res = await client.query(
      'UPDATE admin_hub_collections SET title = COALESCE(NULLIF($2, \'\'), title), handle = COALESCE(NULLIF($3, \'\'), handle), metadata = COALESCE($4, metadata), updated_at = now() WHERE id = $1::uuid RETURNING id, title, handle, metadata',
      [idParam, title || '', handle || '', metaJson]
    )
    await client.end()
    return res.rows && res.rows[0] ? res.rows[0] : null
  } catch (e) {
    console.warn('updateAdminHubCollectionDb:', e && e.message)
    return null
  }
}

const deleteAdminHubCollectionDb = async (id) => {
  const dbUrl = _getDbUrl()
  if (!dbUrl || !dbUrl.startsWith('postgres')) return false
  try {
    const client = _makeClient(dbUrl)
    await client.connect()
    try {
      const res = await client.query('DELETE FROM admin_hub_collections WHERE id = $1 RETURNING id', [id])
      return res.rowCount > 0
    } finally { await client.end().catch(() => {}) }
  } catch (e) {
    console.warn('deleteAdminHubCollectionDb:', e && e.message)
    return false
  }
}

const getAdminHubCollectionByIdDb = async (id) => {
  const idStr = (id != null && id !== '') ? String(id).trim() : null
  if (!idStr) return null
  const dbUrl = _getDbUrl()
  if (!dbUrl || !dbUrl.startsWith('postgres')) return null
  try {
    const client = _makeClient(dbUrl)
    await client.connect()
    const res = await client.query(
      isUuid(idStr)
        ? 'SELECT id, title, handle, metadata FROM admin_hub_collections WHERE id = $1::uuid'
        : 'SELECT id, title, handle, metadata FROM admin_hub_collections WHERE id::text = $1',
      [isUuid(idStr) ? idStr.toLowerCase() : idStr]
    )
    await client.end()
    const r = res.rows && res.rows[0]
    if (!r) return null
    const meta = r.metadata && typeof r.metadata === 'object' ? r.metadata : {}
    return {
      id: r.id,
      title: r.title,
      handle: r.handle,
      category_id: meta.linked_category_id != null && String(meta.linked_category_id).trim() !== '' ? String(meta.linked_category_id).trim() : null,
      display_title: meta.display_title,
      meta_title: meta.meta_title,
      meta_description: meta.meta_description,
      keywords: meta.keywords,
      richtext: meta.richtext,
      description_html: meta.richtext,
      image_url: meta.image_url,
      banner_image_url: meta.banner_image_url,
      recommended_product_ids: Array.isArray(meta.recommended_product_ids) ? meta.recommended_product_ids : [],
    }
  } catch (_) { return null }
}

const getAdminHubCollectionByHandleDb = async (handle) => {
  if (!handle || typeof handle !== 'string') return null
  const dbUrl = _getDbUrl()
  if (!dbUrl || !dbUrl.startsWith('postgres')) return null
  try {
    const client = _makeClient(dbUrl)
    await client.connect()
    try {
      const res = await client.query('SELECT id, title, handle, metadata FROM admin_hub_collections WHERE LOWER(handle) = LOWER($1)', [handle.trim()])
      return res.rows && res.rows[0] ? res.rows[0] : null
    } finally { await client.end().catch(() => {}) }
  } catch (_) { return null }
}

module.exports = {
  isUuid,
  updateAdminHubCollectionDb,
  deleteAdminHubCollectionDb,
  getAdminHubCollectionByIdDb,
  getAdminHubCollectionByHandleDb,
}
