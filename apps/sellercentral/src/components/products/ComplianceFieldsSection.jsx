"use client";

import React, { useEffect, useState } from "react";
import { Text, TextField, Select, Banner, BlockStack, InlineStack } from "@shopify/polaris";
import { ProductSectionHeading, ProductSectionRule } from "@/components/products/ProductSection";
import InfoIconTooltip from "@/components/InfoIconTooltip";

/** Already rendered by static sections in ProductEditPage (base GPSR + WEEE/EPREL) — never duplicate here. */
const ALREADY_RENDERED_KEYS = new Set([
  "hersteller",
  "hersteller_information",
  "verantwortliche_person_information",
  "weee_number",
  "eprel_number",
]);

function pickI18n(dict, locale) {
  if (!dict || typeof dict !== "object") return "";
  return dict[locale] || dict.en || dict.de || "";
}

/**
 * Field groups (docs/HUKUKI.md): a resolved profile flattens its whole inheritance chain
 * (GPSR base → electronics/WEEE → EPREL, plus the DE marketplace overlay's suggested
 * fields like BattG/LUCID/Pfand) into one list — rendering that as a single undifferentiated
 * block mixes unrelated legal regimes under whichever profile's name happens to be deepest
 * (e.g. everything showing up under "EPREL" even though most fields aren't EPREL at all).
 * Each field_definitions entry carries a `group` (see compliance-profiles.json); this maps
 * that id to a subsection heading so EPREL/electrical/battery/packaging/etc. render separately.
 */
const GROUP_ORDER = [
  "eprel", "electrical", "battery", "packaging", "general",
  "cosmetics", "food", "toys", "textiles", "chemicals", "tobacco", "medical",
  "digital", "books", "custom", "other",
];
const GROUP_LABELS = {
  eprel: { de: "EPREL / Energieverbrauchskennzeichnung", en: "EPREL / energy labelling", tr: "EPREL / enerji etiketleme", fr: "EPREL / étiquetage énergétique", es: "EPREL / etiquetado energético", it: "EPREL / etichettatura energetica" },
  electrical: { de: "Elektro-Sicherheit (CE, WEEE, RoHS)", en: "Electrical safety (CE, WEEE, RoHS)", tr: "Elektrik güvenliği (CE, WEEE, RoHS)", fr: "Sécurité électrique (CE, DEEE, RoHS)", es: "Seguridad eléctrica (CE, RAEE, RoHS)", it: "Sicurezza elettrica (CE, RAEE, RoHS)" },
  battery: { de: "Batterien / Akkus", en: "Batteries / accumulators", tr: "Bataryalar / aküler", fr: "Batteries / accumulateurs", es: "Pilas / acumuladores", it: "Batterie / accumulatori" },
  packaging: { de: "Verpackung & Pfand", en: "Packaging & deposit", tr: "Ambalaj ve depozito", fr: "Emballage & consigne", es: "Envase y depósito", it: "Imballaggio e cauzione" },
  general: { de: "Verbrauchersicherheit", en: "Consumer safety", tr: "Tüketici güvenliği", fr: "Sécurité du consommateur", es: "Seguridad del consumidor", it: "Sicurezza del consumatore" },
  cosmetics: { de: "Kosmetik", en: "Cosmetics", tr: "Kozmetik", fr: "Cosmétiques", es: "Cosméticos", it: "Cosmetici" },
  food: { de: "Lebensmittel", en: "Food", tr: "Gıda", fr: "Denrées alimentaires", es: "Alimentos", it: "Alimenti" },
  toys: { de: "Spielzeug", en: "Toys", tr: "Oyuncaklar", fr: "Jouets", es: "Juguetes", it: "Giocattoli" },
  textiles: { de: "Textilien", en: "Textiles", tr: "Tekstil", fr: "Textiles", es: "Textiles", it: "Tessili" },
  chemicals: { de: "Chemikalien", en: "Chemicals", tr: "Kimyasallar", fr: "Produits chimiques", es: "Productos químicos", it: "Sostanze chimiche" },
  tobacco: { de: "Nikotinprodukte", en: "Nicotine products", tr: "Nikotin ürünleri", fr: "Produits nicotiniques", es: "Productos de nicotina", it: "Prodotti a base di nicotina" },
  medical: { de: "Medizinprodukt", en: "Medical device", tr: "Tıbbi cihaz", fr: "Dispositif médical", es: "Producto sanitario", it: "Dispositivo medico" },
  digital: { de: "Digitale Produkte", en: "Digital products", tr: "Dijital ürünler", fr: "Produits numériques", es: "Productos digitales", it: "Prodotti digitali" },
  books: { de: "Bücher", en: "Books", tr: "Kitaplar", fr: "Livres", es: "Libros", it: "Libri" },
  custom: { de: "Zusätzliche Anforderungen dieser Kategorie", en: "Additional requirements for this category", tr: "Bu kategori için ek gereksinimler", fr: "Exigences supplémentaires de cette catégorie", es: "Requisitos adicionales de esta categoría", it: "Requisiti aggiuntivi per questa categoria" },
  other: { de: "Weitere Angaben", en: "Other details", tr: "Diğer bilgiler", fr: "Autres informations", es: "Otros datos", it: "Altri dettagli" },
};

/**
 * Category-specific compliance fields (docs/HUKUKI.md Faz 3): fetches the
 * resolved profile for the product's category and renders any required/
 * optional fields not already covered by the static GPSR/WEEE/EPREL blocks.
 * Read-only w.r.t. save-blocking — never adds a hard block, only surfaces
 * category-specific fields via the existing getMeta/updateMeta metadata pattern.
 */
export default function ComplianceFieldsSection({ client, categoryId, marketplace = "DE", locale, product, getMeta, updateMeta, onResolved }) {
  const [schema, setSchema] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!categoryId) {
      setSchema(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    client
      .request(`/admin-hub/categories/${encodeURIComponent(categoryId)}/compliance-schema?marketplace=${encodeURIComponent(marketplace)}`)
      .then((data) => {
        if (!cancelled) setSchema(data);
      })
      .catch(() => {
        if (!cancelled) setSchema(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [client, categoryId, marketplace]);

  // Tells ProductEditPage's static WEEE/EPREL fields whether this category's resolved profile
  // actually calls for them — those fields used to render unconditionally for every product
  // (a phone bumper showing a WEEE registration number field makes no sense; WEEE only applies
  // to electrical/electronic equipment). While loading/no category, default both to true so an
  // existing saved value never gets hidden by a flash of "not applicable" before the fetch lands.
  useEffect(() => {
    if (!onResolved) return;
    if (loading || !schema) {
      onResolved({ weee: true, eprel: true });
      return;
    }
    const all = [...(schema.required_fields || []), ...(schema.optional_fields || [])];
    onResolved({ weee: all.includes("weee_number"), eprel: all.includes("eprel_number") });
  }, [schema, loading, onResolved]);

  if (loading || !schema) return null;

  const requiredKeys = (schema.required_fields || []).filter((k) => !ALREADY_RENDERED_KEYS.has(k));
  const optionalKeys = (schema.optional_fields || []).filter((k) => !ALREADY_RENDERED_KEYS.has(k) && !requiredKeys.includes(k));
  const extraKeys = [...requiredKeys, ...optionalKeys];
  if (extraKeys.length === 0) return null;

  const fieldDefs = schema.field_definitions || {};
  const optionalWord = pickI18n({
    de: "optional",
    en: "optional",
    tr: "isteğe bağlı",
    fr: "facultatif",
    es: "opcional",
    it: "facoltativo",
  }, locale);
  const LABEL_LANGUAGE_NAMES = {
    de: pickI18n({ de: "Deutsch", en: "German", tr: "Almanca", fr: "allemand", es: "alemán", it: "tedesco" }, locale),
    fr: pickI18n({ de: "Französisch", en: "French", tr: "Fransızca", fr: "français", es: "francés", it: "francese" }, locale),
    it: pickI18n({ de: "Italienisch", en: "Italian", tr: "İtalyanca", fr: "italien", es: "italiano", it: "italiano" }, locale),
    es: pickI18n({ de: "Spanisch", en: "Spanish", tr: "İspanyolca", fr: "espagnol", es: "español", it: "spagnolo" }, locale),
    nl: pickI18n({ de: "Niederländisch", en: "Dutch", tr: "Flemenkçe", fr: "néerlandais", es: "neerlandés", it: "olandese" }, locale),
    pl: pickI18n({ de: "Polnisch", en: "Polish", tr: "Lehçe", fr: "polonais", es: "polaco", it: "polacco" }, locale),
    sv: pickI18n({ de: "Schwedisch", en: "Swedish", tr: "İsveççe", fr: "suédois", es: "sueco", it: "svedese" }, locale),
  };
  const labelLanguageName = schema.label_language ? LABEL_LANGUAGE_NAMES[schema.label_language] : null;
  const labelLanguageNotice = labelLanguageName
    ? pickI18n({
        de: `Für diesen Marktplatz muss die Produktbeschriftung auf ${labelLanguageName} vorliegen.`,
        en: `For this marketplace, the product label must be in ${labelLanguageName}.`,
        tr: `Bu pazar yeri için ürün etiketi ${labelLanguageName} dilinde olmalıdır.`,
        fr: `Pour cette place de marché, l'étiquetage du produit doit être en ${labelLanguageName}.`,
        es: `Para este mercado, el etiquetado del producto debe estar en ${labelLanguageName}.`,
        it: `Per questo mercato, l'etichettatura del prodotto deve essere in ${labelLanguageName}.`,
      }, locale)
    : null;

  const sectionIntro = pickI18n({
    de: "Felder für diese Produktkategorie (EU-Produktsicherheit), gruppiert nach Thema. Pflichtfelder müssen ausgefüllt werden; optionale Felder helfen Kunden und Behörden. Tippen Sie auf „i“ für eine kurze Erklärung.",
    en: "Fields for this product category (EU product safety), grouped by topic. Required fields must be filled; optional ones help customers and authorities. Tap “i” for a short explanation.",
    tr: "Bu ürün kategorisi için alanlar (AB ürün güvenliği), konuya göre gruplandırılmıştır. Zorunlu alanlar doldurulmalı; isteğe bağlı alanlar müşteri ve otoritelere yardımcı olur. Kısa açıklama için “i”ye tıklayın.",
    fr: "Champs pour cette catégorie (sécurité produit UE), groupés par thème. Les champs obligatoires doivent être remplis ; les facultatifs aident clients et autorités. Appuyez sur « i » pour une courte explication.",
    es: "Campos para esta categoría (seguridad de producto UE), agrupados por tema. Los obligatorios deben rellenarse; los opcionales ayudan a clientes y autoridades. Pulsa « i » para una breve explicación.",
    it: "Campi per questa categoria (sicurezza prodotto UE), raggruppati per argomento. I campi obbligatori vanno compilati; quelli facoltativi aiutano clienti e autorità. Tocca « i » per una breve spiegazione.",
  }, locale);

  // extraKeys mixes fields inherited from multiple legal regimes at once (e.g. a category on the
  // EPREL profile also carries the WEEE/CE fields it inherits from, plus DE-overlay suggestions
  // like BattG/LUCID/Pfand) — bucket by each field's `group` so the UI doesn't file all of that
  // under a single misleading heading (see GROUP_ORDER/GROUP_LABELS above).
  const groupedKeys = new Map();
  for (const key of extraKeys) {
    const def = fieldDefs[key];
    const group = (def && def.group) || "other";
    if (!groupedKeys.has(group)) groupedKeys.set(group, []);
    groupedKeys.get(group).push(key);
  }
  const orderedGroups = GROUP_ORDER.filter((g) => groupedKeys.has(g));
  for (const g of groupedKeys.keys()) {
    if (!orderedGroups.includes(g)) orderedGroups.push(g);
  }

  const pageHeading = pickI18n({
    de: "Kategorie-spezifische Pflichtangaben",
    en: "Category-specific compliance fields",
    tr: "Kategoriye özel zorunlu bilgiler",
    fr: "Champs de conformité spécifiques à la catégorie",
    es: "Campos de cumplimiento específicos de la categoría",
    it: "Campi di conformità specifici della categoria",
  }, locale);

  return (
    <>
      <ProductSectionRule />
      <ProductSectionHeading>{pageHeading}</ProductSectionHeading>
      {schema.superuser_only ? (
        <Banner tone="warning">
          {locale === "en"
            ? "This product category requires superuser approval before publishing."
            : locale === "tr"
              ? "Bu ürün kategorisi yayınlanmadan önce süper kullanıcı onayı gerektirir."
              : locale === "fr"
                ? "Cette catégorie de produit nécessite une approbation superuser avant publication."
                : locale === "es"
                  ? "Esta categoría de producto requiere aprobación de superusuario antes de publicarse."
                  : locale === "it"
                    ? "Questa categoria di prodotto richiede l'approvazione del superuser prima della pubblicazione."
                    : "Diese Produktkategorie erfordert vor der Veröffentlichung eine Superuser-Freigabe."}
        </Banner>
      ) : null}
      <Text as="p" variant="bodySm" tone="subdued">
        {sectionIntro}
      </Text>
      {labelLanguageNotice ? <Banner tone="info">{labelLanguageNotice}</Banner> : null}
      <BlockStack gap="400">
        {orderedGroups.map((groupId) => (
          <BlockStack key={groupId} gap="300">
            <Text as="h3" variant="headingXs" tone="subdued">
              {pickI18n(GROUP_LABELS[groupId], locale) || groupId}
            </Text>
            {groupedKeys.get(groupId).map((key) => {
              const def = fieldDefs[key] || { type: "text", label_i18n: {}, help_text_i18n: {} };
              const baseLabel = pickI18n(def.label_i18n, locale) || key;
              const helpText = pickI18n(def.help_text_i18n, locale);
              const isRequired = requiredKeys.includes(key);
              const label = isRequired ? baseLabel : `${baseLabel} (${optionalWord})`;
              const value = getMeta(product, key) || "";

              const labelNode = (
                <InlineStack gap="200" blockAlign="center" wrap={false}>
                  <span>{label}</span>
                  <InfoIconTooltip text={helpText} />
                </InlineStack>
              );

              if (def.type === "select" && Array.isArray(def.options)) {
                return (
                  <Select
                    key={key}
                    label={labelNode}
                    requiredIndicator={isRequired}
                    options={[{ label: "—", value: "" }, ...def.options.map((o) => ({ label: o, value: o }))]}
                    value={value}
                    onChange={(v) => updateMeta(key, v || null)}
                  />
                );
              }

              return (
                <TextField
                  key={key}
                  label={labelNode}
                  requiredIndicator={isRequired}
                  value={value}
                  onChange={(v) => updateMeta(key, v || null)}
                  type={def.type === "number" ? "number" : "text"}
                  placeholder={def.type === "file" ? "https://…" : undefined}
                  autoComplete="off"
                  multiline={
                    def.type === "text" &&
                    (key.endsWith("_list") ||
                      key === "ingredients" ||
                      key === "nutrition_values" ||
                      key === "safety_warnings" ||
                      key === "recall_procedure")
                      ? 3
                      : undefined
                  }
                />
              );
            })}
          </BlockStack>
        ))}
      </BlockStack>
    </>
  );
}
