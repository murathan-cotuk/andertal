"use client";

import React, { useMemo, useState } from "react";
import { useLocale } from "next-intl";
import { useLt, dateLocaleFor, fmtMoney } from "@/lib/locale-text";

const DEFAULT_ACCENT = "#008060";

function niceMaxCents(cents) {
  const euro = cents / 100;
  if (euro <= 0) return 10000;
  const magnitude = 10 ** Math.floor(Math.log10(euro));
  return Math.ceil(euro / magnitude) * magnitude * 100;
}

/**
 * Area/line chart with Y-axis (left), X-axis dates (DD.MM), hover tooltip.
 * data: { key, label?, revenue (cents), orders?, impressions?, clicks? }
 */
export default function RevenueAreaChart({
  data = [],
  height = 220,
  accent = DEFAULT_ACCENT,
  emptyLabel,
  showClicksLine = false,
}) {
  const locale = useLocale();
  const lt = useLt();
  const dateLoc = dateLocaleFor(locale);
  const resolvedEmptyLabel = emptyLabel ?? lt("No data", "Veri yok", "Aucune donnée", "Sin datos", "Nessun dato", "Keine Daten");

  const fmtEuroCents = (cents) => fmtMoney(cents, locale);

  const fmtAxisEuro = (cents) => {
    const euro = Number(cents || 0) / 100;
    if (euro >= 1000) {
      return `€${(euro / 1000).toLocaleString(dateLoc, { maximumFractionDigits: 1 })}k`;
    }
    return `€${euro.toLocaleString(dateLoc, { maximumFractionDigits: 0 })}`;
  };

  const formatFullDate = (key) => {
    if (!key) return "—";
    const [y, m, d] = key.split("-");
    const dt = new Date(Number(y), Number(m) - 1, Number(d));
    return dt.toLocaleDateString(dateLoc, { day: "2-digit", month: "2-digit", year: "numeric" });
  };

  const formatDayMonth = (key) => {
    if (!key) return "";
    const [y, m, d] = key.split("-");
    const dt = new Date(Number(y), Number(m) - 1, Number(d));
    return dt.toLocaleDateString(dateLoc, { day: "2-digit", month: "2-digit" });
  };

  const [hoverIdx, setHoverIdx] = useState(null);

  const W = 800;
  const H = height;
  const padL = 58;
  const padR = 16;
  const padT = 28;
  const padB = 40;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;
  const yTicks = 4;

  const maxRevenue = useMemo(
    () => niceMaxCents(Math.max(...data.map((d) => d.revenue), 0)),
    [data],
  );

  const maxClicks = useMemo(
    () => Math.max(...data.map((d) => d.clicks || 0), 1),
    [data],
  );

  const points = useMemo(() => {
    const n = data.length;
    if (n === 0) return [];
    const step = n > 1 ? chartW / (n - 1) : 0;
    return data.map((d, i) => {
      const x = n === 1 ? padL + chartW / 2 : padL + i * step;
      const y = padT + chartH - (d.revenue / maxRevenue) * chartH;
      const clicksY = padT + chartH - ((d.clicks || 0) / maxClicks) * chartH * 0.45;
      return { ...d, x, y, clicksY, i };
    });
  }, [data, chartW, chartH, maxRevenue, maxClicks, padL, padT]);

  const linePath = useMemo(() => {
    if (points.length === 0) return "";
    return points.map((p, idx) => `${idx === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
  }, [points]);

  const clicksPath = useMemo(() => {
    if (!showClicksLine || points.length === 0) return "";
    return points.map((p, idx) => `${idx === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.clicksY.toFixed(1)}`).join(" ");
  }, [points, showClicksLine]);

  const areaPath = useMemo(() => {
    if (points.length === 0) return "";
    const base = padT + chartH;
    const start = `M ${points[0].x.toFixed(1)} ${base}`;
    const line = points.map((p) => `L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
    const end = `L ${points[points.length - 1].x.toFixed(1)} ${base} Z`;
    return `${start} ${line} ${end}`;
  }, [points, padT, chartH]);

  const hover = hoverIdx != null ? points[hoverIdx] : null;
  const prevHover = hoverIdx != null && hoverIdx > 0 ? points[hoverIdx - 1] : null;
  const deltaPct =
    hover && prevHover && prevHover.revenue > 0
      ? Math.round(((hover.revenue - prevHover.revenue) / prevHover.revenue) * 100)
      : null;

  const labelStep = Math.max(1, Math.ceil(data.length / 10));

  if (data.length === 0) {
    return <p style={{ fontSize: 13, color: "#9ca3af", margin: 0 }}>{resolvedEmptyLabel}</p>;
  }

  return (
    <div style={{ position: "relative", userSelect: "none" }}>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "flex-end",
          gap: 14,
          marginBottom: 8,
          fontSize: 11,
          color: "#6b7280",
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 16, height: 3, background: accent, borderRadius: 2 }} />
          {lt("Revenue", "Gelir", "Chiffre d'affaires", "Ingresos", "Ricavi", "Umsatz")}
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 16, height: 0, borderTop: `2px dashed ${accent}` }} />
          {lt("Trend", "Trend", "Tendance", "Tendencia", "Andamento", "Verlauf")}
        </span>
        {showClicksLine && (
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 16, height: 0, borderTop: "2px solid #6366f1" }} />
            {lt("Clicks", "Tıklamalar", "Clics", "Clics", "Clic", "Klicks")}
          </span>
        )}
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: "100%", height: "auto", display: "block" }}
        onMouseLeave={() => setHoverIdx(null)}
        role="img"
        aria-label={lt("Revenue chart", "Gelir grafiği", "Graphique des revenus", "Gráfico de ingresos", "Grafico ricavi", "Umsatzdiagramm")}
      >
        {Array.from({ length: yTicks + 1 }, (_, i) => {
          const valCents = (maxRevenue * i) / yTicks;
          const y = padT + chartH - (i / yTicks) * chartH;
          return (
            <g key={i}>
              <line
                x1={padL}
                x2={padL + chartW}
                y1={y}
                y2={y}
                stroke={i === 0 ? "#d1d5db" : "#f3f4f6"}
                strokeWidth={1}
              />
              <text x={padL - 8} y={y + 4} textAnchor="end" fontSize={10} fill="#9ca3af">
                {fmtAxisEuro(valCents)}
              </text>
            </g>
          );
        })}

        <path d={areaPath} fill={accent} fillOpacity={0.14} />
        <path
          d={linePath}
          fill="none"
          stroke={accent}
          strokeWidth={2.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {showClicksLine && clicksPath && (
          <path
            d={clicksPath}
            fill="none"
            stroke="#6366f1"
            strokeWidth={1.5}
            strokeLinejoin="round"
            strokeLinecap="round"
            opacity={0.85}
          />
        )}

        {hover && (
          <line
            x1={hover.x}
            x2={hover.x}
            y1={padT}
            y2={padT + chartH}
            stroke={accent}
            strokeWidth={1}
            strokeDasharray="4 4"
            opacity={0.55}
          />
        )}

        {points.map((p) => (
          <circle
            key={p.key}
            cx={p.x}
            cy={p.y}
            r={hoverIdx === p.i ? 5 : 3}
            fill={hoverIdx === p.i ? accent : "#fff"}
            stroke={accent}
            strokeWidth={2}
            opacity={hoverIdx === p.i || p.revenue > 0 ? 1 : 0.35}
          />
        ))}

        {points.map((p) => {
          const show = p.i % labelStep === 0 || p.i === points.length - 1;
          if (!show) return null;
          return (
            <text
              key={`lbl-${p.key}`}
              x={p.x}
              y={padT + chartH + 18}
              textAnchor="middle"
              fontSize={10}
              fill="#9ca3af"
            >
              {p.label || formatDayMonth(p.key)}
            </text>
          );
        })}

        {points.map((p) => {
          const w = data.length > 1 ? chartW / (data.length - 1) : chartW;
          return (
            <rect
              key={`hit-${p.key}`}
              x={p.x - w / 2}
              y={padT}
              width={Math.max(w, 12)}
              height={chartH}
              fill="transparent"
              onMouseEnter={() => setHoverIdx(p.i)}
            />
          );
        })}

        <line
          x1={padL}
          x2={padL + chartW}
          y1={padT + chartH}
          y2={padT + chartH}
          stroke="#d1d5db"
          strokeWidth={1.5}
        />
      </svg>

      {hover && (
        <div
          style={{
            position: "absolute",
            left: `${(hover.x / W) * 100}%`,
            top: 0,
            transform: hover.x > W * 0.65 ? "translate(calc(-100% - 12px), 8px)" : "translate(12px, 8px)",
            background: "#111827",
            color: "#fff",
            borderRadius: 10,
            padding: "10px 14px",
            fontSize: 12,
            lineHeight: 1.55,
            boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
            pointerEvents: "none",
            zIndex: 10,
            minWidth: 168,
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 6, fontSize: 13 }}>{formatFullDate(hover.key)}</div>
          <div>
            <span style={{ color: "#9ca3af" }}>{lt("Revenue:", "Gelir:", "Chiffre d'affaires :", "Ingresos:", "Ricavi:", "Umsatz: ")}</span>
            <strong>{fmtEuroCents(hover.revenue)}</strong>
          </div>
          {hover.orders != null && (
            <div>
              <span style={{ color: "#9ca3af" }}>{lt("Orders:", "Siparişler:", "Commandes :", "Pedidos:", "Ordini:", "Bestellungen: ")}</span>
              <strong>{hover.orders}</strong>
            </div>
          )}
          {hover.impressions != null && hover.impressions > 0 && (
            <div>
              <span style={{ color: "#9ca3af" }}>{lt("Impressions:", "Gösterimler:", "Impressions :", "Impresiones:", "Impressioni:", "Impressions: ")}</span>
              <strong>{hover.impressions.toLocaleString(dateLoc)}</strong>
            </div>
          )}
          {hover.clicks != null && hover.clicks > 0 && (
            <div>
              <span style={{ color: "#9ca3af" }}>{lt("Clicks:", "Tıklamalar:", "Clics :", "Clics:", "Clic:", "Klicks: ")}</span>
              <strong>{hover.clicks.toLocaleString(dateLoc)}</strong>
              {hover.impressions > 0 && (
                <span style={{ color: "#9ca3af", marginLeft: 6 }}>
                  CTR {((hover.clicks / hover.impressions) * 100).toFixed(1)} %
                </span>
              )}
            </div>
          )}
          {deltaPct != null && (
            <div style={{ marginTop: 4, color: deltaPct >= 0 ? "#6ee7b7" : "#fca5a5" }}>
              {deltaPct >= 0 ? "▲" : "▼"} {Math.abs(deltaPct)} % {lt("vs. previous day", "önceki güne göre", "vs. jour précédent", "vs. día anterior", "vs. giorno precedente", "vs. Vortag")}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
