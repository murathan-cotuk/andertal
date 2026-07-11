export function toSalesScore(metadata) {
  if (!metadata || typeof metadata !== "object") return 0;
  const soldLastMonth = Number(metadata.sold_last_month ?? 0);
  if (Number.isFinite(soldLastMonth) && soldLastMonth > 0) return soldLastMonth;
  const sold = Number(metadata.sold ?? metadata.sales_count ?? 0);
  return Number.isFinite(sold) && sold > 0 ? sold : 0;
}

export function isBestsellerMetadata(metadata) {
  if (!metadata || typeof metadata !== "object") return false;
  return (
    metadata.is_bestseller === true ||
    metadata.is_bestseller === "true" ||
    String(metadata.badge || "").toLowerCase().trim() === "bestseller"
  );
}

/**
 * Configured bestseller badge width (px) for a viewport band, with a
 * mobile → tablet → desktop fallback chain so leaving Tablet/Mobile empty
 * in Sellercentral just inherits the next wider breakpoint's value.
 */
export function bestsellerBadgeWidthForBand(bestsellerBadge, band) {
  const b = bestsellerBadge || {};
  const desktop = Number(b.badge_width) || 80;
  const tablet =
    b.badge_width_tablet != null && b.badge_width_tablet !== ""
      ? Number(b.badge_width_tablet) || desktop
      : desktop;
  const mobile =
    b.badge_width_mobile != null && b.badge_width_mobile !== ""
      ? Number(b.badge_width_mobile) || tablet
      : tablet;
  if (band === "mobile") return mobile;
  if (band === "tablet") return tablet;
  return desktop;
}
