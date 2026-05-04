/**
 * Groups cart items by seller_id.
 * Returns an array of { sellerId, sellerStoreName, items[] } sorted by sellerId.
 */
export function groupCartItemsBySeller(items = []) {
  const map = new Map();
  for (const item of items) {
    const sid = item.seller_id || item.product_seller_id || "default";
    if (!map.has(sid)) {
      map.set(sid, {
        sellerId: sid,
        sellerStoreName: item.seller_store_name || item.store_name || null,
        items: [],
      });
    }
    const group = map.get(sid);
    if (!group.sellerStoreName && (item.seller_store_name || item.store_name)) {
      group.sellerStoreName = item.seller_store_name || item.store_name;
    }
    group.items.push(item);
  }
  return Array.from(map.values());
}
