"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Card, Text, BlockStack, InlineStack, Button, Box, Tabs, TextField,
  Select, Banner, Spinner, Divider, Checkbox, Modal,
} from "@shopify/polaris";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";
import { getOrderPdfDownloadUrl, downloadAuthenticatedPdf, downloadAuthenticatedPdfsAsZip } from "@/lib/order-pdf-url";
import { useParams } from "next/navigation";
import { useLocale } from "next-intl";
import { getUI } from "@/lib/ui-strings";
import { dateLocaleFor, lt } from "@/lib/locale-text";
import { userError } from "@/lib/api-error-messages";
import {
  generatePayoutPeriods,
  initialPayoutPeriodKey,
  ALL_PAYOUT_PERIODS_KEY,
} from "@/lib/payout-periods";

function fmtDate(d, locale) {
  if (!d) return "—";
  const loc = dateLocaleFor(locale);
  return new Date(d).toLocaleDateString(loc, { day: "2-digit", month: "2-digit", year: "numeric" });
}
function fmtCents(c, locale) {
  if (c == null || c === "") return "—";
  const loc = dateLocaleFor(locale);
  return (Number(c) / 100).toLocaleString(loc, { style: "currency", currency: "EUR" });
}
function orderTotal(o) {
  return (
    Number(o?.subtotal_cents || 0) +
    Number(o?.shipping_cents || 0) -
    Number(o?.coupon_discount_cents || 0)
  );
}
function customerName(o) {
  return [o?.first_name, o?.last_name].filter(Boolean).join(" ") || o?.email || "—";
}

/**
 * Billing period = 15-day payout window (1–15 / 16–month end), same as Payments.
 */
const PAYOUT_PERIODS = generatePayoutPeriods(24);
const PERIOD_ALL_KEY = ALL_PAYOUT_PERIODS_KEY;

/**
 * Year select + period-within-year select — parent owns `selectedKey`, fully controlled.
 * `allowAllLabel`: when set, prepends an "All periods" option (key PERIOD_ALL_KEY) so callers
 * that don't want a default single-month filter (e.g. Tab 2/3, which show history across periods)
 * can offer an explicit unfiltered state instead of silently falling back to the current month.
 */
function PeriodFilter({ periods, selectedKey, onSelect, yearLabel, periodLabel, allowAllLabel = null }) {
  const isAll = allowAllLabel && selectedKey === PERIOD_ALL_KEY;
  const years = useMemo(() => [...new Set(periods.map((p) => p.year))].sort((a, b) => b - a), [periods]);
  const selected = periods.find((p) => p.key === selectedKey) || periods[0];
  const year = isAll ? years[0] : (selected?.year ?? years[0]);
  const periodsInYear = useMemo(() => periods.filter((p) => p.year === year), [periods, year]);
  const handleYearChange = (v) => {
    const y = Number(v);
    const first = periods.find((p) => p.year === y);
    if (first) onSelect(first.key);
  };
  const periodOptions = [
    ...(allowAllLabel ? [{ label: allowAllLabel, value: PERIOD_ALL_KEY }] : []),
    ...periodsInYear.map((p) => ({ label: p.label, value: p.key })),
  ];
  return (
    <InlineStack gap="200">
      <div style={{ minWidth: 110 }}>
        <Select label={yearLabel} options={years.map((y) => ({ label: String(y), value: String(y) }))} value={String(year)} onChange={handleYearChange} />
      </div>
      <div style={{ minWidth: 240 }}>
        <Select label={periodLabel} options={periodOptions} value={isAll ? PERIOD_ALL_KEY : (selectedKey || "")} onChange={onSelect} />
      </div>
    </InlineStack>
  );
}

const DOC_TYPE_KEYS = [
  { key: "invoice",     uiKey: "invoiceDoc" },
  { key: "lieferschein",uiKey: "deliveryNoteDoc" },
  { key: "versandlabel",uiKey: "shippingLabel" },
  { key: "retoure",     uiKey: "returnDoc" },
];

const DOC_FILE_PREFIX = {
  invoice: "Rechnung",
  lieferschein: "Lieferschein",
  versandlabel: "Versandlabel",
  retoure: "Retoure",
};

function orderHasShipDoc(o) {
  return (
    !!String(o?.sendcloud_label_url || "").trim() ||
    !!String(o?.tracking_number || "").trim() ||
    o?.delivery_status === "versendet" ||
    o?.delivery_status === "zugestellt"
  );
}

function docKindsForOrder(order, docFilter, returnsSet) {
  const wanted = docFilter && docFilter !== "all" ? [docFilter] : DOC_TYPE_KEYS.map((d) => d.key);
  return wanted.filter((kind) => {
    if (kind === "versandlabel") return orderHasShipDoc(order);
    if (kind === "retoure") return returnsSet.has(order.id);
    return true;
  });
}

function DocBtn({ orderId, kind, label, available, locale = "de" }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  if (!available) return <span style={{ color: "#d1d5db", fontSize: 12 }}>—</span>;
  const handleClick = async () => {
    setBusy(true);
    setErr("");
    try {
      await downloadAuthenticatedPdf(getOrderPdfDownloadUrl(orderId, kind, locale), `${kind}-${orderId}.pdf`);
    } catch (e) {
      setErr(e?.message || "Download failed");
    }
    setBusy(false);
  };
  return (
    <span style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
      <button
        type="button"
        onClick={handleClick}
        disabled={busy}
        title={err || undefined}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 3,
          padding: "3px 7px",
          borderRadius: 4,
          border: `1px solid ${err ? "#fecaca" : "#e5e7eb"}`,
          background: err ? "#fef2f2" : "#f9fafb",
          color: err ? "#b91c1c" : "#374151",
          fontSize: 11,
          fontWeight: 500,
          textDecoration: "none",
          cursor: busy ? "wait" : "pointer",
          whiteSpace: "nowrap",
          opacity: busy ? 0.6 : 1,
        }}
      >
        ↓ {label}
      </button>
      {err ? (
        <span style={{ fontSize: 9, color: "#b91c1c", maxWidth: 90, textAlign: "center", lineHeight: 1.2 }}>
          {err}
        </span>
      ) : null}
    </span>
  );
}

function ColHeader({ label, field, sort, onSort, align = "left" }) {
  const active = sort.field === field;
  return (
    <th
      onClick={() => onSort(field)}
      style={{
        padding: "7px 10px",
        textAlign: align,
        fontWeight: 600,
        color: "#6d7175",
        cursor: "pointer",
        userSelect: "none",
        background: "#f6f6f7",
        whiteSpace: "nowrap",
        fontSize: 11,
        borderBottom: "1px solid #e1e3e5",
      }}
    >
      {label} {active ? (sort.dir === "asc" ? "↑" : "↓") : ""}
    </th>
  );
}

function exportCSV(rows, filename = "order-documents.csv", ui = {}, locale = "de") {
  const headers = [
    ui.colOrderNumber || "Order #",
    ui.colDate || "Date",
    ui.colCustomer || "Customer",
    (ui.colAmount || "Amount") + " (€)",
    (ui.invoiceDoc || "Invoice") + " URL",
    (ui.deliveryNoteDoc || "Delivery Note") + " URL",
  ];
  const lines = rows.map((o) => [
    `#${o.order_number || o.id?.slice(0, 8) || ""}`,
    fmtDate(o.created_at, locale),
    customerName(o),
    (orderTotal(o) / 100).toFixed(2),
    getOrderPdfDownloadUrl(o.id, "invoice", locale),
    getOrderPdfDownloadUrl(o.id, "lieferschein", locale),
  ]);
  const csv = [headers, ...lines]
    .map((r) => r.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ─── Tab 1: Sipariş Belgeleri ─────────────────────────────────────────────── */

function TotalsStrip({ items }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
      {items.map((s) => (
        <div key={s.label} style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: "8px 10px", background: "#fafafa" }}>
          <div style={{ fontSize: 11, color: "#6b7280", textTransform: "uppercase" }}>{s.label}</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: s.color || "#111827" }}>{s.value}</div>
        </div>
      ))}
    </div>
  );
}

function orderMerchandiseCents(o) {
  const sub = Number(o?.subtotal_cents);
  if (Number.isFinite(sub) && sub > 0) return sub;
  return Math.max(0, Number(o?.total_cents || 0));
}

function SellerGroupHeader({ label }) {
  return (
    <tr>
      <td
        colSpan={9}
        style={{
          padding: "6px 10px",
          background: "#f0f5ff",
          fontWeight: 700,
          fontSize: 11,
          color: "#1d4ed8",
          borderTop: "2px solid #bfdbfe",
          borderBottom: "1px solid #bfdbfe",
        }}
      >
        {label}
      </td>
    </tr>
  );
}

function OrderDocRow({ order, selected, onToggle, returnsSet, locale, ui }) {
  const hasReturn = returnsSet.has(order.id);
  const hasShipDoc = orderHasShipDoc(order);

  return (
    <tr
      style={{
        borderBottom: "1px solid #f1f1f1",
        background: selected ? "#eff6ff" : "#fff",
        minHeight: 32,
      }}
    >
      <td style={{ padding: "6px 10px", width: 32 }}>
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          style={{ cursor: "pointer" }}
        />
      </td>
      <td style={{ padding: "6px 10px", fontSize: 12, fontWeight: 600, whiteSpace: "nowrap" }}>
        <a
          href={`/${locale}/orders/${order.id}`}
          style={{ color: "#1d4ed8", textDecoration: "none" }}
        >
          #{order.order_number || order.id?.slice(0, 8)}
        </a>
      </td>
      <td style={{ padding: "6px 10px", fontSize: 12, color: "#374151", whiteSpace: "nowrap" }}>
        {fmtDate(order.created_at, locale)}
      </td>
      <td style={{ padding: "6px 10px", fontSize: 12, color: "#374151" }}>
        {customerName(order)}
      </td>
      <td style={{ padding: "6px 10px", fontSize: 12, textAlign: "right", whiteSpace: "nowrap" }}>
        {fmtCents(orderTotal(order), locale)}
      </td>
      <td style={{ padding: "6px 10px", textAlign: "center" }}>
        <DocBtn orderId={order.id} kind="invoice" label={ui.invoiceDoc} available locale={locale} />
      </td>
      <td style={{ padding: "6px 10px", textAlign: "center" }}>
        <DocBtn orderId={order.id} kind="lieferschein" label={ui.deliveryNoteDoc} available locale={locale} />
      </td>
      <td style={{ padding: "6px 10px", textAlign: "center" }}>
        <DocBtn orderId={order.id} kind="versandlabel" label={ui.shippingLabel} available={hasShipDoc} locale={locale} />
      </td>
      <td style={{ padding: "6px 10px", textAlign: "center" }}>
        <DocBtn orderId={order.id} kind="retoure" label={ui.returnDoc} available={hasReturn} locale={locale} />
      </td>
    </tr>
  );
}

function OrderDocTable({ orders, selectedSet, onToggleOne, returnsSet, locale, ui }) {
  return orders.map((o) => (
    <OrderDocRow
      key={o.id}
      order={o}
      selected={selectedSet.has(o.id)}
      onToggle={() => onToggleOne(o.id)}
      returnsSet={returnsSet}
      locale={locale}
      ui={ui}
    />
  ));
}

function OrderDocumentsTab({ isSuperuser, mySellerId }) {
  const params = useParams();
  const localeFromIntl = useLocale();
  const locale = localeFromIntl || params?.locale || "de";
  const ui = getUI(locale);
  const client = getMedusaAdminClient();

  const [orders, setOrders] = useState([]);
  const [sellers, setSellers] = useState([]);
  const [returns, setReturns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [search, setSearch] = useState("");
  const [periodKey, setPeriodKey] = useState(() => initialPayoutPeriodKey(PAYOUT_PERIODS));
  const selectedPeriod = PAYOUT_PERIODS.find((p) => p.key === periodKey) || PAYOUT_PERIODS[0];
  const [docFilter, setDocFilter] = useState("all");
  const [sort, setSort] = useState({ field: "created_at", dir: "desc" });
  const [selected, setSelected] = useState(new Set());
  const [downloadingZip, setDownloadingZip] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const [ordersRes, returnsRes, sellersRes] = await Promise.all([
          client.getOrders({ limit: 500 }).catch(() => ({ orders: [] })),
          client.getReturns().catch(() => ({ returns: [] })),
          isSuperuser ? client.getSellers().catch(() => ({ sellers: [] })) : Promise.resolve({ sellers: [] }),
        ]);
        if (cancelled) return;
        setOrders(ordersRes?.orders || []);
        setReturns(returnsRes?.returns || []);
        setSellers(sellersRes?.sellers || []);
      } catch (e) {
        if (!cancelled) setError(e?.message || ui.error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [isSuperuser]);

  const returnsSet = useMemo(() => {
    const s = new Set();
    for (const r of returns) {
      if (r.order_id && r.status !== "abgelehnt" && r.status !== "abgeschlossen") s.add(r.order_id);
    }
    return s;
  }, [returns]);

  const sellerLabelMap = useMemo(() => {
    const m = {};
    for (const s of sellers) m[s.seller_id] = s.store_name || s.company_name || s.email || s.seller_id;
    return m;
  }, [sellers]);

  const filteredOrders = useMemo(() => {
    let list = [...orders];

    // Search
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (o) =>
          String(o.order_number || "").toLowerCase().includes(q) ||
          customerName(o).toLowerCase().includes(q) ||
          String(o.id || "").toLowerCase().includes(q)
      );
    }

    // Payment period (15-day, by order date)
    if (selectedPeriod) {
      const from = new Date(`${selectedPeriod.start}T00:00:00Z`).getTime();
      const to = new Date(`${selectedPeriod.end}T23:59:59Z`).getTime();
      list = list.filter((o) => {
        const t = new Date(o.created_at).getTime();
        return t >= from && t <= to;
      });
    }

    // Doc type filter
    if (docFilter === "versandlabel") {
      list = list.filter(
        (o) =>
          !!String(o.sendcloud_label_url || "").trim() ||
          !!String(o.tracking_number || "").trim() ||
          o.delivery_status === "versendet" ||
          o.delivery_status === "zugestellt",
      );
    } else if (docFilter === "retoure") {
      list = list.filter((o) => returnsSet.has(o.id));
    }

    // Sort
    list.sort((a, b) => {
      let va, vb;
      if (sort.field === "created_at") {
        va = new Date(a.created_at).getTime();
        vb = new Date(b.created_at).getTime();
      } else if (sort.field === "total") {
        va = orderTotal(a);
        vb = orderTotal(b);
      } else if (sort.field === "customer") {
        va = customerName(a).toLowerCase();
        vb = customerName(b).toLowerCase();
      } else if (sort.field === "order_number") {
        va = Number(a.order_number) || 0;
        vb = Number(b.order_number) || 0;
      } else {
        va = a[sort.field] || "";
        vb = b[sort.field] || "";
      }
      if (va < vb) return sort.dir === "asc" ? -1 : 1;
      if (va > vb) return sort.dir === "asc" ? 1 : -1;
      return 0;
    });

    return list;
  }, [orders, search, selectedPeriod, docFilter, sort, returnsSet]);

  const periodTotals = useMemo(() => {
    let ware = 0;
    let ship = 0;
    let bestellwert = 0;
    for (const o of filteredOrders) {
      ware += orderMerchandiseCents(o);
      ship += Math.max(0, Number(o.shipping_cents || 0));
      bestellwert += orderTotal(o);
    }
    return { ware, ship, bestellwert, count: filteredOrders.length };
  }, [filteredOrders]);

  const { ownOrders, sellerGroups } = useMemo(() => {
    if (!isSuperuser) return { ownOrders: filteredOrders, sellerGroups: [] };
    const own = [];
    const groups = {};
    for (const o of filteredOrders) {
      if (String(o.seller_id || "") === String(mySellerId || "")) {
        own.push(o);
      } else {
        const sid = String(o.seller_id || "unknown");
        if (!groups[sid]) groups[sid] = [];
        groups[sid].push(o);
      }
    }
    const grouped = Object.entries(groups).sort(([a], [b]) =>
      (sellerLabelMap[a] || a).localeCompare(sellerLabelMap[b] || b)
    );
    return { ownOrders: own, sellerGroups: grouped };
  }, [filteredOrders, isSuperuser, mySellerId, sellerLabelMap]);

  const toggleOne = (id) => {
    setSelected((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  const toggleAll = () => {
    const allIds = filteredOrders.map((o) => o.id);
    const allSelected = allIds.length > 0 && allIds.every((id) => selected.has(id));
    setSelected(allSelected ? new Set() : new Set(allIds));
  };

  const toggleSort = (field) => {
    setSort((s) =>
      s.field === field ? { field, dir: s.dir === "asc" ? "desc" : "asc" } : { field, dir: "desc" }
    );
  };

  const handleExport = () => {
    const toExport =
      selected.size > 0
        ? filteredOrders.filter((o) => selected.has(o.id))
        : filteredOrders;
    exportCSV(toExport, "order-documents.csv", ui, locale);
  };

  const handleBulkDownload = async () => {
    const targets =
      selected.size > 0
        ? filteredOrders.filter((o) => selected.has(o.id))
        : filteredOrders;
    const items = [];
    for (const o of targets) {
      const num = o.order_number != null ? String(o.order_number) : String(o.id || "").slice(0, 8);
      for (const kind of docKindsForOrder(o, docFilter, returnsSet)) {
        items.push({
          url: getOrderPdfDownloadUrl(o.id, kind, locale),
          filename: `${DOC_FILE_PREFIX[kind] || kind}-${num}.pdf`,
        });
      }
    }
    if (!items.length) {
      alert(
        lt(
          locale,
          "No documents for this filter.",
          "Bu filtre için belge yok.",
          "Aucun document pour ce filtre.",
          "No hay documentos para este filtro.",
          "Nessun documento per questo filtro.",
          "Keine Dokumente für diesen Filter.",
        ),
      );
      return;
    }
    setDownloadingZip(true);
    try {
      const kindPart = docFilter && docFilter !== "all" ? DOC_FILE_PREFIX[docFilter] || docFilter : "alle";
      const stamp = selectedPeriod?.key || new Date().toISOString().slice(0, 7);
      await downloadAuthenticatedPdfsAsZip(items, `Bestelldokumente-${kindPart}-${stamp}.zip`);
    } catch (e) {
      alert(
        e?.message ||
          lt(locale, "Download failed", "İndirme başarısız", "Échec du téléchargement", "Descarga fallida", "Download non riuscito", "Download fehlgeschlagen"),
      );
    } finally {
      setDownloadingZip(false);
    }
  };

  if (loading) {
    return (
      <Box padding="400">
        <InlineStack gap="200" blockAlign="center">
          <Spinner size="small" />
          <Text as="p" tone="subdued">{ui.loading}</Text>
        </InlineStack>
      </Box>
    );
  }

  if (error) {
    return (
      <Banner tone="critical" onDismiss={() => setError(null)}>
        <p>{error}</p>
      </Banner>
    );
  }

  const allSelected =
    filteredOrders.length > 0 && filteredOrders.every((o) => selected.has(o.id));

  return (
    <BlockStack gap="300">
      {/* Filter bar */}
      <Card padding="300">
        <BlockStack gap="200">
          <InlineStack gap="200" blockAlign="end" wrap>
            <Box minWidth="220px">
              <TextField
                label={ui.search}
                value={search}
                onChange={setSearch}
                placeholder={ui.searchOrderPlaceholder}
                clearButton
                onClearButtonClick={() => setSearch("")}
                autoComplete="off"
              />
            </Box>
            <PeriodFilter
              periods={PAYOUT_PERIODS}
              selectedKey={periodKey}
              onSelect={setPeriodKey}
              yearLabel={lt(locale, "Year", "Yıl", "Année", "Año", "Anno", "Jahr")}
              periodLabel={lt(locale, "Period", "Dönem", "Période", "Período", "Periodo", "Zeitraum")}
            />
            <Box minWidth="160px">
              <Select
                label={ui.documentType}
                value={docFilter}
                options={[
                  { label: ui.allDocuments, value: "all" },
                  { label: ui.invoiceDoc, value: "invoice" },
                  { label: ui.deliveryNoteDoc, value: "lieferschein" },
                  { label: ui.shippingLabel, value: "versandlabel" },
                  { label: ui.returnDoc, value: "retoure" },
                ]}
                onChange={setDocFilter}
              />
            </Box>
          </InlineStack>
          <InlineStack gap="200">
            <Button size="slim" onClick={handleExport}>
              {ui.csvExport} {selected.size > 0 ? `(${selected.size})` : ""}
            </Button>
            <Button size="slim" onClick={handleBulkDownload} disabled={filteredOrders.length === 0} loading={downloadingZip}>
              {ui.downloadAll} {selected.size > 0 ? `(${selected.size})` : ""}
            </Button>
            <Text as="span" tone="subdued" variant="bodySm">
              {filteredOrders.length} {ui.orders}
              {selected.size > 0 ? ` · ${selected.size} ${ui.selected}` : ""}
            </Text>
          </InlineStack>
        </BlockStack>
      </Card>

      {filteredOrders.length > 0 && (
        <Card>
          <BlockStack gap="150">
            <TotalsStrip
              items={[
                { label: lt(locale, "Orders", "Sipariş", "Commandes", "Pedidos", "Ordini", "Bestellungen"), value: String(periodTotals.count) },
                { label: lt(locale, "Merchandise (commission basis)", "Mal (komisyon matrahı)", "Marchandises (base commission)", "Mercancía (base comisión)", "Merci (base commissione)", "Ware (Provisionsbasis)"), value: fmtCents(periodTotals.ware, locale) },
                { label: lt(locale, "Shipping (customer)", "Kargo (müşteri)", "Livraison (client)", "Envío (cliente)", "Spedizione (cliente)", "Versand (Kunde)"), value: fmtCents(periodTotals.ship, locale) },
                { label: lt(locale, "Order value", "Sipariş tutarı", "Valeur commande", "Valor pedido", "Valore ordine", "Bestellwert"), value: fmtCents(periodTotals.bestellwert, locale) },
              ]}
            />
            <Text as="p" tone="subdued" variant="bodySm">
              {lt(
                locale,
                "Commission invoice goods value = merchandise (seller GMV), not Andertal revenue. Customer shipping is shown separately from platform-paid shipping (Sendcloud labels).",
                "Komisyon faturası mal tutarı = satıcı GMV, Andertal cirosu değil. Müşteri kargosu ile platformun ödediği kargo (Sendcloud) ayrı gösterilir.",
                "Valeur marchandises = GMV vendeur, pas le CA Andertal. Livraison client et livraison plateforme (Sendcloud) sont séparées.",
                "Valor mercancía = GMV del vendedor, no facturación de Andertal. Envío del cliente y envío de la plataforma (Sendcloud) van por separado.",
                "Valore merce = GMV venditore, non fatturato Andertal. Spedizione cliente e spedizione piattaforma (Sendcloud) sono separate.",
                "Warenwert der Provisionsrechnung = Verkäufer-GMV, nicht Andertal-Umsatz. Versand Kunde und Versand Plattform (Sendcloud) werden getrennt ausgewiesen.",
              )}
            </Text>
          </BlockStack>
        </Card>
      )}

      {/* Table */}
      <Card padding="0">
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr>
                <th
                  style={{ padding: "7px 10px", width: 32, background: "#f6f6f7", borderBottom: "1px solid #e1e3e5" }}
                >
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    style={{ cursor: "pointer" }}
                  />
                </th>
                <ColHeader label={ui.colOrderNumber} field="order_number" sort={sort} onSort={toggleSort} />
                <ColHeader label={ui.colDate} field="created_at" sort={sort} onSort={toggleSort} />
                <ColHeader label={ui.colCustomer} field="customer" sort={sort} onSort={toggleSort} />
                <ColHeader label={ui.colAmount} field="total" sort={sort} onSort={toggleSort} align="right" />
                {DOC_TYPE_KEYS.map((dt) => (
                  <th
                    key={dt.key}
                    style={{
                      padding: "7px 10px",
                      textAlign: "center",
                      fontWeight: 600,
                      color: "#6d7175",
                      background: "#f6f6f7",
                      fontSize: 11,
                      borderBottom: "1px solid #e1e3e5",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {ui[dt.uiKey] || dt.uiKey}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredOrders.length === 0 ? (
                <tr>
                  <td
                    colSpan={9}
                    style={{ padding: "40px 16px", textAlign: "center", color: "#9ca3af" }}
                  >
                    {ui.noOrdersFound}
                  </td>
                </tr>
              ) : isSuperuser ? (
                <>
                  {ownOrders.length > 0 && (
                    <>
                      <SellerGroupHeader label={ui.platformOwn} />
                      <OrderDocTable
                        orders={ownOrders}
                        selectedSet={selected}
                        onToggleOne={toggleOne}
                        returnsSet={returnsSet}
                        locale={locale}
                        ui={ui}
                      />
                    </>
                  )}
                  {sellerGroups.map(([sid, groupOrders]) => (
                    <React.Fragment key={sid}>
                      <SellerGroupHeader
                        label={sellerLabelMap[sid] || sid}
                      />
                      <OrderDocTable
                        orders={groupOrders}
                        selectedSet={selected}
                        onToggleOne={toggleOne}
                        returnsSet={returnsSet}
                        locale={locale}
                        ui={ui}
                      />
                    </React.Fragment>
                  ))}
                </>
              ) : (
                <OrderDocTable
                  orders={filteredOrders}
                  selectedSet={selected}
                  onToggleOne={toggleOne}
                  returnsSet={returnsSet}
                  locale={locale}
                  ui={ui}
                />
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </BlockStack>
  );
}

/* ─── Tab 2: Komisyon Faturaları ────────────────────────────────────────────── */

function CommissionInvoicesTab({ isSuperuser, mySellerId }) {
  const localeFromIntl = useLocale();
  const locale = localeFromIntl || "de";
  const ui = getUI(locale);
  const client = getMedusaAdminClient();
  const [invoices, setInvoices] = useState([]);
  const [sellers, setSellers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(new Set());
  const [sort, setSort] = useState({ field: "period_start", dir: "desc" });
  const [periodKey, setPeriodKey] = useState(PERIOD_ALL_KEY);
  const [sellerFilter, setSellerFilter] = useState("");
  const toggleSort = (field) => {
    setSort((s) =>
      s.field === field ? { field, dir: s.dir === "asc" ? "desc" : "asc" } : { field, dir: "desc" }
    );
  };

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const [invRes, sellersRes] = await Promise.all([
          client
            .request("/admin-hub/v1/commission-invoices")
            .catch(() => ({ invoices: [] })),
          isSuperuser
            ? client.getSellers().catch(() => ({ sellers: [] }))
            : Promise.resolve({ sellers: [] }),
        ]);
        if (cancelled) return;
        setInvoices(invRes?.invoices || []);
        setSellers(sellersRes?.sellers || []);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [isSuperuser]);

  const sellerLabelMap = useMemo(() => {
    const m = {};
    for (const s of sellers) m[s.seller_id] = s.store_name || s.company_name || s.email || s.seller_id;
    return m;
  }, [sellers]);

  const filteredInvoices = useMemo(() => {
    let list = invoices;
    if (periodKey && periodKey !== PERIOD_ALL_KEY) {
      const p = PAYOUT_PERIODS.find((x) => x.key === periodKey);
      if (p) {
        const start = p.start || p.startDate;
        const end = p.end || p.endDate;
        list = list.filter((i) => {
          const ps = String(i.period_start || "").slice(0, 10);
          const pe = String(i.period_end || "").slice(0, 10);
          if (!ps || !pe) return false;
          return ps <= end && pe >= start;
        });
      }
    }
    if (isSuperuser && sellerFilter) {
      list = list.filter((i) => String(i.seller_id || "") === sellerFilter);
    }
    return list;
  }, [invoices, periodKey, sellerFilter, isSuperuser]);

  const sortedInvoices = useMemo(() => {
    const list = [...filteredInvoices];
    list.sort((a, b) => {
      let va, vb;
      if (sort.field === "period_start") {
        va = new Date(a.period_start || 0).getTime();
        vb = new Date(b.period_start || 0).getTime();
      } else if (sort.field === "store_name") {
        va = String(a.store_name || a.seller_id || "").toLowerCase();
        vb = String(b.store_name || b.seller_id || "").toLowerCase();
      } else if (sort.field === "amount_cents" || sort.field === "total_cents" || sort.field === "status") {
        va = a[sort.field] ?? "";
        vb = b[sort.field] ?? "";
      } else {
        va = a[sort.field] ?? "";
        vb = b[sort.field] ?? "";
      }
      if (va < vb) return sort.dir === "asc" ? -1 : 1;
      if (va > vb) return sort.dir === "asc" ? 1 : -1;
      return 0;
    });
    return list;
  }, [filteredInvoices, sort]);

  const invoiceTotals = useMemo(() => {
    let gross = 0;
    let commission = 0;
    let payout = 0;
    for (const inv of sortedInvoices) {
      gross += Number(inv.total_cents || 0);
      commission += Number(inv.amount_cents || 0);
      payout += Number(inv.payout_cents || 0);
    }
    return { gross, commission, payout, count: sortedInvoices.length };
  }, [sortedInvoices]);

  const { ownInvoices, sellerGroups } = useMemo(() => {
    if (!isSuperuser) return { ownInvoices: sortedInvoices, sellerGroups: [] };
    const own = sortedInvoices.filter((i) => String(i.seller_id || "") === String(mySellerId || ""));
    const groups = {};
    for (const inv of sortedInvoices) {
      if (String(inv.seller_id || "") === String(mySellerId || "")) continue;
      const sid = String(inv.seller_id || "unknown");
      if (!groups[sid]) groups[sid] = [];
      groups[sid].push(inv);
    }
    const grouped = Object.entries(groups).sort(([a], [b]) =>
      (sellerLabelMap[a] || a).localeCompare(sellerLabelMap[b] || b)
    );
    return { ownInvoices: own, sellerGroups: grouped };
  }, [sortedInvoices, isSuperuser, mySellerId, sellerLabelMap]);

  const toggleOne = (id) => {
    setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };
  const toggleAll = () => {
    const allIds = sortedInvoices.map((i) => i.id);
    const allSel = allIds.length > 0 && allIds.every((id) => selected.has(id));
    setSelected(allSel ? new Set() : new Set(allIds));
  };

  // pdf_url from the backend is a relative /admin-hub/... path (see transactions.js) — needs the
  // backend origin prefixed before it's fetchable from the sellercentral origin.
  const absPdfUrl = (u) => (/^https?:\/\//i.test(u) ? u : `${client.baseURL}${u}`);

  const [downloadingZip, setDownloadingZip] = useState(false);

  const handleBulkDownload = async () => {
    const targets = (selected.size > 0
      ? sortedInvoices.filter((i) => selected.has(i.id))
      : sortedInvoices
    ).filter((inv) => inv.pdf_url);
    if (!targets.length) return;
    setDownloadingZip(true);
    try {
      const items = targets.map((inv) => {
        const period = String(inv.period_start || "").slice(0, 7) || "periode";
        const store = String(inv.store_name || inv.seller_id || "verkaeufer")
          .replace(/[\\/:*?"<>|]+/g, "_")
          .slice(0, 40);
        return {
          url: absPdfUrl(inv.pdf_url),
          filename: `Provisionsfaktur-${store}-${period}.pdf`,
        };
      });
      const stamp = periodKey && periodKey !== PERIOD_ALL_KEY ? periodKey : new Date().toISOString().slice(0, 10);
      await downloadAuthenticatedPdfsAsZip(items, `Provisionsrechnungen-${stamp}.zip`);
    } catch (e) {
      alert(e?.message || lt(locale, "Download failed", "İndirme başarısız", "Échec du téléchargement", "Descarga fallida", "Download non riuscito", "Download fehlgeschlagen"));
    } finally {
      setDownloadingZip(false);
    }
  };

  const [backfilling, setBackfilling] = useState(false);
  const handleBackfill = async () => {
    if (!isSuperuser) return;
    setBackfilling(true);
    try {
      const res = await client.request("/admin-hub/v1/payouts/backfill", { method: "POST" });
      alert(
        res?.message ||
          lt(
            locale,
            "Backfill completed",
            "Backfill tamamlandı",
            "Remplissage rétroactif terminé",
            "Backfill completado",
            "Backfill completato",
            "Backfill abgeschlossen",
          ),
      );
      // Reload
      const invRes = await client.request("/admin-hub/v1/commission-invoices").catch(() => ({ invoices: [] }));
      setInvoices(invRes?.invoices || []);
    } catch (e) {
      alert(
        `${lt(locale, "Error: ", "Hata: ", "Erreur : ", "Error: ", "Errore: ", "Fehler: ")}${userError(
          e,
          locale,
          lt(locale, "Unknown", "Bilinmiyor", "Inconnu", "Desconocido", "Sconosciuto", "Unbekannt"),
        )}`,
      );
    } finally {
      setBackfilling(false);
    }
  };

  if (loading) {
    return (
      <Box padding="400">
        <InlineStack gap="200" blockAlign="center">
          <Spinner size="small" />
          <Text as="p" tone="subdued">{ui.loading}</Text>
        </InlineStack>
      </Box>
    );
  }

  const renderRows = (rows) =>
    rows.map((inv) => (
      <tr
        key={inv.id}
        style={{ borderBottom: "1px solid #f1f1f1", background: selected.has(inv.id) ? "#eff6ff" : "#fff" }}
      >
        <td style={{ padding: "6px 10px", width: 32 }}>
          <input
            type="checkbox"
            checked={selected.has(inv.id)}
            onChange={() => toggleOne(inv.id)}
            style={{ cursor: "pointer" }}
          />
        </td>
        <td style={{ padding: "6px 10px", fontSize: 12, fontWeight: 600, color: "#374151" }}>
          {inv.period || inv.period_label || "—"}
        </td>
        <td style={{ padding: "6px 10px", fontSize: 12, color: "#374151" }}>
          <span
            style={{
              display: "inline-block",
              padding: "2px 10px",
              borderRadius: 12,
              background: "#eff6ff",
              color: "#1d4ed8",
              fontWeight: 600,
              fontSize: 11,
            }}
          >
            {ui.invoiceDoc}
          </span>
        </td>
        <td style={{ padding: "6px 10px", fontSize: 12, textAlign: "right" }}>
          {fmtCents(inv.total_cents, locale)}
        </td>
        <td style={{ padding: "6px 10px", fontSize: 12, textAlign: "right", color: "#dc2626" }}>
          – {fmtCents(inv.amount_cents, locale)}
        </td>
        <td style={{ padding: "6px 10px", fontSize: 12, textAlign: "right", fontWeight: 600, color: "#059669" }}>
          {fmtCents(inv.payout_cents, locale)}
        </td>
        <td style={{ padding: "6px 10px", textAlign: "center" }}>
          {inv.pdf_url ? (
            <button
              type="button"
              onClick={() => downloadAuthenticatedPdf(absPdfUrl(inv.pdf_url), `commission-invoice-${inv.id}.pdf`).catch(() => {})}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                padding: "3px 9px",
                borderRadius: 4,
                border: "1px solid #e5e7eb",
                background: "#f9fafb",
                color: "#374151",
                fontSize: 11,
                fontWeight: 500,
                textDecoration: "none",
                cursor: "pointer",
              }}
            >
              ↓ PDF
            </button>
          ) : (
            <span style={{ color: "#d1d5db", fontSize: 11 }}>—</span>
          )}
        </td>
      </tr>
    ));

  const tableHead = (
    <thead>
      <tr>
        <th style={{ padding: "7px 10px", width: 32, background: "#f6f6f7", borderBottom: "1px solid #e1e3e5" }}>
          <input
            type="checkbox"
            checked={sortedInvoices.length > 0 && sortedInvoices.every((i) => selected.has(i.id))}
            onChange={toggleAll}
            style={{ cursor: "pointer" }}
          />
        </th>
        <ColHeader label={ui.period} field="period_start" sort={sort} onSort={toggleSort} />
        <ColHeader label={ui.type} field="type" sort={sort} onSort={toggleSort} />
        <ColHeader label={lt(locale, "Goods value", "Mal tutarı", "Valeur marchandises", "Valor mercancía", "Valore merce", "Warenwert")} field="total_cents" sort={sort} onSort={toggleSort} align="right" />
        <ColHeader label={lt(locale, "Commission", "Komisyon", "Commission", "Comisión", "Commissione", "Provision")} field="amount_cents" sort={sort} onSort={toggleSort} align="right" />
        <ColHeader label={lt(locale, "Payout", "Ödeme", "Paiement", "Pago", "Pagamento", "Auszahlung")} field="payout_cents" sort={sort} onSort={toggleSort} align="right" />
        <th
          style={{
            padding: "7px 10px", textAlign: "center", fontWeight: 600, color: "#6d7175",
            background: "#f6f6f7", fontSize: 11, borderBottom: "1px solid #e1e3e5",
          }}
        >
          PDF
        </th>
      </tr>
    </thead>
  );

  return (
    <BlockStack gap="300">
      <InlineStack gap="200" blockAlign="center">
        <Button size="slim" onClick={handleBulkDownload} disabled={sortedInvoices.length === 0} loading={downloadingZip}>
          {ui.downloadAll} {selected.size > 0 ? `(${selected.size})` : ""}
        </Button>
        {isSuperuser && (
          <Button size="slim" tone="critical" onClick={handleBackfill} loading={backfilling}>
            {ui.backfill}
          </Button>
        )}
        <Text as="span" tone="subdued" variant="bodySm">
          {sortedInvoices.length} {ui.commissionInvoices}
        </Text>
      </InlineStack>
      <InlineStack gap="200" blockAlign="end" wrap>
        <PeriodFilter
          periods={PAYOUT_PERIODS}
          selectedKey={periodKey}
          onSelect={setPeriodKey}
          yearLabel={lt(locale, "Year", "Yıl", "Année", "Año", "Anno", "Jahr")}
          periodLabel={lt(locale, "Period", "Dönem", "Période", "Período", "Periodo", "Zeitraum")}
          allowAllLabel={lt(locale, "All periods", "Tüm dönemler", "Toutes périodes", "Todos los períodos", "Tutti i periodi", "Alle Zeiträume")}
        />
        {isSuperuser && (
          <div style={{ minWidth: 200 }}>
            <Select
              label={ui.seller}
              value={sellerFilter}
              onChange={setSellerFilter}
              options={[
                { label: lt(locale, "All sellers", "Tüm satıcılar", "Tous les vendeurs", "Todos los vendedores", "Tutti i venditori", "Alle Verkäufer"), value: "" },
                ...sellers.map((s) => ({ label: s.store_name || s.company_name || s.email || s.seller_id, value: s.seller_id })),
              ]}
            />
          </div>
        )}
      </InlineStack>

      {sortedInvoices.length > 0 && (
        <TotalsStrip
          items={[
            { label: lt(locale, "Invoices", "Fatura", "Factures", "Facturas", "Fatture", "Rechnungen"), value: String(invoiceTotals.count) },
            { label: lt(locale, "Goods value (seller GMV)", "Mal tutarı (satıcı GMV)", "Valeur marchandises (GMV vendeur)", "Valor mercancía (GMV vendedor)", "Valore merce (GMV venditore)", "Warenwert (Verkäufer-GMV)"), value: fmtCents(invoiceTotals.gross, locale) },
            { label: lt(locale, "Commission", "Komisyon", "Commission", "Comisión", "Commissione", "Provision"), value: fmtCents(invoiceTotals.commission, locale), color: "#dc2626" },
            { label: lt(locale, "Payout to seller", "Satıcı ödemesi", "Paiement vendeur", "Pago al vendedor", "Pagamento venditore", "Auszahlung an Verkäufer"), value: fmtCents(invoiceTotals.payout, locale), color: "#059669" },
          ]}
        />
      )}

      <Card padding="0">
        <div style={{ overflowX: "auto" }}>
          {sortedInvoices.length === 0 ? (
            <div style={{ padding: "48px 16px", textAlign: "center", color: "#9ca3af" }}>
              <Text as="p" tone="subdued">
                {ui.noInvoices}
              </Text>
              <Text as="p" tone="subdued" variant="bodySm">
                {ui.noInvoicesNote}
              </Text>
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              {tableHead}
              <tbody>
                {isSuperuser ? (
                  <>
                    {ownInvoices.length > 0 && (
                      <>
                        <tr>
                          <td
                            colSpan={7}
                            style={{
                              padding: "6px 10px",
                              background: "#f0f5ff",
                              fontWeight: 700,
                              fontSize: 11,
                              color: "#1d4ed8",
                              borderTop: "2px solid #bfdbfe",
                              borderBottom: "1px solid #bfdbfe",
                            }}
                          >
                            {ui.platformOwn}
                          </td>
                        </tr>
                        {renderRows(ownInvoices)}
                      </>
                    )}
                    {sellerGroups.map(([sid, groupInvs]) => (
                      <React.Fragment key={sid}>
                        <tr>
                          <td
                            colSpan={7}
                            style={{
                              padding: "6px 10px",
                              background: "#f0f5ff",
                              fontWeight: 700,
                              fontSize: 11,
                              color: "#1d4ed8",
                              borderTop: "2px solid #bfdbfe",
                              borderBottom: "1px solid #bfdbfe",
                            }}
                          >
                            {sellerLabelMap[sid] || sid}
                          </td>
                        </tr>
                        {renderRows(groupInvs)}
                      </React.Fragment>
                    ))}
                  </>
                ) : (
                  renderRows(sortedInvoices)
                )}
                <tr style={{ background: "#f9fafb", borderTop: "2px solid #e5e7eb", fontWeight: 700 }}>
                  <td style={{ padding: "7px 10px" }} colSpan={3}>
                    {lt(locale, "Sum", "Toplam", "Somme", "Suma", "Somma", "Summe")}
                  </td>
                  <td style={{ padding: "7px 10px", textAlign: "right" }}>{fmtCents(invoiceTotals.gross, locale)}</td>
                  <td style={{ padding: "7px 10px", textAlign: "right", color: "#dc2626" }}>– {fmtCents(invoiceTotals.commission, locale)}</td>
                  <td style={{ padding: "7px 10px", textAlign: "right", color: "#059669" }}>{fmtCents(invoiceTotals.payout, locale)}</td>
                  <td />
                </tr>
              </tbody>
            </table>
          )}
        </div>
      </Card>
    </BlockStack>
  );
}

function FinanzamtKpiCard({ label, value, hint, tone = "neutral", onOpen }) {
  const palette = {
    tax: { border: "#bbf7d0", bg: "#f0fdf4", label: "#15803d", value: "#14532d" },
    pass: { border: "#e2e8f0", bg: "#f8fafc", label: "#64748b", value: "#0f172a" },
    pay: { border: "#bae6fd", bg: "#f0f9ff", label: "#0369a1", value: "#0c4a6e" },
    warn: { border: "#fde68a", bg: "#fffbeb", label: "#b45309", value: "#92400e" },
    neutral: { border: "#e5e7eb", bg: "#ffffff", label: "#6b7280", value: "#111827" },
  }[tone] || { border: "#e5e7eb", bg: "#ffffff", label: "#6b7280", value: "#111827" };
  return (
    <button
      type="button"
      onClick={onOpen}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 4,
        textAlign: "left",
        border: `1px solid ${palette.border}`,
        borderRadius: 10,
        padding: "12px 14px",
        background: palette.bg,
        cursor: "pointer",
        minHeight: 92,
      }}
    >
      <span style={{ fontSize: 11, fontWeight: 600, color: palette.label, letterSpacing: 0.2 }}>{label}</span>
      <span style={{ fontSize: 18, fontWeight: 700, color: palette.value, lineHeight: 1.2 }}>{value}</span>
      {hint ? <span style={{ fontSize: 11, color: "#64748b", marginTop: "auto" }}>{hint}</span> : null}
    </button>
  );
}

function FinanzamtSection({ title, note, children }) {
  return (
    <Card>
      <BlockStack gap="300">
        <BlockStack gap="100">
          <Text as="h3" variant="headingSm">{title}</Text>
          {note ? <Text as="p" tone="subdued" variant="bodySm">{note}</Text> : null}
        </BlockStack>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
          {children}
        </div>
      </BlockStack>
    </Card>
  );
}

/* ─── Tab 3: Plattform / Finanzamt (superuser only) ──────────────────────────────
 * BonusPunkte.md §3.8: period totals across ALL sellers. These numbers are a straight
 * sum of Tab 2's per-seller Provisionsrechnungen (seller_payouts rows) — never an
 * independently recomputed figure — so Tab 2 and Tab 3 can never disagree. */
function FinanzamtTab() {
  const localeFromIntl = useLocale();
  const locale = localeFromIntl || "de";
  const ui = getUI(locale);
  const client = getMedusaAdminClient();
  const [periodKey, setPeriodKey] = useState(PERIOD_ALL_KEY);
  const selectedPeriod = periodKey !== PERIOD_ALL_KEY ? PAYOUT_PERIODS.find((p) => p.key === periodKey) : null;
  const periodStart = selectedPeriod?.start || "";
  const periodEnd = selectedPeriod?.end || "";
  const [data, setData] = useState({ totals: null, sellers: [], oss: [], b2b: null });
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (periodStart) qs.set("period_start", periodStart);
      if (periodEnd) qs.set("period_end", periodEnd);
      const res = await client
        .request(`/admin-hub/v1/billing/finanzamt${qs.toString() ? `?${qs}` : ""}`)
        .catch(() => ({ totals: null, sellers: [] }));
      setData({
        totals: res?.totals || null,
        sellers: res?.sellers || [],
        oss: res?.oss_by_country || [],
        b2b: res?.b2b_reverse_charge || null,
      });
    } finally {
      setLoading(false);
    }
  }, [periodStart, periodEnd, client]);

  useEffect(() => { load(); }, [load]);

  const t = data.totals;
  const sellers = data.sellers || [];
  const oss = data.oss || [];

  const [exporting, setExporting] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const handleExport = async () => {
    setExporting(true);
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("sellerToken") : null;
      if (!token) throw new Error(lt(locale, "Please login again.", "Lütfen tekrar giriş yapın.", "Veuillez vous reconnecter.", "Inicia sesión de nuevo.", "Accedi di nuovo.", "Bitte erneut einloggen."));
      const response = await fetch("/api/billing/finanzamt-export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sellerToken: token, period_start: periodStart || undefined, period_end: periodEnd || undefined }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body?.error || `${lt(locale, "Export failed", "Dışa aktarma başarısız", "Échec de l'export", "Exportación fallida", "Esportazione non riuscita", "Export fehlgeschlagen")} (${response.status})`);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `andertal-finanzamt-${periodEnd || new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert(e?.message || lt(locale, "Export failed", "Dışa aktarma başarısız", "Échec de l'export", "Exportación fallida", "Esportazione non riuscita", "Export fehlgeschlagen"));
    } finally {
      setExporting(false);
    }
  };

  const handlePdfExport = async () => {
    setExportingPdf(true);
    try {
      const qs = new URLSearchParams();
      if (periodStart) qs.set("period_start", periodStart);
      if (periodEnd) qs.set("period_end", periodEnd);
      const url = `${client.baseURL}/admin-hub/v1/billing/finanzamt/pdf${qs.toString() ? `?${qs}` : ""}`;
      const stamp = periodEnd || new Date().toISOString().slice(0, 10);
      await downloadAuthenticatedPdf(url, `andertal-plattformabrechnung-${stamp}.pdf`);
    } catch (e) {
      alert(e?.message || lt(locale, "PDF export failed", "PDF dışa aktarma başarısız", "Échec de l'export PDF", "Exportación PDF fallida", "Esportazione PDF non riuscita", "PDF-Export fehlgeschlagen"));
    } finally {
      setExportingPdf(false);
    }
  };

  const openSellerMetric = (title, body, centsOf, format = "money") => {
    const rows = sellers
      .map((s) => ({
        name: s.store_name || s.seller_id,
        period: `${fmtDate(s.period_start, locale)} – ${fmtDate(s.period_end, locale)}`,
        orders: Number(s.order_count || 0),
        cents: Number(centsOf(s) || 0),
      }))
      .sort((a, b) => b.cents - a.cents);
    setDetail({
      title,
      body,
      kind: "sellers",
      format,
      rows,
      totalCents: rows.reduce((sum, r) => sum + r.cents, 0),
    });
  };

  const colSeller = lt(locale, "Seller", "Satıcı", "Vendeur", "Vendedor", "Venditore", "Verkäufer");
  const colPeriod = lt(locale, "Period", "Dönem", "Période", "Período", "Periodo", "Zeitraum");
  const colOrders = lt(locale, "Orders", "Sipariş", "Commandes", "Pedidos", "Ordini", "Bestellungen");
  const colAmount = lt(locale, "Amount", "Tutar", "Montant", "Importe", "Importo", "Betrag");
  const detailsHint = lt(locale, "Click for breakdown", "Kırılım için tıkla", "Cliquer pour le détail", "Clic para desglose", "Clic per il dettaglio", "Klicken für Aufschlüsselung");

  return (
    <BlockStack gap="400">
      <Card>
        <InlineStack gap="200" wrap blockAlign="end">
          <PeriodFilter
            periods={PAYOUT_PERIODS}
            selectedKey={periodKey}
            onSelect={setPeriodKey}
            yearLabel={lt(locale, "Year", "Yıl", "Année", "Año", "Anno", "Jahr")}
            periodLabel={lt(locale, "Period", "Dönem", "Période", "Período", "Periodo", "Zeitraum")}
            allowAllLabel={lt(locale, "All periods", "Tüm dönemler", "Toutes périodes", "Todos los períodos", "Tutti i periodi", "Alle Zeiträume")}
          />
          <Button onClick={handleExport} loading={exporting} disabled={!t}>
            {lt(locale, "Export Excel", "Excel'e aktar", "Exporter Excel", "Exportar Excel", "Esporta Excel", "Excel exportieren")}
          </Button>
          <Button onClick={handlePdfExport} loading={exportingPdf} disabled={!t}>
            {lt(locale, "Export PDF", "PDF'e aktar", "Exporter PDF", "Exportar PDF", "Esporta PDF", "PDF exportieren")}
          </Button>
        </InlineStack>
      </Card>
      {loading ? (
        <Box padding="400">
          <InlineStack gap="200" blockAlign="center">
            <Spinner size="small" />
            <Text as="p" tone="subdued">{ui.loading}</Text>
          </InlineStack>
        </Box>
      ) : !t ? (
        <Banner tone="info">
          {lt(locale, "No data for this period.", "Bu dönem için veri yok.", "Aucune donnée pour cette période.", "Sin datos para este período.", "Nessun dato per questo periodo.", "Keine Daten für diesen Zeitraum.")}
        </Banner>
      ) : (
        <BlockStack gap="400">
          <FinanzamtSection
            title={lt(locale, "Andertal revenue (taxable)", "Andertal cirosu (vergiye tabi)", "CA Andertal (imposable)", "Facturación Andertal (imponible)", "Fatturato Andertal (imponibile)", "Andertal-Umsatz (steuerpflichtig)")}
            note={lt(locale, "Book only commission including VAT as Andertal income. Goods value is not Andertal revenue.", "Andertal geliri olarak yalnızca KDV dahil komisyonu kaydet. Mal tutarı Andertal cirosu değildir.", "Comptabiliser uniquement la commission TTC comme CA Andertal.", "Contabiliza solo la comisión con IVA como ingreso Andertal.", "Registra solo la commissione IVA inclusa come fatturato Andertal.", "Nur die Provision inkl. MwSt. als Andertal-Umsatz buchen. Der Warenwert ist kein Andertal-Umsatz.")}
          >
            <FinanzamtKpiCard
              tone="tax"
              label={lt(locale, "Commission incl. VAT", "Komisyon KDV dahil", "Commission TTC", "Comisión IVA incl.", "Commissione IVA incl.", "Provision inkl. MwSt.")}
              value={fmtCents((t.commission_net_cents || 0) + (t.commission_vat_cents || 0), locale)}
              hint={detailsHint}
              onOpen={() => openSellerMetric(
                lt(locale, "Commission incl. VAT", "Komisyon KDV dahil", "Commission TTC", "Comisión IVA incl.", "Commissione IVA incl.", "Provision inkl. MwSt."),
                lt(locale, "Taxable Andertal revenue: net commission plus VAT charged to the seller.", "Vergiye tabi Andertal cirosu: net komisyon + satıcıya yansıtılan KDV.", "CA imposable Andertal : commission nette + TVA.", "Ingreso imponible Andertal: comisión neta + IVA.", "Fatturato imponibile Andertal: commissione netta + IVA.", "Steuerpflichtiger Andertal-Umsatz: Provision netto zuzüglich dem Verkäufer belasteter USt."),
                (s) => (s.commission_net_cents || 0) + (s.commission_vat_cents || 0),
              )}
            />
            <FinanzamtKpiCard
              tone="tax"
              label={lt(locale, "Commission (net)", "Komisyon (net)", "Commission (net)", "Comisión (neta)", "Commissione (netta)", "Provision (netto)")}
              value={fmtCents(t.commission_net_cents, locale)}
              hint={detailsHint}
              onOpen={() => openSellerMetric(
                lt(locale, "Commission (net)", "Komisyon (net)", "Commission (net)", "Comisión (neta)", "Commissione (netta)", "Provision (netto)"),
                lt(locale, "Net marketplace fee before VAT.", "KDV öncesi net pazar yeri ücreti.", "Frais marketplace nets hors TVA.", "Tarifa neta del marketplace sin IVA.", "Fee marketplace netta senza IVA.", "Netto-Marktplatzgebühr vor USt."),
                (s) => s.commission_net_cents,
              )}
            />
            <FinanzamtKpiCard
              tone="tax"
              label={lt(locale, "Commission VAT", "Komisyon KDV", "TVA commission", "IVA comisión", "IVA commissione", "Provision USt")}
              value={fmtCents(t.commission_vat_cents, locale)}
              hint={detailsHint}
              onOpen={() => openSellerMetric(
                lt(locale, "Commission VAT", "Komisyon KDV", "TVA commission", "IVA comisión", "IVA commissione", "Provision USt"),
                lt(locale, "VAT on the marketplace commission (Andertal output tax).", "Pazar yeri komisyonu KDV’si (Andertal çıktı vergisi).", "TVA sur la commission marketplace.", "IVA sobre la comisión del marketplace.", "IVA sulla commissione marketplace.", "USt auf die Marktplatzprovision (Andertal-Umsatzsteuer)."),
                (s) => s.commission_vat_cents,
              )}
            />
          </FinanzamtSection>

          <FinanzamtSection
            title={lt(locale, "Marketplace pass-through (not Andertal revenue)", "Pazar yeri devri (Andertal cirosu değil)", "Flux marketplace (pas le CA Andertal)", "Paso marketplace (no es facturación Andertal)", "Passaggio marketplace (non fatturato Andertal)", "Marktplatz-Durchlauf (kein Andertal-Umsatz)")}
            note={lt(locale, "Seller GMV and customer shipping. Do not book these as Andertal turnover.", "Satıcı GMV ve müşteri kargosu. Bunları Andertal cirosu olarak kaydetme.", "GMV vendeur et livraison client — ne pas comptabiliser en CA Andertal.", "GMV del vendedor y envío del cliente: no contabilizar como facturación Andertal.", "GMV venditore e spedizione cliente: non registrare come fatturato Andertal.", "Verkäufer-GMV und Kundenversand. Nicht als Andertal-Umsatz buchen.")}
          >
            <FinanzamtKpiCard
              tone="pass"
              label={lt(locale, "Goods value (seller GMV)", "Mal tutarı (satıcı GMV)", "Valeur marchandises (GMV vendeur)", "Valor mercancía (GMV vendedor)", "Valore merce (GMV venditore)", "Warenwert (Verkäufer-GMV)")}
              value={fmtCents(t.gross_sale_cents, locale)}
              hint={detailsHint}
              onOpen={() => openSellerMetric(
                lt(locale, "Goods value (seller GMV)", "Mal tutarı (satıcı GMV)", "Valeur marchandises (GMV vendeur)", "Valor mercancía (GMV vendedor)", "Valore merce (GMV venditore)", "Warenwert (Verkäufer-GMV)"),
                lt(locale, "Merchandise subtotal — commission basis, pass-through to the seller.", "Mal ara toplamı — komisyon matrahı, satıcıya devir.", "Sous-total marchandises — base de commission, flux vendeur.", "Subtotal de mercancía — base de comisión, paso al vendedor.", "Subtotale merce — base commissione, passaggio al venditore.", "Warensubtotal — Provisionsbasis, Durchlauf an den Verkäufer."),
                (s) => s.gross_sale_cents,
              )}
            />
            <FinanzamtKpiCard
              tone="pass"
              label={lt(locale, "Shipping (customer)", "Kargo (müşteri)", "Livraison (client)", "Envío (cliente)", "Spedizione (cliente)", "Versand (Kunde)")}
              value={fmtCents(t.shipping_cents, locale)}
              hint={detailsHint}
              onOpen={() => openSellerMetric(
                lt(locale, "Shipping (customer)", "Kargo (müşteri)", "Livraison (client)", "Envío (cliente)", "Spedizione (cliente)", "Versand (Kunde)"),
                lt(locale, "Shipping the customer paid. If the platform paid the label, this amount is not paid out to the seller.", "Müşterinin ödediği kargo. Platform etiketi ödediyse bu tutar satıcıya gönderilmez.", "Livraison payée par le client. Si la plateforme a payé l’étiquette, ce montant n’est pas versé au vendeur.", "Envío pagado por el cliente. Si la plataforma pagó la etiqueta, no se paga al vendedor.", "Spedizione pagata dal cliente. Se la piattaforma ha pagato l’etichetta, non viene pagata al venditore.", "Vom Kunden gezahlter Versand. Hat die Plattform das Etikett bezahlt, wird dieser Betrag nicht an den Verkäufer ausgezahlt."),
                (s) => s.shipping_cents,
              )}
            />
            <FinanzamtKpiCard
              tone="pass"
              label={lt(locale, "Order value (goods + shipping)", "Sipariş değeri (mal + kargo)", "Valeur commande (marchandises + livraison)", "Valor pedido (mercancía + envío)", "Valore ordine (merci + spedizione)", "Bestellwert (Ware + Kundenversand)")}
              value={fmtCents((t.gross_sale_cents || 0) + (t.shipping_cents || 0), locale)}
              hint={detailsHint}
              onOpen={() => openSellerMetric(
                lt(locale, "Order value (goods + shipping)", "Sipariş değeri (mal + kargo)", "Valeur commande (marchandises + livraison)", "Valor pedido (mercancía + envío)", "Valore ordine (merci + spedizione)", "Bestellwert (Ware + Kundenversand)"),
                lt(locale, "Goods plus customer shipping. Still not Andertal revenue.", "Mal + müşteri kargosu. Hâlâ Andertal cirosu değil.", "Marchandises + livraison client. Toujours pas le CA Andertal.", "Mercancía + envío del cliente. Sigue sin ser facturación Andertal.", "Merce + spedizione cliente. Non è fatturato Andertal.", "Ware plus Kundenversand. Weiterhin kein Andertal-Umsatz."),
                (s) => (s.gross_sale_cents || 0) + (s.shipping_cents || 0),
              )}
            />
          </FinanzamtSection>

          <FinanzamtSection
            title={lt(locale, "Settlement", "Mahsup / ödeme", "Règlement", "Liquidación", "Regolamento", "Abrechnung")}
            note={lt(locale, "Payout = goods − net commission + customer shipping that the platform did not pay. Platform-paid shipping stays with Andertal — it left our pocket and was invoiced to the seller.", "Ödeme = mal − net komisyon + platformun ödemediği müşteri kargosu. Platformun ödediği kargo Andertal’de kalır — cebimizden çıktı ve satıcıya fatura edildi.", "Paiement = marchandises − commission nette + livraison client non payée par la plateforme. La livraison plateforme reste chez Andertal.", "Pago = mercancía − comisión neta + envío del cliente no pagado por la plataforma. El envío de la plataforma se queda en Andertal.", "Pagamento = merce − commissione netta + spedizione cliente non pagata dalla piattaforma. La spedizione piattaforma resta ad Andertal.", "Auszahlung = Ware − Provision netto + Kundenversand, den die Plattform nicht bezahlt hat. Plattform-Versand bleibt bei Andertal — aus unserer Tasche, dem Verkäufer berechnet.")}
          >
            <FinanzamtKpiCard
              tone="pay"
              label={lt(locale, "Seller payouts", "Satıcı ödemeleri", "Paiements vendeurs", "Pagos a vendedores", "Pagamenti venditori", "Auszahlungen an Verkäufer")}
              value={fmtCents(t.seller_payout_cents, locale)}
              hint={detailsHint}
              onOpen={() => openSellerMetric(
                lt(locale, "Seller payouts", "Satıcı ödemeleri", "Paiements vendeurs", "Pagos a vendedores", "Pagamenti venditori", "Auszahlungen an Verkäufer"),
                lt(locale, "Amount paid out to sellers for this period.", "Bu dönem satıcılara ödenen tutar.", "Montant versé aux vendeurs pour la période.", "Importe pagado a vendedores en el período.", "Importo pagato ai venditori nel periodo.", "An Verkäufer ausgezahlter Betrag in diesem Zeitraum."),
                (s) => s.seller_payout_cents,
              )}
            />
            <FinanzamtKpiCard
              tone="pay"
              label={lt(locale, "Customer shipping paid out", "Ödenen müşteri kargosu", "Livraison client versée", "Envío cliente pagado", "Spedizione cliente pagata", "Kundenversand ausgezahlt")}
              value={fmtCents(t.shipping_payout_cents, locale)}
              hint={detailsHint}
              onOpen={() => openSellerMetric(
                lt(locale, "Customer shipping paid out", "Ödenen müşteri kargosu", "Livraison client versée", "Envío cliente pagado", "Spedizione cliente pagata", "Kundenversand ausgezahlt"),
                lt(locale, "Customer shipping on orders without a platform-paid label.", "Platform etiketinin Andertal tarafından ödenmediği siparişlerdeki müşteri kargosu.", "Livraison client sur commandes sans étiquette payée par la plateforme.", "Envío del cliente en pedidos sin etiqueta pagada por la plataforma.", "Spedizione cliente su ordini senza etichetta pagata dalla piattaforma.", "Kundenversand bei Bestellungen ohne von Andertal bezahltes Plattformetikett."),
                (s) => s.shipping_payout_cents,
              )}
            />
            <FinanzamtKpiCard
              tone="warn"
              label={lt(locale, "Shipping (platform)", "Kargo (platform)", "Livraison (plateforme)", "Envío (plataforma)", "Spedizione (piattaforma)", "Versand (Plattform)")}
              value={fmtCents(t.label_cents, locale)}
              hint={detailsHint}
              onOpen={() => openSellerMetric(
                lt(locale, "Shipping (platform)", "Kargo (platform)", "Livraison (plateforme)", "Envío (plataforma)", "Spedizione (piattaforma)", "Versand (Plattform)"),
                lt(locale, "Andertal paid the Sendcloud label. Not paid out to the seller — it left our pocket and was invoiced to the seller.", "Sendcloud etiketini Andertal ödedi. Satıcıya ödenmez — cebimizden çıktı ve satıcıya fatura edildi.", "Andertal a payé l’étiquette Sendcloud. Non versé au vendeur.", "Andertal pagó la etiqueta Sendcloud. No se paga al vendedor.", "Andertal ha pagato l’etichetta Sendcloud. Non viene pagata al venditore.", "Andertal hat das Sendcloud-Etikett bezahlt. Keine Auszahlung an den Verkäufer — aus unserer Tasche, dem Verkäufer berechnet."),
                (s) => s.label_cents,
              )}
            />
            <FinanzamtKpiCard
              tone="neutral"
              label={lt(locale, "Paid by customer", "Müşteri ödedi", "Payé par le client", "Pagado por el cliente", "Pagato dal cliente", "Vom Kunden gezahlt")}
              value={fmtCents(t.customer_paid_cents, locale)}
              hint={detailsHint}
              onOpen={() => openSellerMetric(
                lt(locale, "Paid by customer", "Müşteri ödedi", "Payé par le client", "Pagado por el cliente", "Pagato dal cliente", "Vom Kunden gezahlt"),
                lt(locale, "Card / PayPal / other customer payment methods.", "Kart / PayPal / diğer müşteri ödeme yöntemleri.", "Carte / PayPal / autres moyens de paiement client.", "Tarjeta / PayPal / otros métodos de pago del cliente.", "Carta / PayPal / altri metodi di pagamento del cliente.", "Karte / PayPal / andere Kundenzahlungsarten."),
                (s) => s.customer_paid_cents,
              )}
            />
            <FinanzamtKpiCard
              tone="warn"
              label={lt(locale, "Paid via bonus points (Andertal)", "Bonus puanla ödendi (Andertal)", "Payé en points bonus (Andertal)", "Pagado con puntos bonus (Andertal)", "Pagato con punti bonus (Andertal)", "Von Bonuspunkten gezahlt (Andertal)")}
              value={fmtCents(t.bonus_funding_cents, locale)}
              hint={detailsHint}
              onOpen={() => openSellerMetric(
                lt(locale, "Paid via bonus points (Andertal)", "Bonus puanla ödendi (Andertal)", "Payé en points bonus (Andertal)", "Pagado con puntos bonus (Andertal)", "Pagato con punti bonus (Andertal)", "Von Bonuspunkten gezahlt (Andertal)"),
                lt(locale, "Andertal-funded bonus — Andertal expense, not a seller price cut.", "Andertal’in finanse ettiği bonus — Andertal gideri, satıcı indirimi değil.", "Bonus financé par Andertal — charge Andertal, pas une remise vendeur.", "Bonus financiado por Andertal — gasto Andertal, no un descuento del vendedor.", "Bonus finanziato da Andertal — costo Andertal, non uno sconto venditore.", "Von Andertal finanzierte Bonuspunkte — Andertal-Aufwand, kein Verkäuferrabatt."),
                (s) => s.bonus_funding_cents,
              )}
            />
            <FinanzamtKpiCard
              tone="neutral"
              label={lt(locale, "Refunds", "İadeler", "Remboursements", "Reembolsos", "Rimborsi", "Erstattungen")}
              value={fmtCents(t.refund_cents, locale)}
              hint={detailsHint}
              onOpen={() => openSellerMetric(
                lt(locale, "Refunds", "İadeler", "Remboursements", "Reembolsos", "Rimborsi", "Erstattungen"),
                lt(locale, "Refunds in this period.", "Bu dönemdeki iadeler.", "Remboursements sur la période.", "Reembolsos en el período.", "Rimborsi nel periodo.", "Erstattungen in diesem Zeitraum."),
                (s) => s.refund_cents,
              )}
            />
          </FinanzamtSection>

          <FinanzamtSection
            title={lt(locale, "Volume & OSS", "Hacim ve OSS", "Volume et OSS", "Volumen y OSS", "Volume e OSS", "Volumen & OSS")}
          >
            <FinanzamtKpiCard
              tone="neutral"
              label={lt(locale, "Orders / Sellers", "Sipariş / Satıcı", "Commandes / Vendeurs", "Pedidos / Vendedores", "Ordini / Venditori", "Bestellungen / Verkäufer")}
              value={`${t.order_count || 0} / ${t.seller_count || 0}`}
              hint={detailsHint}
              onOpen={() => openSellerMetric(
                lt(locale, "Orders / Sellers", "Sipariş / Satıcı", "Commandes / Vendeurs", "Pedidos / Vendedores", "Ordini / Venditori", "Bestellungen / Verkäufer"),
                lt(locale, "Paid orders and sellers in the selected period.", "Seçilen dönemde ödenmiş siparişler ve satıcılar.", "Commandes payées et vendeurs sur la période.", "Pedidos pagados y vendedores en el período.", "Ordini pagati e venditori nel periodo.", "Bezahlte Bestellungen und Verkäufer im gewählten Zeitraum."),
                (s) => s.order_count,
                "count",
              )}
            />
            <FinanzamtKpiCard
              tone="neutral"
              label={lt(locale, "OSS by destination country", "OSS hedef ülke", "OSS par pays de destination", "OSS por país de destino", "OSS per paese di destinazione", "OSS nach Bestimmungsland")}
              value={`${oss.length}`}
              hint={detailsHint}
              onOpen={() => setDetail({
                title: lt(locale, "OSS by destination country", "OSS hedef ülke", "OSS par pays de destination", "OSS por país de destino", "OSS per paese di destinazione", "OSS nach Bestimmungsland"),
                body: lt(locale, "Customer-order VAT by ship-to country. This is seller goods VAT, not Andertal commission VAT.", "Teslim ülkesine göre müşteri sipariş KDV’si. Bu satıcı mal KDV’sidir, Andertal komisyon KDV’si değil.", "TVA des commandes client par pays de livraison. TVA marchandises vendeur, pas TVA commission Andertal.", "IVA de pedidos del cliente por país de envío. IVA de mercancía del vendedor, no IVA de comisión Andertal.", "IVA degli ordini cliente per paese di spedizione. IVA merce venditore, non IVA commissione Andertal.", "Kunden-USt nach Lieferland. Das ist Verkäufer-Waren-USt, nicht die Andertal-Provisions-USt."),
                kind: "oss",
                rows: oss,
              })}
            />
          </FinanzamtSection>
        </BlockStack>
      )}

      <Modal
        open={!!detail}
        onClose={() => setDetail(null)}
        title={detail?.title || ""}
        large
      >
        <Modal.Section>
          <BlockStack gap="300">
            {detail?.body ? <Text as="p" tone="subdued">{detail.body}</Text> : null}
            {detail?.kind === "oss" ? (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr>
                      {[
                        lt(locale, "Country", "Ülke", "Pays", "País", "Paese", "Land"),
                        colOrders,
                        lt(locale, "Goods value", "Mal tutarı", "Valeur marchandises", "Valor mercancía", "Valore merce", "Warenwert"),
                        lt(locale, "Net", "Net", "Net", "Neto", "Netto", "Netto"),
                        "USt",
                      ].map((h, i) => (
                        <th key={h} style={{ textAlign: i === 0 ? "left" : "right", padding: "8px 10px", borderBottom: "1px solid #e5e7eb", color: "#6b7280", fontSize: 11 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(detail.rows || []).map((row) => (
                      <tr key={row.country}>
                        <td style={{ padding: "8px 10px", borderBottom: "1px solid #f3f4f6" }}>{row.country || "—"}</td>
                        <td style={{ padding: "8px 10px", borderBottom: "1px solid #f3f4f6", textAlign: "right" }}>{row.order_count || 0}</td>
                        <td style={{ padding: "8px 10px", borderBottom: "1px solid #f3f4f6", textAlign: "right" }}>{fmtCents(row.gross_cents, locale)}</td>
                        <td style={{ padding: "8px 10px", borderBottom: "1px solid #f3f4f6", textAlign: "right" }}>{fmtCents(row.net_cents, locale)}</td>
                        <td style={{ padding: "8px 10px", borderBottom: "1px solid #f3f4f6", textAlign: "right" }}>{fmtCents(row.vat_cents, locale)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: "left", padding: "8px 10px", borderBottom: "1px solid #e5e7eb", color: "#6b7280", fontSize: 11 }}>{colSeller}</th>
                      <th style={{ textAlign: "left", padding: "8px 10px", borderBottom: "1px solid #e5e7eb", color: "#6b7280", fontSize: 11 }}>{colPeriod}</th>
                      <th style={{ textAlign: "right", padding: "8px 10px", borderBottom: "1px solid #e5e7eb", color: "#6b7280", fontSize: 11 }}>{colOrders}</th>
                      <th style={{ textAlign: "right", padding: "8px 10px", borderBottom: "1px solid #e5e7eb", color: "#6b7280", fontSize: 11 }}>{colAmount}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(detail?.rows || []).map((row, idx) => (
                      <tr key={`${row.name}-${row.period}-${idx}`}>
                        <td style={{ padding: "8px 10px", borderBottom: "1px solid #f3f4f6" }}>{row.name}</td>
                        <td style={{ padding: "8px 10px", borderBottom: "1px solid #f3f4f6", color: "#6b7280" }}>{row.period}</td>
                        <td style={{ padding: "8px 10px", borderBottom: "1px solid #f3f4f6", textAlign: "right" }}>{row.orders}</td>
                        <td style={{ padding: "8px 10px", borderBottom: "1px solid #f3f4f6", textAlign: "right", fontWeight: 600 }}>{detail?.format === "count" ? row.cents : fmtCents(row.cents, locale)}</td>
                      </tr>
                    ))}
                  </tbody>
                  {detail?.kind === "sellers" ? (
                    <tfoot>
                      <tr>
                        <td colSpan={3} style={{ padding: "10px", fontWeight: 700 }}>{lt(locale, "Total", "Toplam", "Total", "Total", "Totale", "Summe")}</td>
                        <td style={{ padding: "10px", textAlign: "right", fontWeight: 700 }}>{detail.format === "count" ? detail.totalCents : fmtCents(detail.totalCents, locale)}</td>
                      </tr>
                    </tfoot>
                  ) : null}
                </table>
              </div>
            )}
          </BlockStack>
        </Modal.Section>
      </Modal>
    </BlockStack>
  );
}

/* ─── Root Component ─────────────────────────────────────────────────────────── */

export default function BillingSettingsPage() {
  const [selectedTab, setSelectedTab] = useState(0);
  const [isSuperuser, setIsSuperuser] = useState(false);
  const [mySellerId, setMySellerId] = useState(null);
  const localeFromIntl = useLocale();
  const locale = localeFromIntl || "de";
  const ui = getUI(locale);

  useEffect(() => {
    setIsSuperuser(localStorage.getItem("sellerIsSuperuser") === "true");
    setMySellerId(localStorage.getItem("sellerId"));
  }, []);

  const tabs = [
    { id: "order-docs", content: ui.orderDocuments },
    { id: "commission", content: ui.commissionInvoices },
    ...(isSuperuser
      ? [{ id: "finanzamt", content: lt(locale, "Platform / Tax office", "Platform / Vergi Dairesi", "Plateforme / Fisc", "Plataforma / Hacienda", "Piattaforma / Fisco", "Plattform / Finanzamt") }]
      : []),
  ];

  return (
    <BlockStack gap="400">
      <Tabs tabs={tabs} selected={selectedTab} onSelect={setSelectedTab}>
        <Box paddingBlockStart="400">
          {selectedTab === 0 ? (
            <OrderDocumentsTab isSuperuser={isSuperuser} mySellerId={mySellerId} />
          ) : selectedTab === 1 ? (
            <CommissionInvoicesTab isSuperuser={isSuperuser} mySellerId={mySellerId} />
          ) : isSuperuser ? (
            <FinanzamtTab />
          ) : null}
        </Box>
      </Tabs>
    </BlockStack>
  );
}
