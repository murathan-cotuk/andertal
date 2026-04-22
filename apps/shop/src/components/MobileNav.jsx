"use client";

/**
 * MobileNav — Bottom navigation bar + slide-in drawer for mobile (≤767px).
 * Rendered as a sibling of page content via Providers.jsx (display:none on desktop).
 */

import React, { useState, useEffect, useCallback, useRef } from "react";
import { Link, usePathname } from "@/i18n/navigation";
import { useCustomerAuth as useAuth } from "@belucha/lib";
import { useCart } from "@/context/CartContext";

const TEAL = "#1b8880";

/* ─── inline styles (no styled-components dependency) ─────── */

const css = {
  /* Bottom bar */
  bar: {
    display: "flex",
    position: "fixed",
    bottom: 0,
    left: 0,
    right: 0,
    height: "calc(58px + env(safe-area-inset-bottom, 0px))",
    paddingBottom: "env(safe-area-inset-bottom, 0px)",
    background: "#fff",
    borderTop: "1px solid #e5e7eb",
    boxShadow: "0 -2px 12px rgba(0,0,0,0.07)",
    zIndex: 2147483640,
    alignItems: "stretch",
  },
  barBtn: (active) => ({
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    border: "none",
    background: "transparent",
    cursor: "pointer",
    padding: "0 4px",
    color: active ? TEAL : "#6b7280",
    fontSize: 10,
    fontWeight: active ? 700 : 500,
    fontFamily: "inherit",
    WebkitTapHighlightColor: "transparent",
    transition: "color 0.15s",
    textDecoration: "none",
    minWidth: 0,
  }),
  cartBadge: {
    position: "absolute",
    top: -5,
    right: -7,
    background: TEAL,
    color: "#fff",
    borderRadius: "50%",
    minWidth: 16,
    height: 16,
    fontSize: 9,
    fontWeight: 800,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    pointerEvents: "none",
  },

  /* Overlay */
  overlay: (open) => ({
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.52)",
    zIndex: 2147483700,
    opacity: open ? 1 : 0,
    pointerEvents: open ? "auto" : "none",
    transition: "opacity 0.25s ease",
  }),

  /* Drawer */
  drawer: (open) => ({
    position: "fixed",
    top: 0,
    left: 0,
    width: "min(320px, 88vw)",
    height: "100dvh",
    background: "#fff",
    zIndex: 2147483701,
    transform: open ? "translateX(0)" : "translateX(-100%)",
    transition: "transform 0.28s cubic-bezier(0.4,0,0.2,1)",
    boxShadow: "4px 0 32px rgba(0,0,0,0.16)",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  }),

  drawerHead: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "14px 16px",
    background: TEAL,
    flexShrink: 0,
  },

  drawerBody: {
    flex: 1,
    overflowY: "auto",
    WebkitOverflowScrolling: "touch",
    paddingBottom: "env(safe-area-inset-bottom, 0px)",
  },

  sectionLabel: {
    padding: "12px 16px 4px",
    fontSize: 10,
    fontWeight: 700,
    color: "#9ca3af",
    textTransform: "uppercase",
    letterSpacing: "0.1em",
  },

  drawerLink: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "11px 16px",
    fontSize: 15,
    fontWeight: 500,
    color: "#111827",
    textDecoration: "none",
    transition: "background 0.1s",
    borderBottom: "1px solid #f9fafb",
  },

  drawerBtn: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    padding: "11px 16px",
    fontSize: 15,
    fontWeight: 500,
    color: "#111827",
    background: "none",
    border: "none",
    borderBottom: "1px solid #f9fafb",
    cursor: "pointer",
    textAlign: "left",
    fontFamily: "inherit",
    transition: "background 0.1s",
  },

  divider: {
    height: 8,
    background: "#f9fafb",
    borderTop: "1px solid #f3f4f6",
    borderBottom: "1px solid #f3f4f6",
    margin: "4px 0",
  },

  /* Body-level bottom padding so content isn't hidden under the bar */
  bodyPad: {
    height: "calc(58px + env(safe-area-inset-bottom, 0px))",
    flexShrink: 0,
  },
};

/* ─── Icons ──────────────────────────────────────────────── */
const IcoHome = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5z" />
    <polyline points="9 22 9 12 15 12 15 22" />
  </svg>
);

const IcoMenu = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
    <path fillRule="evenodd" clipRule="evenodd" d="M2 5.75A.75.75 0 0 1 2.75 5h18.5a.75.75 0 0 1 0 1.5H2.75A.75.75 0 0 1 2 5.75ZM2 12a.75.75 0 0 1 .75-.75h18.5a.75.75 0 0 1 0 1.5H2.75A.75.75 0 0 1 2 12Zm0 6.25a.75.75 0 0 1 .75-.75h18.5a.75.75 0 0 1 0 1.5H2.75a.75.75 0 0 1-.75-.75Z" />
  </svg>
);

const IcoSearch = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);

const IcoCart = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
    <path fillRule="evenodd" clipRule="evenodd" d="M1 2.75A.75.75 0 0 1 1.75 2h.52a2.25 2.25 0 0 1 2.21 1.81L4.71 5h15.56a2 2 0 0 1 1.97 2.33l-1.41 6.71A3 3 0 0 1 17.88 16H7.64a3 3 0 0 1-2.95-2.46L2.76 3.6A.75.75 0 0 0 2.27 3H1.75A.75.75 0 0 1 1 2.75ZM6 19a2 2 0 1 1 4 0 2 2 0 0 1-4 0Zm9 0a2 2 0 1 1 4 0 2 2 0 0 1-4 0Z" />
  </svg>
);

const IcoUser = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17.982 18.725A7.488 7.488 0 0 0 12 15.75a7.488 7.488 0 0 0-5.982 2.975m11.963 0a9 9 0 1 0-11.963 0m11.963 0A8.966 8.966 0 0 1 12 21a8.966 8.966 0 0 1-5.982-2.275M15 9.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
  </svg>
);

const IcoChevron = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.35, flexShrink: 0 }}>
    <path d="M9 18l6-6-6-6" />
  </svg>
);

const IcoClose = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M18 6L6 18M6 6l12 12" />
  </svg>
);

const IcoLogout = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <polyline points="16 17 21 12 16 7" />
    <line x1="21" y1="12" x2="9" y2="12" />
  </svg>
);

/* ─── Hover helpers ──────────────────────────────────────── */
function HoverLink({ style, ...props }) {
  const [hov, setHov] = useState(false);
  return (
    <Link
      {...props}
      style={{ ...style, background: hov ? "#f3f4f6" : "transparent" }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
    />
  );
}

function HoverBtn({ style, ...props }) {
  const [hov, setHov] = useState(false);
  return (
    <button
      {...props}
      style={{ ...style, background: hov ? "#f3f4f6" : "transparent" }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
    />
  );
}

/* ─── Main component ─────────────────────────────────────── */
export default function MobileNav() {
  const pathname = usePathname();
  const { isAuthenticated, user, logout } = useAuth();
  const { openCartSidebar, itemCount } = useCart();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [categories, setCategories] = useState([]);
  const [menuItems, setMenuItems] = useState([]);
  const [logo, setLogo] = useState("");
  const [logoHeight, setLogoHeight] = useState(30);
  const drawerRef = useRef(null);

  /* Fetch data once */
  useEffect(() => {
    fetch("/api/store-seller-settings?seller_id=default", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        setLogo(d?.shop_logo_url || "");
        setLogoHeight(d?.shop_logo_height ? Math.min(Number(d.shop_logo_height), 36) : 30);
      })
      .catch(() => {});

    fetch("/api/store-categories?tree=true&is_visible=true")
      .then((r) => r.json())
      .then((d) => {
        const tree = d?.tree || [];
        const roots = tree
          .filter((n) => n && !n.parent_id && n.has_products !== false && n.slug)
          .map((n) => ({ id: n.id, label: n.name || n.slug, href: `/${n.slug}` }))
          .sort((a, b) => a.label.localeCompare(b.label));
        setCategories(roots);
      })
      .catch(() => {});

    fetch("/api/store-menus")
      .then((r) => r.json())
      .then((d) => {
        const menus = Array.isArray(d?.menus) ? d.menus : [];
        const main = menus.find((m) => m?.location === "main") || menus[0];
        const rootItems = (main?.items || []).filter((i) => !i?.parent_id).slice(0, 12);
        setMenuItems(rootItems);
      })
      .catch(() => {});
  }, []);

  /* Close drawer on route change */
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  /* Body scroll lock when drawer open */
  useEffect(() => {
    if (drawerOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [drawerOpen]);

  /* Close on Escape key */
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") setDrawerOpen(false); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  const displayName = user
    ? [user.first_name || user.firstName, user.last_name || user.lastName].filter(Boolean).join(" ") || user.email || "Mein Konto"
    : null;

  const isHome = pathname === "/" || pathname === "";

  return (
    /* Only rendered/visible on mobile — display:none injected via globals.css on desktop */
    <div className="belucha-mobile-nav-root">
      {/* ── Drawer Overlay ── */}
      <div
        style={css.overlay(drawerOpen)}
        onClick={closeDrawer}
        aria-hidden="true"
      />

      {/* ── Side Drawer ── */}
      <div
        ref={drawerRef}
        style={css.drawer(drawerOpen)}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation"
      >
        {/* Drawer head */}
        <div style={css.drawerHead}>
          <Link href="/" onClick={closeDrawer} style={{ textDecoration: "none", display: "flex", alignItems: "center" }}>
            {logo ? (
              <img src={logo} alt="Logo" style={{ height: logoHeight, maxWidth: 160, objectFit: "contain" }} />
            ) : (
              <span style={{ fontSize: 22, fontWeight: 800, color: "#fff", letterSpacing: "-0.03em" }}>Belucha</span>
            )}
          </Link>
          <button
            type="button"
            onClick={closeDrawer}
            aria-label="Menü schließen"
            style={{ background: "rgba(255,255,255,0.15)", border: "none", color: "#fff", cursor: "pointer", padding: 8, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}
          >
            <IcoClose />
          </button>
        </div>

        {/* Drawer scrollable body */}
        <div style={css.drawerBody}>

          {/* User greeting */}
          {isAuthenticated && displayName && (
            <div style={{ padding: "14px 16px 10px", background: "#f9fafb", borderBottom: "1px solid #f3f4f6" }}>
              <div style={{ fontSize: 12, color: "#9ca3af", fontWeight: 500, marginBottom: 2 }}>Angemeldet als</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#111827", truncate: "ellipsis" }}>{displayName}</div>
            </div>
          )}

          {/* Categories */}
          {categories.length > 0 && (
            <>
              <div style={css.sectionLabel}>Kategorien</div>
              {categories.slice(0, 18).map((cat) => (
                <HoverLink key={cat.id} href={cat.href} onClick={closeDrawer} style={css.drawerLink}>
                  <span>{cat.label}</span>
                  <IcoChevron />
                </HoverLink>
              ))}
            </>
          )}

          {/* Menu items (if different from categories) */}
          {menuItems.length > 0 && (
            <>
              <div style={css.divider} />
              <div style={css.sectionLabel}>Menü</div>
              {menuItems.map((item) => {
                let href = "#";
                if (item.link_type === "url" && item.link_value) href = item.link_value;
                else if (item.slug) href = `/${item.slug}`;
                else if (item.link_value && !item.link_value.startsWith("{")) href = `/${item.link_value.replace(/^\//, "")}`;
                return (
                  <HoverLink key={item.id} href={href === "#" ? "/" : href} onClick={closeDrawer} style={css.drawerLink}>
                    <span>{item.label}</span>
                    <IcoChevron />
                  </HoverLink>
                );
              })}
            </>
          )}

          {/* Account section */}
          <div style={css.divider} />
          {isAuthenticated ? (
            <>
              <div style={css.sectionLabel}>Mein Konto</div>
              <HoverLink href="/account"       onClick={closeDrawer} style={css.drawerLink}><span>Übersicht</span><IcoChevron /></HoverLink>
              <HoverLink href="/orders"        onClick={closeDrawer} style={css.drawerLink}><span>Bestellungen</span><IcoChevron /></HoverLink>
              <HoverLink href="/addresses"     onClick={closeDrawer} style={css.drawerLink}><span>Adressen</span><IcoChevron /></HoverLink>
              <HoverLink href="/merkzettel"    onClick={closeDrawer} style={css.drawerLink}><span>Merkzettel</span><IcoChevron /></HoverLink>
              <HoverLink href="/nachrichten"   onClick={closeDrawer} style={css.drawerLink}><span>Nachrichten</span><IcoChevron /></HoverLink>
              <div style={css.divider} />
              <HoverBtn
                style={{ ...css.drawerBtn, color: "#ef4444" }}
                onClick={() => {
                  closeDrawer();
                  document.cookie = "belucha_cauth=; path=/; max-age=0; SameSite=Lax";
                  logout();
                }}
              >
                <span>Abmelden</span>
                <IcoLogout />
              </HoverBtn>
            </>
          ) : (
            <>
              <div style={css.sectionLabel}>Konto</div>
              <HoverLink href="/login"    onClick={closeDrawer} style={{ ...css.drawerLink, fontWeight: 700, color: TEAL }}>
                <span>Anmelden</span><IcoChevron />
              </HoverLink>
              <HoverLink href="/register" onClick={closeDrawer} style={css.drawerLink}>
                <span>Registrieren</span><IcoChevron />
              </HoverLink>
            </>
          )}

          {/* Quick links */}
          <div style={css.divider} />
          <div style={css.sectionLabel}>Service</div>
          <HoverLink href="/search" onClick={closeDrawer} style={{ ...css.drawerLink, fontSize: 14, color: "#6b7280" }}>
            <span>Suche</span><IcoChevron />
          </HoverLink>
          <HoverLink href="/bestsellers" onClick={closeDrawer} style={{ ...css.drawerLink, fontSize: 14, color: "#6b7280" }}>
            <span>Bestseller</span><IcoChevron />
          </HoverLink>

          {/* Bottom padding */}
          <div style={{ height: 24 }} />
        </div>
      </div>

      {/* ── Bottom Navigation Bar ── */}
      <nav style={css.bar} aria-label="Mobile Navigation">
        {/* Home */}
        <Link href="/" style={css.barBtn(isHome)} aria-label="Startseite">
          <IcoHome />
          <span>Home</span>
        </Link>

        {/* Categories / Menu */}
        <button
          type="button"
          style={css.barBtn(drawerOpen)}
          onClick={() => setDrawerOpen((v) => !v)}
          aria-label="Menü öffnen"
          aria-expanded={drawerOpen}
        >
          <IcoMenu />
          <span>Menü</span>
        </button>

        {/* Search */}
        <Link href="/search" style={css.barBtn(false)} aria-label="Suchen">
          <IcoSearch />
          <span>Suchen</span>
        </Link>

        {/* Cart */}
        <button
          type="button"
          style={css.barBtn(false)}
          onClick={openCartSidebar}
          aria-label="Warenkorb"
        >
          <div style={{ position: "relative", display: "inline-flex" }}>
            <IcoCart />
            {itemCount > 0 && (
              <span style={css.cartBadge}>{itemCount > 99 ? "99+" : itemCount}</span>
            )}
          </div>
          <span>Warenkorb</span>
        </button>

        {/* Account */}
        <Link
          href={isAuthenticated ? "/account" : "/login"}
          style={css.barBtn(false)}
          aria-label={isAuthenticated ? "Mein Konto" : "Anmelden"}
        >
          <div style={{ position: "relative", display: "inline-flex" }}>
            <IcoUser />
            {isAuthenticated && (
              <span style={{ ...css.cartBadge, background: "#22c55e", minWidth: 10, height: 10, top: -2, right: -4 }} />
            )}
          </div>
          <span>{isAuthenticated ? "Konto" : "Login"}</span>
        </Link>
      </nav>

      {/* Spacer so content isn't hidden under bottom bar */}
      <div className="belucha-mobile-nav-pad" style={css.bodyPad} aria-hidden="true" />
    </div>
  );
}
