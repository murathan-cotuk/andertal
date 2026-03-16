"use client";

/**
 * Navbar — At top: full header. Scroll down: header hides completely. Scroll up: header shows.
 */

import React, { useState, useEffect, useRef } from "react";
import { useRouter as useNextRouter } from "next/navigation";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { useLocale, useTranslations } from "next-intl";
import styled from "styled-components";
import { motion } from "framer-motion";
import { useCustomerAuth as useAuth } from "@belucha/lib";
import { getMedusaClient } from "@/lib/medusa-client";
import { useCart } from "@/context/CartContext";
import DropdownSearch from "@/components/DropdownSearch";
import TopBar from "@/components/TopBar";
import { tokens } from "@/design-system/tokens";
import { routing } from "@/i18n/routing";
import { resolveImageUrl } from "@/lib/image-url";

const SCROLL_THRESHOLD = 60;
const SCROLL_DELTA = 8; /* px; only toggle direction after this much scroll to avoid jitter */
const MINIMAL_BAR_HEIGHT = 74;
const MIDDLE_BAR_BG = "#1b8880";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function menuItemHref(item) {
  if (!item) return "#";
  const raw = item.link_value;
  let value = raw;
  if (typeof raw === "string" && raw.trim().startsWith("{")) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed.handle) value = parsed.handle;
      else if (parsed.slug) value = parsed.slug;
      else if (parsed.id) value = parsed.id;
    } catch (_) {}
  }
  if (item.link_type === "url" && value) return String(value).startsWith("http") ? value : `/${String(value).replace(/^\//, "")}`;
  if (item.link_type === "page" && value) return `/pages/${value}`;
  if (item.link_type === "product" && value) return `/produkt/${value}`;
  if (item.link_type === "category" || item.link_type === "collection") {
    if (value && typeof raw === "string" && raw.trim().startsWith("{")) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed.id && UUID_REGEX.test(String(parsed.id).trim())) return `/${parsed.id}`;
      } catch (_) {}
    }
    return value ? `/${value}` : "#";
  }
  return value ? `/${String(value).replace(/^\//, "")}` : "#";
}

const HeaderWrap = styled(motion.header)`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 200;
  background: rgba(255, 255, 255, 0.92);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  transition: transform 0.25s ease-out;
  overflow: hidden;
  visibility: ${(p) => (p.$visible ? "visible" : "hidden")};
  pointer-events: ${(p) => (p.$visible ? "auto" : "none")};
`;

/* —— Middle bar: zooplus-style (full-width colored bar) —— */

const MiddleBarWrap = styled.div`
  width: 100%;
  min-height: 64px;
  background-color: ${MIDDLE_BAR_BG};
  transition: background-color 0.3s ease;
`;

const MiddleBarInner = styled.div`
  max-width: 1280px;
  margin: 0 auto;
  padding: 0 24px;
  min-height: 64px;
  display: flex;
  align-items: center;
`;

const MiddleBarLeft = styled.div`
  flex: 0 0 auto;
  display: flex;
  align-items: center;
`;

const MiddleBarLogo = styled(Link)`
  color: #fff;
  font-size: 1.35rem;
  font-weight: 700;
  font-family: ${tokens.fontFamily.sans};
  text-decoration: none;
  padding: 0 4px 0 0;
  letter-spacing: -0.02em;
  transition: opacity 0.2s ease;

  &:hover {
    opacity: 0.92;
    color: #fff;
  }
`;

const MiddleBarCenter = styled.div`
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  margin-left: 28px;
  margin-right: 4px;
  gap: 0;
`;

/* Kategorien dropdown hemen search bar'ın solunda */
const CategoriesDropdown = styled.div`
  position: relative;
  flex-shrink: 0;
  margin-right: 4px;
`;

const CategoriesButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  padding: 0;
  border: none;
  background: transparent;
  color: #fff;
  cursor: pointer;

  &:hover {
    opacity: 0.85;
  }
`;

/* Search bar: tek pill konteyner (div; içteki DropdownSearch kendi form'unu kullanır, form içinde form olmaz) */
const SearchBarForm = styled.div`
  flex: 1;
  min-width: 0;
  width: 100%;
  display: flex;
  align-items: center;
  height: 48px;
  padding: 0 6px 0 18px;
  background: #fff;
  border-radius: 9999px;
  box-shadow: 0 2px 12px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.04);
  transition: box-shadow 0.2s ease, transform 0.2s ease;

  &:focus-within {
    box-shadow: 0 4px 20px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.04);
  }
`;

const SearchBarButton = styled.button`
  border: none;
  background: transparent;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  margin-right: 12px;
  color: #6b7280;
  flex-shrink: 0;
  &:focus {
    outline: none;
  }
  &:hover {
    color: #374151;
  }
`;

const SearchBarInputWrap = styled.div`
  flex: 1;
  min-width: 0;
  position: relative;
  height: 100%;
  display: flex;
  align-items: center;
`;

const MiddleBarSearch = styled.div`
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
`;

const MiddleBarRight = styled.div`
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
  min-width: 0;
`;

const MiddleBarIconBtn = styled.button`
  width: 46px;
  height: 46px;
  border: none;
  background: transparent;
  color: #fff;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  transition: background 0.2s ease;

  &:hover {
    background: rgba(255,255,255,0.15);
    color: #fff;
  }
`;

const MiddleBarAccountWrap = styled.div`
  position: relative;
`;

const MiddleBarCartBtn = styled(MiddleBarIconBtn)`
  position: relative;
`;

const MiddleBarCartBadge = styled.span`
  position: absolute;
  top: 6px;
  right: 6px;
  background: #fff;
  color: ${MIDDLE_BAR_BG};
  border-radius: 50%;
  min-width: 18px;
  height: 18px;
  font-size: 11px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
`;

/* Locale dropdown trigger – sadece ikon */
const MiddleBarLocaleBtn = styled(MiddleBarIconBtn)``;

const CategoriesPanel = styled(motion.div)`
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  min-width: 260px;
  background: ${tokens.background.card};
  border: 1px solid ${tokens.border.light};
  border-radius: 12px;
  box-shadow: ${tokens.shadow.hover};
  padding: 8px 0;
  z-index: 99999;
  display: ${(p) => (p.$open ? "block" : "none")};
`;

const CategoryItem = styled(Link)`
  display: block;
  padding: 12px 20px;
  color: ${tokens.dark[700]};
  font-size: 14px;
  font-family: ${tokens.fontFamily.sans};
  text-decoration: none;
  transition: background ${tokens.transition.base}, color ${tokens.transition.base};

  &:hover {
    background: ${tokens.background.soft};
    color: ${tokens.primary.DEFAULT};
  }
`;

const CategoryItemBanner = styled.div`
  width: 100%;
  height: 56px;
  margin: -8px -20px 8px -20px;
  padding: 0;
  overflow: hidden;
  border-radius: 12px 12px 0 0;
  background: transparent;
  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
`;

/* Keep for minimal bar & dropdowns */
const Right = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`;

const NavDivider = styled.span`
  width: 1px;
  height: 24px;
  background: ${tokens.border.light};
`;

const IconBtn = styled(Link)`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  color: ${tokens.dark[600]};
  transition: background ${tokens.transition.base}, color ${tokens.transition.base};

  &:hover {
    background: ${tokens.background.soft};
    color: ${tokens.primary.DEFAULT};
  }
`;

const CartBtn = styled(IconBtn)`
  position: relative;
`;

const CartBadge = styled.span`
  position: absolute;
  top: 6px;
  right: 6px;
  background: ${tokens.primary.DEFAULT};
  color: white;
  border-radius: 50%;
  min-width: 18px;
  height: 18px;
  font-size: 11px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px solid ${tokens.background.main};
`;

const UserMenu = styled.div`
  position: relative;
`;

const UserBtn = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border: none;
  background: transparent;
  border-radius: 50%;
  color: ${tokens.dark[600]};
  cursor: pointer;
  transition: background ${tokens.transition.base}, color ${tokens.transition.base};

  &:hover {
    background: ${tokens.background.soft};
    color: ${tokens.primary.DEFAULT};
  }
`;

const UserDropdown = styled(motion.div)`
  position: absolute;
  top: calc(100% + 10px);
  right: 0;
  min-width: 220px;
  background: ${tokens.background.card};
  border: 1px solid ${tokens.border.light};
  border-radius: 12px;
  box-shadow: ${tokens.shadow.hover};
  padding: 8px 0;
  z-index: 99999;
  display: ${(p) => (p.$open ? "block" : "none")};
`;

const UserDropdownItem = styled(Link)`
  display: block;
  padding: ${tokens.spacing.sm} ${tokens.spacing.md};
  font-size: ${tokens.fontSize.small};
  color: ${tokens.dark[700]};
  font-family: ${tokens.fontFamily.sans};
  text-decoration: none;
  transition: background ${tokens.transition.base}, color ${tokens.transition.base};

  &:hover {
    background: ${tokens.background.soft};
    color: ${tokens.primary.DEFAULT};
    text-decoration: underline;
  }
`;

const UserDropdownBtn = styled.button`
  display: block;
  width: 100%;
  text-align: left;
  padding: ${tokens.spacing.sm} ${tokens.spacing.md};
  font-size: ${tokens.fontSize.small};
  color: ${tokens.dark[700]};
  border: none;
  background: transparent;
  cursor: pointer;
  font-family: ${tokens.fontFamily.sans};
  transition: background ${tokens.transition.base}, color ${tokens.transition.base};

  &:hover {
    background: ${tokens.background.soft};
    color: ${tokens.primary.DEFAULT};
    text-decoration: underline;
  }
`;

const SubNavWrap = styled.div`
  width: 100%;
  min-height: ${(p) => (p.$hide ? "0" : "36px")};
  max-height: ${(p) => (p.$hide ? "0" : "36px")};
  background: ${(p) => (p.$hide ? "transparent" : "#f0f0f0")};
  border-top: ${(p) => (p.$hide ? "none" : "1px solid rgba(0, 0, 0, 0.06)")};
  border-bottom: ${(p) => (p.$hide ? "none" : "1px solid rgba(0, 0, 0, 0.08)")};
  overflow: hidden;
  opacity: ${(p) => (p.$hide ? 0 : 1)};
  visibility: ${(p) => (p.$hide ? "hidden" : "visible")};
  clip-path: ${(p) => (p.$hide ? "inset(0 0 100% 0)" : "none")};
  transition: max-height ${tokens.transition.base}, min-height ${tokens.transition.base}, opacity ${tokens.transition.base};
  box-shadow: none;
  display: flex;
  align-items: center;
`;

const SecondMenuRowInner = styled.div`
  width: 100%;
  max-width: 1280px;
  margin: 0 auto;
  padding: 0 ${tokens.containerPadding};
  display: flex;
  gap: ${tokens.spacing.lg};
  align-items: center;
  justify-content: flex-start;
  font-size: 13px;
  min-height: 36px;
`;

const SecondLink = styled(Link)`
  color: ${tokens.dark[600]};
  font-weight: 500;
  font-family: ${tokens.fontFamily.sans};
  text-decoration: none;
  transition: color ${tokens.transition.base};
  display: inline-flex;
  align-items: center;
  line-height: 1;

  &:hover {
    color: ${tokens.primary.DEFAULT};
    text-decoration: underline;
  }
`;

const HeaderSpacer = styled.div`
  height: ${(p) => (p.$visible ? (p.$atTop ? "132px" : `${MINIMAL_BAR_HEIGHT}px`) : "0")};
  transition: height 0.25s ease-out;
  flex-shrink: 0;
`;

const LocaleCurrencyWrap = styled.div`
  position: relative;
  flex-shrink: 0;
`;

const LocaleCurrencyBtn = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 0 14px;
  height: 44px;
  background: transparent;
  border: none;
  border-radius: ${tokens.radius.button};
  font-size: 13px;
  font-weight: 600;
  color: ${tokens.dark[600]};
  cursor: pointer;
  font-family: ${tokens.fontFamily.sans};
  transition: background ${tokens.transition.base}, color ${tokens.transition.base};

  &:hover {
    background: ${tokens.background.soft};
    color: ${tokens.dark[900]};
  }
`;

const LocaleDropdown = styled(motion.div)`
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  min-width: 160px;
  background: ${tokens.background.card};
  border: 1px solid ${tokens.border.light};
  border-radius: 12px;
  box-shadow: ${tokens.shadow.hover};
  padding: 6px 0;
  z-index: 99999;
  display: ${(p) => (p.$open ? "block" : "none")};
`;

const LocaleOption = styled.button`
  display: block;
  width: 100%;
  text-align: left;
  padding: 10px 16px;
  font-size: 14px;
  color: ${tokens.dark[700]};
  border: none;
  background: transparent;
  cursor: pointer;
  font-family: ${tokens.fontFamily.sans};
  transition: background ${tokens.transition.base}, color ${tokens.transition.base};

  &:hover {
    background: ${tokens.background.soft};
    color: ${tokens.primary.DEFAULT};
  }
`;

export default function ShopHeader() {
  const pathname = usePathname() || "/";
  const nextRouter = useNextRouter();
  const [scrollY, setScrollY] = useState(0);
  const [scrollingDown, setScrollingDown] = useState(false);
  const lastScrollYRef = useRef(0);
  const [mainMenuOpen, setMainMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [localeDropdownOpen, setLocaleDropdownOpen] = useState(false);
  const [mainMenuItems, setMainMenuItems] = useState([]);
  const [secondMenuItems, setSecondMenuItems] = useState([]);
  const { isAuthenticated, user, logout } = useAuth();
  const { openCartSidebar, itemCount } = useCart();
  const tLocale = useTranslations("locale");
  const locale = useLocale();

  useEffect(() => {
    const norm = (s) => String(s || "").toLowerCase().trim();
    const applyMenus = (locData, menuData) => {
      const locs = locData?.locations || [];
      const menus = Array.isArray(menuData?.menus) ? menuData.menus : [];
      const subnavLoc = locs.find((l) => norm(l?.html_id) === "subnav");
      const subnavSlug = norm(subnavLoc?.slug || "second");
      const main = menus.find((m) => norm(m?.location) === "main") || menus[0];
      const second =
        menus.find((m) => norm(m?.location) === subnavSlug) ||
        menus.find((m) => norm(m?.slug) === "second-menu");
      const rootItems = (arr) => (arr || []).filter((i) => !i?.parent_id);
      setMainMenuItems(main ? rootItems(main.items) : []);
      setSecondMenuItems(second ? rootItems(second.items) : []);
    };
    Promise.all([
      fetch("/api/store-menu-locations").then((r) => r.json()).catch(() => ({ locations: [] })),
      fetch("/api/store-menus").then((r) => r.json()).catch(() => ({ menus: [] })),
    ]).then(([locData, menuData]) => {
      const hasMenus = Array.isArray(menuData?.menus) && menuData.menus.length > 0;
      if (hasMenus) {
        applyMenus(locData, menuData);
        return;
      }
      const client = getMedusaClient();
      Promise.all([
        client.getMenuLocations().catch(() => ({ locations: [] })),
        client.getMenus().catch(() => ({ menus: [] })),
      ]).then(([locData2, menuData2]) => applyMenus(locData2, menuData2));
    });
  }, []);

  useEffect(() => {
    let ticking = false;
    const handleScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const current = window.scrollY ?? window.pageYOffset ?? 0;
        const prev = lastScrollYRef.current;
        const delta = current - prev;
        if (delta > SCROLL_DELTA) setScrollingDown(true);
        else if (delta < -SCROLL_DELTA) setScrollingDown(false);
        lastScrollYRef.current = current;
        setScrollY(current);
        ticking = false;
      });
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    const close = () => {
      setMainMenuOpen(false);
      setUserMenuOpen(false);
      setLocaleDropdownOpen(false);
    };
    document.addEventListener("mousedown", (e) => {
      if (!e.target.closest("[data-categories-dropdown]") && !e.target.closest("[data-user-menu]") && !e.target.closest("[data-locale-dropdown]")) close();
    });
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const atTop = scrollY <= SCROLL_THRESHOLD;
  const showSubNav = atTop && !scrollingDown;
  /* Header only visible when scrolling up (or initial load when scrollingDown is false) */
  const showHeader = !scrollingDown;

  const algoliaAttributes = {
    primaryText: "title",
    secondaryText: "description",
    tertiaryText: "brand",
    url: "handle",
    image: "thumbnail",
  };

  return (
    <>
      <HeaderWrap $atTop={atTop} $visible={showHeader} style={{ transform: showHeader ? undefined : "translateY(-100%)" }}>
        {atTop && <TopBar />}
        <MiddleBarWrap>
          <MiddleBarInner>
            <MiddleBarLeft>
              <MiddleBarLogo href="/">Belucha</MiddleBarLogo>
            </MiddleBarLeft>

            <MiddleBarCenter>
              <CategoriesDropdown data-categories-dropdown>
                <CategoriesButton type="button" onClick={() => { setLocaleDropdownOpen(false); setUserMenuOpen(false); setMainMenuOpen((v) => !v); }} aria-expanded={mainMenuOpen} aria-label="Kategorien">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path fillRule="evenodd" clipRule="evenodd" d="M2 5.75C2 5.33579 2.33579 5 2.75 5H21.25C21.6642 5 22 5.33579 22 5.75C22 6.16421 21.6642 6.5 21.25 6.5H2.75C2.33579 6.5 2 6.16421 2 5.75ZM2 12C2 11.5858 2.33579 11.25 2.75 11.25H21.25C21.6642 11.25 22 11.5858 22 12C22 12.4142 21.6642 12.75 21.25 12.75H2.75C2.33579 12.75 2 12.4142 2 12ZM2 18.25C2 17.8358 2.33579 17.5 2.75 17.5H21.25C21.6642 17.5 22 17.8358 22 18.25C22 18.6642 21.6642 19 21.25 19H2.75C2.33579 19 2 18.6642 2 18.25Z" />
                  </svg>
                </CategoriesButton>
                <CategoriesPanel $open={mainMenuOpen}>
                  {mainMenuItems.length === 0 && (
                    <div style={{ padding: 12, color: tokens.dark[500], fontSize: 14 }}>Keine Kategorien</div>
                  )}
                  {mainMenuItems.map((item) => (
                    <CategoryItem key={item.id} href={menuItemHref(item)} onClick={() => setMainMenuOpen(false)}>
                      {item.banner_url && (
                        <CategoryItemBanner>
                          <img src={resolveImageUrl(item.banner_url)} alt="" />
                        </CategoryItemBanner>
                      )}
                      {item.label}
                    </CategoryItem>
                  ))}
                </CategoriesPanel>
              </CategoriesDropdown>
              <MiddleBarSearch>
                <SearchBarForm role="search">
                  <SearchBarButton type="button" aria-label="Suchen">
                    <svg version="1.1" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" fill="currentColor" style={{ minWidth: 20, height: 20 }}>
                      <path d="M17.545 15.467l-3.779-3.779c0.57-0.935 0.898-2.035 0.898-3.21 0-3.417-2.961-6.377-6.378-6.377s-6.186 2.769-6.186 6.186c0 3.416 2.961 6.377 6.377 6.377 1.137 0 2.2-0.309 3.115-0.844l3.799 3.801c0.372 0.371 0.975 0.371 1.346 0l0.943-0.943c0.371-0.371 0.236-0.84-0.135-1.211zM4.004 8.287c0-2.366 1.917-4.283 4.282-4.283s4.474 2.107 4.474 4.474c0 2.365-1.918 4.283-4.283 4.283s-4.473-2.109-4.473-4.474z" />
                    </svg>
                  </SearchBarButton>
                  <SearchBarInputWrap>
                    <DropdownSearch
                      placeholder="Wunschprodukte suchen"
                      hitsPerPage={5}
                      attributes={algoliaAttributes}
                      maxHeight={tokens.search.dropdownMaxHeight}
                      hideSearchIcon
                      pill
                    />
                  </SearchBarInputWrap>
                </SearchBarForm>
              </MiddleBarSearch>
            </MiddleBarCenter>

            <MiddleBarRight>
              <LocaleCurrencyWrap data-locale-dropdown>
                <MiddleBarLocaleBtn type="button" onClick={() => { setUserMenuOpen(false); setMainMenuOpen(false); setLocaleDropdownOpen((v) => !v); }} title={tLocale("label")} aria-label="Sprache" aria-haspopup="listbox" aria-expanded={localeDropdownOpen}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 0 1 3 12c0-1.605.42-3.113 1.157-4.418" />
                  </svg>
                </MiddleBarLocaleBtn>
                <LocaleDropdown $open={localeDropdownOpen} initial={false}>
                  {routing.locales.map((loc) => (
                    <LocaleOption
                      key={loc}
                      type="button"
                      onClick={() => {
                        setLocaleDropdownOpen(false);
                        const base = pathname === "/" ? "" : pathname;
                        nextRouter.push(`/${loc}${base}`);
                      }}
                    >
                      {tLocale(loc)}
                    </LocaleOption>
                  ))}
                </LocaleDropdown>
              </LocaleCurrencyWrap>
              <MiddleBarAccountWrap data-user-menu>
                <MiddleBarIconBtn type="button" onClick={() => { setLocaleDropdownOpen(false); setMainMenuOpen(false); setUserMenuOpen((v) => !v); }} title="Mein Konto" aria-label="Mein Konto">
                  <svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M17.982 18.725A7.488 7.488 0 0 0 12 15.75a7.488 7.488 0 0 0-5.982 2.975m11.963 0a9 9 0 1 0-11.963 0m11.963 0A8.966 8.966 0 0 1 12 21a8.966 8.966 0 0 1-5.982-2.275M15 9.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                  </svg>
                </MiddleBarIconBtn>
                <UserDropdown $open={userMenuOpen}>
                  {isAuthenticated ? (
                    <>
                      {user && (
                        <div style={{ padding: "12px 20px", fontSize: 14, fontWeight: 600, color: tokens.dark[800], borderBottom: `1px solid ${tokens.border.light}` }}>
                          {user.firstName} {user.lastName}
                        </div>
                      )}
                      <UserDropdownItem href="/account" onClick={() => setUserMenuOpen(false)}>Mein Belucha</UserDropdownItem>
                      <UserDropdownItem href="/orders" onClick={() => setUserMenuOpen(false)}>Meine Bestellungen</UserDropdownItem>
                      <UserDropdownItem href="/reviews" onClick={() => setUserMenuOpen(false)}>Yorumlar</UserDropdownItem>
                      <UserDropdownItem href="/invoices" onClick={() => setUserMenuOpen(false)}>Faturalar</UserDropdownItem>
                      <UserDropdownItem href="/favorites" onClick={() => setUserMenuOpen(false)}>Merkzettel</UserDropdownItem>
                      <UserDropdownItem href="/addresses" onClick={() => setUserMenuOpen(false)}>Adressen</UserDropdownItem>
                      <UserDropdownItem href="/bonus" onClick={() => setUserMenuOpen(false)}>Meine Bonuspunkte</UserDropdownItem>
                      <UserDropdownBtn onClick={() => { logout(); setUserMenuOpen(false); }}>Abmelden</UserDropdownBtn>
                    </>
                  ) : (
                    <>
                      <UserDropdownItem href="/login" onClick={() => setUserMenuOpen(false)}>Anmelden</UserDropdownItem>
                      <UserDropdownItem href="/register" onClick={() => setUserMenuOpen(false)}>Registrieren</UserDropdownItem>
                    </>
                  )}
                </UserDropdown>
              </MiddleBarAccountWrap>
              <MiddleBarCartBtn type="button" onClick={openCartSidebar} title="Warenkorb" aria-label="Warenkorb">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path fillRule="evenodd" clipRule="evenodd" d="M1 2.75C1 2.33579 1.33579 2 1.75 2H2.27029C3.34283 2 4.26626 2.75703 4.4766 3.80874L4.71485 5H20.2676C21.3791 5 22.209 6.02281 21.98 7.11052L20.5682 13.8165C20.3003 15.0891 19.1777 16 17.8772 16H7.63961C6.32874 16 5.20009 15.0747 4.94301 13.7893L3.00573 4.10291C2.93562 3.75234 2.6278 3.5 2.27029 3.5H1.75C1.33579 3.5 1 3.16421 1 2.75ZM6 19C6 17.8954 6.89543 17 8 17C9.10457 17 10 17.8954 10 19C10 20.1046 9.10457 21 8 21C6.89543 21 6 20.1046 6 19ZM15 19C15 17.8954 15.8954 17 17 17C18.1046 17 19 17.8954 19 19C19 20.1046 18.1046 21 17 21C15.8954 21 15 20.1046 15 19Z" />
                </svg>
                {itemCount > 0 && <MiddleBarCartBadge>{itemCount}</MiddleBarCartBadge>}
              </MiddleBarCartBtn>
            </MiddleBarRight>
          </MiddleBarInner>
        </MiddleBarWrap>
        <SubNavWrap id="subnav" $hide={!showSubNav}>
          <SecondMenuRowInner>
            {secondMenuItems.map((item) => (
              <SecondLink key={item.id} href={menuItemHref(item)}>{item.label}</SecondLink>
            ))}
          </SecondMenuRowInner>
        </SubNavWrap>
      </HeaderWrap>

      <HeaderSpacer $atTop={atTop} $visible={showHeader} />
    </>
  );
}
