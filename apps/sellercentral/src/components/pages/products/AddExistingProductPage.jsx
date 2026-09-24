"use client";

import React, { useState, useCallback, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { useRouter } from "@/i18n/navigation";
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

const copy = {
  title: { en: "Add Existing Product", tr: "Mevcut Ürün Ekle", de: "Bestehendes Produkt hinzufügen" },
  subtitle: {
    en: "Search for an existing product in the catalog by AN-ID, EAN, product ID, or shop link. The form will be pre-filled with the product's data — add your own price, SKU, and shipping details.",
    tr: "AN-ID, EAN, ürün kimliği veya shop linki ile mevcut bir ürünü kataloğda ara. Form ürün verileriyle doldurulur — kendi fiyatını, SKU'nu ve kargo bilgilerini ekle.",
    de: "Suche ein bestehendes Produkt im Katalog per AN-ID, EAN, Produkt-ID oder Shop-Link. Das Formular wird mit den Katalogdaten vorausgefüllt — füge deinen eigenen Preis, SKU und Versanddetails hinzu.",
  },
  eanLabel: { en: "EAN / Barcode", tr: "EAN / Barkod", de: "EAN / Barcode" },
  eanPlaceholder: { en: "e.g. 4012345678901", tr: "örn. 4012345678901", de: "z. B. 4012345678901" },
  anIdLabel: { en: "AN-ID", tr: "AN-ID", de: "AN-ID" },
  anIdPlaceholder: { en: "e.g. AN-K2N4P6X", tr: "örn. AN-K2N4P6X", de: "z. B. AN-K2N4P6X" },
  idLabel: { en: "Product ID", tr: "Ürün Kimliği", de: "Produkt-ID" },
  idPlaceholder: { en: "UUID from sellercentral", tr: "Sellercentral'dan UUID", de: "UUID aus dem Sellercentral" },
  urlLabel: { en: "Shop URL or handle", tr: "Shop URL veya handle", de: "Shop-URL oder Handle" },
  urlPlaceholder: { en: "andertal.com/de/product-name-ab12cd34", tr: "andertal.com/de/urun-adi-ab12cd34", de: "andertal.com/de/produktname-ab12cd34" },
  search: { en: "Search", tr: "Ara", de: "Suchen" },
  found: {
    en: "Product found. Click \"Add to my products\" to create a new listing with pre-filled catalog data.",
    tr: "Ürün bulundu. Katalog verileriyle doldurulmuş yeni listeleme oluşturmak için \"Ürünlerime ekle\"ye tıkla.",
    de: 'Produkt gefunden. Klicke auf „Zu meinen Produkten hinzufügen“, um ein neues Listing mit vorausgefüllten Katalogdaten zu erstellen.',
  },
  notFound: { en: "No product found for this input.", tr: "Bu giriş için ürün bulunamadı.", de: "Für diese Eingabe wurde kein Produkt gefunden." },
  addBtn: { en: "Add to my products", tr: "Ürünlerime ekle", de: "Zu meinen Produkten hinzufügen" },
  addBtnFor: { en: (ean) => `Add only EAN ${ean} to my products`, tr: (ean) => `Sadece EAN ${ean} ürününü ürünlerime ekle`, de: (ean) => `Nur EAN ${ean} zu meinen Produkten hinzufügen` },
  back: { en: "Back to inventory", tr: "Envantera dön", de: "Zurück zum Bestand" },
  addingHeading: { en: "You are adding:", tr: "Ekleyeceğiniz ürün:", de: "Du fügst hinzu:" },
  otherVariants: { en: "Other variants in this product", tr: "Bu ürüne ait diğer varyasyonlar", de: "Weitere Varianten dieses Produkts" },
  otherVariantsNotIncluded: {
    en: "For reference only — these are NOT added to your inventory. Each is its own product; add one separately if you need it.",
    tr: "Sadece bilgi amaçlıdır — bunlar envanterinize EKLENMEYECEK. Her biri kendi başına ayrı bir üründür; ihtiyacınız olursa ayrı ayrı eklemeniz gerekir.",
    de: "Nur zur Information — diese werden NICHT zu deinem Bestand hinzugefügt. Jede ist ein eigenes Produkt; bei Bedarf separat hinzufügen.",
  },
  showVariants: { en: "Show all variants", tr: "Tüm varyasyonları göster", de: "Alle Varianten anzeigen" },
  hideVariants: { en: "Hide variants", tr: "Varyasyonları gizle", de: "Varianten ausblenden" },
  variantCount: { en: (n) => `${n} variants total`, tr: (n) => `Toplam ${n} varyasyon`, de: (n) => `${n} Varianten insgesamt` },
  scanBarcode: { en: "Scan barcode", tr: "Barkod tara", de: "Barcode scannen" },
  scanning: { en: "Point your camera at the barcode…", tr: "Kamerayı barkoda doğrult…", de: "Kamera auf den Barcode richten…" },
  scanCancel: { en: "Cancel", tr: "İptal", de: "Abbrechen" },
  scanNotSupported: { en: "Camera scanning isn't supported on this browser — enter the EAN manually below.", tr: "Bu tarayıcıda kamera ile tarama desteklenmiyor — EAN'ı aşağıya elle gir.", de: "Kamera-Scan wird in diesem Browser nicht unterstützt — EAN unten manuell eingeben." },
  scanCameraError: { en: "Couldn't access the camera. Check permissions and try again.", tr: "Kameraya erişilemedi. İzinleri kontrol edip tekrar dene.", de: "Kamera konnte nicht geöffnet werden. Berechtigungen prüfen und erneut versuchen." },
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

function getVariantLabel(v) {
  if (!v) return "";
  const opts = Array.isArray(v.option_values) ? v.option_values : [];
  if (opts.length > 0) {
    const parts = opts.map((o) => {
      if (!o) return "";
      if (typeof o === "string") return o;
      return String(o.label || o.value || "").trim();
    }).filter(Boolean);
    if (parts.length > 0) return parts.join(" / ");
  }
  return String(v.value || v.option || v.name || v.title || "").trim();
}

function ProductThumb({ product }) {
  const media = product.metadata?.media?.[0];
  const src = typeof media === "string" ? media : (media?.url || product.image_url || "");
  if (!src) return null;
  return (
    <img
      src={src}
      alt=""
      style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 6, flexShrink: 0 }}
    />
  );
}

function normalizeAnIdInput(value) {
  let s = String(value || "").trim().toUpperCase();
  if (!s) return "";
  if (!s.startsWith("AN-") && /^[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{7}$/.test(s)) s = "AN-" + s;
  return /^AN-[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{7}$/.test(s) ? s : "";
}

/** Digits only — matches the backend's normalizeStoreEan so a stored EAN with spaces/dashes
 * still matches what the seller typed (and what the backend already matched on). */
function normalizeEanDigits(value) {
  const d = String(value || "").replace(/\D/g, "");
  return d.length >= 8 ? d : "";
}

function VariantRow({ v, isMatch }) {
  const label = getVariantLabel(v);
  const ean = v.ean || v.metadata?.ean || "";
  const anId = v.an_id || "";
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: 10,
      padding: "6px 10px",
      borderRadius: 6,
      background: isMatch ? "var(--p-color-bg-success-subdued, #f0fdf4)" : "var(--p-color-bg-surface-secondary)",
      border: isMatch ? "1px solid #86efac" : "1px solid transparent",
    }}>
      {isMatch && <span style={{ fontSize: 12, color: "#15803d", fontWeight: 600 }}>✓</span>}
      <BlockStack gap="050">
        {label && <Text as="p" variant="bodySm" fontWeight={isMatch ? "semibold" : "regular"}>{label}</Text>}
        {ean && <Text as="p" variant="bodySm" tone="subdued">EAN: {ean}</Text>}
        {anId && <Text as="p" variant="bodySm" tone="subdued">AN-ID: {anId}</Text>}
        {/* No SKU here on purpose — it's the SKU of whichever seller originally listed this
            sibling variant, not shared/catalog data. Showing it would leak one seller's SKU
            to another seller just browsing the variation family. */}
      </BlockStack>
    </div>
  );
}

export default function AddExistingProductPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useT();
  const client = getMedusaAdminClient();

  const [ean, setEan] = useState("");
  const [anId, setAnId] = useState("");
  const [productId, setProductId] = useState("");
  const [shopUrl, setShopUrl] = useState("");
  const [searchedEan, setSearchedEan] = useState("");
  const [searchedAnId, setSearchedAnId] = useState("");

  const [state, setState] = useState(null); // null | "loading" | "found" | "not_found"
  const [foundProduct, setFoundProduct] = useState(null);
  const [siblingsOpen, setSiblingsOpen] = useState(false);

  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerError, setScannerError] = useState("");
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const scanLoopRef = useRef(null);

  const search = useCallback(async (eanOverride) => {
    const eanTrim = (eanOverride ?? ean).trim();
    const anIdTrim = normalizeAnIdInput(anId) || normalizeAnIdInput(eanTrim);
    const idTrim = productId.trim();
    const urlTrim = shopUrl.trim();

    if (!eanTrim && !anId.trim() && !idTrim && !urlTrim) return;

    setState("loading");
    setFoundProduct(null);
    setSiblingsOpen(false);
    setSearchedEan(anIdTrim ? "" : eanTrim);
    setSearchedAnId(anIdTrim);

    try {
      let found = null;

      if (!found && anIdTrim) {
        const anResult = await client.lookupProductByAnId(anIdTrim).catch(() => null);
        found = anResult?.product || null;
        if (anResult?.matched_variant_an_id) setSearchedAnId(anResult.matched_variant_an_id);
      }

      if (!found && eanTrim && !normalizeAnIdInput(eanTrim)) {
        const eanResult = await client.lookupProductByEan(eanTrim).catch(() => null);
        found = eanResult?.product || null;
        // Trust the backend's own match (it normalized the EAN to find this product in the
        // first place) instead of re-deriving it below with a plain string compare — that
        // mismatch used to silently fail to lock onto the right child variant.
        if (eanResult?.matched_variant_ean) setSearchedEan(eanResult.matched_variant_ean);
      }

      if (!found && idTrim) {
        try {
          const { product } = await client.getAdminHubProductFull(idTrim);
          if (product?.id) found = product;
        } catch (_) {}
      }

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
  }, [ean, anId, productId, shopUrl, client]);

  const stopScanner = useCallback(() => {
    if (scanLoopRef.current) {
      cancelAnimationFrame(scanLoopRef.current);
      scanLoopRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setScannerOpen(false);
  }, []);

  // Camera-based barcode scan (native BarcodeDetector — no extra dependency). Falls back to a
  // clear "not supported" message so manual EAN entry (already below) still works everywhere.
  const startScanner = useCallback(async () => {
    setScannerError("");
    if (typeof window === "undefined" || !("BarcodeDetector" in window)) {
      setScannerError(t("scanNotSupported"));
      return;
    }
    setScannerOpen(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      const detector = new window.BarcodeDetector({
        formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "qr_code"],
      });
      const tick = async () => {
        if (!videoRef.current || videoRef.current.readyState < 2) {
          scanLoopRef.current = requestAnimationFrame(tick);
          return;
        }
        try {
          const codes = await detector.detect(videoRef.current);
          if (codes && codes.length > 0) {
            const value = String(codes[0].rawValue || "").trim();
            if (value) {
              stopScanner();
              setEan(value);
              setState(null);
              setFoundProduct(null);
              setSearchedEan("");
              search(value);
              return;
            }
          }
        } catch (_) {
          // transient decode error — keep scanning
        }
        scanLoopRef.current = requestAnimationFrame(tick);
      };
      scanLoopRef.current = requestAnimationFrame(tick);
    } catch (_) {
      setScannerError(t("scanCameraError"));
      stopScanner();
    }
  }, [search, stopScanner, t]);

  useEffect(() => () => stopScanner(), [stopScanner]);

  // Deep-linked from the "See other variations" button on the product edit page.
  useEffect(() => {
    const pid = searchParams?.get("product_id");
    if (!pid) return;
    setProductId(pid);
  }, [searchParams]);

  useEffect(() => {
    if (productId && searchParams?.get("product_id") === productId) {
      search();
    }
  }, [productId]);

  const variants = Array.isArray(foundProduct?.variants) ? foundProduct.variants : [];
  const matchedVariant = searchedAnId
    ? variants.find((v) => String(v?.an_id || "").trim().toUpperCase() === searchedAnId)
    : searchedEan
    ? variants.find((v) => normalizeEanDigits(v?.ean || v?.metadata?.ean) === normalizeEanDigits(searchedEan))
    : null;
  // The one, single, unambiguous EAN that will actually be added — never the whole family.
  // Even when it matched the product's own top-level EAN rather than one child inside
  // variants[] (matchedVariant is then null), this still resolves to that exact EAN.
  const addingEan = String(
    matchedVariant?.ean || matchedVariant?.metadata?.ean || searchedEan || ean || ""
  ).trim();

  const handleAdd = () => {
    if (!foundProduct?.id) return;
    const suffix = addingEan ? `&variant_ean=${encodeURIComponent(addingEan)}` : "";
    router.push(`/products/new?existing_id=${encodeURIComponent(foundProduct.id)}${suffix}`);
  };

  const siblingVariants = matchedVariant
    ? variants.filter((v) => v !== matchedVariant)
    : [];

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
                  label={t("anIdLabel")}
                  value={anId}
                  onChange={(v) => { setAnId(v); setState(null); setFoundProduct(null); setSearchedEan(""); setSearchedAnId(""); }}
                  placeholder={t("anIdPlaceholder")}
                  autoComplete="off"
                  onKeyDown={(e) => { if (e.key === "Enter") search(); }}
                />
              </div>
            </InlineStack>

            <InlineStack gap="200" blockAlign="end" wrap={false}>
              <div style={{ flex: 1 }}>
                <TextField
                  label={t("eanLabel")}
                  value={ean}
                  onChange={(v) => { setEan(v); setState(null); setFoundProduct(null); setSearchedEan(""); setSearchedAnId(""); }}
                  placeholder={t("eanPlaceholder")}
                  autoComplete="off"
                  onKeyDown={(e) => { if (e.key === "Enter") search(); }}
                />
              </div>
              <Button onClick={startScanner}>
                📷 {t("scanBarcode")}
              </Button>
            </InlineStack>

            {scannerError && (
              <Banner tone="warning" onDismiss={() => setScannerError("")}>
                <Text as="p">{scannerError}</Text>
              </Banner>
            )}

            <InlineStack gap="200" blockAlign="end" wrap={false}>
              <div style={{ flex: 1 }}>
                <TextField
                  label={t("idLabel")}
                  value={productId}
                  onChange={(v) => { setProductId(v); setState(null); setFoundProduct(null); setSearchedEan(""); setSearchedAnId(""); }}
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
                  onChange={(v) => { setShopUrl(v); setState(null); setFoundProduct(null); setSearchedEan(""); setSearchedAnId(""); }}
                  placeholder={t("urlPlaceholder")}
                  autoComplete="off"
                  onKeyDown={(e) => { if (e.key === "Enter") search(); }}
                />
              </div>
            </InlineStack>

            <Box>
              <Button
                variant="primary"
                onClick={() => search()}
                loading={state === "loading"}
                disabled={!ean.trim() && !anId.trim() && !productId.trim() && !shopUrl.trim()}
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

              {/* Product header */}
              <div style={{ padding: "12px 16px", background: "var(--p-color-bg-surface-secondary)", borderRadius: 8, display: "flex", alignItems: "center", gap: 16 }}>
                <ProductThumb product={foundProduct} />
                <BlockStack gap="100">
                  <Text as="p" variant="bodyMd" fontWeight="semibold">
                    {foundProduct.title || foundProduct.handle || foundProduct.id}
                  </Text>
                  {variants.length > 0 && (
                    <Text as="p" variant="bodySm" tone="subdued">
                      {typeof t("variantCount") === "function" ? t("variantCount")(variants.length) : `${variants.length} variants`}
                    </Text>
                  )}
                  {foundProduct.an_id && (
                    <Text as="p" variant="bodySm" tone="subdued">AN-ID: {foundProduct.an_id}</Text>
                  )}
                  {(foundProduct.metadata?.ean || foundProduct.ean) && variants.length === 0 && (
                    <Text as="p" variant="bodySm" tone="subdued">EAN: {foundProduct.metadata?.ean || foundProduct.ean}</Text>
                  )}
                </BlockStack>
              </div>

              {/* Unambiguous "this is the one product you're adding" block */}
              {addingEan && (
                <BlockStack gap="200">
                  <Text as="p" variant="bodySm" fontWeight="semibold" tone="success">{t("addingHeading")}</Text>
                  {matchedVariant ? (
                    <VariantRow v={matchedVariant} isMatch />
                  ) : (
                    <VariantRow
                      v={{ title: foundProduct.title, ean: addingEan, an_id: foundProduct.an_id }}
                      isMatch
                    />
                  )}
                </BlockStack>
              )}

              {/* Sibling variants */}
              {siblingVariants.length > 0 && (
                <BlockStack gap="200">
                  <InlineStack align="space-between" blockAlign="center">
                    <Text as="p" variant="bodySm" tone="subdued">{t("otherVariants")} ({siblingVariants.length})</Text>
                    <Button
                      variant="plain"
                      onClick={() => setSiblingsOpen((o) => !o)}
                    >
                      {siblingsOpen ? t("hideVariants") : t("showVariants")}
                    </Button>
                  </InlineStack>
                  {siblingsOpen && (
                    <BlockStack gap="150">
                      <Banner tone="warning">
                        <Text as="p" variant="bodySm">{t("otherVariantsNotIncluded")}</Text>
                      </Banner>
                      {siblingVariants.map((v, i) => (
                        <VariantRow key={v.id || i} v={v} isMatch={false} />
                      ))}
                    </BlockStack>
                  )}
                </BlockStack>
              )}

              {/* No variant match but has variants — show all */}
              {!matchedVariant && variants.length > 0 && (
                <BlockStack gap="200">
                  <InlineStack align="space-between" blockAlign="center">
                    <Text as="p" variant="bodySm" tone="subdued">{t("otherVariants")} ({variants.length})</Text>
                    <Button
                      variant="plain"
                      onClick={() => setSiblingsOpen((o) => !o)}
                    >
                      {siblingsOpen ? t("hideVariants") : t("showVariants")}
                    </Button>
                  </InlineStack>
                  {siblingsOpen && (
                    <BlockStack gap="150">
                      <Banner tone="warning">
                        <Text as="p" variant="bodySm">{t("otherVariantsNotIncluded")}</Text>
                      </Banner>
                      {variants.map((v, i) => (
                        <VariantRow key={v.id || i} v={v} isMatch={false} />
                      ))}
                    </BlockStack>
                  )}
                </BlockStack>
              )}

              <Button variant="primary" onClick={handleAdd}>
                {addingEan && typeof t("addBtnFor") === "function" ? t("addBtnFor")(addingEan) : t("addBtn")}
              </Button>
            </BlockStack>
          )}

          {state === "not_found" && (
            <Banner tone="warning">{t("notFound")}</Banner>
          )}
        </BlockStack>
      </Card>

      {scannerOpen && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed", inset: 0, zIndex: 2000,
            background: "rgba(0,0,0,0.85)",
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            gap: 16, padding: 16, boxSizing: "border-box",
          }}
        >
          <div style={{ position: "relative", width: "100%", maxWidth: 480, aspectRatio: "3 / 4", borderRadius: 12, overflow: "hidden", background: "#000" }}>
            <video
              ref={videoRef}
              muted
              playsInline
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
            <div
              aria-hidden
              style={{
                position: "absolute", left: "10%", right: "10%", top: "35%", bottom: "35%",
                border: "2px solid #fff", borderRadius: 8, boxShadow: "0 0 0 2000px rgba(0,0,0,0.35)",
              }}
            />
          </div>
          <Text as="p" tone="text-inverse">{t("scanning")}</Text>
          <Button onClick={stopScanner}>{t("scanCancel")}</Button>
        </div>
      )}
    </Page>
  );
}
