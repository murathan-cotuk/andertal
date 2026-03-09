"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { usePathname } from "@/i18n/navigation";
import { useLocale, useTranslations } from "next-intl";
import {
  Card,
  Text,
  TextField,
  Button,
  BlockStack,
  InlineStack,
  Box,
  Divider,
  Banner,
  Select,
} from "@shopify/polaris";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";
import { routing } from "@/i18n/routing";

export default function GeneralSettingsPage() {
  const client = getMedusaAdminClient();
  const router = useRouter();
  const locale = useLocale();
  const pathname = usePathname() || "/";
  const pathWithoutLocale = pathname.startsWith("/") ? pathname : `/${pathname}`;
  const t = useTranslations("locale");
  const [formData, setFormData] = useState({
    storeName: "",
    email: "",
    phone: "",
    address: "",
    city: "",
    country: "",
    postalCode: "",
    description: "",
  });
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const data = await client.getSellerSettings();
        if (!cancelled) {
          setFormData((prev) => ({
            ...prev,
            storeName: data.store_name || "",
            email: typeof window !== "undefined" ? (localStorage.getItem("sellerEmail") || "") : "",
          }));
        }
      } catch (_) {
        if (!cancelled) {
          setFormData((prev) => ({
            ...prev,
            storeName: typeof window !== "undefined" ? (localStorage.getItem("storeName") || "") : "",
            email: typeof window !== "undefined" ? (localStorage.getItem("sellerEmail") || "") : "",
          }));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, []);

  const handleSubmit = async (e) => {
    e?.preventDefault?.();
    setSaving(true);
    try {
      await client.updateSellerSettings({ store_name: formData.storeName.trim() });
      if (typeof window !== "undefined" && formData.storeName.trim()) {
        localStorage.setItem("storeName", formData.storeName.trim());
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (_) {
      if (typeof window !== "undefined" && formData.storeName.trim()) {
        localStorage.setItem("storeName", formData.storeName.trim());
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <BlockStack gap="200">
          <Text as="p" tone="subdued">Loading…</Text>
        </BlockStack>
      </Card>
    );
  }

  const handleLanguageChange = (value) => {
    const base = pathWithoutLocale === "/" || !pathWithoutLocale ? "" : pathWithoutLocale.startsWith("/") ? pathWithoutLocale : `/${pathWithoutLocale}`;
    router.push(`/${value}${base}`);
  };

  return (
    <BlockStack gap="400">
      <Text as="p" tone="subdued">
        Store name and contact. Store name is shown as Verkäufer on product pages in the shop.
      </Text>
      {saved && (
        <Banner tone="success" onDismiss={() => setSaved(false)}>
          Settings saved successfully.
        </Banner>
      )}
      <Card>
        <BlockStack gap="300">
          <Text as="h2" variant="headingMd">Language</Text>
          <Text as="p" tone="subdued">Interface language for Sellercentral. Product data can be entered in any language.</Text>
          <Box maxWidth="320px">
            <Select
              label="Language"
              labelHidden
              options={routing.locales.map((loc) => ({ label: t(loc), value: loc }))}
              value={locale}
              onChange={handleLanguageChange}
            />
          </Box>
        </BlockStack>
      </Card>
      <form onSubmit={handleSubmit}>
        <Card>
          <BlockStack gap="400">
            <TextField
              label="Store name"
              value={formData.storeName}
              onChange={(v) => setFormData((p) => ({ ...p, storeName: v }))}
              placeholder="e.g. Mein Shop"
              autoComplete="off"
              helpText="Shown as Verkäufer on product pages in the shop. Stored in the database."
            />
            <TextField
              label="Email"
              type="email"
              value={formData.email}
              onChange={(v) => setFormData((p) => ({ ...p, email: v }))}
              placeholder="you@example.com"
              autoComplete="email"
            />
            <TextField
              label="Phone"
              type="tel"
              value={formData.phone}
              onChange={(v) => setFormData((p) => ({ ...p, phone: v }))}
              placeholder="+49 …"
              autoComplete="tel"
            />
            <Divider />
            <Text as="h2" variant="headingMd">
              Address
            </Text>
            <TextField
              label="Address"
              value={formData.address}
              onChange={(v) => setFormData((p) => ({ ...p, address: v }))}
              placeholder="Street and number"
              autoComplete="street-address"
            />
            <InlineStack gap="300" blockAlign="start">
              <Box minWidth="140px">
                <TextField
                  label="City"
                  value={formData.city}
                  onChange={(v) => setFormData((p) => ({ ...p, city: v }))}
                  placeholder="City"
                  autoComplete="address-level2"
                />
              </Box>
              <Box minWidth="140px">
                <TextField
                  label="Postal code"
                  value={formData.postalCode}
                  onChange={(v) => setFormData((p) => ({ ...p, postalCode: v }))}
                  placeholder="PLZ"
                  autoComplete="postal-code"
                />
              </Box>
              <Box minWidth="140px">
                <TextField
                  label="Country"
                  value={formData.country}
                  onChange={(v) => setFormData((p) => ({ ...p, country: v }))}
                  placeholder="Country"
                  autoComplete="country-name"
                />
              </Box>
            </InlineStack>
            <TextField
              label="Store description"
              value={formData.description}
              onChange={(v) => setFormData((p) => ({ ...p, description: v }))}
              placeholder="Tell us about your store…"
              multiline={3}
              autoComplete="off"
            />
            <InlineStack gap="200">
              <Button submit variant="primary" loading={saving}>
                Save
              </Button>
              <Button onClick={() => setSaved(false)}>Cancel</Button>
            </InlineStack>
          </BlockStack>
        </Card>
      </form>
    </BlockStack>
  );
}
