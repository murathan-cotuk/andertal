"use client";

/**
 * Navbar — Desktop: scroll down → header slides away; scroll up → shows.
 * Mobile/tablet (≤1023px): header stays fixed; scroll down past threshold → only thin
 * search bar (site color + slight transparency). Scroll up / near top → full bar again.
 * Second nav (SubNav): on narrow viewports the bar is hidden on scroll-down and stays hidden
 * until a clear scroll-up or until the user returns to the top (avoids flicker from touch decel).
 */

import React, { useState, useEffect, useRef, useMemo } from "react";
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
import UserDropdownPanel from "@/components/UserDropdown";
import { SHOP_THEME_CSS_UPDATED } from "@/components/ShopStylesInjector";
import { tokens } from "@/design-system/tokens";
import { routing } from "@/i18n/routing";
import {
  parseMarketPath,
  marketPrefix,
  restPathFromPathname,
  SHOP_CURRENCIES,
  DEFAULT_MARKET,
  defaultCurrencyForMarket,
  defaultLocaleForMarket,
  isValidCurrency,
} from "@/lib/shop-market";
import { useMarketPrefix } from "@/context/MarketPrefixContext";
import { useLandingChrome } from "@/context/LandingChromeContext";
import { getShippableCountries } from "@/lib/countries";
import { menuItemHref } from "@/lib/shop-menu-href";

const SCROLL_THRESHOLD = 60;
const SCROLL_DELTA = 8; /* px; only toggle direction after this much scroll to avoid jitter */
/** Ignore “scroll up” when near the document bottom (rubber-band / overscroll / addr. bar) to avoid header ↔ spacer feedback jitter */
const BOTTOM_IGNORE_SCROLL_UP_PX = 28;
const MIDDLE_BAR_BG = "#1b8880";
/** @media (max-width) for mobile/tablet header chrome (matches mega menu breakpoint) */
const HEADER_NARROW_MQ = 1023;

function categoryRefFromMenuItem(item) {
  if (!item || String(item.link_type || "").toLowerCase() !== "category") return "";
  const raw = item.link_value;
  let value = String(raw || "").trim();
  if (value.startsWith("{")) {
    try {
      const parsed = JSON.parse(value);
      value = String(parsed?.slug || parsed?.handle || parsed?.id || value).trim();
    } catch (_) {}
  }
  return value.replace(/^\//, "").toLowerCase();
}

/** Map category slug → id from /store/categories tree (for menu items that only store slug). */
function walkCategorySlugMap(nodes, outMap) {
  if (!Array.isArray(nodes)) return;
  for (const n of nodes) {
    if (!n) continue;
    if (n.slug) outMap.set(String(n.slug).trim().toLowerCase(), String(n.id).trim().toLowerCase());
    if (n.children && n.children.length) walkCategorySlugMap(n.children, outMap);
  }
}

function menuItemDepth(item, idToItem) {
  let d = 0;
  let cur = item;
  const seen = new Set();
  while (cur && cur.parent_id && !seen.has(String(cur.parent_id))) {
    seen.add(String(cur.parent_id));
    d += 1;
    cur = idToItem.get(String(cur.parent_id));
    if (!cur) break;
  }
  return d;
}

const HeaderWrap = styled.header`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 2147483600;
  background: rgba(255, 255, 255, 0.97);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  will-change: transform;
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  overflow: visible;

  /* Compact mobile: header itself fades to transparent (MiddleBarWrap has its own bg) */
  &[data-mobile-compact="true"] {
    @media (max-width: ${HEADER_NARROW_MQ}px) {
      background: transparent;
    }
  }

  /* Mobile notch / status-bar safe area should match header color */
  @media (max-width: ${HEADER_NARROW_MQ}px) {
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
    background: var(--header-bg, ${MIDDLE_BAR_BG});

    &::before {
      content: "";
      position: absolute;
      top: calc(env(safe-area-inset-top) * -1);
      left: 0;
      right: 0;
      height: env(safe-area-inset-top);
      background: var(--header-bg, ${MIDDLE_BAR_BG});
      pointer-events: none;
    }
  }
`;

/* TopBar wrapper — always in DOM, slides up smoothly when not at top */
const TopBarWrap = styled.div`
  overflow: hidden;
  max-height: ${(p) => (p.$visible ? "60px" : "0px")};
  opacity: ${(p) => (p.$visible ? 1 : 0)};
  transition: max-height 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.25s ease;
  pointer-events: ${(p) => (p.$visible ? "auto" : "none")};

  @media (max-width: 767px) {
    display: none !important;
  }
`;

/* —— Middle bar: zooplus-style (full-width colored bar) —— */

/* Keep middle bar above mega panels so icon dropdowns render on top */
const HEADER_MIDDLE_Z = 3;

const MiddleBarWrap = styled.div`
  width: 100%;
  min-height: 64px;
  background-color: var(--header-bg, ${MIDDLE_BAR_BG});
  color: var(--header-text, #111827);
  transition: background-color 0.28s ease, color 0.28s ease, backdrop-filter 0.28s ease, min-height 0.28s ease;
  position: relative;
  z-index: ${HEADER_MIDDLE_Z};

  @media (max-width: ${HEADER_NARROW_MQ}px) {
    ${(p) =>
      p.$mobileSearchCompact
        ? `
      min-height: 0;
      background-color: var(--header-bg, ${MIDDLE_BAR_BG});
      box-shadow: 0 2px 8px rgba(0,0,0,0.10);
    `
        : ""}
  }
`;

const MiddleBarInner = styled.div`
  max-width: 1280px;
  margin: 0 auto;
  padding: 0 24px;
  min-height: 72px;
  display: flex;
  align-items: center;

  @media (max-width: ${HEADER_NARROW_MQ}px) {
    ${(p) =>
      p.$mobileSearchCompact
        ? `
      min-height: 60px;
      padding: 11px 18px;
      align-items: center;
      justify-content: center;
    `
        : ""}
  }
`;

const MiddleBarLeft = styled.div`
  flex: 0 0 auto;
  display: flex;
  align-items: center;
`;

const MiddleBarLogo = styled(Link)`
  color: var(--header-text, #fff);
  font-size: 1.35rem;
  font-weight: 700;
  font-family: ${tokens.fontFamily.sans};
  text-decoration: none;
  padding: 0 4px 0 0;
  letter-spacing: -0.02em;
  transition: opacity 0.2s ease;
  display: flex;
  align-items: center;
  max-height: 56px;
  overflow: hidden;

  &:hover {
    opacity: 0.92;
    color: var(--header-text, #fff);
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

  @media (max-width: ${HEADER_NARROW_MQ}px) {
    ${(p) =>
      p.$mobileSearchCompact
        ? `
      margin-left: 0 !important;
      margin-right: 0 !important;
      flex: 0 1 640px;
      width: 100%;
      max-width: 100%;
      justify-content: center;
    `
        : ""}
  }
`;

/* Logo, hamburger row, locale/user/cart — hidden in mobile “search-only” compact bar */
const NarrowHeaderChrome = styled.div`
  display: flex;
  align-items: center;
  flex-shrink: 0;
  @media (max-width: ${HEADER_NARROW_MQ}px) {
    ${(p) => (p.$hide ? `display: none !important;` : "")}
  }
`;

/* Kategorien dropdown hemen search bar'ın solunda */
const CategoriesDropdown = styled.div`
  position: relative;
  flex-shrink: 0;
  margin-right: 4px;

  /* Hide hamburger on desktop when mega nav is shown */
  ${(p) =>
    p.$megaActive
      ? `@media (min-width: 1024px) { display: none; }`
      : ""}

  /* On mobile the bottom nav handles menu; hide header hamburger */
  @media (max-width: 767px) {
    display: none !important;
  }
`;

/* ── Mega menu nav (desktop only) ─────────────────────────── */
const MegaNav = styled.nav`
  display: none;
  @media (min-width: 1024px) {
    display: flex;
    align-items: stretch;
    flex-shrink: 0;
    margin-right: 12px;
    height: 72px;
  }
`;

const MegaNavItem = styled.div`
  position: relative;
  display: flex;
  align-items: stretch;
`;

/* Shared visual style for both link and button variants */
const megaNavItemCss = `
  display: flex;
  align-items: center;
  gap: 4px;
  height: 100%;
  padding: 0 14px;
  font-size: 14px;
  font-weight: 500;
  font-family: inherit;
  color: var(--header-text, #fff);
  text-decoration: none;
  white-space: nowrap;
  cursor: pointer;
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  transition: background 0.15s ease, border-color 0.15s ease;

  &:hover,
  &[data-active="true"] {
    background: rgba(255, 255, 255, 0.12);
    border-bottom-color: rgba(255, 255, 255, 0.8);
    color: var(--header-text, #fff);
  }
`;

const MegaNavLink = styled(Link)`
  ${megaNavItemCss}
`;

const MegaNavBtn = styled.button`
  ${megaNavItemCss}
`;

/* Full-width mega panel — absolutely positioned below the header */
const MegaPanel = styled.div`
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  background: #fff;
  border-top: 3px solid var(--shop-primary, #1b8880);
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.13);
  z-index: 5000;
  overflow: hidden;
  max-height: ${(p) => (p.$open ? "480px" : "0")};
  transition: max-height 0.28s cubic-bezier(0.4, 0, 0.2, 1);
  pointer-events: ${(p) => (p.$open ? "auto" : "none")};

  @media (max-width: 1023px) {
    display: none;
    border-top: none;
  }
`;

const MegaPanelInner = styled.div`
  max-width: 1280px;
  margin: 0 auto;
  padding: 28px 32px 32px;
  display: flex;
  flex-wrap: wrap;
  gap: 12px 36px;
`;

const MegaChildLink = styled(Link)`
  display: block;
  padding: 6px 10px;
  font-size: 13.5px;
  font-family: ${tokens.fontFamily.sans};
  color: ${tokens.dark[700]};
  text-decoration: none;
  border-radius: 6px;
  white-space: nowrap;
  transition: background 0.13s ease, color 0.13s ease;

  &:hover {
    background: ${tokens.background.soft};
    color: var(--shop-primary, ${tokens.primary.DEFAULT});
    text-decoration: none;
  }
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
  height: 37px;
  padding: 0 4px 0 12px;
  background: #fff;
  border-radius: 9999px;
  box-shadow: 0 1px 8px rgba(0,0,0,0.05), 0 1px 2px rgba(0,0,0,0.03);
  transition: box-shadow 0.2s ease, transform 0.2s ease, height 0.2s ease;

  &:focus-within {
    box-shadow: 0 2px 14px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04);
  }

  @media (max-width: ${HEADER_NARROW_MQ}px) {
    ${(p) =>
      p.$mobileCompact
        ? `
      height: 46px;
      min-height: 46px;
      max-width: min(560px, 100%);
      margin-left: auto;
      margin-right: auto;
      padding: 0 6px 0 14px;
      & > button[aria-label="Suchen"] svg {
        width: 22px;
        height: 22px;
        min-width: 22px;
      }
    `
        : ""}
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

  @media (max-width: ${HEADER_NARROW_MQ}px) {
    ${(p) =>
      p.$mobileCompact
        ? `
      flex: 1 1 auto;
      width: 100%;
      justify-content: center;
    `
        : ""}
  }
`;

const MiddleBarRight = styled.div`
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
  min-width: 0;
  position: relative;
  z-index: 10;
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

const MiddleBarCartBtn = styled(MiddleBarIconBtn)`
  position: relative;
  @media (max-width: 767px) {
    display: none !important;
  }
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

/* User dropdown — hidden on mobile (bottom nav handles account) */
const MiddleBarUserWrap = styled.div`
  @media (max-width: 767px) {
    display: none !important;
  }
`;

/* Full-width category mega panel — positioned absolute on HeaderWrap */
const CategoryMegaPanel = styled.div`
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  background: #fff;
  border-top: 3px solid var(--shop-primary, #1b8880);
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.13);
  z-index: 2;
  overflow: hidden;
  max-height: ${(p) => (p.$open ? "600px" : "0")};
  transition: max-height 0.28s cubic-bezier(0.4, 0, 0.2, 1);
  pointer-events: ${(p) => (p.$open ? "auto" : "none")};

  @media (max-width: 767px) {
    border-top: none;
  }
`;

const CategoryMegaInner = styled.div`
  max-width: 1280px;
  margin: 0 auto;
  padding: 24px 32px 28px;
  display: flex;
  gap: 0 8px;
  overflow-x: auto;
`;

const CategoryMegaCol = styled.div`
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  min-width: 160px;
`;

const CategoryMegaLink = styled(Link)`
  display: block;
  padding: 7px 12px;
  font-size: 13.5px;
  font-family: ${tokens.fontFamily.sans};
  color: ${tokens.dark[700]};
  text-decoration: none;
  border-radius: 6px;
  white-space: nowrap;
  transition: background 0.13s ease, color 0.13s ease;

  &:hover {
    background: ${tokens.background.soft};
    color: var(--shop-primary, ${tokens.primary.DEFAULT});
  }
`;

const CategoryMegaBtnLink = styled.button`
  display: block;
  width: 100%;
  text-align: left;
  padding: 7px 12px;
  font-size: 13.5px;
  font-family: ${tokens.fontFamily.sans};
  color: ${tokens.dark[700]};
  text-decoration: none;
  border-radius: 6px;
  white-space: nowrap;
  background: none;
  border: none;
  cursor: pointer;
  transition: background 0.13s ease, color 0.13s ease;

  &:hover {
    background: ${tokens.background.soft};
    color: var(--shop-primary, ${tokens.primary.DEFAULT});
  }
`;

const CategoryMegaSidebarCol = styled.div`
  flex-shrink: 0;
  width: 200px;
  border-right: 1px solid #e8e8e6;
  padding-right: 12px;
  margin-right: 12px;
  display: flex;
  flex-direction: column;
`;

const CategoryMegaRootLink = styled(Link)`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  font-size: 13.5px;
  font-family: ${tokens.fontFamily.sans};
  color: ${(p) => (p.$active ? "var(--shop-primary, " + tokens.primary.DEFAULT + ")" : tokens.dark[700])};
  font-weight: ${(p) => (p.$active ? 600 : 400)};
  background: ${(p) => (p.$active ? tokens.background.soft : "transparent")};
  text-decoration: none;
  border-radius: 6px;
  white-space: nowrap;
  transition: background 0.13s ease, color 0.13s ease;
  cursor: pointer;

  &:hover {
    background: ${tokens.background.soft};
    color: var(--shop-primary, ${tokens.primary.DEFAULT});
  }
`;

const CategoryMegaSubCols = styled.div`
  flex: 1;
  display: flex;
  gap: 0 8px;
  overflow-x: auto;
  align-content: flex-start;
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
  z-index: 9999;
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


const SubNavWrap = styled.div`
  width: 100%;
  max-height: ${(p) => (p.$hide ? "0" : "var(--second-nav-h, 50px)")};
  background: var(--second-nav-bg, #f0f0f0);
  overflow: hidden;
  opacity: ${(p) => (p.$hide ? 0 : 1)};
  transition: max-height 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.25s ease;
  display: flex;
  align-items: center;
  color: var(--second-nav-text, #374151);
  font-size: var(--second-nav-fs, 15px);
  font-weight: var(--second-nav-fw, 500);
  position: relative;
  z-index: 0;

  @media (min-width: ${HEADER_NARROW_MQ + 1}px) {
    border-top: 1px solid rgba(0, 0, 0, 0.06);
    border-bottom: 1px solid rgba(0, 0, 0, 0.08);
  }

  @media (max-width: 767px) {
    font-size: 13px;
    max-height: ${(p) => (p.$hide ? "0" : "var(--second-nav-h, 40px)")};
  }
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
  font-size: 15px;
  min-height: 42px;

  @media (max-width: 1023px) {
    overflow-x: auto;
    flex-wrap: nowrap;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none;
    padding: 0 12px;
    gap: 16px;
    &::-webkit-scrollbar { display: none; }
  }
`;

const SecondLink = styled(Link)`
  color: var(--second-nav-text, ${tokens.dark[600]});
  font-weight: inherit;
  font-family: ${tokens.fontFamily.sans};
  text-decoration: none;
  transition: color ${tokens.transition.base};
  display: inline-flex;
  align-items: center;
  line-height: 1;
  white-space: nowrap;
  flex-shrink: 0;

  &:hover {
    color: var(--second-nav-active, ${tokens.primary.DEFAULT});
    text-decoration: underline;
  }

  @media (max-width: ${HEADER_NARROW_MQ}px) {
    &:hover,
    &:active {
      text-decoration: none;
    }
  }
`;

const HeaderSpacer = styled.div`
  height: ${(p) => p.$height}px;
  flex-shrink: 0;
`;

const LocaleCurrencyWrap = styled.div`
  position: relative;
  flex-shrink: 0;
  z-index: 3;
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

const LocaleDropdown = styled.div`
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  width: 720px;
  max-width: 96vw;
  background: ${tokens.background.card};
  border: 1px solid ${tokens.border.light};
  border-radius: 16px;
  box-shadow: 0 20px 60px rgba(0,0,0,0.18);
  z-index: 3;
  display: ${(p) => (p.$open ? "flex" : "none")};
  overflow: hidden;
`;

const LocaleOption = styled.button`
  display: flex;
  align-items: center;
  gap: 10px;
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
  border-radius: 8px;

  &:hover {
    background: ${tokens.background.soft};
    color: ${tokens.primary.DEFAULT};
  }

  &[data-active="true"] {
    background: #eff6ff;
    color: #1d4ed8;
    font-weight: 600;
  }
`;

// SHOP_COUNTRIES is now computed dynamically from shippingGroups in the component

const SHOP_LOCALES = [
  { code: "en", label: "English",    flag: "🇬🇧" },
  { code: "de", label: "Deutsch",    flag: "🇩🇪" },
  { code: "fr", label: "Français",   flag: "🇫🇷" },
  { code: "it", label: "Italiano",   flag: "🇮🇹" },
  { code: "es", label: "Español",    flag: "🇪🇸" },
  { code: "tr", label: "Türkçe",     flag: "🇹🇷" },
];

const CCY_FROM_ISO = { EUR: "eur", GBP: "gbp", CHF: "chf", USD: "usd", TRY: "try" };

const SHOP_CCY_LABELS = {
  eur: { label: "Euro", sub: "EUR" },
  gbp: { label: "Sterling", sub: "GBP" },
  chf: { label: "Franken", sub: "CHF" },
  usd: { label: "US-Dollar", sub: "USD" },
  try: { label: "Türkische Lira", sub: "TRY" },
};

export default function ShopHeader() {
  const { showHeaderFilterBar } = useLandingChrome();
  const ctxPrefix = useMarketPrefix();
  const pathname = usePathname() || "/";
  const marketParsed =
    parseMarketPath(pathname) || (ctxPrefix ? parseMarketPath(ctxPrefix) : null);
  const nextRouter = useNextRouter();
  const router = useRouter();
  const [scrollY, setScrollY] = useState(0);
  const [scrollingDown, setScrollingDown] = useState(false);
  const [isNarrowViewport, setIsNarrowViewport] = useState(false);
  /** Narrow only: second menu row hidden after scroll-down; cleared on scroll-up or at top (see scroll handler). */
  const [mobileSecondNavHidden, setMobileSecondNavHidden] = useState(false);
  const mobileSecondNavHiddenRef = useRef(false);
  const lastScrollYRef = useRef(0);
  const headerRef = useRef(null);
  const middleBarRef = useRef(null);
  const megaMenuTimerRef = useRef(null);
  const [headerHeight, setHeaderHeight] = useState(116);
  const [mainMenuOpen, setMainMenuOpen] = useState(false);
  const [hoveredMenuItemId, setHoveredMenuItemId] = useState(null);
  const [shopBranding, setShopBranding] = useState({ shop_logo_url: "", shop_favicon_url: "", shop_logo_height: 34 });
  // userMenuOpen state removed — now managed by Radix DropdownMenu in UserDropdownPanel
  const [localeDropdownOpen, setLocaleDropdownOpen] = useState(false);
  const [mainMenuAllItems, setMainMenuAllItems] = useState([]);
  const [mainMenuConfig, setMainMenuConfig] = useState(null);
  const [secondMenuItems, setSecondMenuItems] = useState([]);
  const [categorySlugToId, setCategorySlugToId] = useState(() => new Map());
  const [categoryTree, setCategoryTree] = useState([]);
  const [drillCategoryId, setDrillCategoryId] = useState(null); // null = root level
  const { isAuthenticated, user, logout } = useAuth();
  const { openCartSidebar, itemCount, shippingGroups } = useCart();
  const tLocale = useTranslations("locale");
  const tNav = useTranslations("nav");
  const locale = useLocale();

  // Dynamically computed from shipping groups — only countries with configured prices
  const shopCountries = getShippableCountries(shippingGroups, locale);

  const selectedCountry = (() => {
    const t = marketParsed || (ctxPrefix ? parseMarketPath(ctxPrefix) : null);
    if (!t?.country) return String(DEFAULT_MARKET).toUpperCase();
    return t.country.toUpperCase();
  })();

  const navigateTriple = (countryLower, langLower, curLower) => {
    const tail = restPathFromPathname(pathname);
    const suffix = tail === "/" ? "" : tail;
    nextRouter.push(`${marketPrefix(countryLower, langLower, curLower)}${suffix}`);
  };

  const handleSelectCountry = (countryCode) => {
    const m = countryCode.toLowerCase();
    const lang = defaultLocaleForMarket(m);
    const cur = defaultCurrencyForMarket(m);
    navigateTriple(m, lang, cur);
    setLocaleDropdownOpen(false);
  };

  useEffect(() => {
    let cancelled = false;
    fetch("/api/store-seller-settings?seller_id=default", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        setShopBranding({
          shop_logo_url: d?.shop_logo_url || "",
          shop_favicon_url: d?.shop_favicon_url || "",
          shop_logo_height: d?.shop_logo_height != null ? Number(d.shop_logo_height) : 34,
        });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const fav = (shopBranding.shop_favicon_url || "").trim();
    if (!fav || typeof document === "undefined") return;
    let link = document.querySelector("link[rel='icon']");
    if (!link) {
      link = document.createElement("link");
      link.setAttribute("rel", "icon");
      document.head.appendChild(link);
    }
    link.setAttribute("href", fav);
  }, [shopBranding.shop_favicon_url]);

  useEffect(() => {
    if (typeof document === "undefined" || typeof window === "undefined") return;
    const mq = window.matchMedia(`(max-width: ${HEADER_NARROW_MQ}px)`);
    const root = document.documentElement;
    const body = document.body;
    const prevRootBg = root.style.backgroundColor;
    const prevBodyBg = body.style.backgroundColor;

    const ensureThemeMeta = () => {
      let meta = document.querySelector("meta[name='theme-color']");
      if (!meta) {
        meta = document.createElement("meta");
        meta.setAttribute("name", "theme-color");
        document.head.appendChild(meta);
      }
      return meta;
    };

    /** Hex / rgb / '' — Safari expects a solid color for theme-color */
    const apply = () => {
      const raw = getComputedStyle(root).getPropertyValue("--header-bg").trim();
      const headerBg = raw || MIDDLE_BAR_BG;
      const themeMeta = ensureThemeMeta();
      themeMeta.setAttribute("content", headerBg);

      /* iOS: html background behind status bar + overscroll; keep in sync with header */
      if (mq.matches) {
        root.style.backgroundColor = headerBg;
        body.style.backgroundColor = headerBg;
      } else {
        root.style.backgroundColor = prevRootBg;
        body.style.backgroundColor = prevBodyBg;
      }
    };

    apply();
    const onMq = () => apply();
    const onThemeInjected = () => apply();
    mq.addEventListener?.("change", onMq);
    window.addEventListener(SHOP_THEME_CSS_UPDATED, onThemeInjected);
    return () => {
      mq.removeEventListener?.("change", onMq);
      window.removeEventListener(SHOP_THEME_CSS_UPDATED, onThemeInjected);
      root.style.backgroundColor = prevRootBg;
      body.style.backgroundColor = prevBodyBg;
    };
  }, []);

  useEffect(() => {
    const norm = (s) => String(s || "").toLowerCase().trim();
    const applyMenus = (locData, menuData) => {
      const locs = locData?.locations || [];
      const menus = Array.isArray(menuData?.menus) ? menuData.menus : [];
      const subnavLoc = locs.find((l) => norm(l?.html_id) === "subnav");
      const subnavSlug = norm(subnavLoc?.slug || "second");
      // Prefer categories-with-products configured main menu for dropdown mode.
      const mainCandidates = menus.filter((m) => norm(m?.location) === "main");
      const main =
        mainCandidates.find((m) => Boolean(m?.categories_with_products)) ||
        mainCandidates.find((m) => (m.items || []).length > 0) ||
        mainCandidates[0] ||
        null;
      const second =
        menus.find((m) => norm(m?.location) === subnavSlug) ||
        menus.find((m) => norm(m?.slug) === "second-menu");
      const rootItems = (arr) => (arr || []).filter((i) => !i?.parent_id);
      setMainMenuAllItems(main ? main.items || [] : []);
      setMainMenuConfig(main || null);
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
    let cancelled = false;
    fetch("/api/store-categories?tree=true&is_visible=true", { cache: "no-store" })
      .then((r) => r.json())
      .catch(() => ({ tree: [] }))
      .then((catRes) => {
        if (cancelled) return;
        const tree = catRes.tree || [];
        setCategoryTree(tree);
        const slugMap = new Map();
        walkCategorySlugMap(tree, slugMap);
        setCategorySlugToId(slugMap);
      })
      .catch(() => {
        if (!cancelled) {
          setCategorySlugToId(new Map());
          setCategoryTree([]);
        }
      });
    return () => { cancelled = true; };
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
        const el = document.documentElement;
        const maxScroll = Math.max(0, (el && el.scrollHeight) - window.innerHeight);
        const nearDocumentBottom =
          maxScroll > SCROLL_THRESHOLD * 2 && current >= maxScroll - BOTTOM_IGNORE_SCROLL_UP_PX;
        if (delta > SCROLL_DELTA) {
          setScrollingDown(true);
        } else if (delta < -SCROLL_DELTA && !nearDocumentBottom) {
          setScrollingDown(false);
        }
        lastScrollYRef.current = current;
        setScrollY(current);

        const narrow = typeof window !== "undefined" && window.innerWidth <= HEADER_NARROW_MQ;
        let nextHideSecond = mobileSecondNavHiddenRef.current;
        if (narrow) {
          if (current <= SCROLL_THRESHOLD) {
            nextHideSecond = false;
          } else if (delta > SCROLL_DELTA) {
            nextHideSecond = true;
          } else if (delta < -SCROLL_DELTA && !nearDocumentBottom) {
            nextHideSecond = false;
          }
        } else {
          nextHideSecond = false;
        }
        if (nextHideSecond !== mobileSecondNavHiddenRef.current) {
          mobileSecondNavHiddenRef.current = nextHideSecond;
          setMobileSecondNavHidden(nextHideSecond);
        }

        ticking = false;
      });
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${HEADER_NARROW_MQ}px)`);
    const apply = () => setIsNarrowViewport(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    if (isNarrowViewport) return;
    mobileSecondNavHiddenRef.current = false;
    setMobileSecondNavHidden(false);
  }, [isNarrowViewport]);

  useEffect(() => {
    setDrillCategoryId(null);
  }, [pathname]);

  // Track actual header height so the spacer is always accurate
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setHeaderHeight(Math.round(entry.contentRect.height));
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const close = () => {
      setMainMenuOpen(false);
      setLocaleDropdownOpen(false);
      setHoveredMenuItemId(null);
    };
    document.addEventListener("mousedown", (e) => {
      if (!e.target.closest("[data-categories-dropdown]") && !e.target.closest("[data-user-menu]") && !e.target.closest("[data-locale-dropdown]") && !e.target.closest("[data-mega-nav]")) close();
    });
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const atTop = scrollY <= SCROLL_THRESHOLD;
  /* Second nav: desktop = hide with scroll direction (same as before); mobile = latched so it stays off after scroll-down */
  const showSubNav = isNarrowViewport ? !mobileSecondNavHidden : !scrollingDown;
  const secondNavHidden = !showSubNav || !showHeaderFilterBar;
  const spacerHeight = Math.max(
    0,
    headerHeight - (isNarrowViewport && secondNavHidden ? 40 : 0)
  );
  /* Header only visible when scrolling up (or initial load when scrollingDown is false) */
  const showHeader = !scrollingDown;
  /** Mobile/tablet: thin search-only row while scrolling down (not on wide desktop) */
  const isMobileSearchCompact =
    isNarrowViewport && scrollingDown && scrollY > SCROLL_THRESHOLD;
  /** Only desktop hides the whole header on scroll down; narrow keeps a fixed (compact) search bar */
  const hideHeaderCompletely = !isNarrowViewport && !showHeader;

  const algoliaAttributes = {
    primaryText: "title",
    secondaryText: "description",
    tertiaryText: "brand",
    url: "handle",
    image: "thumbnail",
  };
  /** Tüm root kategoriler — ürünü olan (has_products=true) kategoriler gösterilir. */
  const browseRootsFromTree = useMemo(() => {
    if (!Array.isArray(categoryTree) || categoryTree.length === 0) return [];
    return categoryTree
      .filter((n) => n && !n.parent_id && n.has_products !== false)
      .map((n) => ({
        key: String(n.id),
        id: String(n.id),
        label: n.name || n.slug || "",
        slug: String(n.slug || n.handle || "").replace(/^\//, "").trim(),
        hasChildren: Array.isArray(n.children) && n.children.some((c) => c && c.has_products !== false),
        node: n,
      }))
      .filter((r) => r.slug)
      .sort((a, b) => String(a.label).localeCompare(String(b.label), locale));
  }, [categoryTree, locale]);

  // Children of the currently drilled category
  const drillRows = useMemo(() => {
    if (!drillCategoryId) return [];
    const findNode = (nodes, id) => {
      for (const n of (nodes || [])) {
        if (String(n.id) === String(id)) return n;
        const found = findNode(n.children, id);
        if (found) return found;
      }
      return null;
    };
    const parent = findNode(categoryTree, drillCategoryId);
    if (!parent || !Array.isArray(parent.children)) return [];
    return parent.children
      .filter((n) => n && n.has_products !== false)
      .map((n) => ({
        key: String(n.id),
        id: String(n.id),
        label: n.name || n.slug || "",
        slug: String(n.slug || n.handle || "").replace(/^\//, "").trim(),
        hasChildren: Array.isArray(n.children) && n.children.some((c) => c && c.has_products !== false),
      }))
      .filter((r) => r.slug)
      .sort((a, b) => String(a.label).localeCompare(String(b.label), locale));
  }, [drillCategoryId, categoryTree, locale]);

  const categoryPanelRows = browseRootsFromTree.map((r) => ({
    key: r.key,
    id: r.id,
    label: r.label,
    href: `/${r.slug}`,
    hasChildren: r.hasChildren,
  }));

  // Root-level menu items (no parent) for direct link rendering
  const menuPanelItems = useMemo(
    () =>
      (mainMenuAllItems || [])
        .filter((i) => !i?.parent_id)
        .filter((i) => {
          if (String(i?.link_type || "").toLowerCase() !== "category") return true;
          const ref = categoryRefFromMenuItem(i);
          if (!ref) return false;
          // Only active/visible categories are present in categorySlugToId map.
          if (categorySlugToId.has(ref)) return true;
          for (const id of categorySlugToId.values()) {
            if (String(id).toLowerCase() === ref) return true;
          }
          return false;
        }),
    [mainMenuAllItems, categorySlugToId],
  );
  const showCategoriesMode = Boolean(mainMenuConfig?.categories_with_products);

  /* Mega menu — children grouped by parent id */
  const menuChildrenByParent = useMemo(() => {
    const map = new Map();
    for (const item of mainMenuAllItems) {
      if (item.parent_id) {
        const pid = String(item.parent_id);
        if (!map.has(pid)) map.set(pid, []);
        map.get(pid).push(item);
      }
    }
    return map;
  }, [mainMenuAllItems]);

  const hoveredChildren = useMemo(
    () => (hoveredMenuItemId ? menuChildrenByParent.get(hoveredMenuItemId) || [] : []),
    [hoveredMenuItemId, menuChildrenByParent],
  );

  const hasMegaNav = !showCategoriesMode && menuPanelItems.length > 0;

  const openMegaMenu = (id) => {
    clearTimeout(megaMenuTimerRef.current);
    setMainMenuOpen(false); // close hamburger panel when nav item is hovered
    setHoveredMenuItemId(id);
  };
  const closeMegaMenu = () => {
    megaMenuTimerRef.current = setTimeout(() => setHoveredMenuItemId(null), 140);
  };
  const keepMegaMenuOpen = () => clearTimeout(megaMenuTimerRef.current);

  useEffect(() => {
    if (!isMobileSearchCompact) return;
    setMainMenuOpen(false);
    setLocaleDropdownOpen(false);
    setHoveredMenuItemId(null);
  }, [isMobileSearchCompact]);

  return (
    <>
      <HeaderWrap
        ref={headerRef}
        data-mobile-compact={isMobileSearchCompact ? "true" : "false"}
        style={{
          transform: hideHeaderCompletely ? "translateY(-100%)" : "translateY(0)",
          zIndex: localeDropdownOpen ? 2147483650 : undefined,
        }}
      >
        <TopBarWrap $visible={atTop}>
          <TopBar />
        </TopBarWrap>
        <MiddleBarWrap ref={middleBarRef} className="shop-header-main" $mobileSearchCompact={isMobileSearchCompact}>
          <MiddleBarInner $mobileSearchCompact={isMobileSearchCompact}>
            <NarrowHeaderChrome $hide={isMobileSearchCompact}>
              <MiddleBarLeft>
                <MiddleBarLogo href="/">
                  {shopBranding.shop_logo_url ? (
                    <img
                      src={shopBranding.shop_logo_url}
                      alt="Shop logo"
                      style={{ height: Math.min(shopBranding.shop_logo_height || 34, 56), maxHeight: 56, width: "auto", maxWidth: 220, objectFit: "contain", display: "block" }}
                    />
                  ) : (
                    "Belucha"
                  )}
                </MiddleBarLogo>
              </MiddleBarLeft>
            </NarrowHeaderChrome>

            <MiddleBarCenter $mobileSearchCompact={isMobileSearchCompact}>
              <NarrowHeaderChrome
                $hide={isMobileSearchCompact}
                style={{ gap: 0, minWidth: 0 }}
              >
                <CategoriesDropdown data-categories-dropdown $megaActive={hasMegaNav}>
                  <CategoriesButton
                    type="button"
                    onClick={() => {
                      setLocaleDropdownOpen(false);
                      setHoveredMenuItemId(null);
                      setDrillCategoryId(null);
                      setMainMenuOpen((v) => !v);
                    }}
                    aria-expanded={mainMenuOpen}
                    aria-label="Kategorien"
                  >
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      <path fillRule="evenodd" clipRule="evenodd" d="M2 5.75C2 5.33579 2.33579 5 2.75 5H21.25C21.6642 5 22 5.33579 22 5.75C22 6.16421 21.6642 6.5 21.25 6.5H2.75C2.33579 6.5 2 6.16421 2 5.75ZM2 12C2 11.5858 2.33579 11.25 2.75 11.25H21.25C21.6642 11.25 22 11.5858 22 12C22 12.4142 21.6642 12.75 21.25 12.75H2.75C2.33579 12.75 2 12.4142 2 12ZM2 18.25C2 17.8358 2.33579 17.5 2.75 17.5H21.25C21.6642 17.5 22 17.8358 22 18.25C22 18.6642 21.6642 19 21.25 19H2.75C2.33579 19 2 18.6642 2 18.25Z" />
                    </svg>
                  </CategoriesButton>
                </CategoriesDropdown>

                {/* Desktop mega nav */}
                {hasMegaNav && (
                <MegaNav data-mega-nav>
                  {menuPanelItems.map((item) => {
                    const children = menuChildrenByParent.get(String(item.id)) || [];
                    const hasChildren = children.length > 0;
                    const href = menuItemHref(item);
                    const isActive = hoveredMenuItemId === String(item.id);
                    return (
                      <MegaNavItem
                        key={item.id}
                        onMouseEnter={() => openMegaMenu(String(item.id))}
                        onMouseLeave={closeMegaMenu}
                      >
                        {hasChildren ? (
                          <MegaNavBtn type="button" data-active={isActive ? "true" : "false"}>
                            {item.label}
                            <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" aria-hidden="true" style={{ opacity: 0.7, marginTop: 1 }}>
                              <path d="M1 3l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                            </svg>
                          </MegaNavBtn>
                        ) : (
                          <MegaNavLink
                            href={href === "#" ? "/" : href}
                            data-active={isActive ? "true" : "false"}
                            onClick={() => setHoveredMenuItemId(null)}
                          >
                            {item.label}
                          </MegaNavLink>
                        )}
                      </MegaNavItem>
                    );
                  })}
                </MegaNav>
              )}

              </NarrowHeaderChrome>

              <MiddleBarSearch $mobileCompact={isMobileSearchCompact}>
                <SearchBarForm $mobileCompact={isMobileSearchCompact} role="search">
                  <SearchBarButton
                    type="button"
                    aria-label="Suchen"
                    onClick={() => {}}
                  >
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

            <NarrowHeaderChrome $hide={isMobileSearchCompact}>
            <MiddleBarRight>
              <LocaleCurrencyWrap data-locale-dropdown>
                <MiddleBarLocaleBtn type="button" onClick={() => { setMainMenuOpen(false); setLocaleDropdownOpen((v) => !v); }} title={`${tLocale("label")} · Währung`} aria-label="Land, Sprache, Währung" aria-haspopup="listbox" aria-expanded={localeDropdownOpen}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 0 1 3 12c0-1.605.42-3.113 1.157-4.418" />
                  </svg>
                </MiddleBarLocaleBtn>
                <LocaleDropdown $open={localeDropdownOpen}>
                  <div style={{ flex: 1, borderRight: "1px solid #e5e7eb", padding: "16px 0" }}>
                    <div style={{ padding: "4px 16px 10px", fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.08em" }}>Land</div>
                    {shopCountries.length === 0 ? (
                      <div style={{ padding: "8px 16px", fontSize: 13, color: "#9ca3af" }}>Keine Länder konfiguriert</div>
                    ) : shopCountries.map((c) => (
                      <LocaleOption
                        key={c.code}
                        type="button"
                        data-active={selectedCountry === c.code ? "true" : "false"}
                        onClick={() => handleSelectCountry(c.code)}
                      >
                        <span style={{ fontSize: 20 }}>{c.flag}</span>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600 }}>{c.label}</div>
                          <div style={{ fontSize: 11, color: "#9ca3af" }}>{c.currency.toUpperCase()}</div>
                        </div>
                      </LocaleOption>
                    ))}
                  </div>
                  <div style={{ flex: 1, borderRight: "1px solid #e5e7eb", padding: "16px 0" }}>
                    <div style={{ padding: "4px 16px 10px", fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.08em" }}>Sprache</div>
                    {SHOP_LOCALES.map((l) => (
                      <LocaleOption
                        key={l.code}
                        type="button"
                        data-active={locale === l.code ? "true" : "false"}
                        onClick={() => {
                          setLocaleDropdownOpen(false);
                          const m = marketParsed?.country ?? DEFAULT_MARKET;
                          const cur =
                            marketParsed?.currency && isValidCurrency(marketParsed.currency)
                              ? marketParsed.currency
                              : defaultCurrencyForMarket(m);
                          navigateTriple(m, l.code, cur);
                        }}
                      >
                        <span style={{ fontSize: 20 }}>{l.flag}</span>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>{l.label}</div>
                      </LocaleOption>
                    ))}
                  </div>
                  <div style={{ flex: 1, padding: "16px 0" }}>
                    <div style={{ padding: "4px 16px 10px", fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.08em" }}>Währung</div>
                    {SHOP_CURRENCIES.map((code) => {
                      const active = (marketParsed?.currency || "eur") === code;
                      const meta = SHOP_CCY_LABELS[code] || { label: code.toUpperCase(), sub: code.toUpperCase() };
                      return (
                        <LocaleOption
                          key={code}
                          type="button"
                          data-active={active ? "true" : "false"}
                          onClick={() => {
                            setLocaleDropdownOpen(false);
                            const m = marketParsed?.country ?? DEFAULT_MARKET;
                            const lang = marketParsed?.lang ?? locale;
                            navigateTriple(m, lang, code);
                          }}
                        >
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 600 }}>{meta.label}</div>
                            <div style={{ fontSize: 11, color: "#9ca3af" }}>{meta.sub}</div>
                          </div>
                        </LocaleOption>
                      );
                    })}
                  </div>
                </LocaleDropdown>
              </LocaleCurrencyWrap>
              <MiddleBarUserWrap>
                <UserDropdownPanel
                  layoutAnchorRef={middleBarRef}
                  isAuthenticated={isAuthenticated}
                  user={user}
                  onLogout={() => {
                    document.cookie = "belucha_cauth=; path=/; max-age=0; SameSite=Lax";
                    logout();
                  }}
                  onOpen={() => { setLocaleDropdownOpen(false); setMainMenuOpen(false); }}
                />
              </MiddleBarUserWrap>
              <MiddleBarCartBtn type="button" onClick={openCartSidebar} title="Warenkorb" aria-label="Warenkorb">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path fillRule="evenodd" clipRule="evenodd" d="M1 2.75C1 2.33579 1.33579 2 1.75 2H2.27029C3.34283 2 4.26626 2.75703 4.4766 3.80874L4.71485 5H20.2676C21.3791 5 22.209 6.02281 21.98 7.11052L20.5682 13.8165C20.3003 15.0891 19.1777 16 17.8772 16H7.63961C6.32874 16 5.20009 15.0747 4.94301 13.7893L3.00573 4.10291C2.93562 3.75234 2.6278 3.5 2.27029 3.5H1.75C1.33579 3.5 1 3.16421 1 2.75ZM6 19C6 17.8954 6.89543 17 8 17C9.10457 17 10 17.8954 10 19C10 20.1046 9.10457 21 8 21C6.89543 21 6 20.1046 6 19ZM15 19C15 17.8954 15.8954 17 17 17C18.1046 17 19 17.8954 19 19C19 20.1046 18.1046 21 17 21C15.8954 21 15 20.1046 15 19Z" />
                </svg>
                {itemCount > 0 && <MiddleBarCartBadge>{itemCount}</MiddleBarCartBadge>}
              </MiddleBarCartBtn>
            </MiddleBarRight>
            </NarrowHeaderChrome>
          </MiddleBarInner>
        </MiddleBarWrap>

        {/* Mega menu panel — floats below the header bar */}
        {hasMegaNav && (
          <MegaPanel
            $open={hoveredMenuItemId !== null && hoveredChildren.length > 0}
            data-mega-nav
            onMouseEnter={keepMegaMenuOpen}
            onMouseLeave={closeMegaMenu}
          >
            <MegaPanelInner>
              {hoveredChildren.map((child) => (
                <MegaChildLink
                  key={child.id}
                  href={menuItemHref(child) === "#" ? "/" : menuItemHref(child)}
                  onClick={() => setHoveredMenuItemId(null)}
                >
                  {child.label}
                </MegaChildLink>
              ))}
            </MegaPanelInner>
          </MegaPanel>
        )}

        {/* Category mega panel — opens when hamburger is clicked */}
        <CategoryMegaPanel
          $open={mainMenuOpen}
          data-categories-dropdown
          onClick={(e) => {
            // close only on direct backdrop click, not on child clicks
            if (e.target === e.currentTarget) setMainMenuOpen(false);
          }}
        >
          <CategoryMegaInner>
            {(() => {
              const rows =
                !showCategoriesMode && menuPanelItems.length > 0
                  ? menuPanelItems.map((item) => ({
                      key: item.id,
                      href: menuItemHref(item),
                      label: item.label,
                      onClick: () => { setMainMenuOpen(false); },
                    }))
                  : categoryPanelRows.map((row) => ({
                      key: row.key,
                      href: row.href || "#",
                      label: row.label,
                      onClick: () => { setMainMenuOpen(false); setDrillCategoryId(null); },
                    })).filter((r) => r.href && r.href !== "#");

              if (rows.length === 0) {
                return (
                  <div style={{ padding: "8px 0", color: tokens.dark[500], fontSize: 14 }}>
                    {tNav("categoryMenuEmpty")}
                  </div>
                );
              }

              const COLS_MAX = 8;
              const cols = [];
              for (let i = 0; i < rows.length; i += COLS_MAX) {
                cols.push(rows.slice(i, i + COLS_MAX));
              }

              return cols.map((col, ci) => (
                <CategoryMegaCol key={ci}>
                  {col.map((row) => (
                    <CategoryMegaLink key={row.key} href={row.href} onClick={row.onClick}>
                      {row.label}
                    </CategoryMegaLink>
                  ))}
                </CategoryMegaCol>
              ));
            })()}
          </CategoryMegaInner>
        </CategoryMegaPanel>

        <SubNavWrap id="subnav" className="second-nav" $hide={!showSubNav || !showHeaderFilterBar}>
          <SecondMenuRowInner>
            {secondMenuItems.map((item) => (
              <SecondLink key={item.id} href={menuItemHref(item)}>{item.label}</SecondLink>
            ))}
          </SecondMenuRowInner>
        </SubNavWrap>
      </HeaderWrap>

      <HeaderSpacer $height={spacerHeight} />
    </>
  );
}
