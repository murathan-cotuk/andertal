"use client";

import { useEffect, useMemo, useState } from "react";
import { BlockStack, InlineStack, Text, Box, Button, Banner, Badge, Divider } from "@shopify/polaris";
import { useLocale } from "next-intl";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";
import { pdpElementsByColumn, pdpElementLabel, pdpReorderGroups, pdpOrderedKeys } from "@andertal/shop-theme";

const PRODUCT_PAGE_ID = "__product_page__";

const COPY = {
  de: {
    title: "Produktseite",
    subtitle:
      "Die Produktseite im Shop behält ihr festes Layout (Galerie · Info · Buybox). Hier schaltest du einzelne Elemente sichtbar oder verborgen. Alles ist standardmäßig sichtbar.",
    columns: { gallery: "Galerie (links)", info: "Info (Mitte)", buybox: "Buybox (rechts)" },
    always: "immer sichtbar",
    on: "Sichtbar",
    off: "Verborgen",
    save: "Speichern",
    saving: "Speichern…",
    saved: "Gespeichert.",
    loading: "Lädt…",
    error: "Speichern fehlgeschlagen",
    hiddenCount: (n) => `${n} Element${n === 1 ? "" : "e"} verborgen`,
  },
  tr: {
    title: "Ürün sayfası",
    subtitle:
      "Shoptaki ürün sayfası sabit düzenini korur (Galeri · Bilgi · Buybox). Buradan tek tek öğeleri görünür veya gizli yaparsın. Hepsi varsayılan olarak görünür.",
    columns: { gallery: "Galeri (sol)", info: "Bilgi (orta)", buybox: "Buybox (sağ)" },
    always: "her zaman görünür",
    on: "Görünür",
    off: "Gizli",
    save: "Kaydet",
    saving: "Kaydediliyor…",
    saved: "Kaydedildi.",
    loading: "Yükleniyor…",
    error: "Kaydetme başarısız",
    hiddenCount: (n) => `${n} öğe gizli`,
  },
  en: {
    title: "Product page",
    subtitle:
      "The shop product page keeps its fixed layout (Gallery · Info · Buybox). Here you switch individual elements visible or hidden. Everything is visible by default.",
    columns: { gallery: "Gallery (left)", info: "Info (centre)", buybox: "Buybox (right)" },
    always: "always visible",
    on: "Visible",
    off: "Hidden",
    save: "Save",
    saving: "Saving…",
    saved: "Saved.",
    loading: "Loading…",
    error: "Save failed",
    hiddenCount: (n) => `${n} element${n === 1 ? "" : "s"} hidden`,
  },
};

export default function ProductPageSettingsPanel() {
  const locale = useLocale();
  const c = COPY[locale] || COPY.en;
  const client = useMemo(() => getMedusaAdminClient(), []);
  const columns = useMemo(() => pdpElementsByColumn(), []);
  const reorderGroups = useMemo(() => pdpReorderGroups(), []); // { groupName: [defaultKey, ...] }
  const groupOfKey = useMemo(() => {
    const m = {};
    for (const [g, keys] of Object.entries(reorderGroups)) for (const k of keys) m[k] = g;
    return m;
  }, [reorderGroups]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  // { <key>: false } — absence = visible
  const [elements, setElements] = useState({});
  // { <reorderGroup>: [key, ...] } — absence = natural order
  const [order, setOrder] = useState({});
  const [containers, setContainers] = useState([]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    client
      .request(`/admin-hub/landing-page/${PRODUCT_PAGE_ID}`)
      .then((data) => {
        if (cancelled) return;
        const s = data && typeof data.settings === "object" && data.settings ? data.settings : {};
        setElements(s.elements && typeof s.elements === "object" ? s.elements : {});
        setOrder(s.order && typeof s.order === "object" ? s.order : {});
        setContainers(Array.isArray(data?.containers) ? data.containers : []);
      })
      .catch((e) => {
        if (!cancelled) setError(e?.message || c.error);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [client]);

  const isVisible = (key) => elements[key] !== false;
  const toggle = (key) => {
    setSaved(false);
    setElements((prev) => {
      const next = { ...prev };
      if (next[key] === false) delete next[key];
      else next[key] = false;
      return next;
    });
  };

  const hiddenCount = Object.values(elements).filter((v) => v === false).length;

  /** Current ordered key list for a reorder group. */
  const groupOrder = (g) => pdpOrderedKeys({ order }, g, reorderGroups[g] || []);
  const moveInGroup = (key, dir) => {
    const g = groupOfKey[key];
    if (!g) return;
    setSaved(false);
    setOrder((prev) => {
      const cur = pdpOrderedKeys({ order: prev }, g, reorderGroups[g] || []);
      const i = cur.indexOf(key);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= cur.length) return prev;
      const next = [...cur];
      [next[i], next[j]] = [next[j], next[i]];
      return { ...prev, [g]: next };
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      await client.request(`/admin-hub/landing-page/${PRODUCT_PAGE_ID}`, {
        method: "PUT",
        body: JSON.stringify({ containers, settings: { elements, order } }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      setError(e?.message || c.error);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Box padding="400">
        <Text as="p" tone="subdued">{c.loading}</Text>
      </Box>
    );
  }

  return (
    <BlockStack gap="400">
      <BlockStack gap="150">
        <InlineStack gap="200" blockAlign="center">
          <Text as="h2" variant="headingMd">{c.title}</Text>
          {hiddenCount > 0 && <Badge tone="attention">{c.hiddenCount(hiddenCount)}</Badge>}
        </InlineStack>
        <Text as="p" variant="bodySm" tone="subdued">{c.subtitle}</Text>
      </BlockStack>

      {error && <Banner tone="critical" onDismiss={() => setError("")}>{error}</Banner>}
      {saved && <Banner tone="success" onDismiss={() => setSaved(false)}>{c.saved}</Banner>}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: 16,
          alignItems: "start",
        }}
      >
        {columns.map(({ column, elements: rawEls }) => {
          // Re-slot reorder-group members into their saved order; fixed elements keep their position.
          const groupIters = {};
          for (const g of Object.keys(reorderGroups)) groupIters[g] = groupOrder(g).slice();
          const els = rawEls.map((el) => {
            const g = groupOfKey[el.key];
            if (!g) return el;
            const nextKey = groupIters[g].shift();
            return rawEls.find((e) => e.key === nextKey) || el;
          });
          return (
          <div
            key={column}
            style={{
              border: "1px solid var(--p-color-border)",
              borderRadius: 10,
              overflow: "hidden",
              background: "var(--p-color-bg-surface)",
            }}
          >
            <div
              style={{
                padding: "8px 12px",
                background: "var(--p-color-bg-surface-secondary)",
                borderBottom: "1px solid var(--p-color-border)",
                fontSize: 12,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: ".04em",
                color: "var(--p-color-text-subdued)",
              }}
            >
              {c.columns[column] || column}
            </div>
            <BlockStack gap="0">
              {els.map((el, i) => {
                const visible = isVisible(el.key);
                const g = groupOfKey[el.key];
                const gList = g ? groupOrder(g) : null;
                const gPos = gList ? gList.indexOf(el.key) : -1;
                return (
                  <div key={el.key}>
                    {i > 0 && <Divider />}
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "10px 12px",
                      }}
                    >
                      <span
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: "50%",
                          flexShrink: 0,
                          background: el.locked || visible ? "#22c55e" : "#ef4444",
                        }}
                      />
                      <span style={{ flex: 1, fontSize: 13, color: "var(--p-color-text)" }}>
                        {pdpElementLabel(el.key, locale)}
                      </span>
                      {g && (
                        <span style={{ display: "inline-flex", gap: 2 }}>
                          <Button size="micro" variant="tertiary" disabled={gPos <= 0}
                            onClick={() => moveInGroup(el.key, -1)} accessibilityLabel="Move up">↑</Button>
                          <Button size="micro" variant="tertiary" disabled={gPos < 0 || gPos >= gList.length - 1}
                            onClick={() => moveInGroup(el.key, 1)} accessibilityLabel="Move down">↓</Button>
                        </span>
                      )}
                      {el.locked ? (
                        <Text as="span" variant="bodyXs" tone="subdued">{c.always}</Text>
                      ) : (
                        <Button
                          size="slim"
                          pressed={visible}
                          onClick={() => toggle(el.key)}
                        >
                          {visible ? c.on : c.off}
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </BlockStack>
          </div>
          );
        })}
      </div>

      <Text as="p" variant="bodyXs" tone="subdued">
        {locale === "tr"
          ? "↑ ↓ okları yalnızca yan yana durabilen öğeleri (galeri aksiyon butonları; buybox’ta satıcı/kargo/iade satırları) birbirine göre sıralar. Diğer öğeler shoptaki sabit yerinde kalır."
          : locale === "de"
            ? "Die Pfeile ↑ ↓ ordnen nur benachbarte Elemente (Galerie-Buttons; im Buybox die Zeilen Verkäufer/Versand/Rückgabe). Alle anderen Elemente bleiben an ihrer festen Position im Shop."
            : "The ↑ ↓ arrows only reorder adjacent items (gallery action buttons; the seller / shipping / return rows in the buybox). Every other element stays in its fixed shop position."}
      </Text>

      <InlineStack>
        <Button variant="primary" onClick={handleSave} loading={saving} disabled={saving}>
          {saving ? c.saving : c.save}
        </Button>
      </InlineStack>
    </BlockStack>
  );
}
