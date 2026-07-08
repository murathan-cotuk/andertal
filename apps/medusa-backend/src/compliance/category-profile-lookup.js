'use strict'

/**
 * Shared DB lookup: given a category id, find its effective compliance_profile_id
 * by walking up the parent_id chain (docs/HUKUKI.md). Used by both the read-only
 * GET /admin-hub/categories/:id/compliance-schema route and the non-blocking
 * compliance-review stamp in admin-products.js.
 *
 * @param {import('pg').Client} client  already-connected pg client
 * @param {string} categoryId
 * @returns {Promise<string|null>} profile id, or null if no category/ancestor has one
 */
async function resolveCategoryComplianceProfileId(client, categoryId) {
  let cursorId = categoryId
  const seen = new Set()
  while (cursorId && !seen.has(cursorId)) {
    seen.add(cursorId)
    const r = await client.query('SELECT id, parent_id, metadata FROM admin_hub_categories WHERE id = $1', [cursorId])
    const row = r.rows[0]
    if (!row) return null
    const meta = row.metadata && typeof row.metadata === 'object' ? row.metadata : {}
    if (meta.compliance_profile_id) return meta.compliance_profile_id
    cursorId = row.parent_id || null
  }
  return null
}

module.exports = { resolveCategoryComplianceProfileId }
