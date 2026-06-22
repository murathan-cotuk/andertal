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
  Badge,
  Divider,
} from "@shopify/polaris";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";
import { titleToHandle } from "@/lib/slugify";
import MediaPickerModal from "@/components/MediaPickerModal";
import { confirmDelete } from "@/lib/confirm-delete";
import { useLocale } from "next-intl";
import { getBrandPageCopy } from "@/lib/brand-page-i18n";
import { userError } from "@/lib/api-error-messages";

const getDefaultBaseUrl = () =>
  (process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "").replace(/\/$/, "") ||
  (typeof window !== "undefined" ? "http://localhost:9000" : "");

const EMPTY_FORM = { name: "", handle: "", logo_image: "", banner_image: "", address: "" };

// ── Brand card (display only) ──────────────────────────────────────────────
function BrandCard({ brand, baseUrl, onEdit, canEdit, isSuperuser, copy }) {
  const resolveUrl = (url) => {
    if (!url) return "";
    if (url.startsWith("http") || url.startsWith("data:")) return url;
    return `${baseUrl}${url.startsWith("/") ? "" : "/"}${url}`;
  };
  const logoSrc = brand.logo_image ? resolveUrl(brand.logo_image) : null;
  const bannerSrc = brand.banner_image ? resolveUrl(brand.banner_image) : null;

  return (
    <Card padding="400">
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
        <BlockStack gap="050">
          <Text as="p" variant="bodyMd" fontWeight="semibold">{brand.name}</Text>
          {brand.handle && <Text as="p" variant="bodySm" tone="subdued">{brand.handle}</Text>}
          {brand.address && <Text as="p" variant="bodySm" tone="subdued">{brand.address}</Text>}
        </BlockStack>
        {canEdit && (
          <div style={{ marginLeft: "auto", flexShrink: 0 }}>
            <Button size="slim" variant="secondary" onClick={() => onEdit(brand)}>
              {isSuperuser ? copy.edit : copy.logoBanner}
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}

// ══════════════════════════════════════════════════════════════════════════
export default function BrandPage() {
  const client = getMedusaAdminClient();
  const locale = useLocale();
  const baseUrl = (client.baseURL || getDefaultBaseUrl()).replace(/\/$/, "");

  // Read caller identity from localStorage
  const [callerId, setCallerId] = useState(null);
  const [isSuperuser, setIsSuperuser] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setCallerId(localStorage.getItem("sellerId") || null);
      setIsSuperuser(localStorage.getItem("sellerIsSuperuser") === "true");
    }
  }, []);

  const [brands, setBrands] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingBrand, setEditingBrand] = useState(null); // full brand object (null = create)
  const [saving, setSaving] = useState(false);
  const [logoPickerOpen, setLogoPickerOpen] = useState(false);
  const [bannerPickerOpen, setBannerPickerOpen] = useState(false);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [message, setMessage] = useState({ type: "", text: "" });
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
  const copy = getBrandPageCopy(locale, isSuperuser);

  const loadBrands = () => {
    setLoading(true);
    client.getBrands()
      .then((r) => setBrands(r.brands || []))
      .catch(() => setBrands([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadBrands(); }, []);

  // Split brands: mine vs others
  const myBrands = brands.filter((b) => b.seller_id && b.seller_id === callerId);
  const otherBrands = brands.filter((b) => !b.seller_id || b.seller_id !== callerId);

  const openCreate = () => {
    setEditingBrand(null);
    setFormData(EMPTY_FORM);
    setSlugManuallyEdited(false);
    setMessage({ type: "", text: "" });
    setModalOpen(true);
  };

  const openEdit = (brand) => {
    setEditingBrand(brand);
    setFormData({
      name: brand.name || "",
      handle: brand.handle || "",
      logo_image: brand.logo_image || "",
      banner_image: brand.banner_image || "",
      address: brand.address || "",
    });
    setSlugManuallyEdited(true);
    setMessage({ type: "", text: "" });
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingBrand(null);
    setFormData(EMPTY_FORM);
  };

  const resolveUrl = (url) => {
    if (!url) return "";
    if (url.startsWith("http") || url.startsWith("data:")) return url;
    return `${baseUrl}${url.startsWith("/") ? "" : "/"}${url}`;
  };

  // Can this user edit the given brand?
  const canEditBrand = (brand) => {
    if (isSuperuser) return true;
    return brand.seller_id && brand.seller_id === callerId;
  };

  const handleSubmit = async () => {
    setSaving(true);
    setMessage({ type: "", text: "" });
    try {
      if (editingBrand) {
        // Edit: superusers can change name, others only logo+banner+address
        const payload = {
          logo_image: (formData.logo_image || "").trim() || null,
          banner_image: (formData.banner_image || "").trim() || null,
          address: (formData.address || "").trim() || null,
        };
        if (isSuperuser) {
          payload.name = (formData.name || "").trim() || editingBrand.name;
          payload.handle = (formData.handle || "").trim() || editingBrand.handle;
        }
        await client.updateBrand(editingBrand.id, payload);
        setMessage({ type: "success", text: copy.updated });
      } else {
        const name = (formData.name || "").trim();
        if (!name) {
          setMessage({ type: "error", text: copy.nameRequired });
          setSaving(false);
          return;
        }
        const handle = (formData.handle || "").trim() || titleToHandle(name) || "brand-" + Date.now();
        await client.createBrand({
          name,
          handle,
          logo_image: (formData.logo_image || "").trim() || null,
          banner_image: (formData.banner_image || "").trim() || null,
          address: (formData.address || "").trim() || null,
        });
        setMessage({ type: "success", text: copy.created });
      }
      closeModal();
      loadBrands();
    } catch (e) {
      setMessage({ type: "error", text: userError(e, locale, copy.saveError) });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (brand) => {
    if (!canEditBrand(brand)) return;
    if (!(await confirmDelete(copy.deleteConfirm(brand.name)))) return;
    try {
      await client.deleteBrand(brand.id);
      loadBrands();
    } catch (e) {
      setMessage({ type: "error", text: userError(e, locale, copy.deleteError) });
    }
  };

  // Is the modal in name-editable mode?
  const nameEditable = !editingBrand || isSuperuser;

  return (
    <Page
      title={copy.title}
      primaryAction={{ content: copy.addBrand, onAction: openCreate }}
    >
      <BlockStack gap="400">
        {message.text && (
          <Banner
            tone={message.type === "success" ? "success" : "critical"}
            onDismiss={() => setMessage({ type: "", text: "" })}
          >
            {message.text}
          </Banner>
        )}

        {loading ? (
          <Card>
            <Box padding="800">
              <Text as="p" tone="subdued">{copy.loading}</Text>
            </Box>
          </Card>
        ) : (
          <>
            {/* ── MY BRANDS ─────────────────────────────────────────────── */}
            <Card>
              <BlockStack gap="400">
                <InlineStack gap="200" blockAlign="center">
                  <Text as="h2" variant="headingMd">{copy.myBrands}</Text>
                  {myBrands.length > 0 && <Badge>{myBrands.length}</Badge>}
                </InlineStack>

                {myBrands.length === 0 ? (
                  <Box padding="600" background="bg-surface-secondary" borderRadius="200">
                    <BlockStack gap="100">
                      <Text as="p" variant="bodyMd" fontWeight="semibold">{copy.noBrandsYet}</Text>
                      <Text as="p" tone="subdued">{copy.noBrandsHelp}</Text>
                    </BlockStack>
                  </Box>
                ) : (
                  <BlockStack gap="300">
                    {myBrands.map((brand) => (
                      <BrandCard
                        key={brand.id}
                        brand={brand}
                        baseUrl={baseUrl}
                        onEdit={openEdit}
                        canEdit
                        isSuperuser={isSuperuser}
                        copy={copy}
                      />
                    ))}
                  </BlockStack>
                )}
              </BlockStack>
            </Card>

            {/* ── ALL OTHER BRANDS ──────────────────────────────────────── */}
            {(otherBrands.length > 0 || isSuperuser) && (
              <Card>
                <BlockStack gap="400">
                  <InlineStack gap="200" blockAlign="center">
                    <Text as="h2" variant="headingMd">
                      {copy.allBrands}
                    </Text>
                    {otherBrands.length > 0 && <Badge tone="info">{otherBrands.length}</Badge>}
                  </InlineStack>

                  {!isSuperuser && (
                    <Text as="p" variant="bodySm" tone="subdued">
                      {copy.othersReadonly}
                    </Text>
                  )}

                  {otherBrands.length === 0 ? (
                    <Box padding="400" background="bg-surface-secondary" borderRadius="200">
                      <Text as="p" tone="subdued">{copy.noOtherBrands}</Text>
                    </Box>
                  ) : (
                    <BlockStack gap="300">
                      {otherBrands.map((brand) => (
                        <BrandCard
                          key={brand.id}
                          brand={brand}
                          baseUrl={baseUrl}
                          onEdit={openEdit}
                          canEdit={isSuperuser}
                          isSuperuser={isSuperuser}
                          copy={copy}
                        />
                      ))}
                    </BlockStack>
                  )}
                </BlockStack>
              </Card>
            )}
          </>
        )}
      </BlockStack>

      {/* ── Create / Edit modal ─────────────────────────────────────────── */}
      <Modal
        open={modalOpen}
        onClose={closeModal}
        title={editingBrand ? `${copy.editModal}: ${editingBrand.name}` : copy.addModal}
        primaryAction={{ content: editingBrand ? copy.save : copy.create, onAction: handleSubmit, loading: saving }}
        secondaryActions={[
          ...(editingBrand && canEditBrand(editingBrand) ? [{ content: copy.delete, onAction: () => { closeModal(); handleDelete(editingBrand); }, destructive: true }] : []),
          { content: copy.cancel, onAction: closeModal },
        ]}
      >
        <Modal.Section>
          <BlockStack gap="300">
            {message.text && (
              <Banner tone={message.type === "success" ? "success" : "critical"}>
                {message.text}
              </Banner>
            )}

            <TextField
              label={copy.name}
              value={formData.name}
              onChange={(v) => {
                if (!nameEditable) return;
                setFormData((p) => ({
                  ...p,
                  name: v,
                  handle: slugManuallyEdited ? p.handle : titleToHandle(v),
                }));
              }}
              placeholder={copy.namePlaceholder}
              autoComplete="off"
              disabled={!nameEditable}
              helpText={!nameEditable ? copy.nameLocked : undefined}
            />

            {nameEditable && (
              <TextField
                label={copy.handle}
                value={formData.handle}
                onChange={(v) => { setSlugManuallyEdited(true); setFormData((p) => ({ ...p, handle: v })); }}
                placeholder={copy.handlePlaceholder}
                autoComplete="off"
                helpText={copy.handleHelp}
              />
            )}

            <Divider />

            {/* Logo */}
            <Text as="p" variant="bodyMd" fontWeight="medium">{copy.logo}</Text>
            <InlineStack gap="300" blockAlign="center">
              {formData.logo_image ? (
                <div>
                  <img src={resolveUrl(formData.logo_image)} alt="" style={{ width: 64, height: 64, objectFit: "cover", borderRadius: "50%", border: "1px solid #e5e7eb", display: "block", marginBottom: 4 }} />
                  <Button size="slim" variant="plain" tone="critical" onClick={() => setFormData((p) => ({ ...p, logo_image: "" }))}>{copy.remove}</Button>
                </div>
              ) : (
                <div style={{ width: 64, height: 64, borderRadius: "50%", border: "2px dashed #d1d5db", display: "flex", alignItems: "center", justifyContent: "center", background: "#f9fafb", color: "#9ca3af", fontSize: 20 }}>
                  +
                </div>
              )}
              <Button size="slim" variant="secondary" onClick={() => setLogoPickerOpen(true)}>
                {formData.logo_image ? copy.changeLogo : copy.selectLogo}
              </Button>
            </InlineStack>

            {/* Banner */}
            <Text as="p" variant="bodyMd" fontWeight="medium">{copy.banner}</Text>
            <InlineStack gap="300" blockAlign="center">
              {formData.banner_image ? (
                <div>
                  <img src={resolveUrl(formData.banner_image)} alt="" style={{ width: 160, height: 50, objectFit: "cover", borderRadius: 6, border: "1px solid #e5e7eb", display: "block", marginBottom: 4 }} />
                  <Button size="slim" variant="plain" tone="critical" onClick={() => setFormData((p) => ({ ...p, banner_image: "" }))}>{copy.remove}</Button>
                </div>
              ) : (
                <div style={{ width: 160, height: 50, borderRadius: 6, border: "2px dashed #d1d5db", display: "flex", alignItems: "center", justifyContent: "center", background: "#f9fafb", color: "#9ca3af", fontSize: 11 }}>
                  Banner (21:6)
                </div>
              )}
              <Button size="slim" variant="secondary" onClick={() => setBannerPickerOpen(true)}>
                {formData.banner_image ? copy.changeBanner : copy.selectBanner}
              </Button>
            </InlineStack>

            {isSuperuser && (
              <TextField
                label={copy.address}
                value={formData.address}
                onChange={(v) => setFormData((p) => ({ ...p, address: v }))}
                placeholder={copy.optional}
                multiline={2}
                autoComplete="off"
              />
            )}
          </BlockStack>
        </Modal.Section>
      </Modal>

      {/* Logo picker */}
      <MediaPickerModal
        open={logoPickerOpen}
        onClose={() => setLogoPickerOpen(false)}
        onSelect={(urls) => { if (urls?.[0]) setFormData((p) => ({ ...p, logo_image: urls[0] })); }}
        multiple={false}
        title={copy.selectLogo}
      />

      {/* Banner picker */}
      <MediaPickerModal
        open={bannerPickerOpen}
        onClose={() => setBannerPickerOpen(false)}
        onSelect={(urls) => { if (urls?.[0]) setFormData((p) => ({ ...p, banner_image: urls[0] })); }}
        multiple={false}
        title={copy.selectBanner}
      />
    </Page>
  );
}
