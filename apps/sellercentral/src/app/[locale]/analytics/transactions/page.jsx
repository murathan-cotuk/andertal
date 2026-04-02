"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Page, Layout, Card, Text, BlockStack, InlineStack,
  Badge, Button, Banner, Box, Select, Divider,
} from "@shopify/polaris";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";

// ── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (cents, currency = "EUR") =>
  ((cents || 0) / 100).toLocaleString("de-DE", { style: "currency", currency });

const fmtDate = (d) => d ? new Date(d).toLocaleDateString("de-DE") : "—";

const COMMISSION_RATE = 0.10;

/** Generate 15-day settlement periods, newest first */
function generatePeriods(count = 14) {
  const periods = [];
  let year = new Date().getFullYear();
  let month = new Date().getMonth();
  for (let i = 0; i < count; i++) {
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    periods.push({
      label: `16.${String(month + 1).padStart(2, "0")}.${year} – ${daysInMonth}.${String(month + 1).padStart(2, "0")}.${year}`,
      start: new Date(year, month, 16).toISOString(),
      end: new Date(year, month, daysInMonth, 23, 59, 59).toISOString(),
      key: `${year}-${String(month + 1).padStart(2, "0")}-H2`,
    });
    periods.push({
      label: `01.${String(month + 1).padStart(2, "0")}.${year} – 15.${String(month + 1).padStart(2, "0")}.${year}`,
      start: new Date(year, month, 1).toISOString(),
      end: new Date(year, month, 15, 23, 59, 59).toISOString(),
      key: `${year}-${String(month + 1).padStart(2, "0")}-H1`,
    });
    month -= 1;
    if (month < 0) { month = 11; year -= 1; }
  }
  return periods;
}

const PERIODS = generatePeriods(14);

// ── Stat Box ──────────────────────────────────────────────────────────────────
function StatBox({ label, value, note, color }) {
  return (
    <div style={{
      flex: "1 1 140px", minWidth: 130,
      background: "#f9fafb", borderRadius: 10,
      padding: "13px 16px", border: "1px solid #f0f0f0",
    }}>
      <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: color || "#111827" }}>{value}</div>
      {note && <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>{note}</div>}
    </div>
  );
}

// ── SELLER VIEW ───────────────────────────────────────────────────────────────
function SellerTransactionsView({ sellerId }) {
  const [periodKey, setPeriodKey] = useState(PERIODS[0].key);
  const [tab, setTab] = useState("eligible"); // eligible | pending | payouts
  const [allTx, setAllTx] = useState([]);
  const [payouts, setPayouts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const selectedPeriod = PERIODS.find((p) => p.key === periodKey) || PERIODS[0];

  const loadData = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const client = getMedusaAdminClient();
      const [txRes, poRes] = await Promise.allSettled([
        client.getTransactions({ include_pending: "true" }),
        client.getPayouts(),
      ]);
      if (txRes.status === "fulfilled") setAllTx(txRes.value?.transactions || []);
      if (poRes.status === "fulfilled") setPayouts(poRes.value?.payouts || []);
    } catch (e) {
      setErr(e?.message || "Fehler beim Laden");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Filter by period (order date in period)
  const inPeriod = (tx) => {
    const d = new Date(tx.created_at);
    return d >= new Date(selectedPeriod.start) && d <= new Date(selectedPeriod.end);
  };

  const periodTx = allTx.filter(inPeriod);
  const eligible = periodTx.filter((tx) => tx.payout_eligible);
  const pending = periodTx.filter((tx) => !tx.payout_eligible);

  // Summary
  const totalRevenue = periodTx.reduce((s, t) => s + (t.total_cents || 0), 0);
  const totalCommission = eligible.reduce((s, t) => s + (t.commission_cents || 0), 0);
  const totalRefunds = periodTx.reduce((s, t) => s + (t.refund_cents || 0), 0);
  const totalShipping = periodTx.reduce((s, t) => s + (t.shipping_cents || 0), 0);
  const netPayout = eligible.reduce((s, t) => s + (t.payout_cents || 0), 0);

  const periodPayouts = payouts.filter((p) => {
    const s = new Date(p.period_start), e = new Date(p.period_end);
    const ps = new Date(selectedPeriod.start), pe = new Date(selectedPeriod.end);
    return s >= ps && e <= pe || (s <= pe && e >= ps);
  });
  const paidAmount = periodPayouts.filter((p) => p.status === "bezahlt" || p.status === "paid")
    .reduce((s, p) => s + (p.payout_cents || 0), 0);

  const periodOptions = PERIODS.map((p) => ({ label: p.label, value: p.key }));

  const tabBtn = (key, label, count) => (
    <button
      onClick={() => setTab(key)}
      style={{
        padding: "8px 18px", fontSize: 13, fontWeight: 600,
        border: "1px solid #e5e7eb",
        background: tab === key ? "#111827" : "#fff",
        color: tab === key ? "#fff" : "#374151",
        cursor: "pointer",
        borderRadius: key === "eligible" ? "8px 0 0 8px" : key === "payouts" ? "0 8px 8px 0" : "0",
        marginRight: -1,
      }}
    >{label}{count != null ? ` (${count})` : ""}</button>
  );

  return (
    <Page title="Transaktionen" subtitle="Ihre Umsätze, Provisionen und Auszahlungen">
      <Layout>
        <Layout.Section>
          {err && <Banner tone="critical" onDismiss={() => setErr("")}><Text>{err}</Text></Banner>}

          {/* Period + refresh */}
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
                <Text variant="headingMd" as="h2">Übersicht — {selectedPeriod.label}</Text>
                {loading ? (
                  <Text tone="subdued">Laden…</Text>
                ) : (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                    <StatBox label="Gesamtumsatz" value={fmt(totalRevenue)} note={`${periodTx.length} Bestellungen`} />
                    <StatBox label={`Provision (${(COMMISSION_RATE * 100).toFixed(0)}%)`} value={`– ${fmt(totalCommission)}`} color="#dc2626" note="Nur freigegebene" />
                    <StatBox label="Rückerstattungen" value={totalRefunds > 0 ? `– ${fmt(totalRefunds)}` : fmt(0)} color={totalRefunds > 0 ? "#dc2626" : undefined} />
                    <StatBox label="Versand (Beteiligung)" value={fmt(totalShipping)} />
                    <StatBox label="Freigegeben (netto)" value={fmt(netPayout)} color="#059669"
                      note={`${eligible.length} Bestellungen (14 Tage nach Lieferung)`} />
                    <StatBox
                      label="Ausgezahlt"
                      value={paidAmount > 0 ? fmt(paidAmount) : "—"}
                      color="#059669"
                      note={paidAmount > 0 ? "via Stripe" : "Noch ausstehend"}
                    />
                  </div>
                )}

                {!loading && netPayout > paidAmount && (
                  <div style={{ background: "#fefce8", border: "1px solid #fde68a", borderRadius: 8, padding: "10px 14px" }}>
                    <Text variant="bodySm">
                      <strong>Ausstehende Auszahlung:</strong> {fmt(netPayout - paidAmount)} — wird über Stripe überwiesen.{" "}
                      Verwendungszweck: <code style={{ background: "#fef9c3", padding: "1px 5px", borderRadius: 3, fontSize: 11 }}>
                        {sellerId}-{periodKey}
                      </code>
                    </Text>
                  </div>
                )}
              </BlockStack>
            </Card>
          </Box>

          {/* Tabs */}
          <Box paddingBlockStart="400">
            <div style={{ display: "flex", gap: 0, marginBottom: 16 }}>
              {tabBtn("eligible", "Freigegeben", eligible.length)}
              {tabBtn("pending", "Ausstehend", pending.length)}
              {tabBtn("payouts", "Auszahlungen", payouts.length)}
            </div>

            {tab === "eligible" && (
              <Card padding="0">
                <div style={{ padding: "12px 16px", borderBottom: "1px solid #f3f4f6", background: "#f0fdf4" }}>
                  <Text variant="bodySm" tone="success">
                    Diese Bestellungen wurden geliefert und sind älter als 14 Tage — sie kommen für die Auszahlung infrage.
                  </Text>
                </div>
                <TxTable rows={eligible} loading={loading} isSuperuser={false} />
              </Card>
            )}

            {tab === "pending" && (
              <Card padding="0">
                <div style={{ padding: "12px 16px", borderBottom: "1px solid #f3f4f6", background: "#fefce8" }}>
                  <Text variant="bodySm" tone="caution">
                    Diese Bestellungen sind noch nicht für eine Auszahlung freigegeben (Lieferung vor weniger als 14 Tagen oder noch nicht geliefert).
                  </Text>
                </div>
                <TxTable rows={pending} loading={loading} isSuperuser={false} />
              </Card>
            )}

            {tab === "payouts" && (
              <Card padding="0">
                <PayoutsTable payouts={payouts} loading={loading} isSuperuser={false} />
              </Card>
            )}
          </Box>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

// ── SUPERUSER VIEW ────────────────────────────────────────────────────────────
function AdminTransactionsView() {
  const [periodKey, setPeriodKey] = useState(PERIODS[0].key);
  const [tab, setTab] = useState("eligible");
  const [filterSeller, setFilterSeller] = useState("");
  const [allTx, setAllTx] = useState([]);
  const [summary, setSummary] = useState([]);
  const [payouts, setPayouts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [markingPaid, setMarkingPaid] = useState(null);

  const selectedPeriod = PERIODS.find((p) => p.key === periodKey) || PERIODS[0];

  const loadData = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const client = getMedusaAdminClient();
      const [txRes, poRes] = await Promise.allSettled([
        client.getTransactions({ include_pending: "true" }),
        client.getPayouts(),
      ]);
      if (txRes.status === "fulfilled") {
        setAllTx(txRes.value?.transactions || []);
        setSummary(txRes.value?.summary || []);
      }
      if (poRes.status === "fulfilled") setPayouts(poRes.value?.payouts || []);
    } catch (e) {
      setErr(e?.message || "Fehler");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const inPeriod = (tx) => {
    const d = new Date(tx.created_at);
    return d >= new Date(selectedPeriod.start) && d <= new Date(selectedPeriod.end);
  };

  const periodTx = allTx.filter(inPeriod).filter((tx) => !filterSeller || tx.seller_id === filterSeller);
  const eligible = periodTx.filter((tx) => tx.payout_eligible);
  const pending = periodTx.filter((tx) => !tx.payout_eligible);

  // Aggregate stats
  const totalRevenue = periodTx.reduce((s, t) => s + (t.total_cents || 0), 0);
  const totalCommission = eligible.reduce((s, t) => s + (t.commission_cents || 0), 0);
  const totalPayout = eligible.reduce((s, t) => s + (t.payout_cents || 0), 0);

  // Per-seller summary for this period
  const perSeller = {};
  periodTx.forEach((tx) => {
    if (!perSeller[tx.seller_id]) {
      perSeller[tx.seller_id] = { seller_id: tx.seller_id, store_name: tx.store_name || tx.seller_id, total: 0, commission: 0, payout: 0, orders: 0, eligibleOrders: 0 };
    }
    perSeller[tx.seller_id].total += tx.total_cents || 0;
    perSeller[tx.seller_id].orders += 1;
    if (tx.payout_eligible) {
      perSeller[tx.seller_id].commission += tx.commission_cents || 0;
      perSeller[tx.seller_id].payout += tx.payout_cents || 0;
      perSeller[tx.seller_id].eligibleOrders += 1;
    }
  });

  const sellerList = Object.values(perSeller);

  const sellerOptions = [
    { label: "Alle Seller", value: "" },
    ...summary.map((s) => ({ label: s.store_name || s.seller_id, value: s.seller_id })),
  ];

  const periodOptions = PERIODS.map((p) => ({ label: p.label, value: p.key }));

  const handleMarkPaid = async (s) => {
    if (!confirm(`Auszahlung für "${s.store_name}" als bezahlt markieren? Betrag: ${fmt(s.payout)}`)) return;
    setMarkingPaid(s.seller_id);
    try {
      await getMedusaAdminClient().createPayout({
        seller_id: s.seller_id,
        period_start: selectedPeriod.start,
        period_end: selectedPeriod.end,
        total_cents: s.total,
        commission_cents: s.commission,
        payout_cents: s.payout,
        notes: `${s.seller_id}-${periodKey}`,
      });
      await loadData();
    } catch (e) {
      alert(e?.message || "Fehler");
    } finally {
      setMarkingPaid(null);
    }
  };

  // Is this seller already paid for this period?
  const isPaidForPeriod = (sellerId) =>
    payouts.some((p) => {
      const matches = p.seller_id === sellerId && (p.status === "bezahlt" || p.status === "paid");
      const ps = new Date(p.period_start), pe = new Date(p.period_end);
      const overlapStart = new Date(selectedPeriod.start), overlapEnd = new Date(selectedPeriod.end);
      return matches && ps <= overlapEnd && pe >= overlapStart;
    });

  const tabBtn = (key, label, count) => (
    <button
      onClick={() => setTab(key)}
      style={{
        padding: "8px 18px", fontSize: 13, fontWeight: 600,
        border: "1px solid #e5e7eb",
        background: tab === key ? "#111827" : "#fff",
        color: tab === key ? "#fff" : "#374151",
        cursor: "pointer",
        borderRadius: key === "eligible" ? "8px 0 0 8px" : key === "payouts" ? "0 8px 8px 0" : "0",
        marginRight: -1,
      }}
    >{label}{count != null ? ` (${count})` : ""}</button>
  );

  return (
    <Page title="Transaktionen (Admin)" subtitle="Seller-Umsätze, Provisionen und Auszahlungsverwaltung">
      <Layout>
        <Layout.Section>
          {err && <Banner tone="critical" onDismiss={() => setErr("")}><Text>{err}</Text></Banner>}

          {/* Period + Seller filter */}
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between" blockAlign="center">
                <Text variant="headingMd" as="h2">Abrechnungszeitraum</Text>
                <Button onClick={loadData} loading={loading} size="slim">Aktualisieren</Button>
              </InlineStack>
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                <div style={{ flex: "1 1 260px", maxWidth: 340 }}>
                  <Select label="Zeitraum" options={periodOptions} value={periodKey} onChange={setPeriodKey} />
                </div>
                <div style={{ flex: "1 1 200px", maxWidth: 280 }}>
                  <Select label="Seller" options={sellerOptions} value={filterSeller} onChange={setFilterSeller} />
                </div>
              </div>
            </BlockStack>
          </Card>

          {/* Global summary */}
          <Box paddingBlockStart="400">
            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd" as="h2">Gesamtübersicht — {selectedPeriod.label}</Text>
                {loading ? <Text tone="subdued">Laden…</Text> : (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                    <StatBox label="Plattform-Umsatz" value={fmt(totalRevenue)} note={`${periodTx.length} Bestellungen gesamt`} />
                    <StatBox label="Provision (Einnahmen)" value={fmt(totalCommission)} color="#059669" note={`${eligible.length} qualifiziert`} />
                    <StatBox label="Auszuzahlen (gesamt)" value={fmt(totalPayout)} color="#dc2626" note="An alle Seller" />
                    <StatBox label="Noch ausstehend" value={fmt(pending.reduce((s, t) => s + (t.total_cents || 0), 0))} note={`${pending.length} Bestellungen`} />
                  </div>
                )}
              </BlockStack>
            </Card>
          </Box>

          {/* Per-seller breakdown */}
          {!filterSeller && sellerList.length > 0 && (
            <Box paddingBlockStart="400">
              <Card padding="0">
                <div style={{ padding: "14px 18px", borderBottom: "1px solid #f3f4f6" }}>
                  <Text variant="headingMd" as="h2">Seller-Übersicht — {selectedPeriod.label}</Text>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1.5fr 100px 100px 110px 80px auto", gap: 8, padding: "9px 16px", borderBottom: "1px solid #f3f4f6", fontSize: 12, fontWeight: 600, color: "#6b7280" }}>
                  <div>Seller</div>
                  <div style={{ textAlign: "right" }}>Umsatz</div>
                  <div style={{ textAlign: "right" }}>Provision</div>
                  <div style={{ textAlign: "right" }}>Auszahlung</div>
                  <div style={{ textAlign: "center" }}>Status</div>
                  <div></div>
                </div>
                {sellerList.map((s, i) => {
                  const paid = isPaidForPeriod(s.seller_id);
                  return (
                    <div key={s.seller_id} style={{ display: "grid", gridTemplateColumns: "1.5fr 100px 100px 110px 80px auto", gap: 8, padding: "11px 16px", borderBottom: i < sellerList.length - 1 ? "1px solid #f9fafb" : "none", alignItems: "center" }}>
                      <div>
                        <Text variant="bodyMd" fontWeight="semibold">{s.store_name}</Text>
                        <Text variant="bodySm" tone="subdued">{s.orders} Best. · {s.eligibleOrders} freigegeben</Text>
                        <div style={{ fontSize: 11, color: "#9ca3af", fontFamily: "monospace" }}>{s.seller_id}-{periodKey}</div>
                      </div>
                      <div style={{ textAlign: "right", fontSize: 13 }}>{fmt(s.total)}</div>
                      <div style={{ textAlign: "right", fontSize: 13, color: "#059669", fontWeight: 600 }}>+{fmt(s.commission)}</div>
                      <div style={{ textAlign: "right", fontSize: 13, fontWeight: 700, color: paid ? "#6b7280" : "#dc2626" }}>{fmt(s.payout)}</div>
                      <div style={{ textAlign: "center" }}>
                        <Badge tone={paid ? "success" : s.payout > 0 ? "warning" : "new"}>
                          {paid ? "Bezahlt" : s.payout > 0 ? "Offen" : "—"}
                        </Badge>
                      </div>
                      <div>
                        {!paid && s.payout > 0 && (
                          <Button size="slim" variant="primary" loading={markingPaid === s.seller_id}
                            onClick={() => handleMarkPaid(s)}>
                            Bezahlt via Stripe
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </Card>
            </Box>
          )}

          {/* Tabs: transactions list + payouts */}
          <Box paddingBlockStart="400">
            <div style={{ display: "flex", gap: 0, marginBottom: 16 }}>
              {tabBtn("eligible", "Freigegeben", eligible.length)}
              {tabBtn("pending", "Ausstehend", pending.length)}
              {tabBtn("payouts", "Auszahlungshistorie", payouts.length)}
            </div>

            {tab === "eligible" && (
              <Card padding="0">
                <div style={{ padding: "12px 16px", borderBottom: "1px solid #f3f4f6", background: "#f0fdf4" }}>
                  <Text variant="bodySm" tone="success">
                    Bestellungen, die geliefert und älter als 14 Tage sind — auszahlungsbereit.
                  </Text>
                </div>
                <TxTable rows={eligible} loading={loading} isSuperuser />
              </Card>
            )}
            {tab === "pending" && (
              <Card padding="0">
                <div style={{ padding: "12px 16px", borderBottom: "1px solid #f3f4f6", background: "#fefce8" }}>
                  <Text variant="bodySm" tone="caution">
                    Noch nicht auszahlungsbereit (Lieferung &lt; 14 Tage oder noch nicht geliefert).
                  </Text>
                </div>
                <TxTable rows={pending} loading={loading} isSuperuser />
              </Card>
            )}
            {tab === "payouts" && (
              <Card padding="0">
                <PayoutsTable payouts={payouts} loading={loading} isSuperuser onRefresh={loadData} />
              </Card>
            )}
          </Box>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

// ── Shared transaction rows table ─────────────────────────────────────────────
function TxTable({ rows, loading, isSuperuser }) {
  if (loading) return <Box padding="500"><Text tone="subdued" alignment="center">Laden…</Text></Box>;
  if (!rows.length) return (
    <Box padding="500">
      <Text tone="subdued" alignment="center">Keine Transaktionen in diesem Zeitraum.</Text>
    </Box>
  );

  const cols = isSuperuser
    ? "1.2fr 100px 90px 90px 90px 90px 90px"
    : "1.5fr 90px 90px 90px 90px 90px";

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: cols, gap: 8, padding: "9px 16px", borderBottom: "1px solid #f3f4f6", fontSize: 12, fontWeight: 600, color: "#6b7280" }}>
        <div>Bestellung</div>
        {isSuperuser && <div>Seller</div>}
        <div style={{ textAlign: "right" }}>Umsatz</div>
        <div style={{ textAlign: "right" }}>Versand</div>
        <div style={{ textAlign: "right" }}>Provision</div>
        <div style={{ textAlign: "right" }}>Netto</div>
        <div style={{ textAlign: "right" }}>Lieferung</div>
      </div>
      {rows.map((tx) => (
        <div key={tx.id} style={{ display: "grid", gridTemplateColumns: cols, gap: 8, padding: "10px 16px", borderBottom: "1px solid #f9fafb", fontSize: 13, alignItems: "center" }}>
          <div>
            <div style={{ fontWeight: 600, color: "#111827" }}>#{tx.order_number}</div>
            <div style={{ fontSize: 11, color: "#9ca3af" }}>{tx.first_name} {tx.last_name}</div>
          </div>
          {isSuperuser && <div style={{ fontSize: 12, color: "#6b7280" }}>{tx.store_name || "—"}</div>}
          <div style={{ textAlign: "right" }}>{fmt(tx.total_cents, tx.currency)}</div>
          <div style={{ textAlign: "right", color: "#6b7280" }}>{fmt(tx.shipping_cents || 0, tx.currency)}</div>
          <div style={{ textAlign: "right", color: "#ef4444" }}>−{fmt(tx.commission_cents, tx.currency)}</div>
          <div style={{ textAlign: "right", color: "#10b981", fontWeight: 600 }}>{fmt(tx.payout_cents, tx.currency)}</div>
          <div style={{ textAlign: "right", color: "#6b7280", fontSize: 12 }}>{fmtDate(tx.delivery_date)}</div>
        </div>
      ))}
    </div>
  );
}

// ── Shared payouts table ──────────────────────────────────────────────────────
function PayoutsTable({ payouts, loading, isSuperuser, onRefresh }) {
  const [markingPaid, setMarkingPaid] = useState(null);

  const doMarkPaid = async (p) => {
    if (!confirm("Diesen Eintrag als bezahlt markieren?")) return;
    setMarkingPaid(p.id);
    try {
      await getMedusaAdminClient().updatePayout(p.id, { status: "bezahlt" });
      onRefresh?.();
    } catch (e) { alert(e?.message || "Fehler"); }
    finally { setMarkingPaid(null); }
  };

  const tone = (s) => {
    if (s === "bezahlt" || s === "paid") return "success";
    if (s === "offen" || s === "pending") return "warning";
    return "info";
  };
  const label = (s) => ({ bezahlt: "Bezahlt", paid: "Bezahlt", offen: "Offen", pending: "Offen" }[s] || s || "—");

  if (loading) return <Box padding="500"><Text tone="subdued" alignment="center">Laden…</Text></Box>;
  if (!payouts.length) return (
    <Box padding="500">
      <Text tone="subdued" alignment="center">Noch keine Auszahlungen vorhanden.</Text>
    </Box>
  );

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: isSuperuser ? "1.4fr 100px 110px 110px 80px 90px auto" : "1.4fr 110px 110px 80px", gap: 8, padding: "9px 16px", borderBottom: "1px solid #f3f4f6", fontSize: 12, fontWeight: 600, color: "#6b7280" }}>
        <div>Zeitraum / Referenz</div>
        {isSuperuser && <div>Seller</div>}
        <div style={{ textAlign: "right" }}>Umsatz</div>
        <div style={{ textAlign: "right" }}>Auszahlung</div>
        <div style={{ textAlign: "center" }}>Status</div>
        {isSuperuser && <div style={{ textAlign: "right" }}>Bezahlt am</div>}
        {isSuperuser && <div></div>}
      </div>
      {payouts.map((p, i) => (
        <div key={p.id || i} style={{ display: "grid", gridTemplateColumns: isSuperuser ? "1.4fr 100px 110px 110px 80px 90px auto" : "1.4fr 110px 110px 80px", gap: 8, padding: "11px 16px", borderBottom: "1px solid #f9fafb", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 12, color: "#374151" }}>{fmtDate(p.period_start)} – {fmtDate(p.period_end)}</div>
            {p.notes && <code style={{ fontSize: 11, color: "#9ca3af", fontFamily: "monospace" }}>{p.notes}</code>}
          </div>
          {isSuperuser && <div style={{ fontSize: 12, color: "#374151" }}>{p.store_name || p.seller_id || "—"}</div>}
          <div style={{ textAlign: "right", fontSize: 13 }}>{fmt(p.total_cents)}</div>
          <div style={{ textAlign: "right", fontSize: 13, fontWeight: 700, color: "#059669" }}>{fmt(p.payout_cents)}</div>
          <div style={{ textAlign: "center" }}><Badge tone={tone(p.status)}>{label(p.status)}</Badge></div>
          {isSuperuser && <div style={{ textAlign: "right", fontSize: 12, color: "#6b7280" }}>{p.paid_at ? fmtDate(p.paid_at) : "—"}</div>}
          {isSuperuser && (
            <div>
              {(p.status !== "bezahlt" && p.status !== "paid") && (
                <Button size="slim" variant="primary" loading={markingPaid === p.id} onClick={() => doMarkPaid(p)}>
                  Bezahlt
                </Button>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Entry Point ───────────────────────────────────────────────────────────────
export default function TransactionsPageWrapper() {
  const [isSuperuser, setIsSuperuser] = useState(null);
  const [sellerId, setSellerId] = useState("");

  useEffect(() => {
    const su = typeof window !== "undefined" && localStorage.getItem("sellerIsSuperuser") === "true";
    const sid = typeof window !== "undefined" ? (localStorage.getItem("sellerId") || "") : "";
    setIsSuperuser(su);
    setSellerId(sid);
  }, []);

  if (isSuperuser === null) {
    return <Page title="Transaktionen"><Box padding="400"><Text tone="subdued">Laden…</Text></Box></Page>;
  }

  return isSuperuser
    ? <AdminTransactionsView />
    : <SellerTransactionsView sellerId={sellerId} />;
}
