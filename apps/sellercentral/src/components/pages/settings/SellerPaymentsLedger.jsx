"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Card, Text, InlineStack, Button, Banner, Box, Select, TextField,
} from "@shopify/polaris";
import { useLocale } from "next-intl";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";
import { fmtDateShort, fmtMoney } from "@/lib/locale-text";
import { getPaymentsCopy, ledgerEntryLabel } from "@/lib/payments-i18n";
import {
  generatePayoutPeriods,
  initialPayoutPeriodKey,
  ALL_PAYOUT_PERIODS_KEY,
} from "@/lib/payout-periods";

const PERIODS = generatePayoutPeriods(18);

function amountColor(cents) {
  if (cents > 0) return "#059669";
  if (cents < 0) return "#dc2626";
  return "#111827";
}

export default function SellerPaymentsLedger() {
  const locale = useLocale();
  const txt = getPaymentsCopy(locale);
  const [periodKey, setPeriodKey] = useState(() => initialPayoutPeriodKey(PERIODS));
  const [entries, setEntries] = useState([]);
  const [balance, setBalance] = useState({ current_cents: 0, period_cents: 0 });
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [filterSearch, setFilterSearch] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [pageSize, setPageSize] = useState("50");
  const [page, setPage] = useState(0);

  const allTime = periodKey === ALL_PAYOUT_PERIODS_KEY;
  const selectedPeriod = allTime ? null : (PERIODS.find((p) => p.key === periodKey) || PERIODS[0]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const params = {};
      if (!allTime && selectedPeriod) {
        params.period_start = selectedPeriod.startDate;
        params.period_end = selectedPeriod.endDate;
      }
      const res = await getMedusaAdminClient().getSellerLedger(params);
      setEntries(Array.isArray(res?.entries) ? res.entries : []);
      setBalance({
        current_cents: Number(res?.balance?.current_cents || 0),
        period_cents: Number(res?.balance?.period_cents || 0),
      });
    } catch (e) {
      setErr(e?.message || txt.loadError);
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [allTime, selectedPeriod?.startDate, selectedPeriod?.endDate, txt.loadError]);

  useEffect(() => { loadData(); }, [loadData]);

  const displayRows = useMemo(() => {
    let rows = entries;
    if (filterSearch.trim()) {
      const q = filterSearch.toLowerCase();
      rows = rows.filter((e) =>
        String(e.order_number || "").toLowerCase().includes(q) ||
        ledgerEntryLabel(e, locale).toLowerCase().includes(q)
      );
    }
    if (filterType !== "all") rows = rows.filter((e) => e.type === filterType);
    return rows;
  }, [entries, filterSearch, filterType, locale]);

  const totalFiltered = displayRows.length;
  const ps = Number(pageSize) || 0;
  const paged = ps > 0 ? displayRows.slice(page * ps, page * ps + ps) : displayRows;
  const totalPages = ps > 0 ? Math.max(1, Math.ceil(totalFiltered / ps)) : 1;

  const periodOptions = [
    { label: txt.allPeriods, value: ALL_PAYOUT_PERIODS_KEY },
    ...PERIODS.map((p) => ({ label: p.label, value: p.key })),
  ];

  const exportCsv = () => {
    const csvEscape = (v) => {
      const s = v == null ? "" : String(v);
      if (/[",\n;]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
      return s;
    };
    const rows = [
      [txt.colDate, txt.colOrderNo, txt.colDescription, `${txt.colAmount} (€)`],
      ...displayRows.map((e) => [
        fmtDateShort(e.occurred_at, locale),
        e.order_number || "",
        ledgerEntryLabel(e, locale),
        ((e.amount_cents || 0) / 100).toFixed(2).replace(".", ","),
      ]),
    ];
    const csv = rows.map((r) => r.map(csvEscape).join(";")).join("\n");
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${txt.csvLedgerPrefix}-${allTime ? "all" : periodKey}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const currentCents = balance.current_cents;
  const periodCents = allTime ? currentCents : balance.period_cents;

  return (
    <>
      {err && (
        <Box paddingBlockEnd="400">
          <Banner tone="critical" onDismiss={() => setErr("")}>{err}</Banner>
        </Box>
      )}

      <Card>
        <InlineStack align="space-between" blockAlign="center" wrap>
          <InlineStack gap="200" blockAlign="center" wrap>
            <Text variant="headingMd" as="h2">{txt.periodTitle}</Text>
          </InlineStack>
          <InlineStack gap="200" blockAlign="center" wrap={false}>
            <div style={{ minWidth: 280 }}>
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

      <Box paddingBlockStart="400">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
          <div style={{
            flex: "1 1 220px", minWidth: 200, background: "#f0fdf4",
            borderRadius: 12, padding: "18px 20px", border: "1.5px solid #6ee7b7",
          }}>
            <Text variant="bodySm" tone="subdued">{txt.balance}</Text>
            <div style={{ fontSize: 26, fontWeight: 700, color: amountColor(currentCents), marginTop: 6, letterSpacing: "-0.4px" }}>
              {fmtMoney(currentCents, locale)}
            </div>
          </div>
          <div style={{
            flex: "1 1 220px", minWidth: 200, background: "#fff",
            borderRadius: 12, padding: "18px 20px", border: "1px solid #e5e7eb",
          }}>
            <Text variant="bodySm" tone="subdued">{allTime ? txt.allPeriods : txt.periodMovement}</Text>
            <div style={{ fontSize: 26, fontWeight: 700, color: amountColor(periodCents), marginTop: 6, letterSpacing: "-0.4px" }}>
              {fmtMoney(periodCents, locale)}
            </div>
            {!allTime && selectedPeriod && (
              <div style={{ marginTop: 4 }}>
                <Text variant="bodySm" tone="subdued">{selectedPeriod.label}</Text>
              </div>
            )}
          </div>
        </div>
      </Box>

      <Box paddingBlockStart="400">
        <Card padding="0">
          <div style={{ padding: "16px 20px", borderBottom: "1px solid #f3f4f6" }}>
            <InlineStack align="space-between" blockAlign="center">
              <Text variant="headingMd" as="h2">{txt.transactions}</Text>
              <InlineStack gap="200">
                {(filterSearch.trim() || filterType !== "all") && (
                  <Button size="slim" variant="plain" onClick={() => { setFilterSearch(""); setFilterType("all"); setPage(0); }}>
                    {txt.resetFilters}
                  </Button>
                )}
                <Button size="slim" onClick={exportCsv} disabled={displayRows.length === 0}>
                  {txt.csvExport}
                </Button>
              </InlineStack>
            </InlineStack>
          </div>

          <div style={{ padding: "12px 20px", borderBottom: "1px solid #f3f4f6", background: "#fafafa", display: "flex", gap: 12, flexWrap: "wrap" }}>
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
            <div style={{ width: 200 }}>
              <Select
                label={txt.typeAll}
                labelHidden
                options={[
                  { label: txt.typeAll, value: "all" },
                  { label: ledgerEntryLabel({ type: "order_received" }, locale), value: "order_received" },
                  { label: ledgerEntryLabel({ type: "commission", description_params: { rate_pct: 12 } }, locale), value: "commission" },
                  { label: ledgerEntryLabel({ type: "shipping_label" }, locale), value: "shipping_label" },
                  { label: ledgerEntryLabel({ type: "refund" }, locale), value: "refund" },
                  { label: ledgerEntryLabel({ type: "commission_refund" }, locale), value: "commission_refund" },
                  { label: ledgerEntryLabel({ type: "payout" }, locale), value: "payout" },
                ]}
                value={filterType}
                onChange={(v) => { setFilterType(v); setPage(0); }}
              />
            </div>
            <div style={{ width: 140 }}>
              <Select
                label={txt.entriesLabel}
                labelHidden
                options={[
                  { label: `50 ${txt.perPage}`, value: "50" },
                  { label: `100 ${txt.perPage}`, value: "100" },
                  { label: txt.showAll, value: "0" },
                ]}
                value={pageSize}
                onChange={(v) => { setPageSize(v); setPage(0); }}
              />
            </div>
          </div>

          {loading ? (
            <Box padding="500"><Text tone="subdued" alignment="center">{txt.loadingTransactions}</Text></Box>
          ) : displayRows.length === 0 ? (
            <Box padding="500"><Text tone="subdued" alignment="center">{txt.noLedger}</Text></Box>
          ) : (
            <>
              <div style={{
                display: "grid",
                gridTemplateColumns: "120px 120px 1fr 130px",
                gap: 8, padding: "10px 20px",
                borderBottom: "1px solid #e5e7eb",
                fontSize: 11, fontWeight: 600, color: "#6b7280", background: "#fafafa",
              }}>
                <div>{txt.colDate}</div>
                <div>{txt.colOrderNo}</div>
                <div>{txt.colDescription}</div>
                <div style={{ textAlign: "right" }}>{txt.colAmount}</div>
              </div>
              {paged.map((e, i) => {
                const cents = Number(e.amount_cents || 0);
                return (
                  <div
                    key={e.id || i}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "120px 120px 1fr 130px",
                      gap: 8, padding: "11px 20px",
                      borderBottom: "1px solid #f3f4f6",
                      fontSize: 13, alignItems: "center",
                      background: i % 2 === 0 ? "#fff" : "#fafafa",
                    }}
                  >
                    <div style={{ color: "#374151" }}>{fmtDateShort(e.occurred_at, locale)}</div>
                    <div style={{ fontWeight: 600, color: "#111827" }}>{e.order_number || "—"}</div>
                    <div style={{ color: "#374151" }}>
                      {ledgerEntryLabel(e, locale)}
                      {e.charge_method === "card" && (
                        <span style={{ marginLeft: 8, fontSize: 11, color: "#9ca3af" }}>{txt.chargedCard}</span>
                      )}
                    </div>
                    <div style={{ textAlign: "right", fontWeight: 700, color: amountColor(cents), fontVariantNumeric: "tabular-nums" }}>
                      {cents > 0 ? "+" : ""}{fmtMoney(cents, locale)}
                    </div>
                  </div>
                );
              })}
              <div style={{
                display: "grid",
                gridTemplateColumns: "120px 120px 1fr 130px",
                gap: 8, padding: "11px 20px",
                borderTop: "2px solid #e5e7eb",
                fontSize: 13, fontWeight: 700, background: "#f9fafb",
              }}>
                <div style={{ color: "#6b7280", fontSize: 11 }}>{txt.sum}</div>
                <div />
                <div />
                <div style={{ textAlign: "right", color: amountColor(periodCents), fontVariantNumeric: "tabular-nums" }}>
                  {fmtMoney(displayRows.filter((e) => e.affects_balance !== false).reduce((s, e) => s + Number(e.amount_cents || 0), 0), locale)}
                </div>
              </div>
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
    </>
  );
}
