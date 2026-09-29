"use client";

/**
 * Editors for the "Warmer Marktplatz" landing containers:
 *  - promo_bento: campaign tile (badge, headline, text, 2 buttons, image or 4-image collage) + 2 side tiles
 *  - category_circles: round category tiles, automatic from the catalog or picked by hand
 * Text fields are per language (editLang), like every other landing container.
 */

import { useState } from "react";
import { BlockStack, Button, Card, Divider, InlineStack, Select, Text, TextField } from "@shopify/polaris";
import { useLocale } from "next-intl";
import MediaPickerModal from "@/components/MediaPickerModal";

function gi(obj, field, lang) {
  if (!lang || lang === "de") return obj?.[field] ?? "";
  return obj?._i18n?.[lang]?.[field] ?? obj?.[field] ?? "";
}

function si(obj, field, lang, value) {
  if (!lang || lang === "de") return { ...obj, [field]: value };
  const i18n = { ...(obj?._i18n || {}) };
  i18n[lang] = { ...(i18n[lang] || {}), [field]: value };
  return { ...obj, _i18n: i18n };
}

function useL() {
  const loc = String(useLocale() || "de").slice(0, 2);
  return (de, en, tr) => (loc === "de" ? de : loc === "tr" ? tr || en : en);
}

const GRID = { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 };

function ColorInput({ label, value, onChange }) {
  return (
    <TextField
      label={label}
      value={value || ""}
      onChange={onChange}
      autoComplete="off"
      prefix={<span style={{ display: "block", width: 16, height: 16, borderRadius: 3, background: value || "#ffffff", border: "1px solid var(--p-color-border)" }} />}
    />
  );
}

function ImagePick({ label, value, onPick, onClear, L }) {
  return (
    <BlockStack gap="150">
      <Text as="span" variant="bodyMd" fontWeight="medium">{label}</Text>
      <InlineStack gap="300" blockAlign="center">
        {value ? (
          <img src={value} alt="" style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 8, border: "1px solid var(--p-color-border)" }} />
        ) : (
          <div style={{ width: 72, height: 72, borderRadius: 8, border: "1px dashed var(--p-color-border)" }} />
        )}
        <InlineStack gap="200">
          <Button size="slim" onClick={onPick}>{value ? L("Ändern", "Change", "Değiştir") : L("Bild wählen", "Select image", "Görsel seç")}</Button>
          {value ? <Button size="slim" tone="critical" onClick={onClear}>{L("Entfernen", "Remove", "Kaldır")}</Button> : null}
        </InlineStack>
      </InlineStack>
    </BlockStack>
  );
}

const DEFAULT_TILES = [
  { eyebrow: "Sale", title: "Bis zu −50 %", subtitle: "auf ausgewählte Marken", link: "/sale", bg_color: "#1D1B18", text_color: "#FFFFFF", eyebrow_color: "#EE8A12" },
  { eyebrow: "Neuheiten", title: "Frisch eingetroffen", subtitle: "Alle ansehen", link: "/neuheiten", bg_color: "#DCE3D6", text_color: "#1D1B18", eyebrow_color: "#2F5A36", arrow: true },
];

export function PromoBentoEditor({ container, onChange, editLang = "de" }) {
  const L = useL();
  const [picker, setPicker] = useState(null);
  const tiles = Array.isArray(container.tiles) && container.tiles.length ? container.tiles : DEFAULT_TILES;
  const images = Array.isArray(container.images) ? container.images : [];
  const setTile = (idx, next) => onChange({ ...container, tiles: tiles.map((t, i) => (i === idx ? next : t)) });
  const setImage = (idx, url) => {
    const next = [0, 1, 2, 3].map((i) => images[i] || { url: "" });
    next[idx] = { ...next[idx], url };
    onChange({ ...container, images: next });
  };

  const onPicked = (url) => {
    if (!picker) return;
    if (picker.kind === "bg") onChange({ ...container, bg_image: url });
    else if (picker.kind === "collage") setImage(picker.idx, url);
    else if (picker.kind === "tile") setTile(picker.idx, { ...tiles[picker.idx], image: url });
    setPicker(null);
  };

  return (
    <BlockStack gap="400">
      <Card>
        <BlockStack gap="300">
          <Text as="h3" variant="headingSm">{L("Kampagnen-Kachel", "Campaign tile", "Kampanya kutusu")}</Text>
          <TextField label={L("Badge", "Badge", "Rozet")} value={gi(container, "badge", editLang)} onChange={(v) => onChange(si(container, "badge", editLang, v))} autoComplete="off" />
          <TextField label={L("Überschrift", "Headline", "Başlık")} value={gi(container, "title", editLang)} onChange={(v) => onChange(si(container, "title", editLang, v))} autoComplete="off" multiline={2} />
          <TextField label={L("Text", "Text", "Metin")} value={gi(container, "text", editLang)} onChange={(v) => onChange(si(container, "text", editLang, v))} autoComplete="off" multiline={3} />
          <div style={GRID}>
            <TextField label={L("Button 1 Text", "Button 1 text", "Buton 1 metni")} value={gi(container, "btn_text", editLang)} onChange={(v) => onChange(si(container, "btn_text", editLang, v))} autoComplete="off" />
            <TextField label={L("Button 1 Link", "Button 1 link", "Buton 1 linki")} value={container.btn_url || ""} onChange={(v) => onChange({ ...container, btn_url: v })} autoComplete="off" placeholder="/neuheiten" />
            <TextField label={L("Button 2 Text", "Button 2 text", "Buton 2 metni")} value={gi(container, "btn2_text", editLang)} onChange={(v) => onChange(si(container, "btn2_text", editLang, v))} autoComplete="off" />
            <TextField label={L("Button 2 Link", "Button 2 link", "Buton 2 linki")} value={container.btn2_url || ""} onChange={(v) => onChange({ ...container, btn2_url: v })} autoComplete="off" placeholder="/verkaufen" />
            <ColorInput label={L("Hintergrund", "Background", "Arka plan")} value={container.bg_color || "#FCEBD5"} onChange={(v) => onChange({ ...container, bg_color: v })} />
            <ColorInput label={L("Textfarbe", "Text color", "Metin rengi")} value={container.text_color || "#1D1B18"} onChange={(v) => onChange({ ...container, text_color: v })} />
          </div>
          <Divider />
          <ImagePick
            L={L}
            label={L("Hintergrundbild (optional, ersetzt die Collage)", "Background image (optional, replaces the collage)", "Arka plan görseli (opsiyonel, kolajın yerine)")}
            value={container.bg_image || ""}
            onPick={() => setPicker({ kind: "bg" })}
            onClear={() => onChange({ ...container, bg_image: "" })}
          />
          <Text as="p" variant="bodySm" tone="subdued">{L("Collage: bis zu 4 Bilder rechts in der Kachel", "Collage: up to 4 images on the right of the tile", "Kolaj: kutunun sağında en fazla 4 görsel")}</Text>
          <div style={GRID}>
            {[0, 1, 2, 3].map((i) => (
              <ImagePick
                key={i}
                L={L}
                label={`${L("Bild", "Image", "Görsel")} ${i + 1}`}
                value={images[i]?.url || ""}
                onPick={() => setPicker({ kind: "collage", idx: i })}
                onClear={() => setImage(i, "")}
              />
            ))}
          </div>
        </BlockStack>
      </Card>

      {tiles.slice(0, 2).map((t, idx) => (
        <Card key={idx}>
          <BlockStack gap="300">
            <Text as="h3" variant="headingSm">{L("Seitenkachel", "Side tile", "Yan kutu")} {idx + 1}</Text>
            <div style={GRID}>
              <TextField label={L("Kleine Überschrift", "Eyebrow", "Üst başlık")} value={gi(t, "eyebrow", editLang)} onChange={(v) => setTile(idx, si(t, "eyebrow", editLang, v))} autoComplete="off" />
              <TextField label={L("Titel", "Title", "Başlık")} value={gi(t, "title", editLang)} onChange={(v) => setTile(idx, si(t, "title", editLang, v))} autoComplete="off" />
              <TextField label={L("Untertitel", "Subtitle", "Alt başlık")} value={gi(t, "subtitle", editLang)} onChange={(v) => setTile(idx, si(t, "subtitle", editLang, v))} autoComplete="off" />
              <TextField label={L("Link", "Link", "Link")} value={t.link || ""} onChange={(v) => setTile(idx, { ...t, link: v })} autoComplete="off" placeholder="/sale" />
              <ColorInput label={L("Hintergrund", "Background", "Arka plan")} value={t.bg_color || ""} onChange={(v) => setTile(idx, { ...t, bg_color: v })} />
              <ColorInput label={L("Textfarbe", "Text color", "Metin rengi")} value={t.text_color || ""} onChange={(v) => setTile(idx, { ...t, text_color: v })} />
              <ColorInput label={L("Farbe kleine Überschrift", "Eyebrow color", "Üst başlık rengi")} value={t.eyebrow_color || ""} onChange={(v) => setTile(idx, { ...t, eyebrow_color: v })} />
              <Select
                label={L("Pfeil nach Untertitel", "Arrow after subtitle", "Alt başlıktan sonra ok")}
                options={[{ label: L("Nein", "No", "Hayır"), value: "no" }, { label: L("Ja", "Yes", "Evet"), value: "yes" }]}
                value={t.arrow ? "yes" : "no"}
                onChange={(v) => setTile(idx, { ...t, arrow: v === "yes" })}
              />
            </div>
            <ImagePick
              L={L}
              label={L("Hintergrundbild (optional)", "Background image (optional)", "Arka plan görseli (opsiyonel)")}
              value={t.image || ""}
              onPick={() => setPicker({ kind: "tile", idx })}
              onClear={() => setTile(idx, { ...t, image: "" })}
            />
          </BlockStack>
        </Card>
      ))}

      {picker ? (
        <MediaPickerModal open multiple={false} onClose={() => setPicker(null)} onSelect={(urls) => { if (urls?.[0]) onPicked(urls[0]); else setPicker(null); }} />
      ) : null}
    </BlockStack>
  );
}

export function CategoryCirclesEditor({ container, onChange, editLang = "de" }) {
  const L = useL();
  const [pickerIdx, setPickerIdx] = useState(null);
  const items = Array.isArray(container.items) ? container.items : [];
  const setItem = (idx, next) => onChange({ ...container, items: items.map((it, i) => (i === idx ? next : it)) });
  const manual = container.source === "manual";

  return (
    <BlockStack gap="400">
      <Card>
        <BlockStack gap="300">
          <Text as="h3" variant="headingSm">{L("Kategorie-Kreise", "Category circles", "Kategori daireleri")}</Text>
          <div style={GRID}>
            <TextField label={L("Überschrift", "Heading", "Başlık")} value={gi(container, "title", editLang)} onChange={(v) => onChange(si(container, "title", editLang, v))} autoComplete="off" />
            <TextField label={L("Link-Text rechts", "Link text (right)", "Sağdaki link metni")} value={gi(container, "link_text", editLang)} onChange={(v) => onChange(si(container, "link_text", editLang, v))} autoComplete="off" />
            <TextField label={L("Link-Ziel", "Link target", "Link hedefi")} value={container.link_url || ""} onChange={(v) => onChange({ ...container, link_url: v })} autoComplete="off" placeholder="/kategorien" />
            <Select
              label={L("Quelle", "Source", "Kaynak")}
              options={[
                { label: L("Automatisch: Hauptkategorien", "Automatic: top-level categories", "Otomatik: ana kategoriler"), value: "catalog" },
                { label: L("Von Hand", "Manual", "Elle"), value: "manual" },
              ]}
              value={manual ? "manual" : "catalog"}
              onChange={(v) => onChange({ ...container, source: v })}
            />
            <Select
              label={L("Anzahl", "Count", "Adet")}
              options={[4, 5, 6, 8, 10, 12].map((n) => ({ label: String(n), value: String(n) }))}
              value={String(container.max_items || 6)}
              onChange={(v) => onChange({ ...container, max_items: Number(v) })}
            />
          </div>
          <Text as="p" variant="bodySm" tone="subdued">
            {L(
              "Automatisch nutzt die Kategoriebilder aus dem Katalog; ohne Bild erscheint ein farbiger Kreis.",
              "Automatic uses the category images from the catalog; without an image a coloured circle is shown.",
              "Otomatik mod katalogdaki kategori görsellerini kullanır; görsel yoksa renkli daire gösterilir.",
            )}
          </Text>
        </BlockStack>
      </Card>

      {manual ? (
        <>
          {items.map((it, idx) => (
            <Card key={idx}>
              <BlockStack gap="300">
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="h3" variant="headingSm">{L("Kreis", "Circle", "Daire")} {idx + 1}</Text>
                  <Button size="slim" tone="critical" onClick={() => onChange({ ...container, items: items.filter((_, i) => i !== idx) })}>{L("Entfernen", "Remove", "Kaldır")}</Button>
                </InlineStack>
                <div style={GRID}>
                  <TextField label={L("Name", "Label", "İsim")} value={gi(it, "label", editLang)} onChange={(v) => setItem(idx, si(it, "label", editLang, v))} autoComplete="off" />
                  <TextField label={L("Link", "Link", "Link")} value={it.link || ""} onChange={(v) => setItem(idx, { ...it, link: v })} autoComplete="off" placeholder="/haus-garten" />
                </div>
                <ImagePick L={L} label={L("Bild", "Image", "Görsel")} value={it.image || ""} onPick={() => setPickerIdx(idx)} onClear={() => setItem(idx, { ...it, image: "" })} />
              </BlockStack>
            </Card>
          ))}
          <InlineStack>
            <Button onClick={() => onChange({ ...container, items: [...items, { label: "", link: "", image: "" }] })}>{L("Kreis hinzufügen", "Add circle", "Daire ekle")}</Button>
          </InlineStack>
        </>
      ) : null}

      {pickerIdx != null ? (
        <MediaPickerModal
          open
          multiple={false}
          onClose={() => setPickerIdx(null)}
          onSelect={(urls) => {
            if (urls?.[0]) setItem(pickerIdx, { ...items[pickerIdx], image: urls[0] });
            setPickerIdx(null);
          }}
        />
      ) : null}
    </BlockStack>
  );
}
