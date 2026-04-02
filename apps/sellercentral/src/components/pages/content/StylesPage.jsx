"use client";

import { useState, useEffect, useCallback } from "react";
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
} from "@shopify/polaris";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";

// ── Current shop button code snapshots ───────────────────────────────────────
const DEFAULT_ATC_CODE = `/* Current shop: ToCartButton */
.atc-btn {
  position: relative;
  width: 100%;
  height: 52px;
  cursor: pointer;
  display: flex;
  align-items: center;
  border: 1.5px solid #ef8200;
  border-radius: 10px;
  background-color: #ff971c;
  overflow: hidden;
  padding: 0;
  user-select: none;
  box-sizing: border-box;
  transition: background-color 0.3s, border-color 0.3s;
}
.atc-btn,
.atc-btn__text,
.atc-btn__icon {
  transition: all 0.3s;
}
.atc-btn:hover:not(:disabled) {
  background-color: #ef8200;
}
.atc-btn:active:not(:disabled) {
  background-color: #ef8200;
  border-color: #ef8200;
}
.atc-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  background-color: #9ca3af;
  border-color: #9ca3af;
}
.atc-btn__text {
  flex: 1;
  text-align: center;
  color: #fff;
  font-weight: 700;
  font-size: 15px;
  letter-spacing: 0.01em;
  padding: 0 54px 0 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  z-index: 1;
  pointer-events: none;
}
.atc-btn:hover:not(:disabled) .atc-btn__text {
  color: transparent;
}
.atc-btn__icon {
  position: absolute;
  top: 0;
  right: 0;
  height: 100%;
  width: 50px;
  background-color: #ef8200;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 0 8px 8px 0;
  z-index: 2;
  pointer-events: none;
}
.atc-btn:hover:not(:disabled) .atc-btn__icon {
  width: 100%;
  border-radius: 8px;
}
.atc-btn:active:not(:disabled) .atc-btn__icon {
  background-color: #ef8200;
}
.atc-btn__icon svg {
  width: 26px;
  height: 26px;
  stroke: #fff;
  stroke-width: 2.5;
  stroke-linecap: round;
  stroke-linejoin: round;
  fill: none;
  flex-shrink: 0;
}`;

const DEFAULT_PRIMARY_BUTTON_CODE = `/* Current shop: Button.jsx */
.shop-btn {
  padding: 1.05em 1.9em;
  border: 2px solid #000;
  font-size: 15px;
  color: #131313;
  cursor: pointer;
  position: relative;
  overflow: hidden;
  transition: all 0.3s;
  border-radius: 12px;
  background-color: #ffb14d;
  font-weight: 800;
  line-height: 1;
  user-select: none;
  box-shadow: 0 2px 0 2px #000;
}
.shop-btn::before {
  content: "";
  position: absolute;
  width: 100px;
  height: 120%;
  background-color: #ff971c;
  top: 50%;
  transform: skewX(30deg) translate(-150%, -50%);
  transition: all 0.5s;
}
.shop-btn:hover:not(:disabled) {
  background-color: #ff971c;
  color: #fff;
  box-shadow: 0 2px 0 2px #0d3b66;
  border-color: #0d3b66;
}
.shop-btn:hover:not(:disabled)::before {
  transform: skewX(30deg) translate(150%, -50%);
  transition-delay: 0.1s;
}
.shop-btn:active:not(:disabled) {
  transform: scale(0.95);
}
.shop-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}`;

const DEFAULT_SECONDARY_BUTTON_CODE = `/* Suggested secondary button variant */
.shop-btn-secondary {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.95em 1.6em;
  border: 2px solid #111827;
  border-radius: 12px;
  background: #ffffff;
  color: #111827;
  font-size: 15px;
  font-weight: 700;
  line-height: 1;
  cursor: pointer;
  transition: all 0.25s ease;
}
.shop-btn-secondary:hover:not(:disabled) {
  background: #111827;
  color: #ffffff;
}
.shop-btn-secondary:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}`;

function ensureActiveVariant(variants = []) {
  if (variants.length === 0) return [];
  const hasActive = variants.some((variant) => variant?.active);
  if (hasActive) return variants;
  return variants.map((variant, idx) => ({ ...variant, active: idx === 0 }));
}

function normalizeButtonType(typeData = {}) {
  return {
    ...typeData,
    variants: ensureActiveVariant(
      (typeData.variants || []).map((variant, idx) => ({
        name: variant?.name || `Variante ${idx + 1}`,
        code: variant?.code || "",
        active: Boolean(variant?.active),
      }))
    ),
  };
}

function mergeButtons(defaults, loaded) {
  const keys = new Set([...Object.keys(defaults || {}), ...Object.keys(loaded || {})]);
  const result = {};
  for (const key of keys) {
    result[key] = normalizeButtonType({
      ...(defaults?.[key] || {}),
      ...(loaded?.[key] || {}),
      variants: loaded?.[key]?.variants || defaults?.[key]?.variants || [],
    });
  }
  return result;
}

function openNativeColorPicker(value, onChange) {
  const el = document.createElement("input");
  el.type = "color";
  el.value = value || "#ffffff";
  el.oninput = (e) => onChange(e.target.value);
  el.click();
}

const DEFAULT_STYLES = {
  colors: {
    primary:    "#ff971c",
    secondary:  "#111827",
    accent:     "#ef8200",
    text:       "#111827",
    background: "#ffffff",
  },
  topbar: {
    bg_color: "#111827",
    text_color: "#ffffff",
    height: "40px",
    font_size: "13px",
    font_weight: "400",
  },
  header: {
    bg_color: "#ffffff",
    text_color: "#111827",
    height: "72px",
    shadow: "0 2px 8px rgba(0,0,0,0.08)",
    border_bottom: "1px solid #f3f4f6",
  },
  secondNav: {
    bg_color: "#f9fafb",
    text_color: "#374151",
    active_color: "#ff971c",
    height: "44px",
    font_size: "14px",
    font_weight: "500",
  },
  footer: {
    bg_color: "#111827",
    text_color: "#d1d5db",
    border_top: "none",
  },
  typography: {
    font_family: "Inter, system-ui, sans-serif",
    font_size: "16px",
    line_height: "1.6",
    color: "#111827",
    h1_size: "clamp(28px,5vw,52px)",
    h1_weight: "800",
    h1_color: "#111827",
    h1_spacing: "-0.02em",
    h2_size: "clamp(22px,3.5vw,36px)",
    h2_weight: "700",
    h2_color: "#111827",
    h2_spacing: "-0.01em",
  },
  scrollUpButton: {
    bg_color: "#ff971c",
    icon_color: "#ffffff",
    border_radius: "50%",
    size: "44px",
    shadow: "0 4px 12px rgba(0,0,0,0.2)",
  },
  buttons: {
    add_to_cart: {
      label: "Add to Cart Button",
      variants: [
        { name: "Orange Theme (Standard)", code: DEFAULT_ATC_CODE, active: true },
      ],
    },
    primary: {
      label: "Primary Button",
      variants: [
        { name: "Current Shop Button", code: DEFAULT_PRIMARY_BUTTON_CODE, active: true },
      ],
    },
    secondary: {
      label: "Secondary Button",
      variants: [
        { name: "Outlined Secondary", code: DEFAULT_SECONDARY_BUTTON_CODE, active: true },
      ],
    },
  },
};

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
          onClick={() => openNativeColorPicker(value, onChange)}
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

  return (
    <Card>
      <BlockStack gap="400">
        <Text as="h3" variant="headingMd">{typeData.label || typeKey}</Text>
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
  const [styles, setStyles] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState("");
  const [errMsg, setErrMsg] = useState("");

  const loadStyles = useCallback(async () => {
    setLoading(true);
    try {
      const data = await client.getStyles();
      const loaded = data?.styles || {};
      setStyles({
        colors: { ...DEFAULT_STYLES.colors, ...(loaded.colors || {}) },
        topbar: { ...DEFAULT_STYLES.topbar, ...(loaded.topbar || {}) },
        header: { ...DEFAULT_STYLES.header, ...(loaded.header || {}) },
        secondNav: { ...DEFAULT_STYLES.secondNav, ...(loaded.secondNav || {}) },
        footer: { ...DEFAULT_STYLES.footer, ...(loaded.footer || {}) },
        typography: { ...DEFAULT_STYLES.typography, ...(loaded.typography || {}) },
        scrollUpButton: { ...DEFAULT_STYLES.scrollUpButton, ...(loaded.scrollUpButton || {}) },
        buttons: mergeButtons(DEFAULT_STYLES.buttons, loaded.buttons || {}),
      });
    } catch (_) {
      setStyles({
        colors: { ...DEFAULT_STYLES.colors },
        topbar: { ...DEFAULT_STYLES.topbar },
        header: { ...DEFAULT_STYLES.header },
        secondNav: { ...DEFAULT_STYLES.secondNav },
        footer: { ...DEFAULT_STYLES.footer },
        typography: { ...DEFAULT_STYLES.typography },
        scrollUpButton: { ...DEFAULT_STYLES.scrollUpButton },
        buttons: mergeButtons(DEFAULT_STYLES.buttons, {}),
      });
    }
    setLoading(false);
  }, [client]);

  useEffect(() => { loadStyles(); }, [loadStyles]);

  const save = async () => {
    setSaving(true);
    setErrMsg("");
    setSavedMsg("");
    try {
      await client.saveStyles(styles);
      setSavedMsg("Stile gespeichert.");
      setTimeout(() => setSavedMsg(""), 4000);
    } catch (e) {
      setErrMsg(e?.message || "Fehler beim Speichern");
    }
    setSaving(false);
  };

  const updateColor = (key, val) => {
    setStyles((prev) => ({ ...prev, colors: { ...prev.colors, [key]: val } }));
  };

  const updateSection = (section, key, val) =>
    setStyles((prev) => ({ ...prev, [section]: { ...prev[section], [key]: val } }));

  const updateButtonType = (key, updated) => {
    setStyles((prev) => ({ ...prev, buttons: { ...prev.buttons, [key]: updated } }));
  };

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
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">Typografie</Text>
              <Divider />
              <TextField
                label="Schriftart (font-family)"
                value={styles.typography.font_family}
                onChange={(v) => updateSection("typography", "font_family", v)}
                autoComplete="off"
              />
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
                <TextField
                  label="Schriftgröße (font-size)"
                  value={styles.typography.font_size}
                  onChange={(v) => updateSection("typography", "font_size", v)}
                  autoComplete="off"
                />
                <TextField
                  label="Zeilenhöhe (line-height)"
                  value={styles.typography.line_height}
                  onChange={(v) => updateSection("typography", "line_height", v)}
                  autoComplete="off"
                />
                <ColorField
                  label="Textfarbe (color)"
                  value={styles.typography.color}
                  onChange={(v) => updateSection("typography", "color", v)}
                />
              </div>
              <Divider />
              <Text as="h3" variant="headingSm">H1</Text>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
                <TextField
                  label="Größe (h1-size)"
                  value={styles.typography.h1_size}
                  onChange={(v) => updateSection("typography", "h1_size", v)}
                  autoComplete="off"
                />
                <TextField
                  label="Gewicht (h1-weight)"
                  value={styles.typography.h1_weight}
                  onChange={(v) => updateSection("typography", "h1_weight", v)}
                  autoComplete="off"
                />
                <ColorField
                  label="Farbe (h1-color)"
                  value={styles.typography.h1_color}
                  onChange={(v) => updateSection("typography", "h1_color", v)}
                />
                <TextField
                  label="Zeichenabstand (h1-spacing)"
                  value={styles.typography.h1_spacing}
                  onChange={(v) => updateSection("typography", "h1_spacing", v)}
                  autoComplete="off"
                />
              </div>
              <Text as="h3" variant="headingSm">H2</Text>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
                <TextField
                  label="Größe (h2-size)"
                  value={styles.typography.h2_size}
                  onChange={(v) => updateSection("typography", "h2_size", v)}
                  autoComplete="off"
                />
                <TextField
                  label="Gewicht (h2-weight)"
                  value={styles.typography.h2_weight}
                  onChange={(v) => updateSection("typography", "h2_weight", v)}
                  autoComplete="off"
                />
                <ColorField
                  label="Farbe (h2-color)"
                  value={styles.typography.h2_color}
                  onChange={(v) => updateSection("typography", "h2_color", v)}
                />
                <TextField
                  label="Zeichenabstand (h2-spacing)"
                  value={styles.typography.h2_spacing}
                  onChange={(v) => updateSection("typography", "h2_spacing", v)}
                  autoComplete="off"
                />
              </div>
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
    </Page>
  );
}
