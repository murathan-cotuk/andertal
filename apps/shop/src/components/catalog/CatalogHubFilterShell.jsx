"use client";

import { useEffect, useState } from "react";
import styled from "styled-components";
import { Link } from "@/i18n/navigation";
import CatalogDrawerPortal, {
  CATALOG_DRAWER_MAX_PX,
  CATALOG_FILTER_OVERLAY_Z,
  CATALOG_FILTER_SIDEBAR_Z,
  catalogDrawerMaxCss,
} from "@/lib/catalog-drawer-portal";

/**
 * Catalog hub filter rail (bestsellers / sales / CMS category sidebar):
 * - Desktop (≥1024): sticky left bar
 * - Tablet + mobile (≤1023): top-left control opens a left drawer
 */

const Shell = styled.div`
  display: flex;
  align-items: flex-start;
  max-width: 1440px;
  margin: 0 auto;
  width: 100%;
  box-sizing: border-box;
`;

const DesktopRail = styled.aside`
  width: ${(p) => p.$width || "220px"};
  flex-shrink: 0;
  padding: 28px 16px 32px 24px;
  position: sticky;
  top: 120px;
  max-height: calc(100vh - 120px);
  overflow-y: auto;
  box-sizing: border-box;

  @media (max-width: ${CATALOG_DRAWER_MAX_PX}px) {
    display: none;
  }
`;

const RailTitle = styled.div.attrs({ className: "shop-typo-sidebar-nav" })`
  margin-bottom: 10px;
`;

const RailLink = styled(Link).attrs((p) => ({
  className: p.$active ? "shop-typo-sidebar-submenu is-active" : "shop-typo-sidebar-submenu",
}))`
  display: block;
  padding: 8px 10px;
  border-radius: 8px;
  text-decoration: none;
  background: ${(p) => (p.$active ? "#f4f4f2" : "transparent")};
  color: ${(p) => (p.$active ? "var(--sidebar-nav-color, #111)" : "var(--sidebar-submenu-color, #333)")};
  font-weight: ${(p) => (p.$active ? 600 : "var(--sidebar-submenu-fw, 400)")};

  &:hover {
    background: #f4f4f2;
    color: var(--sidebar-nav-color, #111);
  }
`;

const MainCol = styled.div`
  flex: 1;
  min-width: 0;
`;

const MobileBar = styled.div`
  display: none;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  border-bottom: 1px solid #eee;
  box-sizing: border-box;

  @media (max-width: ${CATALOG_DRAWER_MAX_PX}px) {
    display: flex;
  }
`;

const FilterBtn = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 0;
  background: none;
  border: none;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: ${(p) => (p.$active ? "#111" : "#666")};
  cursor: pointer;
  border-bottom: 1.5px solid ${(p) => (p.$active ? "#111" : "transparent")};
  margin-bottom: -1px;
  line-height: 1.2;

  svg {
    width: 12px;
    height: 12px;
    stroke: currentColor;
    fill: none;
    stroke-width: 1.8;
  }
`;

const Overlay = styled.div`
  display: none;
  @media (max-width: ${CATALOG_DRAWER_MAX_PX}px) {
    display: block;
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.35);
    z-index: ${CATALOG_FILTER_OVERLAY_Z};
    opacity: ${(p) => (p.$open ? 1 : 0)};
    pointer-events: ${(p) => (p.$open ? "auto" : "none")};
    transition: opacity 0.2s ease;
  }
`;

const Drawer = styled.aside`
  display: none;
  @media (max-width: ${CATALOG_DRAWER_MAX_PX}px) {
    display: flex;
    flex-direction: column;
    position: fixed;
    top: 0;
    left: 0;
    width: min(380px, 92vw);
    height: 100dvh;
    z-index: ${CATALOG_FILTER_SIDEBAR_Z};
    background: #fff;
    box-shadow: 4px 0 32px rgba(0, 0, 0, 0.2);
    transform: translateX(${(p) => (p.$open ? "0" : "-100%")});
    transition: transform var(--app-duration-surface, 0.3s) var(--app-ease-out, cubic-bezier(0.4, 0, 0.2, 1));
    box-sizing: border-box;
    overflow: hidden;
  }
`;

const DrawerHead = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 16px 12px;
  border-bottom: 1px solid #eee;
  flex-shrink: 0;
`;

const DrawerBody = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 8px 12px 24px;
`;

function labels(locale) {
  if (locale === "tr") return { categories: "Kategoriler", close: "Kapat" };
  if (locale === "en") return { categories: "Categories", close: "Close" };
  if (locale === "fr") return { categories: "Catégories", close: "Fermer" };
  if (locale === "es") return { categories: "Categorías", close: "Cerrar" };
  if (locale === "it") return { categories: "Categorie", close: "Chiudi" };
  return { categories: "Kategorien", close: "Schließen" };
}

/**
 * @param {{ slug: string, title: string, href?: string, active?: boolean, onClick?: function }[]} links
 * @param {string} [sidebarWidth]
 * @param {React.ReactNode} [mobileBarExtra] — e.g. title next to the filter button
 */
export default function CatalogHubFilterShell({
  links,
  locale = "de",
  children,
  sidebarWidth = "220px",
  mobileBarExtra = null,
}) {
  const [open, setOpen] = useState(false);
  const t = labels(locale);
  const list = Array.isArray(links) ? links.filter((l) => l && l.slug) : [];

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    if (!window.matchMedia(catalogDrawerMaxCss).matches) return undefined;
    const prev = document.body.style.overflow;
    if (open) document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!list.length) return children;

  const renderLinks = (closeOnNavigate) =>
    list.map((l) => {
      const href = l.href || `/${String(l.slug).replace(/^\//, "")}`;
      return (
        <RailLink
          key={l.slug}
          href={href}
          $active={!!l.active}
          onClick={(e) => {
            if (typeof l.onClick === "function") {
              e.preventDefault();
              l.onClick(l);
            }
            if (closeOnNavigate) setOpen(false);
          }}
        >
          {l.title || l.slug}
        </RailLink>
      );
    });

  return (
    <>
      <MobileBar>
        <FilterBtn type="button" $active={open} onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          <svg viewBox="0 0 16 12" aria-hidden>
            <line x1="0" y1="2" x2="16" y2="2" />
            <line x1="0" y1="6" x2="16" y2="6" />
            <line x1="0" y1="10" x2="16" y2="10" />
            <circle cx="5" cy="2" r="1.5" fill="#111" stroke="none" />
            <circle cx="11" cy="6" r="1.5" fill="#111" stroke="none" />
            <circle cx="5" cy="10" r="1.5" fill="#111" stroke="none" />
          </svg>
          {t.categories}
        </FilterBtn>
        {mobileBarExtra}
      </MobileBar>

      <Shell>
        <DesktopRail $width={sidebarWidth}>
          <RailTitle>{t.categories}</RailTitle>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>{renderLinks(false)}</div>
        </DesktopRail>
        <MainCol>{children}</MainCol>
      </Shell>

      <CatalogDrawerPortal>
        <>
          <Overlay $open={open} onClick={() => setOpen(false)} />
          <Drawer $open={open} aria-hidden={!open}>
            <DrawerHead>
              <span className="shop-typo-sidebar-nav">
                {t.categories}
              </span>
              <button
                type="button"
                aria-label={t.close}
                onClick={() => setOpen(false)}
                style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "#57534e", lineHeight: 1, padding: 4 }}
              >
                ×
              </button>
            </DrawerHead>
            <DrawerBody>{renderLinks(true)}</DrawerBody>
          </Drawer>
        </>
      </CatalogDrawerPortal>
    </>
  );
}
