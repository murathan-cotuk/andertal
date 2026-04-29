"use client";

import React, { useState, useRef, useEffect, useCallback, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { Link, useRouter } from "@/i18n/navigation";
import { useLocale } from "next-intl";
import { storefrontProductHandle } from "@/lib/product-url-handle";
import { resolveImageUrl } from "@/lib/image-url";
import { liteClient as algoliasearch } from "algoliasearch/lite";
import { InstantSearch, useSearchBox, useHits, useInstantSearch, Configure } from "react-instantsearch";
import styled from "styled-components";
import { getMedusaClient } from "@/lib/medusa-client";
import { stripHtmlForSearch, getLocalizedProduct } from "@/lib/format";
import { tokens } from "@/design-system/tokens";

const Wrap = styled.div`
  position: relative;
  width: 100%;
  ${(p) => p.$pill && `height: 100%; display: flex; align-items: center;`}
`;

const InputWrap = styled.div`
  position: relative;
  flex: 1;
  min-width: 0;
  ${(p) => p.$pill && `height: 100%; display: flex; align-items: center;`}
`;

const SearchIcon = styled.span`
  position: absolute;
  left: 16px;
  top: 50%;
  transform: translateY(-50%);
  color: ${tokens.dark[500]};
  pointer-events: none;
`;

const Input = styled.input`
  width: 100%;
  padding: 12px 16px 12px 48px;
  border: 1px solid ${tokens.border.light};
  border-radius: ${tokens.radius.input};
  font-size: ${tokens.fontSize.body};
  font-family: ${tokens.fontFamily.sans};
  transition: border-color ${tokens.transition.base}, box-shadow ${tokens.transition.base};

  &:focus {
    outline: none;
    border-color: ${tokens.primary.DEFAULT};
    box-shadow: 0 0 0 2px ${tokens.primary.light};
  }
  ${(p) => p.$pill && `
    padding: 0 16px 0 0;
    height: 100%;
    min-height: 36px;
    border-radius: 0;
    border: none;
    background: transparent;
    font-size: 15px;
    font-family: inherit;
    color: #111;
    letter-spacing: 0.01em;
    transition: opacity 0.2s;
    &:focus {
      outline: none;
      box-shadow: none;
    }
    &::placeholder {
      font-size: 14px;
      font-weight: 400;
      color: #9ca3af;
      letter-spacing: 0.02em;
    }
  `}
`;

const Dropdown = styled.div`
  position: absolute;
  top: calc(100% + ${tokens.spacing.sm});
  left: 0;
  right: 0;
  background: ${tokens.background.card};
  border: 1px solid ${tokens.border.light};
  border-radius: ${tokens.radius.button};
  box-shadow: ${tokens.shadow.card};
  max-height: ${(p) => p.$maxHeight || tokens.search.dropdownMaxHeight};
  overflow-y: auto;
  z-index: 1000;
`;

const HitLink = styled(Link)`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  color: ${tokens.dark[700]};
  text-decoration: none;
  transition: background ${tokens.transition.base}, color ${tokens.transition.base};
  border-bottom: 1px solid ${tokens.border.light};

  &:hover {
    background: ${tokens.background.soft};
    color: ${tokens.primary.DEFAULT};
  }

  &:last-child {
    border-bottom: none;
  }
`;

const MobileSectionTitle = styled.div`
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #6b7280;
  padding: 16px 16px 8px;
`;

const WeiterScroll = styled.div`
  display: flex;
  gap: 8px;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  scroll-snap-type: x mandatory;
  padding: 0 12px 16px;
`;

const WeiterCard = styled(Link)`
  flex: 0 0 calc(50% - 4px);
  min-width: calc(50% - 4px);
  max-width: calc(50% - 4px);
  scroll-snap-align: start;
  text-decoration: none;
  color: #111827;
`;

const WeiterImg = styled.div`
  width: 100%;
  aspect-ratio: 1;
  border-radius: 10px;
  overflow: hidden;
  background: #f3f4f6;
  margin-bottom: 6px;
  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
`;

const WeiterTitle = styled.div`
  font-size: 12px;
  font-weight: 600;
  line-height: 1.3;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
`;

const SuggestionChip = styled.button`
  display: inline-flex;
  align-items: center;
  padding: 8px 12px;
  margin: 4px 4px 4px 0;
  font-size: 13px;
  color: #111;
  background: #f3f4f6;
  border: none;
  border-radius: 9999px;
  cursor: pointer;
  font-family: ${tokens.fontFamily.sans};
  &:active {
    background: #e5e7eb;
  }
`;

const HitImage = styled.img`
  width: 40px;
  height: 40px;
  object-fit: cover;
  border-radius: 6px;
  flex-shrink: 0;
`;

const HitText = styled.div`
  flex: 1;
  min-width: 0;
`;

const Primary = styled.div`
  font-weight: 600;
  font-size: ${tokens.fontSize.small};
  font-family: ${tokens.fontFamily.sans};
`;

const Secondary = styled.div`
  font-size: ${tokens.fontSize.micro};
  color: ${tokens.dark[500]};
  margin-top: 2px;
  font-family: ${tokens.fontFamily.sans};
`;

const Tertiary = styled.div`
  font-size: 11px;
  color: ${tokens.dark[500]};
  margin-top: 2px;
  font-family: ${tokens.fontFamily.sans};
`;

const Empty = styled.div`
  padding: 24px 16px;
  color: ${tokens.dark[500]};
  font-size: ${tokens.fontSize.small};
  font-family: ${tokens.fontFamily.sans};
  text-align: center;
`;

const DEBOUNCE_MS = 120;
const MAX_HITS = 8;
const RECENT_SEARCHES_KEY = "andertal-recent-searches";
const MAX_RECENT = 10;
const MOBILE_MQ = "(max-width: 767px)";

function useMatchMediaOnce(query) {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia(query);
    const fn = () => setMatches(mq.matches);
    fn();
    mq.addEventListener("change", fn);
    return () => mq.removeEventListener("change", fn);
  }, [query]);
  return matches;
}

function loadRecentSearches() {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(RECENT_SEARCHES_KEY);
    const a = raw ? JSON.parse(raw) : [];
    return Array.isArray(a) ? a.filter((s) => typeof s === "string" && s.trim()).slice(0, MAX_RECENT) : [];
  } catch {
    return [];
  }
}

function saveRecentSearch(term) {
  const t = String(term || "").trim();
  if (t.length < 2) return;
  if (typeof window === "undefined") return;
  try {
    const prev = loadRecentSearches().filter((s) => s.toLowerCase() !== t.toLowerCase());
    const next = [t, ...prev].slice(0, MAX_RECENT);
    window.localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(next));
  } catch { /* ignore */ }
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function HighlightText({ text = "", query = "" }) {
  if (!query.trim()) return <>{text}</>;
  const re = new RegExp(`(${escapeRegex(query.trim())})`, "gi");
  const parts = String(text).split(re);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? <strong key={i}>{part}</strong> : <span key={i}>{part}</span>
      )}
    </>
  );
}

function formatPriceCents(cents) {
  if (cents == null) return "";
  const v = Number(cents) / 100;
  return v.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
}

function SearchBarFallback({ placeholder = "Search...", maxHeight = "400px", hideSearchIcon = false, pill = false }) {
  const router = useRouter();
  const locale = useLocale();
  const isMobile = useMatchMediaOnce(MOBILE_MQ);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState([]);
  const [fallbackHits, setFallbackHits] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [recProducts, setRecProducts] = useState([]);
  const [recentSearches, setRecentSearches] = useState([]);
  const [mounted, setMounted] = useState(false);
  const wrapRef = useRef(null);
  const mobileInputRef = useRef(null);
  const debounceRef = useRef(null);

  const fetchProducts = useCallback(async (query) => {
    if (!(query && query.trim().length >= 1)) {
      setHits([]);
      setFallbackHits([]);
      setOpen(!!(query && query.trim()));
      return;
    }
    setLoading(true);
    try {
      const client = getMedusaClient();
      const { products = [] } = await client.getProducts({ q: query.trim(), limit: MAX_HITS });
      setHits(products);
      if (!products.length) {
        const { products: fb = [] } = await client.getProducts({ limit: MAX_HITS });
        setFallbackHits(fb || []);
      } else {
        setFallbackHits([]);
      }
      setOpen(true);
    } catch (_) {
      setHits([]);
      try {
        const client = getMedusaClient();
        const { products: fb = [] } = await client.getProducts({ limit: MAX_HITS });
        setFallbackHits(fb || []);
      } catch {
        setFallbackHits([]);
      }
      setOpen(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setMounted(true);
  }, []);

  useLayoutEffect(() => {
    if (!isMobile || !mobileOpen) return;
    const t = requestAnimationFrame(() => mobileInputRef.current?.focus());
    return () => cancelAnimationFrame(t);
  }, [isMobile, mobileOpen]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const query = (q || "").trim();
    if (!query) {
      setHits([]);
      setFallbackHits([]);
      setOpen(false);
      return;
    }
    debounceRef.current = setTimeout(() => fetchProducts(q), DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [q, fetchProducts]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!isMobile || !mobileOpen) return;
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setMobileOpen(false);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isMobile, mobileOpen]);

  useEffect(() => {
    if (!isMobile || !mobileOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [isMobile, mobileOpen]);

  useEffect(() => {
    if (!isMobile || !mobileOpen) return;
    setRecentSearches(loadRecentSearches());
    let cancelled = false;
    fetch("/api/store-products?limit=8")
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setRecProducts(d?.products || []); })
      .catch(() => { if (!cancelled) setRecProducts([]); });
    return () => { cancelled = true; };
  }, [isMobile, mobileOpen]);

  const handleSubmit = (e) => {
    e.preventDefault();
    const query = (q || "").trim();
    if (query) router.push(`/search?q=${encodeURIComponent(query)}`);
  };

  const goSearchResults = (term) => {
    const t = String(term || "").trim();
    if (t) saveRecentSearch(t);
    setMobileOpen(false);
    setQ("");
    if (t) router.push(`/search?q=${encodeURIComponent(t)}`);
    else router.push("/search");
  };

  const showDropdown = open && (q || "").trim().length >= 1;

  const productHitList = (onPick) =>
    hits.map((product, i) => {
      const { title: hitTitle, description: hitDesc } = getLocalizedProduct(product, locale);
      const priceCents = product.variants?.[0]?.prices?.[0]?.amount ?? product.metadata?.price_cents ?? null;
      const pathHandle = storefrontProductHandle(product, locale);
      return (
        <HitLink
          key={product.id || product.handle || i}
          href={pathHandle ? `/produkt/${pathHandle}` : "#"}
          onClick={onPick}
        >
          {product.thumbnail && <HitImage src={product.thumbnail} alt="" />}
          <HitText>
            <Primary><HighlightText text={hitTitle || "(No title)"} query={q.trim()} /></Primary>
            {hitDesc && <Secondary>{stripHtmlForSearch(hitDesc, 100)}</Secondary>}
            {priceCents != null && <Tertiary>{formatPriceCents(priceCents)}</Tertiary>}
          </HitText>
        </HitLink>
      );
    });

  if (isMobile) {
    const mobilePanel = mobileOpen && mounted ? createPortal(
      <div
        style={{
          position: "fixed", inset: 0, zIndex: 2147483660, background: "#fff",
          display: "flex", flexDirection: "column",
          paddingTop: "env(safe-area-inset-top, 0px)",
        }}
        role="dialog"
        aria-modal="true"
        aria-label="Suche"
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderBottom: "1px solid #e5e7eb", flexShrink: 0 }}>
          <button type="button" onClick={() => setMobileOpen(false)} aria-label="Zurück" style={{ border: "none", background: "#f3f4f6", borderRadius: 10, width: 40, height: 40, fontSize: 20, cursor: "pointer", lineHeight: 1 }}>←</button>
          <input
            ref={mobileInputRef}
            type="search"
            autoComplete="off"
            placeholder={placeholder}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); goSearchResults(q); } }}
            style={{ flex: 1, minWidth: 0, fontSize: 16, padding: "10px 14px", border: "1px solid #e5e7eb", borderRadius: 12, outline: "none" }}
          />
        </div>
        <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
          {!q.trim() ? (
            <>
              {recProducts.length > 0 && (
                <>
                  <MobileSectionTitle>Weiter einkaufen</MobileSectionTitle>
                  <WeiterScroll>
                    {recProducts.map((p) => {
                      const { title: pt } = getLocalizedProduct(p, locale);
                      const h = storefrontProductHandle(p, locale);
                      const th = p.thumbnail ? resolveImageUrl(p.thumbnail) : "";
                      return (
                        <WeiterCard key={p.id} href={h ? `/produkt/${h}` : "#"} onClick={() => { setMobileOpen(false); setQ(""); }}>
                          <WeiterImg>{th ? <img src={th} alt="" /> : null}</WeiterImg>
                          <WeiterTitle>{pt || p.title || ""}</WeiterTitle>
                        </WeiterCard>
                      );
                    })}
                  </WeiterScroll>
                </>
              )}
              <MobileSectionTitle>Letzte Suchen</MobileSectionTitle>
              {recentSearches.length === 0 ? (
                <div style={{ padding: "0 16px 24px", color: "#9ca3af", fontSize: 14 }}>Noch keine Suchbegriffe</div>
              ) : (
                <div style={{ padding: "0 16px 16px" }}>
                  {recentSearches.map((term) => (
                    <button type="button" key={term} onClick={() => { setQ(term); goSearchResults(term); }} style={{ display: "block", width: "100%", textAlign: "left", padding: "12px 0", border: "none", borderBottom: "1px solid #f3f4f6", background: "none", fontSize: 15, color: "#111", cursor: "pointer", fontFamily: "inherit" }}>{term}</button>
                  ))}
                </div>
              )}
            </>
          ) : (
            <>
              {loading && hits.length === 0 && <div style={{ marginTop: 16 }}><Empty>Suche…</Empty></div>}
              {!loading && hits.length === 0 && fallbackHits.length === 0 && <Empty>Keine direkten Treffer — wir zeigen trotzdem Produkte.</Empty>}
              {hits.length > 0 && <div style={{ padding: "8px 0" }}>{productHitList(() => { saveRecentSearch(q); setMobileOpen(false); setQ(""); })}</div>}
              {!loading && hits.length === 0 && fallbackHits.length > 0 && (
                <div style={{ padding: "8px 0" }}>
                  {fallbackHits.map((product, i) => {
                    const { title: hitTitle, description: hitDesc } = getLocalizedProduct(product, locale);
                    const priceCents = product.variants?.[0]?.prices?.[0]?.amount ?? product.metadata?.price_cents ?? null;
                    const pathHandle = storefrontProductHandle(product, locale);
                    return (
                      <HitLink
                        key={product.id || product.handle || i}
                        href={pathHandle ? `/produkt/${pathHandle}` : "#"}
                        onClick={() => { saveRecentSearch(q); setMobileOpen(false); setQ(""); }}
                      >
                        {product.thumbnail && <HitImage src={product.thumbnail} alt="" />}
                        <HitText>
                          <Primary>{hitTitle || "(No title)"}</Primary>
                          {hitDesc && <Secondary>{stripHtmlForSearch(hitDesc, 100)}</Secondary>}
                          {priceCents != null && <Tertiary>{formatPriceCents(priceCents)}</Tertiary>}
                        </HitText>
                      </HitLink>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </div>,
      document.body,
    ) : null;

    return (
      <>
        <div
          style={{ minHeight: pill ? 36 : undefined, width: "100%", display: "flex", alignItems: "center", cursor: "text", padding: pill ? "0" : undefined, color: q ? "#111" : "#9ca3af", fontSize: 15 }}
          onClick={() => { setRecentSearches(loadRecentSearches()); setMobileOpen(true); }}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setMobileOpen(true); } }}
          role="button"
          tabIndex={0}
          aria-label="Suche öffnen"
        >
          {q || placeholder}
        </div>
        {mobilePanel}
      </>
    );
  }

  return (
    <Wrap ref={wrapRef} as="form" onSubmit={handleSubmit}>
      <InputWrap>
        {!hideSearchIcon && <SearchIcon aria-hidden>🔍</SearchIcon>}
        <Input
          type="search"
          placeholder={placeholder}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Suche"
          aria-expanded={showDropdown}
          $pill={pill}
        />
      </InputWrap>
      {showDropdown && (
        <Dropdown $maxHeight={maxHeight} role="listbox">
          {loading && hits.length === 0 && <Empty>Suche...</Empty>}
          {!loading && hits.length === 0 && fallbackHits.length === 0 && <Empty>Keine direkten Treffer — wir zeigen trotzdem Produkte.</Empty>}
          {productHitList(() => setOpen(false))}
          {!loading && hits.length === 0 && fallbackHits.length > 0 &&
            fallbackHits.map((product, i) => {
              const { title: hitTitle, description: hitDesc } = getLocalizedProduct(product, locale);
              const priceCents = product.variants?.[0]?.prices?.[0]?.amount ?? product.metadata?.price_cents ?? null;
              const pathHandle = storefrontProductHandle(product, locale);
              return (
                <HitLink
                  key={product.id || product.handle || `fb-${i}`}
                  href={pathHandle ? `/produkt/${pathHandle}` : "#"}
                  onClick={() => setOpen(false)}
                >
                  {product.thumbnail && <HitImage src={product.thumbnail} alt="" />}
                  <HitText>
                    <Primary>{hitTitle || "(No title)"}</Primary>
                    {hitDesc && <Secondary>{stripHtmlForSearch(hitDesc, 120)}</Secondary>}
                    {priceCents != null && <Tertiary>{formatPriceCents(priceCents)}</Tertiary>}
                  </HitText>
                </HitLink>
              );
            })}
        </Dropdown>
      )}
    </Wrap>
  );
}

function getByPath(obj, path) {
  if (!path || !obj) return undefined;
  return path.split(".").reduce((o, k) => (o && o[k] !== undefined ? o[k] : undefined), obj);
}

function SearchInputWithDropdown({
  placeholder = "Search...",
  hitsPerPage = 5,
  attributes = {},
  maxHeight = "300px",
  className,
  hideSearchIcon,
  pill,
}) {
  const isMobile = useMatchMediaOnce(MOBILE_MQ);
  const router = useRouter();
  const locale = useLocale();
  const { query, refine } = useSearchBox();
  const { hits } = useHits();
  const { status } = useInstantSearch();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [recProducts, setRecProducts] = useState([]);
  const [recentSearches, setRecentSearches] = useState([]);
  const [mounted, setMounted] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const wrapRef = useRef(null);
  const mobileInputRef = useRef(null);

  const showDropdown = query.length > 0;
  const loading = status === "loading" || status === "stalled";
  const primaryKey = attributes.primaryText || "title";
  const secondaryKey = attributes.secondaryText;
  const tertiaryKey = attributes.tertiaryText;
  const urlKey = attributes.url || "url";
  const imageKey = attributes.image;

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setFocusedIndex(-1);
  }, [query, hits.length]);

  useLayoutEffect(() => {
    if (!isMobile || !mobileOpen) return;
    const t = requestAnimationFrame(() => mobileInputRef.current?.focus());
    return () => cancelAnimationFrame(t);
  }, [isMobile, mobileOpen]);

  useEffect(() => {
    if (!isMobile || !mobileOpen) return;
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setMobileOpen(false);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isMobile, mobileOpen]);

  useEffect(() => {
    if (!isMobile || !mobileOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isMobile, mobileOpen]);

  useEffect(() => {
    if (!isMobile || !mobileOpen) return;
    setRecentSearches(loadRecentSearches());
    let cancelled = false;
    fetch("/api/store-products?limit=8")
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setRecProducts(d?.products || []);
      })
      .catch(() => { if (!cancelled) setRecProducts([]); });
    return () => { cancelled = true; };
  }, [isMobile, mobileOpen]);

  const goSearchResults = (q) => {
    const t = String(q || "").trim();
    if (t) saveRecentSearch(t);
    setMobileOpen(false);
    refine("");
    if (t) router.push(`/search?q=${encodeURIComponent(t)}`);
    else router.push("/search");
  };

  const openMobileSearch = () => {
    setRecentSearches(loadRecentSearches());
    setMobileOpen(true);
  };

  const handleKeyDown = (e) => {
    if (!showDropdown || hits.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setFocusedIndex((i) => (i < hits.length - 1 ? i + 1 : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setFocusedIndex((i) => (i > 0 ? i - 1 : hits.length - 1));
    } else if (e.key === "Enter" && focusedIndex >= 0 && hits[focusedIndex]) {
      e.preventDefault();
      const hit = hits[focusedIndex];
      const urlPath = getByPath(hit, attributes.url || "url");
      if (urlPath) window.location.href = typeof urlPath === "string" ? (urlPath.startsWith("/") ? urlPath : `/produkt/${urlPath}`) : "#";
    }
  };

  const brandChips = query.trim()
    ? [...new Set(hits.map((h) => getByPath(h, tertiaryKey)).filter(Boolean).map(String))].slice(0, 8)
    : [];

  const configHits = isMobile && mobileOpen ? 20 : hitsPerPage;

  if (isMobile) {
    const mobilePanel = mobileOpen && mounted ? createPortal(
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 2147483660,
          background: "#fff",
          display: "flex",
          flexDirection: "column",
          paddingTop: "env(safe-area-inset-top, 0px)",
        }}
        role="dialog"
        aria-modal="true"
        aria-label="Suche"
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 12px",
            borderBottom: "1px solid #e5e7eb",
            flexShrink: 0,
          }}
        >
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            aria-label="Zurück"
            style={{
              border: "none",
              background: "#f3f4f6",
              borderRadius: 10,
              width: 40,
              height: 40,
              fontSize: 20,
              cursor: "pointer",
              lineHeight: 1,
            }}
          >
            ←
          </button>
          <input
            ref={mobileInputRef}
            type="search"
            autoComplete="off"
            placeholder={placeholder}
            value={query}
            onChange={(e) => refine(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                goSearchResults(query);
              }
            }}
            style={{
              flex: 1,
              minWidth: 0,
              fontSize: 16,
              padding: "10px 14px",
              border: "1px solid #e5e7eb",
              borderRadius: 12,
              outline: "none",
            }}
          />
        </div>
        <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
          {!query.trim() ? (
            <>
              {recProducts.length > 0 && (
                <>
                  <MobileSectionTitle>Weiter einkaufen</MobileSectionTitle>
                  <WeiterScroll>
                    {recProducts.map((p) => {
                      const { title: pt } = getLocalizedProduct(p, locale);
                      const h = storefrontProductHandle(p, locale);
                      const th = p.thumbnail ? resolveImageUrl(p.thumbnail) : "";
                      return (
                        <WeiterCard
                          key={p.id}
                          href={h ? `/produkt/${h}` : "#"}
                          onClick={() => {
                            setMobileOpen(false);
                            refine("");
                          }}
                        >
                          <WeiterImg>{th ? <img src={th} alt="" /> : null}</WeiterImg>
                          <WeiterTitle>{pt || p.title || p.handle || ""}</WeiterTitle>
                        </WeiterCard>
                      );
                    })}
                  </WeiterScroll>
                </>
              )}
              <MobileSectionTitle>Letzte Suchen</MobileSectionTitle>
              {recentSearches.length === 0 ? (
                <div style={{ padding: "0 16px 24px", color: "#9ca3af", fontSize: 14 }}>Noch keine Suchbegriffe</div>
              ) : (
                <div style={{ padding: "0 16px 16px" }}>
                  {recentSearches.map((term) => (
                    <button
                      type="button"
                      key={term}
                      onClick={() => {
                        refine(term);
                        goSearchResults(term);
                      }}
                      style={{
                        display: "block",
                        width: "100%",
                        textAlign: "left",
                        padding: "12px 0",
                        border: "none",
                        borderBottom: "1px solid #f3f4f6",
                        background: "none",
                        fontSize: 15,
                        color: "#111",
                        cursor: "pointer",
                        fontFamily: "inherit",
                      }}
                    >
                      {term}
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : (
            <>
              {loading && hits.length === 0 && (
                <div style={{ marginTop: 16 }}>
                  <Empty>Suche…</Empty>
                </div>
              )}
              {!loading && hits.length === 0 && <Empty>Keine Ergebnisse für &quot;{query}&quot;</Empty>}
              {hits.length > 0 && (
                <div style={{ padding: "8px 0" }} role="listbox">
                  {hits.map((hit, i) => {
                    const url = getByPath(hit, urlKey);
                    const link = url && (String(url).startsWith("/") ? url : `/produkt/${url}`);
                    return (
                      <HitLink
                        key={hit.objectID || i}
                        href={link || "#"}
                        onClick={() => {
                          saveRecentSearch(query);
                          setMobileOpen(false);
                          refine("");
                        }}
                        role="option"
                      >
                        {imageKey && getByPath(hit, imageKey) && (
                          <HitImage src={getByPath(hit, imageKey)} alt="" />
                        )}
                        <HitText>
                          <Primary>{getByPath(hit, primaryKey) || "(No title)"}</Primary>
                          {secondaryKey && getByPath(hit, secondaryKey) && (
                            <Secondary>{stripHtmlForSearch(String(getByPath(hit, secondaryKey)), 100)}</Secondary>
                          )}
                        </HitText>
                      </HitLink>
                    );
                  })}
                </div>
              )}
              {brandChips.length > 0 && (
                <>
                  <MobileSectionTitle>Vorschläge</MobileSectionTitle>
                  <div style={{ padding: "0 12px 24px" }}>
                    {brandChips.map((b) => (
                      <SuggestionChip
                        key={b}
                        type="button"
                        onClick={() => {
                          refine(b);
                          goSearchResults(b);
                        }}
                      >
                        {b}
                      </SuggestionChip>
                    ))}
                  </div>
                </>
              )}
              {recentSearches.filter((r) => r.toLowerCase().includes(query.toLowerCase()) && r !== query).length > 0 && (
                <>
                  <MobileSectionTitle>Frühere Suchen</MobileSectionTitle>
                  <div style={{ padding: "0 12px 24px" }}>
                    {recentSearches
                      .filter((r) => r.toLowerCase().includes(query.toLowerCase()) && r.toLowerCase() !== query.toLowerCase())
                      .map((term) => (
                        <button
                          type="button"
                          key={term}
                          onClick={() => {
                            refine(term);
                            goSearchResults(term);
                          }}
                          style={{
                            display: "block",
                            width: "100%",
                            textAlign: "left",
                            padding: "10px 4px",
                            border: "none",
                            background: "none",
                            fontSize: 14,
                            color: tokens.primary.DEFAULT,
                            cursor: "pointer",
                            fontFamily: "inherit",
                            textDecoration: "underline",
                          }}
                        >
                          {term}
                        </button>
                      ))}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>,
      document.body,
    ) : null;

    return (
      <>
        <Configure hitsPerPage={configHits} />
        <div
          style={{
            minHeight: pill ? 36 : undefined,
            width: "100%",
            display: "flex",
            alignItems: "center",
            cursor: "text",
            padding: pill ? "0" : undefined,
            color: query ? "#111" : "#9ca3af",
            fontSize: 15,
          }}
          onClick={openMobileSearch}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              openMobileSearch();
            }
          }}
          role="button"
          tabIndex={0}
          aria-label="Suche öffnen"
        >
          {query || placeholder}
        </div>
        {mobilePanel}
      </>
    );
  }

  return (
    <Wrap className={className} ref={wrapRef} onKeyDown={handleKeyDown} $pill={pill}>
      <Configure hitsPerPage={configHits} />
      <InputWrap $pill={pill}>
        {!hideSearchIcon && <SearchIcon aria-hidden>🔍</SearchIcon>}
        <Input
          type="search"
          autoComplete="off"
          placeholder={placeholder}
          value={query}
          onChange={(e) => refine(e.target.value)}
          onKeyDown={handleKeyDown}
          aria-expanded={showDropdown}
          aria-controls="search-hits"
          $pill={pill}
        />
      </InputWrap>
      {showDropdown && (
        <Dropdown id="search-hits" $maxHeight={maxHeight} role="listbox">
          {loading && hits.length === 0 && <Empty>Searching...</Empty>}
          {!loading && hits.length === 0 && <Empty>No results for &quot;{query}&quot;</Empty>}
          {hits.map((hit, i) => {
            const url = getByPath(hit, urlKey);
            const link = url && (String(url).startsWith("/") ? url : `/produkt/${url}`);
            return (
              <HitLink
                key={hit.objectID || i}
                href={link || "#"}
                role="option"
                aria-selected={focusedIndex === i}
                onClick={() => refine("")}
              >
                {imageKey && getByPath(hit, imageKey) && (
                  <HitImage src={getByPath(hit, imageKey)} alt="" />
                )}
                <HitText>
                  <Primary>{getByPath(hit, primaryKey) || "(No title)"}</Primary>
                  {secondaryKey && getByPath(hit, secondaryKey) && (
                    <Secondary>{stripHtmlForSearch(String(getByPath(hit, secondaryKey)), 120)}</Secondary>
                  )}
                  {tertiaryKey && getByPath(hit, tertiaryKey) && (
                    <Tertiary>{getByPath(hit, tertiaryKey)}</Tertiary>
                  )}
                </HitText>
              </HitLink>
            );
          })}
        </Dropdown>
      )}
    </Wrap>
  );
}

export default function DropdownSearch({
  applicationId,
  apiKey,
  indexName,
  placeholder = "Search...",
  hitsPerPage = 5,
  attributes = {},
  className,
  maxHeight = "300px",
  hideSearchIcon,
  pill,
}) {
  const appId = applicationId || process.env.NEXT_PUBLIC_ALGOLIA_APP_ID;
  const key = apiKey || process.env.NEXT_PUBLIC_ALGOLIA_SEARCH_KEY;
  const index = indexName || process.env.NEXT_PUBLIC_ALGOLIA_INDEX_PRODUCTS;

  if (!appId || !key || !index) {
    return <SearchBarFallback placeholder={placeholder} maxHeight={maxHeight} hideSearchIcon={hideSearchIcon} pill={pill} />;
  }

  const searchClient = algoliasearch(appId, key);

  return (
    <InstantSearch searchClient={searchClient} indexName={index}>
      <SearchInputWithDropdown
        placeholder={placeholder}
        hitsPerPage={hitsPerPage}
        attributes={attributes}
        maxHeight={maxHeight}
        className={className}
        hideSearchIcon={hideSearchIcon}
        pill={pill}
      />
    </InstantSearch>
  );
}
