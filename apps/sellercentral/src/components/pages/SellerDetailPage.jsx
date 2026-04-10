"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Page, Card, Text, BlockStack, InlineStack, Badge, Button, Banner,
  TextField, Select, Box, Spinner, Divider, Modal, Tabs,
} from "@shopify/polaris";
import { useRouter } from "@/i18n/navigation";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";

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

function fmtCents(c) {
  if (!c && c !== 0) return "€0,00";
  return (c / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" });
}

function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
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

function detectDocTypeLabel(doc) {
  const hay = `${doc?.name || ""} ${doc?.type || ""} ${doc?.kind || ""}`.toLowerCase();
  if (hay.includes("vertrag") || hay.includes("contract") || hay.includes("agreement")) return "Vertrag / Agreement";
  if (hay.includes("sign") || hay.includes("imza") || hay.includes("signature")) return "Unterschrift / Signature";
  if (hay.includes("pass") || hay.includes("passport")) return "Pass / Passport";
  if (hay.includes("id") || hay.includes("ausweis") || hay.includes("kimlik")) return "ID / Ausweis";
  if (hay.includes("handels") || hay.includes("register")) return "Handelsregister";
  if (hay.includes("steuer") || hay.includes("tax") || hay.includes("vat")) return "Steuer / VAT";
  return "Dokument";
}

function fmtMonth(d) {
  if (!d) return "";
  const dt = new Date(d);
  return dt.toLocaleDateString("de-DE", { month: "short", year: "2-digit" });
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
              title={`${fmtMonth(d.month)}: ${fmtCents(d.total_cents)}`}
              style={{ width: "100%", height: h, background: "#2563eb", borderRadius: "3px 3px 0 0", transition: "height .2s" }}
            />
            <span style={{ fontSize: 9, color: "#9ca3af", whiteSpace: "nowrap" }}>{fmtMonth(d.month)}</span>
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
  const client = getMedusaAdminClient();

  const [seller, setSeller] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [msg, setMsg] = useState(null);
  const [activeTab, setActiveTab] = useState(0);

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
  const [periodKey, setPeriodKey] = useState(PAYOUT_PERIODS[0]?.key || "");
  const [periodTransactions, setPeriodTransactions] = useState([]);
  const [periodTransactionsLoading, setPeriodTransactionsLoading] = useState(false);

  const load = useCallback(() => {
    if (!sellerId) {
      setLoading(false);
      setError("Keine Verkäufer-ID");
      return;
    }
    setLoading(true);
    client.getSellerById(sellerId)
      .then((r) => {
        setSeller(r.seller);
        setCommissionVal(((r.seller?.commission_rate || 0.12) * 100).toFixed(1));
        setError(null);
      })
      .catch((e) => setError(e?.message || "Fehler beim Laden"))
      .finally(() => setLoading(false));
  }, [sellerId]);

  useEffect(() => { load(); }, [load]);

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
      setMsg({ tone: "success", text: `Status wurde auf "${STATUS_META[newStatus]?.label}" geändert.` });
      setApproveModal(false);
      setRejectReason("");
    } catch (e) {
      setMsg({ tone: "critical", text: e?.message || "Fehler" });
    } finally {
      setApproving(false);
    }
  };

  const handleSaveCommission = async () => {
    setSavingCommission(true);
    try {
      const rate = parseFloat(commissionVal.replace(",", ".")) / 100;
      if (isNaN(rate) || rate < 0 || rate > 1) throw new Error("Ungültiger Wert (0–100%)");
      const r = await client.updateSellerById(sellerId, { commission_rate: rate });
      setSeller((p) => ({ ...p, commission_rate: r.seller?.commission_rate ?? rate }));
      setMsg({ tone: "success", text: "Provision gespeichert." });
      setEditCommission(false);
    } catch (e) {
      setMsg({ tone: "critical", text: e?.message || "Fehler" });
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
      setMsg({ tone: "success", text: "Auszahlung erstellt." });
      setPayoutModal(false);
      setPayoutForm({ period_start: "", period_end: "", total_cents: "", commission_cents: "", payout_cents: "", notes: "" });
      load();
    } catch (e) {
      setMsg({ tone: "critical", text: e?.message || "Fehler" });
    } finally {
      setSavingPayout(false);
    }
  };

  const handleMarkPaid = async (payout) => {
    if (!confirm(
      `Auszahlung ${fmtDate(payout.period_start)}–${fmtDate(payout.period_end)} als extern überwiesen markieren?\n\n` +
      `Hinweis: Bu işlem banka/Stripe transferi başlatmaz. Önce ödemeyi platform hesabından seller IBAN'ına gerçekten gönderin, sonra burada "bezahlt" işaretleyin.`
    )) return;
    try {
      await client.updatePayout(payout.id, { status: "bezahlt" });
      setMsg({ tone: "success", text: "Als extern überwiesen (bezahlt) markiert." });
      load();
    } catch (e) {
      setMsg({ tone: "critical", text: e?.message || "Fehler" });
    }
  };

  // Generate invoice text (simple text-based)
  const generateInvoice = (payout) => {
    const s = seller;
    const today = new Date().toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
    const text = `PROVISIONSNOTE\n${"=".repeat(50)}\n
Aussteller: Belucha GmbH
Datum: ${today}

Empfänger:
${s.company_name || s.store_name || s.email}
${s.business_address ? JSON.stringify(s.business_address) : ""}
${s.tax_id ? `USt-IdNr.: ${s.tax_id}` : ""}

Abrechnungszeitraum: ${fmtDate(payout.period_start)} – ${fmtDate(payout.period_end)}

Gesamtumsatz (Brutto):    ${fmtCents(payout.total_cents)}
Provision (${((seller.commission_rate || 0.12) * 100).toFixed(1)}%):       ${fmtCents(payout.commission_cents)}
${"─".repeat(40)}
Auszahlungsbetrag:        ${fmtCents(payout.payout_cents)}

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
    { id: "overview", content: "Übersicht" },
    { id: "finance", content: "Finanzen & Provisionen" },
    { id: "products", content: "Produkte" },
    { id: "company", content: "Firmendaten" },
  ];
  const selectedPeriod = PAYOUT_PERIODS.find((p) => p.key === periodKey) || PAYOUT_PERIODS[0];
  const periodTotalCents = periodTransactions.reduce((sum, t) => sum + (t.total_cents || 0), 0);
  const periodCommissionCents = periodTransactions.reduce((sum, t) => sum + (t.commission_cents || 0), 0);
  const periodPayoutCents = periodTransactions.reduce((sum, t) => sum + (t.payout_cents || 0), 0);
  const periodEligibleCount = periodTransactions.filter((t) => t.payout_eligible).length;
  const sellerDocs = parseDocuments(seller.documents);

  return (
    <Page
      backAction={{ content: "Verkäufer", onAction: () => router.push("/sellers") }}
      title={seller.store_name || seller.email}
      titleMetadata={<Badge tone={statusMeta.tone}>{statusMeta.label}</Badge>}
      subtitle={seller.email}
      primaryAction={{
        content: "Status ändern",
        onAction: () => { setNewStatus(STATUS_META[status]?.next?.[0] || "approved"); setApproveModal(true); },
      }}
      secondaryActions={[
        { content: "Provision bearbeiten", onAction: () => setEditCommission(true) },
        { content: "Auszahlung erstellen", onAction: () => setPayoutModal(true) },
      ]}
    >
      <BlockStack gap="500">
        {msg && (
          <Banner tone={msg.tone} onDismiss={() => setMsg(null)}>{msg.text}</Banner>
        )}

        {/* ── Stat strip ─────────────────────────────────────────────── */}
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <Stat label="Gesamtumsatz" value={fmtCents(totalRevenue)} sub={`${totalOrders} Bestellungen`} />
          <Stat label="Provision" value={fmtCents(commissionTotal)} sub={`${commissionPct}% Rate`} tone="critical" />
          <Stat label="Auszahlungsbetrag" value={fmtCents(payoutTotal)} tone="success" />
          <Stat label="Produkte" value={
            (seller.products_by_category || []).reduce((a, c) => a + c.count, 0)
          } />
          <Stat label="Bezahlte Auszahlungen" value={fmtCents(seller.payout_summary?.total_paid_cents)} />
          <Stat label="Ausstehend" value={fmtCents(seller.payout_summary?.total_pending_cents)} tone="warning" />
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
                    <Text as="h3" variant="headingSm">Monatlicher Umsatz (letzte 12 Monate)</Text>
                    <BarChart data={seller.monthly_revenue} />
                  </BlockStack>

                  <Divider />

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
                    {/* Seller info */}
                    <BlockStack gap="100">
                      <Text as="h3" variant="headingSm">Konto</Text>
                      <InfoRow label="Seller ID" value={seller.seller_id} />
                      <InfoRow label="E-Mail" value={seller.email} />
                      <InfoRow label="Shop-Name" value={seller.store_name} />
                      <InfoRow label="Registriert" value={fmtDate(seller.created_at)} />
                      <InfoRow label="Genehmigt am" value={fmtDate(seller.approved_at)} />
                      <InfoRow label="Superuser" value={seller.is_superuser ? "Ja" : "Nein"} />
                      <InfoRow label="IBAN" value={seller.iban ? seller.iban.replace(/(.{4})/g, "$1 ").trim() : null} />
                    </BlockStack>

                    {/* Provision */}
                    <BlockStack gap="100">
                      <Text as="h3" variant="headingSm">Provision</Text>
                      <InfoRow label="Provisionssatz" value={`${commissionPct}%`} />
                      <InfoRow label="Ges. Provision" value={fmtCents(commissionTotal)} />
                      <InfoRow label="Ges. Auszahlung" value={fmtCents(payoutTotal)} />
                      <InfoRow label="Bezahlt" value={fmtCents(seller.payout_summary?.total_paid_cents)} />
                      <InfoRow label="Ausstehend" value={fmtCents(seller.payout_summary?.total_pending_cents)} />
                    </BlockStack>
                  </div>

                  {/* Status history / rejection reason */}
                  {seller.rejection_reason && (
                    <Banner tone="critical">
                      <Text as="p" variant="bodySm"><strong>Ablehnungsgrund:</strong> {seller.rejection_reason}</Text>
                    </Banner>
                  )}
                </BlockStack>
              )}

              {/* ── FINANCE TAB ──────────────────────────────────── */}
              {activeTab === 1 && (
                <BlockStack gap="400">
                  <Banner tone="info">
                    Automatische Auszahlungen werden am 01. und 15. vorbereitet (Status: <strong>processing</strong>).
                    <br />
                    <strong>Wichtig:</strong> "Bezahlt/markieren" startet keine Zahlung. Erst echte Überweisung (z. B. Bank/Stripe) vom Plattformkonto zur Seller-IBAN durchführen, danach hier als bezahlt markieren.
                  </Banner>
                  <InlineStack gap="300" blockAlign="center" align="space-between">
                    <Text as="h3" variant="headingSm">Auszahlungshistorie & Abrechnungsdetails</Text>
                    <InlineStack gap="200" blockAlign="center">
                      <div style={{ minWidth: 320 }}>
                        <Select
                          label=""
                          labelHidden
                          options={PAYOUT_PERIODS.map((p) => ({ label: p.label, value: p.key }))}
                          value={periodKey}
                          onChange={setPeriodKey}
                        />
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
                        + Auszahlung erstellen
                      </Button>
                    </InlineStack>
                  </InlineStack>

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(160px, 1fr))", gap: 10 }}>
                    <Stat label="Umsatz (Periode)" value={fmtCents(periodTotalCents)} />
                    <Stat label="Provision (Periode)" value={fmtCents(periodCommissionCents)} />
                    <Stat label="Auszahlung (Periode)" value={fmtCents(periodPayoutCents)} tone="success" />
                    <Stat label="Orders (eligible / total)" value={`${periodEligibleCount} / ${periodTransactions.length}`} />
                  </div>

                  <Card>
                    <BlockStack gap="200">
                      <Text as="h3" variant="headingSm">Transaktionen in gewählter Periode</Text>
                      {periodTransactionsLoading ? (
                        <Text as="p" variant="bodySm" tone="subdued">Laden…</Text>
                      ) : periodTransactions.length === 0 ? (
                        <Text as="p" variant="bodySm" tone="subdued">Keine Transaktionen in dieser Periode.</Text>
                      ) : (
                        <div style={{ overflowX: "auto" }}>
                          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                            <thead>
                              <tr style={{ background: "#f6f6f7", borderBottom: "1px solid #e1e3e5" }}>
                                {["Bestellung", "Kunde", "Datum", "Umsatz", "Provision", "Auszahlung", "Lieferung", "Eligible"].map((h) => (
                                  <th key={h} style={{ padding: "8px 10px", textAlign: "left", color: "#6d7175", fontWeight: 600, whiteSpace: "nowrap" }}>{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {periodTransactions.map((t) => (
                                <tr key={t.id} style={{ borderBottom: "1px solid #f1f1f1" }}>
                                  <td style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>#{t.order_number || "—"}</td>
                                  <td style={{ padding: "8px 10px" }}>{[t.first_name, t.last_name].filter(Boolean).join(" ") || "—"}</td>
                                  <td style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>{fmtDate(t.created_at)}</td>
                                  <td style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>{fmtCents(t.total_cents || 0)}</td>
                                  <td style={{ padding: "8px 10px", whiteSpace: "nowrap", color: "#dc2626" }}>{fmtCents(t.commission_cents || 0)}</td>
                                  <td style={{ padding: "8px 10px", whiteSpace: "nowrap", color: "#16a34a" }}>{fmtCents(t.payout_cents || 0)}</td>
                                  <td style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>{fmtDate(t.delivery_date)}</td>
                                  <td style={{ padding: "8px 10px" }}>
                                    <Badge tone={t.payout_eligible ? "success" : "warning"}>{t.payout_eligible ? "Ja" : "Nein"}</Badge>
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
                      <Text as="p" tone="subdued">Noch keine Auszahlungen.</Text>
                    </Box>
                  ) : (
                    <div style={{ overflowX: "auto" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                        <thead>
                          <tr style={{ background: "#f6f6f7", borderBottom: "1px solid #e1e3e5" }}>
                            {["Zeitraum", "Umsatz", "Provision", "Auszahlung", "Status", "IBAN", ""].map((h, i) => (
                              <th key={i} style={{ padding: "8px 12px", textAlign: i >= 2 && i <= 4 ? "right" : "left", fontWeight: 600, color: "#6d7175", whiteSpace: "nowrap" }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {seller.payouts.map((p) => (
                            <tr key={p.id} style={{ borderBottom: "1px solid #f1f1f1" }}>
                              <td style={{ padding: "8px 12px", whiteSpace: "nowrap" }}>{fmtDate(p.period_start)} – {fmtDate(p.period_end)}</td>
                              <td style={{ padding: "8px 12px", textAlign: "right" }}>{fmtCents(p.total_cents)}</td>
                              <td style={{ padding: "8px 12px", textAlign: "right", color: "#dc2626" }}>{fmtCents(p.commission_cents)}</td>
                              <td style={{ padding: "8px 12px", textAlign: "right", color: "#16a34a", fontWeight: 600 }}>{fmtCents(p.payout_cents)}</td>
                              <td style={{ padding: "8px 12px" }}>
                                <Badge tone={p.status === "bezahlt" ? "success" : "attention"}>
                                  {p.status === "bezahlt" ? "Bezahlt" : "Offen"}
                                </Badge>
                              </td>
                              <td style={{ padding: "8px 12px", fontFamily: "monospace", fontSize: 11, color: "#6b7280" }}>
                                {(p.iban || seller.iban || "—").replace(/(.{4})/g, "$1 ").trim()}
                              </td>
                              <td style={{ padding: "8px 12px" }}>
                                <InlineStack gap="200">
                                  {p.status !== "bezahlt" && (
                                    <Button size="slim" variant="primary" onClick={() => handleMarkPaid(p)}>Als überwiesen markieren</Button>
                                  )}
                                  <Button size="slim" onClick={() => generateInvoice(p)}>Rechnung</Button>
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
                  <Text as="h3" variant="headingSm">Produkte nach Kategorie</Text>

                  {!seller.products_by_category || seller.products_by_category.length === 0 ? (
                    <Box padding="600" background="bg-surface-secondary" borderRadius="200">
                      <Text as="p" tone="subdued">Keine Produkte gefunden.</Text>
                    </Box>
                  ) : (
                    <div>
                      {seller.products_by_category.map((cat, i) => {
                        const total = seller.products_by_category.reduce((a, c) => a + c.count, 0);
                        const pct = total > 0 ? Math.round((cat.count / total) * 100) : 0;
                        return (
                          <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0", borderBottom: "1px solid #f1f1f1" }}>
                            <div style={{ flex: "0 0 180px" }}>
                              <Text as="span" variant="bodyMd">{cat.category || "Unkategorisiert"}</Text>
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
                    Firmendaten-Review: Bitte Gesellschaftsdaten, rechtliche Zustimmung und hochgeladene Nachweise (Vertrag, Unterschrift, Pass/ID usw.) prüfen.
                  </Banner>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
                    <BlockStack gap="100">
                      <Text as="h3" variant="headingSm">Firmendaten</Text>
                      <InfoRow label="Firmenname" value={seller.company_name} />
                      <InfoRow label="Bevollmächtigte Person" value={seller.authorized_person_name} />
                      <InfoRow label="Steuer-Nr." value={seller.tax_id} />
                      <InfoRow label="USt-IdNr." value={seller.vat_id} />
                      <InfoRow label="Telefon" value={seller.phone} />
                      <InfoRow label="Website" value={seller.website} />
                      <InfoRow label="IBAN" value={seller.iban ? seller.iban.replace(/(.{4})/g, "$1 ").trim() : null} />
                    </BlockStack>
                    <BlockStack gap="100">
                      <Text as="h3" variant="headingSm">Rechtliche Zustimmung</Text>
                      <InfoRow label="Agreement akzeptiert" value={seller.agreement_accepted ? "Ja" : "Nein"} />
                      <InfoRow label="Akzeptiert am" value={fmtDate(seller.agreement_accepted_at)} />
                      <InfoRow label="Version" value={seller.agreement_version} />
                      <InfoRow label="IP" value={seller.agreement_ip} />
                    </BlockStack>
                    <BlockStack gap="100">
                      <Text as="h3" variant="headingSm">Geschäftsadresse</Text>
                      <AddressBlock addr={seller.business_address} />
                    </BlockStack>
                    <BlockStack gap="100">
                      <Text as="h3" variant="headingSm">Lageradresse</Text>
                      <AddressBlock addr={seller.warehouse_address} />
                    </BlockStack>
                    <BlockStack gap="100">
                      <InlineStack align="space-between" blockAlign="center">
                        <Text as="h3" variant="headingSm">Dokumente & Nachweise</Text>
                        <Badge tone={sellerDocs.length > 0 ? "success" : "attention"}>{sellerDocs.length}</Badge>
                      </InlineStack>
                      {sellerDocs.length > 0 ? (
                        <BlockStack gap="100">
                          {sellerDocs.map((doc, i) => {
                            const url = typeof doc === "string" ? doc : (doc?.url || "");
                            const name = typeof doc === "string" ? `Dokument ${i + 1}` : (doc?.name || `Dokument ${i + 1}`);
                            const typeLabel = detectDocTypeLabel(doc);
                            return (
                              <div key={i} style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: "8px 10px" }}>
                                <InlineStack align="space-between" blockAlign="start">
                                  <BlockStack gap="050">
                                    <Text as="p" variant="bodyMd" fontWeight="semibold">{name}</Text>
                                    <Text as="p" variant="bodySm" tone="subdued">{typeLabel}</Text>
                                    {doc?.uploaded_at && <Text as="p" variant="bodySm" tone="subdued">Upload: {fmtDate(doc.uploaded_at)}</Text>}
                                  </BlockStack>
                                  {url ? (
                                    <a href={url} target="_blank" rel="noopener noreferrer" style={{ color: "#2563eb", fontSize: 13 }}>
                                      Öffnen
                                    </a>
                                  ) : (
                                    <Text as="span" tone="subdued">Kein Link</Text>
                                  )}
                                </InlineStack>
                              </div>
                            );
                          })}
                        </BlockStack>
                      ) : (
                        <Banner tone="warning">
                          Keine Dokumente hochgeladen. Für rechtssichere Freigabe bitte Vertrag, Unterschrift und Ausweis-/Pass-Nachweise anfordern.
                        </Banner>
                      )}
                    </BlockStack>
                  </div>
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
        title="Status ändern"
        primaryAction={{ content: "Speichern", onAction: handleApprove, loading: approving }}
        secondaryActions={[{ content: "Abbrechen", onAction: () => setApproveModal(false) }]}
      >
        <Modal.Section>
          <BlockStack gap="300">
            <Select
              label="Neuer Status"
              options={STATUS_LABELS}
              value={newStatus}
              onChange={setNewStatus}
            />
            {newStatus === "rejected" && (
              <TextField
                label="Ablehnungsgrund"
                value={rejectReason}
                onChange={setRejectReason}
                multiline={3}
                autoComplete="off"
                placeholder="Bitte geben Sie den Grund für die Ablehnung an…"
              />
            )}
            {newStatus === "approved" && (
              <Banner tone="success">
                Nach der Genehmigung werden alle Produkte des Verkäufers automatisch veröffentlicht.
              </Banner>
            )}
            {(newStatus === "rejected" || newStatus === "suspended") && (
              <Banner tone="warning">
                Bei Ablehnung/Sperrung werden alle Produkte des Verkäufers auf „Entwurf" gesetzt.
              </Banner>
            )}
          </BlockStack>
        </Modal.Section>
      </Modal>

      {/* ── Commission edit modal ────────────────────────────────────────── */}
      <Modal
        open={editCommission}
        onClose={() => setEditCommission(false)}
        title="Provisonssatz ändern"
        primaryAction={{ content: "Speichern", onAction: handleSaveCommission, loading: savingCommission }}
        secondaryActions={[{ content: "Abbrechen", onAction: () => setEditCommission(false) }]}
      >
        <Modal.Section>
          <TextField
            label="Provisionssatz (%)"
            value={commissionVal}
            onChange={setCommissionVal}
            type="number"
            min="0"
            max="100"
            suffix="%"
            autoComplete="off"
            helpText="Standard: 12%. Gültige Werte: 0–100."
          />
        </Modal.Section>
      </Modal>

      {/* ── Payout create modal ──────────────────────────────────────────── */}
      <Modal
        open={payoutModal}
        onClose={() => setPayoutModal(false)}
        title="Neue Auszahlung erstellen"
        primaryAction={{ content: "Erstellen", onAction: handleCreatePayout, loading: savingPayout }}
        secondaryActions={[{ content: "Abbrechen", onAction: () => setPayoutModal(false) }]}
      >
        <Modal.Section>
          <BlockStack gap="300">
            <InlineStack gap="300">
              <TextField label="Zeitraum von" type="date" value={payoutForm.period_start}
                onChange={(v) => setPayoutForm((p) => ({ ...p, period_start: v }))} autoComplete="off" />
              <TextField label="Zeitraum bis" type="date" value={payoutForm.period_end}
                onChange={(v) => setPayoutForm((p) => ({ ...p, period_end: v }))} autoComplete="off" />
            </InlineStack>
            <TextField label="Gesamtumsatz (€)" value={payoutForm.total_cents}
              onChange={(v) => setPayoutForm((p) => ({ ...p, total_cents: v }))}
              autoComplete="off" placeholder="z.B. 1234.56" />
            <TextField label={`Provision (${commissionPct}%)`} value={payoutForm.commission_cents}
              onChange={(v) => setPayoutForm((p) => ({ ...p, commission_cents: v }))}
              autoComplete="off" placeholder="z.B. 123.46" />
            <TextField label="Auszahlungsbetrag (€)" value={payoutForm.payout_cents}
              onChange={(v) => setPayoutForm((p) => ({ ...p, payout_cents: v }))}
              autoComplete="off" placeholder="Leer = Umsatz − Provision" />
            <TextField label="Notizen" value={payoutForm.notes}
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
