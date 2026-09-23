'use strict'

/** Recurse parent_id links from a flat id/slug/parent_id list — no fat metadata. */
function collectCategorySubtreeIdsFromFlat(rows, slug) {
  const want = String(slug || '').replace(/^\//, '').trim().toLowerCase()
  if (!want) return new Set()
  const childrenByParent = new Map()
  let rootId = null
  for (const r of rows || []) {
    if (!r) continue
    const id = String(r.id || '').trim().toLowerCase()
    if (!id) continue
    const s = String(r.slug || r.handle || '').replace(/^\//, '').trim().toLowerCase()
    if (s === want) rootId = id
    const pid = r.parent_id != null && String(r.parent_id).trim() ? String(r.parent_id).trim().toLowerCase() : ''
    if (!childrenByParent.has(pid)) childrenByParent.set(pid, [])
    childrenByParent.get(pid).push(id)
  }
  if (!rootId) return new Set()
  const ids = new Set()
  const stack = [rootId]
  while (stack.length) {
    const cur = stack.pop()
    if (!cur || ids.has(cur)) continue
    ids.add(cur)
    const kids = childrenByParent.get(cur) || []
    for (let i = 0; i < kids.length; i++) stack.push(kids[i])
  }
  return ids
}

const SUBTREE_IDS_SQL = `
  WITH RECURSIVE tree AS (
    SELECT id
    FROM admin_hub_categories
    WHERE active IS DISTINCT FROM false
      AND LOWER(TRIM(BOTH '/' FROM COALESCE(slug, ''))) = $1
    UNION ALL
    SELECT c.id
    FROM admin_hub_categories c
    INNER JOIN tree t ON c.parent_id = t.id
    WHERE c.active IS DISTINCT FROM false
  )
  SELECT id::text AS id FROM tree
`

async function collectCategorySubtreeIdsBySlugSql(queryFn, slug) {
  const want = String(slug || '').replace(/^\//, '').trim().toLowerCase()
  if (!want || typeof queryFn !== 'function') return new Set()
  try {
    const res = await queryFn(SUBTREE_IDS_SQL, [want])
    const ids = new Set((res?.rows || []).map((r) => String(r.id || '').trim().toLowerCase()).filter(Boolean))
    if (ids.size > 0) return ids
  } catch (_) {}
  try {
    const res = await queryFn(
      `SELECT id, slug, parent_id FROM admin_hub_categories WHERE active IS DISTINCT FROM false`,
    )
    return collectCategorySubtreeIdsFromFlat(res?.rows || [], want)
  } catch (__) {
    return new Set()
  }
}

module.exports = {
  collectCategorySubtreeIdsFromFlat,
  collectCategorySubtreeIdsBySlugSql,
  SUBTREE_IDS_SQL,
}
