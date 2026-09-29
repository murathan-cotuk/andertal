import { getLocalizedCategory } from "@/lib/format";
import { pickCategoryListImageRaw } from "@/lib/category-list-image";
import { resolveImageUrl } from "@/lib/image-url";

export function findCategoryNodeById(nodes, id) {
  const nid = String(id || "");
  if (!nid) return null;
  for (const n of nodes || []) {
    if (!n) continue;
    if (String(n.id) === nid) return n;
    const child = findCategoryNodeById(n.children, id);
    if (child) return child;
  }
  return null;
}

/** Menu rows for a category tree level (roots or children). Product-empty nodes are skipped. */
export function mapCategoryNodesToMenuRows(nodes, locale) {
  return (nodes || [])
    .filter((n) => n && n.has_products !== false)
    .map((n) => {
      const imageRaw = pickCategoryListImageRaw(n);
      const kids = Array.isArray(n.children)
        ? n.children.filter((c) => c && c.has_products !== false)
        : [];
      const hasChildren = n.has_children === true || kids.length > 0;
      return {
        key: String(n.id),
        id: String(n.id),
        label: getLocalizedCategory(n, locale).name || n.slug || n.name || "",
        slug: String(n.slug || n.handle || "").replace(/^\//, "").trim(),
        hasChildren,
        imageUrl: imageRaw ? resolveImageUrl(imageRaw) : "",
      };
    })
    .filter((r) => r.slug)
    .sort((a, b) => String(a.label).localeCompare(String(b.label), locale));
}

/** Rows for the desktop category card: each child with its first `maxLinks` children as links. */
export function mapCategoryGroups(nodes, locale, maxLinks = 4) {
  const byId = new Map((nodes || []).filter(Boolean).map((n) => [String(n.id), n]));
  return mapCategoryNodesToMenuRows(nodes, locale).map((row) => {
    const links = mapCategoryNodesToMenuRows(byId.get(row.id)?.children || [], locale);
    return { ...row, links: links.slice(0, maxLinks), moreCount: Math.max(0, links.length - maxLinks), allLinks: links };
  });
}

export function shouldCategoryMenuDrill(event, hasChildren) {
  if (!hasChildren) return false;
  if (!event) return true;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
  if (event.button != null && event.button !== 0) return false;
  return true;
}
