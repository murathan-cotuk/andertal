"use client";

import { useEffect, useState } from "react";
import { BlockStack, Text, TextField, Select, Button, Banner, InlineStack, Box } from "@shopify/polaris";
import { useLocale } from "next-intl";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";
import { getLandingEditorCopy } from "@/lib/landing-page-editor-i18n";

/** Read a translatable field: DE lives on the plain fallback, other languages under `${field}_i18n[lang][field]`. */
function gi(obj, field, i18nField, lang, fallback) {
  if (!lang || lang === "de") return fallback ?? "";
  return obj?.[i18nField]?.[lang]?.[field] ?? "";
}
function setI18n(i18nObj, field, lang, value) {
  return { ...(i18nObj || {}), [lang]: { ...(i18nObj?.[lang] || {}), [field]: value } };
}

const SORT_MODE_OPTIONS_BY_LOCALE = {
  de: [
    { label: "Verkaufsbasiert (Standard)", value: "sales" },
    { label: "Nach Aufrufen", value: "views" },
    { label: "Nach Bewertung", value: "rating" },
    { label: "Neueste zuerst", value: "newest" },
    { label: "Zufällig", value: "random" },
  ],
  tr: [
    { label: "Satış bazlı (varsayılan)", value: "sales" },
    { label: "Görüntülenme bazlı", value: "views" },
    { label: "İnceleme puanı bazlı", value: "rating" },
    { label: "En yeni eklenen", value: "newest" },
    { label: "Rastgele", value: "random" },
  ],
  en: [
    { label: "Sales-based (default)", value: "sales" },
    { label: "View count", value: "views" },
    { label: "Review rating", value: "rating" },
    { label: "Newest first", value: "newest" },
    { label: "Random", value: "random" },
  ],
};

const COPY_BY_LOCALE = {
  de: {
    title: "Seiteneinstellungen", subtitle: "Titel, Anzahl und Sortierung für diese API-Seite.",
    titleLabel: "Titel", subtitleLabel: "Untertitel", maxItemsLabel: "Max. Produkte pro Karussell",
    sortLabel: "Quelle / Sortierung", save: "Speichern", saved: "Gespeichert.", loading: "Lädt…",
    saveError: "Speichern fehlgeschlagen",
  },
  tr: {
    title: "Sayfa ayarları", subtitle: "Bu API sayfası için başlık, adet ve sıralama.",
    titleLabel: "Başlık", subtitleLabel: "Alt başlık", maxItemsLabel: "Karusel başına maksimum ürün",
    sortLabel: "Kaynak / Sıralama", save: "Kaydet", saved: "Kaydedildi.", loading: "Yükleniyor…",
    saveError: "Kaydetme başarısız",
  },
  en: {
    title: "Page settings", subtitle: "Title, item count and sort order for this API page.",
    titleLabel: "Title", subtitleLabel: "Subtitle", maxItemsLabel: "Max products per carousel",
    sortLabel: "Source / sort order", save: "Save", saved: "Saved.", loading: "Loading…",
    saveError: "Save failed",
  },
};

export default function ApiPageSettingsPanel({ slug, pageLabel }) {
  const uiLocale = useLocale();
  const c = COPY_BY_LOCALE[uiLocale] || COPY_BY_LOCALE.en;
  const sortModeOptions = SORT_MODE_OPTIONS_BY_LOCALE[uiLocale] || SORT_MODE_OPTIONS_BY_LOCALE.en;
  const langOptions = getLandingEditorCopy(uiLocale).shopContentLangOptions();
  const client = getMedusaAdminClient();

  const [editLang, setEditLang] = useState("de");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [settings, setSettings] = useState({
    title: "", subtitle: "", title_i18n: {}, subtitle_i18n: {}, max_items: 20, sort_mode: "sales",
  });

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    setEditLang("de");
    client.getApiPageSettings(slug)
      .then((data) => {
        if (cancelled) return;
        setSettings({
          title: data?.title_i18n?.de?.title || "",
          subtitle: data?.title_i18n?.de?.subtitle || "",
          title_i18n: data?.title_i18n || {},
          subtitle_i18n: data?.subtitle_i18n || {},
          max_items: data?.max_items || 20,
          sort_mode: data?.sort_mode || "sales",
        });
      })
      .catch((e) => { if (!cancelled) setError(e?.message || c.saveError); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  const displayedTitle = editLang === "de" ? settings.title : gi(settings, "title", "title_i18n", editLang);
  const displayedSubtitle = editLang === "de" ? settings.subtitle : gi(settings, "subtitle", "subtitle_i18n", editLang);

  const handleSave = async () => {
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      // DE canonical text also lives inside title_i18n.de so storefront lookup stays uniform.
      const title_i18n = setI18n(settings.title_i18n, "title", "de", settings.title);
      const subtitle_i18n = setI18n(settings.subtitle_i18n, "subtitle", "de", settings.subtitle);
      const saved = await client.updateApiPageSettings(slug, {
        title_i18n,
        subtitle_i18n,
        max_items: settings.max_items,
        sort_mode: settings.sort_mode,
      });
      setSettings((prev) => ({ ...prev, title_i18n: saved?.title_i18n || title_i18n, subtitle_i18n: saved?.subtitle_i18n || subtitle_i18n }));
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      setError(e?.message || c.saveError);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Box paddingBlock="400"><Text as="p" tone="subdued">{c.loading}</Text></Box>;

  return (
    <BlockStack gap="400">
      <BlockStack gap="100">
        <Text as="h2" variant="headingSm">{pageLabel || c.title}</Text>
        <Text as="p" variant="bodySm" tone="subdued">{c.subtitle}</Text>
      </BlockStack>
      {error && <Banner tone="critical" onDismiss={() => setError("")}>{error}</Banner>}
      {saved && <Banner tone="success" onDismiss={() => setSaved(false)}>{c.saved}</Banner>}
      <Select label="Language" options={langOptions} value={editLang} onChange={setEditLang} />
      <TextField
        label={c.titleLabel}
        value={displayedTitle}
        onChange={(value) => {
          if (editLang === "de") { setSettings((prev) => ({ ...prev, title: value })); return; }
          setSettings((prev) => ({ ...prev, title_i18n: setI18n(prev.title_i18n, "title", editLang, value) }));
        }}
        autoComplete="off"
      />
      <TextField
        label={c.subtitleLabel}
        value={displayedSubtitle}
        onChange={(value) => {
          if (editLang === "de") { setSettings((prev) => ({ ...prev, subtitle: value })); return; }
          setSettings((prev) => ({ ...prev, subtitle_i18n: setI18n(prev.subtitle_i18n, "subtitle", editLang, value) }));
        }}
        autoComplete="off"
      />
      <InlineStack gap="400" wrap={false}>
        <div style={{ minWidth: 220 }}>
          <TextField
            label={c.maxItemsLabel}
            type="number"
            min={4}
            max={50}
            value={String(settings.max_items)}
            onChange={(value) => setSettings((prev) => ({ ...prev, max_items: Math.min(Math.max(parseInt(value, 10) || 20, 4), 50) }))}
            autoComplete="off"
          />
        </div>
        <div style={{ flex: 1, minWidth: 220 }}>
          <Select
            label={c.sortLabel}
            options={sortModeOptions}
            value={settings.sort_mode}
            onChange={(value) => setSettings((prev) => ({ ...prev, sort_mode: value }))}
          />
        </div>
      </InlineStack>
      <InlineStack align="end">
        <Button variant="primary" onClick={handleSave} loading={saving}>{c.save}</Button>
      </InlineStack>
    </BlockStack>
  );
}
