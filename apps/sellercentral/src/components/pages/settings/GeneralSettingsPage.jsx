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
    companyName: "",
    taxId: "",
    vatId: "",
    website: "",
    iban: "",
    businessStreet: "",
    businessCity: "",
    businessPostalCode: "",
    businessCountry: "",
    warehouseStreet: "",
    warehouseCity: "",
    warehousePostalCode: "",
    warehouseCountry: "",
    documents: [],
  });
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [uploadingDocs, setUploadingDocs] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const timeout = setTimeout(() => {
      if (!cancelled) setLoading(false);
    }, 8000);
    const load = async () => {
      try {
        const data = await client.getSellerSettings();
        if (!cancelled) {
          const sellerUser = data?.sellerUser || data?.seller || {};
          const businessAddress = sellerUser.business_address || {};
          const warehouseAddress = sellerUser.warehouse_address || {};
          const documents = Array.isArray(sellerUser.documents) ? sellerUser.documents : [];
          setFormData((prev) => ({
            ...prev,
            storeName: data.store_name || "",
            email: typeof window !== "undefined" ? (localStorage.getItem("sellerEmail") || "") : "",
            phone: sellerUser.phone || "",
            companyName: sellerUser.company_name || "",
            taxId: sellerUser.tax_id || "",
            vatId: sellerUser.vat_id || "",
            website: sellerUser.website || "",
            iban: sellerUser.iban || "",
            businessStreet: businessAddress.street || "",
            businessCity: businessAddress.city || "",
            businessPostalCode: businessAddress.postal_code || "",
            businessCountry: businessAddress.country || "",
            warehouseStreet: warehouseAddress.street || "",
            warehouseCity: warehouseAddress.city || "",
            warehousePostalCode: warehouseAddress.postal_code || "",
            warehouseCountry: warehouseAddress.country || "",
            documents,
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
        if (!cancelled) {
          clearTimeout(timeout);
          setLoading(false);
        }
      }
    };
    load();
    return () => { cancelled = true; clearTimeout(timeout); };
  }, []);

  const handleSubmit = async (e) => {
    e?.preventDefault?.();
    setSaveError("");
    setSaving(true);
    try {
      await client.updateSellerSettings({ store_name: formData.storeName.trim() });
      await client.updateSellerCompanyInfo({
        company_name: formData.companyName.trim() || null,
        tax_id: formData.taxId.trim() || null,
        vat_id: formData.vatId.trim() || null,
        phone: formData.phone.trim() || null,
        website: formData.website.trim() || null,
        documents: Array.isArray(formData.documents) ? formData.documents : [],
        business_address: {
          street: formData.businessStreet.trim() || "",
          city: formData.businessCity.trim() || "",
          postal_code: formData.businessPostalCode.trim() || "",
          country: formData.businessCountry.trim() || "",
        },
        warehouse_address: {
          street: formData.warehouseStreet.trim() || "",
          city: formData.warehouseCity.trim() || "",
          postal_code: formData.warehousePostalCode.trim() || "",
          country: formData.warehouseCountry.trim() || "",
        },
      });
      await client.updateSellerIban(formData.iban.trim() || null);
      if (typeof window !== "undefined" && formData.storeName.trim()) {
        localStorage.setItem("storeName", formData.storeName.trim());
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      setSaveError(e?.message || "Failed to save settings.");
      if (typeof window !== "undefined" && formData.storeName.trim()) {
        localStorage.setItem("storeName", formData.storeName.trim());
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDocumentUpload = async (files) => {
    if (!files?.length) return;
    setUploadingDocs(true);
    setSaveError("");
    try {
      const arr = Array.from(files);
      const uploaded = [];
      for (const file of arr) {
        const fd = new FormData();
        fd.append("file", file);
        const result = await client.uploadMedia(fd);
        if (result?.url) {
          uploaded.push({
            name: file.name,
            url: result.url,
            mime_type: file.type || "",
            size: file.size || 0,
            uploaded_at: new Date().toISOString(),
          });
        }
      }
      if (uploaded.length) {
        setFormData((p) => ({ ...p, documents: [...(p.documents || []), ...uploaded] }));
      }
    } catch (e) {
      setSaveError(e?.message || "Document upload failed.");
    } finally {
      setUploadingDocs(false);
    }
  };

  const removeDocument = (idx) => {
    setFormData((p) => ({ ...p, documents: (p.documents || []).filter((_, i) => i !== idx) }));
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
      {saveError && (
        <Banner tone="critical" onDismiss={() => setSaveError("")}>
          {saveError}
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
            <Divider />
            <Text as="h2" variant="headingMd">Company details & documents</Text>
            <TextField
              label="Company legal name"
              value={formData.companyName}
              onChange={(v) => setFormData((p) => ({ ...p, companyName: v }))}
              placeholder="Legal company name"
              autoComplete="organization"
            />
            <InlineStack gap="300" blockAlign="start">
              <Box minWidth="180px">
                <TextField
                  label="Tax ID"
                  value={formData.taxId}
                  onChange={(v) => setFormData((p) => ({ ...p, taxId: v }))}
                  autoComplete="off"
                />
              </Box>
              <Box minWidth="180px">
                <TextField
                  label="VAT ID"
                  value={formData.vatId}
                  onChange={(v) => setFormData((p) => ({ ...p, vatId: v }))}
                  autoComplete="off"
                />
              </Box>
              <Box minWidth="180px">
                <TextField
                  label="IBAN (optional)"
                  value={formData.iban}
                  onChange={(v) => setFormData((p) => ({ ...p, iban: v }))}
                  autoComplete="off"
                />
              </Box>
            </InlineStack>
            <TextField
              label="Website"
              value={formData.website}
              onChange={(v) => setFormData((p) => ({ ...p, website: v }))}
              placeholder="https://..."
              autoComplete="url"
            />
            <Divider />
            <Text as="h3" variant="headingSm">Registered business address</Text>
            <TextField label="Street" value={formData.businessStreet} onChange={(v) => setFormData((p) => ({ ...p, businessStreet: v }))} autoComplete="street-address" />
            <InlineStack gap="300" blockAlign="start">
              <Box minWidth="140px"><TextField label="City" value={formData.businessCity} onChange={(v) => setFormData((p) => ({ ...p, businessCity: v }))} autoComplete="address-level2" /></Box>
              <Box minWidth="140px"><TextField label="Postal code" value={formData.businessPostalCode} onChange={(v) => setFormData((p) => ({ ...p, businessPostalCode: v }))} autoComplete="postal-code" /></Box>
              <Box minWidth="140px"><TextField label="Country" value={formData.businessCountry} onChange={(v) => setFormData((p) => ({ ...p, businessCountry: v }))} autoComplete="country-name" /></Box>
            </InlineStack>
            <Divider />
            <Text as="h3" variant="headingSm">Warehouse / return address</Text>
            <TextField label="Street" value={formData.warehouseStreet} onChange={(v) => setFormData((p) => ({ ...p, warehouseStreet: v }))} autoComplete="street-address" />
            <InlineStack gap="300" blockAlign="start">
              <Box minWidth="140px"><TextField label="City" value={formData.warehouseCity} onChange={(v) => setFormData((p) => ({ ...p, warehouseCity: v }))} autoComplete="address-level2" /></Box>
              <Box minWidth="140px"><TextField label="Postal code" value={formData.warehousePostalCode} onChange={(v) => setFormData((p) => ({ ...p, warehousePostalCode: v }))} autoComplete="postal-code" /></Box>
              <Box minWidth="140px"><TextField label="Country" value={formData.warehouseCountry} onChange={(v) => setFormData((p) => ({ ...p, warehouseCountry: v }))} autoComplete="country-name" /></Box>
            </InlineStack>
            <Divider />
            <Text as="h3" variant="headingSm">Company documents</Text>
            <Text as="p" tone="subdued">
              Upload trade license, tax certificate, registration documents, etc. After saving, status can move to document-submitted.
            </Text>
            <input
              type="file"
              multiple
              accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx"
              onChange={(e) => { handleDocumentUpload(e.target.files); e.target.value = ""; }}
              disabled={uploadingDocs}
            />
            {uploadingDocs && <Text as="p" tone="subdued">Uploading documents…</Text>}
            {(formData.documents || []).length > 0 && (
              <BlockStack gap="100">
                {formData.documents.map((doc, idx) => (
                  <InlineStack key={`${doc.url || doc.name}-${idx}`} align="space-between" blockAlign="center">
                    <a href={doc.url} target="_blank" rel="noreferrer" style={{ fontSize: 13, textDecoration: "underline" }}>
                      {doc.name || doc.url}
                    </a>
                    <Button size="slim" variant="plain" tone="critical" onClick={() => removeDocument(idx)}>Remove</Button>
                  </InlineStack>
                ))}
              </BlockStack>
            )}
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
