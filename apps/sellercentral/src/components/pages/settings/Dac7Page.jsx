"use client";

import React, { useState } from "react";
import { useLocale } from "next-intl";
import {
  Banner, BlockStack, Box, Button, Card, Divider,
  InlineStack, Select, Text, List,
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
    subtitle: "Interne Vorschau und XML-Export für die jährliche Meldung meldepflichtiger Verkäufer an das Bundeszentralamt für Steuern (BZSt).",
    guideTitle: "Kurzleitfaden — was ist das und was musst du tun?",
    whatTitle: "Was ist DAC7 / PStTG?",
    whatBody:
      "DAC7 (EU-Richtlinie 2021/514) verpflichtet digitale Plattformen, bestimmte Verkäuferumsätze an die Steuerbehörden zu melden. In Deutschland setzt das Plattformsteuertransparenzgesetz (PStTG) das um. Die Plattform (nicht der einzelne Verkäufer) muss melden — du als Superuser handelst hier für den Plattformbetreiber.",
    whoTitle: "Wer ist betroffen?",
    whoItems: [
      "Meldepflichtig ist der Plattformbetreiber (Andertal), nicht der Kunde.",
      "In die Meldung fallen Verkäufer, die im Kalenderjahr mindestens €2.000 Umsatz ODER mindestens 30 bezahlte Transaktionen hatten.",
      "Unterhalb dieser Schwelle musst du den Verkäufer für DAC7 nicht melden (diese Seite filtert das automatisch).",
    ],
    whenTitle: "Wann muss gemeldet werden?",
    whenItems: [
      "Meldejahr = das abgelaufene Kalenderjahr (z. B. im Januar 2027 meldest du das Jahr 2026).",
      "Frist in Deutschland: in der Regel bis zum 31. Januar des Folgejahres an das BZSt.",
      "Empfehlung: Bericht hier laden → Daten prüfen → Steuerberater einbinden → XML exportieren → über BZSt/ELMA (oder zugelassene Software) einreichen.",
    ],
    stepsTitle: "Was machst du auf dieser Seite?",
    stepsItems: [
      "1. Meldejahr wählen (meist das Vorjahr).",
      "2. „Bericht laden“ — zeigt alle Verkäufer über der Schwelle inkl. Umsatz, Transaktionen und Steuerdaten.",
      "3. Prüfen: fehlen Steuernummer, USt-IdNr. oder Adresse? Verkäufer-Daten in den Einstellungen nachziehen lassen.",
      "4. „XML herunterladen (BZSt)“ — Datei für Steuerberater / BZSt-Übermittlung speichern.",
      "5. Offizielle Einreichung erfolgt NICHT automatisch aus Sellercentral — nur vorbereiten und exportieren.",
    ],
    notThisTitle: "Was macht diese Seite nicht?",
    notThisItems: [
      "Keine automatische Übermittlung an das Finanzamt.",
      "Kein Ersatz für Steuerberatung — XML vor Abgabe fachlich prüfen lassen.",
      "Keine MwSt.-Erklärung der Verkäufer (OSS/USt) — das bleibt Sache der Verkäufer.",
    ],
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
    rev: "Umsatz ≥ €2.000",
    txn: "≥ 30 Transaktionen",
    both: "Umsatz + Transaktionen",
    thresholdHint: "Schwelle: €2.000 Umsatz oder 30 bezahlte Transaktionen im gewählten Kalenderjahr.",
    note: "Hinweis: Diese Auswertung ist eine interne Vorschau. Die offizielle Meldung musst du über das BZSt-Online-Portal (ELMA) oder einen zugelassenen Softwareanbieter einreichen. Bitte prüfe das XML vor der Einreichung mit deinem Steuerberater.",
  },
  en: {
    title: "DAC7 / § 12 PStTG — Platform reporting",
    subtitle: "Internal preview and XML export for the annual report of reportable sellers to the German Federal Central Tax Office (BZSt).",
    guideTitle: "Quick guide — what is this and what do you do?",
    whatTitle: "What is DAC7 / PStTG?",
    whatBody:
      "DAC7 (EU Directive 2021/514) requires digital platforms to report certain seller revenues to tax authorities. In Germany this is implemented by the Platform Tax Transparency Act (PStTG). The platform (not each seller) must file — as a superuser you act for the platform operator.",
    whoTitle: "Who is in scope?",
    whoItems: [
      "The reporting obligation sits with the platform operator (Andertal), not with the end customer.",
      "Sellers enter the report if they had at least €2,000 revenue OR at least 30 paid transactions in the calendar year.",
      "Below that threshold you do not need to report the seller for DAC7 (this page filters automatically).",
    ],
    whenTitle: "When must you report?",
    whenItems: [
      "Reporting year = the completed calendar year (e.g. in January 2027 you report year 2026).",
      "Deadline in Germany: typically by 31 January of the following year to the BZSt.",
      "Recommended flow: load report here → review data → involve your tax advisor → export XML → submit via BZSt/ELMA (or approved software).",
    ],
    stepsTitle: "What do you do on this page?",
    stepsItems: [
      "1. Pick the reporting year (usually last year).",
      "2. “Load report” — lists sellers above the threshold with revenue, transactions and tax IDs.",
      "3. Check: missing tax ID, VAT ID or address? Have the seller complete their settings.",
      "4. “Download XML (BZSt)” — save the file for your advisor / BZSt filing.",
      "5. Official submission is NOT automatic from Sellercentral — prepare and export only.",
    ],
    notThisTitle: "What this page does not do",
    notThisItems: [
      "No automatic transmission to the tax office.",
      "Not a substitute for tax advice — have the XML reviewed before filing.",
      "Not the sellers’ VAT returns (OSS/VAT) — that remains each seller’s responsibility.",
    ],
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
    rev: "Revenue ≥ €2,000",
    txn: "≥ 30 transactions",
    both: "Revenue + Transactions",
    thresholdHint: "Threshold: €2,000 revenue or 30 paid transactions in the selected calendar year.",
    note: "Note: This is an internal preview. Submit the official report via the BZSt online portal (ELMA) or an approved software provider. Review the XML with your tax advisor before filing.",
  },
  tr: {
    title: "DAC7 / § 12 PStTG — Platform bildirimi",
    subtitle: "Bildirimi zorunlu satıcıların yıllık raporunun Alman Federal Merkezi Vergi Dairesi’ne (BZSt) hazırlanması için dahili önizleme ve XML dışa aktarımı.",
    guideTitle: "Kısa kılavuz — bu nedir, ne yapmalısın?",
    whatTitle: "DAC7 / PStTG nedir?",
    whatBody:
      "DAC7 (AB Direktifi 2021/514) dijital platformların belirli satıcı cirolarını vergi makamlarına bildirmesini ister. Almanya’da bunu Platform Vergi Şeffaflığı Kanunu (PStTG) uygular. Bildirim yükümlülüğü tek tek satıcıda değil, platformda (Andertal) — süper kullanıcı olarak burada platform işletmecisi adına hareket edersin.",
    whoTitle: "Kim kapsama girer?",
    whoItems: [
      "Bildirim yükümlülüğü platform işletmecisinde; son müşteride değil.",
      "Takvim yılında en az €2.000 ciro VEYA en az 30 ödenmiş işlemi olan satıcılar rapora girer.",
      "Eşiğin altında DAC7 için o satıcıyı bildirmen gerekmez (bu sayfa otomatik filtreler).",
    ],
    whenTitle: "Ne zaman bildirilmeli?",
    whenItems: [
      "Bildirim yılı = tamamlanmış takvim yılı (örn. Ocak 2027’de 2026 yılını bildirirsin).",
      "Almanya’da süre: genelde takip eden yılın 31 Ocak’ına kadar BZSt’ye.",
      "Önerilen akış: burada rapor yükle → verileri kontrol et → vergi danışmanı → XML indir → BZSt/ELMA (veya onaylı yazılım) ile gönder.",
    ],
    stepsTitle: "Bu sayfada ne yaparsın?",
    stepsItems: [
      "1. Bildirim yılını seç (genelde geçen yıl).",
      "2. “Raporu yükle” — eşiği aşan satıcıları ciro, işlem ve vergi bilgileriyle listeler.",
      "3. Kontrol et: vergi no / KDV no / adres eksik mi? Satıcıdan ayarlarını tamamlat.",
      "4. “XML indir (BZSt)” — dosyayı danışman / BZSt gönderimi için sakla.",
      "5. Resmi gönderim Sellercentral’dan otomatik değil — yalnızca hazırlık ve export.",
    ],
    notThisTitle: "Bu sayfa ne yapmaz?",
    notThisItems: [
      "Vergi dairesine otomatik gönderim yok.",
      "Vergi danışmanlığının yerine geçmez — XML’i göndermeden önce incele.",
      "Satıcıların KDV beyannamesi (OSS/KDV) değil — o her satıcının kendi işi.",
    ],
    year: "Bildirim yılı",
    load: "Raporu yükle",
    loading: "Yükleniyor…",
    export: "XML indir (BZSt)",
    exporting: "Dışa aktarılıyor…",
    reportableSellers: (n) => `${n} bildirim zorunlu satıcı`,
    noSellers: "Bu yıl için eşiği aşan satıcı bulunmuyor.",
    seller: "Satıcı",
    revenue: "Gelir (€)",
    transactions: "İşlem sayısı",
    vatId: "KDV No.",
    taxId: "Vergi No.",
    lucidNumber: "LUCID",
    exceeds: "Neden",
    rev: "Ciro ≥ €2.000",
    txn: "≥ 30 işlem",
    both: "Ciro + işlem",
    thresholdHint: "Eşik: seçilen takvim yılında €2.000 ciro veya 30 ödenmiş işlem.",
    note: "Not: Bu rapor dahili önizlemedir. Resmi bildirimi BZSt çevrimiçi portalı (ELMA) veya onaylı yazılım ile yapmalısın. XML’i göndermeden önce vergi danışmanınla gözden geçir.",
  },
};

function GuideSection({ title, children }) {
  return (
    <BlockStack gap="150">
      <Text as="h3" variant="headingSm">{title}</Text>
      {children}
    </BlockStack>
  );
}

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

      <Card>
        <BlockStack gap="400">
          <Text as="h2" variant="headingMd">{t.guideTitle}</Text>

          <GuideSection title={t.whatTitle}>
            <Text as="p" variant="bodySm">{t.whatBody}</Text>
          </GuideSection>

          <Divider />

          <GuideSection title={t.whoTitle}>
            <List type="bullet">
              {t.whoItems.map((item) => (
                <List.Item key={item}>{item}</List.Item>
              ))}
            </List>
          </GuideSection>

          <Divider />

          <GuideSection title={t.whenTitle}>
            <List type="bullet">
              {t.whenItems.map((item) => (
                <List.Item key={item}>{item}</List.Item>
              ))}
            </List>
          </GuideSection>

          <Divider />

          <GuideSection title={t.stepsTitle}>
            <List type="number">
              {t.stepsItems.map((item) => (
                <List.Item key={item}>{item.replace(/^\d+\.\s*/, "")}</List.Item>
              ))}
            </List>
          </GuideSection>

          <Divider />

          <GuideSection title={t.notThisTitle}>
            <List type="bullet">
              {t.notThisItems.map((item) => (
                <List.Item key={item}>{item}</List.Item>
              ))}
            </List>
          </GuideSection>
        </BlockStack>
      </Card>

      {error && (
        <Banner tone="critical" onDismiss={() => setError("")}>
          {error}
        </Banner>
      )}

      <Card>
        <BlockStack gap="300">
          <Text as="h2" variant="headingMd">
            {locale === "tr" ? "Rapor aracı" : locale === "de" ? "Berichtswerkzeug" : "Reporting tool"}
          </Text>
          <Text as="p" variant="bodySm" tone="subdued">
            {t.thresholdHint}
          </Text>
          <InlineStack gap="300" blockAlign="end" wrap>
            <Box minWidth="160px">
              <Select
                label={t.year}
                options={YEAR_OPTIONS}
                value={year}
                onChange={(v) => {
                  setYear(v);
                  setReport(null);
                }}
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
                <Text as="p" tone="subdued">
                  {t.noSellers}
                </Text>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: "#f3f4f6" }}>
                        {[t.seller, t.vatId, t.taxId, t.lucidNumber, t.revenue, t.transactions, t.exceeds].map((h) => (
                          <th
                            key={h}
                            style={{
                              padding: "8px 10px",
                              textAlign: "left",
                              fontWeight: 600,
                              borderBottom: "1px solid #e5e7eb",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {report.sellers.map((s, i) => (
                        <tr key={s.seller_id} style={{ background: i % 2 === 0 ? "#fff" : "#f9fafb" }}>
                          <td style={{ padding: "7px 10px", borderBottom: "1px solid #e5e7eb" }}>
                            <Text as="span" variant="bodySm" fontWeight="semibold">
                              {s.store_name || s.seller_id}
                            </Text>
                            <br />
                            <Text as="span" variant="bodySm" tone="subdued">
                              {s.email}
                            </Text>
                          </td>
                          <td style={{ padding: "7px 10px", borderBottom: "1px solid #e5e7eb", fontFamily: "monospace" }}>
                            {s.vat_id || "—"}
                          </td>
                          <td style={{ padding: "7px 10px", borderBottom: "1px solid #e5e7eb", fontFamily: "monospace" }}>
                            {s.tax_id || "—"}
                          </td>
                          <td style={{ padding: "7px 10px", borderBottom: "1px solid #e5e7eb", fontFamily: "monospace" }}>
                            {s.lucid_number || "—"}
                          </td>
                          <td style={{ padding: "7px 10px", borderBottom: "1px solid #e5e7eb" }}>€{s.revenue_eur}</td>
                          <td style={{ padding: "7px 10px", borderBottom: "1px solid #e5e7eb" }}>{s.transaction_count}</td>
                          <td style={{ padding: "7px 10px", borderBottom: "1px solid #e5e7eb" }}>
                            <span
                              style={{
                                background: "#fef3c7",
                                color: "#92400e",
                                padding: "2px 6px",
                                borderRadius: 4,
                                fontSize: 11,
                                fontWeight: 600,
                              }}
                            >
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
        <Text as="p" variant="bodySm">
          {t.note}
        </Text>
      </Banner>
    </BlockStack>
  );
}
