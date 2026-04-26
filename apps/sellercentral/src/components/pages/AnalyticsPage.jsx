"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  InlineStack,
  Box,
  Banner,
  Button,
  DataTable,
  Badge,
  Icon,
  SkeletonBodyText,
  SkeletonDisplayText,
} from "@shopify/polaris";
import {
  MoneyIcon,
  OrderIcon,
  ChartLineIcon,
  PersonIcon,
} from "@shopify/polaris-icons";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";

// ─── Constants ───────────────────────────────────────────────────────────────

const BRAND = "#ff971c";

const DATE_RANGES = [
  { label: "Diese Woche", value: "this_week" },
  { label: "Letzten 7 Tage", value: "last_7" },
  { label: "Diesen Monat", value: "this_month" },
  { label: "Letzten 30 Tage", value: "last_30" },
  { label: "Letztes Jahr", value: "last_year" },
  { label: "Gesamt", value: "all" },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtEur(cents) {
  const val = (Number(cents || 0) / 100).toLocaleString("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `€ ${val}`;
}

function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function fmtShortDate(d) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });
}

function getDateRange(rangeKey) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let start;
  let end;
  let prevStart;
  let prevEnd;

  if (rangeKey === "this_week") {
    const dow = (today.getDay() + 6) % 7;
    start = new Date(today);
    start.setDate(today.getDate() - dow);
    end = new Date(today);
    end.setDate(start.getDate() + 6);
    const length = end - start;
    prevEnd = new Date(start.getTime() - 1);
    prevStart = new Date(prevEnd.getTime() - length);
  } else if (rangeKey === "last_7") {
    start = new Date(today);
    start.setDate(today.getDate() - 6);
    end = new Date(today);
    prevEnd = new Date(start.getTime() - 1);
    prevStart = new Date(prevEnd.getTime() - 6 * 86400000);
  } else if (rangeKey === "this_month") {
    start = new Date(today.getFullYear(), today.getMonth(), 1);
    end = new Date(today);
    const length = end - start;
    prevEnd = new Date(start.getTime() - 1);
    prevStart = new Date(prevEnd.getTime() - length);
  } else if (rangeKey === "last_30") {
    start = new Date(today);
    start.setDate(today.getDate() - 29);
    end = new Date(today);
    prevEnd = new Date(start.getTime() - 1);
    prevStart = new Date(prevEnd.getTime() - 29 * 86400000);
  } else if (rangeKey === "last_year") {
    start = new Date(today.getFullYear() - 1, today.getMonth(), today.getDate());
    end = new Date(today);
    const length = end - start;
    prevEnd = new Date(start.getTime() - 1);
    prevStart = new Date(prevEnd.getTime() - length);
  } else {
    start = new Date("2020-01-01");
    end = new Date(today);
    prevStart = null;
    prevEnd = null;
  }

  return { start, end, prevStart, prevEnd };
}

function filterByRange(orders, start, end) {
  return orders.filter((o) => {
    const d = new Date(o.created_at);
    return d >= start && d <= new Date(end.getTime() + 86399999);
  });
}

function isRevenueCounted(o) {
  return o.payment_status === "bezahlt" || o.order_status !== "storniert";
}

function calcStats(orders) {
  const revenue = orders
    .filter(isRevenueCounted)
    .reduce((s, o) => s + Number(o.total_cents || 0), 0);
  const count = orders.length;
  const avg = count > 0 ? revenue / count : 0;
  const emails = new Set(orders.map((o) => (o.email || "").toLowerCase().trim()).filter(Boolean));
  return { revenue, count, avg, customers: emails.size };
}

function trendPct(curr, prev) {
  if (prev === 0 && curr === 0) return null;
  if (prev === 0) return curr > 0 ? 100 : null;
  return Math.round(((curr - prev) / Math.abs(prev)) * 100);
}

function groupByDay(orders, start, end) {
  const days = [];
  const d = new Date(start);
  const endTs = new Date(end.getTime() + 86399999);
  while (d <= endTs) {
    days.push({
      date: new Date(d),
      label: fmtShortDate(d),
      revenue: 0,
    });
    d.setDate(d.getDate() + 1);
  }

  for (const o of orders) {
    if (!isRevenueCounted(o)) continue;
    const od = new Date(o.created_at);
    od.setHours(0, 0, 0, 0);
    const entry = days.find((day) => {
      const dd = new Date(day.date);
      dd.setHours(0, 0, 0, 0);
      return dd.getTime() === od.getTime();
    });
    if (entry) entry.revenue += Number(o.total_cents || 0);
  }

  if (days.length > 60) {
    const weeks = [];
    for (let i = 0; i < days.length; i += 7) {
      const chunk = days.slice(i, i + 7);
      weeks.push({
        date: chunk[0].date,
        label: chunk[0].label,
        revenue: chunk.reduce((s, x) => s + x.revenue, 0),
      });
    }
    return weeks;
  }

  return days;
}

function statusToneOrder(value) {
  const v = String(value || "");
  if (["storniert", "retoure"].some((s) => v.includes(s))) return "critical";
  if (["bezahlt", "abgeschlossen", "zugestellt", "versendet"].some((s) => v.includes(s))) return "success";
  if (v === "in_bearbeitung") return "info";
  return "attention";
}

function statusTonePayment(value) {
  const v = String(value || "");
  if (v.includes("erstattet") || v === "storniert" || v === "refunded") return "critical";
  if (v === "bezahlt" || v === "paid") return "success";
  if (v === "offen" || v === "pending") return "warning";
  return "attention";
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function TrendInline({ pct }) {
  if (pct === null || pct === undefined) {
    return (
      <Text as="span" variant="bodySm" tone="subdued">
        —
      </Text>
    );
  }
  const positive = pct >= 0;
  return (
    <InlineStack gap="200" blockAlign="center" wrap>
      <Text as="span" variant="bodySm" fontWeight="semibold" tone={positive ? "success" : "critical"}>
        {positive ? "▲" : "▼"} {Math.abs(pct)}%
      </Text>
      <Text as="span" tone="subdued" variant="bodySm">
        vs. Vorperiode
      </Text>
    </InlineStack>
  );
}

function KpiCardPolaris({ label, value, trend, source }) {
  return (
    <Card padding="400">
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <BlockStack gap="200">
          <Text as="p" variant="bodySm" fontWeight="semibold" tone="subdued">
            {label}
          </Text>
          <Text as="p" variant="headingLg">
            {value}
          </Text>
          <TrendInline pct={trend} />
        </BlockStack>
        <Box
          background="bg-surface-secondary"
          padding="200"
          borderRadius="200"
        >
          <Icon source={source} tone="subdued" />
        </Box>
      </div>
    </Card>
  );
}

function KpiSkeleton() {
  return (
    <Card padding="400">
      <BlockStack gap="200">
        <SkeletonBodyText lines={1} />
        <SkeletonDisplayText size="small" maxWidth="120px" />
        <SkeletonBodyText lines={1} />
      </BlockStack>
    </Card>
  );
}

function BarChart({ data, title }) {
  const W = 900;
  const H = 260;
  const padL = 64;
  const padR = 16;
  const padT = 16;
  const padB = 48;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;

  const maxRev = Math.max(...data.map((d) => d.revenue), 1);
  const magnitude = 10 ** Math.floor(Math.log10(maxRev / 100));
  const niceMax = Math.ceil((maxRev / 100) / magnitude) * magnitude;
  const yTicks = 5;
  const barCount = data.length;
  const barGap = barCount > 30 ? 1 : barCount > 14 ? 2 : 4;
  const barW = Math.max(2, chartW / barCount - barGap);
  const maxLabels = 12;
  const labelStep = Math.ceil(barCount / maxLabels);

  return (
    <BlockStack gap="300">
      <Text as="h2" variant="headingMd">
        {title}
      </Text>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: "100%", height: "auto", display: "block" }}
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden
      >
        {Array.from({ length: yTicks + 1 }, (_, i) => {
          const val = (niceMax * i) / yTicks;
          const y = padT + chartH - (i / yTicks) * chartH;
          const label =
            val >= 100
              ? `€${val.toLocaleString("de-DE", { maximumFractionDigits: 0 })}`
              : `€${val.toFixed(0)}`;
          return (
            <g key={i}>
              <line
                x1={padL}
                x2={padL + chartW}
                y1={y}
                y2={y}
                stroke={i === 0 ? "var(--p-color-border)" : "var(--p-color-border-secondary)"}
                strokeWidth={i === 0 ? 1.5 : 1}
              />
              <text x={padL - 8} y={y + 4} textAnchor="end" fontSize={10} fill="var(--p-color-text-secondary)">
                {label}
              </text>
            </g>
          );
        })}

        {data.map((row, i) => {
          const barH = (row.revenue / 100 / niceMax) * chartH;
          const x = padL + (i / barCount) * chartW + barGap / 2;
          const y = padT + chartH - barH;
          const showLabel = i % labelStep === 0 || i === barCount - 1;
          return (
            <g key={i}>
              {barH > 0 && (
                <rect
                  x={x}
                  y={y}
                  width={barW}
                  height={barH}
                  rx={barCount > 30 ? 1 : 3}
                  fill={BRAND}
                  opacity={0.92}
                />
              )}
              {barH === 0 && <rect x={x} y={padT + chartH - 2} width={barW} height={2} fill="var(--p-color-border)" />}
              {showLabel && (
                <text
                  x={x + barW / 2}
                  y={padT + chartH + 16}
                  textAnchor="middle"
                  fontSize={9}
                  fill="var(--p-color-text-secondary)"
                  transform={barCount > 20 ? `rotate(-35, ${x + barW / 2}, ${padT + chartH + 16})` : undefined}
                >
                  {row.label}
                </text>
              )}
            </g>
          );
        })}

        <line
          x1={padL}
          x2={padL + chartW}
          y1={padT + chartH}
          y2={padT + chartH}
          stroke="var(--p-color-border)"
          strokeWidth={1.5}
        />
      </svg>
    </BlockStack>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const t = useTranslations("nav");
  const router = useRouter();
  const [isSuperuser, setIsSuperuser] = useState(false);
  const [range, setRange] = useState("last_30");
  const [allOrders, setAllOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setIsSuperuser(localStorage.getItem("sellerIsSuperuser") === "true");
  }, []);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const client = getMedusaAdminClient();
      const data = await client.request("/admin-hub/v1/orders?limit=500&sort=created_at_desc");
      setAllOrders(Array.isArray(data?.orders) ? data.orders : []);
    } catch (e) {
      setError(e?.message || "Fehler beim Laden der Bestellungen");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  const { start, end, prevStart, prevEnd } = useMemo(() => getDateRange(range), [range]);

  const currentOrders = useMemo(() => {
    if (range === "all") return allOrders;
    return filterByRange(allOrders, start, end);
  }, [allOrders, range, start, end]);

  const previousOrders = useMemo(() => {
    if (!prevStart || !prevEnd) return [];
    return filterByRange(allOrders, prevStart, prevEnd);
  }, [allOrders, prevStart, prevEnd]);

  const currStats = useMemo(() => calcStats(currentOrders), [currentOrders]);
  const prevStats = useMemo(() => calcStats(previousOrders), [previousOrders]);

  const trends = useMemo(
    () => ({
      revenue: trendPct(currStats.revenue, prevStats.revenue),
      count: trendPct(currStats.count, prevStats.count),
      avg: trendPct(currStats.avg, prevStats.avg),
      customers: trendPct(currStats.customers, prevStats.customers),
    }),
    [currStats, prevStats]
  );

  const chartData = useMemo(() => {
    if (range === "all" && allOrders.length > 0) {
      const dates = allOrders.map((o) => new Date(o.created_at)).filter((d) => !Number.isNaN(d.getTime()));
      const minDate = new Date(Math.min(...dates));
      minDate.setHours(0, 0, 0, 0);
      const maxDate = new Date();
      maxDate.setHours(0, 0, 0, 0);
      return groupByDay(allOrders, minDate, maxDate);
    }
    if (!start || !end) return [];
    return groupByDay(currentOrders, start, end);
  }, [currentOrders, range, allOrders, start, end]);

  const recentOrders = useMemo(
    () =>
      [...currentOrders]
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        .slice(0, 10),
    [currentOrders]
  );

  const topByRevenue = useMemo(() => {
    const map = new Map();
    for (const o of currentOrders) {
      if (!isRevenueCounted(o)) continue;
      const name = [o.first_name, o.last_name].filter(Boolean).join(" ") || o.email || `#${o.order_number || o.id}`;
      const key = o.email || name;
      if (!map.has(key)) map.set(key, { name, revenue: 0, count: 0 });
      const entry = map.get(key);
      entry.revenue += Number(o.total_cents || 0);
      entry.count += 1;
    }
    return [...map.values()]
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);
  }, [currentOrders]);

  const selectedRangeLabel = DATE_RANGES.find((r) => r.value === range)?.label || "";

  const orderTableRows = useMemo(() => {
    if (!recentOrders.length) {
      return [];
    }
    return recentOrders.map((o) => {
      const name = [o.first_name, o.last_name].filter(Boolean).join(" ") || o.email || "—";
      return [
        `#${o.order_number || o.id?.slice(-6) || "—"}`,
        fmtDate(o.created_at),
        name,
        fmtEur(o.total_cents),
        <Badge key={`os-${o.id}`} tone={statusToneOrder(o.order_status)}>{o.order_status || "—"}</Badge>,
        <Badge key={`ps-${o.id}`} tone={statusTonePayment(o.payment_status)}>{o.payment_status || "—"}</Badge>,
        <Button
          key={`ac-${o.id}`}
          variant="plain"
          size="slim"
          onClick={() => o.id && router.push(`/orders/${o.id}`)}
        >
          Öffnen
        </Button>,
      ];
    });
  }, [recentOrders, router]);

  if (loading && allOrders.length === 0) {
    return (
      <Page title={t("reports")} subtitle={t("reportsSubtitle")}>
        <Layout>
          <Layout.Section>
            <BlockStack gap="400">
              <InlineStack gap="200" wrap>
                {DATE_RANGES.map((r) => (
                  <Button key={r.value} size="slim" variant="tertiary" disabled>
                    {r.label}
                  </Button>
                ))}
              </InlineStack>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                  gap: 16,
                }}
              >
                <KpiSkeleton />
                <KpiSkeleton />
                <KpiSkeleton />
                <KpiSkeleton />
              </div>
              <Card>
                <BlockStack gap="200">
                  <SkeletonDisplayText size="small" maxWidth="200px" />
                  <div style={{ height: 220, background: "var(--p-color-bg-surface-secondary)", borderRadius: 8 }} />
                </BlockStack>
              </Card>
            </BlockStack>
          </Layout.Section>
        </Layout>
      </Page>
    );
  }

  return (
    <Page
      title={t("reports")}
      subtitle={isSuperuser ? t("reportsSubtitleAllSellers") : t("reportsSubtitle")}
      secondaryActions={[
        { content: "Aktualisieren", onAction: loadOrders, disabled: loading },
      ]}
    >
      <Layout>
        {error && (
          <Layout.Section>
            <Banner tone="critical" onDismiss={() => setError("")} action={{ content: "Erneut versuchen", onAction: loadOrders }}>
              {error}
            </Banner>
          </Layout.Section>
        )}

        <Layout.Section>
          <BlockStack gap="400">
            <InlineStack gap="200" wrap>
              {DATE_RANGES.map((r) => (
                <Button
                  key={r.value}
                  size="slim"
                  variant={range === r.value ? "primary" : "tertiary"}
                  onClick={() => setRange(r.value)}
                >
                  {r.label}
                </Button>
              ))}
            </InlineStack>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: 16,
              }}
            >
              {loading ? (
                <>
                  <KpiSkeleton />
                  <KpiSkeleton />
                  <KpiSkeleton />
                  <KpiSkeleton />
                </>
              ) : (
                <>
                  <KpiCardPolaris
                    label="Umsatz"
                    value={fmtEur(currStats.revenue)}
                    trend={trends.revenue}
                    source={MoneyIcon}
                  />
                  <KpiCardPolaris
                    label="Bestellungen"
                    value={currStats.count.toLocaleString("de-DE")}
                    trend={trends.count}
                    source={OrderIcon}
                  />
                  <KpiCardPolaris
                    label="Ø Bestellwert"
                    value={fmtEur(currStats.avg)}
                    trend={trends.avg}
                    source={ChartLineIcon}
                  />
                  <KpiCardPolaris
                    label="Kunden (E-Mails)"
                    value={currStats.customers.toLocaleString("de-DE")}
                    trend={trends.customers}
                    source={PersonIcon}
                  />
                </>
              )}
            </div>
          </BlockStack>
        </Layout.Section>

        <Layout.Section>
          <Card>
            {loading ? (
              <div style={{ height: 220, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Text as="p" tone="subdued" variant="bodySm">
                  Diagramm wird geladen…
                </Text>
              </div>
            ) : chartData.length === 0 ? (
              <BlockStack gap="200">
                <Text as="h2" variant="headingMd">Umsatzverlauf</Text>
                <Text as="p" tone="subdued">Keine Daten für den gewählten Zeitraum</Text>
              </BlockStack>
            ) : (
              <BarChart data={chartData} title={`Tagesumsatz — ${selectedRangeLabel}`} />
            )}
          </Card>
        </Layout.Section>

        <Layout.Section>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))",
              gap: 20,
              alignItems: "start",
            }}
          >
            <Card>
              <BlockStack gap="400">
                <InlineStack blockAlign="center" align="space-between" wrap>
                  <Text as="h2" variant="headingMd">Letzte Bestellungen</Text>
                  <Text as="p" variant="bodySm" tone="subdued">{currentOrders.length} gesamt</Text>
                </InlineStack>
                {loading ? (
                  <SkeletonBodyText lines={6} />
                ) : recentOrders.length === 0 ? (
                  <Text as="p" tone="subdued" alignment="center">Keine Bestellungen im gewählten Zeitraum</Text>
                ) : (
                  <DataTable
                    columnContentTypes={["text", "text", "text", "numeric", "text", "text", "text"]}
                    headings={["Nr.", "Datum", "Kunde", "Betrag", "Auftrag", "Zahlung", ""]}
                    rows={orderTableRows}
                  />
                )}
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="400">
                <BlockStack gap="100">
                  <Text as="h2" variant="headingMd">Top Kunden</Text>
                  <Text as="p" variant="bodySm" tone="subdued">Nach Umsatz im Zeitraum</Text>
                </BlockStack>
                {loading ? (
                  <SkeletonBodyText lines={5} />
                ) : topByRevenue.length === 0 ? (
                  <Text as="p" tone="subdued" alignment="center">Keine Daten verfügbar</Text>
                ) : (
                  <BlockStack gap="300">
                    {topByRevenue.map((item, idx) => {
                      const maxRev = topByRevenue[0]?.revenue || 1;
                      const pct = Math.round((item.revenue / maxRev) * 100);
                      return (
                        <BlockStack key={item.name} gap="200">
                          <InlineStack blockAlign="center" align="space-between" wrap={false} gap="200">
                            <InlineStack gap="200" blockAlign="center" wrap={false}>
                              <div
                                style={{
                                  minWidth: 24,
                                  minHeight: 24,
                                  borderRadius: 9999,
                                  background: idx === 0 ? BRAND : "var(--p-color-bg-surface-secondary)",
                                  color: idx === 0 ? "#fff" : "var(--p-color-text)",
                                  display: "inline-flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  fontSize: 12,
                                  fontWeight: 700,
                                }}
                              >
                                {idx + 1}
                              </div>
                              <Text as="p" variant="bodyMd" fontWeight="medium" truncate>
                                {item.name}
                              </Text>
                            </InlineStack>
                            <BlockStack gap="100" inlineAlign="end">
                              <Text as="p" variant="bodyMd" fontWeight="semibold">
                                {fmtEur(item.revenue)}
                              </Text>
                              <Text as="p" variant="bodySm" tone="subdued">
                                {item.count} Bestellung{item.count !== 1 ? "en" : ""}
                              </Text>
                            </BlockStack>
                          </InlineStack>
                          <div
                            style={{
                              height: 4,
                              background: "var(--p-color-bg-surface-secondary)",
                              borderRadius: 2,
                              overflow: "hidden",
                            }}
                          >
                            <div
                              style={{
                                height: "100%",
                                width: `${pct}%`,
                                background: idx === 0 ? BRAND : "var(--p-color-border)",
                                borderRadius: 2,
                                transition: "width 0.4s ease",
                              }}
                            />
                          </div>
                        </BlockStack>
                      );
                    })}
                  </BlockStack>
                )}
              </BlockStack>
            </Card>
          </div>
        </Layout.Section>

        {!loading && (
          <Layout.Section>
            <Box background="bg-surface-secondary" padding="400" borderRadius="300">
              <InlineStack gap="400" wrap blockAlign="center">
                <Text as="p" variant="bodySm" tone="subdued">
                  <Text as="span" fontWeight="semibold" tone="subdued">Zeitraum:</Text> {selectedRangeLabel}
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  <Text as="span" fontWeight="semibold" tone="subdued">Bestellungen geladen:</Text> {allOrders.length}
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  <Text as="span" fontWeight="semibold" tone="subdued">Im Filter:</Text> {currentOrders.length}
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  <Text as="span" fontWeight="semibold" tone="subdued">Umsatz (bezahlt/aktiv):</Text> {fmtEur(currStats.revenue)}
                </Text>
                {isSuperuser && <Badge tone="info">Superuser</Badge>}
              </InlineStack>
            </Box>
          </Layout.Section>
        )}
      </Layout>
    </Page>
  );
}
