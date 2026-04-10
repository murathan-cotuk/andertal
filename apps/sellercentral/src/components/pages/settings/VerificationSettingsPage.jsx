"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Banner, BlockStack, Box, Button, Card, Checkbox, InlineStack, Link, Text, TextField } from "@shopify/polaris";
import { useLocale } from "next-intl";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";
import { useUnsavedChanges } from "@/context/UnsavedChangesContext";

const tByLocale = (l) => {
  if (l === "tr") {
    return {
      title: "Satıcı Doğrulama",
      subtitle: "Satışa başlayabilmek için yasal onay ve şirket evraklarını tamamlayın.",
      docsSent: "Evraklar gönderildi. İnceleme tamamlanınca burada statünüz güncellenecek.",
      agreementTitle: "Hukuki onay",
      agreementText: "Satıcı ile platform arasındaki hukuki sözleşmeleri okudum ve onaylıyorum.",
      companyTitle: "Şirket bilgileri",
      contactTitle: "İletişim ve adres",
      docsTitle: "Evraklar",
      companyName: "Şirket adı",
      authorizedPerson: "Yetkili kişi adı soyadı",
      taxId: "Vergi numarası",
      vatId: "KDV numarası",
      iban: "IBAN",
      phone: "Telefon numarası",
      street: "Adres (sokak, bina no)",
      city: "Şehir",
      postalCode: "Posta kodu",
      country: "Ülke",
      docTypes: {
        trade_register: "Ticaret sicil belgesi",
        id_passport: "Kimlik / Pasaport",
        tax_document: "Vergi levhası (opsiyonel)",
      },
      uploadBtn: "Dosya seç",
      uploaded: "Yüklendi",
      notUploaded: "Henüz yüklenmedi",
      required: "Zorunlu",
      optional: "Opsiyonel",
      submit: "Doğrulama için gönder",
      saving: "Kaydediliyor...",
      needAgreement: "Devam etmek için sözleşme onayı gerekli.",
      needDocs: "Ticaret sicil belgesi ve kimlik/pasaport yüklemelisiniz.",
      saveOk: "Bilgiler kaydedildi ve doğrulama süreci başlatıldı.",
      statusLabel: "Hesap durumu",
      status: {
        registered: "Kayıt oldu - satış öncesi doğrulama gerekli",
        documents_submitted: "Evraklar gönderildi - inceleme bekleniyor",
        pending_approval: "Onay bekliyor",
        pending: "Onay bekliyor",
        approved: "Hesap onaylandı - satış yapabilirsiniz",
        active: "Hesap onaylandı - satış yapabilirsiniz",
        rejected: "Başvuru reddedildi - destek ile iletişime geçin",
        suspended: "Hesap askıya alındı - destek ile iletişime geçin",
      },
    };
  }
  if (l === "de") {
    return {
      title: "Verifizierung",
      subtitle: "Schließe rechtliche Bestätigung und Unternehmensdokumente ab, um mit dem Verkauf zu starten.",
      docsSent: "Dokumente wurden gesendet. Der Status wird nach der Prüfung hier aktualisiert.",
      agreementTitle: "Rechtliche Bestätigung",
      agreementText: "Ich habe die rechtlichen Vereinbarungen zwischen Verkäufer und Plattform gelesen und akzeptiere sie.",
      companyTitle: "Firmendaten",
      contactTitle: "Kontakt & Adresse",
      docsTitle: "Dokumente",
      companyName: "Firmenname",
      authorizedPerson: "Bevollmächtigte Person (Vor- und Nachname)",
      taxId: "Steuernummer",
      vatId: "USt-IdNr.",
      iban: "IBAN",
      phone: "Telefonnummer",
      street: "Straße und Hausnummer",
      city: "Stadt",
      postalCode: "Postleitzahl",
      country: "Land",
      docTypes: {
        trade_register: "Handelsregisterauszug",
        id_passport: "Ausweis / Reisepass",
        tax_document: "Steuerdokument (optional)",
      },
      uploadBtn: "Datei auswählen",
      uploaded: "Hochgeladen",
      notUploaded: "Noch nicht hochgeladen",
      required: "Pflichtfeld",
      optional: "Optional",
      submit: "Zur Verifizierung senden",
      saving: "Wird gespeichert...",
      needAgreement: "Bitte bestätige zuerst die rechtliche Vereinbarung.",
      needDocs: "Bitte lade Handelsregisterauszug und Ausweis/Reisepass hoch.",
      saveOk: "Daten gespeichert und zur Verifizierung eingereicht.",
      statusLabel: "Kontostatus",
      status: {
        registered: "Registriert - Verifizierung vor dem Verkauf erforderlich",
        documents_submitted: "Dokumente eingereicht - Prüfung läuft",
        pending_approval: "Wartet auf Freigabe",
        pending: "Wartet auf Freigabe",
        approved: "Konto bestätigt - Verkauf ist möglich",
        active: "Konto bestätigt - Verkauf ist möglich",
        rejected: "Abgelehnt - bitte Support kontaktieren",
        suspended: "Gesperrt - bitte Support kontaktieren",
      },
    };
  }
  return {
    title: "Seller Verification",
    subtitle: "Complete legal confirmation and company documents before you can start selling.",
    docsSent: "Documents submitted. Your status will be updated here after review.",
    agreementTitle: "Legal confirmation",
    agreementText: "I have read and agree to the legal agreements between seller and platform.",
    companyTitle: "Company details",
    contactTitle: "Contact & address",
    docsTitle: "Documents",
    companyName: "Company name",
    authorizedPerson: "Authorized person (full name)",
    taxId: "Tax ID",
    vatId: "VAT ID",
    iban: "IBAN",
    phone: "Phone number",
    street: "Street address",
    city: "City",
    postalCode: "Postal code",
    country: "Country",
    docTypes: {
      trade_register: "Trade register extract",
      id_passport: "ID / Passport",
      tax_document: "Tax document (optional)",
    },
    uploadBtn: "Choose file",
    uploaded: "Uploaded",
    notUploaded: "Not uploaded yet",
    required: "Required",
    optional: "Optional",
    submit: "Submit for verification",
    saving: "Saving...",
    needAgreement: "Please accept the legal agreement to continue.",
    needDocs: "Please upload trade register extract and ID/Passport.",
    saveOk: "Saved successfully and submitted for verification.",
    statusLabel: "Account status",
    status: {
      registered: "Registered - verification required before selling",
      documents_submitted: "Documents submitted - under review",
      pending_approval: "Pending approval",
      pending: "Pending approval",
      approved: "Approved account - you can sell now",
      active: "Approved account - you can sell now",
      rejected: "Rejected - please contact support",
      suspended: "Suspended - please contact support",
    },
  };
};

const statusTone = (status) => {
  const s = String(status || "").toLowerCase();
  if (s === "approved" || s === "active") return "success";
  if (s === "rejected" || s === "suspended") return "critical";
  if (s === "documents_submitted" || s === "pending_approval" || s === "pending") return "warning";
  return "info";
};

const DOC_TYPES = ["trade_register", "id_passport", "tax_document"];
const DOC_REQUIRED = { trade_register: true, id_passport: true, tax_document: false };

function DocUploadRow({ label, docType, doc, onUpload, uploading, t }) {
  const inputId = `doc-upload-${docType}`;
  const isRequired = DOC_REQUIRED[docType];
  return (
    <Box borderWidth="025" borderColor="border" borderRadius="200" padding="300">
      <InlineStack align="space-between" blockAlign="center" wrap gap="200">
        <BlockStack gap="100">
          <InlineStack gap="150" blockAlign="center">
            <Text as="span" variant="bodyMd" fontWeight="semibold">{label}</Text>
            <Text as="span" variant="bodySm" tone="subdued">({isRequired ? t.required : t.optional})</Text>
          </InlineStack>
          {doc ? (
            <InlineStack gap="150" blockAlign="center">
              <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "#10b981", flexShrink: 0 }} />
              <Text as="span" variant="bodySm" tone="success">{t.uploaded}: {doc.name || doc.url?.split("/").pop() || "file"}</Text>
            </InlineStack>
          ) : (
            <InlineStack gap="150" blockAlign="center">
              <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "#9ca3af", flexShrink: 0 }} />
              <Text as="span" variant="bodySm" tone="subdued">{t.notUploaded}</Text>
            </InlineStack>
          )}
        </BlockStack>
        <div>
          <input
            id={inputId}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png"
            style={{ display: "none" }}
            onChange={(e) => e.target.files?.[0] && onUpload(docType, e.target.files[0])}
          />
          <Button size="slim" onClick={() => document.getElementById(inputId)?.click()} loading={uploading}>
            {t.uploadBtn}
          </Button>
        </div>
      </InlineStack>
    </Box>
  );
}

export default function VerificationSettingsPage() {
  const unsaved = useUnsavedChanges();
  const locale = useLocale();
  const t = useMemo(() => tByLocale(locale), [locale]);
  const client = getMedusaAdminClient();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [status, setStatus] = useState("registered");
  const [agreementAccepted, setAgreementAccepted] = useState(false);
  const [uploadingDocType, setUploadingDocType] = useState(null);
  const [initialSnapshot, setInitialSnapshot] = useState(null);
  const [form, setForm] = useState({
    companyName: "",
    authorizedPersonName: "",
    taxId: "",
    vatId: "",
    iban: "",
    phone: "",
    street: "",
    city: "",
    postalCode: "",
    country: "",
    docs: { trade_register: null, id_passport: null, tax_document: null },
  });
  const snapshotFrom = useCallback((nextForm, nextAgreement) => {
    return JSON.stringify({
      agreementAccepted: !!nextAgreement,
      companyName: nextForm.companyName || "",
      authorizedPersonName: nextForm.authorizedPersonName || "",
      taxId: nextForm.taxId || "",
      vatId: nextForm.vatId || "",
      iban: nextForm.iban || "",
      phone: nextForm.phone || "",
      street: nextForm.street || "",
      city: nextForm.city || "",
      postalCode: nextForm.postalCode || "",
      country: nextForm.country || "",
      docs: DOC_TYPES.map((dt) => ({
        doc_type: dt,
        url: nextForm.docs?.[dt]?.url || null,
        name: nextForm.docs?.[dt]?.name || null,
      })),
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [, account] = await Promise.all([
          client.getSellerSettings(),
          client.getSellerAccount(),
        ]);
        if (cancelled) return;
        const seller = account?.sellerUser || account?.user || {};
        const s = String(seller?.approval_status || "registered").toLowerCase();
        setStatus(s);
        if (typeof window !== "undefined") localStorage.setItem("sellerApprovalStatus", s);
        const addr = seller?.business_address || {};
        // Map stored documents array to typed slots
        const storedDocs = Array.isArray(seller?.documents) ? seller.documents : [];
        const docs = { trade_register: null, id_passport: null, tax_document: null };
        storedDocs.forEach((d) => {
          if (d?.doc_type && docs.hasOwnProperty(d.doc_type)) docs[d.doc_type] = d;
        });
        const nextForm = {
          companyName: seller?.company_name || "",
          authorizedPersonName: seller?.authorized_person_name || "",
          taxId: seller?.tax_id || "",
          vatId: seller?.vat_id || "",
          iban: seller?.iban || "",
          phone: seller?.phone || "",
          street: addr?.street || "",
          city: addr?.city || "",
          postalCode: addr?.postal_code || "",
          country: addr?.country || "",
          docs,
        };
        setForm((p) => ({
          ...p,
          ...nextForm,
        }));
        const nextAgreement = s !== "registered";
        setAgreementAccepted(nextAgreement);
        setInitialSnapshot(snapshotFrom(nextForm, nextAgreement));
      } catch (e) {
        if (!cancelled) setError(e?.message || "Failed to load verification data.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [client, snapshotFrom]);

  const handleDocUpload = async (docType, file) => {
    setUploadingDocType(docType);
    setError("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const result = await client.uploadMedia(fd);
      if (result?.url) {
        setForm((p) => ({
          ...p,
          docs: {
            ...p.docs,
            [docType]: { doc_type: docType, name: file.name, url: result.url, mime_type: file.type || "", size: file.size || 0, uploaded_at: new Date().toISOString() },
          },
        }));
      }
    } catch (e) {
      setError(e?.message || "Upload failed.");
    } finally {
      setUploadingDocType(null);
    }
  };

  const saveVerification = async () => {
    setError("");
    setSuccess("");
    if (!agreementAccepted) { setError(t.needAgreement); return; }
    if (!form.docs.trade_register || !form.docs.id_passport) { setError(t.needDocs); return; }
    setSaving(true);
    try {
      const documents = DOC_TYPES.map((dt) => form.docs[dt]).filter(Boolean);
      await client.updateSellerCompanyInfo({
        company_name: form.companyName.trim() || null,
        authorized_person_name: form.authorizedPersonName.trim() || null,
        tax_id: form.taxId.trim() || null,
        vat_id: form.vatId.trim() || null,
        phone: form.phone.trim() || null,
        business_address: {
          street: form.street.trim() || null,
          city: form.city.trim() || null,
          postal_code: form.postalCode.trim() || null,
          country: form.country.trim() || null,
        },
        documents,
      });
      await client.updateSellerIban(form.iban.trim() || null);
      // Run the verification pipeline — auto-scores and advances status
      let pipelineResult = null;
      try { pipelineResult = await client.startVerification(); } catch (_) {}
      const account = await client.getSellerAccount();
      const s = String(
        pipelineResult?.approval_status ||
        account?.sellerUser?.approval_status ||
        account?.user?.approval_status ||
        "documents_submitted"
      ).toLowerCase();
      setStatus(s);
      if (typeof window !== "undefined") localStorage.setItem("sellerApprovalStatus", s);
      setSuccess(t.saveOk);
      setInitialSnapshot(snapshotFrom(form, agreementAccepted));
    } catch (e) {
      const rawMsg = String(e?.message || "");
      if (rawMsg.toLowerCase().includes("invalid input syntax for type json")) {
        setError(locale === "tr"
          ? "Doğrulama verileri hatalı formatta gönderildi. Lütfen adres ve belge alanlarını kontrol edip tekrar deneyin."
          : locale === "de"
            ? "Ungültiges Datenformat für die Verifizierung. Bitte Adress- und Dokumentfelder prüfen und erneut senden."
            : "Invalid verification data format. Please review address and document fields and try again.");
      } else {
        setError(e?.message || "Save failed.");
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <Text as="p" tone="subdued">Loading...</Text>
      </Card>
    );
  }

  const normalizedStatus = String(status || "registered").toLowerCase();
  const isDocsSubmittedOrBeyond = ["documents_submitted", "pending_approval", "pending", "approved", "active", "rejected", "suspended"].includes(normalizedStatus);
  const isDirty = !loading && initialSnapshot !== null && snapshotFrom(form, agreementAccepted) !== initialSnapshot;

  const discardVerification = useCallback(() => {
    if (!initialSnapshot) return;
    try {
      const snap = JSON.parse(initialSnapshot);
      setAgreementAccepted(!!snap.agreementAccepted);
      setForm((p) => ({
        ...p,
        companyName: snap.companyName || "",
        authorizedPersonName: snap.authorizedPersonName || "",
        taxId: snap.taxId || "",
        vatId: snap.vatId || "",
        iban: snap.iban || "",
        phone: snap.phone || "",
        street: snap.street || "",
        city: snap.city || "",
        postalCode: snap.postalCode || "",
        country: snap.country || "",
        docs: DOC_TYPES.reduce((acc, dt) => {
          const hit = (snap.docs || []).find((d) => d?.doc_type === dt);
          acc[dt] = hit?.url ? { doc_type: dt, name: hit?.name || "", url: hit.url } : null;
          return acc;
        }, {}),
      }));
      setError("");
      setSuccess("");
    } catch (_) {}
  }, [initialSnapshot]);

  useEffect(() => {
    if (!unsaved) return;
    unsaved.setDirty(isDirty);
    unsaved.setHandlers({ onSave: saveVerification, onDiscard: discardVerification });
    return () => {
      unsaved.clearHandlers();
      unsaved.setDirty(false);
    };
  }, [unsaved, isDirty, saveVerification, discardVerification]);

  return (
    <BlockStack gap="400">
      <Card>
        <BlockStack gap="200">
          <Text as="h2" variant="headingMd">{t.title}</Text>
          <Text as="p" tone="subdued">{t.subtitle}</Text>
        </BlockStack>
      </Card>

      <Banner tone={statusTone(normalizedStatus)}>
        <InlineStack align="space-between" blockAlign="center" wrap>
          <Text as="p"><strong>{t.statusLabel}:</strong> {t.status[normalizedStatus] || normalizedStatus}</Text>
          {normalizedStatus === "registered" && (
            <Link url="/settings/verification">{locale === "tr" ? "Doğrulamaya git" : locale === "de" ? "Zur Verifizierung" : "Go to verification"} →</Link>
          )}
        </InlineStack>
      </Banner>

      {success && (
        <Banner tone="success" onDismiss={() => setSuccess("")}>{success}</Banner>
      )}
      {error && (
        <Banner tone="critical" onDismiss={() => setError("")}>{error}</Banner>
      )}

      {isDocsSubmittedOrBeyond ? (
        <Card>
          <Text as="p" tone="subdued">{t.docsSent}</Text>
        </Card>
      ) : (
        <>
          {/* Agreement */}
          <Card>
            <BlockStack gap="300">
              <Text as="h3" variant="headingSm">{t.agreementTitle}</Text>
              <Checkbox
                label={t.agreementText}
                checked={agreementAccepted}
                onChange={setAgreementAccepted}
              />
            </BlockStack>
          </Card>

          {/* Company details */}
          <Card>
            <BlockStack gap="300">
              <Text as="h3" variant="headingSm">{t.companyTitle}</Text>
              <TextField label={t.companyName} value={form.companyName} onChange={(v) => setForm((p) => ({ ...p, companyName: v }))} autoComplete="off" />
              <TextField label={t.authorizedPerson} value={form.authorizedPersonName} onChange={(v) => setForm((p) => ({ ...p, authorizedPersonName: v }))} autoComplete="off" />
              <InlineStack gap="300">
                <div style={{ flex: 1 }}>
                  <TextField label={t.taxId} value={form.taxId} onChange={(v) => setForm((p) => ({ ...p, taxId: v }))} autoComplete="off" />
                </div>
                <div style={{ flex: 1 }}>
                  <TextField label={t.vatId} value={form.vatId} onChange={(v) => setForm((p) => ({ ...p, vatId: v }))} autoComplete="off" />
                </div>
              </InlineStack>
              <TextField label={t.iban} value={form.iban} onChange={(v) => setForm((p) => ({ ...p, iban: v }))} autoComplete="off" />
            </BlockStack>
          </Card>

          {/* Contact & address */}
          <Card>
            <BlockStack gap="300">
              <Text as="h3" variant="headingSm">{t.contactTitle}</Text>
              <TextField label={t.phone} value={form.phone} onChange={(v) => setForm((p) => ({ ...p, phone: v }))} autoComplete="off" type="tel" />
              <TextField label={t.street} value={form.street} onChange={(v) => setForm((p) => ({ ...p, street: v }))} autoComplete="off" />
              <InlineStack gap="300">
                <div style={{ flex: 1 }}>
                  <TextField label={t.city} value={form.city} onChange={(v) => setForm((p) => ({ ...p, city: v }))} autoComplete="off" />
                </div>
                <div style={{ flex: 1 }}>
                  <TextField label={t.postalCode} value={form.postalCode} onChange={(v) => setForm((p) => ({ ...p, postalCode: v }))} autoComplete="off" />
                </div>
              </InlineStack>
              <TextField label={t.country} value={form.country} onChange={(v) => setForm((p) => ({ ...p, country: v }))} autoComplete="off" />
            </BlockStack>
          </Card>

          {/* Documents */}
          <Card>
            <BlockStack gap="300">
              <Text as="h3" variant="headingSm">{t.docsTitle}</Text>
              {DOC_TYPES.map((dt) => (
                <DocUploadRow
                  key={dt}
                  label={t.docTypes[dt]}
                  docType={dt}
                  doc={form.docs[dt]}
                  onUpload={handleDocUpload}
                  uploading={uploadingDocType === dt}
                  t={t}
                />
              ))}
            </BlockStack>
          </Card>

          {/* Submit */}
          <InlineStack align="end">
            <Button variant="primary" onClick={saveVerification} loading={saving}>
              {saving ? t.saving : t.submit}
            </Button>
          </InlineStack>
        </>
      )}
    </BlockStack>
  );
}
