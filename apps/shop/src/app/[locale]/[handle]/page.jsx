"use client";

import ShopHeader from "@/components/ShopHeader";
import Footer from "@/components/Footer";
import LandingContainers from "@/components/landing/LandingContainers";
import { ProductGrid } from "@/components/ProductGrid";
import { Link, useRouter } from "@/i18n/navigation";
import { useState, useEffect, useLayoutEffect, useRef } from "react";
import { useParams, notFound } from "next/navigation";
import { resolveImageUrl, rewriteImageUrlsInHtml } from "@/lib/image-url";
import styled, { keyframes } from "styled-components";

/* ─────────────────────────────────────────────────────────── */
const HEADER_H = 112; /* TopBar 40px + Navbar 72px            */

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

/* ─── Hero banner (no overlay/shadow) ───────────────────── */
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
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: #999;
  letter-spacing: 0.02em;

  a { color: #999; text-decoration: none; transition: color 0.12s; &:hover { color: #111; } }
  b { color: #444; font-weight: 500; }
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

  @media (max-width: 767px) { padding: 10px 16px 60px; }
`;

/* Left filter sidebar */
const Sidebar = styled.aside`
  width: 220px;
  flex-shrink: 0;
  position: sticky;
  top: ${HEADER_H + 68}px;
  max-height: calc(100vh - ${HEADER_H + 68}px);
  overflow-y: auto;

  /* Mobile: hidden overlay drawer */
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

function normalizeFacetKey(key) {
  const raw = String(key || "").trim().toLowerCase().replace(/\s+/g, "_");
  if (!raw) return "";
  if (["farbe", "color", "colour", "farben"].includes(raw)) return "farbe";
  if (["groesse", "größe", "size", "sizes"].includes(raw)) return "groesse";
  if (["material", "materials", "stoff"].includes(raw)) return "material";
  return raw;
}

function variationGroupFacetKey(group, fallbackIndex) {
  const raw = group?.key || group?.name || group?.title || `option_${fallbackIndex + 1}`;
  return normalizeFacetKey(raw);
}

function inferFacetKeyFromValue(value, fallbackKey = "") {
  const s = String(value || "").trim();
  const lower = s.toLowerCase();
  if (!s) return normalizeFacetKey(fallbackKey);

  const sizeTokens = new Set([
    "xxs", "xs", "s", "m", "l", "xl", "xxl", "xxxl",
    "2xs", "3xs", "2xl", "3xl", "4xl", "5xl",
  ]);
  const colorTokens = new Set([
    "blue", "green", "pink", "red", "yellow", "orange", "purple", "violet",
    "black", "white", "grey", "gray", "brown", "beige", "navy", "gold",
    "silver", "rose", "rosa", "pinke", "pembe", "blau", "gruen", "grün",
    "rot", "gelb", "orange", "lila", "schwarz", "weiss", "weiß", "grau",
    "braun", "beige", "marine", "gold", "silber",
  ]);

  if (sizeTokens.has(lower)) return "groesse";
  if (/^\d{1,3}$/.test(s)) return "groesse";
  if (/^\d{1,3}([.,]\d+)?\s?(cm|mm|kg|g|ml|l|eu|us|uk)$/.test(lower)) return "groesse";
  if (/^\d{2,3}\/\d{2,3}$/.test(s)) return "groesse";
  if (colorTokens.has(lower)) return "farbe";

  return normalizeFacetKey(fallbackKey);
}

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

/* ─────────────────────────────────────────────────────────── */
const SORT_OPTIONS = [
  { value: "default",      label: "Featured"          },
  { value: "newest",       label: "Newest"            },
  { value: "price_asc",    label: "Price: Low → High"  },
  { value: "price_desc",   label: "Price: High → Low"  },
  { value: "title_asc",    label: "Name A–Z"           },
  { value: "title_desc",   label: "Name Z–A"           },
];

const PER_PAGE = 24;

/* ─────────────────────────────────────────────────────────── *
 *  Page
 * ─────────────────────────────────────────────────────────── */
export default function CollectionPage() {
  const params = useParams();
  const router = useRouter();
  const locale = params?.locale ?? "en";
  const handle = params?.handle ? String(params.handle) : undefined;

  const [collection,  setCollection]  = useState(null);
  const [cmsPage,     setCmsPage]     = useState(null);
  const [products,    setProducts]    = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState(null);
  const [notFoundSt,  setNotFoundSt]  = useState(false);
  const [sort,        setSort]        = useState("default");
  const [page,        setPage]        = useState(1);
  const [filters,     setFilters]     = useState({});
  const [panelOpen,   setPanelOpen]   = useState(false);
  const [openFilterGroups, setOpenFilterGroups] = useState({});
  const [recommendedProducts, setRecommendedProducts] = useState([]);

  const bodyRef = useRef(null);

  useLayoutEffect(() => {
    if (!handle) return;
    const h = handle.toLowerCase();
    if (WISHLIST_SLUGS.has(h)) {
      router.replace("/favorites");
    }
  }, [handle, router]);

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

  /* ── Facets ── */
  const facets = (() => {
    // System/internal keys — never shown as filters
    const SKIP = new Set([
      "media", "image_url", "image", "thumbnail",
      "review_count", "review_avg", "sold_last_month",
      "rabattpreis_cents", "uvp_cents", "price_cents", "compare_at_price_cents", "sale_price_cents",
      "is_new", "badge", "sale",
      "ean", "sku",
      "bullet_points", "translations", "variation_groups", "metafields",
      "shipping_group_id",
      "collection_id", "collection_ids", "admin_category_id", "category_id",
      "seller_id", "product_id",
      "brand", "brand_id", "brand_logo", "brand_handle",
      "shop_name", "store_name", "seller_name",
      "hersteller", "hersteller_information", "verantwortliche_person_information",
      "seo_keywords", "seo_meta_title", "seo_meta_description",
      "publish_date", "return_days", "return_cost", "return_kostenlos",
      "related_product_ids",
      "dimensions", "dimensions_length", "dimensions_width", "dimensions_height",
      "weight", "weight_grams", "unit_type", "unit_value", "unit_reference",
      "shipping_info", "versand",
    ]);

    const isCleanValue = (s) => {
      if (!s || s.length > 80) return false;
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) return false;
      if (s.startsWith("http://") || s.startsWith("https://") || s.startsWith("/uploads/")) return false;
      return true;
    };

    const addValue = (f, key, rawVal) => {
      const normalizedKey = normalizeFacetKey(key);
      if (!normalizedKey || SKIP.has(normalizedKey) || normalizedKey.startsWith("_")) return;
      const vals = Array.isArray(rawVal) ? rawVal : [rawVal];
      vals.forEach(x => {
        if (x == null || typeof x === "object") return;
        const s = String(x).trim();
        if (!isCleanValue(s)) return;
        if (!f[normalizedKey]) f[normalizedKey] = new Set();
        f[normalizedKey].add(s);
      });
    };

    const f = {};
    products.forEach(p => {
      const meta = typeof p.metadata === "object" && p.metadata ? p.metadata : {};

      // 1. Flat metadata keys
      Object.entries(meta).forEach(([k, v]) => {
        const nk = normalizeFacetKey(k);
        if (SKIP.has(nk) || nk.startsWith("_")) return;
        if (Array.isArray(v) && v.length > 0 && typeof v[0] === "object") return; // skip arrays of objects
        if (v !== null && typeof v === "object" && !Array.isArray(v)) return; // skip plain objects
        addValue(f, nk, v);
      });

      // 2. metafields array: [{key, value}, ...]
      if (Array.isArray(meta.metafields)) {
        meta.metafields.forEach(({ key, value } = {}) => {
          const nk = normalizeFacetKey(key);
          if (!nk || value == null || value === "") return;
          if (SKIP.has(nk) || nk.startsWith("_")) return;
          addValue(f, nk, value);
        });
      }

      // 3. variant metadata + variant metafields + option values
      if (Array.isArray(p.variants)) {
        p.variants.forEach((variant) => {
          const variantMeta = typeof variant?.metadata === "object" && variant.metadata ? variant.metadata : {};

          Object.entries(variantMeta).forEach(([k, v]) => {
            const nk = normalizeFacetKey(k);
            if (SKIP.has(nk) || nk.startsWith("_")) return;
            if (Array.isArray(v) && v.length > 0 && typeof v[0] === "object") return;
            if (v !== null && typeof v === "object" && !Array.isArray(v)) return;
            addValue(f, nk, v);
          });

          if (Array.isArray(variantMeta.metafields)) {
            variantMeta.metafields.forEach(({ key, value } = {}) => {
              const nk = normalizeFacetKey(key);
              if (!nk || value == null || value === "") return;
              if (SKIP.has(nk) || nk.startsWith("_")) return;
              addValue(f, nk, value);
            });
          }

          if (Array.isArray(variant?.option_values)) {
            const groups = Array.isArray(p.variation_groups) ? p.variation_groups : [];
            variant.option_values.forEach((value, idx) => {
              const groupKey = inferFacetKeyFromValue(value, variationGroupFacetKey(groups[idx], idx));
              addValue(f, groupKey, value);
            });
          }
        });
      }
    });

    return Object.fromEntries(
      Object.entries(f)
        .map(([k, s]) => [k, [...s].sort()])
        .filter(([, v]) => v.length > 0 && v.length <= 50)
    );
  })();

  const hasFacets = Object.keys(facets).length > 0;

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
      const meta = p.metadata || {};
      const normalizedKey = normalizeFacetKey(k);
      // 1. Direct metadata key
      const direct = meta[k];
      if (direct != null && (Array.isArray(direct) ? direct : [direct]).some(x => vals.includes(String(x).trim()))) return true;
      const directNormalized = meta[normalizedKey];
      if (directNormalized != null && (Array.isArray(directNormalized) ? directNormalized : [directNormalized]).some(x => vals.includes(String(x).trim()))) return true;
      // 2. metafields array [{key, value}, ...]
      if (Array.isArray(meta.metafields) && meta.metafields.some(mf => mf?.key === k && vals.includes(String(mf.value ?? "").trim()))) return true;
      if (Array.isArray(meta.metafields) && meta.metafields.some(mf => normalizeFacetKey(mf?.key) === normalizedKey && vals.includes(String(mf.value ?? "").trim()))) return true;
      // 3. variant metadata + option_values
      if (Array.isArray(p.variants) && p.variants.some(v => {
        const variantMeta = typeof v?.metadata === "object" && v.metadata ? v.metadata : {};
        const directVariant = variantMeta[k];
        if (directVariant != null && (Array.isArray(directVariant) ? directVariant : [directVariant]).some(x => vals.includes(String(x).trim()))) return true;
        const directVariantNormalized = variantMeta[normalizedKey];
        if (directVariantNormalized != null && (Array.isArray(directVariantNormalized) ? directVariantNormalized : [directVariantNormalized]).some(x => vals.includes(String(x).trim()))) return true;
        if (Array.isArray(variantMeta.metafields) && variantMeta.metafields.some(mf => normalizeFacetKey(mf?.key) === normalizedKey && vals.includes(String(mf.value ?? "").trim()))) return true;
        const ov = Array.isArray(v.option_values) ? v.option_values : [];
        const groups = Array.isArray(p.variation_groups) ? p.variation_groups : [];
        return ov.some((x, idx) => inferFacetKeyFromValue(x, variationGroupFacetKey(groups[idx], idx)) === normalizedKey && vals.includes(String(x).trim()));
      })) return true;
      return false;
    });
  });

  /* ── Sort ── */
  const sorted = [...filtered];
  if (sort === "newest")     sorted.sort((a,b) => {
    const da = a.metadata?.publish_date ? new Date(a.metadata.publish_date).getTime() : (a.created_at ? new Date(a.created_at).getTime() : 0);
    const db = b.metadata?.publish_date ? new Date(b.metadata.publish_date).getTime() : (b.created_at ? new Date(b.created_at).getTime() : 0);
    return db - da;
  });
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
  const bannerUrl = rawBanner ? resolveImageUrl(rawBanner) : "";

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
            <HeroText>
              <h1 className="shop-typo-catalog-title shop-typo-catalog-title--on-dark">{title}</h1>
            </HeroText>
          </HeroBanner>
        ) : (
          <ColHeader><h1 className="shop-typo-catalog-title">{title}</h1></ColHeader>
        )}

        {/* ── Sort bar (sticky) ── */}
        <SortBar>
          <SortBarInner>
            <SortBarLeft>
              {/* Mobile filter toggle */}
              {hasFacets && (
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
              )}
              <Breadcrumb aria-label="Breadcrumb">
                <Link href={`/${locale}`}>Home</Link>
                <span style={{ color: "#ccc" }}>/</span>
                <b>{title}</b>
              </Breadcrumb>
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

        {/* ── Sidebar + content ── */}
        {hasFacets && <SidebarOverlay $open={panelOpen} onClick={() => setPanelOpen(false)} />}
        <ContentWrap ref={bodyRef}>

          {/* Left filter sidebar */}
          {hasFacets && (
            <Sidebar $open={panelOpen}>
              {/* Mobile header */}
              <SidebarHead>
                <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase" }}>Filter</span>
                <button type="button" onClick={() => setPanelOpen(false)} style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer", color: "#555", lineHeight: 1 }}>×</button>
              </SidebarHead>

              {/* Desktop title */}
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#111", marginBottom: 20, paddingBottom: 12, borderBottom: "1px solid #e8e8e6" }}>
                Filter
                {activeCount > 0 && (
                  <ClearAllBtn type="button" onClick={() => { setFilters({}); setPage(1); }} style={{ float: "right", padding: "2px 8px", fontSize: 10 }}>
                    Clear
                  </ClearAllBtn>
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
                          <input type="checkbox" checked={on} onChange={() => toggle(key, val)} />
                          {val}
                        </CheckRow>
                      );
                    })}
                  </FilterGroupBody>
                </FilterGroup>
              ))}

              {activeCount > 0 && (
                <ClearAllBtn type="button" onClick={() => { setFilters({}); setPage(1); setPanelOpen(false); }}>
                  Clear all filters
                </ClearAllBtn>
              )}
            </Sidebar>
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
              <ProductGrid products={paginated} maxColumns={4} activeFilters={filters} />
            )}

            {/* Önerilen ürünler */}
            {recommendedProducts.length > 0 && (
              <section style={{ marginTop: 48, marginBottom: 24 }}>
                <h2 style={{ fontSize: "1.25rem", fontWeight: 700, marginBottom: 16, color: "#111" }}>Önerilen ürünler</h2>
                <ProductGrid products={recommendedProducts} maxColumns={4} />
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
              <Desc dangerouslySetInnerHTML={{ __html: sanitize(rewriteImageUrlsInHtml(collection.description)) }} />
            )}
          </Body>
        </ContentWrap>
      </Main>
      <Footer />
    </PageWrap>
  );
}
