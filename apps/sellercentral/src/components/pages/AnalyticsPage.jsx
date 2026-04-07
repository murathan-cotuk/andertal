"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";

// ─── Constants ───────────────────────────────────────────────────────────────

const BRAND = "#ff971c";
const BRAND_LIGHT = "#fff7ed";

const STATUS_COLORS = {
  offen: { bg: "#fff7ed", color: "#c2410c" },
  in_bearbeitung: { bg: "#eff6ff", color: "#1d4ed8" },
  abgeschlossen: { bg: "#f0fdf4", color: "#15803d" },
  retoure: { bg: "#fef2f2", color: "#b91c1c" },
  retoure_anfrage: { bg: "#fffbeb", color: "#b45309" },
  refunded: { bg: "#eff6ff", color: "#1d4ed8" },
  storniert: { bg: "#fef2f2", color: "#b91c1c" },
  bezahlt: { bg: "#f0fdf4", color: "#15803d" },
  teil_erstattet: { bg: "#fffbeb", color: "#b45309" },
  erstattet: { bg: "#fef2f2", color: "#b91c1c" },
  versendet: { bg: "#eff6ff", color: "#1d4ed8" },
  zugestellt: { bg: "#f0fdf4", color: "#15803d" },
};

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
  let start, end, prevStart, prevEnd;

  if (rangeKey === "this_week") {
    const dow = (today.getDay() + 6) % 7; // Monday=0
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
    // all
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

  // If too many days, aggregate by week
  if (days.length > 60) {
    const weeks = [];
    for (let i = 0; i < days.length; i += 7) {
      const chunk = days.slice(i, i + 7);
      weeks.push({
        date: chunk[0].date,
        label: chunk[0].label,
        revenue: chunk.reduce((s, d) => s + d.revenue, 0),
      });
    }
    return weeks;
  }

  return days;
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function Card({ children, style = {} }) {
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #e5e7eb",
        borderRadius: 10,
        padding: 20,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function StatusBadge({ value }) {
  const s = STATUS_COLORS[value] || { bg: "#f3f4f6", color: "#6b7280" };
  return (
    <span
      style={{
        padding: "2px 8px",
        borderRadius: 4,
        fontSize: 11,
        fontWeight: 600,
        background: s.bg,
        color: s.color,
        whiteSpace: "nowrap",
      }}
    >
      {value || "—"}
    </span>
  );
}

function TrendBadge({ pct }) {
  if (pct === null || pct === undefined) return <span style={{ fontSize: 12, color: "#9ca3af" }}>—</span>;
  const positive = pct >= 0;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 2,
        fontSize: 12,
        fontWeight: 600,
        color: positive ? "#15803d" : "#b91c1c",
      }}
    >
      {positive ? "▲" : "▼"} {Math.abs(pct)}%
    </span>
  );
}

function KpiCard({ label, value, trend, icon, accentColor = BRAND }) {
  return (
    <Card>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>
            {label}
          </div>
          <div style={{ fontSize: 26, fontWeight: 700, color: "#111827", lineHeight: 1.1, marginBottom: 8 }}>
            {value}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#6b7280" }}>
            <TrendBadge pct={trend} />
            <span>vs. Vorperiode</span>
          </div>
        </div>
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 10,
            background: BRAND_LIGHT,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: 18 }}>{icon}</span>
        </div>
      </div>
    </Card>
  );
}

function SkeletonKpi() {
  return (
    <Card>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ height: 12, width: "55%", background: "#f3f4f6", borderRadius: 4 }} />
        <div style={{ height: 28, width: "75%", background: "#f3f4f6", borderRadius: 4 }} />
        <div style={{ height: 10, width: "40%", background: "#f3f4f6", borderRadius: 4 }} />
      </div>
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
  // Nice Y axis
  const magnitude = Math.pow(10, Math.floor(Math.log10(maxRev / 100)));
  const niceMax = Math.ceil((maxRev / 100) / magnitude) * magnitude;
  const yTicks = 5;

  const barCount = data.length;
  const barGap = barCount > 30 ? 1 : barCount > 14 ? 2 : 4;
  const barW = Math.max(2, (chartW / barCount) - barGap);

  // X-axis labels: show every Nth
  const maxLabels = 12;
  const labelStep = Math.ceil(barCount / maxLabels);

  return (
    <div>
      <div style={{ fontSize: 14, fontWeight: 700, color: "#111827", marginBottom: 14 }}>{title}</div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: "100%", height: "auto", display: "block" }}
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Grid lines + Y labels */}
        {Array.from({ length: yTicks + 1 }, (_, i) => {
          const val = (niceMax * i) / yTicks;
          const y = padT + chartH - (i / yTicks) * chartH;
          const label =
            val >= 100
              ? `€${(val).toLocaleString("de-DE", { maximumFractionDigits: 0 })}`
              : `€${val.toFixed(0)}`;
          return (
            <g key={i}>
              <line
                x1={padL}
                x2={padL + chartW}
                y1={y}
                y2={y}
                stroke={i === 0 ? "#d1d5db" : "#f3f4f6"}
                strokeWidth={i === 0 ? 1.5 : 1}
              />
              <text
                x={padL - 8}
                y={y + 4}
                textAnchor="end"
                fontSize={10}
                fill="#9ca3af"
              >
                {label}
              </text>
            </g>
          );
        })}

        {/* Bars */}
        {data.map((d, i) => {
          const barH = (d.revenue / 100 / niceMax) * chartH;
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
                  opacity={0.9}
                />
              )}
              {barH === 0 && (
                <rect
                  x={x}
                  y={padT + chartH - 2}
                  width={barW}
                  height={2}
                  fill="#e5e7eb"
                />
              )}
              {showLabel && (
                <text
                  x={x + barW / 2}
                  y={padT + chartH + 16}
                  textAnchor="middle"
                  fontSize={9}
                  fill="#9ca3af"
                  transform={barCount > 20 ? `rotate(-35, ${x + barW / 2}, ${padT + chartH + 16})` : undefined}
                >
                  {d.label}
                </text>
              )}
            </g>
          );
        })}

        {/* X axis line */}
        <line
          x1={padL}
          x2={padL + chartW}
          y1={padT + chartH}
          y2={padT + chartH}
          stroke="#d1d5db"
          strokeWidth={1.5}
        />
      </svg>
    </div>
  );
}

function SkeletonChart() {
  return (
    <div style={{ width: "100%", height: 280, background: "#f9fafb", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ color: "#d1d5db", fontSize: 13 }}>Lade Diagramm…</div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
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

  // Compute date range
  const { start, end, prevStart, prevEnd } = useMemo(() => getDateRange(range), [range]);

  // Filter orders
  const currentOrders = useMemo(() => {
    if (range === "all") return allOrders;
    return filterByRange(allOrders, start, end);
  }, [allOrders, range, start, end]);

  const previousOrders = useMemo(() => {
    if (!prevStart || !prevEnd) return [];
    return filterByRange(allOrders, prevStart, prevEnd);
  }, [allOrders, prevStart, prevEnd]);

  // KPI stats
  const currStats = useMemo(() => calcStats(currentOrders), [currentOrders]);
  const prevStats = useMemo(() => calcStats(previousOrders), [previousOrders]);

  const trends = useMemo(() => ({
    revenue: trendPct(currStats.revenue, prevStats.revenue),
    count: trendPct(currStats.count, prevStats.count),
    avg: trendPct(currStats.avg, prevStats.avg),
    customers: trendPct(currStats.customers, prevStats.customers),
  }), [currStats, prevStats]);

  // Chart data
  const chartData = useMemo(() => {
    if (range === "all" && allOrders.length > 0) {
      const dates = allOrders.map((o) => new Date(o.created_at)).filter((d) => !isNaN(d));
      const minDate = new Date(Math.min(...dates));
      minDate.setHours(0, 0, 0, 0);
      const maxDate = new Date();
      maxDate.setHours(0, 0, 0, 0);
      return groupByDay(allOrders, minDate, maxDate);
    }
    if (!start || !end) return [];
    return groupByDay(currentOrders, start, end);
  }, [currentOrders, range, allOrders, start, end]);

  // Recent orders (latest 10)
  const recentOrders = useMemo(() => {
    return [...currentOrders]
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, 10);
  }, [currentOrders]);

  // Top products by order value (fallback: top buyers)
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

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 4px" }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 24,
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: "#111827", margin: 0, lineHeight: 1.2 }}>
            Analytics
          </h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "#6b7280" }}>
            Umsatz &amp; Bestellstatistiken{isSuperuser ? " (Alle Verkäufer)" : ""}
          </p>
        </div>

        {/* Date range pills */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {DATE_RANGES.map((r) => (
            <button
              key={r.value}
              onClick={() => setRange(r.value)}
              style={{
                padding: "5px 12px",
                borderRadius: 20,
                border: range === r.value ? `1.5px solid ${BRAND}` : "1.5px solid #e5e7eb",
                background: range === r.value ? BRAND_LIGHT : "#fff",
                color: range === r.value ? BRAND : "#374151",
                fontSize: 12,
                fontWeight: range === r.value ? 700 : 500,
                cursor: "pointer",
                transition: "all 0.15s",
              }}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div
          style={{
            marginBottom: 16,
            padding: "12px 16px",
            background: "#fef2f2",
            border: "1px solid #fecaca",
            borderRadius: 8,
            color: "#b91c1c",
            fontSize: 13,
          }}
        >
          <strong>Fehler:</strong> {error}{" "}
          <button
            onClick={loadOrders}
            style={{ marginLeft: 8, textDecoration: "underline", background: "none", border: "none", color: "#b91c1c", cursor: "pointer", fontSize: 13 }}
          >
            Erneut versuchen
          </button>
        </div>
      )}

      {/* KPI Cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 16,
          marginBottom: 20,
        }}
      >
        {loading ? (
          <>
            <SkeletonKpi />
            <SkeletonKpi />
            <SkeletonKpi />
            <SkeletonKpi />
          </>
        ) : (
          <>
            <KpiCard
              label="Umsatz"
              value={fmtEur(currStats.revenue)}
              trend={trends.revenue}
              icon="💰"
            />
            <KpiCard
              label="Bestellungen"
              value={currStats.count.toLocaleString("de-DE")}
              trend={trends.count}
              icon="📦"
            />
            <KpiCard
              label="Ø Bestellwert"
              value={fmtEur(currStats.avg)}
              trend={trends.avg}
              icon="📊"
            />
            <KpiCard
              label="Neue Kunden"
              value={currStats.customers.toLocaleString("de-DE")}
              trend={trends.customers}
              icon="👤"
            />
          </>
        )}
      </div>

      {/* Chart */}
      <Card style={{ marginBottom: 20 }}>
        {loading ? (
          <SkeletonChart />
        ) : chartData.length === 0 ? (
          <div style={{ textAlign: "center", padding: "48px 0", color: "#9ca3af", fontSize: 14 }}>
            Keine Daten für den gewählten Zeitraum
          </div>
        ) : (
          <BarChart
            data={chartData}
            title={`Tagesumsatz — ${selectedRangeLabel}`}
          />
        )}
      </Card>

      {/* Bottom row: recent orders + top customers */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 16, alignItems: "start" }}>
        {/* Recent orders table */}
        <Card>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: "#111827", margin: 0 }}>
              Letzte Bestellungen
            </h2>
            <span style={{ fontSize: 12, color: "#9ca3af" }}>
              {currentOrders.length} gesamt
            </span>
          </div>

          {loading ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {Array.from({ length: 5 }, (_, i) => (
                <div key={i} style={{ height: 36, background: "#f9fafb", borderRadius: 6 }} />
              ))}
            </div>
          ) : recentOrders.length === 0 ? (
            <div style={{ textAlign: "center", padding: "32px 0", color: "#9ca3af", fontSize: 13 }}>
              Keine Bestellungen im gewählten Zeitraum
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr>
                    {["Bestellnr.", "Datum", "Kunde", "Betrag", "Status", "Zahlung"].map((h) => (
                      <th
                        key={h}
                        style={{
                          padding: "8px 10px",
                          textAlign: "left",
                          fontSize: 11,
                          fontWeight: 600,
                          color: "#6b7280",
                          borderBottom: "1px solid #f3f4f6",
                          whiteSpace: "nowrap",
                          textTransform: "uppercase",
                          letterSpacing: "0.04em",
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {recentOrders.map((o, idx) => {
                    const name = [o.first_name, o.last_name].filter(Boolean).join(" ") || o.email || "—";
                    return (
                      <tr
                        key={o.id}
                        style={{
                          background: idx % 2 === 0 ? "#fff" : "#fafafa",
                          transition: "background 0.1s",
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "#fff7ed")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = idx % 2 === 0 ? "#fff" : "#fafafa")}
                      >
                        <td style={{ padding: "9px 10px", color: BRAND, fontWeight: 600 }}>
                          #{o.order_number || o.id?.slice(-6) || "—"}
                        </td>
                        <td style={{ padding: "9px 10px", color: "#374151", whiteSpace: "nowrap" }}>
                          {fmtDate(o.created_at)}
                        </td>
                        <td style={{ padding: "9px 10px", color: "#374151", maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {name}
                        </td>
                        <td style={{ padding: "9px 10px", color: "#111827", fontWeight: 600, whiteSpace: "nowrap" }}>
                          {fmtEur(o.total_cents)}
                        </td>
                        <td style={{ padding: "9px 10px" }}>
                          <StatusBadge value={o.order_status} />
                        </td>
                        <td style={{ padding: "9px 10px" }}>
                          <StatusBadge value={o.payment_status} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* Top customers by revenue */}
        <Card>
          <div style={{ marginBottom: 16 }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: "#111827", margin: 0 }}>
              Top Kunden
            </h2>
            <p style={{ margin: "4px 0 0", fontSize: 12, color: "#9ca3af" }}>Nach Umsatz im Zeitraum</p>
          </div>

          {loading ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {Array.from({ length: 5 }, (_, i) => (
                <div key={i} style={{ height: 40, background: "#f9fafb", borderRadius: 6 }} />
              ))}
            </div>
          ) : topByRevenue.length === 0 ? (
            <div style={{ textAlign: "center", padding: "32px 0", color: "#9ca3af", fontSize: 13 }}>
              Keine Daten verfügbar
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {topByRevenue.map((item, idx) => {
                const maxRev = topByRevenue[0]?.revenue || 1;
                const pct = Math.round((item.revenue / maxRev) * 100);
                return (
                  <div
                    key={idx}
                    style={{ padding: "10px 0", borderBottom: idx < topByRevenue.length - 1 ? "1px solid #f3f4f6" : "none" }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span
                          style={{
                            width: 22,
                            height: 22,
                            borderRadius: "50%",
                            background: idx === 0 ? BRAND : "#f3f4f6",
                            color: idx === 0 ? "#fff" : "#6b7280",
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 11,
                            fontWeight: 700,
                            flexShrink: 0,
                          }}
                        >
                          {idx + 1}
                        </span>
                        <span
                          style={{
                            fontSize: 13,
                            color: "#374151",
                            fontWeight: 500,
                            maxWidth: 150,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {item.name}
                        </span>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: "#111827" }}>
                          {fmtEur(item.revenue)}
                        </div>
                        <div style={{ fontSize: 11, color: "#9ca3af" }}>
                          {item.count} Bestellung{item.count !== 1 ? "en" : ""}
                        </div>
                      </div>
                    </div>
                    {/* Bar */}
                    <div style={{ height: 4, background: "#f3f4f6", borderRadius: 2, overflow: "hidden" }}>
                      <div
                        style={{
                          height: "100%",
                          width: `${pct}%`,
                          background: idx === 0 ? BRAND : "#d1d5db",
                          borderRadius: 2,
                          transition: "width 0.4s ease",
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      {/* Summary footer */}
      {!loading && (
        <div
          style={{
            marginTop: 20,
            padding: "12px 16px",
            background: "#f9fafb",
            border: "1px solid #e5e7eb",
            borderRadius: 8,
            display: "flex",
            gap: 24,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <span style={{ fontSize: 12, color: "#6b7280" }}>
            <strong style={{ color: "#374151" }}>Zeitraum:</strong> {selectedRangeLabel}
          </span>
          <span style={{ fontSize: 12, color: "#6b7280" }}>
            <strong style={{ color: "#374151" }}>Bestellungen geladen:</strong> {allOrders.length}
          </span>
          <span style={{ fontSize: 12, color: "#6b7280" }}>
            <strong style={{ color: "#374151" }}>Im Zeitraum:</strong> {currentOrders.length}
          </span>
          <span style={{ fontSize: 12, color: "#6b7280" }}>
            <strong style={{ color: "#374151" }}>Umsatz (bezahlt/aktiv):</strong> {fmtEur(currStats.revenue)}
          </span>
          {isSuperuser && (
            <span
              style={{
                marginLeft: "auto",
                fontSize: 11,
                fontWeight: 600,
                color: BRAND,
                background: BRAND_LIGHT,
                padding: "3px 8px",
                borderRadius: 12,
              }}
            >
              ⚡ Superuser-Ansicht
            </span>
          )}
        </div>
      )}
    </div>
  );
}
