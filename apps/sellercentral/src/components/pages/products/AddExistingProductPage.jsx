"use client";

import React, { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import {
  Page,
  Card,
  BlockStack,
  InlineStack,
  Text,
  TextField,
  Button,
  Banner,
  Divider,
  Box,
} from "@shopify/polaris";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";

function t(en, tr, de) {
  return { en, tr, de };
}

const copy = {
  title: t("Add Existing Product", "Mevcut Ürün Ekle", "Bestehendes Produkt hinzufügen"),
  subtitle: t(
    "Search for an existing product in the catalog by EAN, product ID, or shop link. The form will be pre-filled with the product's data — add your own price, SKU, and shipping details.",
    "EAN, ürün kimliği veya shop linki ile mevcut bir ürünü kataloğda ara. Form ürün verileriyle doldurulur — kendi fiyatını, SKU'nu ve kargo bilgilerini ekle.",
    "Suche ein bestehendes Produkt im Katalog per EAN, Produkt-ID oder Shop-Link. Das Formular wird mit den Produktdaten vorausgefüllt — füge deinen eigenen Preis, SKU und Versanddetails hinzu.",
  ),
  eanLabel: t("EAN / Barcode", "EAN / Barkod", "EAN / Barcode"),
  eanPlaceholder: t("e.g. 4012345678901", "örn. 4012345678901", "z. B. 4012345678901"),
  idLabel: t("Product ID", "Ürün Kimliği", "Produkt-ID"),
  idPlaceholder: t("UUID from sellercentral", "Sellercentral'dan UUID", "UUID aus dem Sellercentral"),
  urlLabel: t("Shop URL or handle", "Shop URL veya handle", "Shop-URL oder Handle"),
  urlPlaceholder: t("andertal.com/de/product-name-ab12cd34", "andertal.com/de/urun-adi-ab12cd34", "andertal.com/de/produktname-ab12cd34"),
  search: t("Search", "Ara", "Suchen"),
  found: t(
    "Product found. Click \"Add to my products\" to create a new listing with pre-filled catalog data.",
    "Ürün bulundu. Katalog verileriyle doldurulmuş yeni listeleme oluşturmak için \"Ürünlerime ekle\"ye tıkla.",
    "Produkt gefunden. Klicke auf „Zu meinen Produkten hinzufügen", um ein neues Listing mit vorausgefüllten Katalogdaten zu erstellen.",
  ),
  notFound: t("No product found for this input.", "Bu giriş için ürün bulunamadı.", "Für diese Eingabe wurde kein Produkt gefunden."),
  addBtn: t("Add to my products", "Ürünlerime ekle", "Zu meinen Produkten hinzufügen"),
  back: t("Back to inventory", "Envantera dön", "Zurück zum Bestand"),
  orDivider: t("or", "veya", "oder"),
  productTitle: t("Product", "Ürün", "Produkt"),
};

function useT() {
  const locale = useLocale();
  const l = String(locale || "en").toLowerCase();
  return (key) => {
    const entry = copy[key];
    if (!entry) return key;
    if (l === "tr") return entry.tr;
    if (l === "de" || l === "fr" || l === "es" || l === "it") return entry.de;
    return entry.en;
  };
}

function stripHandleSuffix(handle) {
  const lastDash = handle.lastIndexOf("-");
  if (lastDash < 1) return handle;
  const suffix = handle.slice(lastDash + 1);
  if (/^[a-z0-9]{8}$/i.test(suffix)) return handle.slice(0, lastDash);
  return handle;
}

export default function AddExistingProductPage() {
  const router = useRouter();
  const t = useT();
  const client = getMedusaAdminClient();

  const [ean, setEan] = useState("");
  const [productId, setProductId] = useState("");
  const [shopUrl, setShopUrl] = useState("");

  const [state, setState] = useState(null); // null | "loading" | "found" | "not_found"
  const [foundProduct, setFoundProduct] = useState(null);

  const search = useCallback(async () => {
    const eanTrim = ean.trim();
    const idTrim = productId.trim();
    const urlTrim = shopUrl.trim();

    if (!eanTrim && !idTrim && !urlTrim) return;

    setState("loading");
    setFoundProduct(null);

    try {
      let found = null;

      // 1. Try EAN
      if (!found && eanTrim) {
        found = await client.lookupProductByEan(eanTrim).catch(() => null);
      }

      // 2. Try product ID directly
      if (!found && idTrim) {
        try {
          const { product } = await client.getAdminHubProductFull(idTrim);
          if (product?.id) found = product;
        } catch (_) {}
      }

      // 3. Try shop URL / handle
      if (!found && urlTrim) {
        let segment = urlTrim;
        try {
          const parsed = new URL(urlTrim.startsWith("http") ? urlTrim : `https://${urlTrim}`);
          const parts = parsed.pathname.split("/").filter(Boolean);
          if (parts.length > 0) segment = parts[parts.length - 1];
        } catch (_) {}
        const baseHandle = stripHandleSuffix(segment);
        for (const h of [...new Set([baseHandle, segment])]) {
          if (!h) continue;
          try {
            const { product } = await client.getAdminHubProductFull(h);
            if (product?.id) { found = product; break; }
          } catch (_) {}
        }
      }

      if (found?.id) {
        setFoundProduct(found);
        setState("found");
      } else {
        setState("not_found");
      }
    } catch (_) {
      setState("not_found");
    }
  }, [ean, productId, shopUrl, client]);

  const handleAdd = () => {
    if (!foundProduct?.id) return;
    router.push(`/products/new?existing_id=${encodeURIComponent(foundProduct.id)}`);
  };

  return (
    <Page
      title={t("title")}
      backAction={{ content: t("back"), url: "/products/inventory" }}
    >
      <Card>
        <BlockStack gap="400">
          <Text as="p" variant="bodySm" tone="subdued">{t("subtitle")}</Text>

          <Divider />

          <BlockStack gap="300">
            <InlineStack gap="200" blockAlign="end" wrap={false}>
              <div style={{ flex: 1 }}>
                <TextField
                  label={t("eanLabel")}
                  value={ean}
                  onChange={(v) => { setEan(v); setState(null); setFoundProduct(null); }}
                  placeholder={t("eanPlaceholder")}
                  autoComplete="off"
                  onKeyDown={(e) => { if (e.key === "Enter") search(); }}
                />
              </div>
            </InlineStack>

            <InlineStack gap="200" blockAlign="end" wrap={false}>
              <div style={{ flex: 1 }}>
                <TextField
                  label={t("idLabel")}
                  value={productId}
                  onChange={(v) => { setProductId(v); setState(null); setFoundProduct(null); }}
                  placeholder={t("idPlaceholder")}
                  autoComplete="off"
                  onKeyDown={(e) => { if (e.key === "Enter") search(); }}
                />
              </div>
            </InlineStack>

            <InlineStack gap="200" blockAlign="end" wrap={false}>
              <div style={{ flex: 1 }}>
                <TextField
                  label={t("urlLabel")}
                  value={shopUrl}
                  onChange={(v) => { setShopUrl(v); setState(null); setFoundProduct(null); }}
                  placeholder={t("urlPlaceholder")}
                  autoComplete="off"
                  onKeyDown={(e) => { if (e.key === "Enter") search(); }}
                />
              </div>
            </InlineStack>

            <Box>
              <Button
                variant="primary"
                onClick={search}
                loading={state === "loading"}
                disabled={!ean.trim() && !productId.trim() && !shopUrl.trim()}
              >
                {t("search")}
              </Button>
            </Box>
          </BlockStack>

          {state === "found" && foundProduct && (
            <BlockStack gap="300">
              <Banner tone="success">
                <Text as="p">{t("found")}</Text>
              </Banner>
              <div style={{ padding: "12px 16px", background: "var(--p-color-bg-surface-secondary)", borderRadius: 8, display: "flex", alignItems: "center", gap: 16 }}>
                {(foundProduct.metadata?.media?.[0] || foundProduct.image_url) && (
                  <img
                    src={typeof (foundProduct.metadata?.media?.[0]) === "string"
                      ? foundProduct.metadata.media[0]
                      : (foundProduct.metadata?.media?.[0]?.url || foundProduct.image_url || "")}
                    alt=""
                    style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 6, flexShrink: 0 }}
                  />
                )}
                <BlockStack gap="100">
                  <Text as="p" variant="bodyMd" fontWeight="semibold">
                    {foundProduct.title || foundProduct.handle || foundProduct.id}
                  </Text>
                  {foundProduct.sku && (
                    <Text as="p" variant="bodySm" tone="subdued">SKU: {foundProduct.sku}</Text>
                  )}
                  {(foundProduct.metadata?.ean || foundProduct.ean) && (
                    <Text as="p" variant="bodySm" tone="subdued">EAN: {foundProduct.metadata?.ean || foundProduct.ean}</Text>
                  )}
                </BlockStack>
              </div>
              <Button variant="primary" onClick={handleAdd}>{t("addBtn")}</Button>
            </BlockStack>
          )}

          {state === "not_found" && (
            <Banner tone="warning">{t("notFound")}</Banner>
          )}
        </BlockStack>
      </Card>
    </Page>
  );
}
