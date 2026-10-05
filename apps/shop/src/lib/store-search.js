"use client";

import { useEffect, useState } from "react";

/*
 * Storefront search client — header panel + /search page both use the backend engine
 * (/api/store-search → medusa-backend src/store-search.js): codes (EAN, SKU, AN-ID, ids),
 * names in every language, brands, categories, typos; `mode` tells whether results are exact
 * matches, related ones, or (nothing found) popular products.
 */

export const EMPTY_SEARCH = {
  query: "",
  mode: "related",
  total: 0,
  did_you_mean: null,
  products: [],
  categories: [],
  brands: [],
  suggestions: [],
};

const responseCache = new Map();
const CACHE_MAX = 60;

export async function fetchStoreSearch(query, { limit = 8, locale = "de", log = false } = {}) {
  const q = String(query || "").trim();
  if (!q) return EMPTY_SEARCH;
  const key = `${locale}|${limit}|${q.toLowerCase()}`;
  if (!log && responseCache.has(key)) return responseCache.get(key);
  const qs = new URLSearchParams({ q, limit: String(limit), locale });
  if (log) qs.set("log", "1");
  const r = await fetch(`/api/store-search?${qs.toString()}`);
  const data = await r.json();
  const out = { ...EMPTY_SEARCH, ...(data && typeof data === "object" ? data : {}) };
  responseCache.set(key, out);
  if (responseCache.size > CACHE_MAX) responseCache.delete(responseCache.keys().next().value);
  return out;
}

/** Debounced search for a live input; keeps the previous result visible while typing. */
export function useStoreSearch(query, { limit = 8, locale = "de", debounceMs = 140, enabled = true, log = false } = {}) {
  const [state, setState] = useState({ data: EMPTY_SEARCH, loading: false, query: "" });
  const q = String(query || "").trim();

  useEffect(() => {
    if (!enabled || !q) {
      setState({ data: EMPTY_SEARCH, loading: false, query: "" });
      return undefined;
    }
    // Each run owns its answer: a newer query (or an unmount) marks it stale, so an older,
    // slower response can never overwrite the newer one — and loading always resolves.
    let stale = false;
    setState((s) => ({ ...s, loading: true }));
    const t = setTimeout(() => {
      fetchStoreSearch(q, { limit, locale, log })
        .then((data) => { if (!stale) setState({ data, loading: false, query: q }); })
        .catch(() => { if (!stale) setState({ data: EMPTY_SEARCH, loading: false, query: q }); });
    }, debounceMs);
    return () => {
      stale = true;
      clearTimeout(t);
    };
  }, [q, limit, locale, debounceMs, enabled, log]);

  return state;
}

/* ── "Beliebte Suchen" (real submitted searches; empty until people search) ── */

let popularPromise = null;
export function loadPopularSearches() {
  if (!popularPromise) {
    popularPromise = fetch("/api/store-search-popular?limit=8")
      .then((r) => r.json())
      .then((d) => (Array.isArray(d?.searches) ? d.searches.map((s) => String(s.query || "")).filter(Boolean) : []))
      .catch(() => {
        popularPromise = null;
        return [];
      });
  }
  return popularPromise;
}

export function usePopularSearches(active) {
  const [list, setList] = useState([]);
  useEffect(() => {
    if (!active) return undefined;
    let alive = true;
    loadPopularSearches().then((l) => { if (alive) setList(l); });
    return () => { alive = false; };
  }, [active]);
  return list;
}

/* ── "Zuletzt gesucht" (this browser only; each entry removable) ─────────── */

export const RECENT_SEARCHES_KEY = "andertal-recent-searches";
const MAX_RECENT = 10;
const RECENT_EVENT = "andertal:recent-searches";

export function loadRecentSearches() {
  if (typeof window === "undefined") return [];
  try {
    const a = JSON.parse(window.localStorage.getItem(RECENT_SEARCHES_KEY) || "[]");
    return Array.isArray(a) ? a.filter((s) => typeof s === "string" && s.trim()).slice(0, MAX_RECENT) : [];
  } catch {
    return [];
  }
}

function writeRecent(list) {
  try {
    if (list.length) window.localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(list));
    else window.localStorage.removeItem(RECENT_SEARCHES_KEY);
    window.dispatchEvent(new Event(RECENT_EVENT));
  } catch { /* ignore */ }
}

export function saveRecentSearch(term) {
  const t = String(term || "").trim();
  if (t.length < 2 || typeof window === "undefined") return;
  writeRecent([t, ...loadRecentSearches().filter((s) => s.toLowerCase() !== t.toLowerCase())].slice(0, MAX_RECENT));
}

export function removeRecentSearch(term) {
  if (typeof window === "undefined") return;
  const t = String(term || "").toLowerCase();
  writeRecent(loadRecentSearches().filter((s) => s.toLowerCase() !== t));
}

export function clearRecentSearches() {
  if (typeof window === "undefined") return;
  writeRecent([]);
}

/** Live list — updates when any search box saves / removes an entry. */
export function useRecentSearches(active = true) {
  const [list, setList] = useState([]);
  useEffect(() => {
    if (!active) return undefined;
    const sync = () => setList(loadRecentSearches());
    sync();
    window.addEventListener(RECENT_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(RECENT_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, [active]);
  return list;
}
