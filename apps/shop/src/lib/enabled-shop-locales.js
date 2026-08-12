import { resolveEnabledShopLocales, SHOP_LOCALES } from "@/lib/shop-market";

const getBackendUrl = () =>
  (process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000").replace(/\/$/, "");

/**
 * Server-side fetch of enabled shop locales (platform settings).
 * Falls back to all locales on error / empty.
 */
export async function fetchEnabledShopLocales() {
  try {
    const r = await fetch(`${getBackendUrl()}/store/seller-settings?seller_id=default`, {
      next: { revalidate: 20 },
    });
    const data = await r.json().catch(() => ({}));
    return resolveEnabledShopLocales(data?.enabled_shop_locales);
  } catch {
    return [...SHOP_LOCALES];
  }
}
