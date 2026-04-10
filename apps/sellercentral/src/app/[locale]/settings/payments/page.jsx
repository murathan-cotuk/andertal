"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Page, Layout, Card, Text, BlockStack, InlineStack,
  Button, Banner, Badge, Box, Select,
} from "@shopify/polaris";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";

// ── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (cents) =>
  (cents / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" });

const fmtDate = (d) => d ? new Date(d).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—";
const fmtDateTime = (d) => d ? new Date(d).toLocaleString("de-DE") : "—";

const csvEscape = (v) => {
  const s = v == null ? "" : String(v);
  if (/[",\n;]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
};

/** Generate the last N 15-day settlement periods, newest first */
function generatePeriods(count = 12) {
  const periods = [];
  // Periods: 1st-15th and 16th-end-of-month
  const now = new Date();
  let year = now.getFullYear();
  let month = now.getMonth(); // 0-indexed

  for (let i = 0; i < count; i++) {
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    // Second half: 16 → end
    periods.push({
      label: `16.${String(month + 1).padStart(2, "0")}.${year} – ${daysInMonth}.${String(month + 1).padStart(2, "0")}.${year}`,
      start: new Date(year, month, 16).toISOString(),
      end: new Date(year, month, daysInMonth, 23, 59, 59).toISOString(),
      key: `${year}-${String(month + 1).padStart(2, "0")}-2`,
    });
    // First half: 1 → 15
    periods.push({
      label: `01.${String(month + 1).padStart(2, "0")}.${year} – 15.${String(month + 1).padStart(2, "0")}.${year}`,
      start: new Date(year, month, 1).toISOString(),
      end: new Date(year, month, 15, 23, 59, 59).toISOString(),
      key: `${year}-${String(month + 1).padStart(2, "0")}-1`,
    });
    // Go to previous month
    month -= 1;
    if (month < 0) { month = 11; year -= 1; }
  }
  return periods;
}

const PERIODS = generatePeriods(12);
const COMMISSION_RATE = 0.12;

// Badge color for payout status
const statusTone = (s) => {
  if (s === "bezahlt" || s === "paid") return "success";
  if (s === "ausstehend" || s === "pending") return "warning";
  if (s === "verarbeitung" || s === "processing") return "info";
  return "new";
};

const statusLabel = (s) => {
  const map = { bezahlt: "Bezahlt", paid: "Bezahlt", ausstehend: "Ausstehend", pending: "Ausstehend", processing: "In Verarbeitung", verarbeitung: "In Verarbeitung" };
  return map[s] || s || "Offen";
};

// ── Stat Card ─────────────────────────────────────────────────────────────────
function StatBox({ label, value, sub, tone }) {
  return (
    <div style={{ flex: 1, minWidth: 140, background: "#f9fafb", borderRadius: 10, padding: "14px 18px", border: "1px solid #f3f4f6" }}>
      <Text variant="bodySm" tone="subdued">{label}</Text>
      <div style={{ fontSize: 22, fontWeight: 700, color: tone === "success" ? "#059669" : tone === "critical" ? "#dc2626" : "#111827", marginTop: 4 }}>
        {value}
      </div>
      {sub && <Text variant="bodySm" tone="subdued">{sub}</Text>}
    </div>
  );
}

// ── IBAN Helpers ──────────────────────────────────────────────────────────────
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

// ── IBAN Management Card ───────────────────────────────────────────────────────
function IbanSection({ commissionRate }) {
  const client = getMedusaAdminClient();
  const sellerPct = Math.round((1 - (commissionRate ?? 0.12)) * 100);
  const platformPct = 100 - sellerPct;

  const [loading, setLoading]       = useState(true);
  const [saving, setSaving]         = useState(false);
  const [editing, setEditing]       = useState(false);
  const [err, setErr]               = useState("");
  const [ok, setOk]                 = useState("");
  const [ibanError, setIbanError]   = useState("");
  const [stripeConnect, setStripeConnect] = useState(null);

  const [savedIban, setSavedIban]           = useState("");
  const [savedHolder, setSavedHolder]       = useState("");
  const [savedBic, setSavedBic]             = useState("");
  const [savedBankName, setSavedBankName]   = useState("");

  const [iban, setIban]             = useState("");
  const [holder, setHolder]         = useState("");
  const [bic, setBic]               = useState("");
  const [bankName, setBankName]     = useState("");

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
      } catch (_) {}
      try {
        const sc = await client.stripeConnectStatus();
        setStripeConnect(sc || null);
      } catch (_) {}
      finally { setLoading(false); }
    })();
  }, [client]);

  const handleSave = async () => {
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
      setOk("Bankdaten gespeichert."); setEditing(false);
    } catch (e) { setErr(e?.message || "Fehler beim Speichern."); }
    finally { setSaving(false); }
  };

  const handleCancel = () => {
    setIban(savedIban); setHolder(savedHolder); setBic(savedBic); setBankName(savedBankName);
    setIbanError(""); setErr(""); setEditing(false);
  };

  if (loading) return null;

  return (
    <Box paddingBlockEnd="400">
      {ok  && <Box paddingBlockEnd="300"><Banner tone="success" onDismiss={() => setOk("")}>{ok}</Banner></Box>}
      {err && <Box paddingBlockEnd="300"><Banner tone="critical" onDismiss={() => setErr("")}>{err}</Banner></Box>}

      {/* How payouts work */}
      <Box paddingBlockEnd="400">
        <div style={{ background: "#f9fafb", borderRadius: 12, border: "1px solid #f3f4f6", padding: "20px 24px" }}>
          <BlockStack gap="300">
            <Text as="p" variant="bodyMd" fontWeight="semibold">💳 So funktionieren Auszahlungen</Text>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
              {[
                { n: "1", label: "Kunde kauft", desc: "Zahlung geht über Stripe." },
                { n: "2", label: "Sperrfrist", desc: "Auszahlung wird nach Lieferung +14 Tagen freigegeben." },
                { n: "3", label: "Auszahlung", desc: stripeConnect?.onboarding_complete ? "Stripe Connect zahlt automatisch auf dein verbundenes Bankkonto aus." : "Bitte Stripe Connect Onboarding abschließen, damit Auszahlungen laufen." },
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

      {stripeConnect?.connected && (
        <Box paddingBlockEnd="300">
          <Banner tone={stripeConnect?.onboarding_complete ? "success" : "warning"}>
            {stripeConnect?.onboarding_complete
              ? "Stripe Connect ist aktiv. Auszahlungen laufen über das bei Stripe hinterlegte Bankkonto."
              : "Stripe Connect verbunden, aber Onboarding noch unvollständig. Bitte unter Settings > Stripe Connect abschließen."}
          </Banner>
        </Box>
      )}

      {stripeConnect?.payout_bank?.last4 && (
        <Box paddingBlockEnd="300">
          <Card>
            <BlockStack gap="100">
              <Text as="h3" variant="headingSm">Stripe-Auszahlungskonto (synchronisiert)</Text>
              <Text as="p" variant="bodySm">Bank: {stripeConnect.payout_bank.bank_name || "—"}</Text>
              <Text as="p" variant="bodySm">Kontoinhaber: {stripeConnect.payout_bank.holder_name || "—"}</Text>
              <Text as="p" variant="bodySm">Letzte 4: {`•••• ${stripeConnect.payout_bank.last4}`}</Text>
              <Text as="p" variant="bodySm">Land / Währung: {`${(stripeConnect.payout_bank.country || "—").toUpperCase()} / ${(stripeConnect.payout_bank.currency || "—").toUpperCase()}`}</Text>
            </BlockStack>
          </Card>
        </Box>
      )}

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

          {/* Saved display */}
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

          {/* Edit form */}
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

// ── SELLER VIEW ───────────────────────────────────────────────────────────────
function SellerPaymentsView() {
  const [periodKey, setPeriodKey] = useState(PERIODS[0].key);
  const [summary, setSummary] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [transactions, setTransactions] = useState([]);

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
      if (txRes && txRes.status === "fulfilled") {
        setTransactions(Array.isArray(txRes.value?.transactions) ? txRes.value.transactions : []);
      } else {
        setTransactions([]);
      }
    } catch (e) {
      setErr(e?.message || "Fehler beim Laden");
    } finally {
      setLoading(false);
    }
  }, [periodKey]);

  useEffect(() => { loadData(); }, [loadData]);

  const revenue = summary?.total_cents ?? 0;
  const commission = Math.round(revenue * COMMISSION_RATE);
  const shipping = summary?.shipping_cents ?? 0;
  const refunds = summary?.refund_cents ?? 0;
  const net = revenue - commission - refunds + shipping;
  const payoutStatus = summary?.status || null;
  const selectedStartTs = new Date(selectedPeriod.start).getTime();
  const selectedEndTs = new Date(selectedPeriod.end).getTime();
  const periodTransactions = transactions.filter((t) => {
    const byDelivery = t?.delivery_date ? new Date(t.delivery_date).getTime() : NaN;
    const byCreated = t?.created_at ? new Date(t.created_at).getTime() : NaN;
    const ts = Number.isFinite(byDelivery) ? byDelivery : byCreated;
    return Number.isFinite(ts) && ts >= selectedStartTs && ts <= selectedEndTs;
  });

  const exportTransactionsCsv = () => {
    const rows = [
      [
        "order_number",
        "created_at",
        "delivery_date",
        "customer",
        "currency",
        "gross_revenue_cents",
        "commission_rate",
        "commission_cents",
        "payout_cents",
        "shipping_cents",
        "discount_cents",
        "payout_eligible",
      ],
      ...periodTransactions.map((t) => [
        t.order_number || "",
        t.created_at || "",
        t.delivery_date || "",
        [t.first_name, t.last_name].filter(Boolean).join(" ").trim(),
        t.currency || "EUR",
        t.total_cents || 0,
        t.commission_rate || 0,
        t.commission_cents || 0,
        t.payout_cents || 0,
        t.shipping_cents || 0,
        t.discount_cents || 0,
        t.payout_eligible ? "yes" : "no",
      ]),
    ];
    const csv = rows.map((r) => r.map(csvEscape).join(";")).join("\n");
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `transactions-${selectedPeriod.key}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const periodOptions = PERIODS.map((p) => ({ label: p.label, value: p.key }));

  return (
    <Page title="Zahlungen & Auszahlungen">
      <Layout>
        <Layout.Section>
          {err && <Banner tone="critical" onDismiss={() => setErr("")}><Text>{err}</Text></Banner>}

          {/* Period selector */}
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between" blockAlign="center">
                <Text variant="headingMd" as="h2">Abrechnungszeitraum</Text>
                <Button onClick={loadData} loading={loading} size="slim">Aktualisieren</Button>
              </InlineStack>
              <div style={{ maxWidth: 340 }}>
                <Select
                  label="Zeitraum auswählen"
                  options={periodOptions}
                  value={periodKey}
                  onChange={setPeriodKey}
                />
              </div>
            </BlockStack>
          </Card>

          {/* Summary stats */}
          <Box paddingBlockStart="400">
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between" blockAlign="center">
                  <Text variant="headingMd" as="h2">Übersicht — {selectedPeriod.label}</Text>
                  {payoutStatus && (
                    <Badge tone={statusTone(payoutStatus)}>{statusLabel(payoutStatus)}</Badge>
                  )}
                </InlineStack>
                {loading ? (
                  <Text tone="subdued">Laden…</Text>
                ) : (
                  <>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
                      <StatBox label="Gesamtumsatz (brutto)" value={fmt(revenue)} />
                      <StatBox label={`Provision (${(COMMISSION_RATE * 100).toFixed(0)} %)`} value={`– ${fmt(commission)}`} tone="critical" />
                      <StatBox label="Rückerstattungen" value={refunds > 0 ? `– ${fmt(refunds)}` : fmt(0)} tone={refunds > 0 ? "critical" : undefined} />
                      <StatBox label="Versandkostenbeteiligung" value={fmt(shipping)} />
                      <StatBox label="Netto-Auszahlung" value={fmt(Math.max(0, net))} tone="success"
                        sub="(Lieferbestätigte Bestellungen > 14 Tage)" />
                    </div>
                    {summary === null && (
                      <Banner tone="info">
                        <Text>Für diesen Zeitraum liegen noch keine Daten vor.</Text>
                      </Banner>
                    )}
                    {net > 0 && payoutStatus !== "bezahlt" && (
                      <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, padding: "12px 16px" }}>
                        <Text variant="bodySm">
                          <strong>Verwendungszweck (Stripe):</strong>{" "}
                          <code style={{ background: "#e0f2fe", padding: "2px 6px", borderRadius: 4, fontSize: 12 }}>
                            {typeof window !== "undefined" ? localStorage.getItem("sellerId") || "SELLER_ID" : "SELLER_ID"}
                            -{selectedPeriod.key}
                          </code>
                        </Text>
                        <Text variant="bodySm" tone="subdued">Die Auszahlung erfolgt über Stripe. Keine IBAN-Angabe notwendig.</Text>
                      </div>
                    )}
                  </>
                )}
              </BlockStack>
            </Card>
          </Box>

          {/* Payout history */}
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
                  <div style={{ display: "grid", gridTemplateColumns: "1.5fr 110px 110px 110px 90px", gap: 8, padding: "10px 16px", borderBottom: "1px solid #f3f4f6", fontSize: 12, fontWeight: 600, color: "#6b7280" }}>
                    <div>Zeitraum</div>
                    <div style={{ textAlign: "right" }}>Umsatz</div>
                    <div style={{ textAlign: "right" }}>Provision</div>
                    <div style={{ textAlign: "right" }}>Auszahlung</div>
                    <div style={{ textAlign: "center" }}>Status</div>
                  </div>
                  {history.map((p, i) => (
                    <div key={p.id || i} style={{ display: "grid", gridTemplateColumns: "1.5fr 110px 110px 110px 90px", gap: 8, padding: "11px 16px", borderBottom: "1px solid #f9fafb", fontSize: 13, alignItems: "center" }}>
                      <div>
                        <div style={{ fontSize: 12, color: "#374151" }}>
                          {fmtDate(p.period_start)} – {fmtDate(p.period_end)}
                        </div>
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

          {/* Detailed transactions */}
          <Box paddingBlockStart="400">
            <Card padding="0">
              <div style={{ padding: "16px 20px", borderBottom: "1px solid #f3f4f6" }}>
                <InlineStack align="space-between" blockAlign="center">
                  <Text variant="headingMd" as="h2">Transaktionen (Bestellungen / Rückgaben)</Text>
                  <Button size="slim" onClick={exportTransactionsCsv} disabled={periodTransactions.length === 0}>
                    CSV export
                  </Button>
                </InlineStack>
              </div>
              {periodTransactions.length === 0 ? (
                <Box padding="500">
                  <Text tone="subdued" alignment="center">Bu dönem için transaction girdisi yok.</Text>
                </Box>
              ) : (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "1.4fr 120px 120px 120px 90px 90px", gap: 8, padding: "10px 16px", borderBottom: "1px solid #f3f4f6", fontSize: 12, fontWeight: 600, color: "#6b7280" }}>
                    <div>Bestellung</div>
                    <div style={{ textAlign: "right" }}>Umsatz</div>
                    <div style={{ textAlign: "right" }}>Provision</div>
                    <div style={{ textAlign: "right" }}>Netto</div>
                    <div style={{ textAlign: "right" }}>Rabatt</div>
                    <div style={{ textAlign: "center" }}>Status</div>
                  </div>
                  {periodTransactions.map((t, i) => (
                    <div key={`${t.id || ""}-${i}`} style={{ display: "grid", gridTemplateColumns: "1.4fr 120px 120px 120px 90px 90px", gap: 8, padding: "11px 16px", borderBottom: "1px solid #f9fafb", fontSize: 13, alignItems: "center" }}>
                      <div>
                        <div style={{ fontWeight: 600 }}>{t.order_number || t.id}</div>
                        <div style={{ color: "#6b7280", fontSize: 12 }}>{[t.first_name, t.last_name].filter(Boolean).join(" ") || "—"}</div>
                        <div style={{ color: "#9ca3af", fontSize: 11 }}>
                          Oluşturma: {fmtDateTime(t.created_at)} | Teslim: {fmtDate(t.delivery_date)}
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>{fmt(t.total_cents || 0)}</div>
                      <div style={{ textAlign: "right", color: "#dc2626" }}>- {fmt(t.commission_cents || 0)}</div>
                      <div style={{ textAlign: "right", fontWeight: 700, color: "#059669" }}>{fmt(t.payout_cents || 0)}</div>
                      <div style={{ textAlign: "right" }}>{fmt(t.discount_cents || 0)}</div>
                      <div style={{ textAlign: "center" }}>
                        <Badge tone={t.payout_eligible ? "success" : "warning"}>
                          {t.payout_eligible ? "Eligible" : "Pending"}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </Card>
          </Box>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

// ── SUPERUSER / ADMIN VIEW ────────────────────────────────────────────────────
function AdminPaymentsView() {
  const [periodKey, setPeriodKey] = useState(PERIODS[0].key);
  const [sellers, setSellers] = useState([]);
  const [txRows, setTxRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [paying, setPaying] = useState(null);

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
  }, [periodKey]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleMarkPaid = async (seller) => {
    if (!confirm(
      `Auszahlung für "${seller.store_name || seller.email}" als extern überwiesen markieren?\n\n` +
      `Hinweis: Bu adım ödeme göndermez. Önce gerçek transferi yapın, sonra status'u "bezahlt" yapın.`
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

  const totalRevenue = sellers.reduce((s, x) => s + (x.total_cents || 0), 0);
  const totalCommission = sellers.reduce((s, x) => s + Math.round((x.total_cents || 0) * COMMISSION_RATE), 0);
  const totalPayout = sellers.reduce((s, x) => s + (x.payout_cents || 0), 0);
  const totalPaid = sellers.filter((s) => s.status === "bezahlt" || s.status === "paid").reduce((acc, x) => acc + (x.payout_cents || 0), 0);
  const totalPending = totalPayout - totalPaid;
  const txByTransferStatus = txRows.reduce((acc, t) => {
    const k = String(t?.stripe_transfer_status || "unknown");
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {});

  const periodOptions = PERIODS.map((p) => ({ label: p.label, value: p.key }));

  return (
    <Page title="Zahlungen & Auszahlungen (Admin)">
      <Layout>
        <Layout.Section>
          {err && <Banner tone="critical" onDismiss={() => setErr("")}><Text>{err}</Text></Banner>}

          {/* Period selector */}
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between" blockAlign="center">
                <Text variant="headingMd" as="h2">Abrechnungszeitraum</Text>
                <Button onClick={loadData} loading={loading} size="slim">Aktualisieren</Button>
              </InlineStack>
              <div style={{ maxWidth: 340 }}>
                <Select
                  label="Zeitraum auswählen"
                  options={periodOptions}
                  value={periodKey}
                  onChange={setPeriodKey}
                />
              </div>
            </BlockStack>
          </Card>

          {/* Global summary */}
          <Box paddingBlockStart="400">
            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd" as="h2">Gesamtübersicht — {selectedPeriod.label}</Text>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
                  <StatBox label="Plattform-Umsatz (gesamt)" value={fmt(totalRevenue)} />
                  <StatBox label={`Provision (${(COMMISSION_RATE * 100).toFixed(0)} %)`} value={fmt(totalCommission)} tone="success" />
                  <StatBox label="Auszuzahlen (gesamt)" value={fmt(totalPayout)} tone="critical" />
                  <StatBox label="Bereits bezahlt" value={fmt(totalPaid)} tone="success" />
                  <StatBox label="Noch ausstehend" value={fmt(totalPending)} tone={totalPending > 0 ? "critical" : undefined} />
                </div>
              </BlockStack>
            </Card>
          </Box>

          {/* Per-seller table */}
          <Box paddingBlockStart="400">
            <Card padding="0">
              <div style={{ padding: "16px 20px", borderBottom: "1px solid #f3f4f6" }}>
                <Text variant="headingMd" as="h2">Seller-Auszahlungen ({sellers.length})</Text>
              </div>

              {loading ? (
                <Box padding="400"><Text tone="subdued">Laden…</Text></Box>
              ) : sellers.length === 0 ? (
                <Box padding="500">
                  <Text tone="subdued" alignment="center">Für diesen Zeitraum liegen keine Daten vor.</Text>
                </Box>
              ) : (
                <>
                  {/* Header */}
                  <div style={{ display: "grid", gridTemplateColumns: "1.8fr 100px 100px 110px 120px 90px auto", gap: 8, padding: "10px 16px", borderBottom: "1px solid #f3f4f6", fontSize: 12, fontWeight: 600, color: "#6b7280" }}>
                    <div>Seller</div>
                    <div style={{ textAlign: "right" }}>Umsatz</div>
                    <div style={{ textAlign: "right" }}>Provision</div>
                    <div style={{ textAlign: "right" }}>Auszahlung</div>
                    <div>Verwendungszweck</div>
                    <div style={{ textAlign: "center" }}>Status</div>
                    <div></div>
                  </div>
                  {sellers.map((seller, i) => {
                    const commission = Math.round((seller.total_cents || 0) * COMMISSION_RATE);
                    const reference = `${seller.seller_id}-${periodKey}`;
                    const isPaid = seller.status === "bezahlt" || seller.status === "paid";
                    return (
                      <div key={seller.seller_id || i} style={{ display: "grid", gridTemplateColumns: "1.8fr 100px 100px 110px 120px 90px auto", gap: 8, padding: "12px 16px", borderBottom: "1px solid #f9fafb", alignItems: "center" }}>
                        <div>
                          <Text variant="bodyMd" fontWeight="semibold">{seller.store_name || seller.email}</Text>
                          {seller.store_name && <Text variant="bodySm" tone="subdued">{seller.email}</Text>}
                          <Text variant="bodySm" tone="subdued">{seller.order_count || 0} Bestellungen</Text>
                        </div>
                        <div style={{ textAlign: "right", fontSize: 13 }}>{fmt(seller.total_cents || 0)}</div>
                        <div style={{ textAlign: "right", fontSize: 13, color: "#059669", fontWeight: 600 }}>+{fmt(commission)}</div>
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
                            <Button
                              size="slim"
                              variant="primary"
                              onClick={() => handleMarkPaid(seller)}
                              loading={paying === seller.seller_id}
                            >
                              Als überwiesen markieren
                            </Button>
                          ) : isPaid ? (
                            <Text variant="bodySm" tone="subdued">✓ Bezahlt{seller.paid_at ? ` ${fmtDate(seller.paid_at)}` : ""}</Text>
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

          <Box paddingBlockStart="400">
            <Card padding="0">
              <div style={{ padding: "16px 20px", borderBottom: "1px solid #f3f4f6" }}>
                <InlineStack align="space-between" blockAlign="center">
                  <Text variant="headingMd" as="h2">Stripe Transfer Monitor</Text>
                  <InlineStack gap="200">
                    <Badge tone="success">completed: {txByTransferStatus.completed || 0}</Badge>
                    <Badge tone="warning">pending: {txByTransferStatus.pending || 0}</Badge>
                    <Badge tone="attention">waiting_onboarding: {txByTransferStatus.waiting_onboarding || 0}</Badge>
                    <Badge tone="critical">failed: {txByTransferStatus.failed || 0}</Badge>
                  </InlineStack>
                </InlineStack>
              </div>
              {txRows.length === 0 ? (
                <Box padding="500">
                  <Text tone="subdued" alignment="center">Keine Transferdaten im Zeitraum.</Text>
                </Box>
              ) : (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1.1fr 110px 130px 150px 1.4fr", gap: 8, padding: "10px 16px", borderBottom: "1px solid #f3f4f6", fontSize: 12, fontWeight: 600, color: "#6b7280" }}>
                    <div>Order</div>
                    <div>Seller</div>
                    <div style={{ textAlign: "right" }}>Payout</div>
                    <div>Status</div>
                    <div>Transfer ID</div>
                    <div>Fehler</div>
                  </div>
                  {txRows.slice(0, 200).map((t, i) => (
                    <div key={`${t.id || ""}-${i}`} style={{ display: "grid", gridTemplateColumns: "1.2fr 1.1fr 110px 130px 150px 1.4fr", gap: 8, padding: "11px 16px", borderBottom: "1px solid #f9fafb", fontSize: 13, alignItems: "center" }}>
                      <div>
                        <div style={{ fontWeight: 600 }}>#{t.order_number || t.id}</div>
                        <div style={{ color: "#6b7280", fontSize: 12 }}>Teslim: {fmtDate(t.delivery_date)}</div>
                      </div>
                      <div>{t.store_name || t.seller_id}</div>
                      <div style={{ textAlign: "right" }}>{fmt(t.payout_cents || 0)}</div>
                      <div>
                        <Badge tone={
                          t.stripe_transfer_status === "completed" ? "success" :
                          t.stripe_transfer_status === "failed" ? "critical" :
                          t.stripe_transfer_status === "waiting_onboarding" ? "attention" : "warning"
                        }>
                          {String(t.stripe_transfer_status || "pending")}
                        </Badge>
                      </div>
                      <div>
                        <code style={{ fontSize: 11, background: "#f3f4f6", padding: "2px 5px", borderRadius: 4, color: "#374151" }}>
                          {t.stripe_transfer_id || "—"}
                        </code>
                      </div>
                      <div style={{ color: "#b91c1c", fontSize: 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {t.stripe_transfer_error || "—"}
                      </div>
                    </div>
                  ))}
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
