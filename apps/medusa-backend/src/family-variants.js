'use strict'

/**
 * Handoff Faz 3 (family_link): products linked into a family stay independent sellable rows
 * (own EAN, price, stock, seller). On the PDP of any member the other members are offered as
 * variants of one axis (admin_hub_product_families.metadata.variation_groups). Each variant keeps
 * its member's own cart id (stableVariantId of the member) → the cart adds the member product,
 * checkout prices it from the member row (line-unit-price.js) and stock is the member's
 * (inventory.js). Only active when a product has family_id — today no product has one.
 */

/**
 * Pure: builds the PDP variant list from mapped members.
 * @param {object} args
 * @param {string} args.currentId  member being viewed (its variant goes first → preselected)
 * @param {Array<{ row: object, mapped: object }>} args.members  published, visible members
 * @param {Array} args.variationGroups family axis [{ name, options: [{ value }] }]
 * @returns {{ variants: Array, variation_groups: Array, family_members: Array } | null}
 */
function buildFamilyVariants({ currentId, members, variationGroups }) {
  const groups = Array.isArray(variationGroups) && variationGroups.length ? variationGroups : null
  if (!groups || !Array.isArray(members) || members.length < 2) return null
  const order = new Map(((groups[0].options || []).map((o, i) => [String(o?.value ?? o).toLowerCase(), i])))
  const out = []
  for (const { row, mapped } of members) {
    const vs = Array.isArray(mapped?.variants) ? mapped.variants : []
    // A member with its own real variants cannot be shown on a one-axis family selector.
    if (vs.length !== 1) return null
    const meta = row.metadata && typeof row.metadata === 'object' ? row.metadata : {}
    const value = String(meta.family_option_value || row.title || '').trim()
    if (!value) return null
    out.push({
      ...vs[0],
      title: value,
      option_values: [value],
      product_id: String(row.id),
      product_handle: row.handle || null,
      own_price_cents: vs[0].price_cents,
      // Price lookup on the PDP reads variant.metadata.prices first — the member's own map.
      metadata: { ...(vs[0].metadata || {}), ...(meta.prices ? { prices: meta.prices } : {}) },
      _order: order.has(value.toLowerCase()) ? order.get(value.toLowerCase()) : 999,
    })
  }
  out.sort((a, b) => a._order - b._order)
  const curIdx = out.findIndex((v) => v.product_id === String(currentId))
  if (curIdx > 0) out.unshift(out.splice(curIdx, 1)[0])
  return {
    variants: out.map(({ _order, ...v }) => v),
    variation_groups: groups,
    family_members: out.map((v) => ({ product_id: v.product_id, handle: v.product_handle, option_value: v.option_values[0] })),
  }
}

module.exports = { buildFamilyVariants }
