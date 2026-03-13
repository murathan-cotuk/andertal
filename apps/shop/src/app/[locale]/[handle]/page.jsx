"use client";

import ShopHeader from "@/components/ShopHeader";
import Footer from "@/components/Footer";
import { ProductGrid } from "@/components/ProductGrid";
import { Link } from "@/i18n/navigation";
import { useState, useEffect, useRef } from "react";
import { useParams, notFound } from "next/navigation";
import { resolveImageUrl } from "@/lib/image-url";
import styled, { keyframes } from "styled-components";

/* ─────────────────────────────────────────────────────────── */
const HEADER_H = 112; /* TopBar 40px + Navbar 72px            */

const RESERVED_HANDLES = [
  "search","login","register","account","bestsellers","recommended",
  "category","pages","collections","produkt","kollektion","product",
];

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
  padding-top: ${HEADER_H}px;
`;

/* ─── Hero banner ────────────────────────────────────────── */
const HeroBanner = styled.div`
  width: 100%;
  aspect-ratio: 21 / 6;
  min-height: 160px;
  max-height: 320px;
  overflow: hidden;
  position: relative;
  background: #111;

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
    opacity: 0.82;
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
    font-size: clamp(20px, 3vw, 34px);
    font-weight: 700;
    color: #fff;
    letter-spacing: -0.02em;
    margin: 0 0 4px;
    line-height: 1.1;
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
    font-size: clamp(18px, 2.5vw, 28px);
    font-weight: 700;
    letter-spacing: -0.02em;
    color: #111;
    margin: 0;
  }

  @media (max-width: 600px) { padding: 20px 16px 0; }
`;

/* ─── Breadcrumb ─────────────────────────────────────────── */
const Breadcrumb = styled.nav`
  padding: 10px 32px;
  max-width: 1440px;
  margin: 0 auto;
  width: 100%;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: #999;
  letter-spacing: 0.02em;

  a { color: #999; text-decoration: none; transition: color 0.12s; &:hover { color: #111; } }
  b { color: #444; font-weight: 500; }

  @media (max-width: 600px) { padding: 8px 16px; }
`;

/* ─── Filter bar ─────────────────────────────────────────── */
const FilterBar = styled.div`
  position: sticky;
  top: ${HEADER_H}px;
  z-index: 20;
  background: #fff;
  border-top: 1px solid #e8e8e6;
  border-bottom: 1px solid #e8e8e6;
`;

const FilterBarInner = styled.div`
  max-width: 1440px;
  margin: 0 auto;
  padding: 0 32px;
  display: flex;
  align-items: stretch;
  justify-content: space-between;
  gap: 0;

  @media (max-width: 600px) { padding: 0 16px; }
`;

const FilterBtn = styled.button`
  display: inline-flex;
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

/* ─── Filter panel (drawer below bar) ──────────────────── */
const FilterPanel = styled.div`
  background: #fff;
  border-bottom: 1px solid #e8e8e6;
  overflow: hidden;
  max-height: ${(p) => (p.$open ? "600px" : "0")};
  transition: max-height 0.35s ease;
`;

const FilterPanelInner = styled.div`
  max-width: 1440px;
  margin: 0 auto;
  padding: 20px 32px 24px;
  display: flex;
  flex-wrap: wrap;
  gap: 32px;

  @media (max-width: 600px) { padding: 16px 16px 20px; gap: 20px; }
`;

const FilterGroup = styled.div``;

const FilterGroupTitle = styled.div`
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: #111;
  margin-bottom: 10px;
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

const FilterActions = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 8px;
  width: 100%;
`;

const ClearAllBtn = styled.button`
  background: none;
  border: 1px solid #ccc;
  padding: 6px 14px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #555;
  cursor: pointer;
  transition: border-color 0.12s, color 0.12s;

  &:hover { border-color: #111; color: #111; }
`;

/* ─── Body (content only, no sidebar) ───────────────────── */
const Body = styled.div`
  max-width: 1440px;
  margin: 0 auto;
  padding: 0 32px 80px;
  width: 100%;
  box-sizing: border-box;

  @media (max-width: 600px) { padding: 0 16px 60px; }
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
  font-size: 13.5px;
  line-height: 1.8;
  color: #666;
  max-width: 700px;

  h1,h2,h3 { font-size: 15px; font-weight: 700; color: #111; margin: 1.5em 0 0.5em; }
  p { margin: 0 0 0.75em; }
  a { color: #111; text-decoration: underline; }
`;

/* ─────────────────────────────────────────────────────────── */
const SORT_OPTIONS = [
  { value: "default",    label: "Featured"          },
  { value: "price_asc",  label: "Price: Low → High"  },
  { value: "price_desc", label: "Price: High → Low"  },
  { value: "title_asc",  label: "Name A–Z"           },
  { value: "title_desc", label: "Name Z–A"           },
];

const PER_PAGE = 24;

/* ─────────────────────────────────────────────────────────── *
 *  Page
 * ─────────────────────────────────────────────────────────── */
export default function CollectionPage() {
  const params      = useParams();
  const locale      = params?.locale ?? "en";
  const handle      = params?.handle ? String(params.handle) : undefined;

  const [collection,  setCollection]  = useState(null);
  const [products,    setProducts]    = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState(null);
  const [notFoundSt,  setNotFoundSt]  = useState(false);
  const [sort,        setSort]        = useState("default");
  const [page,        setPage]        = useState(1);
  const [filters,     setFilters]     = useState({});
  const [panelOpen,   setPanelOpen]   = useState(false);

  const bodyRef = useRef(null);

  /* ── Fetch ── */
  useEffect(() => {
    if (!handle) return;
    if (RESERVED_HANDLES.includes(handle.toLowerCase())) {
      setNotFoundSt(true);
      setLoading(false);
      return;
    }
    (async () => {
      try {
        setLoading(true);
        setError(null);

        const colRes = await fetch(`/api/store-collections?handle=${encodeURIComponent(handle)}`);
        if (colRes.status === 404) { setNotFoundSt(true); setLoading(false); return; }
        if (!colRes.ok) throw new Error(`HTTP ${colRes.status}`);

        const colData = await colRes.json();
        const col = colData?.collection ?? null;
        if (!col) { setNotFoundSt(true); setLoading(false); return; }
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

  /* ── Canonical ── */
  useEffect(() => {
    if (typeof document === "undefined" || !collection?.handle) return;
    let el = document.querySelector('link[rel="canonical"]');
    if (!el) { el = document.createElement("link"); el.rel = "canonical"; document.head.appendChild(el); }
    el.href = `${window.location.origin}/${locale}/${collection.handle}`;
  }, [locale, collection?.handle]);

  /* ── Facets ── */
  const facets = (() => {
    const SKIP = new Set(["media","image_url","image","review_count","review_avg",
      "sold_last_month","rabattpreis_cents","is_new","badge"]);
    const f = {};
    products.forEach(p => {
      const meta = typeof p.metadata === "object" && p.metadata ? p.metadata : {};
      Object.entries(meta).forEach(([k, v]) => {
        if (SKIP.has(k)) return;
        if (!f[k]) f[k] = new Set();
        (Array.isArray(v) ? v : [v]).forEach(x => { const s = String(x).trim(); if (s) f[k].add(s); });
      });
    });
    return Object.fromEntries(
      Object.entries(f)
        .map(([k, s]) => [k, [...s].sort()])
        .filter(([, v]) => v.length > 0 && v.length <= 30)
    );
  })();

  const hasFacets = Object.keys(facets).length > 0;

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
  Object.entries(filters).forEach(([k, vals]) => {
    if (!vals?.length) return;
    filtered = filtered.filter(p => {
      const v = (p.metadata || {})[k];
      if (v == null) return false;
      return (Array.isArray(v) ? v : [v]).some(x => vals.includes(String(x).trim()));
    });
  });

  /* ── Sort ── */
  const sorted = [...filtered];
  if (sort === "price_asc")  sorted.sort((a,b) => (a.variants?.[0]?.prices?.[0]?.amount ?? 0) - (b.variants?.[0]?.prices?.[0]?.amount ?? 0));
  if (sort === "price_desc") sorted.sort((a,b) => (b.variants?.[0]?.prices?.[0]?.amount ?? 0) - (a.variants?.[0]?.prices?.[0]?.amount ?? 0));
  if (sort === "title_asc")  sorted.sort((a,b) => (a.title||"").localeCompare(b.title||""));
  if (sort === "title_desc") sorted.sort((a,b) => (b.title||"").localeCompare(a.title||""));

  const total      = sorted.length;
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
  const curPage    = Math.min(page, totalPages);
  const paginated  = sorted.slice((curPage - 1) * PER_PAGE, curPage * PER_PAGE);

  const activeCount = Object.values(filters).reduce((n, v) => n + (v?.length || 0), 0);

  /* ── Derived display values ── */
  const title     = collection?.display_title || collection?.title || handle || "";
  const rawBanner = collection?.banner || collection?.banner_image_url || collection?.image_url || "";
  const bannerUrl = rawBanner
    ? (rawBanner.startsWith("http") || rawBanner.startsWith("//"))
      ? rawBanner : resolveImageUrl(rawBanner)
    : "";

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
            gridTemplateColumns: "repeat(3, 1fr)",
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
        {bannerUrl ? (
          <HeroBanner>
            <img src={bannerUrl} alt={title} />
            <HeroText><h1>{title}</h1></HeroText>
          </HeroBanner>
        ) : (
          <ColHeader><h1>{title}</h1></ColHeader>
        )}

        {/* ── Breadcrumb ── */}
        <Breadcrumb aria-label="Breadcrumb">
          <Link href={`/${locale}`}>Home</Link>
          <span style={{ color: "#ccc" }}>/</span>
          <b>{title}</b>
        </Breadcrumb>

        {/* ── Sticky filter/sort bar ── */}
        <FilterBar>
          <FilterBarInner>
            {/* Filter toggle */}
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
              Filter {activeCount > 0 ? `(${activeCount})` : ""}
            </FilterBtn>

            {/* Sort */}
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
          </FilterBarInner>

          {/* ── Filter panel ── */}
          {hasFacets && (
            <FilterPanel $open={panelOpen}>
              <FilterPanelInner>
                {Object.entries(facets).map(([key, vals]) => (
                  <FilterGroup key={key}>
                    <FilterGroupTitle>{key.replace(/_/g, " ")}</FilterGroupTitle>
                    {vals.map(val => {
                      const on = (filters[key] || []).includes(val);
                      return (
                        <CheckRow key={val} $on={on}>
                          <input
                            type="checkbox"
                            checked={on}
                            onChange={() => toggle(key, val)}
                          />
                          {val}
                        </CheckRow>
                      );
                    })}
                  </FilterGroup>
                ))}

                {activeCount > 0 && (
                  <FilterActions>
                    <ClearAllBtn
                      type="button"
                      onClick={() => { setFilters({}); setPage(1); }}
                    >
                      Clear all
                    </ClearAllBtn>
                  </FilterActions>
                )}
              </FilterPanelInner>
            </FilterPanel>
          )}
        </FilterBar>

        {/* ── Body ── */}
        <Body ref={bodyRef}>

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
            <ProductGrid products={paginated} maxColumns={3} />
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
            <Desc dangerouslySetInnerHTML={{ __html: sanitize(collection.description) }} />
          )}
        </Body>
      </Main>
      <Footer />
    </PageWrap>
  );
}
