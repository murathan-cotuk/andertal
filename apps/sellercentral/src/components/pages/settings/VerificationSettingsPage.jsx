"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Banner, BlockStack, Box, Button, Card, Checkbox, InlineStack, Spinner, Text, TextField } from "@shopify/polaris";
import { useLocale } from "next-intl";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";
import { useUnsavedChanges } from "@/context/UnsavedChangesContext";

const PHONE_CODES = [
  { code: "DE", dial: "+49" },
  { code: "AT", dial: "+43" },
  { code: "CH", dial: "+41" },
  { code: "TR", dial: "+90" },
  { code: "FR", dial: "+33" },
  { code: "NL", dial: "+31" },
  { code: "BE", dial: "+32" },
  { code: "PL", dial: "+48" },
  { code: "IT", dial: "+39" },
  { code: "ES", dial: "+34" },
  { code: "GB", dial: "+44" },
  { code: "US", dial: "+1" },
];

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
      taxIdHelp: "Örn. 1234567890 — Vergi dairesinden alınan 10 haneli vergi numarası (KDV numarasından farklıdır).",
      vatId: "KDV numarası",
      vatIdHelp: "Örn. DE123456789 — KDV mükellefleri için. Uluslararası satış yapıyorsanız zorunludur.",
      iban: "IBAN",
      phone: "Telefon numarası",
      phoneCountry: "Ülke kodu",
      street: "Adres (sokak, bina no)",
      city: "Şehir",
      postalCode: "Posta kodu",
      country: "Ülke",
      docTypes: {
        trade_register: "Ticaret sicil belgesi",
        id_passport: "Kimlik / Pasaport",
        tax_document: "Vergi levhası (opsiyonel)",
      },
      docHints: {
        trade_register: "Ticaret sicil gazetesi veya ticaret odası faaliyet belgesi. Son 3 ay içinde alınmış olmalı. PDF tercih edilir.",
        id_passport: "Kimlik kartı veya pasaport ön yüz (kimlik için arka yüz de eklenebilir). PDF veya JPG formatında yükleyin.",
        tax_document: "Vergi levhası veya vergi beyan belgesi. PDF olarak yükleyin. Opsiyonel ama önerilir.",
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
      reviewingTitle: "Doğrulama inceleniyor",
      reviewingDetail: "Evraklarınız ve bilgileriniz ekibimiz tarafından inceleniyor. Bu süreç genellikle 1-3 iş günü sürer. Sonuç e-posta ile bildirilecektir.",
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
      taxIdHelp: "Z.B. 12/345/67890 — die vom Finanzamt zugeteilte Steuernummer (nicht die USt-IdNr.). Format je nach Bundesland unterschiedlich.",
      vatId: "USt-IdNr.",
      vatIdHelp: "Z.B. DE123456789 — Umsatzsteuer-Identifikationsnummer, beginnt mit Ländercode + 9 Ziffern. Nur für USt-pflichtige Unternehmen.",
      iban: "IBAN",
      phone: "Telefonnummer",
      phoneCountry: "Vorwahl",
      street: "Straße und Hausnummer",
      city: "Stadt",
      postalCode: "Postleitzahl",
      country: "Land",
      docTypes: {
        trade_register: "Handelsregisterauszug",
        id_passport: "Ausweis / Reisepass",
        tax_document: "Steuerdokument (optional)",
      },
      docHints: {
        trade_register: "Offizieller Handelsregisterauszug (HRB/HRA), nicht älter als 3 Monate. PDF bevorzugt.",
        id_passport: "Vorder- und Rückseite des Personalausweises oder Reisepasses als PDF oder JPG.",
        tax_document: "Steuerbescheid oder Umsatzsteuervoranmeldung als PDF. Optional, aber empfohlen.",
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
      reviewingTitle: "Verifizierung wird geprüft",
      reviewingDetail: "Deine Dokumente und Angaben werden von unserem Team geprüft. Dies dauert in der Regel 1–3 Werktage. Das Ergebnis wird per E-Mail mitgeteilt.",
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
    taxIdHelp: "e.g. 12/345/67890 — Tax number issued by your local tax office (not the VAT ID).",
    vatId: "VAT ID",
    vatIdHelp: "e.g. DE123456789 — Required for VAT-registered businesses. Starts with country code + digits.",
    iban: "IBAN",
    phone: "Phone number",
    phoneCountry: "Country code",
    street: "Street address",
    city: "City",
    postalCode: "Postal code",
    country: "Country",
    docTypes: {
      trade_register: "Trade register extract",
      id_passport: "ID / Passport",
      tax_document: "Tax document (optional)",
    },
    docHints: {
      trade_register: "Official trade register extract, not older than 3 months. PDF preferred.",
      id_passport: "Front and back of your ID card or passport as PDF or JPG.",
      tax_document: "Tax assessment or VAT return document as PDF. Optional but recommended.",
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
    reviewingTitle: "Verification under review",
    reviewingDetail: "Your documents and details are being reviewed by our team. This typically takes 1–3 business days. You will be notified by email once complete.",
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

/** Extracts dial code from a stored phone string. Returns { dialCode, number }. */
function parseStoredPhone(phone) {
  if (!phone) return { dialCode: "+49", number: "" };
  const str = String(phone).trim();
  for (const entry of PHONE_CODES) {
    if (str.startsWith(entry.dial)) {
      return { dialCode: entry.dial, number: str.slice(entry.dial.length).trim() };
    }
  }
  // If starts with + but unknown, keep as-is in number field
  return { dialCode: "+49", number: str };
}

function DocUploadRow({ label, hint, docType, doc, onUpload, uploading, t }) {
  const inputId = `doc-upload-${docType}`;
  const isRequired = DOC_REQUIRED[docType];
  return (
    <Box borderWidth="025" borderColor="border" borderRadius="200" padding="300">
      <BlockStack gap="200">
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
        {hint && (
          <Text as="p" variant="bodySm" tone="subdued">{hint}</Text>
        )}
      </BlockStack>
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
  const [phoneDialCode, setPhoneDialCode] = useState("+49");
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

  const snapshotFrom = useCallback((nextForm, nextAgreement, nextDialCode) => {
    return JSON.stringify({
      agreementAccepted: !!nextAgreement,
      phoneDialCode: nextDialCode || "+49",
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
        const storedDocs = Array.isArray(seller?.documents) ? seller.documents : [];
        const docs = { trade_register: null, id_passport: null, tax_document: null };
        storedDocs.forEach((d) => {
          if (d?.doc_type && docs.hasOwnProperty(d.doc_type)) docs[d.doc_type] = d;
        });
        const { dialCode, number } = parseStoredPhone(seller?.phone);
        setPhoneDialCode(dialCode);
        const nextForm = {
          companyName: seller?.company_name || "",
          authorizedPersonName: seller?.authorized_person_name || "",
          taxId: seller?.tax_id || "",
          vatId: seller?.vat_id || "",
          iban: seller?.iban || "",
          phone: number,
          street: addr?.street || "",
          city: addr?.city || "",
          postalCode: addr?.postal_code || "",
          country: addr?.country || "",
          docs,
        };
        setForm((p) => ({ ...p, ...nextForm }));
        const nextAgreement = s !== "registered";
        setAgreementAccepted(nextAgreement);
        setInitialSnapshot(snapshotFrom(nextForm, nextAgreement, dialCode));
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
      const fullPhone = form.phone.trim() ? `${phoneDialCode}${form.phone.trim()}` : "";
      await client.updateSellerCompanyInfo({
        company_name: form.companyName.trim() || null,
        authorized_person_name: form.authorizedPersonName.trim() || null,
        tax_id: form.taxId.trim() || null,
        vat_id: form.vatId.trim() || null,
        phone: fullPhone || null,
        business_address: {
          street: form.street.trim() || null,
          city: form.city.trim() || null,
          postal_code: form.postalCode.trim() || null,
          country: form.country.trim() || null,
        },
        documents,
      });
      await client.updateSellerIban(form.iban.trim() || null);
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
      setInitialSnapshot(snapshotFrom(form, agreementAccepted, phoneDialCode));
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

  const normalizedStatus = String(status || "registered").toLowerCase();
  const isDocsSubmittedOrBeyond = ["documents_submitted", "pending_approval", "pending", "approved", "active", "rejected", "suspended"].includes(normalizedStatus);
  const isDirty = !loading && initialSnapshot !== null && snapshotFrom(form, agreementAccepted, phoneDialCode) !== initialSnapshot;

  const discardVerification = useCallback(() => {
    if (!initialSnapshot) return;
    try {
      const snap = JSON.parse(initialSnapshot);
      setAgreementAccepted(!!snap.agreementAccepted);
      setPhoneDialCode(snap.phoneDialCode || "+49");
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

  const saveRef = useRef(saveVerification);
  const discardRef = useRef(discardVerification);
  saveRef.current = saveVerification;
  discardRef.current = discardVerification;

  useEffect(() => {
    if (!unsaved) return;
    unsaved.setDirty(isDirty);
    unsaved.setHandlers({
      onSave: () => saveRef.current?.(),
      onDiscard: () => discardRef.current?.(),
    });
    return () => {
      unsaved.clearHandlers();
    };
  }, [unsaved, isDirty]);

  if (loading) {
    return (
      <Card>
        <Text as="p" tone="subdued">Loading...</Text>
      </Card>
    );
  }

  return (
    <BlockStack gap="400">
      <Card>
        <BlockStack gap="200">
          <Text as="h2" variant="headingMd">{t.title}</Text>
          <Text as="p" tone="subdued">{t.subtitle}</Text>
        </BlockStack>
      </Card>

      {(normalizedStatus === "documents_submitted" || normalizedStatus === "pending_approval" || normalizedStatus === "pending") ? (
        <div style={{
          background: "linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)",
          border: "1.5px solid #f59e0b",
          borderRadius: 10,
          padding: "16px 20px",
        }}>
          <InlineStack gap="300" blockAlign="start" wrap={false}>
            <div style={{ paddingTop: 2, flexShrink: 0 }}>
              <Spinner size="small" />
            </div>
            <BlockStack gap="100">
              <Text as="p" variant="bodyMd" fontWeight="bold" tone="caution">{t.reviewingTitle}</Text>
              <Text as="p" variant="bodySm" tone="subdued">{t.reviewingDetail}</Text>
            </BlockStack>
          </InlineStack>
        </div>
      ) : (
        <Banner tone={statusTone(normalizedStatus)}>
          <Text as="p"><strong>{t.statusLabel}:</strong> {t.status[normalizedStatus] || normalizedStatus}</Text>
        </Banner>
      )}

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
                  <TextField
                    label={t.taxId}
                    value={form.taxId}
                    onChange={(v) => setForm((p) => ({ ...p, taxId: v }))}
                    autoComplete="off"
                    helpText={t.taxIdHelp}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <TextField
                    label={t.vatId}
                    value={form.vatId}
                    onChange={(v) => setForm((p) => ({ ...p, vatId: v }))}
                    autoComplete="off"
                    helpText={t.vatIdHelp}
                  />
                </div>
              </InlineStack>
              <TextField label={t.iban} value={form.iban} onChange={(v) => setForm((p) => ({ ...p, iban: v }))} autoComplete="off" />
            </BlockStack>
          </Card>

          {/* Contact & address */}
          <Card>
            <BlockStack gap="300">
              <Text as="h3" variant="headingSm">{t.contactTitle}</Text>
              {/* Phone with country code selector */}
              <BlockStack gap="100">
                <Text as="span" variant="bodyMd">{t.phone}</Text>
                <div style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
                  <select
                    value={phoneDialCode}
                    onChange={(e) => setPhoneDialCode(e.target.value)}
                    style={{
                      height: 36,
                      border: "1px solid #8c9196",
                      borderRadius: 6,
                      padding: "0 8px",
                      fontSize: 14,
                      background: "#fff",
                      color: "#202223",
                      cursor: "pointer",
                      flexShrink: 0,
                      minWidth: 88,
                    }}
                  >
                    {PHONE_CODES.map((c) => (
                      <option key={c.code} value={c.dial}>{c.code} {c.dial}</option>
                    ))}
                  </select>
                  <div style={{ flex: 1 }}>
                    <TextField
                      label=""
                      labelHidden
                      value={form.phone}
                      onChange={(v) => setForm((p) => ({ ...p, phone: v }))}
                      autoComplete="off"
                      type="tel"
                      placeholder="123 456 7890"
                    />
                  </div>
                </div>
              </BlockStack>
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
                  hint={t.docHints[dt]}
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
