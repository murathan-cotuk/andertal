"use client";

import { useEffect } from "react";
import { useShopStyles } from "@/context/ShopStylesContext";
import MobileNav from "@/components/MobileNav";

/**
 * Alt menü: varsayılan olarak viewport’a sabit (fixed). Temada bottom_nav_sticky kapalıysa
 * çubuk sayfa akışının sonunda (flex sütun) — footer’dan sonra görünür.
 */
export default function MobileShell({ children }) {
  const styles = useShopStyles();
  const mc = styles?.mobileChrome || {};
  const bottomSticky = mc.bottom_nav_sticky !== false;

  useEffect(() => {
    const root = document.documentElement;
    if (!bottomSticky) {
      root.setAttribute("data-mobile-bottom-nav-inline", "true");
    } else {
      root.removeAttribute("data-mobile-bottom-nav-inline");
    }
    return () => root.removeAttribute("data-mobile-bottom-nav-inline");
  }, [bottomSticky]);

  if (bottomSticky) {
    return (
      <>
        {children}
        <MobileNav layout="fixed" />
      </>
    );
  }

  return (
    <div
      className="mobile-shell-inline-nav"
      style={{
        display: "flex",
        flexDirection: "column",
        minHeight: "100vh",
        width: "100%",
      }}
    >
      <div style={{ flex: 1, minHeight: 0, width: "100%" }}>{children}</div>
      <MobileNav layout="inline" />
    </div>
  );
}
