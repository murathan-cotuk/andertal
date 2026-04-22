/** Shared menu item → storefront path (SubNav, mobile rails, etc.) */

function slugify(s) {
  return (s || "")
    .replace(/[äÄ]/g, "ae")
    .replace(/[öÖ]/g, "oe")
    .replace(/[üÜ]/g, "ue")
    .replace(/ß/g, "ss")
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

export function menuItemHref(item) {
  if (!item) return "#";
  const raw = item.link_value;
  let value = raw;
  let parsed = null;
  const itemSlug = String(item.slug || "").trim();
  if (typeof raw === "string" && raw.trim().startsWith("{")) {
    try {
      parsed = JSON.parse(raw);
    } catch (_) {
      /* ignore */
    }
  }
  if (item.link_type === "page") {
    const labelSlug = itemSlug || parsed?.label_slug || slugify(item.label);
    return labelSlug ? `/${labelSlug}` : "#";
  }
  if (item.link_type === "api") {
    const fn = String(parsed?.function || parsed?.api_function || value || "")
      .trim()
      .toLowerCase();
    if (fn === "brand" || fn === "marke" || fn === "brands") return "/brands";
    if (fn === "sales") return "/sales";
    if (fn === "neuheiten") return "/neuheiten";
    if (fn === "bestsellers") return "/bestsellers";
    return "#";
  }
  if (parsed) {
    if (itemSlug) value = itemSlug;
    else if (parsed.handle) value = parsed.handle;
    else if (parsed.slug) value = parsed.slug;
  } else if (itemSlug) {
    value = itemSlug;
  }
  if (item.link_type === "url" && value) {
    return String(value).startsWith("http") ? value : `/${String(value).replace(/^\//, "")}`;
  }
  if (item.link_type === "product" && value) return `/produkt/${value}`;
  if (item.link_type === "category") {
    const slug = value ? String(value).replace(/^\//, "").trim() : "";
    return slug ? `/${slug}` : "#";
  }
  if (item.link_type === "collection") {
    return value ? `/${String(value).replace(/^\//, "")}` : "#";
  }
  return value ? `/${String(value).replace(/^\//, "")}` : "#";
}
