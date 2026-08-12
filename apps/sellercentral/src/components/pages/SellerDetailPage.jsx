"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Page, Card, Text, BlockStack, InlineStack, Badge, Button, Banner,
  TextField, Select, Box, Spinner, Divider, Modal, Tabs,
} from "@shopify/polaris";
import { useRouter } from "@/i18n/navigation";
import { useLocale } from "next-intl";
import { getUI } from "@/lib/ui-strings";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";
import { confirmDelete } from "@/lib/confirm-delete";

// ── Admin seller card section ────────────────────────────────────────────────
function AdminSellerCardSection({ sellerId }) {
  const client = getMedusaAdminClient();
  const locale = useLocale();
  const ui = getUI(locale);
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");

  useEffect(() => {
    (async () => {
      try { setInfo(await client.getSellerCardByAdmin(sellerId)); }
      catch (_) {}
      finally { setLoading(false); }
    })();
  }, [client, sellerId]);

  const handleDelete = useCallback(async () => {
    if (!(await confirmDelete(locale === "en" ? "Really remove card?" : locale === "tr" ? "Kartı gerçekten kaldır?" : locale === "fr" ? "Vraiment supprimer la carte ?" : locale === "es" ? "¿Realmente eliminar la tarjeta?" : locale === "it" ? "Rimuovere davvero la carta?" : "Karte wirklich entfernen?"))) return;
    setErr(""); setDeleting(true);
    try {
      await client.deleteSellerCardByAdmin(sellerId);
      setInfo({ has_card: false, last4: null, brand: null });
      setOk(locale === "en" ? "Card removed." : locale === "tr" ? "Kart kaldırıldı." : locale === "fr" ? "Carte supprimée." : locale === "es" ? "Tarjeta eliminada." : locale === "it" ? "Carta rimossa." : "Karte entfernt.");
    } catch (e) {
      setErr(e?.message || (locale === "en" ? "Error." : locale === "tr" ? "Hata." : locale === "fr" ? "Erreur." : locale === "es" ? "Error." : locale === "it" ? "Errore." : "Fehler."));
    } finally { setDeleting(false); }
  }, [client, sellerId]);

  if (loading) return <Spinner size="small" />;

  const brand = info?.brand ? (info.brand.charAt(0).toUpperCase() + info.brand.slice(1)) : (locale === "en" ? "Card" : locale === "tr" ? "Kart" : locale === "fr" ? "Carte" : locale === "es" ? "Tarjeta" : locale === "it" ? "Carta" : "Karte");
  const exp = info?.exp_month && info?.exp_year
    ? `${String(info.exp_month).padStart(2, "0")}/${String(info.exp_year).slice(-2)}`
    : null;

  return (
    <BlockStack gap="200">
      <Text as="h3" variant="headingSm">{locale === "en" ? "Credit card" : locale === "tr" ? "Kredi kartı" : locale === "fr" ? "Carte de crédit" : locale === "es" ? "Tarjeta de crédito" : locale === "it" ? "Carta di credito" : "Kreditkarte"}</Text>
      {ok && <Banner tone="success" onDismiss={() => setOk("")}>{ok}</Banner>}
      {err && <Banner tone="critical" onDismiss={() => setErr("")}>{err}</Banner>}
      {info?.has_card ? (
        <InlineStack gap="300" blockAlign="center">
          <div style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 8, padding: "10px 14px" }}>
            <Text as="p" variant="bodyMd" fontWeight="semibold">
              {brand} •••• {info.last4}
              {exp ? <span style={{ fontWeight: 400, color: "#6b7280", marginLeft: 8 }}>{exp}</span> : null}
            </Text>
          </div>
          <Button tone="critical" variant="plain" size="slim" onClick={handleDelete} loading={deleting}>
            {locale === "en" ? "Remove" : locale === "tr" ? "Kaldır" : locale === "fr" ? "Supprimer" : locale === "es" ? "Eliminar" : locale === "it" ? "Rimuovi" : "Entfernen"}
          </Button>
        </InlineStack>
      ) : (
        <Text as="p" variant="bodySm" tone="subdued">{locale === "en" ? "No credit card on file." : locale === "tr" ? "Kayıtlı kredi kartı yok." : locale === "fr" ? "Aucune carte de crédit enregistrée." : locale === "es" ? "No hay tarjeta de crédito registrada." : locale === "it" ? "Nessuna carta di credito registrata." : "Keine Kreditkarte hinterlegt."}</Text>
      )}
    </BlockStack>
  );
}

import { getSellerApprovalStatus } from "@/lib/marketing-i18n";

// ── Helpers ─────────────────────────────────────────────────────────────────
const STATUS_NEXT = {
  registered: ["documents_submitted", "pending_approval"],
  documents_submitted: ["pending_approval", "rejected"],
  pending_approval: ["approved", "rejected"],
  approved: ["suspended"],
  rejected: ["pending_approval"],
  suspended: ["approved", "rejected"],
};

function statusMetaFor(locale, status) {
  const tones = {
    registered: "info",
    documents_submitted: "attention",
    pending_approval: "warning",
    approved: "success",
    rejected: "critical",
    suspended: "critical",
  };
  return {
    label: getSellerApprovalStatus(locale, status),
    tone: tones[status] || "info",
    next: STATUS_NEXT[status] || [],
  };
}

function statusLabelsFor(locale) {
  return Object.keys(STATUS_NEXT).map((v) => ({ value: v, label: getSellerApprovalStatus(locale, v) }));
}

function fmtCents(c, locale) {
  if (!c && c !== 0) return "€0,00";
  const loc = locale === "en" ? "en-GB" : locale === "tr" ? "tr-TR" : locale === "fr" ? "fr-FR" : locale === "es" ? "es-ES" : locale === "it" ? "it-IT" : "de-DE";
  return (c / 100).toLocaleString(loc, { style: "currency", currency: "EUR" });
}

function fmtDate(d, locale) {
  if (!d) return "—";
  const loc = locale === "en" ? "en-GB" : locale === "tr" ? "tr-TR" : locale === "fr" ? "fr-FR" : locale === "es" ? "es-ES" : locale === "it" ? "it-IT" : "de-DE";
  return new Date(d).toLocaleDateString(loc, { day: "2-digit", month: "2-digit", year: "numeric" });
}

function parseDocuments(raw) {
  try {
    if (!raw) return [];
    const arr = typeof raw === "string" ? JSON.parse(raw) : raw;
    return Array.isArray(arr) ? arr : [];
  } catch (_) {
    return [];
  }
}

function detectDocTypeLabel(doc, locale) {
  const hay = `${doc?.name || ""} ${doc?.type || ""} ${doc?.kind || ""}`.toLowerCase();
  if (hay.includes("vertrag") || hay.includes("contract") || hay.includes("agreement"))
    return locale === "en" ? "Contract / Agreement" : locale === "tr" ? "Sözleşme" : locale === "fr" ? "Contrat / Accord" : locale === "es" ? "Contrato / Acuerdo" : locale === "it" ? "Contratto / Accordo" : "Vertrag / Agreement";
  if (hay.includes("sign") || hay.includes("imza") || hay.includes("signature"))
    return locale === "en" ? "Signature" : locale === "tr" ? "İmza" : locale === "fr" ? "Signature" : locale === "es" ? "Firma" : locale === "it" ? "Firma" : "Unterschrift / Signature";
  if (hay.includes("pass") || hay.includes("passport"))
    return locale === "en" ? "Passport" : locale === "tr" ? "Pasaport" : locale === "fr" ? "Passeport" : locale === "es" ? "Pasaporte" : locale === "it" ? "Passaporto" : "Pass / Passport";
  if (hay.includes("id") || hay.includes("ausweis") || hay.includes("kimlik"))
    return locale === "en" ? "ID / Identity card" : locale === "tr" ? "Kimlik" : locale === "fr" ? "Pièce d'identité" : locale === "es" ? "DNI / Identificación" : locale === "it" ? "Documento d'identità" : "ID / Ausweis";
  if (hay.includes("handels") || hay.includes("register"))
    return locale === "en" ? "Trade register" : locale === "tr" ? "Ticaret sicili" : locale === "fr" ? "Registre du commerce" : locale === "es" ? "Registro mercantil" : locale === "it" ? "Registro commerciale" : "Handelsregister";
  if (hay.includes("steuer") || hay.includes("tax") || hay.includes("vat"))
    return locale === "en" ? "Tax / VAT" : locale === "tr" ? "Vergi / KDV" : locale === "fr" ? "Taxe / TVA" : locale === "es" ? "Impuesto / IVA" : locale === "it" ? "Tasse / IVA" : "Steuer / VAT";
  return locale === "en" ? "Document" : locale === "tr" ? "Belge" : locale === "fr" ? "Document" : locale === "es" ? "Documento" : locale === "it" ? "Documento" : "Dokument";
}

function fmtMonth(d, locale) {
  if (!d) return "";
  const dt = new Date(d);
  const loc = locale === "en" ? "en-GB" : locale === "tr" ? "tr-TR" : locale === "fr" ? "fr-FR" : locale === "es" ? "es-ES" : locale === "it" ? "it-IT" : "de-DE";
  return dt.toLocaleDateString(loc, { month: "short", year: "2-digit" });
}

function toIsoDate(d) {
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return "";
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const day = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function generatePayoutPeriods(count = 12) {
  const periods = [];
  let year = new Date().getFullYear();
  let month = new Date().getMonth();
  for (let i = 0; i < count; i++) {
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    periods.push({
      key: `${year}-${String(month + 1).padStart(2, "0")}-H2`,
      label: `16.${String(month + 1).padStart(2, "0")}.${year} – ${String(daysInMonth).padStart(2, "0")}.${String(month + 1).padStart(2, "0")}.${year}`,
      start: new Date(year, month, 16),
      end: new Date(year, month, daysInMonth, 23, 59, 59, 999),
    });
    periods.push({
      key: `${year}-${String(month + 1).padStart(2, "0")}-H1`,
      label: `01.${String(month + 1).padStart(2, "0")}.${year} – 15.${String(month + 1).padStart(2, "0")}.${year}`,
      start: new Date(year, month, 1),
      end: new Date(year, month, 15, 23, 59, 59, 999),
    });
    month -= 1;
    if (month < 0) { month = 11; year -= 1; }
  }
  return periods;
}

const PAYOUT_PERIODS = generatePayoutPeriods(12);

function isPeriodSelectable(period, now = new Date()) {
  if (!period?.start) return true;
  const year = now.getFullYear();
  const month = now.getMonth();
  const day = now.getDate();
  const pYear = period.start.getFullYear();
  const pMonth = period.start.getMonth();
  const isCurrentMonth = pYear === year && pMonth === month;
  const isSecondHalf = period.start.getDate() === 16;
  // Current month second-half period opens only on/after day 16.
  if (isCurrentMonth && isSecondHalf && day < 16) return false;
  return true;
}

function getDefaultPayoutPeriodKey(periods, now = new Date()) {
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  const currentHalfStartDay = now.getDate() >= 16 ? 16 : 1;
  const exactCurrent = periods.find(
    (p) =>
      p.start.getFullYear() === currentYear &&
      p.start.getMonth() === currentMonth &&
      p.start.getDate() === currentHalfStartDay &&
      isPeriodSelectable(p, now),
  );
  if (exactCurrent) return exactCurrent.key;
  const firstSelectable = periods.find((p) => isPeriodSelectable(p, now));
  return firstSelectable?.key || periods[0]?.key || "";
}

function getPeriodYear(period) {
  return period?.start?.getFullYear?.() ?? null;
}

function getPeriodMonth(period) {
  return period?.start?.getMonth?.() ?? null;
}

function monthLabel(monthIdx, locale) {
  const loc = locale === "en" ? "en-GB" : locale === "tr" ? "tr-TR" : locale === "fr" ? "fr-FR" : locale === "es" ? "es-ES" : locale === "it" ? "it-IT" : "de-DE";
  return new Date(2026, Number(monthIdx) || 0, 1).toLocaleDateString(loc, { month: "long" });
}

// ── Stat card ─────────────────────────────────────────────────────────────
function Stat({ label, value, sub, tone }) {
  return (
    <div style={{ flex: 1, minWidth: 130, background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 10, padding: "14px 16px" }}>
      <Text as="p" variant="bodySm" tone="subdued">{label}</Text>
      <Text as="p" variant="headingMd" fontWeight="bold" tone={tone}>{value}</Text>
      {sub && <Text as="p" variant="bodySm" tone="subdued">{sub}</Text>}
    </div>
  );
}

// ── Mini bar chart ─────────────────────────────────────────────────────────
function BarChart({ data, locale }) {
  if (!data || data.length === 0) return (
    <Box padding="400"><Text tone="subdued">{locale === "en" ? "No data" : locale === "tr" ? "Veri yok" : locale === "fr" ? "Aucune donnée" : locale === "es" ? "Sin datos" : locale === "it" ? "Nessun dato" : "Keine Daten"}</Text></Box>
  );
  const max = Math.max(...data.map((d) => d.total_cents), 1);
  return (
    <div style={{ width: "100%", overflowX: "auto", padding: "4px 0" }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 80, minWidth: Math.max(220, data.length * 28) }}>
      {data.map((d, i) => {
        const h = Math.max(4, Math.round((d.total_cents / max) * 72));
        return (
          <div key={i} style={{ width: 22, flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
            <div
              title={`${fmtMonth(d.month, locale)}: ${fmtCents(d.total_cents, locale)}`}
              style={{ width: "100%", height: h, background: "#2563eb", borderRadius: "3px 3px 0 0", transition: "height .2s" }}
            />
            <span style={{ fontSize: 9, color: "#9ca3af", whiteSpace: "nowrap" }}>{fmtMonth(d.month, locale)}</span>
          </div>
        );
      })}
      </div>
    </div>
  );
}

// ── Info row ─────────────────────────────────────────────────────────────
function InfoRow({ label, value }) {
  return (
    <div style={{ display: "flex", gap: 8, padding: "6px 0", borderBottom: "1px solid #f3f4f6" }}>
      <Text as="span" variant="bodySm" tone="subdued" fontWeight="medium" style={{ minWidth: 140, flexShrink: 0 }}>{label}</Text>
      <Text as="span" variant="bodySm">{value || "—"}</Text>
    </div>
  );
}

// ── Address display ───────────────────────────────────────────────────────
function AddressBlock({ addr }) {
  if (!addr) return <Text as="span" tone="subdued">—</Text>;
  const a = typeof addr === "string" ? JSON.parse(addr) : addr;
  return (
    <BlockStack gap="050">
      {(a.street || a.address_line1) && <Text as="p" variant="bodySm">{a.street || a.address_line1}</Text>}
      {a.address_line2 && <Text as="p" variant="bodySm">{a.address_line2}</Text>}
      {(a.zip || a.postal_code || a.city) && <Text as="p" variant="bodySm">{[a.postal_code || a.zip, a.city].filter(Boolean).join(" ")}</Text>}
      {a.country && <Text as="p" variant="bodySm">{a.country}</Text>}
    </BlockStack>
  );
}

function SetupCheckRow({ ok, label, missingHint }) {
  return (
    <div style={{
      display: "flex", alignItems: "flex-start", gap: 10,
      padding: "10px 12px", borderRadius: 8,
      background: ok ? "#f0fdf4" : "#fff7ed",
      border: `1px solid ${ok ? "#bbf7d0" : "#fed7aa"}`,
    }}>
      <span style={{
        width: 18, height: 18, borderRadius: 999, flexShrink: 0, marginTop: 1,
        background: ok ? "#16a34a" : "#ea580c", color: "#fff",
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        fontSize: 11, fontWeight: 700,
      }}>{ok ? "✓" : "!"}</span>
      <div style={{ minWidth: 0 }}>
        <Text as="p" variant="bodySm" fontWeight="semibold">{label}</Text>
        {!ok && missingHint ? (
          <Text as="p" tone="subdued" variant="bodySm">{missingHint}</Text>
        ) : null}
      </div>
    </div>
  );
}

function RequiredSetupChecklist({ seller, locale }) {
  const setup = seller?.setup || {};
  const t = (en, tr, fr, es, it, de) =>
    locale === "en" ? en : locale === "tr" ? tr : locale === "fr" ? fr : locale === "es" ? es : locale === "it" ? it : de;
  const items = [
    {
      ok: !!setup.has_shipping_from,
      label: t("Warehouse / shipping address (Locations)", "Depo / gönderim adresi (Konumlar)", "Adresse entrepôt / expédition (Emplacements)", "Dirección almacén / envío (Ubicaciones)", "Indirizzo magazzino / spedizione (Posizioni)", "Lager- / Versandadresse (Standorte)"),
      missing: t("Missing — seller must set shipping purpose on a location with street.", "Eksik — satıcı bir konumda gönderim amacını sokak adresiyle işaretlemeli.", "Manquant — définir l'expédition sur un emplacement avec rue.", "Falta — marcar envío en una ubicación con calle.", "Mancante — impostare spedizione su una posizione con via.", "Fehlt — Versandzweck an einem Standort mit Straße setzen."),
    },
    {
      ok: !!setup.has_returns_to,
      label: t("Returns address (Locations)", "İade adresi (Konumlar)", "Adresse de retour (Emplacements)", "Dirección de devoluciones (Ubicaciones)", "Indirizzo resi (Posizioni)", "Retourenadresse (Standorte)"),
      missing: t("Missing — required. Source of truth is Settings → Locations.", "Eksik — zorunlu. Kaynak: Ayarlar → Konumlar.", "Manquant — obligatoire. Source : Paramètres → Emplacements.", "Falta — obligatorio. Fuente: Ajustes → Ubicaciones.", "Mancante — obbligatorio. Fonte: Impostazioni → Posizioni.", "Fehlt — Pflicht. Quelle: Einstellungen → Standorte."),
    },
    {
      ok: !!setup.has_billing,
      label: t("Billing address (Locations)", "Fatura adresi (Konumlar)", "Adresse de facturation (Emplacements)", "Dirección de facturación (Ubicaciones)", "Indirizzo di fatturazione (Posizioni)", "Rechnungsadresse (Standorte)"),
      missing: t("Missing — required on Locations.", "Eksik — Konumlar’da zorunlu.", "Manquant — obligatoire dans Emplacements.", "Falta — obligatorio en Ubicaciones.", "Mancante — obbligatorio in Posizioni.", "Fehlt — Pflicht unter Standorte."),
    },
    {
      ok: !!setup.has_card,
      label: t("Credit card for fees (Gebühren)", "Ücretler için kredi kartı (Gebühren)", "Carte pour frais (Gebühren)", "Tarjeta para tasas (Gebühren)", "Carta per commissioni (Gebühren)", "Kreditkarte für Gebühren"),
      missing: t("No card on file.", "Kayıtlı kart yok.", "Aucune carte enregistrée.", "No hay tarjeta registrada.", "Nessuna carta registrata.", "Keine Karte hinterlegt."),
    },
    {
      ok: !!setup.has_iban,
      label: t("IBAN for payouts (Auszahlung)", "Ödeme için IBAN (Auszahlung)", "IBAN pour versements (Auszahlung)", "IBAN para pagos (Auszahlung)", "IBAN per pagamenti (Auszahlung)", "IBAN für Auszahlungen"),
      missing: t("No IBAN on file.", "Kayıtlı IBAN yok.", "Aucun IBAN enregistré.", "No hay IBAN registrado.", "Nessun IBAN registrato.", "Keine IBAN hinterlegt."),
    },
  ];
  const missingCount = items.filter((i) => !i.ok).length;

  return (
    <BlockStack gap="200">
      <InlineStack align="space-between" blockAlign="center">
        <Text as="h3" variant="headingSm">
          {t("Required setup", "Zorunlu kurulum", "Configuration requise", "Configuración requerida", "Configurazione obbligatoria", "Erforderliche Einrichtung")}
        </Text>
        <Badge tone={missingCount === 0 ? "success" : "warning"}>
          {missingCount === 0
            ? t("Complete", "Tamam", "Complet", "Completo", "Completo", "Vollständig")
            : t(`${missingCount} missing`, `${missingCount} eksik`, `${missingCount} manquant(s)`, `${missingCount} faltan`, `${missingCount} mancanti`, `${missingCount} fehlen`)}
        </Badge>
      </InlineStack>
      <Text as="p" tone="subdued" variant="bodySm">
        {t(
          "Locations (warehouse / returns / billing), credit card for fees, and IBAN for payouts must be set before the seller is fully ready.",
          "Tam hazır olmadan önce konumlar (depo / iade / fatura), ücret kartı ve ödeme IBAN’ı girilmiş olmalı.",
          "Emplacements (entrepôt / retours / facturation), carte pour frais et IBAN de versement doivent être renseignés.",
          "Ubicaciones (almacén / devoluciones / facturación), tarjeta de tasas e IBAN de pago deben estar configurados.",
          "Posizioni (magazzino / resi / fatturazione), carta per commissioni e IBAN di pagamento devono essere impostati.",
          "Standorte (Lager / Retoure / Rechnung), Kreditkarte für Gebühren und IBAN für Auszahlungen müssen hinterlegt sein.",
        )}
      </Text>
      <BlockStack gap="150">
        {items.map((it) => (
          <SetupCheckRow key={it.label} ok={it.ok} label={it.label} missingHint={it.missing} />
        ))}
      </BlockStack>
    </BlockStack>
  );
}

// ════════════════════════════════════════════════════════════════════════════
export default function SellerDetailPage({ sellerId }) {
  const router = useRouter();
  const locale = useLocale();
  const ui = getUI(locale);
  const client = getMedusaAdminClient();

  const [seller, setSeller] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [msg, setMsg] = useState(null);
  const [activeTab, setActiveTab] = useState(0);
  const [pdfDownloading, setPdfDownloading] = useState(false);

  // Approval modal
  const [approveModal, setApproveModal] = useState(false);
  const [newStatus, setNewStatus] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [approving, setApproving] = useState(false);

  // Edit fields (commission, notes)
  const [editCommission, setEditCommission] = useState(false);
  const [commissionVal, setCommissionVal] = useState("");
  const [savingCommission, setSavingCommission] = useState(false);

  // Payout create modal
  const [payoutModal, setPayoutModal] = useState(false);
  const [payoutForm, setPayoutForm] = useState({ period_start: "", period_end: "", total_cents: "", commission_cents: "", payout_cents: "", notes: "" });
  const [savingPayout, setSavingPayout] = useState(false);
  const [periodKey, setPeriodKey] = useState(() => getDefaultPayoutPeriodKey(PAYOUT_PERIODS));
  const [periodTransactions, setPeriodTransactions] = useState([]);
  const [periodTransactionsLoading, setPeriodTransactionsLoading] = useState(false);

  const load = useCallback(() => {
    if (!sellerId) {
      setLoading(false);
      setError(locale === "en" ? "No seller ID" : locale === "tr" ? "Satıcı kimliği yok" : locale === "fr" ? "Aucun ID vendeur" : locale === "es" ? "Sin ID de vendedor" : locale === "it" ? "Nessun ID venditore" : "Keine Verkäufer-ID");
      return;
    }
    setLoading(true);
    client.getSellerById(sellerId)
      .then((r) => {
        setSeller(r.seller);
        setCommissionVal(((r.seller?.commission_rate || 0.12) * 100).toFixed(1));
        setError(null);
      })
      .catch((e) => setError(e?.message || (locale === "en" ? "Error loading" : locale === "tr" ? "Yükleme hatası" : locale === "fr" ? "Erreur de chargement" : locale === "es" ? "Error al cargar" : locale === "it" ? "Errore di caricamento" : "Fehler beim Laden")))
      .finally(() => setLoading(false));
  }, [sellerId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const selected = PAYOUT_PERIODS.find((p) => p.key === periodKey);
    if (selected && isPeriodSelectable(selected)) return;
    setPeriodKey(getDefaultPayoutPeriodKey(PAYOUT_PERIODS));
  }, [periodKey]);

  useEffect(() => {
    if (!seller?.seller_id) return;
    const selected = PAYOUT_PERIODS.find((p) => p.key === periodKey) || PAYOUT_PERIODS[0];
    if (!selected) return;
    setPeriodTransactionsLoading(true);
    client.getTransactions({ seller_id: seller.seller_id, include_pending: "true" })
      .then((r) => {
        const list = (r?.transactions || []).filter((t) => {
          const dt = new Date(t.created_at);
          return !Number.isNaN(dt.getTime()) && dt >= selected.start && dt <= selected.end;
        });
        setPeriodTransactions(list);
      })
      .catch(() => setPeriodTransactions([]))
      .finally(() => setPeriodTransactionsLoading(false));
  }, [client, seller?.seller_id, periodKey]);

  const handleApprove = async () => {
    if (!newStatus) return;
    setApproving(true);
    try {
      const r = await client.approveSellerById(sellerId, newStatus, rejectReason || undefined);
      setSeller(r.seller);
      setMsg({ tone: "success", text: locale === "en" ? `Status changed to "${getSellerApprovalStatus(locale, newStatus)}".` : locale === "tr" ? `Durum "${getSellerApprovalStatus(locale, newStatus)}" olarak değiştirildi.` : locale === "fr" ? `Statut changé en "${getSellerApprovalStatus(locale, newStatus)}".` : locale === "es" ? `Estado cambiado a "${getSellerApprovalStatus(locale, newStatus)}".` : locale === "it" ? `Stato cambiato in "${getSellerApprovalStatus(locale, newStatus)}".` : `Status wurde auf "${getSellerApprovalStatus(locale, newStatus)}" geändert.` });
      setApproveModal(false);
      setRejectReason("");
    } catch (e) {
      setMsg({ tone: "critical", text: e?.message || (locale === "en" ? "Error" : locale === "tr" ? "Hata" : locale === "fr" ? "Erreur" : locale === "es" ? "Error" : locale === "it" ? "Errore" : "Fehler") });
    } finally {
      setApproving(false);
    }
  };

  const handleSaveCommission = async () => {
    setSavingCommission(true);
    try {
      const rate = parseFloat(commissionVal.replace(",", ".")) / 100;
      if (isNaN(rate) || rate < 0 || rate > 1) throw new Error(locale === "en" ? "Invalid value (0–100%)" : locale === "tr" ? "Geçersiz değer (0–100%)" : locale === "fr" ? "Valeur invalide (0–100%)" : locale === "es" ? "Valor inválido (0–100%)" : locale === "it" ? "Valore non valido (0–100%)" : "Ungültiger Wert (0–100%)");
      const r = await client.updateSellerById(sellerId, { commission_rate: rate });
      setSeller((p) => ({ ...p, commission_rate: r.seller?.commission_rate ?? rate }));
      setMsg({ tone: "success", text: locale === "en" ? "Commission saved." : locale === "tr" ? "Komisyon kaydedildi." : locale === "fr" ? "Commission enregistrée." : locale === "es" ? "Comisión guardada." : locale === "it" ? "Commissione salvata." : "Provision gespeichert." });
      setEditCommission(false);
    } catch (e) {
      setMsg({ tone: "critical", text: e?.message || (locale === "en" ? "Error" : locale === "tr" ? "Hata" : locale === "fr" ? "Erreur" : locale === "es" ? "Error" : locale === "it" ? "Errore" : "Fehler") });
    } finally {
      setSavingCommission(false);
    }
  };

  const handleCreatePayout = async () => {
    setSavingPayout(true);
    try {
      const total = Math.round(parseFloat(payoutForm.total_cents.replace(",", ".")) * 100);
      const comm = Math.round(parseFloat(payoutForm.commission_cents.replace(",", ".")) * 100);
      const payout = total - comm;
      await client.createPayout({
        seller_id: seller.seller_id,
        period_start: payoutForm.period_start,
        period_end: payoutForm.period_end,
        total_cents: total,
        commission_cents: comm,
        payout_cents: payoutForm.payout_cents ? Math.round(parseFloat(payoutForm.payout_cents.replace(",", ".")) * 100) : payout,
        iban: seller.iban || null,
        notes: payoutForm.notes || null,
      });
      setMsg({ tone: "success", text: locale === "en" ? "Payout created." : locale === "tr" ? "Ödeme oluşturuldu." : locale === "fr" ? "Paiement créé." : locale === "es" ? "Pago creado." : locale === "it" ? "Pagamento creato." : "Auszahlung erstellt." });
      setPayoutModal(false);
      setPayoutForm({ period_start: "", period_end: "", total_cents: "", commission_cents: "", payout_cents: "", notes: "" });
      load();
    } catch (e) {
      setMsg({ tone: "critical", text: e?.message || (locale === "en" ? "Error" : locale === "tr" ? "Hata" : locale === "fr" ? "Erreur" : locale === "es" ? "Error" : locale === "it" ? "Errore" : "Fehler") });
    } finally {
      setSavingPayout(false);
    }
  };

  const handleMarkPaid = async (payout) => {
    const confirmMsg = locale === "en"
      ? `Mark payout ${fmtDate(payout.period_start, locale)}–${fmtDate(payout.period_end, locale)} as externally transferred?\n\nNote: This does not initiate a bank/Stripe transfer. First send the payment from the platform account to the seller IBAN, then mark as paid here.`
      : locale === "tr"
      ? `${fmtDate(payout.period_start, locale)}–${fmtDate(payout.period_end, locale)} ödemesini dışarıdan havale edildi olarak işaretle?\n\nNot: Bu işlem banka/Stripe transferi başlatmaz. Önce ödemeyi platform hesabından seller IBAN'ına gerçekten gönderin, sonra burada işaretleyin.`
      : locale === "fr"
      ? `Marquer le paiement ${fmtDate(payout.period_start, locale)}–${fmtDate(payout.period_end, locale)} comme transféré extérieurement ?\n\nRemarque : Cela ne lance pas de virement bancaire/Stripe. Envoyez d'abord le paiement depuis le compte de la plateforme vers l'IBAN du vendeur, puis marquez-le ici.`
      : locale === "es"
      ? `¿Marcar el pago ${fmtDate(payout.period_start, locale)}–${fmtDate(payout.period_end, locale)} como transferido externamente?\n\nNota: Esto no inicia una transferencia bancaria/Stripe. Primero envíe el pago desde la cuenta de la plataforma al IBAN del vendedor y luego márquelo aquí.`
      : locale === "it"
      ? `Contrassegnare il pagamento ${fmtDate(payout.period_start, locale)}–${fmtDate(payout.period_end, locale)} come trasferito esternamente?\n\nNota: Questo non avvia un bonifico bancario/Stripe. Prima inviare il pagamento dal conto della piattaforma all'IBAN del venditore, poi contrassegnarlo qui.`
      : `Auszahlung ${fmtDate(payout.period_start, locale)}–${fmtDate(payout.period_end, locale)} als extern überwiesen markieren?\n\nHinweis: Dies startet keine Bank-/Stripe-Überweisung. Erst die Zahlung vom Plattformkonto zur Seller-IBAN senden, dann hier als bezahlt markieren.`;
    if (!(await confirmDelete(confirmMsg))) return;
    try {
      await client.updatePayout(payout.id, { status: "bezahlt" });
      setMsg({ tone: "success", text: locale === "en" ? "Marked as externally transferred (paid)." : locale === "tr" ? "Dışarıdan havale edildi (ödendi) olarak işaretlendi." : locale === "fr" ? "Marqué comme transféré externalement (payé)." : locale === "es" ? "Marcado como transferido externamente (pagado)." : locale === "it" ? "Contrassegnato come trasferito esternamente (pagato)." : "Als extern überwiesen (bezahlt) markiert." });
      load();
    } catch (e) {
      setMsg({ tone: "critical", text: e?.message || (locale === "en" ? "Error" : locale === "tr" ? "Hata" : locale === "fr" ? "Erreur" : locale === "es" ? "Error" : locale === "it" ? "Errore" : "Fehler") });
    }
  };

  // Generate invoice text (simple text-based)
  const generateInvoice = (payout) => {
    const s = seller;
    const loc = locale === "en" ? "en-GB" : locale === "tr" ? "tr-TR" : locale === "fr" ? "fr-FR" : locale === "es" ? "es-ES" : locale === "it" ? "it-IT" : "de-DE";
    const today = new Date().toLocaleDateString(loc, { day: "2-digit", month: "2-digit", year: "numeric" });
    const t = {
      title: locale === "en" ? "COMMISSION NOTE" : locale === "tr" ? "KOMİSYON NOTU" : locale === "fr" ? "NOTE DE COMMISSION" : locale === "es" ? "NOTA DE COMISIÓN" : locale === "it" ? "NOTA DI COMMISSIONE" : "PROVISIONSNOTE",
      issuer: locale === "en" ? "Issuer" : locale === "tr" ? "Düzenleyen" : locale === "fr" ? "Émetteur" : locale === "es" ? "Emisor" : locale === "it" ? "Emittente" : "Aussteller",
      date: locale === "en" ? "Date" : locale === "tr" ? "Tarih" : locale === "fr" ? "Date" : locale === "es" ? "Fecha" : locale === "it" ? "Data" : "Datum",
      recipient: locale === "en" ? "Recipient" : locale === "tr" ? "Alıcı" : locale === "fr" ? "Destinataire" : locale === "es" ? "Destinatario" : locale === "it" ? "Destinatario" : "Empfänger",
      vatId: locale === "en" ? "VAT ID" : locale === "tr" ? "KDV No." : locale === "fr" ? "N° TVA" : locale === "es" ? "N° IVA" : locale === "it" ? "N° IVA" : "USt-IdNr.",
      period: locale === "en" ? "Billing period" : locale === "tr" ? "Fatura dönemi" : locale === "fr" ? "Période de facturation" : locale === "es" ? "Período de facturación" : locale === "it" ? "Periodo di fatturazione" : "Abrechnungszeitraum",
      revenue: locale === "en" ? "Total revenue (gross)" : locale === "tr" ? "Toplam ciro (brüt)" : locale === "fr" ? "CA total (brut)" : locale === "es" ? "Ingresos totales (bruto)" : locale === "it" ? "Fatturato totale (lordo)" : "Gesamtumsatz (Brutto)",
      commission: locale === "en" ? "Commission" : locale === "tr" ? "Komisyon" : locale === "fr" ? "Commission" : locale === "es" ? "Comisión" : locale === "it" ? "Commissione" : "Provision",
      payout: locale === "en" ? "Payout amount" : locale === "tr" ? "Ödeme tutarı" : locale === "fr" ? "Montant du paiement" : locale === "es" ? "Monto del pago" : locale === "it" ? "Importo del pagamento" : "Auszahlungsbetrag",
      notes: locale === "en" ? "Notes" : locale === "tr" ? "Notlar" : locale === "fr" ? "Notes" : locale === "es" ? "Notas" : locale === "it" ? "Note" : "Notizen",
    };
    const text = `${t.title}\n${"=".repeat(50)}\n
${t.issuer}: Andertal GmbH
${t.date}: ${today}

${t.recipient}:
${s.company_name || s.store_name || s.email}
${s.business_address ? JSON.stringify(s.business_address) : ""}
${s.tax_id ? `${t.vatId}: ${s.tax_id}` : ""}

${t.period}: ${fmtDate(payout.period_start, locale)} – ${fmtDate(payout.period_end, locale)}

${t.revenue}:    ${fmtCents(payout.total_cents, locale)}
${t.commission} (${((seller.commission_rate || 0.12) * 100).toFixed(1)}%):       ${fmtCents(payout.commission_cents, locale)}
${"─".repeat(40)}
${t.payout}:        ${fmtCents(payout.payout_cents, locale)}

IBAN: ${payout.iban || s.iban || "—"}

${payout.notes ? `${t.notes}: ${payout.notes}` : ""}
${"=".repeat(50)}
    `.trim();
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `provisionsnote-${seller.seller_id}-${payout.period_start}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadSellerPdf = async () => {
    setPdfDownloading(true);
    try {
      const blob = await client.downloadAgreementPdf(sellerId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `andertal-agreement-${sellerId}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setMsg({ type: "critical", text: e?.message || "PDF download failed." });
    } finally {
      setPdfDownloading(false);
    }
  };

  if (loading) return (
    <Page><Box padding="800" style={{ textAlign: "center" }}><Spinner /></Box></Page>
  );

  if (error) return (
    <Page><Banner tone="critical">{error}</Banner></Page>
  );

  if (!seller) return null;

  const status = seller.approval_status || "registered";
  const statusMeta = statusMetaFor(locale, status);
  const commissionPct = ((parseFloat(seller.commission_rate) || 0.12) * 100).toFixed(1);
  const totalRevenue = (seller.monthly_revenue || []).reduce((a, m) => a + m.total_cents, 0);
  const totalOrders = (seller.monthly_revenue || []).reduce((a, m) => a + m.order_count, 0);
  const commissionTotal = Math.round(totalRevenue * (parseFloat(seller.commission_rate) || 0.12));
  const payoutTotal = totalRevenue - commissionTotal;

  const tabs = [
    { id: "overview", content: locale === "en" ? "Overview" : locale === "tr" ? "Genel Bakış" : locale === "fr" ? "Aperçu" : locale === "es" ? "Resumen" : locale === "it" ? "Panoramica" : "Übersicht" },
    { id: "finance", content: locale === "en" ? "Finance & Commissions" : locale === "tr" ? "Finans & Komisyonlar" : locale === "fr" ? "Finances & Commissions" : locale === "es" ? "Finanzas & Comisiones" : locale === "it" ? "Finanze & Commissioni" : "Finanzen & Provisionen" },
    { id: "products", content: locale === "en" ? "Products" : locale === "tr" ? "Ürünler" : locale === "fr" ? "Produits" : locale === "es" ? "Productos" : locale === "it" ? "Prodotti" : "Produkte" },
    { id: "company", content: locale === "en" ? "Company data" : locale === "tr" ? "Firma bilgileri" : locale === "fr" ? "Données entreprise" : locale === "es" ? "Datos empresa" : locale === "it" ? "Dati azienda" : "Firmendaten" },
  ];
  const selectedPeriod = PAYOUT_PERIODS.find((p) => p.key === periodKey) || PAYOUT_PERIODS[0];
  const selectedYear = getPeriodYear(selectedPeriod);
  const selectedMonth = getPeriodMonth(selectedPeriod);
  const periodYears = [...new Set(PAYOUT_PERIODS.map(getPeriodYear).filter((y) => y != null))].sort((a, b) => b - a);
  const monthsInSelectedYear = [...new Set(
    PAYOUT_PERIODS
      .filter((p) => getPeriodYear(p) === selectedYear)
      .map(getPeriodMonth)
      .filter((m) => m != null),
  )].sort((a, b) => b - a);
  const periodsInSelectedMonth = PAYOUT_PERIODS
    .filter((p) => getPeriodYear(p) === selectedYear && getPeriodMonth(p) === selectedMonth)
    .sort((a, b) => a.start - b.start);
  const periodTotalCents = periodTransactions.reduce((sum, t) => sum + (t.total_cents || 0), 0);
  const periodCommissionCents = periodTransactions.reduce((sum, t) => sum + (t.commission_cents || 0), 0);
  const periodPayoutCents = periodTransactions.reduce((sum, t) => sum + (t.payout_cents || 0), 0);
  const periodEligibleCount = periodTransactions.filter((t) => t.payout_eligible).length;
  const sellerDocs = parseDocuments(seller.documents);

  return (
    <Page
      backAction={{ content: locale === "en" ? "Sellers" : locale === "tr" ? "Satıcılar" : locale === "fr" ? "Vendeurs" : locale === "es" ? "Vendedores" : locale === "it" ? "Venditori" : "Verkäufer", onAction: () => router.push("/sellers") }}
      title={seller.store_name || seller.email}
      titleMetadata={<Badge tone={statusMeta.tone}>{statusMeta.label}</Badge>}
      subtitle={seller.email}
      primaryAction={{
        content: locale === "en" ? "Change status" : locale === "tr" ? "Durumu değiştir" : locale === "fr" ? "Changer le statut" : locale === "es" ? "Cambiar estado" : locale === "it" ? "Cambia stato" : "Status ändern",
        onAction: () => { setNewStatus(statusMetaFor(locale, status)?.next?.[0] || "approved"); setApproveModal(true); },
      }}
      secondaryActions={[
        { content: locale === "en" ? "Edit commission" : locale === "tr" ? "Komisyonu düzenle" : locale === "fr" ? "Modifier la commission" : locale === "es" ? "Editar comisión" : locale === "it" ? "Modifica commissione" : "Provision bearbeiten", onAction: () => setEditCommission(true) },
        { content: locale === "en" ? "Create payout" : locale === "tr" ? "Ödeme oluştur" : locale === "fr" ? "Créer un paiement" : locale === "es" ? "Crear pago" : locale === "it" ? "Crea pagamento" : "Auszahlung erstellen", onAction: () => setPayoutModal(true) },
      ]}
    >
      <BlockStack gap="500">
        {msg && (
          <Banner tone={msg.tone} onDismiss={() => setMsg(null)}>{msg.text}</Banner>
        )}

        {/* ── Stat strip ─────────────────────────────────────────────── */}
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <Stat label={locale === "en" ? "Total Revenue" : locale === "tr" ? "Toplam Ciro" : locale === "fr" ? "Chiffre d'affaires total" : locale === "es" ? "Ingresos totales" : locale === "it" ? "Fatturato totale" : "Gesamtumsatz"} value={fmtCents(totalRevenue, locale)} sub={`${totalOrders} ${locale === "en" ? "Orders" : locale === "tr" ? "Sipariş" : locale === "fr" ? "Commandes" : locale === "es" ? "Pedidos" : locale === "it" ? "Ordini" : "Bestellungen"}`} />
          <Stat label={locale === "en" ? "Commission" : locale === "tr" ? "Komisyon" : locale === "fr" ? "Commission" : locale === "es" ? "Comisión" : locale === "it" ? "Commissione" : "Provision"} value={fmtCents(commissionTotal, locale)} sub={`${commissionPct}% Rate`} tone="critical" />
          <Stat label={locale === "en" ? "Payout Amount" : locale === "tr" ? "Ödeme Tutarı" : locale === "fr" ? "Montant du paiement" : locale === "es" ? "Monto del pago" : locale === "it" ? "Importo del pagamento" : "Auszahlungsbetrag"} value={fmtCents(payoutTotal, locale)} tone="success" />
          <Stat label={locale === "en" ? "Products" : locale === "tr" ? "Ürünler" : locale === "fr" ? "Produits" : locale === "es" ? "Productos" : locale === "it" ? "Prodotti" : "Produkte"} value={
            (seller.products_by_category || []).reduce((a, c) => a + c.count, 0)
          } />
          <Stat label={locale === "en" ? "Paid Payouts" : locale === "tr" ? "Ödenmiş Ödemeler" : locale === "fr" ? "Paiements effectués" : locale === "es" ? "Pagos realizados" : locale === "it" ? "Pagamenti effettuati" : "Bezahlte Auszahlungen"} value={fmtCents(seller.payout_summary?.total_paid_cents, locale)} />
          <Stat label={locale === "en" ? "Pending" : locale === "tr" ? "Bekleyen" : locale === "fr" ? "En attente" : locale === "es" ? "Pendiente" : locale === "it" ? "In sospeso" : "Ausstehend"} value={fmtCents(seller.payout_summary?.total_pending_cents, locale)} tone="warning" />
        </div>

        {/* ── Tabs ──────────────────────────────────────────────────── */}
        <Card>
          <Tabs tabs={tabs} selected={activeTab} onSelect={setActiveTab}>
            <Box paddingBlockStart="400">

              {/* ── OVERVIEW TAB ─────────────────────────────────── */}
              {activeTab === 0 && (
                <BlockStack gap="400">
                  {/* Revenue chart */}
                  <BlockStack gap="200">
                    <Text as="h3" variant="headingSm">{locale === "en" ? "Monthly Revenue (last 12 months)" : locale === "tr" ? "Aylık Ciro (son 12 ay)" : locale === "fr" ? "Chiffre d'affaires mensuel (12 derniers mois)" : locale === "es" ? "Ingresos mensuales (últimos 12 meses)" : locale === "it" ? "Fatturato mensile (ultimi 12 mesi)" : "Monatlicher Umsatz (letzte 12 Monate)"}</Text>
                    <BarChart data={seller.monthly_revenue} locale={locale} />
                  </BlockStack>

                  <Divider />

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
                    {/* Seller info */}
                    <BlockStack gap="100">
                      <Text as="h3" variant="headingSm">{locale === "en" ? "Account" : locale === "tr" ? "Hesap" : locale === "fr" ? "Compte" : locale === "es" ? "Cuenta" : locale === "it" ? "Account" : "Konto"}</Text>
                      <InfoRow label="Seller ID" value={seller.seller_id} />
                      <InfoRow label={ui.colEmail} value={seller.email} />
                      <InfoRow label={locale === "en" ? "Shop Name" : locale === "tr" ? "Mağaza Adı" : locale === "fr" ? "Nom de la boutique" : locale === "es" ? "Nombre de la tienda" : locale === "it" ? "Nome negozio" : "Shop-Name"} value={seller.store_name} />
                      <InfoRow label={locale === "en" ? "Registered" : locale === "tr" ? "Kayıt Tarihi" : locale === "fr" ? "Inscrit le" : locale === "es" ? "Registrado" : locale === "it" ? "Registrato" : "Registriert"} value={fmtDate(seller.created_at, locale)} />
                      <InfoRow label={locale === "en" ? "Approved on" : locale === "tr" ? "Onaylandı" : locale === "fr" ? "Approuvé le" : locale === "es" ? "Aprobado el" : locale === "it" ? "Approvato il" : "Genehmigt am"} value={fmtDate(seller.approved_at, locale)} />
                      <InfoRow label="Superuser" value={seller.is_superuser ? ui.yes : ui.no} />
                      <InfoRow label="IBAN" value={seller.iban ? seller.iban.replace(/(.{4})/g, "$1 ").trim() : null} />
                    </BlockStack>

                    {/* Provision */}
                    <BlockStack gap="100">
                      <Text as="h3" variant="headingSm">{locale === "en" ? "Commission" : locale === "tr" ? "Komisyon" : locale === "fr" ? "Commission" : locale === "es" ? "Comisión" : locale === "it" ? "Commissione" : "Provision"}</Text>
                      <InfoRow label={locale === "en" ? "Commission rate" : locale === "tr" ? "Komisyon oranı" : locale === "fr" ? "Taux de commission" : locale === "es" ? "Tasa de comisión" : locale === "it" ? "Tasso di commissione" : "Provisionssatz"} value={`${commissionPct}%`} />
                      <InfoRow label={locale === "en" ? "Total commission" : locale === "tr" ? "Toplam komisyon" : locale === "fr" ? "Commission totale" : locale === "es" ? "Comisión total" : locale === "it" ? "Commissione totale" : "Ges. Provision"} value={fmtCents(commissionTotal, locale)} />
                      <InfoRow label={locale === "en" ? "Total payout" : locale === "tr" ? "Toplam ödeme" : locale === "fr" ? "Paiement total" : locale === "es" ? "Pago total" : locale === "it" ? "Pagamento totale" : "Ges. Auszahlung"} value={fmtCents(payoutTotal, locale)} />
                      <InfoRow label={locale === "en" ? "Paid" : locale === "tr" ? "Ödendi" : locale === "fr" ? "Payé" : locale === "es" ? "Pagado" : locale === "it" ? "Pagato" : "Bezahlt"} value={fmtCents(seller.payout_summary?.total_paid_cents, locale)} />
                      <InfoRow label={locale === "en" ? "Pending" : locale === "tr" ? "Bekleyen" : locale === "fr" ? "En attente" : locale === "es" ? "Pendiente" : locale === "it" ? "In sospeso" : "Ausstehend"} value={fmtCents(seller.payout_summary?.total_pending_cents, locale)} />
                    </BlockStack>
                  </div>

                  {/* Status history / rejection reason */}
                  {seller.rejection_reason && (
                    <Banner tone="critical">
                      <Text as="p" variant="bodySm"><strong>{locale === "en" ? "Rejection reason:" : locale === "tr" ? "Red gerekçesi:" : locale === "fr" ? "Motif de refus :" : locale === "es" ? "Motivo de rechazo:" : locale === "it" ? "Motivo del rifiuto:" : "Ablehnungsgrund:"}</strong> {seller.rejection_reason}</Text>
                    </Banner>
                  )}
                </BlockStack>
              )}

              {/* ── FINANCE TAB ──────────────────────────────────── */}
              {activeTab === 1 && (
                <BlockStack gap="400">
                  <Banner tone="info">
                    {locale === "en"
                      ? <>Automatic payouts are prepared on the 1st and 15th (status: <strong>processing</strong>).<br /><strong>Important:</strong> "Mark as paid" does not initiate a payment. First complete the actual bank transfer from the platform account to the seller IBAN, then mark as paid here.</>
                      : locale === "tr"
                      ? <>Otomatik ödemeler 1. ve 15. günlerde hazırlanır (durum: <strong>processing</strong>).<br /><strong>Önemli:</strong> "Ödendi olarak işaretle" bir ödeme başlatmaz. Önce platform hesabından satıcı IBAN'ına gerçek transferi yapın, ardından burada ödendi olarak işaretleyin.</>
                      : locale === "fr"
                      ? <>Les paiements automatiques sont préparés les 1er et 15 (statut : <strong>processing</strong>).<br /><strong>Important :</strong> "Marquer comme payé" ne lance pas un paiement. Effectuez d'abord le virement bancaire/Stripe depuis le compte plateforme vers l'IBAN du vendeur, puis marquez-le ici.</>
                      : locale === "es"
                      ? <>Los pagos automáticos se preparan el 1 y el 15 (estado: <strong>processing</strong>).<br /><strong>Importante:</strong> "Marcar como pagado" no inicia un pago. Primero realice la transferencia bancaria/Stripe desde la cuenta de la plataforma al IBAN del vendedor y luego márquelo aquí.</>
                      : locale === "it"
                      ? <>I pagamenti automatici vengono preparati il 1° e il 15 (stato: <strong>processing</strong>).<br /><strong>Importante:</strong> "Segna come pagato" non avvia un pagamento. Prima effettuare il bonifico bancario/Stripe dal conto piattaforma all'IBAN del venditore, poi contrassegnarlo qui.</>
                      : <>Automatische Auszahlungen werden am 01. und 15. vorbereitet (Status: <strong>processing</strong>).<br /><strong>Wichtig:</strong> "Bezahlt/markieren" startet keine Zahlung. Erst echte Überweisung (z. B. Bank/Stripe) vom Plattformkonto zur Seller-IBAN durchführen, danach hier als bezahlt markieren.</>
                    }
                  </Banner>
                  <InlineStack gap="300" blockAlign="center" align="space-between">
                    <Text as="h3" variant="headingSm">{locale === "en" ? "Payout History & Billing Details" : locale === "tr" ? "Ödeme Geçmişi & Fatura Detayları" : locale === "fr" ? "Historique des paiements & Détails de facturation" : locale === "es" ? "Historial de pagos & Detalles de facturación" : locale === "it" ? "Storico pagamenti & Dettagli di fatturazione" : "Auszahlungshistorie & Abrechnungsdetails"}</Text>
                    <InlineStack gap="200" blockAlign="center">
                      <div style={{ minWidth: 560 }}>
                        <BlockStack gap="100">
                          <InlineStack gap="100" wrap>
                            {periodYears.map((y) => {
                              const active = y === selectedYear;
                              return (
                                <button
                                  key={`year-${y}`}
                                  type="button"
                                  onClick={() => {
                                    const candidate =
                                      PAYOUT_PERIODS.find((p) => getPeriodYear(p) === y && isPeriodSelectable(p)) ||
                                      PAYOUT_PERIODS.find((p) => getPeriodYear(p) === y);
                                    if (candidate) setPeriodKey(candidate.key);
                                  }}
                                  style={{
                                    padding: "6px 10px",
                                    borderRadius: 8,
                                    border: active ? "1px solid #111827" : "1px solid #d1d5db",
                                    background: active ? "#111827" : "#fff",
                                    color: active ? "#fff" : "#374151",
                                    fontSize: 12,
                                    fontWeight: 700,
                                    cursor: "pointer",
                                  }}
                                >
                                  {y}
                                </button>
                              );
                            })}
                          </InlineStack>
                          <InlineStack gap="100" wrap>
                            {monthsInSelectedYear.map((m) => {
                              const active = m === selectedMonth;
                              return (
                                <button
                                  key={`month-${selectedYear}-${m}`}
                                  type="button"
                                  onClick={() => {
                                    const candidate =
                                      PAYOUT_PERIODS.find(
                                        (p) => getPeriodYear(p) === selectedYear && getPeriodMonth(p) === m && isPeriodSelectable(p),
                                      ) ||
                                      PAYOUT_PERIODS.find((p) => getPeriodYear(p) === selectedYear && getPeriodMonth(p) === m);
                                    if (candidate) setPeriodKey(candidate.key);
                                  }}
                                  style={{
                                    padding: "5px 9px",
                                    borderRadius: 8,
                                    border: active ? "1px solid #0f766e" : "1px solid #d1d5db",
                                    background: active ? "#ecfeff" : "#fff",
                                    color: active ? "#0f766e" : "#4b5563",
                                    fontSize: 12,
                                    textTransform: "capitalize",
                                    cursor: "pointer",
                                  }}
                                >
                                  {monthLabel(m, locale)}
                                </button>
                              );
                            })}
                          </InlineStack>
                          <InlineStack gap="100" wrap>
                            {periodsInSelectedMonth.map((p) => {
                              const active = p.key === periodKey;
                              const selectable = isPeriodSelectable(p);
                              return (
                                <button
                                  key={p.key}
                                  type="button"
                                  disabled={!selectable}
                                  onClick={() => setPeriodKey(p.key)}
                                  title={selectable ? p.label : (locale === "en" ? "Available from the 16th of the month" : locale === "tr" ? "Ayın 16'sından itibaren mevcut" : locale === "fr" ? "Disponible à partir du 16 du mois" : locale === "es" ? "Disponible desde el 16 del mes" : locale === "it" ? "Disponibile dal 16 del mese" : "Ab dem 16. des Monats verfügbar")}
                                  style={{
                                    padding: "6px 10px",
                                    borderRadius: 8,
                                    border: active ? "1px solid #0284c7" : "1px solid #d1d5db",
                                    background: active ? "#e0f2fe" : "#fff",
                                    color: active ? "#0369a1" : "#374151",
                                    fontSize: 12,
                                    cursor: selectable ? "pointer" : "not-allowed",
                                    opacity: selectable ? 1 : 0.45,
                                  }}
                                >
                                  {p.label}
                                </button>
                              );
                            })}
                          </InlineStack>
                        </BlockStack>
                      </div>
                      <Button
                        size="slim"
                        onClick={() => {
                          if (!selectedPeriod) return;
                          setPayoutForm((p) => ({
                            ...p,
                            period_start: toIsoDate(selectedPeriod.start),
                            period_end: toIsoDate(selectedPeriod.end),
                            total_cents: (periodTotalCents / 100).toFixed(2),
                            commission_cents: (periodCommissionCents / 100).toFixed(2),
                            payout_cents: (periodPayoutCents / 100).toFixed(2),
                            notes: p.notes || `${locale === "en" ? "Period" : locale === "tr" ? "Dönem" : locale === "fr" ? "Période" : locale === "es" ? "Período" : locale === "it" ? "Periodo" : "Periode"} ${selectedPeriod.label}`,
                          }));
                          setPayoutModal(true);
                        }}
                      >
                        {locale === "en" ? "+ Create payout" : locale === "tr" ? "+ Ödeme oluştur" : locale === "fr" ? "+ Créer un paiement" : locale === "es" ? "+ Crear pago" : locale === "it" ? "+ Crea pagamento" : "+ Auszahlung erstellen"}
                      </Button>
                    </InlineStack>
                  </InlineStack>

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(160px, 1fr))", gap: 10 }}>
                    <Stat label={locale === "en" ? "Revenue (Period)" : locale === "tr" ? "Ciro (Dönem)" : locale === "fr" ? "CA (Période)" : locale === "es" ? "Ingresos (Período)" : locale === "it" ? "Fatturato (Periodo)" : "Umsatz (Periode)"} value={fmtCents(periodTotalCents, locale)} />
                    <Stat label={locale === "en" ? "Commission (Period)" : locale === "tr" ? "Komisyon (Dönem)" : locale === "fr" ? "Commission (Période)" : locale === "es" ? "Comisión (Período)" : locale === "it" ? "Commissione (Periodo)" : "Provision (Periode)"} value={fmtCents(periodCommissionCents, locale)} />
                    <Stat label={locale === "en" ? "Payout (Period)" : locale === "tr" ? "Ödeme (Dönem)" : locale === "fr" ? "Paiement (Période)" : locale === "es" ? "Pago (Período)" : locale === "it" ? "Pagamento (Periodo)" : "Auszahlung (Periode)"} value={fmtCents(periodPayoutCents, locale)} tone="success" />
                    <Stat label={locale === "en" ? "Orders (eligible / total)" : locale === "tr" ? "Siparişler (uygun / toplam)" : locale === "fr" ? "Commandes (éligibles / total)" : locale === "es" ? "Pedidos (elegibles / total)" : locale === "it" ? "Ordini (idonei / totale)" : "Bestellungen (geeignet / gesamt)"} value={`${periodEligibleCount} / ${periodTransactions.length}`} />
                  </div>

                  <Card>
                    <BlockStack gap="200">
                      <Text as="h3" variant="headingSm">{locale === "en" ? "Transactions in selected period" : locale === "tr" ? "Seçili dönemdeki işlemler" : locale === "fr" ? "Transactions dans la période sélectionnée" : locale === "es" ? "Transacciones en el período seleccionado" : locale === "it" ? "Transazioni nel periodo selezionato" : "Transaktionen in gewählter Periode"}</Text>
                      {periodTransactionsLoading ? (
                        <Text as="p" variant="bodySm" tone="subdued">{ui.loading}</Text>
                      ) : periodTransactions.length === 0 ? (
                        <Text as="p" variant="bodySm" tone="subdued">{locale === "en" ? "No transactions in this period." : locale === "tr" ? "Bu dönemde işlem yok." : locale === "fr" ? "Aucune transaction dans cette période." : locale === "es" ? "Sin transacciones en este período." : locale === "it" ? "Nessuna transazione in questo periodo." : "Keine Transaktionen in dieser Periode."}</Text>
                      ) : (
                        <div style={{ overflowX: "auto" }}>
                          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                            <thead>
                              <tr style={{ background: "#f6f6f7", borderBottom: "1px solid #e1e3e5" }}>
                                {(locale === "en"
                                  ? ["Order", "Customer", "Date", "Revenue", "Commission", "Payout", "Delivery", "Eligible"]
                                  : locale === "tr"
                                  ? ["Sipariş", "Müşteri", "Tarih", "Ciro", "Komisyon", "Ödeme", "Teslimat", "Uygun"]
                                  : locale === "fr"
                                  ? ["Commande", "Client", "Date", "CA", "Commission", "Paiement", "Livraison", "Éligible"]
                                  : locale === "es"
                                  ? ["Pedido", "Cliente", "Fecha", "Ingresos", "Comisión", "Pago", "Entrega", "Elegible"]
                                  : locale === "it"
                                  ? ["Ordine", "Cliente", "Data", "Fatturato", "Commissione", "Pagamento", "Consegna", "Idoneo"]
                                  : ["Bestellung", "Kunde", "Datum", "Umsatz", "Provision", "Auszahlung", "Lieferung", "Eligible"]
                                ).map((h) => (
                                  <th key={h} style={{ padding: "8px 10px", textAlign: "left", color: "#6d7175", fontWeight: 600, whiteSpace: "nowrap" }}>{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {periodTransactions.map((t) => (
                                <tr key={t.id} style={{ borderBottom: "1px solid #f1f1f1" }}>
                                  <td style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>#{t.order_number || "—"}</td>
                                  <td style={{ padding: "8px 10px" }}>{[t.first_name, t.last_name].filter(Boolean).join(" ") || "—"}</td>
                                  <td style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>{fmtDate(t.created_at, locale)}</td>
                                  <td style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>{fmtCents(t.total_cents || 0, locale)}</td>
                                  <td style={{ padding: "8px 10px", whiteSpace: "nowrap", color: "#dc2626" }}>{fmtCents(t.commission_cents || 0, locale)}</td>
                                  <td style={{ padding: "8px 10px", whiteSpace: "nowrap", color: "#16a34a" }}>{fmtCents(t.payout_cents || 0, locale)}</td>
                                  <td style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>{fmtDate(t.delivery_date, locale)}</td>
                                  <td style={{ padding: "8px 10px" }}>
                                    <Badge tone={t.payout_eligible ? "success" : "warning"}>{t.payout_eligible ? ui.yes : ui.no}</Badge>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </BlockStack>
                  </Card>

                  {!seller.payouts || seller.payouts.length === 0 ? (
                    <Box padding="600" background="bg-surface-secondary" borderRadius="200">
                      <Text as="p" tone="subdued">{locale === "en" ? "No payouts yet." : locale === "tr" ? "Henüz ödeme yok." : locale === "fr" ? "Aucun paiement pour l'instant." : locale === "es" ? "Aún no hay pagos." : locale === "it" ? "Ancora nessun pagamento." : "Noch keine Auszahlungen."}</Text>
                    </Box>
                  ) : (
                    <div style={{ overflowX: "auto" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                        <thead>
                          <tr style={{ background: "#f6f6f7", borderBottom: "1px solid #e1e3e5" }}>
                            {(locale === "en"
                              ? ["Period", "Revenue", "Commission", "Payout", "Status", "IBAN", ""]
                              : locale === "tr"
                              ? ["Dönem", "Ciro", "Komisyon", "Ödeme", "Durum", "IBAN", ""]
                              : locale === "fr"
                              ? ["Période", "CA", "Commission", "Paiement", "Statut", "IBAN", ""]
                              : locale === "es"
                              ? ["Período", "Ingresos", "Comisión", "Pago", "Estado", "IBAN", ""]
                              : locale === "it"
                              ? ["Periodo", "Fatturato", "Commissione", "Pagamento", "Stato", "IBAN", ""]
                              : ["Zeitraum", "Umsatz", "Provision", "Auszahlung", "Status", "IBAN", ""]
                            ).map((h, i) => (
                              <th key={i} style={{ padding: "8px 12px", textAlign: i >= 2 && i <= 4 ? "right" : "left", fontWeight: 600, color: "#6d7175", whiteSpace: "nowrap" }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {seller.payouts.map((p) => (
                            <tr key={p.id} style={{ borderBottom: "1px solid #f1f1f1" }}>
                              <td style={{ padding: "8px 12px", whiteSpace: "nowrap" }}>{fmtDate(p.period_start, locale)} – {fmtDate(p.period_end, locale)}</td>
                              <td style={{ padding: "8px 12px", textAlign: "right" }}>{fmtCents(p.total_cents, locale)}</td>
                              <td style={{ padding: "8px 12px", textAlign: "right", color: "#dc2626" }}>{fmtCents(p.commission_cents, locale)}</td>
                              <td style={{ padding: "8px 12px", textAlign: "right", color: "#16a34a", fontWeight: 600 }}>{fmtCents(p.payout_cents, locale)}</td>
                              <td style={{ padding: "8px 12px" }}>
                                <Badge tone={p.status === "bezahlt" ? "success" : "attention"}>
                                  {p.status === "bezahlt" ? (locale === "en" ? "Paid" : locale === "tr" ? "Ödendi" : locale === "fr" ? "Payé" : locale === "es" ? "Pagado" : locale === "it" ? "Pagato" : "Bezahlt") : (locale === "en" ? "Open" : locale === "tr" ? "Açık" : locale === "fr" ? "Ouvert" : locale === "es" ? "Abierto" : locale === "it" ? "Aperto" : "Offen")}
                                </Badge>
                              </td>
                              <td style={{ padding: "8px 12px", fontFamily: "monospace", fontSize: 11, color: "#6b7280" }}>
                                {(p.iban || seller.iban || "—").replace(/(.{4})/g, "$1 ").trim()}
                              </td>
                              <td style={{ padding: "8px 12px" }}>
                                <InlineStack gap="200">
                                  {p.status !== "bezahlt" && (
                                    <Button size="slim" variant="primary" onClick={() => handleMarkPaid(p)}>{locale === "en" ? "Mark as transferred" : locale === "tr" ? "Havale edildi olarak işaretle" : locale === "fr" ? "Marquer comme transféré" : locale === "es" ? "Marcar como transferido" : locale === "it" ? "Contrassegna come trasferito" : "Als überwiesen markieren"}</Button>
                                  )}
                                  <Button size="slim" onClick={() => generateInvoice(p)}>{locale === "en" ? "Invoice" : locale === "tr" ? "Fatura" : locale === "fr" ? "Facture" : locale === "es" ? "Factura" : locale === "it" ? "Fattura" : "Rechnung"}</Button>
                                </InlineStack>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </BlockStack>
              )}

              {/* ── PRODUCTS TAB ─────────────────────────────────── */}
              {activeTab === 2 && (
                <BlockStack gap="400">
                  <Text as="h3" variant="headingSm">{locale === "en" ? "Products by category" : locale === "tr" ? "Kategoriye göre ürünler" : locale === "fr" ? "Produits par catégorie" : locale === "es" ? "Productos por categoría" : locale === "it" ? "Prodotti per categoria" : "Produkte nach Kategorie"}</Text>

                  {!seller.products_by_category || seller.products_by_category.length === 0 ? (
                    <Box padding="600" background="bg-surface-secondary" borderRadius="200">
                      <Text as="p" tone="subdued">{locale === "en" ? "No products found." : locale === "tr" ? "Ürün bulunamadı." : locale === "fr" ? "Aucun produit trouvé." : locale === "es" ? "No se encontraron productos." : locale === "it" ? "Nessun prodotto trovato." : "Keine Produkte gefunden."}</Text>
                    </Box>
                  ) : (
                    <div>
                      {seller.products_by_category.map((cat, i) => {
                        const total = seller.products_by_category.reduce((a, c) => a + c.count, 0);
                        const pct = total > 0 ? Math.round((cat.count / total) * 100) : 0;
                        return (
                          <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0", borderBottom: "1px solid #f1f1f1" }}>
                            <div style={{ flex: "0 0 180px" }}>
                              <Text as="span" variant="bodyMd">{cat.category || (locale === "en" ? "Uncategorized" : locale === "tr" ? "Kategorisiz" : locale === "fr" ? "Non catégorisé" : locale === "es" ? "Sin categoría" : locale === "it" ? "Non categorizzato" : "Unkategorisiert")}</Text>
                            </div>
                            <div style={{ flex: 1, background: "#e5e7eb", borderRadius: 4, height: 8, overflow: "hidden" }}>
                              <div style={{ width: `${pct}%`, height: "100%", background: "#2563eb", borderRadius: 4 }} />
                            </div>
                            <div style={{ flex: "0 0 60px", textAlign: "right" }}>
                              <Text as="span" variant="bodyMd" fontWeight="semibold">{cat.count}</Text>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </BlockStack>
              )}

              {/* ── COMPANY TAB ──────────────────────────────────── */}
              {activeTab === 3 && (
                <BlockStack gap="400">
                  <Banner tone="info">
                    {locale === "en"
                      ? "Company data review: Please check company details, legal consent, and uploaded documents (contract, signature, passport/ID, etc.)."
                      : locale === "tr"
                      ? "Firma bilgileri incelemesi: Lütfen şirket bilgilerini, yasal onayı ve yüklenen belgeleri (sözleşme, imza, pasaport/kimlik vb.) kontrol edin."
                      : locale === "fr"
                      ? "Vérification des données entreprise : Veuillez vérifier les informations de l'entreprise, le consentement légal et les documents téléversés (contrat, signature, passeport/ID, etc.)."
                      : locale === "es"
                      ? "Revisión de datos de empresa: Por favor revise los detalles de la empresa, el consentimiento legal y los documentos subidos (contrato, firma, pasaporte/ID, etc.)."
                      : locale === "it"
                      ? "Revisione dati azienda: Si prega di verificare i dettagli aziendali, il consenso legale e i documenti caricati (contratto, firma, passaporto/ID, ecc.)."
                      : "Firmendaten-Review: Bitte Gesellschaftsdaten, rechtliche Zustimmung und hochgeladene Nachweise (Vertrag, Unterschrift, Pass/ID usw.) prüfen."
                    }
                  </Banner>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
                    <BlockStack gap="100">
                      <Text as="h3" variant="headingSm">{locale === "en" ? "Company details" : locale === "tr" ? "Firma bilgileri" : locale === "fr" ? "Données entreprise" : locale === "es" ? "Datos empresa" : locale === "it" ? "Dati azienda" : "Firmendaten"}</Text>
                      <InfoRow label={locale === "en" ? "Company name" : locale === "tr" ? "Firma adı" : locale === "fr" ? "Nom de l'entreprise" : locale === "es" ? "Nombre de la empresa" : locale === "it" ? "Nome azienda" : "Firmenname"} value={seller.company_name} />
                      <InfoRow label={locale === "en" ? "Authorized person" : locale === "tr" ? "Yetkili kişi" : locale === "fr" ? "Personne autorisée" : locale === "es" ? "Persona autorizada" : locale === "it" ? "Persona autorizzata" : "Bevollmächtigte Person"} value={seller.authorized_person_name} />
                      <InfoRow label={locale === "en" ? "Tax No." : locale === "tr" ? "Vergi No." : locale === "fr" ? "N° fiscal" : locale === "es" ? "N° fiscal" : locale === "it" ? "N° fiscale" : "Steuer-Nr."} value={seller.tax_id} />
                      <InfoRow label={locale === "en" ? "VAT ID" : locale === "tr" ? "KDV No." : locale === "fr" ? "N° TVA" : locale === "es" ? "N° IVA" : locale === "it" ? "N° IVA" : "USt-IdNr."} value={seller.vat_id} />
                      <InfoRow label={ui.phone} value={seller.phone} />
                      <InfoRow label="Website" value={seller.website} />
                      <InfoRow label="IBAN" value={seller.iban ? seller.iban.replace(/(.{4})/g, "$1 ").trim() : null} />
                    </BlockStack>
                    <BlockStack gap="100">
                      <Text as="h3" variant="headingSm">{locale === "en" ? "Legal consent" : locale === "tr" ? "Yasal onay" : locale === "fr" ? "Consentement légal" : locale === "es" ? "Consentimiento legal" : locale === "it" ? "Consenso legale" : "Rechtliche Zustimmung"}</Text>
                      <InfoRow label={locale === "en" ? "Agreement accepted" : locale === "tr" ? "Sözleşme onaylandı" : locale === "fr" ? "Accord accepté" : locale === "es" ? "Acuerdo aceptado" : locale === "it" ? "Accordo accettato" : "Agreement akzeptiert"} value={seller.agreement_accepted ? ui.yes : ui.no} />
                      <InfoRow label={locale === "en" ? "Accepted on" : locale === "tr" ? "Onaylandı" : locale === "fr" ? "Accepté le" : locale === "es" ? "Aceptado el" : locale === "it" ? "Accettato il" : "Akzeptiert am"} value={fmtDate(seller.agreement_accepted_at, locale)} />
                      <InfoRow label={locale === "en" ? "Version" : locale === "tr" ? "Versiyon" : locale === "fr" ? "Version" : locale === "es" ? "Versión" : locale === "it" ? "Versione" : "Version"} value={seller.agreement_version} />
                      <InfoRow label="IP" value={seller.agreement_ip} />
                      <div style={{ marginTop: 8, borderTop: "1px solid #e5e7eb", paddingTop: 8 }}>
                        <Text as="h4" variant="headingSm">{locale === "en" ? "Handwritten signature" : locale === "tr" ? "El yazısı imza" : locale === "fr" ? "Signature manuscrite" : locale === "es" ? "Firma manuscrita" : locale === "it" ? "Firma autografa" : "Handschriftliche Unterschrift"}</Text>
                        {seller.signature_at ? (
                          <BlockStack gap="100">
                            <InfoRow label={locale === "en" ? "Signed on" : locale === "tr" ? "İmzalandı" : locale === "fr" ? "Signé le" : locale === "es" ? "Firmado el" : locale === "it" ? "Firmato il" : "Unterzeichnet am"} value={new Date(seller.signature_at).toLocaleString(locale === "en" ? "en-GB" : locale === "tr" ? "tr-TR" : locale === "fr" ? "fr-FR" : locale === "es" ? "es-ES" : locale === "it" ? "it-IT" : "de-DE", { dateStyle: "short", timeStyle: "medium" })} />
                            <InfoRow label={locale === "en" ? "Signature IP" : locale === "tr" ? "İmza IP" : locale === "fr" ? "IP de signature" : locale === "es" ? "IP de firma" : locale === "it" ? "IP firma" : "Unterschrift-IP"} value={seller.signature_ip} />
                            {seller.signature_data && (
                              <div style={{ marginTop: 6 }}>
                                <img
                                  src={seller.signature_data}
                                  alt={locale === "en" ? "Signature" : locale === "tr" ? "İmza" : locale === "fr" ? "Signature" : locale === "es" ? "Firma" : locale === "it" ? "Firma" : "Unterschrift"}
                                  style={{ border: "1px solid #e5e7eb", borderRadius: 6, maxWidth: 240, maxHeight: 80, display: "block" }}
                                />
                              </div>
                            )}
                            <div style={{ marginTop: 6 }}>
                              <Button size="slim" onClick={downloadSellerPdf} loading={pdfDownloading}>
                                {locale === "en" ? "Download signed PDF" : locale === "tr" ? "İmzalı PDF indir" : locale === "fr" ? "Télécharger le PDF signé" : locale === "es" ? "Descargar PDF firmado" : locale === "it" ? "Scarica PDF firmato" : "Unterzeichnetes PDF herunterladen"}
                              </Button>
                            </div>
                          </BlockStack>
                        ) : (
                          <Text as="p" variant="bodySm" tone="subdued">{locale === "en" ? "No handwritten signature yet." : locale === "tr" ? "Henüz el yazısı imza yok." : locale === "fr" ? "Pas encore de signature manuscrite." : locale === "es" ? "Aún no hay firma manuscrita." : locale === "it" ? "Ancora nessuna firma autografa." : "Noch keine handschriftliche Unterschrift vorhanden."}</Text>
                        )}
                      </div>
                    </BlockStack>
                    <BlockStack gap="100">
                      <Text as="h3" variant="headingSm">{locale === "en" ? "Business address" : locale === "tr" ? "İş adresi" : locale === "fr" ? "Adresse professionnelle" : locale === "es" ? "Dirección comercial" : locale === "it" ? "Indirizzo aziendale" : "Geschäftsadresse"}</Text>
                      <AddressBlock addr={(seller.setup?.locations || []).find((l) => l.is_billing) || seller.business_address} />
                    </BlockStack>
                    <BlockStack gap="100">
                      <Text as="h3" variant="headingSm">{locale === "en" ? "Warehouse address" : locale === "tr" ? "Depo adresi" : locale === "fr" ? "Adresse entrepôt" : locale === "es" ? "Dirección almacén" : locale === "it" ? "Indirizzo magazzino" : "Lageradresse"}</Text>
                      <AddressBlock addr={(seller.setup?.locations || []).find((l) => l.is_shipping_from) || seller.warehouse_address} />
                    </BlockStack>
                    <BlockStack gap="100">
                      <Text as="h3" variant="headingSm">{locale === "en" ? "Returns address" : locale === "tr" ? "İade adresi" : locale === "fr" ? "Adresse de retour" : locale === "es" ? "Dirección de devoluciones" : locale === "it" ? "Indirizzo resi" : "Retourenadresse"}</Text>
                      <AddressBlock addr={(seller.setup?.locations || []).find((l) => l.is_returns_to) || null} />
                    </BlockStack>
                    <BlockStack gap="100">
                      <InlineStack align="space-between" blockAlign="center">
                        <Text as="h3" variant="headingSm">{locale === "en" ? "Documents & Proof" : locale === "tr" ? "Belgeler & Kanıtlar" : locale === "fr" ? "Documents & Preuves" : locale === "es" ? "Documentos & Pruebas" : locale === "it" ? "Documenti & Prove" : "Dokumente & Nachweise"}</Text>
                        <Badge tone={sellerDocs.length > 0 ? "success" : "attention"}>{sellerDocs.length}</Badge>
                      </InlineStack>
                      {sellerDocs.length > 0 ? (
                        <BlockStack gap="100">
                          {sellerDocs.map((doc, i) => {
                            const url = typeof doc === "string" ? doc : (doc?.url || "");
                            const docFallback = locale === "en" ? "Document" : locale === "tr" ? "Belge" : locale === "fr" ? "Document" : locale === "es" ? "Documento" : locale === "it" ? "Documento" : "Dokument";
                            const name = typeof doc === "string" ? `${docFallback} ${i + 1}` : (doc?.name || `${docFallback} ${i + 1}`);
                            const typeLabel = detectDocTypeLabel(doc, locale);
                            return (
                              <div key={i} style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: "8px 10px" }}>
                                <InlineStack align="space-between" blockAlign="start">
                                  <BlockStack gap="050">
                                    <Text as="p" variant="bodyMd" fontWeight="semibold">{name}</Text>
                                    <Text as="p" variant="bodySm" tone="subdued">{typeLabel}</Text>
                                    {doc?.uploaded_at && <Text as="p" variant="bodySm" tone="subdued">Upload: {fmtDate(doc.uploaded_at, locale)}</Text>}
                                  </BlockStack>
                                  {url ? (
                                    <a
                                      href={url}
                                      download={name}
                                      onClick={(e) => {
                                        // Force download for cross-origin URLs via fetch+blob
                                        e.preventDefault();
                                        fetch(url)
                                          .then((r) => r.blob())
                                          .then((blob) => {
                                            const blobUrl = URL.createObjectURL(blob);
                                            const a = document.createElement("a");
                                            a.href = blobUrl;
                                            a.download = name;
                                            a.click();
                                            URL.revokeObjectURL(blobUrl);
                                          })
                                          .catch(() => {
                                            // Fallback: open in new tab
                                            window.open(url, "_blank", "noopener,noreferrer");
                                          });
                                      }}
                                      style={{ color: "#2563eb", fontSize: 13, textDecoration: "underline", cursor: "pointer" }}
                                    >
                                      {locale === "en" ? "Download" : locale === "tr" ? "İndir" : locale === "fr" ? "Télécharger" : locale === "es" ? "Descargar" : locale === "it" ? "Scarica" : "Herunterladen"}
                                    </a>
                                  ) : (
                                    <Text as="span" tone="subdued">{locale === "en" ? "No link" : locale === "tr" ? "Link yok" : locale === "fr" ? "Pas de lien" : locale === "es" ? "Sin enlace" : locale === "it" ? "Nessun link" : "Kein Link"}</Text>
                                  )}
                                </InlineStack>
                              </div>
                            );
                          })}
                        </BlockStack>
                      ) : (
                        <Banner tone="warning">
                          {locale === "en"
                            ? "No documents uploaded. For legally compliant approval, please request contract, signature, and ID/passport proof."
                            : locale === "tr"
                            ? "Belge yüklenmedi. Hukuki onay için sözleşme, imza ve kimlik/pasaport belgesi talep edin."
                            : locale === "fr"
                            ? "Aucun document téléversé. Pour une approbation conforme à la loi, veuillez demander le contrat, la signature et une preuve de passeport/ID."
                            : locale === "es"
                            ? "No se han subido documentos. Para una aprobación legalmente válida, solicite contrato, firma y prueba de pasaporte/DNI."
                            : locale === "it"
                            ? "Nessun documento caricato. Per un'approvazione legalmente valida, richiedere contratto, firma e prova di passaporto/ID."
                            : "Keine Dokumente hochgeladen. Für rechtssichere Freigabe bitte Vertrag, Unterschrift und Ausweis-/Pass-Nachweise anfordern."
                          }
                        </Banner>
                      )}
                    </BlockStack>
                  </div>

                  <Divider />
                  <RequiredSetupChecklist seller={seller} locale={locale} />
                  <Divider />
                  <AdminSellerCardSection sellerId={sellerId} />
                </BlockStack>
              )}
            </Box>
          </Tabs>
        </Card>
      </BlockStack>

      {/* ── Status change modal ──────────────────────────────────────────── */}
      <Modal
        open={approveModal}
        onClose={() => setApproveModal(false)}
        title={locale === "en" ? "Change status" : locale === "tr" ? "Durumu değiştir" : locale === "fr" ? "Changer le statut" : locale === "es" ? "Cambiar estado" : locale === "it" ? "Cambia stato" : "Status ändern"}
        primaryAction={{ content: ui.save, onAction: handleApprove, loading: approving }}
        secondaryActions={[{ content: ui.cancel, onAction: () => setApproveModal(false) }]}
      >
        <Modal.Section>
          <BlockStack gap="300">
            <Select
              label={locale === "en" ? "New status" : locale === "tr" ? "Yeni durum" : locale === "fr" ? "Nouveau statut" : locale === "es" ? "Nuevo estado" : locale === "it" ? "Nuovo stato" : "Neuer Status"}
              options={statusLabelsFor(locale)}
              value={newStatus}
              onChange={setNewStatus}
            />
            {newStatus === "rejected" && (
              <TextField
                label={locale === "en" ? "Rejection reason" : locale === "tr" ? "Red gerekçesi" : locale === "fr" ? "Motif de refus" : locale === "es" ? "Motivo de rechazo" : locale === "it" ? "Motivo del rifiuto" : "Ablehnungsgrund"}
                value={rejectReason}
                onChange={setRejectReason}
                multiline={3}
                autoComplete="off"
                placeholder={locale === "en" ? "Please provide the reason for rejection…" : locale === "tr" ? "Lütfen red gerekçesini girin…" : locale === "fr" ? "Veuillez indiquer le motif du refus…" : locale === "es" ? "Por favor indique el motivo del rechazo…" : locale === "it" ? "Si prega di indicare il motivo del rifiuto…" : "Bitte geben Sie den Grund für die Ablehnung an…"}
              />
            )}
            {newStatus === "approved" && (
              <Banner tone="success">
                {locale === "en" ? "After approval, all seller products will be automatically published." : locale === "tr" ? "Onaydan sonra satıcının tüm ürünleri otomatik olarak yayımlanacak." : locale === "fr" ? "Après approbation, tous les produits du vendeur seront automatiquement publiés." : locale === "es" ? "Tras la aprobación, todos los productos del vendedor se publicarán automáticamente." : locale === "it" ? "Dopo l'approvazione, tutti i prodotti del venditore verranno pubblicati automaticamente." : "Nach der Genehmigung werden alle Produkte des Verkäufers automatisch veröffentlicht."}
              </Banner>
            )}
            {(newStatus === "rejected" || newStatus === "suspended") && (
              <Banner tone="warning">
                {locale === "en"
                  ? 'On rejection/suspension, all seller products will be set to "Draft".'
                  : locale === "tr"
                    ? 'Red/askıya almada satıcının tüm ürünleri "Taslak" olarak ayarlanacak.'
                    : locale === "fr"
                      ? 'En cas de refus/suspension, tous les produits du vendeur seront définis comme "Brouillon".'
                      : locale === "es"
                      ? 'Al rechazar/suspender, todos los productos del vendedor se establecerán como "Borrador".'
                      : locale === "it"
                      ? 'In caso di rifiuto/sospensione, tutti i prodotti del venditore verranno impostati come "Bozza".'
                      : 'Bei Ablehnung/Sperrung werden alle Produkte des Verkäufers auf "Entwurf" gesetzt.'}
              </Banner>
            )}
          </BlockStack>
        </Modal.Section>
      </Modal>

      {/* ── Commission edit modal ────────────────────────────────────────── */}
      <Modal
        open={editCommission}
        onClose={() => setEditCommission(false)}
        title={locale === "en" ? "Change commission rate" : locale === "tr" ? "Komisyon oranını değiştir" : locale === "fr" ? "Modifier le taux de commission" : locale === "es" ? "Cambiar tasa de comisión" : locale === "it" ? "Modifica tasso di commissione" : "Provisionssatz ändern"}
        primaryAction={{ content: ui.save, onAction: handleSaveCommission, loading: savingCommission }}
        secondaryActions={[{ content: ui.cancel, onAction: () => setEditCommission(false) }]}
      >
        <Modal.Section>
          <TextField
            label={locale === "en" ? "Commission rate (%)" : locale === "tr" ? "Komisyon oranı (%)" : locale === "fr" ? "Taux de commission (%)" : locale === "es" ? "Tasa de comisión (%)" : locale === "it" ? "Tasso di commissione (%)" : "Provisionssatz (%)"}
            value={commissionVal}
            onChange={setCommissionVal}
            type="number"
            min="0"
            max="100"
            suffix="%"
            autoComplete="off"
            helpText={locale === "en" ? "Default: 12%. Valid values: 0–100." : locale === "tr" ? "Varsayılan: %12. Geçerli değerler: 0–100." : locale === "fr" ? "Par défaut : 12%. Valeurs valides : 0–100." : locale === "es" ? "Predeterminado: 12%. Valores válidos: 0–100." : locale === "it" ? "Predefinito: 12%. Valori validi: 0–100." : "Standard: 12%. Gültige Werte: 0–100."}
          />
        </Modal.Section>
      </Modal>

      {/* ── Payout create modal ──────────────────────────────────────────── */}
      <Modal
        open={payoutModal}
        onClose={() => setPayoutModal(false)}
        title={locale === "en" ? "Create payout" : locale === "tr" ? "Ödeme oluştur" : locale === "fr" ? "Créer un paiement" : locale === "es" ? "Crear pago" : locale === "it" ? "Crea pagamento" : "Neue Auszahlung erstellen"}
        primaryAction={{ content: locale === "en" ? "Create" : locale === "tr" ? "Oluştur" : locale === "fr" ? "Créer" : locale === "es" ? "Crear" : locale === "it" ? "Crea" : "Erstellen", onAction: handleCreatePayout, loading: savingPayout }}
        secondaryActions={[{ content: ui.cancel, onAction: () => setPayoutModal(false) }]}
      >
        <Modal.Section>
          <BlockStack gap="300">
            <InlineStack gap="300">
              <TextField label={locale === "en" ? "Period from" : locale === "tr" ? "Dönem başlangıcı" : locale === "fr" ? "Période du" : locale === "es" ? "Período desde" : locale === "it" ? "Periodo dal" : "Zeitraum von"} type="date" value={payoutForm.period_start}
                onChange={(v) => setPayoutForm((p) => ({ ...p, period_start: v }))} autoComplete="off" />
              <TextField label={locale === "en" ? "Period to" : locale === "tr" ? "Dönem bitişi" : locale === "fr" ? "Période au" : locale === "es" ? "Período hasta" : locale === "it" ? "Periodo al" : "Zeitraum bis"} type="date" value={payoutForm.period_end}
                onChange={(v) => setPayoutForm((p) => ({ ...p, period_end: v }))} autoComplete="off" />
            </InlineStack>
            <TextField label={locale === "en" ? "Total revenue (€)" : locale === "tr" ? "Toplam ciro (€)" : locale === "fr" ? "Chiffre d'affaires total (€)" : locale === "es" ? "Ingresos totales (€)" : locale === "it" ? "Fatturato totale (€)" : "Gesamtumsatz (€)"} value={payoutForm.total_cents}
              onChange={(v) => setPayoutForm((p) => ({ ...p, total_cents: v }))}
              autoComplete="off" placeholder={locale === "en" ? "e.g. 1234.56" : locale === "tr" ? "örn. 1234.56" : locale === "fr" ? "ex. 1234.56" : locale === "es" ? "ej. 1234.56" : locale === "it" ? "es. 1234.56" : "z.B. 1234.56"} />
            <TextField label={`${locale === "en" ? "Commission" : locale === "tr" ? "Komisyon" : locale === "fr" ? "Commission" : locale === "es" ? "Comisión" : locale === "it" ? "Commissione" : "Provision"} (${commissionPct}%)`} value={payoutForm.commission_cents}
              onChange={(v) => setPayoutForm((p) => ({ ...p, commission_cents: v }))}
              autoComplete="off" placeholder={locale === "en" ? "e.g. 123.46" : locale === "tr" ? "örn. 123.46" : locale === "fr" ? "ex. 123.46" : locale === "es" ? "ej. 123.46" : locale === "it" ? "es. 123.46" : "z.B. 123.46"} />
            <TextField label={locale === "en" ? "Payout amount (€)" : locale === "tr" ? "Ödeme tutarı (€)" : locale === "fr" ? "Montant du paiement (€)" : locale === "es" ? "Monto del pago (€)" : locale === "it" ? "Importo del pagamento (€)" : "Auszahlungsbetrag (€)"} value={payoutForm.payout_cents}
              onChange={(v) => setPayoutForm((p) => ({ ...p, payout_cents: v }))}
              autoComplete="off" placeholder={locale === "en" ? "Empty = revenue − commission" : locale === "tr" ? "Boş = ciro − komisyon" : locale === "fr" ? "Vide = CA − commission" : locale === "es" ? "Vacío = ingresos − comisión" : locale === "it" ? "Vuoto = fatturato − commissione" : "Leer = Umsatz − Provision"} />
            <TextField label={locale === "en" ? "Notes" : locale === "tr" ? "Notlar" : locale === "fr" ? "Notes" : locale === "es" ? "Notas" : locale === "it" ? "Note" : "Notizen"} value={payoutForm.notes}
              onChange={(v) => setPayoutForm((p) => ({ ...p, notes: v }))}
              multiline={2} autoComplete="off" />
            {seller.iban && (
              <Text as="p" variant="bodySm" tone="subdued">
                IBAN: {seller.iban.replace(/(.{4})/g, "$1 ").trim()}
              </Text>
            )}
          </BlockStack>
        </Modal.Section>
      </Modal>
    </Page>
  );
}
