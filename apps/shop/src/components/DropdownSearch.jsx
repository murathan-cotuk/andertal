"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { flushSync } from "react-dom";
import { Link, useRouter } from "@/i18n/navigation";
import { useLocale, useTranslations } from "next-intl";
import { storefrontProductHandle } from "@/lib/product-url-handle";
import { liteClient as algoliasearch } from "algoliasearch/lite";
import { InstantSearch, useSearchBox, useHits, useInstantSearch, Configure } from "react-instantsearch";
import styled from "styled-components";
import { getMedusaClient } from "@/lib/medusa-client";
import {
  useStoreSearch,
  useRecentSearches,
  loadRecentSearches,
  saveRecentSearch,
  removeRecentSearch,
  clearRecentSearches,
  RECENT_SEARCHES_KEY,
} from "@/lib/store-search";
import { stripHtmlForSearch, getLocalizedProduct } from "@/lib/format";
import { tokens } from "@/design-system/tokens";
import {
  useSearchDiscovery,
  usePrefetchSearchDiscovery,
  DiscoveryTerms,
  DiscoveryProducts,
  DiscoveryColumns,
  SearchResultsPanel,
} from "@/components/search/SearchDiscovery";

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
      color: #a39a8d;
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
  border-radius: 20px;
  box-shadow: 0 24px 48px rgba(29, 27, 24, 0.18);
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
  color: #5e574e;
  padding: 16px 16px 8px;
`;

const SuggestionChip = styled.button`
  display: inline-flex;
  align-items: center;
  padding: 8px 12px;
  margin: 4px 4px 4px 0;
  font-size: 13px;
  color: #111;
  background: #f3eee6;
  border: none;
  border-radius: 9999px;
  cursor: pointer;
  font-family: ${tokens.fontFamily.sans};
  &:active {
    background: #e6dfd4;
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
const MOBILE_MQ = "(max-width: 767px)";

const BACK_BTN_STYLE = { border: "none", background: "none", color: "#1d1b18", width: 36, height: 40, padding: 0, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" };

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

/** iOS yalnızca kullanıcı dokunuşunun içinde yapılan focus() ile klavyeyi açar. */
function focusSearchInput(input) {
  if (!input) return;
  try {
    input.focus({ preventScroll: true });
  } catch {
    input.focus();
  }
}

function lockDocumentForSearch() {
  const body = document.body;
  if (body.dataset.searchScrollLock === "1") return;
  const y = window.scrollY || document.documentElement.scrollTop || 0;
  body.dataset.searchScrollLock = "1";
  body.dataset.searchScrollY = String(y);
  body.style.position = "fixed";
  body.style.top = `-${y}px`;
  body.style.left = "0";
  body.style.right = "0";
  body.style.width = "100%";
}

function unlockDocumentForSearch() {
  const body = document.body;
  if (body.dataset.searchScrollLock !== "1") return;
  const y = Number(body.dataset.searchScrollY || 0);
  body.style.position = "";
  body.style.top = "";
  body.style.left = "";
  body.style.right = "";
  body.style.width = "";
  delete body.dataset.searchScrollLock;
  delete body.dataset.searchScrollY;
  window.scrollTo(0, y);
}

function openMobileSearchSheet(setMobileOpen, inputRef) {
  lockDocumentForSearch();
  flushSync(() => setMobileOpen(true));
  const input = inputRef.current;
  if (input && document.activeElement !== input) focusSearchInput(input);
}

/** Görünen alanın üstüne yapışır; klavye veya tarayıcı çubuğu boş şerit bırakmaz. */
function useSearchSheetBox(active) {
  const [box, setBox] = useState(null);
  useEffect(() => {
    if (!active || typeof window === "undefined") {
      setBox(null);
      return undefined;
    }
    const vv = window.visualViewport;
    if (!vv) return undefined;
    let raf = 0;
    const apply = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        setBox({ height: vv.height });
      });
    };
    apply();
    vv.addEventListener("resize", apply);
    vv.addEventListener("scroll", apply);
    return () => {
      cancelAnimationFrame(raf);
      vv.removeEventListener("resize", apply);
      vv.removeEventListener("scroll", apply);
    };
  }, [active]);
  return box;
}

function searchSheetStyle(box) {
  return {
    position: "fixed",
    left: 0,
    right: 0,
    top: 0,
    height: box ? box.height : "100dvh",
    zIndex: 2147483660,
    background: "#fff",
    display: "flex",
    flexDirection: "column",
  };
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

/* ─── Desktop: panel shown when the empty search field gets focus ──────────
 * Same data as the mobile search sheet: recent searches (localStorage) and
 * "Weiter einkaufen" products from /api/store-products. */
function useDesktopFocusSuggestions(enabled) {
  const [focused, setFocused] = useState(false);
  const recent = useRecentSearches(enabled);
  const onFocus = useCallback(() => {
    if (!enabled) return;
    setFocused(true);
  }, [enabled]);
  const clearRecent = useCallback(() => clearRecentSearches(), []);
  return { focused, setFocused, recent, onFocus, clearRecent };
}

const FocusDropdown = styled(Dropdown)`
  left: 50%;
  right: auto;
  width: min(960px, calc(100vw - 48px));
  transform: translateX(-50%);
  border-radius: 24px;
  border: none;
  box-shadow: 0 30px 80px rgba(29, 27, 24, 0.28);
  padding: 0;
`;

function DesktopFocusPanel({ recent, onPickTerm, onClose, onClearRecent }) {
  const ts = useTranslations("search");
  const discovery = useSearchDiscovery(true);
  const hasTerms = recent.length > 0 || discovery.popular.length > 0 || discovery.recentCats.length > 0;
  const hasProducts = discovery.recommended.length > 0 || discovery.browse.products.length > 0;
  if (!hasTerms && !hasProducts) return null;
  return (
    <FocusDropdown $maxHeight="min(76vh, 640px)" role="dialog" aria-label={ts("label")}>
      <DiscoveryColumns>
        <DiscoveryTerms
          recent={recent}
          onClearRecent={onClearRecent}
          onRemoveRecent={removeRecentSearch}
          onPickTerm={onPickTerm}
          popular={discovery.popular}
          recentCats={discovery.recentCats}
          onNavigate={onClose}
        />
        <DiscoveryProducts browse={discovery.browse} recommended={discovery.recommended} onNavigate={onClose} />
      </DiscoveryColumns>
    </FocusDropdown>
  );
}

/**
 * Header search (no Algolia): the backend search engine (/api/store-search) behind a rich panel —
 * empty field: recent (removable) / popular / recent categories / recommendations;
 * typing: suggestions, categories, brands and products (exact → related → popular), on desktop
 * as a two-column panel under the field and on phones as a full-screen sheet.
 */
function SearchBarFallback({ placeholder = "Search...", hideSearchIcon = false, pill = false }) {
  const router = useRouter();
  const locale = useLocale();
  const ts = useTranslations("search");
  const isMobile = useMatchMediaOnce(MOBILE_MQ);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const wrapRef = useRef(null);
  const mobileInputRef = useRef(null);
  const searchSheetBox = useSearchSheetBox(isMobile && mobileOpen);
  const focusPanel = useDesktopFocusSuggestions(!isMobile);
  usePrefetchSearchDiscovery();
  const mobileDiscovery = useSearchDiscovery(isMobile && mobileOpen);
  const recentSearches = useRecentSearches(true);
  const typed = (q || "").trim();
  const typingDiscovery = useSearchDiscovery(!isMobile && typed.length > 0);
  const live = useStoreSearch(typed, {
    limit: isMobile ? 6 : 8,
    locale,
    enabled: isMobile ? mobileOpen : open || focusPanel.focused,
  });

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false);
        focusPanel.setFocused(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [focusPanel.setFocused]);

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
    if (!isMobile || !mobileOpen) return undefined;
    lockDocumentForSearch();
    return () => unlockDocumentForSearch();
  }, [isMobile, mobileOpen]);

  /** Every way of starting a search ends here: history + results page. */
  const goSearchResults = (term) => {
    const t = String(term || "").trim();
    if (t) saveRecentSearch(t);
    setMobileOpen(false);
    setOpen(false);
    focusPanel.setFocused(false);
    setQ("");
    router.push(t ? `/search?q=${encodeURIComponent(t)}` : "/search");
  };

  const afterNavigate = () => {
    if (typed) saveRecentSearch(typed);
    setMobileOpen(false);
    setOpen(false);
    focusPanel.setFocused(false);
    setQ("");
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (typed) goSearchResults(typed);
  };

  if (isMobile) {
    const mobilePanel = mobileOpen && mounted ? createPortal(
      <div
        className="mobile-search-sheet"
        style={searchSheetStyle(searchSheetBox)}
        role="dialog"
        aria-modal="true"
        aria-label={ts("label")}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderBottom: "1px solid #efe8dd", flexShrink: 0 }}>
          <button type="button" onClick={() => setMobileOpen(false)} aria-label={ts("back")} style={BACK_BTN_STYLE}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg></button>
          <div style={{ flex: 1, minWidth: 0, position: "relative" }}>
            <input
              ref={mobileInputRef}
              type="text"
              inputMode="search"
              enterKeyHint="search"
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              placeholder={placeholder}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); goSearchResults(q); } }}
              style={{ width: "100%", boxSizing: "border-box", fontSize: 16, padding: "10px 40px 10px 14px", border: "2px solid #1d1b18", borderRadius: 999, background: "#f6f2ec", outline: "none" }}
            />
            {q ? (
              <button
                type="button"
                aria-label={ts("clearRecent")}
                onClick={() => { setQ(""); mobileInputRef.current?.focus(); }}
                style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", width: 30, height: 30, border: "none", borderRadius: "50%", background: "#e6dfd4", color: "#1d1b18", fontSize: 16, cursor: "pointer" }}
              >
                ×
              </button>
            ) : null}
          </div>
        </div>
        <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
          {!typed ? (
            <div style={{ padding: "16px 16px 8px" }}>
              <DiscoveryTerms
                recent={recentSearches}
                onClearRecent={clearRecentSearches}
                onRemoveRecent={removeRecentSearch}
                onPickTerm={(term) => goSearchResults(term)}
                popular={mobileDiscovery.popular}
                recentCats={mobileDiscovery.recentCats}
                onNavigate={afterNavigate}
              />
              <DiscoveryProducts
                browse={mobileDiscovery.browse}
                recommended={mobileDiscovery.recommended}
                onNavigate={afterNavigate}
              />
            </div>
          ) : (
            <SearchResultsPanel
              layout="mobile"
              query={typed}
              popular={mobileDiscovery.popular}
              data={live.data}
              loading={live.loading}
              recent={recentSearches}
              onPickTerm={(term) => goSearchResults(term)}
              onRemoveRecent={removeRecentSearch}
              onNavigate={afterNavigate}
              onSeeAll={() => goSearchResults(typed)}
            />
          )}
        </div>
      </div>,
      document.body,
    ) : null;

    return (
      <>
        <div
          style={{ minHeight: pill ? 36 : undefined, width: "100%", display: "flex", alignItems: "center", cursor: "text", padding: pill ? "0" : undefined, color: q ? "#111" : "#a39a8d", fontSize: 15 }}
          onPointerDown={(e) => {
            if (e.button != null && e.button !== 0) return;
            e.preventDefault();
            openMobileSearchSheet(setMobileOpen, mobileInputRef);
          }}
          onClick={() => openMobileSearchSheet(setMobileOpen, mobileInputRef)}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openMobileSearchSheet(setMobileOpen, mobileInputRef); } }}
          role="button"
          tabIndex={0}
          aria-label={ts("open")}
        >
          {q || placeholder}
        </div>
        {mobilePanel}
      </>
    );
  }

  const showResults = typed.length > 0 && (open || focusPanel.focused);
  return (
    <Wrap ref={wrapRef} as="form" onSubmit={handleSubmit}>
      <InputWrap>
        {!hideSearchIcon && <SearchIcon aria-hidden>🔍</SearchIcon>}
        <Input
          type="search"
          placeholder={placeholder}
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={focusPanel.onFocus}
          onKeyDown={(e) => {
            if (e.key === "Escape") { focusPanel.setFocused(false); setOpen(false); }
          }}
          aria-label={ts("label")}
          aria-expanded={showResults || focusPanel.focused}
          autoComplete="off"
          $pill={pill}
        />
      </InputWrap>
      {!typed && focusPanel.focused ? (
        <DesktopFocusPanel
          recent={focusPanel.recent}
          onClearRecent={focusPanel.clearRecent}
          onPickTerm={(term) => goSearchResults(term)}
          onClose={() => focusPanel.setFocused(false)}
        />
      ) : null}
      {showResults ? (
        <FocusDropdown $maxHeight="min(78vh, 680px)" role="dialog" aria-label={ts("label")}>
          <SearchResultsPanel
            query={typed}
            popular={typingDiscovery.popular}
            data={live.data}
            loading={live.loading}
            recent={recentSearches}
            onPickTerm={(term) => goSearchResults(term)}
            onRemoveRecent={removeRecentSearch}
            onNavigate={afterNavigate}
            onSeeAll={() => goSearchResults(typed)}
          />
        </FocusDropdown>
      ) : null}
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
  const ts = useTranslations("search");
  const { query, refine } = useSearchBox();
  const { hits } = useHits();
  const { status } = useInstantSearch();
  const [mobileOpen, setMobileOpen] = useState(false);
  const mobileDiscovery = useSearchDiscovery(isMobile && mobileOpen);
  const [recentSearches, setRecentSearches] = useState([]);
  const [mounted, setMounted] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const wrapRef = useRef(null);
  const mobileInputRef = useRef(null);
  const searchSheetBox = useSearchSheetBox(isMobile && mobileOpen);
  const focusPanel = useDesktopFocusSuggestions(!isMobile);
  const setFocusPanelOpen = focusPanel.setFocused;
  usePrefetchSearchDiscovery();

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

  useEffect(() => {
    if (isMobile) return undefined;
    const onDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setFocusPanelOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [isMobile, setFocusPanelOpen]);

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
    lockDocumentForSearch();
    return () => unlockDocumentForSearch();
  }, [isMobile, mobileOpen]);

  useEffect(() => {
    if (!isMobile || !mobileOpen) return;
    setRecentSearches(loadRecentSearches());
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
    openMobileSearchSheet(setMobileOpen, mobileInputRef);
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
      if (urlPath) window.location.href = typeof urlPath === "string" ? (urlPath.startsWith("/") ? urlPath : `/${urlPath}`) : "#";
    }
  };

  const brandChips = query.trim()
    ? [...new Set(hits.map((h) => getByPath(h, tertiaryKey)).filter(Boolean).map(String))].slice(0, 8)
    : [];

  const configHits = isMobile && mobileOpen ? 20 : hitsPerPage;

  if (isMobile) {
    const mobilePanel = mobileOpen && mounted ? createPortal(
      <div
        className="mobile-search-sheet"
        style={searchSheetStyle(searchSheetBox)}
        role="dialog"
        aria-modal="true"
        aria-label={ts("label")}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 12px",
            borderBottom: "1px solid #efe8dd",
            flexShrink: 0,
          }}
        >
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            aria-label={ts("back")}
            style={BACK_BTN_STYLE}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
          </button>
          <input
            ref={mobileInputRef}
            type="text"
            inputMode="search"
            enterKeyHint="search"
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
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
              border: "2px solid #1d1b18",
              borderRadius: 999,
              background: "#f6f2ec",
              outline: "none",
            }}
          />
        </div>
        <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
          {!query.trim() ? (
            <div style={{ padding: "16px 16px 8px" }}>
              <DiscoveryTerms
                recent={recentSearches}
                onClearRecent={() => {
                  try { window.localStorage.removeItem(RECENT_SEARCHES_KEY); } catch { /* ignore */ }
                  setRecentSearches([]);
                }}
                onPickTerm={(term) => { refine(term); goSearchResults(term); }}
                popular={mobileDiscovery.popular}
                recentCats={mobileDiscovery.recentCats}
                onNavigate={() => { setMobileOpen(false); refine(""); }}
              />
              <DiscoveryProducts
                browse={mobileDiscovery.browse}
                recommended={mobileDiscovery.recommended}
                onNavigate={() => { setMobileOpen(false); refine(""); }}
              />
            </div>
          ) : (
            <>
              {loading && hits.length === 0 && (
                <div style={{ marginTop: 16 }}>
                  <Empty>{ts("searching")}</Empty>
                </div>
              )}
              {!loading && hits.length === 0 && <Empty>{ts("noResults", { query })}</Empty>}
              {hits.length > 0 && (
                <div style={{ padding: "8px 0" }} role="listbox">
                  {hits.map((hit, i) => {
                    const url = getByPath(hit, urlKey);
                    const link = url && (String(url).startsWith("/") ? url : `/${url}`);
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
                  <MobileSectionTitle>{ts("suggestions")}</MobileSectionTitle>
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
                  <MobileSectionTitle>{ts("previous")}</MobileSectionTitle>
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
            color: query ? "#111" : "#a39a8d",
            fontSize: 15,
          }}
          onPointerDown={(e) => {
            if (e.button != null && e.button !== 0) return;
            e.preventDefault();
            openMobileSearch();
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
          aria-label={ts("open")}
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
          onFocus={focusPanel.onFocus}
          onKeyDown={(e) => {
            if (e.key === "Escape") setFocusPanelOpen(false);
            handleKeyDown(e);
          }}
          aria-expanded={showDropdown}
          aria-controls="search-hits"
          $pill={pill}
        />
      </InputWrap>
      {!showDropdown && focusPanel.focused ? (
        <DesktopFocusPanel
          recent={focusPanel.recent}
          onClearRecent={focusPanel.clearRecent}
          onPickTerm={(term) => {
            setFocusPanelOpen(false);
            refine(term);
            goSearchResults(term);
          }}
          onClose={() => setFocusPanelOpen(false)}
        />
      ) : null}
      {showDropdown && (
        <Dropdown id="search-hits" $maxHeight={maxHeight} role="listbox">
          {loading && hits.length === 0 && <Empty>{ts("searching")}</Empty>}
          {!loading && hits.length === 0 && <Empty>{ts("noResults", { query })}</Empty>}
          {hits.map((hit, i) => {
            const url = getByPath(hit, urlKey);
            const link = url && (String(url).startsWith("/") ? url : `/${url}`);
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
