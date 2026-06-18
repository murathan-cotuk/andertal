"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { useLocale } from "next-intl";
import { getUI } from "@/lib/ui-strings";
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

function TrendInline({ pct, locale }) {
  if (pct === null || pct === undefined) {
    return (
      <Text as="span" variant="bodySm" tone="subdued">
        —
      </Text>
    );
  }
  const positive = pct >= 0;
  const vsPrev =
    locale === "en" ? "vs. prev. period" :
    locale === "tr" ? "önceki dönem" :
    locale === "fr" ? "vs. période préc." :
    locale === "es" ? "vs. período ant." :
    locale === "it" ? "vs. periodo prec." :
    "vs. Vorperiode";
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

function KpiCardPolaris({ label, value, trend, source, locale }) {
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
          <TrendInline pct={trend} locale={locale} />
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

function fmtPctRatio(ratio) {
  if (ratio == null || Number.isNaN(ratio)) return "—";
  return `${(ratio * 100).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %`;
}

function fmtRoas(ratio) {
  if (ratio == null || Number.isNaN(ratio)) return "—";
  return `${Number(ratio).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}×`;
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const t = useTranslations("nav");
  const router = useRouter();
  const locale = useLocale();
  const ui = getUI(locale);
  const [isSuperuser, setIsSuperuser] = useState(false);
  const [range, setRange] = useState("last_30");
  const [allOrders, setAllOrders] = useState([]);
  const [marketing, setMarketing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Locale-aware date range labels
  const dateRangeLabels = useMemo(() => ({
    this_week:
      locale === "en" ? "This week" :
      locale === "tr" ? "Bu hafta" :
      locale === "fr" ? "Cette semaine" :
      locale === "es" ? "Esta semana" :
      locale === "it" ? "Questa settimana" :
      "Diese Woche",
    last_7:
      locale === "en" ? "Last 7 days" :
      locale === "tr" ? "Son 7 gün" :
      locale === "fr" ? "7 derniers jours" :
      locale === "es" ? "Últimos 7 días" :
      locale === "it" ? "Ultimi 7 giorni" :
      "Letzten 7 Tage",
    this_month:
      locale === "en" ? "This month" :
      locale === "tr" ? "Bu ay" :
      locale === "fr" ? "Ce mois-ci" :
      locale === "es" ? "Este mes" :
      locale === "it" ? "Questo mese" :
      "Diesen Monat",
    last_30:
      locale === "en" ? "Last 30 days" :
      locale === "tr" ? "Son 30 gün" :
      locale === "fr" ? "30 derniers jours" :
      locale === "es" ? "Últimos 30 días" :
      locale === "it" ? "Ultimi 30 giorni" :
      "Letzten 30 Tage",
    last_year:
      locale === "en" ? "Last year" :
      locale === "tr" ? "Geçen yıl" :
      locale === "fr" ? "L'année dernière" :
      locale === "es" ? "El año pasado" :
      locale === "it" ? "L'anno scorso" :
      "Letztes Jahr",
    all: ui.all,
  }), [locale, ui]);

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
      setError(e?.message || (
        locale === "en" ? "Error loading orders" :
        locale === "tr" ? "Siparişler yüklenirken hata oluştu" :
        locale === "fr" ? "Erreur lors du chargement des commandes" :
        locale === "es" ? "Error al cargar los pedidos" :
        locale === "it" ? "Errore durante il caricamento degli ordini" :
        "Fehler beim Laden der Bestellungen"
      ));
    } finally {
      setLoading(false);
    }
  }, [rangeBounds, locale]);

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
      base = groupByDay(allOrders, minDate, maxDate);
    } else if (start && end) {
      base = groupByDay(currentOrders, start, end);
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
  }, [currentOrders, range, allOrders, start, end, marketing]);

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

  // Locale-aware KPI labels
  const labelRevenue =
    locale === "en" ? "Revenue" :
    locale === "tr" ? "Ciro" :
    locale === "fr" ? "Chiffre d'affaires" :
    locale === "es" ? "Ingresos" :
    locale === "it" ? "Fatturato" :
    "Umsatz";

  const labelOrders = ui.orders;

  const labelAvgOrder =
    locale === "en" ? "Avg. order value" :
    locale === "tr" ? "Ort. sipariş değeri" :
    locale === "fr" ? "Valeur moy. commande" :
    locale === "es" ? "Valor medio de pedido" :
    locale === "it" ? "Valore medio ordine" :
    "Ø Bestellwert";

  const labelCustomers =
    locale === "en" ? "Customers (Emails)" :
    locale === "tr" ? "Müşteriler (E-postalar)" :
    locale === "fr" ? "Clients (E-mails)" :
    locale === "es" ? "Clientes (Correos)" :
    locale === "it" ? "Clienti (Email)" :
    "Kunden (E-Mails)";

  const labelImpressions = "Impressions";

  const labelClicks =
    locale === "en" ? "Clicks" :
    locale === "tr" ? "Tıklamalar" :
    locale === "fr" ? "Clics" :
    locale === "es" ? "Clics" :
    locale === "it" ? "Clic" :
    "Klicks";

  const labelConversion = "Conversion";

  const labelCart =
    locale === "en" ? "Cart" :
    locale === "tr" ? "Sepet" :
    locale === "fr" ? "Panier" :
    locale === "es" ? "Carrito" :
    locale === "it" ? "Carrello" :
    "Warenkorb";

  const labelRevenueMarketing =
    locale === "en" ? "Revenue (Marketing)" :
    locale === "tr" ? "Ciro (Pazarlama)" :
    locale === "fr" ? "Chiffre d'affaires (Marketing)" :
    locale === "es" ? "Ingresos (Marketing)" :
    locale === "it" ? "Fatturato (Marketing)" :
    "Umsatz (Marketing)";

  const labelNoAdSpend =
    locale === "en" ? "No ad spend recorded" :
    locale === "tr" ? "Reklam harcaması yok" :
    locale === "fr" ? "Aucune dépense publicitaire enregistrée" :
    locale === "es" ? "Sin gasto publicitario registrado" :
    locale === "it" ? "Nessuna spesa pubblicitaria registrata" :
    "Keine Werbeausgaben erfasst";

  const labelAdSpend =
    locale === "en" ? "Ad spend" :
    locale === "tr" ? "Reklam harcaması" :
    locale === "fr" ? "Dépenses publicitaires" :
    locale === "es" ? "Gasto publicitario" :
    locale === "it" ? "Spesa pubblicitaria" :
    "Ausgaben";

  const labelPaidOrders =
    locale === "en" ? "Paid orders" :
    locale === "tr" ? "Ödenen siparişler" :
    locale === "fr" ? "Commandes payées" :
    locale === "es" ? "Pedidos pagados" :
    locale === "it" ? "Ordini pagati" :
    "Bezahlte Bestellungen";

  const labelChartLoading =
    locale === "en" ? "Loading chart…" :
    locale === "tr" ? "Grafik yükleniyor…" :
    locale === "fr" ? "Chargement du graphique…" :
    locale === "es" ? "Cargando gráfico…" :
    locale === "it" ? "Caricamento grafico…" :
    "Diagramm wird geladen…";

  const labelRevenueHistory =
    locale === "en" ? "Revenue history" :
    locale === "tr" ? "Ciro geçmişi" :
    locale === "fr" ? "Historique du chiffre d'affaires" :
    locale === "es" ? "Historial de ingresos" :
    locale === "it" ? "Storico fatturato" :
    "Umsatzverlauf";

  const labelNoDataPeriod =
    locale === "en" ? "No data for the selected period" :
    locale === "tr" ? "Seçili dönem için veri yok" :
    locale === "fr" ? "Aucune donnée pour la période sélectionnée" :
    locale === "es" ? "Sin datos para el período seleccionado" :
    locale === "it" ? "Nessun dato per il periodo selezionato" :
    "Keine Daten für den gewählten Zeitraum";

  const labelDailyRevenue =
    locale === "en" ? "Daily revenue" :
    locale === "tr" ? "Günlük ciro" :
    locale === "fr" ? "Chiffre d'affaires journalier" :
    locale === "es" ? "Ingresos diarios" :
    locale === "it" ? "Fatturato giornaliero" :
    "Tagesumsatz";

  const labelRecentOrders =
    locale === "en" ? "Recent orders" :
    locale === "tr" ? "Son siparişler" :
    locale === "fr" ? "Dernières commandes" :
    locale === "es" ? "Pedidos recientes" :
    locale === "it" ? "Ordini recenti" :
    "Letzte Bestellungen";

  const labelTotal =
    locale === "en" ? "total" :
    locale === "tr" ? "toplam" :
    locale === "fr" ? "total" :
    locale === "es" ? "total" :
    locale === "it" ? "totale" :
    "gesamt";

  const labelNoOrdersPeriod =
    locale === "en" ? "No orders in the selected period" :
    locale === "tr" ? "Seçili dönemde sipariş yok" :
    locale === "fr" ? "Aucune commande dans la période sélectionnée" :
    locale === "es" ? "Sin pedidos en el período seleccionado" :
    locale === "it" ? "Nessun ordine nel periodo selezionato" :
    "Keine Bestellungen im gewählten Zeitraum";

  const labelOpen =
    locale === "en" ? "Open" :
    locale === "tr" ? "Aç" :
    locale === "fr" ? "Ouvrir" :
    locale === "es" ? "Abrir" :
    locale === "it" ? "Apri" :
    "Öffnen";

  const labelTopCustomers =
    locale === "en" ? "Top Customers" :
    locale === "tr" ? "En iyi müşteriler" :
    locale === "fr" ? "Meilleurs clients" :
    locale === "es" ? "Mejores clientes" :
    locale === "it" ? "Migliori clienti" :
    "Top Kunden";

  const labelByRevenuePeriod =
    locale === "en" ? "By revenue in period" :
    locale === "tr" ? "Dönemdeki ciroya göre" :
    locale === "fr" ? "Par chiffre d'affaires sur la période" :
    locale === "es" ? "Por ingresos en el período" :
    locale === "it" ? "Per fatturato nel periodo" :
    "Nach Umsatz im Zeitraum";

  const labelNoDataAvailable =
    locale === "en" ? "No data available" :
    locale === "tr" ? "Veri mevcut değil" :
    locale === "fr" ? "Aucune donnée disponible" :
    locale === "es" ? "Sin datos disponibles" :
    locale === "it" ? "Nessun dato disponibile" :
    "Keine Daten verfügbar";

  const labelOrder =
    locale === "en" ? "order" :
    locale === "tr" ? "sipariş" :
    locale === "fr" ? "commande" :
    locale === "es" ? "pedido" :
    locale === "it" ? "ordine" :
    "Bestellung";

  const labelOrders2 =
    locale === "en" ? "orders" :
    locale === "tr" ? "sipariş" :
    locale === "fr" ? "commandes" :
    locale === "es" ? "pedidos" :
    locale === "it" ? "ordini" :
    "Bestellungen";

  const labelPeriod =
    locale === "en" ? "Period" :
    locale === "tr" ? "Dönem" :
    locale === "fr" ? "Période" :
    locale === "es" ? "Período" :
    locale === "it" ? "Periodo" :
    "Zeitraum";

  const labelOrdersLoaded =
    locale === "en" ? "Orders loaded" :
    locale === "tr" ? "Yüklenen siparişler" :
    locale === "fr" ? "Commandes chargées" :
    locale === "es" ? "Pedidos cargados" :
    locale === "it" ? "Ordini caricati" :
    "Bestellungen geladen";

  const labelInFilter =
    locale === "en" ? "In filter" :
    locale === "tr" ? "Filtrede" :
    locale === "fr" ? "Dans le filtre" :
    locale === "es" ? "En el filtro" :
    locale === "it" ? "Nel filtro" :
    "Im Filter";

  const labelRevenuePaidActive =
    locale === "en" ? "Revenue (paid/active)" :
    locale === "tr" ? "Ciro (ödendi/aktif)" :
    locale === "fr" ? "Chiffre d'affaires (payé/actif)" :
    locale === "es" ? "Ingresos (pagado/activo)" :
    locale === "it" ? "Fatturato (pagato/attivo)" :
    "Umsatz (bezahlt/aktiv)";

  const labelMarketingTitle =
    locale === "en" ? "Marketing & Performance" :
    locale === "tr" ? "Pazarlama & Performans" :
    locale === "fr" ? "Marketing & Performance" :
    locale === "es" ? "Marketing & Rendimiento" :
    locale === "it" ? "Marketing & Performance" :
    "Marketing & Performance";

  const labelMarketingSubtitle =
    locale === "en" ? "Impressions, clicks, conversion and ROAS for the selected period" :
    locale === "tr" ? "Seçili dönem için gösterimler, tıklamalar, dönüşüm ve ROAS" :
    locale === "fr" ? "Impressions, clics, conversion et ROAS pour la période sélectionnée" :
    locale === "es" ? "Impresiones, clics, conversión y ROAS para el período seleccionado" :
    locale === "it" ? "Impressioni, clic, conversione e ROAS nel periodo selezionato" :
    "Impressions, Klicks, Conversion und ROAS im gewählten Zeitraum";

  const orderTableHeadings = [
    ui.colNumber,
    ui.colDate,
    ui.colCustomer,
    ui.colAmount,
    locale === "en" ? "Order" :
    locale === "tr" ? "Sipariş" :
    locale === "fr" ? "Commande" :
    locale === "es" ? "Pedido" :
    locale === "it" ? "Ordine" :
    "Auftrag",
    locale === "en" ? "Payment" :
    locale === "tr" ? "Ödeme" :
    locale === "fr" ? "Paiement" :
    locale === "es" ? "Pago" :
    locale === "it" ? "Pagamento" :
    "Zahlung",
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
          {labelOpen}
        </Button>,
      ];
    });
  }, [recentOrders, router, labelOpen]);

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
                    label={labelRevenue}
                    value={fmtEur(currStats.revenue)}
                    trend={trends.revenue}
                    source={MoneyIcon}
                    locale={locale}
                  />
                  <KpiCardPolaris
                    label={labelOrders}
                    value={currStats.count.toLocaleString("de-DE")}
                    trend={trends.count}
                    source={OrderIcon}
                    locale={locale}
                  />
                  <KpiCardPolaris
                    label={labelAvgOrder}
                    value={fmtEur(currStats.avg)}
                    trend={trends.avg}
                    source={ChartLineIcon}
                    locale={locale}
                  />
                  <KpiCardPolaris
                    label={labelCustomers}
                    value={currStats.customers.toLocaleString("de-DE")}
                    trend={trends.customers}
                    source={PersonIcon}
                    locale={locale}
                  />
                </>
              )}
            </div>
          </BlockStack>
        </Layout.Section>

        <Layout.Section>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">
              {labelMarketingTitle}
            </Text>
            <Text as="p" variant="bodySm" tone="subdued">
              {labelMarketingSubtitle}
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
                    label={labelImpressions}
                    value={hasMarketingData ? (marketingTotals.impressions || 0).toLocaleString("de-DE") : "—"}
                  />
                  <MarketingKpiCard
                    label={labelClicks}
                    value={hasMarketingData ? (marketingTotals.clicks || 0).toLocaleString("de-DE") : "—"}
                    sub={marketingDerived.ctr != null ? `CTR ${fmtPctRatio(marketingDerived.ctr)}` : undefined}
                  />
                  <MarketingKpiCard
                    label={labelConversion}
                    value={hasMarketingData ? (marketingTotals.orders || 0).toLocaleString("de-DE") : "—"}
                    sub={marketingDerived.conversion_rate != null ? `Rate ${fmtPctRatio(marketingDerived.conversion_rate)}` : undefined}
                  />
                  <MarketingKpiCard
                    label="ROAS"
                    value={marketingDerived.roas != null ? fmtRoas(marketingDerived.roas) : "—"}
                    sub={
                      marketingTotals.spend_cents > 0
                        ? `${labelAdSpend} ${fmtEur(marketingTotals.spend_cents)}`
                        : labelNoAdSpend
                    }
                  />
                  <MarketingKpiCard
                    label={labelCart}
                    value={hasMarketingData ? (marketingTotals.add_to_cart || 0).toLocaleString("de-DE") : "—"}
                    sub="Add-to-cart Events"
                  />
                  <MarketingKpiCard
                    label={labelRevenueMarketing}
                    value={hasMarketingData ? fmtEur(marketingTotals.revenue_cents) : "—"}
                    sub={labelPaidOrders}
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
                  {labelChartLoading}
                </Text>
              </div>
            ) : chartData.length === 0 ? (
              <BlockStack gap="200">
                <Text as="h2" variant="headingMd">{labelRevenueHistory}</Text>
                <Text as="p" tone="subdued">{labelNoDataPeriod}</Text>
              </BlockStack>
            ) : (
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">
                  {`${labelDailyRevenue} — ${selectedRangeLabel}`}
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
                  <Text as="h2" variant="headingMd">{labelRecentOrders}</Text>
                  <Text as="p" variant="bodySm" tone="subdued">{currentOrders.length} {labelTotal}</Text>
                </InlineStack>
                {loading ? (
                  <SkeletonBodyText lines={6} />
                ) : recentOrders.length === 0 ? (
                  <Text as="p" tone="subdued" alignment="center">{labelNoOrdersPeriod}</Text>
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
                  <Text as="h2" variant="headingMd">{labelTopCustomers}</Text>
                  <Text as="p" variant="bodySm" tone="subdued">{labelByRevenuePeriod}</Text>
                </BlockStack>
                {loading ? (
                  <SkeletonBodyText lines={5} />
                ) : topByRevenue.length === 0 ? (
                  <Text as="p" tone="subdued" alignment="center">{labelNoDataAvailable}</Text>
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
                                {item.count} {item.count !== 1 ? labelOrders2 : labelOrder}
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
                  <Text as="span" fontWeight="semibold" tone="subdued">{labelPeriod}:</Text> {selectedRangeLabel}
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  <Text as="span" fontWeight="semibold" tone="subdued">{labelOrdersLoaded}:</Text> {allOrders.length}
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  <Text as="span" fontWeight="semibold" tone="subdued">{labelInFilter}:</Text> {currentOrders.length}
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  <Text as="span" fontWeight="semibold" tone="subdued">{labelRevenuePaidActive}:</Text> {fmtEur(currStats.revenue)}
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
