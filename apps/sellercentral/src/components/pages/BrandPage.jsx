"use client";

import React, { useState, useEffect } from "react";
import {
  Page,
  Card,
  Button,
  TextField,
  Text,
  BlockStack,
  InlineStack,
  Banner,
  Box,
  Modal,
} from "@shopify/polaris";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";
import { titleToHandle } from "@/lib/slugify";
import MediaPickerModal from "@/components/MediaPickerModal";

const getDefaultBaseUrl = () =>
  (process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "").replace(/\/$/, "") ||
  (typeof window !== "undefined" ? "http://localhost:9000" : "");

const EMPTY_FORM = { name: "", handle: "", logo_image: "", banner_image: "", address: "" };

export default function BrandPage() {
  const client = getMedusaAdminClient();
  const baseUrl = (client.baseURL || getDefaultBaseUrl()).replace(/\/$/, "");

  const [brands, setBrands] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null); // null = create mode
  const [saving, setSaving] = useState(false);
  const [logoPickerOpen, setLogoPickerOpen] = useState(false);
  const [bannerPickerOpen, setBannerPickerOpen] = useState(false);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [message, setMessage] = useState({ type: "", text: "" });
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);

  const loadBrands = () => {
    setLoading(true);
    client.getBrands()
      .then((r) => setBrands(r.brands || []))
      .catch(() => setBrands([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadBrands(); }, []);

  const openCreate = () => {
    setEditingId(null);
    setFormData(EMPTY_FORM);
    setSlugManuallyEdited(false);
    setMessage({ type: "", text: "" });
    setModalOpen(true);
  };

  const openEdit = (brand) => {
    setEditingId(brand.id);
    setFormData({
      name: brand.name || "",
      handle: brand.handle || "",
      logo_image: brand.logo_image || "",
      banner_image: brand.banner_image || "",
      address: brand.address || "",
    });
    setSlugManuallyEdited(true); // don't auto-change handle when editing
    setMessage({ type: "", text: "" });
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingId(null);
    setFormData(EMPTY_FORM);
  };

  const handleSubmit = async () => {
    const name = (formData.name || "").trim();
    if (!name) {
      setMessage({ type: "error", text: "Brand name is required." });
      return;
    }
    const handle = (formData.handle || "").trim() || titleToHandle(name) || "brand-" + Date.now();
    setSaving(true);
    setMessage({ type: "", text: "" });
    try {
      const payload = {
        name,
        handle,
        logo_image: (formData.logo_image || "").trim() || null,
        banner_image: (formData.banner_image || "").trim() || null,
        address: (formData.address || "").trim() || null,
      };
      if (editingId) {
        await client.updateBrand(editingId, payload);
        setMessage({ type: "success", text: "Brand updated." });
      } else {
        await client.createBrand(payload);
        setMessage({ type: "success", text: "Brand created." });
      }
      closeModal();
      loadBrands();
    } catch (e) {
      setMessage({ type: "error", text: e?.message || "Failed to save brand." });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm("Delete this brand?")) return;
    try {
      await client.deleteBrand(id);
      setMessage({ type: "success", text: "Brand deleted." });
      loadBrands();
    } catch (e) {
      setMessage({ type: "error", text: e?.message || "Failed to delete." });
    }
  };

  const resolveUrl = (url) => {
    if (!url) return "";
    if (url.startsWith("http") || url.startsWith("data:")) return url;
    return `${baseUrl}${url.startsWith("/") ? "" : "/"}${url}`;
  };

  return (
    <Page
      title="Brands"
      primaryAction={{ content: "Add Brand", onAction: openCreate }}
    >
      <BlockStack gap="400">
        {message.text && (
          <Banner
            tone={message.type === "success" ? "success" : message.type === "error" ? "critical" : "info"}
            onDismiss={() => setMessage({ type: "", text: "" })}
          >
            {message.text}
          </Banner>
        )}

        <Card>
          <BlockStack gap="400">
            <Text as="h2" variant="headingMd">
              Your brands
            </Text>

            {loading ? (
              <Box padding="800">
                <Text as="p" tone="subdued">Loading…</Text>
              </Box>
            ) : brands.length === 0 ? (
              <Box padding="800" background="bg-surface-secondary" borderRadius="200">
                <BlockStack gap="200">
                  <Text as="p" variant="bodyMd" fontWeight="semibold">No brands yet</Text>
                  <Text as="p" tone="subdued">Add a brand to use in product form (Brand dropdown).</Text>
                </BlockStack>
              </Box>
            ) : (
              <BlockStack gap="300">
                {brands.map((brand) => {
                  const logoSrc   = brand.logo_image   ? resolveUrl(brand.logo_image)   : null;
                  const bannerSrc = brand.banner_image ? resolveUrl(brand.banner_image) : null;
                  return (
                    <Card key={brand.id} padding="400">
                      {bannerSrc && (
                        <div style={{ marginBottom: 12, borderRadius: 6, overflow: "hidden", height: 60 }}>
                          <img src={bannerSrc} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        </div>
                      )}
                      <div style={{ display: "flex", alignItems: "center", gap: 16, width: "100%" }}>
                        <div style={{ width: 48, height: 48, borderRadius: "50%", overflow: "hidden", background: "var(--p-color-bg-fill-secondary)", border: "1px solid #e5e7eb", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                          {logoSrc ? (
                            <img src={logoSrc} alt={brand.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                          ) : (
                            <Text as="span" variant="bodyMd" tone="subdued">—</Text>
                          )}
                        </div>
                        <BlockStack gap="100">
                          <Text as="p" variant="bodyMd" fontWeight="semibold">{brand.name}</Text>
                          {brand.handle && <Text as="p" variant="bodySm" tone="subdued">{brand.handle}</Text>}
                          {brand.address && <Text as="p" variant="bodySm" tone="subdued">{brand.address}</Text>}
                        </BlockStack>
                        <div style={{ marginLeft: "auto", display: "flex", gap: 8, flexShrink: 0 }}>
                          <Button size="slim" variant="secondary" onClick={() => openEdit(brand)}>Edit</Button>
                          <Button size="slim" variant="plain" tone="critical" onClick={() => handleDelete(brand.id)}>Delete</Button>
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </BlockStack>
            )}
          </BlockStack>
        </Card>
      </BlockStack>

      {/* Create / Edit modal */}
      <Modal
        open={modalOpen}
        onClose={closeModal}
        title={editingId ? "Edit Brand" : "Add Brand"}
        primaryAction={{ content: editingId ? "Save" : "Create", onAction: handleSubmit, loading: saving }}
        secondaryActions={[{ content: "Cancel", onAction: closeModal }]}
      >
        <Modal.Section>
          <BlockStack gap="300">
            <TextField
              label="Name"
              value={formData.name}
              onChange={(v) => setFormData((p) => ({
                ...p,
                name: v,
                handle: (slugManuallyEdited || editingId) ? p.handle : titleToHandle(v),
              }))}
              placeholder="e.g. My Brand"
              autoComplete="off"
            />
            <TextField
              label="Handle"
              value={formData.handle}
              onChange={(v) => { setSlugManuallyEdited(true); setFormData((p) => ({ ...p, handle: v })); }}
              placeholder="e.g. my-brand"
              autoComplete="off"
              helpText="URL-friendly key. Auto-filled from name unless edited."
            />

            {/* Logo */}
            <Text as="p" variant="bodyMd" fontWeight="medium">Logo</Text>
            <InlineStack gap="300" blockAlign="center">
              {formData.logo_image ? (
                <div>
                  <img src={resolveUrl(formData.logo_image)} alt="" style={{ width: 64, height: 64, objectFit: "cover", borderRadius: "50%", border: "1px solid #e5e7eb", display: "block", marginBottom: 4 }} />
                  <Button size="slim" variant="plain" tone="critical" onClick={() => setFormData((p) => ({ ...p, logo_image: "" }))}>Remove</Button>
                </div>
              ) : (
                <div style={{ width: 64, height: 64, borderRadius: "50%", border: "2px dashed #d1d5db", display: "flex", alignItems: "center", justifyContent: "center", background: "#f9fafb", color: "#9ca3af", fontSize: 20 }}>
                  +
                </div>
              )}
              <Button size="slim" variant="secondary" onClick={() => setLogoPickerOpen(true)}>
                {formData.logo_image ? "Görseli değiştir" : "Logo seç"}
              </Button>
            </InlineStack>

            {/* Banner */}
            <Text as="p" variant="bodyMd" fontWeight="medium">Banner</Text>
            <InlineStack gap="300" blockAlign="center">
              {formData.banner_image ? (
                <div>
                  <img src={resolveUrl(formData.banner_image)} alt="" style={{ width: 160, height: 50, objectFit: "cover", borderRadius: 6, border: "1px solid #e5e7eb", display: "block", marginBottom: 4 }} />
                  <Button size="slim" variant="plain" tone="critical" onClick={() => setFormData((p) => ({ ...p, banner_image: "" }))}>Remove</Button>
                </div>
              ) : (
                <div style={{ width: 160, height: 50, borderRadius: 6, border: "2px dashed #d1d5db", display: "flex", alignItems: "center", justifyContent: "center", background: "#f9fafb", color: "#9ca3af", fontSize: 11 }}>
                  Banner (21:6)
                </div>
              )}
              <Button size="slim" variant="secondary" onClick={() => setBannerPickerOpen(true)}>
                {formData.banner_image ? "Görseli değiştir" : "Banner seç"}
              </Button>
            </InlineStack>

            <TextField
              label="Address"
              value={formData.address}
              onChange={(v) => setFormData((p) => ({ ...p, address: v }))}
              placeholder="Optional"
              multiline={2}
              autoComplete="off"
            />
          </BlockStack>
        </Modal.Section>
      </Modal>

      {/* Logo picker */}
      <MediaPickerModal
        open={logoPickerOpen}
        onClose={() => setLogoPickerOpen(false)}
        onSelect={(urls) => { if (urls?.[0]) setFormData((p) => ({ ...p, logo_image: urls[0] })); }}
        multiple={false}
        title="Logo seç"
      />

      {/* Banner picker */}
      <MediaPickerModal
        open={bannerPickerOpen}
        onClose={() => setBannerPickerOpen(false)}
        onSelect={(urls) => { if (urls?.[0]) setFormData((p) => ({ ...p, banner_image: urls[0] })); }}
        multiple={false}
        title="Banner seç"
      />
    </Page>
  );
}
