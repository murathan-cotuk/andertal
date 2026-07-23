"use client";

import React, { useEffect, useState } from "react";
import { Text, TextField, Select, Banner, BlockStack } from "@shopify/polaris";
import { ProductSectionHeading, ProductSectionRule } from "@/components/products/ProductSection";

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

  return (
    <>
      <ProductSectionRule />
      <ProductSectionHeading>{schema.profile_label || "Compliance"}</ProductSectionHeading>
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
        {locale === "en"
          ? "Additional fields required for this product category (EU product safety / GPSR)."
          : locale === "tr"
            ? "Bu ürün kategorisi için gereken ek alanlar (AB ürün güvenliği / GPSR)."
            : locale === "fr"
              ? "Champs supplémentaires requis pour cette catégorie de produit (sécurité produit UE / GPSR)."
              : locale === "es"
                ? "Campos adicionales requeridos para esta categoría de producto (seguridad de producto UE / GPSR)."
                : locale === "it"
                  ? "Campi aggiuntivi richiesti per questa categoria di prodotto (sicurezza prodotto UE / GPSR)."
                  : "Zusätzliche Felder für diese Produktkategorie (EU-Produktsicherheit / GPSR)."}
      </Text>
      <BlockStack gap="300">
        {extraKeys.map((key) => {
          const def = fieldDefs[key] || { type: "text", label_i18n: {}, help_text_i18n: {} };
          const label = pickI18n(def.label_i18n, locale) || key;
          const helpText = pickI18n(def.help_text_i18n, locale);
          const isRequired = requiredKeys.includes(key);
          const value = getMeta(product, key) || "";

          if (def.type === "select" && Array.isArray(def.options)) {
            return (
              <Select
                key={key}
                label={label}
                requiredIndicator={isRequired}
                options={[{ label: "—", value: "" }, ...def.options.map((o) => ({ label: o, value: o }))]}
                value={value}
                onChange={(v) => updateMeta(key, v || null)}
                helpText={helpText || undefined}
              />
            );
          }

          return (
            <TextField
              key={key}
              label={label}
              requiredIndicator={isRequired}
              value={value}
              onChange={(v) => updateMeta(key, v || null)}
              type={def.type === "number" ? "number" : "text"}
              placeholder={def.type === "file" ? "https://…" : undefined}
              helpText={helpText || undefined}
              autoComplete="off"
              multiline={def.type === "text" && (key.endsWith("_list") || key === "ingredients" || key === "nutrition_values") ? 2 : undefined}
            />
          );
        })}
      </BlockStack>
    </>
  );
}
