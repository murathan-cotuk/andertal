/** Admin Hub category ids tied to a storefront product (metadata + categories array). */

export function productCategoryIds(product) {
  const out = [];
  const meta = product?.metadata && typeof product.metadata === "object" ? product.metadata : {};
  const push = (value) => {
    if (value == null) return;
    const s = String(value).trim();
    if (s) out.push(s);
  };
  push(meta.admin_category_id);
  push(meta.category_id);
  if (Array.isArray(meta.category_ids)) meta.category_ids.forEach(push);
  if (Array.isArray(product?.categories)) product.categories.forEach((c) => push(c?.id));
  return out;
}

export function normCatId(id) {
  return String(id || "")
    .trim()
    .toLowerCase();
}

/** For each leaf category id present in leafIdSet, add all ancestor ids using parent links from a flat/walked tree. */
export function expandCategoryIdsWithAncestors(tree, leafIdSet) {
  const idToParent = new Map();
  const walk = (nodes, parentId) => {
    for (const n of nodes || []) {
      const id = normCatId(n?.id);
      if (id) idToParent.set(id, parentId ? normCatId(parentId) : null);
      walk(n.children || [], id || parentId);
    }
  };
  walk(Array.isArray(tree) ? tree : [], null);
  const out = new Set();
  for (const raw of leafIdSet) {
    const id = normCatId(raw);
    if (!id) continue;
    let cur = id;
    let guard = 0;
    while (cur && guard++ < 64) {
      out.add(cur);
      cur = idToParent.get(cur) || null;
    }
  }
  return out;
}
