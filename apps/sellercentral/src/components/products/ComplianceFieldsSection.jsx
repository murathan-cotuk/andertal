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
 * Category-specific compliance fields (docs/HUKUKI.md Faz 3): fetches the
 * resolved profile for the product's category and renders any required/
 * optional fields not already covered by the static GPSR/WEEE/EPREL blocks.
 * Read-only w.r.t. save-blocking — never adds a hard block, only surfaces
 * category-specific fields via the existing getMeta/updateMeta metadata pattern.
 */
export default function ComplianceFieldsSection({ client, categoryId, marketplace = "DE", locale, product, getMeta, updateMeta }) {
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
  const profileTitle =
    pickI18n(schema.profile_label_i18n, locale) || schema.profile_label || "Compliance";

  const sectionIntro = pickI18n({
    de: "Felder für diese Produktkategorie (EU-Produktsicherheit). Pflichtfelder müssen ausgefüllt werden; optionale Felder helfen Kunden und Behörden. Tippen Sie auf „i“ für eine kurze Erklärung.",
    en: "Fields for this product category (EU product safety). Required fields must be filled; optional ones help customers and authorities. Tap “i” for a short explanation.",
    tr: "Bu ürün kategorisi için alanlar (AB ürün güvenliği). Zorunlu alanlar doldurulmalı; isteğe bağlı alanlar müşteri ve otoritelere yardımcı olur. Kısa açıklama için “i”ye tıklayın.",
    fr: "Champs pour cette catégorie (sécurité produit UE). Les champs obligatoires doivent être remplis ; les facultatifs aident clients et autorités. Appuyez sur « i » pour une courte explication.",
    es: "Campos para esta categoría (seguridad de producto UE). Los obligatorios deben rellenarse; los opcionales ayudan a clientes y autoridades. Pulsa « i » para una breve explicación.",
    it: "Campi per questa categoria (sicurezza prodotto UE). I campi obbligatori vanno compilati; quelli facoltativi aiutano clienti e autorità. Tocca « i » per una breve spiegazione.",
  }, locale);

  return (
    <>
      <ProductSectionRule />
      <ProductSectionHeading>{profileTitle}</ProductSectionHeading>
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
      <BlockStack gap="300">
        {extraKeys.map((key) => {
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
    </>
  );
}
