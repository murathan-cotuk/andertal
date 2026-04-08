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
