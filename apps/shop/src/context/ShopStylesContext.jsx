"use client";

import { createContext, useContext, useState } from "react";
import { DEFAULT_SHOP_STYLES } from "@andertal/shop-theme";

export const ShopStylesContext = createContext(DEFAULT_SHOP_STYLES);

export function ShopStylesProvider({ children }) {
  const [styles, setStyles] = useState(DEFAULT_SHOP_STYLES);
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
