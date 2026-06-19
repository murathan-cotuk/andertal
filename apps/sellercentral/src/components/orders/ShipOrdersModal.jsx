"use client";

import React, { useState, useMemo, useEffect, useRef } from "react";
import { useLocale } from "next-intl";
import { Button, InlineStack, BlockStack, Text } from "@shopify/polaris";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";
import { buildShipLabelsHtml, buildShipLieferscheinHtml, openShipCombinedPrintWindow } from "@/lib/ship-print-html";
import { getShipStrings, fmtShipDate } from "@/lib/ship-i18n";

const FALLBACK_CARRIER_OPTIONS = ["DHL", "DPD", "GLS", "UPS", "FedEx", "Hermes", "Go! Express"];

/**
 * Ship dialog: save carrier + tracking, print label/delivery note (Polaris).
 */
export default function ShipOrdersModal({ orders, onClose, onDone }) {
  const locale = useLocale();
  const s = getShipStrings(locale);
  const [dbCarriers, setDbCarriers] = useState([]);
  const [carrier, setCarrier] = useState("DHL");
  const [customCarrier, setCustomCarrier] = useState("");
  const [trackings, setTrackings] = useState(() => Object.fromEntries(orders.map((o) => [o.id, o.tracking_number || ""])));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [isSuperuser, setIsSuperuser] = useState(false);
  useEffect(() => { setIsSuperuser(localStorage.getItem("sellerIsSuperuser") === "true"); }, []);

  useEffect(() => {
    getMedusaAdminClient().getCarriers().then(data => {
      const active = (data?.carriers || []).filter(c => c.is_active);
      if (active.length > 0) {
        setDbCarriers(active);
        setCarrier(active[0].name);
      }
    }).catch(() => {});
  }, []);
  const [resolvedOrders, setResolvedOrders] = useState(() =>
    orders.map((o) => ({ ...o, _items: o._items || o.items || [] })),
  );

  const orderIdsKey = useMemo(() => orders.map((o) => o.id).join("|"), [orders]);
  const ordersRef = useRef(orders);
  ordersRef.current = orders;
  const resolvedRef = useRef(resolvedOrders);
  resolvedRef.current = resolvedOrders;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const list = ordersRef.current;
      const client = getMedusaAdminClient();
      const next = [];
      for (const o of list) {
        const hasLineItems = (o._items && o._items.length) || (o.items && o.items.length);
        if (hasLineItems) {
          next.push({ ...o, _items: o._items || o.items });
          continue;
        }
        try {
          const d = await client.getOrder(o.id);
          const items = d?.order?.items || [];
          next.push({ ...o, _items: items, items });
        } catch {
          next.push({ ...o, _items: o._items || o.items || [] });
        }
      }
      if (!cancelled) setResolvedOrders(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [orderIdsKey]);

  const carrierOptions = dbCarriers.length > 0 ? [...dbCarriers.map(c => c.name), s.other] : [...FALLBACK_CARRIER_OPTIONS, s.other];
  const carrierName = carrier === s.other ? customCarrier.trim() || s.other : carrier;

  const dateStr = useMemo(() => fmtShipDate(locale), [locale]);

  const openPrintWindow = (bodyInner) => {
    const win = window.open("", "_blank", "width=900,height=700");
    if (!win) return;
    win.document.write(
      `<!DOCTYPE html><html><head><title>${s.shippingDocuments}</title><style>@media print{body{margin:0}} body{margin:20px}</style></head><body>${bodyInner}<script>window.onload=()=>window.print()<\/script></body></html>`,
    );
    win.document.close();
  };

  const handlePrintLabels = () => {
    openPrintWindow(buildShipLabelsHtml(resolvedOrders, carrierName, trackings, dateStr, locale));
  };

  const handlePrintLieferschein = () => {
    openPrintWindow(buildShipLieferscheinHtml(resolvedOrders, carrierName, trackings, dateStr, locale));
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveError("");
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
      setSaved(true);
      onDone?.();
      window.setTimeout(() => openShipCombinedPrintWindow(resolvedRef.current, carrierName, trackings, dateStr, locale), 300);
      for (const o of orders) {
        const tn = trackings[o.id] != null ? String(trackings[o.id]).trim() : "";
        if (tn) {
          client.refreshTracking(o.id).catch(() => {});
        }
      }
    } catch (e) {
      setSaveError(e?.message || s.saveFailed);
    }
    setSaving(false);
  };

  const inp = { padding: "7px 10px", border: "1px solid var(--p-color-border)", borderRadius: 6, fontSize: 13, width: "100%", boxSizing: "border-box" };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div
        style={{
          background: "var(--p-color-bg-surface)",
          borderRadius: 12,
          width: "100%",
          maxWidth: 600,
          maxHeight: "90vh",
          overflowY: "auto",
          boxShadow: "var(--p-shadow-600)",
        }}
      >
        <div
          style={{
            padding: "18px 24px",
            borderBottom: "1px solid var(--p-color-border)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            position: "sticky",
            top: 0,
            background: "var(--p-color-bg-surface)",
            zIndex: 1,
          }}
        >
          <Text as="h2" variant="headingMd">
            {s.shipTitle(orders.length)}
          </Text>
          <Button variant="plain" onClick={onClose} accessibilityLabel={s.close}>
            ×
          </Button>
        </div>
        <div style={{ padding: 24 }}>
          <BlockStack gap="400">
            <div>
              <Text as="p" variant="bodySm" tone="subdued">
                {s.carrier}
              </Text>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                {carrierOptions.map((c) => (
                  <Button key={c} size="slim" variant={carrier === c ? "primary" : "secondary"} onClick={() => setCarrier(c)}>
                    {c}
                  </Button>
                ))}
              </div>
              {carrier === s.other && (
                <input style={{ ...inp, marginTop: 8 }} value={customCarrier} onChange={(e) => setCustomCarrier(e.target.value)} placeholder={s.carrierPlaceholder} />
              )}
            </div>

            <div>
              <Text as="p" variant="bodySm" tone="subdued">
                {s.trackingNumber}
              </Text>
              <BlockStack gap="200">
                {orders.map((o) => (
                  <div key={o.id} style={{ display: "grid", gridTemplateColumns: "1fr minmax(140px,200px)", gap: 10, alignItems: "center" }}>
                    <Text as="span" variant="bodyMd" fontWeight="semibold">
                      #{o.order_number || "—"} — {[o.first_name, o.last_name].filter(Boolean).join(" ") || (isSuperuser ? o.email : null) || "—"}
                    </Text>
                    <input
                      style={inp}
                      value={trackings[o.id] || ""}
                      onChange={(e) => setTrackings((t) => ({ ...t, [o.id]: e.target.value }))}
                      placeholder={s.trackingPlaceholder}
                    />
                  </div>
                ))}
              </BlockStack>
            </div>

            {saveError && (
              <Text as="p" tone="critical">
                {saveError}
              </Text>
            )}

            {saved && (
              <div style={{ background: "var(--p-color-bg-surface-success-subdued)", padding: "10px 14px", borderRadius: 8 }}>
                <Text as="p" variant="bodySm" tone="success">
                  {s.savedSuccess}
                </Text>
              </div>
            )}

            <InlineStack gap="200" wrap>
              <Button onClick={handlePrintLabels}>{s.printLabels}</Button>
              <Button onClick={handlePrintLieferschein}>{s.printDeliveryNote}</Button>
            </InlineStack>
          </BlockStack>
        </div>

        <div
          style={{
            padding: "14px 24px",
            borderTop: "1px solid var(--p-color-border)",
            display: "flex",
            justifyContent: "flex-end",
            position: "sticky",
            bottom: 0,
            background: "var(--p-color-bg-surface)",
          }}
        >
          <InlineStack gap="200">
            <Button onClick={onClose}>{s.close}</Button>
            <Button variant="primary" onClick={handleSave} disabled={saving || saved} loading={saving}>
              {s.saveAndPrint}
            </Button>
          </InlineStack>
        </div>
      </div>
    </div>
  );
}
