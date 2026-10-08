"use client";

/**
 * Search focus content of the "Warmer Marktplatz" design (desktop panel + mobile sheet), shown
 * while the search field is focused and nothing is typed yet:
 *  - Zuletzt gesucht (localStorage, handled by the caller) · Beliebte Suchen · Zuletzt angesehene Kategorien
 *  - Weiter stöbern in „<last viewed category>“ · Für dich empfohlen
 * "Beliebte Suchen" uses the shop's main categories — there is no search statistic in the backend.
 */

import React, { useEffect, useRef, useState } from "react";
import styled from "styled-components";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { getLocalizedProduct, getLocalizedCategory, formatPriceCents } from "@/lib/format";
import CardGrundpreis from "@/components/product/CardGrundpreis";
import { resolveImageUrl } from "@/lib/image-url";
import { storefrontProductHandle } from "@/lib/product-url-handle";
import { usePopularSearches, loadPopularSearches } from "@/lib/store-search";

const RECENT_CATEGORIES_KEY = "andertal-recent-categories";
const MAX_RECENT_CATEGORIES = 6;

export function loadRecentCategories() {
  if (typeof window === "undefined") return [];
  try {
    const a = JSON.parse(window.localStorage.getItem(RECENT_CATEGORIES_KEY) || "[]");
    return Array.isArray(a) ? a.filter((c) => c && c.slug && c.name).slice(0, MAX_RECENT_CATEGORIES) : [];
  } catch {
    return [];
  }
}

/** Called by category pages so the search panel can offer "recently viewed categories". */
export function rememberViewedCategory(cat) {
  const slug = String(cat?.slug || "").replace(/^\//, "").trim();
  const name = String(cat?.name || "").trim();
  if (!slug || !name || typeof window === "undefined") return;
  try {
    const next = [{ slug, name }, ...loadRecentCategories().filter((c) => c.slug !== slug)].slice(0, MAX_RECENT_CATEGORIES);
    window.localStorage.setItem(RECENT_CATEGORIES_KEY, JSON.stringify(next));
  } catch { /* ignore */ }
}

function productPriceCents(p) {
  const v0 = p?.variants?.[0] || {};
  const n = Number(v0?.calculated_price?.calculated_amount ?? v0?.prices?.[0]?.amount ?? p?.price_cents ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/*
 * Module-level cache: the panel data is fetched once per page session (and prefetched right
 * after the header mounts), so the focus panel opens already filled instead of waiting for
 * the category / product requests on every click.
 */
const discoveryCache = { cats: new Map(), recommended: null, browse: new Map() };

function loadRootCategories(locale) {
  const loc = String(locale || "de").slice(0, 2).toLowerCase();
  if (!discoveryCache.cats.has(loc)) {
    discoveryCache.cats.set(
      loc,
      fetch(`/api/store-categories?tree=true&is_visible=true&depth=1&locale=${encodeURIComponent(loc)}`)
        .then((r) => r.json())
        .then((d) => {
          const tree = Array.isArray(d?.tree) ? d.tree : Array.isArray(d?.categories) ? d.categories : [];
          const list = tree
            .filter((c) => !c.parent_id && c.name)
            .map((c) => ({
              // Same localized name the mega menu shows (translations live in the category row).
              name: String(getLocalizedCategory(c, loc).name || c.name),
              slug: String(c.slug || c.handle || "").replace(/^\//, ""),
            }));
          // An empty answer (cold/failed backend) must not stick for the whole session.
          if (!list.length) discoveryCache.cats.delete(loc);
          return list;
        })
        .catch(() => {
          discoveryCache.cats.delete(loc);
          return [];
        }),
    );
  }
  return discoveryCache.cats.get(loc);
}

function loadRecommended() {
  if (!discoveryCache.recommended) {
    discoveryCache.recommended = fetch("/api/store-products?limit=12")
      .then((r) => r.json())
      .then((d) => {
        const list = Array.isArray(d?.products) ? d.products : [];
        if (!list.length) discoveryCache.recommended = null;
        return list;
      })
      .catch(() => {
        discoveryCache.recommended = null;
        return [];
      });
  }
  return discoveryCache.recommended;
}

function loadBrowse(slug) {
  if (!discoveryCache.browse.has(slug)) {
    discoveryCache.browse.set(
      slug,
      fetch(`/api/store-products?category=${encodeURIComponent(slug)}&limit=4`)
        .then((r) => r.json())
        .then((d) => (Array.isArray(d?.products) ? d.products.slice(0, 4) : []))
        .catch(() => {
          discoveryCache.browse.delete(slug);
          return [];
        }),
    );
  }
  return discoveryCache.browse.get(slug);
}

/** Warm the panel data shortly after the header mounts (idle time, never blocks the page). */
export function usePrefetchSearchDiscovery() {
  const locale = useLocale();
  useEffect(() => {
    const run = () => {
      loadRootCategories(locale);
      loadRecommended();
      loadPopularSearches();
      const first = loadRecentCategories()[0];
      if (first) loadBrowse(first.slug);
    };
    if (typeof window === "undefined") return undefined;
    if ("requestIdleCallback" in window) {
      const id = window.requestIdleCallback(run, { timeout: 2500 });
      return () => window.cancelIdleCallback?.(id);
    }
    const t = window.setTimeout(run, 1200);
    return () => window.clearTimeout(t);
  }, [locale]);
}

export function useSearchDiscovery(active) {
  const locale = useLocale();
  const [rootCats, setRootCats] = useState([]);
  const [recentCats, setRecentCats] = useState([]);
  const [browse, setBrowse] = useState({ cat: null, products: [] });
  const [recommended, setRecommended] = useState([]);
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    return () => { aliveRef.current = false; };
  }, []);

  useEffect(() => {
    if (!active) return;
    const cats = loadRecentCategories();
    setRecentCats(cats);
    loadRootCategories(locale).then((list) => { if (aliveRef.current) setRootCats(list); });
    loadRecommended().then((list) => { if (aliveRef.current) setRecommended(list); });
    const first = cats[0];
    if (first) loadBrowse(first.slug).then((products) => { if (aliveRef.current) setBrowse({ cat: first, products }); });
  }, [active, locale]);

  const popularSearches = usePopularSearches(active);
  const browseIds = new Set(browse.products.map((p) => p.id));
  return {
    // Real "most searched" once enough people searched; until then the main categories.
    popular: popularSearches.length >= 3 ? popularSearches.slice(0, 6) : rootCats.slice(0, 5).map((c) => c.name),
    rootCats,
    recentCats,
    browse,
    recommended: recommended.filter((p) => !browseIds.has(p.id)).slice(0, 4),
  };
}

/**
 * Typing state: "related to what you type" — matching past searches and matching categories
 * (shown above the product hits).
 */
export function SearchSuggestions({ query, recent, rootCats, recentCats, onPickTerm, onNavigate }) {
  const ts = useTranslations("search");
  const q = String(query || "").trim().toLowerCase();
  if (!q) return null;
  const terms = (recent || []).filter((r) => r.toLowerCase().includes(q) && r.toLowerCase() !== q).slice(0, 4);
  const seen = new Set();
  const cats = [...(recentCats || []), ...(rootCats || [])]
    .filter((c) => c && c.slug && c.name && c.name.toLowerCase().includes(q))
    .filter((c) => (seen.has(c.slug) ? false : (seen.add(c.slug), true)))
    .slice(0, 4);
  if (!terms.length && !cats.length) return null;
  return (
    <div style={{ padding: "12px 16px 4px", borderBottom: "1px solid #efe8dd" }}>
      <SectionTitle><span>{ts("suggestions")}</span></SectionTitle>
      <div>
        {terms.map((term) => (
          <Pill key={`t-${term}`} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => onPickTerm(term)}>
            <ClockIcon />
            {term}
          </Pill>
        ))}
        {cats.map((c) => (
          <PillLink key={`c-${c.slug}`} href={`/${c.slug}`} onClick={onNavigate}>
            {c.name}
          </PillLink>
        ))}
      </div>
    </div>
  );
}

const SectionTitle = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin: 0 0 12px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: #5e574e;
  a, button {
    border: none;
    background: none;
    padding: 0;
    font: inherit;
    font-size: 13px;
    letter-spacing: 0;
    text-transform: none;
    color: #a65300;
    font-weight: 700;
    cursor: pointer;
    text-decoration: none;
    white-space: nowrap;
    flex: none;
  }
  @media (max-width: 767px) {
    a { display: none; }
  }
`;

export const Pill = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin: 0 8px 8px 0;
  padding: 8px 14px;
  border: none;
  border-radius: 999px;
  background: #f6f2ec;
  color: #1d1b18;
  font-family: inherit;
  font-size: 14px;
  cursor: pointer;
  text-decoration: none;
  &:hover { background: #efe8dd; }
`;

const PillLink = styled(Pill).attrs({ as: Link })``;

const PopularList = styled.ol`
  list-style: none;
  margin: 0 0 18px;
  padding: 0;
  li { margin: 0; }
  button {
    display: flex;
    align-items: center;
    gap: 16px;
    width: 100%;
    padding: 8px 0;
    border: none;
    background: none;
    font-family: inherit;
    font-size: 15px;
    color: #1d1b18;
    cursor: pointer;
    text-align: left;
  }
  button:hover { color: #a65300; }
  b { color: #a65300; width: 14px; }
`;

const ProductGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
  margin-bottom: 20px;
  @media (max-width: 767px) {
    display: flex;
    overflow-x: auto;
    gap: 10px;
    padding: 0 16px;
    margin: 0 -16px 20px;
    scrollbar-width: none;
    &::-webkit-scrollbar { display: none; }
    > * { flex: 0 0 132px; }
  }
`;

const ProductTile = styled(Link)`
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  color: #1d1b18;
  text-decoration: none;
  .pt-img {
    aspect-ratio: 1;
    border-radius: 14px;
    background: #f6f2ec;
    overflow: hidden;
  }
  .pt-img img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .pt-title { font-size: 13px; line-height: 1.3; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
  .pt-price { font-family: var(--h2-ff, inherit); font-weight: 800; font-size: 15px; }
  &:hover .pt-title { color: #a65300; }
`;

function Products({ items, onNavigate }) {
  const locale = useLocale();
  return (
    <ProductGrid>
      {items.map((p) => {
        const { title } = getLocalizedProduct(p, locale);
        const h = storefrontProductHandle(p, locale);
        const th = p.thumbnail ? resolveImageUrl(p.thumbnail) : "";
        const price = productPriceCents(p);
        return (
          <ProductTile key={p.id} href={h ? `/${h}` : "#"} onClick={onNavigate}>
            <span className="pt-img">{th ? <img src={th} alt="" /> : null}</span>
            <span className="pt-title">{title || p.title || ""}</span>
            {price > 0 ? <span className="pt-price">{formatPriceCents(price)} €</span> : null}
          </ProductTile>
        );
      })}
    </ProductGrid>
  );
}

function ClockIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" style={{ opacity: 0.7 }}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

/** Left column (desktop) / top sections (mobile): recent searches, popular searches, recent categories. */
/** Recent-search pill with its own × (removes just this entry). */
function RecentPill({ term, onPick, onRemove, showIcon = true }) {
  const ts = useTranslations("search");
  return (
    <RecentPillWrap>
      <button type="button" className="rp-term" onMouseDown={(e) => e.preventDefault()} onClick={() => onPick(term)}>
        {showIcon ? <ClockIcon /> : null}
        {term}
      </button>
      {onRemove ? (
        <button
          type="button"
          className="rp-x"
          aria-label={ts("removeRecent", { term })}
          title={ts("removeRecent", { term })}
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => { e.stopPropagation(); onRemove(term); }}
        >
          ×
        </button>
      ) : null}
    </RecentPillWrap>
  );
}

const RecentPillWrap = styled.span`
  display: inline-flex;
  align-items: center;
  margin: 0 8px 8px 0;
  border-radius: 999px;
  background: #f6f2ec;
  color: #1d1b18;
  &:hover { background: #efe8dd; }
  .rp-term {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 8px 4px 8px 14px;
    border: none;
    background: none;
    font: inherit;
    font-size: 14px;
    color: inherit;
    cursor: pointer;
  }
  .rp-x {
    width: 28px;
    height: 28px;
    margin-right: 4px;
    border: none;
    border-radius: 50%;
    background: none;
    color: #8a8174;
    font-size: 17px;
    line-height: 1;
    cursor: pointer;
  }
  .rp-x:hover { background: #e6dfd4; color: #1d1b18; }
`;

export function DiscoveryTerms({ recent, onClearRecent, onRemoveRecent, onPickTerm, popular, recentCats, onNavigate, showPopular = true, showIcons = true }) {
  const ts = useTranslations("search");
  return (
    <div>
      {recent.length > 0 ? (
        <div style={{ marginBottom: 18 }}>
          <SectionTitle>
            <span>{ts("recentlySearched")}</span>
            {onClearRecent ? (
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={onClearRecent}>{ts("clearRecent")}</button>
            ) : null}
          </SectionTitle>
          <div>
            {recent.map((term) => (
              <RecentPill key={term} term={term} onPick={onPickTerm} onRemove={onRemoveRecent} showIcon={showIcons} />
            ))}
          </div>
        </div>
      ) : null}
      {showPopular && popular.length > 0 ? (
        <div>
          <SectionTitle><span>{ts("popularSearches")}</span></SectionTitle>
          <PopularList>
            {popular.map((term, i) => (
              <li key={term}>
                <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => onPickTerm(term)}>
                  <b>{i + 1}</b>
                  {term}
                </button>
              </li>
            ))}
          </PopularList>
        </div>
      ) : null}
      {recentCats.length > 0 ? (
        <div style={{ marginBottom: 18 }}>
          <SectionTitle><span>{ts("recentCategories")}</span></SectionTitle>
          <div>
            {recentCats.map((c) => (
              <PillLink key={c.slug} href={`/${c.slug}`} onClick={onNavigate}>{c.name}</PillLink>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Right column (desktop) / lower sections (mobile): continue browsing + recommended products. */
export function DiscoveryProducts({ browse, recommended, onNavigate }) {
  const ts = useTranslations("search");
  const tCommon = useTranslations("common");
  return (
    <div>
      {browse.cat && browse.products.length > 0 ? (
        <>
          <SectionTitle>
            <span>{ts("continueIn", { name: browse.cat.name })}</span>
            <Link href={`/${browse.cat.slug}`} onClick={onNavigate}>{tCommon("showAll")}</Link>
          </SectionTitle>
          <Products items={browse.products} onNavigate={onNavigate} />
        </>
      ) : null}
      {recommended.length > 0 ? (
        <>
          <SectionTitle><span>{ts("forYou")}</span></SectionTitle>
          <Products items={recommended} onNavigate={onNavigate} />
        </>
      ) : null}
    </div>
  );
}

/* ── Typing state: rich results panel (desktop two columns / mobile stacked) ── */

const ResultGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px 14px;
  margin-bottom: 18px;
  @media (max-width: 767px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 14px 10px;
  }
`;

const ResultTile = styled(Link)`
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  color: #1d1b18;
  text-decoration: none;
  .rt-img {
    position: relative;
    aspect-ratio: 1;
    border-radius: 14px;
    background: #fff;
    box-shadow: inset 0 0 0 1px #efe8dd;
    overflow: hidden;
    margin-bottom: 4px;
  }
  .rt-img img { width: 100%; height: 100%; object-fit: contain; display: block; }
  .rt-brand { font-size: 11px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: #8a8174; }
  .rt-title { font-size: 13px; line-height: 1.3; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
  .rt-title mark { background: none; color: inherit; font-weight: 800; }
  .rt-price { display: flex; align-items: baseline; gap: 6px; font-family: var(--h2-ff, inherit); font-weight: 800; font-size: 15px; }
  .rt-price s { font-family: inherit; font-weight: 500; font-size: 12px; color: #8a8174; }
  .rt-price.sale { color: #c0392b; }
  &:hover .rt-title { color: #a65300; }
`;

const SuggestList = styled.ul`
  list-style: none;
  margin: 0 0 18px;
  padding: 0;
  li { display: flex; align-items: center; }
  .sg-btn {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
    padding: 8px 0;
    border: none;
    background: none;
    font: inherit;
    font-size: 15px;
    color: #1d1b18;
    text-align: left;
    cursor: pointer;
  }
  .sg-btn span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .sg-btn b { font-weight: 800; }
  .sg-btn:hover { color: #a65300; }
  .sg-btn svg { flex: none; color: #8a8174; }
  .sg-x {
    flex: none;
    width: 28px;
    height: 28px;
    border: none;
    border-radius: 50%;
    background: none;
    color: #8a8174;
    font-size: 17px;
    cursor: pointer;
  }
  .sg-x:hover { background: #f6f2ec; color: #1d1b18; }
`;

const CategoryRows = styled.div`
  margin: 0 0 18px;
  a {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    padding: 7px 10px;
    margin: 0 -10px;
    border-radius: 10px;
    color: #1d1b18;
    font-size: 14px;
    text-decoration: none;
  }
  a span:last-child { color: #8a8174; font-size: 12px; }
  a:hover { background: #f6f2ec; color: #a65300; }
`;

const DidYouMean = styled.div`
  margin: 0 0 16px;
  padding: 10px 14px;
  border-radius: 14px;
  background: #fcebd5;
  font-size: 14px;
  color: #3a352f;
  button {
    border: none;
    background: none;
    padding: 0;
    font: inherit;
    font-weight: 800;
    color: #a65300;
    text-decoration: underline;
    text-underline-offset: 3px;
    cursor: pointer;
  }
`;

const SeeAllBtn = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 44px;
  padding: 0 22px;
  border: none;
  border-radius: 999px;
  background: var(--body-color, #1d1b18);
  color: #fff;
  font: inherit;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  &:hover { opacity: 0.9; }
  @media (max-width: 767px) { width: 100%; justify-content: center; }
`;

const SkeletonTile = styled.div`
  aspect-ratio: 1;
  border-radius: 14px;
  background: linear-gradient(90deg, #f3eee6 25%, #efe8dd 50%, #f3eee6 75%);
  background-size: 400% 100%;
  animation: srch-shimmer 1.2s ease-in-out infinite;
  @keyframes srch-shimmer { 0% { background-position: 100% 0; } 100% { background-position: 0 0; } }
`;

function SearchGlyph() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </svg>
  );
}

/** Bold the part of `text` that matches what was typed (accent-insensitive start of a word). */
function MatchText({ text, query }) {
  const t = String(text || "");
  const q = String(query || "").trim();
  if (!q) return <>{t}</>;
  const fold = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const i = fold(t).indexOf(fold(q));
  if (i < 0) return <>{t}</>;
  return (
    <>
      {t.slice(0, i)}
      <mark style={{ background: "none", color: "inherit", fontWeight: 800 }}>{t.slice(i, i + q.length)}</mark>
      {t.slice(i + q.length)}
    </>
  );
}

function priceInfo(p) {
  const v0 = p?.variants?.[0] || {};
  const price = Number(v0?.price_cents ?? v0?.calculated_price?.calculated_amount ?? p?.price_cents ?? 0);
  const compare = Number(v0?.compare_at_price_cents ?? p?.compare_at_price_cents ?? 0);
  return { price: Number.isFinite(price) ? price : 0, compare: compare > price ? compare : 0 };
}

function ResultProducts({ items, query, onNavigate }) {
  const locale = useLocale();
  return (
    <ResultGrid>
      {items.map((p) => {
        const { title } = getLocalizedProduct(p, locale);
        const h = storefrontProductHandle(p, locale);
        const th = p.thumbnail ? resolveImageUrl(p.thumbnail) : "";
        const { price, compare } = priceInfo(p);
        const brand = p?.metadata?.brand_name || "";
        return (
          <ResultTile key={p.id} href={h ? `/${h}` : "#"} onClick={onNavigate}>
            <span className="rt-img">{th ? <img src={th} alt="" loading="lazy" /> : null}</span>
            {brand ? <span className="rt-brand">{brand}</span> : null}
            <span className="rt-title"><MatchText text={title || p.title || ""} query={query} /></span>
            {price > 0 ? (
              <span className={`rt-price${compare ? " sale" : ""}`}>
                {formatPriceCents(price)} €
                {compare ? <s>{formatPriceCents(compare)} €</s> : null}
              </span>
            ) : null}
            {price > 0 ? <CardGrundpreis productMeta={p?.metadata} variantMeta={p?.variants?.[0]?.metadata} cents={price} /> : null}
          </ResultTile>
        );
      })}
    </ResultGrid>
  );
}

/**
 * Results while typing. Left: suggestions (+ matching recent searches, removable), categories,
 * brands. Right: products (exact / related / popular heading) and "show all N results".
 */
export function SearchResultsPanel({ query, data, loading, recent = [], popular = [], onPickTerm, onRemoveRecent, onNavigate, onSeeAll, layout = "desktop" }) {
  const ts = useTranslations("search");
  const q = String(query || "").trim();
  const fold = (s) => String(s || "").toLowerCase();
  const recentHits = recent.filter((r) => fold(r).includes(fold(q)) && fold(r) !== fold(q)).slice(0, 3);
  const suggestions = (data.suggestions || []).filter(
    (s) => s !== data.did_you_mean && !recentHits.some((r) => fold(r) === fold(s)),
  ).slice(0, 6);
  const products = (data.products || []).slice(0, layout === "mobile" ? 6 : 8);
  const showSkeleton = loading && products.length === 0;

  const heading = data.mode === "exact"
    ? ts("productsHeading", { count: data.total })
    : data.mode === "popular"
      ? ts("popularHeading", { query: q })
      : ts("relatedHeading", { query: q });

  const terms = (
    <div>
      {data.did_you_mean ? (
        <DidYouMean>
          {ts("didYouMean")}{" "}
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => onPickTerm(data.did_you_mean)}>
            {data.did_you_mean}
          </button>
          ?
        </DidYouMean>
      ) : null}
      {recentHits.length + suggestions.length > 0 ? (
        <>
          <SectionTitle><span>{ts("suggestions")}</span></SectionTitle>
          <SuggestList>
            {recentHits.map((term) => (
              <li key={`r-${term}`}>
                <button type="button" className="sg-btn" onMouseDown={(e) => e.preventDefault()} onClick={() => onPickTerm(term)}>
                  <ClockIcon />
                  <span><MatchText text={term} query={q} /></span>
                </button>
                {onRemoveRecent ? (
                  <button type="button" className="sg-x" aria-label={ts("removeRecent", { term })} onMouseDown={(e) => e.preventDefault()} onClick={() => onRemoveRecent(term)}>×</button>
                ) : null}
              </li>
            ))}
            {suggestions.map((term) => (
              <li key={`s-${term}`}>
                <button type="button" className="sg-btn" onMouseDown={(e) => e.preventDefault()} onClick={() => onPickTerm(term)}>
                  <SearchGlyph />
                  <span><MatchText text={term} query={q} /></span>
                </button>
              </li>
            ))}
          </SuggestList>
        </>
      ) : null}
      {(data.categories || []).length > 0 ? (
        <>
          <SectionTitle><span>{ts("categoriesHeading")}</span></SectionTitle>
          <CategoryRows>
            {data.categories.map((c) => (
              <Link key={c.id} href={`/${c.slug}`} onClick={onNavigate}>
                <span><MatchText text={c.name} query={q} /></span>
                <span>{c.count}</span>
              </Link>
            ))}
          </CategoryRows>
        </>
      ) : null}
      {!loading && recentHits.length + suggestions.length + (data.categories || []).length + (data.brands || []).length === 0 && popular.length > 0 ? (
        <>
          <SectionTitle><span>{ts("popularSearches")}</span></SectionTitle>
          <PopularList>
            {popular.slice(0, 5).map((term, i) => (
              <li key={term}>
                <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => onPickTerm(term)}>
                  <b>{i + 1}</b>
                  {term}
                </button>
              </li>
            ))}
          </PopularList>
        </>
      ) : null}
      {(data.brands || []).length > 0 ? (
        <div style={{ marginBottom: 12 }}>
          <SectionTitle><span>{ts("brandsHeading")}</span></SectionTitle>
          <div>
            {data.brands.map((b) => (b.handle ? (
              <PillLink key={b.name} href={`/brand/${b.handle}`} onClick={onNavigate}>{b.name}</PillLink>
            ) : (
              <Pill key={b.name} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => onPickTerm(b.name)}>{b.name}</Pill>
            )))}
          </div>
        </div>
      ) : null}
    </div>
  );

  const productsCol = (
    <div>
      <SectionTitle><span>{showSkeleton ? ts("searching") : heading}</span></SectionTitle>
      {showSkeleton ? (
        <ResultGrid>
          {Array.from({ length: layout === "mobile" ? 4 : 8 }).map((_, i) => <SkeletonTile key={i} />)}
        </ResultGrid>
      ) : (
        <ResultProducts items={products} query={data.mode === "exact" ? q : ""} onNavigate={onNavigate} />
      )}
      {!showSkeleton && data.total > 0 ? (
        <SeeAllBtn type="button" onMouseDown={(e) => e.preventDefault()} onClick={onSeeAll}>
          {data.mode === "exact" ? ts("seeAllResults", { count: data.total }) : ts("searchFor", { query: q })}
          <span aria-hidden="true">→</span>
        </SeeAllBtn>
      ) : null}
    </div>
  );

  if (layout === "mobile") {
    return (
      <div style={{ padding: "16px 16px 24px" }}>
        {terms}
        {productsCol}
      </div>
    );
  }
  return (
    <DiscoveryColumns>
      {terms}
      {productsCol}
    </DiscoveryColumns>
  );
}

/** Desktop panel body: two columns like the "Suche (Fokus)" artboard. */
export const DiscoveryColumns = styled.div`
  display: grid;
  grid-template-columns: minmax(260px, 330px) minmax(0, 1fr);
  gap: 0;
  > div:first-child {
    padding: 24px 28px 24px 24px;
    border-right: 1px solid #efe8dd;
  }
  > div:last-child {
    padding: 24px;
  }
`;
