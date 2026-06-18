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
import { useLocale } from "next-intl";
import { getUI } from "@/lib/ui-strings";

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

function CampaignRow({ row, maxClicks, maxOrders, locale }) {
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
  const impressionsLabel = locale === "de" ? "Einbl." : locale === "tr" ? "Göst." : locale === "fr" ? "Impr." : locale === "es" ? "Impr." : locale === "it" ? "Impr." : "Impr.";
  const ordersLabel = locale === "de" ? "Best." : locale === "tr" ? "Sip." : locale === "fr" ? "Com." : locale === "es" ? "Ped." : locale === "it" ? "Ord." : "Ord.";

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
        <span style={{ fontSize: 11, color: "#94a3b8" }}>{fmt(row.impressions)} {impressionsLabel}</span>
      </div>
      <div>
        <MiniBar value={row.clicks || 0} max={maxClicks} />
        {ctr != null && <span style={{ fontSize: 11, color: "#94a3b8" }}>CTR {ctr} %</span>}
      </div>
      <div>
        <MiniBar value={row.orders || 0} max={maxOrders} />
        <span style={{ fontSize: 11, color: "#94a3b8" }}>{fmt(row.orders)} {ordersLabel}</span>
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
  const locale = useLocale();
  const ui = getUI(locale);

  const ATTRIBUTION_MODELS = [
    { value: "last_click", label: locale === "de" ? "Letzter Klick" : locale === "tr" ? "Son Tıklama" : locale === "fr" ? "Dernier clic" : locale === "es" ? "Último clic" : locale === "it" ? "Ultimo clic" : "Last click" },
    { value: "first_click", label: locale === "de" ? "Erster Klick" : locale === "tr" ? "İlk Tıklama" : locale === "fr" ? "Premier clic" : locale === "es" ? "Primer clic" : locale === "it" ? "Primo clic" : "First click" },
    { value: "linear", label: locale === "de" ? "Linear (gleichmäßig)" : locale === "tr" ? "Doğrusal (eşit dağılım)" : locale === "fr" ? "Linéaire (répartition égale)" : locale === "es" ? "Lineal (distribución uniforme)" : locale === "it" ? "Lineare (distribuzione uniforme)" : "Linear (evenly distributed)" },
  ];

  const DATE_PRESETS = [
    { value: "7d", label: locale === "de" ? "Letzte 7 Tage" : locale === "tr" ? "Son 7 gün" : locale === "fr" ? "7 derniers jours" : locale === "es" ? "Últimos 7 días" : locale === "it" ? "Ultimi 7 giorni" : "Last 7 days" },
    { value: "14d", label: locale === "de" ? "Letzte 14 Tage" : locale === "tr" ? "Son 14 gün" : locale === "fr" ? "14 derniers jours" : locale === "es" ? "Últimos 14 días" : locale === "it" ? "Ultimi 14 giorni" : "Last 14 days" },
    { value: "30d", label: locale === "de" ? "Letzte 30 Tage" : locale === "tr" ? "Son 30 gün" : locale === "fr" ? "30 derniers jours" : locale === "es" ? "Últimos 30 días" : locale === "it" ? "Ultimi 30 giorni" : "Last 30 days" },
    { value: "90d", label: locale === "de" ? "Letzte 90 Tage" : locale === "tr" ? "Son 90 gün" : locale === "fr" ? "90 derniers jours" : locale === "es" ? "Últimos 90 días" : locale === "it" ? "Ultimi 90 giorni" : "Last 90 days" },
  ];

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
          spend_cents: 0,
          impressions: null,
          clicks: null,
          orders: null,
          revenue_cents: null,
        })));
      }
    } catch (e) {
      setMsg({ tone: "critical", text: e?.message || (locale === "de" ? "Daten konnten nicht geladen werden." : locale === "tr" ? "Veriler yüklenemedi." : locale === "fr" ? "Impossible de charger les données." : locale === "es" ? "No se pudieron cargar los datos." : locale === "it" ? "Impossibile caricare i dati." : "Could not load data.") });
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
    { value: "all", label: locale === "de" ? "Alle Kampagnen" : locale === "tr" ? "Tüm Kampanyalar" : locale === "fr" ? "Toutes les campagnes" : locale === "es" ? "Todas las campañas" : locale === "it" ? "Tutte le campagne" : "All campaigns" },
    ...campaigns.map((c) => ({ value: c.id, label: c.name })),
  ];

  const tableHeaders = [
    locale === "de" ? "Kampagne" : locale === "tr" ? "Kampanya" : locale === "fr" ? "Campagne" : locale === "es" ? "Campaña" : locale === "it" ? "Campagna" : "Campaign",
    locale === "de" ? "Ausgaben" : locale === "tr" ? "Harcama" : locale === "fr" ? "Dépenses" : locale === "es" ? "Gasto" : locale === "it" ? "Spesa" : "Spend",
    locale === "de" ? "Einblendungen" : locale === "tr" ? "Gösterimler" : locale === "fr" ? "Impressions" : locale === "es" ? "Impresiones" : locale === "it" ? "Impressioni" : "Impressions",
    locale === "de" ? "Klicks" : locale === "tr" ? "Tıklamalar" : locale === "fr" ? "Clics" : locale === "es" ? "Clics" : locale === "it" ? "Clic" : "Clicks",
    locale === "de" ? "Bestellungen" : locale === "tr" ? "Siparişler" : locale === "fr" ? "Commandes" : locale === "es" ? "Pedidos" : locale === "it" ? "Ordini" : "Orders",
    locale === "de" ? "Umsatz" : locale === "tr" ? "Gelir" : locale === "fr" ? "Chiffre d'affaires" : locale === "es" ? "Ingresos" : locale === "it" ? "Fatturato" : "Revenue",
    locale === "de" ? "Performance" : locale === "tr" ? "Performans" : locale === "fr" ? "Performance" : locale === "es" ? "Rendimiento" : locale === "it" ? "Performance" : "Performance",
  ];

  return (
    <Page
      title="Attribution"
      subtitle={locale === "de" ? "Werbeleistung & Umsatz je Kampagne" : locale === "tr" ? "Reklam performansı & kampanya başına gelir" : locale === "fr" ? "Performance publicitaire & chiffre d'affaires par campagne" : locale === "es" ? "Rendimiento publicitario & ingresos por campaña" : locale === "it" ? "Performance pubblicitaria & fatturato per campagna" : "Ad performance & revenue per campaign"}
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
                label={locale === "de" ? "Zeitraum" : locale === "tr" ? "Dönem" : locale === "fr" ? "Période" : locale === "es" ? "Período" : locale === "it" ? "Periodo" : "Period"}
                options={DATE_PRESETS}
                value={datePreset}
                onChange={setDatePreset}
              />
            </div>
            <div style={{ flex: "1 1 200px" }}>
              <Select
                label={locale === "de" ? "Kampagne" : locale === "tr" ? "Kampanya" : locale === "fr" ? "Campagne" : locale === "es" ? "Campaña" : locale === "it" ? "Campagna" : "Campaign"}
                options={campaignOptions}
                value={filterCampaign}
                onChange={setFilterCampaign}
              />
            </div>
            <div style={{ flex: "1 1 200px" }}>
              <Select
                label={locale === "de" ? "Attributionsmodell" : locale === "tr" ? "Atıf modeli" : locale === "fr" ? "Modèle d'attribution" : locale === "es" ? "Modelo de atribución" : locale === "it" ? "Modello di attribuzione" : "Attribution model"}
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
              <Spinner size="large" accessibilityLabel={ui.loading} />
              <p style={{ marginTop: 16, color: "#64748b", fontSize: 14 }}>{locale === "de" ? "Attributionsdaten werden geladen …" : locale === "tr" ? "Atıf verileri yükleniyor…" : locale === "fr" ? "Chargement des données d'attribution…" : locale === "es" ? "Cargando datos de atribución…" : locale === "it" ? "Caricamento dati di attribuzione…" : "Loading attribution data…"}</p>
            </div>
          </Card>
        ) : (
          <>
            {!hasRealData && (
              <Banner tone="info">
                {locale === "de" ? "Noch keine Klick- und Konversionsdaten. Sobald Kampagnen aktiv sind und Traffic erzeugt wird, erscheinen hier die Auswertungen." : locale === "tr" ? "Henüz tıklama ve dönüşüm verisi yok. Kampanyalar aktif olup trafik oluşturduğunda burada raporlar görünecek." : locale === "fr" ? "Pas encore de données de clics et de conversions. Dès que les campagnes sont actives et génèrent du trafic, les rapports apparaîtront ici." : locale === "es" ? "Aún no hay datos de clics y conversiones. En cuanto las campañas estén activas y generen tráfico, los informes aparecerán aquí." : locale === "it" ? "Ancora nessun dato di clic e conversioni. Non appena le campagne saranno attive e genereranno traffico, i report appariranno qui." : "No click and conversion data yet. Once campaigns are active and generating traffic, reports will appear here."}
              </Banner>
            )}

            {/* KPI Summary */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
              <KpiCard label={locale === "de" ? "Ausgaben" : locale === "tr" ? "Harcama" : locale === "fr" ? "Dépenses" : locale === "es" ? "Gasto" : locale === "it" ? "Spesa" : "Spend"} value={hasRealData ? fmtEur(totals.spend) : "—"} sub={`${DATE_PRESETS.find(d => d.value === datePreset)?.label}`} />
              <KpiCard label={locale === "de" ? "Einblendungen" : locale === "tr" ? "Gösterimler" : locale === "fr" ? "Impressions" : locale === "es" ? "Impresiones" : locale === "it" ? "Impressioni" : "Impressions"} value={hasRealData ? fmt(totals.impressions) : "—"} />
              <KpiCard label={locale === "de" ? "Klicks" : locale === "tr" ? "Tıklamalar" : locale === "fr" ? "Clics" : locale === "es" ? "Clics" : locale === "it" ? "Clic" : "Clicks"} value={hasRealData ? fmt(totals.clicks) : "—"} sub={totalCtr ? `CTR ${totalCtr} %` : undefined} />
              <KpiCard label={locale === "de" ? "Bestellungen" : locale === "tr" ? "Siparişler" : locale === "fr" ? "Commandes" : locale === "es" ? "Pedidos" : locale === "it" ? "Ordini" : "Orders"} value={hasRealData ? fmt(totals.orders) : "—"} />
              <KpiCard label={locale === "de" ? "Umsatz" : locale === "tr" ? "Gelir" : locale === "fr" ? "Chiffre d'affaires" : locale === "es" ? "Ingresos" : locale === "it" ? "Fatturato" : "Revenue"} value={hasRealData ? fmtEur(totals.revenue) : "—"} accent="#0ea5e9" />
              <KpiCard
                label="ACoS"
                value={hasRealData && totalAcos ? `${totalAcos} %` : "—"}
                sub={totalRoas ? `ROAS ${totalRoas}×` : undefined}
                accent={totalAcos ? (parseFloat(totalAcos) <= 30 ? "#15803d" : parseFloat(totalAcos) <= 60 ? "#b45309" : "#b91c1c") : undefined}
              />
            </div>

            {/* Attribution Model Info */}
            <div style={{ padding: "10px 16px", borderRadius: 12, background: "#f8fafc", border: "1px solid #e2e8f0", fontSize: 13, color: "#475569" }}>
              <strong>{locale === "de" ? "Modell" : locale === "tr" ? "Model" : locale === "fr" ? "Modèle" : locale === "es" ? "Modelo" : locale === "it" ? "Modello" : "Model"}:</strong>{" "}
              {model === "last_click" && (locale === "de" ? "Letzter Klick — der letzte Klick vor dem Kauf erhält 100 % der Attribution." : locale === "tr" ? "Son Tıklama — satın almadan önceki son tıklama %100 atıf alır." : locale === "fr" ? "Dernier clic — le dernier clic avant l'achat reçoit 100 % de l'attribution." : locale === "es" ? "Último clic — el último clic antes de la compra recibe el 100 % de la atribución." : locale === "it" ? "Ultimo clic — l'ultimo clic prima dell'acquisto riceve il 100 % dell'attribuzione." : "Last click — the last click before purchase receives 100 % of attribution.")}
              {model === "first_click" && (locale === "de" ? "Erster Klick — der erste Klick einer Session erhält 100 % der Attribution." : locale === "tr" ? "İlk Tıklama — bir oturumun ilk tıklaması %100 atıf alır." : locale === "fr" ? "Premier clic — le premier clic d'une session reçoit 100 % de l'attribution." : locale === "es" ? "Primer clic — el primer clic de una sesión recibe el 100 % de la atribución." : locale === "it" ? "Primo clic — il primo clic di una sessione riceve il 100 % dell'attribuzione." : "First click — the first click of a session receives 100 % of attribution.")}
              {model === "linear" && (locale === "de" ? "Linear — alle Klicks im Conversion-Pfad erhalten gleichmäßig Attribution." : locale === "tr" ? "Doğrusal — dönüşüm yolundaki tüm tıklamalar eşit atıf alır." : locale === "fr" ? "Linéaire — tous les clics du chemin de conversion reçoivent une attribution égale." : locale === "es" ? "Lineal — todos los clics del camino de conversión reciben atribución igualitaria." : locale === "it" ? "Lineare — tutti i clic nel percorso di conversione ricevono attribuzione uguale." : "Linear — all clicks in the conversion path receive equal attribution.")}
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
                  {tableHeaders.map((h) => (
                    <span key={h} style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      {h}
                    </span>
                  ))}
                </div>
                {rows.map((row) => (
                  <CampaignRow key={row.id} row={row} maxClicks={maxClicks} maxOrders={maxOrders} locale={locale} />
                ))}
              </Card>
            )}

            {rows.length === 0 && (
              <Card>
                <div style={{ padding: "48px 32px", textAlign: "center" }}>
                  <Text tone="subdued" as="p">{locale === "de" ? "Keine Kampagnendaten für den gewählten Zeitraum." : locale === "tr" ? "Seçilen dönem için kampanya verisi yok." : locale === "fr" ? "Aucune donnée de campagne pour la période sélectionnée." : locale === "es" ? "Sin datos de campaña para el período seleccionado." : locale === "it" ? "Nessun dato di campagna per il periodo selezionato." : "No campaign data for the selected period."}</Text>
                </div>
              </Card>
            )}

            {/* Attribution Window Info */}
            <div style={{ padding: "12px 16px", borderRadius: 12, border: "1px solid #e2e8f0", background: "#fff", fontSize: 12, color: "#94a3b8" }}>
              {locale === "de" ? "Attributionsfenster: 7 Tage nach Klick · 1 Tag nach Einblendung." : locale === "tr" ? "Atıf penceresi: tıklamadan sonra 7 gün · gösterimden sonra 1 gün." : locale === "fr" ? "Fenêtre d'attribution : 7 jours après le clic · 1 jour après l'impression." : locale === "es" ? "Ventana de atribución: 7 días tras el clic · 1 día tras la impresión." : locale === "it" ? "Finestra di attribuzione: 7 giorni dopo il clic · 1 giorno dopo l'impressione." : "Attribution window: 7 days after click · 1 day after impression."}
              {isSuperuser && (" " + (locale === "de" ? "Superuser sieht alle Verkäufer-Kampagnen zusammen." : locale === "tr" ? "Süper kullanıcı tüm satıcı kampanyalarını birlikte görür." : locale === "fr" ? "Le superutilisateur voit toutes les campagnes vendeur ensemble." : locale === "es" ? "El superusuario ve todas las campañas de vendedores juntas." : locale === "it" ? "Il superutente vede tutte le campagne dei venditori insieme." : "Superuser sees all seller campaigns together."))}
            </div>
          </>
        )}
      </BlockStack>
    </Page>
  );
}
