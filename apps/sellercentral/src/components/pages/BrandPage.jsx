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
import { getBrandPageCopy, getBrandAuthorizationsPageCopy } from "@/lib/brand-page-i18n";
import { userError } from "@/lib/api-error-messages";
import { appendMediaFileToFormData } from "@/lib/media-upload";

const getDefaultBaseUrl = () =>
  (process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "").replace(/\/$/, "") ||
  (typeof window !== "undefined" ? "http://localhost:9000" : "");

const EMPTY_FORM = {
  name: "", handle: "", logo_image: "", banner_image: "", address: "",
  brand_type: "own", trademark_number: "", trademark_jurisdiction: "",
};

const BRANDS_PAGE_SIZE = 100; // 4 per row x 25 rows

// Brand status/verification badge (docs/BRAND.md)
function BrandStatusBadge({ brand, copy }) {
  if (brand.status === "pending") return <Badge tone="attention">{copy.statusPending}</Badge>;
  if (brand.status === "rejected") return <Badge tone="critical">{copy.statusRejected}</Badge>;
  if (brand.verification_level === "verified") return <Badge tone="success">{copy.statusVerified}</Badge>;
  if (brand.verification_level === "reseller") return <Badge tone="success">{copy.statusReseller}</Badge>;
  if (brand.verification_level === "unverified") return <Badge>{copy.statusUnverified}</Badge>;
  return null;
}

// ── Brand card (grid tile) ─────────────────────────────────────────────────
function BrandCard({ brand, baseUrl, onEdit, canEdit, isSuperuser, isMine, copy }) {
  const resolveUrl = (url) => {
    if (!url) return "";
    if (url.startsWith("http") || url.startsWith("data:")) return url;
    return `${baseUrl}${url.startsWith("/") ? "" : "/"}${url}`;
  };
  const logoSrc = brand.logo_image ? resolveUrl(brand.logo_image) : null;
  const bannerSrc = brand.banner_image ? resolveUrl(brand.banner_image) : null;

  return (
    <Card padding="300">
      <BlockStack gap="200">
        {bannerSrc && (
          <div style={{ borderRadius: 6, overflow: "hidden", height: 56 }}>
            <img src={bannerSrc} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          </div>
        )}
        <InlineStack gap="200" blockAlign="center" wrap={false}>
          <div style={{ width: 40, height: 40, borderRadius: "50%", overflow: "hidden", background: "var(--p-color-bg-fill-secondary)", border: "1px solid #e5e7eb", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
            {logoSrc ? (
              <img src={logoSrc} alt={brand.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            ) : (
              <Text as="span" variant="bodyMd" tone="subdued">—</Text>
            )}
          </div>
          <BlockStack gap="050">
            <Text as="p" variant="bodyMd" fontWeight="semibold" truncate>{brand.name}</Text>
            {brand.handle && <Text as="p" variant="bodySm" tone="subdued" truncate>{brand.handle}</Text>}
          </BlockStack>
        </InlineStack>

        <InlineStack gap="150" wrap>
          <BrandStatusBadge brand={brand} copy={copy} />
          {isMine && <Badge tone="info">{copy.myBrands}</Badge>}
        </InlineStack>

        {canEdit && (
          <Button size="slim" variant="secondary" fullWidth onClick={() => onEdit(brand)}>
            {isSuperuser ? copy.edit : copy.logoBanner}
          </Button>
        )}
      </BlockStack>
    </Card>
  );
}

// ── Pending authorization card (full-width review row) ─────────────────────
function PendingBrandCard({ brand, authCopy, baseUrl, onApprove, onReject, busy }) {
  const resolveUrl = (url) => {
    if (!url) return "";
    if (url.startsWith("http") || url.startsWith("data:")) return url;
    return `${baseUrl}${url.startsWith("/") ? "" : "/"}${url}`;
  };
  const isReseller = brand.brand_type === "authorized_reseller";

  return (
    <Card padding="400">
      <BlockStack gap="300">
        <InlineStack align="space-between" blockAlign="center">
          <BlockStack gap="050">
            <InlineStack gap="150" blockAlign="center">
              <Text as="p" variant="bodyMd" fontWeight="semibold">{brand.name}</Text>
              <Badge tone="attention">{isReseller ? authCopy.typeReseller : authCopy.typeRegistered}</Badge>
            </InlineStack>
            <Text as="p" variant="bodySm" tone="subdued">{authCopy.seller}: {brand.seller_name || brand.seller_id}</Text>
            {brand.created_at && (
              <Text as="p" variant="bodySm" tone="subdued">{authCopy.submittedOn}: {new Date(brand.created_at).toLocaleString()}</Text>
            )}
          </BlockStack>
          <InlineStack gap="200">
            <Button size="slim" tone="critical" onClick={() => onReject(brand)} disabled={busy}>{authCopy.reject}</Button>
            <Button size="slim" variant="primary" onClick={() => onApprove(brand)} loading={busy}>{authCopy.approve}</Button>
          </InlineStack>
        </InlineStack>

        {!isReseller && (brand.trademark_number || brand.trademark_jurisdiction) && (
          <Text as="p" variant="bodySm">
            {authCopy.trademark}: {brand.trademark_number || "—"} ({brand.trademark_jurisdiction || "—"})
          </Text>
        )}

        <Divider />

        <BlockStack gap="150">
          <Text as="p" variant="bodySm" fontWeight="medium">{authCopy.documents}</Text>
          {(!brand.documents || brand.documents.length === 0) ? (
            <Text as="p" variant="bodySm" tone="subdued">{authCopy.noDocuments}</Text>
          ) : (
            <BlockStack gap="100">
              {brand.documents.map((doc) => (
                <InlineStack key={doc.id} gap="200" blockAlign="center">
                  <Text as="span" variant="bodySm">{doc.document_type}{doc.file_name ? ` — ${doc.file_name}` : ""}</Text>
                  <Button size="slim" variant="plain" url={resolveUrl(doc.file_url)} target="_blank">
                    {authCopy.viewDocument}
                  </Button>
                </InlineStack>
              ))}
            </BlockStack>
          )}
        </BlockStack>
      </BlockStack>
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
  const [page, setPage] = useState(1);
  const copy = getBrandPageCopy(locale, isSuperuser);
  const authCopy = getBrandAuthorizationsPageCopy(locale);

  // ── Pending authorizations (superuser review queue — merged in from the old
  // standalone /content/brands/authorizations page) ───────────────────────
  const [pendingBrands, setPendingBrands] = useState([]);
  const [pendingLoading, setPendingLoading] = useState(true);
  const [authBusyId, setAuthBusyId] = useState(null);
  const [rejectTarget, setRejectTarget] = useState(null); // brand or null
  const [rejectReason, setRejectReason] = useState("");
  const [rejecting, setRejecting] = useState(false);

  const loadPending = () => {
    if (!isSuperuser) { setPendingLoading(false); return; }
    setPendingLoading(true);
    client.getPendingBrandAuthorizations()
      .then((r) => setPendingBrands(r.brands || []))
      .catch(() => setPendingBrands([]))
      .finally(() => setPendingLoading(false));
  };

  useEffect(() => { loadPending(); }, [isSuperuser]);

  const handleApprove = async (brand) => {
    setAuthBusyId(brand.id);
    setMessage({ type: "", text: "" });
    try {
      await client.approveBrandAuthorization(brand.id);
      setMessage({ type: "success", text: authCopy.approved });
      loadPending();
      loadBrands();
    } catch (e) {
      setMessage({ type: "error", text: userError(e, locale, authCopy.actionError) });
    } finally {
      setAuthBusyId(null);
    }
  };

  const openReject = (brand) => {
    setRejectTarget(brand);
    setRejectReason("");
  };

  const confirmReject = async () => {
    if (!rejectTarget) return;
    setRejecting(true);
    setMessage({ type: "", text: "" });
    try {
      await client.rejectBrandAuthorization(rejectTarget.id, rejectReason.trim());
      setMessage({ type: "success", text: authCopy.rejected });
      setRejectTarget(null);
      loadPending();
      loadBrands();
    } catch (e) {
      setMessage({ type: "error", text: userError(e, locale, authCopy.actionError) });
    } finally {
      setRejecting(false);
    }
  };

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

  // Split brands: mine vs others, then flatten into one paginated grid (mine first)
  const myBrands = brands.filter((b) => b.seller_id && b.seller_id === callerId);
  const otherBrands = brands.filter((b) => !b.seller_id || b.seller_id !== callerId);
  const allBrandsOrdered = [...myBrands, ...otherBrands];
  const totalPages = Math.max(1, Math.ceil(allBrandsOrdered.length / BRANDS_PAGE_SIZE));
  const pageSafe = Math.min(Math.max(1, page), totalPages);
  const pagedBrands = allBrandsOrdered.slice((pageSafe - 1) * BRANDS_PAGE_SIZE, pageSafe * BRANDS_PAGE_SIZE);

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

        {/* ── PENDING AUTHORIZATIONS (superuser only, always on top) ───────── */}
        {isSuperuser && (
          <Card>
            <BlockStack gap="400">
              <BlockStack gap="050">
                <Text as="h2" variant="headingMd">{authCopy.title}</Text>
                <Text as="p" variant="bodySm" tone="subdued">{authCopy.subtitle}</Text>
              </BlockStack>

              {pendingLoading ? (
                <Text as="p" tone="subdued">{authCopy.loading}</Text>
              ) : pendingBrands.length === 0 ? (
                <Box padding="400" background="bg-surface-secondary" borderRadius="200">
                  <Text as="p" tone="subdued">{authCopy.empty}</Text>
                </Box>
              ) : (
                <BlockStack gap="300">
                  {pendingBrands.map((brand) => (
                    <PendingBrandCard
                      key={brand.id}
                      brand={brand}
                      authCopy={authCopy}
                      baseUrl={baseUrl}
                      onApprove={handleApprove}
                      onReject={openReject}
                      busy={authBusyId === brand.id}
                    />
                  ))}
                </BlockStack>
              )}
            </BlockStack>
          </Card>
        )}

        {/* ── ALL BRANDS (paginated grid: 4 per row, 100 per page) ─────────── */}
        <Card>
          <BlockStack gap="400">
            <InlineStack align="space-between" blockAlign="center">
              <InlineStack gap="200" blockAlign="center">
                <Text as="h2" variant="headingMd">{copy.title}</Text>
                {allBrandsOrdered.length > 0 && <Badge tone="info">{allBrandsOrdered.length}</Badge>}
              </InlineStack>
              {totalPages > 1 && (
                <InlineStack gap="200" blockAlign="center">
                  <Button size="slim" disabled={pageSafe <= 1} onClick={() => setPage(pageSafe - 1)}>‹</Button>
                  <Text as="span" variant="bodySm" tone="subdued">{pageSafe} / {totalPages}</Text>
                  <Button size="slim" disabled={pageSafe >= totalPages} onClick={() => setPage(pageSafe + 1)}>›</Button>
                </InlineStack>
              )}
            </InlineStack>

            {loading ? (
              <Box padding="800">
                <Text as="p" tone="subdued">{copy.loading}</Text>
              </Box>
            ) : allBrandsOrdered.length === 0 ? (
              <Box padding="600" background="bg-surface-secondary" borderRadius="200">
                <BlockStack gap="100">
                  <Text as="p" variant="bodyMd" fontWeight="semibold">{copy.noBrandsYet}</Text>
                  <Text as="p" tone="subdued">{copy.noBrandsHelp}</Text>
                </BlockStack>
              </Box>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 16 }}>
                {pagedBrands.map((brand) => (
                  <BrandCard
                    key={brand.id}
                    brand={brand}
                    baseUrl={baseUrl}
                    onEdit={openEdit}
                    canEdit={canEditBrand(brand)}
                    isSuperuser={isSuperuser}
                    isMine={!!brand.seller_id && brand.seller_id === callerId}
                    copy={copy}
                  />
                ))}
              </div>
            )}
          </BlockStack>
        </Card>
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

      {/* ── Reject pending authorization modal ───────────────────────────── */}
      <Modal
        open={!!rejectTarget}
        onClose={() => setRejectTarget(null)}
        title={rejectTarget ? `${authCopy.confirmReject}: ${rejectTarget.name}` : authCopy.confirmReject}
        primaryAction={{ content: authCopy.reject, onAction: confirmReject, loading: rejecting, destructive: true }}
        secondaryActions={[{ content: authCopy.cancel, onAction: () => setRejectTarget(null) }]}
      >
        <Modal.Section>
          <TextField
            label={authCopy.rejectReasonLabel}
            value={rejectReason}
            onChange={setRejectReason}
            multiline={3}
            autoComplete="off"
          />
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
