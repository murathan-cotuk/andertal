"use client";

import { createContext, useContext, useState } from "react";
import { DEFAULT_SHOP_STYLES, resolveStorefrontStyles } from "@andertal/shop-theme";

export const ShopStylesContext = createContext(DEFAULT_SHOP_STYLES);

export function ShopStylesProvider({ children }) {
  // Same default design the injector paints first, so header/footer do not flash the old look.
  const [styles, setStyles] = useState(() => resolveStorefrontStyles({}));
  return (
    <ShopStylesContext.Provider value={{ styles, setStyles }}>
      {children}
    </ShopStylesContext.Provider>
  );
}

/** Template ayarlarına ulaşmak için hook */
export function useShopStyles() {
  const ctx = useContext(ShopStylesContext);
  return ctx?.styles ?? DEFAULT_SHOP_STYLES;
}
