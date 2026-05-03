"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Page, Layout, Card, Text, BlockStack, InlineStack,
  Button, Banner, Badge, Box, Select, TextField, Divider,
} from "@shopify/polaris";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";
import { useUnsavedChanges } from "@/context/UnsavedChangesContext";

// ── Constants ──────────────────────────────────────────────────────────────────
const COMMISSION_RATE = 0.12;

// ── Formatters ────────────────────────────────────────────────────────────────
const fmt = (cents) =>
  ((cents || 0) / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" });

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—";

const fmtDateTime = (d) =>
  d ? new Date(d).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

const csvEscape = (v) => {
  const s = v == null ? "" : String(v);
  if (/[",\n;]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
};

// ── Period generator (15-day settlement periods) ──────────────────────────────
function generatePeriods(count = 12) {
  const periods = [];
  const now = new Date();
  let year = now.getFullYear();
  let month = now.getMonth();
  for (let i = 0; i < count; i++) {
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    periods.push({
      label: `16.${String(month + 1).padStart(2, "0")}.${year} – ${daysInMonth}.${String(month + 1).padStart(2, "0")}.${year}`,
      start: new Date(year, month, 16).toISOString(),
      end: new Date(year, month, daysInMonth, 23, 59, 59).toISOString(),
      key: `${year}-${String(month + 1).padStart(2, "0")}-2`,
    });
    periods.push({
      label: `01.${String(month + 1).padStart(2, "0")}.${year} – 15.${String(month + 1).padStart(2, "0")}.${year}`,
      start: new Date(year, month, 1).toISOString(),
      end: new Date(year, month, 15, 23, 59, 59).toISOString(),
      key: `${year}-${String(month + 1).padStart(2, "0")}-1`,
    });
    month -= 1;
    if (month < 0) { month = 11; year -= 1; }
  }
  return periods;
}
const PERIODS = generatePeriods(12);

// ── Status helpers ────────────────────────────────────────────────────────────
const statusTone = (s) => {
  if (s === "bezahlt" || s === "paid") return "success";
  if (s === "pending" || s === "ausstehend") return "warning";
  if (s === "processing" || s === "verarbeitung") return "info";
  if (s === "failed") return "critical";
  return "new";
};
const statusLabel = (s) => {
  const map = {
    bezahlt: "Bezahlt", paid: "Bezahlt",
    ausstehend: "Ausstehend", pending: "Ausstehend",
    processing: "In Verarbeitung", verarbeitung: "In Verarbeitung",
    failed: "Fehlgeschlagen", skipped: "Übersprungen",
    not_applicable: "—",
  };
  return map[s] || s || "Offen";
};

// ── IBAN helpers ──────────────────────────────────────────────────────────────
function validateIban(raw) {
  const v = raw.replace(/\s/g, "").toUpperCase();
  if (!v) return { ok: false, error: "IBAN darf nicht leer sein." };
  if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]{4,}$/.test(v))
    return { ok: false, error: "Ungültiges IBAN-Format (z.B. DE89 3704 0044 0532 0130 00)." };
  if (v.length < 15 || v.length > 34)
    return { ok: false, error: "IBAN-Länge ungültig." };
  return { ok: true, error: null };
}
function maskIban(iban) {
  const v = (iban || "").replace(/\s/g, "").toUpperCase();
  if (v.length < 6) return v;
  return `${v.slice(0, 4)} •••• •••• ${v.slice(-4)}`;
}
function formatIbanInput(raw) {
  const v = raw.replace(/\s/g, "").toUpperCase();
  return v.match(/.{1,4}/g)?.join(" ") || v;
}

// ── KPI Card ──────────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, tone, highlight, icon }) {
  const color =
    tone === "success" ? "#059669" :
    tone === "critical" ? "#dc2626" :
    tone === "info" ? "#2563eb" : "#111827";
  return (
    <div style={{
      flex: "1 1 160px", minWidth: 150,
      background: highlight ? "#f0fdf4" : "#fff",
      borderRadius: 12, padding: "18px 20px",
      border: highlight ? "1.5px solid #6ee7b7" : "1px solid #e5e7eb",
      boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
    }}>
      <InlineStack gap="100" blockAlign="center">
        {icon && <span style={{ fontSize: 15 }}>{icon}</span>}
        <Text variant="bodySm" tone="subdued">{label}</Text>
      </InlineStack>
      <div style={{ fontSize: 22, fontWeight: 700, color, marginTop: 6, letterSpacing: "-0.3px" }}>
        {value}
      </div>
      {sub && (
        <div style={{ marginTop: 3 }}>
          <Text variant="bodySm" tone="subdued">{sub}</Text>
        </div>
      )}
    </div>
  );
}

// ── Sortable Column Header ────────────────────────────────────────────────────
function SortTh({ label, col, sortCol, sortDir, onSort, style }) {
  const active = sortCol === col;
  return (
    <div
      onClick={() => onSort(col)}
      style={{
        cursor: "pointer", userSelect: "none",
        display: "flex", alignItems: "center", gap: 3,
        color: active ? "#111827" : "#6b7280",
        ...style,
      }}
    >
      {label}
      <span style={{ fontSize: 9, color: active ? "#2563eb" : "#d1d5db", lineHeight: 1 }}>
        {active ? (sortDir === "asc" ? "▲" : "▼") : "⇅"}
      </span>
    </div>
  );
}

// ── IBAN Management Section ──────────────────────────────────────────────────
function IbanSection({ commissionRate }) {
  const client = getMedusaAdminClient();
  const unsaved = useUnsavedChanges();
  const sellerPct = Math.round((1 - (commissionRate ?? COMMISSION_RATE)) * 100);

  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [editing, setEditing]     = useState(false);
  const [err, setErr]             = useState("");
  const [ok, setOk]               = useState("");
  const [ibanError, setIbanError] = useState("");

  const [savedIban, setSavedIban]         = useState("");
  const [savedHolder, setSavedHolder]     = useState("");
  const [savedBic, setSavedBic]           = useState("");
  const [savedBankName, setSavedBankName] = useState("");
  const [initialSnapshot, setInitialSnapshot] = useState(null);

  const [iban, setIban]         = useState("");
  const [holder, setHolder]     = useState("");
  const [bic, setBic]           = useState("");
  const [bankName, setBankName] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const account = await client.getSellerAccount();
        const s = account?.sellerUser || account?.user || {};
        const iv = s.iban || "";
        setSavedIban(iv); setIban(iv);
        setSavedHolder(s.payment_account_holder || ""); setHolder(s.payment_account_holder || "");
        setSavedBic(s.payment_bic || ""); setBic(s.payment_bic || "");
        setSavedBankName(s.payment_bank_name || ""); setBankName(s.payment_bank_name || "");
        setInitialSnapshot(JSON.stringify({
          iban: iv || "",
          holder: s.payment_account_holder || "",
          bic: s.payment_bic || "",
          bankName: s.payment_bank_name || "",
        }));
      } catch (_) {}
      finally { setLoading(false); }
    })();
  }, [client]);

  const handleSave = useCallback(async () => {
    setErr(""); setOk(""); setIbanError("");
    const trimmed = iban.replace(/\s/g, "").toUpperCase();
    if (trimmed) {
      const { ok: valid, error: ie } = validateIban(trimmed);
      if (!valid) { setIbanError(ie); return; }
    }
    setSaving(true);
    try {
      await client.updateSellerIban(trimmed || null);
      try {
        await client.updateSellerCompanyInfo({
          payment_account_holder: holder.trim() || null,
          payment_bic: bic.replace(/\s/g, "").toUpperCase() || null,
          payment_bank_name: bankName.trim() || null,
        });
      } catch (_) {}
      setSavedIban(trimmed); setSavedHolder(holder.trim());
      setSavedBic(bic.replace(/\s/g, "").toUpperCase()); setSavedBankName(bankName.trim());
      setInitialSnapshot(JSON.stringify({
        iban: trimmed || "",
        holder: holder.trim() || "",
        bic: bic.replace(/\s/g, "").toUpperCase() || "",
        bankName: bankName.trim() || "",
      }));
      setOk("Bankdaten gespeichert."); setEditing(false);
    } catch (e) { setErr(e?.message || "Fehler beim Speichern."); }
    finally { setSaving(false); }
  }, [client, iban, holder, bic, bankName]);

  const handleCancel = useCallback(() => {
    setIban(savedIban); setHolder(savedHolder); setBic(savedBic); setBankName(savedBankName);
    setIbanError(""); setErr(""); setEditing(false);
  }, [savedIban, savedHolder, savedBic, savedBankName]);

  const currentSnapshot = useMemo(() => JSON.stringify({
    iban: (iban || "").replace(/\s/g, "").toUpperCase(),
    holder: holder || "",
    bic: (bic || "").replace(/\s/g, "").toUpperCase(),
    bankName: bankName || "",
  }), [iban, holder, bic, bankName]);

  const isDirty = !loading && initialSnapshot !== null && currentSnapshot !== initialSnapshot;

  useEffect(() => {
    if (!unsaved) return;
    unsaved.setDirty(isDirty);
    unsaved.setHandlers({ onSave: handleSave, onDiscard: handleCancel });
    return () => {
      unsaved.clearHandlers();
      unsaved.setDirty(false);
    };
  }, [unsaved, isDirty, handleSave, handleCancel]);

  if (loading) return null;

  return (
    <Box paddingBlockEnd="400">
      {ok  && <Box paddingBlockEnd="300"><Banner tone="success" onDismiss={() => setOk("")}>{ok}</Banner></Box>}
      {err && <Box paddingBlockEnd="300"><Banner tone="critical" onDismiss={() => setErr("")}>{err}</Banner></Box>}

      {/* How payouts work */}
      <Box paddingBlockEnd="400">
        <div style={{ background: "#f8fafc", borderRadius: 12, border: "1px solid #e2e8f0", padding: "20px 24px" }}>
          <BlockStack gap="300">
            <Text as="p" variant="bodyMd" fontWeight="semibold">So funktionieren Auszahlungen</Text>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
              {[
                { n: "1", label: "Kunde kauft", desc: "Zahlung geht sicher über Stripe ein." },
                { n: "2", label: "Sperrfrist 14 Tage", desc: "Nach Lieferbestätigung beginnt die 14-tägige Auszahlungssperrfrist." },
                { n: "3", label: `Auszahlung (${sellerPct}%)`, desc: "Nach Ablauf der Sperrfrist wird der Betrag automatisch auf die hinterlegte IBAN überwiesen." },
              ].map(({ n, label, desc }) => (
                <div key={n} style={{ background: "#fff", borderRadius: 8, padding: "12px 14px", border: "1px solid #e5e7eb" }}>
                  <InlineStack gap="200" blockAlign="center">
                    <span style={{ width: 22, height: 22, borderRadius: "50%", background: "#111827", color: "#fff", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{n}</span>
                    <Text as="span" variant="bodySm" fontWeight="semibold">{label}</Text>
                  </InlineStack>
                  <Box paddingBlockStart="100">
                    <Text as="p" variant="bodySm" tone="subdued">{desc}</Text>
                  </Box>
                </div>
              ))}
            </div>
          </BlockStack>
        </div>
      </Box>

      {/* IBAN card */}
      <Card>
        <BlockStack gap="400">
          <InlineStack align="space-between" blockAlign="center">
            <BlockStack gap="050">
              <Text as="h2" variant="headingMd">Bankkonto für Auszahlungen</Text>
              <Text as="p" tone="subdued" variant="bodySm">An dieses Konto werden deine Verkaufserlöse überwiesen.</Text>
            </BlockStack>
            {!editing && (
              <Button onClick={() => setEditing(true)} size="slim">
                {savedIban ? "Bearbeiten" : "Hinzufügen"}
              </Button>
            )}
          </InlineStack>

          {!editing && (
            savedIban ? (
              <div style={{ background: "#f9fafb", borderRadius: 10, padding: "16px 20px", border: "1px solid #f3f4f6" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 24px" }}>
                  <BlockStack gap="050">
                    <Text as="p" variant="bodySm" tone="subdued">IBAN</Text>
                    <Text as="p" variant="bodyMd" fontWeight="semibold">{maskIban(savedIban)}</Text>
                  </BlockStack>
                  {savedHolder && (
                    <BlockStack gap="050">
                      <Text as="p" variant="bodySm" tone="subdued">Kontoinhaber</Text>
                      <Text as="p" variant="bodyMd">{savedHolder}</Text>
                    </BlockStack>
                  )}
                  {savedBic && (
                    <BlockStack gap="050">
                      <Text as="p" variant="bodySm" tone="subdued">BIC / SWIFT</Text>
                      <Text as="p" variant="bodyMd">{savedBic}</Text>
                    </BlockStack>
                  )}
                  {savedBankName && (
                    <BlockStack gap="050">
                      <Text as="p" variant="bodySm" tone="subdued">Bank</Text>
                      <Text as="p" variant="bodyMd">{savedBankName}</Text>
                    </BlockStack>
                  )}
                </div>
                <Box paddingBlockStart="200">
                  <InlineStack gap="150" blockAlign="center">
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#10b981", flexShrink: 0, display: "inline-block" }} />
                    <Text as="p" variant="bodySm" tone="success">Bankkonto hinterlegt — bereit für Auszahlungen</Text>
                  </InlineStack>
                </Box>
              </div>
            ) : (
              <div style={{ background: "#fffbeb", borderRadius: 10, padding: "16px 20px", border: "1px solid #fde68a" }}>
                <InlineStack gap="300" blockAlign="center">
                  <Text as="span" variant="headingLg">⚠️</Text>
                  <BlockStack gap="050">
                    <Text as="p" variant="bodyMd" fontWeight="semibold">Kein Bankkonto hinterlegt</Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      Ohne IBAN können keine Auszahlungen an dich verarbeitet werden.
                    </Text>
                  </BlockStack>
                </InlineStack>
              </div>
            )
          )}

          {editing && (
            <BlockStack gap="300">
              <Box borderBlockStartWidth="025" borderColor="border-subdued" paddingBlockStart="300">
                <BlockStack gap="300">
                  <TextField
                    label="IBAN *"
                    value={formatIbanInput(iban)}
                    onChange={(v) => { setIban(v.replace(/\s/g, "").toUpperCase()); setIbanError(""); }}
                    error={ibanError}
                    placeholder="DE89 3704 0044 0532 0130 00"
                    helpText="Internationale Bankkontonummer — Leerzeichen werden automatisch formatiert"
                    autoComplete="off"
                  />
                  <TextField
                    label="Kontoinhaber"
                    value={holder}
                    onChange={setHolder}
                    placeholder="Max Mustermann oder Musterfirma GmbH"
                    autoComplete="off"
                  />
                  <InlineStack gap="300">
                    <div style={{ flex: 1 }}>
                      <TextField
                        label="BIC / SWIFT (optional)"
                        value={bic}
                        onChange={(v) => setBic(v.toUpperCase())}
                        placeholder="COBADEFFXXX"
                        autoComplete="off"
                      />
                    </div>
                    <div style={{ flex: 1 }}>
                      <TextField
                        label="Bankname (optional)"
                        value={bankName}
                        onChange={setBankName}
                        placeholder="Commerzbank AG"
                        autoComplete="off"
                      />
                    </div>
                  </InlineStack>
                </BlockStack>
              </Box>
              <InlineStack align="end" gap="200">
                <Button onClick={handleCancel} disabled={saving}>Abbrechen</Button>
                <Button variant="primary" onClick={handleSave} loading={saving}>Bankdaten speichern</Button>
              </InlineStack>
            </BlockStack>
          )}
        </BlockStack>
      </Card>
    </Box>
  );
}

// ── Seller Payments View ──────────────────────────────────────────────────────
function SellerPaymentsView() {
  const [periodKey, setPeriodKey]     = useState(PERIODS[0].key);
  const [summary, setSummary]         = useState(null);
  const [history, setHistory]         = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading]         = useState(false);
  const [err, setErr]                 = useState("");

  // Table controls
  const [sortCol, setSortCol]         = useState("created_at");
  const [sortDir, setSortDir]         = useState("desc");
  const [filterSearch, setFilterSearch] = useState("");
  const [filterType, setFilterType]   = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [pageSize, setPageSize]       = useState("20");
  const [page, setPage]               = useState(0);

  const selectedPeriod = PERIODS.find((p) => p.key === periodKey) || PERIODS[0];

  const loadData = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const client = getMedusaAdminClient();
      const [sumRes, histRes, txRes] = await Promise.allSettled([
        client.getPayoutSummary({ period_start: selectedPeriod.start, period_end: selectedPeriod.end }),
        client.getPayouts(),
        client.getTransactions({ include_pending: "true", payout_days: "14" }),
      ]);
      if (sumRes.status === "fulfilled") setSummary(sumRes.value?.summary || null);
      if (histRes.status === "fulfilled") setHistory(histRes.value?.payouts || []);
      if (txRes.status === "fulfilled") setTransactions(Array.isArray(txRes.value?.transactions) ? txRes.value.transactions : []);
      else setTransactions([]);
    } catch (e) {
      setErr(e?.message || "Fehler beim Laden");
    } finally {
      setLoading(false);
    }
  }, [selectedPeriod.start, selectedPeriod.end]);

  useEffect(() => { loadData(); }, [loadData]);

  // Period-filtered transactions
  const selectedStartTs = useMemo(() => new Date(selectedPeriod.start).getTime(), [selectedPeriod.start]);
  const selectedEndTs   = useMemo(() => new Date(selectedPeriod.end).getTime(), [selectedPeriod.end]);

  const periodTransactions = useMemo(() => transactions.filter((t) => {
    const ts = t?.delivery_date
      ? new Date(t.delivery_date).getTime()
      : t?.created_at ? new Date(t.created_at).getTime() : NaN;
    return Number.isFinite(ts) && ts >= selectedStartTs && ts <= selectedEndTs;
  }), [transactions, selectedStartTs, selectedEndTs]);

  // Sort handler — toggles direction if same column, resets to desc for new column
  const handleSort = useCallback((col) => {
    setSortCol((prev) => {
      if (prev === col) setSortDir((d) => d === "asc" ? "desc" : "asc");
      else setSortDir("desc");
      return col;
    });
    setPage(0);
  }, []);

  // Filtered + sorted transactions
  const displayTransactions = useMemo(() => {
    let rows = periodTransactions;

    if (filterSearch.trim()) {
      const q = filterSearch.toLowerCase();
      rows = rows.filter((t) =>
        String(t.order_number || "").toLowerCase().includes(q) ||
        [t.first_name, t.last_name].filter(Boolean).join(" ").toLowerCase().includes(q)
      );
    }
    if (filterType === "refund") rows = rows.filter((t) => (t.refund_cents || 0) > 0 || t.is_refund);
    if (filterType === "sale")   rows = rows.filter((t) => (t.refund_cents || 0) === 0 && !t.is_refund);
    if (filterStatus === "eligible") rows = rows.filter((t) => t.payout_eligible);
    if (filterStatus === "pending")  rows = rows.filter((t) => !t.payout_eligible);

    rows = [...rows].sort((a, b) => {
      let av, bv;
      if (sortCol === "created_at") { av = new Date(a.created_at || 0).getTime(); bv = new Date(b.created_at || 0).getTime(); }
      else if (sortCol === "total_cents")      { av = a.total_cents || 0;      bv = b.total_cents || 0; }
      else if (sortCol === "commission_cents") { av = a.commission_cents || 0; bv = b.commission_cents || 0; }
      else if (sortCol === "payout_cents")     { av = a.payout_cents || 0;     bv = b.payout_cents || 0; }
      else if (sortCol === "delivery_date")    { av = new Date(a.delivery_date || 0).getTime(); bv = new Date(b.delivery_date || 0).getTime(); }
      else { av = 0; bv = 0; }
      return sortDir === "asc" ? av - bv : bv - av;
    });

    return rows;
  }, [periodTransactions, sortCol, sortDir, filterSearch, filterType, filterStatus]);

  const totalFiltered = displayTransactions.length;
  const ps = Number(pageSize) || 0;
  const pagedTransactions = ps > 0
    ? displayTransactions.slice(page * ps, page * ps + ps)
    : displayTransactions;
  const totalPages = ps > 0 ? Math.ceil(totalFiltered / ps) : 1;

  // KPI calculations
  const revenue    = summary?.total_cents ?? 0;
  const commission = Math.round(revenue * COMMISSION_RATE);
  const shipping   = summary?.shipping_cents ?? 0;
  const refunds    = summary?.refund_cents ?? 0;
  const adSpend    = summary?.ad_spend_cents ?? 0;
  const net        = revenue - commission - adSpend - refunds + shipping;
  const payoutStatus = summary?.status || null;

  const exportCsv = () => {
    const rows = [
      ["Bestellnr.", "Datum", "Lieferdatum", "Kunde", "Brutto (€)", "Provision (€)", "Versand (€)", "Rabatt (€)", "Netto (€)", "Auszahl-Status"],
      ...displayTransactions.map((t) => [
        t.order_number || "",
        fmtDateTime(t.created_at),
        fmtDate(t.delivery_date),
        [t.first_name, t.last_name].filter(Boolean).join(" ").trim(),
        ((t.total_cents || 0) / 100).toFixed(2),
        ((t.commission_cents || 0) / 100).toFixed(2),
        ((t.shipping_cents || 0) / 100).toFixed(2),
        ((t.discount_cents || 0) / 100).toFixed(2),
        ((t.payout_cents || 0) / 100).toFixed(2),
        t.payout_eligible ? "Freigegeben" : "Ausstehend",
      ]),
    ];
    const csv = rows.map((r) => r.map(csvEscape).join(";")).join("\n");
    const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `transaktionen-${selectedPeriod.key}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  };

  const periodOptions = PERIODS.map((p) => ({ label: p.label, value: p.key }));
  const hasActiveFilters = filterSearch.trim() || filterType !== "all" || filterStatus !== "all";

  return (
    <Page title="Zahlungen & Auszahlungen">
      <Layout>
        <Layout.Section>
          {err && (
            <Box paddingBlockEnd="400">
              <Banner tone="critical" onDismiss={() => setErr("")}>{err}</Banner>
            </Box>
          )}

          {/* ── Period Selector ── */}
          <Card>
            <InlineStack align="space-between" blockAlign="center" wrap={false}>
              <BlockStack gap="100">
                <Text variant="headingMd" as="h2">Abrechnungszeitraum</Text>
                <Text variant="bodySm" tone="subdued">15-tägige Abrechnungsperioden (1.–15. und 16.–Monatsende)</Text>
              </BlockStack>
              <InlineStack gap="300" blockAlign="center">
                <div style={{ width: 300 }}>
                  <Select
                    label=""
                    labelHidden
                    options={periodOptions}
                    value={periodKey}
                    onChange={(v) => { setPeriodKey(v); setPage(0); }}
                  />
                </div>
                <Button onClick={loadData} loading={loading} size="slim">Aktualisieren</Button>
              </InlineStack>
            </InlineStack>
          </Card>

          {/* ── KPI Dashboard ── */}
          <Box paddingBlockStart="400">
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between" blockAlign="center">
                  <BlockStack gap="050">
                    <Text variant="headingMd" as="h2">Finanzübersicht</Text>
                    <Text variant="bodySm" tone="subdued">{selectedPeriod.label}</Text>
                  </BlockStack>
                  {payoutStatus && <Badge tone={statusTone(payoutStatus)}>{statusLabel(payoutStatus)}</Badge>}
                </InlineStack>

                {loading ? (
                  <Text tone="subdued">Daten werden geladen…</Text>
                ) : (
                  <>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
                      <KpiCard
                        icon="📦"
                        label="Gesamtumsatz (brutto)"
                        value={fmt(revenue)}
                        sub={`${periodTransactions.length} Bestellungen`}
                      />
                      <KpiCard
                        icon="💸"
                        label={`Provision (${(COMMISSION_RATE * 100).toFixed(0)} %)`}
                        value={`– ${fmt(commission)}`}
                        tone="critical"
                        sub="Plattformgebühr"
                      />
                      <KpiCard
                        icon="📣"
                        label="Werbekosten"
                        value={adSpend > 0 ? `– ${fmt(adSpend)}` : "–"}
                        tone={adSpend > 0 ? "critical" : undefined}
                        sub="Reklam giderleri"
                      />
                      <KpiCard
                        icon="↩️"
                        label="Rückerstattungen"
                        value={refunds > 0 ? `– ${fmt(refunds)}` : fmt(0)}
                        tone={refunds > 0 ? "critical" : undefined}
                      />
                      <KpiCard
                        icon="🚚"
                        label="Versandkostenbeteiligung"
                        value={fmt(shipping)}
                        tone="info"
                      />
                      <KpiCard
                        icon="✅"
                        label="Netto-Auszahlung"
                        value={fmt(Math.max(0, net))}
                        tone="success"
                        highlight
                        sub="Nach 14-Tage-Sperrfrist"
                      />
                    </div>

                    {/* Net payout breakdown */}
                    {revenue > 0 && (
                      <div style={{ background: "#f8fafc", borderRadius: 10, padding: "14px 18px", border: "1px solid #e2e8f0" }}>
                        <BlockStack gap="150">
                          <Text variant="bodySm" fontWeight="semibold" tone="subdued">Berechnungsgrundlage</Text>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 32px", fontSize: 13 }}>
                            <span>{fmt(revenue)} <span style={{ color: "#6b7280" }}>Umsatz</span></span>
                            {commission > 0 && <span style={{ color: "#dc2626" }}>– {fmt(commission)} <span style={{ color: "#6b7280" }}>Provision</span></span>}
                            {adSpend > 0  && <span style={{ color: "#dc2626" }}>– {fmt(adSpend)} <span style={{ color: "#6b7280" }}>Werbekosten</span></span>}
                            {refunds > 0  && <span style={{ color: "#dc2626" }}>– {fmt(refunds)} <span style={{ color: "#6b7280" }}>Erstattungen</span></span>}
                            {shipping > 0 && <span style={{ color: "#059669" }}>+ {fmt(shipping)} <span style={{ color: "#6b7280" }}>Versand</span></span>}
                            <span style={{ fontWeight: 700, color: "#059669" }}>= {fmt(Math.max(0, net))} <span style={{ color: "#6b7280", fontWeight: 400 }}>Netto</span></span>
                          </div>
                        </BlockStack>
                      </div>
                    )}

                    {summary === null && (
                      <Banner tone="info">Für diesen Zeitraum liegen noch keine Daten vor.</Banner>
                    )}
                  </>
                )}
              </BlockStack>
            </Card>
          </Box>

          {/* ── Transaction Table ── */}
          <Box paddingBlockStart="400">
            <Card padding="0">
              {/* Table header */}
              <div style={{ padding: "16px 20px", borderBottom: "1px solid #f3f4f6" }}>
                <InlineStack align="space-between" blockAlign="center">
                  <BlockStack gap="050">
                    <Text variant="headingMd" as="h2">Transaktionen</Text>
                    <Text variant="bodySm" tone="subdued">
                      {totalFiltered} Einträge{hasActiveFilters ? " (gefiltert)" : ""}
                      {totalFiltered !== periodTransactions.length && ` von ${periodTransactions.length} gesamt`}
                    </Text>
                  </BlockStack>
                  <InlineStack gap="200">
                    {hasActiveFilters && (
                      <Button
                        size="slim"
                        tone="critical"
                        variant="plain"
                        onClick={() => { setFilterSearch(""); setFilterType("all"); setFilterStatus("all"); setPage(0); }}
                      >
                        Filter zurücksetzen
                      </Button>
                    )}
                    <Button size="slim" onClick={exportCsv} disabled={displayTransactions.length === 0}>
                      CSV Export
                    </Button>
                  </InlineStack>
                </InlineStack>
              </div>

              {/* Filter bar */}
              <div style={{ padding: "12px 20px", borderBottom: "1px solid #f3f4f6", background: "#fafafa", display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
                <div style={{ flex: "1 1 200px", minWidth: 180 }}>
                  <TextField
                    label="Suche"
                    labelHidden
                    value={filterSearch}
                    onChange={(v) => { setFilterSearch(v); setPage(0); }}
                    placeholder="Bestellnr. oder Kundenname…"
                    clearButton
                    onClearButtonClick={() => { setFilterSearch(""); setPage(0); }}
                    autoComplete="off"
                  />
                </div>
                <div style={{ width: 160 }}>
                  <Select
                    label="Typ"
                    labelHidden
                    options={[
                      { label: "Alle Typen", value: "all" },
                      { label: "Bestellungen", value: "sale" },
                      { label: "Rückerstattungen", value: "refund" },
                    ]}
                    value={filterType}
                    onChange={(v) => { setFilterType(v); setPage(0); }}
                  />
                </div>
                <div style={{ width: 160 }}>
                  <Select
                    label="Auszahl-Status"
                    labelHidden
                    options={[
                      { label: "Alle Status", value: "all" },
                      { label: "Freigegeben", value: "eligible" },
                      { label: "Ausstehend", value: "pending" },
                    ]}
                    value={filterStatus}
                    onChange={(v) => { setFilterStatus(v); setPage(0); }}
                  />
                </div>
                <div style={{ width: 140 }}>
                  <Select
                    label="Einträge"
                    labelHidden
                    options={[
                      { label: "20 pro Seite", value: "20" },
                      { label: "50 pro Seite", value: "50" },
                      { label: "100 pro Seite", value: "100" },
                      { label: "Alle anzeigen", value: "0" },
                    ]}
                    value={pageSize}
                    onChange={(v) => { setPageSize(v); setPage(0); }}
                  />
                </div>
              </div>

              {/* Table */}
              {loading ? (
                <Box padding="500"><Text tone="subdued" alignment="center">Transaktionen werden geladen…</Text></Box>
              ) : displayTransactions.length === 0 ? (
                <Box padding="500">
                  <Text tone="subdued" alignment="center">
                    {hasActiveFilters ? "Keine Transaktionen für die gewählten Filter." : "Keine Transaktionen in diesem Zeitraum."}
                  </Text>
                </Box>
              ) : (
                <>
                  {/* Column headers */}
                  <div style={{
                    display: "grid",
                    gridTemplateColumns: "160px 1fr 1fr 100px 100px 80px 80px 100px 110px",
                    gap: 8, padding: "10px 20px",
                    borderBottom: "1px solid #e5e7eb",
                    fontSize: 11, fontWeight: 600, color: "#6b7280",
                    background: "#fafafa",
                  }}>
                    <SortTh label="Datum" col="created_at" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                    <div>Bestellnr.</div>
                    <div>Kunde</div>
                    <SortTh label="Brutto" col="total_cents" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} style={{ justifyContent: "flex-end" }} />
                    <SortTh label="Provision" col="commission_cents" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} style={{ justifyContent: "flex-end" }} />
                    <div style={{ textAlign: "right" }}>Versand</div>
                    <div style={{ textAlign: "right" }}>Rabatt</div>
                    <SortTh label="Netto" col="payout_cents" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} style={{ justifyContent: "flex-end" }} />
                    <SortTh label="Status" col="delivery_date" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} style={{ justifyContent: "center" }} />
                  </div>

                  {/* Rows */}
                  {pagedTransactions.map((t, i) => (
                    <div
                      key={`${t.id || ""}-${i}`}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "160px 1fr 1fr 100px 100px 80px 80px 100px 110px",
                        gap: 8, padding: "11px 20px",
                        borderBottom: "1px solid #f3f4f6",
                        fontSize: 13, alignItems: "center",
                        background: i % 2 === 0 ? "#fff" : "#fafafa",
                      }}
                    >
                      <div style={{ color: "#374151" }}>
                        <div>{fmtDate(t.created_at)}</div>
                        {t.delivery_date && (
                          <div style={{ fontSize: 11, color: "#9ca3af" }}>Lief.: {fmtDate(t.delivery_date)}</div>
                        )}
                      </div>
                      <div>
                        <div style={{ fontWeight: 600, color: "#111827" }}>{t.order_number || t.id}</div>
                      </div>
                      <div style={{ color: "#374151" }}>
                        {[t.first_name, t.last_name].filter(Boolean).join(" ") || "—"}
                      </div>
                      <div style={{ textAlign: "right", fontWeight: 500 }}>{fmt(t.total_cents)}</div>
                      <div style={{ textAlign: "right", color: "#dc2626" }}>– {fmt(t.commission_cents)}</div>
                      <div style={{ textAlign: "right", color: "#2563eb" }}>{fmt(t.shipping_cents)}</div>
                      <div style={{ textAlign: "right", color: "#6b7280" }}>{fmt(t.discount_cents)}</div>
                      <div style={{ textAlign: "right", fontWeight: 700, color: "#059669" }}>{fmt(t.payout_cents)}</div>
                      <div style={{ textAlign: "center" }}>
                        <Badge tone={t.payout_eligible ? "success" : "warning"}>
                          {t.payout_eligible ? "Freigegeben" : "Ausstehend"}
                        </Badge>
                      </div>
                    </div>
                  ))}

                  {/* Totals row */}
                  {pagedTransactions.length > 1 && (
                    <div style={{
                      display: "grid",
                      gridTemplateColumns: "160px 1fr 1fr 100px 100px 80px 80px 100px 110px",
                      gap: 8, padding: "11px 20px",
                      borderTop: "2px solid #e5e7eb",
                      fontSize: 13, fontWeight: 700,
                      background: "#f9fafb",
                    }}>
                      <div style={{ color: "#6b7280", fontSize: 11 }}>Gesamt ({pagedTransactions.length})</div>
                      <div /><div />
                      <div style={{ textAlign: "right" }}>{fmt(pagedTransactions.reduce((s, t) => s + (t.total_cents || 0), 0))}</div>
                      <div style={{ textAlign: "right", color: "#dc2626" }}>– {fmt(pagedTransactions.reduce((s, t) => s + (t.commission_cents || 0), 0))}</div>
                      <div style={{ textAlign: "right", color: "#2563eb" }}>{fmt(pagedTransactions.reduce((s, t) => s + (t.shipping_cents || 0), 0))}</div>
                      <div style={{ textAlign: "right" }}>{fmt(pagedTransactions.reduce((s, t) => s + (t.discount_cents || 0), 0))}</div>
                      <div style={{ textAlign: "right", color: "#059669" }}>{fmt(pagedTransactions.reduce((s, t) => s + (t.payout_cents || 0), 0))}</div>
                      <div />
                    </div>
                  )}

                  {/* Pagination */}
                  {ps > 0 && totalPages > 1 && (
                    <div style={{ padding: "12px 20px", borderTop: "1px solid #f3f4f6", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <Text variant="bodySm" tone="subdued">
                        {page * ps + 1}–{Math.min((page + 1) * ps, totalFiltered)} von {totalFiltered}
                      </Text>
                      <InlineStack gap="200">
                        <Button size="slim" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>← Zurück</Button>
                        <Text variant="bodySm" tone="subdued">Seite {page + 1} / {totalPages}</Text>
                        <Button size="slim" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>Weiter →</Button>
                      </InlineStack>
                    </div>
                  )}
                </>
              )}
            </Card>
          </Box>

          {/* ── Payout History ── */}
          <Box paddingBlockStart="400">
            <Card padding="0">
              <div style={{ padding: "16px 20px", borderBottom: "1px solid #f3f4f6" }}>
                <Text variant="headingMd" as="h2">Auszahlungsverlauf</Text>
              </div>
              {history.length === 0 ? (
                <Box padding="500">
                  <Text tone="subdued" alignment="center">Noch keine Auszahlungen vorhanden.</Text>
                </Box>
              ) : (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "1.5fr 110px 110px 120px 100px", gap: 8, padding: "10px 20px", borderBottom: "1px solid #e5e7eb", fontSize: 11, fontWeight: 600, color: "#6b7280", background: "#fafafa" }}>
                    <div>Zeitraum</div>
                    <div style={{ textAlign: "right" }}>Umsatz</div>
                    <div style={{ textAlign: "right" }}>Provision</div>
                    <div style={{ textAlign: "right" }}>Auszahlung</div>
                    <div style={{ textAlign: "center" }}>Status</div>
                  </div>
                  {history.map((p, i) => (
                    <div key={p.id || i} style={{ display: "grid", gridTemplateColumns: "1.5fr 110px 110px 120px 100px", gap: 8, padding: "12px 20px", borderBottom: "1px solid #f3f4f6", fontSize: 13, alignItems: "center" }}>
                      <div>
                        <div style={{ color: "#111827", fontWeight: 500 }}>{fmtDate(p.period_start)} – {fmtDate(p.period_end)}</div>
                        {p.reference && (
                          <div style={{ fontSize: 11, color: "#9ca3af", fontFamily: "monospace" }}>{p.reference}</div>
                        )}
                      </div>
                      <div style={{ textAlign: "right" }}>{fmt(p.total_cents || 0)}</div>
                      <div style={{ textAlign: "right", color: "#dc2626" }}>– {fmt(Math.round((p.total_cents || 0) * COMMISSION_RATE))}</div>
                      <div style={{ textAlign: "right", fontWeight: 700, color: "#059669" }}>{fmt(p.payout_cents || 0)}</div>
                      <div style={{ textAlign: "center" }}>
                        <Badge tone={statusTone(p.status)}>{statusLabel(p.status)}</Badge>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </Card>
          </Box>

          {/* ── IBAN Section ── */}
          <Box paddingBlockStart="400">
            <Card>
              <BlockStack gap="300">
                <BlockStack gap="050">
                  <Text as="h2" variant="headingMd">Bankverbindung</Text>
                  <Text as="p" tone="subdued" variant="bodySm">Hinterlegte IBAN für automatische Auszahlungen</Text>
                </BlockStack>
                <Divider />
              </BlockStack>
            </Card>
            <Box paddingBlockStart="300">
              <IbanSection commissionRate={COMMISSION_RATE} />
            </Box>
          </Box>

        </Layout.Section>
      </Layout>
    </Page>
  );
}

// ── Admin / Superuser Payments View ──────────────────────────────────────────
function AdminPaymentsView() {
  const [periodKey, setPeriodKey] = useState(PERIODS[0].key);
  const [sellers, setSellers]     = useState([]);
  const [txRows, setTxRows]       = useState([]);
  const [loading, setLoading]     = useState(false);
  const [err, setErr]             = useState("");
  const [paying, setPaying]       = useState(null);

  // Monitor filters
  const [monitorSort, setMonitorSort]   = useState("created_at");
  const [monitorDir, setMonitorDir]     = useState("desc");
  const [monitorSearch, setMonitorSearch] = useState("");
  const [monitorStatus, setMonitorStatus] = useState("all");

  const selectedPeriod = PERIODS.find((p) => p.key === periodKey) || PERIODS[0];

  const loadData = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const [overview, tx] = await Promise.all([
        getMedusaAdminClient().getAdminPayoutOverview({
          period_start: selectedPeriod.start,
          period_end: selectedPeriod.end,
        }),
        getMedusaAdminClient().getTransactions({
          include_pending: "true",
          period_start: selectedPeriod.start,
          period_end: selectedPeriod.end,
        }),
      ]);
      setSellers(overview?.sellers || []);
      setTxRows(tx?.transactions || []);
    } catch (e) {
      setErr(e?.message || "Fehler beim Laden");
    } finally {
      setLoading(false);
    }
  }, [selectedPeriod.start, selectedPeriod.end]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleMarkPaid = async (seller) => {
    if (!confirm(
      `Auszahlung für "${seller.store_name || seller.email}" als überwiesen markieren?\n\nBitte stelle sicher, dass die tatsächliche Überweisung bereits erfolgt ist.`
    )) return;
    setPaying(seller.seller_id);
    try {
      await getMedusaAdminClient().markPayoutPaid({
        seller_id: seller.seller_id,
        period_start: selectedPeriod.start,
        period_end: selectedPeriod.end,
        amount_cents: seller.payout_cents,
        reference: `${seller.seller_id}-${periodKey}`,
      });
      await loadData();
    } catch (e) {
      alert(e?.message || "Fehler");
    } finally {
      setPaying(null);
    }
  };

  // Admin KPIs
  const totalRevenue    = sellers.reduce((s, x) => s + (x.total_cents || 0), 0);
  const totalCommission = sellers.reduce((s, x) => s + Math.round((x.total_cents || 0) * COMMISSION_RATE), 0);
  const totalPayout     = sellers.reduce((s, x) => s + (x.payout_cents || 0), 0);
  const totalPaid       = sellers.filter((s) => s.status === "bezahlt" || s.status === "paid").reduce((acc, x) => acc + (x.payout_cents || 0), 0);
  const totalPending    = totalPayout - totalPaid;

  // Monitor filtered/sorted
  const handleMonitorSort = (col) => {
    setMonitorSort((prev) => { if (prev === col) setMonitorDir((d) => d === "asc" ? "desc" : "asc"); else setMonitorDir("desc"); return col; });
  };

  const displayMonitor = useMemo(() => {
    let rows = txRows;
    if (monitorSearch.trim()) {
      const q = monitorSearch.toLowerCase();
      rows = rows.filter((t) =>
        String(t.order_number || "").toLowerCase().includes(q) ||
        String(t.store_name || t.seller_id || "").toLowerCase().includes(q)
      );
    }
    if (monitorStatus !== "all") {
      rows = rows.filter((t) => (t.stripe_payout_status || "pending") === monitorStatus);
    }
    rows = [...rows].sort((a, b) => {
      let av, bv;
      if (monitorSort === "created_at") { av = new Date(a.created_at || 0).getTime(); bv = new Date(b.created_at || 0).getTime(); }
      else if (monitorSort === "payout_cents") { av = a.payout_cents || 0; bv = b.payout_cents || 0; }
      else { av = 0; bv = 0; }
      return monitorDir === "asc" ? av - bv : bv - av;
    });
    return rows.slice(0, 200);
  }, [txRows, monitorSearch, monitorStatus, monitorSort, monitorDir]);

  // Status counts for badge summary
  const payoutStatusCounts = txRows.reduce((acc, t) => {
    const k = String(t?.stripe_payout_status || "pending");
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {});

  const periodOptions = PERIODS.map((p) => ({ label: p.label, value: p.key }));

  return (
    <Page title="Zahlungen & Auszahlungen (Admin)">
      <Layout>
        <Layout.Section>
          {err && (
            <Box paddingBlockEnd="400">
              <Banner tone="critical" onDismiss={() => setErr("")}>{err}</Banner>
            </Box>
          )}

          {/* Period selector */}
          <Card>
            <InlineStack align="space-between" blockAlign="center" wrap={false}>
              <BlockStack gap="100">
                <Text variant="headingMd" as="h2">Abrechnungszeitraum</Text>
                <Text variant="bodySm" tone="subdued">Plattform-Übersicht für alle Seller</Text>
              </BlockStack>
              <InlineStack gap="300" blockAlign="center">
                <div style={{ width: 300 }}>
                  <Select label="" labelHidden options={periodOptions} value={periodKey} onChange={setPeriodKey} />
                </div>
                <Button onClick={loadData} loading={loading} size="slim">Aktualisieren</Button>
              </InlineStack>
            </InlineStack>
          </Card>

          {/* Global KPIs */}
          <Box paddingBlockStart="400">
            <Card>
              <BlockStack gap="400">
                <BlockStack gap="050">
                  <Text variant="headingMd" as="h2">Plattform-Finanzen</Text>
                  <Text variant="bodySm" tone="subdued">{selectedPeriod.label}</Text>
                </BlockStack>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
                  <KpiCard icon="📦" label="Plattform-Umsatz (gesamt)" value={fmt(totalRevenue)} sub={`${sellers.length} aktive Seller`} />
                  <KpiCard icon="💰" label={`Provision (${(COMMISSION_RATE * 100).toFixed(0)} %)`} value={fmt(totalCommission)} tone="success" sub="Einnahmen der Plattform" highlight />
                  <KpiCard icon="💸" label="Auszuzahlen (gesamt)" value={fmt(totalPayout)} tone="critical" />
                  <KpiCard icon="✅" label="Bereits bezahlt" value={fmt(totalPaid)} tone="success" />
                  <KpiCard icon="⏳" label="Noch ausstehend" value={fmt(totalPending)} tone={totalPending > 0 ? "critical" : undefined} />
                </div>
              </BlockStack>
            </Card>
          </Box>

          {/* Per-seller payout table */}
          <Box paddingBlockStart="400">
            <Card padding="0">
              <div style={{ padding: "16px 20px", borderBottom: "1px solid #f3f4f6" }}>
                <Text variant="headingMd" as="h2">Seller-Auszahlungen ({sellers.length})</Text>
              </div>
              {loading ? (
                <Box padding="400"><Text tone="subdued">Laden…</Text></Box>
              ) : sellers.length === 0 ? (
                <Box padding="500"><Text tone="subdued" alignment="center">Für diesen Zeitraum liegen keine Daten vor.</Text></Box>
              ) : (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "1.8fr 100px 100px 120px 130px 100px auto", gap: 8, padding: "10px 20px", borderBottom: "1px solid #e5e7eb", fontSize: 11, fontWeight: 600, color: "#6b7280", background: "#fafafa" }}>
                    <div>Seller</div>
                    <div style={{ textAlign: "right" }}>Umsatz</div>
                    <div style={{ textAlign: "right" }}>Provision</div>
                    <div style={{ textAlign: "right" }}>Auszahlung</div>
                    <div>Verwendungszweck</div>
                    <div style={{ textAlign: "center" }}>Status</div>
                    <div></div>
                  </div>
                  {sellers.map((seller, i) => {
                    const comm = Math.round((seller.total_cents || 0) * COMMISSION_RATE);
                    const reference = `${seller.seller_id}-${periodKey}`;
                    const isPaid = seller.status === "bezahlt" || seller.status === "paid";
                    return (
                      <div key={seller.seller_id || i} style={{ display: "grid", gridTemplateColumns: "1.8fr 100px 100px 120px 130px 100px auto", gap: 8, padding: "12px 20px", borderBottom: "1px solid #f3f4f6", alignItems: "center", background: isPaid ? "#f0fdf4" : "#fff" }}>
                        <div>
                          <Text variant="bodyMd" fontWeight="semibold">{seller.store_name || seller.email}</Text>
                          {seller.store_name && <Text variant="bodySm" tone="subdued">{seller.email}</Text>}
                          <Text variant="bodySm" tone="subdued">{seller.order_count || 0} Bestellungen</Text>
                        </div>
                        <div style={{ textAlign: "right", fontSize: 13 }}>{fmt(seller.total_cents || 0)}</div>
                        <div style={{ textAlign: "right", fontSize: 13, color: "#059669", fontWeight: 600 }}>+{fmt(comm)}</div>
                        <div style={{ textAlign: "right", fontSize: 13, fontWeight: 700, color: isPaid ? "#6b7280" : "#dc2626" }}>
                          {fmt(seller.payout_cents || 0)}
                        </div>
                        <div>
                          <code style={{ fontSize: 11, background: "#f3f4f6", padding: "2px 5px", borderRadius: 4, color: "#374151", display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {reference}
                          </code>
                        </div>
                        <div style={{ textAlign: "center" }}>
                          <Badge tone={statusTone(seller.status)}>{statusLabel(seller.status)}</Badge>
                        </div>
                        <div>
                          {!isPaid && (seller.payout_cents || 0) > 0 ? (
                            <Button size="slim" variant="primary" onClick={() => handleMarkPaid(seller)} loading={paying === seller.seller_id}>
                              Als bezahlt markieren
                            </Button>
                          ) : isPaid ? (
                            <Text variant="bodySm" tone="success">✓ {seller.paid_at ? fmtDate(seller.paid_at) : "Bezahlt"}</Text>
                          ) : (
                            <Text variant="bodySm" tone="subdued">Kein Betrag</Text>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </>
              )}
            </Card>
          </Box>

          {/* IBAN Auszahlungsmonitor */}
          <Box paddingBlockStart="400">
            <Card padding="0">
              <div style={{ padding: "16px 20px", borderBottom: "1px solid #f3f4f6" }}>
                <InlineStack align="space-between" blockAlign="center">
                  <BlockStack gap="050">
                    <Text variant="headingMd" as="h2">IBAN Auszahlungsmonitor</Text>
                    <Text variant="bodySm" tone="subdued">Automatische Auszahlungsstatus aller Bestellungen</Text>
                  </BlockStack>
                  <InlineStack gap="200" wrap={false}>
                    {[
                      { k: "paid",    t: "success",   l: "Bezahlt" },
                      { k: "pending", t: "warning",   l: "Ausstehend" },
                      { k: "processing", t: "info",   l: "In Verarbeitung" },
                      { k: "failed",  t: "critical",  l: "Fehlgeschlagen" },
                    ].map(({ k, t, l }) => (payoutStatusCounts[k] || 0) > 0 ? (
                      <Badge key={k} tone={t}>{l}: {payoutStatusCounts[k]}</Badge>
                    ) : null)}
                  </InlineStack>
                </InlineStack>
              </div>

              {/* Monitor filters */}
              <div style={{ padding: "12px 20px", borderBottom: "1px solid #f3f4f6", background: "#fafafa", display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
                <div style={{ flex: "1 1 200px", minWidth: 180 }}>
                  <TextField
                    label="Suche"
                    labelHidden
                    value={monitorSearch}
                    onChange={setMonitorSearch}
                    placeholder="Bestellnr. oder Seller…"
                    clearButton
                    onClearButtonClick={() => setMonitorSearch("")}
                    autoComplete="off"
                  />
                </div>
                <div style={{ width: 180 }}>
                  <Select
                    label="Status"
                    labelHidden
                    options={[
                      { label: "Alle Status", value: "all" },
                      { label: "Ausstehend", value: "pending" },
                      { label: "In Verarbeitung", value: "processing" },
                      { label: "Bezahlt", value: "paid" },
                      { label: "Fehlgeschlagen", value: "failed" },
                    ]}
                    value={monitorStatus}
                    onChange={setMonitorStatus}
                  />
                </div>
              </div>

              {txRows.length === 0 ? (
                <Box padding="500"><Text tone="subdued" alignment="center">Keine Daten im Zeitraum.</Text></Box>
              ) : (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "160px 1.2fr 1fr 100px 120px 1.2fr", gap: 8, padding: "10px 20px", borderBottom: "1px solid #e5e7eb", fontSize: 11, fontWeight: 600, color: "#6b7280", background: "#fafafa" }}>
                    <SortTh label="Datum" col="created_at" sortCol={monitorSort} sortDir={monitorDir} onSort={handleMonitorSort} />
                    <div>Bestellung</div>
                    <div>Seller</div>
                    <SortTh label="Auszahlung" col="payout_cents" sortCol={monitorSort} sortDir={monitorDir} onSort={handleMonitorSort} style={{ justifyContent: "flex-end" }} />
                    <div style={{ textAlign: "center" }}>Status</div>
                    <div>Payout-ID</div>
                  </div>
                  {displayMonitor.map((t, i) => (
                    <div key={`${t.id || ""}-${i}`} style={{ display: "grid", gridTemplateColumns: "160px 1.2fr 1fr 100px 120px 1.2fr", gap: 8, padding: "11px 20px", borderBottom: "1px solid #f3f4f6", fontSize: 13, alignItems: "center" }}>
                      <div style={{ color: "#374151" }}>
                        <div>{fmtDate(t.created_at)}</div>
                        {t.delivery_date && <div style={{ fontSize: 11, color: "#9ca3af" }}>Lief.: {fmtDate(t.delivery_date)}</div>}
                      </div>
                      <div>
                        <div style={{ fontWeight: 600 }}>#{t.order_number || t.id}</div>
                      </div>
                      <div style={{ color: "#374151" }}>{t.store_name || t.seller_id}</div>
                      <div style={{ textAlign: "right", fontWeight: 600 }}>{fmt(t.payout_cents || 0)}</div>
                      <div style={{ textAlign: "center" }}>
                        <Badge tone={statusTone(t.stripe_payout_status)}>
                          {statusLabel(t.stripe_payout_status || "pending")}
                        </Badge>
                      </div>
                      <div>
                        {t.stripe_payout_id ? (
                          <code style={{ fontSize: 11, background: "#f3f4f6", padding: "2px 5px", borderRadius: 4, color: "#374151" }}>
                            {t.stripe_payout_id}
                          </code>
                        ) : (
                          <Text variant="bodySm" tone="subdued">—</Text>
                        )}
                      </div>
                    </div>
                  ))}
                  {displayMonitor.length === 200 && (
                    <Box padding="300">
                      <Text variant="bodySm" tone="subdued" alignment="center">Maximal 200 Einträge angezeigt. Nutze die Filter um spezifische Ergebnisse zu sehen.</Text>
                    </Box>
                  )}
                </>
              )}
            </Card>
          </Box>

        </Layout.Section>
      </Layout>
    </Page>
  );
}

// ── Entry Point ───────────────────────────────────────────────────────────────
export default function PaymentsSettingsPage() {
  const [isSuperuser, setIsSuperuser] = useState(null);

  useEffect(() => {
    const su = typeof window !== "undefined" && localStorage.getItem("sellerIsSuperuser") === "true";
    setIsSuperuser(su);
  }, []);

  if (isSuperuser === null) {
    return (
      <Page title="Zahlungen">
        <Box padding="400"><Text tone="subdued">Laden…</Text></Box>
      </Page>
    );
  }

  return isSuperuser ? <AdminPaymentsView /> : <SellerPaymentsView />;
}
