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
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [paying, setPaying] = useState(null);

  const selectedPeriod = PERIODS.find((p) => p.key === periodKey) || PERIODS[0];

  const loadData = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const res = await getMedusaAdminClient().getAdminPayoutOverview({
        period_start: selectedPeriod.start,
        period_end: selectedPeriod.end,
      });
      setSellers(res?.sellers || []);
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
