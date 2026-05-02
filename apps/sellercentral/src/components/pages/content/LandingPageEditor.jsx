"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
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
  Tabs as PolarisTabs,
  Checkbox,
} from "@shopify/polaris";
import { useParams } from "next/navigation";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";
import { useUnsavedChanges } from "@/context/UnsavedChangesContext";
import MediaPickerModal from "@/components/MediaPickerModal";
import RichTextEditor from "@/components/RichTextEditor";
import { mergeLoadedShopStyles } from "@andertal/shop-theme";

const BACKEND_URL = (process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000").replace(/\/$/, "");

// ── i18n helpers ──────────────────────────────────────────────────────────────

/** Read a translatable text field from a container or item */
function gi(obj, field, lang) {
  if (!lang || lang === "de") return obj?.[field] ?? "";
  return obj?._i18n?.[lang]?.[field] ?? obj?.[field] ?? "";
}

/** Return updated object with a translatable field set for the given language */
function si(obj, field, lang, value) {
  if (!lang || lang === "de") return { ...obj, [field]: value };
  return {
    ...obj,
    _i18n: {
      ...(obj._i18n || {}),
      [lang]: { ...(obj._i18n?.[lang] || {}), [field]: value },
    },
  };
}

/** Shop-Locales für Texte + Bilder (_i18n-Schlüssel = URL-Segment en, de, tr, …) */
const SHOP_CONTENT_LANG_OPTIONS = [
  { label: "DE (Standard / Fallback)", value: "de" },
  { label: "English", value: "en" },
  { label: "Türkçe", value: "tr" },
  { label: "Français", value: "fr" },
  { label: "Italiano", value: "it" },
  { label: "Español", value: "es" },
];

function resolveUrl(url) {
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("/")) return url;
  return `${BACKEND_URL}/uploads/${url}`;
}

/** Kollektionen-Karussell — maps to CSS aspect-ratio on the shop */
const COLLECTIONS_CAROUSEL_ASPECT_OPTIONS = [
  { label: "Hochformat — 4:5 (Standard)", value: "4/5" },
  { label: "Hochformat — 3:4", value: "3/4" },
  { label: "Hochformat — 2:3", value: "2/3" },
  { label: "Quadrat — 1:1", value: "1/1" },
  { label: "Querformat — 4:3", value: "4/3" },
  { label: "Querformat — 3:2", value: "3/2" },
  { label: "Querformat — 16:9 (breit)", value: "16/9" },
  { label: "Querformat — 21:9 (Cinematic)", value: "21/9" },
];

const COLLECTIONS_CAROUSEL_OBJECT_FIT_OPTIONS = [
  { label: "Füllen (Bild zuschneiden, wie im Shop üblich)", value: "cover" },
  { label: "Einpassen (ganzes Bild sichtbar, ggf. Ränder)", value: "contain" },
];

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

// Parse a CSS padding shorthand into [top, right, bottom, left]
function parsePadding(val) {
  const parts = (val || "0px").trim().split(/\s+/);
  if (parts.length === 1) return [parts[0], parts[0], parts[0], parts[0]];
  if (parts.length === 2) return [parts[0], parts[1], parts[0], parts[1]];
  if (parts.length === 3) return [parts[0], parts[1], parts[2], parts[1]];
  return [parts[0], parts[1], parts[2], parts[3]];
}

/** Kompakte, umbrechende Feldgruppen (statt 4 Felder in einer quetschten Zeile) */
const EDITOR_FIELD_GRID = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
  gap: 12,
  width: "100%",
};

/** Hauptinhalt (links) + Abstand-Panel (rechts) */
const CONTAINER_EDITOR_ROW = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "flex-start",
  gap: 24,
  width: "100%",
};
const CONTAINER_EDITOR_MAIN = { flex: "1 1 420px", minWidth: 0, maxWidth: "100%" };
const CONTAINER_EDITOR_CHROME = { flex: "0 0 300px", minWidth: 260, maxWidth: "100%", position: "sticky", top: 16, alignSelf: "flex-start" };

/** Einheitliche Innenabstand-Defaults pro Container-Typ (Landing Page) */
const CONTAINER_PADDING_DEFAULTS = {
  hero_banner: "0px 0px 0px 0px",
  text_block: "48px 24px 48px 24px",
  image_text: "48px 24px 48px 24px",
  image_grid: "32px 24px 32px 24px",
  image_carousel: "32px 24px 32px 24px",
  video_block: "32px 24px 32px 24px",
  banner_cta: "32px 48px 40px 48px",
  collection_carousel: "32px 24px 32px 24px",
  collections_carousel: "32px 24px 32px 24px",
  content_mosaic: "32px 24px 32px 24px",
  accordion: "48px 24px 48px 24px",
  tabs: "48px 24px 48px 24px",
  single_product: "48px 24px 48px 24px",
  blog_carousel: "40px 24px 40px 24px",
  newsletter: "48px 24px 48px 24px",
  feature_grid: "64px 24px 64px 24px",
  testimonials: "64px 24px 64px 24px",
};

function getContainerPaddingDefault(type) {
  return CONTAINER_PADDING_DEFAULTS[type] || "32px 24px 32px 24px";
}

/** true = nur links/rechts (2 Felder) — schnell; false = 4-Seiten-Padding (z. B. CTA-Banner) */
function containerPaddingHorizontalOnly(type) {
  return type !== "banner_cta";
}

// horizontalOnly=true: only shows Rechts/Links fields (vertical spacing comes from ContainerSpacingEditor)
function PaddingEditor({ label = "Innenabstand", value, onChange, defaultValue = "0px 0px 0px 0px", horizontalOnly = false }) {
  const [t, r, b, l] = parsePadding(value || defaultValue);
  const emit = (top, right, bottom, left) => onChange(`${top} ${right} ${bottom} ${left}`);
  if (horizontalOnly) {
    return (
      <BlockStack gap="200">
        <Text as="p" variant="bodyMd" fontWeight="semibold">{label}</Text>
        <div style={EDITOR_FIELD_GRID}>
          <TextField label="Rechts" value={r} onChange={(v) => emit(t, v, b, l)} autoComplete="off" placeholder="0px" />
          <TextField label="Links" value={l} onChange={(v) => emit(t, r, b, v)} autoComplete="off" placeholder="0px" />
        </div>
      </BlockStack>
    );
  }
  return (
    <BlockStack gap="200">
      <Text as="p" variant="bodyMd" fontWeight="semibold">{label}</Text>
      <div style={EDITOR_FIELD_GRID}>
        <TextField label="Oben" value={t} onChange={(v) => emit(v, r, b, l)} autoComplete="off" placeholder="0px" />
        <TextField label="Unten" value={b} onChange={(v) => emit(t, r, v, l)} autoComplete="off" placeholder="0px" />
        <TextField label="Rechts" value={r} onChange={(v) => emit(t, v, b, l)} autoComplete="off" placeholder="0px" />
        <TextField label="Links" value={l} onChange={(v) => emit(t, r, b, v)} autoComplete="off" placeholder="0px" />
      </div>
    </BlockStack>
  );
}

function getContainerTypes(isTurkish) {
  if (isTurkish) {
    return [
      { type: "hero_banner",         label: "Hero Banner / Slider",           description: "Birden fazla görselli tam genişlik slider (3000x1000 px önerilir)" },
      { type: "text_block",          label: "Metin Bloğu",                    description: "Başlık, metin (HTML) ve opsiyonel buton" },
      { type: "image_text",          label: "Görsel + Metin",                 description: "Solda veya sağda görsel, yanında metin (HTML)" },
      { type: "image_grid",          label: "Görsel Izgarası",                description: "En-boy oranı seçimiyle yan yana 2-4 görsel" },
      { type: "content_mosaic",      label: "İçerik Mozaiği",                 description: "Görseller, koleksiyon ürünleri veya koleksiyon kartları; masaüstü ve mobil için satır/sütun ayrı ayarlanır" },
      { type: "image_carousel",      label: "Görsel Karuseli",                description: "Kendi görsellerinizle kaydırılabilir karusel" },
      { type: "video_block",         label: "Video",                          description: "Gömülü veya barındırılan video (masaüstü + mobil, dosya URL ya da YouTube/Vimeo)" },
      { type: "banner_cta",          label: "CTA Banner",                     description: "Eylem çağrısı ve konumlandırma içeren renkli banner" },
      { type: "collection_carousel", label: "Koleksiyon Karuseli",            description: "Bir koleksiyonun ürünlerini karusel olarak gösterir" },
      { type: "collections_carousel", label: "Koleksiyonlar Karuseli",        description: "Birden fazla koleksiyonu tıklanabilir kartlar halinde gösterir" },
      { type: "accordion",           label: "Akordeon (SSS)",                 description: "Açılır-kapanır soru-cevap bölümleri, SSS için ideal" },
      { type: "tabs",                label: "Sekmeler",                       description: "İçerikleri sekmeler arasında gösterir" },
      { type: "single_product",      label: "Tekil Ürün",                     description: "Öne çıkarılmış tek ürün kartı (sepete ekle ile)" },
      { type: "blog_carousel",       label: "Blog Yazıları (Karusel)",        description: "Yayınlanan blog yazılarını karusel olarak gösterir" },
      { type: "newsletter",          label: "Bulten Kaydı",                   description: "Mailchimp, Brevo, Klaviyo vb. için action URL ile form" },
      { type: "feature_grid",        label: "Ozellik Izgarasi",               description: "Icon/emoji, başlık ve açıklama metni içeren ızgara" },
      { type: "testimonials",        label: "Müşteri Yorumları",              description: "Avatar, isim, rol ve yıldız puanı destekli yorum kartları" },
    ];
  }
  return [
    { type: "hero_banner",         label: "Hero Banner / Slider",  description: "Vollbild-Slider mit mehreren Bildern (3000×1000 px empfohlen)" },
    { type: "text_block",          label: "Text-Block",            description: "Überschrift, Fließtext (HTML) und optionaler Button" },
    { type: "image_text",          label: "Bild + Text",           description: "Bild links oder rechts, Text (HTML) daneben" },
    { type: "image_grid",          label: "Bild-Raster",           description: "2–4 Bilder nebeneinander mit Seitenverhältnis-Auswahl" },
    { type: "content_mosaic",      label: "Inhalts-Mosaik",        description: "Bilder, Kollektionsprodukte oder Kollektionskarten — Zeilen/Spalten pro Desktop & Mobil frei (z. B. 1 oben, 2 unten)" },
    { type: "image_carousel",      label: "Bild-Karussell",        description: "Scrollbares Karussell mit eigenen Bildern (wie Produkt-Karussell)" },
    { type: "video_block",         label: "Video",                 description: "Eingebettetes oder gehostetes Video (Desktop + Mobil, Datei-URL oder YouTube/Vimeo)" },
    { type: "banner_cta",          label: "CTA-Banner",            description: "Farbiger Banner mit Handlungsaufforderung und Positionierung" },
    { type: "collection_carousel", label: "Kollektion-Karussell",  description: "Produkte einer Kollektion als Karussell" },
    { type: "collections_carousel", label: "Kollektionen-Karussell", description: "Mehrere Kollektionen als anklickbare Karten nebeneinander" },
    { type: "accordion",           label: "Accordion (FAQ)",       description: "Aufklappbare Frage-Antwort-Sektionen, ideal für FAQs" },
    { type: "tabs",                label: "Tabs (Registerkarten)", description: "Inhalte in wechselbaren Reitern anzeigen" },
    { type: "single_product",      label: "Einzelnes Produkt",     description: "Ein hervorgehobenes Produkt (Karte mit Warenkorb)" },
    { type: "blog_carousel",       label: "Blog-Beiträge (Karussell)", description: "Veröffentlichte Blog-Seiten aus „Content → Blog-Beiträge“ auswählen (Bild, Teaser, Text & SEO kommen aus dem Beitrag)" },
    { type: "newsletter",          label: "Newsletter-Anmeldung",  description: "Formular (Mailchimp, Brevo, Klaviyo u. a.) per action-URL" },
    { type: "feature_grid",        label: "Feature-Raster",        description: "Raster mit Icon/Emoji, Titel und Beschreibungstext — ideal für USPs und Produktmerkmale" },
    { type: "testimonials",        label: "Kundenstimmen",         description: "Kundenzitate als Karten mit optionalem Avatar, Name, Rolle und Sternebewertung" },
  ];
}

const CAT_HEADING = "__heading_categories__";
const PAGE_HEADING = "__heading_cms_pages__";
const BLOG_HEADING = "__heading_blog_posts__";

function flattenCategoriesForSelect(nodes, depth = 0, acc = []) {
  if (!Array.isArray(nodes)) return acc;
  for (const n of nodes) {
    if (!n?.id) continue;
    const pad = depth > 0 ? `${"\u00A0\u00A0".repeat(depth)}\u2022 ` : "";
    acc.push({
      label: `${pad}${n.name || n.slug || n.id}`,
      value: `cat:${n.id}`,
    });
    if (Array.isArray(n.children) && n.children.length) {
      flattenCategoriesForSelect(n.children, depth + 1, acc);
    }
  }
  return acc;
}

/** Normalisiert gespeicherte Landing-Settings inkl. Shop-Subnav / Filterleiste. */
function normalizeLandingPageSettings(raw) {
  const s = raw && typeof raw === "object" ? raw : {};
  return {
    ...s,
    show_submenu_left: s.show_submenu_left === true,
    show_filter_bar: s.show_filter_bar !== false,
    page_padding_top: s.page_padding_top || "",
  };
}

function newContainer(type) {
  const id = Math.random().toString(36).slice(2);
  const base = { id, type, visible: true };
  switch (type) {
    case "hero_banner":
      return { ...base, slides: [{ image: "", title: "", subtitle: "", btn_text: "", btn_url: "", overlay: 0, text_color: "#ffffff", text_position: "center", title_size: "clamp(24px,4vw,56px)", subtitle_size: "clamp(14px,2vw,22px)", content_padding: "32px 48px", btn_bg: "#ff971c", btn_color: "#fff", btn_border: "2px solid #000", btn_radius: 8 }], height: "500px", autoplay: true, delay: 4000, padding: "0px 0px 0px 0px", content_layout: "full" };
    case "text_block":
      return { ...base, title: "", body: "", btn_text: "", btn_url: "", align: "center", bg_color: "#ffffff", text_color: "#111827", padding: "48px 24px", btn_bg: "#ff971c", btn_color: "#fff", btn_border: "2px solid #000", btn_radius: 8, content_layout: "full" };
    case "image_text":
      return { ...base, image: "", title: "", body: "", btn_text: "", btn_url: "", image_side: "left", bg_color: "#ffffff", text_color: "#111827", text_align: "left", padding: "48px 24px", btn_bg: "#ff971c", btn_color: "#fff", btn_border: "2px solid #000", btn_radius: 8, content_layout: "full" };
    case "image_grid":
      return { ...base, images: [{ url: "", link: "", aspect_ratio: "1/1" }, { url: "", link: "", aspect_ratio: "1/1" }], cols: 2, gap: 16, padding: "32px 24px", content_layout: "full" };
    case "content_mosaic":
      return {
        ...base,
        title: "",
        source: "images",
        images: [{ url: "", link: "", aspect_ratio: "1/1", title: "", text: "" }],
        collection_id: "",
        collection_handle: "",
        product_captions: "",
        collections: [],
        layout_pattern_desktop: "1,2",
        layout_pattern_mobile: "1",
        gap: 16,
        gap_mobile: undefined,
        card_aspect_ratio: "4/5",
        card_image_object_fit: "cover",
        bg_color: "#ffffff",
        padding: "32px 24px",
        content_layout: "full",
      };
    case "image_carousel": {
      const emptySlide = {
        url: "",
        link: "",
        title: "",
        text: "",
      };
      return {
        ...base,
        title: "",
        images: [emptySlide, { ...emptySlide }],
        items_per_row: 4,
        items_per_row_mobile: 2,
        gap: 16,
        mobile_layout: "row",
        mobile_grid_rows: 2,
        mobile_grid_cols: 2,
        aspect_ratio: "4/5",
        aspect_ratio_custom: "",
        aspect_ratio_mobile: "",
        aspect_ratio_mobile_custom: "",
        mobile_item_width: "",
        min_height_mobile: "",
        max_height: "",
        max_height_mobile: "",
        padding: "32px 24px",
        content_layout: "full",
      };
    }
    case "banner_cta":
      return { ...base, title: "", subtitle: "", btn_text: "", btn_url: "", bg_color: "#ff971c", text_color: "#ffffff", text_position: "center", padding: "32px 48px 40px 48px", btn_bg: "#ffffff", btn_color: "#111827", btn_border: "2px solid #000", btn_radius: 8, content_layout: "full" };
    case "collection_carousel":
      return { ...base, title: "", collection_id: "", collection_handle: "", product_captions: "", items_per_row: 4, items_per_row_mobile: 2, gap: 16, mobile_layout: "row", mobile_grid_rows: 2, mobile_grid_cols: 2, padding: "32px 24px", content_layout: "full" };
    case "collections_carousel":
      return {
        ...base,
        title: "",
        collections: [],
        items_per_row: 4,
        items_per_row_mobile: 2,
        gap: 16,
        mobile_layout: "row",
        mobile_grid_rows: 2,
        mobile_grid_cols: 2,
        padding: "32px 24px",
        card_aspect_ratio: "4/5",
        card_image_object_fit: "cover",
        content_layout: "full",
      };
    case "accordion":
      return {
        ...base,
        title: "",
        items: [{ question: "Frage 1", answer: "" }, { question: "Frage 2", answer: "" }],
        bg_color: "#ffffff",
        text_color: "#111827",
        padding: "48px 24px",
        border_color: "#e5e7eb",
        icon_color: "#111827",
        content_layout: "full",
      };
    case "tabs":
      return { ...base, tabs: [{ label: "Tab 1", content: "" }, { label: "Tab 2", content: "" }], bg_color: "#ffffff", text_color: "#111827", padding: "48px 24px", tab_style: "underline", active_color: "#ff971c", tab_bg: "#f3f4f6", content_layout: "full" };
    case "single_product":
      return { ...base, title: "", product_id: "", product_handle: "", bg_color: "#ffffff", text_color: "#111827", padding: "48px 24px", content_layout: "full" };
    case "blog_carousel":
      return {
        ...base,
        title: "Blog",
        posts: [],
        items_per_row: 3,
        items_per_row_mobile: 1,
        bg_color: "#ffffff",
        text_color: "#111827",
        padding: "40px 24px",
        content_layout: "full",
      };
    case "newsletter":
      return {
        ...base,
        title: "Newsletter",
        subtitle: "Exklusive Angebote und Neuigkeiten.",
        button_text: "Anmelden",
        email_placeholder: "E-Mail-Adresse",
        provider: "other",
        form_action: "",
        form_method: "post",
        email_field_name: "EMAIL",
        hidden_fields: [],
        privacy_note: "",
        bg_color: "#f3f4f6",
        text_color: "#111827",
        btn_bg: "#111827",
        btn_color: "#ffffff",
        padding: "48px 24px",
        content_layout: "full",
      };
    case "feature_grid":
      return {
        ...base,
        title: "Unsere Vorteile",
        subtitle: "",
        title_align: "center",
        cols: 3,
        card_style: "bordered",
        icon_size: "40px",
        bg_color: "#ffffff",
        card_bg: "#f9fafb",
        card_border_color: "#e5e7eb",
        text_color: "#111827",
        icon_color: "#ff971c",
        padding: "64px 24px",
        content_layout: "full",
        items: [
          { icon: "⚡", title: "Schnelle Lieferung", body: "Versand innerhalb von 1–2 Werktagen direkt zu dir nach Hause." },
          { icon: "🔒", title: "Sicher einkaufen", body: "SSL-verschlüsselte Zahlung und Datenschutz nach DSGVO." },
          { icon: "↩️", title: "Kostenlose Rücksendung", body: "30 Tage Rückgaberecht — kein Aufwand, keine Fragen." },
        ],
      };
    case "testimonials":
      return {
        ...base,
        title: "Das sagen unsere Kunden",
        subtitle: "",
        title_align: "center",
        cols: 3,
        show_stars: true,
        card_bg: "#ffffff",
        card_border_color: "#e5e7eb",
        bg_color: "#f9fafb",
        text_color: "#111827",
        accent_color: "#ff971c",
        padding: "64px 24px",
        content_layout: "full",
        items: [
          { quote: "Absolut begeistert von der Qualität! Schnelle Lieferung und toller Kundenservice.", author: "Maria S.", role: "Stammkundin", avatar: "", rating: 5 },
          { quote: "Super einfache Bestellung, alles hat perfekt gepasst. Sehr empfehlenswert!", author: "Thomas K.", role: "Verifizierter Käufer", avatar: "", rating: 5 },
          { quote: "Endlich ein Online-Shop, dem man vertrauen kann. Tolle Auswahl und faire Preise.", author: "Julia M.", role: "Neukunde", avatar: "", rating: 4 },
        ],
      };
    case "video_block":
      return {
        ...base,
        title: "",
        caption: "",
        text_color: "#111827",
        video_mode: "file",
        video_url: "",
        video_url_mobile: "",
        embed_url: "",
        embed_url_mobile: "",
        poster_url: "",
        poster_url_mobile: "",
        aspect_ratio: "16/9",
        autoplay: false,
        muted: true,
        loop: false,
        controls: true,
        playsinline: true,
        bg_color: "#ffffff",
        padding: "32px 24px",
        content_layout: "full",
      };
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
function HeroBannerEditor({ container, onChange, editLang = "de" }) {
  const [pickerIdx, setPickerIdx] = useState(null);

  const updateSlide = (idx, key, val) => {
    const slides = [...(container.slides || [])];
    slides[idx] = { ...slides[idx], [key]: val };
    onChange({ ...container, slides });
  };
  const updateSlideI18n = (idx, field, val) => {
    const slides = [...(container.slides || [])];
    slides[idx] = si(slides[idx], field, editLang, val);
    onChange({ ...container, slides });
  };
  const addSlide = () => {
    onChange({ ...container, slides: [...(container.slides || []), { image: "", title: "", subtitle: "", btn_text: "", btn_url: "", overlay: 0, text_color: "#ffffff", text_position: "center", title_size: "clamp(24px,4vw,56px)", subtitle_size: "clamp(14px,2vw,22px)", content_padding: "32px 48px", btn_bg: "#ff971c", btn_color: "#fff", btn_border: "2px solid #000", btn_radius: 8 }] });
  };
  const removeSlide = (idx) => {
    onChange({ ...container, slides: (container.slides || []).filter((_, i) => i !== idx) });
  };
  const moveSlide = (idx, direction) => {
    const slides = [...(container.slides || [])];
    const nextIdx = idx + direction;
    if (nextIdx < 0 || nextIdx >= slides.length) return;
    [slides[idx], slides[nextIdx]] = [slides[nextIdx], slides[idx]];
    onChange({ ...container, slides });
  };

  return (
    <BlockStack gap="400">
      {pickerIdx !== null && (
        <MediaPickerModal open multiple={false} onClose={() => setPickerIdx(null)} onSelect={(urls) => { if (urls[0]) updateSlideI18n(pickerIdx, "image", urls[0]); setPickerIdx(null); }} />
      )}

      <Card>
        <BlockStack gap="300">
          <Text as="h3" variant="headingSm">Slider-Einstellungen</Text>
          <BlockStack gap="300">
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
            <Text as="p" variant="bodySm" tone="subdued">Innenabstand der Sektion und Inhaltsbreite: rechte Spalte.</Text>
          </BlockStack>
        </BlockStack>
      </Card>

      {(container.slides || []).map((slide, idx) => (
        <Card key={idx}>
          <BlockStack gap="400">
            <InlineStack align="space-between" blockAlign="center">
              <Text as="h3" variant="headingSm">Folie {idx + 1}</Text>
              <InlineStack gap="200">
                <Button size="slim" disabled={idx === 0} onClick={() => moveSlide(idx, -1)}>
                  Nach oben
                </Button>
                <Button size="slim" disabled={idx === (container.slides || []).length - 1} onClick={() => moveSlide(idx, 1)}>
                  Nach unten
                </Button>
                {(container.slides || []).length > 1 && (
                  <Button size="slim" tone="critical" onClick={() => removeSlide(idx)}>Entfernen</Button>
                )}
              </InlineStack>
            </InlineStack>

            <ImageField
              label="Bild"
              helpText="3000×1000 px empfohlen · Das Bild ist klickbar über btn_url · pro gewählter „Sprache bearbeiten“"
              value={gi(slide, "image", editLang)}
              onPick={() => setPickerIdx(idx)}
              onClear={() => updateSlideI18n(idx, "image", "")}
            />

            <InlineStack gap="400" wrap={false}>
              <div style={{ flex: 1 }}>
                <TextField label="Titel" value={gi(slide, "title", editLang)} onChange={(v) => updateSlideI18n(idx, "title", v)} placeholder="Überschrift…" autoComplete="off" />
              </div>
              <div style={{ flex: 1 }}>
                <TextField label="Untertitel" value={gi(slide, "subtitle", editLang)} onChange={(v) => updateSlideI18n(idx, "subtitle", v)} placeholder="Untertitel…" autoComplete="off" />
              </div>
            </InlineStack>

            <InlineStack gap="400" wrap={false}>
              <div style={{ flex: 1 }}>
                <TextField label="Button-Text" value={gi(slide, "btn_text", editLang)} onChange={(v) => updateSlideI18n(idx, "btn_text", v)} placeholder="Jetzt entdecken" autoComplete="off" />
              </div>
              <div style={{ flex: 1 }}>
                <TextField label="URL (Bild-Klick + Button)" value={slide.btn_url || ""} onChange={(v) => updateSlide(idx, "btn_url", v)} placeholder="/de/collections/..." autoComplete="off" />
              </div>
            </InlineStack>

            <InlineStack gap="400" wrap={false}>
              <div style={{ flex: 2 }}>
                <Select label="Text-Position" options={TEXT_POSITION_OPTIONS} value={slide.text_position || "center"} onChange={(v) => updateSlide(idx, "text_position", v)} />
              </div>
              <div style={{ flex: 1 }}>
                <ColorField label="Textfarbe" value={slide.text_color || "#ffffff"} onChange={(v) => updateSlide(idx, "text_color", v)} />
              </div>
              <div style={{ flex: 1 }}>
                <TextField label="Overlay 0–100" type="number" value={String(slide.overlay ?? 0)} onChange={(v) => updateSlide(idx, "overlay", Math.min(100, Math.max(0, Number(v))))} autoComplete="off" helpText="Wird im Shop derzeit nicht abgedunkelt angezeigt" />
              </div>
            </InlineStack>

            <InlineStack gap="400" wrap={false}>
              <div style={{ flex: 1 }}>
                <TextField label="Titel-Größe" value={slide.title_size || "clamp(24px,4vw,56px)"} onChange={(v) => updateSlide(idx, "title_size", v)} autoComplete="off" helpText="z.B. 48px" />
              </div>
              <div style={{ flex: 1 }}>
                <TextField label="Untertitel-Größe" value={slide.subtitle_size || "clamp(14px,2vw,22px)"} onChange={(v) => updateSlide(idx, "subtitle_size", v)} autoComplete="off" helpText="z.B. 20px" />
              </div>
              <div style={{ flex: 1 }}>
                <PaddingEditor label="Inhalts-Padding" value={slide.content_padding || "32px 48px 32px 48px"} onChange={(v) => updateSlide(idx, "content_padding", v)} defaultValue="32px 48px 32px 48px" />
              </div>
            </InlineStack>

            <InlineStack gap="400" wrap={false}>
              <div style={{ flex: 1 }}>
                <ColorField label="Button-Hintergrund" value={slide.btn_bg || "#ff971c"} onChange={(v) => updateSlide(idx, "btn_bg", v)} />
              </div>
              <div style={{ flex: 1 }}>
                <ColorField label="Button-Textfarbe" value={slide.btn_color || "#ffffff"} onChange={(v) => updateSlide(idx, "btn_color", v)} />
              </div>
              <div style={{ flex: 1 }}>
                <TextField label="Button-Rahmen" value={slide.btn_border || "2px solid #000"} onChange={(v) => updateSlide(idx, "btn_border", v)} autoComplete="off" helpText="z.B. none" />
              </div>
              <div style={{ flex: 1 }}>
                <TextField label="Button-Radius" value={String(slide.btn_radius ?? 8)} onChange={(v) => updateSlide(idx, "btn_radius", Number(v) || 0)} autoComplete="off" helpText="px" />
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
function TextBlockEditor({ container, onChange, editLang = "de" }) {
  return (
    <BlockStack gap="400">
      <TextField label="Überschrift" value={gi(container, "title", editLang)} onChange={(v) => onChange(si(container, "title", editLang, v))} placeholder="Überschrift…" autoComplete="off" />
      <RichTextEditor label="Text" value={gi(container, "body", editLang)} onChange={(v) => onChange(si(container, "body", editLang, v))} placeholder="Text eingeben…" minHeight="160px" />
      <InlineStack gap="400" wrap={false}>
        <div style={{ flex: 1 }}>
          <TextField label="Button-Text" value={gi(container, "btn_text", editLang)} onChange={(v) => onChange(si(container, "btn_text", editLang, v))} autoComplete="off" />
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
      <InlineStack gap="400" wrap={false}>
        <div style={{ flex: 1 }}>
          <ColorField label="Button-Hintergrund" value={container.btn_bg || "#ff971c"} onChange={(v) => onChange({ ...container, btn_bg: v })} />
        </div>
        <div style={{ flex: 1 }}>
          <ColorField label="Button-Textfarbe" value={container.btn_color || "#ffffff"} onChange={(v) => onChange({ ...container, btn_color: v })} />
        </div>
        <div style={{ flex: 1 }}>
          <TextField label="Button-Rahmen" value={container.btn_border || "2px solid #000"} onChange={(v) => onChange({ ...container, btn_border: v })} autoComplete="off" />
        </div>
        <div style={{ flex: 1 }}>
          <TextField label="Button-Radius (px)" value={String(container.btn_radius ?? 8)} onChange={(v) => onChange({ ...container, btn_radius: Number(v) || 0 })} autoComplete="off" />
        </div>
      </InlineStack>
    </BlockStack>
  );
}

// ── Image + Text editor ─────────────────────────────────────────────────────
function ImageTextEditor({ container, onChange, editLang = "de" }) {
  const [pickerOpen, setPickerOpen] = useState(false);
  return (
    <BlockStack gap="400">
      {pickerOpen && (
        <MediaPickerModal
          open
          multiple={false}
          onClose={() => setPickerOpen(false)}
          onSelect={(urls) => {
            if (urls[0]) onChange(si(container, "image", editLang, urls[0]));
            setPickerOpen(false);
          }}
        />
      )}
      <ImageField label="Bild" value={gi(container, "image", editLang)} onPick={() => setPickerOpen(true)} onClear={() => onChange(si(container, "image", editLang, ""))} />
      <Select label="Bildposition" options={[{ label: "Links", value: "left" }, { label: "Rechts", value: "right" }]} value={container.image_side || "left"} onChange={(v) => onChange({ ...container, image_side: v })} />
      <TextField label="Überschrift" value={gi(container, "title", editLang)} onChange={(v) => onChange(si(container, "title", editLang, v))} autoComplete="off" />
      <RichTextEditor label="Text" value={gi(container, "body", editLang)} onChange={(v) => onChange(si(container, "body", editLang, v))} placeholder="Text eingeben…" minHeight="130px" />
      <InlineStack gap="400" wrap={false}>
        <div style={{ flex: 1 }}>
          <TextField label="Button-Text" value={gi(container, "btn_text", editLang)} onChange={(v) => onChange(si(container, "btn_text", editLang, v))} autoComplete="off" />
        </div>
        <div style={{ flex: 1 }}>
          <TextField label="Button-URL" value={container.btn_url || ""} onChange={(v) => onChange({ ...container, btn_url: v })} autoComplete="off" />
        </div>
      </InlineStack>
      <InlineStack gap="400" wrap={false}>
        <div style={{ flex: 1 }}>
          <Select label="Text-Ausrichtung" options={[{ label: "Links", value: "left" }, { label: "Mitte", value: "center" }, { label: "Rechts", value: "right" }]} value={container.text_align || "left"} onChange={(v) => onChange({ ...container, text_align: v })} />
        </div>
        <div style={{ flex: 1 }}>
          <ColorField label="Hintergrundfarbe" value={container.bg_color || "#ffffff"} onChange={(v) => onChange({ ...container, bg_color: v })} />
        </div>
        <div style={{ flex: 1 }}>
          <ColorField label="Textfarbe" value={container.text_color || "#111827"} onChange={(v) => onChange({ ...container, text_color: v })} />
        </div>
      </InlineStack>
      <InlineStack gap="400" wrap={false}>
        <div style={{ flex: 1 }}>
          <ColorField label="Button-Hintergrund" value={container.btn_bg || "#ff971c"} onChange={(v) => onChange({ ...container, btn_bg: v })} />
        </div>
        <div style={{ flex: 1 }}>
          <ColorField label="Button-Textfarbe" value={container.btn_color || "#ffffff"} onChange={(v) => onChange({ ...container, btn_color: v })} />
        </div>
        <div style={{ flex: 1 }}>
          <TextField label="Button-Rahmen" value={container.btn_border || "2px solid #000"} onChange={(v) => onChange({ ...container, btn_border: v })} autoComplete="off" />
        </div>
        <div style={{ flex: 1 }}>
          <TextField label="Button-Radius (px)" value={String(container.btn_radius ?? 8)} onChange={(v) => onChange({ ...container, btn_radius: Number(v) || 0 })} autoComplete="off" />
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

function ImageGridEditor({ container, onChange, editLang = "de" }) {
  const [pickerIdx, setPickerIdx] = useState(null);
  const updateImg = (idx, key, val) => {
    const images = [...(container.images || [])];
    images[idx] = key === "url" ? si(images[idx], "url", editLang, val) : { ...images[idx], [key]: val };
    onChange({ ...container, images });
  };
  const updateImgI18n = (idx, field, val) => {
    const images = [...(container.images || [])];
    images[idx] = si(images[idx], field, editLang, val);
    onChange({ ...container, images });
  };
  const addImg = () => onChange({ ...container, images: [...(container.images || []), { url: "", link: "", aspect_ratio: "1/1", title: "", text: "" }] });
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
            <ImageField value={gi(img, "url", editLang)} onPick={() => setPickerIdx(idx)} onClear={() => updateImg(idx, "url", "")} />
            <InlineStack gap="400" wrap={false}>
              <div style={{ flex: 1 }}>
                <TextField label="Link-URL (optional)" value={img.link || ""} onChange={(v) => updateImg(idx, "link", v)} placeholder="https://…" autoComplete="off" />
              </div>
              <div style={{ flex: 1 }}>
                <Select label="Seitenverhältnis" options={ASPECT_RATIO_OPTIONS} value={img.aspect_ratio || "1/1"} onChange={(v) => updateImg(idx, "aspect_ratio", v)} />
              </div>
            </InlineStack>
            <TextField
              label="Beschriftung unter dem Bild (optional)"
              value={gi(img, "title", editLang)}
              onChange={(v) => updateImgI18n(idx, "title", v)}
              autoComplete="off"
              placeholder="z. B. Neuheiten"
              helpText="Im Shop: klein und grau, direkt unter dem Bild"
            />
            <RichTextEditor label="Text (optional)" value={gi(img, "text", editLang)} onChange={(v) => updateImgI18n(idx, "text", v)} placeholder="Text eingeben…" minHeight="160px" />
          </BlockStack>
        </Card>
      ))}
      <Button onClick={addImg}>+ Bild hinzufügen</Button>
    </BlockStack>
  );
}

const CONTENT_MOSAIC_SOURCE_OPTIONS = [
  { label: "Eigene Bilder", value: "images" },
  { label: "Produkte einer Kollektion", value: "collection" },
  { label: "Kollektions-Karten (mehrere)", value: "collections" },
];

// ── Content-Mosaik: freies Zeilenmuster, Quelle wählbar ─────────────────────
function ContentMosaicEditor({ container, onChange, deviceTab = 0, editLang = "de" }) {
  const isMobileView = deviceTab >= 1;
  const client = getMedusaAdminClient();
  const [pickerIdx, setPickerIdx] = useState(null);
  const [hubCollections, setHubCollections] = useState([]);
  const [allCollections, setAllCollections] = useState([]);
  const [addColId, setAddColId] = useState("");

  const source = String(container.source || "images");

  useEffect(() => {
    if (source !== "collection") return;
    client.request("/admin-hub/collections").then((r) => {
      setHubCollections(Array.isArray(r?.collections) ? r.collections : []);
    }).catch(() => {});
  }, [client, source]);

  useEffect(() => {
    if (source !== "collections") return;
    client.getMedusaCollections({ adminHub: true })
      .then((r) => {
        setAllCollections(Array.isArray(r?.collections) ? r.collections : []);
      })
      .catch(() => {});
  }, [client, source]);

  const colOptions = [
    { label: "— Kollektion wählen —", value: "" },
    ...hubCollections.map((c) => ({ label: c.title || c.handle || c.id, value: c.id })),
  ];

  const chosen = Array.isArray(container.collections) ? container.collections : [];
  const addCollectionOptions = [
    { label: "— Kollektion hinzufügen —", value: "" },
    ...allCollections
      .filter((c) => !chosen.some((entry) => entry.id === c.id))
      .map((c) => ({ label: c.title || c.handle || c.id, value: c.id })),
  ];

  const addCollection = (id) => {
    if (!id) return;
    const col = allCollections.find((c) => c.id === id);
    if (!col) return;
    onChange({
      ...container,
      collections: [
        ...chosen,
        {
          id: col.id,
          title: col.title || "",
          handle: col.handle || "",
          image: col.image_url || col.image || col.thumbnail || "",
          item_heading: "",
        },
      ],
    });
    setAddColId("");
  };

  const removeCollection = (id) => {
    onChange({ ...container, collections: chosen.filter((entry) => entry.id !== id) });
  };

  const moveCollection = (idx, direction) => {
    const nextIdx = idx + direction;
    if (nextIdx < 0 || nextIdx >= chosen.length) return;
    const next = [...chosen];
    [next[idx], next[nextIdx]] = [next[nextIdx], next[idx]];
    onChange({ ...container, collections: next });
  };

  const updateMosaicCollectionEntry = (idx, key, val) => {
    const next = chosen.map((e, i) => (i === idx ? { ...e, [key]: val } : e));
    onChange({ ...container, collections: next });
  };

  const updateImg = (idx, key, val) => {
    const images = [...(container.images || [])];
    images[idx] = key === "url" ? si(images[idx], "url", editLang, val) : { ...images[idx], [key]: val };
    onChange({ ...container, images });
  };
  const updateImgI18n = (idx, field, val) => {
    const images = [...(container.images || [])];
    images[idx] = si(images[idx], field, editLang, val);
    onChange({ ...container, images });
  };
  const addImg = () => onChange({ ...container, images: [...(container.images || []), { url: "", link: "", aspect_ratio: "1/1", title: "", text: "" }] });
  const removeImg = (idx) => onChange({ ...container, images: (container.images || []).filter((_, i) => i !== idx) });

  const aspectValue = (() => {
    const raw = String(container.card_aspect_ratio || "4/5").trim().replace(/:/g, "/");
    const ok = COLLECTIONS_CAROUSEL_ASPECT_OPTIONS.some((o) => o.value === raw);
    return ok ? raw : "4/5";
  })();

  return (
    <BlockStack gap="400">
      {pickerIdx !== null && (
        <MediaPickerModal open multiple={false} onClose={() => setPickerIdx(null)} onSelect={(urls) => { if (urls[0]) updateImg(pickerIdx, "url", urls[0]); setPickerIdx(null); }} />
      )}

      <Card>
        <BlockStack gap="300">
          <Text as="h3" variant="headingSm">Inhalts-Mosaik</Text>
          <Text as="p" variant="bodySm" tone="subdued">
            Zeilenaufbau: Zahlen = Spalten pro Zeile, durch Komma getrennt, wiederholt (z. B. 1,2 = eine volle Zeile, dann zwei nebeneinander). Desktop &amp; Mobil getrennt einstellbar.
          </Text>
          <TextField label="Überschrift (optional)" value={gi(container, "title", editLang)} onChange={(v) => onChange(si(container, "title", editLang, v))} autoComplete="off" />
          <ColorField label="Hintergrundfarbe" value={container.bg_color || "#ffffff"} onChange={(v) => onChange({ ...container, bg_color: v })} />
          <Select
            label="Inhalt"
            options={CONTENT_MOSAIC_SOURCE_OPTIONS}
            value={source}
            onChange={(v) => onChange({ ...container, source: v })}
          />
        </BlockStack>
      </Card>

      <Card>
        <BlockStack gap="300">
          <Text as="h3" variant="headingSm">Raster (Shop)</Text>
          <TextField
            label="Muster"
            value={String(isMobileView ? (container.layout_pattern_mobile || "1") : (container.layout_pattern_desktop || "1,2"))}
            onChange={(v) => onChange({
              ...container,
              ...(isMobileView ? { layout_pattern_mobile: v } : { layout_pattern_desktop: v }),
            })}
            autoComplete="off"
            helpText={isMobileView ? "Z. B. 1 veya 2,2" : "Z. B. 1,2,2"}
          />
          <div style={EDITOR_FIELD_GRID}>
            <TextField
              label="Abstand (px)"
              type="number"
              value={String(isMobileView ? (container.gap_mobile ?? "") : (container.gap ?? 16))}
              onChange={(v) => {
                const t = (v || "").trim();
                if (isMobileView) {
                  if (t === "") onChange({ ...container, gap_mobile: undefined });
                  else onChange({ ...container, gap_mobile: Number(v) || 0 });
                  return;
                }
                onChange({ ...container, gap: Number(v) || 16 });
              }}
              autoComplete="off"
              helpText={isMobileView ? "Boş bırakırsan desktop değeri kullanılır." : undefined}
            />
          </div>
        </BlockStack>
      </Card>

      {source === "images" && (
        <>
          {(container.images || []).map((img, idx) => (
            <Card key={idx}>
              <BlockStack gap="300">
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="h3" variant="headingSm">Bild {idx + 1}</Text>
                  {(container.images || []).length > 1 && (
                    <Button size="slim" tone="critical" onClick={() => removeImg(idx)}>Entfernen</Button>
                  )}
                </InlineStack>
                <ImageField value={gi(img, "url", editLang)} onPick={() => setPickerIdx(idx)} onClear={() => updateImg(idx, "url", "")} />
                <InlineStack gap="400" wrap={false}>
                  <div style={{ flex: 1 }}>
                    <TextField label="Link-URL (optional)" value={img.link || ""} onChange={(v) => updateImg(idx, "link", v)} placeholder="https://…" autoComplete="off" />
                  </div>
                  <div style={{ flex: 1 }}>
                    <Select label="Seitenverhältnis" options={ASPECT_RATIO_OPTIONS} value={img.aspect_ratio || "1/1"} onChange={(v) => updateImg(idx, "aspect_ratio", v)} />
                  </div>
                </InlineStack>
                <TextField
                  label="Beschriftung unter dem Bild (optional)"
                  value={gi(img, "title", editLang)}
                  onChange={(v) => updateImgI18n(idx, "title", v)}
                  autoComplete="off"
                  helpText="Im Shop: klein und grau, direkt unter dem Bild"
                />
                <RichTextEditor label="Text (optional)" value={gi(img, "text", editLang)} onChange={(v) => updateImgI18n(idx, "text", v)} placeholder="Text eingeben…" minHeight="120px" />
              </BlockStack>
            </Card>
          ))}
          <Button onClick={addImg}>+ Bild hinzufügen</Button>
        </>
      )}

      {source === "collection" && (
        <Card>
          <BlockStack gap="300">
            <Text as="h3" variant="headingSm">Kollektion (Produktkarten)</Text>
            <Text as="p" variant="bodySm" tone="subdued">Bis zu 100 Produkte, Darstellung richtet sich nach Ihrem Muster.</Text>
            <Select
              label="Kollektion"
              options={colOptions}
              value={container.collection_id || ""}
              onChange={(id) => {
                const col = hubCollections.find((c) => c.id === id);
                onChange({ ...container, collection_id: id, collection_handle: col?.handle || "" });
              }}
            />
            <TextField
              label="Produkt-Beschriftungen (optional)"
              value={String(container.product_captions || "")}
              onChange={(v) => onChange({ ...container, product_captions: v })}
              multiline={5}
              autoComplete="off"
              helpText="Eine dünne Zeile unter jeder Karte, in der gleichen Reihenfolge wie die Produkte: eine Zeile = erstes Produkt, zweite Zeile = zweites Produkt … Leerzeilen = kein Text."
            />
          </BlockStack>
        </Card>
      )}

      {source === "collections" && (
        <BlockStack gap="400">
          <BlockStack gap="200">
            <Text as="h3" variant="headingSm">Kollektions-Karten</Text>
            <Select
              label="Kollektion hinzufügen"
              options={addCollectionOptions}
              value={addColId}
              onChange={(id) => {
                setAddColId(id);
                addCollection(id);
              }}
            />
            <div style={EDITOR_FIELD_GRID}>
              <Select
                label="Seitenverhältnis (Karten)"
                options={COLLECTIONS_CAROUSEL_ASPECT_OPTIONS}
                value={aspectValue}
                onChange={(v) => onChange({ ...container, card_aspect_ratio: v })}
              />
              <Select
                label="Bild im Rahmen"
                options={COLLECTIONS_CAROUSEL_OBJECT_FIT_OPTIONS}
                value={container.card_image_object_fit === "contain" ? "contain" : "cover"}
                onChange={(v) => onChange({ ...container, card_image_object_fit: v })}
              />
            </div>
          </BlockStack>
          {chosen.length === 0 ? (
            <Card>
              <Box padding="400">
                <Text as="p" tone="subdued">Noch keine Kollektionen.</Text>
              </Box>
            </Card>
          ) : (
            chosen.map((entry, idx) => (
              <Card key={entry.id || idx}>
                <BlockStack gap="300">
                  <InlineStack align="space-between" blockAlign="center">
                    <BlockStack gap="100">
                      <Text as="h3" variant="headingSm">{entry.title || entry.handle || `Kollektion ${idx + 1}`}</Text>
                      <Text as="p" variant="bodySm" tone="subdued">/{entry.handle || "ohne-handle"}</Text>
                    </BlockStack>
                    <InlineStack gap="200">
                      <Button size="slim" disabled={idx === 0} onClick={() => moveCollection(idx, -1)}>Nach oben</Button>
                      <Button size="slim" disabled={idx === chosen.length - 1} onClick={() => moveCollection(idx, 1)}>Nach unten</Button>
                      <Button size="slim" tone="critical" onClick={() => removeCollection(entry.id)}>Entfernen</Button>
                    </InlineStack>
                  </InlineStack>
                  <TextField
                    label="Beschriftung unter der Karte (optional)"
                    value={entry.item_heading != null ? String(entry.item_heading) : ""}
                    onChange={(v) => updateMosaicCollectionEntry(idx, "item_heading", v)}
                    autoComplete="off"
                    helpText="Im Shop: klein und grau, unter der Karte (nicht im Banner)"
                  />
                </BlockStack>
              </Card>
            ))
          )}
        </BlockStack>
      )}
    </BlockStack>
  );
}

// Bild-Karussell — gleiche Seitenverhältnis-Auswahl wie Kollektions-Karussell, plus manuelle Mobile-Werte
const IMAGE_CAROUSEL_ASPECT_OPTIONS = [
  { label: "Dikey (standart) — 4:5", value: "4/5" },
  { label: "Dikey — 3:4", value: "3/4" },
  { label: "Dikey — 2:3", value: "2/3" },
  { label: "Kare — 1:1", value: "1/1" },
  { label: "Yatay — 4:3", value: "4/3" },
  { label: "Yatay — 3:2", value: "3/2" },
  { label: "Yatay geniş — 16:9", value: "16/9" },
  { label: "Yatay sinematik — 21:9", value: "21/9" },
  { label: "Çok dikey — 9:20", value: "9/20" },
  { label: "Çok dikey — 1:2", value: "1/2" },
];
const MOBILE_ASPECT_LIKE_DESKTOP = IMAGE_CAROUSEL_ASPECT_OPTIONS;

const GRADIENT_DIRECTION_OPTIONS = [
  { label: "Yukarıdan aşağıya (to bottom)", value: "to bottom" },
  { label: "Aşağıdan yukarıya (to top)", value: "to top" },
  { label: "Soldan sağa (to right)", value: "to right" },
  { label: "Sağdan sola (to left)", value: "to left" },
  { label: "Sol üstten sağ alta (diagonal)", value: "to bottom right" },
  { label: "Sağ üstten sol alta (diagonal)", value: "to bottom left" },
];

/** Shop ≤1023px: eine Zeile vs. Raster pro „Seite” (nach rechts wischen) */
const LANDING_MOBILE_CAROUSEL_LAYOUT = [
  { label: "Eine Zeile wischen (klassisch)", value: "row" },
  { label: "Raster: Spalten×Zeilen, seitlich wischen", value: "grid" },
];
const MOBILE_GRID_DIM_OPTIONS = [1, 2, 3, 4].map((n) => ({ label: String(n), value: String(n) }));

// ── Image Carousel editor ───────────────────────────────────────────────────
function ImageCarouselEditor({ container, onChange, deviceTab = 0, editLang = "de" }) {
  const isMobileView = deviceTab >= 1;
  const [pickerIdx, setPickerIdx] = useState(null);
  const images = container.images || [];
  const n = images.length;

  const updateImg = (idx, key, val) => {
    const next = [...(container.images || [])];
    next[idx] = key === "url" ? si(next[idx], "url", editLang, val) : { ...next[idx], [key]: val };
    onChange({ ...container, images: next });
  };
  const updateImgI18n = (idx, field, val) => {
    const next = [...(container.images || [])];
    next[idx] = si(next[idx], field, editLang, val);
    onChange({ ...container, images: next });
  };
  const newSlide = () => ({
    url: "",
    link: "",
    title: "",
    text: "",
  });
  const addImg = () => {
    const list = [...(container.images || []), newSlide()];
    onChange({ ...container, images: list });
  };
  const removeImg = (idx) => {
    const next = (container.images || []).filter((_, i) => i !== idx);
    onChange({ ...container, images: next });
  };

  return (
    <BlockStack gap="400">
      {pickerIdx !== null && (
        <MediaPickerModal open multiple={false} onClose={() => setPickerIdx(null)} onSelect={(urls) => { if (urls[0]) updateImg(pickerIdx, "url", urls[0]); setPickerIdx(null); }} />
      )}

      <Card>
          <BlockStack gap="300">
            <Text as="h3" variant="headingSm">Bilder &amp; Raster</Text>
            <Text as="p" variant="bodySm" tone="subdued">Başlık ve görsel sayısı ayarı.</Text>
            <TextField label="Abschnitt-Titel (optional)" value={gi(container, "title", editLang)} onChange={(v) => onChange(si(container, "title", editLang, v))} autoComplete="off" placeholder="z. B. Unsere Kollektionen" />
            <div style={EDITOR_FIELD_GRID}>
              {!isMobileView && (
                <TextField
                  label="Bilder pro Zeile (Desktop)"
                  type="number"
                  value={String(container.items_per_row || 4)}
                  onChange={(v) => onChange({ ...container, items_per_row: Number(v) || 4 })}
                  autoComplete="off"
                />
              )}
              {isMobileView ? (
                <>
                  <TextField
                    label="Görsel genişliği (CSS değeri)"
                    value={container.mobile_item_width != null ? String(container.mobile_item_width) : ""}
                    onChange={(v) => onChange({ ...container, mobile_item_width: v })}
                    autoComplete="off"
                    placeholder="Örn: 82vw, 280px, calc(100vw - 48px)"
                    helpText="Boş bırakırsan oran bazlı px değeri kullanılır."
                  />
                  <Select
                    label="Görsel yönü (kare / dikey / yatay)"
                    options={MOBILE_ASPECT_LIKE_DESKTOP}
                    value={container.aspect_ratio_mobile != null && container.aspect_ratio_mobile !== "" ? container.aspect_ratio_mobile : ""}
                    onChange={(v) => onChange({ ...container, aspect_ratio_mobile: v })}
                  />
                  <TextField
                    label="Özel oran (opsiyonel)"
                    value={container.aspect_ratio_mobile_custom != null ? String(container.aspect_ratio_mobile_custom) : ""}
                    onChange={(v) => onChange({ ...container, aspect_ratio_mobile_custom: v })}
                    autoComplete="off"
                    placeholder="Örn: 9/20, 3/4, 16/9"
                  />
                  <TextField
                    label="Minimum yükseklik (opsiyonel)"
                    value={container.min_height_mobile != null ? String(container.min_height_mobile) : ""}
                    onChange={(v) => onChange({ ...container, min_height_mobile: v })}
                    autoComplete="off"
                    placeholder="Örn: 220px"
                  />
                  <TextField
                    label="Maksimum yükseklik (opsiyonel)"
                    value={container.max_height_mobile != null ? String(container.max_height_mobile) : ""}
                    onChange={(v) => onChange({ ...container, max_height_mobile: v })}
                    autoComplete="off"
                    placeholder="Örn: 420px"
                  />
                </>
              ) : (
                <>
                  <Select
                    label="Görsel yönü (kare / dikey / yatay)"
                    options={IMAGE_CAROUSEL_ASPECT_OPTIONS}
                    value={container.aspect_ratio || "4/5"}
                    onChange={(v) => onChange({ ...container, aspect_ratio: v })}
                  />
                  <TextField
                    label="Özel oran (opsiyonel)"
                    value={container.aspect_ratio_custom != null ? String(container.aspect_ratio_custom) : ""}
                    onChange={(v) => onChange({ ...container, aspect_ratio_custom: v })}
                    autoComplete="off"
                    placeholder="Örn: 9/16, 4/5, 1/1"
                  />
                  <TextField
                    label="Maksimum yükseklik (opsiyonel)"
                    value={container.max_height != null ? String(container.max_height) : ""}
                    onChange={(v) => onChange({ ...container, max_height: v })}
                    autoComplete="off"
                    placeholder="Örn: 520px"
                  />
                </>
              )}
            </div>
            <Button onClick={addImg}>+ Bild hinzufügen</Button>
          </BlockStack>
      </Card>

      <Card>
          {n === 0 ? (
            <Box padding="400">
              <Text as="p" tone="subdued" variant="bodySm">Henüz görsel yok. Yukarıdan görsel ekleyebilirsin.</Text>
            </Box>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12 }}>
              {images.map((img, idx) => (
                <Card key={idx}>
                  <BlockStack gap="300">
                    <InlineStack align="space-between" blockAlign="center">
                      <Text as="h3" variant="headingSm">Bild {idx + 1}</Text>
                      {n > 1 && (
                        <Button size="slim" tone="critical" onClick={() => removeImg(idx)}>Entfernen</Button>
                      )}
                    </InlineStack>
                    <ImageField value={gi(img, "url", editLang)} onPick={() => setPickerIdx(idx)} onClear={() => updateImg(idx, "url", "")} />
                    <TextField
                      label="Link (optional)"
                      value={img.link || ""}
                      onChange={(v) => updateImg(idx, "link", v)}
                      placeholder="https://…"
                      autoComplete="off"
                    />
                    <TextField
                      label="Beschriftung unter dem Bild (optional)"
                      value={gi(img, "title", editLang)}
                      onChange={(v) => updateImgI18n(idx, "title", v)}
                      autoComplete="off"
                    />
                    <RichTextEditor
                      label="Text (optional)"
                      value={gi(img, "text", editLang)}
                      onChange={(v) => updateImgI18n(idx, "text", v)}
                      placeholder="Text eingeben…"
                      minHeight="120px"
                    />
                    <Divider />
                    <Text as="p" variant="bodySm" tone="subdued">Header degrade rengi (bu konteyner 1. sıradaysa aktif olur)</Text>
                    <ColorField
                      label="Degrade rengi"
                      value={img.color || ""}
                      onChange={(v) => updateImg(idx, "color", v)}
                    />
                    {img.color && (
                      <>
                        <Select
                          label="Degrade yönü"
                          options={GRADIENT_DIRECTION_OPTIONS}
                          value={img.gradient_direction || "to bottom"}
                          onChange={(v) => updateImg(idx, "gradient_direction", v)}
                        />
                        <TextField
                          label="Degrade durma noktası"
                          value={img.gradient_stop != null ? String(img.gradient_stop) : ""}
                          onChange={(v) => updateImg(idx, "gradient_stop", v)}
                          autoComplete="off"
                          placeholder="Örn: 80%"
                          helpText="Rengin şeffafa döndüğü nokta (0%=anında, 100%=header'ın tamamı)"
                        />
                      </>
                    )}
                  </BlockStack>
                </Card>
              ))}
            </div>
          )}
      </Card>
    </BlockStack>
  );
}

// ── CTA Banner editor ───────────────────────────────────────────────────────
function BannerCtaEditor({ container, onChange, editLang = "de" }) {
  return (
    <BlockStack gap="400">
      <TextField label="Überschrift" value={gi(container, "title", editLang)} onChange={(v) => onChange(si(container, "title", editLang, v))} autoComplete="off" />
      <TextField label="Untertitel" value={gi(container, "subtitle", editLang)} onChange={(v) => onChange(si(container, "subtitle", editLang, v))} autoComplete="off" />
      <InlineStack gap="400" wrap={false}>
        <div style={{ flex: 1 }}>
          <TextField label="Button-Text" value={gi(container, "btn_text", editLang)} onChange={(v) => onChange(si(container, "btn_text", editLang, v))} autoComplete="off" />
        </div>
        <div style={{ flex: 1 }}>
          <TextField label="Button-URL" value={container.btn_url || ""} onChange={(v) => onChange({ ...container, btn_url: v })} autoComplete="off" />
        </div>
      </InlineStack>
      <InlineStack gap="400" wrap={false}>
        <div style={{ flex: 2 }}>
          <Select label="Text-Position" options={TEXT_POSITION_OPTIONS} value={container.text_position || "center"} onChange={(v) => onChange({ ...container, text_position: v })} />
        </div>
        <div style={{ flex: 1 }}>
          <ColorField label="Hintergrundfarbe" value={container.bg_color || "#ff971c"} onChange={(v) => onChange({ ...container, bg_color: v })} />
        </div>
        <div style={{ flex: 1 }}>
          <ColorField label="Textfarbe" value={container.text_color || "#ffffff"} onChange={(v) => onChange({ ...container, text_color: v })} />
        </div>
      </InlineStack>
      <Text as="p" variant="bodySm" tone="subdued">CTA-Banner: Innenabstand (4 Seiten) und Abstand zu anderen Sektionen in der rechten Spalte.</Text>
      <div style={EDITOR_FIELD_GRID}>
        <ColorField label="Button-Hintergrund" value={container.btn_bg || "#ffffff"} onChange={(v) => onChange({ ...container, btn_bg: v })} />
        <ColorField label="Button-Textfarbe" value={container.btn_color || "#111827"} onChange={(v) => onChange({ ...container, btn_color: v })} />
        <TextField label="Button-Rahmen (CSS)" value={container.btn_border || "2px solid #000"} onChange={(v) => onChange({ ...container, btn_border: v })} autoComplete="off" />
        <TextField label="Button-Radius (px)" value={String(container.btn_radius ?? 8)} onChange={(v) => onChange({ ...container, btn_radius: Number(v) || 0 })} autoComplete="off" />
      </div>
    </BlockStack>
  );
}

// ── Collection Carousel editor ──────────────────────────────────────────────
function CollectionCarouselEditor({ container, onChange, deviceTab = 0, editLang = "de" }) {
  const isMobileView = deviceTab >= 1;
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
      <TextField label="Überschrift (optional)" value={gi(container, "title", editLang)} onChange={(v) => onChange(si(container, "title", editLang, v))} autoComplete="off" />
      <Select
        label="Kollektion"
        options={colOptions}
        value={container.collection_id || ""}
        onChange={(id) => {
          const col = collections.find((c) => c.id === id);
          onChange({ ...container, collection_id: id, collection_handle: col?.handle || "" });
        }}
      />
      <TextField
        label="Produkt-Beschriftungen (optional)"
        value={String(container.product_captions || "")}
        onChange={(v) => onChange({ ...container, product_captions: v })}
        multiline={5}
        autoComplete="off"
        helpText="Eine dünne Zeile pro Produkt in Kollektions-Reihenfolge (eine Zeile = erstes Produkt, …). Leerzeile = kein Text."
      />
      <div style={EDITOR_FIELD_GRID}>
        <Select
          label="Produkte pro Reihe"
          options={(isMobileView ? [1, 2, 3, 4] : [2, 3, 4, 5, 6]).map((n) => ({ label: String(n), value: String(n) }))}
          value={String(isMobileView ? (container.items_per_row_mobile ?? 2) : (container.items_per_row || 4))}
          onChange={(v) => onChange({
            ...container,
            ...(isMobileView ? { items_per_row_mobile: Number(v) } : { items_per_row: Number(v) }),
          })}
        />
        <TextField
          label="Abstand Karten (px)"
          type="number"
          value={String(container.gap ?? 16)}
          onChange={(v) => onChange({ ...container, gap: Number(v) || 16 })}
          autoComplete="off"
        />
      </div>
      {isMobileView && (
        <>
          <Divider />
          <Text as="h3" variant="headingSm">Mobil (≤1023px)</Text>
          <div style={EDITOR_FIELD_GRID}>
            <Select
              label="Darstellung"
              options={LANDING_MOBILE_CAROUSEL_LAYOUT}
              value={container.mobile_layout === "grid" ? "grid" : "row"}
              onChange={(v) => onChange({ ...container, mobile_layout: v === "grid" ? "grid" : "row" })}
            />
            <Select
              label="Raster: Spalten"
              options={MOBILE_GRID_DIM_OPTIONS}
              value={String(Math.min(4, Math.max(1, Math.round(Number(container.mobile_grid_cols)) || 2)))}
              onChange={(v) => onChange({ ...container, mobile_grid_cols: Number(v) })}
              disabled={container.mobile_layout !== "grid"}
            />
            <Select
              label="Raster: Zeilen"
              options={MOBILE_GRID_DIM_OPTIONS}
              value={String(Math.min(4, Math.max(1, Math.round(Number(container.mobile_grid_rows)) || 2)))}
              onChange={(v) => onChange({ ...container, mobile_grid_rows: Number(v) })}
              disabled={container.mobile_layout !== "grid"}
            />
          </div>
        </>
      )}
    </BlockStack>
  );
}

function CollectionsCarouselEditor({ container, onChange, deviceTab = 0, editLang = "de" }) {
  const isMobileView = deviceTab >= 1;
  const client = getMedusaAdminClient();
  const [collections, setCollections] = useState([]);
  const [selectedId, setSelectedId] = useState("");

  useEffect(() => {
    client.getMedusaCollections({ adminHub: true })
      .then((r) => {
        setCollections(Array.isArray(r?.collections) ? r.collections : []);
      })
      .catch(() => {});
  }, [client]);

  const chosen = Array.isArray(container.collections) ? container.collections : [];
  const availableOptions = [
    { label: "— Kollektion hinzufügen —", value: "" },
    ...collections
      .filter((c) => !chosen.some((entry) => entry.id === c.id))
      .map((c) => ({ label: c.title || c.handle || c.id, value: c.id })),
  ];

  const addCollection = (id) => {
    if (!id) return;
    const col = collections.find((c) => c.id === id);
    if (!col) return;
    onChange({
      ...container,
      collections: [
        ...chosen,
        {
          id: col.id,
          title: col.title || "",
          handle: col.handle || "",
          image: col.image_url || col.image || col.thumbnail || "",
          item_heading: "",
        },
      ],
    });
    setSelectedId("");
  };

  const removeCollection = (id) => {
    onChange({
      ...container,
      collections: chosen.filter((entry) => entry.id !== id),
    });
  };

  const moveCollection = (idx, direction) => {
    const nextIdx = idx + direction;
    if (nextIdx < 0 || nextIdx >= chosen.length) return;
    const next = [...chosen];
    [next[idx], next[nextIdx]] = [next[nextIdx], next[idx]];
    onChange({ ...container, collections: next });
  };

  const updateListCollectionEntry = (idx, key, val) => {
    const next = chosen.map((e, i) => (i === idx ? { ...e, [key]: val } : e));
    onChange({ ...container, collections: next });
  };

  const aspectValue = (() => {
    const raw = String(container.card_aspect_ratio || "4/5").trim().replace(/:/g, "/");
    const ok = COLLECTIONS_CAROUSEL_ASPECT_OPTIONS.some((o) => o.value === raw);
    return ok ? raw : "4/5";
  })();

  return (
    <BlockStack gap="400">
      <TextField label="Überschrift (optional)" value={gi(container, "title", editLang)} onChange={(v) => onChange(si(container, "title", editLang, v))} autoComplete="off" />
      <Select
        label="Kollektion hinzufügen"
        options={availableOptions}
        value={selectedId}
        onChange={(id) => {
          setSelectedId(id);
          addCollection(id);
        }}
      />
      <InlineStack gap="400" wrap>
        <div style={{ flex: "1 1 200px", minWidth: 160 }}>
          <Select
            label="Karten pro Reihe"
            options={(isMobileView ? [1, 2, 3, 4] : [2, 3, 4, 5, 6]).map((n) => ({ label: String(n), value: String(n) }))}
            value={String(isMobileView ? (container.items_per_row_mobile ?? 2) : (container.items_per_row || 4))}
            onChange={(v) => onChange({
              ...container,
              ...(isMobileView ? { items_per_row_mobile: Number(v) } : { items_per_row: Number(v) }),
            })}
          />
        </div>
      </InlineStack>
      <div style={EDITOR_FIELD_GRID}>
        <TextField
          label="Abstand Karten (px)"
          type="number"
          value={String(container.gap ?? 16)}
          onChange={(v) => onChange({ ...container, gap: Number(v) || 16 })}
          autoComplete="off"
        />
      </div>
      {isMobileView && (
        <>
          <Divider />
          <Text as="h3" variant="headingSm">Mobil (≤1023px)</Text>
          <div style={EDITOR_FIELD_GRID}>
            <Select
              label="Darstellung"
              options={LANDING_MOBILE_CAROUSEL_LAYOUT}
              value={container.mobile_layout === "grid" ? "grid" : "row"}
              onChange={(v) => onChange({ ...container, mobile_layout: v === "grid" ? "grid" : "row" })}
            />
            <Select
              label="Raster: Spalten"
              options={MOBILE_GRID_DIM_OPTIONS}
              value={String(Math.min(4, Math.max(1, Math.round(Number(container.mobile_grid_cols)) || 2)))}
              onChange={(v) => onChange({ ...container, mobile_grid_cols: Number(v) })}
              disabled={container.mobile_layout !== "grid"}
            />
            <Select
              label="Raster: Zeilen"
              options={MOBILE_GRID_DIM_OPTIONS}
              value={String(Math.min(4, Math.max(1, Math.round(Number(container.mobile_grid_rows)) || 2)))}
              onChange={(v) => onChange({ ...container, mobile_grid_rows: Number(v) })}
              disabled={container.mobile_layout !== "grid"}
            />
          </div>
        </>
      )}
      <BlockStack gap="200">
        <Text as="h3" variant="headingSm">Darstellung der Kollektions-Karten</Text>
        <Text as="p" variant="bodySm" tone="subdued">
          Seitenverhältnis und Bildausschnitt gelten für alle Karten in diesem Karussell (Live-Shop: Main-Bild der Kollektion).
        </Text>
        <Select
          label="Seitenverhältnis (Hoch / Quadrat / Quer)"
          options={COLLECTIONS_CAROUSEL_ASPECT_OPTIONS}
          value={aspectValue}
          onChange={(v) => onChange({ ...container, card_aspect_ratio: v })}
        />
        <Select
          label="Bild im Rahmen"
          options={COLLECTIONS_CAROUSEL_OBJECT_FIT_OPTIONS}
          value={container.card_image_object_fit === "contain" ? "contain" : "cover"}
          onChange={(v) => onChange({ ...container, card_image_object_fit: v })}
        />
      </BlockStack>

      {chosen.length === 0 ? (
        <Card>
          <Box padding="400">
            <Text as="p" tone="subdued">Noch keine Kollektionen ausgewählt.</Text>
          </Box>
        </Card>
      ) : chosen.map((entry, idx) => (
        <Card key={entry.id || idx}>
          <BlockStack gap="300">
            <InlineStack align="space-between" blockAlign="center">
              <BlockStack gap="100">
                <Text as="h3" variant="headingSm">{entry.title || entry.handle || `Kollektion ${idx + 1}`}</Text>
                <Text as="p" variant="bodySm" tone="subdued">/{entry.handle || "ohne-handle"}</Text>
              </BlockStack>
              <InlineStack gap="200">
                <Button size="slim" disabled={idx === 0} onClick={() => moveCollection(idx, -1)}>Nach oben</Button>
                <Button size="slim" disabled={idx === chosen.length - 1} onClick={() => moveCollection(idx, 1)}>Nach unten</Button>
                <Button size="slim" tone="critical" onClick={() => removeCollection(entry.id)}>Entfernen</Button>
              </InlineStack>
            </InlineStack>
            <TextField
              label="Beschriftung unter der Karte (optional)"
              value={entry.item_heading != null ? String(entry.item_heading) : ""}
              onChange={(v) => updateListCollectionEntry(idx, "item_heading", v)}
              autoComplete="off"
              helpText="Im Shop: klein und grau, direkt unter der Karte"
            />
          </BlockStack>
        </Card>
      ))}
    </BlockStack>
  );
}

// ── Accordion editor ─────────────────────────────────────────────────────────
function AccordionEditor({ container, onChange, editLang = "de" }) {
  const items = container.items || [];

  const updateItem = (idx, key, val) => {
    const next = items.map((item, i) => i === idx ? { ...item, [key]: val } : item);
    onChange({ ...container, items: next });
  };

  const updateItemI18n = (idx, field, val) => {
    const next = items.map((item, i) => i === idx ? si(item, field, editLang, val) : item);
    onChange({ ...container, items: next });
  };
  const addItem = () => onChange({ ...container, items: [...items, { question: `Frage ${items.length + 1}`, answer: "" }] });
  const removeItem = (idx) => onChange({ ...container, items: items.filter((_, i) => i !== idx) });
  const moveItem = (idx, dir) => {
    const next = [...items];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    onChange({ ...container, items: next });
  };

  return (
    <BlockStack gap="400">
      {/* Global settings */}
      <Card>
        <BlockStack gap="300">
          <Text as="h3" variant="headingSm">Accordion-Einstellungen</Text>
          <TextField label="Überschrift (optional)" value={gi(container, "title", editLang)} onChange={(v) => onChange(si(container, "title", editLang, v))} autoComplete="off" />
          <InlineStack gap="400" wrap={false}>
            <div style={{ flex: 1 }}><ColorField label="Hintergrundfarbe" value={container.bg_color || "#ffffff"} onChange={(v) => onChange({ ...container, bg_color: v })} /></div>
            <div style={{ flex: 1 }}><ColorField label="Textfarbe" value={container.text_color || "#111827"} onChange={(v) => onChange({ ...container, text_color: v })} /></div>
            <div style={{ flex: 1 }}><ColorField label="Rahmenfarbe" value={container.border_color || "#e5e7eb"} onChange={(v) => onChange({ ...container, border_color: v })} /></div>
            <div style={{ flex: 1 }}><ColorField label="Icon-Farbe (+/−)" value={container.icon_color || "#111827"} onChange={(v) => onChange({ ...container, icon_color: v })} /></div>
          </InlineStack>
        </BlockStack>
      </Card>

      {/* Items */}
      {items.map((item, idx) => (
        <Card key={idx}>
          <BlockStack gap="300">
            <InlineStack align="space-between" blockAlign="center">
              <Text as="h3" variant="headingSm">Eintrag {idx + 1}</Text>
              <InlineStack gap="200">
                <Button size="slim" disabled={idx === 0} onClick={() => moveItem(idx, -1)}>↑</Button>
                <Button size="slim" disabled={idx === items.length - 1} onClick={() => moveItem(idx, 1)}>↓</Button>
                {items.length > 1 && <Button size="slim" tone="critical" onClick={() => removeItem(idx)}>Entfernen</Button>}
              </InlineStack>
            </InlineStack>
            <TextField label="Frage / Titel" value={gi(item, "question", editLang)} onChange={(v) => updateItemI18n(idx, "question", v)} autoComplete="off" />
            <div>
              <Text as="span" variant="bodyMd" fontWeight="medium">Antwort / Inhalt</Text>
              <Box paddingBlockStart="100">
                <RichTextEditor value={gi(item, "answer", editLang)} onChange={(v) => updateItemI18n(idx, "answer", v)} />
              </Box>
            </div>
          </BlockStack>
        </Card>
      ))}

      <InlineStack>
        <Button onClick={addItem}>+ Eintrag hinzufügen</Button>
      </InlineStack>
    </BlockStack>
  );
}

// ── Tabs editor ───────────────────────────────────────────────────────────────
function TabsEditor({ container, onChange, editLang = "de" }) {
  const tabs = container.tabs || [];

  const updateTab = (idx, key, val) => {
    const next = tabs.map((tab, i) => i === idx ? { ...tab, [key]: val } : tab);
    onChange({ ...container, tabs: next });
  };

  const updateTabI18n = (idx, field, val) => {
    const next = tabs.map((tab, i) => i === idx ? si(tab, field, editLang, val) : tab);
    onChange({ ...container, tabs: next });
  };
  const addTab = () => onChange({ ...container, tabs: [...tabs, { label: `Tab ${tabs.length + 1}`, content: "" }] });
  const removeTab = (idx) => onChange({ ...container, tabs: tabs.filter((_, i) => i !== idx) });
  const moveTab = (idx, dir) => {
    const next = [...tabs];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    onChange({ ...container, tabs: next });
  };

  return (
    <BlockStack gap="400">
      {/* Global settings */}
      <Card>
        <BlockStack gap="300">
          <Text as="h3" variant="headingSm">Tab-Einstellungen</Text>
          <InlineStack gap="400" wrap={false}>
            <div style={{ flex: 1 }}>
              <Select
                label="Tab-Stil"
                options={[
                  { label: "Unterstrichen", value: "underline" },
                  { label: "Pills (abgerundet)", value: "pills" },
                  { label: "Boxen", value: "boxes" },
                ]}
                value={container.tab_style || "underline"}
                onChange={(v) => onChange({ ...container, tab_style: v })}
              />
            </div>
            <div style={{ flex: 1 }}><ColorField label="Aktiv-Farbe" value={container.active_color || "#ff971c"} onChange={(v) => onChange({ ...container, active_color: v })} /></div>
            <div style={{ flex: 1 }}><ColorField label="Tab-Hintergrund" value={container.tab_bg || "#f3f4f6"} onChange={(v) => onChange({ ...container, tab_bg: v })} /></div>
          </InlineStack>
          <InlineStack gap="400" wrap={false}>
            <div style={{ flex: 1 }}><ColorField label="Seiten-Hintergrund" value={container.bg_color || "#ffffff"} onChange={(v) => onChange({ ...container, bg_color: v })} /></div>
            <div style={{ flex: 1 }}><ColorField label="Textfarbe" value={container.text_color || "#111827"} onChange={(v) => onChange({ ...container, text_color: v })} /></div>
          </InlineStack>
        </BlockStack>
      </Card>

      {/* Tabs */}
      {tabs.map((tab, idx) => (
        <Card key={idx}>
          <BlockStack gap="300">
            <InlineStack align="space-between" blockAlign="center">
              <Text as="h3" variant="headingSm">Reiter {idx + 1}</Text>
              <InlineStack gap="200">
                <Button size="slim" disabled={idx === 0} onClick={() => moveTab(idx, -1)}>↑</Button>
                <Button size="slim" disabled={idx === tabs.length - 1} onClick={() => moveTab(idx, 1)}>↓</Button>
                {tabs.length > 1 && <Button size="slim" tone="critical" onClick={() => removeTab(idx)}>Entfernen</Button>}
              </InlineStack>
            </InlineStack>
            <TextField label="Tab-Bezeichnung" value={gi(tab, "label", editLang)} onChange={(v) => updateTabI18n(idx, "label", v)} autoComplete="off" placeholder="z.B. Beschreibung, Merkmale, Lieferung…" />
            <div>
              <Text as="span" variant="bodyMd" fontWeight="medium">Inhalt</Text>
              <Box paddingBlockStart="100">
                <RichTextEditor value={gi(tab, "content", editLang)} onChange={(v) => updateTabI18n(idx, "content", v)} />
              </Box>
            </div>
          </BlockStack>
        </Card>
      ))}

      <InlineStack>
        <Button onClick={addTab}>+ Reiter hinzufügen</Button>
      </InlineStack>
    </BlockStack>
  );
}

function SingleProductEditor({ container, onChange, editLang = "de" }) {
  const client = getMedusaAdminClient();
  const [products, setProducts] = useState([]);

  useEffect(() => {
    client.getAdminHubProducts({ limit: 500 }).then((r) => {
      setProducts(Array.isArray(r?.products) ? r.products : []);
    }).catch(() => {});
  }, [client]);

  const opts = [
    { label: "— Produkt wählen —", value: "" },
    ...products.map((p) => ({ label: `${p.title || p.handle || p.id}`, value: p.id })),
  ];

  return (
    <BlockStack gap="400">
      <TextField label="Überschrift (optional)" value={gi(container, "title", editLang)} onChange={(v) => onChange(si(container, "title", editLang, v))} autoComplete="off" />
      <Select
        label="Produkt"
        options={opts}
        value={container.product_id || ""}
        onChange={(id) => {
          const pr = products.find((p) => p.id === id);
          onChange({
            ...container,
            product_id: id,
            product_handle: pr?.handle || "",
          });
        }}
      />
      <Text as="p" variant="bodySm" tone="subdued">
        Es wird im Shop per Handle/ID geladen. Nur veröffentlichte Produkte erscheinen.
      </Text>
      <InlineStack gap="400" wrap={false}>
        <div style={{ flex: 1 }}><ColorField label="Hintergrund" value={container.bg_color || "#ffffff"} onChange={(v) => onChange({ ...container, bg_color: v })} /></div>
        <div style={{ flex: 1 }}><ColorField label="Titelfarbe" value={container.text_color || "#111827"} onChange={(v) => onChange({ ...container, text_color: v })} /></div>
      </InlineStack>
    </BlockStack>
  );
}

function BlogCarouselEditor({ container, onChange, deviceTab = 0, editLang = "de" }) {
  const isMobileView = deviceTab >= 1;
  const client = getMedusaAdminClient();
  const posts = Array.isArray(container.posts) ? container.posts : [];
  const [blogPages, setBlogPages] = useState([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await client.getPages({ limit: 200, page_type: "blog" });
        if (!cancelled) setBlogPages(data.pages || []);
      } catch {
        if (!cancelled) setBlogPages([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [client]);

  const blogOptions = [
    { label: "— Blog-Beitrag wählen —", value: "" },
    ...blogPages.map((p) => ({
      label: `${p.title || p.slug || p.id}${p.status === "published" ? "" : " (Entwurf)"}`,
      value: String(p.id),
    })),
  ];

  const updatePost = (idx, key, val) => {
    const next = posts.map((p, i) => (i === idx ? { ...p, [key]: val } : p));
    onChange({ ...container, posts: next });
  };
  const addPost = () => {
    onChange({
      ...container,
      posts: [...posts, { id: Math.random().toString(36).slice(2), page_id: "" }],
    });
  };
  const removePost = (idx) => onChange({ ...container, posts: posts.filter((_, i) => i !== idx) });
  const movePost = (idx, dir) => {
    const next = [...posts];
    const t = idx + dir;
    if (t < 0 || t >= next.length) return;
    [next[idx], next[t]] = [next[t], next[idx]];
    onChange({ ...container, posts: next });
  };

  const resolveBlogPage = (pageId) => blogPages.find((p) => String(p.id) === String(pageId));

  return (
    <BlockStack gap="400">
      <Card>
        <BlockStack gap="300">
          <Text as="h3" variant="headingSm">Karussell</Text>
          <Text as="p" variant="bodySm" tone="subdued">
            Beiträge unter „Content → Blog-Beiträge“ anlegen (Typ „Blog“, Bild, Teaser, Text, SEO). Nur veröffentlichte Beiträge erscheinen im Shop.
          </Text>
          <TextField label="Abschnitt-Titel" value={gi(container, "title", editLang)} onChange={(v) => onChange(si(container, "title", editLang, v))} autoComplete="off" />
          <div style={EDITOR_FIELD_GRID}>
            <Select
              options={[1, 2, 3, 4].map((n) => ({ label: String(n), value: String(n) }))}
              label="Karten pro Reihe"
              value={String(isMobileView ? (container.items_per_row_mobile ?? 1) : (container.items_per_row || 3))}
              onChange={(v) => onChange({
                ...container,
                ...(isMobileView ? { items_per_row_mobile: Number(v) } : { items_per_row: Number(v) }),
              })}
            />
            <ColorField label="Hintergrund" value={container.bg_color || "#ffffff"} onChange={(v) => onChange({ ...container, bg_color: v })} />
            <ColorField label="Textfarbe" value={container.text_color || "#111827"} onChange={(v) => onChange({ ...container, text_color: v })} />
          </div>
        </BlockStack>
      </Card>

      {posts.map((post, idx) => {
        const bp = post.page_id ? resolveBlogPage(post.page_id) : null;
        const legacy = !post.page_id && (post.title || post.image || post.body);
        return (
          <Card key={post.id || idx}>
            <BlockStack gap="300">
              <InlineStack align="space-between" blockAlign="center">
                <Text as="h3" variant="headingSm">Karte {idx + 1}</Text>
                <InlineStack gap="200">
                  <Button size="slim" disabled={idx === 0} onClick={() => movePost(idx, -1)}>↑</Button>
                  <Button size="slim" disabled={idx === posts.length - 1} onClick={() => movePost(idx, 1)}>↓</Button>
                  {posts.length > 1 && <Button size="slim" tone="critical" onClick={() => removePost(idx)}>Entfernen</Button>}
                </InlineStack>
              </InlineStack>
              <Select
                label="Blog-Beitrag"
                options={blogOptions}
                value={post.page_id ? String(post.page_id) : ""}
                onChange={(v) => updatePost(idx, "page_id", v)}
              />
              {legacy && (
                <Banner tone="warning">
                  Alter manueller Eintrag (ohne Seite). Bitte einen Blog-Beitrag wählen oder entfernen — im Shop werden nur verknüpfte Beiträge mit Daten aus dem CMS befüllt.
                </Banner>
              )}
              {bp && (
                <Box padding="300" background="bg-surface-secondary" borderRadius="200">
                  <BlockStack gap="100">
                    <Text as="p" variant="bodySm"><strong>Vorschau:</strong> {bp.title} · /pages/{bp.slug}</Text>
                    {bp.meta_title ? <Text as="p" variant="bodySm" tone="subdued">SEO-Titel: {bp.meta_title}</Text> : null}
                  </BlockStack>
                </Box>
              )}
            </BlockStack>
          </Card>
        );
      })}

      <InlineStack>
        <Button onClick={addPost}>+ Blog-Karte</Button>
      </InlineStack>
    </BlockStack>
  );
}

function NewsletterEditor({ container, onChange, editLang = "de" }) {
  const hidden = Array.isArray(container.hidden_fields) ? container.hidden_fields : [];

  const setHidden = (next) => onChange({ ...container, hidden_fields: next });
  const updateHidden = (idx, key, val) => {
    const next = hidden.map((h, i) => (i === idx ? { ...h, [key]: val } : h));
    setHidden(next);
  };
  const addHidden = () => setHidden([...hidden, { name: "", value: "" }]);
  const removeHidden = (idx) => setHidden(hidden.filter((_, i) => i !== idx));

  return (
    <BlockStack gap="400">
      <Banner tone="info">
        Trage die <strong>form action URL</strong> deines Anbieters ein (Mailchimp-Formular, Brevo, Klaviyo Hosted Form o. ä.).
        Versteckte Felder (z. B. u, id bei Mailchimp) unten ergänzen.
      </Banner>
      <TextField label="Titel" value={gi(container, "title", editLang)} onChange={(v) => onChange(si(container, "title", editLang, v))} autoComplete="off" />
      <TextField label="Untertitel" value={gi(container, "subtitle", editLang)} onChange={(v) => onChange(si(container, "subtitle", editLang, v))} multiline={2} autoComplete="off" />
      <TextField label="Button-Text" value={gi(container, "button_text", editLang)} onChange={(v) => onChange(si(container, "button_text", editLang, v))} autoComplete="off" />
      <TextField label="E-Mail-Placeholder" value={gi(container, "email_placeholder", editLang)} onChange={(v) => onChange(si(container, "email_placeholder", editLang, v))} autoComplete="off" />
      <Select
        label="Anbieter (Hinweis)"
        options={[
          { label: "Mailchimp", value: "mailchimp" },
          { label: "Klaviyo", value: "klaviyo" },
          { label: "Brevo (Sendinblue)", value: "brevo" },
          { label: "Andere / eigene URL", value: "other" },
        ]}
        value={container.provider || "other"}
        onChange={(v) => onChange({ ...container, provider: v })}
      />
      <TextField
        label="Form action URL"
        value={container.form_action || ""}
        onChange={(v) => onChange({ ...container, form_action: v })}
        autoComplete="off"
        helpText="Vollständige URL des Ziels beim Absenden"
      />
      <Select
        label="Methode"
        options={[{ label: "POST", value: "post" }, { label: "GET", value: "get" }]}
        value={container.form_method || "post"}
        onChange={(v) => onChange({ ...container, form_method: v })}
      />
      <TextField
        label="Name des E-Mail-Feldes"
        value={container.email_field_name || "EMAIL"}
        onChange={(v) => onChange({ ...container, email_field_name: v })}
        autoComplete="off"
        helpText="z. B. EMAIL (Mailchimp), email"
      />
      <TextField label="Datenschutz-Hinweis (optional)" value={container.privacy_note || ""} onChange={(v) => onChange({ ...container, privacy_note: v })} multiline={2} autoComplete="off" />
      <InlineStack gap="400" wrap={false}>
        <div style={{ flex: 1 }}><ColorField label="Hintergrund" value={container.bg_color || "#f3f4f6"} onChange={(v) => onChange({ ...container, bg_color: v })} /></div>
        <div style={{ flex: 1 }}><ColorField label="Textfarbe" value={container.text_color || "#111827"} onChange={(v) => onChange({ ...container, text_color: v })} /></div>
        <div style={{ flex: 1 }}><ColorField label="Button-Hintergrund" value={container.btn_bg || "#111827"} onChange={(v) => onChange({ ...container, btn_bg: v })} /></div>
        <div style={{ flex: 1 }}><ColorField label="Button-Text" value={container.btn_color || "#ffffff"} onChange={(v) => onChange({ ...container, btn_color: v })} /></div>
      </InlineStack>

      <Text as="h3" variant="headingSm">Versteckte Felder</Text>
      {hidden.map((h, idx) => (
        <InlineStack key={idx} gap="300" wrap={false} blockAlign="center">
          <div style={{ flex: 1 }}><TextField label="Name" value={h.name || ""} onChange={(v) => updateHidden(idx, "name", v)} autoComplete="off" /></div>
          <div style={{ flex: 1 }}><TextField label="Wert" value={h.value || ""} onChange={(v) => updateHidden(idx, "value", v)} autoComplete="off" /></div>
          <Button size="slim" tone="critical" onClick={() => removeHidden(idx)}>✕</Button>
        </InlineStack>
      ))}
      <Button size="slim" onClick={addHidden}>+ Hidden field</Button>
    </BlockStack>
  );
}

// ── Feature Grid editor ───────────────────────────────────────────────────────
function FeatureGridEditor({ container, onChange, editLang = "de" }) {
  const items = container.items || [];

  const updateItem = (idx, key, val) => {
    const next = items.map((item, i) => i === idx ? { ...item, [key]: val } : item);
    onChange({ ...container, items: next });
  };

  const updateItemI18n = (idx, field, val) => {
    const next = items.map((item, i) => i === idx ? si(item, field, editLang, val) : item);
    onChange({ ...container, items: next });
  };
  const addItem = () => onChange({ ...container, items: [...items, { icon: "✨", title: `Merkmal ${items.length + 1}`, body: "" }] });
  const removeItem = (idx) => onChange({ ...container, items: items.filter((_, i) => i !== idx) });
  const moveItem = (idx, dir) => {
    const next = [...items];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    onChange({ ...container, items: next });
  };

  return (
    <BlockStack gap="400">
      <Card>
        <BlockStack gap="300">
          <Text as="h3" variant="headingSm">Feature-Raster Einstellungen</Text>
          <TextField label="Überschrift" value={gi(container, "title", editLang)} onChange={(v) => onChange(si(container, "title", editLang, v))} autoComplete="off" />
          <TextField label="Untertitel (optional)" value={gi(container, "subtitle", editLang)} onChange={(v) => onChange(si(container, "subtitle", editLang, v))} multiline={2} autoComplete="off" />
          <div style={EDITOR_FIELD_GRID}>
            <Select
              label="Ausrichtung Titel"
              options={[{ label: "Zentriert", value: "center" }, { label: "Links", value: "left" }]}
              value={container.title_align || "center"}
              onChange={(v) => onChange({ ...container, title_align: v })}
            />
            <Select
              label="Spalten (Desktop)"
              options={[2, 3, 4].map((n) => ({ label: String(n), value: String(n) }))}
              value={String(container.cols || 3)}
              onChange={(v) => onChange({ ...container, cols: Number(v) })}
            />
            <Select
              label="Karten-Stil"
              options={[
                { label: "Mit Rahmen", value: "bordered" },
                { label: "Mit Schatten", value: "shadow" },
                { label: "Flach (kein Rahmen)", value: "flat" },
              ]}
              value={container.card_style || "bordered"}
              onChange={(v) => onChange({ ...container, card_style: v })}
            />
            <TextField label="Icon-Größe" value={container.icon_size || "40px"} onChange={(v) => onChange({ ...container, icon_size: v })} autoComplete="off" helpText="z. B. 40px" />
            <ColorField label="Hintergrund" value={container.bg_color || "#ffffff"} onChange={(v) => onChange({ ...container, bg_color: v })} />
            <ColorField label="Karten-Hintergrund" value={container.card_bg || "#f9fafb"} onChange={(v) => onChange({ ...container, card_bg: v })} />
            <ColorField label="Kartenrahmen" value={container.card_border_color || "#e5e7eb"} onChange={(v) => onChange({ ...container, card_border_color: v })} />
            <ColorField label="Textfarbe" value={container.text_color || "#111827"} onChange={(v) => onChange({ ...container, text_color: v })} />
          </div>
        </BlockStack>
      </Card>

      {items.map((item, idx) => (
        <Card key={idx}>
          <BlockStack gap="300">
            <InlineStack align="space-between" blockAlign="center">
              <Text as="h3" variant="headingSm">Merkmal {idx + 1}</Text>
              <InlineStack gap="200">
                <Button size="slim" disabled={idx === 0} onClick={() => moveItem(idx, -1)}>↑</Button>
                <Button size="slim" disabled={idx === items.length - 1} onClick={() => moveItem(idx, 1)}>↓</Button>
                {items.length > 1 && <Button size="slim" tone="critical" onClick={() => removeItem(idx)}>Entfernen</Button>}
              </InlineStack>
            </InlineStack>
            <InlineStack gap="400" wrap={false}>
              <div style={{ flex: "0 0 120px" }}>
                <TextField label="Icon / Emoji" value={item.icon || ""} onChange={(v) => updateItem(idx, "icon", v)} autoComplete="off" helpText="z. B. ⚡ 🔒 ↩️" />
              </div>
              <div style={{ flex: 1 }}>
                <TextField label="Titel" value={gi(item, "title", editLang)} onChange={(v) => updateItemI18n(idx, "title", v)} autoComplete="off" />
              </div>
            </InlineStack>
            <TextField label="Beschreibung" value={gi(item, "body", editLang)} onChange={(v) => updateItemI18n(idx, "body", v)} multiline={3} autoComplete="off" />
          </BlockStack>
        </Card>
      ))}

      <InlineStack>
        <Button onClick={addItem}>+ Merkmal hinzufügen</Button>
      </InlineStack>
    </BlockStack>
  );
}

// ── Testimonials editor ───────────────────────────────────────────────────────
function TestimonialsEditor({ container, onChange, editLang = "de" }) {
  const items = container.items || [];
  const [pickerIdx, setPickerIdx] = useState(null);

  const updateItem = (idx, key, val) => {
    const next = items.map((item, i) => i === idx ? { ...item, [key]: val } : item);
    onChange({ ...container, items: next });
  };

  const updateItemI18n = (idx, field, val) => {
    const next = items.map((item, i) => i === idx ? si(item, field, editLang, val) : item);
    onChange({ ...container, items: next });
  };
  const addItem = () => onChange({ ...container, items: [...items, { quote: "", author: `Kunde ${items.length + 1}`, role: "", avatar: "", rating: 5 }] });
  const removeItem = (idx) => onChange({ ...container, items: items.filter((_, i) => i !== idx) });
  const moveItem = (idx, dir) => {
    const next = [...items];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    onChange({ ...container, items: next });
  };

  return (
    <BlockStack gap="400">
      {pickerIdx !== null && (
        <MediaPickerModal open multiple={false} onClose={() => setPickerIdx(null)} onSelect={(urls) => { if (urls[0]) updateItemI18n(pickerIdx, "avatar", urls[0]); setPickerIdx(null); }} />
      )}

      <Card>
        <BlockStack gap="300">
          <Text as="h3" variant="headingSm">Kundenstimmen Einstellungen</Text>
          <TextField label="Überschrift" value={gi(container, "title", editLang)} onChange={(v) => onChange(si(container, "title", editLang, v))} autoComplete="off" />
          <TextField label="Untertitel (optional)" value={gi(container, "subtitle", editLang)} onChange={(v) => onChange(si(container, "subtitle", editLang, v))} multiline={2} autoComplete="off" />
          <div style={EDITOR_FIELD_GRID}>
            <Select
              label="Ausrichtung Titel"
              options={[{ label: "Zentriert", value: "center" }, { label: "Links", value: "left" }]}
              value={container.title_align || "center"}
              onChange={(v) => onChange({ ...container, title_align: v })}
            />
            <Select
              label="Spalten (Desktop)"
              options={[1, 2, 3, 4].map((n) => ({ label: String(n), value: String(n) }))}
              value={String(container.cols || 3)}
              onChange={(v) => onChange({ ...container, cols: Number(v) })}
            />
            <Select
              label="Sterne anzeigen"
              options={[{ label: "Ja", value: "true" }, { label: "Nein", value: "false" }]}
              value={container.show_stars !== false ? "true" : "false"}
              onChange={(v) => onChange({ ...container, show_stars: v === "true" })}
            />
            <ColorField label="Hintergrund" value={container.bg_color || "#f9fafb"} onChange={(v) => onChange({ ...container, bg_color: v })} />
            <ColorField label="Kartenfläche" value={container.card_bg || "#ffffff"} onChange={(v) => onChange({ ...container, card_bg: v })} />
            <ColorField label="Kartenrahmen" value={container.card_border_color || "#e5e7eb"} onChange={(v) => onChange({ ...container, card_border_color: v })} />
            <ColorField label="Akzent (Sterne)" value={container.accent_color || "#ff971c"} onChange={(v) => onChange({ ...container, accent_color: v })} />
          </div>
        </BlockStack>
      </Card>

      {items.map((item, idx) => (
        <Card key={idx}>
          <BlockStack gap="300">
            <InlineStack align="space-between" blockAlign="center">
              <Text as="h3" variant="headingSm">Stimme {idx + 1}</Text>
              <InlineStack gap="200">
                <Button size="slim" disabled={idx === 0} onClick={() => moveItem(idx, -1)}>↑</Button>
                <Button size="slim" disabled={idx === items.length - 1} onClick={() => moveItem(idx, 1)}>↓</Button>
                {items.length > 1 && <Button size="slim" tone="critical" onClick={() => removeItem(idx)}>Entfernen</Button>}
              </InlineStack>
            </InlineStack>
            <TextField label="Zitat" value={gi(item, "quote", editLang)} onChange={(v) => updateItemI18n(idx, "quote", v)} multiline={3} autoComplete="off" />
            <InlineStack gap="400" wrap={false}>
              <div style={{ flex: 1 }}>
                <TextField label="Name" value={gi(item, "author", editLang)} onChange={(v) => updateItemI18n(idx, "author", v)} autoComplete="off" />
              </div>
              <div style={{ flex: 1 }}>
                <TextField label="Rolle / Titel (optional)" value={gi(item, "role", editLang)} onChange={(v) => updateItemI18n(idx, "role", v)} autoComplete="off" />
              </div>
              <div style={{ flex: "0 0 80px" }}>
                <Select
                  label="Sterne"
                  options={[5, 4, 3, 2, 1].map((n) => ({ label: `${n} ★`, value: String(n) }))}
                  value={String(item.rating || 5)}
                  onChange={(v) => updateItem(idx, "rating", Number(v))}
                />
              </div>
            </InlineStack>
            <ImageField
              label="Avatar (optional)"
              value={gi(item, "avatar", editLang)}
              onPick={() => setPickerIdx(idx)}
              onClear={() => updateItemI18n(idx, "avatar", "")}
            />
          </BlockStack>
        </Card>
      ))}

      <InlineStack>
        <Button onClick={addItem}>+ Stimme hinzufügen</Button>
      </InlineStack>
    </BlockStack>
  );
}

const VIDEO_ASPECT_OPTIONS = [
  { label: "16:9 (Standard)", value: "16/9" },
  { label: "4:3", value: "4/3" },
  { label: "1:1 (Quadrat)", value: "1/1" },
  { label: "9:16 (Hochformat)", value: "9/16" },
  { label: "21:9 (Cinematic)", value: "21/9" },
  { label: "Auto (Kasten 16:9, Video füllt)", value: "auto" },
];

// ── Video block editor ─────────────────────────────────────────────────────
function VideoBlockEditor({ container, onChange, deviceTab = 0, editLang = "de" }) {
  const isMobileView = deviceTab >= 1;
  const [posterPicker, setPosterPicker] = useState(null);
  const mode = container.video_mode === "embed" ? "embed" : "file";
  return (
    <BlockStack gap="400">
      {posterPicker === "desktop" && (
        <MediaPickerModal
          open
          multiple={false}
          onClose={() => setPosterPicker(null)}
          onSelect={(urls) => { if (urls[0]) onChange(si(container, "poster_url", editLang, urls[0])); setPosterPicker(null); }}
        />
      )}
      {posterPicker === "mobile" && (
        <MediaPickerModal
          open
          multiple={false}
          onClose={() => setPosterPicker(null)}
          onSelect={(urls) => { if (urls[0]) onChange(si(container, "poster_url_mobile", editLang, urls[0])); setPosterPicker(null); }}
        />
      )}

      <TextField
        label="Überschrift (optional)"
        value={gi(container, "title", editLang)}
        onChange={(v) => onChange(si(container, "title", editLang, v))}
        autoComplete="off"
      />
      <TextField
        label="Unterzeile (optional)"
        value={gi(container, "caption", editLang)}
        onChange={(v) => onChange(si(container, "caption", editLang, v))}
        multiline={2}
        autoComplete="off"
      />
      <ColorField label="Textfarbe (Titel & Unterzeile)" value={container.text_color || "#111827"} onChange={(v) => onChange({ ...container, text_color: v })} />
      <ColorField label="Hintergrund" value={container.bg_color || "#ffffff"} onChange={(v) => onChange({ ...container, bg_color: v })} />

      <Select
        label="Quelle"
        options={[
          { label: "Video-Datei (URL / Upload-Pfad MP4, WebM)", value: "file" },
          { label: "Einbetten (YouTube, Vimeo, …)", value: "embed" },
        ]}
        value={mode}
        onChange={(v) => onChange({ ...container, video_mode: v === "embed" ? "embed" : "file" })}
      />

      {mode === "file" ? (
        <BlockStack gap="300">
          <TextField
            label="Video-URL"
            value={isMobileView ? (container.video_url_mobile || "") : (container.video_url || "")}
            onChange={(v) => onChange({
              ...container,
              ...(isMobileView ? { video_url_mobile: v } : { video_url: v }),
            })}
            autoComplete="off"
            placeholder="https://…/video.mp4 oder /uploads/…"
            helpText="Direkter Link zu MP4/WebM"
          />
          <div style={EDITOR_FIELD_GRID}>
            <ImageField
              label="Poster (optional)"
              value={isMobileView ? gi(container, "poster_url_mobile", editLang) : gi(container, "poster_url", editLang)}
              onPick={() => setPosterPicker(isMobileView ? "mobile" : "desktop")}
              onClear={() =>
                onChange(
                  si(container, isMobileView ? "poster_url_mobile" : "poster_url", editLang, ""),
                )}
            />
          </div>
        </BlockStack>
      ) : (
        <BlockStack gap="300">
          <TextField
            label="Einbettungs-URL"
            value={isMobileView ? (container.embed_url_mobile || "") : (container.embed_url || "")}
            onChange={(v) => onChange({
              ...container,
              ...(isMobileView ? { embed_url_mobile: v } : { embed_url: v }),
            })}
            autoComplete="off"
            placeholder="https://www.youtube.com/watch?v=…"
          />
        </BlockStack>
      )}

      <Select
        label="Anzeige-Verhältnis (Rahmen)"
        options={VIDEO_ASPECT_OPTIONS}
        value={String(container.aspect_ratio || "16/9").replace(/:/g, "/").trim() || "16/9"}
        onChange={(v) => onChange({ ...container, aspect_ratio: v })}
      />

      <Text as="h3" variant="headingSm">Wiedergabe (nur Datei-Modus)</Text>
      <div style={EDITOR_FIELD_GRID}>
        <Checkbox
          label="Autoplay (benötigt meist Stumm)"
          checked={container.autoplay === true}
          onChange={(c) => onChange({ ...container, autoplay: c })}
        />
        <Checkbox
          label="Stumm starten"
          checked={container.muted !== false}
          onChange={(c) => onChange({ ...container, muted: c })}
        />
        <Checkbox
          label="Endlosschleife"
          checked={container.loop === true}
          onChange={(c) => onChange({ ...container, loop: c })}
        />
        <Checkbox
          label="Steuerelemente (Play/Pause)"
          checked={container.controls !== false}
          onChange={(c) => onChange({ ...container, controls: c })}
        />
        <Checkbox
          label="Plays inline (iOS, empfohlen)"
          checked={container.playsinline !== false}
          onChange={(c) => onChange({ ...container, playsinline: c })}
        />
      </div>
    </BlockStack>
  );
}

function ContainerLayoutEditor({ container, onChange, embedded = false }) {
  const layout = container.content_layout === "full" ? "full" : "contained";
  const maxW =
    container.content_max_width !== undefined && container.content_max_width !== null
      ? String(container.content_max_width)
      : "";
  const inner = (
    <BlockStack gap="300">
      <Text variant="headingSm" as="h3">Inhaltsbreite</Text>
      <Text as="p" variant="bodySm" tone="subdued">
        Volle Breite im Innenbereich oder zentriert mit Maximalbreite.
      </Text>
      <Select
        label="Inhalt"
        options={[
          { label: "Volle Breite (innerhalb des Innenabstands)", value: "full" },
          { label: "Zentriert, max. Breite", value: "contained" },
        ]}
        value={layout}
        onChange={(v) => onChange({ ...container, content_layout: v })}
      />
      {layout === "contained" ? (
        <TextField
          label="Max. Breite"
          value={maxW}
          onChange={(v) => {
            const t = v != null ? String(v).trim() : "";
            onChange({
              ...container,
              content_max_width: t === "" ? undefined : t,
            });
          }}
          autoComplete="off"
          placeholder="z. B. 1200px"
          helpText="Schmal: immer 100%."
        />
      ) : null}
    </BlockStack>
  );
  if (embedded) {
    return <Box paddingBlockStart="0">{inner}</Box>;
  }
  return (
    <div>
      <Divider />
      <Box paddingBlockStart="400">{inner}</Box>
    </div>
  );
}

function ContainerSpacingEditor({ container, onChange, embedded = false }) {
  const m = container.margin || {};
  const set = (k, v) => {
    const next = { ...m };
    const trimmed = v != null ? String(v).trim() : "";
    if (trimmed === "") delete next[k];
    else next[k] = v;
    const keys = Object.keys(next);
    onChange({ ...container, margin: keys.length ? next : undefined });
  };
  const fields = [
    { key: "top",    label: "Oben" },
    { key: "bottom", label: "Unten" },
    { key: "left",   label: "Links" },
    { key: "right",  label: "Rechts" },
  ];
  const inner = (
    <BlockStack gap="300">
      <Text variant="headingSm" as="h3">Konteyner dış boşluğu (margin)</Text>
      <Box background="bg-surface-secondary" padding="400" borderRadius="200">
        <div style={EDITOR_FIELD_GRID}>
          {fields.map(({ key, label: lbl }) => (
            <TextField
              key={key}
              label={lbl}
              value={m[key] !== undefined ? String(m[key]) : ""}
              onChange={(v) => set(key, v)}
              autoComplete="off"
              placeholder="0"
            />
          ))}
        </div>
      </Box>
    </BlockStack>
  );
  if (embedded) {
    return <Box paddingBlockStart="0">{inner}</Box>;
  }
  return (
    <div>
      <Divider />
      <Box paddingBlockStart="400">{inner}</Box>
    </div>
  );
}

/** Inhalt + Außen: ein Mal rechts, für alle Containertypen */
function ContainerChromePanel({ container, onChange, deviceTab = 0 }) {
  const t = container.type;
  const def = getContainerPaddingDefault(t);
  const hOnly = containerPaddingHorizontalOnly(t);
  const isMobileView = deviceTab >= 1;
  const isImageCarousel = t === "image_carousel";
  return (
    <Card>
      <BlockStack gap="400">
        <Text as="h3" variant="headingSm">Konteyner boşluk ayarları</Text>
        {!isImageCarousel && (
          <PaddingEditor
            label="İç boşluk (sağ/sol)"
            value={container.padding || def}
            onChange={(v) => onChange({ ...container, padding: v })}
            defaultValue={def}
            horizontalOnly={hOnly}
          />
        )}
        {isImageCarousel && (
          <>
            <TextField
              label="Görseller arası boşluk (px)"
              type="number"
              value={String(isMobileView ? (container.gap_mobile ?? "") : (container.gap ?? 16))}
              onChange={(v) => {
                const trimmed = String(v || "").trim();
                if (isMobileView) {
                  if (trimmed === "") onChange({ ...container, gap_mobile: undefined });
                  else onChange({ ...container, gap_mobile: Number(v) || 0 });
                  return;
                }
                onChange({ ...container, gap: Number(v) || 16 });
              }}
              autoComplete="off"
              helpText={isMobileView ? "Boş bırakırsan desktop değeri kullanılır." : undefined}
            />
          </>
        )}
        {!isMobileView && (
          <>
            <Divider />
            <ContainerLayoutEditor container={container} onChange={onChange} embedded />
          </>
        )}
        <Divider />
        <ContainerSpacingEditor container={container} onChange={onChange} embedded />
      </BlockStack>
    </Card>
  );
}

function ContainerEditor({ container, onChange, deviceTab = 0, editLang = "de" }) {
  let editor = null;
  switch (container.type) {
    case "hero_banner":          editor = <HeroBannerEditor container={container} onChange={onChange} editLang={editLang} />; break;
    case "text_block":           editor = <TextBlockEditor container={container} onChange={onChange} editLang={editLang} />; break;
    case "image_text":           editor = <ImageTextEditor container={container} onChange={onChange} editLang={editLang} />; break;
    case "image_grid":           editor = <ImageGridEditor container={container} onChange={onChange} editLang={editLang} />; break;
    case "content_mosaic":       editor = <ContentMosaicEditor container={container} onChange={onChange} deviceTab={deviceTab} editLang={editLang} />; break;
    case "image_carousel":       editor = <ImageCarouselEditor container={container} onChange={onChange} deviceTab={deviceTab} editLang={editLang} />; break;
    case "banner_cta":           editor = <BannerCtaEditor container={container} onChange={onChange} editLang={editLang} />; break;
    case "collection_carousel":  editor = <CollectionCarouselEditor container={container} onChange={onChange} deviceTab={deviceTab} editLang={editLang} />; break;
    case "collections_carousel": editor = <CollectionsCarouselEditor container={container} onChange={onChange} deviceTab={deviceTab} editLang={editLang} />; break;
    case "accordion":            editor = <AccordionEditor container={container} onChange={onChange} editLang={editLang} />; break;
    case "tabs":                 editor = <TabsEditor container={container} onChange={onChange} editLang={editLang} />; break;
    case "single_product":       editor = <SingleProductEditor container={container} onChange={onChange} editLang={editLang} />; break;
    case "blog_carousel":        editor = <BlogCarouselEditor container={container} onChange={onChange} deviceTab={deviceTab} editLang={editLang} />; break;
    case "newsletter":           editor = <NewsletterEditor container={container} onChange={onChange} editLang={editLang} />; break;
    case "feature_grid":         editor = <FeatureGridEditor container={container} onChange={onChange} editLang={editLang} />; break;
    case "testimonials":         editor = <TestimonialsEditor container={container} onChange={onChange} editLang={editLang} />; break;
    case "video_block":          editor = <VideoBlockEditor container={container} onChange={onChange} deviceTab={deviceTab} editLang={editLang} />; break;
    default: return null;
  }
  return (
    <div style={{ ...CONTAINER_EDITOR_ROW, gap: container.type === "image_carousel" ? 12 : CONTAINER_EDITOR_ROW.gap }}>
      <div style={CONTAINER_EDITOR_MAIN}>
        <BlockStack gap="500">{editor}</BlockStack>
      </div>
      <div style={CONTAINER_EDITOR_CHROME}>
        <ContainerChromePanel container={container} onChange={onChange} deviceTab={deviceTab} />
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
const DEFAULT_PAGE_ID = "__default__"; // shop homepage (legacy single-row table)

const TEMPLATE_DEFAULTS = {
  collection_template: {
    banner_style: "strip",
    show_sidebar: true,
    sidebar_width: "220px",
    products_per_row: 4,
    products_per_row_mobile: 2,
    richtext_align: "left",
    richtext_max_width: "700px",
    content_padding_x: "32px",
  },
  category_template: {
    banner_style: "strip",
    show_sidebar: true,
    sidebar_width: "280px",
    products_per_row: 4,
    products_per_row_mobile: 2,
    richtext_align: "left",
    richtext_max_width: "700px",
    content_padding_x: "32px",
  },
};

export default function LandingPageEditor() {
  const params = useParams();
  const locale = String(params?.locale || "").toLowerCase();
  const isTurkish = locale === "tr";
  const containerTypes = useMemo(() => getContainerTypes(isTurkish), [isTurkish]);
  const client = getMedusaAdminClient();
  const unsaved = useUnsavedChanges();

  // ── Top-level tab: 0 = Seiten, 1 = Templates
  const [mainTab, setMainTab] = useState(0);
  /** Landing-Inhalt: Texte + Bilder pro Shop-Sprache (_i18n); „de“ = Root-Felder + Fallback im Shop */
  const [contentEditLang, setContentEditLang] = useState("de");
  // Templates: 0 = Desktop, 1 = Mobil (Kollektions- / Kategorie-Raster)
  const [templateDeviceTab, setTemplateDeviceTab] = useState(0);

  // ── Template settings (collection + category)
  const [tmpl, setTmpl] = useState(TEMPLATE_DEFAULTS);
  const [tmplSaving, setTmplSaving] = useState(false);
  const [tmplSaved, setTmplSaved] = useState(false);
  const [tmplErr, setTmplErr] = useState("");
  const [tmplSnapshot, setTmplSnapshot] = useState(JSON.stringify(TEMPLATE_DEFAULTS));

  const loadTemplates = useCallback(async () => {
    try {
      const data = await client.getStyles();
      const merged = mergeLoadedShopStyles(data?.styles || {});
      const loaded = {
        collection_template: { ...TEMPLATE_DEFAULTS.collection_template, ...(merged.collection_template || {}) },
        category_template:   { ...TEMPLATE_DEFAULTS.category_template,   ...(merged.category_template   || {}) },
      };
      setTmpl(loaded);
      setTmplSnapshot(JSON.stringify(loaded));
    } catch (_) {}
  }, [client]);

  useEffect(() => { loadTemplates(); }, [loadTemplates]);

  const saveTemplates = useCallback(async () => {
    setTmplSaving(true);
    setTmplErr("");
    setTmplSaved(false);
    try {
      // Mevcut styles'ı al, sadece template alanlarını güncelle
      const data = await client.getStyles();
      const current = data?.styles || {};
      await client.saveStyles({ ...current, collection_template: tmpl.collection_template, category_template: tmpl.category_template });
      setTmplSnapshot(JSON.stringify(tmpl));
      setTmplSaved(true);
      setTimeout(() => setTmplSaved(false), 3500);
    } catch (e) {
      setTmplErr(e?.message || "Fehler beim Speichern");
    }
    setTmplSaving(false);
  }, [client, tmpl]);

  const updateTmpl = (section, key, val) =>
    setTmpl((prev) => ({ ...prev, [section]: { ...prev[section], [key]: val } }));

  const tmplDirty = JSON.stringify(tmpl) !== tmplSnapshot;

  const [pages, setPages] = useState([]);
  const [selectedPageId, setSelectedPageId] = useState(DEFAULT_PAGE_ID);
  const [containers, setContainers] = useState([]);
  const [isDirty, setIsDirty] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState("");
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [activeTab, setActiveTab] = useState(0);
  /** Seiten → Container: 0 = Desktop, 1 = Tablet (600–1199px), 2 = Mobil (≤599px) */
  const [seitenDeviceTab, setSeitenDeviceTab] = useState(0);
  const [categoryRows, setCategoryRows] = useState([]);
  const [categorySettings, setCategorySettings] = useState({ show_submenu_left: false });

  useEffect(() => {
    const backendUrl = process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000";
    Promise.all([
      fetch(`${backendUrl}/admin-hub/v1/pages`).then((r) => r.json()).catch(() => ({ pages: [] })),
      client.getAdminHubCategories().catch(() => ({ categories: [] })),
    ])
      .then(([r, catRes]) => {
        const list = Array.isArray(r?.pages) ? r.pages : [];
        setPages(list);
        const tree = catRes?.tree || catRes?.categories || [];
        const flat = flattenCategoriesForSelect(Array.isArray(tree) ? tree : []);
        setCategoryRows(flat);
      })
      .catch((e) => setErr("Sayfalar yüklenemedi: " + (e?.message || "Bağlantı hatası")));
  }, [client]);

  const loadContainers = useCallback(async (pageId) => {
    if (!pageId) return;
    setLoading(true);
    setErr("");
    try {
      let data;
      if (pageId === DEFAULT_PAGE_ID) {
        data = await client.request("/admin-hub/landing-page");
        setCategorySettings(normalizeLandingPageSettings(data?.settings));
      } else if (String(pageId).startsWith("cat:")) {
        const cid = String(pageId).slice(4);
        data = await client.getLandingPageCategoryContainers(cid);
        setCategorySettings(normalizeLandingPageSettings(data?.settings));
      } else {
        data = await client.getLandingPageContainers(pageId);
        setCategorySettings(normalizeLandingPageSettings(data?.settings));
      }
      setContainers(Array.isArray(data?.containers) ? data.containers : []);
    } catch (e) {
      setContainers([]);
      setCategorySettings({ show_submenu_left: false, show_filter_bar: true });
      setErr(e?.message || "Containerlar yüklenemedi");
    }
    setLoading(false);
  }, [client]);

  useEffect(() => {
    if (selectedPageId) loadContainers(selectedPageId);
    else setContainers([]);
  }, [selectedPageId, loadContainers]);

  const handleSave = useCallback(async () => {
    if (!selectedPageId) return;
    setSaving(true);
    setErr("");
    setSaved(false);
    try {
      if (selectedPageId === DEFAULT_PAGE_ID) {
        await client.request("/admin-hub/landing-page", {
          method: "PUT",
          body: JSON.stringify({ containers, settings: categorySettings }),
        });
      } else if (String(selectedPageId).startsWith("cat:")) {
        const cid = String(selectedPageId).slice(4);
        await client.saveLandingPageCategoryContainers(cid, { containers, settings: categorySettings });
      } else {
        await client.saveLandingPageContainers(selectedPageId, { containers, settings: categorySettings });
      }
      setSaved(true);
      setIsDirty(false);
      setTimeout(() => setSaved(false), 4000);
    } catch (e) {
      setErr(e?.message || "Fehler beim Speichern");
    }
    setSaving(false);
  }, [selectedPageId, containers, categorySettings, client]);

  const handleDiscard = useCallback(async () => {
    setIsDirty(false);
    if (selectedPageId) await loadContainers(selectedPageId);
  }, [selectedPageId, loadContainers]);

  // Wire up top-bar Save/Discard buttons via UnsavedChanges context
  useEffect(() => {
    unsaved?.setDirty(isDirty);
    if (!isDirty) {
      unsaved?.clearHandlers();
      return;
    }
    unsaved?.setHandlers({ onSave: handleSave, onDiscard: handleDiscard });
    return () => unsaved?.clearHandlers();
  }, [isDirty, handleSave, handleDiscard]);

  // Reset dirty state and viewport-Tab when switching pages
  useEffect(() => {
    setIsDirty(false);
    setSeitenDeviceTab(0);
  }, [selectedPageId]);

  /**
   * Reiter = Ziel-Viewport: neue Container bekommen visible_on per Tab (addContainer).
   * Tab 0 = Desktop, Tab 1 = Tablet, Tab 2 = Mobil.
   * Legacy: visible_on "both" erscheint in Desktop- und Mobil-Reitern (kein Tablet).
   */
  const matchContainerSeitenTab = (c, tab) => {
    const v = c.visible_on || "desktop";
    if (tab === 0) return v === "both" || v === "desktop";
    if (tab === 1) return v === "tablet";
    return v === "both" || v === "mobile";
  };

  const filteredSeitenContainers = useMemo(() => {
    if (!Array.isArray(containers)) return [];
    return containers.filter((c) => matchContainerSeitenTab(c, seitenDeviceTab));
  }, [containers, seitenDeviceTab]);

  const addContainer = (type) => {
    const base = newContainer(type);
    const isTabletTab = seitenDeviceTab === 1;
    const isMobileTab = seitenDeviceTab === 2;
    const carouselTypes = ["collection_carousel", "collections_carousel", "blog_carousel"];
    const narrowOverrides = (isTabletTab || isMobileTab) && carouselTypes.includes(type)
      ? { items_per_row: 2, items_per_row_mobile: 2 }
      : {};
    const visible_on = isMobileTab ? "mobile" : isTabletTab ? "tablet" : "desktop";
    const c = { ...base, ...narrowOverrides, visible_on };
    setContainers((prev) => [...prev, c]);
    setExpandedId(c.id);
    setAddModalOpen(false);
    setIsDirty(true);
  };

  /** Duplicate a container to the Mobile tab (tab 2). Original becomes desktop-only; copy becomes mobile-only. */
  const duplicateToMobile = (srcId) => {
    const src = containers.find((c) => c.id === srcId);
    if (!src) return;
    const copy = {
      ...src,
      id: `c_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      visible_on: "mobile",
      ...(["collection_carousel", "collections_carousel", "blog_carousel", "image_carousel"].includes(src.type)
        ? { items_per_row: 2, items_per_row_mobile: 2 }
        : {}),
    };
    setContainers((prev) => [
      ...prev.map((c) => c.id === srcId ? { ...c, visible_on: "desktop" } : c),
      copy,
    ]);
    setExpandedId(copy.id);
    setSeitenDeviceTab(2);
    setIsDirty(true);
  };

  /** Duplicate a container to the Tablet tab (tab 1). Original keeps its visible_on; copy becomes tablet-only. */
  const duplicateToTablet = (srcId) => {
    const src = containers.find((c) => c.id === srcId);
    if (!src) return;
    const copy = {
      ...src,
      id: `c_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      visible_on: "tablet",
      ...(["collection_carousel", "collections_carousel", "blog_carousel", "image_carousel"].includes(src.type)
        ? { items_per_row: 3, items_per_row_mobile: 3 }
        : {}),
    };
    setContainers((prev) => [...prev, copy]);
    setExpandedId(copy.id);
    setSeitenDeviceTab(1);
    setIsDirty(true);
  };

  /** Duplicate a container to the Desktop tab. Original becomes mobile-only; copy becomes desktop-only. */
  const duplicateToDesktop = (srcId) => {
    const src = containers.find((c) => c.id === srcId);
    if (!src) return;
    const copy = {
      ...src,
      id: `c_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      visible_on: "desktop",
    };
    setContainers((prev) => [
      ...prev.map((c) => c.id === srcId ? { ...c, visible_on: "mobile" } : c),
      copy,
    ]);
    setExpandedId(copy.id);
    setSeitenDeviceTab(0);
    setIsDirty(true);
  };

  const updateContainer = (id, updated) => { setContainers((prev) => prev.map((c) => c.id === id ? updated : c)); setIsDirty(true); };
  const removeContainer = (id) => { setContainers((prev) => prev.filter((c) => c.id !== id)); if (expandedId === id) setExpandedId(null); setIsDirty(true); };

  /** Reihenfolge nur innerhalb des aktuellen Desktop- bzw. Mobil-Reiters. */
  const moveContainerInSeitenTab = (id, dir) => {
    setContainers((prev) => {
      const inTab = prev.filter((c) => matchContainerSeitenTab(c, seitenDeviceTab));
      const pos = inTab.findIndex((c) => c.id === id);
      if (pos < 0) return prev;
      const newPos = pos + dir;
      if (newPos < 0 || newPos >= inTab.length) return prev;
      const idA = id;
      const idB = inTab[newPos].id;
      const iA = prev.findIndex((c) => c.id === idA);
      const iB = prev.findIndex((c) => c.id === idB);
      if (iA < 0 || iB < 0) return prev;
      const n = [...prev];
      [n[iA], n[iB]] = [n[iB], n[iA]];
      return n;
    });
    setIsDirty(true);
  };

  const typeInfo = (type) => containerTypes.find((t) => t.type === type) || { label: type };
  const cmsPages  = pages.filter((p) => p.page_type !== "blog");
  const blogPosts = pages.filter((p) => p.page_type === "blog");
  const pageOptions = [
    { label: "— Auswählen —", value: "" },
    { label: "Startseite (Shop)", value: "__default__" },
    { label: "—— CMS-Seiten ——", value: PAGE_HEADING, disabled: true },
    ...(cmsPages.length
      ? cmsPages.map((p) => ({ label: `${p.title || "Seite"} (/${p.slug || p.id})`, value: String(p.id) }))
      : [{ label: "(Keine CMS-Seiten)", value: "__no_page__", disabled: true }]),
    { label: "—— Blog-Beiträge ——", value: BLOG_HEADING, disabled: true },
    ...(blogPosts.length
      ? blogPosts.map((p) => ({ label: `${p.title || "Beitrag"} (/${p.slug || p.id})`, value: String(p.id) }))
      : [{ label: "(Keine Blog-Beiträge)", value: "__no_blog__", disabled: true }]),
  ];
  const isCategorySelection = String(selectedPageId).startsWith("cat:");
  const editorTabs = [
    { id: "containers", content: "Container" },
    { id: "category", content: "Kategorie" },
  ];

  const mainTabs = [
    { id: "seiten", content: "Seiten" },
    { id: "templates", content: "Templates" },
  ];

  return (
    <Page
      title="Landing Page"
      subtitle="Gestalte Seiten deines Shops mit Containern"
      primaryAction={mainTab === 1 ? {
        content: tmplSaving ? "Speichern…" : "Speichern",
        onAction: saveTemplates,
        loading: tmplSaving,
        disabled: !tmplDirty,
      } : undefined}
    >
      <Layout>
        {err && <Layout.Section><Banner tone="critical" onDismiss={() => setErr("")}>{err}</Banner></Layout.Section>}
        {saved && <Layout.Section><Banner tone="success" onDismiss={() => setSaved(false)}>Änderungen gespeichert.</Banner></Layout.Section>}
        {tmplErr && <Layout.Section><Banner tone="critical" onDismiss={() => setTmplErr("")}>{tmplErr}</Banner></Layout.Section>}
        {tmplSaved && <Layout.Section><Banner tone="success" onDismiss={() => setTmplSaved(false)}>Template-Einstellungen gespeichert.</Banner></Layout.Section>}

        {/* ── Hauptnavigation: Seiten / Templates ── */}
        <Layout.Section>
          <Card>
            <PolarisTabs tabs={mainTabs} selected={mainTab} onSelect={setMainTab} />
          </Card>
        </Layout.Section>

        {/* ── TAB 0: Seiten ── */}
        {mainTab === 0 && <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingSm">Seite auswählen</Text>
              <Text as="p" variant="bodySm" tone="subdued">
                Wähle eine Seite aus, für die du die Inhalte gestalten möchtest.{" "}
                <a href="/content/pages" style={{ color: "var(--p-color-text-emphasis)" }}>Seiten verwalten →</a>
              </Text>
              <Select
                label="Seite"
                labelHidden
                options={pageOptions}
                value={selectedPageId}
                onChange={(v) => {
                  if (!v || v === CAT_HEADING || v === PAGE_HEADING || v === BLOG_HEADING || v === "__no_cat__" || v === "__no_page__" || v === "__no_blog__") return;
                  setSelectedPageId(v);
                  setExpandedId(null);
                  setActiveTab(0);
                }}
              />
            </BlockStack>
          </Card>
        </Layout.Section>}

        {mainTab === 0 && selectedPageId && (
          <Layout.Section>
            <Card>
              <PolarisTabs tabs={editorTabs} selected={activeTab} onSelect={setActiveTab}>
                <Box paddingBlockStart="400">
                  {activeTab === 1 && (
                    <BlockStack gap="400">
                      <Text as="p" variant="bodySm" tone="subdued">
                        Für jede Auswahl unter „Seite auswählen“ (Startseite, CMS-Seiten, Kategorien) können Sie steuern, ob auf der zugehörigen <strong>Kollektionsseite</strong> (mit gleicher verknüpfter Kategorie) links die Unterkategorien erscheinen. Nur wenn das Kästchen <strong>aktiv</strong> ist, wird die Navigation angezeigt.
                      </Text>
                      <Checkbox
                        label="Unterkategorien links anzeigen"
                        helpText={
                          isCategorySelection
                            ? "Gilt für die Kollektionsseite dieser Kategorie (wenn Unterkategorien existieren)."
                            : "Wert wird für diese Seite gespeichert. Im Shop wirkt die Anzeige auf Kollektionsseiten über die Einstellung der jeweiligen Kategorie — wählen Sie dazu oben unter „Kategorien“ dieselbe Kategorie und aktivieren Sie dort dieses Kästchen."
                        }
                        checked={categorySettings.show_submenu_left === true}
                        onChange={(checked) => {
                          setCategorySettings((prev) => ({ ...prev, show_submenu_left: checked }));
                          setIsDirty(true);
                        }}
                      />
                      <Checkbox
                        label="Filterleiste im Shop anzeigen (zweite Navigationszeile)"
                        helpText="Die horizontale Menüzeile direkt unter der Hauptnavigation (Subnav). Gilt auf allen Shop-Seiten, die diese Landing Page laden (Startseite, zugehörige CMS-Seite oder Kategorie). Wenn deaktiviert, wird sie dort ausgeblendet."
                        checked={categorySettings.show_filter_bar !== false}
                        onChange={(checked) => {
                          setCategorySettings((prev) => ({ ...prev, show_filter_bar: checked }));
                          setIsDirty(true);
                        }}
                      />
                      <TextField
                        label="Abstand Header → erste Sektion (page_padding_top)"
                        helpText="Steuert den oberen Abstand des Landing-Page-Bereichs direkt unter der Navigation. z. B. '0px', '8px', '24px'. Leer lassen für Standard."
                        value={categorySettings.page_padding_top || ""}
                        onChange={(v) => {
                          setCategorySettings((prev) => ({ ...prev, page_padding_top: v }));
                          setIsDirty(true);
                        }}
                        autoComplete="off"
                        placeholder="0px"
                      />
                    </BlockStack>
                  )}

                  {activeTab === 0 && (
                    <>
                      {loading ? (
                        <Box paddingBlock="600"><Text as="p" tone="subdued" alignment="center">Laden…</Text></Box>
                      ) : (
                        <BlockStack gap="400">
                          <Card>
                            <PolarisTabs
                              tabs={[
                                { id: "seiten-d", content: "Desktop" },
                                { id: "seiten-t", content: "Tablet" },
                                { id: "seiten-m", content: "Mobil" },
                              ]}
                              selected={seitenDeviceTab}
                              onSelect={setSeitenDeviceTab}
                            />
                          </Card>

                          <Banner tone="info">
                            <p>
                              <strong>Sprache für Texte &amp; Bilder:</strong> Oben die Shop-Sprache wählen (DE = Standard/Fallback). Pro Sprache eigene Bilder setzen — andere Sprachen bleiben unverändert.
                              Im Shop gilt jeweils die aktive Locale; fehlt eine Übersetzung, wird Deutsch verwendet.
                            </p>
                          </Banner>
                          <div style={{ maxWidth: 320 }}>
                            <Select
                              label="Sprache bearbeiten"
                              options={SHOP_CONTENT_LANG_OPTIONS}
                              value={contentEditLang}
                              onChange={setContentEditLang}
                            />
                          </div>

                          {isCategorySelection && (
                            <Banner tone="success">Container gelten für diese Kategorie auf der zugehörigen Kollektionsseite im Shop (über dem Katalog).</Banner>
                          )}

                          {containers.length === 0 && (
                            <Box paddingBlock="600">
                              <BlockStack gap="300" align="center">
                                <Text as="p" variant="bodyLg" tone="subdued" alignment="center">Noch keine Container</Text>
                                <InlineStack align="center">
                                  <Button variant="primary" onClick={() => setAddModalOpen(true)}>Container hinzufügen</Button>
                                </InlineStack>
                              </BlockStack>
                            </Box>
                          )}

                          {containers.length > 0 && filteredSeitenContainers.length === 0 && (
                            <Banner tone="info">
                              {seitenDeviceTab === 0
                                ? 'Henüz Desktop bloğu yok. "+ Container ekle" ile yeni bir tane oluştur.'
                                : seitenDeviceTab === 1
                                ? 'Henüz Tablet bloğu yok. "+ Container ekle" ile oluştur. Tablet için genişlik değerlerini px yerine % veya vw olarak ayarla.'
                                : 'Henüz Mobil bloğu yok. "+ Container ekle" ile oluştur.'}
                            </Banner>
                          )}

                          {filteredSeitenContainers.map((c, idx) => {
                            const info = typeInfo(c.type);
                            const isExpanded = expandedId === c.id;
                            const vis = c.visible_on || "desktop";
                            const isLegacyBoth = vis === "both";
                            const last = idx === filteredSeitenContainers.length - 1;
                            return (
                              <Card key={c.id}>
                                <BlockStack gap="0">
                                  <Box paddingBlockEnd={isExpanded ? "400" : "0"}>
                                    <InlineStack align="space-between" blockAlign="center" gap="300">
                                      <InlineStack gap="300" blockAlign="center" wrap>
                                        <Text as="h3" variant="headingSm">{info.label}</Text>
                                        <Badge tone={c.visible ? "success" : undefined}>{c.visible ? "Sichtbar" : "Versteckt"}</Badge>
                                        {isLegacyBoth && <Badge tone="info">Beide (Altbestand)</Badge>}
                                        <Text as="span" variant="bodySm" tone="subdued">#{idx + 1}</Text>
                                      </InlineStack>
                                      <InlineStack gap="200" blockAlign="center">
                                        <Button size="slim" onClick={() => { updateContainer(c.id, { ...c, visible: !c.visible }); }}>{c.visible ? "Verstecken" : "Einblenden"}</Button>
                                        <Button size="slim" disabled={idx === 0} onClick={() => moveContainerInSeitenTab(c.id, -1)}>↑</Button>
                                        <Button size="slim" disabled={last} onClick={() => moveContainerInSeitenTab(c.id, 1)}>↓</Button>
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
                                        <ContainerEditor container={c} onChange={(updated) => updateContainer(c.id, updated)} deviceTab={seitenDeviceTab} editLang={contentEditLang} />
                                        <Box paddingBlockStart="400">
                                          <InlineStack align="end">
                                            <Button size="slim" tone="critical" onClick={() => { if (confirm("Container entfernen?")) removeContainer(c.id); }}>
                                              Entfernen
                                            </Button>
                                          </InlineStack>
                                        </Box>
                                      </Box>
                                    </>
                                  )}
                                </BlockStack>
                              </Card>
                            );
                          })}

                          {!loading && containers.length > 0 && (
                            <InlineStack>
                              <Button onClick={() => setAddModalOpen(true)}>+ Container hinzufügen</Button>
                            </InlineStack>
                          )}
                        </BlockStack>
                      )}
                    </>
                  )}
                </Box>
              </PolarisTabs>
            </Card>
          </Layout.Section>
        )}

        {/* ── TAB 1: Templates ── */}
        {mainTab === 1 && (
          <>
            <Layout.Section>
              <Card>
                <PolarisTabs
                  tabs={[
                    { id: "t-desktop", content: "Desktop" },
                    { id: "t-mobil", content: "Mobil" },
                  ]}
                  selected={templateDeviceTab}
                  onSelect={setTemplateDeviceTab}
                />
                <Box paddingBlockStart="300">
                  <Text as="p" variant="bodySm" tone="subdued">
                    {templateDeviceTab === 0
                      ? "Layout ab ca. 1024px Breite: Raster, Seitenleisten, Banners."
                      : "Schmaler Viewport (Produkt-Streifen, Karussell-Karten pro sichtbarer Zeile) — max. 1023px im Shop."}
                  </Text>
                </Box>
              </Card>
            </Layout.Section>

            {templateDeviceTab === 0 && (
            <>
            {/* Kollektion-Template — Desktop */}
            <Layout.Section>
              <Card>
                <BlockStack gap="400">
                  <BlockStack gap="100">
                    <Text as="h2" variant="headingMd">Kollektion-Template</Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      Gilt für alle Kollektionsseiten (z. B. /stiefel, /taschen).
                    </Text>
                  </BlockStack>
                  <Divider />
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 16 }}>
                    <Select
                      label="Banner-Stil"
                      options={[
                        { label: "Schmaler Streifen (Standard)", value: "strip" },
                        { label: "Mittelgroß", value: "medium" },
                        { label: "Groß / Hoch", value: "tall" },
                        { label: "Kein Banner", value: "none" },
                      ]}
                      value={tmpl.collection_template.banner_style}
                      onChange={(v) => updateTmpl("collection_template", "banner_style", v)}
                    />
                    <Select
                      label="Produkte pro Zeile (Desktop)"
                      options={[2,3,4,5,6].map((n) => ({ label: String(n), value: String(n) }))}
                      value={String(tmpl.collection_template.products_per_row)}
                      onChange={(v) => updateTmpl("collection_template", "products_per_row", Number(v))}
                    />
                    <Select
                      label="Filter-Sidebar"
                      options={[
                        { label: "Anzeigen", value: "true" },
                        { label: "Verstecken", value: "false" },
                      ]}
                      value={tmpl.collection_template.show_sidebar === false ? "false" : "true"}
                      onChange={(v) => updateTmpl("collection_template", "show_sidebar", v === "true")}
                    />
                    <TextField
                      label="Sidebar-Breite"
                      value={tmpl.collection_template.sidebar_width}
                      onChange={(v) => updateTmpl("collection_template", "sidebar_width", v)}
                      autoComplete="off"
                      helpText="z. B. 200px, 260px"
                    />
                    <Select
                      label="Beschreibung: Ausrichtung"
                      options={[
                        { label: "Linksbündig", value: "left" },
                        { label: "Zentriert", value: "center" },
                      ]}
                      value={tmpl.collection_template.richtext_align}
                      onChange={(v) => updateTmpl("collection_template", "richtext_align", v)}
                    />
                    <Select
                      label="Beschreibung: Breite"
                      options={[
                        { label: "Schmal (520 px)", value: "520px" },
                        { label: "Begrenzt (700 px)", value: "700px" },
                        { label: "Mittel (900 px)", value: "900px" },
                        { label: "Volle Breite", value: "full" },
                      ]}
                      value={tmpl.collection_template.richtext_max_width}
                      onChange={(v) => updateTmpl("collection_template", "richtext_max_width", v)}
                    />
                    <TextField
                      label="Seitenabstand links / rechts"
                      value={tmpl.collection_template.content_padding_x}
                      onChange={(v) => updateTmpl("collection_template", "content_padding_x", v)}
                      autoComplete="off"
                      helpText="z. B. 32px, 24px, 0px"
                    />
                  </div>
                </BlockStack>
              </Card>
            </Layout.Section>

            {/* Kategorie-Template — Desktop */}
            <Layout.Section>
              <Card>
                <BlockStack gap="400">
                  <BlockStack gap="100">
                    <Text as="h2" variant="headingMd">Kategorie-Template</Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      Gilt für alle Kategorieseiten (z. B. /schuhe, /damen). Ab ca. 1024px: Produktkarten im Raster. Darunter: horizontal scrollbarer Streifen; Spaltenzahl unter „Mobil“.
                    </Text>
                  </BlockStack>
                  <Divider />
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 16 }}>
                    <Select
                      label="Banner-Stil"
                      options={[
                        { label: "Schmaler Streifen (Standard)", value: "strip" },
                        { label: "Mittelgroß", value: "medium" },
                        { label: "Groß / Hoch", value: "tall" },
                        { label: "Kein Banner", value: "none" },
                      ]}
                      value={tmpl.category_template.banner_style}
                      onChange={(v) => updateTmpl("category_template", "banner_style", v)}
                    />
                    <Select
                      label="Produkte pro Zeile (Desktop)"
                      options={[2,3,4,5,6].map((n) => ({ label: String(n), value: String(n) }))}
                      value={String(tmpl.category_template.products_per_row ?? 4)}
                      onChange={(v) => updateTmpl("category_template", "products_per_row", Number(v))}
                    />
                    <Select
                      label="Navigations-Sidebar"
                      options={[
                        { label: "Anzeigen", value: "true" },
                        { label: "Verstecken", value: "false" },
                      ]}
                      value={tmpl.category_template.show_sidebar === false ? "false" : "true"}
                      onChange={(v) => updateTmpl("category_template", "show_sidebar", v === "true")}
                    />
                    <TextField
                      label="Sidebar-Breite"
                      value={tmpl.category_template.sidebar_width}
                      onChange={(v) => updateTmpl("category_template", "sidebar_width", v)}
                      autoComplete="off"
                      helpText="z. B. 240px, 300px"
                    />
                    <Select
                      label="Beschreibung: Ausrichtung"
                      options={[
                        { label: "Linksbündig", value: "left" },
                        { label: "Zentriert", value: "center" },
                      ]}
                      value={tmpl.category_template.richtext_align}
                      onChange={(v) => updateTmpl("category_template", "richtext_align", v)}
                    />
                    <Select
                      label="Beschreibung: Breite"
                      options={[
                        { label: "Schmal (520 px)", value: "520px" },
                        { label: "Begrenzt (700 px)", value: "700px" },
                        { label: "Mittel (900 px)", value: "900px" },
                        { label: "Volle Breite", value: "full" },
                      ]}
                      value={tmpl.category_template.richtext_max_width}
                      onChange={(v) => updateTmpl("category_template", "richtext_max_width", v)}
                    />
                    <TextField
                      label="Seitenabstand links / rechts"
                      value={tmpl.category_template.content_padding_x}
                      onChange={(v) => updateTmpl("category_template", "content_padding_x", v)}
                      autoComplete="off"
                      helpText="z. B. 32px, 24px, 0px"
                    />
                  </div>
                </BlockStack>
              </Card>
            </Layout.Section>
            </>
            )}

            {templateDeviceTab === 1 && (
            <>
            <Layout.Section>
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">Kollektion-Template (Mobil)</Text>
                  <Text as="p" variant="bodySm" tone="subdued">Produkte nebeneinander im waagerechten Streifen (viewport ≤ 1023px).</Text>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 16 }}>
                    <Select
                      label="Sichtbar nebeneinander (Mobil)"
                      options={[1,2,3,4].map((n) => ({ label: String(n), value: String(n) }))}
                      value={String(tmpl.collection_template.products_per_row_mobile ?? 2)}
                      onChange={(v) => updateTmpl("collection_template", "products_per_row_mobile", Number(v))}
                    />
                  </div>
                </BlockStack>
              </Card>
            </Layout.Section>
            <Layout.Section>
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">Kategorie-Template (Mobil)</Text>
                  <Text as="p" variant="bodySm" tone="subdued">Gleiches Raster wie Suche und Kollektion auf schmalen Viewports.</Text>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 16 }}>
                    <Select
                      label="Sichtbar nebeneinander (Mobil)"
                      options={[1,2,3,4].map((n) => ({ label: String(n), value: String(n) }))}
                      value={String(tmpl.category_template.products_per_row_mobile ?? 2)}
                      onChange={(v) => updateTmpl("category_template", "products_per_row_mobile", Number(v))}
                    />
                  </div>
                </BlockStack>
              </Card>
            </Layout.Section>
            </>
            )}
          </>
        )}

        <Modal open={addModalOpen} onClose={() => setAddModalOpen(false)} title="Container auswählen">
          <Modal.Section>
            <BlockStack gap="300">
              {containerTypes.map((t) => (
                <Box key={t.type} padding="400" borderWidth="025" borderColor="border" borderRadius="200" background="bg-surface">
                  <InlineStack align="space-between" blockAlign="center" gap="300" wrap={false}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <BlockStack gap="100">
                        <Text as="p" variant="bodyMd" fontWeight="semibold">{t.label}</Text>
                        <Text as="p" variant="bodySm" tone="subdued">{t.description}</Text>
                      </BlockStack>
                    </div>
                    <div style={{ flexShrink: 0 }}>
                      <Button variant="primary" size="slim" onClick={() => addContainer(t.type)}>Auswählen</Button>
                    </div>
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
