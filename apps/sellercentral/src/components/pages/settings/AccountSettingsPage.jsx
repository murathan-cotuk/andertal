"use client";

import { useState, useEffect } from "react";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  Select,
  Button,
  Banner,
  InlineStack,
} from "@shopify/polaris";
import { useRouter, usePathname } from "next/navigation";

const LOCALE_OPTIONS = [
  { label: "Deutsch", value: "de" },
  { label: "English", value: "en" },
  { label: "Türkçe", value: "tr" },
  { label: "Français", value: "fr" },
  { label: "Italiano", value: "it" },
  { label: "Español", value: "es" },
];

export default function AccountSettingsPage() {
  const router = useRouter();
  const pathname = usePathname();

  const [locale, setLocale] = useState("de");
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [initial, setInitial] = useState("de");

  useEffect(() => {
    // Derive current locale from URL prefix
    const seg = pathname?.split("/")?.[1];
    const match = LOCALE_OPTIONS.find((o) => o.value === seg);
    const cur = match ? seg : "de";
    setLocale(cur);
    setInitial(cur);
    // Persist to localStorage so other components can read it
    if (typeof localStorage !== "undefined") {
      const stored = localStorage.getItem("sellerLocale");
      if (stored && LOCALE_OPTIONS.some((o) => o.value === stored)) {
        setLocale(stored);
        setInitial(stored);
      }
    }
  }, [pathname]);

  const handleLocaleChange = (v) => {
    setLocale(v);
    setDirty(v !== initial);
    setSaved(false);
  };

  const save = () => {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem("sellerLocale", locale);
    }
    setInitial(locale);
    setDirty(false);
    setSaved(true);

    // Navigate to same page with new locale
    const segments = pathname?.split("/") || [];
    if (segments[1] && LOCALE_OPTIONS.some((o) => o.value === segments[1])) {
      segments[1] = locale;
    }
    router.push(segments.join("/") || `/${locale}/settings/account`);
  };

  const discard = () => {
    setLocale(initial);
    setDirty(false);
    setSaved(false);
  };

  return (
    <Page title="Konto-Einstellungen">
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
            <Text as="p" tone="subdued">
              Persönliche Einstellungen für Ihren Sellercentral-Account.
            </Text>

            {saved && (
              <Banner tone="success" onDismiss={() => setSaved(false)}>
                <Text as="p">Einstellungen gespeichert.</Text>
              </Banner>
            )}

            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd" as="h2">
                  Sprache der Benutzeroberfläche
                </Text>
                <Text as="p" tone="subdued">
                  Wählen Sie die Sprache, in der Sellercentral angezeigt werden
                  soll. Die Änderung tritt nach dem Speichern sofort in Kraft.
                </Text>
                <div style={{ maxWidth: 280 }}>
                  <Select
                    label="Sprache"
                    options={LOCALE_OPTIONS}
                    value={locale}
                    onChange={handleLocaleChange}
                  />
                </div>
                <InlineStack gap="300">
                  <Button variant="primary" onClick={save} disabled={!dirty}>
                    Speichern
                  </Button>
                  {dirty && (
                    <Button variant="plain" onClick={discard}>
                      Verwerfen
                    </Button>
                  )}
                </InlineStack>
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
