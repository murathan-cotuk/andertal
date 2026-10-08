'use strict'

/**
 * Would setting `newParentId` as parent of `id` create a loop in the category tree?
 * (A → B → … → A). The Excel upsert only rejected the direct self-parent case; a deeper loop
 * makes every tree walk (breadcrumbs, subtree ids, tree cache) spin forever.
 *
 * @param {(id: string) => (string|null|undefined)} parentOf  current parent lookup
 */
function wouldCreateCycle(parentOf, id, newParentId, maxDepth = 64) {
  if (!id || !newParentId) return false
  const target = String(id).toLowerCase()
  let cur = String(newParentId).toLowerCase()
  const seen = new Set()
  for (let i = 0; i <= maxDepth && cur; i++) {
    if (cur === target) return true
    if (seen.has(cur)) return true // existing loop above — refuse to attach to it
    seen.add(cur)
    const p = parentOf(cur)
    cur = p ? String(p).toLowerCase() : ''
  }
  return !!cur // deeper than maxDepth: treat as broken
}

/** Same check against the database (PUT /categories/:id). */
async function wouldCreateCycleDb(client, id, newParentId) {
  if (!id || !newParentId) return false
  const r = await client.query(
    `WITH RECURSIVE up(id, parent_id, depth) AS (
       SELECT id, parent_id, 0 FROM admin_hub_categories WHERE id = $1::uuid
       UNION ALL
       SELECT c.id, c.parent_id, up.depth + 1 FROM admin_hub_categories c JOIN up ON c.id = up.parent_id
        WHERE up.depth < 64 AND up.id <> $2::uuid
     )
     SELECT EXISTS (SELECT 1 FROM up WHERE id = $2::uuid) AS cyc, MAX(depth) AS d FROM up`,
    [String(newParentId), String(id)],
  )
  const row = r.rows[0] || {}
  return row.cyc === true || Number(row.d) >= 64
}

module.exports = { wouldCreateCycle, wouldCreateCycleDb }
