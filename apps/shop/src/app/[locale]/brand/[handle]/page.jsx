"use client";

/**
 * Brand page — same layout as category / collection pages:
 * banner (or title) → filter + sort bar → filter sidebar (desktop card, mobile bottom sheet) + product grid.
 * Filters come from the products' metadata (StackedFilterPanel); sub-category navigation is
 * category-page only, so brands show product filters only.
 */

import ShopHeader from "@/components/ShopHeader";
import Footer from "@/components/Footer";
import { CategoryProductListing } from "@/components/CategoryProductListing";
import { Link } from "@/i18n/navigation";
import { useState, useEffect, useRef, useMemo } from "react";
import { useParams, notFound } from "next/navigation";
import { resolveImageUrl } from "@/lib/image-url";
import { useMarketPrefix } from "@/context/MarketPrefixContext";
import { useShopStyles } from "@/context/ShopStylesContext";
import { SITE_URL } from "@/lib/seo";
import { canonicalMarketPrefix } from "@/lib/shop-market";
import {
  SORT_OPTIONS,
  PER_PAGE,
  buildFacetsFromProducts,
  filterFacetsToCatalog,
  applyCatalogSort,
  formatFacetOptionLabel,
  getFacetGroupTitle,
} from "@/lib/catalog-listing";
import styled, { keyframes } from "styled-components";
import { useTranslations } from "next-intl";
import CatalogDrawerPortal, {
  CATALOG_DRAWER_MAX_PX,
  CATALOG_FILTER_OVERLAY_Z,
  CATALOG_FILTER_SIDEBAR_Z,
  catalogDrawerMaxCss,
} from "@/lib/catalog-drawer-portal";
import StackedFilterPanel, {
  useCatalogExtraFilters,
  FilterSheetHeader,
  FilterSheetScroll,
  FilterSheetFooter,
} from "@/components/catalog/StackedFilterPanel";

const HEADER_H = 72;
const SORT_LABEL_KEYS = new Set(["default", "bestseller", "newest", "price_asc", "price_desc", "title_asc", "title_desc"]);

const shimmer = keyframes`
  0%   { background-position: -800px 0; }
  100% { background-position:  800px 0; }
`;
const Bone = styled.div`
  background: linear-gradient(90deg, #efe8dd 25%, #e6dfd4 50%, #efe8dd 75%);
  background-size: 800px 100%;
  animation: ${shimmer} 1.5s infinite linear;
  border-radius: 16px;
`;

const PageWrap = styled.div`
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--shop-bg, #f6f2ec);
`;

const Main = styled.main`
  flex: 1;
`;

/* ─── Banner (same sizing as the category banner) ───────── */
const HeroBanner = styled.div`
  width: 100%;
  aspect-ratio: 21 / 6;
  min-height: 120px;
  max-height: 320px;
  overflow: hidden;
  position: relative;
  background: #efe8dd;

  @media (max-width: 767px) {
    aspect-ratio: 3 / 1;
    min-height: 80px;
    max-height: 160px;
  }

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
`;

const HeroText = styled.div`
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  padding: 24px 32px;
  h1 { margin: 0 0 4px; }
  @media (max-width: 767px) { padding: 14px 16px; }
`;

const ColHeader = styled.div`
  padding: 28px 32px 0;
  max-width: 1376px;
  margin: 0 auto;
  width: 100%;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 14px;
  h1 { margin: 0; }
  @media (max-width: 767px) { padding: 16px 16px 4px; }
`;

const LogoCircle = styled.div`
  width: 52px;
  height: 52px;
  border-radius: 50%;
  overflow: hidden;
  background: #fff;
  border: 1px solid #e6dfd4;
  flex-shrink: 0;
  img { width: 100%; height: 100%; object-fit: cover; display: block; }
  @media (max-width: 767px) { width: 40px; height: 40px; }
`;

const Breadcrumb = styled.nav`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: #5e574e;
  a { color: #5e574e; text-decoration: none; &:hover { color: var(--body-color, #1d1b18); } }
  b { color: var(--body-color, #1d1b18); font-weight: 600; }
  @media (max-width: 767px) { display: none; }
`;

/* ─── Filter + sort bar ──────────────────────────────────── */
const SortBar = styled.div`
  position: sticky;
  top: ${HEADER_H}px;
  z-index: 20;
  background: #fff;
  border-top: 1px solid #e8e8e6;
  border-bottom: 1px solid #e8e8e6;
`;

const SortBarInner = styled.div`
  max-width: 1376px;
  margin: 0 auto;
  padding: 0 32px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
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
  font-family: inherit;
  font-size: 14px;
  font-weight: 700;
  color: #fff;
  cursor: pointer;
  line-height: 1;
  svg { width: 14px; height: 14px; stroke: currentColor; fill: none; stroke-width: 2; }
  &:hover { opacity: 0.88; }
  @media (max-width: ${CATALOG_DRAWER_MAX_PX}px) { display: inline-flex; }
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
  @media (max-width: 767px) { flex: 1 1 0; }
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

/* ─── Body: sticky filter card + product grid ────────────── */
const ContentWrap = styled.div`
  max-width: 1376px;
  margin: 0 auto;
  padding: 14px 32px 80px;
  width: 100%;
  box-sizing: border-box;
  display: flex;
  gap: 32px;
  align-items: flex-start;
  @media (max-width: 767px) {
    padding: 6px 6px 32px;
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
    @media (prefers-reduced-motion: reduce) { transition: none; }
  }

  /* Phones: bottom sheet with rounded top corners. */
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

const DesktopSidebarContent = styled.div`
  background: #fff;
  border-radius: 20px;
  padding: 18px 18px 8px;
  box-shadow: 0 0 0 1px rgba(29, 27, 24, 0.06);
  @media (max-width: ${CATALOG_DRAWER_MAX_PX}px) { display: none; }
`;

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
    @media (prefers-reduced-motion: reduce) { transition: none; }
  }
`;

const SidebarHead = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
  padding: 0;
  @media (min-width: 1024px) { display: none; }
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
  &:hover { opacity: 0.85; }
`;

const ResetLink = styled.button`
  border: none;
  background: none;
  padding: 0 6px;
  font: inherit;
  font-size: 13px;
  font-weight: 700;
  color: #a65300;
  cursor: pointer;
`;

const ResultBar = styled.div`
  padding: 16px 0 12px;
  font-size: 14px;
  font-weight: 600;
  color: #5e574e;
  @media (max-width: 767px) { padding: 12px 10px 10px; }
`;

const EmptyState = styled.div`
  text-align: center;
  padding: 80px 16px;
  color: #8a8174;
  font-size: 14px;
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
  &:not(:disabled):hover { border-color: var(--body-color, #1d1b18); }
`;

const Desc = styled.div`
  margin-top: 48px;
  padding-top: 24px;
  border-top: 1px solid #e6dfd4;
  font-size: 14px;
  line-height: 1.7;
  color: #5e574e;
  max-width: 700px;
  strong { color: var(--body-color, #1d1b18); }
  @media (max-width: 767px) { margin: 32px 10px 0; }
`;

function FilterIcon() {
  return (
    <svg viewBox="0 0 16 12" aria-hidden="true">
      <line x1="0" y1="2" x2="16" y2="2" />
      <line x1="0" y1="6" x2="16" y2="6" />
      <line x1="0" y1="10" x2="16" y2="10" />
      <circle cx="5" cy="2" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="11" cy="6" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="5" cy="10" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

export default function BrandPage() {
  const tUi = useTranslations("shopUi");
  const tCommon = useTranslations("common");
  const tSort = useTranslations("catalogSort");
  const sortLabel = (o) => (SORT_LABEL_KEYS.has(o.value) ? tSort(o.value) : o.label);
  const params = useParams();
  const locale = params?.locale ?? "en";
  const marketPrefixVal = useMarketPrefix();
  const shopStyles = useShopStyles();
  const tmpl = shopStyles?.category_template || {};
  const colsPerRow = Number(tmpl.products_per_row) || 4;
  const colsPerRowMobile = Number(tmpl.products_per_row_mobile) || 2;
  const sidebarWidth = tmpl.sidebar_width || "280px";
  const handle = params?.handle ? String(params.handle) : undefined;

  const [brand, setBrand] = useState(null);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notFoundSt, setNotFoundSt] = useState(false);
  const [sort, setSort] = useState("default");
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({});
  const [panelOpen, setPanelOpen] = useState(false);
  const [metafieldDefinitions, setMetafieldDefinitions] = useState({});

  const bodyRef = useRef(null);

  /* ── Fetch ── */
  useEffect(() => {
    if (!handle) return;
    setFilters({});
    setPage(1);
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(`/api/store-brands/${encodeURIComponent(handle)}`);
        if (res.status === 404) { setNotFoundSt(true); setLoading(false); return; }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!data?.brand) { setNotFoundSt(true); setLoading(false); return; }
        setBrand(data.brand);
        setProducts(data.products ?? []);
      } catch (e) {
        setError(e?.message ?? "Error");
      } finally {
        setLoading(false);
      }
    })();
  }, [handle]);

  /* ── Canonical (market-aware public URL) ── */
  useEffect(() => {
    if (typeof document === "undefined" || !brand?.handle) return;
    const prefix = canonicalMarketPrefix(locale);
    let el = document.querySelector('link[rel="canonical"]');
    if (!el) { el = document.createElement("link"); el.rel = "canonical"; document.head.appendChild(el); }
    el.href = `${SITE_URL}${prefix}/brand/${brand.handle}`;
  }, [locale, brand?.handle, marketPrefixVal]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/store-metafield-definitions")
      .then((r) => r.json())
      .then((data) => { if (!cancelled) setMetafieldDefinitions(data?.definitions || {}); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  /* Lock page scroll while the mobile filter sheet is open. */
  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    if (!window.matchMedia(catalogDrawerMaxCss).matches) return undefined;
    const prev = document.body.style.overflow;
    if (panelOpen) document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [panelOpen]);

  // Product metadata facets; category facets stay off (sub-category navigation is category-page only).
  const facets = useMemo(() => {
    const raw = filterFacetsToCatalog(buildFacetsFromProducts(products), metafieldDefinitions, products);
    return Object.fromEntries(Object.entries(raw).filter(([k]) => k !== "category" && k !== "category_slug"));
  }, [products, metafieldDefinitions]);

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
    base: products,
    facets,
    filters,
    setFilters,
    toggle,
    setPage,
    facetTitle: (key) => getFacetGroupTitle(key, locale, metafieldDefinitions),
    optionLabel: (key, v) => formatFacetOptionLabel(key, v, null, locale, metafieldDefinitions),
    resetKey: handle || "",
  });

  const sorted = applyCatalogSort(extra.filtered, sort, { bestsellerOnly: false });
  const total = sorted.length;
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
  const curPage = Math.min(page, totalPages);
  const paginated = sorted.slice((curPage - 1) * PER_PAGE, curPage * PER_PAGE);
  const activeCount = Object.values(filters).reduce((n, v) => n + (v?.length || 0), 0) + extra.extraActive;
  const showFilters = products.length > 0 && tmpl.show_sidebar !== false;

  const title = brand?.name ?? handle ?? "";
  const bannerUrl = brand?.banner_image ? resolveImageUrl(brand.banner_image) : "";
  const logoUrl = brand?.logo_image ? resolveImageUrl(brand.logo_image) : "";

  if (notFoundSt) notFound();

  if (loading) return (
    <PageWrap>
      <ShopHeader />
      <Main>
        <Bone style={{ height: 180, borderRadius: 0 }} />
        <ContentWrap>
          <Body>
            <Bone style={{ height: 14, width: 200, margin: "24px 0 24px" }} />
            <div style={{ display: "grid", gridTemplateColumns: `repeat(${colsPerRowMobile}, 1fr)`, gap: 12 }}>
              {Array.from({ length: 4 }).map((_, i) => <Bone key={i} style={{ aspectRatio: "3/4" }} />)}
            </div>
          </Body>
        </ContentWrap>
      </Main>
      <Footer />
    </PageWrap>
  );

  if (error || !brand) return (
    <PageWrap>
      <ShopHeader />
      <Main>
        <ContentWrap>
          <Body>
            <p style={{ padding: "48px 0", color: "#b91c1c", fontSize: 14 }}>{error || tUi("brandNotFound")}</p>
          </Body>
        </ContentWrap>
      </Main>
      <Footer />
    </PageWrap>
  );

  return (
    <PageWrap>
      <ShopHeader />
      <Main>
        {/* ── Banner / title ── */}
        {bannerUrl ? (
          <HeroBanner>
            <img src={bannerUrl} alt={title} />
            <HeroText>
              <h1 className="shop-typo-catalog-title shop-typo-catalog-title--on-dark">
                {logoUrl && (
                  <img
                    src={logoUrl}
                    alt=""
                    style={{ width: 36, height: 36, objectFit: "cover", borderRadius: "50%", verticalAlign: "middle", marginRight: 10, border: "2px solid rgba(255,255,255,0.8)" }}
                  />
                )}
                {title}
              </h1>
            </HeroText>
          </HeroBanner>
        ) : (
          <ColHeader>
            {logoUrl && <LogoCircle><img src={logoUrl} alt={title} /></LogoCircle>}
            <h1 className="shop-typo-catalog-title">{title}</h1>
          </ColHeader>
        )}

        {/* ── Filter + sort bar ── */}
        <SortBar>
          <SortBarInner>
            <SortBarLeft>
              {showFilters && (
                <FilterBtn
                  type="button"
                  onClick={() => setPanelOpen((o) => !o)}
                  aria-expanded={panelOpen}
                >
                  <FilterIcon />
                  {tCommon("filter")}{activeCount > 0 ? ` (${activeCount})` : ""}
                </FilterBtn>
              )}
              <Breadcrumb data-breadcrumb="" aria-label={tUi("breadcrumb")}>
                <Link href="/">{tUi("home")}</Link>
                <span style={{ color: "#b8afa2", margin: "0 2px" }}>›</span>
                <b>{title}</b>
              </Breadcrumb>
            </SortBarLeft>
            <SortWrap>
              <SortLabel>{tUi("sort")}</SortLabel>
              <SortSelect value={sort} onChange={(e) => { setSort(e.target.value); setPage(1); }} aria-label={tUi("sortProducts")}>
                {SORT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{sortLabel(o)}</option>
                ))}
              </SortSelect>
            </SortWrap>
          </SortBarInner>
        </SortBar>

        <ContentWrap ref={bodyRef}>
          {showFilters && (
            <CatalogDrawerPortal>
              <>
                <SidebarOverlay $open={panelOpen} onClick={() => setPanelOpen(false)} />
                <Sidebar $open={panelOpen} $width={sidebarWidth}>
                  <SidebarHead>
                    <FilterSheetHeader
                      showReset={activeCount > 0}
                      onReset={extra.resetAll}
                      onClose={() => setPanelOpen(false)}
                      closeLabel={tCommon("close")}
                    />
                  </SidebarHead>

                  <DesktopSidebarContent>
                    <StackedFilterPanel {...extra.panelProps} />
                  </DesktopSidebarContent>

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
                      {formatFacetOptionLabel(k, v, null, locale, metafieldDefinitions)} ×
                    </Chip>
                  )),
                )}
                <ResetLink type="button" onClick={extra.resetAll}>{tCommon("clearAllFilters")}</ResetLink>
              </ChipBar>
            )}

            <ResultBar>{tSort("results", { count: total })}</ResultBar>

            {paginated.length === 0 ? (
              <EmptyState>{tSort("noMatch")}</EmptyState>
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
                      ? <span key={`d${i}`} style={{ width: 36, textAlign: "center", color: "#b8afa2" }}>…</span>
                      : (
                        <PBtn
                          key={p}
                          type="button"
                          $on={p === curPage}
                          onClick={() => { setPage(p); bodyRef.current?.scrollIntoView({ behavior: "smooth" }); }}
                        >
                          {p}
                        </PBtn>
                      ),
                  )}
                <PBtn
                  type="button"
                  disabled={curPage >= totalPages}
                  onClick={() => { setPage((p) => p + 1); bodyRef.current?.scrollIntoView({ behavior: "smooth" }); }}
                >›</PBtn>
              </Pager>
            )}

            {brand?.address && (
              <Desc>
                <strong>{title}</strong><br />
                {brand.address}
              </Desc>
            )}
          </Body>
        </ContentWrap>
      </Main>
      <Footer />
    </PageWrap>
  );
}
