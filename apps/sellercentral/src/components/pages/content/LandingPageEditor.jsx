"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Page,
  Layout,
  Card,
  Button,
  TextField,
  Text,
  BlockStack,
  InlineStack,
  Box,
  Banner,
  Modal,
  Select,
  Badge,
  Divider,
} from "@shopify/polaris";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";
import MediaPickerModal from "@/components/MediaPickerModal";

const BACKEND_URL = (process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000").replace(/\/$/, "");

function resolveUrl(url) {
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("/")) return url;
  return `${BACKEND_URL}/uploads/${url}`;
}

const TEXT_POSITION_OPTIONS = [
  { label: "Oben Links",    value: "top-left" },
  { label: "Oben Mitte",   value: "top-center" },
  { label: "Oben Rechts",  value: "top-right" },
  { label: "Mitte Links",  value: "center-left" },
  { label: "Mitte",        value: "center" },
  { label: "Mitte Rechts", value: "center-right" },
  { label: "Unten Links",  value: "bottom-left" },
  { label: "Unten Mitte",  value: "bottom-center" },
  { label: "Unten Rechts", value: "bottom-right" },
];

const CONTAINER_TYPES = [
  { type: "hero_banner",         label: "Hero Banner / Slider",  description: "Vollbild-Slider mit mehreren Bildern (3000×1000 px empfohlen)" },
  { type: "text_block",          label: "Text-Block",            description: "Überschrift, Fließtext (HTML) und optionaler Button" },
  { type: "image_text",          label: "Bild + Text",           description: "Bild links oder rechts, Text (HTML) daneben" },
  { type: "image_grid",          label: "Bild-Raster",           description: "2–4 Bilder nebeneinander mit Seitenverhältnis-Auswahl" },
  { type: "banner_cta",          label: "CTA-Banner",            description: "Farbiger Banner mit Handlungsaufforderung und Positionierung" },
  { type: "collection_carousel", label: "Kollektion-Karussell",  description: "Produkte einer Kollektion als Karussell" },
];

function newContainer(type) {
  const id = Math.random().toString(36).slice(2);
  const base = { id, type, visible: true };
  switch (type) {
    case "hero_banner":
      return { ...base, slides: [{ image: "", title: "", subtitle: "", btn_text: "", btn_url: "", overlay: 0, text_color: "#ffffff", text_position: "center", title_size: "clamp(24px,4vw,56px)", subtitle_size: "clamp(14px,2vw,22px)" }], height: "500px", autoplay: true, delay: 4000 };
    case "text_block":
      return { ...base, title: "", body: "", btn_text: "", btn_url: "", align: "center", bg_color: "#ffffff", text_color: "#111827" };
    case "image_text":
      return { ...base, image: "", title: "", body: "", btn_text: "", btn_url: "", image_side: "left", bg_color: "#ffffff", text_color: "#111827" };
    case "image_grid":
      return { ...base, images: [{ url: "", link: "", aspect_ratio: "1/1" }, { url: "", link: "", aspect_ratio: "1/1" }], cols: 2, gap: 16 };
    case "banner_cta":
      return { ...base, title: "", subtitle: "", btn_text: "", btn_url: "", bg_color: "#ff971c", text_color: "#ffffff", text_position: "center" };
    case "collection_carousel":
      return { ...base, title: "", collection_id: "", collection_handle: "", items_per_row: 4 };
    default:
      return base;
  }
}

function ImageField({ label, value, onPick, onClear, helpText }) {
  const resolved = resolveUrl(value);
  return (
    <BlockStack gap="200">
      {label && <Text as="span" variant="bodyMd" fontWeight="medium">{label}</Text>}
      {helpText && <Text as="p" variant="bodySm" tone="subdued">{helpText}</Text>}
      <InlineStack gap="300" blockAlign="center">
        {resolved ? (
          <img src={resolved} alt="" style={{ width: 80, height: 80, objectFit: "cover", borderRadius: 8, border: "1px solid var(--p-color-border)", display: "block", flexShrink: 0 }} />
        ) : (
          <div style={{ width: 80, height: 80, background: "var(--p-color-bg-surface-secondary)", borderRadius: 8, border: "1px dashed var(--p-color-border)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Text as="span" variant="bodySm" tone="subdued">Kein Bild</Text>
          </div>
        )}
        <BlockStack gap="100">
          <Button size="slim" onClick={onPick}>{resolved ? "Bild ändern" : "Bild auswählen"}</Button>
          {resolved && <Button size="slim" tone="critical" onClick={onClear}>Entfernen</Button>}
        </BlockStack>
      </InlineStack>
    </BlockStack>
  );
}

function ColorField({ label, value, onChange }) {
  return (
    <TextField
      label={label}
      value={value || ""}
      onChange={onChange}
      autoComplete="off"
      prefix={
        <div
          style={{ width: 16, height: 16, borderRadius: 3, background: value || "#ffffff", border: "1px solid var(--p-color-border)", cursor: "pointer", flexShrink: 0 }}
          onClick={() => {
            const el = document.createElement("input");
            el.type = "color";
            el.value = value || "#ffffff";
            el.oninput = (e) => onChange(e.target.value);
            el.click();
          }}
        />
      }
    />
  );
}

// ── Hero Banner editor ──────────────────────────────────────────────────────
function HeroBannerEditor({ container, onChange }) {
  const [pickerIdx, setPickerIdx] = useState(null);

  const updateSlide = (idx, key, val) => {
    const slides = [...(container.slides || [])];
    slides[idx] = { ...slides[idx], [key]: val };
    onChange({ ...container, slides });
  };
  const addSlide = () => {
    onChange({ ...container, slides: [...(container.slides || []), { image: "", title: "", subtitle: "", btn_text: "", btn_url: "", overlay: 0, text_color: "#ffffff", text_position: "center", title_size: "clamp(24px,4vw,56px)", subtitle_size: "clamp(14px,2vw,22px)" }] });
  };
  const removeSlide = (idx) => {
    onChange({ ...container, slides: (container.slides || []).filter((_, i) => i !== idx) });
  };

  return (
    <BlockStack gap="400">
      {pickerIdx !== null && (
        <MediaPickerModal open multiple={false} onClose={() => setPickerIdx(null)} onSelect={(urls) => { if (urls[0]) updateSlide(pickerIdx, "image", urls[0]); setPickerIdx(null); }} />
      )}

      <Card>
        <BlockStack gap="300">
          <Text as="h3" variant="headingSm">Slider-Einstellungen</Text>
          <InlineStack gap="400" wrap={false}>
            <div style={{ flex: 1 }}>
              <TextField label="Höhe" value={container.height || "500px"} onChange={(v) => onChange({ ...container, height: v })} helpText="z.B. 500px, 60vh" autoComplete="off" />
            </div>
            <div style={{ flex: 1 }}>
              <Select label="Autoplay" options={[{ label: "An", value: "true" }, { label: "Aus", value: "false" }]} value={container.autoplay !== false ? "true" : "false"} onChange={(v) => onChange({ ...container, autoplay: v === "true" })} />
            </div>
            <div style={{ flex: 1 }}>
              <TextField label="Verzögerung (ms)" type="number" value={String(container.delay || 4000)} onChange={(v) => onChange({ ...container, delay: Number(v) || 4000 })} autoComplete="off" />
            </div>
          </InlineStack>
        </BlockStack>
      </Card>

      {(container.slides || []).map((slide, idx) => (
        <Card key={idx}>
          <BlockStack gap="400">
            <InlineStack align="space-between" blockAlign="center">
              <Text as="h3" variant="headingSm">Folie {idx + 1}</Text>
              {(container.slides || []).length > 1 && (
                <Button size="slim" tone="critical" onClick={() => removeSlide(idx)}>Entfernen</Button>
              )}
            </InlineStack>

            <ImageField
              label="Bild"
              helpText="3000×1000 px empfohlen · Das Bild ist klickbar über btn_url"
              value={slide.image}
              onPick={() => setPickerIdx(idx)}
              onClear={() => updateSlide(idx, "image", "")}
            />

            <InlineStack gap="400" wrap={false}>
              <div style={{ flex: 1 }}>
                <TextField label="Titel" value={slide.title || ""} onChange={(v) => updateSlide(idx, "title", v)} placeholder="Überschrift…" autoComplete="off" />
              </div>
              <div style={{ flex: 1 }}>
                <TextField label="Untertitel" value={slide.subtitle || ""} onChange={(v) => updateSlide(idx, "subtitle", v)} placeholder="Untertitel…" autoComplete="off" />
              </div>
            </InlineStack>

            <InlineStack gap="400" wrap={false}>
              <div style={{ flex: 1 }}>
                <TextField label="Button-Text" value={slide.btn_text || ""} onChange={(v) => updateSlide(idx, "btn_text", v)} placeholder="Jetzt entdecken" autoComplete="off" />
              </div>
              <div style={{ flex: 1 }}>
                <TextField label="URL (Bild-Klick + Button)" value={slide.btn_url || ""} onChange={(v) => updateSlide(idx, "btn_url", v)} placeholder="/de/collections/..." autoComplete="off" />
              </div>
            </InlineStack>

            <InlineStack gap="400" wrap={false}>
              <div style={{ flex: 2 }}>
                <Select label="Textposition" options={TEXT_POSITION_OPTIONS} value={slide.text_position || "center"} onChange={(v) => updateSlide(idx, "text_position", v)} />
              </div>
              <div style={{ flex: 1 }}>
                <ColorField label="Textfarbe" value={slide.text_color || "#ffffff"} onChange={(v) => updateSlide(idx, "text_color", v)} />
              </div>
              <div style={{ flex: 1 }}>
                <TextField label="Overlay 0–100 (0 = kein)" type="number" value={String(slide.overlay ?? 0)} onChange={(v) => updateSlide(idx, "overlay", Math.min(100, Math.max(0, Number(v))))} autoComplete="off" />
              </div>
            </InlineStack>

            <InlineStack gap="400" wrap={false}>
              <div style={{ flex: 1 }}>
                <TextField label="Titel-Schriftgröße" value={slide.title_size || "clamp(24px,4vw,56px)"} onChange={(v) => updateSlide(idx, "title_size", v)} autoComplete="off" helpText="z.B. 48px" />
              </div>
              <div style={{ flex: 1 }}>
                <TextField label="Untertitel-Schriftgröße" value={slide.subtitle_size || "clamp(14px,2vw,22px)"} onChange={(v) => updateSlide(idx, "subtitle_size", v)} autoComplete="off" helpText="z.B. 20px" />
              </div>
            </InlineStack>
          </BlockStack>
        </Card>
      ))}

      <Button onClick={addSlide}>+ Folie hinzufügen</Button>
    </BlockStack>
  );
}

// ── Text Block editor ───────────────────────────────────────────────────────
function TextBlockEditor({ container, onChange }) {
  return (
    <BlockStack gap="400">
      <TextField label="Überschrift" value={container.title || ""} onChange={(v) => onChange({ ...container, title: v })} placeholder="Überschrift…" autoComplete="off" />
      <div>
        <TextField label="Text (HTML)" value={container.body || ""} onChange={(v) => onChange({ ...container, body: v })} placeholder="<p>Text…</p>" multiline={6} autoComplete="off" />
        <Text as="p" variant="bodySm" tone="subdued">HTML wird unterstützt: &lt;b&gt;, &lt;i&gt;, &lt;a&gt;, &lt;p&gt;, &lt;br&gt; usw.</Text>
      </div>
      <InlineStack gap="400" wrap={false}>
        <div style={{ flex: 1 }}>
          <TextField label="Button-Text" value={container.btn_text || ""} onChange={(v) => onChange({ ...container, btn_text: v })} autoComplete="off" />
        </div>
        <div style={{ flex: 1 }}>
          <TextField label="Button-URL" value={container.btn_url || ""} onChange={(v) => onChange({ ...container, btn_url: v })} autoComplete="off" />
        </div>
      </InlineStack>
      <InlineStack gap="400" wrap={false}>
        <div style={{ flex: 1 }}>
          <Select label="Ausrichtung" options={[{ label: "Links", value: "left" }, { label: "Mitte", value: "center" }, { label: "Rechts", value: "right" }]} value={container.align || "center"} onChange={(v) => onChange({ ...container, align: v })} />
        </div>
        <div style={{ flex: 1 }}>
          <ColorField label="Hintergrundfarbe" value={container.bg_color || "#ffffff"} onChange={(v) => onChange({ ...container, bg_color: v })} />
        </div>
        <div style={{ flex: 1 }}>
          <ColorField label="Textfarbe" value={container.text_color || "#111827"} onChange={(v) => onChange({ ...container, text_color: v })} />
        </div>
      </InlineStack>
    </BlockStack>
  );
}

// ── Image + Text editor ─────────────────────────────────────────────────────
function ImageTextEditor({ container, onChange }) {
  const [pickerOpen, setPickerOpen] = useState(false);
  return (
    <BlockStack gap="400">
      {pickerOpen && (
        <MediaPickerModal open multiple={false} onClose={() => setPickerOpen(false)} onSelect={(urls) => { if (urls[0]) onChange({ ...container, image: urls[0] }); setPickerOpen(false); }} />
      )}
      <ImageField label="Bild" value={container.image} onPick={() => setPickerOpen(true)} onClear={() => onChange({ ...container, image: "" })} />
      <Select label="Bildposition" options={[{ label: "Links", value: "left" }, { label: "Rechts", value: "right" }]} value={container.image_side || "left"} onChange={(v) => onChange({ ...container, image_side: v })} />
      <TextField label="Überschrift" value={container.title || ""} onChange={(v) => onChange({ ...container, title: v })} autoComplete="off" />
      <div>
        <TextField label="Text (HTML)" value={container.body || ""} onChange={(v) => onChange({ ...container, body: v })} multiline={4} autoComplete="off" />
        <Text as="p" variant="bodySm" tone="subdued">HTML wird unterstützt</Text>
      </div>
      <InlineStack gap="400" wrap={false}>
        <div style={{ flex: 1 }}>
          <TextField label="Button-Text" value={container.btn_text || ""} onChange={(v) => onChange({ ...container, btn_text: v })} autoComplete="off" />
        </div>
        <div style={{ flex: 1 }}>
          <TextField label="Button-URL" value={container.btn_url || ""} onChange={(v) => onChange({ ...container, btn_url: v })} autoComplete="off" />
        </div>
      </InlineStack>
      <InlineStack gap="400" wrap={false}>
        <div style={{ flex: 1 }}>
          <ColorField label="Hintergrundfarbe" value={container.bg_color || "#ffffff"} onChange={(v) => onChange({ ...container, bg_color: v })} />
        </div>
        <div style={{ flex: 1 }}>
          <ColorField label="Textfarbe" value={container.text_color || "#111827"} onChange={(v) => onChange({ ...container, text_color: v })} />
        </div>
      </InlineStack>
    </BlockStack>
  );
}

// ── Image Grid editor ───────────────────────────────────────────────────────
const ASPECT_RATIO_OPTIONS = [
  { label: "Quadrat (1:1)",    value: "1/1" },
  { label: "Hochformat (2:3)", value: "2/3" },
  { label: "Querformat (3:1)", value: "3/1" },
  { label: "Breit (16:9)",     value: "16/9" },
];

function ImageGridEditor({ container, onChange }) {
  const [pickerIdx, setPickerIdx] = useState(null);
  const updateImg = (idx, key, val) => {
    const images = [...(container.images || [])];
    images[idx] = { ...images[idx], [key]: val };
    onChange({ ...container, images });
  };
  const addImg = () => onChange({ ...container, images: [...(container.images || []), { url: "", link: "", aspect_ratio: "1/1" }] });
  const removeImg = (idx) => onChange({ ...container, images: (container.images || []).filter((_, i) => i !== idx) });

  return (
    <BlockStack gap="400">
      {pickerIdx !== null && (
        <MediaPickerModal open multiple={false} onClose={() => setPickerIdx(null)} onSelect={(urls) => { if (urls[0]) updateImg(pickerIdx, "url", urls[0]); setPickerIdx(null); }} />
      )}
      <InlineStack gap="400">
        <div style={{ flex: 1 }}>
          <Select label="Spalten" options={[{ label: "2 Spalten", value: "2" }, { label: "3 Spalten", value: "3" }, { label: "4 Spalten", value: "4" }]} value={String(container.cols || 2)} onChange={(v) => onChange({ ...container, cols: Number(v) })} />
        </div>
        <div style={{ flex: 1 }}>
          <TextField label="Abstand (px)" type="number" value={String(container.gap || 16)} onChange={(v) => onChange({ ...container, gap: Number(v) || 16 })} autoComplete="off" />
        </div>
      </InlineStack>

      {(container.images || []).map((img, idx) => (
        <Card key={idx}>
          <BlockStack gap="300">
            <InlineStack align="space-between" blockAlign="center">
              <Text as="h3" variant="headingSm">Bild {idx + 1}</Text>
              {(container.images || []).length > 1 && (
                <Button size="slim" tone="critical" onClick={() => removeImg(idx)}>Entfernen</Button>
              )}
            </InlineStack>
            <ImageField value={img.url} onPick={() => setPickerIdx(idx)} onClear={() => updateImg(idx, "url", "")} />
            <InlineStack gap="400" wrap={false}>
              <div style={{ flex: 1 }}>
                <TextField label="Link-URL (optional)" value={img.link || ""} onChange={(v) => updateImg(idx, "link", v)} placeholder="https://…" autoComplete="off" />
              </div>
              <div style={{ flex: 1 }}>
                <Select label="Seitenverhältnis" options={ASPECT_RATIO_OPTIONS} value={img.aspect_ratio || "1/1"} onChange={(v) => updateImg(idx, "aspect_ratio", v)} />
              </div>
            </InlineStack>
          </BlockStack>
        </Card>
      ))}
      <Button onClick={addImg}>+ Bild hinzufügen</Button>
    </BlockStack>
  );
}

// ── CTA Banner editor ───────────────────────────────────────────────────────
function BannerCtaEditor({ container, onChange }) {
  return (
    <BlockStack gap="400">
      <TextField label="Überschrift" value={container.title || ""} onChange={(v) => onChange({ ...container, title: v })} autoComplete="off" />
      <TextField label="Untertitel" value={container.subtitle || ""} onChange={(v) => onChange({ ...container, subtitle: v })} autoComplete="off" />
      <InlineStack gap="400" wrap={false}>
        <div style={{ flex: 1 }}>
          <TextField label="Button-Text" value={container.btn_text || ""} onChange={(v) => onChange({ ...container, btn_text: v })} autoComplete="off" />
        </div>
        <div style={{ flex: 1 }}>
          <TextField label="Button-URL" value={container.btn_url || ""} onChange={(v) => onChange({ ...container, btn_url: v })} autoComplete="off" />
        </div>
      </InlineStack>
      <InlineStack gap="400" wrap={false}>
        <div style={{ flex: 2 }}>
          <Select label="Textposition" options={TEXT_POSITION_OPTIONS} value={container.text_position || "center"} onChange={(v) => onChange({ ...container, text_position: v })} />
        </div>
        <div style={{ flex: 1 }}>
          <ColorField label="Hintergrundfarbe" value={container.bg_color || "#ff971c"} onChange={(v) => onChange({ ...container, bg_color: v })} />
        </div>
        <div style={{ flex: 1 }}>
          <ColorField label="Textfarbe" value={container.text_color || "#ffffff"} onChange={(v) => onChange({ ...container, text_color: v })} />
        </div>
      </InlineStack>
    </BlockStack>
  );
}

// ── Collection Carousel editor ──────────────────────────────────────────────
function CollectionCarouselEditor({ container, onChange }) {
  const client = getMedusaAdminClient();
  const [collections, setCollections] = useState([]);

  useEffect(() => {
    client.request("/admin-hub/collections").then((r) => {
      setCollections(Array.isArray(r?.collections) ? r.collections : []);
    }).catch(() => {});
  }, []);

  const colOptions = [
    { label: "— Kollektion wählen —", value: "" },
    ...collections.map((c) => ({ label: c.title || c.handle || c.id, value: c.id })),
  ];

  return (
    <BlockStack gap="400">
      <TextField label="Überschrift (optional)" value={container.title || ""} onChange={(v) => onChange({ ...container, title: v })} autoComplete="off" />
      <Select
        label="Kollektion"
        options={colOptions}
        value={container.collection_id || ""}
        onChange={(id) => {
          const col = collections.find((c) => c.id === id);
          onChange({ ...container, collection_id: id, collection_handle: col?.handle || "" });
        }}
      />
      <Select
        label="Produkte pro Reihe"
        options={[2, 3, 4, 5, 6].map((n) => ({ label: String(n), value: String(n) }))}
        value={String(container.items_per_row || 4)}
        onChange={(v) => onChange({ ...container, items_per_row: Number(v) })}
      />
    </BlockStack>
  );
}

function ContainerEditor({ container, onChange }) {
  switch (container.type) {
    case "hero_banner":         return <HeroBannerEditor container={container} onChange={onChange} />;
    case "text_block":          return <TextBlockEditor container={container} onChange={onChange} />;
    case "image_text":          return <ImageTextEditor container={container} onChange={onChange} />;
    case "image_grid":          return <ImageGridEditor container={container} onChange={onChange} />;
    case "banner_cta":          return <BannerCtaEditor container={container} onChange={onChange} />;
    case "collection_carousel": return <CollectionCarouselEditor container={container} onChange={onChange} />;
    default: return null;
  }
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function LandingPageEditor() {
  const client = getMedusaAdminClient();
  const [pages, setPages] = useState([]);
  const [selectedPageId, setSelectedPageId] = useState("");
  const [containers, setContainers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState("");
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [expandedId, setExpandedId] = useState(null);

  useEffect(() => {
    client.request("/admin-hub/pages").then((r) => {
      setPages(Array.isArray(r?.pages) ? r.pages : []);
    }).catch(() => {});
  }, []);

  const loadContainers = useCallback(async (pageId) => {
    if (!pageId) return;
    setLoading(true);
    setErr("");
    try {
      const data = await client.getLandingPageContainers(pageId);
      setContainers(Array.isArray(data?.containers) ? data.containers : []);
    } catch (_) {
      setContainers([]);
    }
    setLoading(false);
  }, [client]);

  useEffect(() => {
    if (selectedPageId) loadContainers(selectedPageId);
    else setContainers([]);
  }, [selectedPageId, loadContainers]);

  const handleSave = async () => {
    if (!selectedPageId) return;
    setSaving(true);
    setErr("");
    setSaved(false);
    try {
      await client.saveLandingPageContainers(selectedPageId, containers);
      setSaved(true);
      setTimeout(() => setSaved(false), 4000);
    } catch (e) {
      setErr(e?.message || "Fehler beim Speichern");
    }
    setSaving(false);
  };

  const addContainer = (type) => {
    const c = newContainer(type);
    setContainers((prev) => [...prev, c]);
    setExpandedId(c.id);
    setAddModalOpen(false);
  };

  const updateContainer = (id, updated) => setContainers((prev) => prev.map((c) => c.id === id ? updated : c));
  const removeContainer = (id) => { setContainers((prev) => prev.filter((c) => c.id !== id)); if (expandedId === id) setExpandedId(null); };
  const moveContainer = (id, dir) => {
    setContainers((prev) => {
      const idx = prev.findIndex((c) => c.id === id);
      if (idx < 0) return prev;
      const next = [...prev];
      const target = idx + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  };

  const typeInfo = (type) => CONTAINER_TYPES.find((t) => t.type === type) || { label: type };
  const pageOptions = [
    { label: "— Seite auswählen —", value: "" },
    ...pages.map((p) => ({ label: `${p.title || "Seite"} (${p.slug || p.id})`, value: p.id })),
  ];

  return (
    <Page
      title="Landing Page"
      subtitle="Gestalte Seiten deines Shops mit Containern"
      primaryAction={selectedPageId ? { content: saving ? "Speichern…" : "Speichern", onAction: handleSave, loading: saving } : undefined}
    >
      <Layout>
        {err && <Layout.Section><Banner tone="critical" onDismiss={() => setErr("")}>{err}</Banner></Layout.Section>}
        {saved && <Layout.Section><Banner tone="success" onDismiss={() => setSaved(false)}>Änderungen gespeichert.</Banner></Layout.Section>}

        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingSm">Seite auswählen</Text>
              <Text as="p" variant="bodySm" tone="subdued">
                Wähle eine Seite aus, für die du die Inhalte gestalten möchtest.{" "}
                <a href="/content/pages" style={{ color: "var(--p-color-text-emphasis)" }}>Seiten verwalten →</a>
              </Text>
              <Select label="Seite" labelHidden options={pageOptions} value={selectedPageId} onChange={(v) => { setSelectedPageId(v); setExpandedId(null); }} />
            </BlockStack>
          </Card>
        </Layout.Section>

        {selectedPageId && (
          <Layout.Section>
            {loading ? (
              <Card><Box paddingBlock="600"><Text as="p" tone="subdued" alignment="center">Laden…</Text></Box></Card>
            ) : (
              <BlockStack gap="400">
                {containers.length === 0 && (
                  <Card>
                    <Box paddingBlock="800">
                      <BlockStack gap="300" align="center">
                        <Text as="p" variant="bodyLg" tone="subdued" alignment="center">Noch keine Container</Text>
                        <InlineStack align="center">
                          <Button variant="primary" onClick={() => setAddModalOpen(true)}>Container hinzufügen</Button>
                        </InlineStack>
                      </BlockStack>
                    </Box>
                  </Card>
                )}

                {containers.map((c, idx) => {
                  const info = typeInfo(c.type);
                  const isExpanded = expandedId === c.id;
                  return (
                    <Card key={c.id}>
                      <BlockStack gap="0">
                        <Box paddingBlockEnd={isExpanded ? "400" : "0"}>
                          <InlineStack align="space-between" blockAlign="center" gap="300">
                            <InlineStack gap="300" blockAlign="center">
                              <Text as="h3" variant="headingSm">{info.label}</Text>
                              <Badge tone={c.visible ? "success" : undefined}>{c.visible ? "Sichtbar" : "Versteckt"}</Badge>
                              <Text as="span" variant="bodySm" tone="subdued">#{idx + 1}</Text>
                            </InlineStack>
                            <InlineStack gap="200" blockAlign="center">
                              <Button size="slim" onClick={() => updateContainer(c.id, { ...c, visible: !c.visible })}>{c.visible ? "Verstecken" : "Einblenden"}</Button>
                              <Button size="slim" disabled={idx === 0} onClick={() => moveContainer(c.id, -1)}>↑</Button>
                              <Button size="slim" disabled={idx === containers.length - 1} onClick={() => moveContainer(c.id, 1)}>↓</Button>
                              <Button size="slim" tone="critical" onClick={() => { if (confirm("Container entfernen?")) removeContainer(c.id); }}>Entfernen</Button>
                              <Button size="slim" variant={isExpanded ? "primary" : "secondary"} onClick={() => setExpandedId(isExpanded ? null : c.id)}>
                                {isExpanded ? "Einklappen" : "Bearbeiten"}
                              </Button>
                            </InlineStack>
                          </InlineStack>
                        </Box>
                        {isExpanded && (
                          <>
                            <Divider />
                            <Box paddingBlockStart="400">
                              <ContainerEditor container={c} onChange={(updated) => updateContainer(c.id, updated)} />
                            </Box>
                          </>
                        )}
                      </BlockStack>
                    </Card>
                  );
                })}

                {containers.length > 0 && (
                  <InlineStack>
                    <Button onClick={() => setAddModalOpen(true)}>+ Container hinzufügen</Button>
                  </InlineStack>
                )}
              </BlockStack>
            )}
          </Layout.Section>
        )}

        <Modal open={addModalOpen} onClose={() => setAddModalOpen(false)} title="Container auswählen">
          <Modal.Section>
            <BlockStack gap="300">
              {CONTAINER_TYPES.map((t) => (
                <Box key={t.type} padding="400" borderWidth="025" borderColor="border" borderRadius="200" background="bg-surface">
                  <InlineStack align="space-between" blockAlign="center" gap="300">
                    <BlockStack gap="100">
                      <Text as="p" variant="bodyMd" fontWeight="semibold">{t.label}</Text>
                      <Text as="p" variant="bodySm" tone="subdued">{t.description}</Text>
                    </BlockStack>
                    <Button variant="primary" size="slim" onClick={() => addContainer(t.type)}>Auswählen</Button>
                  </InlineStack>
                </Box>
              ))}
            </BlockStack>
          </Modal.Section>
        </Modal>
      </Layout>
    </Page>
  );
}
