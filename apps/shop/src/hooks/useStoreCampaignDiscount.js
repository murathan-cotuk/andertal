"use client";

import { useEffect, useState, useMemo } from "react";

/** Applies seller PDP campaign promo price for shop display (must match backend cart logic). */
export function campaignAdjustedPriceCents(baseCents, discount) {
  const p = Math.max(0, Number(baseCents || 0));
  if (!discount || p <= 0) return p;
  const t = String(discount.discount_type || "percentage").toLowerCase();
  const v = Number(discount.discount_value || 0);
  if (t === "fixed") return Math.max(0, p - Math.round(v * 100));
  return Math.round((p * (100 - Math.min(100, Math.max(0, v)))) / 100);
}

/**
 * @param {{ productId: string|null|undefined, variantId: string|null|undefined, sellerId: string|null|undefined, basePriceCents: number|null|undefined }} p
 */
export function useStoreCampaignDiscount({ productId, variantId, sellerId, basePriceCents }) {
  const [promo, setPromo] = useState(null);

  useEffect(() => {
    if (!productId || !variantId || !sellerId) {
      setPromo(null);
      return;
    }
    let cancelled = false;
    const qs = new URLSearchParams({
      product_id: String(productId),
      variant_id: String(variantId),
      seller_id: String(sellerId),
    });
    fetch(`/api/store-campaign-discount?${qs}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        setPromo(d?.discount || null);
      })
      .catch(() => {
        if (!cancelled) setPromo(null);
      });
    return () => {
      cancelled = true;
    };
  }, [productId, variantId, sellerId]);

  const finalPriceCents = useMemo(() => {
    if (basePriceCents == null || basePriceCents === "") return basePriceCents;
    if (!promo) return Number(basePriceCents);
    return campaignAdjustedPriceCents(basePriceCents, promo);
  }, [promo, basePriceCents]);

  return { promo, finalPriceCents };
}
