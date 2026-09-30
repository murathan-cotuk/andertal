"use client";

import React, { useState, useEffect, useRef } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import styled, { keyframes, css } from "styled-components";
import StackedFilterPanel, {
  facetValueCounts,
  brandValues,
  brandCounts,
  filterByBrands,
  priceBoundsEuro,
  filterByPriceRange,
  FilterSheetHeader,
  FilterSheetScroll,
  FilterSheetFooter,
  FilterSheetCategoryGroup,
} from "@/components/catalog/StackedFilterPanel";
import { productIsInStock } from "@/lib/seo";
import { CategoryProductListing } from "@/components/CategoryProductListing";
import { Link } from "@/i18n/navigation";
import { resolveImageUrl, rewriteImageUrlsInHtml } from "@/lib/image-url";
import {
  SORT_OPTIONS,
  PER_PAGE,
  buildFacetsFromProducts,
  filterFacetsToCatalog,
  filterProductsByFacets,
  applyCatalogSort,
  getFacetGroupTitle,
  formatFacetOptionLabel,
  isDiscountedProduct,
  loadCatalogBadgeRules,
  DEFAULT_SALE_MIN_DISCOUNT_PERCENT,
} from "@/lib/catalog-listing";
import { normCatId } from "@/lib/category-product-ids";
import { getLocalizedCategory } from "@/lib/format";
import { storeCategoriesQuery } from "@/lib/store-categories-url";
import LandingContainers from "@/components/landing/LandingContainers";
import { rememberViewedCategory } from "@/components/search/SearchDiscovery";
import { useShopStyles } from "@/context/ShopStylesContext";
import { useMarketPrefix } from "@/context/MarketPrefixContext";
import { SITE_URL, categorySeoFallback } from "@/lib/seo";
import { canonicalMarketPrefix } from "@/lib/shop-market";
import CatalogDrawerPortal, {
  CATALOG_DRAWER_MAX_PX,
  CATALOG_FILTER_OVERLAY_Z,
  CATALOG_FILTER_SIDEBAR_Z,
  catalogDrawerMaxCss,
} from "@/lib/catalog-drawer-portal";

const HEADER_H = 72;

const shimmer = keyframes`
  0%   { background-position: -800px 0; }
  100% { background-position:  800px 0; }
`;
const Bone = styled.div`
  background: linear-gradient(90deg, #efefed 25%, #e5e5e3 50%, #efefed 75%);
  background-size: 800px 100%;
  animation: ${shimmer} 1.5s infinite linear;
`;

const CAT_BANNER_PRESETS = {
  strip:  { aspectRatio: "21 / 6", minHeight: "120px", maxHeight: "320px" },
  medium: { aspectRatio: "4 / 1",  minHeight: "200px", maxHeight: "480px" },
  tall:   { aspectRatio: "16 / 7", minHeight: "320px", maxHeight: "640px" },
};

const SORT_LABEL_KEYS = new Set(["default", "bestseller", "newest", "price_asc", "price_desc", "title_asc", "title_desc"]);

const HeroBanner = styled.div`
  width: 100%;
  aspect-ratio: ${(p) => p.$aspect || "21 / 6"};
  min-height: ${(p) => p.$minH || "120px"};
  max-height: ${(p) => p.$maxH || "320px"};
  overflow: hidden;
  position: relative;
  background: #f4f4f2;

  /* Mobile: use sensible banner height regardless of desktop preset */
  @media (max-width: 767px) {
    aspect-ratio: 3 / 1 !important;
    min-height: 80px !important;
    max-height: 160px !important;
  }

  img, video {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
    opacity: 1;
  }
`;

const HeroText = styled.div`
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  padding: 24px 32px;

  h1 {
    margin: 0 0 4px;
  }
`;

const ColHeader = styled.div`
  padding: 28px 32px 0;
  max-width: 1440px;
  margin: 0 auto;
  width: 100%;
  box-sizing: border-box;

  @media (min-width: 1024px) {
    max-width: 1376px;
  }

  @media (max-width: 767px) {
    padding: 16px 12px 0;
  }

  h1 {
    margin: 0;
  }

  @media (max-width: 600px) { padding: 20px 16px 0; }

  @media (max-width: 767px) {
    padding-left: 16px !important;
    padding-right: 16px !important;
  }
`;

const Breadcrumb = styled.nav`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: #5e574e;

  a { color: #5e574e; text-decoration: none; transition: color 0.12s; &:hover { color: var(--body-color, #1d1b18); } }
  b { color: var(--body-color, #1d1b18); font-weight: 600; }

  @media (max-width: 767px) {
    display: none;
  }
`;

/** Full-width strip below filter/sort bar, above product grid (breadcrumb only). */
const BreadcrumbRow = styled.div`
  max-width: 1440px;
  margin: 0 auto;
  width: 100%;
  box-sizing: border-box;
  padding: 8px 32px 10px;
  background: #fff;
  border-bottom: 1px solid #e8e8e6;

  @media (max-width: 600px) {
    padding: 6px 16px 8px;
  }

  @media (max-width: 767px) {
    display: none;
  }
`;

/* Mobile (design): horizontal pill row with the sub-categories under the title. */
const MobileSubPills = styled.nav`
  display: none;
  @media (max-width: 1023px) {
    display: flex;
    gap: 8px;
    overflow-x: auto;
    padding: 4px 16px 10px;
    scrollbar-width: none;
    &::-webkit-scrollbar { display: none; }
    a {
      flex-shrink: 0;
      padding: 8px 14px;
      border-radius: 999px;
      background: #efe8dd;
      color: var(--body-color, #1d1b18);
      font-size: 14px;
      font-weight: 500;
      text-decoration: none;
      white-space: nowrap;
    }
  }
`;

const SortBar = styled.div`
  position: sticky;
  top: ${HEADER_H}px;
  z-index: 20;
  background: #fff;
  border-top: 1px solid #e8e8e6;
  border-bottom: 1px solid #e8e8e6;

  /* Sticky offset vs fixed header (approx.; TopBar removed site-wide) */
  @media (max-width: 767px) {
    top: 72px;
  }
`;

const SortBarInner = styled.div`
  max-width: 1440px;
  margin: 0 auto;
  padding: 0 32px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;

  @media (min-width: 1024px) {
    max-width: 1376px;
  }

  @media (max-width: 600px) { padding: 0 16px; }

  @media (max-width: 767px) {
    padding: 10px 16px;
    gap: 10px;
  }
`;

const SortBarLeft = styled.div`
  display: flex;
  align-items: center;
  gap: 16px;
  min-width: 0;
  flex: 1;

  @media (max-width: 767px) {
    flex: 1 1 0;
    gap: 8px;
  }
`;

const FilterBtn = styled.button`
  display: none;
  align-items: center;
  gap: 8px;
  height: 40px;
  padding: 0 16px;
  margin: 6px 0;
  background: var(--body-color, #1d1b18);
  border: none;
  border-radius: 999px;
  font-size: 14px;
  font-weight: 700;
  color: #fff;
  cursor: pointer;
  transition: opacity 0.12s;
  line-height: 1;

  svg { width: 14px; height: 14px; stroke: currentColor; fill: none; stroke-width: 2; }
  &:hover { opacity: 0.88; }

  @media (max-width: ${CATALOG_DRAWER_MAX_PX}px) {
    display: inline-flex;
  }

  @media (max-width: 767px) {
    flex: 1 1 0;
    justify-content: center;
    height: 44px;
    margin: 0;
  }
`;

const SortWrap = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: #5e574e;

  @media (max-width: 767px) {
    flex: 1 1 0;
  }
`;

const SortLabel = styled.span`
  font-size: 14px;
  color: #5e574e;
  white-space: nowrap;

  @media (max-width: 480px) { display: none; }
`;

const SortSelect = styled.select`
  appearance: none;
  background-color: #fff;
  border: 1px solid #cfc6b8;
  border-radius: 999px;
  margin: 6px 0;
  font-family: inherit;
  font-size: 14px;
  font-weight: 700;
  color: var(--body-color, #1d1b18);
  cursor: pointer;
  outline: none;
  padding: 10px 34px 10px 16px;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%23555' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 14px center;

  @media (max-width: 767px) {
    width: 100%;
    margin: 0;
    height: 44px;
  }
`;

const ContentWrap = styled.div`
  max-width: 1440px;
  margin: 0 auto;
  padding: 14px 32px 80px;
  width: 100%;
  box-sizing: border-box;
  display: flex;
  gap: 32px;
  align-items: flex-start;

  @media (min-width: 1024px) {
    max-width: 1376px;
  }

  @media (max-width: 767px) {
    padding: 6px 6px 80px;
    padding-left: 6px !important;
    padding-right: 6px !important;
    gap: 0;
  }
`;

const Sidebar = styled.aside`
  width: ${(p) => p.$width || "280px"};
  flex-shrink: 0;
  position: sticky;
  top: ${HEADER_H + 100}px;
  max-height: calc(100vh - ${HEADER_H + 100}px);
  overflow-y: auto;

  @media (min-width: ${CATALOG_DRAWER_MAX_PX + 1}px) {
    box-sizing: border-box;
    scrollbar-width: thin;
  }

  @media (max-width: ${CATALOG_DRAWER_MAX_PX}px) {
    position: fixed;
    top: 0;
    left: 0;
    width: min(380px, 92vw);
    height: 100dvh;
    max-height: 100dvh;
    z-index: ${CATALOG_FILTER_SIDEBAR_Z};
    background: #fff;
    box-shadow: ${(p) => (p.$open ? "4px 0 32px rgba(0,0,0,0.2)" : "none")};
    transform: translateX(${(p) => (p.$open ? "0" : "-100%")});
    transition: transform var(--app-duration-surface, 0.3s) var(--app-ease-out, cubic-bezier(0.4, 0, 0.2, 1));
    padding: 0;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    overflow: hidden;

    @media (prefers-reduced-motion: reduce) {
      transition: none;
    }
  }

  /* Phones (design): bottom sheet with rounded top corners instead of a side drawer. */
  @media (max-width: 767px) {
    top: auto;
    bottom: 0;
    width: 100%;
    height: 88dvh;
    max-height: 88dvh;
    border-radius: 24px 24px 0 0;
    box-shadow: ${(p) => (p.$open ? "0 -8px 32px rgba(0,0,0,0.2)" : "none")};
    transform: translateY(${(p) => (p.$open ? "0" : "100%")});
  }
`;

const SidebarSplit = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0;
`;

const DesktopSidebarContent = styled.div`
  @media (max-width: ${CATALOG_DRAWER_MAX_PX}px) {
    display: none;
  }
`;

/** Mobile drawer: fixed header/tabs + scroll/split region */
const MobileDrawerChrome = styled.div`
  display: none;
  @media (max-width: ${CATALOG_DRAWER_MAX_PX}px) {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }
`;

/** Category rows in drawer — visually distinct from filter rails */
/* Desktop (design): "Kategorie" and "Filter" are two separate white cards. */
const SidebarPane = styled.section`
  background: #fff;
  border-radius: 20px;
  padding: 18px 18px 8px;
  box-shadow: 0 0 0 1px rgba(29, 27, 24, 0.06);

  & + & {
    margin-top: 12px;
  }
`;

const SidebarOverlay = styled.div`
  display: none;
  @media (max-width: ${CATALOG_DRAWER_MAX_PX}px) {
    display: block;
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.45);
    z-index: ${CATALOG_FILTER_OVERLAY_Z};
    opacity: ${(p) => (p.$open ? 1 : 0)};
    pointer-events: ${(p) => (p.$open ? "auto" : "none")};
    transition: opacity var(--app-duration-surface, 0.3s) var(--app-ease-out, cubic-bezier(0.4, 0, 0.2, 1));

    @media (prefers-reduced-motion: reduce) {
      transition: none;
    }
  }
`;

const SidebarHead = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
  margin-bottom: 0;
  padding: 0;

  @media (min-width: 1024px) {
    display: none;
  }
`;

const SubcategoryGroup = styled.div`
  border-bottom: none;
  padding-bottom: 0;
  margin-bottom: 0;
`;

const SubcategoryLink = styled(Link).attrs((p) => ({
  className: p.$active ? "shop-typo-sidebar-submenu is-active" : "shop-typo-sidebar-submenu",
}))`
  display: block;
  padding: 6px 10px;
  text-decoration: none;
  border-radius: 10px;
  background: ${(p) => (p.$active ? "#fcebd5" : "transparent")};
  box-shadow: ${(p) => (p.$active ? "inset 3px 0 0 var(--shop-primary, #ee8a12)" : "none")};
  margin-bottom: 1px;
  transition: background 0.12s, color 0.12s;
  color: ${(p) => (p.$active ? "var(--sidebar-nav-color, #111827)" : "var(--sidebar-submenu-color, #4b5563)")};
  font-weight: ${(p) => (p.$active ? 600 : "var(--sidebar-submenu-fw, 400)")};

  &:hover {
    background: #f6f2ec;
    color: var(--sidebar-nav-color, #111827);
  }
`;

const Body = styled.div`
  flex: 1;
  min-width: 0;
`;

const ChipBar = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  padding: 14px 0 0;
`;

const Chip = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 34px;
  padding: 0 14px;
  background: var(--body-color, #1d1b18);
  color: #fff;
  border: none;
  border-radius: 999px;
  font-family: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.12s;

  &:hover { opacity: 0.85; }
`;

const ResultBar = styled.div`
  padding: 16px 0 12px;
  font-size: 14px;
  font-weight: 600;
  color: #5e574e;
`;

const Pager = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding-top: 48px;
`;

const PBtn = styled.button`
  min-width: 44px;
  height: 44px;
  padding: 0 10px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  border: 1px solid ${(p) => (p.$on ? "var(--body-color, #1d1b18)" : "#e6dfd4")};
  background: ${(p) => (p.$on ? "var(--body-color, #1d1b18)" : "#fff")};
  color: ${(p) => (p.$on ? "#fff" : "var(--body-color, #1d1b18)")};
  font-family: inherit;
  font-size: 14px;
  font-weight: ${(p) => (p.$on ? "700" : "400")};
  cursor: ${(p) => (p.disabled ? "not-allowed" : "pointer")};
  opacity: ${(p) => (p.disabled ? "0.3" : "1")};
  transition: border-color 0.12s, color 0.12s, background 0.12s;

  &:not(:disabled):hover {
    border-color: var(--body-color, #1d1b18);
  }
`;

/* Full-bleed backdrop behind the category's richtext block — spans the page's full width,
   independent of the sidebar+content column it used to sit inside. */
const RichtextStrip = styled.div`
  width: 100%;
  background: #f5f5f5;
  box-sizing: border-box;
  padding-top: 40px;
  padding-bottom: 48px;
`;

const Desc = styled.div`
  margin-top: ${(p) => (p.$divider === false ? "0" : "56px")};
  padding-top: ${(p) => (p.$divider === false ? "0" : "28px")};
  border-top: ${(p) => (p.$divider === false ? "none" : "1px solid #e8e8e6")};
  font-size: var(--body-fs);
  line-height: var(--body-lh);
  color: var(--body-color);
  font-family: var(--body-font);
  max-width: ${(p) => (p.$maxWidth === "full" ? "none" : (p.$maxWidth || "none"))};
  width: 100%;
  box-sizing: border-box;
  margin-left: ${(p) => (p.$align === "center" ? "auto" : "0")};
  margin-right: ${(p) => (p.$align === "center" ? "auto" : "0")};
  text-align: ${(p) => (p.$align === "center" ? "center" : "left")};

  & h1 {
    font-family: var(--h1-ff);
    font-size: var(--h1-fs);
    font-weight: var(--h1-fw);
    font-style: var(--h1-style);
    color: var(--h1-color);
    letter-spacing: var(--h1-ls);
    line-height: var(--h1-lh);
    margin: 1.25em 0 0.5em;
  }
  & h2 {
    font-family: var(--h2-ff);
    font-size: var(--h2-fs);
    font-weight: var(--h2-fw);
    font-style: var(--h2-style);
    color: var(--h2-color);
    letter-spacing: var(--h2-ls);
    line-height: var(--h2-lh);
    margin: 1.25em 0 0.5em;
  }
  & h3 {
    font-family: var(--h3-ff);
    font-size: var(--h3-fs);
    font-weight: var(--h3-fw);
    font-style: var(--h3-style);
    color: var(--h3-color);
    letter-spacing: var(--h3-ls);
    line-height: var(--h3-lh);
    margin: 1em 0 0.4em;
  }
  & h1:first-child,
  & h2:first-child,
  & h3:first-child {
    margin-top: 0;
  }
  & p { margin: 0 0 0.75em; }
  & p:last-child { margin-bottom: 0; }
  & strong { font-weight: 600; }
  & em { font-style: italic; }
  & a { color: var(--shop-primary, #111); text-decoration: underline; }
  & blockquote {
    margin: 0.75em 0;
    padding-left: 1em;
    border-left: 4px solid #e5e7eb;
    color: #6b7280;
  }
  /* Tailwind Preflight sets list-style:none and padding:0 — restore HTML lists. */
  & ul,
  & ol {
    margin: 0.5em 0 1em 1.25em;
    padding-left: 1.25em;
    padding-inline-start: 1.25em;
  }
  & ul {
    list-style: disc outside;
  }
  & ol {
    list-style: decimal outside;
  }
  & ul ul {
    list-style: circle outside;
    margin-top: 0.25em;
    margin-bottom: 0.25em;
  }
  & li {
    display: list-item;
    margin-bottom: 0.35em;
  }
  & li::marker {
    color: currentColor;
  }
`;

function safeUrl(val) {
  if (!val) return null;
  if (typeof val === "string") {
    const s = val.trim();
    if (s.startsWith("[")) {
      try {
        const arr = JSON.parse(s);
        return Array.isArray(arr) && arr[0] ? String(arr[0]) : null;
      } catch { return null; }
    }
    return s || null;
  }
  if (Array.isArray(val)) return val[0] ? String(val[0]) : null;
  return null;
}

function sanitizeHtml(html) {
  if (!html || typeof html !== "string") return "";
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/\s*on\w+=["'][^"']*["']/gi, "");
}

function parseCategoryMetadata(category) {
  let m = category?.metadata;
  if (typeof m === "string") {
    try {
      m = JSON.parse(m);
    } catch {
      m = {};
    }
  }
  return m && typeof m === "object" ? m : {};
}

function findCategoryNodeBySlug(nodes, slug, seen = new WeakSet()) {
  const norm = String(slug || "").replace(/^\//, "");
  for (const n of nodes || []) {
    if (!n || typeof n !== "object") continue;
    if (seen.has(n)) continue;
    seen.add(n);
    const s = String(n.slug || n.handle || "").replace(/^\//, "");
    if (s === norm) return n;
    const child = findCategoryNodeBySlug(n.children, slug, seen);
    if (child) return child;
  }
  return null;
}

function findCategoryNodeById(nodes, id, seen = new WeakSet()) {
  const nid = String(id || "");
  for (const n of nodes || []) {
    if (!n || typeof n !== "object") continue;
    if (seen.has(n)) continue;
    seen.add(n);
    if (String(n.id) === nid) return n;
    const child = findCategoryNodeById(n.children, id, seen);
    if (child) return child;
  }
  return null;
}

/** Returns ancestor nodes (root → direct parent) for a given slug, or null if not found. */
function findAncestors(nodes, slug, path = [], seen = new WeakSet()) {
  const norm = String(slug || "").replace(/^\//, "");
  for (const n of nodes || []) {
    if (!n || typeof n !== "object") continue;
    if (seen.has(n)) continue;
    seen.add(n);
    const s = String(n.slug || n.handle || "").replace(/^\//, "");
    if (s === norm) return path;
    const found = findAncestors(n.children || [], slug, [...path, n], seen);
    if (found !== null) return found;
  }
  return null;
}

function visibleSubcats(children) {
  return (children || []).filter((c) => c && c.active !== false && c.is_visible !== false && c.has_products !== false);
}

export default function CategoryTemplate() {
  const tUi = useTranslations("shopUi");
  const tCommon = useTranslations("common");
  const tFilter = useTranslations("filterPanel");
  const tSort = useTranslations("catalogSort");
  const sortLabel = (o) => (SORT_LABEL_KEYS.has(o.value) ? tSort(o.value) : o.label);
  const params = useParams();
  const searchParams = useSearchParams();
  const slug = params?.slug ? String(params.slug) : params?.handle ? String(params.handle) : "";
  const locale = params?.locale ? String(params.locale) : "de";
  const marketPrefixVal = useMarketPrefix();
  const shopStyles = useShopStyles();
  const tmpl = shopStyles?.category_template || {};

  const [category, setCategory] = useState(null);
  const [products, setProducts] = useState([]);
  const [subcategories, setSubcategories] = useState([]);
  const [parentCategory, setParentCategory] = useState(null);
  const [ancestors, setAncestors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saleMinPct, setSaleMinPct] = useState(DEFAULT_SALE_MIN_DISCOUNT_PERCENT);
  const [error, setError] = useState(null);
  const initialSortVal = searchParams?.get("sort") || "";
  const [sort, setSort] = useState(
    ["bestseller", "newest", "price_asc", "price_desc", "title_asc", "title_desc"].includes(initialSortVal) ? initialSortVal : "default"
  );
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({});
  const [priceRange, setPriceRange] = useState(null);
  const [inStockOnly, setInStockOnly] = useState(false);
  const [dealsOnly, setDealsOnly] = useState(false);
  const [brandSel, setBrandSel] = useState([]);
  const [panelOpen, setPanelOpen] = useState(false);
  const [metafieldDefinitions, setMetafieldDefinitions] = useState({});
  const [landingSettings, setLandingSettings] = useState({ show_product_filter_bar: true });

  const bodyRef = useRef(null);

  useEffect(() => {
    setFilters({});
    setPage(1);
  }, [slug]);

  useEffect(() => {
    let cancelled = false;
    loadCatalogBadgeRules().then((rules) => { if (!cancelled) setSaleMinPct(rules.saleMinDiscountPercent); });
    return () => { cancelled = true; };
  }, []);

  // Mobile: auto-open sidebar when navigating from a category link
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!window.matchMedia(catalogDrawerMaxCss).matches) return;
    if (sessionStorage.getItem("cat_nav_open") === "1") {
      sessionStorage.removeItem("cat_nav_open");
      setPanelOpen(true);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    if (!window.matchMedia(catalogDrawerMaxCss).matches) return undefined;
    const prev = document.body.style.overflow;
    if (panelOpen) document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [panelOpen]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/store-metafield-definitions")
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setMetafieldDefinitions(data?.definitions || {});
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const [catResBySlug, productRes] = await Promise.all([
          fetch(`/api/store-categories${storeCategoriesQuery(locale, { slug })}`).then((r) => r.json()).catch(() => ({ categories: [] })),
          fetch(`/api/store-products?category=${encodeURIComponent(slug)}&limit=96`).then((r) => r.json()).catch(() => ({ products: [] })),
        ]);
        if (cancelled) return;
        const cat = catResBySlug?.category || (Array.isArray(catResBySlug?.categories) ? catResBySlug.categories[0] : null);
        const resolvedCategory = cat || null;
        setCategory(resolvedCategory);
        if (!resolvedCategory) {
          setProducts([]);
          setSubcategories([]);
          setParentCategory(null);
          setAncestors([]);
          setLoading(false);
          return;
        }

        // Ancestors + children come on the slug payload (no full-tree download).
        const ancestorChain = Array.isArray(catResBySlug?.ancestors) ? catResBySlug.ancestors : [];
        setAncestors(ancestorChain);
        const directParent = ancestorChain.length > 0 ? ancestorChain[ancestorChain.length - 1] : null;
        setParentCategory(directParent);

        const subs = visibleSubcats(catResBySlug?.children).filter((s) => s && normCatId(s.id));
        setSubcategories(subs);

        setProducts(productRes?.products ?? []);

      } catch (err) {
        if (!cancelled) {
          setError(err?.message || "Failed to load category");
          setProducts([]);
          setSubcategories([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug, locale]);

  const meta = parseCategoryMetadata(category);
  const localizedCat = getLocalizedCategory(category, locale);
  const localizedName = localizedCat.name;

  useEffect(() => {
    if (category?.id && slug && localizedName) rememberViewedCategory({ slug, name: localizedName });
  }, [category?.id, slug, localizedName]);
  const displayTitle =
    (meta.display_title && String(meta.display_title).trim()) ||
    localizedName ||
    slug ||
    "Category";
  const rawBanner = safeUrl(category?.banner_image_url);
  const bannerUrl = rawBanner ? resolveImageUrl(rawBanner) : "";
  const rawBannerVideo = safeUrl(category?.metadata?.banner_video_url);
  const bannerVideoUrl = rawBannerVideo ? resolveImageUrl(rawBannerVideo) : "";
  const richtextHtml = localizedCat.long_content
    ? sanitizeHtml(rewriteImageUrlsInHtml(localizedCat.long_content))
    : "";

  /* ── Category template settings ── */
  const catBannerStyle  = tmpl.banner_style || "strip";
  const catBannerPreset = CAT_BANNER_PRESETS[catBannerStyle] || CAT_BANNER_PRESETS.strip;
  const showCatBanner   = catBannerStyle !== "none" && (!!bannerUrl || !!bannerVideoUrl);
  // Filter sidebar / mobile filter sheet follow the category template only. The landing flag
  // show_product_filter_bar belongs to the landing page's own hub filter bar (LandingContainers).
  const showSidebar     = tmpl.show_sidebar !== false;
  const sidebarWidth    = tmpl.sidebar_width || "280px";
  const colsPerRow      = Number(tmpl.products_per_row) || 4;
  const colsPerRowMobile = Number(tmpl.products_per_row_mobile) || 2;
  const richtextAlign   = tmpl.richtext_align || "left";
  const richtextMaxW    = tmpl.richtext_max_width || "full";
  const contentPadX     = tmpl.content_padding_x || "32px";

  useEffect(() => {
    if (!category || typeof document === "undefined") return;
    const m = parseCategoryMetadata(category);
    const dt =
      (m.display_title && String(m.display_title).trim()) ||
      getLocalizedCategory(category, locale).name ||
      slug ||
      "Category";
    const seo = categorySeoFallback(category, locale);
    const docTitle = seo.title || dt;
    document.title = docTitle;
    const desc = seo.description || "";
    const keywords = String(
      getLocalizedCategory(category, locale).keywords ||
        (category.seo_keywords && String(category.seo_keywords).trim()) ||
        (m.keywords && String(m.keywords).trim()) ||
        "",
    ).trim();
    const ensureMeta = (selector, create) => {
      let el = document.querySelector(selector);
      if (!el) {
        el = document.createElement("meta");
        Object.entries(create).forEach(([k, v]) => el.setAttribute(k, v));
        document.head.appendChild(el);
      }
      return el;
    };
    if (desc) {
      const el = ensureMeta('meta[name="description"]', { name: "description" });
      el.setAttribute("content", desc);
      ensureMeta('meta[property="og:description"]', { property: "og:description" }).setAttribute("content", desc);
    }
    if (docTitle) {
      ensureMeta('meta[property="og:title"]', { property: "og:title" }).setAttribute("content", docTitle);
    }
    if (keywords) {
      ensureMeta('meta[name="keywords"]', { name: "keywords" }).setAttribute("content", keywords);
    }
  }, [category, slug, locale]);

  useEffect(() => {
    if (typeof document === "undefined" || !slug) return;
    const prefix = canonicalMarketPrefix(locale);
    let el = document.querySelector('link[rel="canonical"]');
    if (!el) {
      el = document.createElement("link");
      el.rel = "canonical";
      document.head.appendChild(el);
    }
    el.href = `${SITE_URL}${prefix}/${slug}`;
  }, [slug, locale, marketPrefixVal]);

  const rawFacets = filterFacetsToCatalog(buildFacetsFromProducts(products), metafieldDefinitions);
  const facets = Object.fromEntries(
    Object.entries(rawFacets).filter(([k]) => k !== "category" && k !== "category_slug")
  );
  const hasFacets = Object.keys(facets).length > 0;
  const hasSubcategories = subcategories.length > 0;
  const showCatalogSidebar = hasFacets || hasSubcategories || !!parentCategory || products.length > 0;
  const showMobileCatNav = hasSubcategories || !!parentCategory;

  /* Mobile: sidebar stays closed on load — user opens manually via filter button */

  const toggle = (key, val) => {
    setFilters((prev) => {
      const cur = prev[key] || [];
      const next = cur.includes(val) ? cur.filter((x) => x !== val) : [...cur, val];
      if (!next.length) {
        const u = { ...prev };
        delete u[key];
        return u;
      }
      return { ...prev, [key]: next };
    });
    setPage(1);
  };

  const saleOnly = searchParams?.get("sale") === "1";

  let filtered = [...products];
  if (saleOnly || dealsOnly) filtered = filtered.filter((p) => isDiscountedProduct(p, saleMinPct));
  if (inStockOnly) filtered = filtered.filter((p) => productIsInStock(p));
  filtered = filterByPriceRange(filtered, priceRange);
  const facetCounts = facetValueCounts(filterByBrands(filtered, brandSel), facets, filters);
  const brandList = brandValues(products);
  const brandCountMap = brandCounts(filterProductsByFacets(filtered, filters), brandList);
  filtered = filterByBrands(filtered, brandSel);
  filtered = filterProductsByFacets(filtered, filters);
  const sorted = applyCatalogSort(filtered, sort, { bestsellerOnly: false });
  const total = sorted.length;
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
  const curPage = Math.min(page, totalPages);
  const paginated = sorted.slice((curPage - 1) * PER_PAGE, curPage * PER_PAGE);
  const activeCount = Object.values(filters).reduce((n, v) => n + (v?.length || 0), 0);
  const extraActive = (priceRange ? 1 : 0) + (inStockOnly ? 1 : 0) + (dealsOnly ? 1 : 0) + brandSel.length;
  const resetAllFilters = () => { setFilters({}); setPriceRange(null); setInStockOnly(false); setDealsOnly(false); setBrandSel([]); setPage(1); };
  const priceBounds = priceBoundsEuro(products);
  const filterPanelProps = {
    facets,
    filters,
    onToggle: toggle,
    onReset: resetAllFilters,
    facetTitle: (key) => getFacetGroupTitle(key, locale, metafieldDefinitions),
    optionLabel: (key, v) => formatFacetOptionLabel(key, v, null, locale, metafieldDefinitions),
    counts: facetCounts,
    brands: {
      values: brandList,
      selected: brandSel,
      counts: brandCountMap,
      onToggle: (b) => { setBrandSel((cur) => (cur.includes(b) ? cur.filter((x) => x !== b) : [...cur, b])); setPage(1); },
    },
    priceBounds,
    priceRange,
    onPriceChange: (r) => { setPriceRange(r); setPage(1); },
    toggles: [
      { id: "stock", label: tFilter("inStock"), checked: inStockOnly, onChange: (v) => { setInStockOnly(v); setPage(1); } },
      ...(saleOnly ? [] : [{ id: "deals", label: tFilter("onSale"), checked: dealsOnly, onChange: (v) => { setDealsOnly(v); setPage(1); } }]),
    ],
  };

  if (loading) {
    return (
      <>
        <Bone style={{ height: 220 }} />
        <ContentWrap>
          <Body>
            <Bone style={{ height: 13, width: 200, margin: "24px 0 32px" }} />
            <div
              style={{
                display: "grid",
                gridTemplateColumns: `repeat(${colsPerRow}, 1fr)`,
                gap: 1,
                background: "#e8e8e6",
              }}
            >
              {Array.from({ length: 6 }).map((_, i) => (
                <Bone key={i} style={{ aspectRatio: "3/4" }} />
              ))}
            </div>
          </Body>
        </ContentWrap>
      </>
    );
  }

  if (error) {
    return (
      <div style={{ padding: "48px 32px", color: "#b91c1c", fontSize: 14 }}>{error}</div>
    );
  }

  if (!category) {
    return (
      <div style={{ padding: "48px 32px", color: "#6b7280", fontSize: 14 }}>
        Kategorie nicht gefunden.
      </div>
    );
  }

  return (
    <LandingContainers
      categoryId={String(category.id)}
      applyCatalogDefaults
      onSettingsChange={setLandingSettings}
      catalogSlots={{
        page_banner: showCatBanner ? (
        <HeroBanner $aspect={catBannerPreset.aspectRatio} $minH={catBannerPreset.minHeight} $maxH={catBannerPreset.maxHeight}>
          {bannerVideoUrl ? (
            <video autoPlay muted loop playsInline src={bannerVideoUrl} />
          ) : (
            <img src={bannerUrl} alt={displayTitle} />
          )}
          <HeroText>
            <h1 className="shop-typo-catalog-title shop-typo-catalog-title--on-dark">{displayTitle}</h1>
          </HeroText>
        </HeroBanner>
      ) : (
        <ColHeader style={{ paddingLeft: contentPadX, paddingRight: contentPadX }}>
          <h1 className="shop-typo-catalog-title">{displayTitle}</h1>
        </ColHeader>
      ),
        product_container: (
          <>
      {hasSubcategories ? (
        <MobileSubPills aria-label={tCommon("categories")}>
          {subcategories.map((sub) => {
            const subSlug = String(sub.slug || "").replace(/^\//, "");
            return subSlug ? (
              <Link key={sub.id || subSlug} href={`/${subSlug}`}>{sub.name || subSlug}</Link>
            ) : null;
          })}
        </MobileSubPills>
      ) : null}
      <SortBar>
        <SortBarInner>
          <SortBarLeft>
            {showCatalogSidebar && showSidebar && (
              <FilterBtn
                type="button"
                $active={panelOpen || activeCount + extraActive > 0}
                onClick={() => setPanelOpen((o) => !o)}
                aria-expanded={panelOpen}
              >
                <svg viewBox="0 0 16 12">
                  <line x1="0" y1="2" x2="16" y2="2" />
                  <line x1="0" y1="6" x2="16" y2="6" />
                  <line x1="0" y1="10" x2="16" y2="10" />
                  <circle cx="5" cy="2" r="1.5" fill="#111" stroke="none" />
                  <circle cx="11" cy="6" r="1.5" fill="#111" stroke="none" />
                  <circle cx="5" cy="10" r="1.5" fill="#111" stroke="none" />
                </svg>
                {tCommon("filter")}{activeCount + extraActive > 0 ? ` (${activeCount + extraActive})` : ""}
              </FilterBtn>
            )}
            {/* Breadcrumb — desktop only */}
            <Breadcrumb data-breadcrumb="" aria-label={tUi("breadcrumb")} style={{ margin: 0 }}>
              <Link href="/">{tCommon("home")}</Link>
              {ancestors.map((anc) => {
                const ancSlug = String(anc.slug || anc.handle || "").replace(/^\//, "");
                return (
                  <React.Fragment key={anc.id || ancSlug}>
                    <span style={{ color: "#b8afa2", margin: "0 2px" }}>›</span>
                    <Link href={`/${ancSlug}`}>{anc.name || ancSlug}</Link>
                  </React.Fragment>
                );
              })}
              <span style={{ color: "#b8afa2", margin: "0 2px" }}>›</span>
              <b>{displayTitle}</b>
            </Breadcrumb>
          </SortBarLeft>
          <SortWrap>
            <SortLabel>{tSort("sortBy")}</SortLabel>
            <SortSelect value={sort} onChange={(e) => { setSort(e.target.value); setPage(1); }} aria-label={tUi("sortProducts")}>
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{sortLabel(o)}</option>
              ))}
            </SortSelect>
          </SortWrap>
        </SortBarInner>
      </SortBar>

      <ContentWrap ref={bodyRef} style={{ paddingLeft: contentPadX, paddingRight: contentPadX }}>
        {showCatalogSidebar && showSidebar && (
          <CatalogDrawerPortal>
            <>
              <SidebarOverlay $open={panelOpen} onClick={() => setPanelOpen(false)} />
              <Sidebar $open={panelOpen} $width={sidebarWidth}>
            <SidebarHead>
              <FilterSheetHeader
                showReset={activeCount + extraActive > 0}
                onReset={resetAllFilters}
                onClose={() => setPanelOpen(false)}
                closeLabel={tCommon("close")}
              />
            </SidebarHead>

            {/* Desktop: accordion layout — hidden on mobile when two-panel is present */}
            <DesktopSidebarContent>
            <SidebarSplit>
              {(hasSubcategories || parentCategory) && (
                <SidebarPane>
                  <SubcategoryGroup style={{ marginTop: 0 }}>
                    {hasSubcategories ? (
                      <>
                        {parentCategory && (
                          <SubcategoryLink
                            href={parentCategory.slug ? `/${String(parentCategory.slug).replace(/^\//, "")}` : "#"}
                            $active={false}
                            style={{ marginBottom: 2, opacity: 0.75 }}
                          >
                            ← {parentCategory.name || parentCategory.slug}
                          </SubcategoryLink>
                        )}
                        <div className="shop-typo-sidebar-nav" style={{ marginBottom: 4, marginTop: parentCategory ? 4 : 0 }}>
                          {displayTitle}
                        </div>
                        <SubcategoryLink href={slug ? `/${slug}` : "#"} $active={true} onClick={() => { setFilters({}); setPage(1); }}>
                          Alle
                        </SubcategoryLink>
                        {subcategories.map((sub) => {
                          const subSlug = String(sub.slug || "").replace(/^\//, "");
                          return (
                            <SubcategoryLink key={sub.id} href={subSlug ? `/${subSlug}` : "#"} $active={false} onClick={() => { setFilters({}); setPage(1); sessionStorage.setItem("cat_nav_open", "1"); }}>
                              {sub.name || sub.slug}
                            </SubcategoryLink>
                          );
                        })}
                      </>
                    ) : (
                      <>
                        <SubcategoryLink
                          href={parentCategory.slug ? `/${String(parentCategory.slug).replace(/^\//, "")}` : "#"}
                          $active={false}
                          style={{ marginBottom: 2, opacity: 0.75 }}
                        >
                          ← {parentCategory.name || parentCategory.slug}
                        </SubcategoryLink>
                        <div className="shop-typo-sidebar-nav" style={{ marginBottom: 4, marginTop: 4 }}>
                          {parentCategory.name || parentCategory.slug}
                        </div>
                        <SubcategoryLink
                          href={parentCategory.slug ? `/${String(parentCategory.slug).replace(/^\//, "")}` : "#"}
                          $active={false}
                          onClick={() => { setFilters({}); setPage(1); }}
                        >
                          Alle
                        </SubcategoryLink>
                        {visibleSubcats(parentCategory.children || []).map((sibling) => {
                          const sibSlug = String(sibling.slug || "").replace(/^\//, "");
                          const isCurrent = sibSlug === slug;
                          return (
                            <SubcategoryLink key={sibling.id} href={sibSlug ? `/${sibSlug}` : "#"} $active={isCurrent} onClick={() => { setFilters({}); setPage(1); if (!isCurrent) sessionStorage.setItem("cat_nav_open", "1"); }}>
                              {sibling.name || sibling.slug}
                            </SubcategoryLink>
                          );
                        })}
                      </>
                    )}
                  </SubcategoryGroup>
                </SidebarPane>
              )}
              <SidebarPane>
                <StackedFilterPanel {...filterPanelProps} />
              </SidebarPane>
            </SidebarSplit>
            </DesktopSidebarContent>

            {/* Mobile / tablet drawer: stacked groups like the MobileFilter artboard */}
            <MobileDrawerChrome>
              <FilterSheetScroll>
                <StackedFilterPanel
                  {...filterPanelProps}
                  showHeader={false}
                  before={showMobileCatNav ? (
                    <FilterSheetCategoryGroup current={displayTitle}>
                      {parentCategory ? (
                        <Link
                          href={parentCategory.slug ? `/${String(parentCategory.slug).replace(/^\//, "")}` : "#"}
                          data-muted="true"
                          onClick={() => { resetAllFilters(); setPanelOpen(false); }}
                        >
                          ‹ {parentCategory.name || parentCategory.slug}
                        </Link>
                      ) : null}
                      {(hasSubcategories ? subcategories : visibleSubcats(parentCategory?.children || [])).map((sub) => {
                        const subSlug = String(sub.slug || "").replace(/^\//, "");
                        const isCurrent = subSlug === slug;
                        return (
                          <Link
                            key={sub.id || subSlug}
                            href={subSlug ? `/${subSlug}` : "#"}
                            aria-current={isCurrent ? "page" : undefined}
                            onClick={() => { resetAllFilters(); setPanelOpen(false); }}
                          >
                            {sub.name || sub.slug}
                          </Link>
                        );
                      })}
                    </FilterSheetCategoryGroup>
                  ) : null}
                />
              </FilterSheetScroll>
              <FilterSheetFooter count={total} onClick={() => setPanelOpen(false)} />
            </MobileDrawerChrome>
          </Sidebar>
            </>
          </CatalogDrawerPortal>
        )}

        <Body>
          {activeCount + extraActive > 0 && (
            <ChipBar>
              {brandSel.map((b) => (
                <Chip key={`brand:${b}`} type="button" onClick={() => filterPanelProps.brands.onToggle(b)}>{b} ×</Chip>
              ))}
              {priceRange ? (
                <Chip type="button" onClick={() => { setPriceRange(null); setPage(1); }}>{priceRange[0]}–{priceRange[1]} € ×</Chip>
              ) : null}
              {inStockOnly ? <Chip type="button" onClick={() => setInStockOnly(false)}>{tFilter("inStock")} ×</Chip> : null}
              {dealsOnly ? <Chip type="button" onClick={() => setDealsOnly(false)}>{tFilter("onSale")} ×</Chip> : null}
              {Object.entries(filters).flatMap(([k, vals]) =>
                (vals || []).map((v) => (
                  <Chip key={`${k}:${v}`} type="button" onClick={() => toggle(k, v)}>
                    {formatFacetOptionLabel(k, v, null, locale, metafieldDefinitions)} ×
                  </Chip>
                )),
              )}
              <button
                type="button"
                onClick={resetAllFilters}
                style={{ border: "none", background: "none", padding: "0 6px", font: "inherit", fontSize: 13, fontWeight: 700, color: "#a65300", cursor: "pointer" }}
              >
                {tFilter("reset")}
              </button>
            </ChipBar>
          )}

          <ResultBar>
            {tSort("results", { count: total })}
          </ResultBar>

          {paginated.length === 0 ? (
            <div style={{ textAlign: "center", padding: "80px 0", color: "#bbb", fontSize: 12, letterSpacing: "0.06em", textTransform: "uppercase" }}>
              {tSort("noMatch")}
            </div>
          ) : (
            <CategoryProductListing
              products={paginated}
              activeFilters={filters}
              maxColumns={colsPerRow}
              maxColumnsMobile={colsPerRowMobile}
            />
          )}

          {totalPages > 1 && (
            <Pager>
              <PBtn
                type="button"
                disabled={curPage <= 1}
                onClick={() => { setPage((p) => p - 1); bodyRef.current?.scrollIntoView({ behavior: "smooth" }); }}
              >‹</PBtn>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter((p) => p === 1 || p === totalPages || Math.abs(p - curPage) <= 2)
                .reduce((acc, p, idx, arr) => {
                  if (idx > 0 && p - arr[idx - 1] > 1) acc.push("…");
                  acc.push(p);
                  return acc;
                }, [])
                .map((p, i) =>
                  p === "…"
                    ? <span key={`d${i}`} style={{ width: 36, textAlign: "center", color: "#bbb", fontSize: 12 }}>…</span>
                    : (
                      <PBtn
                        key={p}
                        type="button"
                        $on={p === curPage}
                        onClick={() => { setPage(p); bodyRef.current?.scrollIntoView({ behavior: "smooth" }); }}
                      >
                        {p}
                      </PBtn>
                    ))}
              <PBtn
                type="button"
                disabled={curPage >= totalPages}
                onClick={() => { setPage((p) => p + 1); bodyRef.current?.scrollIntoView({ behavior: "smooth" }); }}
              >›</PBtn>
            </Pager>
          )}
        </Body>
      </ContentWrap>
          </>
        ),
        page_richtext: richtextHtml ? (
        <RichtextStrip style={{ paddingLeft: contentPadX, paddingRight: contentPadX }}>
          <Desc $divider={false} $align={richtextAlign} $maxWidth={richtextMaxW} dangerouslySetInnerHTML={{ __html: richtextHtml }} />
        </RichtextStrip>
      ) : null,
      }}
    />
  );
}
