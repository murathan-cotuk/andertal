"use client";

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Text } from "@shopify/polaris";
import { useLocale } from "next-intl";
import { categoryDisplayName } from "@/lib/category-locale";
import { lt } from "@/lib/locale-text";

/**
 * Category picker (shared by products, variants, collections, menus, landing pages, SEO hub,
 * compliance profiles). Same props as before.
 *
 *  - Trigger shows the full path as a breadcrumb (last level emphasised) + clear button.
 *  - Panel: search (match highlight, path, keyboard ↑ ↓ Enter), recently used categories, and a
 *    column browser (Miller columns, like Finder/Amazon) — one column per level, so even ~12k
 *    categories stay fast: only the opened levels are rendered.
 *  - Footer shows the focused path; any level can be chosen ("Choose"), leaves are chosen on click.
 */

const C = {
  accent: "#a65300",
  accentSoft: "#fcebd5",
  accentText: "#7f3f00",
  border: "#e6dfd4",
  borderSoft: "#f3eee6",
  text: "#1d1b18",
  muted: "#5e574e",
  faint: "#a39a8d",
  surface: "#ffffff",
  surfaceAlt: "#faf7f2",
  hover: "#f6f1ea",
};

const RECENT_KEY = "andertal-recent-categories";
const COLUMN_WIDTH = 230;

function readRecent() {
  try {
    const v = JSON.parse(window.localStorage.getItem(RECENT_KEY) || "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string").slice(0, 6) : [];
  } catch (_) {
    return [];
  }
}
function pushRecent(id) {
  try {
    const next = [id, ...readRecent().filter((x) => x !== id)].slice(0, 6);
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch (_) { /* storage unavailable */ }
}

function buildTree(list, locale) {
  const byId = new Map();
  if (!Array.isArray(list)) return { roots: [], byId };
  for (const c of list) {
    if (!c?.id) continue;
    byId.set(c.id, { ...c, children: [], _label: categoryDisplayName(c, locale) });
  }
  const roots = [];
  for (const node of byId.values()) {
    const pid = node.parent_id;
    if (pid && byId.has(pid) && pid !== node.id) byId.get(pid).children.push(node);
    else roots.push(node);
  }
  const cmp = (a, b) => {
    const sa = Number(a.sort_order), sb = Number(b.sort_order);
    if (Number.isFinite(sa) && Number.isFinite(sb) && sa !== sb) return sa - sb;
    return a._label.localeCompare(b._label, undefined, { sensitivity: "base" });
  };
  const sortDeep = (arr) => {
    arr.sort(cmp);
    for (const n of arr) if (n.children.length) sortDeep(n.children);
  };
  sortDeep(roots);
  return { roots, byId };
}

function Highlight({ text, query }) {
  const q = query.trim();
  if (!q) return text;
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return text;
  return (
    <>
      {text.slice(0, i)}
      <mark style={{ background: C.accentSoft, color: C.accentText, borderRadius: 3, padding: "0 1px" }}>{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length)}
    </>
  );
}

const FolderIcon = ({ color = C.faint, size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 20 20" fill={color} aria-hidden="true" style={{ flex: "0 0 auto" }}>
    <path d="M2 5.5A1.5 1.5 0 013.5 4h4.38a1.5 1.5 0 011.06.44L10.5 6H16.5A1.5 1.5 0 0118 7.5v7A1.5 1.5 0 0116.5 16h-13A1.5 1.5 0 012 14.5v-9z" />
  </svg>
);
const TagIcon = ({ color = C.faint, size = 13 }) => (
  <svg width={size} height={size} viewBox="0 0 20 20" fill={color} aria-hidden="true" style={{ flex: "0 0 auto" }}>
    <path d="M3 3h6.59a1 1 0 01.7.29l6.42 6.42a1 1 0 010 1.42l-5.58 5.58a1 1 0 01-1.42 0L3.29 10.3A1 1 0 013 9.59V3zm3.5 4.5a1.5 1.5 0 100-3 1.5 1.5 0 000 3z" />
  </svg>
);
const Chevron = ({ dir = "right", color = C.faint }) => (
  <svg width="12" height="12" viewBox="0 0 20 20" fill={color} aria-hidden="true" style={{ flex: "0 0 auto", transform: dir === "down" ? "rotate(90deg)" : dir === "up" ? "rotate(-90deg)" : "none" }}>
    <path d="M7.3 4.3a1 1 0 011.4 0l5 5a1 1 0 010 1.4l-5 5a1 1 0 01-1.4-1.4L11.6 10 7.3 5.7a1 1 0 010-1.4z" />
  </svg>
);
const SearchIcon = () => (
  <svg width="15" height="15" viewBox="0 0 20 20" fill={C.faint} aria-hidden="true">
    <path d="M8.5 3a5.5 5.5 0 014.38 8.83l3.65 3.64a.75.75 0 11-1.06 1.06l-3.64-3.65A5.5 5.5 0 118.5 3zm0 1.5a4 4 0 100 8 4 4 0 000-8z" />
  </svg>
);

export default function CategoryDrilldownSelect({
  label = "Category",
  labelHidden = false,
  categories = [],
  value = "",
  onChange,
  placeholder = "Select category",
  noneLabel = "— None —",
  disabled = false,
}) {
  const locale = useLocale();
  const t = (en, tr, fr, es, it, de) => lt(locale, en, tr, fr, es, it, de);
  const wrapperRef = useRef(null);
  const triggerRef = useRef(null);
  const panelRef = useRef(null);
  const searchRef = useRef(null);
  const columnsRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState(null);
  const [search, setSearch] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const [path, setPath] = useState([]); // focused ids, one per opened column
  const [recent, setRecent] = useState([]);

  const { roots, byId } = useMemo(() => buildTree(categories, locale), [categories, locale]);

  const pathIdsOf = useCallback((id) => {
    const out = [];
    let cur = id ? byId.get(id) : null;
    const seen = new Set();
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id);
      out.unshift(cur.id);
      cur = cur.parent_id ? byId.get(cur.parent_id) : null;
    }
    return out;
  }, [byId]);

  const selectedPath = useMemo(() => pathIdsOf(value).map((id) => byId.get(id)).filter(Boolean), [value, pathIdsOf, byId]);

  // Search index (lazy: only while the panel is open).
  const index = useMemo(() => {
    if (!open) return [];
    const rows = [];
    for (const n of byId.values()) {
      rows.push({ node: n, hay: `${n._label} ${n.name || ""} ${n.slug || ""} ${n.id}`.toLowerCase() });
    }
    return rows;
  }, [open, byId]);

  const results = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    const starts = [];
    const contains = [];
    for (const r of index) {
      const i = r.hay.indexOf(q);
      if (i < 0) continue;
      (r.node._label.toLowerCase().startsWith(q) ? starts : contains).push(r.node);
      if (starts.length >= 80) break;
    }
    return [...starts, ...contains].slice(0, 80).map((n) => ({
      node: n,
      crumbs: pathIdsOf(n.id).slice(0, -1).map((id) => byId.get(id)?._label).filter(Boolean),
    }));
  }, [search, index, pathIdsOf, byId]);

  useEffect(() => { setActiveIdx(0); }, [search]);

  // Opening: focus search, restore the column path to the current value, load recents.
  useEffect(() => {
    if (!open) return;
    setRecent(readRecent().filter((id) => byId.has(id)));
    const p = pathIdsOf(value);
    setPath(p.length ? p : []);
    const raf = requestAnimationFrame(() => searchRef.current?.focus());
    return () => cancelAnimationFrame(raf);
  }, [open]);

  // Position (portal, fixed): wide enough for the column browser, clamped to the viewport.
  useLayoutEffect(() => {
    if (!open) return;
    const update = () => {
      if (triggerRef.current) setRect(triggerRef.current.getBoundingClientRect());
    };
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open]);

  // The wrapper page can clip fixed descendants; this body class lifts the overflow while open.
  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    if (open) document.body.classList.add("andertal-dropdown-open");
    else document.body.classList.remove("andertal-dropdown-open");
    return () => document.body.classList.remove("andertal-dropdown-open");
  }, [open]);

  useEffect(() => {
    const onDown = (e) => {
      if (wrapperRef.current?.contains(e.target)) return;
      if (panelRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  // Keep the deepest opened column in view.
  useEffect(() => {
    const el = columnsRef.current;
    if (el) el.scrollTo({ left: el.scrollWidth, behavior: "smooth" });
  }, [path.length]);

  const choose = (id) => {
    onChange?.(id);
    if (id) pushRecent(id);
    setSearch("");
    setOpen(false);
    triggerRef.current?.focus();
  };

  const onSearchKey = (e) => {
    if (e.key === "Escape") { setOpen(false); triggerRef.current?.focus(); return; }
    if (!search.trim() || !results.length) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActiveIdx((i) => Math.min(results.length - 1, i + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActiveIdx((i) => Math.max(0, i - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); const r = results[activeIdx]; if (r) choose(r.node.id); }
  };

  useEffect(() => {
    const el = panelRef.current?.querySelector(`[data-result-idx="${activeIdx}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIdx]);

  // Columns: roots, then the children of every focused node that has children.
  const columns = useMemo(() => {
    const cols = [{ parent: null, items: roots }];
    for (const id of path) {
      const n = byId.get(id);
      if (n?.children?.length) cols.push({ parent: n, items: n.children });
    }
    return cols;
  }, [roots, path, byId]);

  const focusNode = (depth, node) => {
    if (!node.children.length) { choose(node.id); return; }
    setPath((p) => [...p.slice(0, depth), node.id]);
  };

  const focused = path.length ? byId.get(path[path.length - 1]) : null;
  const focusedCrumbs = path.map((id) => byId.get(id)?._label).filter(Boolean);

  const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const panelWidth = rect ? Math.min(vw - 24, Math.max(rect.width, 720)) : 720;
  const left = rect ? Math.max(12, Math.min(rect.left, vw - panelWidth - 12)) : 12;
  const openUp = rect ? vh - rect.bottom < 470 && rect.top > vh - rect.bottom : false;
  const panelMaxH = rect ? Math.max(320, Math.min(520, (openUp ? rect.top : vh - rect.bottom) - 16)) : 520;

  const itemBase = {
    width: "100%", border: "none", textAlign: "left", cursor: "pointer", borderRadius: 7,
    display: "flex", alignItems: "center", gap: 8, padding: "7px 8px", fontSize: 13, color: C.text,
  };

  return (
    <div ref={wrapperRef} style={{ position: "relative", width: "100%" }}>
      {!labelHidden && (
        <div style={{ marginBottom: 6 }}>
          <Text as="span" variant="bodySm" fontWeight="medium">{label}</Text>
        </div>
      )}

      <div
        ref={triggerRef}
        role="combobox"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={label}
        aria-disabled={disabled}
        tabIndex={disabled ? -1 : 0}
        onClick={() => !disabled && setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") { e.preventDefault(); setOpen(true); }
          if (e.key === "Escape") setOpen(false);
        }}
        style={{
          width: "100%", minHeight: 40, boxSizing: "border-box",
          border: `1px solid ${open ? C.accent : "var(--p-color-border, #c9c2b6)"}`,
          boxShadow: open ? `0 0 0 3px ${C.accentSoft}` : "none",
          borderRadius: 9, padding: "6px 10px",
          background: disabled ? "var(--p-color-bg-surface-disabled, #f1f2f4)" : C.surface,
          cursor: disabled ? "not-allowed" : "pointer",
          display: "flex", alignItems: "center", gap: 8, transition: "border-color .12s, box-shadow .12s",
          outline: "none",
        }}
      >
        <FolderIcon color={selectedPath.length ? C.accent : C.faint} size={16} />
        <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", flexWrap: "wrap", gap: 2, lineHeight: 1.35 }}>
          {selectedPath.length ? selectedPath.map((n, i) => {
            const last = i === selectedPath.length - 1;
            return (
              <React.Fragment key={n.id}>
                {i > 0 && <Chevron color="#c9c2b6" />}
                <span style={{
                  fontSize: 13, color: last ? C.text : C.muted, fontWeight: last ? 600 : 400,
                  ...(last ? { background: C.accentSoft, color: C.accentText, padding: "1px 7px", borderRadius: 999 } : {}),
                }}>{n._label}</span>
              </React.Fragment>
            );
          }) : (
            <span style={{ fontSize: 13.5, color: "var(--p-color-text-subdued, #8a8378)" }}>{placeholder}</span>
          )}
        </div>
        {value && !disabled && (
          <button
            type="button"
            aria-label={t("Clear", "Temizle", "Effacer", "Borrar", "Cancella", "Leeren")}
            onClick={(e) => { e.stopPropagation(); onChange?.(""); }}
            style={{ border: "none", background: "none", cursor: "pointer", color: C.faint, fontSize: 16, lineHeight: 1, padding: "2px 4px" }}
          >
            ×
          </button>
        )}
        <Chevron dir={open ? "up" : "down"} color={C.muted} />
      </div>

      {open && !disabled && rect && typeof document !== "undefined" && createPortal(
        <div
          ref={panelRef}
          role="dialog"
          aria-label={label}
          style={{
            position: "fixed",
            ...(openUp ? { bottom: vh - rect.top + 6 } : { top: rect.bottom + 6 }),
            left, width: panelWidth, maxHeight: panelMaxH,
            zIndex: 10020, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12,
            boxShadow: "0 18px 48px rgba(31,27,22,.18), 0 2px 6px rgba(31,27,22,.06)",
            display: "flex", flexDirection: "column", overflow: "hidden",
          }}
        >
          {/* Search */}
          <div style={{ padding: "10px 12px", borderBottom: `1px solid ${C.borderSoft}`, display: "flex", alignItems: "center", gap: 8 }}>
            <SearchIcon />
            <input
              ref={searchRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={onSearchKey}
              placeholder={t("Search category by name, slug or ID…", "Ad, slug veya ID ile kategori ara…", "Rechercher une catégorie (nom, slug, ID)…", "Buscar categoría por nombre, slug o ID…", "Cerca categoria per nome, slug o ID…", "Kategorie nach Name, Slug oder ID suchen…")}
              style={{ flex: 1, border: "none", outline: "none", fontSize: 14, color: C.text, background: "transparent", minWidth: 0 }}
            />
            {search && (
              <button type="button" onClick={() => { setSearch(""); searchRef.current?.focus(); }}
                style={{ border: "none", background: C.surfaceAlt, color: C.muted, borderRadius: 6, cursor: "pointer", fontSize: 12, padding: "3px 8px" }}>
                {t("Clear", "Temizle", "Effacer", "Borrar", "Cancella", "Leeren")}
              </button>
            )}
            <span style={{ fontSize: 11, color: C.faint, border: `1px solid ${C.border}`, borderRadius: 5, padding: "1px 5px" }}>Esc</span>
          </div>

          {/* Recently used */}
          {!search.trim() && recent.length > 0 && (
            <div style={{ padding: "8px 12px", borderBottom: `1px solid ${C.borderSoft}`, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: C.faint, textTransform: "uppercase", letterSpacing: 0.4, marginRight: 2 }}>
                {t("Recent", "Son kullanılan", "Récents", "Recientes", "Recenti", "Zuletzt")}
              </span>
              {recent.map((id) => {
                const n = byId.get(id);
                if (!n) return null;
                const parent = n.parent_id ? byId.get(n.parent_id) : null;
                return (
                  <button key={id} type="button" onClick={() => choose(id)} title={pathIdsOf(id).map((x) => byId.get(x)?._label).join(" › ")}
                    style={{ border: `1px solid ${value === id ? C.accent : C.border}`, background: value === id ? C.accentSoft : C.surface, color: C.text, borderRadius: 999, padding: "3px 10px", fontSize: 12, cursor: "pointer", maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {parent && <span style={{ color: C.faint }}>{parent._label} › </span>}{n._label}
                  </button>
                );
              })}
            </div>
          )}

          {/* Body */}
          <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
            {search.trim() ? (
              <div style={{ overflowY: "auto", padding: 6, flex: 1 }} role="listbox">
                {results.length === 0 ? (
                  <div style={{ padding: "22px 12px", textAlign: "center", color: C.faint, fontSize: 13 }}>
                    {t("No category found.", "Kategori bulunamadı.", "Aucune catégorie trouvée.", "No se encontró ninguna categoría.", "Nessuna categoria trovata.", "Keine Kategorie gefunden.")}
                  </div>
                ) : results.map((r, i) => {
                  const n = r.node;
                  const active = i === activeIdx;
                  return (
                    <button
                      key={n.id}
                      type="button"
                      role="option"
                      aria-selected={value === n.id}
                      data-result-idx={i}
                      onMouseEnter={() => setActiveIdx(i)}
                      onClick={() => choose(n.id)}
                      style={{ ...itemBase, alignItems: "flex-start", padding: "8px 10px", background: active ? C.hover : value === n.id ? C.accentSoft : "transparent" }}
                    >
                      <span style={{ paddingTop: 2 }}>{n.children.length ? <FolderIcon color={C.accent} /> : <TagIcon />}</span>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: "block", fontWeight: 600, fontSize: 13.5 }}><Highlight text={n._label} query={search} /></span>
                        {r.crumbs.length > 0 && (
                          <span style={{ display: "block", fontSize: 11.5, color: C.muted, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {r.crumbs.join(" › ")}
                          </span>
                        )}
                      </span>
                      <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2, flex: "0 0 auto" }}>
                        {n.children.length > 0 && (
                          <span style={{ fontSize: 11, color: C.muted, background: C.surfaceAlt, borderRadius: 999, padding: "1px 7px" }}>
                            {n.children.length} {t("sub", "alt", "sous", "sub", "sotto", "Unter")}
                          </span>
                        )}
                        {value === n.id && <span style={{ fontSize: 11, color: C.accent, fontWeight: 600 }}>✓</span>}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div ref={columnsRef} style={{ display: "flex", overflowX: "auto", flex: 1, minHeight: 0 }}>
                {roots.length === 0 && (
                  <div style={{ padding: "22px 12px", color: C.faint, fontSize: 13 }}>
                    {t("No categories.", "Kategori yok.", "Aucune catégorie.", "Sin categorías.", "Nessuna categoria.", "Keine Kategorien.")}
                  </div>
                )}
                {roots.length > 0 && columns.map((col, depth) => (
                  <div key={col.parent?.id || "root"} style={{ flex: `0 0 ${COLUMN_WIDTH}px`, width: COLUMN_WIDTH, borderRight: `1px solid ${C.borderSoft}`, display: "flex", flexDirection: "column", minHeight: 0 }}>
                    <div style={{ padding: "8px 12px 4px", fontSize: 11, fontWeight: 600, color: C.faint, textTransform: "uppercase", letterSpacing: 0.4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {col.parent ? col.parent._label : t("Main categories", "Ana kategoriler", "Catégories principales", "Categorías principales", "Categorie principali", "Hauptkategorien")}
                      <span style={{ fontWeight: 400, marginLeft: 4 }}>· {col.items.length}</span>
                    </div>
                    <div style={{ overflowY: "auto", padding: "0 6px 6px", flex: 1, maxHeight: panelMaxH - 150 }}>
                      {col.items.map((n) => {
                        const inPath = path[depth] === n.id;
                        const selected = value === n.id;
                        const hasKids = n.children.length > 0;
                        return (
                          <button
                            key={n.id}
                            type="button"
                            onClick={() => focusNode(depth, n)}
                            onDoubleClick={() => choose(n.id)}
                            title={hasKids ? t("Click to open · double-click to choose", "Açmak için tıkla · seçmek için çift tıkla", "Clic pour ouvrir · double-clic pour choisir", "Clic para abrir · doble clic para elegir", "Clic per aprire · doppio clic per scegliere", "Klicken zum Öffnen · Doppelklick zum Auswählen") : undefined}
                            style={{
                              ...itemBase,
                              background: selected ? C.accentSoft : inPath ? C.hover : "transparent",
                              fontWeight: inPath || selected ? 600 : 400,
                              color: selected ? C.accentText : C.text,
                            }}
                            onMouseEnter={(e) => { if (!inPath && !selected) e.currentTarget.style.background = C.surfaceAlt; }}
                            onMouseLeave={(e) => { if (!inPath && !selected) e.currentTarget.style.background = "transparent"; }}
                          >
                            {n.image_url ? (
                              <img src={n.image_url} alt="" style={{ width: 20, height: 20, borderRadius: 4, objectFit: "cover", flex: "0 0 auto" }} />
                            ) : hasKids ? <FolderIcon color={inPath ? C.accent : C.faint} /> : <TagIcon />}
                            <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{n._label}</span>
                            {selected && <span style={{ color: C.accent, fontSize: 12 }}>✓</span>}
                            {hasKids && <span style={{ fontSize: 11, color: C.faint }}>{n.children.length}</span>}
                            {hasKids && <Chevron color={inPath ? C.accent : "#c9c2b6"} />}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div style={{ borderTop: `1px solid ${C.borderSoft}`, background: C.surfaceAlt, padding: "8px 12px", display: "flex", alignItems: "center", gap: 10 }}>
            <button type="button" onClick={() => choose("")}
              style={{ border: "none", background: "none", color: C.muted, cursor: "pointer", fontSize: 12, padding: 0, whiteSpace: "nowrap" }}>
              {noneLabel}
            </button>
            <div style={{ flex: 1, minWidth: 0, fontSize: 12, color: C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {!search.trim() && focused ? (
                <>
                  {focusedCrumbs.slice(0, -1).map((c) => `${c} › `).join("")}
                  <strong style={{ color: C.text }}>{focused._label}</strong>
                  {focused.children.length > 0 && (
                    <span style={{ color: C.faint }}> · {focused.children.length} {t("subcategories", "alt kategori", "sous-catégories", "subcategorías", "sottocategorie", "Unterkategorien")}</span>
                  )}
                </>
              ) : (
                <span style={{ color: C.faint }}>
                  {search.trim()
                    ? t("↑ ↓ to move · Enter to choose", "↑ ↓ ile gez · Enter ile seç", "↑ ↓ pour naviguer · Entrée pour choisir", "↑ ↓ para moverse · Enter para elegir", "↑ ↓ per spostarti · Invio per scegliere", "↑ ↓ navigieren · Enter auswählen")
                    : t("Open a category to see its subcategories", "Alt kategorileri görmek için bir kategori aç", "Ouvrez une catégorie pour voir ses sous-catégories", "Abre una categoría para ver sus subcategorías", "Apri una categoria per vederne le sottocategorie", "Kategorie öffnen, um Unterkategorien zu sehen")}
                </span>
              )}
            </div>
            {!search.trim() && focused && (
              <button type="button" onClick={() => choose(focused.id)}
                style={{ border: "none", background: C.accent, color: "#fff", borderRadius: 7, padding: "6px 12px", fontSize: 12.5, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>
                {value === focused.id
                  ? t("Selected ✓", "Seçili ✓", "Sélectionné ✓", "Seleccionado ✓", "Selezionato ✓", "Ausgewählt ✓")
                  : t("Choose", "Seç", "Choisir", "Elegir", "Scegli", "Auswählen")}
              </button>
            )}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
