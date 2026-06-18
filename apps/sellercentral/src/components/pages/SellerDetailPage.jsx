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
    if (!(await confirmDelete(locale === "en" ? "Really remove card?" : locale === "tr" ? "Kartı gerçekten kaldır?" : "Karte wirklich entfernen?"))) return;
    setErr(""); setDeleting(true);
    try {
      await client.deleteSellerCardByAdmin(sellerId);
      setInfo({ has_card: false, last4: null, brand: null });
      setOk(locale === "en" ? "Card removed." : locale === "tr" ? "Kart kaldırıldı." : "Karte entfernt.");
    } catch (e) {
      setErr(e?.message || (locale === "en" ? "Error." : locale === "tr" ? "Hata." : "Fehler."));
    } finally { setDeleting(false); }
  }, [client, sellerId]);

  if (loading) return <Spinner size="small" />;

  const brand = info?.brand ? (info.brand.charAt(0).toUpperCase() + info.brand.slice(1)) : (locale === "en" ? "Card" : locale === "tr" ? "Kart" : "Karte");
  const exp = info?.exp_month && info?.exp_year
    ? `${String(info.exp_month).padStart(2, "0")}/${String(info.exp_year).slice(-2)}`
    : null;

  return (
    <BlockStack gap="200">
      <Text as="h3" variant="headingSm">{locale === "en" ? "Credit card" : locale === "tr" ? "Kredi kartı" : "Kreditkarte"}</Text>
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
            {locale === "en" ? "Remove" : locale === "tr" ? "Kaldır" : "Entfernen"}
          </Button>
        </InlineStack>
      ) : (
        <Text as="p" variant="bodySm" tone="subdued">{locale === "en" ? "No credit card on file." : locale === "tr" ? "Kayıtlı kredi kartı yok." : "Keine Kreditkarte hinterlegt."}</Text>
      )}
    </BlockStack>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────
const STATUS_META = {
  registered:          { label: "Kayıt Oldu",       tone: "info",      next: ["documents_submitted", "pending_approval"] },
  documents_submitted: { label: "Evrak Gönderildi", tone: "attention", next: ["pending_approval", "rejected"] },
  pending_approval:    { label: "Onay Bekliyor",     tone: "warning",   next: ["approved", "rejected"] },
  approved:            { label: "Onaylandı",         tone: "success",   next: ["suspended"] },
  rejected:            { label: "Reddedildi",        tone: "critical",  next: ["pending_approval"] },
  suspended:           { label: "Askıya Alındı",     tone: "critical",  next: ["approved", "rejected"] },
};

const STATUS_LABELS = Object.entries(STATUS_META).map(([v, m]) => ({ value: v, label: m.label }));

function fmtCents(c, locale) {
  if (!c && c !== 0) return "€0,00";
  const loc = locale === "en" ? "en-GB" : locale === "tr" ? "tr-TR" : "de-DE";
  return (c / 100).toLocaleString(loc, { style: "currency", currency: "EUR" });
}

function fmtDate(d, locale) {
  if (!d) return "—";
  const loc = locale === "en" ? "en-GB" : locale === "tr" ? "tr-TR" : "de-DE";
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
    return locale === "en" ? "Contract / Agreement" : locale === "tr" ? "Sözleşme" : "Vertrag / Agreement";
  if (hay.includes("sign") || hay.includes("imza") || hay.includes("signature"))
    return locale === "en" ? "Signature" : locale === "tr" ? "İmza" : "Unterschrift / Signature";
  if (hay.includes("pass") || hay.includes("passport"))
    return locale === "en" ? "Passport" : locale === "tr" ? "Pasaport" : "Pass / Passport";
  if (hay.includes("id") || hay.includes("ausweis") || hay.includes("kimlik"))
    return locale === "en" ? "ID / Identity card" : locale === "tr" ? "Kimlik" : "ID / Ausweis";
  if (hay.includes("handels") || hay.includes("register"))
    return locale === "en" ? "Trade register" : locale === "tr" ? "Ticaret sicili" : "Handelsregister";
  if (hay.includes("steuer") || hay.includes("tax") || hay.includes("vat"))
    return locale === "en" ? "Tax / VAT" : locale === "tr" ? "Vergi / KDV" : "Steuer / VAT";
  return locale === "en" ? "Document" : locale === "tr" ? "Belge" : "Dokument";
}

function fmtMonth(d, locale) {
  if (!d) return "";
  const dt = new Date(d);
  const loc = locale === "en" ? "en-GB" : locale === "tr" ? "tr-TR" : "de-DE";
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
  const loc = locale === "en" ? "en-GB" : locale === "tr" ? "tr-TR" : "de-DE";
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
function BarChart({ data }) {
  if (!data || data.length === 0) return (
    <Box padding="400"><Text tone="subdued">Keine Daten</Text></Box>
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
      {a.street && <Text as="p" variant="bodySm">{a.street}</Text>}
      {(a.zip || a.city) && <Text as="p" variant="bodySm">{[a.zip, a.city].filter(Boolean).join(" ")}</Text>}
      {a.country && <Text as="p" variant="bodySm">{a.country}</Text>}
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
      setError(locale === "en" ? "No seller ID" : locale === "tr" ? "Satıcı kimliği yok" : "Keine Verkäufer-ID");
      return;
    }
    setLoading(true);
    client.getSellerById(sellerId)
      .then((r) => {
        setSeller(r.seller);
        setCommissionVal(((r.seller?.commission_rate || 0.12) * 100).toFixed(1));
        setError(null);
      })
      .catch((e) => setError(e?.message || (locale === "en" ? "Error loading" : locale === "tr" ? "Yükleme hatası" : "Fehler beim Laden")))
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
      setMsg({ tone: "success", text: locale === "en" ? `Status changed to "${STATUS_META[newStatus]?.label}".` : locale === "tr" ? `Durum "${STATUS_META[newStatus]?.label}" olarak değiştirildi.` : `Status wurde auf "${STATUS_META[newStatus]?.label}" geändert.` });
      setApproveModal(false);
      setRejectReason("");
    } catch (e) {
      setMsg({ tone: "critical", text: e?.message || (locale === "en" ? "Error" : locale === "tr" ? "Hata" : "Fehler") });
    } finally {
      setApproving(false);
    }
  };

  const handleSaveCommission = async () => {
    setSavingCommission(true);
    try {
      const rate = parseFloat(commissionVal.replace(",", ".")) / 100;
      if (isNaN(rate) || rate < 0 || rate > 1) throw new Error(locale === "en" ? "Invalid value (0–100%)" : locale === "tr" ? "Geçersiz değer (0–100%)" : "Ungültiger Wert (0–100%)");
      const r = await client.updateSellerById(sellerId, { commission_rate: rate });
      setSeller((p) => ({ ...p, commission_rate: r.seller?.commission_rate ?? rate }));
      setMsg({ tone: "success", text: locale === "en" ? "Commission saved." : locale === "tr" ? "Komisyon kaydedildi." : "Provision gespeichert." });
      setEditCommission(false);
    } catch (e) {
      setMsg({ tone: "critical", text: e?.message || (locale === "en" ? "Error" : locale === "tr" ? "Hata" : "Fehler") });
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
      setMsg({ tone: "success", text: locale === "en" ? "Payout created." : locale === "tr" ? "Ödeme oluşturuldu." : "Auszahlung erstellt." });
      setPayoutModal(false);
      setPayoutForm({ period_start: "", period_end: "", total_cents: "", commission_cents: "", payout_cents: "", notes: "" });
      load();
    } catch (e) {
      setMsg({ tone: "critical", text: e?.message || (locale === "en" ? "Error" : locale === "tr" ? "Hata" : "Fehler") });
    } finally {
      setSavingPayout(false);
    }
  };

  const handleMarkPaid = async (payout) => {
    const confirmMsg = locale === "en"
      ? `Mark payout ${fmtDate(payout.period_start, locale)}–${fmtDate(payout.period_end, locale)} as externally transferred?\n\nNote: This does not initiate a bank/Stripe transfer. First send the payment from the platform account to the seller IBAN, then mark as paid here.`
      : locale === "tr"
      ? `${fmtDate(payout.period_start, locale)}–${fmtDate(payout.period_end, locale)} ödemesini dışarıdan havale edildi olarak işaretle?\n\nNot: Bu işlem banka/Stripe transferi başlatmaz. Önce ödemeyi platform hesabından seller IBAN'ına gerçekten gönderin, sonra burada işaretleyin.`
      : `Auszahlung ${fmtDate(payout.period_start, locale)}–${fmtDate(payout.period_end, locale)} als extern überwiesen markieren?\n\nHinweis: Bu işlem banka/Stripe transferi başlatmaz. Önce ödemeyi platform hesabından seller IBAN'ına gerçekten gönderin, sonra burada "bezahlt" işaretleyin.`;
    if (!(await confirmDelete(confirmMsg))) return;
    try {
      await client.updatePayout(payout.id, { status: "bezahlt" });
      setMsg({ tone: "success", text: locale === "en" ? "Marked as externally transferred (paid)." : locale === "tr" ? "Dışarıdan havale edildi (ödendi) olarak işaretlendi." : "Als extern überwiesen (bezahlt) markiert." });
      load();
    } catch (e) {
      setMsg({ tone: "critical", text: e?.message || (locale === "en" ? "Error" : locale === "tr" ? "Hata" : "Fehler") });
    }
  };

  // Generate invoice text (simple text-based)
  const generateInvoice = (payout) => {
    const s = seller;
    const loc = locale === "en" ? "en-GB" : locale === "tr" ? "tr-TR" : "de-DE";
    const today = new Date().toLocaleDateString(loc, { day: "2-digit", month: "2-digit", year: "numeric" });
    const text = `PROVISIONSNOTE\n${"=".repeat(50)}\n
Aussteller: Andertal GmbH
Datum: ${today}

Empfänger:
${s.company_name || s.store_name || s.email}
${s.business_address ? JSON.stringify(s.business_address) : ""}
${s.tax_id ? `USt-IdNr.: ${s.tax_id}` : ""}

Abrechnungszeitraum: ${fmtDate(payout.period_start, locale)} – ${fmtDate(payout.period_end, locale)}

Gesamtumsatz (Brutto):    ${fmtCents(payout.total_cents, locale)}
Provision (${((seller.commission_rate || 0.12) * 100).toFixed(1)}%):       ${fmtCents(payout.commission_cents, locale)}
${"─".repeat(40)}
Auszahlungsbetrag:        ${fmtCents(payout.payout_cents, locale)}

IBAN: ${payout.iban || s.iban || "—"}

${payout.notes ? `Notizen: ${payout.notes}` : ""}
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
  const statusMeta = STATUS_META[status] || { label: status, tone: "info" };
  const commissionPct = ((parseFloat(seller.commission_rate) || 0.12) * 100).toFixed(1);
  const totalRevenue = (seller.monthly_revenue || []).reduce((a, m) => a + m.total_cents, 0);
  const totalOrders = (seller.monthly_revenue || []).reduce((a, m) => a + m.order_count, 0);
  const commissionTotal = Math.round(totalRevenue * (parseFloat(seller.commission_rate) || 0.12));
  const payoutTotal = totalRevenue - commissionTotal;

  const tabs = [
    { id: "overview", content: locale === "en" ? "Overview" : locale === "tr" ? "Genel Bakış" : "Übersicht" },
    { id: "finance", content: locale === "en" ? "Finance & Commissions" : locale === "tr" ? "Finans & Komisyonlar" : "Finanzen & Provisionen" },
    { id: "products", content: locale === "en" ? "Products" : locale === "tr" ? "Ürünler" : "Produkte" },
    { id: "company", content: locale === "en" ? "Company data" : locale === "tr" ? "Firma bilgileri" : "Firmendaten" },
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
      backAction={{ content: locale === "en" ? "Sellers" : locale === "tr" ? "Satıcılar" : "Verkäufer", onAction: () => router.push("/sellers") }}
      title={seller.store_name || seller.email}
      titleMetadata={<Badge tone={statusMeta.tone}>{statusMeta.label}</Badge>}
      subtitle={seller.email}
      primaryAction={{
        content: locale === "en" ? "Change status" : locale === "tr" ? "Durumu değiştir" : "Status ändern",
        onAction: () => { setNewStatus(STATUS_META[status]?.next?.[0] || "approved"); setApproveModal(true); },
      }}
      secondaryActions={[
        { content: locale === "en" ? "Edit commission" : locale === "tr" ? "Komisyonu düzenle" : "Provision bearbeiten", onAction: () => setEditCommission(true) },
        { content: locale === "en" ? "Create payout" : locale === "tr" ? "Ödeme oluştur" : "Auszahlung erstellen", onAction: () => setPayoutModal(true) },
      ]}
    >
      <BlockStack gap="500">
        {msg && (
          <Banner tone={msg.tone} onDismiss={() => setMsg(null)}>{msg.text}</Banner>
        )}

        {/* ── Stat strip ─────────────────────────────────────────────── */}
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <Stat label={locale === "en" ? "Total Revenue" : locale === "tr" ? "Toplam Ciro" : "Gesamtumsatz"} value={fmtCents(totalRevenue, locale)} sub={`${totalOrders} ${locale === "en" ? "Orders" : locale === "tr" ? "Sipariş" : "Bestellungen"}`} />
          <Stat label={locale === "en" ? "Commission" : locale === "tr" ? "Komisyon" : "Provision"} value={fmtCents(commissionTotal, locale)} sub={`${commissionPct}% Rate`} tone="critical" />
          <Stat label={locale === "en" ? "Payout Amount" : locale === "tr" ? "Ödeme Tutarı" : "Auszahlungsbetrag"} value={fmtCents(payoutTotal, locale)} tone="success" />
          <Stat label={locale === "en" ? "Products" : locale === "tr" ? "Ürünler" : "Produkte"} value={
            (seller.products_by_category || []).reduce((a, c) => a + c.count, 0)
          } />
          <Stat label={locale === "en" ? "Paid Payouts" : locale === "tr" ? "Ödenmiş Ödemeler" : "Bezahlte Auszahlungen"} value={fmtCents(seller.payout_summary?.total_paid_cents, locale)} />
          <Stat label={locale === "en" ? "Pending" : locale === "tr" ? "Bekleyen" : "Ausstehend"} value={fmtCents(seller.payout_summary?.total_pending_cents, locale)} tone="warning" />
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
                    <Text as="h3" variant="headingSm">{locale === "en" ? "Monthly Revenue (last 12 months)" : locale === "tr" ? "Aylık Ciro (son 12 ay)" : "Monatlicher Umsatz (letzte 12 Monate)"}</Text>
                    <BarChart data={seller.monthly_revenue} />
                  </BlockStack>

                  <Divider />

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
                    {/* Seller info */}
                    <BlockStack gap="100">
                      <Text as="h3" variant="headingSm">{locale === "en" ? "Account" : locale === "tr" ? "Hesap" : "Konto"}</Text>
                      <InfoRow label="Seller ID" value={seller.seller_id} />
                      <InfoRow label={ui.colEmail} value={seller.email} />
                      <InfoRow label={locale === "en" ? "Shop Name" : locale === "tr" ? "Mağaza Adı" : "Shop-Name"} value={seller.store_name} />
                      <InfoRow label={locale === "en" ? "Registered" : locale === "tr" ? "Kayıt Tarihi" : "Registriert"} value={fmtDate(seller.created_at, locale)} />
                      <InfoRow label={locale === "en" ? "Approved on" : locale === "tr" ? "Onaylandı" : "Genehmigt am"} value={fmtDate(seller.approved_at, locale)} />
                      <InfoRow label="Superuser" value={seller.is_superuser ? ui.yes : ui.no} />
                      <InfoRow label="IBAN" value={seller.iban ? seller.iban.replace(/(.{4})/g, "$1 ").trim() : null} />
                    </BlockStack>

                    {/* Provision */}
                    <BlockStack gap="100">
                      <Text as="h3" variant="headingSm">{locale === "en" ? "Commission" : locale === "tr" ? "Komisyon" : "Provision"}</Text>
                      <InfoRow label={locale === "en" ? "Commission rate" : locale === "tr" ? "Komisyon oranı" : "Provisionssatz"} value={`${commissionPct}%`} />
                      <InfoRow label={locale === "en" ? "Total commission" : locale === "tr" ? "Toplam komisyon" : "Ges. Provision"} value={fmtCents(commissionTotal, locale)} />
                      <InfoRow label={locale === "en" ? "Total payout" : locale === "tr" ? "Toplam ödeme" : "Ges. Auszahlung"} value={fmtCents(payoutTotal, locale)} />
                      <InfoRow label={locale === "en" ? "Paid" : locale === "tr" ? "Ödendi" : "Bezahlt"} value={fmtCents(seller.payout_summary?.total_paid_cents, locale)} />
                      <InfoRow label={locale === "en" ? "Pending" : locale === "tr" ? "Bekleyen" : "Ausstehend"} value={fmtCents(seller.payout_summary?.total_pending_cents, locale)} />
                    </BlockStack>
                  </div>

                  {/* Status history / rejection reason */}
                  {seller.rejection_reason && (
                    <Banner tone="critical">
                      <Text as="p" variant="bodySm"><strong>{locale === "en" ? "Rejection reason:" : locale === "tr" ? "Red gerekçesi:" : "Ablehnungsgrund:"}</strong> {seller.rejection_reason}</Text>
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
                      : <>Automatische Auszahlungen werden am 01. und 15. vorbereitet (Status: <strong>processing</strong>).<br /><strong>Wichtig:</strong> "Bezahlt/markieren" startet keine Zahlung. Erst echte Überweisung (z. B. Bank/Stripe) vom Plattformkonto zur Seller-IBAN durchführen, danach hier als bezahlt markieren.</>
                    }
                  </Banner>
                  <InlineStack gap="300" blockAlign="center" align="space-between">
                    <Text as="h3" variant="headingSm">{locale === "en" ? "Payout History & Billing Details" : locale === "tr" ? "Ödeme Geçmişi & Fatura Detayları" : "Auszahlungshistorie & Abrechnungsdetails"}</Text>
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
                                  title={selectable ? p.label : (locale === "en" ? "Available from the 16th of the month" : locale === "tr" ? "Ayın 16'sından itibaren mevcut" : "Ab dem 16. des Monats verfügbar")}
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
                            notes: p.notes || `Periode ${selectedPeriod.label}`,
                          }));
                          setPayoutModal(true);
                        }}
                      >
                        {locale === "en" ? "+ Create payout" : locale === "tr" ? "+ Ödeme oluştur" : "+ Auszahlung erstellen"}
                      </Button>
                    </InlineStack>
                  </InlineStack>

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(160px, 1fr))", gap: 10 }}>
                    <Stat label={locale === "en" ? "Revenue (Period)" : locale === "tr" ? "Ciro (Dönem)" : "Umsatz (Periode)"} value={fmtCents(periodTotalCents, locale)} />
                    <Stat label={locale === "en" ? "Commission (Period)" : locale === "tr" ? "Komisyon (Dönem)" : "Provision (Periode)"} value={fmtCents(periodCommissionCents, locale)} />
                    <Stat label={locale === "en" ? "Payout (Period)" : locale === "tr" ? "Ödeme (Dönem)" : "Auszahlung (Periode)"} value={fmtCents(periodPayoutCents, locale)} tone="success" />
                    <Stat label={locale === "en" ? "Orders (eligible / total)" : locale === "tr" ? "Siparişler (uygun / toplam)" : "Orders (eligible / total)"} value={`${periodEligibleCount} / ${periodTransactions.length}`} />
                  </div>

                  <Card>
                    <BlockStack gap="200">
                      <Text as="h3" variant="headingSm">{locale === "en" ? "Transactions in selected period" : locale === "tr" ? "Seçili dönemdeki işlemler" : "Transaktionen in gewählter Periode"}</Text>
                      {periodTransactionsLoading ? (
                        <Text as="p" variant="bodySm" tone="subdued">{ui.loading}</Text>
                      ) : periodTransactions.length === 0 ? (
                        <Text as="p" variant="bodySm" tone="subdued">{locale === "en" ? "No transactions in this period." : locale === "tr" ? "Bu dönemde işlem yok." : "Keine Transaktionen in dieser Periode."}</Text>
                      ) : (
                        <div style={{ overflowX: "auto" }}>
                          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                            <thead>
                              <tr style={{ background: "#f6f6f7", borderBottom: "1px solid #e1e3e5" }}>
                                {(locale === "en"
                                  ? ["Order", "Customer", "Date", "Revenue", "Commission", "Payout", "Delivery", "Eligible"]
                                  : locale === "tr"
                                  ? ["Sipariş", "Müşteri", "Tarih", "Ciro", "Komisyon", "Ödeme", "Teslimat", "Uygun"]
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
                      <Text as="p" tone="subdued">{locale === "en" ? "No payouts yet." : locale === "tr" ? "Henüz ödeme yok." : "Noch keine Auszahlungen."}</Text>
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
                                  {p.status === "bezahlt" ? (locale === "en" ? "Paid" : locale === "tr" ? "Ödendi" : "Bezahlt") : (locale === "en" ? "Open" : locale === "tr" ? "Açık" : "Offen")}
                                </Badge>
                              </td>
                              <td style={{ padding: "8px 12px", fontFamily: "monospace", fontSize: 11, color: "#6b7280" }}>
                                {(p.iban || seller.iban || "—").replace(/(.{4})/g, "$1 ").trim()}
                              </td>
                              <td style={{ padding: "8px 12px" }}>
                                <InlineStack gap="200">
                                  {p.status !== "bezahlt" && (
                                    <Button size="slim" variant="primary" onClick={() => handleMarkPaid(p)}>{locale === "en" ? "Mark as transferred" : locale === "tr" ? "Havale edildi olarak işaretle" : "Als überwiesen markieren"}</Button>
                                  )}
                                  <Button size="slim" onClick={() => generateInvoice(p)}>{locale === "en" ? "Invoice" : locale === "tr" ? "Fatura" : "Rechnung"}</Button>
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
                  <Text as="h3" variant="headingSm">{locale === "en" ? "Products by category" : locale === "tr" ? "Kategoriye göre ürünler" : "Produkte nach Kategorie"}</Text>

                  {!seller.products_by_category || seller.products_by_category.length === 0 ? (
                    <Box padding="600" background="bg-surface-secondary" borderRadius="200">
                      <Text as="p" tone="subdued">{locale === "en" ? "No products found." : locale === "tr" ? "Ürün bulunamadı." : "Keine Produkte gefunden."}</Text>
                    </Box>
                  ) : (
                    <div>
                      {seller.products_by_category.map((cat, i) => {
                        const total = seller.products_by_category.reduce((a, c) => a + c.count, 0);
                        const pct = total > 0 ? Math.round((cat.count / total) * 100) : 0;
                        return (
                          <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0", borderBottom: "1px solid #f1f1f1" }}>
                            <div style={{ flex: "0 0 180px" }}>
                              <Text as="span" variant="bodyMd">{cat.category || (locale === "en" ? "Uncategorized" : locale === "tr" ? "Kategorisiz" : "Unkategorisiert")}</Text>
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
                      : "Firmendaten-Review: Bitte Gesellschaftsdaten, rechtliche Zustimmung und hochgeladene Nachweise (Vertrag, Unterschrift, Pass/ID usw.) prüfen."
                    }
                  </Banner>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
                    <BlockStack gap="100">
                      <Text as="h3" variant="headingSm">{locale === "en" ? "Company details" : locale === "tr" ? "Firma bilgileri" : "Firmendaten"}</Text>
                      <InfoRow label={locale === "en" ? "Company name" : locale === "tr" ? "Firma adı" : "Firmenname"} value={seller.company_name} />
                      <InfoRow label={locale === "en" ? "Authorized person" : locale === "tr" ? "Yetkili kişi" : "Bevollmächtigte Person"} value={seller.authorized_person_name} />
                      <InfoRow label={locale === "en" ? "Tax No." : locale === "tr" ? "Vergi No." : "Steuer-Nr."} value={seller.tax_id} />
                      <InfoRow label={locale === "en" ? "VAT ID" : locale === "tr" ? "KDV No." : "USt-IdNr."} value={seller.vat_id} />
                      <InfoRow label={ui.phone} value={seller.phone} />
                      <InfoRow label="Website" value={seller.website} />
                      <InfoRow label="IBAN" value={seller.iban ? seller.iban.replace(/(.{4})/g, "$1 ").trim() : null} />
                    </BlockStack>
                    <BlockStack gap="100">
                      <Text as="h3" variant="headingSm">{locale === "en" ? "Legal consent" : locale === "tr" ? "Yasal onay" : "Rechtliche Zustimmung"}</Text>
                      <InfoRow label={locale === "en" ? "Agreement accepted" : locale === "tr" ? "Sözleşme onaylandı" : "Agreement akzeptiert"} value={seller.agreement_accepted ? ui.yes : ui.no} />
                      <InfoRow label={locale === "en" ? "Accepted on" : locale === "tr" ? "Onaylandı" : "Akzeptiert am"} value={fmtDate(seller.agreement_accepted_at, locale)} />
                      <InfoRow label={locale === "en" ? "Version" : locale === "tr" ? "Versiyon" : "Version"} value={seller.agreement_version} />
                      <InfoRow label="IP" value={seller.agreement_ip} />
                      <div style={{ marginTop: 8, borderTop: "1px solid #e5e7eb", paddingTop: 8 }}>
                        <Text as="h4" variant="headingSm">{locale === "en" ? "Handwritten signature" : locale === "tr" ? "El yazısı imza" : "Handschriftliche Unterschrift"}</Text>
                        {seller.signature_at ? (
                          <BlockStack gap="100">
                            <InfoRow label={locale === "en" ? "Signed on" : locale === "tr" ? "İmzalandı" : "Unterzeichnet am"} value={new Date(seller.signature_at).toLocaleString(locale === "en" ? "en-GB" : locale === "tr" ? "tr-TR" : "de-DE", { dateStyle: "short", timeStyle: "medium" })} />
                            <InfoRow label={locale === "en" ? "Signature IP" : locale === "tr" ? "İmza IP" : "Unterschrift-IP"} value={seller.signature_ip} />
                            {seller.signature_data && (
                              <div style={{ marginTop: 6 }}>
                                <img
                                  src={seller.signature_data}
                                  alt={locale === "en" ? "Signature" : locale === "tr" ? "İmza" : "Unterschrift"}
                                  style={{ border: "1px solid #e5e7eb", borderRadius: 6, maxWidth: 240, maxHeight: 80, display: "block" }}
                                />
                              </div>
                            )}
                            <div style={{ marginTop: 6 }}>
                              <Button size="slim" onClick={downloadSellerPdf} loading={pdfDownloading}>
                                {locale === "en" ? "Download signed PDF" : locale === "tr" ? "İmzalı PDF indir" : "Unterzeichnetes PDF herunterladen"}
                              </Button>
                            </div>
                          </BlockStack>
                        ) : (
                          <Text as="p" variant="bodySm" tone="subdued">{locale === "en" ? "No handwritten signature yet." : locale === "tr" ? "Henüz el yazısı imza yok." : "Noch keine handschriftliche Unterschrift vorhanden."}</Text>
                        )}
                      </div>
                    </BlockStack>
                    <BlockStack gap="100">
                      <Text as="h3" variant="headingSm">{locale === "en" ? "Business address" : locale === "tr" ? "İş adresi" : "Geschäftsadresse"}</Text>
                      <AddressBlock addr={seller.business_address} />
                    </BlockStack>
                    <BlockStack gap="100">
                      <Text as="h3" variant="headingSm">{locale === "en" ? "Warehouse address" : locale === "tr" ? "Depo adresi" : "Lageradresse"}</Text>
                      <AddressBlock addr={seller.warehouse_address} />
                    </BlockStack>
                    <BlockStack gap="100">
                      <InlineStack align="space-between" blockAlign="center">
                        <Text as="h3" variant="headingSm">{locale === "en" ? "Documents & Proof" : locale === "tr" ? "Belgeler & Kanıtlar" : "Dokumente & Nachweise"}</Text>
                        <Badge tone={sellerDocs.length > 0 ? "success" : "attention"}>{sellerDocs.length}</Badge>
                      </InlineStack>
                      {sellerDocs.length > 0 ? (
                        <BlockStack gap="100">
                          {sellerDocs.map((doc, i) => {
                            const url = typeof doc === "string" ? doc : (doc?.url || "");
                            const name = typeof doc === "string" ? `Dokument ${i + 1}` : (doc?.name || `Dokument ${i + 1}`);
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
                                      {locale === "en" ? "Download" : locale === "tr" ? "İndir" : "Herunterladen"}
                                    </a>
                                  ) : (
                                    <Text as="span" tone="subdued">{locale === "en" ? "No link" : locale === "tr" ? "Link yok" : "Kein Link"}</Text>
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
                            : "Keine Dokumente hochgeladen. Für rechtssichere Freigabe bitte Vertrag, Unterschrift und Ausweis-/Pass-Nachweise anfordern."
                          }
                        </Banner>
                      )}
                    </BlockStack>
                  </div>

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
        title={locale === "en" ? "Change status" : locale === "tr" ? "Durumu değiştir" : "Status ändern"}
        primaryAction={{ content: ui.save, onAction: handleApprove, loading: approving }}
        secondaryActions={[{ content: ui.cancel, onAction: () => setApproveModal(false) }]}
      >
        <Modal.Section>
          <BlockStack gap="300">
            <Select
              label={locale === "en" ? "New status" : locale === "tr" ? "Yeni durum" : "Neuer Status"}
              options={STATUS_LABELS}
              value={newStatus}
              onChange={setNewStatus}
            />
            {newStatus === "rejected" && (
              <TextField
                label={locale === "en" ? "Rejection reason" : locale === "tr" ? "Red gerekçesi" : "Ablehnungsgrund"}
                value={rejectReason}
                onChange={setRejectReason}
                multiline={3}
                autoComplete="off"
                placeholder={locale === "en" ? "Please provide the reason for rejection…" : locale === "tr" ? "Lütfen red gerekçesini girin…" : "Bitte geben Sie den Grund für die Ablehnung an…"}
              />
            )}
            {newStatus === "approved" && (
              <Banner tone="success">
                {locale === "en" ? "After approval, all seller products will be automatically published." : locale === "tr" ? "Onaydan sonra satıcının tüm ürünleri otomatik olarak yayımlanacak." : "Nach der Genehmigung werden alle Produkte des Verkäufers automatisch veröffentlicht."}
              </Banner>
            )}
            {(newStatus === "rejected" || newStatus === "suspended") && (
              <Banner tone="warning">
                {locale === "en" ? "On rejection/suspension, all seller products will be set to "Draft"." : locale === "tr" ? "Red/askıya almada satıcının tüm ürünleri "Taslak" olarak ayarlanacak." : "Bei Ablehnung/Sperrung werden alle Produkte des Verkäufers auf „Entwurf" gesetzt."}
              </Banner>
            )}
          </BlockStack>
        </Modal.Section>
      </Modal>

      {/* ── Commission edit modal ────────────────────────────────────────── */}
      <Modal
        open={editCommission}
        onClose={() => setEditCommission(false)}
        title={locale === "en" ? "Change commission rate" : locale === "tr" ? "Komisyon oranını değiştir" : "Provisonssatz ändern"}
        primaryAction={{ content: ui.save, onAction: handleSaveCommission, loading: savingCommission }}
        secondaryActions={[{ content: ui.cancel, onAction: () => setEditCommission(false) }]}
      >
        <Modal.Section>
          <TextField
            label={locale === "en" ? "Commission rate (%)" : locale === "tr" ? "Komisyon oranı (%)" : "Provisionssatz (%)"}
            value={commissionVal}
            onChange={setCommissionVal}
            type="number"
            min="0"
            max="100"
            suffix="%"
            autoComplete="off"
            helpText={locale === "en" ? "Default: 12%. Valid values: 0–100." : locale === "tr" ? "Varsayılan: %12. Geçerli değerler: 0–100." : "Standard: 12%. Gültige Werte: 0–100."}
          />
        </Modal.Section>
      </Modal>

      {/* ── Payout create modal ──────────────────────────────────────────── */}
      <Modal
        open={payoutModal}
        onClose={() => setPayoutModal(false)}
        title="Neue Auszahlung erstellen"
        primaryAction={{ content: locale === "en" ? "Create" : locale === "tr" ? "Oluştur" : "Erstellen", onAction: handleCreatePayout, loading: savingPayout }}
        secondaryActions={[{ content: ui.cancel, onAction: () => setPayoutModal(false) }]}
      >
        <Modal.Section>
          <BlockStack gap="300">
            <InlineStack gap="300">
              <TextField label={locale === "en" ? "Period from" : locale === "tr" ? "Dönem başlangıcı" : "Zeitraum von"} type="date" value={payoutForm.period_start}
                onChange={(v) => setPayoutForm((p) => ({ ...p, period_start: v }))} autoComplete="off" />
              <TextField label={locale === "en" ? "Period to" : locale === "tr" ? "Dönem bitişi" : "Zeitraum bis"} type="date" value={payoutForm.period_end}
                onChange={(v) => setPayoutForm((p) => ({ ...p, period_end: v }))} autoComplete="off" />
            </InlineStack>
            <TextField label={locale === "en" ? "Total revenue (€)" : locale === "tr" ? "Toplam ciro (€)" : "Gesamtumsatz (€)"} value={payoutForm.total_cents}
              onChange={(v) => setPayoutForm((p) => ({ ...p, total_cents: v }))}
              autoComplete="off" placeholder={locale === "en" ? "e.g. 1234.56" : locale === "tr" ? "örn. 1234.56" : "z.B. 1234.56"} />
            <TextField label={`${locale === "en" ? "Commission" : locale === "tr" ? "Komisyon" : "Provision"} (${commissionPct}%)`} value={payoutForm.commission_cents}
              onChange={(v) => setPayoutForm((p) => ({ ...p, commission_cents: v }))}
              autoComplete="off" placeholder={locale === "en" ? "e.g. 123.46" : locale === "tr" ? "örn. 123.46" : "z.B. 123.46"} />
            <TextField label={locale === "en" ? "Payout amount (€)" : locale === "tr" ? "Ödeme tutarı (€)" : "Auszahlungsbetrag (€)"} value={payoutForm.payout_cents}
              onChange={(v) => setPayoutForm((p) => ({ ...p, payout_cents: v }))}
              autoComplete="off" placeholder={locale === "en" ? "Empty = revenue − commission" : locale === "tr" ? "Boş = ciro − komisyon" : "Leer = Umsatz − Provision"} />
            <TextField label={locale === "en" ? "Notes" : locale === "tr" ? "Notlar" : "Notizen"} value={payoutForm.notes}
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
