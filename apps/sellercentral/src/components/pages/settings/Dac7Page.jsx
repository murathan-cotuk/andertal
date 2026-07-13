"use client";

import React, { useState } from "react";
import { useLocale } from "next-intl";
import {
  Banner, BlockStack, Box, Button, Card, Divider,
  InlineStack, Select, Text,
} from "@shopify/polaris";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";

const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: 4 }, (_, i) => {
  const y = String(CURRENT_YEAR - i);
  return { label: y, value: y };
});

const T = {
  de: {
    title: "DAC7 / § 12 PStTG — Plattformmeldung",
    subtitle: "Meldepflichtige Anbieter gemäß EU-Richtlinie 2021/514 (DAC7) und deutschem Plattformsteuertransparenzgesetz (PStTG). Meldeschwelle: €2.000 Umsatz oder 30 Transaktionen pro Kalenderjahr.",
    year: "Meldejahr",
    load: "Bericht laden",
    loading: "Wird geladen…",
    export: "XML herunterladen (BZSt)",
    exporting: "Exportiere…",
    reportableSellers: (n) => `${n} meldepflichtige Anbieter`,
    noSellers: "Keine Anbieter erreichen die Meldeschwelle für dieses Jahr.",
    seller: "Anbieter",
    revenue: "Umsatz (€)",
    transactions: "Transaktionen",
    vatId: "USt-IdNr.",
    taxId: "Steuernummer",
    lucidNumber: "LUCID",
    exceeds: "Grund",
    rev: "Umsatz",
    txn: "Transaktionen",
    both: "Umsatz + Transaktionen",
    note: "Hinweis: Diese Auswertung dient als interne Vorschau. Die offizielle Meldung muss über das BZSt-Online-Portal (ELMA) oder einen zugelassenen Softwareanbieter übermittelt werden. Bitte prüfe das XML vor der Einreichung mit deinem Steuerberater.",
  },
  en: {
    title: "DAC7 / § 12 PStTG — Platform Reporting",
    subtitle: "Reportable sellers under EU Directive 2021/514 (DAC7) and the German Platform Tax Transparency Act (PStTG). Threshold: €2,000 revenue or 30 transactions per calendar year.",
    year: "Reporting year",
    load: "Load report",
    loading: "Loading…",
    export: "Download XML (BZSt)",
    exporting: "Exporting…",
    reportableSellers: (n) => `${n} reportable seller(s)`,
    noSellers: "No sellers meet the reporting threshold for this year.",
    seller: "Seller",
    revenue: "Revenue (€)",
    transactions: "Transactions",
    vatId: "VAT ID",
    taxId: "Tax ID",
    lucidNumber: "LUCID",
    exceeds: "Reason",
    rev: "Revenue",
    txn: "Transactions",
    both: "Revenue + Transactions",
    note: "Note: This is an internal preview. The official report must be submitted via the BZSt online portal (ELMA) or an approved software provider. Please review the XML with your tax advisor before filing.",
  },
  tr: {
    title: "DAC7 / § 12 PStTG — Platform Bildirimi",
    subtitle: "AB Direktifi 2021/514 (DAC7) ve Alman Platform Vergi Şeffaflığı Kanunu (PStTG) kapsamında bildirimi zorunlu satıcılar. Eşik: yılda €2.000 gelir veya 30 işlem.",
    year: "Bildirim yılı",
    load: "Raporu yükle",
    loading: "Yükleniyor…",
    export: "XML indir (BZSt)",
    exporting: "Dışa aktarılıyor…",
    reportableSellers: (n) => `${n} bildirim zorunlu satıcı`,
    noSellers: "Bu yıl için eşiği aşan satıcı bulunmuyor.",
    seller: "Satıcı",
    revenue: "Gelir (€)",
    transactions: "İşlem Sayısı",
    vatId: "KDV No.",
    taxId: "Vergi No.",
    lucidNumber: "LUCID",
    exceeds: "Neden",
    rev: "Gelir",
    txn: "İşlem",
    both: "Gelir + İşlem",
    note: "Not: Bu rapor dahili önizleme niteliğindedir. Resmi bildirim BZSt çevrimiçi portalı (ELMA) veya onaylı bir yazılım sağlayıcısı aracılığıyla yapılmalıdır. XML'i vergi danışmanınızla birlikte inceleyiniz.",
  },
};

export default function Dac7Page() {
  const locale = useLocale();
  const t = T[locale] || T.en;
  const client = getMedusaAdminClient();

  const [year, setYear] = useState(String(CURRENT_YEAR - 1));
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const [report, setReport] = useState(null);

  const loadReport = async () => {
    setError("");
    setLoading(true);
    try {
      const data = await client.getDac7Report(year);
      setReport(data);
    } catch (e) {
      setError(e?.message || "Failed to load report.");
    } finally {
      setLoading(false);
    }
  };

  const exportXml = async () => {
    setError("");
    setExporting(true);
    try {
      const blob = await client.downloadDac7Xml(year);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `dac7-${year}.xml`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e?.message || "Export failed.");
    } finally {
      setExporting(false);
    }
  };

  const exceedsLabel = (s) => {
    if (s.exceeds_revenue && s.exceeds_transactions) return t.both;
    if (s.exceeds_revenue) return t.rev;
    return t.txn;
  };

  return (
    <BlockStack gap="400">
      <Card>
        <BlockStack gap="200">
          <Text as="h2" variant="headingMd">{t.title}</Text>
          <Text as="p" tone="subdued">{t.subtitle}</Text>
        </BlockStack>
      </Card>

      {error && <Banner tone="critical" onDismiss={() => setError("")}>{error}</Banner>}

      <Card>
        <BlockStack gap="300">
          <InlineStack gap="300" blockAlign="end" wrap>
            <Box minWidth="160px">
              <Select
                label={t.year}
                options={YEAR_OPTIONS}
                value={year}
                onChange={(v) => { setYear(v); setReport(null); }}
              />
            </Box>
            <Button variant="primary" onClick={loadReport} loading={loading}>
              {loading ? t.loading : t.load}
            </Button>
            {report && (
              <Button onClick={exportXml} loading={exporting}>
                {exporting ? t.exporting : t.export}
              </Button>
            )}
          </InlineStack>

          {report && (
            <>
              <Divider />
              <Text as="p" variant="bodyMd" fontWeight="semibold">
                {t.reportableSellers(report.reportable_seller_count)}
              </Text>
              {report.sellers.length === 0 ? (
                <Text as="p" tone="subdued">{t.noSellers}</Text>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: "#f3f4f6" }}>
                        {[t.seller, t.vatId, t.taxId, t.lucidNumber, t.revenue, t.transactions, t.exceeds].map((h) => (
                          <th key={h} style={{ padding: "8px 10px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid #e5e7eb", whiteSpace: "nowrap" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {report.sellers.map((s, i) => (
                        <tr key={s.seller_id} style={{ background: i % 2 === 0 ? "#fff" : "#f9fafb" }}>
                          <td style={{ padding: "7px 10px", borderBottom: "1px solid #e5e7eb" }}>
                            <Text as="span" variant="bodySm" fontWeight="semibold">{s.store_name || s.seller_id}</Text>
                            <br />
                            <Text as="span" variant="bodySm" tone="subdued">{s.email}</Text>
                          </td>
                          <td style={{ padding: "7px 10px", borderBottom: "1px solid #e5e7eb", fontFamily: "monospace" }}>{s.vat_id || "—"}</td>
                          <td style={{ padding: "7px 10px", borderBottom: "1px solid #e5e7eb", fontFamily: "monospace" }}>{s.tax_id || "—"}</td>
                          <td style={{ padding: "7px 10px", borderBottom: "1px solid #e5e7eb", fontFamily: "monospace" }}>{s.lucid_number || "—"}</td>
                          <td style={{ padding: "7px 10px", borderBottom: "1px solid #e5e7eb" }}>€{s.revenue_eur}</td>
                          <td style={{ padding: "7px 10px", borderBottom: "1px solid #e5e7eb" }}>{s.transaction_count}</td>
                          <td style={{ padding: "7px 10px", borderBottom: "1px solid #e5e7eb" }}>
                            <span style={{ background: "#fef3c7", color: "#92400e", padding: "2px 6px", borderRadius: 4, fontSize: 11, fontWeight: 600 }}>
                              {exceedsLabel(s)}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </BlockStack>
      </Card>

      <Banner tone="warning">
        <Text as="p" variant="bodySm">{t.note}</Text>
      </Banner>
    </BlockStack>
  );
}
