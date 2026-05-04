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
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";

export default function PlatformSettingsPage() {
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
      setErr(e?.message || "Laden fehlgeschlagen.");
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
      setOk("Einstellungen gespeichert.");
      await load();
    } catch (e) {
      setErr(e?.message || "Speichern fehlgeschlagen.");
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

  if (loading) {
    return (
      <Page title="Plattform-Einstellungen">
        <Box padding="400">
          <Text tone="subdued">Laden…</Text>
        </Box>
      </Page>
    );
  }

  return (
    <Page title="Plattform-Einstellungen">
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
            <Text as="p" tone="subdued">
              Globale Einstellungen für die gesamte Plattform. Nur für Superuser
              sichtbar.
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
                  Allgemeine Plattformdaten
                </Text>
                <Text as="p" tone="subdued">
                  Diese Angaben erscheinen in E-Mails, Rechnungen und
                  im öffentlichen Impressum.
                </Text>
                <TextField
                  label="Plattformname"
                  value={platformName}
                  onChange={setPlatformName}
                  placeholder="z. B. Andertal Marketplace"
                  autoComplete="off"
                  helpText="Anzeigename der Plattform (in E-Mails und im Shop sichtbar)"
                />
                <TextField
                  label="Shop-/Anzeigename (intern)"
                  value={storeName}
                  onChange={setStoreName}
                  placeholder="z. B. Andertal"
                  autoComplete="off"
                  helpText="Kurzname – wird im Sellercentral-Header angezeigt"
                />
                <TextField
                  label="Support-E-Mail"
                  value={supportEmail}
                  onChange={setSupportEmail}
                  type="email"
                  placeholder="support@andertal.de"
                  autoComplete="off"
                  helpText="Kontakt-E-Mail für Käufer und automatische E-Mails"
                />
                <TextField
                  label="Shop-URL"
                  value={storefrontUrl}
                  onChange={setStorefrontUrl}
                  type="url"
                  placeholder="https://www.andertal.com"
                  autoComplete="off"
                  helpText="Öffentliche URL des Shops – wird in Flow-E-Mails für Links wie 'Bestellung ansehen' verwendet"
                />
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="300">
                <Text variant="headingMd" as="h2">
                  Weitere Einstellungen
                </Text>
                <Divider />
                {[
                  { label: "Checkout & Zahlungen", href: "/settings/checkout", desc: "Stripe, PayPal, Klarna" },
                  { label: "Branding & Stile", href: "/content/styles", desc: "Logos, Farben, Favicon" },
                  ...(isSuperuser ? [{ label: "E-Mail (SMTP)", href: "/settings/integrations", desc: "Ausgehende E-Mail-Konfiguration" }] : []),
                  { label: "Billbee-Integration", href: "/settings/integrations", desc: "Auftragsabwicklung & Versand" },
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
                      Öffnen
                    </Button>
                  </InlineStack>
                ))}
              </BlockStack>
            </Card>

            <InlineStack gap="300">
              <Button variant="primary" onClick={save} loading={saving} disabled={!isDirty}>
                Speichern
              </Button>
              {isDirty && (
                <Button variant="plain" onClick={discard}>
                  Verwerfen
                </Button>
              )}
            </InlineStack>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
