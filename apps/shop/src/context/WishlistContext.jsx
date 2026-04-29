"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useCustomerAuth as useAuth, getToken } from "@andertal/lib";
import { getMedusaClient } from "@/lib/medusa-client";

const WishlistContext = createContext(null);

export function WishlistProvider({ children }) {
  const { user } = useAuth();
  const [ids, setIds] = useState(() => new Set());

  const refresh = useCallback(async () => {
    const token = getToken("customer");
    if (!token) {
      setIds(new Set());
      return;
    }
    const client = getMedusaClient();
    const me = await client.getCustomer(token);
    const list = me?.customer?.wishlist_product_ids;
    if (Array.isArray(list)) {
      setIds(new Set(list.map(String)));
      return;
    }
    const w = await client.getWishlist(token);
    const fromW = (w?.items || []).map((x) => String(x.product_id));
    setIds(new Set(fromW));
  }, []);

  useEffect(() => {
    if (!user?.id) {
      setIds(new Set());
      return;
    }
    refresh();
  }, [user?.id, refresh]);

  const isInWishlist = useCallback((productId) => ids.has(String(productId)), [ids]);

  const toggle = useCallback(
    async (productId) => {
      const token = getToken("customer");
      if (!token) return { needLogin: true };
      const pid = String(productId);
      const client = getMedusaClient();
      if (ids.has(pid)) {
        const res = await client.removeWishlistProduct(token, pid);
        if (res?.__error) return { error: res.message || "Fehler" };
        setIds((prev) => {
          const n = new Set(prev);
          n.delete(pid);
          return n;
        });
        return { removed: true };
      }
      const res = await client.addWishlistProduct(token, pid);
      if (res?.__error) return { error: res.message || "Fehler" };
      setIds((prev) => new Set(prev).add(pid));
      return { added: true };
    },
    [ids],
  );

  const value = useMemo(
    () => ({ ids, refresh, isInWishlist, toggle }),
    [ids, refresh, isInWishlist, toggle],
  );

  return <WishlistContext.Provider value={value}>{children}</WishlistContext.Provider>;
}

export function useWishlist() {
  const ctx = useContext(WishlistContext);
  if (!ctx) throw new Error("useWishlist outside WishlistProvider");
  return ctx;
}
