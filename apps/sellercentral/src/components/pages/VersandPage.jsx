"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Button, InlineStack, BlockStack } from "@shopify/polaris";
import { useLocale } from "next-intl";
import { fmtMoney } from "@/lib/locale-text";
import { getShipStrings, fmtShipDate } from "@/lib/ship-i18n";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";
import ShipLabelModal from "@/components/orders/ShipLabelModal";
import { buildShipLieferscheinHtml } from "@/lib/ship-print-html";

const OTHER_CARRIER = "__other__";
const FALLBACK_CARRIERS = ["DHL", "DPD", "GLS", "UPS", "FedEx", "Hermes", "Go! Express"];

export default function VersandPage() {
  const router = useRouter();
  const locale = useLocale();
  const s = useMemo(() => getShipStrings(locale), [locale]);

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isSuperuser, setIsSuperuser] = useState(false);
  useEffect(() => { setIsSuperuser(localStorage.getItem("sellerIsSuperuser") === "true"); }, []);
  const [scannedItems, setScannedItems] = useState({});
  const [barcodeInput, setBarcodeInput] = useState("");
  const [scanError, setScanError] = useState("");
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(0);
  const [carrier, setCarrier] = useState("DHL");
  const [customCarrier, setCustomCarrier] = useState("");
  const [trackings, setTrackings] = useState({});
  const [saving, setSaving] = useState(false);
  const [phase, setPhase] = useState("scan");
  const barcodeRef = useRef(null);
  const [dbCarriers, setDbCarriers] = useState([]);

  const carrierOptions = useMemo(
    () => (dbCarriers.length > 0 ? [...dbCarriers.map((dc) => dc.name), OTHER_CARRIER] : [...FALLBACK_CARRIERS, OTHER_CARRIER]),
    [dbCarriers],
  );

  const resolveCarrierName = () => (carrier === OTHER_CARRIER ? customCarrier.trim() || s.other : carrier);

  useEffect(() => {
    getMedusaAdminClient().getCarriers().then((data) => {
      const active = (data?.carriers || []).filter((c) => c.is_active);
      if (active.length > 0) {
        setDbCarriers(active);
        setCarrier(active[0].name);
      }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const stored = sessionStorage.getItem("versand_orders");
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setOrders(parsed);
        loadItemsForOrders(parsed);
        sessionStorage.removeItem("versand_orders");
        setLoading(false);
        return;
      } catch { /* ignore */ }
    }
    fetchPendingOrders();
  }, []);

  const fetchPendingOrders = async () => {
    setLoading(true);
    try {
      const client = getMedusaAdminClient();
      const data = await client.getOrders({ delivery_status: "offen", limit: 50 });
      const ordersData = data.orders || [];
      await loadItemsForOrders(ordersData);
    } catch { /* ignore */ }
    setLoading(false);
  };

  const loadItemsForOrders = async (ordersData) => {
    const client = getMedusaAdminClient();
    // Always re-fetch order detail so items are seller-filtered + enriched (sku/ean)
    // from the backend — never trust a stale _items snapshot from the orders table.
    const enriched = await Promise.all(ordersData.map(async (o) => {
      try {
        const detail = await client.getOrder(o.id);
        const ord = detail.order || {};
        return {
          ...o,
          ...ord,
          _items: ord.items || [],
          total_cents: ord.total_cents ?? o.total_cents,
          subtotal_cents: ord.subtotal_cents ?? o.subtotal_cents,
        };
      } catch {
        return { ...o, _items: [] };
      }
    }));
    setOrders(enriched);
    const init = {};
    for (const o of enriched) init[o.id] = new Set();
    setScannedItems(init);
    setLoading(false);
  };

  const currentOrder = orders[currentIndex];
  const items = currentOrder?._items || [];

  const itemKeyOf = (it) => String(it.id || it.variant_id || it.product_id || it.title || "");

  const getScanned = (orderId) => scannedItems[orderId] || new Set();

  const allItemsScanned = currentOrder
    ? items.every((it) => getScanned(currentOrder.id).has(itemKeyOf(it)))
    : false;

  const normalizeEan = (v) => String(v || "").replace(/\D/g, "");
  const norm = (v) => String(v || "").trim().toLowerCase();

  const findExactScanMatch = (raw) => {
    const val = String(raw || "").trim();
    if (!val) return null;
    const valNorm = norm(val);
    const valEan = normalizeEan(val);
    return items.find((it) => {
      const sku = norm(it.sku);
      const ean = normalizeEan(it.ean);
      const handle = norm(it.product_handle);
      if (sku && sku === valNorm) return true;
      if (ean && valEan && ean === valEan && valEan.length >= 8) return true;
      if (handle && handle === valNorm) return true;
      // Full title equality only (no substring — typing "a" must not match)
      if (norm(it.title) && norm(it.title) === valNorm) return true;
      return false;
    }) || null;
  };

  const scanSuggestions = useMemo(() => {
    const q = barcodeInput.trim();
    if (!q || !currentOrder) return [];
    const qNorm = norm(q);
    const qEan = normalizeEan(q);
    const scanned = getScanned(currentOrder.id);
    return items
      .filter((it) => {
        if (scanned.has(itemKeyOf(it))) return false;
        const title = norm(it.title);
        const sku = norm(it.sku);
        const ean = normalizeEan(it.ean);
        const handle = norm(it.product_handle);
        if (sku && sku.includes(qNorm)) return true;
        if (ean && qEan && ean.includes(qEan)) return true;
        if (handle && handle.includes(qNorm)) return true;
        // Name search only after 2+ chars to avoid "a" matching everything
        if (qNorm.length >= 2 && title.includes(qNorm)) return true;
        return false;
      })
      .slice(0, 8);
  }, [barcodeInput, items, scannedItems, currentOrder]);

  // Order status moves offen → in_bearbeitung the moment a seller starts picking
  // an order (first item scanned/marked here), not at order placement. Fire
  // once per order per page visit — the backend PATCH is idempotent (only
  // dispatches the "order_processing" flow email on an actual offen→in_bearbeitung
  // transition), this ref just avoids redundant requests on every scan.
  const processingNotifiedRef = useRef(new Set());
  const notifyOrderProcessingStarted = (orderId) => {
    if (!orderId || processingNotifiedRef.current.has(orderId)) return;
    processingNotifiedRef.current.add(orderId);
    getMedusaAdminClient().updateOrder(orderId, { order_status: "in_bearbeitung" }).catch(() => {});
  };

  const markItemScanned = (match) => {
    if (!currentOrder || !match) return;
    const key = itemKeyOf(match);
    if (getScanned(currentOrder.id).has(key)) {
      setScanError(s.alreadyScanned);
      return;
    }
    if (getScanned(currentOrder.id).size === 0) notifyOrderProcessingStarted(currentOrder.id);
    setScannedItems((prev) => {
      const scanned = new Set(prev[currentOrder.id] || []);
      scanned.add(key);
      return { ...prev, [currentOrder.id]: scanned };
    });
    setBarcodeInput("");
    setSuggestOpen(false);
    setScanError("");
    setHighlightIdx(0);
    barcodeRef.current?.focus();
  };

  const handleBarcodeSubmit = (e) => {
    e.preventDefault();
    if (!currentOrder || !barcodeInput.trim()) return;
    const val = barcodeInput.trim();
    setScanError("");

    // Prefer highlighted suggestion when dropdown is open
    if (suggestOpen && scanSuggestions.length > 0) {
      const pick = scanSuggestions[Math.min(highlightIdx, scanSuggestions.length - 1)];
      if (pick) {
        markItemScanned(pick);
        return;
      }
    }

    const exact = findExactScanMatch(val);
    if (exact) {
      markItemScanned(exact);
      return;
    }

    // Ambiguous name fragment with multiple hits → force pick from list
    if (scanSuggestions.length === 1 && norm(val).length >= 2) {
      markItemScanned(scanSuggestions[0]);
      return;
    }
    if (scanSuggestions.length > 1) {
      setSuggestOpen(true);
      setScanError(s.pickFromSuggestions);
      return;
    }

    setScanError(s.itemNotFound(val));
    setBarcodeInput("");
    setSuggestOpen(false);
  };

  const markItemManually = (item) => {
    if (!currentOrder) return;
    const itemKey = itemKeyOf(item);
    const alreadyScanned = getScanned(currentOrder.id).has(itemKey);
    if (!alreadyScanned && getScanned(currentOrder.id).size === 0) notifyOrderProcessingStarted(currentOrder.id);
    setScannedItems((prev) => {
      const scanned = new Set(prev[currentOrder.id] || []);
      scanned.has(itemKey) ? scanned.delete(itemKey) : scanned.add(itemKey);
      return { ...prev, [currentOrder.id]: scanned };
    });
  };

  const goNext = () => {
    if (currentIndex < orders.length - 1) {
      setCurrentIndex((i) => i + 1);
      setScanError("");
      setBarcodeInput("");
      setTimeout(() => barcodeRef.current?.focus(), 100);
    } else {
      setPhase("ship");
    }
  };

  const handleSaveAll = async () => {
    setSaving(true);
    const carrierName = resolveCarrierName();
    const shippedAt = new Date().toISOString();
    try {
      const client = getMedusaAdminClient();
      for (const o of orders) {
        await client.updateOrder(o.id, {
          delivery_status: "versendet",
          carrier_name: carrierName,
          tracking_number: trackings[o.id] != null ? String(trackings[o.id]).trim() : "",
          shipped_at: shippedAt,
        });
      }
      setPhase("done");
    } catch { /* ignore */ }
    setSaving(false);
  };

  const handlePrintLieferscheinAll = () => {
    const carrierName = resolveCarrierName();
    const dateStr = fmtShipDate(locale);
    const inner = buildShipLieferscheinHtml(orders, carrierName, trackings, dateStr, locale);
    const win = window.open("", "_blank", "width=900,height=700");
    if (!win) return;
    win.document.write(
      `<!DOCTYPE html><html><head><title>${s.deliveryNote}</title><style>body{margin:20px}@media print{body{margin:0}}</style></head><body>${inner}<script>window.onload=()=>window.print()<\/script></body></html>`,
    );
    win.document.close();
  };

  const progress = orders.length > 0 ? Math.round((currentIndex / orders.length) * 100) : 0;
  const pendingCount = currentOrder ? items.length - getScanned(currentOrder.id).size : 0;

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: "#9ca3af" }}>{s.loadingOrders}</div>
    );
  }

  if (orders.length === 0) {
    return (
      <div style={{ padding: 40, textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>📦</div>
        <h2 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 8px" }}>{s.noOrdersToPack}</h2>
        <p style={{ color: "#6b7280", fontSize: 14 }}>{s.noOrdersHint}</p>
        <button onClick={() => router.push(`/${locale}/orders`)} style={{ marginTop: 16, padding: "9px 20px", background: "#2563eb", color: "#fff", border: "none", borderRadius: 7, fontSize: 13, cursor: "pointer", fontWeight: 600 }}>
          {s.backToOrders}
        </button>
      </div>
    );
  }

  if (phase === "ship" || phase === "done") {
    return (
      <div style={{ padding: 24, maxWidth: 720, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 24, flexWrap: "wrap" }}>
          <Button onClick={() => setPhase("scan")}>{s.back}</Button>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>{s.shipTitle(orders.length)}</h1>
        </div>

        {phase === "done" && (
          <div style={{ background: "#d1fae5", border: "1px solid #6ee7b7", borderRadius: 10, padding: "16px 20px", marginBottom: 20, display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 24 }}>✅</span>
            <div>
              <div style={{ fontWeight: 700, color: "#065f46" }}>{s.allShipped}</div>
              <div style={{ fontSize: 13, color: "#047857", marginTop: 2 }}>{s.trackingSavedHint}</div>
            </div>
          </div>
        )}

        <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 10, padding: "12px 16px", marginBottom: 16, fontSize: 13, color: "#1e40af" }}>
          {s.labelStepHint}
        </div>

        {orders.map((o) => (
          <div key={o.id} style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 20, marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700 }}>#{o.order_number || "—"}</div>
                <div style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>
                  {[o.first_name, o.last_name].filter(Boolean).join(" ") || (isSuperuser ? o.email : null) || "—"}
                </div>
                <div style={{ fontSize: 13, color: "#6b7280" }}>
                  {[o.address_line1, [o.postal_code, o.city].filter(Boolean).join(" "), o.country].filter(Boolean).join(", ")}
                </div>
              </div>
              {(o.sendcloud_label_url || o.tracking_number) && (
                <div style={{ fontSize: 12, color: "#15803d", fontWeight: 600, textAlign: "right" }}>
                  {o.tracking_number ? `${s.trackingNumber}: ${o.tracking_number}` : s.labelReady}
                  {o.sendcloud_label_url && (
                    <div>
                      <a href={o.sendcloud_label_url} target="_blank" rel="noopener noreferrer" style={{ color: "#2563eb" }}>
                        {s.openLabelPdf}
                      </a>
                    </div>
                  )}
                </div>
              )}
            </div>

            <ShipLabelModal
              order={o}
              locale={locale}
              embedded
              onClose={() => {}}
            />

            <details style={{ marginTop: 18, borderTop: "1px solid #f3f4f6", paddingTop: 14 }}>
              <summary style={{ cursor: "pointer", fontSize: 13, fontWeight: 600, color: "#6b7280" }}>
                {s.manualShipToggle}
              </summary>
              <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "#6b7280", marginBottom: 4 }}>{s.carrier}</div>
                  <select
                    value={carrier}
                    onChange={(e) => setCarrier(e.target.value)}
                    style={{ width: "100%", padding: "8px 10px", border: "1px solid #e5e7eb", borderRadius: 6, fontSize: 13 }}
                  >
                    {carrierOptions.map((c) => (
                      <option key={c} value={c}>{c === OTHER_CARRIER ? s.other : c}</option>
                    ))}
                  </select>
                  {carrier === OTHER_CARRIER && (
                    <input value={customCarrier} onChange={(e) => setCustomCarrier(e.target.value)} placeholder={s.carrierPlaceholder} style={{ marginTop: 8, padding: "7px 10px", border: "1px solid #e5e7eb", borderRadius: 6, fontSize: 13, width: "100%", boxSizing: "border-box" }} />
                  )}
                </div>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "#6b7280", marginBottom: 4 }}>{s.trackingNumber}</div>
                  <input
                    value={trackings[o.id] || ""}
                    onChange={(e) => setTrackings((t) => ({ ...t, [o.id]: e.target.value }))}
                    placeholder={s.trackingEnter}
                    style={{ width: "100%", padding: "8px 10px", border: "1px solid #e5e7eb", borderRadius: 6, fontSize: 13, boxSizing: "border-box" }}
                  />
                </div>
              </div>
              <p style={{ fontSize: 12, color: "#9ca3af", marginTop: 8 }}>{s.manualShipHint}</p>
            </details>
          </div>
        ))}

        <BlockStack gap="300">
          <InlineStack gap="200" wrap>
            <Button onClick={handlePrintLieferscheinAll}>{s.printDeliveryNote}</Button>
          </InlineStack>
          <InlineStack gap="200" wrap>
            {phase !== "done" && (
              <Button variant="primary" onClick={handleSaveAll} disabled={saving} loading={saving}>
                {s.saveManualShip}
              </Button>
            )}
            <Button onClick={() => router.push(`/${locale}/orders`)}>
              {s.backToOrders}
            </Button>
          </InlineStack>
        </BlockStack>
      </div>
    );
  }

  return (
    <div style={{ padding: 24, maxWidth: 800, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <button onClick={() => router.push(`/${locale}/orders`)} style={{ background: "none", border: "1px solid #e5e7eb", borderRadius: 7, padding: "6px 14px", fontSize: 13, cursor: "pointer" }}>{s.back}</button>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>{s.packingCenter}</h1>
        </div>
        <div style={{ fontSize: 13, color: "#6b7280" }}>
          {s.orderOf(currentIndex + 1, orders.length)}
        </div>
      </div>

      <div style={{ height: 6, background: "#e5e7eb", borderRadius: 4, marginBottom: 24, overflow: "hidden" }}>
        <div style={{ height: "100%", background: "#008060", borderRadius: 4, width: `${progress}%`, transition: "width 0.3s" }} />
      </div>

      {currentOrder && (
        <>
          <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: 20, marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 700 }}>{s.order} #{currentOrder.order_number || "—"}</div>
                <div style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>
                  {[currentOrder.first_name, currentOrder.last_name].filter(Boolean).join(" ") || "—"}{isSuperuser && currentOrder.email ? ` · ${currentOrder.email}` : ""}
                </div>
                <div style={{ fontSize: 13, color: "#6b7280" }}>
                  {[currentOrder.address_line1, currentOrder.city, currentOrder.country].filter(Boolean).join(", ")}
                </div>
              </div>
              <div style={{ textAlign: "right", fontSize: 18, fontWeight: 700 }}>
                {fmtMoney(
                  currentOrder.seller_items_subtotal_cents != null
                    ? currentOrder.seller_items_subtotal_cents
                    : currentOrder.total_cents,
                  locale,
                )}
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>
                {s.itemsScanned(getScanned(currentOrder.id).size, items.length)}
              </div>
              {items.map((it, i) => {
                const key = itemKeyOf(it);
                const scanned = getScanned(currentOrder.id).has(key);
                return (
                  <div
                    key={key || i}
                    onClick={() => markItemManually(it)}
                    style={{ display: "flex", alignItems: "center", gap: 14, padding: "10px 14px", borderRadius: 8, cursor: "pointer", background: scanned ? "#f0fdf4" : "#fff", border: `1px solid ${scanned ? "#86efac" : "#e5e7eb"}`, marginBottom: 8, transition: "all 0.15s" }}
                  >
                    <div style={{ width: 28, height: 28, borderRadius: "50%", background: scanned ? "#16a34a" : "#e5e7eb", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      {scanned ? <span style={{ color: "#fff", fontSize: 14 }}>✓</span> : <span style={{ color: "#9ca3af", fontSize: 14 }}>○</span>}
                    </div>
                    {it.thumbnail && <img src={it.thumbnail} alt="" style={{ width: 36, height: 36, borderRadius: 6, objectFit: "cover" }} />}
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: scanned ? 600 : 400, color: scanned ? "#15803d" : "#111827", textDecoration: scanned ? "line-through" : "none", opacity: scanned ? 0.7 : 1 }}>{it.title}</div>
                      <div style={{ fontSize: 12, color: "#6b7280" }}>
                        {s.qty} {it.quantity}
                        {it.sku ? ` · SKU ${it.sku}` : ""}
                        {it.ean ? ` · EAN ${it.ean}` : ""}
                      </div>
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{fmtMoney(it.unit_price_cents, locale)}</div>
                  </div>
                );
              })}
            </div>

            <form onSubmit={handleBarcodeSubmit} style={{ position: "relative" }}>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  ref={barcodeRef}
                  value={barcodeInput}
                  onChange={(e) => {
                    setBarcodeInput(e.target.value);
                    setScanError("");
                    setSuggestOpen(true);
                    setHighlightIdx(0);
                  }}
                  onFocus={() => setSuggestOpen(true)}
                  onBlur={() => {
                    // Allow click on suggestion before closing
                    window.setTimeout(() => setSuggestOpen(false), 150);
                  }}
                  onKeyDown={(e) => {
                    if (!suggestOpen || scanSuggestions.length === 0) return;
                    if (e.key === "ArrowDown") {
                      e.preventDefault();
                      setHighlightIdx((i) => Math.min(i + 1, scanSuggestions.length - 1));
                    } else if (e.key === "ArrowUp") {
                      e.preventDefault();
                      setHighlightIdx((i) => Math.max(i - 1, 0));
                    } else if (e.key === "Escape") {
                      setSuggestOpen(false);
                    }
                  }}
                  placeholder={s.barcodePlaceholder}
                  autoFocus
                  autoComplete="off"
                  style={{ flex: 1, padding: "10px 14px", border: `1px solid ${scanError ? "#ef4444" : "#e5e7eb"}`, borderRadius: 8, fontSize: 14 }}
                />
                <Button submit variant="primary">
                  {s.add}
                </Button>
              </div>
              {suggestOpen && scanSuggestions.length > 0 && (
                <div
                  style={{
                    position: "absolute",
                    left: 0,
                    right: 72,
                    top: "100%",
                    marginTop: 4,
                    background: "#fff",
                    border: "1px solid #e5e7eb",
                    borderRadius: 8,
                    boxShadow: "0 8px 24px rgba(0,0,0,0.08)",
                    zIndex: 20,
                    overflow: "hidden",
                  }}
                >
                  {scanSuggestions.map((it, idx) => (
                    <button
                      key={itemKeyOf(it)}
                      type="button"
                      onMouseDown={(ev) => {
                        ev.preventDefault();
                        markItemScanned(it);
                      }}
                      onMouseEnter={() => setHighlightIdx(idx)}
                      style={{
                        display: "flex",
                        width: "100%",
                        textAlign: "left",
                        gap: 10,
                        alignItems: "center",
                        padding: "10px 12px",
                        border: "none",
                        background: idx === highlightIdx ? "#f3f4f6" : "#fff",
                        cursor: "pointer",
                        fontSize: 13,
                      }}
                    >
                      {it.thumbnail && <img src={it.thumbnail} alt="" style={{ width: 28, height: 28, borderRadius: 4, objectFit: "cover" }} />}
                      <span style={{ flex: 1, fontWeight: 500 }}>{it.title}</span>
                      <span style={{ color: "#6b7280", fontSize: 11 }}>
                        {[it.sku && `SKU ${it.sku}`, it.ean && `EAN ${it.ean}`].filter(Boolean).join(" · ")}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {scanError && <div style={{ color: "#ef4444", fontSize: 12, marginTop: 6 }}>{scanError}</div>}
            </form>
          </div>

          <InlineStack gap="300" wrap blockAlign="center">
            {currentIndex > 0 && (
              <Button onClick={() => { setCurrentIndex((i) => i - 1); setScanError(""); setBarcodeInput(""); }}>
                {s.previous}
              </Button>
            )}
            <Button
              variant="primary"
              disabled={!allItemsScanned}
              onClick={goNext}
            >
              {!allItemsScanned
                ? s.itemsPending(pendingCount)
                : currentIndex === orders.length - 1
                  ? s.allPackedContinue
                  : s.nextOrder}
            </Button>
          </InlineStack>
          {!allItemsScanned && (
            <p style={{ fontSize: 12, color: "#9ca3af", textAlign: "center", marginTop: 8 }}>
              {s.scanHint}
            </p>
          )}
        </>
      )}
    </div>
  );
}
