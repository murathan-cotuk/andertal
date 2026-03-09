"use client";

/**
 * Navbar — Premium marketplace: sticky only on scroll UP.
 * Scroll down → header hides. Scroll up → header shows (compact 60px).
 * Backdrop blur, Framer Motion, hover underline, shadow when compact.
 */

import React, { useState, useEffect } from "react";
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

const SCROLL_THRESHOLD = 80;

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
  if ((item.link_type === "category" || item.link_type === "collection") && value) return `/${value}`;
  if (item.link_type === "page" && value) return `/pages/${value}`;
  if (item.link_type === "product" && value) return `/produkt/${value}`;
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
  border-bottom: ${tokens.navbar.borderBottom};
  box-shadow: ${(p) => (p.$compact ? tokens.shadow.hover : "0 1px 0 " + tokens.border.light)};
  transition: box-shadow ${tokens.transition.base};
`;

const NavRow = styled.div`
  height: ${(p) => (p.$compact ? tokens.navbar.heightCompact : tokens.navbar.height)};
  max-width: 1280px;
  margin: 0 auto;
  padding: 0 ${tokens.containerPadding};
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: ${tokens.spacing.lg};
  transition: height ${tokens.transition.base};
`;

const Logo = styled(Link)`
  font-size: ${(p) => (p.$compact ? "18px" : tokens.fontSize.h4)};
  font-weight: 700;
  color: ${tokens.dark[900]};
  font-family: ${tokens.fontFamily.sans};
  text-decoration: none;
  transition: color ${tokens.transition.base}, font-size ${tokens.transition.base};

  &:hover {
    color: ${tokens.primary.DEFAULT};
    text-decoration: underline;
  }
`;

const Center = styled.div`
  display: flex;
  align-items: center;
  gap: ${tokens.spacing.md};
  max-width: 700px;
  width: 100%;
  margin: 0 auto;
`;

const SearchWrap = styled.div`
  flex: 1;
  min-width: 0;
`;

const CategoriesDropdown = styled.div`
  position: relative;
  flex-shrink: 0;
`;

const CategoriesButton = styled.button`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: ${tokens.spacing.sm} ${tokens.spacing.md};
  background: ${tokens.background.main};
  border: 1px solid ${tokens.border.light};
  border-radius: ${tokens.radius.input};
  font-size: ${tokens.fontSize.small};
  font-weight: 500;
  color: ${tokens.dark[700]};
  cursor: pointer;
  white-space: nowrap;
  font-family: ${tokens.fontFamily.sans};
  transition: border-color ${tokens.transition.base}, background ${tokens.transition.base};

  &:hover {
    background: ${tokens.background.soft};
    border-color: ${tokens.dark[500]};
    text-decoration: underline;
  }
`;

const CategoriesPanel = styled(motion.div)`
  position: absolute;
  top: 100%;
  left: 0;
  margin-top: ${tokens.spacing.xs};
  max-width: 260px;
  min-width: 220px;
  background: ${tokens.background.card};
  border: 1px solid ${tokens.border.light};
  border-radius: ${tokens.radius.button};
  box-shadow: ${tokens.shadow.card};
  padding: ${tokens.spacing.sm} 0;
  z-index: 1000;
  display: ${(p) => (p.$open ? "block" : "none")};
`;

const CategoryItem = styled(Link)`
  display: block;
  padding: ${tokens.spacing.sm} ${tokens.spacing.md};
  color: ${tokens.dark[700]};
  font-size: ${tokens.fontSize.small};
  font-family: ${tokens.fontFamily.sans};
  text-decoration: none;
  transition: background ${tokens.transition.base}, color ${tokens.transition.base};

  &:hover {
    background: ${tokens.background.soft};
    color: ${tokens.primary.DEFAULT};
    text-decoration: underline;
  }
`;

const Right = styled.div`
  display: flex;
  align-items: center;
  gap: ${tokens.spacing.sm};
`;

const IconBtn = styled(Link)`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: ${tokens.radius.button};
  color: ${tokens.dark[700]};
  transition: background ${tokens.transition.base}, color ${tokens.transition.base};

  &:hover {
    background: ${tokens.background.soft};
    color: ${tokens.primary.DEFAULT};
    text-decoration: underline;
  }
`;

const CartBtn = styled(IconBtn)`
  position: relative;
`;

const CartBadge = styled.span`
  position: absolute;
  top: 4px;
  right: 4px;
  background: ${tokens.state.error};
  color: white;
  border-radius: 50%;
  min-width: 18px;
  height: 18px;
  font-size: ${tokens.fontSize.micro};
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
`;

const UserMenu = styled.div`
  position: relative;
`;

const UserBtn = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border: none;
  background: transparent;
  border-radius: ${tokens.radius.button};
  color: ${tokens.dark[700]};
  cursor: pointer;
  font-family: ${tokens.fontFamily.sans};
  transition: background ${tokens.transition.base}, color ${tokens.transition.base};

  &:hover {
    background: ${tokens.background.soft};
    color: ${tokens.primary.DEFAULT};
    text-decoration: underline;
  }
`;

const UserDropdown = styled(motion.div)`
  position: absolute;
  top: calc(100% + ${tokens.spacing.sm});
  right: 0;
  min-width: 200px;
  background: ${tokens.background.card};
  border: 1px solid ${tokens.border.light};
  border-radius: ${tokens.radius.button};
  box-shadow: ${tokens.shadow.card};
  padding: ${tokens.spacing.sm} 0;
  z-index: 1000;
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
  min-height: ${(p) => (p.$hide ? "0" : "48px")};
  max-height: ${(p) => (p.$hide ? "0" : "48px")};
  background: ${tokens.background.soft};
  border-top: 1px solid ${tokens.border.light};
  border-bottom: 1px solid ${tokens.border.light};
  overflow: hidden;
  opacity: ${(p) => (p.$hide ? 0 : 1)};
  transition: max-height ${tokens.transition.base}, min-height ${tokens.transition.base}, opacity ${tokens.transition.base};
  box-shadow: none;
  display: block;
`;

const SecondMenuRowInner = styled.div`
  max-width: 1280px;
  margin: 0 auto;
  padding: ${tokens.spacing.sm} ${tokens.containerPadding};
  display: flex;
  gap: ${tokens.spacing.lg};
  align-items: center;
  font-size: ${tokens.fontSize.small};
`;

const SecondLink = styled(Link)`
  color: ${tokens.dark[600]};
  font-weight: 500;
  font-family: ${tokens.fontFamily.sans};
  text-decoration: none;
  transition: color ${tokens.transition.base};

  &:hover {
    color: ${tokens.primary.DEFAULT};
    text-decoration: underline;
  }
`;

const HeaderSpacer = styled.div`
  height: ${(p) => {
    if (!p.$visible) return "0px";
    if (p.$showFull) return "160px";
    return p.$compact ? "60px" : "72px";
  }};
  transition: height 0.3s ease-out;
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
  padding: ${tokens.spacing.sm} ${tokens.spacing.md};
  background: transparent;
  border: 1px solid ${tokens.border.light};
  border-radius: ${tokens.radius.button};
  font-size: ${tokens.fontSize.small};
  font-weight: 500;
  color: ${tokens.dark[700]};
  cursor: pointer;
  font-family: ${tokens.fontFamily.sans};
  transition: border-color ${tokens.transition.base}, background ${tokens.transition.base};

  &:hover {
    background: ${tokens.background.soft};
    border-color: ${tokens.dark[500]};
  }
`;

const LocaleDropdown = styled(motion.div)`
  position: absolute;
  top: calc(100% + ${tokens.spacing.xs});
  right: 0;
  min-width: 180px;
  background: ${tokens.background.card};
  border: 1px solid ${tokens.border.light};
  border-radius: ${tokens.radius.button};
  box-shadow: ${tokens.shadow.card};
  padding: ${tokens.spacing.xs} 0;
  z-index: 1001;
  display: ${(p) => (p.$open ? "block" : "none")};
`;

const LocaleOption = styled.button`
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
  }
`;

export default function ShopHeader() {
  const pathname = usePathname() || "/";
  const nextRouter = useNextRouter();
  const [scrollY, setScrollY] = useState(0);
  const [lastScrollY, setLastScrollY] = useState(0);
  const [visible, setVisible] = useState(true);
  const [compact, setCompact] = useState(false);
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
        const y = window.scrollY ?? window.pageYOffset ?? 0;
        setScrollY(y);
        setLastScrollY((prev) => {
          if (y <= SCROLL_THRESHOLD) {
            setVisible(true);
            setCompact(false);
          } else if (y > prev) {
            setVisible(false);
          } else {
            setVisible(true);
            setCompact(true);
          }
          return y;
        });
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
  const showFullHeader = visible && atTop;
  const showSubNav = showFullHeader;

  const algoliaAttributes = {
    primaryText: "title",
    secondaryText: "description",
    tertiaryText: "brand",
    url: "handle",
    image: "thumbnail",
  };

  return (
    <>
      <HeaderWrap
        $compact={compact && !showFullHeader}
        initial={false}
        animate={{ y: visible ? 0 : "-100%" }}
        transition={{ type: "spring", stiffness: 320, damping: 34 }}
      >
        {showFullHeader && <TopBar />}
        <nav>
          <NavRow $compact={compact}>
            <Logo href="/" $compact={compact}>Belucha</Logo>
            <Center>
              <CategoriesDropdown data-categories-dropdown>
                <CategoriesButton type="button" onClick={() => setMainMenuOpen((v) => !v)}>
                  Kategorien <i className="fas fa-chevron-down" style={{ fontSize: 10 }} />
                </CategoriesButton>
                <CategoriesPanel $open={mainMenuOpen}>
                  {mainMenuItems.length === 0 && (
                    <div style={{ padding: tokens.spacing.sm, color: tokens.dark[500] }}>Keine Kategorien</div>
                  )}
                  {mainMenuItems.map((item) => (
                    <CategoryItem key={item.id} href={menuItemHref(item)} onClick={() => setMainMenuOpen(false)}>
                      {item.label}
                    </CategoryItem>
                  ))}
                </CategoriesPanel>
              </CategoriesDropdown>
              <SearchWrap>
                <DropdownSearch
                  placeholder="Produkte suchen..."
                  hitsPerPage={5}
                  attributes={algoliaAttributes}
                  maxHeight={tokens.search.dropdownMaxHeight}
                />
              </SearchWrap>
            </Center>
            <Right>
              <LocaleCurrencyWrap data-locale-dropdown>
                <LocaleCurrencyBtn type="button" onClick={() => setLocaleDropdownOpen((v) => !v)} title={tLocale("label")} aria-haspopup="listbox" aria-expanded={localeDropdownOpen}>
                  <span style={{ textTransform: "uppercase", fontWeight: 600 }}>{locale}</span>
                  <i className="fas fa-chevron-down" style={{ fontSize: 10 }} />
                </LocaleCurrencyBtn>
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
              <UserMenu data-user-menu>
                <UserBtn type="button" onClick={() => setUserMenuOpen((v) => !v)} title="Konto">
                  <i className="fas fa-user" style={{ fontSize: 18 }} />
                </UserBtn>
                <UserDropdown $open={userMenuOpen}>
                  {isAuthenticated ? (
                    <>
                      {user && (
                        <div style={{ padding: `${tokens.spacing.sm} ${tokens.spacing.md}`, fontSize: tokens.fontSize.small, fontWeight: 600, color: tokens.dark[800] }}>
                          {user.firstName} {user.lastName}
                        </div>
                      )}
                      <UserDropdownItem href="/account" onClick={() => setUserMenuOpen(false)}>Hesap bilgilerim</UserDropdownItem>
                      <UserDropdownItem href="/orders" onClick={() => setUserMenuOpen(false)}>Siparişler</UserDropdownItem>
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
              </UserMenu>
              <CartBtn as="button" type="button" onClick={openCartSidebar} title="Warenkorb">
                <i className="fas fa-shopping-cart" style={{ fontSize: 18 }} />
                <CartBadge>{itemCount > 0 ? itemCount : 0}</CartBadge>
              </CartBtn>
            </Right>
          </NavRow>
        </nav>
        <SubNavWrap id="subnav" $hide={!showSubNav}>
          <SecondMenuRowInner>
            {secondMenuItems.map((item) => (
              <SecondLink key={item.id} href={menuItemHref(item)}>{item.label}</SecondLink>
            ))}
          </SecondMenuRowInner>
        </SubNavWrap>
      </HeaderWrap>
      <HeaderSpacer $visible={visible} $showFull={showFullHeader} $compact={compact} />
    </>
  );
}
