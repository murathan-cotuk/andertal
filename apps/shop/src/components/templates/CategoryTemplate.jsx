"use client";

import React, { useState, useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import styled, { keyframes } from "styled-components";
import { ProductGrid } from "@/components/ProductGrid";
import { Link } from "@/i18n/navigation";
import { resolveImageUrl, rewriteImageUrlsInHtml } from "@/lib/image-url";
import {
  SORT_OPTIONS,
  PER_PAGE,
  buildFacetsFromProducts,
  filterProductsByFacets,
  applyCatalogSort,
} from "@/lib/catalog-listing";
import { normCatId } from "@/lib/category-product-ids";
import LandingContainers from "@/components/landing/LandingContainers";

const HEADER_H = 112;

const shimmer = keyframes`
  0%   { background-position: -800px 0; }
  100% { background-position:  800px 0; }
`;
const Bone = styled.div`
  background: linear-gradient(90deg, #efefed 25%, #e5e5e3 50%, #efefed 75%);
  background-size: 800px 100%;
  animation: ${shimmer} 1.5s infinite linear;
`;

const HeroBanner = styled.div`
  width: 100%;
  aspect-ratio: 21 / 6;
  min-height: 160px;
  max-height: 320px;
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

const Breadcrumb = styled.nav`
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: #999;
  letter-spacing: 0.02em;

  a { color: #999; text-decoration: none; transition: color 0.12s; &:hover { color: #111; } }
  b { color: #444; font-weight: 500; }
`;

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

  @media (max-width: 767px) { display: inline-flex; }
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

const ContentWrap = styled.div`
  max-width: 1440px;
  margin: 0 auto;
  padding: 14px 32px 80px;
  width: 100%;
  box-sizing: border-box;
  display: flex;
  gap: 32px;
  align-items: flex-start;

  @media (max-width: 767px) { padding: 10px 16px 60px; }
`;

const Sidebar = styled.aside`
  width: 280px;
  flex-shrink: 0;
  position: sticky;
  top: ${HEADER_H + 68}px;
  height: calc(100vh - ${HEADER_H + 68}px);
  max-height: calc(100vh - ${HEADER_H + 68}px);
  overflow: hidden;

  @media (max-width: 767px) {
    position: fixed;
    top: 0;
    left: ${(p) => (p.$open ? "0" : "-260px")};
    width: 250px;
    height: 100vh;
    max-height: 100vh;
    z-index: 100;
    background: #fff;
    box-shadow: 4px 0 16px rgba(0,0,0,0.12);
    transition: left 0.3s ease;
    padding: 16px;
    box-sizing: border-box;
  }
`;

const SidebarSplit = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  gap: 12px;

  @media (max-width: 767px) {
    height: auto;
    min-height: auto;
  }
`;

const SidebarPane = styled.section`
  min-height: 0;
  overflow-y: auto;
  border: 1px solid #eceae7;
  border-radius: 8px;
  padding: 10px;
  background: #fff;
  flex: ${(p) => (p.$half ? "1 1 50%" : "0 0 auto")};

  @media (max-width: 767px) {
    overflow-y: visible;
    flex: 0 0 auto;
  }
`;

const SidebarOverlay = styled.div`
  display: none;
  @media (max-width: 767px) {
    display: ${(p) => (p.$open ? "block" : "none")};
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.35);
    z-index: 99;
  }
`;

const SidebarHead = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
  padding-bottom: 12px;
  border-bottom: 1px solid #e8e8e6;

  @media (min-width: 768px) { display: none; }
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

const SubcategoryGroup = styled.div`
  border-bottom: none;
  padding-bottom: 0;
  margin-bottom: 0;
`;

const SubcategoryLink = styled(Link)`
  display: block;
  padding: 8px 10px;
  font-size: 13px;
  color: ${(p) => (p.$active ? "#111827" : "#4b5563")};
  font-weight: ${(p) => (p.$active ? 600 : 400)};
  text-decoration: none;
  border-radius: 6px;
  background: ${(p) => (p.$active ? "#e5e7eb" : "transparent")};
  margin-bottom: 2px;
  transition: background 0.12s, color 0.12s;

  &:hover {
    background: #e5e7eb;
    color: #111827;
  }
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

const Desc = styled.div`
  margin-top: 56px;
  padding-top: 28px;
  border-top: 1px solid #e8e8e6;
  font-size: var(--body-fs);
  line-height: var(--body-lh);
  color: var(--body-color);
  font-family: var(--body-font);
  max-width: 700px;

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
  & p { margin: 0 0 0.75em; }
  a { color: var(--shop-primary, #111); text-decoration: underline; }
`;

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

function findCategoryNodeBySlug(nodes, slug) {
  const norm = String(slug || "").replace(/^\//, "");
  for (const n of nodes || []) {
    if (!n) continue;
    const s = String(n.slug || n.handle || "").replace(/^\//, "");
    if (s === norm) return n;
    const child = findCategoryNodeBySlug(n.children, slug);
    if (child) return child;
  }
  return null;
}

function findCategoryNodeById(nodes, id) {
  const nid = String(id || "");
  for (const n of nodes || []) {
    if (!n) continue;
    if (String(n.id) === nid) return n;
    const child = findCategoryNodeById(n.children, id);
    if (child) return child;
  }
  return null;
}

function visibleSubcats(children) {
  return (children || []).filter((c) => c && c.active !== false && c.is_visible !== false);
}

function collectCategorySlugsDeep(node, out = []) {
  if (!node) return out;
  const slug = String(node.slug || node.handle || "").replace(/^\//, "").trim();
  if (slug) out.push(slug);
  for (const child of node.children || []) {
    collectCategorySlugsDeep(child, out);
  }
  return out;
}

export default function CategoryTemplate() {
  const params = useParams();
  const slug = params?.slug ? String(params.slug) : params?.handle ? String(params.handle) : "";
  const locale = params?.locale ? String(params.locale) : "de";

  const [category, setCategory] = useState(null);
  const [products, setProducts] = useState([]);
  const [subcategories, setSubcategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sort, setSort] = useState("default");
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({});
  const [panelOpen, setPanelOpen] = useState(false);
  const [openFilterGroups, setOpenFilterGroups] = useState({});

  const bodyRef = useRef(null);

  useEffect(() => {
    setFilters({});
    setPage(1);
  }, [slug]);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const [catResBySlug, catResTree] = await Promise.all([
          fetch(`/api/store-categories?slug=${encodeURIComponent(slug)}`).then((r) => r.json()).catch(() => ({ categories: [] })),
          fetch(`/api/store-categories?tree=true&is_visible=true`).then((r) => r.json()).catch(() => ({ tree: [] })),
        ]);
        if (cancelled) return;
        const cat = catResBySlug?.category || (Array.isArray(catResBySlug?.categories) ? catResBySlug.categories[0] : null);
        const tree = catResTree.tree || catResTree.categories || [];
        const roots = Array.isArray(tree) ? tree : [tree];
        const currentFromTree = findCategoryNodeBySlug(roots, slug);
        const resolvedCategory = cat || currentFromTree || null;
        setCategory(resolvedCategory);
        if (!resolvedCategory) {
          setProducts([]);
          setSubcategories([]);
          setLoading(false);
          return;
        }
        const current = currentFromTree || findCategoryNodeById(roots, resolvedCategory.id);
        // Always show current category's own children
        let subs = visibleSubcats(current?.children);
        const categorySlugs = Array.from(
          new Set(
            collectCategorySlugsDeep(current || resolvedCategory, []).filter(Boolean),
          ),
        );
        const productResponses = await Promise.all(
          (categorySlugs.length ? categorySlugs : [slug]).map((catSlug) =>
            fetch(`/api/store-products?category=${encodeURIComponent(catSlug)}&limit=5000`)
              .then((r) => r.json())
              .catch(() => ({ products: [] })),
          ),
        );
        if (cancelled) return;
        const mergedProducts = [];
        const seenProductIds = new Set();
        for (const res of productResponses) {
          for (const p of res?.products || []) {
            const pid = String(p?.id || "").trim();
            if (!pid || seenProductIds.has(pid)) continue;
            seenProductIds.add(pid);
            mergedProducts.push(p);
          }
        }
        setProducts(mergedProducts);
        // Keep all visible direct children in sidebar navigation, even if
        // current listing payload does not contain products for each child yet.
        subs = subs.filter((s) => s && normCatId(s.id));
        setSubcategories(subs);

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
  }, [slug]);

  const meta = parseCategoryMetadata(category);
  const displayTitle =
    (meta.display_title && String(meta.display_title).trim()) ||
    category?.name ||
    slug ||
    "Category";
  const rawBanner = category?.banner_image_url || null;
  const bannerUrl = rawBanner ? resolveImageUrl(rawBanner) : "";
  const richtextHtml = category?.long_content
    ? sanitizeHtml(rewriteImageUrlsInHtml(category.long_content))
    : "";

  useEffect(() => {
    if (!category || typeof document === "undefined") return;
    const m = parseCategoryMetadata(category);
    const dt =
      (m.display_title && String(m.display_title).trim()) ||
      category.name ||
      slug ||
      "Category";
    const docTitle =
      (category.seo_title && String(category.seo_title).trim()) ||
      (m.meta_title && String(m.meta_title).trim()) ||
      dt;
    document.title = docTitle;
    const desc =
      (category.seo_description && String(category.seo_description).trim()) ||
      (m.meta_description && String(m.meta_description).trim()) ||
      "";
    const keywords =
      (category.seo_keywords && String(category.seo_keywords).trim()) ||
      (m.keywords && String(m.keywords).trim()) ||
      "";
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
  }, [category, slug]);

  useEffect(() => {
    if (typeof document === "undefined" || !slug) return;
    let el = document.querySelector('link[rel="canonical"]');
    if (!el) {
      el = document.createElement("link");
      el.rel = "canonical";
      document.head.appendChild(el);
    }
    el.href = `${window.location.origin}${window.location.pathname}`;
  }, [slug, locale]);

  const facets = buildFacetsFromProducts(products);
  const hasFacets = Object.keys(facets).length > 0;
  const hasSubcategories = subcategories.length > 0;
  const showCatalogSidebar = hasFacets || hasSubcategories;

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

  let filtered = [...products];
  filtered = filterProductsByFacets(filtered, filters);
  const sorted = applyCatalogSort(filtered, sort, { bestsellerOnly: false });
  const total = sorted.length;
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
  const curPage = Math.min(page, totalPages);
  const paginated = sorted.slice((curPage - 1) * PER_PAGE, curPage * PER_PAGE);
  const activeCount = Object.values(filters).reduce((n, v) => n + (v?.length || 0), 0);

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
                gridTemplateColumns: "repeat(3, 1fr)",
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
    <>
      {bannerUrl ? (
        <HeroBanner>
          <img src={bannerUrl} alt={displayTitle} />
          <HeroText>
            <h1 className="shop-typo-catalog-title shop-typo-catalog-title--on-dark">{displayTitle}</h1>
          </HeroText>
        </HeroBanner>
      ) : (
        <ColHeader>
          <h1 className="shop-typo-catalog-title">{displayTitle}</h1>
        </ColHeader>
      )}

      {category?.id ? <LandingContainers categoryId={String(category.id)} /> : null}

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
                Navigation {activeCount > 0 ? `(${activeCount})` : ""}
              </FilterBtn>
            )}
            <Breadcrumb aria-label="Breadcrumb">
              <Link href={`/${locale}`}>Home</Link>
              <span style={{ color: "#ccc" }}>/</span>
              <b>{displayTitle}</b>
            </Breadcrumb>
          </SortBarLeft>
          <SortWrap>
            <SortLabel>Sort:</SortLabel>
            <SortSelect value={sort} onChange={(e) => { setSort(e.target.value); setPage(1); }} aria-label="Sort products">
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </SortSelect>
          </SortWrap>
        </SortBarInner>
      </SortBar>

      {showCatalogSidebar && <SidebarOverlay $open={panelOpen} onClick={() => setPanelOpen(false)} />}
      <ContentWrap ref={bodyRef}>
        {showCatalogSidebar && (
          <Sidebar $open={panelOpen}>
            <SidebarHead>
              <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase" }}>
                Navigation
              </span>
              <button type="button" onClick={() => setPanelOpen(false)} style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer", color: "#555", lineHeight: 1 }}>×</button>
            </SidebarHead>
            <SidebarSplit>
              {hasSubcategories && (
                <SidebarPane $half={true}>
                  <SubcategoryGroup style={{ marginTop: 0 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#111", marginBottom: 4 }}>
                      Kategorien
                    </div>
                    <SubcategoryLink
                      href={slug ? `/${slug}` : "#"}
                      $active={true}
                      onClick={() => { setFilters({}); setPage(1); }}
                    >
                      Alle
                    </SubcategoryLink>
                    {subcategories.map((sub) => {
                      const isActive = String(sub.slug || "").replace(/^\//, "") === slug;
                      return (
                        <SubcategoryLink
                          key={sub.id}
                          href={sub?.slug ? `/${String(sub.slug).replace(/^\//, "")}` : "#"}
                          $active={isActive}
                          onClick={() => { setFilters({}); setPage(1); }}
                        >
                          {sub.name || sub.slug}
                        </SubcategoryLink>
                      );
                    })}
                  </SubcategoryGroup>
                </SidebarPane>
              )}

              <SidebarPane $half={true}>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#111", marginBottom: 8, paddingBottom: 8, borderBottom: "1px solid #e8e8e6" }}>
                    Filter
                    {activeCount > 0 && (
                      <ClearAllBtn type="button" onClick={() => { setFilters({}); setPage(1); }} style={{ float: "right", padding: "2px 8px", fontSize: 10 }}>
                        Clear
                      </ClearAllBtn>
                    )}
                  </div>

                  {hasFacets ? (
                    Object.entries(facets).map(([key, vals]) => (
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
                          {vals.map((val) => {
                            const on = (filters[key] || []).includes(val);
                            return (
                              <CheckRow key={val} $on={on}>
                                <input type="checkbox" checked={on} onChange={() => toggle(key, val)} />
                                {val}
                              </CheckRow>
                            );
                          })}
                        </FilterGroupBody>
                      </FilterGroup>
                    ))
                  ) : (
                    <div style={{ fontSize: 12, color: "#8b8b8b", padding: "6px 2px" }}>
                      Bu kategoride filtre bulunmuyor.
                    </div>
                  )}

                  {activeCount > 0 && (
                    <ClearAllBtn type="button" onClick={() => { setFilters({}); setPage(1); setPanelOpen(false); }}>
                      Clear all filters
                    </ClearAllBtn>
                  )}
              </SidebarPane>
            </SidebarSplit>
          </Sidebar>
        )}

        <Body>
          {activeCount > 0 && (
            <ChipBar>
              {Object.entries(filters).flatMap(([k, vals]) =>
                (vals || []).map((v) => (
                  <Chip key={`${k}:${v}`} type="button" onClick={() => toggle(k, v)}>
                    {v} ×
                  </Chip>
                )),
              )}
            </ChipBar>
          )}

          <ResultBar>
            {total} {total === 1 ? "product" : "products"}
          </ResultBar>

          {paginated.length === 0 ? (
            <div style={{ textAlign: "center", padding: "80px 0", color: "#bbb", fontSize: 12, letterSpacing: "0.06em", textTransform: "uppercase" }}>
              No products match your filters.
            </div>
          ) : (
            <ProductGrid products={paginated} maxColumns={4} activeFilters={filters} />
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

          {richtextHtml ? (
            <Desc dangerouslySetInnerHTML={{ __html: richtextHtml }} />
          ) : null}
        </Body>
      </ContentWrap>
    </>
  );
}
