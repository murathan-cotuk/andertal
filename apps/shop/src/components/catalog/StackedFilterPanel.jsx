"use client";

/**
 * Stacked catalog filter of the "Warmer Marktplatz" design — used as the desktop left filter card
 * and as the body of the mobile filter bottom sheet (MobileFilter artboard):
 *   Preis (range slider) · list facets as checkboxes with counts (brand-like first, searchable)
 *   · Farbe swatches · Größe pills · toggles (Nur auf Lager, Nur Angebote).
 * Pure presentation: all state lives in the page template.
 */

import React, { useEffect, useMemo, useState } from "react";
import styled from "styled-components";
import { useTranslations } from "next-intl";
import { colorSwatchFallback } from "@/lib/color-swatch";
import { facetDisplayKind } from "@/components/catalog/FacetOptions";
import { filterProductsByFacets } from "@/lib/catalog-listing";
import { productPriceCents, productIsInStock } from "@/lib/seo";

const INK = "#1d1b18";
const MUTED = "#8a8174";
const LINE = "#efe8dd";
const ACCENT = "#a65300";
const LIST_PREVIEW = 4;

const BRAND_RE = /marke|brand|hersteller|manufacturer|marka|marque|marca/;

/** Per facet value: number of products matching it, given all *other* active facet filters. */
export function facetValueCounts(products, facets, filters) {
  const out = {};
  Object.entries(facets || {}).forEach(([key, vals]) => {
    const others = { ...(filters || {}) };
    delete others[key];
    const base = filterProductsByFacets(products, others);
    out[key] = {};
    vals.forEach((v) => {
      out[key][v] = filterProductsByFacets(base, { [key]: [v] }).length;
    });
  });
  return out;
}

/** Brand shown on product cards (metadata.brand_name / metadata.brand). */
export function productBrandName(p) {
  const meta = p?.metadata && typeof p.metadata === "object" ? p.metadata : {};
  const b = meta.brand_name || (typeof meta.brand === "string" ? meta.brand : "") || p?.brand?.name || "";
  return String(b || "").trim();
}

/** Sorted distinct brand names; empty when fewer than two brands (a single brand is no filter). */
export function brandValues(products) {
  const set = new Set();
  (products || []).forEach((p) => { const b = productBrandName(p); if (b) set.add(b); });
  return set.size > 1 ? [...set].sort((a, b) => a.localeCompare(b)) : [];
}

export function filterByBrands(products, selected) {
  if (!selected?.length) return products;
  return (products || []).filter((p) => selected.includes(productBrandName(p)));
}

export function brandCounts(products, values) {
  const out = {};
  (values || []).forEach((v) => { out[v] = 0; });
  (products || []).forEach((p) => { const b = productBrandName(p); if (b in out) out[b] += 1; });
  return out;
}

/** Whole-euro bounds of the product prices (null when no product has a price). */
export function priceBoundsEuro(products) {
  let lo = Infinity;
  let hi = -Infinity;
  (products || []).forEach((p) => {
    const c = productPriceCents(p);
    if (c == null || c <= 0) return;
    lo = Math.min(lo, c);
    hi = Math.max(hi, c);
  });
  if (!Number.isFinite(lo)) return null;
  return { min: Math.floor(lo / 100), max: Math.ceil(hi / 100) };
}

/** Filters products by an inclusive [min, max] euro range; null range = no-op. */
export function filterByPriceRange(products, range) {
  if (!range) return products;
  const [lo, hi] = range;
  return (products || []).filter((p) => {
    const c = productPriceCents(p);
    if (c == null) return true;
    return c >= lo * 100 && c <= hi * 100;
  });
}

const Wrap = styled.div`
  color: ${INK};
  font-size: 14px;
`;

const Head = styled.div`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 14px;
  h2 {
    margin: 0;
    font-family: var(--h2-ff, inherit);
    font-size: 20px;
    font-weight: 800;
    letter-spacing: -0.01em;
  }
`;

const LinkBtn = styled.button`
  border: none;
  background: none;
  padding: 0;
  font: inherit;
  font-size: 13px;
  font-weight: 700;
  color: ${ACCENT};
  cursor: pointer;
  &:hover { text-decoration: underline; text-underline-offset: 3px; }
`;

const Group = styled.section`
  padding: 16px 0;
  border-top: 1px solid ${LINE};
  &:first-of-type { border-top: none; padding-top: 4px; }
`;

const GroupHead = styled.div`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 12px;
  h3 {
    margin: 0;
    font-size: 15px;
    font-weight: 700;
    font-family: inherit;
  }
  span { font-size: 13px; font-weight: 700; }
`;

const Range = styled.div`
  position: relative;
  height: 28px;
  margin: 0 11px 6px;
  .track, .fill {
    position: absolute;
    top: 50%;
    height: 2px;
    transform: translateY(-50%);
    border-radius: 2px;
  }
  .track { left: -11px; right: -11px; background: #e3dbcf; }
  .fill { background: ${INK}; height: 3px; }
  input {
    position: absolute;
    left: -11px;
    width: calc(100% + 22px);
    top: 0;
    height: 28px;
    margin: 0;
    background: none;
    pointer-events: none;
    -webkit-appearance: none;
    appearance: none;
  }
  input::-webkit-slider-thumb {
    -webkit-appearance: none;
    pointer-events: auto;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: #fff;
    border: 2px solid ${INK};
    cursor: grab;
  }
  input::-moz-range-thumb {
    pointer-events: auto;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: #fff;
    border: 2px solid ${INK};
    cursor: grab;
  }
  input::-webkit-slider-runnable-track { background: none; }
  input::-moz-range-track { background: none; }
`;

const PriceInputs = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  label {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 4px;
    height: 38px;
    padding: 0 10px;
    border: 1px solid #ddd3c4;
    border-radius: 10px;
    background: #fff;
    font-size: 13px;
  }
  input {
    width: 100%;
    min-width: 0;
    border: none;
    outline: none;
    font: inherit;
    background: none;
    -moz-appearance: textfield;
  }
  input::-webkit-outer-spin-button, input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
  @media (max-width: 767px) { display: none; }
`;

const SearchBox = styled.label`
  display: flex;
  align-items: center;
  gap: 8px;
  height: 36px;
  padding: 0 12px;
  margin-bottom: 8px;
  border-radius: 10px;
  background: #f6f2ec;
  color: ${MUTED};
  input {
    flex: 1;
    min-width: 0;
    border: none;
    outline: none;
    background: none;
    font: inherit;
    font-size: 13px;
    color: ${INK};
  }
`;

const CheckRow = styled.label`
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 36px;
  cursor: pointer;
  font-size: 14px;
  input {
    -webkit-appearance: none;
    appearance: none;
    flex: none;
    width: 20px;
    height: 20px;
    margin: 0;
    border: 1.5px solid #bfb5a6;
    border-radius: 4px;
    background: #fff;
    cursor: pointer;
    display: grid;
    place-items: center;
  }
  input:checked {
    background: ${INK};
    border-color: ${INK};
  }
  input:checked::after {
    content: "";
    width: 5px;
    height: 10px;
    border: solid #fff;
    border-width: 0 2px 2px 0;
    transform: translateY(-1px) rotate(45deg);
  }
  input:focus-visible { outline: 2px solid var(--shop-primary, #ee8a12); outline-offset: 2px; }
  .lbl { flex: 1; min-width: 0; overflow-wrap: anywhere; }
  .cnt { font-size: 12px; color: ${MUTED}; font-variant-numeric: tabular-nums; }
  &[data-empty="true"] { opacity: 0.45; }
`;

const Swatches = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  button {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    border: 0;
    padding: 0;
    cursor: pointer;
  }
  @media (max-width: 767px) {
    button { width: 44px; height: 44px; }
  }
`;

const Pills = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  button {
    min-height: 36px;
    padding: 0 14px;
    border-radius: 999px;
    border: 1px solid #d6ccbd;
    background: #fff;
    font: inherit;
    font-size: 13px;
    color: ${INK};
    cursor: pointer;
  }
  button[aria-pressed="true"] {
    border-color: ${INK};
    background: ${INK};
    color: #fff;
    font-weight: 700;
  }
  @media (max-width: 767px) {
    button { min-height: 40px; padding: 0 16px; font-size: 15px; }
  }
`;

function facetOrder(key, title) {
  const kind = facetDisplayKind(key, title);
  if (BRAND_RE.test(`${key} ${title}`.toLowerCase())) return 0;
  if (kind === "color") return 1;
  if (kind === "size") return 2;
  return 3;
}

function PriceGroup({ bounds, value, onChange }) {
  const t = useTranslations("filterPanel");
  const [lo, hi] = value || [bounds.min, bounds.max];
  const span = Math.max(1, bounds.max - bounds.min);
  const pct = (v) => ((v - bounds.min) / span) * 100;
  const set = (a, b) => {
    const nlo = Math.max(bounds.min, Math.min(a, b));
    const nhi = Math.min(bounds.max, Math.max(a, b));
    onChange(nlo === bounds.min && nhi === bounds.max ? null : [nlo, nhi]);
  };
  return (
    <Group>
      <GroupHead>
        <h3>{t("price")}</h3>
        <span>{lo} € – {hi} €</span>
      </GroupHead>
      <Range>
        <span className="track" />
        <span className="fill" style={{ left: `calc(${pct(lo)}% - 0px)`, width: `${pct(hi) - pct(lo)}%` }} />
        <input type="range" min={bounds.min} max={bounds.max} value={lo} aria-label={t("priceFrom")} onChange={(e) => set(Math.min(Number(e.target.value), hi), hi)} />
        <input type="range" min={bounds.min} max={bounds.max} value={hi} aria-label={t("priceTo")} onChange={(e) => set(lo, Math.max(Number(e.target.value), lo))} />
      </Range>
      <PriceInputs>
        <label>
          <input type="number" inputMode="numeric" min={bounds.min} max={bounds.max} value={lo} aria-label={t("priceFrom")} onChange={(e) => set(Number(e.target.value) || bounds.min, hi)} />€
        </label>
        <span aria-hidden="true">–</span>
        <label>
          <input type="number" inputMode="numeric" min={bounds.min} max={bounds.max} value={hi} aria-label={t("priceTo")} onChange={(e) => set(lo, Number(e.target.value) || bounds.max)} />€
        </label>
      </PriceInputs>
    </Group>
  );
}

function ListGroup({ title, values, selected, counts, label, onToggle, searchable }) {
  const t = useTranslations("filterPanel");
  const [expanded, setExpanded] = useState(false);
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const matching = needle ? values.filter((v) => label(v).toLowerCase().includes(needle)) : values;
  // Selected values always stay visible, even when the list is collapsed.
  const shown = expanded || needle
    ? matching
    : [...new Set([...matching.slice(0, LIST_PREVIEW), ...matching.filter((v) => selected.includes(v))])];
  return (
    <Group>
      <GroupHead><h3>{title}</h3></GroupHead>
      {searchable && values.length > 6 ? (
        <SearchBox>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("searchIn", { name: title })} aria-label={t("searchIn", { name: title })} />
        </SearchBox>
      ) : null}
      {shown.map((v) => {
        const n = counts?.[v];
        return (
          <CheckRow key={v} data-empty={n === 0 && !selected.includes(v) ? "true" : "false"}>
            <input type="checkbox" checked={selected.includes(v)} onChange={() => onToggle(v)} />
            <span className="lbl">{label(v)}</span>
            {n != null ? <span className="cnt">{n}</span> : null}
          </CheckRow>
        );
      })}
      {!needle && matching.length > LIST_PREVIEW ? (
        <LinkBtn type="button" style={{ marginTop: 6 }} onClick={() => setExpanded((x) => !x)}>
          {expanded ? t("showLess") : t("showAll", { count: matching.length })}
        </LinkBtn>
      ) : null}
    </Group>
  );
}

/**
 * @param {object} props
 * @param {Record<string,string[]>} props.facets
 * @param {Record<string,string[]>} props.filters
 * @param {(key:string, val:string) => void} props.onToggle
 * @param {() => void} [props.onReset]
 * @param {(key:string) => string} props.facetTitle
 * @param {(key:string, val:string) => string} props.optionLabel
 * @param {Record<string,Record<string,number>>} [props.counts]
 * @param {{min:number,max:number}|null} [props.priceBounds]
 * @param {[number,number]|null} [props.priceRange]
 * @param {(r:[number,number]|null) => void} [props.onPriceChange]
 * @param {{id:string,label:string,checked:boolean,onChange:(v:boolean)=>void}[]} [props.toggles]
 * @param {{values:string[],selected:string[],counts?:Record<string,number>,onToggle:(v:string)=>void}|null} [props.brands]
 * @param {boolean} [props.showHeader] desktop card header ("Filter" + "Zurücksetzen")
 * @param {React.ReactNode} [props.before] extra group rendered first (e.g. mobile Kategorie row)
 */
export default function StackedFilterPanel({
  facets,
  filters,
  onToggle,
  onReset,
  facetTitle,
  optionLabel,
  counts,
  priceBounds,
  priceRange,
  onPriceChange,
  toggles = [],
  brands = null,
  showHeader = true,
  before = null,
}) {
  const t = useTranslations("filterPanel");
  const ordered = useMemo(
    () =>
      Object.keys(facets || {})
        .map((key) => ({ key, title: facetTitle(key) }))
        .sort((a, b) => facetOrder(a.key, a.title) - facetOrder(b.key, b.title)),
    [facets, facetTitle],
  );
  const hasActive =
    Object.values(filters || {}).some((v) => v?.length) ||
    !!priceRange ||
    toggles.some((x) => x.checked) ||
    !!brands?.selected?.length;
  const showPrice = priceBounds && priceBounds.max > priceBounds.min && onPriceChange;

  return (
    <Wrap>
      {showHeader ? (
        <Head>
          <h2>{t("title")}</h2>
          {hasActive && onReset ? <LinkBtn type="button" onClick={onReset}>{t("reset")}</LinkBtn> : null}
        </Head>
      ) : null}
      {before}
      {showPrice ? <PriceGroup bounds={priceBounds} value={priceRange} onChange={onPriceChange} /> : null}
      {brands?.values?.length ? (
        <ListGroup
          title={t("brand")}
          values={brands.values}
          selected={brands.selected || []}
          counts={brands.counts}
          label={(v) => v}
          onToggle={brands.onToggle}
          searchable
        />
      ) : null}
      {ordered.map(({ key, title }) => {
        const values = facets[key] || [];
        const selected = filters?.[key] || [];
        const kind = facetDisplayKind(key, title);
        const label = (v) => optionLabel(key, v);
        if (kind === "color") {
          return (
            <Group key={key}>
              <GroupHead><h3>{title}</h3></GroupHead>
              <Swatches>
                {values.map((v) => {
                  const on = selected.includes(v);
                  return (
                    <button
                      key={v}
                      type="button"
                      title={label(v)}
                      aria-label={label(v)}
                      aria-pressed={on}
                      onClick={() => onToggle(key, v)}
                      style={{ background: colorSwatchFallback(v), boxShadow: on ? `0 0 0 2px #fff, 0 0 0 4px ${INK}` : "inset 0 0 0 1px #cfc6b8" }}
                    />
                  );
                })}
              </Swatches>
            </Group>
          );
        }
        if (kind === "size") {
          return (
            <Group key={key}>
              <GroupHead><h3>{title}</h3></GroupHead>
              <Pills>
                {values.map((v) => (
                  <button key={v} type="button" aria-pressed={selected.includes(v)} onClick={() => onToggle(key, v)}>
                    {label(v)}
                  </button>
                ))}
              </Pills>
            </Group>
          );
        }
        return (
          <ListGroup
            key={key}
            title={title}
            values={values}
            selected={selected}
            counts={counts?.[key]}
            label={label}
            onToggle={(v) => onToggle(key, v)}
            searchable={BRAND_RE.test(`${key} ${title}`.toLowerCase())}
          />
        );
      })}
      {toggles.length > 0 ? (
        <Group>
          {toggles.map((tg) => (
            <CheckRow key={tg.id}>
              <input type="checkbox" checked={tg.checked} onChange={(e) => tg.onChange(e.target.checked)} />
              <span className="lbl">{tg.label}</span>
            </CheckRow>
          ))}
        </Group>
      ) : null}
    </Wrap>
  );
}

/* ─── Mobile / drawer chrome (MobileFilter artboard) ───────────────────── */

const SheetHeadWrap = styled.div`
  position: relative;
  flex: 1;
  width: 100%;
  box-sizing: border-box;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 22px 20px 14px;
  &::before {
    content: "";
    position: absolute;
    top: 8px;
    left: 50%;
    width: 40px;
    height: 4px;
    margin-left: -20px;
    border-radius: 2px;
    background: #ddd3c4;
  }
  h2 {
    flex: 1;
    margin: 0;
    font-family: var(--h2-ff, inherit);
    font-size: 22px;
    font-weight: 800;
    letter-spacing: -0.01em;
    color: ${INK};
  }
  .close {
    flex: none;
    width: 44px;
    height: 44px;
    border: none;
    border-radius: 50%;
    background: #f6f2ec;
    color: ${INK};
    display: grid;
    place-items: center;
    cursor: pointer;
  }
  @media (min-width: 768px) {
    &::before { display: none; }
  }
`;

export function FilterSheetHeader({ title, onReset, showReset, onClose, closeLabel }) {
  const t = useTranslations("filterPanel");
  return (
    <SheetHeadWrap>
      <h2>{title || t("title")}</h2>
      {showReset && onReset ? <LinkBtn type="button" onClick={onReset} style={{ fontSize: 15 }}>{t("reset")}</LinkBtn> : null}
      <button type="button" className="close" onClick={onClose} aria-label={closeLabel || "Close"}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
      </button>
    </SheetHeadWrap>
  );
}

export const FilterSheetScroll = styled.div`
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
  padding: 0 20px 12px;
`;

const SheetFootWrap = styled.div`
  flex-shrink: 0;
  padding: 12px 20px calc(16px + env(safe-area-inset-bottom, 0px));
  border-top: 1px solid ${LINE};
  background: #fff;
  button {
    width: 100%;
    height: 54px;
    border: none;
    border-radius: 999px;
    background: var(--shop-primary, #ee8a12);
    color: ${INK};
    font: inherit;
    font-size: 16px;
    font-weight: 800;
    cursor: pointer;
  }
  button:hover { filter: brightness(0.96); }
`;

export function FilterSheetFooter({ count, onClick }) {
  const t = useTranslations("filterPanel");
  return (
    <SheetFootWrap>
      <button type="button" onClick={onClick}>{t("showProducts", { count })}</button>
    </SheetFootWrap>
  );
}

const CatGroupBtn = styled.button`
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 0;
  border: none;
  background: none;
  font: inherit;
  color: ${INK};
  cursor: pointer;
  h3 { margin: 0; font-size: 15px; font-weight: 700; font-family: inherit; }
  span { font-size: 14px; color: #5e574e; }
`;

const CatList = styled.div`
  display: flex;
  flex-direction: column;
  margin-top: 10px;
  a, button {
    padding: 9px 0;
    font-size: 14px;
    color: ${INK};
    text-decoration: none;
    border: none;
    background: none;
    font-family: inherit;
    text-align: left;
    cursor: pointer;
  }
  a[data-muted="true"] { color: #5e574e; }
  a[aria-current="page"], button[aria-pressed="true"] { font-weight: 700; color: ${ACCENT}; }
`;

/**
 * Collapsible "Kategorie  Bettwäsche ›" row; `children` are the links (rendered by the page so it
 * can keep its own navigation side effects).
 */
export function FilterSheetCategoryGroup({ current, children }) {
  const t = useTranslations("filterPanel");
  const [open, setOpen] = useState(false);
  return (
    <Group>
      <CatGroupBtn type="button" aria-expanded={open} onClick={() => setOpen((x) => !x)}>
        <h3>{t("category")}</h3>
        <span>{current} {open ? "⌄" : "›"}</span>
      </CatGroupBtn>
      {open ? <CatList>{children}</CatList> : null}
    </Group>
  );
}

/**
 * Price / brand / stock / deals state on top of a page's facet filters, so every catalog-like
 * template gets the same StackedFilterPanel without duplicating the wiring.
 * `base` = products before facet filtering. Returns the fully filtered list plus panel props.
 */
export function useCatalogExtraFilters({ base, facets, filters, setFilters, toggle, setPage, facetTitle, optionLabel, isDeal = null, resetKey = "" }) {
  const t = useTranslations("filterPanel");
  const [priceRange, setPriceRange] = useState(null);
  const [inStockOnly, setInStockOnly] = useState(false);
  const [dealsOnly, setDealsOnly] = useState(false);
  const [brandSel, setBrandSel] = useState([]);

  useEffect(() => {
    setPriceRange(null);
    setInStockOnly(false);
    setDealsOnly(false);
    setBrandSel([]);
  }, [resetKey]);

  const page1 = () => { if (setPage) setPage(1); };
  let pre = base || [];
  if (dealsOnly && isDeal) pre = pre.filter((p) => isDeal(p));
  if (inStockOnly) pre = pre.filter((p) => productIsInStock(p));
  pre = filterByPriceRange(pre, priceRange);
  const counts = facetValueCounts(filterByBrands(pre, brandSel), facets, filters);
  const brandList = brandValues(base);
  const brandCountMap = brandCounts(filterProductsByFacets(pre, filters), brandList);
  const filtered = filterProductsByFacets(filterByBrands(pre, brandSel), filters);

  const toggleBrand = (b) => { setBrandSel((cur) => (cur.includes(b) ? cur.filter((x) => x !== b) : [...cur, b])); page1(); };
  const resetAll = () => { setFilters({}); setPriceRange(null); setInStockOnly(false); setDealsOnly(false); setBrandSel([]); page1(); };
  const extraActive = (priceRange ? 1 : 0) + (inStockOnly ? 1 : 0) + (dealsOnly ? 1 : 0) + brandSel.length;

  const extraChips = [
    ...brandSel.map((b) => ({ key: `brand:${b}`, label: b, onRemove: () => toggleBrand(b) })),
    ...(priceRange ? [{ key: "price", label: `${priceRange[0]}–${priceRange[1]} €`, onRemove: () => { setPriceRange(null); page1(); } }] : []),
    ...(inStockOnly ? [{ key: "stock", label: t("inStock"), onRemove: () => setInStockOnly(false) }] : []),
    ...(dealsOnly ? [{ key: "deals", label: t("onSale"), onRemove: () => setDealsOnly(false) }] : []),
  ];

  const panelProps = {
    facets,
    filters,
    onToggle: toggle,
    onReset: resetAll,
    facetTitle,
    optionLabel,
    counts,
    brands: { values: brandList, selected: brandSel, counts: brandCountMap, onToggle: toggleBrand },
    priceBounds: priceBoundsEuro(base),
    priceRange,
    onPriceChange: (r) => { setPriceRange(r); page1(); },
    toggles: [
      { id: "stock", label: t("inStock"), checked: inStockOnly, onChange: (v) => { setInStockOnly(v); page1(); } },
      ...(isDeal ? [{ id: "deals", label: t("onSale"), checked: dealsOnly, onChange: (v) => { setDealsOnly(v); page1(); } }] : []),
    ],
  };

  return { filtered, panelProps, extraActive, resetAll, extraChips };
}
