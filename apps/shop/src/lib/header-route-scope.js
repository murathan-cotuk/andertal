/**
 * Welcher Header-Style-Override aus styles.header.scopes gilt für den Pfad?
 * Muss mit `apps/shop/src/app/[locale]/[handle]/page.jsx` RESERVED_HANDLES konsistent bleiben.
 */

const RESERVED_SINGLE_SEGMENT = new Set(
  [
    "search",
    "login",
    "register",
    "account",
    "bestsellers",
    "recommended",
    "category",
    "pages",
    "collections",
    "produkt",
    "kollektion",
    "product",
    "merkzettel",
    "wishlist",
    "favorites",
    "cart",
    "checkout",
    "order",
    "brands",
    "brand",
    "neuheiten",
    "sales",
    "nachrichten",
    "invoices",
    "addresses",
    "payment-methods",
    "bonus",
    "reviews",
    "seller",
    "debug",
    "forgot-password",
  ].map((s) => s.toLowerCase()),
);

/**
 * @param {string} restPath — z. B. aus restPathFromPathname()
 * @returns {"category"|"collection"|null}
 */
export function detectShopHeaderRouteScope(restPath) {
  const path = String(restPath || "/").replace(/\/+/g, "/");
  const segments = path.split("/").filter(Boolean);

  if (segments.length >= 2 && segments[0].toLowerCase() === "category") {
    return "category";
  }
  if (
    segments.length >= 2 &&
    (segments[0].toLowerCase() === "collections" || segments[0].toLowerCase() === "kollektion")
  ) {
    return "collection";
  }

  if (segments.length === 1) {
    const slug = segments[0].toLowerCase();
    if (!RESERVED_SINGLE_SEGMENT.has(slug)) return "collection";
  }

  return null;
}
