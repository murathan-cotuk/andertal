"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import {
  Page,
  Card,
  Text,
  BlockStack,
  InlineStack,
  Banner,
  Spinner,
  Select,
  Badge,
} from "@shopify/polaris";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";
import { fmtDate, AD_STATUS_TONE, AD_STATUS_LABEL } from "@/components/pages/marketing/ppcCampaignShared";

const ATTRIBUTION_MODELS = [
  { value: "last_click", label: "Letzter Klick" },
  { value: "first_click", label: "Erster Klick" },
  { value: "linear", label: "Linear (gleichmäßig)" },
];

const DATE_PRESETS = [
  { value: "7d", label: "Letzte 7 Tage" },
  { value: "14d", label: "Letzte 14 Tage" },
  { value: "30d", label: "Letzte 30 Tage" },
  { value: "90d", label: "Letzte 90 Tage" },
];

function presetToRange(preset) {
  const to = new Date();
  const from = new Date();
  const days = parseInt(preset, 10);
  from.setDate(from.getDate() - days);
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}

function fmt(n, decimals = 0) {
  if (n == null || n === "") return "—";
  return Number(n).toLocaleString("de-DE", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function fmtEur(cents) {
  if (!cents && cents !== 0) return "—";
  return `${(Number(cents) / 100).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

function fmtPct(n) {
  if (n == null) return "—";
  return `${Number(n).toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`;
}

function KpiCard({ label, value, sub, accent }) {
  return (
    <div
      style={{
        flex: "1 1 160px",
        minWidth: 0,
        borderRadius: 16,
        border: "1px solid rgba(226, 232, 240, 0.95)",
        background: "#fff",
        boxShadow: "0 2px 12px rgba(15,23,42,0.05)",
        padding: "18px 20px",
      }}
    >
      <p style={{ margin: 0, fontSize: 12, color: "#64748b", fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase" }}>
        {label}
      </p>
      <p style={{ margin: "8px 0 0", fontSize: 26, fontWeight: 750, color: accent || "#0f172a", lineHeight: 1.1, fontFamily: "system-ui, sans-serif" }}>
        {value}
      </p>
      {sub && <p style={{ margin: "4px 0 0", fontSize: 12, color: "#94a3b8" }}>{sub}</p>}
    </div>
  );
}

function MiniBar({ value, max }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ flex: 1, height: 6, borderRadius: 999, background: "#f1f5f9", overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", borderRadius: 999, background: "linear-gradient(90deg, #6366f1, #818cf8)", transition: "width 0.4s" }} />
      </div>
      <span style={{ fontSize: 12, color: "#64748b", minWidth: 36, textAlign: "right" }}>{fmt(value)}</span>
    </div>
  );
}

function CampaignRow({ row, maxClicks, maxOrders }) {
  const acos = row.spend_cents > 0 && row.revenue_cents > 0
    ? ((row.spend_cents / row.revenue_cents) * 100).toFixed(1)
    : null;
  const roas = row.spend_cents > 0 && row.revenue_cents > 0
    ? (row.revenue_cents / row.spend_cents).toFixed(2)
    : null;
  const ctr = row.impressions > 0 && row.clicks > 0
    ? ((row.clicks / row.impressions) * 100).toFixed(2)
    : null;
  const adStatus = row.ad_status || "draft";

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr 1fr 1fr",
        gap: 12,
        padding: "14px 16px",
        borderBottom: "1px solid #f1f5f9",
        alignItems: "center",
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#0f172a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {row.name}
        </div>
        <div style={{ marginTop: 3 }}>
          <Badge tone={AD_STATUS_TONE[adStatus] || "info"}>{AD_STATUS_LABEL[adStatus] || adStatus}</Badge>
        </div>
      </div>
      <div style={{ fontSize: 13, color: "#475569" }}>{fmtEur(row.spend_cents)}</div>
      <div>
        <MiniBar value={row.impressions || 0} max={row.impressions || 0} />
        <span style={{ fontSize: 11, color: "#94a3b8" }}>{fmt(row.impressions)} Einbl.</span>
      </div>
      <div>
        <MiniBar value={row.clicks || 0} max={maxClicks} />
        {ctr != null && <span style={{ fontSize: 11, color: "#94a3b8" }}>CTR {ctr} %</span>}
      </div>
      <div>
        <MiniBar value={row.orders || 0} max={maxOrders} />
        <span style={{ fontSize: 11, color: "#94a3b8" }}>{fmt(row.orders)} Best.</span>
      </div>
      <div style={{ fontSize: 13, color: "#0f172a", fontWeight: 600 }}>{fmtEur(row.revenue_cents)}</div>
      <div>
        {acos != null ? (
          <span
            style={{
              display: "inline-block",
              padding: "3px 10px",
              borderRadius: 999,
              fontSize: 12,
              fontWeight: 700,
              background: parseFloat(acos) <= 30 ? "rgba(34,197,94,0.12)" : parseFloat(acos) <= 60 ? "rgba(251,191,36,0.15)" : "rgba(239,68,68,0.1)",
              color: parseFloat(acos) <= 30 ? "#15803d" : parseFloat(acos) <= 60 ? "#92400e" : "#b91c1c",
            }}
          >
            {acos} % ACoS
          </span>
        ) : (
          <span style={{ fontSize: 12, color: "#94a3b8" }}>—</span>
        )}
        {roas != null && <div style={{ fontSize: 11, color: "#64748b", marginTop: 3 }}>ROAS {roas}×</div>}
      </div>
    </div>
  );
}

export default function MarketingAttributionPage() {
  const [loading, setLoading] = useState(true);
  const [campaigns, setCampaigns] = useState([]);
  const [attribution, setAttribution] = useState([]);
  const [msg, setMsg] = useState(null);
  const [isSuperuser, setIsSuperuser] = useState(false);
  const [datePreset, setDatePreset] = useState("30d");
  const [model, setModel] = useState("last_click");
  const [filterCampaign, setFilterCampaign] = useState("all");

  useEffect(() => {
    if (typeof window !== "undefined") {
      setIsSuperuser(localStorage.getItem("sellerIsSuperuser") === "true");
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setMsg(null);
    try {
      const client = getMedusaAdminClient();
      const [cRes, aRes] = await Promise.all([
        client.getCampaigns(),
        client.getCampaignAttribution({ ...presetToRange(datePreset), model, campaign_id: filterCampaign !== "all" ? filterCampaign : undefined }).catch(() => null),
      ]);
      const allCampaigns = (Array.isArray(cRes?.campaigns) ? cRes.campaigns : []).filter(
        (c) => c.campaign_type === "ppc" || (c.campaign_type == null && c.budget_daily_cents > 0),
      );
      setCampaigns(allCampaigns);

      const rawRows = Array.isArray(aRes?.rows) ? aRes.rows : [];
      if (rawRows.length > 0) {
        setAttribution(rawRows);
      } else {
        setAttribution(allCampaigns.map((c) => ({
          id: c.id,
          name: c.name,
          ad_status: c.ad_status,
          spend_cents: c.budget_daily_cents || 0,
          impressions: null,
          clicks: null,
          orders: null,
          revenue_cents: null,
        })));
      }
    } catch (e) {
      setMsg({ tone: "critical", text: e?.message || "Daten konnten nicht geladen werden." });
    } finally {
      setLoading(false);
    }
  }, [datePreset, model, filterCampaign]);

  useEffect(() => {
    load();
  }, [load]);

  const rows = useMemo(() => {
    if (filterCampaign === "all") return attribution;
    return attribution.filter((r) => r.id === filterCampaign);
  }, [attribution, filterCampaign]);

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, r) => ({
        spend: acc.spend + (r.spend_cents || 0),
        impressions: acc.impressions + (r.impressions || 0),
        clicks: acc.clicks + (r.clicks || 0),
        orders: acc.orders + (r.orders || 0),
        revenue: acc.revenue + (r.revenue_cents || 0),
      }),
      { spend: 0, impressions: 0, clicks: 0, orders: 0, revenue: 0 },
    );
  }, [rows]);

  const hasRealData = rows.some((r) => r.impressions != null || r.clicks != null || r.orders != null);

  const totalAcos = totals.revenue > 0 ? ((totals.spend / totals.revenue) * 100).toFixed(1) : null;
  const totalRoas = totals.spend > 0 ? (totals.revenue / totals.spend).toFixed(2) : null;
  const totalCtr = totals.impressions > 0 ? ((totals.clicks / totals.impressions) * 100).toFixed(2) : null;

  const maxClicks = Math.max(...rows.map((r) => r.clicks || 0), 1);
  const maxOrders = Math.max(...rows.map((r) => r.orders || 0), 1);

  const campaignOptions = [
    { value: "all", label: "Alle Kampagnen" },
    ...campaigns.map((c) => ({ value: c.id, label: c.name })),
  ];

  return (
    <Page
      title="Attribution"
      subtitle="Werbeleistung & Umsatz je Kampagne"
    >
      <BlockStack gap="400">
        {msg && (
          <Banner tone={msg.tone} onDismiss={() => setMsg(null)}>
            {msg.text}
          </Banner>
        )}

        {/* Filters */}
        <Card>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-end" }}>
            <div style={{ flex: "1 1 180px" }}>
              <Select
                label="Zeitraum"
                options={DATE_PRESETS}
                value={datePreset}
                onChange={setDatePreset}
              />
            </div>
            <div style={{ flex: "1 1 200px" }}>
              <Select
                label="Kampagne"
                options={campaignOptions}
                value={filterCampaign}
                onChange={setFilterCampaign}
              />
            </div>
            <div style={{ flex: "1 1 200px" }}>
              <Select
                label="Attributionsmodell"
                options={ATTRIBUTION_MODELS}
                value={model}
                onChange={setModel}
              />
            </div>
          </div>
        </Card>

        {loading ? (
          <Card>
            <div style={{ padding: 48, textAlign: "center" }}>
              <Spinner size="large" accessibilityLabel="Laden" />
              <p style={{ marginTop: 16, color: "#64748b", fontSize: 14 }}>Attributionsdaten werden geladen …</p>
            </div>
          </Card>
        ) : (
          <>
            {!hasRealData && (
              <Banner tone="info">
                Noch keine Klick- und Konversionsdaten. Sobald Kampagnen aktiv sind und Traffic erzeugt wird, erscheinen hier die Auswertungen.
              </Banner>
            )}

            {/* KPI Summary */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
              <KpiCard label="Ausgaben" value={fmtEur(totals.spend)} sub={`${DATE_PRESETS.find(d => d.value === datePreset)?.label}`} />
              <KpiCard label="Einblendungen" value={hasRealData ? fmt(totals.impressions) : "—"} />
              <KpiCard label="Klicks" value={hasRealData ? fmt(totals.clicks) : "—"} sub={totalCtr ? `CTR ${totalCtr} %` : undefined} />
              <KpiCard label="Bestellungen" value={hasRealData ? fmt(totals.orders) : "—"} />
              <KpiCard label="Umsatz" value={hasRealData ? fmtEur(totals.revenue) : "—"} accent="#0ea5e9" />
              <KpiCard
                label="ACoS"
                value={hasRealData && totalAcos ? `${totalAcos} %` : "—"}
                sub={totalRoas ? `ROAS ${totalRoas}×` : undefined}
                accent={totalAcos ? (parseFloat(totalAcos) <= 30 ? "#15803d" : parseFloat(totalAcos) <= 60 ? "#b45309" : "#b91c1c") : undefined}
              />
            </div>

            {/* Attribution Model Info */}
            <div style={{ padding: "10px 16px", borderRadius: 12, background: "#f8fafc", border: "1px solid #e2e8f0", fontSize: 13, color: "#475569" }}>
              <strong>Modell:</strong>{" "}
              {model === "last_click" && "Letzter Klick — der letzte Klick vor dem Kauf erhält 100 % der Attribution."}
              {model === "first_click" && "Erster Klick — der erste Klick einer Session erhält 100 % der Attribution."}
              {model === "linear" && "Linear — alle Klicks im Conversion-Pfad erhalten gleichmäßig Attribution."}
            </div>

            {/* Campaign Table */}
            {rows.length > 0 && (
              <Card padding="0">
                {/* Table Header */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr 1fr 1fr",
                    gap: 12,
                    padding: "10px 16px",
                    borderBottom: "1px solid #e2e8f0",
                    background: "#f8fafc",
                    borderRadius: "12px 12px 0 0",
                  }}
                >
                  {["Kampagne", "Ausgaben", "Einblendungen", "Klicks", "Bestellungen", "Umsatz", "Performance"].map((h) => (
                    <span key={h} style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      {h}
                    </span>
                  ))}
                </div>
                {rows.map((row) => (
                  <CampaignRow key={row.id} row={row} maxClicks={maxClicks} maxOrders={maxOrders} />
                ))}
              </Card>
            )}

            {rows.length === 0 && (
              <Card>
                <div style={{ padding: "48px 32px", textAlign: "center" }}>
                  <Text tone="subdued" as="p">Keine Kampagnendaten für den gewählten Zeitraum.</Text>
                </div>
              </Card>
            )}

            {/* Attribution Window Info */}
            <div style={{ padding: "12px 16px", borderRadius: 12, border: "1px solid #e2e8f0", background: "#fff", fontSize: 12, color: "#94a3b8" }}>
              Attributionsfenster: 7 Tage nach Klick · 1 Tag nach Einblendung.
              {isSuperuser && " Superuser sieht alle Verkäufer-Kampagnen zusammen."}
            </div>
          </>
        )}
      </BlockStack>
    </Page>
  );
}
