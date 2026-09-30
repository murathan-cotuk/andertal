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
import { getLocalizedProduct, formatPriceCents } from "@/lib/format";
import { resolveImageUrl } from "@/lib/image-url";
import { storefrontProductHandle } from "@/lib/product-url-handle";

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

export function useSearchDiscovery(active) {
  const [popular, setPopular] = useState([]);
  const [recentCats, setRecentCats] = useState([]);
  const [browse, setBrowse] = useState({ cat: null, products: [] });
  const [recommended, setRecommended] = useState([]);
  const loadedRef = useRef(false);
  const aliveRef = useRef(true);

  useEffect(() => {
    if (!active) return undefined;
    const cats = loadRecentCategories();
    setRecentCats(cats);
    if (loadedRef.current) return undefined;
    loadedRef.current = true;
    fetch("/api/store-categories?tree=true&is_visible=true&depth=1")
      .then((r) => r.json())
      .then((d) => {
        if (!aliveRef.current) return;
        const tree = Array.isArray(d?.tree) ? d.tree : Array.isArray(d?.categories) ? d.categories : [];
        setPopular(tree.filter((c) => !c.parent_id && c.name).slice(0, 5).map((c) => c.name));
      })
      .catch(() => {});
    const first = cats[0];
    if (first) {
      fetch(`/api/store-products?category=${encodeURIComponent(first.slug)}&limit=4`)
        .then((r) => r.json())
        .then((d) => { if (aliveRef.current) setBrowse({ cat: first, products: Array.isArray(d?.products) ? d.products.slice(0, 4) : [] }); })
        .catch(() => {});
    }
    fetch("/api/store-products?limit=12")
      .then((r) => r.json())
      .then((d) => { if (aliveRef.current) setRecommended(Array.isArray(d?.products) ? d.products : []); })
      .catch(() => {});
    return undefined;
  }, [active]);

  useEffect(() => {
    aliveRef.current = true;
    return () => { aliveRef.current = false; };
  }, []);

  const browseIds = new Set(browse.products.map((p) => p.id));
  return {
    popular,
    recentCats,
    browse,
    recommended: recommended.filter((p) => !browseIds.has(p.id)).slice(0, 4),
  };
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
export function DiscoveryTerms({ recent, onClearRecent, onPickTerm, popular, recentCats, onNavigate, showPopular = true, showIcons = true }) {
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
              <Pill key={term} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => onPickTerm(term)}>
                {showIcons ? <ClockIcon /> : null}
                {term}
              </Pill>
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
        <div>
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
