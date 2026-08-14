"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Card, Text, BlockStack, InlineStack, Button, Box, Tabs, TextField,
  Select, Banner, Spinner, Divider, Checkbox,
} from "@shopify/polaris";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";
import { getOrderPdfDownloadUrl, downloadAuthenticatedPdf } from "@/lib/order-pdf-url";
import { useParams } from "next/navigation";
import { useLocale } from "next-intl";
import { getUI } from "@/lib/ui-strings";
import { dateLocaleFor, lt } from "@/lib/locale-text";
import { userError } from "@/lib/api-error-messages";

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
 * Billing period = calendar month (matches the actual Provisionsrechnung cadence — seller_payouts
 * rows are generated per month, see payouts.js generateCommissionInvoicesForMonth). Most recent
 * first, current (in-progress) month included so sellers can preview this month's orders.
 */
function generateMonthlyPeriods(count = 30) {
  const periods = [];
  const now = new Date();
  let year = now.getUTCFullYear();
  let month = now.getUTCMonth();
  for (let i = 0; i < count; i++) {
    const monthStart = new Date(Date.UTC(year, month, 1));
    const monthEnd = new Date(Date.UTC(year, month + 1, 0));
    periods.push({
      key: `${year}-${String(month + 1).padStart(2, "0")}`,
      year,
      label: monthStart.toLocaleDateString("de-DE", { month: "long" }),
      start: monthStart.toISOString().slice(0, 10),
      end: monthEnd.toISOString().slice(0, 10),
    });
    month -= 1;
    if (month < 0) { month = 11; year -= 1; }
  }
  return periods;
}

const MONTHLY_PERIODS = generateMonthlyPeriods(30);

/** Year select + period-within-year select — parent owns `selectedKey`, this is fully controlled. */
const PERIOD_ALL_KEY = "__all__";

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
      <div style={{ minWidth: 160 }}>
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
        padding: "10px 12px",
        textAlign: align,
        fontWeight: 600,
        color: "#6d7175",
        cursor: "pointer",
        userSelect: "none",
        background: "#f6f6f7",
        whiteSpace: "nowrap",
        fontSize: 13,
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

function SellerGroupHeader({ label }) {
  return (
    <tr>
      <td
        colSpan={9}
        style={{
          padding: "8px 12px",
          background: "#f0f5ff",
          fontWeight: 700,
          fontSize: 12,
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
  const hasShipDoc =
    !!String(order.sendcloud_label_url || "").trim() ||
    !!String(order.tracking_number || "").trim() ||
    order.delivery_status === "versendet" ||
    order.delivery_status === "zugestellt";

  return (
    <tr
      style={{
        borderBottom: "1px solid #f1f1f1",
        background: selected ? "#eff6ff" : "#fff",
      }}
    >
      <td style={{ padding: "8px 12px", width: 32 }}>
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          style={{ cursor: "pointer" }}
        />
      </td>
      <td style={{ padding: "8px 12px", fontSize: 13, fontWeight: 600, whiteSpace: "nowrap" }}>
        <a
          href={`/${locale}/orders/${order.id}`}
          style={{ color: "#1d4ed8", textDecoration: "none" }}
        >
          #{order.order_number || order.id?.slice(0, 8)}
        </a>
      </td>
      <td style={{ padding: "8px 12px", fontSize: 13, color: "#374151", whiteSpace: "nowrap" }}>
        {fmtDate(order.created_at, locale)}
      </td>
      <td style={{ padding: "8px 12px", fontSize: 13, color: "#374151" }}>
        {customerName(order)}
      </td>
      <td style={{ padding: "8px 12px", fontSize: 13, textAlign: "right", whiteSpace: "nowrap" }}>
        {fmtCents(orderTotal(order), locale)}
      </td>
      <td style={{ padding: "8px 12px", textAlign: "center" }}>
        <DocBtn orderId={order.id} kind="invoice" label={ui.invoiceDoc} available locale={locale} />
      </td>
      <td style={{ padding: "8px 12px", textAlign: "center" }}>
        <DocBtn orderId={order.id} kind="lieferschein" label={ui.deliveryNoteDoc} available locale={locale} />
      </td>
      <td style={{ padding: "8px 12px", textAlign: "center" }}>
        <DocBtn orderId={order.id} kind="versandlabel" label={ui.shippingLabel} available={hasShipDoc} locale={locale} />
      </td>
      <td style={{ padding: "8px 12px", textAlign: "center" }}>
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
  const [periodKey, setPeriodKey] = useState(MONTHLY_PERIODS[0].key);
  const selectedPeriod = MONTHLY_PERIODS.find((p) => p.key === periodKey) || MONTHLY_PERIODS[0];
  const [docFilter, setDocFilter] = useState("all");
  const [sort, setSort] = useState({ field: "created_at", dir: "desc" });
  const [selected, setSelected] = useState(new Set());

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

    // Payment period (calendar month, matches the Provisionsrechnung cadence)
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
        : filteredOrders.slice(0, 10);
    for (const o of targets) {
      await downloadAuthenticatedPdf(getOrderPdfDownloadUrl(o.id, "invoice", locale), `invoice-${o.id}.pdf`).catch(() => {});
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
              periods={MONTHLY_PERIODS}
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
            <Button size="slim" onClick={handleBulkDownload}>
              {ui.openInvoices} {selected.size > 0 ? `(${selected.size})` : ""}
            </Button>
            <Text as="span" tone="subdued" variant="bodySm">
              {filteredOrders.length} {ui.orders}
              {selected.size > 0 ? ` · ${selected.size} ${ui.selected}` : ""}
            </Text>
          </InlineStack>
        </BlockStack>
      </Card>

      {/* Table */}
      <Card padding="0">
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr>
                <th
                  style={{ padding: "10px 12px", width: 32, background: "#f6f6f7", borderBottom: "1px solid #e1e3e5" }}
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
                      padding: "10px 12px",
                      textAlign: "center",
                      fontWeight: 600,
                      color: "#6d7175",
                      background: "#f6f6f7",
                      fontSize: 13,
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
      const p = MONTHLY_PERIODS.find((x) => x.key === periodKey);
      if (p) list = list.filter((i) => String(i.period_start || "").slice(0, 10) === p.start);
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

  const handleBulkDownload = async () => {
    const targets = selected.size > 0
      ? sortedInvoices.filter((i) => selected.has(i.id))
      : sortedInvoices;
    for (const inv of targets) {
      if (inv.pdf_url) await downloadAuthenticatedPdf(absPdfUrl(inv.pdf_url), `commission-invoice-${inv.id}.pdf`).catch(() => {});
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
        <td style={{ padding: "10px 12px", width: 32 }}>
          <input
            type="checkbox"
            checked={selected.has(inv.id)}
            onChange={() => toggleOne(inv.id)}
            style={{ cursor: "pointer" }}
          />
        </td>
        <td style={{ padding: "10px 12px", fontSize: 13, fontWeight: 600, color: "#374151" }}>
          {inv.period || inv.period_label || "—"}
        </td>
        <td style={{ padding: "10px 12px", fontSize: 13, color: "#374151" }}>
          <span
            style={{
              display: "inline-block",
              padding: "2px 10px",
              borderRadius: 12,
              background: "#eff6ff",
              color: "#1d4ed8",
              fontWeight: 600,
              fontSize: 12,
            }}
          >
            {ui.invoiceDoc}
          </span>
        </td>
        <td style={{ padding: "10px 12px", fontSize: 13, textAlign: "right" }}>
          {inv.amount_cents != null ? fmtCents(inv.amount_cents, locale) : "—"}
        </td>
        <td style={{ padding: "10px 12px", textAlign: "center" }}>
          {inv.pdf_url ? (
            <button
              type="button"
              onClick={() => downloadAuthenticatedPdf(absPdfUrl(inv.pdf_url), `commission-invoice-${inv.id}.pdf`).catch(() => {})}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                padding: "4px 10px",
                borderRadius: 4,
                border: "1px solid #e5e7eb",
                background: "#f9fafb",
                color: "#374151",
                fontSize: 12,
                fontWeight: 500,
                textDecoration: "none",
                cursor: "pointer",
              }}
            >
              ↓ PDF
            </button>
          ) : (
            <span style={{ color: "#d1d5db", fontSize: 12 }}>—</span>
          )}
        </td>
      </tr>
    ));

  const tableHead = (
    <thead>
      <tr>
        <th style={{ padding: "10px 12px", width: 32, background: "#f6f6f7", borderBottom: "1px solid #e1e3e5" }}>
          <input
            type="checkbox"
            checked={sortedInvoices.length > 0 && sortedInvoices.every((i) => selected.has(i.id))}
            onChange={toggleAll}
            style={{ cursor: "pointer" }}
          />
        </th>
        <ColHeader label={ui.period} field="period_start" sort={sort} onSort={toggleSort} />
        <th
          style={{
            padding: "10px 12px", textAlign: "left", fontWeight: 600, color: "#6d7175",
            background: "#f6f6f7", fontSize: 13, borderBottom: "1px solid #e1e3e5",
          }}
        >
          {ui.type}
        </th>
        <ColHeader label={ui.amount} field="amount_cents" sort={sort} onSort={toggleSort} align="right" />
        <th
          style={{
            padding: "10px 12px", textAlign: "center", fontWeight: 600, color: "#6d7175",
            background: "#f6f6f7", fontSize: 13, borderBottom: "1px solid #e1e3e5",
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
        <Button size="slim" onClick={handleBulkDownload} disabled={sortedInvoices.length === 0}>
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
          periods={MONTHLY_PERIODS}
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
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              {tableHead}
              <tbody>
                {isSuperuser ? (
                  <>
                    {ownInvoices.length > 0 && (
                      <>
                        <tr>
                          <td
                            colSpan={5}
                            style={{
                              padding: "8px 12px",
                              background: "#f0f5ff",
                              fontWeight: 700,
                              fontSize: 12,
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
                            colSpan={5}
                            style={{
                              padding: "8px 12px",
                              background: "#f0f5ff",
                              fontWeight: 700,
                              fontSize: 12,
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
              </tbody>
            </table>
          )}
        </div>
      </Card>
    </BlockStack>
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
  const selectedPeriod = periodKey !== PERIOD_ALL_KEY ? MONTHLY_PERIODS.find((p) => p.key === periodKey) : null;
  const periodStart = selectedPeriod?.start || "";
  const periodEnd = selectedPeriod?.end || "";
  const [data, setData] = useState({ totals: null, sellers: [] });
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (periodStart) qs.set("period_start", periodStart);
      if (periodEnd) qs.set("period_end", periodEnd);
      const res = await client
        .request(`/admin-hub/v1/billing/finanzamt${qs.toString() ? `?${qs}` : ""}`)
        .catch(() => ({ totals: null, sellers: [] }));
      setData({ totals: res?.totals || null, sellers: res?.sellers || [] });
    } finally {
      setLoading(false);
    }
  }, [periodStart, periodEnd, client]);

  useEffect(() => { load(); }, [load]);

  const absPdfUrl = (u) => (/^https?:\/\//i.test(u) ? u : `${client.baseURL}${u}`);
  const t = data.totals;

  const [exporting, setExporting] = useState(false);
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

  return (
    <BlockStack gap="400">
      <Card>
        <InlineStack gap="200" wrap blockAlign="end">
          <PeriodFilter
            periods={MONTHLY_PERIODS}
            selectedKey={periodKey}
            onSelect={setPeriodKey}
            yearLabel={lt(locale, "Year", "Yıl", "Année", "Año", "Anno", "Jahr")}
            periodLabel={lt(locale, "Period", "Dönem", "Période", "Período", "Periodo", "Zeitraum")}
            allowAllLabel={lt(locale, "All periods", "Tüm dönemler", "Toutes périodes", "Todos los períodos", "Tutti i periodi", "Alle Zeiträume")}
          />
          <Button onClick={handleExport} loading={exporting} disabled={!t}>
            {lt(locale, "Export Excel", "Excel'e aktar", "Exporter Excel", "Exportar Excel", "Esporta Excel", "Excel exportieren")}
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
      ) : !t || data.sellers.length === 0 ? (
        <Banner tone="info">
          {lt(locale, "No data for this period.", "Bu dönem için veri yok.", "Aucune donnée pour cette période.", "Sin datos para este período.", "Nessun dato per questo periodo.", "Keine Daten für diesen Zeitraum.")}
        </Banner>
      ) : (
        <>
          <Card>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
              {[
                { label: lt(locale, "Gross sale", "Brüt satış", "Vente brute", "Venta bruta", "Vendita lorda", "Brutto Warenverkauf"), value: fmtCents(t.gross_sale_cents, locale) },
                { label: lt(locale, "Customer paid", "Müşteri ödemesi", "Payé par le client", "Pagado por el cliente", "Pagato dal cliente", "Vom Kunden gezahlt"), value: fmtCents(t.customer_paid_cents, locale) },
                { label: lt(locale, "Bonus funding", "Bonus finansmanı", "Financement bonus", "Financiación bonus", "Finanziamento bonus", "Andertal-Bonusfinanzierung"), value: fmtCents(t.bonus_funding_cents, locale) },
                { label: lt(locale, "Commission (net)", "Komisyon (net)", "Commission (net)", "Comisión (neta)", "Commissione (netta)", "Provision (netto)"), value: fmtCents(t.commission_net_cents, locale) },
                { label: lt(locale, "Commission VAT", "Komisyon KDV", "TVA commission", "IVA comisión", "IVA commissione", "Provision USt"), value: fmtCents(t.commission_vat_cents, locale) },
                { label: lt(locale, "Seller payouts", "Satıcı ödemeleri", "Paiements vendeurs", "Pagos a vendedores", "Pagamenti venditori", "Auszahlungen an Verkäufer"), value: fmtCents(t.seller_payout_cents, locale) },
                { label: lt(locale, "Refunds", "İadeler", "Remboursements", "Reembolsos", "Rimborsi", "Erstattungen"), value: fmtCents(t.refund_cents, locale) },
                { label: lt(locale, "Orders / Sellers", "Sipariş / Satıcı", "Commandes / Vendeurs", "Pedidos / Vendedores", "Ordini / Venditori", "Bestellungen / Verkäufer"), value: `${t.order_count} / ${t.seller_count}` },
              ].map((s) => (
                <div key={s.label} style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: "8px 10px" }}>
                  <div style={{ fontSize: 11, color: "#6b7280", textTransform: "uppercase" }}>{s.label}</div>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>{s.value}</div>
                </div>
              ))}
            </div>
          </Card>
          <Card>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ color: "#6b7280", fontSize: 11, textTransform: "uppercase", borderBottom: "1px solid #e5e7eb" }}>
                    <th style={{ textAlign: "left", padding: "4px 8px" }}>{lt(locale, "Seller", "Satıcı", "Vendeur", "Vendedor", "Venditore", "Verkäufer")}</th>
                    <th style={{ textAlign: "left", padding: "4px 8px" }}>{lt(locale, "Period", "Dönem", "Période", "Período", "Periodo", "Zeitraum")}</th>
                    <th style={{ textAlign: "right", padding: "4px 8px" }}>{lt(locale, "Gross", "Brüt", "Brut", "Bruto", "Lordo", "Brutto")}</th>
                    <th style={{ textAlign: "right", padding: "4px 8px" }}>{lt(locale, "Commission (+VAT)", "Komisyon (+KDV)", "Commission (+TVA)", "Comisión (+IVA)", "Commissione (+IVA)", "Provision (+USt)")}</th>
                    <th style={{ textAlign: "right", padding: "4px 8px" }}>{lt(locale, "Payout", "Ödeme", "Paiement", "Pago", "Pagamento", "Auszahlung")}</th>
                    <th style={{ textAlign: "center", padding: "4px 8px" }}>{lt(locale, "Status", "Durum", "Statut", "Estado", "Stato", "Status")}</th>
                    <th style={{ textAlign: "center", padding: "4px 8px" }}>PDF</th>
                  </tr>
                </thead>
                <tbody>
                  {data.sellers.map((row) => (
                    <tr key={row.payout_id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                      <td style={{ padding: "6px 8px" }}>{row.store_name}</td>
                      <td style={{ padding: "6px 8px", whiteSpace: "nowrap", color: "#6b7280" }}>{fmtDate(row.period_start, locale)} – {fmtDate(row.period_end, locale)}</td>
                      <td style={{ padding: "6px 8px", textAlign: "right" }}>{fmtCents(row.gross_sale_cents, locale)}</td>
                      <td style={{ padding: "6px 8px", textAlign: "right" }}>{fmtCents(row.commission_net_cents + row.commission_vat_cents, locale)}</td>
                      <td style={{ padding: "6px 8px", textAlign: "right", fontWeight: 600 }}>{fmtCents(row.seller_payout_cents, locale)}</td>
                      <td style={{ padding: "6px 8px", textAlign: "center" }}>{row.status}</td>
                      <td style={{ padding: "6px 8px", textAlign: "center" }}>
                        <button
                          type="button"
                          onClick={() => downloadAuthenticatedPdf(absPdfUrl(row.pdf_url), `commission-invoice-${row.payout_id}.pdf`)}
                          style={{ border: "1px solid #e5e7eb", borderRadius: 4, padding: "2px 8px", fontSize: 11, cursor: "pointer", background: "#f9fafb" }}
                        >
                          PDF
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
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
