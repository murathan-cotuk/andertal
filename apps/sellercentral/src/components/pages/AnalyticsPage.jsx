"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { useLocale } from "next-intl";
import { getUI } from "@/lib/ui-strings";
import { statusLabel } from "@/lib/status-labels";
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
import { useLt, dateLocaleFor } from "@/lib/locale-text";
import RevenueAreaChart from "@/components/dashboard/RevenueAreaChart";

// ─── Constants ───────────────────────────────────────────────────────────────

const BRAND = "#ff971c";

// DATE_RANGES values are API params — labels are resolved at render time via locale
const DATE_RANGE_VALUES = [
  "this_week",
  "last_7",
  "this_month",
  "last_30",
  "last_year",
  "all",
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtEur(cents, locale) {
  const val = (Number(cents || 0) / 100).toLocaleString(dateLocaleFor(locale), {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `€ ${val}`;
}

function fmtDate(d, locale) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString(dateLocaleFor(locale), {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function fmtShortDate(d, locale) {
  if (!d) return "";
  return new Date(d).toLocaleDateString(dateLocaleFor(locale), { day: "2-digit", month: "2-digit" });
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

function groupByDay(orders, start, end, locale) {
  const days = [];
  const d = new Date(start);
  const endTs = new Date(end.getTime() + 86399999);
  while (d <= endTs) {
    days.push({
      date: new Date(d),
      label: fmtShortDate(d, locale),
      revenue: 0,
      orders: 0,
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
    if (entry) {
      entry.revenue += Number(o.total_cents || 0);
      entry.orders += 1;
    }
  }

  if (days.length > 60) {
    const weeks = [];
    for (let i = 0; i < days.length; i += 7) {
      const chunk = days.slice(i, i + 7);
      weeks.push({
        date: chunk[0].date,
        label: chunk[0].label,
        revenue: chunk.reduce((s, x) => s + x.revenue, 0),
        orders: chunk.reduce((s, x) => s + x.orders, 0),
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

function TrendInline({ pct, vsPrevLabel }) {
  if (pct === null || pct === undefined) {
    return (
      <Text as="span" variant="bodySm" tone="subdued">
        —
      </Text>
    );
  }
  const positive = pct >= 0;
  const vsPrev = vsPrevLabel;
  return (
    <InlineStack gap="200" blockAlign="center" wrap>
      <Text as="span" variant="bodySm" fontWeight="semibold" tone={positive ? "success" : "critical"}>
        {positive ? "▲" : "▼"} {Math.abs(pct)}%
      </Text>
      <Text as="span" tone="subdued" variant="bodySm">
        {vsPrev}
      </Text>
    </InlineStack>
  );
}

function KpiCardPolaris({ label, value, trend, source, vsPrevLabel }) {
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
          <TrendInline pct={trend} vsPrevLabel={vsPrevLabel} />
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

function MarketingKpiCard({ label, value, sub }) {
  return (
    <Card padding="400">
      <BlockStack gap="100">
        <Text as="p" variant="bodySm" fontWeight="semibold" tone="subdued">
          {label}
        </Text>
        <Text as="p" variant="headingMd">
          {value}
        </Text>
        {sub && (
          <Text as="p" variant="bodySm" tone="subdued">
            {sub}
          </Text>
        )}
      </BlockStack>
    </Card>
  );
}

function fmtPctRatio(ratio, locale) {
  if (ratio == null || Number.isNaN(ratio)) return "—";
  return `${(ratio * 100).toLocaleString(dateLocaleFor(locale), { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %`;
}

function fmtRoas(ratio, locale) {
  if (ratio == null || Number.isNaN(ratio)) return "—";
  return `${Number(ratio).toLocaleString(dateLocaleFor(locale), { minimumFractionDigits: 2, maximumFractionDigits: 2 })}×`;
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const t = useTranslations("nav");
  const router = useRouter();
  const locale = useLocale();
  const lt = useLt();
  const dateLoc = dateLocaleFor(locale);
  const ui = getUI(locale);
  const [isSuperuser, setIsSuperuser] = useState(false);
  const [range, setRange] = useState("last_30");
  const [allOrders, setAllOrders] = useState([]);
  const [marketing, setMarketing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const dateRangeLabels = useMemo(() => ({
    this_week: lt("This week", "Bu hafta", "Cette semaine", "Esta semana", "Questa settimana", "Diese Woche"),
    last_7: lt("Last 7 days", "Son 7 gün", "7 derniers jours", "Últimos 7 días", "Ultimi 7 giorni", "Letzten 7 Tage"),
    this_month: lt("This month", "Bu ay", "Ce mois-ci", "Este mes", "Questo mese", "Diesen Monat"),
    last_30: lt("Last 30 days", "Son 30 gün", "30 derniers jours", "Últimos 30 días", "Ultimi 30 giorni", "Letzten 30 Tage"),
    last_year: lt("Last year", "Geçen yıl", "L'année dernière", "El año pasado", "L'anno scorso", "Letztes Jahr"),
    all: ui.all,
  }), [lt, ui.all]);

  const DATE_RANGES = useMemo(
    () => DATE_RANGE_VALUES.map((value) => ({ value, label: dateRangeLabels[value] })),
    [dateRangeLabels]
  );

  const rangeBounds = useMemo(() => {
    const { start, end } = getDateRange(range);
    if (range === "all") {
      const dates = allOrders.map((o) => new Date(o.created_at)).filter((d) => !Number.isNaN(d.getTime()));
      const minDate = dates.length ? new Date(Math.min(...dates)) : new Date();
      minDate.setHours(0, 0, 0, 0);
      const maxDate = new Date();
      maxDate.setHours(0, 0, 0, 0);
      return {
        from: minDate.toISOString().slice(0, 10),
        to: maxDate.toISOString().slice(0, 10),
      };
    }
    return {
      from: start.toISOString().slice(0, 10),
      to: end.toISOString().slice(0, 10),
    };
  }, [range, allOrders]);

  useEffect(() => {
    setIsSuperuser(localStorage.getItem("sellerIsSuperuser") === "true");
  }, []);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const client = getMedusaAdminClient();
      const [ordersData, marketingData] = await Promise.all([
        client.request("/admin-hub/v1/orders?limit=500&sort=created_at_desc"),
        client.getMarketingAnalytics(rangeBounds).catch(() => null),
      ]);
      setAllOrders(Array.isArray(ordersData?.orders) ? ordersData.orders : []);
      setMarketing(marketingData);
    } catch (e) {
      setError(e?.message || lt("Error loading orders", "Siparişler yüklenirken hata oluştu", "Erreur lors du chargement des commandes", "Error al cargar los pedidos", "Errore durante il caricamento degli ordini", "Fehler beim Laden der Bestellungen"));
    } finally {
      setLoading(false);
    }
  }, [rangeBounds, lt]);

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
    let base = [];
    if (range === "all" && allOrders.length > 0) {
      const dates = allOrders.map((o) => new Date(o.created_at)).filter((d) => !Number.isNaN(d.getTime()));
      const minDate = new Date(Math.min(...dates));
      minDate.setHours(0, 0, 0, 0);
      const maxDate = new Date();
      maxDate.setHours(0, 0, 0, 0);
      base = groupByDay(allOrders, minDate, maxDate, locale);
    } else if (start && end) {
      base = groupByDay(currentOrders, start, end, locale);
    }
    const marketingByDate = new Map((marketing?.daily || []).map((d) => [String(d.date).slice(0, 10), d]));
    return base.map((row) => {
      const key = row.date.toISOString().slice(0, 10);
      const m = marketingByDate.get(key);
      return {
        key,
        label: row.label,
        revenue: row.revenue,
        orders: m?.orders ?? row.orders ?? 0,
        impressions: m?.impressions ?? 0,
        clicks: m?.clicks ?? 0,
      };
    });
  }, [currentOrders, range, allOrders, start, end, marketing, locale]);

  const marketingTotals = marketing?.totals || {};
  const marketingDerived = marketing?.derived || {};
  const hasMarketingData =
    (marketingTotals.impressions || 0) > 0 ||
    (marketingTotals.clicks || 0) > 0 ||
    (marketingTotals.orders || 0) > 0;

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

  const labels = useMemo(() => ({
    vsPrev: lt("vs. prev. period", "önceki dönem", "vs. période préc.", "vs. período ant.", "vs. periodo prec.", "vs. Vorperiode"),
    revenue: lt("Revenue", "Ciro", "Chiffre d'affaires", "Ingresos", "Fatturato", "Umsatz"),
    avgOrder: lt("Avg. order value", "Ort. sipariş değeri", "Valeur moy. commande", "Valor medio de pedido", "Valore medio ordine", "Ø Bestellwert"),
    customers: lt("Customers (Emails)", "Müşteriler (E-postalar)", "Clients (E-mails)", "Clientes (Correos)", "Clienti (Email)", "Kunden (E-Mails)"),
    impressions: lt("Impressions", "Gösterimler", "Impressions", "Impresiones", "Impressioni", "Impressions"),
    clicks: lt("Clicks", "Tıklamalar", "Clics", "Clics", "Clic", "Klicks"),
    conversion: lt("Conversion", "Dönüşüm", "Conversion", "Conversión", "Conversione", "Conversion"),
    cart: lt("Cart", "Sepet", "Panier", "Carrito", "Carrello", "Warenkorb"),
    addToCartEvents: lt("Add-to-cart events", "Sepete ekleme olayları", "Événements ajout au panier", "Eventos de añadir al carrito", "Eventi aggiungi al carrello", "Add-to-cart Events"),
    revenueMarketing: lt("Revenue (Marketing)", "Ciro (Pazarlama)", "Chiffre d'affaires (Marketing)", "Ingresos (Marketing)", "Fatturato (Marketing)", "Umsatz (Marketing)"),
    noAdSpend: lt("No ad spend recorded", "Reklam harcaması yok", "Aucune dépense publicitaire enregistrée", "Sin gasto publicitario registrado", "Nessuna spesa pubblicitaria registrata", "Keine Werbeausgaben erfasst"),
    adSpend: lt("Ad spend", "Reklam harcaması", "Dépenses publicitaires", "Gasto publicitario", "Spesa pubblicitaria", "Ausgaben"),
    paidOrders: lt("Paid orders", "Ödenen siparişler", "Commandes payées", "Pedidos pagados", "Ordini pagati", "Bezahlte Bestellungen"),
    chartLoading: lt("Loading chart…", "Grafik yükleniyor…", "Chargement du graphique…", "Cargando gráfico…", "Caricamento grafico…", "Diagramm wird geladen…"),
    revenueHistory: lt("Revenue history", "Ciro geçmişi", "Historique du chiffre d'affaires", "Historial de ingresos", "Storico fatturato", "Umsatzverlauf"),
    noDataPeriod: lt("No data for the selected period", "Seçili dönem için veri yok", "Aucune donnée pour la période sélectionnée", "Sin datos para el período seleccionado", "Nessun dato per il periodo selezionato", "Keine Daten für den gewählten Zeitraum"),
    dailyRevenue: lt("Daily revenue", "Günlük ciro", "Chiffre d'affaires journalier", "Ingresos diarios", "Fatturato giornaliero", "Tagesumsatz"),
    recentOrders: lt("Recent orders", "Son siparişler", "Dernières commandes", "Pedidos recientes", "Ordini recenti", "Letzte Bestellungen"),
    total: lt("total", "toplam", "total", "total", "totale", "gesamt"),
    noOrdersPeriod: lt("No orders in the selected period", "Seçili dönemde sipariş yok", "Aucune commande dans la période sélectionnée", "Sin pedidos en el período seleccionado", "Nessun ordine nel periodo selezionato", "Keine Bestellungen im gewählten Zeitraum"),
    open: lt("Open", "Aç", "Ouvrir", "Abrir", "Apri", "Öffnen"),
    topCustomers: lt("Top Customers", "En iyi müşteriler", "Meilleurs clients", "Mejores clientes", "Migliori clienti", "Top Kunden"),
    byRevenuePeriod: lt("By revenue in period", "Dönemdeki ciroya göre", "Par chiffre d'affaires sur la période", "Por ingresos en el período", "Per fatturato nel periodo", "Nach Umsatz im Zeitraum"),
    noDataAvailable: lt("No data available", "Veri mevcut değil", "Aucune donnée disponible", "Sin datos disponibles", "Nessun dato disponibile", "Keine Daten verfügbar"),
    order: lt("order", "sipariş", "commande", "pedido", "ordine", "Bestellung"),
    orders2: lt("orders", "sipariş", "commandes", "pedidos", "ordini", "Bestellungen"),
    period: lt("Period", "Dönem", "Période", "Período", "Periodo", "Zeitraum"),
    ordersLoaded: lt("Orders loaded", "Yüklenen siparişler", "Commandes chargées", "Pedidos cargados", "Ordini caricati", "Bestellungen geladen"),
    inFilter: lt("In filter", "Filtrede", "Dans le filtre", "En el filtro", "Nel filtro", "Im Filter"),
    revenuePaidActive: lt("Revenue (paid/active)", "Ciro (ödendi/aktif)", "Chiffre d'affaires (payé/actif)", "Ingresos (pagado/activo)", "Fatturato (pagato/attivo)", "Umsatz (bezahlt/aktiv)"),
    marketingTitle: lt("Marketing & Performance", "Pazarlama & Performans", "Marketing & Performance", "Marketing & Rendimiento", "Marketing & Performance", "Marketing & Performance"),
    marketingSubtitle: lt("Impressions, clicks, conversion and ROAS for the selected period", "Seçili dönem için gösterimler, tıklamalar, dönüşüm ve ROAS", "Impressions, clics, conversion et ROAS pour la période sélectionnée", "Impresiones, clics, conversión y ROAS para el período seleccionado", "Impressioni, clic, conversione e ROAS nel periodo selezionato", "Impressions, Klicks, Conversion und ROAS im gewählten Zeitraum"),
    colOrder: lt("Order", "Sipariş", "Commande", "Pedido", "Ordine", "Auftrag"),
    colPayment: lt("Payment", "Ödeme", "Paiement", "Pago", "Pagamento", "Zahlung"),
    rate: lt("Rate", "Oran", "Taux", "Tasa", "Tasso", "Rate"),
  }), [lt]);

  const orderTableHeadings = [
    ui.colNumber,
    ui.colDate,
    ui.colCustomer,
    ui.colAmount,
    labels.colOrder,
    labels.colPayment,
    "",
  ];

  const orderTableRows = useMemo(() => {
    if (!recentOrders.length) {
      return [];
    }
    return recentOrders.map((o) => {
      const name = [o.first_name, o.last_name].filter(Boolean).join(" ") || o.email || "—";
      return [
        `#${o.order_number || o.id?.slice(-6) || "—"}`,
        fmtDate(o.created_at, locale),
        name,
        fmtEur(o.total_cents, locale),
        <Badge key={`os-${o.id}`} tone={statusToneOrder(o.order_status)}>{o.order_status ? statusLabel(locale, o.order_status) : "—"}</Badge>,
        <Badge key={`ps-${o.id}`} tone={statusTonePayment(o.payment_status)}>{o.payment_status ? statusLabel(locale, o.payment_status) : "—"}</Badge>,
        <Button
          key={`ac-${o.id}`}
          variant="plain"
          size="slim"
          onClick={() => o.id && router.push(`/orders/${o.id}`)}
        >
          {labels.open}
        </Button>,
      ];
    });
  }, [recentOrders, router, labels.open, locale]);

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
        { content: ui.refresh, onAction: loadOrders, disabled: loading },
      ]}
    >
      <Layout>
        {error && (
          <Layout.Section>
            <Banner tone="critical" onDismiss={() => setError("")} action={{ content: ui.retry, onAction: loadOrders }}>
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
                    label={labels.revenue}
                    value={fmtEur(currStats.revenue, locale)}
                    trend={trends.revenue}
                    source={MoneyIcon}
                    vsPrevLabel={labels.vsPrev}
                  />
                  <KpiCardPolaris
                    label={ui.orders}
                    value={currStats.count.toLocaleString(dateLoc)}
                    trend={trends.count}
                    source={OrderIcon}
                    vsPrevLabel={labels.vsPrev}
                  />
                  <KpiCardPolaris
                    label={labels.avgOrder}
                    value={fmtEur(currStats.avg, locale)}
                    trend={trends.avg}
                    source={ChartLineIcon}
                    vsPrevLabel={labels.vsPrev}
                  />
                  <KpiCardPolaris
                    label={labels.customers}
                    value={currStats.customers.toLocaleString(dateLoc)}
                    trend={trends.customers}
                    source={PersonIcon}
                    vsPrevLabel={labels.vsPrev}
                  />
                </>
              )}
            </div>
          </BlockStack>
        </Layout.Section>

        <Layout.Section>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">
              {labels.marketingTitle}
            </Text>
            <Text as="p" variant="bodySm" tone="subdued">
              {labels.marketingSubtitle}
            </Text>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
                gap: 16,
              }}
            >
              {loading ? (
                <>
                  <KpiSkeleton />
                  <KpiSkeleton />
                  <KpiSkeleton />
                  <KpiSkeleton />
                  <KpiSkeleton />
                  <KpiSkeleton />
                </>
              ) : (
                <>
                  <MarketingKpiCard
                    label={labels.impressions}
                    value={hasMarketingData ? (marketingTotals.impressions || 0).toLocaleString(dateLoc) : "—"}
                  />
                  <MarketingKpiCard
                    label={labels.clicks}
                    value={hasMarketingData ? (marketingTotals.clicks || 0).toLocaleString(dateLoc) : "—"}
                    sub={marketingDerived.ctr != null ? `CTR ${fmtPctRatio(marketingDerived.ctr, locale)}` : undefined}
                  />
                  <MarketingKpiCard
                    label={labels.conversion}
                    value={hasMarketingData ? (marketingTotals.orders || 0).toLocaleString(dateLoc) : "—"}
                    sub={marketingDerived.conversion_rate != null ? `${labels.rate} ${fmtPctRatio(marketingDerived.conversion_rate, locale)}` : undefined}
                  />
                  <MarketingKpiCard
                    label="ROAS"
                    value={marketingDerived.roas != null ? fmtRoas(marketingDerived.roas, locale) : "—"}
                    sub={
                      marketingTotals.spend_cents > 0
                        ? `${labels.adSpend} ${fmtEur(marketingTotals.spend_cents, locale)}`
                        : labels.noAdSpend
                    }
                  />
                  <MarketingKpiCard
                    label={labels.cart}
                    value={hasMarketingData ? (marketingTotals.add_to_cart || 0).toLocaleString(dateLoc) : "—"}
                    sub={labels.addToCartEvents}
                  />
                  <MarketingKpiCard
                    label={labels.revenueMarketing}
                    value={hasMarketingData ? fmtEur(marketingTotals.revenue_cents, locale) : "—"}
                    sub={labels.paidOrders}
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
                  {labels.chartLoading}
                </Text>
              </div>
            ) : chartData.length === 0 ? (
              <BlockStack gap="200">
                <Text as="h2" variant="headingMd">{labels.revenueHistory}</Text>
                <Text as="p" tone="subdued">{labels.noDataPeriod}</Text>
              </BlockStack>
            ) : (
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">
                  {`${labels.dailyRevenue} — ${selectedRangeLabel}`}
                </Text>
                <RevenueAreaChart
                  data={chartData}
                  accent={BRAND}
                  height={240}
                  showClicksLine={hasMarketingData && (marketingTotals.clicks || 0) > 0}
                />
              </BlockStack>
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
                  <Text as="h2" variant="headingMd">{labels.recentOrders}</Text>
                  <Text as="p" variant="bodySm" tone="subdued">{currentOrders.length} {labels.total}</Text>
                </InlineStack>
                {loading ? (
                  <SkeletonBodyText lines={6} />
                ) : recentOrders.length === 0 ? (
                  <Text as="p" tone="subdued" alignment="center">{labels.noOrdersPeriod}</Text>
                ) : (
                  <DataTable
                    columnContentTypes={["text", "text", "text", "numeric", "text", "text", "text"]}
                    headings={orderTableHeadings}
                    rows={orderTableRows}
                  />
                )}
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="400">
                <BlockStack gap="100">
                  <Text as="h2" variant="headingMd">{labels.topCustomers}</Text>
                  <Text as="p" variant="bodySm" tone="subdued">{labels.byRevenuePeriod}</Text>
                </BlockStack>
                {loading ? (
                  <SkeletonBodyText lines={5} />
                ) : topByRevenue.length === 0 ? (
                  <Text as="p" tone="subdued" alignment="center">{labels.noDataAvailable}</Text>
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
                                {fmtEur(item.revenue, locale)}
                              </Text>
                              <Text as="p" variant="bodySm" tone="subdued">
                                {item.count} {item.count !== 1 ? labels.orders2 : labels.order}
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
                  <Text as="span" fontWeight="semibold" tone="subdued">{labels.period}:</Text> {selectedRangeLabel}
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  <Text as="span" fontWeight="semibold" tone="subdued">{labels.ordersLoaded}:</Text> {allOrders.length}
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  <Text as="span" fontWeight="semibold" tone="subdued">{labels.inFilter}:</Text> {currentOrders.length}
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  <Text as="span" fontWeight="semibold" tone="subdued">{labels.revenuePaidActive}:</Text> {fmtEur(currStats.revenue, locale)}
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
