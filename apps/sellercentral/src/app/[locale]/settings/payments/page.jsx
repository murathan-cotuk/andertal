"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Page, Layout, Card, Text, BlockStack, InlineStack,
  Button, Banner, Badge, Box, Select, TextField, Divider,
} from "@shopify/polaris";
import { useLocale } from "next-intl";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";
import { useUnsavedChanges } from "@/context/UnsavedChangesContext";
import SellerCreditCardSection from "@/components/SellerCreditCardSection";
import { confirmDelete } from "@/lib/confirm-delete";
import { fmtDateShort, fmtDateTimeShort, fmtMoney } from "@/lib/locale-text";
import { getPaymentsCopy, payoutStatusLabel } from "@/lib/payments-i18n";

// ── Constants ──────────────────────────────────────────────────────────────────
const DEFAULT_COMMISSION_RATE = 0.12;

// ── Formatters (locale-aware via component locale) ───────────────────────────
const fmt = (cents, locale = "de") => fmtMoney(cents, locale);
const fmtDate = (d, locale = "de") => fmtDateShort(d, locale);
const fmtDateTime = (d, locale = "de") => fmtDateTimeShort(d, locale);

const csvEscape = (v) => {
  const s = v == null ? "" : String(v);
  if (/[",\n;]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
};

// ── Period generator (15-day settlement periods, Amazon-style) ────────────────
/** Inclusive calendar dates YYYY-MM-DD — matches backend DATE(COALESCE(delivery_date, created_at)). */
function generatePeriods(count = 12) {
  const periods = [];
  const now = new Date();
  let year = now.getFullYear();
  let month = now.getMonth();
  for (let i = 0; i < count; i++) {
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const mm = String(month + 1).padStart(2, "0");
    const ym = `${year}-${mm}`;
    periods.push({
      label: `16.${mm}.${year} – ${String(daysInMonth).padStart(2, "0")}.${mm}.${year}`,
      startDate: `${ym}-16`,
      endDate: `${ym}-${String(daysInMonth).padStart(2, "0")}`,
      key: `${ym}-2`,
      monthLabel: `${mm}.${year}`,
    });
    periods.push({
      label: `01.${mm}.${year} – 15.${mm}.${year}`,
      startDate: `${ym}-01`,
      endDate: `${ym}-15`,
      key: `${ym}-1`,
      monthLabel: `${mm}.${year}`,
    });
    month -= 1;
    if (month < 0) { month = 11; year -= 1; }
  }
  return periods;
}

/** Aktueller Halbmonat (1–15 oder 16–Monatsende) — Standardauswahl wie Marktplatz-Abrechnung. */
function initialPeriodKeyForToday(periods) {
  const now = new Date();
  const half = now.getDate() <= 15 ? "1" : "2";
  const key = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${half}`;
  return periods.some((p) => p.key === key) ? key : periods[0]?.key || key;
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
const statusLabel = (s, locale) => payoutStatusLabel(locale, s);

// ── IBAN helpers ──────────────────────────────────────────────────────────────
/** ISO 13616 MOD-97 — SEPA uses standard IBAN. */
function ibanMod97(iban) {
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let expanded = "";
  for (let i = 0; i < rearranged.length; i++) {
    const c = rearranged[i];
    expanded += /[A-Z]/.test(c) ? String(c.charCodeAt(0) - 55) : c;
  }
  let rem = 0;
  for (let i = 0; i < expanded.length; i++) {
    rem = (rem * 10 + parseInt(expanded[i], 10)) % 97;
  }
  return rem === 1;
}

function validateIban(raw, ibanErrors) {
  const v = raw.replace(/\s/g, "").toUpperCase();
  if (!v) return { ok: false, error: ibanErrors.empty };
  if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]{4,}$/.test(v))
    return { ok: false, error: ibanErrors.format };
  if (v.length < 15 || v.length > 34)
    return { ok: false, error: ibanErrors.length };
  if (!ibanMod97(v)) return { ok: false, error: ibanErrors.checksum };
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
function IbanSection() {
  const locale = useLocale();
  const txt = getPaymentsCopy(locale);
  const client = getMedusaAdminClient();
  const unsaved = useUnsavedChanges();

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
      const { ok: valid, error: ie } = validateIban(trimmed, txt.ibanErrors);
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
      setOk(txt.bankSaved); setEditing(false);
    } catch (e) { setErr(e?.message || txt.saveError); }
    finally { setSaving(false); }
  }, [client, iban, holder, bic, bankName, txt.bankSaved, txt.saveError, txt.ibanErrors]);

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
            <Text as="p" variant="bodyMd" fontWeight="semibold">{txt.howPayoutsWork}</Text>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
              {[
                { n: "1", label: txt.step1Label, desc: txt.step1Desc },
                { n: "2", label: txt.step2Label, desc: txt.step2Desc },
                { n: "3", label: txt.step3Label, desc: txt.step3Desc },
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
              <Text as="h2" variant="headingMd">{txt.bankAccountTitle}</Text>
              <Text as="p" tone="subdued" variant="bodySm">{txt.bankAccountSub}</Text>
            </BlockStack>
            {!editing && (
              <Button onClick={() => setEditing(true)} size="slim">
                {savedIban ? txt.edit : txt.add}
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
                      <Text as="p" variant="bodySm" tone="subdued">{txt.accountHolder}</Text>
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
                      <Text as="p" variant="bodySm" tone="subdued">{txt.bank}</Text>
                      <Text as="p" variant="bodyMd">{savedBankName}</Text>
                    </BlockStack>
                  )}
                </div>
                <Box paddingBlockStart="200">
                  <InlineStack gap="150" blockAlign="center">
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#10b981", flexShrink: 0, display: "inline-block" }} />
                    <Text as="p" variant="bodySm" tone="success">{txt.bankReady}</Text>
                  </InlineStack>
                </Box>
              </div>
            ) : (
              <div style={{ background: "#fffbeb", borderRadius: 10, padding: "16px 20px", border: "1px solid #fde68a" }}>
                <InlineStack gap="300" blockAlign="center">
                  <Text as="span" variant="headingLg">⚠️</Text>
                  <BlockStack gap="050">
                    <Text as="p" variant="bodyMd" fontWeight="semibold">{txt.noBankTitle}</Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      {txt.noBankDesc}
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
                    label={txt.ibanRequired}
                    value={formatIbanInput(iban)}
                    onChange={(v) => { setIban(v.replace(/\s/g, "").toUpperCase()); setIbanError(""); }}
                    error={ibanError}
                    placeholder="DE89 3704 0044 0532 0130 00"
                    helpText={txt.ibanHelp}
                    autoComplete="off"
                  />
                  <TextField
                    label={txt.accountHolder}
                    value={holder}
                    onChange={setHolder}
                    placeholder={txt.holderPlaceholder}
                    autoComplete="off"
                  />
                  <InlineStack gap="300">
                    <div style={{ flex: 1 }}>
                      <TextField
                        label={txt.bicOptional}
                        value={bic}
                        onChange={(v) => setBic(v.toUpperCase())}
                        placeholder="COBADEFFXXX"
                        autoComplete="off"
                      />
                    </div>
                    <div style={{ flex: 1 }}>
                      <TextField
                        label={txt.bankNameOptional}
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
                <Button onClick={handleCancel} disabled={saving}>{txt.cancel}</Button>
                <Button variant="primary" onClick={handleSave} loading={saving}>{txt.saveBank}</Button>
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
  const locale = useLocale();
  const txt = getPaymentsCopy(locale);
  const [periodKey, setPeriodKey]     = useState(() => initialPeriodKeyForToday(PERIODS));
  const [summary, setSummary]         = useState(null);
  const [history, setHistory]         = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading]         = useState(false);
  const [err, setErr]                 = useState("");
  const [commissionRate, setCommissionRate] = useState(DEFAULT_COMMISSION_RATE);

  // Table controls
  const [sortCol, setSortCol]         = useState("created_at");
  const [sortDir, setSortDir]         = useState("desc");
  const [filterSearch, setFilterSearch] = useState("");
  const [filterType, setFilterType]   = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [pageSize, setPageSize]       = useState("20");
  const [page, setPage]               = useState(0);

  const selectedPeriod = PERIODS.find((p) => p.key === periodKey) || PERIODS[0];

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const acc = await getMedusaAdminClient().getSellerAccount();
        const u = acc?.sellerUser || acc?.user || {};
        const r = u.commission_rate != null ? Number(u.commission_rate) : DEFAULT_COMMISSION_RATE;
        if (!cancelled && Number.isFinite(r) && r >= 0 && r <= 1) setCommissionRate(r);
      } catch (_) {}
    })();
    return () => { cancelled = true; };
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const client = getMedusaAdminClient();
      const ps = selectedPeriod.startDate;
      const pe = selectedPeriod.endDate;
      const [sumRes, histRes, txRes] = await Promise.allSettled([
        client.getPayoutSummary({ period_start: ps, period_end: pe }),
        client.getPayouts(),
        client.getTransactions({ include_pending: "true", payout_days: "14", period_start: ps, period_end: pe }),
      ]);
      if (sumRes.status === "fulfilled") setSummary(sumRes.value?.summary || null);
      if (histRes.status === "fulfilled") setHistory(histRes.value?.payouts || []);
      if (txRes.status === "fulfilled") setTransactions(Array.isArray(txRes.value?.transactions) ? txRes.value.transactions : []);
      else setTransactions([]);
    } catch (e) {
      setErr(e?.message || txt.loadError);
    } finally {
      setLoading(false);
    }
  }, [selectedPeriod.startDate, selectedPeriod.endDate, txt.loadError]);

  useEffect(() => { loadData(); }, [loadData]);

  /** Bereits nach Zeitraum vom Backend gefiltert (Lieferdatum oder Bestelldatum). */
  const periodTransactions = transactions;

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

  // KPI calculations (Backend-Zusammenfassung = gleiche Logik wie Transaktionsliste)
  const revenue    = summary?.total_cents ?? 0;
  const commission = summary?.commission_cents != null ? summary.commission_cents : Math.round(revenue * commissionRate);
  const shipping   = summary?.shipping_cents ?? 0;
  const refunds    = summary?.refund_cents ?? 0;
  const adSpend    = summary?.ad_spend_cents ?? 0;
  const net        = revenue - commission - adSpend - refunds + shipping;
  const payoutStatus = summary?.status || null;
  const eligibleCount = periodTransactions.filter((t) => t.payout_eligible).length;
  const pendingPayCount = periodTransactions.length - eligibleCount;

  const exportCsv = () => {
    const rows = [
      [txt.colOrderNo, txt.colDate, txt.colDeliveryDate, txt.colCustomer, `${txt.colGross} (€)`, `${txt.commission} (€)`, `${txt.colShipping} (€)`, `${txt.colNet} (€)`, txt.colStatus],
      ...displayTransactions.map((t) => [
        t.order_number || "",
        fmtDateTime(t.created_at, locale),
        fmtDate(t.delivery_date, locale),
        [t.first_name, t.last_name].filter(Boolean).join(" ").trim(),
        ((t.total_cents || 0) / 100).toFixed(2),
        ((t.commission_cents || 0) / 100).toFixed(2),
        ((t.shipping_cents || 0) / 100).toFixed(2),
        ((t.payout_cents || 0) / 100).toFixed(2),
        t.payout_eligible ? txt.eligible : txt.pending,
      ]),
    ];
    const csv = rows.map((r) => r.map(csvEscape).join(";")).join("\n");
    const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${txt.csvFilenamePrefix}-${selectedPeriod.key}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  };

  const periodOptions = PERIODS.map((p) => ({ label: p.label, value: p.key }));
  const hasActiveFilters = filterSearch.trim() || filterType !== "all" || filterStatus !== "all";
  const currentPeriodKeyToday = initialPeriodKeyForToday(PERIODS);
  const isSelectedCurrentPeriod = periodKey === currentPeriodKeyToday;

  return (
    <Page title={txt.pageTitle} subtitle={txt.pageSubtitle}>
      <Layout>
        <Layout.Section>
          {err && (
            <Box paddingBlockEnd="400">
              <Banner tone="critical" onDismiss={() => setErr("")}>{err}</Banner>
            </Box>
          )}

          <Box paddingBlockEnd="400">
            <Banner tone="info">
              <BlockStack gap="150">
                <Text as="p" variant="bodySm">
                  <strong>{txt.holdTitle}</strong> {txt.holdBody}
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  {txt.periodHint}
                </Text>
              </BlockStack>
            </Banner>
          </Box>

          {/* ── Period Selector ── */}
          <Card>
            <InlineStack align="space-between" blockAlign="center" wrap>
              <BlockStack gap="150">
                <InlineStack gap="200" blockAlign="center" wrap>
                  <Text variant="headingMd" as="h2">{txt.periodTitle}</Text>
                  {isSelectedCurrentPeriod ? (
                    <Badge tone="success">{txt.currentPeriod}</Badge>
                  ) : (
                    <Badge tone="info">{txt.pastPeriod}</Badge>
                  )}
                </InlineStack>
                <Text variant="bodySm" tone="subdued">
                  {selectedPeriod.monthLabel}: {selectedPeriod.startDate === selectedPeriod.endDate
                    ? selectedPeriod.startDate
                    : `${selectedPeriod.startDate} → ${selectedPeriod.endDate}`} ({txt.calendarDays})
                </Text>
              </BlockStack>
              <InlineStack gap="300" blockAlign="center" wrap={false}>
                <div style={{ minWidth: 280, flex: "1 1 280px" }}>
                  <Select
                    label=""
                    labelHidden
                    options={periodOptions}
                    value={periodKey}
                    onChange={(v) => { setPeriodKey(v); setPage(0); }}
                  />
                </div>
                <Button onClick={loadData} loading={loading} size="slim">{txt.refresh}</Button>
              </InlineStack>
            </InlineStack>
          </Card>

          {/* ── KPI Dashboard ── */}
          <Box paddingBlockStart="400">
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between" blockAlign="center">
                  <BlockStack gap="050">
                    <Text variant="headingMd" as="h2">{txt.financeOverview}</Text>
                    <Text variant="bodySm" tone="subdued">{selectedPeriod.label}</Text>
                  </BlockStack>
                  {payoutStatus && <Badge tone={statusTone(payoutStatus)}>{statusLabel(payoutStatus, locale)}</Badge>}
                </InlineStack>

                {loading ? (
                  <Text tone="subdued">{txt.loading}</Text>
                ) : (
                  <>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
                      <KpiCard
                        icon="📦"
                        label={txt.revenue}
                        value={fmt(revenue, locale)}
                        sub={`${summary?.paid_count ?? periodTransactions.length} · ${eligibleCount} ${txt.statusEligible} · ${pendingPayCount} ${txt.statusPending}`}
                      />
                      <KpiCard
                        icon="💸"
                        label={`${txt.commission} (${(commissionRate * 100).toFixed(1).replace(/\.0$/, "")} %)`}
                        value={`– ${fmt(commission, locale)}`}
                        tone="critical"
                        sub={txt.platformFee}
                      />
                      <KpiCard
                        icon="📣"
                        label={txt.adSpend}
                        value={adSpend > 0 ? `– ${fmt(adSpend, locale)}` : "–"}
                        tone={adSpend > 0 ? "critical" : undefined}
                      />
                      <KpiCard
                        icon="↩️"
                        label={txt.refunds}
                        value={refunds > 0 ? `– ${fmt(refunds, locale)}` : fmt(0, locale)}
                        tone={refunds > 0 ? "critical" : undefined}
                      />
                      <KpiCard
                        icon="🚚"
                        label={txt.shippingShare}
                        value={fmt(shipping, locale)}
                        tone="info"
                      />
                      <KpiCard
                        icon="✅"
                        label={txt.netPayout}
                        value={fmt(Math.max(0, net), locale)}
                        tone="success"
                        highlight
                        sub={txt.afterHold}
                      />
                    </div>

                    {/* Net payout breakdown */}
                    {revenue > 0 && (
                      <div style={{ background: "#f8fafc", borderRadius: 10, padding: "14px 18px", border: "1px solid #e2e8f0" }}>
                        <BlockStack gap="150">
                          <Text variant="bodySm" fontWeight="semibold" tone="subdued">{txt.calcBasis}</Text>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 32px", fontSize: 13 }}>
                            <span>{fmt(revenue, locale)} <span style={{ color: "#6b7280" }}>{txt.revenueLabel}</span></span>
                            {commission > 0 && <span style={{ color: "#dc2626" }}>– {fmt(commission, locale)} <span style={{ color: "#6b7280" }}>{txt.commission}</span></span>}
                            {adSpend > 0  && <span style={{ color: "#dc2626" }}>– {fmt(adSpend, locale)} <span style={{ color: "#6b7280" }}>{txt.adSpend}</span></span>}
                            {refunds > 0  && <span style={{ color: "#dc2626" }}>– {fmt(refunds, locale)} <span style={{ color: "#6b7280" }}>{txt.refunds}</span></span>}
                            {shipping > 0 && <span style={{ color: "#059669" }}>+ {fmt(shipping, locale)} <span style={{ color: "#6b7280" }}>{txt.shippingShare}</span></span>}
                            <span style={{ fontWeight: 700, color: "#059669" }}>= {fmt(Math.max(0, net), locale)} <span style={{ color: "#6b7280", fontWeight: 400 }}>{txt.netLabel}</span></span>
                          </div>
                        </BlockStack>
                      </div>
                    )}

                    {!loading && periodTransactions.length === 0 && (
                      <Banner tone="info">{txt.noOrdersPeriod}</Banner>
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
                    <Text variant="headingMd" as="h2">{txt.transactions}</Text>
                    <Text variant="bodySm" tone="subdued">
                      {totalFiltered} {txt.entries}{hasActiveFilters ? ` (${txt.filtered})` : ""}
                      {totalFiltered !== periodTransactions.length && ` ${txt.of} ${periodTransactions.length} ${txt.totalWord}`}
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
                        {txt.resetFilters}
                      </Button>
                    )}
                    <Button size="slim" onClick={exportCsv} disabled={displayTransactions.length === 0}>
                      {txt.csvExport}
                    </Button>
                  </InlineStack>
                </InlineStack>
              </div>

              {/* Filter bar */}
              <div style={{ padding: "12px 20px", borderBottom: "1px solid #f3f4f6", background: "#fafafa", display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
                <div style={{ flex: "1 1 200px", minWidth: 180 }}>
                  <TextField
                    label={txt.search}
                    labelHidden
                    value={filterSearch}
                    onChange={(v) => { setFilterSearch(v); setPage(0); }}
                    placeholder={txt.searchPlaceholder}
                    clearButton
                    onClearButtonClick={() => { setFilterSearch(""); setPage(0); }}
                    autoComplete="off"
                  />
                </div>
                <div style={{ width: 160 }}>
                  <Select
                    label={txt.typeAll}
                    labelHidden
                    options={[
                      { label: txt.typeAll, value: "all" },
                      { label: txt.typeOrders, value: "sale" },
                      { label: txt.typeRefund, value: "refund" },
                    ]}
                    value={filterType}
                    onChange={(v) => { setFilterType(v); setPage(0); }}
                  />
                </div>
                <div style={{ width: 160 }}>
                  <Select
                    label={txt.statusAll}
                    labelHidden
                    options={[
                      { label: txt.statusAll, value: "all" },
                      { label: txt.statusEligible, value: "eligible" },
                      { label: txt.statusPending, value: "pending" },
                    ]}
                    value={filterStatus}
                    onChange={(v) => { setFilterStatus(v); setPage(0); }}
                  />
                </div>
                <div style={{ width: 140 }}>
                  <Select
                    label={txt.entriesLabel}
                    labelHidden
                    options={[
                      { label: `20 ${txt.perPage}`, value: "20" },
                      { label: `50 ${txt.perPage}`, value: "50" },
                      { label: `100 ${txt.perPage}`, value: "100" },
                      { label: txt.showAll, value: "0" },
                    ]}
                    value={pageSize}
                    onChange={(v) => { setPageSize(v); setPage(0); }}
                  />
                </div>
              </div>

              {/* Table */}
              {loading ? (
                <Box padding="500"><Text tone="subdued" alignment="center">{txt.loadingTransactions}</Text></Box>
              ) : displayTransactions.length === 0 ? (
                <Box padding="500">
                  <Text tone="subdued" alignment="center">
                    {hasActiveFilters ? txt.noTransactionsFilter : txt.noTransactionsPeriod}
                  </Text>
                </Box>
              ) : (
                <>
                  {/* Column headers */}
                  <div style={{
                    display: "grid",
                    gridTemplateColumns: "160px 1fr 1fr 100px 100px 80px 100px 110px",
                    gap: 8, padding: "10px 20px",
                    borderBottom: "1px solid #e5e7eb",
                    fontSize: 11, fontWeight: 600, color: "#6b7280",
                    background: "#fafafa",
                  }}>
                    <SortTh label={txt.colDate} col="created_at" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                    <div>{txt.colOrderNo}</div>
                    <div>{txt.colCustomer}</div>
                    <SortTh label={txt.colGross} col="total_cents" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} style={{ justifyContent: "flex-end" }} />
                    <SortTh label={txt.commission} col="commission_cents" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} style={{ justifyContent: "flex-end" }} />
                    <div style={{ textAlign: "right" }}>{txt.colShipping}</div>
                    <SortTh label={txt.colNet} col="payout_cents" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} style={{ justifyContent: "flex-end" }} />
                    <SortTh label={txt.colStatus} col="delivery_date" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} style={{ justifyContent: "center" }} />
                  </div>

                  {/* Rows */}
                  {pagedTransactions.map((t, i) => (
                    <div
                      key={`${t.id || ""}-${i}`}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "160px 1fr 1fr 100px 100px 80px 100px 110px",
                        gap: 8, padding: "11px 20px",
                        borderBottom: "1px solid #f3f4f6",
                        fontSize: 13, alignItems: "center",
                        background: i % 2 === 0 ? "#fff" : "#fafafa",
                      }}
                    >
                      <div style={{ color: "#374151" }}>
                        <div>{fmtDate(t.created_at, locale)}</div>
                        {t.delivery_date && (
                          <div style={{ fontSize: 11, color: "#9ca3af" }}>{txt.deliveryShort}: {fmtDate(t.delivery_date, locale)}</div>
                        )}
                      </div>
                      <div>
                        <div style={{ fontWeight: 600, color: "#111827" }}>{t.order_number || t.id}</div>
                      </div>
                      <div style={{ color: "#374151" }}>
                        {[t.first_name, t.last_name].filter(Boolean).join(" ") || "—"}
                      </div>
                      <div style={{ textAlign: "right", fontWeight: 500 }}>{fmt(t.total_cents, locale)}</div>
                      <div style={{ textAlign: "right", color: "#dc2626" }}>– {fmt(t.commission_cents, locale)}</div>
                      <div style={{ textAlign: "right", color: "#2563eb" }}>{fmt(t.shipping_cents, locale)}</div>
                      <div style={{ textAlign: "right", fontWeight: 700, color: "#059669" }}>{fmt(t.payout_cents, locale)}</div>
                      <div style={{ textAlign: "center" }}>
                        <Badge tone={t.payout_eligible ? "success" : "warning"}>
                          {t.payout_eligible ? txt.eligible : txt.pending}
                        </Badge>
                      </div>
                    </div>
                  ))}

                  {/* Summenzeile: immer über alle gefilterten Zeilen (nicht nur aktuelle Seite) */}
                  {displayTransactions.length > 0 && (
                    <div style={{
                      display: "grid",
                      gridTemplateColumns: "160px 1fr 1fr 100px 100px 80px 100px 110px",
                      gap: 8, padding: "11px 20px",
                      borderTop: "2px solid #e5e7eb",
                      fontSize: 13, fontWeight: 700,
                      background: "#f9fafb",
                    }}>
                      <div style={{ color: "#6b7280", fontSize: 11 }}>
                        {txt.sum} ({displayTransactions.length}{totalFiltered !== periodTransactions.length ? ` ${txt.of} ${periodTransactions.length}` : ""})
                      </div>
                      <div /><div />
                      <div style={{ textAlign: "right" }}>{fmt(displayTransactions.reduce((s, t) => s + (t.total_cents || 0), 0), locale)}</div>
                      <div style={{ textAlign: "right", color: "#dc2626" }}>– {fmt(displayTransactions.reduce((s, t) => s + (t.commission_cents || 0), 0), locale)}</div>
                      <div style={{ textAlign: "right", color: "#2563eb" }}>{fmt(displayTransactions.reduce((s, t) => s + (t.shipping_cents || 0), 0), locale)}</div>
                      <div style={{ textAlign: "right", color: "#059669" }}>{fmt(displayTransactions.reduce((s, t) => s + (t.payout_cents || 0), 0), locale)}</div>
                      <div />
                    </div>
                  )}

                  {/* Pagination */}
                  {ps > 0 && totalPages > 1 && (
                    <div style={{ padding: "12px 20px", borderTop: "1px solid #f3f4f6", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <Text variant="bodySm" tone="subdued">
                        {page * ps + 1}–{Math.min((page + 1) * ps, totalFiltered)} {txt.of} {totalFiltered}
                      </Text>
                      <InlineStack gap="200">
                        <Button size="slim" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>← {txt.back}</Button>
                        <Text variant="bodySm" tone="subdued">{txt.page} {page + 1} / {totalPages}</Text>
                        <Button size="slim" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>{txt.next} →</Button>
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
                <Text variant="headingMd" as="h2">{txt.payoutHistory}</Text>
              </div>
              {history.length === 0 ? (
                <Box padding="500">
                  <Text tone="subdued" alignment="center">{txt.noPayoutsYet}</Text>
                </Box>
              ) : (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "1.5fr 110px 110px 120px 100px", gap: 8, padding: "10px 20px", borderBottom: "1px solid #e5e7eb", fontSize: 11, fontWeight: 600, color: "#6b7280", background: "#fafafa" }}>
                    <div>{txt.periodCol}</div>
                    <div style={{ textAlign: "right" }}>{txt.revenueLabel}</div>
                    <div style={{ textAlign: "right" }}>{txt.commission}</div>
                    <div style={{ textAlign: "right" }}>{txt.payoutCol}</div>
                    <div style={{ textAlign: "center" }}>{txt.statusAll}</div>
                  </div>
                  {history.map((row, i) => (
                    <div key={row.id || i} style={{ display: "grid", gridTemplateColumns: "1.5fr 110px 110px 120px 100px", gap: 8, padding: "12px 20px", borderBottom: "1px solid #f3f4f6", fontSize: 13, alignItems: "center" }}>
                      <div>
                        <div style={{ color: "#111827", fontWeight: 500 }}>{fmtDate(row.period_start, locale)} – {fmtDate(row.period_end, locale)}</div>
                        {row.reference && (
                          <div style={{ fontSize: 11, color: "#9ca3af", fontFamily: "monospace" }}>{row.reference}</div>
                        )}
                      </div>
                      <div style={{ textAlign: "right" }}>{fmt(row.total_cents || 0, locale)}</div>
                      <div style={{ textAlign: "right", color: "#dc2626" }}>– {fmt(row.commission_cents != null ? row.commission_cents : Math.round((row.total_cents || 0) * commissionRate), locale)}</div>
                      <div style={{ textAlign: "right", fontWeight: 700, color: "#059669" }}>{fmt(row.payout_cents || 0, locale)}</div>
                      <div style={{ textAlign: "center" }}>
                        <Badge tone={statusTone(row.status)}>{statusLabel(row.status, locale)}</Badge>
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
                  <Text as="h2" variant="headingMd">{txt.bankDetails}</Text>
                  <Text as="p" tone="subdued" variant="bodySm">{txt.bankDetailsSub}</Text>
                </BlockStack>
                <Divider />
              </BlockStack>
            </Card>
            <Box paddingBlockStart="300">
              <IbanSection />
            </Box>

            <Box paddingBlockStart="300">
              <Card>
                <SellerCreditCardSection />
              </Card>
            </Box>
          </Box>

        </Layout.Section>
      </Layout>
    </Page>
  );
}

// ── Admin / Superuser Payments View ──────────────────────────────────────────
function AdminPaymentsView() {
  const locale = useLocale();
  const txt = getPaymentsCopy(locale);
  const [periodKey, setPeriodKey] = useState(() => initialPeriodKeyForToday(PERIODS));
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
          period_start: selectedPeriod.startDate,
          period_end: selectedPeriod.endDate,
        }),
        getMedusaAdminClient().getTransactions({
          include_pending: "true",
          period_start: selectedPeriod.startDate,
          period_end: selectedPeriod.endDate,
        }),
      ]);
      setSellers(overview?.sellers || []);
      setTxRows(tx?.transactions || []);
    } catch (e) {
      setErr(e?.message || txt.loadError);
    } finally {
      setLoading(false);
    }
  }, [selectedPeriod.startDate, selectedPeriod.endDate, txt.loadError]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleMarkPaid = async (seller) => {
    if (!(await confirmDelete(
      txt.markPaidConfirm(seller.store_name || seller.email)
    ))) return;
    setPaying(seller.seller_id);
    try {
      await getMedusaAdminClient().markPayoutPaid({
        seller_id: seller.seller_id,
        period_start: selectedPeriod.startDate,
        period_end: selectedPeriod.endDate,
        amount_cents: seller.payout_cents,
        reference: `${seller.seller_id}-${periodKey}`,
      });
      await loadData();
    } catch (e) {
      alert(e?.message || txt.genericError);
    } finally {
      setPaying(null);
    }
  };

  // Admin KPIs
  const totalRevenue    = sellers.reduce((s, x) => s + (x.total_cents || 0), 0);
  const totalCommission = sellers.reduce((s, x) => s + (x.commission_cents != null ? x.commission_cents : Math.round((x.total_cents || 0) * DEFAULT_COMMISSION_RATE)), 0);
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
    <Page title={txt.adminPageTitle}>
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
                <Text variant="headingMd" as="h2">{txt.periodTitle}</Text>
                <Text variant="bodySm" tone="subdued">{txt.adminPeriodSub}</Text>
              </BlockStack>
              <InlineStack gap="300" blockAlign="center">
                <div style={{ width: 300 }}>
                  <Select label="" labelHidden options={periodOptions} value={periodKey} onChange={setPeriodKey} />
                </div>
                <Button onClick={loadData} loading={loading} size="slim">{txt.refresh}</Button>
              </InlineStack>
            </InlineStack>
          </Card>

          {/* Global KPIs */}
          <Box paddingBlockStart="400">
            <Card>
              <BlockStack gap="400">
                <BlockStack gap="050">
                  <Text variant="headingMd" as="h2">{txt.platformFinance}</Text>
                  <Text variant="bodySm" tone="subdued">{selectedPeriod.label}</Text>
                </BlockStack>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
                  <KpiCard icon="📦" label={txt.platformRevenue} value={fmt(totalRevenue, locale)} sub={`${sellers.length} ${txt.activeSellers}`} />
                  <KpiCard icon="💰" label={txt.commissionEst} value={fmt(totalCommission, locale)} tone="success" sub={txt.platformIncome} highlight />
                  <KpiCard icon="💸" label={txt.toPayoutTotal} value={fmt(totalPayout, locale)} tone="critical" />
                  <KpiCard icon="✅" label={txt.alreadyPaid} value={fmt(totalPaid, locale)} tone="success" />
                  <KpiCard icon="⏳" label={txt.stillPending} value={fmt(totalPending, locale)} tone={totalPending > 0 ? "critical" : undefined} />
                </div>
              </BlockStack>
            </Card>
          </Box>

          {/* Per-seller payout table */}
          <Box paddingBlockStart="400">
            <Card padding="0">
              <div style={{ padding: "16px 20px", borderBottom: "1px solid #f3f4f6" }}>
                <Text variant="headingMd" as="h2">{txt.adminSellerPayouts(sellers.length)}</Text>
              </div>
              {loading ? (
                <Box padding="400"><Text tone="subdued">{txt.loading}</Text></Box>
              ) : sellers.length === 0 ? (
                <Box padding="500"><Text tone="subdued" alignment="center">{txt.noDataPeriod}</Text></Box>
              ) : (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "1.8fr 100px 100px 120px 130px 100px auto", gap: 8, padding: "10px 20px", borderBottom: "1px solid #e5e7eb", fontSize: 11, fontWeight: 600, color: "#6b7280", background: "#fafafa" }}>
                    <div>{txt.sellerCol}</div>
                    <div style={{ textAlign: "right" }}>{txt.revenueLabel}</div>
                    <div style={{ textAlign: "right" }}>{txt.commission}</div>
                    <div style={{ textAlign: "right" }}>{txt.payoutCol}</div>
                    <div>{txt.referenceCol}</div>
                    <div style={{ textAlign: "center" }}>{txt.colStatus}</div>
                    <div></div>
                  </div>
                  {sellers.map((seller, i) => {
                    const comm = seller.commission_cents != null ? seller.commission_cents : Math.round((seller.total_cents || 0) * DEFAULT_COMMISSION_RATE);
                    const reference = `${seller.seller_id}-${periodKey}`;
                    const isPaid = seller.status === "bezahlt" || seller.status === "paid";
                    return (
                      <div key={seller.seller_id || i} style={{ display: "grid", gridTemplateColumns: "1.8fr 100px 100px 120px 130px 100px auto", gap: 8, padding: "12px 20px", borderBottom: "1px solid #f3f4f6", alignItems: "center", background: isPaid ? "#f0fdf4" : "#fff" }}>
                        <div>
                          <Text variant="bodyMd" fontWeight="semibold">{seller.store_name || seller.email}</Text>
                          {seller.store_name && <Text variant="bodySm" tone="subdued">{seller.email}</Text>}
                          <Text variant="bodySm" tone="subdued">{txt.ordersCount(seller.order_count || 0)}</Text>
                        </div>
                        <div style={{ textAlign: "right", fontSize: 13 }}>{fmt(seller.total_cents || 0, locale)}</div>
                        <div style={{ textAlign: "right", fontSize: 13, color: "#059669", fontWeight: 600 }}>+{fmt(comm, locale)}</div>
                        <div style={{ textAlign: "right", fontSize: 13, fontWeight: 700, color: isPaid ? "#6b7280" : "#dc2626" }}>
                          {fmt(seller.payout_cents || 0, locale)}
                        </div>
                        <div>
                          <code style={{ fontSize: 11, background: "#f3f4f6", padding: "2px 5px", borderRadius: 4, color: "#374151", display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {reference}
                          </code>
                        </div>
                        <div style={{ textAlign: "center" }}>
                          <Badge tone={statusTone(seller.status)}>{statusLabel(seller.status, locale)}</Badge>
                        </div>
                        <div>
                          {!isPaid && (seller.payout_cents || 0) > 0 ? (
                            <Button size="slim" variant="primary" onClick={() => handleMarkPaid(seller)} loading={paying === seller.seller_id}>
                              {txt.markPaid}
                            </Button>
                          ) : isPaid ? (
                            <Text variant="bodySm" tone="success">✓ {seller.paid_at ? fmtDate(seller.paid_at, locale) : txt.paidLabel}</Text>
                          ) : (
                            <Text variant="bodySm" tone="subdued">{txt.noAmount}</Text>
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
                    <Text variant="headingMd" as="h2">{txt.ibanMonitorTitle}</Text>
                    <Text variant="bodySm" tone="subdued">{txt.ibanMonitorSub}</Text>
                  </BlockStack>
                  <InlineStack gap="200" wrap={false}>
                    {[
                      { k: "paid",    t: "success",   l: txt.paidLabel },
                      { k: "pending", t: "warning",   l: txt.pending },
                      { k: "processing", t: "info",   l: payoutStatusLabel(locale, "processing") },
                      { k: "failed",  t: "critical",  l: payoutStatusLabel(locale, "failed") },
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
                    label={txt.search}
                    labelHidden
                    value={monitorSearch}
                    onChange={setMonitorSearch}
                    placeholder={txt.adminSearchPlaceholder}
                    clearButton
                    onClearButtonClick={() => setMonitorSearch("")}
                    autoComplete="off"
                  />
                </div>
                <div style={{ width: 180 }}>
                  <Select
                    label={txt.colStatus}
                    labelHidden
                    options={[
                      { label: txt.statusAll, value: "all" },
                      { label: txt.pending, value: "pending" },
                      { label: payoutStatusLabel(locale, "processing"), value: "processing" },
                      { label: txt.paidLabel, value: "paid" },
                      { label: payoutStatusLabel(locale, "failed"), value: "failed" },
                    ]}
                    value={monitorStatus}
                    onChange={setMonitorStatus}
                  />
                </div>
              </div>

              {txRows.length === 0 ? (
                <Box padding="500"><Text tone="subdued" alignment="center">{txt.noDataInPeriod}</Text></Box>
              ) : (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "160px 1.2fr 1fr 100px 120px 1.2fr", gap: 8, padding: "10px 20px", borderBottom: "1px solid #e5e7eb", fontSize: 11, fontWeight: 600, color: "#6b7280", background: "#fafafa" }}>
                    <SortTh label={txt.colDate} col="created_at" sortCol={monitorSort} sortDir={monitorDir} onSort={handleMonitorSort} />
                    <div>{txt.orderCol}</div>
                    <div>{txt.sellerCol}</div>
                    <SortTh label={txt.payoutCol} col="payout_cents" sortCol={monitorSort} sortDir={monitorDir} onSort={handleMonitorSort} style={{ justifyContent: "flex-end" }} />
                    <div style={{ textAlign: "center" }}>{txt.colStatus}</div>
                    <div>{txt.payoutIdCol}</div>
                  </div>
                  {displayMonitor.map((t, i) => (
                    <div key={`${t.id || ""}-${i}`} style={{ display: "grid", gridTemplateColumns: "160px 1.2fr 1fr 100px 120px 1.2fr", gap: 8, padding: "11px 20px", borderBottom: "1px solid #f3f4f6", fontSize: 13, alignItems: "center" }}>
                      <div style={{ color: "#374151" }}>
                        <div>{fmtDate(t.created_at, locale)}</div>
                        {t.delivery_date && <div style={{ fontSize: 11, color: "#9ca3af" }}>{txt.deliveryShort}: {fmtDate(t.delivery_date, locale)}</div>}
                      </div>
                      <div>
                        <div style={{ fontWeight: 600 }}>#{t.order_number || t.id}</div>
                      </div>
                      <div style={{ color: "#374151" }}>{t.store_name || t.seller_id}</div>
                      <div style={{ textAlign: "right", fontWeight: 600 }}>{fmt(t.payout_cents || 0, locale)}</div>
                      <div style={{ textAlign: "center" }}>
                        <Badge tone={statusTone(t.stripe_payout_status)}>
                          {statusLabel(t.stripe_payout_status || "pending", locale)}
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
                      <Text variant="bodySm" tone="subdued" alignment="center">{txt.monitorHint}</Text>
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
  const locale = useLocale();
  const txt = getPaymentsCopy(locale);
  const [isSuperuser, setIsSuperuser] = useState(null);

  useEffect(() => {
    const su = typeof window !== "undefined" && localStorage.getItem("sellerIsSuperuser") === "true";
    setIsSuperuser(su);
  }, []);

  if (isSuperuser === null) {
    return (
      <Page title={txt.paymentsTitle}>
        <Box padding="400"><Text tone="subdued">{txt.loading}</Text></Box>
      </Page>
    );
  }

  // Superusers can also act as a seller (e.g. shipping their own orders and needing a saved
  // card for label charges), so they get their own IBAN/card section in addition to the
  // platform-wide payout monitor — not instead of it.
  if (isSuperuser) {
    return (
      <>
        <SellerPaymentsView />
        <AdminPaymentsView />
      </>
    );
  }
  return <SellerPaymentsView />;
}
