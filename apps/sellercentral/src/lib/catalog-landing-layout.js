/** Catalog landing layout: category / collection pages use containers for banner, products, richtext. */

export const CATALOG_SLOT_TYPES = ["page_banner", "product_container", "page_richtext"];
export const CATALOG_LAYOUT_DEVICES = ["desktop", "tablet", "mobile"];

export function catalogSlotContainer(type, device) {
  return {
    id: `cat-slot-${type}-${device}`,
    type,
    visible: true,
    visible_on: device,
  };
}

export function defaultCatalogContainers() {
  const out = [];
  for (const device of CATALOG_LAYOUT_DEVICES) {
    for (const type of CATALOG_SLOT_TYPES) {
      out.push(catalogSlotContainer(type, device));
    }
  }
  return out;
}

export function isCatalogLayoutManaged(containers, settings) {
  if (settings && settings.catalog_layout === "containers") return true;
  return (containers || []).some((c) => CATALOG_SLOT_TYPES.includes(c?.type));
}

function deviceOf(c) {
  return c?.visible_on || "desktop";
}

function extrasForDevice(extras, device) {
  return extras.filter((c) => {
    const v = deviceOf(c);
    if (v === device) return true;
    if (v === "both" && device !== "tablet") return true;
    return false;
  });
}

/**
 * Unmanaged (never saved with slot types): keep today's shop look —
 * banner with title, any extra landing blocks, product catalog, richtext.
 * Managed: honor the saved list exactly (no product_container → no products).
 */
export function resolveCatalogLandingContainers(containers, settings) {
  const list = Array.isArray(containers) ? containers.filter(Boolean) : [];
  if (isCatalogLayoutManaged(list, settings)) return list;
  const extras = list.filter((c) => !CATALOG_SLOT_TYPES.includes(c.type));
  if (!extras.length) return defaultCatalogContainers();
  const out = [];
  for (const device of CATALOG_LAYOUT_DEVICES) {
    out.push(catalogSlotContainer("page_banner", device));
    extrasForDevice(extras, device).forEach((c) => out.push(c));
    out.push(catalogSlotContainer("product_container", device));
    out.push(catalogSlotContainer("page_richtext", device));
  }
  return out;
}

export function catalogFilterBarEnabled(settings) {
  return settings?.show_product_filter_bar !== false;
}
