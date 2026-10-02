"use client";

import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useParams, useSearchParams } from "next/navigation";
import StackedFilterPanel, {
  useCatalogExtraFilters,
  FilterSheetHeader,
  FilterSheetScroll,
  FilterSheetFooter,
} from "@/components/catalog/StackedFilterPanel";
import styled, { keyframes } from "styled-components";
import { useTranslations } from "next-intl";
import { useRouter, usePathname } from "@/i18n/navigation";

import ShopHeader from "@/components/ShopHeader";
import Footer from "@/components/Footer";
import { ProductGrid } from "@/components/ProductGrid";
import { Link } from "@/i18n/navigation";
import { useMedusaProducts } from "@/hooks/useMedusa";
import { useShopStyles } from "@/context/ShopStylesContext";
import CatalogDrawerPortal, {
  CATALOG_DRAWER_MAX_PX,
  CATALOG_FILTER_OVERLAY_Z,
  CATALOG_FILTER_SIDEBAR_Z,
  catalogDrawerMaxCss,
} from "@/lib/catalog-drawer-portal";
import {
  SORT_OPTIONS,
  PER_PAGE,
  buildFacetsFromProducts,
  filterFacetsToCatalog,
  filterProductsByFacets,
  applyCatalogSort,
  getFacetGroupTitle,
  formatFacetOptionLabel,
  buildCategorySlugToNameMap,
} from "@/lib/catalog-listing";
import {
  dominantCategoryIdFromProducts,
  visibleSubcats,
  filterProductsByCategorySubtree,
} from "@/lib/search-listing-helpers";
import { normCatId } from "@/lib/category-product-ids";
import { cachedJsonFetch } from "@/lib/browser-fetch-cache";
import { categoryPathQuery, childrenCategoriesQuery } from "@/lib/store-categories-url";

const HEADER_H = 72;
const NARROW = "(max-width: 767px)";

const shimmer = keyframes`
  0%   { background-position: -800px 0; }
  100% { background-position:  800px 0; }
`;
const Bone = styled.div`
  background: linear-gradient(90deg, #efefed 25%, #e5e5e3 50%, #efefed 75%);
  background-size: 800px 100%;
  animation: ${shimmer} 1.5s infinite linear;
`;

const SEARCH_SORT_KEYS = new Set(["default", "bestseller", "newest", "price_asc", "price_desc", "title_asc", "title_desc"]);

const ColHeader = styled.div`
  padding: 28px 32px 0;
  max-width: 1440px;
  margin: 0 auto;
  width: 100%;
  box-sizing: border-box;
  @media (max-width: 767px) {
    padding: 16px 12px 0;
  }

  @media (max-width: 767px) {
    padding-left: 16px !important;
    padding-right: 16px !important;
  }
`;

const CategoryTitle = styled.h1.attrs({ className: "shop-typo-catalog-title" })`
  margin: 0 0 4px 0;
`;

const TitleSub = styled.p`
  font-size: 16px;
  color: #5e574e;
  margin: 0 0 0 0;
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

const BreadcrumbRow = styled.div`
  max-width: 1440px;
  margin: 0 auto;
  width: 100%;
  box-sizing: border-box;
  padding: 8px 32px 10px;
  background: #fff;
  border-bottom: 1px solid #e8e8e6;
  @media (max-width: 600px) { padding: 6px 16px 8px; }

  @media (max-width: 767px) { display: none; }
`;

const SortBar = styled.div`
  position: sticky;
  top: ${HEADER_H}px;
  z-index: 20;
  background: #fff;
  border-top: 1px solid #e8e8e6;
  border-bottom: 1px solid #e8e8e6;

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
  @media ${NARROW} {
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
    width: min(360px, 90vw);
    height: 100dvh;
    max-height: 100dvh;
    z-index: ${CATALOG_FILTER_SIDEBAR_Z};
    background: #fff;
    box-shadow: ${(p) => (p.$open ? "4px 0 32px rgba(0, 0, 0, 0.2)" : "none")};
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

const SidebarOverlay = styled.div`
  display: none;
  @media (max-width: ${CATALOG_DRAWER_MAX_PX}px) {
    display: block;
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.45);
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
  padding: 0;
  @media (min-width: 1024px) {
    display: none;
  }
`;

const DesktopSidebarContent = styled.div`
  @media (max-width: ${CATALOG_DRAWER_MAX_PX}px) {
    display: none;
  }
`;

const SidebarSplit = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0;
`;

/** Mobile two-tab drawer chrome */
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

const SubcategoryGroup = styled.div`
  border-bottom: none;
  padding-bottom: 0;
  margin-bottom: 0;
`;

const SubcategoryLink = styled(Link).attrs((p) => ({
  className: p.$active ? "shop-typo-sidebar-submenu is-active" : "shop-typo-sidebar-submenu",
}))`
  display: block;
  padding: 8px 10px;
  text-decoration: none;
  border-radius: 6px;
  background: ${(p) => (p.$active ? "#e6dfd4" : "transparent")};
  margin-bottom: 2px;
  transition: background 0.12s, color 0.12s;
  color: ${(p) => (p.$active ? "var(--sidebar-nav-color, #1d1b18)" : "var(--sidebar-submenu-color, #5e574e)")};
  font-weight: ${(p) => (p.$active ? 600 : "var(--sidebar-submenu-fw, 400)")};
  &:hover {
    background: #e6dfd4;
    color: var(--sidebar-nav-color, #1d1b18);
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

const ResultBar = styled.div`
  padding: 16px 0 12px;
  font-size: 11.5px;
  color: #999;
  letter-spacing: 0.04em;
`;

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

function normalizeSearchText(v) {
  return String(v || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isSubsequence(needle, haystack) {
  if (!needle || !haystack) return false;
  let i = 0;
  let j = 0;
  while (i < needle.length && j < haystack.length) {
    if (needle[i] === haystack[j]) i += 1;
    j += 1;
  }
  return i === needle.length;
}

function scoreProductForQuery(product, needle, tokens) {
  const title = normalizeSearchText(product?.title || "");
  const desc = normalizeSearchText(product?.description || "");
  const brand = normalizeSearchText(product?.brand || product?.brand_name || "");
  const category = normalizeSearchText(product?.category || product?.category_name || "");
  const merged = `${title} ${brand} ${category} ${desc}`.trim();
  if (!merged) return 0;

  let score = 0;
  if (title.includes(needle)) score += 120;
  else if (brand.includes(needle) || category.includes(needle)) score += 90;
  else if (desc.includes(needle)) score += 60;

  for (const t of tokens) {
    if (!t) continue;
    if (title.includes(t)) score += 24;
    else if (brand.includes(t) || category.includes(t)) score += 16;
    else if (desc.includes(t)) score += 10;
    else if (isSubsequence(t, title) || isSubsequence(t, brand) || isSubsequence(t, category)) score += 7;
    else if (isSubsequence(t, merged)) score += 3;
  }

  if (score === 0 && isSubsequence(needle, merged)) score += 5;
  return score;
}

function textMatchProducts(q, products) {
  if (!q || !Array.isArray(products)) return [];
  const needle = normalizeSearchText(q);
  if (!needle) return [];
  const tokens = needle.split(" ").filter(Boolean);

  const scored = products
    .map((p) => ({ p, s: scoreProductForQuery(p, needle, tokens) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .map((x) => x.p);

  if (scored.length > 0) return scored;
  return [...products];
}

function buildSearchUrl(pathname, q, cat) {
  const p = new URLSearchParams();
  if (q) p.set("q", q);
  if (cat) p.set("cat", cat);
  return `${pathname}?${p.toString()}`;
}

export default function SearchTemplate() {
  const tUi = useTranslations("shopUi");
  const tCommon = useTranslations("common");
  const tSort = useTranslations("catalogSort");
  const tHome = useTranslations("home");
  const tSearch = useTranslations("search");
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams();
  const locale = params?.locale ? String(params.locale) : "de";
  const shopStyles = useShopStyles();
  const tmpl = shopStyles?.category_template || {};
  const sidebarWidth = tmpl.sidebar_width || "280px";
  const showSidebarTmpl = tmpl.show_sidebar !== false;
  const contentPadX = tmpl.content_padding_x || "32px";
  const productsPerRow = Number(tmpl.products_per_row) || 4;
  const productsPerRowMobile = Number(tmpl.products_per_row_mobile) || 2;

  const q = (searchParams?.get("q") || "").trim();
  const catParam = (searchParams?.get("cat") || "").trim();

  const { products, loading, error } = useMedusaProducts();
  const [pathInfo, setPathInfo] = useState(null); // { category, ancestors, children }
  const [parentSiblings, setParentSiblings] = useState([]);
  const [treeLoading, setTreeLoading] = useState(false);
  const [sort, setSort] = useState("default");
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({});
  const [panelOpen, setPanelOpen] = useState(false);
  const [metafieldDefinitions, setMetafieldDefinitions] = useState({});
  const bodyRef = useRef(null);

  useEffect(() => {
    if (typeof document === "undefined") return undefined;
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

  const textHits = useMemo(
    () => (loading ? [] : textMatchProducts(q, products || [])),
    [q, products, loading],
  );

  const dominantId = useMemo(
    () => dominantCategoryIdFromProducts(textHits),
    [textHits],
  );

  useEffect(() => {
    if (!dominantId) {
      setPathInfo(null);
      setParentSiblings([]);
      setTreeLoading(false);
      return undefined;
    }
    let cancelled = false;
    setTreeLoading(true);
    cachedJsonFetch(`/api/store-categories${categoryPathQuery(locale, { id: dominantId })}`, { ttlMs: 60000 })
      .then((data) => {
        if (cancelled) return;
        if (!data?.category) {
          setPathInfo(null);
          return;
        }
        setPathInfo({
          category: data.category,
          ancestors: Array.isArray(data.ancestors) ? data.ancestors : [],
          children: Array.isArray(data.children) ? data.children : [],
        });
      })
      .catch(() => {
        if (!cancelled) setPathInfo(null);
      })
      .finally(() => {
        if (!cancelled) setTreeLoading(false);
      });
    return () => { cancelled = true; };
  }, [dominantId, locale]);

  const currentNode = useMemo(() => {
    if (!pathInfo?.category) return null;
    return { ...pathInfo.category, children: pathInfo.children || [] };
  }, [pathInfo]);

  const currentSlug = currentNode
    ? String(currentNode.slug || currentNode.handle || "").replace(/^\//, "")
    : "";

  const { parentCategory, subcategories, hasSubcategories, branchNav } = useMemo(() => {
    if (!currentNode || !currentSlug || !pathInfo) {
      return { parentCategory: null, subcategories: [], hasSubcategories: false, branchNav: true };
    }
    const chain = pathInfo.ancestors || [];
    const directParent = chain.length > 0 ? chain[chain.length - 1] : null;
    const subs = visibleSubcats(pathInfo.children).filter((s) => s && normCatId(s.id));
    if (subs.length > 0) {
      return {
        parentCategory: directParent,
        subcategories: subs,
        hasSubcategories: true,
        branchNav: true,
      };
    }
    if (directParent) {
      return {
        parentCategory: directParent,
        subcategories: visibleSubcats(parentSiblings).filter((s) => s && normCatId(s.id)),
        hasSubcategories: false,
        branchNav: false,
      };
    }
    return { parentCategory: null, subcategories: [], hasSubcategories: false, branchNav: true };
  }, [pathInfo, currentNode, currentSlug, parentSiblings]);

  /* Leaf category: load siblings from parent for the branch nav. */
  useEffect(() => {
    const kids = pathInfo?.children || [];
    const parentId = pathInfo?.ancestors?.length
      ? pathInfo.ancestors[pathInfo.ancestors.length - 1]?.id
      : null;
    if (!parentId || kids.length > 0) {
      setParentSiblings([]);
      return undefined;
    }
    let cancelled = false;
    cachedJsonFetch(`/api/store-categories${childrenCategoriesQuery(locale, parentId)}`, { ttlMs: 60000 })
      .then((data) => {
        if (cancelled) return;
        setParentSiblings(Array.isArray(data?.tree) ? data.tree : []);
      })
      .catch(() => {
        if (!cancelled) setParentSiblings([]);
      });
    return () => { cancelled = true; };
  }, [pathInfo, locale]);

  const displayTitle =
    (currentNode && (currentNode.name || currentSlug)) || "";

  const categorySlugToName = useMemo(() => {
    const nodes = [
      ...(pathInfo?.ancestors || []),
      pathInfo?.category,
      ...(pathInfo?.children || []),
      ...parentSiblings,
    ].filter(Boolean);
    return buildCategorySlugToNameMap(nodes);
  }, [pathInfo, parentSiblings]);

  const allowedCatSlugs = useMemo(() => {
    const s = new Set();
    s.add("");
    if (!currentNode) return s;
    if (hasSubcategories) {
      for (const sub of subcategories) {
        const sl = String(sub.slug || "").replace(/^\//, "");
        if (sl) s.add(sl);
      }
    } else if (parentCategory) {
      const psl = String(parentCategory.slug || "").replace(/^\//, "");
      if (psl) s.add(psl);
      for (const sub of subcategories) {
        const sl = String(sub.slug || "").replace(/^\//, "");
        if (sl) s.add(sl);
      }
    }
    return s;
  }, [currentNode, hasSubcategories, subcategories, parentCategory]);

  const catInvalid = Boolean(catParam && !allowedCatSlugs.has(catParam));
  const effectiveCat = catParam && !catInvalid ? catParam : "";

  const catNodeForFilter = useMemo(() => {
    if (!effectiveCat) return null;
    const pool = [
      currentNode,
      ...(pathInfo?.children || []),
      ...parentSiblings,
      ...(pathInfo?.ancestors || []),
    ].filter(Boolean);
    const hit = pool.find(
      (n) => String(n.slug || n.handle || "").replace(/^\//, "") === effectiveCat,
    );
    return hit || null;
  }, [effectiveCat, currentNode, pathInfo, parentSiblings]);

  const pushSearch = useCallback(
    (nextQ, nextCat) => {
      const target = buildSearchUrl(pathname, nextQ, nextCat);
      router.replace(target);
    },
    [pathname, router],
  );

  useEffect(() => {
    if (!catParam || !catInvalid) return;
    pushSearch(q, "");
  }, [catParam, catInvalid, q, pushSearch]);

  useEffect(() => {
    setFilters({});
    setPage(1);
  }, [q, effectiveCat]);

  const baseAfterCat = useMemo(() => {
    if (!q) return [];
    if (!catNodeForFilter) return textHits;
    return filterProductsByCategorySubtree(catNodeForFilter, textHits);
  }, [q, textHits, catNodeForFilter]);

  const facets = useMemo(() => {
    const raw = filterFacetsToCatalog(buildFacetsFromProducts(baseAfterCat), metafieldDefinitions);
    return Object.fromEntries(Object.entries(raw).filter(([k]) => k !== "category" && k !== "category_slug"));
  }, [baseAfterCat, metafieldDefinitions]);
  const hasFacets = Object.keys(facets).length > 0;


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

  const extra = useCatalogExtraFilters({
    base: baseAfterCat,
    facets,
    filters,
    setFilters,
    toggle,
    setPage,
    facetTitle: (key) => getFacetGroupTitle(key, locale, metafieldDefinitions),
    optionLabel: (key, v) => formatFacetOptionLabel(key, v, categorySlugToName, locale, metafieldDefinitions),
    resetKey: `${q}|${effectiveCat}`,
  });
  const afterFacets = extra.filtered;
  const sorted = applyCatalogSort(afterFacets, sort, { bestsellerOnly: false });
  const total = sorted.length;
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
  const curPage = Math.min(page, totalPages);
  const paginated = sorted.slice((curPage - 1) * PER_PAGE, curPage * PER_PAGE);
  const activeCount = Object.values(filters).reduce((n, v) => n + (v?.length || 0), 0) + extra.extraActive;

  const hasNavPane = Boolean(
    currentNode
      && (hasSubcategories
        || (!hasSubcategories && parentCategory && (subcategories || []).length > 0)),
  );

  const showCatalogSidebar =
    Boolean(q)
    && (textHits.length > 0)
    && (hasFacets || baseAfterCat.length > 0)
    && !treeLoading
    && showSidebarTmpl;

  const searchHrefForSub = (slug) => {
    const sl = String(slug || "").replace(/^\//, "");
    if (!sl) {
      return buildSearchUrl(pathname, q, "");
    }
    return buildSearchUrl(pathname, q, sl);
  };

  const title = q ? `„${q}“` : tSearch("label");


  if (loading && !textHits.length) {
    return (
      <div className="min-h-screen flex flex-col" style={{ background: "var(--shop-bg, #fff)" }}>
        <ShopHeader />
        <main className="flex-grow" aria-label={tUi("searchResults")}>
          <Bone style={{ height: 220 }} />
          <div style={{ maxWidth: 1440, margin: "0 auto", padding: "14px 32px" }}>
            <Bone style={{ height: 13, width: 200, margin: "24px 0 32px" }} />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 1, background: "#e8e8e6" }}>
              {Array.from({ length: 6 }).map((_, i) => (
                <Bone key={i} style={{ aspectRatio: "3/4" }} />
              ))}
            </div>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex flex-col" style={{ background: "var(--shop-bg, #fff)" }}>
        <ShopHeader />
        <div style={{ padding: "24px" }} className="text-red-800">{tHome("error")}</div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--shop-bg, #fff)" }}>
      <ShopHeader />
      <main className="flex-grow" aria-label={tUi("searchResults")}>
        <ColHeader style={{ paddingLeft: contentPadX, paddingRight: contentPadX }}>
          <CategoryTitle>{title}</CategoryTitle>
        </ColHeader>

        <SortBar>
          <SortBarInner>
            <SortBarLeft>
              {showCatalogSidebar && (
                <FilterBtn
                  type="button"
                  $active={panelOpen || activeCount > 0}
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
                  {tCommon("filter")}{activeCount > 0 ? ` (${activeCount})` : ""}
                </FilterBtn>
              )}
              <Breadcrumb data-breadcrumb="" aria-label={tUi("breadcrumb")}>
                <Link href="/">{tCommon("home")}</Link>
                <span style={{ color: "#b8afa2" }}>›</span>
                <b>{tSearch("label")}</b>
                {q ? (
                  <>
                    <span style={{ color: "#b8afa2" }}>›</span>
                    <b style={{ maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>„{q}“</b>
                  </>
                ) : null}
              </Breadcrumb>
            </SortBarLeft>
            <SortWrap>
              <SortLabel>{tSort("sortBy")}</SortLabel>
              <SortSelect
                value={sort}
                onChange={(e) => { setSort(e.target.value); setPage(1); }}
                aria-label={tUi("sortProducts")}
              >
                {SORT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{SEARCH_SORT_KEYS.has(o.value) ? tSort(o.value) : o.label}</option>
                ))}
              </SortSelect>
            </SortWrap>
          </SortBarInner>
        </SortBar>


        <ContentWrap ref={bodyRef} style={{ paddingLeft: contentPadX, paddingRight: contentPadX }}>
          {showCatalogSidebar && (
            <CatalogDrawerPortal>
              <>
                <SidebarOverlay $open={panelOpen} onClick={() => setPanelOpen(false)} />
                <Sidebar $open={panelOpen} $width={sidebarWidth} $filterMode={hasFacets}>
              <SidebarHead $filterMode={hasFacets}>
                <FilterSheetHeader
                  showReset={activeCount > 0}
                  onReset={extra.resetAll}
                  onClose={() => setPanelOpen(false)}
                  closeLabel={tCommon("close")}
                />
              </SidebarHead>

              {/* Desktop: accordion layout */}
              <DesktopSidebarContent>
                <SidebarSplit>
                  {/* Search shows product filters only; sub-category navigation is category-page only. */}
                  <SidebarPane>
                    <StackedFilterPanel {...extra.panelProps} />
                  </SidebarPane>
                </SidebarSplit>
              </DesktopSidebarContent>

              {/* Mobile / tablet drawer: stacked groups like the MobileFilter artboard */}
              <MobileDrawerChrome>
                <FilterSheetScroll>
                  <StackedFilterPanel {...extra.panelProps} showHeader={false} />
                </FilterSheetScroll>
                <FilterSheetFooter count={total} onClick={() => setPanelOpen(false)} />
              </MobileDrawerChrome>
            </Sidebar>
              </>
            </CatalogDrawerPortal>
          )}

          <Body>
            {activeCount > 0 && (
              <ChipBar>
                {extra.extraChips.map((c) => (
                  <Chip key={c.key} type="button" onClick={c.onRemove}>{c.label} ×</Chip>
                ))}
                {Object.entries(filters).flatMap(([k, vals]) =>
                  (vals || []).map((v) => (
                    <Chip key={`${k}:${v}`} type="button" onClick={() => toggle(k, v)}>
                      {formatFacetOptionLabel(k, v, categorySlugToName, locale, metafieldDefinitions)}
                      {" "}×
                    </Chip>
                  )))}
              </ChipBar>
            )}

            {q ? (
              <ResultBar>
                {tSort("results", { count: total })}
              </ResultBar>
            ) : null}

            {!q ? (
              <div style={{ textAlign: "center", padding: "48px 0", color: "#888" }}>
                {tCommon("search")}
              </div>
            ) : null}

            {q && paginated.length === 0 ? (
              <>
                <div style={{ textAlign: "center", padding: "24px 0 14px", color: "#5e574e", fontSize: 12, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                  {tUi("noDirectHits")}
                </div>
                <ProductGrid
                  products={applyCatalogSort(products || [], sort, { bestsellerOnly: false }).slice(0, PER_PAGE)}
                  activeFilters={{}}
                  maxColumns={productsPerRow}
                  maxColumnsMobile={productsPerRowMobile}
                />
              </>
            ) : null}

            {q && paginated.length > 0 ? (
              <ProductGrid
                products={paginated}
                activeFilters={filters}
                maxColumns={productsPerRow}
                maxColumnsMobile={productsPerRowMobile}
              />
            ) : null}

            {q && totalPages > 1 ? (
              <Pager>
                <PBtn
                  type="button"
                  disabled={curPage <= 1}
                  onClick={() => { setPage((p) => p - 1); bodyRef.current?.scrollIntoView({ behavior: "smooth" }); }}
                >
                  ‹
                </PBtn>
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter((p) => p === 1 || p === totalPages || Math.abs(p - curPage) <= 2)
                  .reduce((acc, p, idx, arr) => {
                    if (idx > 0 && p - arr[idx - 1] > 1) acc.push("…");
                    acc.push(p);
                    return acc;
                  }, [])
                  .map((p, i) =>
                    p === "…" ? (
                      <span key={`d${i}`} style={{ width: 36, textAlign: "center", color: "#bbb", fontSize: 12 }}>…</span>
                    ) : (
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
                >
                  ›
                </PBtn>
              </Pager>
            ) : null}
          </Body>
        </ContentWrap>
      </main>
      <Footer />
    </div>
  );
}
