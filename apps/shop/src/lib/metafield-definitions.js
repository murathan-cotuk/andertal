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

/** Packaging units describe how the seller ships, not a product property (handoff Faz 0). */
export const HIDDEN_METAFIELD_KEYS = new Set(["packaging_unit", "packaging_unit_plural"]);

/**
 * Eigenschaften rows for the PDP: one row per metafield key, several values joined with ", ".
 * The variant is the real product — a key the variant carries replaces the parent's values;
 * parent-only keys are kept. Order: parent order first, then variant-only keys.
 * @returns {Array<{ key: string, values: string[] }>}
 */
export function mergeMetafieldRows(parentMetafields, variantMetafields) {
  const collect = (list) => {
    const map = new Map();
    for (const f of Array.isArray(list) ? list : []) {
      const key = String(f?.key || "").trim();
      const value = f?.value == null ? "" : String(f.value).trim();
      if (!key || !value || HIDDEN_METAFIELD_KEYS.has(key.toLowerCase())) continue;
      const k = key.toLowerCase();
      if (!map.has(k)) map.set(k, { key, values: [] });
      const row = map.get(k);
      if (!row.values.includes(value)) row.values.push(value);
    }
    return map;
  };
  const parent = collect(parentMetafields);
  const variant = collect(variantMetafields);
  const out = [];
  for (const [k, row] of parent) out.push(variant.get(k) || row);
  for (const [k, row] of variant) if (!parent.has(k)) out.push(row);
  return out;
}
