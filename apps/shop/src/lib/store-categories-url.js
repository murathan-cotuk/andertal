/** Build shop store-categories API query with active locale for auto-translated names. */
export function storeCategoriesQuery(locale, params = {}) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== "") q.set(k, String(v));
  }
  const loc = String(locale || "de").slice(0, 2).toLowerCase();
  if (loc) q.set("locale", loc);
  const s = q.toString();
  return s ? `?${s}` : "";
}

/** Amazon-style: roots only (no nested children). Menu drills fetch parent_id next. */
export function shallowCategoriesQuery(locale, extra = {}) {
  return storeCategoriesQuery(locale, {
    tree: "true",
    is_visible: "true",
    depth: "1",
    ...extra,
  });
}

/** Children of one parent — one level by default; depth 2 also brings the grandchildren. */
export function childrenCategoriesQuery(locale, parentId, depth = 1) {
  return storeCategoriesQuery(locale, {
    tree: "true",
    is_visible: "true",
    depth: String(depth),
    parent_id: parentId,
  });
}

/** Breadcrumb path + direct children without downloading the full tree. */
export function categoryPathQuery(locale, { slug, id } = {}) {
  const params = {};
  if (slug) params.path_for = String(slug);
  if (id) params.path_for_id = String(id);
  return storeCategoriesQuery(locale, params);
}
