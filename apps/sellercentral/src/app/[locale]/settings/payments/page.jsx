"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Page, Layout, Card, Text, BlockStack, InlineStack,
  Button, Banner, Badge, Box, Select, TextField,
} from "@shopify/polaris";
import { useLocale } from "next-intl";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";
import { useUnsavedChanges } from "@/context/UnsavedChangesContext";
import SellerCreditCardSection from "@/components/SellerCreditCardSection";
import { confirmDelete } from "@/lib/confirm-delete";
import { fmtDateShort, fmtDateTimeShort, fmtMoney } from "@/lib/locale-text";
import { getPaymentsCopy, payoutStatusLabel } from "@/lib/payments-i18n";
import {
  generatePayoutPeriods,
  initialPayoutPeriodKey,
} from "@/lib/payout-periods";
import SellerPaymentsLedger from "@/components/pages/settings/SellerPaymentsLedger";

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

const PERIODS = generatePayoutPeriods(18);

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
  return (
    <Page title={txt.paymentsTitle}>
      <Layout>
        <Layout.Section>
          <SellerPaymentsLedger />
          <Box paddingBlockStart="400">
            <IbanSection />
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
  const [periodKey, setPeriodKey] = useState(() => initialPayoutPeriodKey(PERIODS));
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
