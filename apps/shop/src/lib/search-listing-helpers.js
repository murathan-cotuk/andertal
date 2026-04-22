/**
 * Tree walks + search-scoped category filtering for the search page.
 */
import { normCatId, productCategoryIds } from "@/lib/category-product-ids";

export function findCategoryNodeBySlug(nodes, slug) {
  const norm = String(slug || "").replace(/^\//, "");
  for (const n of nodes || []) {
    if (!n) continue;
    const s = String(n.slug || n.handle || "").replace(/^\//, "");
    if (s === norm) return n;
    const child = findCategoryNodeBySlug(n.children, slug);
    if (child) return child;
  }
  return null;
}

export function findCategoryNodeById(nodes, id) {
  const nid = String(id || "");
  for (const n of nodes || []) {
    if (!n) continue;
    if (String(n.id) === nid) return n;
    const child = findCategoryNodeById(n.children, id);
    if (child) return child;
  }
  return null;
}

/** Returns ancestors (root → direct parent) for a slug, or null. */
export function findAncestors(nodes, slug, path = []) {
  const norm = String(slug || "").replace(/^\//, "");
  for (const n of nodes || []) {
    if (!n) continue;
    const s = String(n.slug || n.handle || "").replace(/^\//, "");
    if (s === norm) return path;
    const found = findAncestors(n.children || [], slug, [...path, n]);
    if (found !== null) return found;
  }
  return null;
}

export function visibleSubcats(children) {
  return (children || []).filter(
    (c) => c && c.active !== false && c.is_visible !== false && c.has_products !== false,
  );
}

export function collectCategorySubtreeIds(node) {
  const ids = new Set();
  const walk = (n) => {
    if (!n) return;
    if (n.id) ids.add(normCatId(n.id));
    (n.children || []).forEach(walk);
  };
  walk(node);
  return ids;
}

/**
 * For each result product, count every category id; the id with the highest count
 * is treated as the "dominant" storefront category to mirror category nav.
 */
export function dominantCategoryIdFromProducts(products) {
  const counts = new Map();
  for (const p of products || []) {
    for (const id of productCategoryIds(p)) {
      const k = normCatId(id);
      if (!k) continue;
      counts.set(k, (counts.get(k) || 0) + 1);
    }
  }
  if (!counts.size) return null;
  let best = null;
  let bestN = -1;
  for (const [k, n] of counts) {
    if (n > bestN) {
      bestN = n;
      best = k;
    }
  }
  return best;
}

export function filterProductsByCategorySubtree(node, products) {
  if (!node) return products || [];
  const idSet = collectCategorySubtreeIds(node);
  return (products || []).filter((p) => {
    for (const id of productCategoryIds(p)) {
      if (idSet.has(normCatId(id))) return true;
    }
    return false;
  });
}
