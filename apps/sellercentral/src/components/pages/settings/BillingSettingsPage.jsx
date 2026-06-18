"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Card, Text, BlockStack, InlineStack, Button, Box, Tabs, TextField,
  Select, Banner, Spinner, Divider, Checkbox,
} from "@shopify/polaris";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";
import { getOrderPdfDownloadUrl } from "@/lib/order-pdf-url";
import { useParams } from "next/navigation";
import { useLocale } from "next-intl";
import { getUI } from "@/lib/ui-strings";

function fmtDate(d, locale) {
  if (!d) return "—";
  const loc = locale === "en" ? "en-GB" : locale === "tr" ? "tr-TR" : "de-DE";
  return new Date(d).toLocaleDateString(loc, { day: "2-digit", month: "2-digit", year: "numeric" });
}
function fmtCents(c, locale) {
  if (c == null || c === "") return "—";
  const loc = locale === "en" ? "en-GB" : locale === "tr" ? "tr-TR" : "de-DE";
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

const DOC_TYPE_KEYS = [
  { key: "invoice",     uiKey: "invoiceDoc" },
  { key: "lieferschein",uiKey: "deliveryNoteDoc" },
  { key: "versandlabel",uiKey: "shippingLabel" },
  { key: "retoure",     uiKey: "returnDoc" },
];

function DocBtn({ orderId, kind, label, available }) {
  if (!available) return <span style={{ color: "#d1d5db", fontSize: 12 }}>—</span>;
  return (
    <a
      href={getOrderPdfDownloadUrl(orderId, kind)}
      target="_blank"
      rel="noreferrer"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 3,
        padding: "3px 7px",
        borderRadius: 4,
        border: "1px solid #e5e7eb",
        background: "#f9fafb",
        color: "#374151",
        fontSize: 11,
        fontWeight: 500,
        textDecoration: "none",
        cursor: "pointer",
        whiteSpace: "nowrap",
      }}
    >
      ↓ {label}
    </a>
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
    getOrderPdfDownloadUrl(o.id, "invoice"),
    getOrderPdfDownloadUrl(o.id, "lieferschein"),
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
  const hasTracking =
    !!order.tracking_number ||
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
        <DocBtn orderId={order.id} kind="invoice" label={ui.invoiceDoc} available />
      </td>
      <td style={{ padding: "8px 12px", textAlign: "center" }}>
        <DocBtn orderId={order.id} kind="lieferschein" label={ui.deliveryNoteDoc} available />
      </td>
      <td style={{ padding: "8px 12px", textAlign: "center" }}>
        <DocBtn orderId={order.id} kind="versandlabel" label={ui.shippingLabel} available={hasTracking} />
      </td>
      <td style={{ padding: "8px 12px", textAlign: "center" }}>
        <DocBtn orderId={order.id} kind="retoure" label={ui.returnDoc} available={hasReturn} />
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
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
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

    // Date range
    if (dateFrom) {
      const from = new Date(dateFrom).getTime();
      list = list.filter((o) => new Date(o.created_at).getTime() >= from);
    }
    if (dateTo) {
      const to = new Date(dateTo + "T23:59:59").getTime();
      list = list.filter((o) => new Date(o.created_at).getTime() <= to);
    }

    // Doc type filter
    if (docFilter === "versandlabel") {
      list = list.filter(
        (o) =>
          !!o.tracking_number ||
          o.delivery_status === "versendet" ||
          o.delivery_status === "zugestellt"
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
  }, [orders, search, dateFrom, dateTo, docFilter, sort, returnsSet]);

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

  const handleBulkDownload = () => {
    const targets =
      selected.size > 0
        ? filteredOrders.filter((o) => selected.has(o.id))
        : filteredOrders.slice(0, 10);
    for (const o of targets) {
      window.open(getOrderPdfDownloadUrl(o.id, "invoice"), "_blank");
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
            <Box minWidth="140px">
              <TextField
                label={ui.from}
                type="date"
                value={dateFrom}
                onChange={setDateFrom}
                autoComplete="off"
              />
            </Box>
            <Box minWidth="140px">
              <TextField
                label={ui.to}
                type="date"
                value={dateTo}
                onChange={setDateTo}
                autoComplete="off"
              />
            </Box>
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

  const { ownInvoices, sellerGroups } = useMemo(() => {
    if (!isSuperuser) return { ownInvoices: invoices, sellerGroups: [] };
    const own = invoices.filter((i) => String(i.seller_id || "") === String(mySellerId || ""));
    const groups = {};
    for (const inv of invoices) {
      if (String(inv.seller_id || "") === String(mySellerId || "")) continue;
      const sid = String(inv.seller_id || "unknown");
      if (!groups[sid]) groups[sid] = [];
      groups[sid].push(inv);
    }
    const grouped = Object.entries(groups).sort(([a], [b]) =>
      (sellerLabelMap[a] || a).localeCompare(sellerLabelMap[b] || b)
    );
    return { ownInvoices: own, sellerGroups: grouped };
  }, [invoices, isSuperuser, mySellerId, sellerLabelMap]);

  const toggleOne = (id) => {
    setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };
  const toggleAll = () => {
    const allIds = invoices.map((i) => i.id);
    const allSel = allIds.length > 0 && allIds.every((id) => selected.has(id));
    setSelected(allSel ? new Set() : new Set(allIds));
  };

  const handleBulkDownload = () => {
    const targets = selected.size > 0
      ? invoices.filter((i) => selected.has(i.id))
      : invoices;
    for (const inv of targets) {
      if (inv.pdf_url) window.open(inv.pdf_url, "_blank");
    }
  };

  const [backfilling, setBackfilling] = useState(false);
  const handleBackfill = async () => {
    if (!isSuperuser) return;
    setBackfilling(true);
    try {
      const res = await client.request("/admin-hub/v1/payouts/backfill", { method: "POST" });
      alert(res?.message || (locale === "en" ? "Backfill completed" : locale === "tr" ? "Backfill tamamlandı" : "Backfill abgeschlossen"));
      // Reload
      const invRes = await client.request("/admin-hub/v1/commission-invoices").catch(() => ({ invoices: [] }));
      setInvoices(invRes?.invoices || []);
    } catch (e) {
      alert((locale === "en" ? "Error: " : locale === "tr" ? "Hata: " : "Fehler: ") + (e?.message || (locale === "en" ? "Unknown" : locale === "tr" ? "Bilinmiyor" : "Unbekannt")));
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
            <a
              href={inv.pdf_url}
              target="_blank"
              rel="noreferrer"
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
              }}
            >
              ↓ PDF
            </a>
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
            checked={invoices.length > 0 && invoices.every((i) => selected.has(i.id))}
            onChange={toggleAll}
            style={{ cursor: "pointer" }}
          />
        </th>
        {[ui.period, ui.type, ui.amount, "PDF"].map((h, i) => (
          <th
            key={h}
            style={{
              padding: "10px 12px",
              textAlign: i === 2 ? "right" : i === 3 ? "center" : "left",
              fontWeight: 600,
              color: "#6d7175",
              background: "#f6f6f7",
              fontSize: 13,
              borderBottom: "1px solid #e1e3e5",
            }}
          >
            {h}
          </th>
        ))}
      </tr>
    </thead>
  );

  return (
    <BlockStack gap="300">
      <InlineStack gap="200" blockAlign="center">
        <Button size="slim" onClick={handleBulkDownload} disabled={invoices.length === 0}>
          {ui.downloadAll} {selected.size > 0 ? `(${selected.size})` : ""}
        </Button>
        {isSuperuser && (
          <Button size="slim" tone="critical" onClick={handleBackfill} loading={backfilling}>
            {ui.backfill}
          </Button>
        )}
        <Text as="span" tone="subdued" variant="bodySm">
          {invoices.length} {ui.commissionInvoices}
        </Text>
      </InlineStack>

      <Card padding="0">
        <div style={{ overflowX: "auto" }}>
          {invoices.length === 0 ? (
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
                  renderRows(invoices)
                )}
              </tbody>
            </table>
          )}
        </div>
      </Card>
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
  ];

  return (
    <BlockStack gap="400">
      <Tabs tabs={tabs} selected={selectedTab} onSelect={setSelectedTab}>
        <Box paddingBlockStart="400">
          {selectedTab === 0 ? (
            <OrderDocumentsTab isSuperuser={isSuperuser} mySellerId={mySellerId} />
          ) : (
            <CommissionInvoicesTab isSuperuser={isSuperuser} mySellerId={mySellerId} />
          )}
        </Box>
      </Tabs>
    </BlockStack>
  );
}
