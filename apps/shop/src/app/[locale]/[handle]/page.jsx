"use client";

import ShopHeader from "@/components/ShopHeader";
import Footer from "@/components/Footer";
import LandingContainers from "@/components/landing/LandingContainers";
import CategoryTemplate from "@/components/templates/CategoryTemplate";
import { ProductGrid } from "@/components/ProductGrid";
import { Link, useRouter } from "@/i18n/navigation";
import { useState, useEffect, useLayoutEffect, useRef } from "react";
import { useParams, useSearchParams, notFound } from "next/navigation";
import { useShopStyles } from "@/context/ShopStylesContext";
import { resolveImageUrl, rewriteImageUrlsInHtml } from "@/lib/image-url";
import { getMedusaClient } from "@/lib/medusa-client";
import {
  SORT_OPTIONS,
  PER_PAGE,
  buildFacetsFromProducts,
  filterProductsByFacets,
  applyCatalogSort,
  isDiscountedProduct,
  isRecentProduct,
  productSalesScore,
} from "@/lib/catalog-listing";
import styled, { keyframes } from "styled-components";
import CustomCheckbox from "@/components/ui/CustomCheckbox";
import CatalogDrawerPortal, {
  CATALOG_DRAWER_MAX_PX,
  CATALOG_FILTER_OVERLAY_Z,
  CATALOG_FILTER_SIDEBAR_Z,
  catalogDrawerMaxCss,
} from "@/lib/catalog-drawer-portal";

/* ─────────────────────────────────────────────────────────── */
const HEADER_H = 72; /* Main header bar (announcement TopBar removed) */

const RESERVED_HANDLES = [
  "search","login","register","account","bestsellers","recommended",
  "category","pages","collections","produkt","kollektion","product",
];

/** Diese Slugs sind Shop-Routen, keine Kollektionen — sonst 404 über notFound(). */
const WISHLIST_SLUGS = new Set(["merkzettel", "wishlist", "favorites"]);

function sanitize(html) {
  if (!html) return "";
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, "")
    .replace(/\s*on\w+=["'][^"']*["']/gi, "");
}

/* ─── Shimmer skeleton ───────────────────────────────────── */
const shimmer = keyframes`
  0%   { background-position: -800px 0; }
  100% { background-position:  800px 0; }
`;
const Bone = styled.div`
  background: linear-gradient(90deg, #efefed 25%, #e5e5e3 50%, #efefed 75%);
  background-size: 800px 100%;
  animation: ${shimmer} 1.5s infinite linear;
`;

/* ─── Page shell ─────────────────────────────────────────── */
const PageWrap = styled.div`
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: #fafafa;
`;

const Main = styled.main`
  flex: 1;
`;

/* ─── Hero banner (height controlled via props) ──────────── */
const BANNER_PRESETS = {
  strip:  { aspectRatio: "21 / 6", minHeight: "120px", maxHeight: "320px" },
  medium: { aspectRatio: "4 / 1",  minHeight: "200px", maxHeight: "480px" },
  tall:   { aspectRatio: "16 / 7", minHeight: "320px", maxHeight: "640px" },
};

const HeroBanner = styled.div`
  width: 100%;
  aspect-ratio: ${(p) => p.$aspect || "21 / 6"};
  min-height: ${(p) => p.$minH || "120px"};
  max-height: ${(p) => p.$maxH || "320px"};
  overflow: hidden;
  position: relative;
  background: #f4f4f2;

  img {
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

/* ─── Inline collection header (no banner) ──────────────── */
const ColHeader = styled.div`
  padding: 28px 32px 0;
  max-width: 1440px;
  margin: 0 auto;
  width: 100%;
  box-sizing: border-box;

  h1 {
    margin: 0;
  }

  @media (max-width: 600px) { padding: 20px 16px 0; }
`;

/* ─── Breadcrumb ─────────────────────────────────────────── */
const Breadcrumb = styled.nav`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: #999;
  letter-spacing: 0.02em;

  a { color: #999; text-decoration: none; transition: color 0.12s; &:hover { color: #111; } }
  b { color: #444; font-weight: 500; }

  @media (max-width: 767px) {
    display: none;
  }
`;

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

/* ─── Sort bar (top, sticky) ─────────────────────────────── */
const SortBar = styled.div`
  position: sticky;
  top: ${HEADER_H}px;
  z-index: 20;
  background: #fff;
  border-top: 1px solid #e8e8e6;
  border-bottom: 1px solid #e8e8e6;
`;

const SortBarInner = styled.div`
  max-width: 1440px;
  margin: 0 auto;
  padding: 0 32px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;

  @media (max-width: 600px) { padding: 0 16px; }
`;

const SortBarLeft = styled.div`
  display: flex;
  align-items: center;
  gap: 16px;
  min-width: 0;
  flex: 1;
`;

/* Mobile-only filter toggle */
const FilterBtn = styled.button`
  display: none;
  align-items: center;
  gap: 7px;
  padding: 12px 0;
  background: none;
  border: none;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: ${(p) => (p.$active ? "#111" : "#666")};
  cursor: pointer;
  transition: color 0.12s;
  border-bottom: 2px solid ${(p) => (p.$active ? "#111" : "transparent")};
  margin-bottom: -1px;

  svg { width: 14px; height: 14px; stroke: currentColor; fill: none; stroke-width: 1.8; }
  &:hover { color: #111; }

  @media (max-width: ${CATALOG_DRAWER_MAX_PX}px) {
    display: inline-flex;
  }
`;

const SortWrap = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: #666;
`;

const SortLabel = styled.span`
  font-size: 11px;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: #999;
  white-space: nowrap;

  @media (max-width: 480px) { display: none; }
`;

const SortSelect = styled.select`
  appearance: none;
  background: transparent;
  border: none;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: #111;
  cursor: pointer;
  outline: none;
  padding: 12px 20px 12px 0;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%23555' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 4px center;
`;

/* ─── Sidebar + content layout ───────────────────────────── */
const ContentWrap = styled.div`
  max-width: 1440px;
  margin: 0 auto;
  padding: 14px 32px 80px;
  width: 100%;
  box-sizing: border-box;
  display: flex;
  gap: 32px;
  align-items: flex-start;

  @media (max-width: 767px) {
    padding: 8px 6px 60px;
    padding-left: 4px !important;
    padding-right: 4px !important;
  }
`;

/* Left filter sidebar */
const Sidebar = styled.aside`
  width: ${(p) => p.$width || "220px"};
  flex-shrink: 0;
  position: sticky;
  top: ${HEADER_H + 100}px;
  max-height: calc(100vh - ${HEADER_H + 100}px);
  overflow-y: auto;

  /* Mobile/tablet: overlay drawer */
  @media (max-width: ${CATALOG_DRAWER_MAX_PX}px) {
    position: fixed;
    top: 0;
    left: ${(p) => (p.$open ? "0" : "-100vw")};
    width: ${(p) => (p.$mobileFilterMode ? "min(88vw, 340px)" : "250px")};
    height: 100dvh;
    max-height: 100dvh;
    z-index: ${CATALOG_FILTER_SIDEBAR_Z};
    background: #fff;
    box-shadow: 4px 0 16px rgba(0,0,0,0.12);
    transition: left 0.3s ease;
    padding: ${(p) => (p.$mobileFilterMode ? "0" : "16px")};
    box-sizing: border-box;
    display: ${(p) => (p.$mobileFilterMode ? "flex" : "block")};
    flex-direction: column;
    overflow: ${(p) => (p.$mobileFilterMode ? "hidden" : "auto")};
  }
`;

const SidebarOverlay = styled.div`
  display: none;
  @media (max-width: ${CATALOG_DRAWER_MAX_PX}px) {
    display: block;
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.35);
    z-index: ${CATALOG_FILTER_OVERLAY_Z};
    opacity: ${(p) => (p.$open ? 1 : 0)};
    pointer-events: ${(p) => (p.$open ? "auto" : "none")};
    transition: opacity var(--app-duration-surface, 0.3s) var(--app-ease-out, cubic-bezier(0.4, 0, 0.2, 1));
  }
`;

const SidebarHead = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
  margin-bottom: ${(p) => (p.$filterMode ? "0" : "20px")};
  padding: ${(p) => (p.$filterMode ? "12px 14px" : "0 0 12px")};
  border-bottom: 1px solid #e8e8e6;

  @media (min-width: 1024px) {
    display: none;
  }
`;

const FilterGroup = styled.div`
  border-bottom: 1px solid #eceae7;
`;

const FilterGroupTitle = styled.button`
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 0;
  background: none;
  border: none;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: #111;
  cursor: pointer;
  text-align: left;
`;

const FilterGroupHeading = styled.h4`
  margin: 0;
  padding: 0;
  font: inherit;
  flex: 1;
  min-width: 0;
  text-align: left;
`;

const FilterGroupBody = styled.div`
  display: ${(p) => (p.$open ? "block" : "none")};
  padding: 0 0 12px;
`;

const FilterChevron = styled.span`
  font-size: 14px;
  line-height: 1;
  color: #666;
  transform: rotate(${(p) => (p.$open ? "180deg" : "0deg")});
  transition: transform 0.18s ease;
`;

const CheckRow = styled.label`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 3px 0;
  cursor: pointer;
  font-size: 12.5px;
  color: ${(p) => (p.$on ? "#111" : "#555")};
  font-weight: ${(p) => (p.$on ? "600" : "400")};
  transition: color 0.12s;

  input {
    width: 13px;
    height: 13px;
    accent-color: #111;
    cursor: pointer;
    flex-shrink: 0;
  }

  &:hover { color: #111; }
`;

const ClearAllBtn = styled.button`
  background: none;
  border: 1px solid #ccc;
  padding: 5px 12px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #555;
  cursor: pointer;
  transition: border-color 0.12s, color 0.12s;

  &:hover { border-color: #111; color: #111; }
`;

const DesktopFilterContent = styled.div`
  overflow-y: auto;
  flex: 1;
  @media (max-width: ${CATALOG_DRAWER_MAX_PX}px) {
    display: none;
  }
`;

const MobileFilterSplit = styled.div`
  display: none;
  @media (max-width: ${CATALOG_DRAWER_MAX_PX}px) {
    display: flex;
    flex-direction: row;
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }
`;

const MobileFilterLeft = styled.div`
  width: 92px;
  flex-shrink: 0;
  overflow-y: auto;
  background: #f7f7f6;
  border-right: 1px solid #e8e8e6;
`;

const MobileFilterLeftBtn = styled.button`
  display: block;
  width: 100%;
  padding: 13px 8px 13px 11px;
  font-size: 11px;
  font-weight: ${(p) => (p.$active ? 700 : 400)};
  text-align: left;
  background: ${(p) => (p.$active ? "#fff" : "transparent")};
  border: none;
  border-left: 3px solid ${(p) => (p.$active ? "#111" : "transparent")};
  color: ${(p) => (p.$active ? "#111" : "#555")};
  cursor: pointer;
  line-height: 1.3;
  letter-spacing: 0.02em;
  font-family: inherit;
`;

const MobileFilterRight = styled.div`
  flex: 1;
  min-width: 0;
  overflow-y: auto;
  padding: 12px 10px;
`;

const MobileFilterPillGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 7px;
`;

const MobileFilterPill = styled.button`
  padding: 9px 6px;
  font-size: 11.5px;
  font-weight: ${(p) => (p.$on ? 700 : 400)};
  background: ${(p) => (p.$on ? "#111" : "#fff")};
  color: ${(p) => (p.$on ? "#fff" : "#444")};
  border: 1.5px solid ${(p) => (p.$on ? "#111" : "#d1d5db")};
  border-radius: 8px;
  cursor: pointer;
  text-align: center;
  line-height: 1.3;
  font-family: inherit;
  transition: background 0.12s, color 0.12s, border-color 0.12s;
  &:hover { border-color: #111; }
  word-break: break-word;
`;

/* Main content area (right of sidebar) */
const Body = styled.div`
  flex: 1;
  min-width: 0;
`;

/* ─── Active-filter chips ────────────────────────────────── */
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
  gap: 5px;
  padding: 4px 10px;
  background: #111;
  color: #fff;
  border: none;
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  cursor: pointer;
  transition: background 0.12s;

  &:hover { background: #333; }
`;

/* ─── Result bar above grid ──────────────────────────────── */
const ResultBar = styled.div`
  padding: 16px 0 12px;
  font-size: 11.5px;
  color: #999;
  letter-spacing: 0.04em;
`;

/* ─── Pagination ─────────────────────────────────────────── */
const Pager = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 3px;
  padding-top: 48px;
`;

const PBtn = styled.button`
  min-width: 36px;
  height: 36px;
  padding: 0 6px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid ${(p) => (p.$on ? "#111" : "#ddd")};
  background: ${(p) => (p.$on ? "#111" : "#fff")};
  color: ${(p) => (p.$on ? "#fff" : "#555")};
  font-size: 12.5px;
  font-weight: ${(p) => (p.$on ? "700" : "400")};
  cursor: ${(p) => (p.disabled ? "not-allowed" : "pointer")};
  opacity: ${(p) => (p.disabled ? "0.3" : "1")};
  transition: border-color 0.12s, color 0.12s, background 0.12s;

  &:not(:disabled):hover {
    border-color: #111;
    color: ${(p) => (p.$on ? "#fff" : "#111")};
  }
`;

/* ─── Description ────────────────────────────────────────── */
const Desc = styled.div`
  margin-top: 56px;
  padding-top: 28px;
  border-top: 1px solid #e8e8e6;
  font-size: var(--body-fs);
  line-height: var(--body-lh);
  color: var(--body-color);
  font-family: var(--body-font);
  max-width: ${(p) => (p.$maxWidth === "full" ? "none" : (p.$maxWidth || "700px"))};
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
  & h4 {
    font-family: var(--h4-ff);
    font-size: var(--h4-fs);
    font-weight: var(--h4-fw);
    font-style: var(--h4-style);
    color: var(--h4-color);
    letter-spacing: var(--h4-ls);
    line-height: var(--h4-lh);
    margin: 0.85em 0 0.35em;
  }
  & h5, & h6 {
    font-family: var(--h5-ff);
    font-size: var(--h5-fs);
    font-weight: var(--h5-fw);
    font-style: var(--h5-style);
    color: var(--h5-color);
    letter-spacing: var(--h5-ls);
    line-height: var(--h5-lh);
    margin: 0.85em 0 0.35em;
  }
  & h1:first-child,
  & h2:first-child,
  & h3:first-child {
    margin-top: 0;
  }
  p { margin: 0 0 0.75em; }
  a { color: var(--shop-primary, #111); text-decoration: underline; }
`;

/* ─────────────────────────────────────────────────────────── *
 *  Page
 * ─────────────────────────────────────────────────────────── */
export default function CollectionPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const locale = params?.locale ?? "en";
  const handle = params?.handle ? String(params.handle) : undefined;
  const shopStyles = useShopStyles();
  const tmpl = shopStyles?.collection_template || {};
  const saleOnly = (searchParams?.get("sale") || "").trim() === "1";
  const neuOnly = (searchParams?.get("neu") || "").trim() === "1";
  const bestsellerOnly = (searchParams?.get("bestseller") || "").trim() === "1";

  const [collection,  setCollection]  = useState(null);
  const [cmsPage,     setCmsPage]     = useState(null);
  const [products,    setProducts]    = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState(null);
  const [notFoundSt,  setNotFoundSt]  = useState(false);
  const [isCategorySlug, setIsCategorySlug] = useState(false);
  const [sort,        setSort]        = useState("default");
  const [page,        setPage]        = useState(1);
  const [filters,     setFilters]     = useState({});
  const [panelOpen,   setPanelOpen]   = useState(false);
  const [openFilterGroups, setOpenFilterGroups] = useState({});
  const [activeMobileFilterGroup, setActiveMobileFilterGroup] = useState(null);
  const [recommendedProducts, setRecommendedProducts] = useState([]);
  const [linkedCategoryId, setLinkedCategoryId] = useState(null);

  const bodyRef = useRef(null);

  useLayoutEffect(() => {
    if (!handle) return;
    const h = handle.toLowerCase();
    if (WISHLIST_SLUGS.has(h)) {
      router.replace("/wishlist");
    }
  }, [handle, router]);

  /** Nur explizit verknüpfte Kategorien (metadata.collection_id === Collection-UUID): keine Slug-Heuristik,
   * damit freistehende Kollektionen (z. B. „Sales“ ohne Kategorie) keine fremden Subkategorien anzeigen. */
  /** WeakSet breaks cycles in malformed category trees (would otherwise overflow the stack). */
  const findCategoryByCollection = (nodes, col, seen = new WeakSet()) => {
    if (!Array.isArray(nodes) || !col?.id) return null;
    const colId = String(col.id);
    for (const node of nodes) {
      if (!node || typeof node !== "object") continue;
      if (seen.has(node)) continue;
      seen.add(node);
      let meta = node?.metadata && typeof node.metadata === "object" ? node.metadata : {};
      if (typeof node?.metadata === "string") {
        try {
          meta = JSON.parse(node.metadata);
        } catch {
          meta = {};
        }
      }
      const linkedCollectionId = meta?.collection_id != null ? String(meta.collection_id).trim() : "";
      if (linkedCollectionId && linkedCollectionId === colId) {
        return node;
      }
      const nested = findCategoryByCollection(node?.children || [], col, seen);
      if (nested) return nested;
    }
    return null;
  };

  const findCategoryBySlug = (nodes, slug, seen = new WeakSet()) => {
    const wanted = String(slug || "").replace(/^\//, "").toLowerCase();
    if (!wanted) return null;
    for (const node of nodes || []) {
      if (!node || typeof node !== "object") continue;
      if (seen.has(node)) continue;
      seen.add(node);
      const nodeSlug = String(node?.slug || node?.handle || "").replace(/^\//, "").toLowerCase();
      if (nodeSlug === wanted) return node;
      const nested = findCategoryBySlug(node?.children || [], wanted, seen);
      if (nested) return nested;
    }
    return null;
  };

  /* ── Fetch ── */
  useEffect(() => {
    if (!handle) return;
    if (WISHLIST_SLUGS.has(handle.toLowerCase())) {
      return;
    }
    if (RESERVED_HANDLES.includes(handle.toLowerCase())) {
      setNotFoundSt(true);
      setLoading(false);
      return;
    }
    (async () => {
      try {
        setLoading(true);
        setError(null);

        // Lightweight category resolution first (cheap query by slug).
        const categoryBySlugRes = await fetch(`/api/store-categories?slug=${encodeURIComponent(handle)}`).catch(() => null);
        if (categoryBySlugRes?.ok) {
          const categoryBySlugData = await categoryBySlugRes.json().catch(() => null);
          if (categoryBySlugData?.category?.id || (categoryBySlugData?.categories?.length)) {
            setIsCategorySlug(true);
            setLoading(false);
            return;
          }
        }

        const colRes = await fetch(`/api/store-collections?handle=${encodeURIComponent(handle)}`);
        if (!colRes.ok) throw new Error(`HTTP ${colRes.status}`);

        const colData = await colRes.json();
        const col = colData?.collection ?? null;
        if (!col) {
          // Fallback: try CMS page by menu label slug
          const backendUrl = process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000";
          const pageRes = await fetch(`${backendUrl}/store/page-by-label-slug/${encodeURIComponent(handle)}`).catch(() => null);
          if (pageRes?.ok) {
            const pageData = await pageRes.json().catch(() => null);
            if (pageData?.id) { setCmsPage(pageData); setLoading(false); return; }
          }
          // Fallback 2: try by page slug directly
          const pageRes2 = await fetch(`${backendUrl}/store/pages/${encodeURIComponent(handle)}`).catch(() => null);
          if (pageRes2?.ok) {
            const pageData2 = await pageRes2.json().catch(() => null);
            if (pageData2?.id) { setCmsPage(pageData2); setLoading(false); return; }
          }
          // Fallback 3: try as category slug
          // Final fallback (heavier): full tree lookup only if slug lookup failed.
          const catTreeRes = await fetch(`/api/store-categories?tree=true&is_visible=true`).catch(() => null);
          if (catTreeRes?.ok) {
            const catTreeData = await catTreeRes.json().catch(() => null);
            const catTree = catTreeData?.tree || catTreeData?.categories || [];
            if (findCategoryBySlug(catTree, handle)) {
              setIsCategorySlug(true); setLoading(false); return;
            }
          }
          setNotFoundSt(true); setLoading(false); return;
        }
        setCollection(col);

        const qs = new URLSearchParams({ limit: "200" });
        if (col.id)     qs.set("collection_id",     String(col.id));
        if (col.handle) qs.set("collection_handle",  String(col.handle));

        const pr = await fetch(`/api/store-products?${qs}`).then(r => r.json()).catch(() => ({ products: [] }));
        setProducts(pr?.products ?? []);
      } catch (e) {
        setError(e?.message ?? "Error");
      } finally {
        setLoading(false);
      }
    })();
  }, [handle]);

  useEffect(() => {
    if (!collection?.id && !collection?.handle) {
      setLinkedCategoryId(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const data = await getMedusaClient().getCategories({ tree: true, is_visible: true });
        const tree = data?.tree || data?.categories || [];
        const currentCategory = findCategoryByCollection(tree, collection);
        if (!cancelled) {
          setLinkedCategoryId(currentCategory?.id ? String(currentCategory.id) : null);
        }
      } catch {
        if (!cancelled) setLinkedCategoryId(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [collection?.id, collection?.handle]);

  /* ── Recommended products (from collection.recommended_product_ids) ── */
  useEffect(() => {
    const ids = collection?.recommended_product_ids;
    if (!Array.isArray(ids) || ids.length === 0) { setRecommendedProducts([]); return; }
    (async () => {
      const list = await Promise.all(
        ids.slice(0, 12).map((id) =>
          fetch(`/api/store-products/${encodeURIComponent(id)}`).then((r) => r.json()).then((d) => d?.product).catch(() => null)
        )
      );
      setRecommendedProducts(list.filter(Boolean));
    })();
  }, [collection?.recommended_product_ids]);

  /* ── Canonical ── */
  useEffect(() => {
    if (typeof document === "undefined" || !collection?.handle) return;
    let el = document.querySelector('link[rel="canonical"]');
    if (!el) { el = document.createElement("link"); el.rel = "canonical"; document.head.appendChild(el); }
    el.href = `${window.location.origin}/${locale}/${collection.handle}`;
  }, [locale, collection?.handle]);

  const facets = buildFacetsFromProducts(products);

  const hasFacets = Object.keys(facets).length > 0;
  const showCatalogSidebar = hasFacets;

  useEffect(() => {
    const facetKeys = Object.keys(facets);
    setOpenFilterGroups((prev) => {
      let changed = false;
      const next = { ...prev };

      facetKeys.forEach((key) => {
        if (!(key in next)) {
          next[key] = Boolean(filters[key]?.length);
          changed = true;
        }
      });

      return changed ? next : prev;
    });
  }, [facets, filters]);

  useEffect(() => {
    if (!panelOpen) return;
    const keys = Object.keys(facets);
    if (keys.length > 0 && (!activeMobileFilterGroup || !facets[activeMobileFilterGroup])) {
      setActiveMobileFilterGroup(keys[0]);
    }
  }, [panelOpen, facets, activeMobileFilterGroup]);

  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    if (!window.matchMedia(catalogDrawerMaxCss).matches) return undefined;
    const prev = document.body.style.overflow;
    if (panelOpen) document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [panelOpen]);

  /* ── Filter ── */
  const toggle = (key, val) => {
    setFilters(prev => {
      const cur  = prev[key] || [];
      const next = cur.includes(val) ? cur.filter(x => x !== val) : [...cur, val];
      if (!next.length) { const u = { ...prev }; delete u[key]; return u; }
      return { ...prev, [key]: next };
    });
    setPage(1);
  };

  let filtered = [...products];
  if (saleOnly) {
    filtered = filtered.filter((p) => isDiscountedProduct(p));
  }
  if (neuOnly) {
    filtered = filtered.filter((p) => isRecentProduct(p, 2));
  }
  if (bestsellerOnly) {
    filtered = filtered.filter((p) => productSalesScore(p) > 0);
  }
  filtered = filterProductsByFacets(filtered, filters);

  const sorted = applyCatalogSort(filtered, sort, { bestsellerOnly });

  const total      = sorted.length;
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
  const curPage    = Math.min(page, totalPages);
  const paginated  = sorted.slice((curPage - 1) * PER_PAGE, curPage * PER_PAGE);

  const activeCount = Object.values(filters).reduce((n, v) => n + (v?.length || 0), 0);

  /* ── Derived display values ── */
  const title     = collection?.display_title || collection?.title || handle || "";
  const rawBanner = collection?.banner || collection?.banner_image_url || collection?.image_url || "";
  const bannerUrl = rawBanner ? resolveImageUrl(rawBanner) : "";

  /* ── Template settings (from StylesPage) ── */
  const bannerStyle   = tmpl.banner_style || "strip";
  const bannerPreset  = BANNER_PRESETS[bannerStyle] || BANNER_PRESETS.strip;
  const showBanner    = bannerStyle !== "none" && !!bannerUrl;
  const showSidebar   = tmpl.show_sidebar !== false;
  const sidebarWidth  = tmpl.sidebar_width || "220px";
  const colsPerRow    = Number(tmpl.products_per_row) || 4;
  const colsPerRowMobile = Number(tmpl.products_per_row_mobile) || 2;
  const richtextAlign = tmpl.richtext_align || "left";
  const richtextMaxW  = tmpl.richtext_max_width || "700px";
  const contentPadX   = tmpl.content_padding_x || "32px";

  if (cmsPage) return (
    <PageWrap>
      <ShopHeader />
      <Main style={{ paddingTop: HEADER_H }}>
        <LandingContainers pageId={String(cmsPage.id)} />
        {cmsPage.body ? (
          <div style={{ maxWidth: 800, margin: "0 auto", padding: "40px 24px" }}
            dangerouslySetInnerHTML={{ __html: sanitize(cmsPage.body) }} />
        ) : null}
      </Main>
      <Footer />
    </PageWrap>
  );

  if (isCategorySlug) return (
    <PageWrap>
      <ShopHeader />
      <Main>
        <CategoryTemplate />
      </Main>
      <Footer />
    </PageWrap>
  );

  if (notFoundSt) notFound();

  /* ────────────────────────────────────────────────────────── *
   *  Skeleton
   * ────────────────────────────────────────────────────────── */
  if (loading) return (
    <PageWrap>
      <ShopHeader />
      <Main>
        <Bone style={{ height: 220 }} />
        <Body>
          <Bone style={{ height: 13, width: 200, margin: "24px 0 32px" }} />
          <div style={{
            display: "grid",
            gridTemplateColumns: `repeat(${Math.min(Math.max(Number(tmpl.products_per_row) || 4, 1), 6)}, 1fr)`,
            gap: 1,
            background: "#e8e8e6",
          }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <Bone key={i} style={{ aspectRatio: "3/4" }} />
            ))}
          </div>
        </Body>
      </Main>
      <Footer />
    </PageWrap>
  );

  if (error || !collection) return (
    <PageWrap>
      <ShopHeader />
      <Main>
        <Body>
          <p style={{ padding: "48px 0", color: "#b91c1c", fontSize: 13 }}>
            {error || "Collection not found."}
          </p>
        </Body>
      </Main>
      <Footer />
    </PageWrap>
  );

  /* ────────────────────────────────────────────────────────── *
   *  Render
   * ────────────────────────────────────────────────────────── */
  return (
    <PageWrap>
      <ShopHeader />
      <Main>

        {/* ── Banner / header ── */}
        {showBanner ? (
          <HeroBanner $aspect={bannerPreset.aspectRatio} $minH={bannerPreset.minHeight} $maxH={bannerPreset.maxHeight}>
            <img src={bannerUrl} alt={title} />
            <HeroText>
              <h1 className="shop-typo-catalog-title shop-typo-catalog-title--on-dark">{title}</h1>
            </HeroText>
          </HeroBanner>
        ) : (
          <ColHeader style={{ paddingLeft: contentPadX, paddingRight: contentPadX }}>
            <h1 className="shop-typo-catalog-title">{title}</h1>
          </ColHeader>
        )}

        {linkedCategoryId ? <LandingContainers categoryId={linkedCategoryId} /> : null}

        {/* ── Sort bar (sticky) ── */}
        <SortBar>
          <SortBarInner>
            <SortBarLeft>
              {/* Mobile filter toggle */}
              {showCatalogSidebar && (
                <FilterBtn
                  type="button"
                  $active={panelOpen || activeCount > 0}
                  onClick={() => setPanelOpen(o => !o)}
                  aria-expanded={panelOpen}
                >
                  <svg viewBox="0 0 16 12">
                    <line x1="0" y1="2"  x2="16" y2="2" />
                    <line x1="0" y1="6"  x2="16" y2="6" />
                    <line x1="0" y1="10" x2="16" y2="10"/>
                    <circle cx="5"  cy="2"  r="1.5" fill="#111" stroke="none"/>
                    <circle cx="11" cy="6"  r="1.5" fill="#111" stroke="none"/>
                    <circle cx="5"  cy="10" r="1.5" fill="#111" stroke="none"/>
                  </svg>
                  <>
                    Filter {activeCount > 0 ? `(${activeCount})` : ""}
                  </>
                </FilterBtn>
              )}
            </SortBarLeft>
            <SortWrap>
              <SortLabel>Sort:</SortLabel>
              <SortSelect
                value={sort}
                onChange={e => { setSort(e.target.value); setPage(1); }}
                aria-label="Sort products"
              >
                {SORT_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </SortSelect>
            </SortWrap>
          </SortBarInner>
        </SortBar>

        <BreadcrumbRow style={{ paddingLeft: contentPadX, paddingRight: contentPadX }}>
          <Breadcrumb aria-label="Breadcrumb">
            <Link href={`/${locale}`}>Home</Link>
            <span style={{ color: "#ccc" }}>/</span>
            <b>{title}</b>
          </Breadcrumb>
        </BreadcrumbRow>

        {/* ── Sidebar + content ── */}
        <ContentWrap ref={bodyRef} style={{ paddingLeft: contentPadX, paddingRight: contentPadX }}>

          {/* Left filter sidebar */}
          {showCatalogSidebar && showSidebar && (
            <CatalogDrawerPortal>
              <>
                <SidebarOverlay $open={panelOpen} onClick={() => setPanelOpen(false)} />
                <Sidebar $open={panelOpen} $width={sidebarWidth} $mobileFilterMode={true}>
              <SidebarHead $filterMode={true}>
                <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase" }}>
                  Filter{activeCount > 0 ? ` (${activeCount})` : ""}
                </span>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {activeCount > 0 && (
                    <ClearAllBtn type="button" onClick={() => { setFilters({}); setPage(1); }} style={{ padding: "2px 8px", fontSize: 10 }}>
                      Löschen
                    </ClearAllBtn>
                  )}
                  <button type="button" onClick={() => setPanelOpen(false)} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "#555", lineHeight: 1, padding: 0 }}>×</button>
                </div>
              </SidebarHead>

              {/* Desktop: accordion */}
              <DesktopFilterContent>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#111", marginBottom: 8, paddingBottom: 8, borderBottom: "1px solid #e8e8e6" }}>
                  Filter
                  {activeCount > 0 && (
                    <ClearAllBtn type="button" onClick={() => { setFilters({}); setPage(1); }} style={{ float: "right", padding: "2px 8px", fontSize: 10 }}>Clear</ClearAllBtn>
                  )}
                </div>
                {Object.entries(facets).map(([key, vals]) => (
                  <FilterGroup key={key}>
                    <FilterGroupTitle type="button" onClick={() => setOpenFilterGroups((prev) => ({ ...prev, [key]: !prev[key] }))}>
                      <FilterGroupHeading>{({
                        brand_name: "Marke", farbe: "Farbe", colour: "Colour", color: "Color",
                        material: "Material", size: "Größe", groesse: "Größe",
                        typ: "Typ", style: "Style", gender: "Gender",
                        age_group: "Altersgruppe", season: "Saison",
                      })[key] ?? key.replace(/_/g, " ")}</FilterGroupHeading>
                      <FilterChevron $open={!!openFilterGroups[key]}>⌄</FilterChevron>
                    </FilterGroupTitle>
                    <FilterGroupBody $open={!!openFilterGroups[key]}>
                      {vals.map(val => {
                        const on = (filters[key] || []).includes(val);
                        return (
                          <CheckRow key={val} $on={on}>
                            <CustomCheckbox checked={on} onChange={() => toggle(key, val)} size={18} />
                            {val}
                          </CheckRow>
                        );
                      })}
                    </FilterGroupBody>
                  </FilterGroup>
                ))}
                {activeCount > 0 && (
                  <ClearAllBtn type="button" onClick={() => { setFilters({}); setPage(1); setPanelOpen(false); }}>Clear all filters</ClearAllBtn>
                )}
              </DesktopFilterContent>

              {/* Mobile: two-panel filter */}
              <MobileFilterSplit>
                <MobileFilterLeft>
                  {Object.entries(facets).map(([key]) => {
                    const cnt = (filters[key] || []).length;
                    const label = ({
                      brand_name: "Marke", farbe: "Farbe", colour: "Colour", color: "Color",
                      material: "Material", size: "Größe", groesse: "Größe",
                      typ: "Typ", style: "Style", gender: "Gender",
                      age_group: "Altersgruppe", season: "Saison",
                    })[key] ?? key.replace(/_/g, " ");
                    return (
                      <MobileFilterLeftBtn key={key} type="button" $active={activeMobileFilterGroup === key} onClick={() => setActiveMobileFilterGroup(key)}>
                        {label}
                        {cnt > 0 && <span style={{ display: "block", fontSize: 9, color: "#ff971c", fontWeight: 800, marginTop: 2 }}>{cnt} ausgewählt</span>}
                      </MobileFilterLeftBtn>
                    );
                  })}
                </MobileFilterLeft>
                <MobileFilterRight>
                  {activeMobileFilterGroup && facets[activeMobileFilterGroup] ? (
                    <MobileFilterPillGrid>
                      {facets[activeMobileFilterGroup].map((val) => {
                        const on = (filters[activeMobileFilterGroup] || []).includes(val);
                        return (
                          <MobileFilterPill key={val} type="button" $on={on} onClick={() => toggle(activeMobileFilterGroup, val)}>
                            {val}
                          </MobileFilterPill>
                        );
                      })}
                    </MobileFilterPillGrid>
                  ) : (
                    <div style={{ color: "#aaa", fontSize: 12 }}>Wähle einen Filter</div>
                  )}
                </MobileFilterRight>
              </MobileFilterSplit>
            </Sidebar>
              </>
            </CatalogDrawerPortal>
          )}

          {/* Main content */}
          <Body>
            {/* Active filter chips */}
            {activeCount > 0 && (
              <ChipBar>
                {Object.entries(filters).flatMap(([k, vals]) =>
                  (vals || []).map(v => (
                    <Chip key={`${k}:${v}`} type="button" onClick={() => toggle(k, v)}>
                      {v} ×
                    </Chip>
                  ))
                )}
              </ChipBar>
            )}

            {/* Result count */}
            <ResultBar>
              {total} {total === 1 ? "product" : "products"}
            </ResultBar>

            {/* Grid */}
            {paginated.length === 0 ? (
              <div style={{ textAlign: "center", padding: "80px 0", color: "#bbb", fontSize: 12, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                No products match your filters.
              </div>
            ) : (
              <ProductGrid
                products={paginated}
                maxColumns={colsPerRow}
                maxColumnsMobile={colsPerRowMobile}
                activeFilters={filters}
              />
            )}

            {/* Önerilen ürünler */}
            {recommendedProducts.length > 0 && (
              <section style={{ marginTop: 48, marginBottom: 24 }}>
                <h2 style={{ fontSize: "1.25rem", fontWeight: 700, marginBottom: 16, color: "#111" }}>Önerilen ürünler</h2>
                <ProductGrid products={recommendedProducts} maxColumns={4} maxColumnsMobile={2} />
              </section>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <Pager>
                <PBtn
                  type="button"
                  disabled={curPage <= 1}
                  onClick={() => { setPage(p => p - 1); bodyRef.current?.scrollIntoView({ behavior: "smooth" }); }}
                >‹</PBtn>

                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter(p => p === 1 || p === totalPages || Math.abs(p - curPage) <= 2)
                  .reduce((acc, p, idx, arr) => {
                    if (idx > 0 && p - arr[idx - 1] > 1) acc.push("…");
                    acc.push(p);
                    return acc;
                  }, [])
                  .map((p, i) =>
                    p === "…"
                      ? <span key={`d${i}`} style={{ width: 36, textAlign: "center", color: "#bbb", fontSize: 12 }}>…</span>
                      : <PBtn key={p} type="button" $on={p === curPage}
                          onClick={() => { setPage(p); bodyRef.current?.scrollIntoView({ behavior: "smooth" }); }}>
                          {p}
                        </PBtn>
                  )}

                <PBtn
                  type="button"
                  disabled={curPage >= totalPages}
                  onClick={() => { setPage(p => p + 1); bodyRef.current?.scrollIntoView({ behavior: "smooth" }); }}
                >›</PBtn>
              </Pager>
            )}

            {/* Description */}
            {collection.description && (
              <Desc $align={richtextAlign} $maxWidth={richtextMaxW}
                dangerouslySetInnerHTML={{ __html: sanitize(rewriteImageUrlsInHtml(collection.description)) }} />
            )}
          </Body>
        </ContentWrap>
      </Main>
      <Footer />
    </PageWrap>
  );
}
