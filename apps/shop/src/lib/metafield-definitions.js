"use client";

import { useEffect, useState } from "react";
import { localizeMetaKey } from "@/lib/prop-labels";

/**
 * Catalog property (Eigenschaft) definitions from Sellercentral → Content → Metaobjects, with
 * label_i18n / values_i18n. One shared fetch per page load (module cache) — product pages use it
 * to show specification titles AND values in the visitor's language.
 */
let cache = null;
let inflight = null;

export function loadMetafieldDefinitions() {
  if (cache) return Promise.resolve(cache);
  if (!inflight) {
    inflight = fetch("/api/store-metafield-definitions")
      .then((r) => r.json())
      .then((d) => { cache = d?.definitions || {}; return cache; })
      .catch(() => ({}))
      .finally(() => { inflight = null; });
  }
  return inflight;
}

export function useMetafieldDefinitions() {
  const [defs, setDefs] = useState(cache || {});
  useEffect(() => {
    let alive = true;
    loadMetafieldDefinitions().then((d) => { if (alive) setDefs(d || {}); });
    return () => { alive = false; };
  }, []);
  return defs;
}

const normLoc = (locale) => String(locale || "de").slice(0, 2).toLowerCase();

/** Specification title: Metaobjects translation → German catalog label → static fallback list. */
export function metafieldTitle(key, locale, defs) {
  const k = String(key || "").trim();
  const def = defs?.[k] || defs?.[k.toLowerCase()];
  const loc = normLoc(locale);
  if (def) {
    if (loc !== "de") {
      const t = def.label_i18n?.[loc]?.label;
      if (t && String(t).trim()) return String(t).trim();
    }
    if (def.label && String(def.label).trim() && (loc === "de" || !def.label_i18n)) return String(def.label).trim();
  }
  return localizeMetaKey(k, loc);
}

/** Specification value: canonical (German) value → its translation for the visitor's language. */
export function metafieldValue(key, value, locale, defs) {
  const v = String(value ?? "");
  const loc = normLoc(locale);
  if (!v || loc === "de") return v;
  const k = String(key || "").trim();
  const def = defs?.[k] || defs?.[k.toLowerCase()];
  const t = def?.values_i18n?.[loc]?.[v];
  return t != null && String(t).trim() ? String(t).trim() : v;
}
