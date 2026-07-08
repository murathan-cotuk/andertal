"use client";

import React, { useState, useEffect } from "react";
import {
  Page,
  Card,
  Button,
  TextField,
  Select,
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
import { appendMediaFileToFormData } from "@/lib/media-upload";

const getDefaultBaseUrl = () =>
  (process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "").replace(/\/$/, "") ||
  (typeof window !== "undefined" ? "http://localhost:9000" : "");

const EMPTY_FORM = {
  name: "", handle: "", logo_image: "", banner_image: "", address: "",
  brand_type: "own", trademark_number: "", trademark_jurisdiction: "",
};

// Brand status/verification badge (docs/BRAND.md)
function BrandStatusBadge({ brand, copy }) {
  if (brand.status === "pending") return <Badge tone="attention">{copy.statusPending}</Badge>;
  if (brand.status === "rejected") return <Badge tone="critical">{copy.statusRejected}</Badge>;
  if (brand.verification_level === "verified") return <Badge tone="success">{copy.statusVerified}</Badge>;
  if (brand.verification_level === "reseller") return <Badge tone="success">{copy.statusReseller}</Badge>;
  if (brand.verification_level === "unverified") return <Badge>{copy.statusUnverified}</Badge>;
  return null;
}

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
          <InlineStack gap="150" blockAlign="center">
            <Text as="p" variant="bodyMd" fontWeight="semibold">{brand.name}</Text>
            <BrandStatusBadge brand={brand} copy={copy} />
          </InlineStack>
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
  const [authFile, setAuthFile] = useState(null); // { url, name } once uploaded
  const [authFileUploading, setAuthFileUploading] = useState(false);
  const [reuploading, setReuploading] = useState(false);
  const copy = getBrandPageCopy(locale, isSuperuser);

  const handleAuthFileSelect = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setAuthFileUploading(true);
    setMessage({ type: "", text: "" });
    try {
      const fd = new FormData();
      appendMediaFileToFormData(fd, file);
      const r = await client.uploadMedia(fd);
      if (r.url) setAuthFile({ url: r.url, name: file.name });
    } catch (e2) {
      setMessage({ type: "error", text: userError(e2, locale, copy.documentUploadError) });
    } finally {
      setAuthFileUploading(false);
    }
  };

  const documentTypeForBrandType = (brandType) =>
    brandType === "own_registered" ? "trademark_certificate" : "authorization_letter";

  const handleReuploadDocument = async (brand) => {
    if (!authFile) return;
    setReuploading(true);
    setMessage({ type: "", text: "" });
    try {
      await client.uploadBrandAuthDocument(brand.id, {
        document_type: documentTypeForBrandType(brand.brand_type),
        file_url: authFile.url,
        file_name: authFile.name,
      });
      setAuthFile(null);
      setMessage({ type: "success", text: copy.resubmitSuccess });
      closeModal();
      loadBrands();
    } catch (e2) {
      setMessage({ type: "error", text: userError(e2, locale, copy.documentUploadError) });
    } finally {
      setReuploading(false);
    }
  };

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
    setAuthFile(null);
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
      brand_type: brand.brand_type || "own",
      trademark_number: brand.trademark_number || "",
      trademark_jurisdiction: brand.trademark_jurisdiction || "",
    });
    setSlugManuallyEdited(true);
    setMessage({ type: "", text: "" });
    setAuthFile(null);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingBrand(null);
    setFormData(EMPTY_FORM);
    setAuthFile(null);
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
        const brandType = formData.brand_type || "own";
        const needsAuth = !isSuperuser && (brandType === "own_registered" || brandType === "authorized_reseller");
        if (needsAuth) {
          if (brandType === "own_registered" && !formData.trademark_number.trim()) {
            setMessage({ type: "error", text: `${copy.trademarkNumber}: ${copy.nameRequired}` });
            setSaving(false);
            return;
          }
          if (brandType === "own_registered" && !formData.trademark_jurisdiction.trim()) {
            setMessage({ type: "error", text: `${copy.trademarkJurisdiction}: ${copy.nameRequired}` });
            setSaving(false);
            return;
          }
          if (!authFile) {
            setMessage({ type: "error", text: copy.documentRequired });
            setSaving(false);
            return;
          }
        }
        const handle = (formData.handle || "").trim() || titleToHandle(name) || "brand-" + Date.now();
        const created = await client.createBrand({
          name,
          handle,
          logo_image: (formData.logo_image || "").trim() || null,
          banner_image: (formData.banner_image || "").trim() || null,
          address: (formData.address || "").trim() || null,
          brand_type: brandType,
          trademark_number: brandType === "own_registered" ? formData.trademark_number.trim() : undefined,
          trademark_jurisdiction: brandType === "own_registered" ? formData.trademark_jurisdiction.trim() : undefined,
        });
        if (authFile && created?.id) {
          await client.uploadBrandAuthDocument(created.id, {
            document_type: documentTypeForBrandType(brandType),
            file_url: authFile.url,
            file_name: authFile.name,
          }).catch(() => {});
        }
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
        primaryAction={{
          content: editingBrand
            ? copy.save
            : (!isSuperuser && (formData.brand_type === "own_registered" || formData.brand_type === "authorized_reseller"))
              ? copy.submitForReview
              : copy.create,
          onAction: handleSubmit,
          loading: saving,
        }}
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

            {editingBrand && !isSuperuser && editingBrand.status === "pending" && (
              <Banner tone="warning">{copy.pendingBannerText}</Banner>
            )}

            {editingBrand && !isSuperuser && editingBrand.status === "rejected" && (
              <Banner tone="critical">
                <BlockStack gap="200">
                  <Text as="p">{copy.rejectedBannerText(editingBrand.rejection_reason)}</Text>
                  <InlineStack gap="200" blockAlign="center">
                    <Button
                      size="slim"
                      onClick={() => document.getElementById("brand-reupload-input")?.click()}
                      loading={authFileUploading}
                    >
                      {authFile ? authFile.name : copy.chooseFile}
                    </Button>
                    <input id="brand-reupload-input" type="file" accept="application/pdf,image/*" style={{ display: "none" }} onChange={handleAuthFileSelect} />
                    {authFile && (
                      <Button size="slim" variant="primary" onClick={() => handleReuploadDocument(editingBrand)} loading={reuploading}>
                        {copy.reuploadDocument}
                      </Button>
                    )}
                  </InlineStack>
                </BlockStack>
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

            {/* Brand type + authorization (docs/BRAND.md) — only shown when creating, superusers skip this entirely */}
            {!editingBrand && !isSuperuser && (
              <>
                <Select
                  label={copy.brandType}
                  value={formData.brand_type}
                  onChange={(v) => setFormData((p) => ({ ...p, brand_type: v }))}
                  options={[
                    { label: copy.brandTypeOwn, value: "own" },
                    { label: copy.brandTypeRegistered, value: "own_registered" },
                    { label: copy.brandTypeReseller, value: "authorized_reseller" },
                  ]}
                  helpText={
                    formData.brand_type === "own_registered" ? copy.brandTypeRegisteredHelp
                      : formData.brand_type === "authorized_reseller" ? copy.brandTypeResellerHelp
                      : copy.brandTypeOwnHelp
                  }
                />

                {formData.brand_type === "own_registered" && (
                  <>
                    <TextField
                      label={copy.trademarkNumber}
                      value={formData.trademark_number}
                      onChange={(v) => setFormData((p) => ({ ...p, trademark_number: v }))}
                      placeholder={copy.trademarkNumberPlaceholder}
                      autoComplete="off"
                    />
                    <TextField
                      label={copy.trademarkJurisdiction}
                      value={formData.trademark_jurisdiction}
                      onChange={(v) => setFormData((p) => ({ ...p, trademark_jurisdiction: v }))}
                      placeholder={copy.trademarkJurisdictionPlaceholder}
                      autoComplete="off"
                    />
                  </>
                )}

                {(formData.brand_type === "own_registered" || formData.brand_type === "authorized_reseller") && (
                  <BlockStack gap="150">
                    <Text as="p" variant="bodyMd" fontWeight="medium">{copy.authDocument}</Text>
                    <Text as="p" variant="bodySm" tone="subdued">{copy.authDocumentHelp}</Text>
                    <InlineStack gap="200" blockAlign="center">
                      <Button
                        size="slim"
                        onClick={() => document.getElementById("brand-create-doc-input")?.click()}
                        loading={authFileUploading}
                      >
                        {authFile ? authFile.name : copy.chooseFile}
                      </Button>
                      <input id="brand-create-doc-input" type="file" accept="application/pdf,image/*" style={{ display: "none" }} onChange={handleAuthFileSelect} />
                    </InlineStack>
                  </BlockStack>
                )}
              </>
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
