"use client";

import React, { useEffect, useState } from "react";
import { useLocale } from "next-intl";
import { Page, Card, BlockStack, InlineStack, Text, Badge, Banner, Spinner, Box } from "@shopify/polaris";
import { useRouter } from "next/navigation";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";

// Surfaces docs/HUKUKI.md's non-blocking "needs_compliance_review" advisory (Faz 2) — until now
// that data only accumulated in metadata.compliance_review with nothing to actually look at it.
function localizedLabel(i18n, locale, fallback) {
  if (i18n && typeof i18n === "object") {
    if (locale && i18n[locale]) return i18n[locale];
    if (i18n.de) return i18n.de;
    if (i18n.en) return i18n.en;
  }
  return fallback;
}

function fmtDate(d, locale) {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleString(locale === "en" ? "en-GB" : locale === "tr" ? "tr-TR" : "de-DE", {
      day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

const copy = (locale) => {
  const t = (en, tr, de) => (locale === "en" ? en : locale === "tr" ? tr : de);
  return {
    title: t("Compliance review", "Uyumluluk incelemesi", "Compliance-Prüfung"),
    subtitle: t(
      "Products the compliance engine flagged as missing required fields for their category. This never blocks a sale — it's a heads-up so gaps don't go unnoticed.",
      "Uyumluluk motorunun, kategorisi için zorunlu alanları eksik olarak işaretlediği ürünler. Bu hiçbir satışı engellemez — sadece boşlukların fark edilmemesini önlemek içindir.",
      "Produkte, die die Compliance-Engine als fehlend markiert hat (Pflichtfelder für ihre Kategorie). Das blockiert nie einen Verkauf — es ist nur ein Hinweis, damit Lücken nicht übersehen werden.",
    ),
    empty: t("Nothing needs review right now.", "Şu anda incelenmesi gereken bir şey yok.", "Aktuell muss nichts geprüft werden."),
    loadError: t("Could not load the review list.", "İnceleme listesi yüklenemedi.", "Prüfliste konnte nicht geladen werden."),
    colProduct: t("Product", "Ürün", "Produkt"),
    colProfile: t("Compliance profile", "Uyumluluk profili", "Compliance-Profil"),
    colMissing: t("Missing fields", "Eksik alanlar", "Fehlende Felder"),
    colChecked: t("Last checked", "Son kontrol", "Zuletzt geprüft"),
    editProduct: t("Open product", "Ürünü aç", "Produkt öffnen"),
    sellerLabel: t("Seller", "Satıcı", "Verkäufer"),
    platformProduct: t("Platform (no seller)", "Platform (satıcısız)", "Plattform (kein Verkäufer)"),
  };
};

export default function ComplianceReviewPage() {
  const locale = useLocale();
  const router = useRouter();
  const c = copy(locale);
  const [products, setProducts] = useState(null);
  const [error, setError] = useState("");
  const [isSuperuser, setIsSuperuser] = useState(null); // null = not checked yet

  useEffect(() => {
    const su = typeof window !== "undefined" && localStorage.getItem("sellerIsSuperuser") === "true";
    setIsSuperuser(su);
    if (!su) { router.replace("/"); return; }
    let cancelled = false;
    getMedusaAdminClient().getComplianceReviewProducts()
      .then((d) => { if (!cancelled) setProducts(d.products || []); })
      .catch(() => { if (!cancelled) { setProducts([]); setError(c.loadError); } });
    return () => { cancelled = true; };
  }, []);

  if (!isSuperuser) return null;

  return (
    <Page title={c.title}>
      <BlockStack gap="400">
        <Text as="p" tone="subdued">{c.subtitle}</Text>
        {error && <Banner tone="critical" onDismiss={() => setError("")}>{error}</Banner>}
        <Card padding="0">
          {products === null ? (
            <Box padding="800">
              <InlineStack align="center"><Spinner size="small" /></InlineStack>
            </Box>
          ) : products.length === 0 ? (
            <Box padding="600">
              <Text as="p" tone="subdued" alignment="center">{c.empty}</Text>
            </Box>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#f6f6f7", textAlign: "left" }}>
                  {[c.colProduct, c.colProfile, c.colMissing, c.colChecked, ""].map((h) => (
                    <th key={h} style={{ padding: "10px 16px", fontSize: 11, fontWeight: 700, color: "#6d7175", textTransform: "uppercase", borderBottom: "1px solid #e1e3e5" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {products.map((p) => (
                  <tr key={p.id} style={{ borderTop: "1px solid #f1f1f1", cursor: "pointer" }} onClick={() => router.push(`/products/${p.id}`)}>
                    <td style={{ padding: "12px 16px" }}>
                      <div style={{ fontWeight: 600, color: "#111827" }}>{p.title || "—"}</div>
                      <div style={{ fontSize: 11, color: "#9ca3af" }}>{p.seller_id ? `${c.sellerLabel}: ${p.seller_id}` : c.platformProduct}</div>
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      {p.profile_id ? localizedLabel(p.profile_label_i18n, locale, p.profile_id) : "—"}
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      <InlineStack gap="100" wrap>
                        {(p.missing_fields || []).map((f) => (
                          <Badge key={f.key} tone="critical">{localizedLabel(f.label_i18n, locale, f.key)}</Badge>
                        ))}
                      </InlineStack>
                    </td>
                    <td style={{ padding: "12px 16px", color: "#6d7175", fontSize: 12 }}>{fmtDate(p.checked_at, locale)}</td>
                    <td style={{ padding: "12px 16px", textAlign: "right" }}>
                      <span style={{ color: "#2563eb", fontWeight: 600, fontSize: 12 }}>{c.editProduct} →</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </BlockStack>
    </Page>
  );
}
