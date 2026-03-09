"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { Link, useRouter } from "@/i18n/navigation";
import { useLocale } from "next-intl";
import { liteClient as algoliasearch } from "algoliasearch/lite";
import { InstantSearch, useSearchBox, useHits, useInstantSearch, Configure } from "react-instantsearch";
import styled from "styled-components";
import { getMedusaClient } from "@/lib/medusa-client";
import { stripHtmlForSearch, getLocalizedProduct } from "@/lib/format";
import { tokens } from "@/design-system/tokens";

const Wrap = styled.div`
  position: relative;
  width: 100%;
`;

const InputWrap = styled.div`
  position: relative;
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

const DEBOUNCE_MS = 300;
const MAX_HITS = 8;

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

function SearchBarFallback({ placeholder = "Search...", maxHeight = "400px" }) {
  const router = useRouter();
  const locale = useLocale();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const debounceRef = useRef(null);

  const fetchProducts = useCallback(async (query) => {
    if (!(query && query.trim().length >= 2)) {
      setHits([]);
      setOpen(!!(query && query.trim()));
      return;
    }
    setLoading(true);
    try {
      const client = getMedusaClient();
      const { products = [] } = await client.getProducts({ q: query.trim(), limit: MAX_HITS });
      setHits(products);
      setOpen(true);
    } catch (_) {
      setHits([]);
      setOpen(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const query = (q || "").trim();
    if (!query) {
      setHits([]);
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

  const handleSubmit = (e) => {
    e.preventDefault();
    const query = (q || "").trim();
    if (query) router.push(`/search?q=${encodeURIComponent(query)}`);
  };

  const showDropdown = open && (q || "").trim().length >= 2;

  return (
    <Wrap ref={wrapRef} as="form" onSubmit={handleSubmit}>
      <InputWrap>
        <SearchIcon aria-hidden>🔍</SearchIcon>
        <Input
          type="search"
          placeholder={placeholder}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Suche"
          aria-expanded={showDropdown}
        />
      </InputWrap>
      {showDropdown && (
        <Dropdown $maxHeight={maxHeight} role="listbox">
          {loading && hits.length === 0 && <Empty>Suche...</Empty>}
          {!loading && hits.length === 0 && <Empty>Keine Ergebnisse für &quot;{q.trim()}&quot;</Empty>}
          {hits.map((product, i) => {
            const { title: hitTitle, description: hitDesc } = getLocalizedProduct(product, locale);
            const priceCents = product.variants?.[0]?.prices?.[0]?.amount ?? product.metadata?.price_cents ?? null;
            return (
              <HitLink
                key={product.id || product.handle || i}
                href={product.handle ? `/produkt/${product.handle}` : "#"}
                onClick={() => setOpen(false)}
              >
                {product.thumbnail && <HitImage src={product.thumbnail} alt="" />}
                <HitText>
                  <Primary><HighlightText text={hitTitle || "(No title)"} query={q.trim()} /></Primary>
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
}) {
  const { query, refine } = useSearchBox();
  const { hits, results } = useHits();
  const { status } = useInstantSearch();
  const [isOpen, setIsOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const wrapRef = useRef(null);

  const showDropdown = query.length > 0;
  const loading = status === "loading" || status === "stalled";

  useEffect(() => {
    setFocusedIndex(-1);
  }, [query, hits.length]);

  useEffect(() => {
    if (!showDropdown) return;
    const handleClickOutside = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setIsOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showDropdown]);

  useEffect(() => {
    setIsOpen(showDropdown);
  }, [showDropdown]);

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

  const primaryKey = attributes.primaryText || "title";
  const secondaryKey = attributes.secondaryText;
  const tertiaryKey = attributes.tertiaryText;
  const urlKey = attributes.url || "url";
  const imageKey = attributes.image;

  return (
    <Wrap className={className} ref={wrapRef} onKeyDown={handleKeyDown}>
      <Configure hitsPerPage={hitsPerPage} />
      <InputWrap>
        <SearchIcon aria-hidden>🔍</SearchIcon>
        <Input
          type="search"
          autoComplete="off"
          placeholder={placeholder}
          value={query}
          onChange={(e) => refine(e.target.value)}
          aria-expanded={showDropdown}
          aria-controls="search-hits"
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
                $focused={focusedIndex === i}
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
}) {
  const appId = applicationId || process.env.NEXT_PUBLIC_ALGOLIA_APP_ID;
  const key = apiKey || process.env.NEXT_PUBLIC_ALGOLIA_SEARCH_KEY;
  const index = indexName || process.env.NEXT_PUBLIC_ALGOLIA_INDEX_PRODUCTS;

  if (!appId || !key || !index) {
    return <SearchBarFallback placeholder={placeholder} maxHeight={maxHeight} />;
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
      />
    </InstantSearch>
  );
}
