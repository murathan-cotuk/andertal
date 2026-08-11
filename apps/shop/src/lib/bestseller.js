export function toSalesScore(metadata) {
  if (!metadata || typeof metadata !== "object") return 0;
  const soldLastMonth = Number(metadata.sold_last_month ?? 0);
  if (Number.isFinite(soldLastMonth) && soldLastMonth > 0) return soldLastMonth;
  const sold = Number(metadata.sold ?? metadata.sales_count ?? 0);
  return Number.isFinite(sold) && sold > 0 ? sold : 0;
}

export const NEW_BADGE_WINDOW_DAYS = 15;

/** "Neu" badge — active for NEW_BADGE_WINDOW_DAYS days after a product's publish date
 * (falls back to its creation date). Algorithmic only, no manual override. */
export function isNewMetadata(metadata, createdAt) {
  const raw = metadata?.publish_date || createdAt;
  if (!raw) return false;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return false;
  const ageMs = Date.now() - d.getTime();
  return ageMs >= 0 && ageMs <= NEW_BADGE_WINDOW_DAYS * 24 * 60 * 60 * 1000;
}

export function isBestsellerMetadata(metadata) {
  if (!metadata || typeof metadata !== "object") return false;
  // Algorithmic only — no manual "badge" override. is_bestseller is stamped server-side
  // from real sales data (see applyBestsellerFlagsToMappedProduct in store-products.js).
  if (metadata.is_bestseller === true || metadata.is_bestseller === "true") return true;
  // Same threshold as store-products getBestsellerProductIds (score >= 1).
  return toSalesScore(metadata) > 0;
}

/**
 * Configured bestseller badge width (px) for a viewport band, with a
 * mobile → tablet → desktop fallback chain so leaving Tablet/Mobile empty
 * in Sellercentral just inherits the next wider breakpoint's value.
 */
export function bestsellerBadgeWidthForBand(bestsellerBadge, band) {
  const b = bestsellerBadge || {};
  const desktop = (b.badge_width != null && b.badge_width !== "") ? (Number(b.badge_width) || 80) : 80;
  const tablet =
    b.badge_width_tablet != null && b.badge_width_tablet !== ""
      ? (Number(b.badge_width_tablet) || desktop)
      : desktop;
  const mobile =
    b.badge_width_mobile != null && b.badge_width_mobile !== ""
      ? (Number(b.badge_width_mobile) || tablet)
      : tablet;
  if (band === "mobile") return mobile;
  if (band === "tablet") return tablet;
  return desktop;
}
