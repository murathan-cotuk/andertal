"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useLocale } from "next-intl";
import { getMedusaClient } from "@/lib/medusa-client";

const CART_ID_KEY = "belucha_cart_id";

const CartContext = createContext(null);

export { CartContext };

/** Refetch cart when UI locale changes so line items include fresh product_metadata for localized titles. */
function CartLocaleRefetch() {
  const locale = useLocale();
  const { cart, fetchCart } = useContext(CartContext);
  useEffect(() => {
    const id = cart?.id;
    if (id) fetchCart(id);
  }, [locale, cart?.id, fetchCart]);
  return null;
}

export function CartProvider({ children }) {
  const [cart, setCart] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [shippingGroups, setShippingGroups] = useState([]);

  const persistCartId = useCallback((id) => {
    if (typeof window !== "undefined" && id) {
      try {
        window.localStorage.setItem(CART_ID_KEY, id);
      } catch (_) {}
    }
  }, []);

  const getStoredCartId = useCallback(() => {
    if (typeof window === "undefined") return null;
    try {
      return window.localStorage.getItem(CART_ID_KEY);
    } catch (_) {
      return null;
    }
  }, []);

  const createCart = useCallback(async () => {
    const client = getMedusaClient();
    const res = await client.createCart();
    const c = res?.cart;
    if (c?.id) {
      persistCartId(c.id);
      setCart(c);
      return c;
    }
    return null;
  }, [persistCartId]);

  const fetchCart = useCallback(async (cartId) => {
    if (!cartId) return null;
    const client = getMedusaClient();
    try {
      const res = await client.getCart(cartId);
      const c = res?.cart;
      if (c) setCart(c);
      return c;
    } catch (_) {
      return null;
    }
  }, []);

  useEffect(() => {
    const id = getStoredCartId();
    if (id) fetchCart(id);
  }, [getStoredCartId, fetchCart]);

  useEffect(() => {
    getMedusaClient().request("/store/shipping-groups")
      .then((d) => {
        console.log("[CartContext] shippingGroups loaded:", JSON.stringify(d?.groups));
        setShippingGroups(d?.groups || []);
      })
      .catch(() => {});
  }, []);

  const addToCart = useCallback(async (variantId, quantity = 1) => {
    setLoading(true);
    try {
      const client = getMedusaClient();
      let c = cart;
      if (!c?.id) {
        c = await createCart();
        if (!c) return null;
      }
      const res = await client.addToCart(c.id, variantId, quantity);
      const updated = res?.cart;
      if (updated) setCart(updated);
      return updated;
    } catch (err) {
      console.error("Add to cart failed:", err);
      return null;
    } finally {
      setLoading(false);
    }
  }, [cart, createCart]);

  const updateLineItem = useCallback(async (lineId, quantity) => {
    if (!cart?.id) return null;
    setLoading(true);
    try {
      const client = getMedusaClient();
      const res = await client.updateLineItem(cart.id, lineId, quantity);
      const updated = res?.cart;
      if (updated) setCart(updated);
      return updated;
    } catch (err) {
      console.error("Update line item failed:", err);
      return null;
    } finally {
      setLoading(false);
    }
  }, [cart?.id]);

  const removeLineItem = useCallback(async (lineId) => {
    if (!cart?.id) return null;
    setLoading(true);
    try {
      const client = getMedusaClient();
      const res = await client.removeLineItem(cart.id, lineId);
      const updated = res?.cart;
      if (updated) {
        setCart(updated);
        return updated;
      }
      // Fallback: some environments block DELETE; PATCH quantity=0 also removes
      const res2 = await client.updateLineItem(cart.id, lineId, 0);
      const updated2 = res2?.cart;
      if (updated2) setCart(updated2);
      return updated2 || null;
    } catch (err) {
      console.error("Remove line item failed:", err);
      return null;
    } finally {
      setLoading(false);
    }
  }, [cart?.id]);

  const clearCart = useCallback(async () => {
    if (!cart?.id) return null;
    setLoading(true);
    try {
      const client = getMedusaClient();
      const res = await client.clearCart(cart.id);
      const updated = res?.cart;
      if (updated) {
        setCart(updated);
        return updated;
      }
      // Fallback: clear items by setting quantity to 0
      const ids = (cart.items || []).map((i) => i.id).filter(Boolean);
      await Promise.all(ids.map((id) => client.updateLineItem(cart.id, id, 0)));
      const refreshed = await fetchCart(cart.id);
      return refreshed;
    } catch (err) {
      console.error("Clear cart failed:", err);
      return null;
    } finally {
      setLoading(false);
    }
  }, [cart?.id, cart?.items, fetchCart]);

  const openCartSidebar = useCallback(() => setSidebarOpen(true), []);
  const closeCartSidebar = useCallback(() => setSidebarOpen(false), []);

  const itemCount = (cart?.items || []).reduce((sum, i) => sum + (i.quantity || 0), 0);
  const subtotalCents = (cart?.items || []).reduce((sum, i) => sum + (i.quantity || 0) * (i.unit_price_cents || 0), 0);
  const bonusDiscountCents = Math.floor((cart?.bonus_points_reserved || 0) / 25) * 100;

  const clearBonusPoints = useCallback(async (authToken) => {
    if (!cart?.id) return;
    const client = getMedusaClient();
    const out = await client.patchStoreCart(cart.id, { bonus_points_reserved: 0 }, authToken).catch(() => null);
    setCart((prev) => prev ? { ...prev, bonus_points_reserved: 0 } : prev);
    return out;
  }, [cart?.id]);

  const value = {
    cart,
    setCart,
    sidebarOpen,
    openCartSidebar,
    closeCartSidebar,
    addToCart,
    updateLineItem,
    removeLineItem,
    clearCart,
    clearBonusPoints,
    createCart,
    fetchCart,
    loading,
    itemCount,
    subtotalCents,
    bonusDiscountCents,
    shippingGroups,
  };

  return (
    <CartContext.Provider value={value}>
      <CartLocaleRefetch />
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
