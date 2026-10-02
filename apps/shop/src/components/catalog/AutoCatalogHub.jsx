"use client";

/**
 * Algorithmic catalog hub for Seiten (content/pages) that have no hand-built content yet —
 * /bestsellers, /neuheiten, /sales and any empty CMS page. Builds, from the live catalog:
 *   intro card · left filter card (categories with counts, ranking, toggles) ·
 *   "Top 10" carousel · one ranked carousel per main category (→ "Alle ansehen").
 * Mobile: category pills + ranking select instead of the left card.
 *
 * Ranking is a transparent score (no invented data): sales, then rating × review volume,
 * then views, with a small recency bonus, so a shop without sales data still gets a
 * meaningful order instead of an empty page.
 */

import React, { useEffect, useMemo, useState, createContext, useContext } from "react";
import styled from "styled-components";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import Carousel from "@/components/Carousel";
import { ProductCard } from "@/components/ProductCard";
import GlobalPageLoader from "@/components/ui/GlobalPageLoader";
import { cachedJsonFetch } from "@/lib/browser-fetch-cache";
import { getLocalizedCategory } from "@/lib/format";
import {
  isDiscountedProduct,
  getProductBasePriceCents,
  loadCatalogBadgeRules,
  loadNewProductWindowDays,
  isWithinNewWindow,
} from "@/lib/catalog-listing";
import { productIsInStock, productPriceCents } from "@/lib/seo";
import { useIsNarrow } from "@/hooks/useIsNarrow";
import CatalogDrawerPortal, { CATALOG_FILTER_OVERLAY_Z, CATALOG_FILTER_SIDEBAR_Z } from "@/lib/catalog-drawer-portal";

/** Sidebar selection on a hub page. Product grids inside the page read `products`. */
export const HubCatalogFilterContext = createContext(null);
export function useHubCatalogFilter() {
  return useContext(HubCatalogFilterContext);
}

const INK = "#1d1b18";
const MUTED = "#5e574e";
const LINE = "#efe8dd";
const ACCENT = "#a65300";
const MAX_SECTIONS = 10;

export const HUB_MODES = ["bestseller", "newest", "sale"];

/** Picks the hub mode from a page slug/title ("bestseller", "neuheiten", "sale", …). */
export function inferHubMode(...hints) {
  const s = hints.filter(Boolean).join(" ").toLowerCase();
  if (/sale|angebot|deal|rabatt|reduziert|indirim|promo|offert|oferta/.test(s)) return "sale";
  if (/neu|new|yeni|nouveau|nuevo|novit/.test(s)) return "newest";
  return "bestseller";
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function recencyMs(p) {
  const t = new Date(p?.metadata?.publish_date || p?.created_at || 0).getTime();
  return Number.isFinite(t) ? t : 0;
}

function discountShare(p) {
  const meta = p?.metadata || {};
  const de = meta.prices?.DE;
  const base = de?.brutto_cents != null ? num(de.brutto_cents) : getProductBasePriceCents(p);
  const sale = de?.sale_cents != null ? num(de.sale_cents) : meta.rabattpreis_cents != null ? num(meta.rabattpreis_cents) : null;
  if (!base || sale == null || sale <= 0 || sale >= base) return 0;
  return 1 - sale / base;
}

function popularityScore(p) {
  const m = p?.metadata || {};
  const sold = num(m.sold_last_month || m.sold || m.sales_count) + (m.is_bestseller === true ? 25 : 0);
  const rating = num(m.review_avg) * Math.log10(1 + num(m.review_count));
  const views = Math.log10(1 + num(m.view_count || m.views));
  const ageDays = (Date.now() - recencyMs(p)) / 86400000;
  const fresh = ageDays >= 0 && ageDays < 30 ? (30 - ageDays) / 30 : 0;
  return sold * 10 + rating * 4 + views + fresh;
}

const RANKERS = {
  bestseller: (a, b) => popularityScore(b) - popularityScore(a),
  rating: (a, b) => num(b?.metadata?.review_avg) * Math.log10(1 + num(b?.metadata?.review_count)) - num(a?.metadata?.review_avg) * Math.log10(1 + num(a?.metadata?.review_count)),
  newest: (a, b) => recencyMs(b) - recencyMs(a),
  discount: (a, b) => discountShare(b) - discountShare(a),
  price_asc: (a, b) => (productPriceCents(a) ?? 0) - (productPriceCents(b) ?? 0),
};

const DEFAULT_RANK = { bestseller: "bestseller", newest: "newest", sale: "discount" };
const RANK_OPTIONS = {
  bestseller: ["bestseller", "rating", "newest", "price_asc"],
  newest: ["newest", "bestseller", "rating", "price_asc"],
  sale: ["discount", "bestseller", "newest", "price_asc"],
};

/** id → root node over the full category tree. */
function rootMap(tree) {
  const map = new Map();
  const walk = (nodes, root, seen) => {
    for (const n of Array.isArray(nodes) ? nodes : []) {
      if (!n || seen.has(n)) continue;
      seen.add(n);
      const r = root || n;
      if (n.id != null) map.set(String(n.id), r);
      if (n.handle) map.set(`h:${n.handle}`, r);
      if (n.slug) map.set(`h:${String(n.slug).replace(/^\//, "")}`, r);
      walk(n.children, r, seen);
    }
  };
  walk(tree, null, new WeakSet());
  return map;
}

function nodeById(tree, id) {
  const want = String(id || "");
  if (!want) return null;
  const walk = (nodes) => {
    for (const n of Array.isArray(nodes) ? nodes : []) {
      if (!n) continue;
      if (String(n.id) === want) return n;
      const hit = walk(n.children);
      if (hit) return hit;
    }
    return null;
  };
  return walk(tree);
}

function productMatchesNode(p, node) {
  if (!node) return true;
  const ids = new Set();
  const walk = (n) => {
    if (!n) return;
    if (n.id != null) ids.add(String(n.id));
    if (n.handle) ids.add(`h:${n.handle}`);
    if (n.slug) ids.add(`h:${String(n.slug).replace(/^\//, "")}`);
    for (const c of n.children || []) walk(c);
  };
  walk(node);
  const hit = (id, handle) => (id != null && String(id) !== "" && ids.has(String(id))) || (handle && ids.has(`h:${handle}`));
  for (const c of Array.isArray(p?.categories) ? p.categories : []) {
    if (hit(c?.id, c?.handle || c?.slug)) return true;
  }
  const m = p?.metadata || {};
  return hit(m.admin_category_id || m.category_id, m.category_handle || m.category_slug);
}

function productRoots(p, map) {
  const out = new Map();
  const add = (key) => {
    const r = key ? map.get(key) : null;
    if (r?.id != null) out.set(String(r.id), r);
  };
  for (const c of Array.isArray(p?.categories) ? p.categories : []) {
    add(c?.id != null ? String(c.id) : "");
    if (c?.handle) add(`h:${c.handle}`);
  }
  const m = p?.metadata || {};
  add(String(m.admin_category_id || m.category_id || "").trim());
  return [...out.values()];
}

/* ─── styles ─────────────────────────────────────────────────────────────── */

const Page = styled.div`
  max-width: 1440px;
  margin: 0 auto;
  padding: 24px 24px 56px;
  box-sizing: border-box;
  @media (max-width: 767px) { padding: 12px 0 40px; }
`;

const Layout = styled.div`
  display: grid;
  grid-template-columns: ${(p) => (p.$withSide ? "260px minmax(0, 1fr)" : "minmax(0, 1fr)")};
  gap: 28px;
  align-items: start;
  @media (max-width: 1023px) { grid-template-columns: minmax(0, 1fr); gap: 0; }
`;

const Side = styled.aside`
  position: sticky;
  top: 140px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  @media (max-width: 1023px) { display: none; }
`;

const Card = styled.section`
  background: #fff;
  border-radius: 20px;
  padding: 18px;
  box-shadow: 0 0 0 1px rgba(29, 27, 24, 0.06);
  h2 {
    margin: 0 0 10px;
    font-size: 15px;
    font-weight: 700;
    font-family: inherit;
    color: ${INK};
  }
`;

const CatBtn = styled.button`
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 10px;
  margin: 1px 0;
  border: none;
  border-radius: 10px;
  background: ${(p) => (p.$on ? "#fcebd5" : "transparent")};
  box-shadow: ${(p) => (p.$on ? "inset 3px 0 0 var(--shop-primary, #ee8a12)" : "none")};
  font: inherit;
  font-size: 14px;
  font-weight: ${(p) => (p.$on ? 700 : 500)};
  color: ${(p) => (p.$on ? INK : MUTED)};
  text-align: left;
  cursor: pointer;
  span:last-child { font-size: 12px; color: #8a8174; font-weight: 500; }
  &:hover { background: ${(p) => (p.$on ? "#fcebd5" : "#f6f2ec")}; color: ${INK}; }
`;

const Radio = styled.label`
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 34px;
  font-size: 14px;
  color: ${INK};
  cursor: pointer;
  input { accent-color: ${INK}; width: 16px; height: 16px; margin: 0; }
`;

const MobileBar = styled.div`
  display: none;
  @media (max-width: 1023px) {
    display: flex;
    flex-direction: column;
    gap: 10px;
    position: sticky;
    top: 0;
    z-index: 5;
    padding: 8px 0 12px;
    background: var(--shop-bg, #f6f2ec);
  }
  .pills {
    display: flex;
    gap: 8px;
    overflow-x: auto;
    padding: 0 16px;
    scrollbar-width: none;
    &::-webkit-scrollbar { display: none; }
  }
  .pills button {
    flex: none;
    height: 38px;
    padding: 0 16px;
    border-radius: 999px;
    border: 1px solid #d6ccbd;
    background: #fff;
    font: inherit;
    font-size: 14px;
    color: ${INK};
    white-space: nowrap;
    cursor: pointer;
  }
  .pills button[aria-pressed="true"] { background: ${INK}; border-color: ${INK}; color: #fff; font-weight: 700; }
  .row { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 0 16px; }
  select {
    height: 38px;
    padding: 0 12px;
    border-radius: 999px;
    border: 1px solid #d6ccbd;
    background: #fff;
    font: inherit;
    font-size: 14px;
    color: ${INK};
  }
  .count { font-size: 13px; font-weight: 700; color: ${MUTED}; }
`;

const FilterOpenBtn = styled.button`
  display: none;
  @media (max-width: 1023px) {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin: 0 16px 12px;
    padding: 8px 0;
    background: none;
    border: none;
    border-bottom: 1.5px solid #111;
    font: inherit;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: ${INK};
    cursor: pointer;
  }
`;

const Section = styled.section`
  scroll-margin-top: 140px;
  margin-bottom: 36px;
  @media (max-width: 767px) { margin-bottom: 24px; padding: 0 16px; }
  .head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
    width: 100%;
  }
  h2 {
    margin: 0;
    font-family: var(--h2-ff, inherit);
    font-size: clamp(1.35rem, 2.2vw, 1.75rem);
    font-weight: 800;
    letter-spacing: -0.01em;
    color: ${INK};
  }
  .sub { display: block; margin-top: 4px; font-size: 13px; color: #8a8174; font-weight: 500; }
  .all { flex: none; font-size: 14px; font-weight: 700; color: ${ACCENT}; text-decoration: none; white-space: nowrap; }
  .all:hover { text-decoration: underline; text-underline-offset: 3px; }
  .chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 12px; }
  .chips a {
    padding: 6px 12px;
    border-radius: 999px;
    background: #fff;
    box-shadow: inset 0 0 0 1px #e3dbcf;
    font-size: 13px;
    color: ${INK};
    text-decoration: none;
  }
  .chips a:hover { box-shadow: inset 0 0 0 1px ${INK}; }
`;

const Empty = styled.p`
  margin: 24px 0;
  padding: 32px;
  border-radius: 20px;
  background: #fff;
  text-align: center;
  color: ${MUTED};
`;

/* ─── component ──────────────────────────────────────────────────────────── */

/**
 * `showCategories` / `showFilters` / `showMobileFilter` follow the page's Sellercentral landing
 * settings (left category panel + left product filter). Marketing banners are CMS containers only.
 * When the page has its own containers they are passed as `children` and replace this hub's
 * own product sections; the side bars stay if settings enable them.
 * @param {{ mode?: "bestseller"|"newest"|"sale", title?: string, subtitle?: string,
 *   maxItems?: number, rank?: string, showCategories?: boolean, showFilters?: boolean,
 *   showMobileFilter?: boolean, children?: React.ReactNode }} props
 */
export default function AutoCatalogHub({
  mode = "bestseller",
  title = "",
  subtitle = "",
  maxItems = 20,
  rank: rankProp = "",
  showCategories = true,
  showFilters = true,
  showMobileFilter = false,
  children = null,
}) {
  const locale = useLocale();
  const t = useTranslations("catalogHub");
  const tFilter = useTranslations("filterPanel");
  const isNarrow = useIsNarrow(1023);
  const [tree, setTree] = useState([]);
  const [products, setProducts] = useState(null);
  const [rules, setRules] = useState({ saleMinDiscountPercent: 0, newDays: 15 });
  const [activeCat, setActiveCat] = useState("");
  const [rank, setRank] = useState(RANK_OPTIONS[mode]?.includes(rankProp) ? rankProp : DEFAULT_RANK[mode]);
  const [inStockOnly, setInStockOnly] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      cachedJsonFetch("/api/store-categories?tree=true&is_visible=true", { ttlMs: 60000 }).catch(() => ({ tree: [] })),
      cachedJsonFetch("/api/store-products?limit=1200", { ttlMs: 15000 }).catch(() => ({ products: [] })),
      loadCatalogBadgeRules().catch(() => ({ saleMinDiscountPercent: 0 })),
      loadNewProductWindowDays().catch(() => 15),
    ]).then(([cats, prods, badge, days]) => {
      if (cancelled) return;
      setTree(Array.isArray(cats?.tree) ? cats.tree : Array.isArray(cats?.categories) ? cats.categories : []);
      setProducts(Array.isArray(prods?.products) ? prods.products : []);
      setRules({ saleMinDiscountPercent: badge?.saleMinDiscountPercent ?? 0, newDays: days || 15 });
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!mobileOpen) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [mobileOpen]);

  const pool = useMemo(() => {
    if (!products) return [];
    let list = products;
    if (mode === "sale") list = list.filter((p) => isDiscountedProduct(p, rules.saleMinDiscountPercent));
    if (mode === "newest") {
      const fresh = list.filter((p) => isWithinNewWindow(p, rules.newDays));
      // Nothing inside the "new" window → still show the most recent products instead of nothing.
      list = fresh.length >= 4 ? fresh : list;
    }
    if (inStockOnly) list = list.filter((p) => productIsInStock(p));
    return [...list].sort(RANKERS[rank] || RANKERS.bestseller);
  }, [products, mode, rules, rank, inStockOnly]);

  const categoryMap = useMemo(() => rootMap(tree), [tree]);
  const selectedNode = activeCat ? nodeById(tree, activeCat) : null;
  const visiblePool = useMemo(() => {
    if (!selectedNode) return pool;
    const root = categoryMap.get(String(selectedNode.id));
    const selectedIsRoot = !root || String(root.id) === String(selectedNode.id);
    if (!selectedIsRoot) return pool.filter((p) => productMatchesNode(p, selectedNode));
    return pool.filter((p) => (
      productMatchesNode(p, selectedNode)
      || productRoots(p, categoryMap).some((r) => String(r.id) === String(selectedNode.id))
    ));
  }, [pool, selectedNode, categoryMap]);

  const sections = useMemo(() => {
    const map = rootMap(tree);
    const byRoot = new Map();
    for (const p of pool) {
      for (const root of productRoots(p, map)) {
        const key = String(root.id);
        if (!byRoot.has(key)) byRoot.set(key, { root, products: [] });
        byRoot.get(key).products.push(p);
      }
    }
    return [...byRoot.values()]
      .filter((s) => s.products.length > 0)
      .sort((a, b) => b.products.length - a.products.length)
      .slice(0, MAX_SECTIONS);
  }, [tree, pool]);

  const hubFilter = { mode, products: products === null ? null : visiblePool, activeCat };

  if (products === null) {
    return (
      <HubCatalogFilterContext.Provider value={hubFilter}>
        <GlobalPageLoader />
      </HubCatalogFilterContext.Provider>
    );
  }

  const catName = (c) => getLocalizedCategory(c, locale).name || c.name || c.handle || "";
  const catSlug = (c) => String(c.slug || c.handle || "").replace(/^\//, "");
  const selectedRoot = selectedNode ? (categoryMap.get(String(selectedNode.id)) || selectedNode) : null;
  const visibleSections = selectedRoot ? sections.filter((s) => String(s.root.id) === String(selectedRoot.id)) : sections;
  const top = pool.slice(0, 10);
  const showRank = rank === "bestseller" || rank === "rating";
  const seeAllQuery = mode === "bestseller" ? "?sort=bestseller" : mode === "newest" ? "?sort=newest" : "?sale=1";

  const carousel = (list, label, ranked) => (
    <Carousel
      contained={false}
      navOnSides={!isNarrow}
      gap={12}
      itemWidth={isNarrow ? 168 : 200}
      visibleCount={isNarrow ? undefined : 5}
      showFade={false}
      ariaLabel={label}
    >
      {list.map((p, i) => (
        <div key={p.id || i} style={{ minWidth: 0 }}>
          <ProductCard product={p} plainImage isBestseller={mode === "bestseller"} rank={ranked ? i + 1 : undefined} hideBestsellerBadge />
        </div>
      ))}
    </Carousel>
  );

  const rankLabel = (r) => t(`rank_${r}`);
  const embedOnly = children != null;
  const showCatCard = showCategories && sections.length > 0;
  const withSide = showCatCard || showFilters;
  const drawerCats = showCatCard || (showMobileFilter && !showFilters);
  const drawerFilters = showFilters || (showMobileFilter && !showCatCard);

  const categoryCard = (closeOnPick) => (
    <Card>
      <h2>{t("categories")}</h2>
      <CatBtn type="button" $on={!activeCat} aria-pressed={!activeCat} onClick={() => { setActiveCat(""); if (closeOnPick) setMobileOpen(false); }}>
        <span>{t("allCategories")}</span>
        <span>{pool.length}</span>
      </CatBtn>
      {sections.map((s) => {
        const id = String(s.root.id);
        const kids = (Array.isArray(s.root.children) ? s.root.children : []).filter((c) => c && c.is_visible !== false);
        const rootOn = activeCat === id || kids.some((c) => String(c.id) === activeCat);
        return (
          <div key={id}>
            <CatBtn type="button" $on={activeCat === id} aria-pressed={activeCat === id} onClick={() => { setActiveCat(activeCat === id ? "" : id); if (closeOnPick) setMobileOpen(false); }}>
              <span>{catName(s.root)}</span>
              <span>{s.products.length}</span>
            </CatBtn>
            {rootOn ? kids.slice(0, 12).map((c) => {
              const cid = String(c.id);
              return (
                <CatBtn key={cid} type="button" $on={activeCat === cid} aria-pressed={activeCat === cid} onClick={() => { setActiveCat(activeCat === cid ? id : cid); if (closeOnPick) setMobileOpen(false); }} style={{ paddingLeft: 22 }}>
                  <span>{catName(c)}</span>
                </CatBtn>
              );
            }) : null}
          </div>
        );
      })}
    </Card>
  );

  const filterCard = (
    <Card>
      <h2>{t("ranking")}</h2>
      {(RANK_OPTIONS[mode] || RANK_OPTIONS.bestseller).map((r) => (
        <Radio key={r}>
          <input type="radio" name="hub-rank" checked={rank === r} onChange={() => setRank(r)} />
          {rankLabel(r)}
        </Radio>
      ))}
      <div style={{ height: 1, background: LINE, margin: "10px 0" }} />
      <Radio>
        <input type="checkbox" checked={inStockOnly} onChange={(e) => setInStockOnly(e.target.checked)} />
        {tFilter("inStock")}
      </Radio>
    </Card>
  );

  // No hardcoded marketing banner here — hero/title blocks belong in Sellercentral
  // landing-page containers (page_banner / text_block / hero_banner). When this hub wraps
  // CMS containers (`children`), only the left chrome from landing settings remains.
  return (
    <HubCatalogFilterContext.Provider value={hubFilter}>
    <Page>
      {!embedOnly && (title || subtitle) ? (
        <div style={{ marginBottom: 16, padding: "0 4px" }}>
          {title ? <h1 className="shop-typo-catalog-title" style={{ margin: "0 0 6px" }}>{title}</h1> : null}
          {subtitle ? <p style={{ margin: 0, color: MUTED, fontSize: 15, lineHeight: 1.45 }}>{subtitle}</p> : null}
        </div>
      ) : null}

      <Layout $withSide={withSide}>
        {withSide ? (
        <Side aria-label={t("filters")}>
          {showCatCard ? categoryCard(false) : null}
          {showFilters ? filterCard : null}
        </Side>
        ) : null}

        <div style={{ minWidth: 0 }}>
          {showMobileFilter ? (
            <FilterOpenBtn type="button" aria-expanded={mobileOpen} onClick={() => setMobileOpen(true)}>
              {t("filters")}
            </FilterOpenBtn>
          ) : null}
          {showMobileFilter && isNarrow ? (
            <CatalogDrawerPortal>
              <div
                onClick={() => setMobileOpen(false)}
                style={{
                  display: mobileOpen ? "block" : "none",
                  position: "fixed",
                  inset: 0,
                  background: "rgba(0,0,0,0.35)",
                  zIndex: CATALOG_FILTER_OVERLAY_Z,
                }}
              />
              <aside
                style={{
                  display: "flex",
                  flexDirection: "column",
                  position: "fixed",
                  top: 0,
                  left: 0,
                  width: "min(380px, 92vw)",
                  height: "100dvh",
                  zIndex: CATALOG_FILTER_SIDEBAR_Z,
                  background: "#fff",
                  transform: mobileOpen ? "translateX(0)" : "translateX(-100%)",
                  transition: "transform 0.3s ease",
                  boxSizing: "border-box",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px" }}>
                  <strong>{t("filters")}</strong>
                  <button type="button" onClick={() => setMobileOpen(false)} aria-label={t("filters")} style={{ background: "none", border: "none", font: "inherit", fontSize: 22, cursor: "pointer", lineHeight: 1 }}>×</button>
                </div>
                <div style={{ overflowY: "auto", padding: "0 12px 24px", display: "flex", flexDirection: "column", gap: 12 }}>
                  {drawerCats ? categoryCard(true) : null}
                  {drawerFilters ? filterCard : null}
                </div>
              </aside>
            </CatalogDrawerPortal>
          ) : null}
          {!showMobileFilter && withSide ? (
          <MobileBar>
            {showCatCard ? (
              <div className="pills" role="toolbar" aria-label={t("categories")}>
                <button type="button" aria-pressed={!activeCat} onClick={() => setActiveCat("")}>{t("allCategories")}</button>
                {sections.map((s) => {
                  const id = String(s.root.id);
                  return (
                    <button key={id} type="button" aria-pressed={activeCat === id} onClick={() => setActiveCat(activeCat === id ? "" : id)}>
                      {catName(s.root)}
                    </button>
                  );
                })}
              </div>
            ) : null}
            {showFilters ? (
            <div className="row">
              <span className="count">{t("productsCount", { count: pool.length })}</span>
              <select value={rank} onChange={(e) => setRank(e.target.value)} aria-label={t("ranking")}>
                {(RANK_OPTIONS[mode] || RANK_OPTIONS.bestseller).map((r) => <option key={r} value={r}>{rankLabel(r)}</option>)}
              </select>
            </div>
            ) : null}
          </MobileBar>
          ) : null}

          {children ? <div style={{ marginBottom: 12 }}>{children}</div> : null}

          {!embedOnly && pool.length === 0 ? <Empty>{t(`empty_${mode}`)}</Empty> : null}

          {!embedOnly && !activeCat && top.length >= 4 ? (
            <Section>
              <div className="head" style={{ marginBottom: 14 }}>
                <h2>{t(`top_${mode}`)}</h2>
              </div>
              {carousel(top, t(`top_${mode}`), showRank)}
            </Section>
          ) : null}

          {!embedOnly && visibleSections.map((s) => {
            const name = catName(s.root);
            const slug = catSlug(s.root);
            const subs = (Array.isArray(s.root.children) ? s.root.children : []).filter((c) => c && c.is_visible !== false).slice(0, 8);
            return (
              <Section key={s.root.id} id={slug || undefined}>
                <div className="head" style={{ marginBottom: 14 }}>
                  <div>
                    <h2>{name}</h2>
                    <span className="sub">{t(`sectionSub_${mode}`, { count: s.products.length })}</span>
                  </div>
                  {slug ? <Link className="all" href={`/${slug}${seeAllQuery}`}>{t("seeAll")}</Link> : null}
                </div>
                {carousel(s.products.slice(0, maxItems), name, showRank)}
                {activeCat && subs.length ? (
                  <div className="chips">
                    {subs.map((c) => {
                      const sl = catSlug(c);
                      return sl ? <Link key={c.id || sl} href={`/${sl}${seeAllQuery}`}>{catName(c)}</Link> : null;
                    })}
                  </div>
                ) : null}
              </Section>
            );
          })}
        </div>
      </Layout>
    </Page>
    </HubCatalogFilterContext.Provider>
  );
}
