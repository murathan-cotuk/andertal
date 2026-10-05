"use client";

import { useEffect, useMemo, useState } from "react";
import { normalizeIsoCountryCode } from "@/lib/iso-country";
import { findShippingGroup, resolveShippingQuoteCents } from "@/lib/shipping-price";
import { resolveFreeShippingThresholdCents } from "@/lib/free-shipping-threshold";

/**
 * Per-seller shipping for the cart — mirrors apps/medusa-backend/src/shipping-quote.js, which
 * computes the amount actually charged. Each seller: most expensive shipping group of their own
 * lines for the country; free once that seller's own subtotal reaches that seller's own
 * free-shipping threshold for the country. Total = sum over sellers.
 */

export const sellerKey = (item) => String(item?.seller_id || item?.product_seller_id || "").trim() || "default";

const itemGroupId = (item) =>
  item?.shipping_group_id ||
  item?.metadata?.shipping_group_id ||
  item?.product_metadata?.shipping_group_id ||
  item?.variant?.product?.metadata?.shipping_group_id ||
  item?.product?.metadata?.shipping_group_id ||
  null;

/**
 * @returns {{ totalCents: number|null, anyPriced: boolean, sellers: Array<{ sellerId: string, sellerStoreName: string|null, subtotalCents: number, baseCents: number|null, thresholdCents: number|null, free: boolean, shippingCents: number, remainingCents: number|null }> }}
 */
export function computeSellerShipping(items, shippingGroups, thresholdsBySeller, countryCode) {
  const country = normalizeIsoCountryCode(countryCode);
  const map = new Map();
  for (const item of items || []) {
    const sid = sellerKey(item);
    if (!map.has(sid)) {
      map.set(sid, { sellerId: sid, sellerStoreName: null, subtotalCents: 0, baseCents: null });
    }
    const s = map.get(sid);
    if (!s.sellerStoreName && (item.seller_store_name || item.store_name)) {
      s.sellerStoreName = item.seller_store_name || item.store_name;
    }
    s.subtotalCents += Math.max(0, Number(item.unit_price_cents || 0)) * Math.max(1, Number(item.quantity || 1));
    const group = findShippingGroup(shippingGroups, itemGroupId(item));
    if (!group?.prices || typeof group.prices !== "object") continue;
    const p = resolveShippingQuoteCents(group.prices, country);
    if (p == null) continue;
    if (s.baseCents === null || p > s.baseCents) s.baseCents = p;
  }
  let totalCents = 0;
  let anyPriced = false;
  const sellers = [];
  for (const s of map.values()) {
    // `{}` when loaded but unset → no env fallback; strictly this seller's own rule.
    const raw = thresholdsBySeller ? thresholdsBySeller[s.sellerId] || {} : {};
    const thresholdCents = resolveFreeShippingThresholdCents(raw, country, null);
    const free = thresholdCents != null && s.subtotalCents >= thresholdCents;
    const shippingCents = free ? 0 : s.baseCents ?? 0;
    if (s.baseCents != null || free) anyPriced = true;
    totalCents += shippingCents;
    sellers.push({
      ...s,
      thresholdCents,
      free,
      shippingCents,
      remainingCents: thresholdCents != null && !free ? thresholdCents - s.subtotalCents : null,
    });
  }
  return { totalCents: anyPriced ? totalCents : null, anyPriced, sellers };
}

/**
 * Cart lines grouped by seller (sender) in the order sellers first appear, each group with its
 * own quote from computeSellerShipping(). `name` is the store name or "" (caller picks a fallback).
 */
export function groupCartBySeller(items, sellerShipping) {
  const byId = new Map();
  for (const item of items || []) {
    const sid = sellerKey(item);
    if (!byId.has(sid)) byId.set(sid, { sellerId: sid, name: "", items: [] });
    const g = byId.get(sid);
    g.items.push(item);
    if (!g.name && (item.seller_store_name || item.store_name)) g.name = item.seller_store_name || item.store_name;
  }
  const quotes = new Map((sellerShipping?.sellers || []).map((s) => [s.sellerId, s]));
  return [...byId.values()].map((g) => ({ ...g, shipping: quotes.get(g.sellerId) || null }));
}

/** Loads `{seller_id: {ISO: cents}|null}` for the sellers present in the cart. */
export function useSellerFreeShippingThresholds(items) {
  const sellerIdsKey = useMemo(
    () => [...new Set((items || []).map(sellerKey))].sort().join(","),
    [items],
  );
  const [state, setState] = useState({ key: "", thresholds: null });
  useEffect(() => {
    if (!sellerIdsKey) return undefined;
    let cancelled = false;
    fetch(`/api/store-free-shipping-thresholds?seller_ids=${encodeURIComponent(sellerIdsKey)}`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        setState({ key: sellerIdsKey, thresholds: d?.thresholds && typeof d.thresholds === "object" ? d.thresholds : {} });
      })
      .catch(() => {
        if (!cancelled) setState({ key: sellerIdsKey, thresholds: {} });
      });
    return () => {
      cancelled = true;
    };
  }, [sellerIdsKey]);
  return state.key === sellerIdsKey ? state.thresholds : null;
}
