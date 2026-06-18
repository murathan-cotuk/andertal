"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  TextField,
  Button,
  Banner,
  InlineStack,
  Divider,
  Box,
} from "@shopify/polaris";
import { useLocale } from "next-intl";
import { getUI } from "@/lib/ui-strings";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";

export default function PlatformSettingsPage() {
  const locale = useLocale();
  const ui = getUI(locale);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");

  const [platformName, setPlatformName] = useState("");
  const [supportEmail, setSupportEmail] = useState("");
  const [storeName, setStoreName] = useState("");
  const [storefrontUrl, setStorefrontUrl] = useState("");

  const [snapshot, setSnapshot] = useState(null);
  const [isSuperuser, setIsSuperuser] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const d = await getMedusaAdminClient().getSellerSettings("default");
      const pn = d?.platform_name || "";
      const se = d?.support_email || "";
      const sn = d?.store_name || "";
      const su = d?.storefront_url || "";
      setPlatformName(pn);
      setSupportEmail(se);
      setStoreName(sn);
      setStorefrontUrl(su);
      setSnapshot(JSON.stringify({ pn, se, sn, su }));
    } catch (e) {
      setErr(e?.message || (locale === "en" ? "Loading failed." : locale === "tr" ? "Yükleme başarısız." : "Laden fehlgeschlagen."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    setIsSuperuser(typeof window !== "undefined" && localStorage.getItem("sellerIsSuperuser") === "true");
  }, []);

  const isDirty =
    snapshot !== null &&
    snapshot !== JSON.stringify({ pn: platformName, se: supportEmail, sn: storeName, su: storefrontUrl });

  const save = async () => {
    setSaving(true);
    setErr("");
    setOk("");
    try {
      await getMedusaAdminClient().updateSellerSettings({
        seller_id: "default",
        store_name: storeName.trim(),
        platform_name: platformName.trim(),
        support_email: supportEmail.trim(),
        storefront_url: storefrontUrl.trim(),
      });
      setOk(locale === "en" ? "Settings saved." : locale === "tr" ? "Ayarlar kaydedildi." : "Einstellungen gespeichert.");
      await load();
    } catch (e) {
      setErr(e?.message || (locale === "en" ? "Saving failed." : locale === "tr" ? "Kaydetme başarısız." : "Speichern fehlgeschlagen."));
    } finally {
      setSaving(false);
    }
  };

  const discard = () => {
    if (!snapshot) return;
    const s = JSON.parse(snapshot);
    setPlatformName(s.pn);
    setSupportEmail(s.se);
    setStoreName(s.sn);
    setStorefrontUrl(s.su);
    setErr("");
    setOk("");
  };

  const pageTitle = locale === "en" ? "Platform Settings" : locale === "tr" ? "Platform Ayarları" : "Plattform-Einstellungen";

  if (loading) {
    return (
      <Page title={pageTitle}>
        <Box padding="400">
          <Text tone="subdued">{ui.loading}</Text>
        </Box>
      </Page>
    );
  }

  return (
    <Page title={pageTitle}>
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
            <Text as="p" tone="subdued">
              {locale === "en" ? "Global settings for the entire platform. Visible to superusers only." : locale === "tr" ? "Tüm platform için genel ayarlar. Yalnızca superkullanıcılar tarafından görülür." : "Globale Einstellungen für die gesamte Plattform. Nur für Superuser sichtbar."}
            </Text>

            {err && (
              <Banner tone="critical" onDismiss={() => setErr("")}>
                <Text as="p">{err}</Text>
              </Banner>
            )}
            {ok && (
              <Banner tone="success" onDismiss={() => setOk("")}>
                <Text as="p">{ok}</Text>
              </Banner>
            )}

            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd" as="h2">
                  {locale === "en" ? "General platform data" : locale === "tr" ? "Genel platform bilgileri" : "Allgemeine Plattformdaten"}
                </Text>
                <Text as="p" tone="subdued">
                  {locale === "en" ? "These details appear in emails, invoices and the public imprint." : locale === "tr" ? "Bu bilgiler e-postalarda, faturalarda ve kamuya açık künye bölümünde görünür." : "Diese Angaben erscheinen in E-Mails, Rechnungen und im öffentlichen Impressum."}
                </Text>
                <TextField
                  label={locale === "en" ? "Platform name" : locale === "tr" ? "Platform adı" : "Plattformname"}
                  value={platformName}
                  onChange={setPlatformName}
                  placeholder="e.g. Andertal Marketplace"
                  autoComplete="off"
                  helpText={locale === "en" ? "Display name of the platform (visible in emails and the shop)" : locale === "tr" ? "Platformun görünen adı (e-postalarda ve mağazada görünür)" : "Anzeigename der Plattform (in E-Mails und im Shop sichtbar)"}
                />
                <TextField
                  label={locale === "en" ? "Shop/display name (internal)" : locale === "tr" ? "Mağaza/görünen adı (dahili)" : "Shop-/Anzeigename (intern)"}
                  value={storeName}
                  onChange={setStoreName}
                  placeholder="e.g. Andertal"
                  autoComplete="off"
                  helpText={locale === "en" ? "Short name — shown in the Sellercentral header" : locale === "tr" ? "Kısa ad — Sellercentral başlığında gösterilir" : "Kurzname – wird im Sellercentral-Header angezeigt"}
                />
                <TextField
                  label={locale === "en" ? "Support email" : locale === "tr" ? "Destek e-postası" : "Support-E-Mail"}
                  value={supportEmail}
                  onChange={setSupportEmail}
                  type="email"
                  placeholder="support@andertal.de"
                  autoComplete="off"
                  helpText={locale === "en" ? "Contact email for buyers and automated emails" : locale === "tr" ? "Alıcılar ve otomatik e-postalar için iletişim e-postası" : "Kontakt-E-Mail für Käufer und automatische E-Mails"}
                />
                <TextField
                  label={locale === "en" ? "Shop URL" : locale === "tr" ? "Mağaza URL" : "Shop-URL"}
                  value={storefrontUrl}
                  onChange={setStorefrontUrl}
                  type="url"
                  placeholder="https://www.andertal.com"
                  autoComplete="off"
                  helpText={locale === "en" ? "Public URL of the shop — used in flow emails for links like 'View order'" : locale === "tr" ? "Mağazanın genel URL'si — akış e-postalarında 'Siparişi görüntüle' gibi bağlantılar için kullanılır" : "Öffentliche URL des Shops – wird in Flow-E-Mails für Links wie 'Bestellung ansehen' verwendet"}
                />
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="300">
                <Text variant="headingMd" as="h2">
                  {locale === "en" ? "More settings" : locale === "tr" ? "Daha fazla ayar" : "Weitere Einstellungen"}
                </Text>
                <Divider />
                {[
                  {
                    label: locale === "en" ? "Checkout & Payments" : locale === "tr" ? "Ödeme & Ödemeler" : "Checkout & Zahlungen",
                    href: "/settings/checkout",
                    desc: "Stripe, PayPal, Klarna",
                  },
                  {
                    label: locale === "en" ? "Branding & Styles" : locale === "tr" ? "Marka & Stiller" : "Branding & Stile",
                    href: "/content/styles",
                    desc: locale === "en" ? "Logos, colours, favicon" : locale === "tr" ? "Logolar, renkler, favicon" : "Logos, Farben, Favicon",
                  },
                  ...(isSuperuser ? [{
                    label: locale === "en" ? "Email (SMTP)" : locale === "tr" ? "E-posta (SMTP)" : "E-Mail (SMTP)",
                    href: "/settings/integrations",
                    desc: locale === "en" ? "Outgoing email configuration" : locale === "tr" ? "Giden e-posta yapılandırması" : "Ausgehende E-Mail-Konfiguration",
                  }] : []),
                  {
                    label: locale === "en" ? "Billbee Integration" : locale === "tr" ? "Billbee Entegrasyonu" : "Billbee-Integration",
                    href: "/settings/integrations",
                    desc: locale === "en" ? "Order processing & shipping" : locale === "tr" ? "Sipariş işleme & kargo" : "Auftragsabwicklung & Versand",
                  },
                ].map((item) => (
                  <InlineStack key={item.href} align="space-between" blockAlign="center" wrap={false}>
                    <BlockStack gap="0">
                      <Text variant="bodyMd" fontWeight="semibold">{item.label}</Text>
                      <Text variant="bodySm" tone="subdued">{item.desc}</Text>
                    </BlockStack>
                    <Button
                      variant="plain"
                      url={item.href}
                    >
                      {locale === "en" ? "Open" : locale === "tr" ? "Aç" : "Öffnen"}
                    </Button>
                  </InlineStack>
                ))}
              </BlockStack>
            </Card>

            <InlineStack gap="300">
              <Button variant="primary" onClick={save} loading={saving} disabled={!isDirty}>
                {ui.save}
              </Button>
              {isDirty && (
                <Button variant="plain" onClick={discard}>
                  {locale === "en" ? "Discard" : locale === "tr" ? "Vazgeç" : "Verwerfen"}
                </Button>
              )}
            </InlineStack>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
