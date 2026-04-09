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
} from "@shopify/polaris";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";
import {
  mergeLoadedShopStyles,
  ensureActiveVariant,
  normalizeButtonType,
  DEFAULT_BUTTON_COLORS,
  TOPBAR_PRESET_LABELS,
  HEADER_PRESET_LABELS,
  SECOND_NAV_PRESET_LABELS,
  SCROLL_UP_PRESET_LABELS,
} from "@belucha/shop-theme";

/** Deutsche Beschriftungen für Button-Farbfelder (Keys wie in DEFAULT_BUTTON_COLORS). */
const BUTTON_COLOR_LABELS = {
  add_to_cart: {
    bg: "Hintergrund",
    border: "Rahmen",
    hover_bg: "Hover / aktiv Hintergrund",
    icon_bg: "Icon-Streifen",
    text: "Text",
    icon_stroke: "Icon-Linie",
    disabled_bg: "Deaktiviert: Hintergrund",
    disabled_border: "Deaktiviert: Rahmen",
  },
  primary: {
    bg: "Hintergrund",
    shine: "Glanz (Verlauf)",
    text: "Text",
    border: "Rahmen",
    shadow: "Schlagschatten",
    hover_bg: "Hover Hintergrund",
    hover_text: "Hover Text",
    hover_border: "Hover Rahmen",
    hover_shadow: "Hover Schatten",
  },
  secondary: {
    bg: "Hintergrund",
    text: "Text",
    border: "Rahmen",
    hover_bg: "Hover Hintergrund",
    hover_text: "Hover Text",
  },
  ghost: {
    text: "Text",
    hover_bg: "Hover Hintergrund",
    hover_text: "Hover Text",
  },
  outline: {
    accent: "Rahmen & Text & Hover-Füllung",
    hover_text: "Hover Text",
  },
};
import { useUnsavedChanges } from "@/context/UnsavedChangesContext";
import MediaPickerModal from "@/components/MediaPickerModal";

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
            label="Suchen"
            labelHidden
            placeholder="Schriftname filtern…"
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
                Schriften werden geladen…
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
                Keine Treffer — Begriff kürzen oder ändern.
              </Text>
            ) : null}
            {!loading && filtered.length > 0 ? (
              <Text as="p" variant="bodySm" tone="subdued">
                {filtered.length} Schriften
                {q.trim() ? " (gefiltert)" : ""}. Vorschau lädt in Blöcken nach (kurz warten).
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
        <ColorField label="Farbe" value={b.color} onChange={(v) => onLevelChange(levelKey, "color", v)} />
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
            label="Eigene font-family (CSS, optional)"
            value={b.font_family || ""}
            onChange={(v) => onLevelChange(levelKey, "font_family", v)}
            autoComplete="off"
            helpText="Vollständiger CSS-Stack; ergänzt oder ersetzt die Auswahl oben (Systemschriften, Fallbacks)."
          />
        </div>
      </div>
    </BlockStack>
  );
}

// ── Color swatch input ────────────────────────────────────────────────────────
function ColorField({ label, value, onChange }) {
  return (
    <TextField
      label={label}
      value={value || ""}
      onChange={onChange}
      autoComplete="off"
      prefix={
        <div
          style={{
            width: 20,
            height: 20,
            borderRadius: 4,
            background: value || "#ffffff",
            border: "1px solid var(--p-color-border)",
            cursor: "pointer",
            flexShrink: 0,
          }}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            openNativeColorPicker(value, onChange, e.currentTarget.getBoundingClientRect());
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
              placeholder="Variantenname"
            />
            {variant.active && <Badge tone="success">Aktiv</Badge>}
          </InlineStack>
          <InlineStack gap="200">
            {!variant.active && (
              <Button size="slim" variant="primary" onClick={onActivate}>
                Aktivieren
              </Button>
            )}
            <Button size="slim" onClick={() => setCodeOpen((v) => !v)}>
              {codeOpen ? "Code schließen" : "Code bearbeiten"}
            </Button>
            <Button size="slim" tone="critical" onClick={onRemove}>
              Entfernen
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
      <Text as="h4" variant="headingSm">Farben</Text>
      <Text as="p" variant="bodySm" tone="subdued">
        Diese Werte steuern die Standard-Buttons. Sie wirken zusammen mit dem CSS unter „Code bearbeiten“ (Variablen haben Vorrang vor den Fallback-Farben im Code).
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
                helpText="rgba(…) für leichte Fläche, oder Hex"
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
    const next = [...variants, { name: "Neue Variante", code: "", active: variants.length === 0 }];
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
          <Text as="p" tone="subdued" variant="bodySm">Keine Varianten. Füge eine hinzu.</Text>
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
          <Button size="slim" onClick={addVariant}>+ Variante hinzufügen</Button>
        </InlineStack>
      </BlockStack>
    </Card>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function StylesPage() {
  const client = getMedusaAdminClient();
  const unsaved = useUnsavedChanges();
  const [styles, setStyles] = useState(null);
  /** Letzter gespeicherter / geladener Stand für Dirty-Vergleich */
  const [savedSnapshot, setSavedSnapshot] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState("");
  const [errMsg, setErrMsg] = useState("");
  const [branding, setBranding] = useState({
    shop_logo_url: "",
    shop_favicon_url: "",
    sellercentral_logo_url: "",
    sellercentral_favicon_url: "",
    shop_logo_height: 34,
  });
  const [brandingSnapshot, setBrandingSnapshot] = useState(null);
  const [brandingPickerTarget, setBrandingPickerTarget] = useState(null);

  const loadStyles = useCallback(async () => {
    setLoading(true);
    try {
      const data = await client.getStyles();
      const loaded = data?.styles || {};
      const merged = mergeLoadedShopStyles(loaded);
      const settings = await client.getSellerSettings().catch(() => ({}));
      setStyles(merged);
      setSavedSnapshot(JSON.stringify(merged));
      const loadedBranding = {
        shop_logo_url: settings?.shop_logo_url || "",
        shop_favicon_url: settings?.shop_favicon_url || "",
        sellercentral_logo_url: settings?.sellercentral_logo_url || "",
        sellercentral_favicon_url: settings?.sellercentral_favicon_url || "",
        shop_logo_height: settings?.shop_logo_height != null ? Number(settings.shop_logo_height) : 34,
      };
      setBranding(loadedBranding);
      setBrandingSnapshot(JSON.stringify(loadedBranding));
    } catch (_) {
      const merged = mergeLoadedShopStyles({});
      setStyles(merged);
      setSavedSnapshot(JSON.stringify(merged));
      const emptyBranding = { shop_logo_url: "", shop_favicon_url: "", sellercentral_logo_url: "", sellercentral_favicon_url: "", shop_logo_height: 34 };
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
      await client.updateSellerSettings({ seller_id: "default", ...branding });
      setSavedSnapshot(JSON.stringify(styles));
      setBrandingSnapshot(JSON.stringify(branding));
      setSavedMsg("Stile gespeichert.");
      setTimeout(() => setSavedMsg(""), 4000);
    } catch (e) {
      setErrMsg(e?.message || "Fehler beim Speichern");
    }
    setSaving(false);
  }, [styles, branding, client]);

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
      <Page title="Website-Stile">
        <Layout>
          <Layout.Section>
            <Card>
              <Box paddingBlock="600">
                <Text as="p" tone="subdued" alignment="center">Laden…</Text>
              </Box>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>
    );
  }

  return (
    <Page
      title="Website-Stile"
      subtitle="Farben, Buttons und visuelle Stile deines Shops"
      primaryAction={{
        content: saving ? "Speichern…" : "Speichern",
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
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">Branding (Shop & Sellercentral)</Text>
              <Text as="p" tone="subdued">
                Hier kannst du unterschiedliche Logos und Favicons fuer Shop und Sellercentral setzen.
              </Text>
              {[
                { key: "shop_logo_url", label: "Shop Logo" },
                { key: "shop_favicon_url", label: "Shop Favicon" },
                { key: "sellercentral_logo_url", label: "Sellercentral Logo" },
                { key: "sellercentral_favicon_url", label: "Sellercentral Favicon" },
              ].map((row) => (
                <div key={row.key}>
                  <InlineStack gap="200" blockAlign="end" wrap>
                    <div style={{ flex: 1, minWidth: 280 }}>
                      <TextField
                        label={row.label}
                        value={branding[row.key] || ""}
                        onChange={(v) => setBranding((p) => ({ ...p, [row.key]: v }))}
                        placeholder="https://... veya /uploads/..."
                        autoComplete="off"
                      />
                    </div>
                    <Button size="slim" onClick={() => setBrandingPickerTarget(row.key)}>Aus Medien waehlen</Button>
                    {(branding[row.key] || "").trim() ? (
                      <Button
                        size="slim"
                        tone="critical"
                        variant="plain"
                        onClick={() => setBranding((p) => ({ ...p, [row.key]: "" }))}
                      >
                        Entfernen
                      </Button>
                    ) : null}
                  </InlineStack>
                  {row.key === "shop_logo_url" && (branding.shop_logo_url || "").trim() && (
                    <div style={{ marginTop: 12 }}>
                      <InlineStack gap="400" blockAlign="center" wrap={false}>
                        <div style={{ flex: 1 }}>
                          <Text as="span" variant="bodySm" fontWeight="medium">Logo-Höhe im Header</Text>
                          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 6 }}>
                            <input
                              type="range"
                              min={20}
                              max={120}
                              step={1}
                              value={branding.shop_logo_height || 34}
                              onChange={(e) => setBranding((p) => ({ ...p, shop_logo_height: Number(e.target.value) }))}
                              style={{ flex: 1, accentColor: "#008060" }}
                            />
                            <span style={{ fontSize: 13, fontWeight: 600, color: "#374151", minWidth: 42, textAlign: "right" }}>
                              {branding.shop_logo_height || 34}px
                            </span>
                          </div>
                        </div>
                        <div style={{ flexShrink: 0, padding: "8px 12px", background: "#f3f4f6", borderRadius: 8, border: "1px solid #e5e7eb" }}>
                          <img
                            src={branding.shop_logo_url}
                            alt="Logo preview"
                            style={{ height: branding.shop_logo_height || 34, width: "auto", maxWidth: 200, objectFit: "contain", display: "block" }}
                          />
                        </div>
                      </InlineStack>
                    </div>
                  )}
                </div>
              ))}
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Colors */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">Website-Farben</Text>
              <Divider />
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 16 }}>
                <ColorField label="Primärfarbe" value={styles.colors.primary} onChange={(v) => updateColor("primary", v)} />
                <ColorField label="Sekundärfarbe" value={styles.colors.secondary} onChange={(v) => updateColor("secondary", v)} />
                <ColorField label="Akzentfarbe" value={styles.colors.accent} onChange={(v) => updateColor("accent", v)} />
                <ColorField label="Textfarbe" value={styles.colors.text} onChange={(v) => updateColor("text", v)} />
                <ColorField label="Hintergrundfarbe" value={styles.colors.background} onChange={(v) => updateColor("background", v)} />
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
          </Card>
        </Layout.Section>

        {/* Typography */}
        <Layout.Section>
          <Card>
            <BlockStack gap="500">
              <Text as="h2" variant="headingMd">
                Typografie
              </Text>
              <Banner tone="info">
                <p>
                  Die Liste enthält Schriften aus <strong>Google Fonts</strong>. Schriften wie Arial, Calibri
                  oder Helvetica sind <strong>Betriebssystem-/Office-Fonts</strong> und stehen dort nicht —
                  sie können Sie pro Ebene unter „Eigene font-family (CSS)“ eintragen, z. B.{" "}
                  <code style={{ whiteSpace: "nowrap" }}>Calibri, Candara, sans-serif</code>. Eigenlizenzierte
                  Webfonts (z. B. Aeonik) binden Sie per @font-face / Theme, nicht über diese Dropdown-Liste.
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
              <Text as="h3" variant="headingSm">
                Katalog &amp; Navigation
              </Text>
              <Text as="p" variant="bodySm" tone="subdued">
                Unabhängig von H1–H5 im Fließtext (Blog, Produktbeschreibung): Produktname, Listen-Überschriften
                und Kategorie-Menü separat steuern.
              </Text>
              <Divider />
              <TypographyLevelRow
                heading="Produkttitel (Produktseite)"
                levelKey="product_title"
                typo={styles.typography}
                families={googleFontList || []}
                familiesLoading={googleFontsLoading}
                onLevelChange={updateTypoLevel}
              />
              <Divider />
              <TypographyLevelRow
                heading="Katalog-Titel (Kategorien, Kollektionen, Marken-Seiten)"
                levelKey="catalog_title"
                typo={styles.typography}
                families={googleFontList || []}
                familiesLoading={googleFontsLoading}
                onLevelChange={updateTypoLevel}
              />
              <Divider />
              <TypographyLevelRow
                heading="Menü: Kategorien-Dropdown"
                levelKey="menu_catalog"
                typo={styles.typography}
                families={googleFontList || []}
                familiesLoading={googleFontsLoading}
                onLevelChange={updateTypoLevel}
              />
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Top Bar */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">Layout: Top Bar</Text>
              <Divider />
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 16 }}>
                <Select
                  label="Stil-Vorlage"
                  options={TOPBAR_PRESET_LABELS}
                  value={styles.topbar.variant || "default"}
                  onChange={(v) => updateSection("topbar", "variant", v)}
                />
                <ColorField
                  label="Hintergrundfarbe"
                  value={styles.topbar.bg_color}
                  onChange={(v) => updateSection("topbar", "bg_color", v)}
                />
                <ColorField
                  label="Textfarbe"
                  value={styles.topbar.text_color}
                  onChange={(v) => updateSection("topbar", "text_color", v)}
                />
                <TextField
                  label="Höhe (height)"
                  value={styles.topbar.height}
                  onChange={(v) => updateSection("topbar", "height", v)}
                  autoComplete="off"
                />
                <TextField
                  label="Schriftgröße (font-size)"
                  value={styles.topbar.font_size}
                  onChange={(v) => updateSection("topbar", "font_size", v)}
                  autoComplete="off"
                />
                <TextField
                  label="Schriftgewicht (font-weight)"
                  value={styles.topbar.font_weight}
                  onChange={(v) => updateSection("topbar", "font_weight", v)}
                  autoComplete="off"
                />
                <TextField
                  label="Schatten (box-shadow)"
                  value={styles.topbar.shadow || ""}
                  onChange={(v) => updateSection("topbar", "shadow", v)}
                  autoComplete="off"
                />
                <TextField
                  label="Border unten (border-bottom)"
                  value={styles.topbar.border_bottom || ""}
                  onChange={(v) => updateSection("topbar", "border_bottom", v)}
                  autoComplete="off"
                />
              </div>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Header / Navbar */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">Layout: Header / Navbar</Text>
              <Divider />
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 16 }}>
                <Select
                  label="Stil-Vorlage"
                  options={HEADER_PRESET_LABELS}
                  value={styles.header.variant || "default"}
                  onChange={(v) => updateSection("header", "variant", v)}
                />
                <ColorField
                  label="Hintergrundfarbe"
                  value={styles.header.bg_color}
                  onChange={(v) => updateSection("header", "bg_color", v)}
                />
                <ColorField
                  label="Textfarbe"
                  value={styles.header.text_color}
                  onChange={(v) => updateSection("header", "text_color", v)}
                />
                <TextField
                  label="Höhe (height)"
                  value={styles.header.height}
                  onChange={(v) => updateSection("header", "height", v)}
                  autoComplete="off"
                />
                <TextField
                  label="Schatten (box-shadow)"
                  value={styles.header.shadow}
                  onChange={(v) => updateSection("header", "shadow", v)}
                  autoComplete="off"
                />
                <TextField
                  label="Unterer Rand (border-bottom)"
                  value={styles.header.border_bottom}
                  onChange={(v) => updateSection("header", "border_bottom", v)}
                  autoComplete="off"
                />
              </div>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Second Nav */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">Layout: Second Nav</Text>
              <Divider />
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 16 }}>
                <Select
                  label="Stil-Vorlage"
                  options={SECOND_NAV_PRESET_LABELS}
                  value={styles.secondNav.variant || "default"}
                  onChange={(v) => updateSection("secondNav", "variant", v)}
                />
                <ColorField
                  label="Hintergrundfarbe"
                  value={styles.secondNav.bg_color}
                  onChange={(v) => updateSection("secondNav", "bg_color", v)}
                />
                <ColorField
                  label="Textfarbe"
                  value={styles.secondNav.text_color}
                  onChange={(v) => updateSection("secondNav", "text_color", v)}
                />
                <ColorField
                  label="Aktiv-Farbe"
                  value={styles.secondNav.active_color}
                  onChange={(v) => updateSection("secondNav", "active_color", v)}
                />
                <TextField
                  label="Höhe (height)"
                  value={styles.secondNav.height}
                  onChange={(v) => updateSection("secondNav", "height", v)}
                  autoComplete="off"
                />
                <TextField
                  label="Schriftgröße (font-size)"
                  value={styles.secondNav.font_size}
                  onChange={(v) => updateSection("secondNav", "font_size", v)}
                  autoComplete="off"
                />
                <TextField
                  label="Schriftgewicht (font-weight)"
                  value={styles.secondNav.font_weight}
                  onChange={(v) => updateSection("secondNav", "font_weight", v)}
                  autoComplete="off"
                />
              </div>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Footer */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">Layout: Footer</Text>
              <Divider />
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 16 }}>
                <ColorField
                  label="Hintergrundfarbe"
                  value={styles.footer.bg_color}
                  onChange={(v) => updateSection("footer", "bg_color", v)}
                />
                <ColorField
                  label="Textfarbe"
                  value={styles.footer.text_color}
                  onChange={(v) => updateSection("footer", "text_color", v)}
                />
                <TextField
                  label="Oberer Rand (border-top)"
                  value={styles.footer.border_top}
                  onChange={(v) => updateSection("footer", "border_top", v)}
                  autoComplete="off"
                />
              </div>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Scroll-up Button */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">Scroll-up Button</Text>
              <Divider />
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 16 }}>
                <Select
                  label="Stil-Vorlage"
                  options={SCROLL_UP_PRESET_LABELS}
                  value={styles.scrollUpButton.variant || "default"}
                  onChange={(v) => updateSection("scrollUpButton", "variant", v)}
                />
                <ColorField
                  label="Hintergrundfarbe"
                  value={styles.scrollUpButton.bg_color}
                  onChange={(v) => updateSection("scrollUpButton", "bg_color", v)}
                />
                <ColorField
                  label="Icon-Farbe"
                  value={styles.scrollUpButton.icon_color}
                  onChange={(v) => updateSection("scrollUpButton", "icon_color", v)}
                />
                <TextField
                  label="Randradius (border-radius)"
                  value={styles.scrollUpButton.border_radius}
                  onChange={(v) => updateSection("scrollUpButton", "border_radius", v)}
                  autoComplete="off"
                />
                <TextField
                  label="Größe (size)"
                  value={styles.scrollUpButton.size}
                  onChange={(v) => updateSection("scrollUpButton", "size", v)}
                  autoComplete="off"
                />
                <TextField
                  label="Schatten (box-shadow)"
                  value={styles.scrollUpButton.shadow}
                  onChange={(v) => updateSection("scrollUpButton", "shadow", v)}
                  autoComplete="off"
                />
                <TextField
                  label="Rahmen (border)"
                  value={styles.scrollUpButton.border || ""}
                  onChange={(v) => updateSection("scrollUpButton", "border", v)}
                  autoComplete="off"
                />
              </div>
              {/* Live preview */}
              <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 8 }}>
                <Text variant="bodySm" tone="subdued">Vorschau:</Text>
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
          </Card>
        </Layout.Section>

        {/* Button styles */}
        <Layout.Section>
          <BlockStack gap="400">
            <Text as="h2" variant="headingMd">Button-Stile</Text>
            {Object.entries(styles.buttons).map(([key, typeData]) => (
              <ButtonTypeSection
                key={key}
                typeKey={key}
                typeData={typeData}
                onChange={(updated) => updateButtonType(key, updated)}
              />
            ))}
          </BlockStack>
        </Layout.Section>
      </Layout>
      <MediaPickerModal
        open={Boolean(brandingPickerTarget)}
        onClose={() => setBrandingPickerTarget(null)}
        onSelect={(urls) => {
          const first = Array.isArray(urls) ? urls[0] : null;
          if (!first || !brandingPickerTarget) return;
          setBranding((p) => ({ ...p, [brandingPickerTarget]: first }));
          setBrandingPickerTarget(null);
        }}
        multiple={false}
        title="Branding-Medien waehlen"
      />
    </Page>
  );
}
