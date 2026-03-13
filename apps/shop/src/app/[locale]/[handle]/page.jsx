"use client";

import ShopHeader from "@/components/ShopHeader";
import Footer from "@/components/Footer";
import { ProductGrid } from "@/components/ProductGrid";
import { Link } from "@/i18n/navigation";
import { useState, useEffect, useRef } from "react";
import { useParams, notFound } from "next/navigation";
import { resolveImageUrl } from "@/lib/image-url";
import styled, { keyframes } from "styled-components";

const RESERVED_HANDLES = [
  "search", "login", "register", "account", "bestsellers", "recommended",
  "category", "pages", "collections", "produkt", "kollektion", "product",
];

function sanitizeHtml(html) {
  if (!html || typeof html !== "string") return "";
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, "")
    .replace(/\s*on\w+=["'][^"']*["']/gi, "");
}

const fadeUp = keyframes`
  from { opacity: 0; transform: translateY(12px); }
  to   { opacity: 1; transform: translateY(0); }
`;

/* ─── Layout shells ──────────────────────────────────────── */
const PageWrap = styled.div`
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: #fff;
`;

const Main = styled.main`
  flex: 1;
  padding-top: 72px;
`;

/* ─── Hero banner ────────────────────────────────────────── */
const HeroBanner = styled.div`
  width: 100%;
  height: 260px;
  overflow: hidden;
  position: relative;

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  @media (max-width: 640px) { height: 180px; }
`;

const HeroOverlay = styled.div`
  position: absolute;
  inset: 0;
  background: linear-gradient(to bottom, transparent 40%, rgba(0,0,0,0.35) 100%);
  display: flex;
  align-items: flex-end;
  padding: 28px 40px;

  h1 {
    color: #fff;
    font-size: 28px;
    font-weight: 700;
    letter-spacing: -0.01em;
    margin: 0;
    text-shadow: 0 1px 8px rgba(0,0,0,0.3);
  }
`;

/* ─── Breadcrumb ─────────────────────────────────────────── */
const Breadcrumb = styled.nav`
  padding: 12px 40px;
  border-bottom: 1px solid #f0f0ee;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #888;

  a { color: #888; text-decoration: none; &:hover { color: #111; } }
  span { color: #111; font-weight: 500; }

  @media (max-width: 768px) { padding: 12px 20px; }
`;

const Sep = styled.span`
  color: #ccc;
  font-size: 11px;
`;

/* ─── Two-column layout ──────────────────────────────────── */
const BodyRow = styled.div`
  display: flex;
  align-items: flex-start;
  max-width: 1440px;
  margin: 0 auto;
  width: 100%;
`;

/* ─── Sidebar ────────────────────────────────────────────── */
const Sidebar = styled.aside`
  width: 240px;
  flex-shrink: 0;
  padding: 28px 24px 48px;
  position: sticky;
  top: 72px;
  max-height: calc(100vh - 72px);
  overflow-y: auto;
  border-right: 1px solid #f0f0ee;

  @media (max-width: 900px) { display: none; }
`;

const SideTitle = styled.div`
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: #111;
  margin: 0 0 12px;
  padding-top: 8px;

  &:not(:first-child) { margin-top: 28px; border-top: 1px solid #f0f0ee; padding-top: 20px; }
`;

const FilterCheckRow = styled.label`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 0;
  cursor: pointer;
  font-size: 13px;
  color: ${(p) => (p.$active ? "#111" : "#555")};
  font-weight: ${(p) => (p.$active ? "600" : "400")};

  input[type="checkbox"] { accent-color: #111; width: 14px; height: 14px; cursor: pointer; }
  &:hover { color: #111; }
`;

const SortRadio = styled.label`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
  cursor: pointer;
  font-size: 13px;
  color: ${(p) => (p.$active ? "#111" : "#555")};
  font-weight: ${(p) => (p.$active ? "600" : "400")};

  input[type="radio"] { accent-color: #111; width: 14px; height: 14px; cursor: pointer; }
  &:hover { color: #111; }
`;

const ClearBtn = styled.button`
  background: none;
  border: none;
  font-size: 11px;
  color: #888;
  cursor: pointer;
  padding: 0;
  margin-top: 4px;
  text-decoration: underline;
  &:hover { color: #111; }
`;

/* ─── Content area ───────────────────────────────────────── */
const Content = styled.div`
  flex: 1;
  min-width: 0;
  padding: 0 40px 64px;

  @media (max-width: 768px) { padding: 0 16px 48px; }
`;

/* ─── Toolbar (above grid) ───────────────────────────────── */
const Toolbar = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 0 16px;
  border-bottom: 1px solid #f0f0ee;
  margin-bottom: 24px;
  gap: 12px;
`;

const ResultCount = styled.span`
  font-size: 13px;
  color: #888;
`;

const SortDropdown = styled.select`
  appearance: none;
  background: #fff url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%23555' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E") no-repeat right 10px center;
  border: 1px solid #ddd;
  padding: 7px 30px 7px 12px;
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0.03em;
  color: #111;
  cursor: pointer;
  outline: none;
  transition: border-color 0.15s;

  &:hover, &:focus { border-color: #111; }
`;

const ActiveFiltersBar = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 16px;
`;

const FilterChip = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 10px;
  background: #111;
  color: #fff;
  border: none;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  cursor: pointer;

  &:hover { background: #333; }
`;

/* ─── Pagination ─────────────────────────────────────────── */
const Pagination = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  margin-top: 48px;
`;

const PageBtn = styled.button`
  width: 38px;
  height: 38px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid ${(p) => (p.$active ? "#111" : "#e5e5e5")};
  background: ${(p) => (p.$active ? "#111" : "#fff")};
  color: ${(p) => (p.$active ? "#fff" : "#555")};
  font-size: 13px;
  font-weight: ${(p) => (p.$active ? "700" : "400")};
  cursor: ${(p) => (p.disabled ? "not-allowed" : "pointer")};
  opacity: ${(p) => (p.disabled ? "0.35" : "1")};
  transition: all 0.15s;

  &:not([disabled]):hover {
    border-color: #111;
    color: ${(p) => (p.$active ? "#fff" : "#111")};
  }
`;

/* ─── Loading skeleton ───────────────────────────────────── */
const shimmer = keyframes`
  0% { background-position: -600px 0; }
  100% { background-position: 600px 0; }
`;

const SkeletonGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 2px;
  margin-top: 32px;

  @media (max-width: 640px) { grid-template-columns: repeat(2, 1fr); }
`;

const SkeletonCard = styled.div`
  aspect-ratio: 3 / 4;
  background: linear-gradient(90deg, #f5f5f3 25%, #ebebeb 50%, #f5f5f3 75%);
  background-size: 600px 100%;
  animation: ${shimmer} 1.4s infinite;
`;

/* ─── Description section ────────────────────────────────── */
const DescSection = styled.div`
  margin-top: 64px;
  padding-top: 32px;
  border-top: 1px solid #f0f0ee;
  font-size: 14px;
  line-height: 1.75;
  color: #555;
  max-width: 680px;

  h1, h2, h3 { font-size: 16px; font-weight: 700; color: #111; margin: 1.25em 0 0.5em; }
  p { margin: 0 0 0.75em; }
  a { color: #111; text-decoration: underline; }
`;

/* ─── Collection title (no banner case) ─────────────────── */
const CollectionHeader = styled.div`
  padding: 32px 40px 0;

  @media (max-width: 768px) { padding: 24px 20px 0; }
`;

const CollectionTitle = styled.h1`
  font-size: 26px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: #111;
  margin: 0;
`;

/* ─── Sort options ────────────────────────────────────────── */
const SORT_OPTIONS = [
  { value: "default", label: "Featured" },
  { value: "price_asc", label: "Price: Low to High" },
  { value: "price_desc", label: "Price: High to Low" },
  { value: "title_asc", label: "Name A–Z" },
  { value: "title_desc", label: "Name Z–A" },
];

const PER_PAGE = 24;

/* ─── Page component ─────────────────────────────────────── */
export default function CollectionByHandlePage() {
  const params = useParams();
  const locale = params?.locale ?? "en";
  const handle = params?.handle != null ? String(params.handle) : undefined;

  const [collection, setCollection] = useState(null);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sort, setSort] = useState("default");
  const [page, setPage] = useState(1);
  const [notFoundState, setNotFoundState] = useState(false);
  const [metadataFilters, setMetadataFilters] = useState({});
  const contentRef = useRef(null);

  useEffect(() => {
    if (!handle) return;
    if (RESERVED_HANDLES.includes(handle.toLowerCase())) {
      setNotFoundState(true);
      setLoading(false);
      return;
    }

    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);

        const colRes = await fetch(`/api/store-collections?handle=${encodeURIComponent(handle)}`);
        if (colRes.status === 404) { setNotFoundState(true); setLoading(false); return; }
        if (!colRes.ok) throw new Error(`HTTP ${colRes.status}`);

        const colData = await colRes.json();
        const col = colData?.collection ?? null;
        if (!col) { setNotFoundState(true); setLoading(false); return; }
        setCollection(col);

        const qs = new URLSearchParams({ limit: "200" });
        if (col.id) qs.set("collection_id", String(col.id));
        if (col.handle) qs.set("collection_handle", String(col.handle));

        const prodRes = await fetch(`/api/store-products?${qs.toString()}`).then((r) => r.json()).catch(() => ({ products: [] }));
        setProducts(prodRes?.products ?? []);
      } catch (err) {
        setError(err?.message ?? "Loading error");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [handle]);

  useEffect(() => {
    if (typeof document === "undefined" || !collection?.handle) return;
    let link = document.querySelector('link[rel="canonical"]');
    if (!link) { link = document.createElement("link"); link.rel = "canonical"; document.head.appendChild(link); }
    link.href = `${window.location.origin}/${locale}/${collection.handle}`;
  }, [locale, collection?.handle]);

  /* ── Build facets ── */
  const metadataFacets = (() => {
    const facets = {};
    (products || []).forEach((p) => {
      const meta = p.metadata && typeof p.metadata === "object" ? p.metadata : {};
      Object.entries(meta).forEach(([key, value]) => {
        if (["media", "image_url", "image", "review_count", "review_avg", "sold_last_month",
             "rabattpreis_cents", "is_new", "badge"].includes(key)) return;
        if (!facets[key]) facets[key] = new Set();
        const vals = Array.isArray(value) ? value : [value];
        vals.forEach((v) => { const s = String(v).trim(); if (s) facets[key].add(s); });
      });
    });
    return Object.fromEntries(
      Object.entries(facets)
        .map(([k, s]) => [k, [...s].filter(Boolean).sort()])
        .filter(([, v]) => v.length > 0 && v.length <= 30)
    );
  })();

  /* ── Filter + sort ── */
  let filtered = [...(products || [])];
  Object.entries(metadataFilters).forEach(([key, vals]) => {
    if (!vals?.length) return;
    filtered = filtered.filter((p) => {
      const meta = p.metadata && typeof p.metadata === "object" ? p.metadata : {};
      const v = meta[key];
      if (v == null) return false;
      const arr = Array.isArray(v) ? v : [v];
      return arr.some((x) => vals.includes(String(x).trim()));
    });
  });

  const sorted = [...filtered];
  if (sort === "price_asc") sorted.sort((a, b) => (a.variants?.[0]?.prices?.[0]?.amount ?? 0) - (b.variants?.[0]?.prices?.[0]?.amount ?? 0));
  if (sort === "price_desc") sorted.sort((a, b) => (b.variants?.[0]?.prices?.[0]?.amount ?? 0) - (a.variants?.[0]?.prices?.[0]?.amount ?? 0));
  if (sort === "title_asc") sorted.sort((a, b) => (a.title || "").localeCompare(b.title || ""));
  if (sort === "title_desc") sorted.sort((a, b) => (b.title || "").localeCompare(a.title || ""));

  const total = sorted.length;
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
  const currentPage = Math.min(page, totalPages);
  const paginated = sorted.slice((currentPage - 1) * PER_PAGE, currentPage * PER_PAGE);

  const toggleFilter = (key, value) => {
    setMetadataFilters((prev) => {
      const cur = prev[key] || [];
      const next = cur.includes(value) ? cur.filter((x) => x !== value) : [...cur, value];
      if (!next.length) { const u = { ...prev }; delete u[key]; return u; }
      return { ...prev, [key]: next };
    });
    setPage(1);
  };

  const activeFilterCount = Object.values(metadataFilters).reduce((acc, v) => acc + (v?.length || 0), 0);

  const displayTitle = collection?.display_title || collection?.title || handle || "";
  const rawBanner = collection?.banner || collection?.banner_image_url || collection?.image_url || "";
  const bannerUrl = rawBanner
    ? typeof rawBanner === "string" && (rawBanner.startsWith("http") || rawBanner.startsWith("//"))
      ? rawBanner
      : resolveImageUrl(rawBanner)
    : "";

  if (notFoundState) notFound();

  /* ─── Early render states ───────────────────────────────── */
  if (loading) {
    return (
      <PageWrap>
        <ShopHeader />
        <Main>
          <CollectionHeader>
            <div style={{ width: 200, height: 28, background: "#f0f0ee", marginBottom: 8 }} />
          </CollectionHeader>
          <BodyRow>
            <Sidebar />
            <Content>
              <Toolbar>
                <div style={{ width: 80, height: 16, background: "#f0f0ee" }} />
                <div style={{ width: 120, height: 32, background: "#f0f0ee" }} />
              </Toolbar>
              <SkeletonGrid>
                {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
              </SkeletonGrid>
            </Content>
          </BodyRow>
        </Main>
        <Footer />
      </PageWrap>
    );
  }

  if (error || !collection) {
    return (
      <PageWrap>
        <ShopHeader />
        <Main>
          <div style={{ padding: "40px", color: "#b91c1c", fontSize: 14 }}>
            {error || "Collection not found"}
          </div>
        </Main>
        <Footer />
      </PageWrap>
    );
  }

  /* ─── Main render ───────────────────────────────────────── */
  return (
    <PageWrap>
      <ShopHeader />
      <Main>

        {/* Banner hero */}
        {bannerUrl ? (
          <HeroBanner>
            <img src={bannerUrl} alt={displayTitle} />
            <HeroOverlay><h1>{displayTitle}</h1></HeroOverlay>
          </HeroBanner>
        ) : (
          <CollectionHeader>
            <CollectionTitle>{displayTitle}</CollectionTitle>
          </CollectionHeader>
        )}

        {/* Breadcrumb */}
        <Breadcrumb aria-label="Breadcrumb">
          <Link href={`/${locale}`}>Home</Link>
          <Sep>/</Sep>
          <span>{displayTitle}</span>
        </Breadcrumb>

        <BodyRow>
          {/* ── Sidebar ── */}
          <Sidebar>
            {/* Sort */}
            <SideTitle>Sort</SideTitle>
            {SORT_OPTIONS.map((opt) => (
              <SortRadio key={opt.value} $active={sort === opt.value}>
                <input
                  type="radio"
                  name="sort"
                  value={opt.value}
                  checked={sort === opt.value}
                  onChange={() => { setSort(opt.value); setPage(1); }}
                />
                {opt.label}
              </SortRadio>
            ))}

            {/* Metadata filters */}
            {Object.entries(metadataFacets).map(([key, values]) => (
              <div key={key}>
                <SideTitle>{key.replace(/_/g, " ")}</SideTitle>
                {values.map((value) => {
                  const active = (metadataFilters[key] || []).includes(value);
                  return (
                    <FilterCheckRow key={value} $active={active}>
                      <input
                        type="checkbox"
                        checked={active}
                        onChange={() => toggleFilter(key, value)}
                      />
                      {value}
                    </FilterCheckRow>
                  );
                })}
              </div>
            ))}

            {activeFilterCount > 0 && (
              <ClearBtn onClick={() => { setMetadataFilters({}); setPage(1); }}>
                Clear all filters
              </ClearBtn>
            )}
          </Sidebar>

          {/* ── Content ── */}
          <Content ref={contentRef}>
            <Toolbar>
              <ResultCount>{total} {total === 1 ? "product" : "products"}</ResultCount>
              <SortDropdown
                value={sort}
                onChange={(e) => { setSort(e.target.value); setPage(1); }}
                aria-label="Sort"
              >
                {SORT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </SortDropdown>
            </Toolbar>

            {/* Active filter chips */}
            {activeFilterCount > 0 && (
              <ActiveFiltersBar>
                {Object.entries(metadataFilters).flatMap(([key, vals]) =>
                  (vals || []).map((val) => (
                    <FilterChip key={`${key}:${val}`} onClick={() => toggleFilter(key, val)}>
                      {val} ×
                    </FilterChip>
                  ))
                )}
              </ActiveFiltersBar>
            )}

            {paginated.length === 0 ? (
              <div style={{ textAlign: "center", padding: "64px 0", color: "#aaa", fontSize: 14 }}>
                No products found.
              </div>
            ) : (
              <ProductGrid products={paginated} maxColumns={3} />
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <Pagination>
                <PageBtn
                  disabled={currentPage <= 1}
                  onClick={() => { setPage((p) => p - 1); contentRef.current?.scrollIntoView({ behavior: "smooth" }); }}
                  aria-label="Previous page"
                >
                  ‹
                </PageBtn>
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter((p) => Math.abs(p - currentPage) <= 2 || p === 1 || p === totalPages)
                  .reduce((acc, p, idx, arr) => {
                    if (idx > 0 && p - arr[idx - 1] > 1) acc.push("…");
                    acc.push(p);
                    return acc;
                  }, [])
                  .map((p, idx) =>
                    p === "…" ? (
                      <span key={`dots-${idx}`} style={{ width: 38, textAlign: "center", color: "#aaa", fontSize: 13 }}>…</span>
                    ) : (
                      <PageBtn
                        key={p}
                        $active={p === currentPage}
                        onClick={() => { setPage(p); contentRef.current?.scrollIntoView({ behavior: "smooth" }); }}
                      >
                        {p}
                      </PageBtn>
                    )
                  )}
                <PageBtn
                  disabled={currentPage >= totalPages}
                  onClick={() => { setPage((p) => p + 1); contentRef.current?.scrollIntoView({ behavior: "smooth" }); }}
                  aria-label="Next page"
                >
                  ›
                </PageBtn>
              </Pagination>
            )}

            {/* Description */}
            {collection.description && (
              <DescSection
                dangerouslySetInnerHTML={{ __html: sanitizeHtml(collection.description) }}
              />
            )}
          </Content>
        </BodyRow>
      </Main>
      <Footer />
    </PageWrap>
  );
}
