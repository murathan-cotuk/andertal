"use client";

import { useState, useEffect, useLayoutEffect, useCallback, useMemo, useRef } from "react";
import {
  Page,
  Layout,
  Card,
  Text,
  Button,
  TextField,
  BlockStack,
  InlineStack,
  Box,
  Divider,
  Badge,
  Banner,
  Select,
  Popover,
  Checkbox,
} from "@shopify/polaris";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";
import {
  mergeLoadedShopStyles,
  ensureActiveVariant,
  normalizeButtonType,
  DEFAULT_BUTTON_COLORS,
  effectiveGradientEnabled,
} from "@andertal/shop-theme";

/** Button color field labels (keys as in DEFAULT_BUTTON_COLORS). */

const BUTTON_COLOR_LABELS = {
  add_to_cart: {
    bg: "Background",
    border: "Border",
    hover_bg: "Hover / active background",
    icon_bg: "Icon stripe",
    text: "Text",
    icon_stroke: "Icon line",
    disabled_bg: "Disabled: background",
    disabled_border: "Disabled: border",
  },
  primary: {
    bg: "Background",
    shine: "Shine (gradient)",
    text: "Text",
    border: "Border",
    shadow: "Drop shadow",
    hover_bg: "Hover background",
    hover_text: "Hover text",
    hover_border: "Hover border",
    hover_shadow: "Hover shadow",
  },
  secondary: {
    bg: "Background",
    text: "Text",
    border: "Border",
    hover_bg: "Hover background",
    hover_text: "Hover text",
  },
  ghost: {
    text: "Text",
    hover_bg: "Hover background",
    hover_text: "Hover text",
  },
  outline: {
    accent: "Border & text & hover fill",
    hover_text: "Hover text",
  },
};
import { useUnsavedChanges } from "@/context/UnsavedChangesContext";
import MediaPickerModal from "@/components/MediaPickerModal";
import { NumericTextField, NumericInput } from "@/components/NumericTextField";
import { useLocale } from "next-intl";
import { getUI } from "@/lib/ui-strings";
import { getStylesPageCopy } from "@/lib/styles-page-i18n";

function normalizeHexForColorInput(val) {
  if (!val || typeof val !== "string") return "#ffffff";
  let s = val.trim();
  if (!s.startsWith("#")) s = `#${s}`;
  if (s.length === 4 && /^#[0-9a-fA-F]{3}$/.test(s)) {
    s = `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`;
  }
  if (/^#[0-9a-fA-F]{6}$/.test(s)) return s.toLowerCase();
  return "#ffffff";
}

function clamp255Channel(x) {
  const n = Number(x);
  if (Number.isNaN(n)) return 255;
  return Math.max(0, Math.min(255, Math.round(n)));
}

function clampAlphaChannel(x) {
  const n = Number(x);
  if (Number.isNaN(n)) return 1;
  return Math.max(0, Math.min(1, n));
}

/** Nur Hex oder rgb/rgba — komplexes CSS (Gradient) nicht als Farbe zu parsen */
function canParseAsSolidCssColor(css) {
  const s = String(css || "").trim();
  if (!s) return true;
  if (/^rgba?\(/i.test(s)) return true;
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(s)) return true;
  return false;
}

function parseCssColorToRgb(css) {
  const s = String(css || "").trim();
  const m = s.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/i);
  if (m) {
    return {
      r: clamp255Channel(m[1]),
      g: clamp255Channel(m[2]),
      b: clamp255Channel(m[3]),
      a: m[4] !== undefined ? clampAlphaChannel(parseFloat(m[4])) : 1,
    };
  }
  const hex = normalizeHexForColorInput(s);
  const h = hex.slice(1);
  const n = parseInt(h, 16);
  if (Number.isNaN(n)) return { r: 255, g: 255, b: 255, a: 1 };
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 1 };
}

function rgbChannelsToHex(r, g, b) {
  return `#${[r, g, b]
    .map((x) => clamp255Channel(x).toString(16).padStart(2, "0"))
    .join("")}`;
}

function cssColorToHexForPicker(val) {
  const { r, g, b } = parseCssColorToRgb(val);
  return rgbChannelsToHex(r, g, b);
}

function mergePickerHexWithPreservedAlpha(previousCss, pickedHex) {
  const prev = parseCssColorToRgb(previousCss);
  const picked = parseCssColorToRgb(pickedHex);
  if (prev.a >= 0.999) return pickedHex;
  return `rgba(${picked.r},${picked.g},${picked.b},${prev.a})`;
}

/** Native color dialog: input fixed on the swatch so the browser anchors near the click (not top-left). */
function openNativeColorPicker(value, onChange, anchorRect) {
  const el = document.createElement("input");
  el.type = "color";
  el.value = normalizeHexForColorInput(value);

  const left = anchorRect != null ? anchorRect.left : 0;
  const top = anchorRect != null ? anchorRect.top : 0;
  const w = anchorRect != null ? Math.max(anchorRect.width, 1) : 24;
  const h = anchorRect != null ? Math.max(anchorRect.height, 1) : 24;

  Object.assign(el.style, {
    position: "fixed",
    left: `${Math.round(left)}px`,
    top: `${Math.round(top)}px`,
    width: `${Math.round(w)}px`,
    height: `${Math.round(h)}px`,
    opacity: "0",
    border: "none",
    padding: "0",
    margin: "0",
    zIndex: "2147483647",
  });

  const remove = () => {
    clearTimeout(safetyRemove);
    el.remove();
  };

  el.oninput = (e) => onChange(e.target.value);
  el.onchange = remove;
  const safetyRemove = setTimeout(remove, 120_000);

  document.body.appendChild(el);

  const run = () => {
    if (typeof el.showPicker === "function") {
      const p = el.showPicker();
      if (p != null && typeof p.catch === "function") {
        p.catch(() => el.click());
      }
    } else {
      el.click();
    }
  };
  try {
    run();
  } catch {
    el.click();
  }
}

/** Google Fonts → CSS font-family stack im Shop */
function fontStackFromGoogleName(name) {
  const n = String(name || "").trim().replace(/"/g, "");
  if (!n) return "";
  return `"${n}", system-ui, sans-serif`;
}

/** Ersten Familiennamen aus font-family Stack (Anzeige / Auswahl). */
function googleNameFromFontStack(stack) {
  if (stack == null || !String(stack).trim()) return "";
  const s = String(stack).trim();
  const q = s.match(/^["']([^"']+)["']\s*,/);
  if (q) return q[1].trim();
  const q2 = s.match(/^["']([^"']+)["']\s*$/);
  if (q2) return q2[1].trim();
  const first = s.split(",")[0].trim().replace(/^["']|["']$/g, "");
  return first;
}

const GF_PREVIEW_ID_PREFIX = "sellercentral-gf-preview-";
/** ~25 families pro URL (Längenlimit); mehrere <link>-Tags für die ganze Liste. */
const GF_PREVIEW_CHUNK = 25;

function buildGoogleFontsPreviewHrefChunk(familyNames) {
  const list = Array.isArray(familyNames) ? familyNames.filter(Boolean) : [];
  if (!list.length) return null;
  const q = list
    .map((name) => `family=${encodeURIComponent(String(name))}:wght@400`)
    .join("&");
  return `https://fonts.googleapis.com/css2?${q}&display=swap`;
}

function removeGoogleFontPreviewLinks(namespace) {
  const prefix = `${GF_PREVIEW_ID_PREFIX}${namespace}-`;
  document.querySelectorAll(`link[id^="${prefix}"]`).forEach((el) => el.remove());
}

function FontFamilyDropdown({ label, valueName, families, loading, onSelect, previewNamespace = "x" }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const itemRefs = useRef({});

  const filtered = useMemo(() => {
    const list = Array.isArray(families) ? families : [];
    const t = q.trim().toLowerCase();
    if (!t) return list;
    return list.filter((f) => f.toLowerCase().includes(t));
  }, [families, q]);

  /** Dropdown açılınca seçili font listede üstte ve görünür alanda */
  const orderedFiltered = useMemo(() => {
    const list = [...filtered];
    const v = (valueName || "").trim();
    if (v && list.includes(v)) {
      const i = list.indexOf(v);
      list.splice(i, 1);
      list.unshift(v);
    }
    return list;
  }, [filtered, valueName]);

  useLayoutEffect(() => {
    if (!open) return;
    const v = (valueName || "").trim();
    if (!v || !orderedFiltered.includes(v)) return;
    const el = itemRefs.current[v];
    if (el && typeof el.scrollIntoView === "function") {
      el.scrollIntoView({ block: "nearest", behavior: "auto" });
    }
  }, [open, valueName, orderedFiltered]);

  useEffect(() => {
    if (!open || loading || orderedFiltered.length === 0) {
      removeGoogleFontPreviewLinks(previewNamespace);
      return;
    }
    const timer = setTimeout(() => {
      removeGoogleFontPreviewLinks(previewNamespace);
      const names = [...orderedFiltered];
      for (let i = 0; i < names.length; i += GF_PREVIEW_CHUNK) {
        const chunk = names.slice(i, i + GF_PREVIEW_CHUNK);
        const href = buildGoogleFontsPreviewHrefChunk(chunk);
        if (!href) continue;
        const link = document.createElement("link");
        link.id = `${GF_PREVIEW_ID_PREFIX}${previewNamespace}-${(i / GF_PREVIEW_CHUNK) | 0}`;
        link.rel = "stylesheet";
        link.href = href;
        document.head.appendChild(link);
      }
    }, 120);
    return () => {
      clearTimeout(timer);
      removeGoogleFontPreviewLinks(previewNamespace);
    };
  }, [open, loading, orderedFiltered, previewNamespace]);

  const display = valueName || "Standard (Theme / System)";

  return (
    <Popover
      active={open}
      autofocusTarget="first-node"
      preferredPosition="below"
      onClose={() => {
        setOpen(false);
        setQ("");
      }}
      activator={
        <div>
          <div
            style={{
              fontSize: 12,
              fontWeight: 500,
              marginBottom: 6,
              color: "var(--p-color-text)",
            }}
          >
            {label}
          </div>
          <Button
            fullWidth
            disclosure="down"
            textAlign="start"
            onClick={() => setOpen((v) => !v)}
          >
            {display}
          </Button>
        </div>
      }
    >
      <Box padding="300" minWidth="320px">
        <BlockStack gap="200">
          <TextField
            label="Search"
            labelHidden
            placeholder="Filter font name…"
            value={q}
            onChange={setQ}
            autoComplete="off"
            size="slim"
          />
          <div style={{ maxHeight: 420, overflowY: "auto" }}>
            <button
              type="button"
              onClick={() => {
                onSelect("");
                setOpen(false);
                setQ("");
              }}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                padding: "10px 12px",
                marginBottom: 4,
                border: "1px dashed var(--p-color-border)",
                background: "var(--p-color-bg-surface-secondary)",
                cursor: "pointer",
                borderRadius: 8,
                fontSize: 13,
              }}
            >
              Standard (Theme / System)
            </button>
            {loading ? (
              <Text as="p" tone="subdued" variant="bodySm">
                Loading fonts…
              </Text>
            ) : (
              orderedFiltered.map((f) => {
                const fam = `"${f.replace(/"/g, "")}", system-ui, sans-serif`;
                return (
                  <button
                    key={f}
                    ref={(el) => {
                      if (el) itemRefs.current[f] = el;
                      else delete itemRefs.current[f];
                    }}
                    type="button"
                    onClick={() => {
                      onSelect(f);
                      setOpen(false);
                      setQ("");
                    }}
                    style={{
                      display: "block",
                      width: "100%",
                      textAlign: "left",
                      padding: "10px 12px",
                      border: "none",
                      background:
                        valueName === f ? "var(--p-color-bg-surface-selected)" : "transparent",
                      cursor: "pointer",
                      borderRadius: 6,
                      contentVisibility: "auto",
                      containIntrinsicSize: "0 52px",
                    }}
                  >
                    <div
                      style={{
                        fontFamily: fam,
                        fontSize: 17,
                        fontWeight: 600,
                        lineHeight: 1.25,
                        color: "var(--p-color-text)",
                        wordBreak: "break-word",
                      }}
                    >
                      {f}
                    </div>
                    <div
                      style={{
                        fontFamily: fam,
                        fontSize: 12,
                        fontWeight: 400,
                        lineHeight: 1.3,
                        marginTop: 4,
                        color: "var(--p-color-text-secondary)",
                      }}
                    >
                      Aa Bb Cc 123 — Pack my bag
                    </div>
                  </button>
                );
              })
            )}
            {!loading && filtered.length === 0 ? (
              <Text as="p" tone="subdued" variant="bodySm">
                No results — try a shorter or different term.
              </Text>
            ) : null}
            {!loading && filtered.length > 0 ? (
              <Text as="p" variant="bodySm" tone="subdued">
                {filtered.length} fonts
                {q.trim() ? " (filtered)" : ""}. Preview loads in chunks (please wait a moment).
              </Text>
            ) : null}
          </div>
        </BlockStack>
      </Box>
    </Popover>
  );
}

function TypographyLevelRow({ heading, levelKey, typo, families, familiesLoading, onLevelChange }) {
  const b = typo[levelKey] || {};
  const valueName = googleNameFromFontStack(b.font_family || "");
  return (
    <BlockStack gap="300">
      <Text as="h3" variant="headingSm">
        {heading}
      </Text>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
          gap: 16,
          alignItems: "end",
        }}
      >
        <div style={{ gridColumn: "span 2", minWidth: 240 }}>
          <FontFamilyDropdown
            label="Typografie / font family"
            valueName={valueName}
            families={families}
            loading={familiesLoading}
            previewNamespace={levelKey}
            onSelect={(name) =>
              onLevelChange(levelKey, "font_family", name ? fontStackFromGoogleName(name) : "")
            }
          />
        </div>
        <TextField
          label="Font size"
          value={b.font_size || ""}
          onChange={(v) => onLevelChange(levelKey, "font_size", v)}
          autoComplete="off"
        />
        <ColorField label="Color" value={b.color} onChange={(v) => onLevelChange(levelKey, "color", v)} />
        <TextField
          label="Letter spacing"
          value={b.letter_spacing || ""}
          onChange={(v) => onLevelChange(levelKey, "letter_spacing", v)}
          autoComplete="off"
        />
        <TextField
          label="Line height"
          value={b.line_height || ""}
          onChange={(v) => onLevelChange(levelKey, "line_height", v)}
          autoComplete="off"
        />
        <div style={{ gridColumn: "1 / -1" }}>
          <TextField
            label="Custom font-family (CSS, optional)"
            value={b.font_family || ""}
            onChange={(v) => onLevelChange(levelKey, "font_family", v)}
            autoComplete="off"
            helpText="Full CSS stack; supplements or replaces the selection above (system fonts, fallbacks)."
          />
        </div>
      </div>
    </BlockStack>
  );
}

// ── Color swatch input ────────────────────────────────────────────────────────
function ColorField({ label, value, onChange, preserveAlphaFromRgba = false, helpText }) {
  const raw = String(value ?? "").trim();
  const solidOk = canParseAsSolidCssColor(raw);
  const useAlphaPreserve = preserveAlphaFromRgba && solidOk;
  const swatchBg = raw && solidOk ? raw : raw || "#ffffff";
  const pickerSeed = useAlphaPreserve ? cssColorToHexForPicker(raw) : value;

  return (
    <TextField
      label={label}
      value={value || ""}
      onChange={onChange}
      autoComplete="off"
      helpText={helpText}
      prefix={
        <div
          style={{
            width: 20,
            height: 20,
            borderRadius: 4,
            background: swatchBg,
            border: "1px solid var(--p-color-border)",
            cursor: "pointer",
            flexShrink: 0,
          }}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            openNativeColorPicker(pickerSeed, (hex) => {
              if (useAlphaPreserve) onChange(mergePickerHexWithPreservedAlpha(raw, hex));
              else onChange(hex);
            }, e.currentTarget.getBoundingClientRect());
          }}
        />
      }
    />
  );
}

// ── Button variant card ───────────────────────────────────────────────────────
function ButtonVariantCard({ variant, onActivate, onCodeChange, onNameChange, onRemove }) {
  const [codeOpen, setCodeOpen] = useState(false);

  return (
    <Box
      padding="300"
      borderWidth="025"
      borderColor={variant.active ? "border-emphasis" : "border"}
      borderRadius="200"
      background={variant.active ? "bg-surface-selected" : "bg-surface"}
    >
      <BlockStack gap="200">
        <InlineStack align="space-between" blockAlign="center" gap="200">
          <InlineStack gap="200" blockAlign="center">
            <TextField
              label=""
              labelHidden
              value={variant.name}
              onChange={onNameChange}
              autoComplete="off"
              placeholder="Variant name"
            />
            {variant.active && <Badge tone="success">Active</Badge>}
          </InlineStack>
          <InlineStack gap="200">
            {!variant.active && (
              <Button size="slim" variant="primary" onClick={onActivate}>
                Activate
              </Button>
            )}
            <Button size="slim" onClick={() => setCodeOpen((v) => !v)}>
              {codeOpen ? "Close code" : "Edit code"}
            </Button>
            <Button size="slim" tone="critical" onClick={onRemove}>
              Remove
            </Button>
          </InlineStack>
        </InlineStack>

        {codeOpen && (
          <textarea
            value={variant.code || ""}
            onChange={(e) => onCodeChange(e.target.value)}
            rows={10}
            style={{
              width: "100%",
              fontFamily: "monospace",
              fontSize: 13,
              padding: 10,
              border: "1px solid var(--p-color-border)",
              borderRadius: 6,
              background: "var(--p-color-bg-surface-secondary)",
              resize: "vertical",
              boxSizing: "border-box",
            }}
          />
        )}
      </BlockStack>
    </Box>
  );
}

// ── Button colors (CSS variables → Shop) ─────────────────────────────────────
function ButtonColorFields({ typeKey, colors, onChangeColor }) {
  const schema = DEFAULT_BUTTON_COLORS[typeKey];
  if (!schema) return null;
  const labels = BUTTON_COLOR_LABELS[typeKey] || {};
  const merged = { ...schema, ...(colors || {}) };

  return (
    <BlockStack gap="300">
      <Text as="h4" variant="headingSm">Colors</Text>
      <Text as="p" variant="bodySm" tone="subdued">
        These values control the default buttons. They work together with the CSS under "Edit code" (variables take precedence over fallback colors in the code).
      </Text>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 16 }}>
        {Object.keys(schema).map((key) => {
          const label = labels[key] || key;
          if (typeKey === "ghost" && key === "hover_bg") {
            return (
              <TextField
                key={key}
                label={label}
                value={merged[key] || ""}
                onChange={(v) => onChangeColor(key, v)}
                autoComplete="off"
                helpText="rgba(…) for a light surface, or hex"
              />
            );
          }
          return (
            <ColorField
              key={key}
              label={label}
              value={merged[key]}
              onChange={(v) => onChangeColor(key, v)}
            />
          );
        })}
      </div>
    </BlockStack>
  );
}

// ── Button type section ───────────────────────────────────────────────────────
function AccordionCard({ title, subtitle, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Layout.Section>
      <div style={{ border: "1px solid #e1e3e5", borderRadius: 12, overflow: "hidden", background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", background: open ? "#fafbfc" : "#fff", border: "none", cursor: "pointer", textAlign: "left", gap: 12, transition: "background 0.15s" }}
        >
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#111827" }}>{title}</div>
            {subtitle && <div style={{ fontSize: 13, color: "#6b7280", marginTop: 2 }}>{subtitle}</div>}
          </div>
          <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="#9ca3af" strokeWidth="2.5" style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s ease", flexShrink: 0 }}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
          </svg>
        </button>
        {open && (
          <div style={{ borderTop: "1px solid #f1f3f5", padding: "20px 20px 24px" }}>
            {children}
          </div>
        )}
      </div>
    </Layout.Section>
  );
}

function ButtonTypeSection({ typeKey, typeData, onChange }) {
  const variants = typeData.variants || [];

  const updateVariant = (idx, updated) => {
    const next = [...variants];
    next[idx] = updated;
    onChange({ ...typeData, variants: next });
  };

  const activateVariant = (idx) => {
    onChange({ ...typeData, variants: ensureActiveVariant(variants.map((v, i) => ({ ...v, active: i === idx }))) });
  };

  const removeVariant = (idx) => {
    onChange({ ...typeData, variants: ensureActiveVariant(variants.filter((_, i) => i !== idx)) });
  };

  const addVariant = () => {
    const next = [...variants, { name: "New variant", code: "", active: variants.length === 0 }];
    onChange({ ...typeData, variants: ensureActiveVariant(next) });
  };

  const onChangeColor = (colorKey, val) => {
    onChange({
      ...typeData,
      colors: { ...(typeData.colors || {}), [colorKey]: val },
    });
  };

  return (
    <Card>
      <BlockStack gap="400">
        <Text as="h3" variant="headingMd">{typeData.label || typeKey}</Text>
        <ButtonColorFields typeKey={typeKey} colors={typeData.colors} onChangeColor={onChangeColor} />
        <Divider />
        {variants.length === 0 && (
          <Text as="p" tone="subdued" variant="bodySm">No variants. Add one.</Text>
        )}
        {variants.map((v, idx) => (
          <ButtonVariantCard
            key={idx}
            variant={v}
            onActivate={() => activateVariant(idx)}
            onCodeChange={(code) => updateVariant(idx, { ...v, code })}
            onNameChange={(name) => updateVariant(idx, { ...v, name })}
            onRemove={() => removeVariant(idx)}
          />
        ))}
        <InlineStack>
          <Button size="slim" onClick={addVariant}>+ Add variant</Button>
        </InlineStack>
      </BlockStack>
    </Card>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function StylesPage() {
  const locale = useLocale();
  const c = useMemo(() => getStylesPageCopy(locale), [locale]);
  const ui = getUI(locale);
  const client = getMedusaAdminClient();
  const unsaved = useUnsavedChanges();
  const [isSuperuser, setIsSuperuser] = useState(false);
  const [styles, setStyles] = useState(null);
  /** Letzter gespeicherter / geladener Stand für Dirty-Vergleich */
  const [savedSnapshot, setSavedSnapshot] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState("");
  const [errMsg, setErrMsg] = useState("");

  const mkDeviceLogo = (h = 34) => ({ url: "", size: h, height: h, pt: 0, pr: 0, pb: 0, pl: 0 });
  const defaultLogoConfig = () => ({
    shop: { desktop: mkDeviceLogo(34), tablet: mkDeviceLogo(30), mobile: mkDeviceLogo(28) },
    sellercentral: { desktop: mkDeviceLogo(30), tablet: mkDeviceLogo(28), mobile: mkDeviceLogo(26) },
  });
  const logoSlotSize = (dev, fallback = 34) => {
    if (dev?.size != null && Number.isFinite(Number(dev.size))) return Number(dev.size);
    if (dev?.height != null && Number.isFinite(Number(dev.height))) return Number(dev.height);
    return fallback;
  };
  const clampLogoSize = (raw, fallback = 34) => {
    const n = Number(String(raw ?? "").replace(",", "."));
    return Math.max(8, Math.min(400, Number.isFinite(n) && n > 0 ? n : fallback));
  };
  const mergeLogoConfig = (saved) => {
    const def = defaultLogoConfig();
    if (!saved || typeof saved !== "object") return def;
    const merge = (defDev, savedDev) => {
      const size = logoSlotSize(savedDev, defDev.size ?? defDev.height);
      return {
        url: savedDev?.url ?? defDev.url,
        size,
        height: size,
        pt: savedDev?.pt != null ? Number(savedDev.pt) : defDev.pt,
        pr: savedDev?.pr != null ? Number(savedDev.pr) : defDev.pr,
        pb: savedDev?.pb != null ? Number(savedDev.pb) : defDev.pb,
        pl: savedDev?.pl != null ? Number(savedDev.pl) : defDev.pl,
      };
    };
    return {
      shop: {
        desktop: merge(def.shop.desktop, saved?.shop?.desktop),
        tablet: merge(def.shop.tablet, saved?.shop?.tablet),
        mobile: merge(def.shop.mobile, saved?.shop?.mobile),
      },
      sellercentral: {
        desktop: merge(def.sellercentral.desktop, saved?.sellercentral?.desktop),
        tablet: merge(def.sellercentral.tablet, saved?.sellercentral?.tablet),
        mobile: merge(def.sellercentral.mobile, saved?.sellercentral?.mobile),
      },
    };
  };
  const normalizeLogoConfigForSave = (config) => {
    const merged = mergeLogoConfig(config);
    for (const section of ["shop", "sellercentral"]) {
      const desktopUrl = String(merged[section]?.desktop?.url || "").trim();
      for (const device of ["desktop", "tablet", "mobile"]) {
        const dev = merged[section][device] || {};
        const size = clampLogoSize(logoSlotSize(dev, logoSlotSize(merged[section].desktop, 34)), logoSlotSize(merged[section][device], 34));
        merged[section][device] = {
          url: String(dev.url || "").trim() || desktopUrl,
          size,
          height: size,
          pt: Math.max(0, Math.min(80, Number(dev.pt) || 0)),
          pr: Math.max(0, Math.min(80, Number(dev.pr) || 0)),
          pb: Math.max(0, Math.min(80, Number(dev.pb) || 0)),
          pl: Math.max(0, Math.min(80, Number(dev.pl) || 0)),
        };
      }
    }
    return merged;
  };

  const [branding, setBranding] = useState({
    shop_favicon_url: "",
    sellercentral_favicon_url: "",
    announcement_bar_items: [],
    logo_config: defaultLogoConfig(),
  });
  const [brandingSnapshot, setBrandingSnapshot] = useState(null);
  const [brandingPickerTarget, setBrandingPickerTarget] = useState(null); // e.g. "logo_shop_desktop"
  const [logoActiveDevice, setLogoActiveDevice] = useState("desktop");
  const [headerScopeTab, setHeaderScopeTab] = useState("category");
  const [headerBgPickerScope, setHeaderBgPickerScope] = useState(null); // null | "global" | "category" | "collection"
  const [catalogNavOpen, setCatalogNavOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setIsSuperuser(localStorage.getItem("sellerIsSuperuser") === "true");
  }, []);

  const loadStyles = useCallback(async () => {
    setLoading(true);
    try {
      const data = await client.getStyles();
      const loaded = data?.styles || {};
      const merged = mergeLoadedShopStyles(loaded);
      const settings = await client.getSellerSettings('default').catch(() => ({}));
      setStyles(merged);
      setSavedSnapshot(JSON.stringify(merged));
      // Backward compat: if no logo_config yet, seed from old flat fields
      let savedLogoConfig = settings?.logo_config || null;
      if (!savedLogoConfig && (settings?.shop_logo_url || settings?.sellercentral_logo_url)) {
        savedLogoConfig = {
          shop: {
            desktop: { url: settings.shop_logo_url || "", size: Number(settings.shop_logo_height) || 34, height: Number(settings.shop_logo_height) || 34, pt: 0, pr: 0, pb: 0, pl: 0 },
            tablet: { url: settings.shop_logo_url || "", size: Number(settings.shop_logo_height) || 34, height: Number(settings.shop_logo_height) || 34, pt: 0, pr: 0, pb: 0, pl: 0 },
            mobile: { url: settings.shop_logo_url || "", size: Number(settings.shop_logo_height) || 34, height: Number(settings.shop_logo_height) || 34, pt: 0, pr: 0, pb: 0, pl: 0 },
          },
          sellercentral: {
            desktop: { url: settings.sellercentral_logo_url || "", size: Number(settings.sellercentral_logo_height) || 30, height: Number(settings.sellercentral_logo_height) || 30, pt: 0, pr: 0, pb: 0, pl: 0 },
            tablet: { url: settings.sellercentral_logo_url || "", size: Number(settings.sellercentral_logo_height) || 30, height: Number(settings.sellercentral_logo_height) || 30, pt: 0, pr: 0, pb: 0, pl: 0 },
            mobile: { url: settings.sellercentral_logo_url || "", size: Number(settings.sellercentral_logo_height) || 30, height: Number(settings.sellercentral_logo_height) || 30, pt: 0, pr: 0, pb: 0, pl: 0 },
          },
        };
      }
      const loadedBranding = {
        shop_favicon_url: settings?.shop_favicon_url || "",
        sellercentral_favicon_url: settings?.sellercentral_favicon_url || "",
        announcement_bar_items: Array.isArray(settings?.announcement_bar_items) ? settings.announcement_bar_items : [],
        logo_config: mergeLogoConfig(savedLogoConfig),
      };
      setBranding(loadedBranding);
      setBrandingSnapshot(JSON.stringify(loadedBranding));
    } catch (_) {
      const merged = mergeLoadedShopStyles({});
      setStyles(merged);
      setSavedSnapshot(JSON.stringify(merged));
      const emptyBranding = { shop_favicon_url: "", sellercentral_favicon_url: "", announcement_bar_items: [], logo_config: defaultLogoConfig() };
      setBranding(emptyBranding);
      setBrandingSnapshot(JSON.stringify(emptyBranding));
    }
    setLoading(false);
  }, [client]);

  useEffect(() => { loadStyles(); }, [loadStyles]);

  const isDirty = useMemo(() => {
    if (loading || !styles || savedSnapshot === null || brandingSnapshot === null) return false;
    try {
      return JSON.stringify(styles) !== savedSnapshot || JSON.stringify(branding) !== brandingSnapshot;
    } catch {
      return true;
    }
  }, [loading, styles, savedSnapshot, branding, brandingSnapshot]);

  const save = useCallback(async () => {
    setSaving(true);
    setErrMsg("");
    setSavedMsg("");
    try {
      await client.saveStyles(styles);
      const logoConfig = normalizeLogoConfigForSave(branding.logo_config);
      const desktopShopLogo = logoConfig.shop?.desktop;
      const desktopScLogo = logoConfig.sellercentral?.desktop;
      await client.updateSellerSettings({
        seller_id: "default",
        shop_favicon_url: branding.shop_favicon_url,
        sellercentral_favicon_url: branding.sellercentral_favicon_url,
        announcement_bar_items: branding.announcement_bar_items,
        logo_config: logoConfig,
        ...(String(desktopShopLogo?.url || "").trim()
          ? {
              shop_logo_url: desktopShopLogo.url,
              shop_logo_height: logoSlotSize(desktopShopLogo, 34),
            }
          : {}),
        ...(String(desktopScLogo?.url || "").trim()
          ? {
              sellercentral_logo_url: desktopScLogo.url,
              sellercentral_logo_height: logoSlotSize(desktopScLogo, 30),
            }
          : {}),
      });
      const settings = await client.getSellerSettings("default").catch(() => ({}));
      const reloadedBranding = {
        shop_favicon_url: settings?.shop_favicon_url || "",
        sellercentral_favicon_url: settings?.sellercentral_favicon_url || "",
        announcement_bar_items: Array.isArray(settings?.announcement_bar_items) ? settings.announcement_bar_items : [],
        logo_config: mergeLogoConfig(settings?.logo_config || logoConfig),
      };
      setBranding(reloadedBranding);
      setSavedSnapshot(JSON.stringify(styles));
      setBrandingSnapshot(JSON.stringify(reloadedBranding));
      // Bust the shop's settings cache so logo changes appear immediately on reload
      const shopUrl = (process.env.NEXT_PUBLIC_SHOP_URL || "").replace(/\/$/, "");
      if (shopUrl) {
        fetch(`${shopUrl}/api/store-seller-settings`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ seller_id: "default" }) }).catch(() => {});
      }
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("andertal-sellercentral-branding-refresh"));
      }
      setSavedMsg(c.stylesSaved);
      setTimeout(() => setSavedMsg(""), 4000);
    } catch (e) {
      setErrMsg(e?.message || ui.error);
    }
    setSaving(false);
  }, [styles, branding, client, c.stylesSaved]);

  const handleDiscard = useCallback(async () => {
    await loadStyles();
  }, [loadStyles]);

  useEffect(() => {
    if (!unsaved) return;
    unsaved.setDirty(isDirty);
    if (!isDirty) {
      unsaved.clearHandlers();
      return;
    }
    unsaved.setHandlers({ onSave: save, onDiscard: handleDiscard });
    return () => unsaved.clearHandlers();
  }, [unsaved, isDirty, save, handleDiscard]);

  const updateColor = (key, val) => {
    setStyles((prev) => ({ ...prev, colors: { ...prev.colors, [key]: val } }));
  };

  const updateSection = (section, key, val) =>
    setStyles((prev) => ({ ...prev, [section]: { ...prev[section], [key]: val } }));

  const headerGradientAnyViewport = useMemo(() => {
    const h = styles?.header;
    if (!h) return false;
    return (
      effectiveGradientEnabled(h, "mobile") ||
      effectiveGradientEnabled(h, "tablet") ||
      effectiveGradientEnabled(h, "desktop")
    );
  }, [styles?.header]);

  const headerScopeOverride = useMemo(() => {
    return styles?.header?.scopes?.[headerScopeTab] || {};
  }, [styles?.header?.scopes, headerScopeTab]);

  const headerScopeGradient = useMemo(() => {
    if (!headerScopeOverride || typeof headerScopeOverride !== "object") return false;
    return (
      effectiveGradientEnabled(headerScopeOverride, "mobile") ||
      effectiveGradientEnabled(headerScopeOverride, "tablet") ||
      effectiveGradientEnabled(headerScopeOverride, "desktop")
    );
  }, [headerScopeOverride]);

  const updateHeaderScopeField = (key, val) => {
    setStyles((prev) => {
      const header = prev.header || {};
      const scopes = { ...(header.scopes || {}) };
      const bucket = { ...(scopes[headerScopeTab] || {}) };
      if (val === "") {
        delete bucket[key];
      } else {
        bucket[key] = val;
      }
      scopes[headerScopeTab] = bucket;
      return { ...prev, header: { ...header, scopes } };
    });
  };

  const updateButtonType = (key, updated) => {
    setStyles((prev) => ({
      ...prev,
      buttons: { ...prev.buttons, [key]: normalizeButtonType(updated) },
    }));
  };

  const updateTypoLevel = (level, key, val) =>
    setStyles((prev) => ({
      ...prev,
      typography: {
        ...prev.typography,
        [level]: { ...(prev.typography[level] || {}), [key]: val },
      },
    }));

  const [googleFontList, setGoogleFontList] = useState(null);
  const googleFontsLoading = googleFontList === null;

  useEffect(() => {
    let cancelled = false;
    fetch("/api/google-fonts")
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setGoogleFontList(Array.isArray(d.families) ? d.families : []);
      })
      .catch(() => {
        if (!cancelled) setGoogleFontList([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading || !styles) {
    return (
      <Page title={c.pageTitle}>
        <Layout>
          <Layout.Section>
            <Card>
              <Box
                style={{
                  minHeight: "55vh",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text as="p" tone="subdued" alignment="center">{ui.loading}</Text>
              </Box>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>
    );
  }

  return (
    <Page
      title={c.pageTitle}
      subtitle={c.pageSubtitle}
      primaryAction={{
        content: saving ? ui.saving : ui.save,
        onAction: save,
        loading: saving,
        disabled: !isDirty,
      }}
    >
      <Layout>
        {errMsg && (
          <Layout.Section>
            <Banner tone="critical" onDismiss={() => setErrMsg("")}>{errMsg}</Banner>
          </Layout.Section>
        )}
        {savedMsg && (
          <Layout.Section>
            <Banner tone="success" onDismiss={() => setSavedMsg("")}>{savedMsg}</Banner>
          </Layout.Section>
        )}
        {isSuperuser && (
          <AccordionCard title="Homepage SEO (Meta)" subtitle={locale === "de" ? "Browser-Titel und Meta-Beschreibung der Startseite" : locale === "tr" ? "Ana sayfanın tarayıcı başlığı ve meta açıklaması" : locale === "fr" ? "Titre du navigateur et méta-description de la page d'accueil" : locale === "es" ? "Título del navegador y meta-descripción de la página de inicio" : locale === "it" ? "Titolo del browser e meta-descrizione della home page" : "Browser title and meta description of the home page"}>
            <BlockStack gap="300">
                <Text as="p" tone="subdued">
                  {locale === "de" ? "Hier kannst du den Browser-Titel und die Meta-Beschreibung der Startseite setzen." : locale === "tr" ? "Ana sayfanın tarayıcı başlığını ve meta açıklamasını buradan ayarlayabilirsin." : locale === "fr" ? "Vous pouvez définir ici le titre du navigateur et la méta-description de la page d'accueil." : locale === "es" ? "Aquí puedes configurar el título del navegador y la meta-descripción de la página de inicio." : locale === "it" ? "Qui puoi impostare il titolo del browser e la meta-descrizione della home page." : "Here you can set the browser title and meta description of the home page."}
                </Text>
                <TextField
                  label="Homepage Meta Title"
                  value={styles?.seo_home_title || ""}
                  onChange={(v) => setStyles((prev) => ({ ...prev, seo_home_title: v }))}
                  autoComplete="off"
                  placeholder="e.g. Banzano - Your Marketplace"
                />
                <TextField
                  label="Homepage Meta Description"
                  value={styles?.seo_home_description || ""}
                  onChange={(v) => setStyles((prev) => ({ ...prev, seo_home_description: v }))}
                  autoComplete="off"
                  multiline={3}
                  placeholder={locale === "de" ? "Kurze Beschreibung fuer Suchergebnisse und Social Preview" : "Short description for search results and social preview"}
                />
              </BlockStack>
          </AccordionCard>
        )}
        <AccordionCard title="Branding (Shop &amp; Sellercentral)" subtitle={locale === "de" ? "Logos, Favicons, Größe und Abstände — getrennt für Desktop, Tablet und Mobil" : locale === "tr" ? "Logolar, faviconlar, boyut ve boşluklar — masaüstü, tablet ve mobil için ayrı" : locale === "fr" ? "Logos, favicons, taille et espacements — séparés pour bureau, tablette et mobile" : locale === "es" ? "Logos, favicons, tamaño y márgenes — separados para escritorio, tablet y móvil" : locale === "it" ? "Loghi, favicon, dimensione e spaziature — separati per desktop, tablet e mobile" : "Logos, favicons, size and spacing — separate for desktop, tablet and mobile"}>
            <BlockStack gap="500">

              {/* Device tabs */}
              <div style={{ display: "flex", gap: 0, borderBottom: "1px solid #e5e7eb" }}>
                {["desktop", "tablet", "mobile"].map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setLogoActiveDevice(d)}
                    style={{
                      padding: "8px 20px", border: "none", background: "transparent", cursor: "pointer",
                      fontSize: 13, fontWeight: logoActiveDevice === d ? 700 : 500,
                      color: logoActiveDevice === d ? "#111827" : "#6b7280",
                      borderBottom: logoActiveDevice === d ? "2px solid #1f2937" : "2px solid transparent",
                      marginBottom: -1,
                    }}
                  >
                    {d === "desktop" ? "Desktop" : d === "tablet" ? "Tablet" : "Mobile"}
                  </button>
                ))}
              </div>

              {/* Per-logo sections */}
              {[
                { section: "shop", label: "Shop Logo" },
                { section: "sellercentral", label: "Sellercentral Logo" },
              ].map(({ section, label }) => {
                const dev = branding.logo_config?.[section]?.[logoActiveDevice] || {};
                const updateDev = (patch) =>
                  setBranding((p) => ({
                    ...p,
                    logo_config: {
                      ...p.logo_config,
                      [section]: {
                        ...p.logo_config?.[section],
                        [logoActiveDevice]: { ...(p.logo_config?.[section]?.[logoActiveDevice] || {}), ...patch },
                      },
                    },
                  }));
                const pickerKey = `logo_${section}_${logoActiveDevice}`;
                return (
                  <div key={section} style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 16 }}>
                    <Text as="h3" variant="headingSm">{label} — {logoActiveDevice === "desktop" ? "Desktop" : logoActiveDevice === "tablet" ? "Tablet" : "Mobile"}</Text>
                    <div style={{ marginTop: 12 }}>
                      <InlineStack gap="200" blockAlign="end" wrap>
                        <div style={{ flex: 1, minWidth: 260 }}>
                          <TextField
                            label="URL"
                            value={dev.url || ""}
                            onChange={(v) => updateDev({ url: v })}
                            placeholder={c.urlPlaceholder}
                            autoComplete="off"
                          />
                        </div>
                        <Button size="slim" onClick={() => setBrandingPickerTarget(pickerKey)}>{locale === "de" ? "Aus Medien" : locale === "tr" ? "Medyadan seç" : locale === "fr" ? "Depuis les médias" : locale === "es" ? "Desde medios" : locale === "it" ? "Da media" : "From media"}</Button>
                        {(dev.url || "").trim() ? (
                          <Button size="slim" tone="critical" variant="plain" onClick={() => updateDev({ url: "" })}>{ui.remove}</Button>
                        ) : null}
                      </InlineStack>
                    </div>

                    {(dev.url || "").trim() && (
                      <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "1fr auto", gap: 16, alignItems: "start" }}>
                        <div>
                          <NumericTextField
                            label={locale === "de" ? "Größe (px)" : "Size (px)"}
                            value={logoSlotSize(dev, section === "shop" ? 34 : 30)}
                            min={8}
                            max={400}
                            fallback={section === "shop" ? 34 : 30}
                            onChange={(n) => updateDev({ size: n, height: n })}
                            helpText={locale === "de" ? "Anzeigegröße des Logos; Breite passt sich proportional an." : locale === "tr" ? "Logonun görüntü boyutu; genişlik orantılı olarak uyum sağlar." : locale === "fr" ? "Taille d'affichage du logo ; la largeur s'adapte proportionnellement." : locale === "es" ? "Tamaño de visualización del logo; el ancho se adapta proporcionalmente." : locale === "it" ? "Dimensione di visualizzazione del logo; la larghezza si adatta proporzionalmente." : "Display size of the logo; width adapts proportionally."}
                          />
                          <div style={{ marginTop: 8, marginBottom: 14 }}>
                            <button
                              type="button"
                              style={{ fontSize: 12, color: "#008060", background: "none", border: "1px solid #008060", borderRadius: 6, padding: "4px 10px", cursor: "pointer" }}
                              onClick={() => {
                                const img = new Image();
                                img.onload = () => {
                                  const size = Math.min(400, Math.round(Math.max(img.naturalHeight, img.naturalWidth)));
                                  updateDev({ size, height: size });
                                };
                                img.src = dev.url;
                              }}
                            >{locale === "de" ? "Originalgröße" : locale === "tr" ? "Orijinal boyut" : locale === "fr" ? "Taille originale" : locale === "es" ? "Tamaño original" : locale === "it" ? "Dimensione originale" : "Original size"}</button>
                          </div>

                          {/* Padding */}
                          <Text as="span" variant="bodySm" fontWeight="medium">Padding (px)</Text>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8, marginTop: 6 }}>
                            {[
                              { k: "pt", label: locale === "de" ? "Oben" : locale === "tr" ? "Üst" : locale === "fr" ? "Haut" : locale === "es" ? "Arriba" : locale === "it" ? "Alto" : "Top" },
                              { k: "pr", label: locale === "de" ? "Rechts" : locale === "tr" ? "Sağ" : locale === "fr" ? "Droite" : locale === "es" ? "Derecha" : locale === "it" ? "Destra" : "Right" },
                              { k: "pb", label: locale === "de" ? "Unten" : locale === "tr" ? "Alt" : locale === "fr" ? "Bas" : locale === "es" ? "Abajo" : locale === "it" ? "Basso" : "Bottom" },
                              { k: "pl", label: locale === "de" ? "Links" : locale === "tr" ? "Sol" : locale === "fr" ? "Gauche" : locale === "es" ? "Izquierda" : locale === "it" ? "Sinistra" : "Left" },
                            ].map(({ k, label: pl }) => (
                              <div key={k}>
                                <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 3 }}>{pl}</div>
                                <NumericInput
                                  value={dev[k] ?? 0}
                                  min={0}
                                  max={80}
                                  fallback={0}
                                  onChange={(n) => updateDev({ [k]: n })}
                                  style={{ width: "100%", padding: "6px 8px", border: "1.5px solid #d1d5db", borderRadius: 6, fontSize: 13, textAlign: "center", boxSizing: "border-box" }}
                                />
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Live preview */}
                        <div style={{
                          background: "#f3f4f6", border: "1px solid #e5e7eb", borderRadius: 8,
                          display: "inline-flex", alignItems: "center", justifyContent: "center",
                          minWidth: 80,
                        }}>
                          <img
                            src={dev.url}
                            alt="preview"
                            style={{
                              height: Math.min(logoSlotSize(dev, section === "shop" ? 34 : 30), 200),
                              width: "auto",
                              maxWidth: 160,
                              objectFit: "contain",
                              display: "block",
                              paddingTop: dev.pt || 0,
                              paddingRight: dev.pr || 0,
                              paddingBottom: dev.pb || 0,
                              paddingLeft: dev.pl || 0,
                            }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Favicons (device-independent) */}
              <Divider />
              <Text as="h3" variant="headingSm">Favicons</Text>
              {[
                { key: "shop_favicon_url", label: "Shop Favicon" },
                { key: "sellercentral_favicon_url", label: "Sellercentral Favicon" },
              ].map((row) => (
                <div key={row.key}>
                  <InlineStack gap="200" blockAlign="end" wrap>
                    <div style={{ flex: 1, minWidth: 280 }}>
                      <TextField
                        label={row.label}
                        value={branding[row.key] || ""}
                        onChange={(v) => setBranding((p) => ({ ...p, [row.key]: v }))}
                        placeholder={c.urlPlaceholder}
                        autoComplete="off"
                      />
                    </div>
                    <Button size="slim" onClick={() => setBrandingPickerTarget(row.key)}>{locale === "de" ? "Aus Medien" : locale === "tr" ? "Medyadan seç" : locale === "fr" ? "Depuis les médias" : locale === "es" ? "Desde medios" : locale === "it" ? "Da media" : "From media"}</Button>
                    {(branding[row.key] || "").trim() ? (
                      <Button size="slim" tone="critical" variant="plain" onClick={() => setBranding((p) => ({ ...p, [row.key]: "" }))}>{ui.remove}</Button>
                    ) : null}
                  </InlineStack>
                </div>
              ))}

              {/* Bestseller Badge Image */}
              <Divider />
              <Text as="h3" variant="headingSm">{locale === "de" ? "Bestseller-Abzeichen Bild" : locale === "tr" ? "Çok Satan Rozet Görseli" : locale === "fr" ? "Image du badge Bestseller" : locale === "es" ? "Imagen de insignia Bestseller" : locale === "it" ? "Immagine badge Bestseller" : "Bestseller Badge Image"}</Text>
              <Text as="p" variant="bodySm" tone="subdued">
                {locale === "tr" ? "Özel bir görsel eklendiğinde, tüm etiket bu görselle değiştirilir — arka plan olmadan. PNG veya SVG (şeffaf arka plan önerilir)." : locale === "de" ? "Eigenes Bild für das Bestseller-Etikett — ersetzt das gesamte Etikett ohne Hintergrund. PNG oder SVG (transparenter Hintergrund empfohlen)." : locale === "fr" ? "Image personnalisée pour l'étiquette Bestseller — remplace l'étiquette entière sans fond. PNG ou SVG (fond transparent recommandé)." : locale === "es" ? "Imagen personalizada para la etiqueta Bestseller — reemplaza la etiqueta completa sin fondo. PNG o SVG (fondo transparente recomendado)." : locale === "it" ? "Immagine personalizzata per il badge Bestseller — sostituisce l'intero badge senza sfondo. PNG o SVG (sfondo trasparente consigliato)." : "Custom image for the bestseller badge — replaces the entire badge with no background. PNG or SVG (transparent background recommended)."}
              </Text>
              <Text as="p" variant="bodySm" tone="subdued">
                {locale === "tr" ? "Tablet/Mobil boş bırakılırsa bir üstteki (daha geniş) değer kullanılır." : locale === "de" ? "Wenn Tablet/Mobil leer bleibt, wird der nächstgrößere Wert verwendet." : locale === "fr" ? "Si Tablette/Mobile est vide, la valeur du point de rupture plus large est utilisée." : locale === "es" ? "Si Tablet/Móvil está vacío, se usa el valor del punto de ruptura más ancho." : locale === "it" ? "Se Tablet/Mobile è vuoto, viene usato il valore del breakpoint più largo." : "If Tablet/Mobile is left empty, the next wider breakpoint's value is used."}
              </Text>
              <InlineStack gap="200" blockAlign="end" wrap>
                <div style={{ flex: 1, minWidth: 280 }}>
                  <TextField
                    label={locale === "de" ? "Bild-URL" : "Image URL"}
                    value={styles?.bestseller_badge?.image_url || ""}
                    onChange={(v) =>
                      setStyles((prev) => ({
                        ...prev,
                        bestseller_badge: { ...(prev.bestseller_badge || {}), image_url: v },
                      }))
                    }
                    placeholder="https://..."
                    autoComplete="off"
                  />
                </div>
                <div style={{ width: 100 }}>
                  <NumericTextField
                    label={locale === "tr" ? "Masaüstü (px)" : locale === "de" ? "Desktop (px)" : "Desktop (px)"}
                    value={styles?.bestseller_badge?.badge_width ?? 80}
                    min={10}
                    max={400}
                    fallback={80}
                    onChange={(n) =>
                      setStyles((prev) => ({
                        ...prev,
                        bestseller_badge: { ...(prev.bestseller_badge || {}), badge_width: n },
                      }))
                    }
                  />
                </div>
                <div style={{ width: 100 }}>
                  <NumericTextField
                    label={locale === "tr" ? "Tablet (px)" : "Tablet (px)"}
                    placeholder={String(styles?.bestseller_badge?.badge_width || 80)}
                    value={styles?.bestseller_badge?.badge_width_tablet ?? null}
                    min={10}
                    max={400}
                    allowEmpty
                    onChange={(n) =>
                      setStyles((prev) => ({
                        ...prev,
                        bestseller_badge: {
                          ...(prev.bestseller_badge || {}),
                          badge_width_tablet: n,
                        },
                      }))
                    }
                  />
                </div>
                <div style={{ width: 100 }}>
                  <NumericTextField
                    label={locale === "tr" ? "Mobil (px)" : locale === "de" ? "Mobil (px)" : "Mobile (px)"}
                    placeholder={String(styles?.bestseller_badge?.badge_width_tablet || styles?.bestseller_badge?.badge_width || 80)}
                    value={styles?.bestseller_badge?.badge_width_mobile ?? null}
                    min={10}
                    max={400}
                    allowEmpty
                    onChange={(n) =>
                      setStyles((prev) => ({
                        ...prev,
                        bestseller_badge: {
                          ...(prev.bestseller_badge || {}),
                          badge_width_mobile: n,
                        },
                      }))
                    }
                  />
                </div>
                <Button size="slim" onClick={() => setBrandingPickerTarget("bestseller_badge_image")}>{locale === "de" ? "Aus Medien" : locale === "tr" ? "Medyadan seç" : locale === "fr" ? "Depuis les médias" : locale === "es" ? "Desde medios" : locale === "it" ? "Da media" : "From media"}</Button>
                {(styles?.bestseller_badge?.image_url || "").trim() ? (
                  <Button
                    size="slim"
                    tone="critical"
                    variant="plain"
                    onClick={() =>
                      setStyles((prev) => ({
                        ...prev,
                        bestseller_badge: { ...(prev.bestseller_badge || {}), image_url: "" },
                      }))
                    }
                  >
                    {ui.remove}
                  </Button>
                ) : null}
              </InlineStack>
              {(styles?.bestseller_badge?.image_url || "").trim() ? (
                <img
                  src={styles.bestseller_badge.image_url}
                  alt=""
                  style={{ width: styles?.bestseller_badge?.badge_width || 80, height: "auto", objectFit: "contain" }}
                />
              ) : null}
            </BlockStack>
        </AccordionCard>

        {isSuperuser && (
          <AccordionCard
            title="Made in Europe Badge (Shop)"
            subtitle={locale === "de" ? "Overlay auf der Produkt-Hauptbildfläche — nur bei verifiziertem EU-Ursprung" : locale === "tr" ? "Ürün ana görsel alanındaki overlay — yalnızca doğrulanmış AB menşeinde" : locale === "fr" ? "Superposition sur la surface d'image principale du produit — uniquement pour l'origine UE vérifiée" : locale === "es" ? "Superposición en la superficie de imagen principal del producto — solo con origen UE verificado" : locale === "it" ? "Overlay sulla superficie dell'immagine principale del prodotto — solo con origine UE verificata" : "Overlay on the product main image area — only for verified EU origin"}
          >
            <BlockStack gap="300">
              <Text as="p" tone="subdued">
                {locale === "de" ? "Bild-URL, Größe und Abstand von links/unten auf der PDP-Galerie (Desktop & Mobil)." : locale === "tr" ? "PDP galerisinde (Masaüstü & Mobil) görsel URL'si, boyut ve sol/alt boşluk." : locale === "fr" ? "URL de l'image, taille et espacement depuis la gauche/bas dans la galerie PDP (Bureau & Mobile)." : locale === "es" ? "URL de imagen, tamaño y margen desde la izquierda/abajo en la galería PDP (Escritorio & Móvil)." : locale === "it" ? "URL immagine, dimensione e spazio da sinistra/basso nella galleria PDP (Desktop & Mobile)." : "Image URL, size and spacing from left/bottom in the PDP gallery (Desktop & Mobile)."}
              </Text>
              <InlineStack gap="200" blockAlign="center">
                <Button size="slim" onClick={() => setBrandingPickerTarget("made_in_europe_badge_image")}>
                  {locale === "de" ? "Badge-Bild aus Medien" : locale === "tr" ? "Rozet görselini medyadan seç" : locale === "fr" ? "Image du badge depuis les médias" : locale === "es" ? "Imagen de insignia desde medios" : locale === "it" ? "Immagine badge da media" : "Badge image from media"}
                </Button>
                {(styles?.made_in_europe_badge?.image_url || "").trim() ? (
                  <Button
                    size="slim"
                    tone="critical"
                    variant="plain"
                    onClick={() =>
                      setStyles((prev) => ({
                        ...prev,
                        made_in_europe_badge: { ...(prev.made_in_europe_badge || {}), image_url: "" },
                      }))
                    }
                  >
                    {ui.remove}
                  </Button>
                ) : null}
              </InlineStack>
              {(styles?.made_in_europe_badge?.image_url || "").trim() ? (
                <img
                  src={styles.made_in_europe_badge.image_url}
                  alt=""
                  style={{ maxWidth: 200, maxHeight: 80, objectFit: "contain" }}
                />
              ) : null}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 12 }}>
                <NumericTextField
                  label={locale === "de" ? "Breite (px)" : "Width (px)"}
                  value={styles?.made_in_europe_badge?.width ?? 88}
                  min={1}
                  max={400}
                  fallback={88}
                  onChange={(n) =>
                    setStyles((prev) => ({
                      ...prev,
                      made_in_europe_badge: { ...(prev.made_in_europe_badge || {}), width: n },
                    }))
                  }
                />
                <NumericTextField
                  label={locale === "de" ? "Höhe (px)" : "Height (px)"}
                  value={styles?.made_in_europe_badge?.height ?? 32}
                  min={1}
                  max={400}
                  fallback={32}
                  onChange={(n) =>
                    setStyles((prev) => ({
                      ...prev,
                      made_in_europe_badge: { ...(prev.made_in_europe_badge || {}), height: n },
                    }))
                  }
                />
                <NumericTextField
                  label={locale === "de" ? "Abstand links (px)" : locale === "tr" ? "Sol boşluk (px)" : locale === "fr" ? "Marge gauche (px)" : locale === "es" ? "Margen izquierdo (px)" : locale === "it" ? "Margine sinistro (px)" : "Left offset (px)"}
                  value={styles?.made_in_europe_badge?.offset_left ?? 10}
                  min={0}
                  max={400}
                  fallback={0}
                  onChange={(n) =>
                    setStyles((prev) => ({
                      ...prev,
                      made_in_europe_badge: { ...(prev.made_in_europe_badge || {}), offset_left: n },
                    }))
                  }
                />
                <NumericTextField
                  label={locale === "de" ? "Abstand unten (px)" : locale === "tr" ? "Alt boşluk (px)" : locale === "fr" ? "Marge bas (px)" : locale === "es" ? "Margen inferior (px)" : locale === "it" ? "Margine inferiore (px)" : "Bottom offset (px)"}
                  value={styles?.made_in_europe_badge?.offset_bottom ?? 10}
                  min={0}
                  max={400}
                  fallback={0}
                  onChange={(n) =>
                    setStyles((prev) => ({
                      ...prev,
                      made_in_europe_badge: { ...(prev.made_in_europe_badge || {}), offset_bottom: n },
                    }))
                  }
                />
              </div>
            </BlockStack>
          </AccordionCard>
        )}

        <AccordionCard title={locale === "de" ? "Website-Farben" : locale === "tr" ? "Web Sitesi Renkleri" : locale === "fr" ? "Couleurs du site" : locale === "es" ? "Colores del sitio" : locale === "it" ? "Colori del sito" : "Website Colors"}>
            <BlockStack gap="400">
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 16 }}>
                <ColorField label={locale === "de" ? "Primärfarbe" : locale === "tr" ? "Birincil renk" : locale === "fr" ? "Couleur primaire" : locale === "es" ? "Color primario" : locale === "it" ? "Colore primario" : "Primary color"} value={styles.colors.primary} onChange={(v) => updateColor("primary", v)} />
                <ColorField label={locale === "de" ? "Sekundärfarbe" : locale === "tr" ? "İkincil renk" : locale === "fr" ? "Couleur secondaire" : locale === "es" ? "Color secundario" : locale === "it" ? "Colore secondario" : "Secondary color"} value={styles.colors.secondary} onChange={(v) => updateColor("secondary", v)} />
                <ColorField label={locale === "de" ? "Akzentfarbe" : locale === "tr" ? "Vurgu rengi" : locale === "fr" ? "Couleur d'accentuation" : locale === "es" ? "Color de acento" : locale === "it" ? "Colore accento" : "Accent color"} value={styles.colors.accent} onChange={(v) => updateColor("accent", v)} />
                <ColorField label={locale === "de" ? "Textfarbe" : locale === "tr" ? "Metin rengi" : locale === "fr" ? "Couleur du texte" : locale === "es" ? "Color de texto" : locale === "it" ? "Colore testo" : "Text color"} value={styles.colors.text} onChange={(v) => updateColor("text", v)} />
                <ColorField label={locale === "de" ? "Hintergrundfarbe" : locale === "tr" ? "Arka plan rengi" : locale === "fr" ? "Couleur d'arrière-plan" : locale === "es" ? "Color de fondo" : locale === "it" ? "Colore sfondo" : "Background color"} value={styles.colors.background} onChange={(v) => updateColor("background", v)} />
              </div>

              {/* Live preview swatches */}
              <InlineStack gap="300" wrap>
                {Object.entries(styles.colors).map(([key, val]) => (
                  <div key={key} style={{ textAlign: "center" }}>
                    <div style={{ width: 40, height: 40, borderRadius: 8, background: val || "#fff", border: "1px solid var(--p-color-border)", margin: "0 auto 4px" }} />
                    <Text as="p" variant="bodySm" tone="subdued">{key}</Text>
                  </div>
                ))}
              </InlineStack>
            </BlockStack>
        </AccordionCard>

        <AccordionCard title={locale === "de" ? "Typografie" : locale === "tr" ? "Tipografi" : locale === "fr" ? "Typographie" : locale === "es" ? "Tipografía" : locale === "it" ? "Tipografia" : "Typography"} subtitle={locale === "de" ? "Schriftarten, Größen und Gewichte" : locale === "tr" ? "Yazı tipleri, boyutlar ve ağırlıklar" : locale === "fr" ? "Polices, tailles et graisses" : locale === "es" ? "Fuentes, tamaños y pesos" : locale === "it" ? "Caratteri, dimensioni e pesi" : "Fonts, sizes and weights"}>
            <BlockStack gap="500">
              <Banner tone="info">
                <p>
                  {locale === "de" ? <>Die Liste enthält Schriften aus <strong>Google Fonts</strong>. Schriften wie Arial, Calibri oder Helvetica sind <strong>Betriebssystem-/Office-Fonts</strong> und stehen dort nicht — sie können Sie pro Ebene unter „Eigene font-family (CSS)" eintragen. Eigenlizenzierte Webfonts binden Sie per @font-face / Theme.</> : locale === "tr" ? <>Liste <strong>Google Fonts</strong> yazı tiplerini içerir. Arial, Calibri gibi fontlar <strong>sistem fontları</strong>dır — bunları "Özel font-family (CSS)" alanına girebilirsiniz.</> : locale === "fr" ? <>La liste contient des polices de <strong>Google Fonts</strong>. Les polices comme Arial ou Calibri sont des <strong>polices système</strong> — saisissez-les sous "Police personnalisée (CSS)".</> : locale === "es" ? <>La lista contiene fuentes de <strong>Google Fonts</strong>. Fuentes como Arial o Calibri son <strong>fuentes de sistema</strong> — introdúcelas en "Fuente personalizada (CSS)".</> : locale === "it" ? <>La lista contiene font da <strong>Google Fonts</strong>. Font come Arial o Calibri sono <strong>font di sistema</strong> — inseriscili in "Font-family personalizzato (CSS)".</> : <>The list contains fonts from <strong>Google Fonts</strong>. Fonts like Arial or Calibri are <strong>OS/Office fonts</strong> and are not listed there — enter them per level under "Custom font-family (CSS)".</>}
                </p>
              </Banner>
              <Divider />
              <TypographyLevelRow
                heading="H1"
                levelKey="h1"
                typo={styles.typography}
                families={googleFontList || []}
                familiesLoading={googleFontsLoading}
                onLevelChange={updateTypoLevel}
              />
              <Divider />
              <TypographyLevelRow
                heading="H2"
                levelKey="h2"
                typo={styles.typography}
                families={googleFontList || []}
                familiesLoading={googleFontsLoading}
                onLevelChange={updateTypoLevel}
              />
              <Divider />
              <TypographyLevelRow
                heading="H3"
                levelKey="h3"
                typo={styles.typography}
                families={googleFontList || []}
                familiesLoading={googleFontsLoading}
                onLevelChange={updateTypoLevel}
              />
              <Divider />
              <TypographyLevelRow
                heading="H4"
                levelKey="h4"
                typo={styles.typography}
                families={googleFontList || []}
                familiesLoading={googleFontsLoading}
                onLevelChange={updateTypoLevel}
              />
              <Divider />
              <TypographyLevelRow
                heading="H5"
                levelKey="h5"
                typo={styles.typography}
                families={googleFontList || []}
                familiesLoading={googleFontsLoading}
                onLevelChange={updateTypoLevel}
              />
              <Divider />
              <TypographyLevelRow
                heading="Body"
                levelKey="body"
                typo={styles.typography}
                families={googleFontList || []}
                familiesLoading={googleFontsLoading}
                onLevelChange={updateTypoLevel}
              />
              <Divider />
              <button
                type="button"
                onClick={() => setCatalogNavOpen((v) => !v)}
                aria-expanded={catalogNavOpen}
                aria-controls="catalog-navigation-settings"
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  background: "var(--p-color-bg-surface-secondary)",
                  border: "1px solid var(--p-color-border)",
                  borderRadius: 8,
                  padding: "10px 12px",
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                <Text as="span" variant="headingSm">
                  {locale === "de" ? "Katalog & Navigation" : locale === "tr" ? "Katalog & Navigasyon" : locale === "fr" ? "Catalogue & Navigation" : locale === "es" ? "Catálogo & Navegación" : locale === "it" ? "Catalogo & Navigazione" : "Catalog & Navigation"}
                </Text>
                <span
                  aria-hidden
                  style={{
                    fontSize: 14,
                    lineHeight: 1,
                    transform: catalogNavOpen ? "rotate(90deg)" : "rotate(0deg)",
                    transition: "transform 160ms ease",
                  }}
                >
                  ▶
                </span>
              </button>
              {catalogNavOpen && (
                <BlockStack id="catalog-navigation-settings" gap="400">
                  <Text as="p" variant="bodySm" tone="subdued">
                    {locale === "de" ? "Unabhängig von H1–H5 im Fließtext: Produktname, Listen-Überschriften und Kategorie-Menü separat steuern." : locale === "tr" ? "H1–H5'den bağımsız: Ürün adı, liste başlıkları ve kategori menüsünü ayrı ayrı kontrol edin." : locale === "fr" ? "Indépendant de H1–H5 dans le texte courant : contrôlez le nom du produit, les en-têtes de liste et le menu catégorie séparément." : locale === "es" ? "Independiente de H1–H5 en el texto: controla el nombre del producto, encabezados de lista y menú de categoría por separado." : locale === "it" ? "Indipendente da H1–H5 nel testo: controlla separatamente il nome del prodotto, le intestazioni di lista e il menu categorie." : "Independent of H1–H5 in body text: control product name, list headings and category menu separately."}
                  </Text>
                  <Divider />
                  <TypographyLevelRow
                    heading={locale === "de" ? "Produkttitel (Produktseite)" : "Product title (product page)"}
                    levelKey="product_title"
                    typo={styles.typography}
                    families={googleFontList || []}
                    familiesLoading={googleFontsLoading}
                    onLevelChange={updateTypoLevel}
                  />
                  <Divider />
                  <TypographyLevelRow
                    heading={locale === "de" ? "Katalog-Titel (Kategorien, Kollektionen, Marken-Seiten)" : "Catalog title (categories, collections, brand pages)"}
                    levelKey="catalog_title"
                    typo={styles.typography}
                    families={googleFontList || []}
                    familiesLoading={googleFontsLoading}
                    onLevelChange={updateTypoLevel}
                  />
                  <Divider />
                  <TypographyLevelRow
                    heading={locale === "de" ? "Menü: Kategorien-Dropdown" : "Menu: categories dropdown"}
                    levelKey="menu_catalog"
                    typo={styles.typography}
                    families={googleFontList || []}
                    familiesLoading={googleFontsLoading}
                    onLevelChange={updateTypoLevel}
                  />
                </BlockStack>
              )}
          </BlockStack>
        </AccordionCard>

        {/* Top Bar */}
        <AccordionCard title="Layout: Top Bar">
          <BlockStack gap="400">
              <Checkbox
                label={c.topBarShowInShop}
                checked={!!styles.topbar.enabled}
                onChange={(checked) => updateSection("topbar", "enabled", checked)}
              />
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 16 }}>
                <Select
                  label={c.entriesDisplay}
                  options={c.topbarDisplayModeOptions}
                  value={styles.topbar.display_mode === "carousel" ? "carousel" : "inline"}
                  onChange={(v) => updateSection("topbar", "display_mode", v)}
                  disabled={!styles.topbar.enabled}
                />
                <NumericTextField
                  label={c.carouselInterval}
                  value={styles.topbar.carousel_interval_sec ?? 5}
                  min={2}
                  max={120}
                  fallback={5}
                  disabled={!styles.topbar.enabled || styles.topbar.display_mode !== "carousel"}
                  helpText={c.carouselIntervalHelp}
                  onChange={(n) => updateSection("topbar", "carousel_interval_sec", n)}
                />
              </div>
              <Banner tone="info">
                <p>{c.carouselBanner}</p>
              </Banner>
              <Divider />
              <Text as="h3" variant="headingSm">{c.topBarEntries}</Text>
              <BlockStack gap="300">
                {(styles.topbar.items || []).map((item, idx) => (
                  <div key={idx} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                    <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                      <TextField
                        label={idx === 0 ? c.text : undefined}
                        placeholder={c.topBarTextPh}
                        value={item.text || ""}
                        disabled={!styles.topbar.enabled}
                        onChange={(v) => {
                          const next = [...(styles.topbar.items || [])];
                          next[idx] = { ...next[idx], text: v };
                          setStyles((prev) => ({ ...prev, topbar: { ...prev.topbar, items: next } }));
                        }}
                        autoComplete="off"
                      />
                      <TextField
                        label={idx === 0 ? c.linkHref : undefined}
                        placeholder={c.topBarHrefPh}
                        value={item.href || ""}
                        disabled={!styles.topbar.enabled}
                        onChange={(v) => {
                          const next = [...(styles.topbar.items || [])];
                          next[idx] = { ...next[idx], href: v };
                          setStyles((prev) => ({ ...prev, topbar: { ...prev.topbar, items: next } }));
                        }}
                        autoComplete="off"
                      />
                    </div>
                    <div style={{ display: "flex", gap: 4, paddingTop: idx === 0 ? 22 : 0 }}>
                      <button
                        type="button"
                        disabled={idx === 0 || !styles.topbar.enabled}
                        onClick={() => {
                          const next = [...(styles.topbar.items || [])];
                          [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
                          setStyles((prev) => ({ ...prev, topbar: { ...prev.topbar, items: next } }));
                        }}
                        title={c.moveUp}
                        style={{ padding: "4px 8px", cursor: idx === 0 ? "default" : "pointer", opacity: idx === 0 ? 0.3 : 1, border: "1px solid #d1d5db", borderRadius: 4, background: "#f9fafb" }}
                      >↑</button>
                      <button
                        type="button"
                        disabled={idx === (styles.topbar.items || []).length - 1 || !styles.topbar.enabled}
                        onClick={() => {
                          const next = [...(styles.topbar.items || [])];
                          [next[idx + 1], next[idx]] = [next[idx], next[idx + 1]];
                          setStyles((prev) => ({ ...prev, topbar: { ...prev.topbar, items: next } }));
                        }}
                        title={c.moveDown}
                        style={{ padding: "4px 8px", cursor: idx === (styles.topbar.items || []).length - 1 ? "default" : "pointer", opacity: idx === (styles.topbar.items || []).length - 1 ? 0.3 : 1, border: "1px solid #d1d5db", borderRadius: 4, background: "#f9fafb" }}
                      >↓</button>
                      <button
                        type="button"
                        disabled={!styles.topbar.enabled}
                        onClick={() => {
                          const next = (styles.topbar.items || []).filter((_, i) => i !== idx);
                          setStyles((prev) => ({ ...prev, topbar: { ...prev.topbar, items: next } }));
                        }}
                        title={c.remove}
                        style={{ padding: "4px 8px", cursor: "pointer", border: "1px solid #fca5a5", borderRadius: 4, background: "#fef2f2", color: "#dc2626" }}
                      >✕</button>
                    </div>
                  </div>
                ))}
                <div>
                  <button
                    type="button"
                    disabled={!styles.topbar.enabled}
                    onClick={() => {
                      const next = [...(styles.topbar.items || []), { text: "", href: "" }];
                      setStyles((prev) => ({ ...prev, topbar: { ...prev.topbar, items: next } }));
                    }}
                    style={{ padding: "6px 14px", border: "1px solid #d1d5db", borderRadius: 6, background: "#f9fafb", cursor: styles.topbar.enabled ? "pointer" : "default", fontSize: 13, opacity: styles.topbar.enabled ? 1 : 0.5 }}
                  >
                    {c.addEntry}
                  </button>
                </div>
              </BlockStack>
              <Divider />
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 16 }}>
                <Select
                  label={c.stylePreset}
                  options={c.topbarPresetOptions}
                  value={styles.topbar.variant || "default"}
                  onChange={(v) => updateSection("topbar", "variant", v)}
                />
                <ColorField
                  label={c.bgColor}
                  value={styles.topbar.bg_color}
                  onChange={(v) => updateSection("topbar", "bg_color", v)}
                />
                <ColorField
                  label={c.textColor}
                  value={styles.topbar.text_color}
                  onChange={(v) => updateSection("topbar", "text_color", v)}
                />
                <TextField
                  label={c.height}
                  value={styles.topbar.height}
                  onChange={(v) => updateSection("topbar", "height", v)}
                  autoComplete="off"
                />
                <TextField
                  label={c.fontSize}
                  value={styles.topbar.font_size}
                  onChange={(v) => updateSection("topbar", "font_size", v)}
                  autoComplete="off"
                />
                <TextField
                  label={c.fontWeight}
                  value={styles.topbar.font_weight}
                  onChange={(v) => updateSection("topbar", "font_weight", v)}
                  autoComplete="off"
                />
                <TextField
                  label={c.shadow}
                  value={styles.topbar.shadow || ""}
                  onChange={(v) => updateSection("topbar", "shadow", v)}
                  autoComplete="off"
                />
                <TextField
                  label={c.borderBottom}
                  value={styles.topbar.border_bottom || ""}
                  onChange={(v) => updateSection("topbar", "border_bottom", v)}
                  autoComplete="off"
                />
              </div>
          </BlockStack>
        </AccordionCard>

        {/* Header / Navbar */}
        <AccordionCard title="Layout: Header / Navbar">
          <BlockStack gap="400">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 16 }}>
              <Select
                label={c.stylePreset}
                options={c.headerPresetOptions}
                value={styles.header.variant || "default"}
                onChange={(v) => updateSection("header", "variant", v)}
              />
              <ColorField
                label={c.headerBgColorGradientStart}
                value={styles.header.bg_color}
                onChange={(v) => updateSection("header", "bg_color", v)}
              />
              <div style={{ gridColumn: "1 / -1" }}>
                <BlockStack gap="300">
                  <Text as="p" variant="bodySm" tone="subdued">
                    <strong>{c.gradientBgHeading}</strong> {c.gradientBgDesc}
                  </Text>
                  <Checkbox
                    label={c.gradientFallback}
                    checked={!!styles.header.bg_gradient_enabled}
                    onChange={(v) => updateSection("header", "bg_gradient_enabled", v)}
                  />
                  <InlineStack gap="400" wrap blockAlign="center">
                    <Checkbox
                      label={c.desktopGte1024Short}
                      checked={effectiveGradientEnabled(styles.header, "desktop")}
                      onChange={(v) => updateSection("header", "bg_gradient_enabled_desktop", v)}
                    />
                    <Checkbox
                      label={c.tablet768Short}
                      checked={effectiveGradientEnabled(styles.header, "tablet")}
                      onChange={(v) => updateSection("header", "bg_gradient_enabled_tablet", v)}
                    />
                    <Checkbox
                      label={c.mobileLte767Short}
                      checked={effectiveGradientEnabled(styles.header, "mobile")}
                      onChange={(v) => updateSection("header", "bg_gradient_enabled_mobile", v)}
                    />
                  </InlineStack>
                </BlockStack>
              </div>
              {headerGradientAnyViewport ? (
                <>
                  <ColorField
                    label={c.gradientTargetColor}
                    value={styles.header.bg_gradient_end || "#0f766e"}
                    onChange={(v) => updateSection("header", "bg_gradient_end", v)}
                  />
                  <Select
                    label={c.gradientDirection}
                    options={c.headerGradientAngleOptions}
                    value={String(styles.header.bg_gradient_angle ?? 135)}
                    onChange={(v) => updateSection("header", "bg_gradient_angle", Number(v))}
                  />
                  <NumericTextField
                    label={c.gradientIntensity}
                    value={styles.header.bg_gradient_intensity ?? 75}
                    min={0}
                    max={100}
                    fallback={0}
                    helpText={c.gradientIntensityHelp}
                    onChange={(n) => updateSection("header", "bg_gradient_intensity", n)}
                  />
                </>
              ) : null}
              <div style={{ gridColumn: "1 / -1" }}>
                <BlockStack gap="200">
                  <Text as="span" variant="bodySm" fontWeight="medium">
                    {c.bgImageOptional}
                  </Text>
                  <InlineStack gap="200" blockAlign="end" wrap>
                    <div style={{ flex: "1 1 280px", minWidth: 200 }}>
                      <TextField
                        label={c.imageUrl}
                        value={styles.header.bg_image_url || ""}
                        onChange={(v) => updateSection("header", "bg_image_url", v)}
                        placeholder="https://…"
                        autoComplete="off"
                      />
                    </div>
                    <Button onClick={() => setHeaderBgPickerScope("global")}>{c.fromMediaLibrary}</Button>
                  </InlineStack>
                </BlockStack>
              </div>
              <ColorField
                label={c.textColor}
                value={styles.header.text_color}
                onChange={(v) => updateSection("header", "text_color", v)}
              />
              <div style={{ gridColumn: "1 / -1" }}>
                <BlockStack gap="200">
                  <Text as="span" variant="bodySm" fontWeight="medium">{c.normalHeight}</Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    {c.normalHeightHelp}
                  </Text>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
                    <TextField
                      label={c.desktopGte1024}
                      value={styles.header.height_desktop || ""}
                      onChange={(v) => updateSection("header", "height_desktop", v)}
                      placeholder={styles.header.height || "72px"}
                      autoComplete="off"
                    />
                    <TextField
                      label={c.tablet768}
                      value={styles.header.height_tablet || ""}
                      onChange={(v) => updateSection("header", "height_tablet", v)}
                      placeholder={styles.header.height_desktop || styles.header.height || "72px"}
                      autoComplete="off"
                    />
                    <TextField
                      label={c.mobileLte767}
                      value={styles.header.height_mobile || ""}
                      onChange={(v) => updateSection("header", "height_mobile", v)}
                      placeholder={styles.header.height_tablet || styles.header.height_desktop || styles.header.height || "72px"}
                      autoComplete="off"
                    />
                  </div>
                </BlockStack>
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <BlockStack gap="200">
                  <Text as="span" variant="bodySm" fontWeight="medium">{c.compactHeight}</Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    {c.compactHeightHelp}
                  </Text>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
                    <TextField
                      label={c.desktopGte1024}
                      value={styles.header.compact_height_desktop || ""}
                      onChange={(v) => updateSection("header", "compact_height_desktop", v)}
                      placeholder={c.emptyNoChange}
                      autoComplete="off"
                    />
                    <TextField
                      label={c.tablet768}
                      value={styles.header.compact_height_tablet || ""}
                      onChange={(v) => updateSection("header", "compact_height_tablet", v)}
                      placeholder={c.emptyNoChange}
                      autoComplete="off"
                    />
                    <TextField
                      label={c.mobileLte767}
                      value={styles.header.compact_height_mobile || ""}
                      onChange={(v) => updateSection("header", "compact_height_mobile", v)}
                      placeholder={c.emptyNoChange}
                      autoComplete="off"
                    />
                  </div>
                </BlockStack>
              </div>
              <TextField
                label={c.shadow}
                value={styles.header.shadow}
                onChange={(v) => updateSection("header", "shadow", v)}
                autoComplete="off"
              />
              <TextField
                label={c.headerBottomBorder}
                value={styles.header.border_bottom}
                onChange={(v) => updateSection("header", "border_bottom", v)}
                autoComplete="off"
              />
            </div>
            <Divider />
            <Text as="h3" variant="headingSm">{c.pageSpecificBg}</Text>
            <Text as="p" variant="bodySm" tone="subdued">
              {c.pageSpecificBgHelp}
            </Text>
            <Select
              label={c.customizePage}
              options={[
                { label: c.categoryPages, value: "category" },
                { label: c.collectionPages, value: "collection" },
              ]}
              value={headerScopeTab}
              onChange={setHeaderScopeTab}
            />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 16 }}>
              <ColorField
                label={c.bgColor}
                value={headerScopeOverride.bg_color || ""}
                onChange={(v) => updateHeaderScopeField("bg_color", v)}
                helpText={c.emptyDefaultBg}
              />
              <div style={{ gridColumn: "1 / -1" }}>
                <BlockStack gap="300">
                  <Text as="p" variant="bodySm" tone="subdued">{c.gradientForPages}</Text>
                  <Checkbox
                    label={c.gradientFallbackShort}
                    checked={!!headerScopeOverride.bg_gradient_enabled}
                    onChange={(v) => updateHeaderScopeField("bg_gradient_enabled", v)}
                  />
                  <InlineStack gap="400" wrap blockAlign="center">
                    <Checkbox
                      label={c.desktop}
                      checked={effectiveGradientEnabled(headerScopeOverride, "desktop")}
                      onChange={(v) => updateHeaderScopeField("bg_gradient_enabled_desktop", v)}
                    />
                    <Checkbox
                      label={c.tablet}
                      checked={effectiveGradientEnabled(headerScopeOverride, "tablet")}
                      onChange={(v) => updateHeaderScopeField("bg_gradient_enabled_tablet", v)}
                    />
                    <Checkbox
                      label={c.mobile}
                      checked={effectiveGradientEnabled(headerScopeOverride, "mobile")}
                      onChange={(v) => updateHeaderScopeField("bg_gradient_enabled_mobile", v)}
                    />
                  </InlineStack>
                </BlockStack>
              </div>
              {headerScopeGradient ? (
                <>
                  <ColorField
                    label={c.gradientTargetColor}
                    value={headerScopeOverride.bg_gradient_end || ""}
                    onChange={(v) => updateHeaderScopeField("bg_gradient_end", v)}
                    helpText={c.emptyDefaultTarget}
                  />
                  <Select
                    label={c.gradientDirectionShort}
                    options={c.headerGradientAngleOptions}
                    value={String(headerScopeOverride.bg_gradient_angle ?? 135)}
                    onChange={(v) => updateHeaderScopeField("bg_gradient_angle", Number(v))}
                  />
                  <NumericTextField
                    label={c.gradientIntensity}
                    value={headerScopeOverride.bg_gradient_intensity ?? 75}
                    min={0}
                    max={100}
                    fallback={0}
                    onChange={(n) => updateHeaderScopeField("bg_gradient_intensity", n)}
                  />
                </>
              ) : null}
              <div style={{ gridColumn: "1 / -1" }}>
                <BlockStack gap="200">
                  <Text as="span" variant="bodySm" fontWeight="medium">{c.bgImage}</Text>
                  <InlineStack gap="200" blockAlign="end" wrap>
                    <div style={{ flex: "1 1 280px", minWidth: 200 }}>
                      <TextField
                        label={c.imageUrl}
                        value={headerScopeOverride.bg_image_url || ""}
                        onChange={(v) => updateHeaderScopeField("bg_image_url", v)}
                        placeholder="https://…"
                        autoComplete="off"
                      />
                    </div>
                    <Button onClick={() => setHeaderBgPickerScope(headerScopeTab)}>{c.fromMediaLibrary}</Button>
                  </InlineStack>
                </BlockStack>
              </div>
              <ColorField
                label={c.textColor}
                value={headerScopeOverride.text_color || ""}
                onChange={(v) => updateHeaderScopeField("text_color", v)}
                helpText={c.emptyDefaultText}
              />
            </div>
          </BlockStack>
        </AccordionCard>

        {/* Second Nav */}
        <AccordionCard title="Layout: Second Nav">
          <BlockStack gap="400">
            <Banner tone="info">
                <p>
                  {c.secondNavBanner1} <strong>Header</strong>.
                  {" "}{c.secondNavBanner2}{" "}
                  <strong>{c.secondNavBanner3}</strong> — {c.secondNavBanner4}{" "}
                  <strong>{c.secondNavBanner3}</strong>.
                </p>
              </Banner>
              <Divider />
              <Text as="h3" variant="headingSm">{c.secondNavRowBgBorder}</Text>
              <Text as="p" variant="bodySm" tone="subdued">
                {c.secondNavBreakpoints}{" "}
                <code style={{ fontSize: 12 }}>rgba(…)</code>,{" "}
                <code style={{ fontSize: 12 }}>linear-gradient(…)</code>).
              </Text>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 16 }}>
                <TextField
                  label={c.desktopBgCss}
                  value={styles.secondNav.bg_desktop ?? ""}
                  onChange={(v) => updateSection("secondNav", "bg_desktop", v)}
                  placeholder={c.emptyFallbackBg}
                  autoComplete="off"
                  helpText={c.bgExample}
                />
                <TextField
                  label={c.desktopBorderCss}
                  value={styles.secondNav.border_desktop ?? ""}
                  onChange={(v) => updateSection("secondNav", "border_desktop", v)}
                  placeholder={c.emptyFallbackBorder}
                  autoComplete="off"
                  helpText={c.borderExample}
                />
                <ColorField
                  label={c.desktopTextColor}
                  value={styles.secondNav.text_color_desktop ?? ""}
                  onChange={(v) => updateSection("secondNav", "text_color_desktop", v)}
                  helpText={c.emptyGlobalTextBelow}
                />
                <ColorField
                  label={c.desktopActiveColor}
                  value={styles.secondNav.active_color_desktop ?? ""}
                  onChange={(v) => updateSection("secondNav", "active_color_desktop", v)}
                  helpText={c.emptyGlobalActive}
                />
                <TextField
                  label={c.tabletBgCss}
                  value={styles.secondNav.bg_tablet ?? ""}
                  onChange={(v) => updateSection("secondNav", "bg_tablet", v)}
                  placeholder={c.emptyFallbackBg}
                  autoComplete="off"
                />
                <TextField
                  label={c.tabletBorderCss}
                  value={styles.secondNav.border_tablet ?? ""}
                  onChange={(v) => updateSection("secondNav", "border_tablet", v)}
                  placeholder={c.emptyFallbackBorder}
                  autoComplete="off"
                />
                <ColorField
                  label={c.tabletTextColor}
                  value={styles.secondNav.text_color_tablet ?? ""}
                  onChange={(v) => updateSection("secondNav", "text_color_tablet", v)}
                  helpText={c.emptyGlobalText}
                />
                <ColorField
                  label={c.tabletActiveColor}
                  value={styles.secondNav.active_color_tablet ?? ""}
                  onChange={(v) => updateSection("secondNav", "active_color_tablet", v)}
                  helpText={c.emptyGlobalActive}
                />
                <TextField
                  label={c.mobileBgCss}
                  value={styles.secondNav.bg_mobile ?? ""}
                  onChange={(v) => updateSection("secondNav", "bg_mobile", v)}
                  placeholder={c.emptyFallbackBg}
                  autoComplete="off"
                />
                <TextField
                  label={c.mobileBorderCss}
                  value={styles.secondNav.border_mobile ?? ""}
                  onChange={(v) => updateSection("secondNav", "border_mobile", v)}
                  placeholder={c.emptyFallbackBorder}
                  autoComplete="off"
                />
                <ColorField
                  label={c.mobileTextColor}
                  value={styles.secondNav.text_color_mobile ?? ""}
                  onChange={(v) => updateSection("secondNav", "text_color_mobile", v)}
                  helpText={c.emptyGlobalText}
                />
                <ColorField
                  label={c.mobileActiveColor}
                  value={styles.secondNav.active_color_mobile ?? ""}
                  onChange={(v) => updateSection("secondNav", "active_color_mobile", v)}
                  helpText={c.emptyGlobalActive}
                />
              </div>
              <Text as="p" variant="bodySm" tone="subdued">
                {c.fallbackAllDevices}
              </Text>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 16 }}>
                <TextField
                  label={c.bgFallback}
                  value={styles.secondNav.bg_color ?? ""}
                  onChange={(v) => updateSection("secondNav", "bg_color", v)}
                  autoComplete="off"
                  helpText={c.bgFallbackHelp}
                />
                <TextField
                  label={c.borderFallback}
                  value={styles.secondNav.border ?? ""}
                  onChange={(v) => updateSection("secondNav", "border", v)}
                  autoComplete="off"
                  helpText={c.borderFallbackDefault}
                />
              </div>
              <Divider />
              <Text as="h3" variant="headingSm">{c.linkStylePerDevice}</Text>
              <Text as="p" variant="bodySm" tone="subdued">
                {c.linkStylePerDeviceHelp}
              </Text>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 16 }}>
                <Select
                  label={c.desktopGte1024}
                  options={c.secondNavLinkStyleOptions}
                  value={styles.secondNav.link_style_desktop || "classic"}
                  onChange={(v) => updateSection("secondNav", "link_style_desktop", v)}
                />
                <Select
                  label={c.tablet768}
                  options={c.secondNavLinkStyleOptions}
                  value={styles.secondNav.link_style_tablet || "pill"}
                  onChange={(v) => updateSection("secondNav", "link_style_tablet", v)}
                />
                <Select
                  label={c.mobileLte767}
                  options={c.secondNavLinkStyleOptions}
                  value={styles.secondNav.link_style_mobile || "pill"}
                  onChange={(v) => updateSection("secondNav", "link_style_mobile", v)}
                />
              </div>
              <Divider />
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 16 }}>
                <Select
                  label={c.stylePreset}
                  options={c.secondNavPresetOptions}
                  value={styles.secondNav.variant || "default"}
                  onChange={(v) => updateSection("secondNav", "variant", v)}
                />
                <ColorField
                  label={c.textColor}
                  value={styles.secondNav.text_color}
                  onChange={(v) => updateSection("secondNav", "text_color", v)}
                />
                <ColorField
                  label={c.activeColor}
                  value={styles.secondNav.active_color}
                  onChange={(v) => updateSection("secondNav", "active_color", v)}
                />
                <div style={{ gridColumn: "1 / -1" }}>
                  <BlockStack gap="200">
                    <Text as="span" variant="bodySm" fontWeight="medium">{c.height}</Text>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
                      <TextField
                        label={c.desktopGte1024}
                        value={styles.secondNav.height_desktop || ""}
                        onChange={(v) => updateSection("secondNav", "height_desktop", v)}
                        placeholder={styles.secondNav.height || "44px"}
                        autoComplete="off"
                      />
                      <TextField
                        label={c.tablet768}
                        value={styles.secondNav.height_tablet || ""}
                        onChange={(v) => updateSection("secondNav", "height_tablet", v)}
                        placeholder={styles.secondNav.height_desktop || styles.secondNav.height || "44px"}
                        autoComplete="off"
                      />
                      <TextField
                        label={c.mobileLte767}
                        value={styles.secondNav.height_mobile || ""}
                        onChange={(v) => updateSection("secondNav", "height_mobile", v)}
                        placeholder={styles.secondNav.height_desktop || styles.secondNav.height || "44px"}
                        autoComplete="off"
                      />
                    </div>
                  </BlockStack>
                </div>
                <TextField
                  label={c.fontSize}
                  value={styles.secondNav.font_size}
                  onChange={(v) => updateSection("secondNav", "font_size", v)}
                  autoComplete="off"
                />
                <TextField
                  label={c.fontWeight}
                  value={styles.secondNav.font_weight}
                  onChange={(v) => updateSection("secondNav", "font_weight", v)}
                  autoComplete="off"
                />
                <div style={{ gridColumn: "1 / -1" }}>
                  <BlockStack gap="300">
                    <Checkbox
                      label={c.hideSecondNavOnScroll}
                      helpText={c.hideSecondNavOnScrollHelp}
                      checked={styles.secondNav.hide_on_scroll !== false}
                      onChange={(v) => updateSection("secondNav", "hide_on_scroll", v)}
                    />
                    {styles.secondNav.hide_on_scroll !== false && (
                      <Checkbox
                        label={c.chromeCoversOnScroll}
                        helpText={c.chromeCoversOnScrollHelp}
                        checked={styles.secondNav.chrome_covers_on_scroll === true}
                        onChange={(v) => updateSection("secondNav", "chrome_covers_on_scroll", v)}
                      />
                    )}
                  </BlockStack>
                </div>
              </div>
              <Divider />
              <Text as="h3" variant="headingSm">{c.menuTiles}</Text>
              <Text as="p" variant="bodySm" tone="subdued">
                {c.menuTilesHelp}
              </Text>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 16 }}>
                <ColorField
                  label={c.tileBgCss}
                  value={styles.secondNav.pill_background ?? ""}
                  onChange={(v) => updateSection("secondNav", "pill_background", v)}
                  preserveAlphaFromRgba
                  helpText={c.tileBgHelp}
                />
                <TextField
                  label={c.border}
                  value={styles.secondNav.pill_border ?? ""}
                  onChange={(v) => updateSection("secondNav", "pill_border", v)}
                  helpText={c.tileBorderHelp}
                  autoComplete="off"
                />
                <TextField
                  label={c.blurBackdrop}
                  value={styles.secondNav.pill_backdrop ?? ""}
                  onChange={(v) => updateSection("secondNav", "pill_backdrop", v)}
                  helpText={c.blurExample}
                  autoComplete="off"
                />
                <TextField
                  label={c.cornerRadius}
                  value={styles.secondNav.pill_border_radius ?? ""}
                  onChange={(v) => updateSection("secondNav", "pill_border_radius", v)}
                  helpText={c.cornerRadiusHelp}
                  autoComplete="off"
                />
                <TextField
                  label={c.padding}
                  value={styles.secondNav.pill_padding ?? ""}
                  onChange={(v) => updateSection("secondNav", "pill_padding", v)}
                  helpText={c.paddingExample}
                  autoComplete="off"
                />
                <TextField
                  label={c.shadow}
                  value={styles.secondNav.pill_shadow ?? ""}
                  onChange={(v) => updateSection("secondNav", "pill_shadow", v)}
                  helpText={c.shadowMostlyNone}
                  autoComplete="off"
                />
              </div>
          </BlockStack>
        </AccordionCard>

        {/* Footer */}
        <AccordionCard title="Layout: Footer">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 16 }}>
            <ColorField
              label={c.bgColor}
              value={styles.footer.bg_color}
              onChange={(v) => updateSection("footer", "bg_color", v)}
            />
            <ColorField
              label={c.textColor}
              value={styles.footer.text_color}
              onChange={(v) => updateSection("footer", "text_color", v)}
            />
            <TextField
              label={c.footerBorderTop}
              value={styles.footer.border_top}
              onChange={(v) => updateSection("footer", "border_top", v)}
              autoComplete="off"
            />
          </div>
        </AccordionCard>

        {/* Mobile scroll + bottom bar (≤1023px) */}
        <AccordionCard title={c.mobileScrollTitle} subtitle={c.mobileScrollSubtitle}>
          <BlockStack gap="400">
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 16 }}>
                <Select
                  label={c.headerOnScrollUp}
                  options={c.mobileHeaderOnScrollOptions}
                  value={styles.mobileChrome?.header_on_scroll ?? "frosted_white"}
                  onChange={(v) => updateSection("mobileChrome", "header_on_scroll", v)}
                />
                <TextField
                  label={c.frostedBg}
                  value={styles.mobileChrome?.frosted_bg ?? "rgba(255,255,255,0.92)"}
                  onChange={(v) => updateSection("mobileChrome", "frosted_bg", v)}
                  autoComplete="off"
                />
                <TextField
                  label={c.frostedBlur}
                  value={styles.mobileChrome?.frosted_blur ?? "16px"}
                  onChange={(v) => updateSection("mobileChrome", "frosted_blur", v)}
                  autoComplete="off"
                  helpText={c.frostedBlurHelp}
                />
                <Checkbox
                  label={c.pinHeaderTop}
                  checked={styles.mobileChrome?.header_sticky !== false}
                  onChange={(v) => updateSection("mobileChrome", "header_sticky", v)}
                  helpText={c.pinHeaderHelp}
                />
                <Checkbox
                  label={c.pinBottomBar}
                  checked={styles.mobileChrome?.bottom_nav_sticky !== false}
                  onChange={(v) => updateSection("mobileChrome", "bottom_nav_sticky", v)}
                  helpText={c.pinBottomBarHelp}
                />
                <Checkbox
                  label={c.recessBottomBar}
                  checked={styles.mobileChrome?.bottom_nav_recess_on_scroll === true}
                  onChange={(v) => updateSection("mobileChrome", "bottom_nav_recess_on_scroll", v)}
                  helpText={c.recessBottomBarHelp}
                />
                <TextField
                  label={c.bottomBarBg}
                  value={styles.mobileChrome?.bottom_nav_bg ?? "rgba(255,255,255,0.97)"}
                  onChange={(v) => updateSection("mobileChrome", "bottom_nav_bg", v)}
                  autoComplete="off"
                />
                <TextField
                  label={c.bottomBarBorderTop}
                  value={styles.mobileChrome?.bottom_nav_border_top ?? "1px solid rgba(229,231,235,0.9)"}
                  onChange={(v) => updateSection("mobileChrome", "bottom_nav_border_top", v)}
                  autoComplete="off"
                />
                <TextField
                  label={c.bottomBarBlur}
                  value={styles.mobileChrome?.bottom_nav_blur ?? "12px"}
                  onChange={(v) => updateSection("mobileChrome", "bottom_nav_blur", v)}
                  autoComplete="off"
                />
                <TextField
                  label={c.bottomBarShadow}
                  value={styles.mobileChrome?.bottom_nav_shadow ?? "0 -2px 12px rgba(0,0,0,0.07)"}
                  onChange={(v) => updateSection("mobileChrome", "bottom_nav_shadow", v)}
                  autoComplete="off"
                />
              </div>
          </BlockStack>
        </AccordionCard>

        {/* Scroll-up Button */}
        <AccordionCard title={c.scrollUpTitle}>
          <BlockStack gap="400">
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 16 }}>
                <Select
                  label={c.stylePreset}
                  options={c.scrollUpPresetOptions}
                  value={styles.scrollUpButton.variant || "default"}
                  onChange={(v) => updateSection("scrollUpButton", "variant", v)}
                />
                <ColorField
                  label={c.bgColor}
                  value={styles.scrollUpButton.bg_color}
                  onChange={(v) => updateSection("scrollUpButton", "bg_color", v)}
                />
                <ColorField
                  label={c.iconColor}
                  value={styles.scrollUpButton.icon_color}
                  onChange={(v) => updateSection("scrollUpButton", "icon_color", v)}
                />
                <TextField
                  label={c.borderRadius}
                  value={styles.scrollUpButton.border_radius}
                  onChange={(v) => updateSection("scrollUpButton", "border_radius", v)}
                  autoComplete="off"
                />
                <TextField
                  label={c.size}
                  value={styles.scrollUpButton.size}
                  onChange={(v) => updateSection("scrollUpButton", "size", v)}
                  autoComplete="off"
                />
                <TextField
                  label={c.shadow}
                  value={styles.scrollUpButton.shadow}
                  onChange={(v) => updateSection("scrollUpButton", "shadow", v)}
                  autoComplete="off"
                />
                <TextField
                  label={c.border}
                  value={styles.scrollUpButton.border || ""}
                  onChange={(v) => updateSection("scrollUpButton", "border", v)}
                  autoComplete="off"
                />
              </div>
              {/* Live preview */}
              <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 8 }}>
                <Text variant="bodySm" tone="subdued">{c.preview}</Text>
                <div style={{
                  width: styles.scrollUpButton.size || "44px",
                  height: styles.scrollUpButton.size || "44px",
                  borderRadius: styles.scrollUpButton.border_radius || "50%",
                  background: styles.scrollUpButton.bg_color || "#ff971c",
                  boxShadow: styles.scrollUpButton.shadow || "0 4px 12px rgba(0,0,0,0.2)",
                  border: styles.scrollUpButton.border || "none",
                  boxSizing: "border-box",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke={styles.scrollUpButton.icon_color || "#fff"} strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
                  </svg>
                </div>
              </div>
          </BlockStack>
        </AccordionCard>

        {/* Button styles */}
        <AccordionCard title={c.buttonStylesTitle}>
          {Object.entries(styles.buttons).map(([key, typeData]) => (
            <ButtonTypeSection
              key={key}
              typeKey={key}
              typeData={typeData}
              onChange={(updated) => updateButtonType(key, updated)}
            />
          ))}
        </AccordionCard>
      </Layout>
      <MediaPickerModal
        open={Boolean(brandingPickerTarget)}
        onClose={() => setBrandingPickerTarget(null)}
        onSelect={(urls) => {
          const first = Array.isArray(urls) ? urls[0] : null;
          if (!first || !brandingPickerTarget) return;
          // "logo_shop_desktop" or "logo_sellercentral_tablet" → device logo config
          const logoMatch = brandingPickerTarget.match(/^logo_(shop|sellercentral)_(desktop|tablet|mobile)$/);
          if (logoMatch) {
            const [, section, device] = logoMatch;
            setBranding((p) => ({
              ...p,
              logo_config: {
                ...p.logo_config,
                [section]: {
                  ...p.logo_config?.[section],
                  [device]: { ...(p.logo_config?.[section]?.[device] || {}), url: first },
                },
              },
            }));
          } else if (brandingPickerTarget === "made_in_europe_badge_image") {
            setStyles((prev) => ({
              ...prev,
              made_in_europe_badge: { ...(prev.made_in_europe_badge || {}), image_url: first },
            }));
          } else if (brandingPickerTarget === "bestseller_badge_image") {
            setStyles((prev) => ({
              ...prev,
              bestseller_badge: { ...(prev.bestseller_badge || {}), image_url: first },
            }));
          } else {
            setBranding((p) => ({ ...p, [brandingPickerTarget]: first }));
          }
          setBrandingPickerTarget(null);
        }}
        multiple={false}
        title={c.brandingMediaPickerTitle}
      />
      <MediaPickerModal
        open={headerBgPickerScope !== null}
        onClose={() => setHeaderBgPickerScope(null)}
        onSelect={(urls) => {
          const first = Array.isArray(urls) ? urls[0] : null;
          if (!first || headerBgPickerScope === null) return;
          if (headerBgPickerScope === "global") {
            updateSection("header", "bg_image_url", first);
          } else {
            setStyles((prev) => {
              const header = prev.header || {};
              const scopes = { ...(header.scopes || {}) };
              const bucket = { ...(scopes[headerBgPickerScope] || {}), bg_image_url: first };
              scopes[headerBgPickerScope] = bucket;
              return { ...prev, header: { ...header, scopes } };
            });
          }
          setHeaderBgPickerScope(null);
        }}
        multiple={false}
        title={c.headerBgPickerTitle}
      />
    </Page>
  );
}
