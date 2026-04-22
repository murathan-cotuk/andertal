"use client";

import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Link } from "@/i18n/navigation";
import { restPathFromPathname } from "@/lib/shop-market";
import { menuItemHref } from "@/lib/shop-menu-href";

const RAIL_W = 76;
const MAX_H = "min(55vh, 480px)";

const railStyle = {
  flex: `0 0 ${RAIL_W}px`,
  width: RAIL_W,
  maxWidth: RAIL_W,
  maxHeight: MAX_H,
  overflowY: "auto",
  overflowX: "hidden",
  WebkitOverflowScrolling: "touch",
  scrollBehavior: "smooth",
  borderRadius: 10,
  background: "rgba(249, 250, 251, 0.96)",
  border: "1px solid #e5e7eb",
  boxSizing: "border-box",
  padding: "6px 4px",
  flexShrink: 0,
};

const linkStyle = {
  display: "block",
  fontSize: 10,
  fontWeight: 600,
  lineHeight: 1.25,
  color: "#374151",
  textDecoration: "none",
  padding: "7px 4px",
  textAlign: "center",
  borderRadius: 6,
  wordBreak: "break-word",
};

const rowStyle = {
  display: "flex",
  flexDirection: "row",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 10,
  width: "100%",
  maxWidth: "100%",
  boxSizing: "border-box",
  margin: 0,
  padding: "0 10px 10px",
};

/**
 * Startseite (mobil, ≤767px): zwei vertikale Leisten unter dem Header, Second-Menu-Einträge,
 * scrollbar, startet unter der Second-Nav (Main beginnt danach) mit Seitenrändern.
 */
export function HomeMobileSubnavRails({ children }) {
  const pathname = usePathname() || "/";
  const [items, setItems] = useState([]);
  const [wideEnough, setWideEnough] = useState(false);
  const [isHome, setIsHome] = useState(true);

  const rest = useMemo(() => restPathFromPathname(pathname), [pathname]);
  useEffect(() => {
    setIsHome(rest === "/" || rest === "");
  }, [rest]);

  useEffect(() => {
    const q = window.matchMedia("(max-width: 767px)");
    const go = () => setWideEnough(q.matches);
    go();
    q.addEventListener("change", go);
    return () => q.removeEventListener("change", go);
  }, []);

  useEffect(() => {
    if (!isHome) {
      setItems([]);
      return;
    }
    let cancelled = false;
    const norm = (s) => String(s || "").toLowerCase().trim();
    const rootItems = (arr) => (arr || []).filter((i) => !i?.parent_id);
    const apply = (locData, menuData) => {
      if (cancelled) return;
      const locs = locData?.locations || [];
      const menus = Array.isArray(menuData?.menus) ? menuData.menus : [];
      const subnavLoc = locs.find((l) => norm(l?.html_id) === "subnav");
      const subnavSlug = norm(subnavLoc?.slug || "second");
      const second =
        menus.find((m) => norm(m?.location) === subnavSlug) ||
        menus.find((m) => norm(m?.slug) === "second-menu");
      setItems(second ? rootItems(second.items) : []);
    };
    Promise.all([
      fetch("/api/store-menu-locations").then((r) => r.json()).catch(() => ({ locations: [] })),
      fetch("/api/store-menus").then((r) => r.json()).catch(() => ({ menus: [] })),
    ]).then(([loc, menu]) => apply(loc, menu));
    return () => {
      cancelled = true;
    };
  }, [isHome]);

  const { left, right } = useMemo(() => {
    if (!items.length) return { left: [], right: [] };
    const mid = Math.ceil(items.length / 2);
    return { left: items.slice(0, mid), right: items.slice(mid) };
  }, [items]);

  const showRails = isHome && wideEnough && items.length > 0;

  if (!showRails) {
    return <div style={{ width: "100%" }}>{children}</div>;
  }

  return (
    <div style={rowStyle}>
      <aside style={{ ...railStyle, display: "block" }} aria-label="Kurznavigation links">
        {left.map((item) => {
          const raw = menuItemHref(item);
          const h = raw === "#" ? "/" : raw;
          if (h.startsWith("http")) {
            return (
              <a key={item.id} href={h} rel="noopener noreferrer" style={linkStyle}>
                {item.label || "—"}
              </a>
            );
          }
          return (
            <Link key={item.id} href={h} style={linkStyle} prefetch={false}>
              {item.label || "—"}
            </Link>
          );
        })}
      </aside>
      <div style={{ flex: 1, minWidth: 0, width: "100%" }}>{children}</div>
      <aside style={{ ...railStyle, display: "block" }} aria-label="Kurznavigation rechts">
        {right.map((item) => {
          const raw = menuItemHref(item);
          const h = raw === "#" ? "/" : raw;
          if (h.startsWith("http")) {
            return (
              <a key={item.id} href={h} rel="noopener noreferrer" style={linkStyle}>
                {item.label || "—"}
              </a>
            );
          }
          return (
            <Link key={item.id} href={h} style={linkStyle} prefetch={false}>
              {item.label || "—"}
            </Link>
          );
        })}
      </aside>
    </div>
  );
}
