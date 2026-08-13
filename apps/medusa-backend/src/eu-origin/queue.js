const { pickEuOriginFields } = require('./metadata')

async function ensureEuOriginPendingTable(dbQ) {
  await dbQ(`CREATE TABLE IF NOT EXISTS admin_hub_eu_origin_pending (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id uuid NOT NULL REFERENCES admin_hub_products(id) ON DELETE CASCADE,
    seller_id varchar(255),
    status varchar(50) NOT NULL DEFAULT 'pending',
    provider text,
    registry_id text,
    document_url text,
    country text,
    note text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
  )`).catch(() => {})
  await dbQ(`CREATE INDEX IF NOT EXISTS idx_eu_origin_pending_status ON admin_hub_eu_origin_pending(status)`).catch(() => {})
}

async function enqueueEuOriginPending(dbQ, { productId, sellerId, meta, note = null }) {
  const f = pickEuOriginFields(meta)
  if (!f.eu_origin_registry_id && !f.eu_origin_document_url && !f.eu_origin_country) return null
  await ensureEuOriginPendingTable(dbQ)
  const existing = await dbQ(
    `SELECT id FROM admin_hub_eu_origin_pending WHERE product_id = $1 AND status = 'pending' ORDER BY created_at DESC LIMIT 1`,
    [productId],
  ).catch(() => ({ rows: [] }))
  let row
  if (existing.rows[0]) {
    const u = await dbQ(
      `UPDATE admin_hub_eu_origin_pending
       SET seller_id = COALESCE($2, seller_id), provider = $3, registry_id = $4, document_url = $5,
           country = $6, note = COALESCE($7, note), updated_at = now()
       WHERE id = $1
       RETURNING *`,
      [
        existing.rows[0].id,
        sellerId || null,
        f.eu_origin_provider || 'stub',
        f.eu_origin_registry_id || null,
        f.eu_origin_document_url || null,
        f.eu_origin_country || null,
        note,
      ],
    )
    row = u.rows[0] || existing.rows[0]
  } else {
    const r = await dbQ(
      `INSERT INTO admin_hub_eu_origin_pending
        (product_id, seller_id, status, provider, registry_id, document_url, country, note, updated_at)
       VALUES ($1,$2,'pending',$3,$4,$5,$6,$7,now())
       RETURNING *`,
      [
        productId,
        sellerId || null,
        f.eu_origin_provider || 'stub',
        f.eu_origin_registry_id || null,
        f.eu_origin_document_url || null,
        f.eu_origin_country || null,
        note,
      ],
    )
    row = r.rows[0] || null
  }
  return row || null
}

async function listEuOriginPending(dbQ, { status = 'pending', limit = 100 } = {}) {
  await ensureEuOriginPendingTable(dbQ)
  const r = await dbQ(
    `SELECT q.*, p.title AS product_title, p.handle AS product_handle
     FROM admin_hub_eu_origin_pending q
     LEFT JOIN admin_hub_products p ON p.id = q.product_id
     WHERE ($1::text IS NULL OR q.status = $1)
     ORDER BY q.created_at DESC
     LIMIT $2`,
    [status || null, Math.min(Math.max(Number(limit) || 100, 1), 500)],
  )
  return r.rows
}

async function resolveEuOriginPending(dbQ, id, { status = 'resolved', note = null } = {}) {
  await ensureEuOriginPendingTable(dbQ)
  const r = await dbQ(
    `UPDATE admin_hub_eu_origin_pending
     SET status = $2, note = COALESCE($3, note), updated_at = now()
     WHERE id = $1::uuid
     RETURNING *`,
    [id, status, note],
  )
  return r.rows[0] || null
}

module.exports = {
  ensureEuOriginPendingTable,
  enqueueEuOriginPending,
  listEuOriginPending,
  resolveEuOriginPending,
}
