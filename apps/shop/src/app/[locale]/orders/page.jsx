"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import NewtonsCradle from "@/components/NewtonsCradle";
import { useAuthGuard, getToken } from "@andertal/lib";
import { Link, useRouter } from "@/i18n/navigation";
import ShopHeader from "@/components/ShopHeader";
import Footer from "@/components/Footer";
import AccountPageLayout, { ACCOUNT_PAGE_MAIN_INNER } from "@/components/account/AccountPageLayout";
import { getMedusaClient } from "@/lib/medusa-client";

const ORANGE = "#ff971c";

const STATUS_BG = {
  offen: "#fef3c7", in_bearbeitung: "#dbeafe", versendet: "#ede9fe",
  zugestellt: "#d1fae5", abgeschlossen: "#d1fae5", storniert: "#fee2e2",
  bezahlt: "#d1fae5", refunded: "#dbeafe", retoure: "#fee2e2",
  retoure_anfrage: "#fef3c7", pending: "#fef3c7", shipped: "#ede9fe",
  delivered: "#d1fae5", completed: "#d1fae5", cancelled: "#fee2e2",
  processing: "#dbeafe",
};
const STATUS_COLOR = {
  offen: "#92400e", in_bearbeitung: "#1e40af", versendet: "#6d28d9",
  zugestellt: "#166534", abgeschlossen: "#166534", storniert: "#991b1b",
  bezahlt: "#166534", refunded: "#1d4ed8", retoure: "#b91c1c",
  retoure_anfrage: "#b45309", pending: "#92400e", shipped: "#6d28d9",
  delivered: "#166534", completed: "#166534", cancelled: "#991b1b",
  processing: "#1e40af",
};
const STATUS_LABEL_FALLBACK = {
  offen: "Offen", in_bearbeitung: "In Bearbeitung", versendet: "Versendet",
  zugestellt: "Zugestellt", abgeschlossen: "Abgeschlossen", storniert: "Storniert",
  bezahlt: "Bezahlt", refunded: "Erstattet", retoure: "Retoure",
  retoure_anfrage: "Rückgabe wird geprüft", pending: "Offen", shipped: "Versendet",
  delivered: "Zugestellt", completed: "Abgeschlossen", cancelled: "Storniert",
  processing: "In Bearbeitung",
};
const STATUS_ICON = {
  offen: "🕐", in_bearbeitung: "⚙️", versendet: "📦", zugestellt: "✅",
  abgeschlossen: "✅", storniert: "❌", bezahlt: "💳", refunded: "💶",
  retoure: "↩️", retoure_anfrage: "🔄", pending: "🕐", shipped: "📦",
  delivered: "✅", completed: "✅", cancelled: "❌", processing: "⚙️",
};

function StatusPill({ status }) {
  const k = (status || "").toLowerCase();
  const bg = STATUS_BG[k] || "#f3f4f6";
  const color = STATUS_COLOR[k] || "#6b7280";
  const label = STATUS_LABEL_FALLBACK[k] || status || "—";
  const icon = STATUS_ICON[k] || "•";
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      fontSize: 11, fontWeight: 700, color, background: bg,
      borderRadius: 20, padding: "3px 10px", letterSpacing: 0.2,
    }}>
      <span>{icon}</span> {label}
    </span>
  );
}

function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("de-DE", { day: "2-digit", month: "short", year: "numeric" });
}
function fmtEur(cents) {
  return (Number(cents || 0) / 100).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
}

const SHIPPED_STATUSES = ["versendet", "zugestellt", "abgeschlossen", "shipped", "delivered", "completed", "retoure", "retoure_anfrage"];

function displayStatus(order) {
  if (order.order_status === "refunded") return "refunded";
  const hasRefund = (order.returns || []).some(r => r.refund_status === "erstattet");
  if (hasRefund) return "refunded";
  const activeRet = (order.returns || []).find(r => r.status !== "abgelehnt" && r.status !== "abgeschlossen");
  if (activeRet) return activeRet.status === "genehmigt" ? "retoure" : "retoure_anfrage";
  if (order.order_status === "retoure" || order.order_status === "retoure_anfrage") return order.order_status;
  const ds = String(order.delivery_status || "").toLowerCase();
  if (ds === "zugestellt") return "zugestellt";
  if (ds === "versendet") return "versendet";
  const os = String(order.order_status || "").toLowerCase();
  const ps = String(order.payment_status || "").toLowerCase();
  if ((ps === "bezahlt" || order.status === "paid") && (os === "offen" || os === "")) return "bezahlt";
  return order.order_status || order.delivery_status || "offen";
}

function OrderCard({ order }) {
  const router = useRouter();
  const items = order.items || [];
  const status = displayStatus(order);
  const total = Number(order.total_cents || 0);
  const thumbs = items.slice(0, 4);
  const extraCount = items.length - thumbs.length;
  const hasTracking = !!order.tracking_number;

  return (
    <div
      onClick={() => router.push(`/order/${order.id}`)}
      style={{
        background: "#fff",
        border: "1px solid #e5e7eb",
        borderRadius: 16,
        overflow: "hidden",
        cursor: "pointer",
        transition: "box-shadow 0.15s, border-color 0.15s, transform 0.1s",
        boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
      }}
      onMouseEnter={e => {
        e.currentTarget.style.boxShadow = "0 8px 32px rgba(0,0,0,0.1)";
        e.currentTarget.style.borderColor = ORANGE;
        e.currentTarget.style.transform = "translateY(-2px)";
      }}
      onMouseLeave={e => {
        e.currentTarget.style.boxShadow = "0 1px 4px rgba(0,0,0,0.04)";
        e.currentTarget.style.borderColor = "#e5e7eb";
        e.currentTarget.style.transform = "translateY(0)";
      }}
    >
      {/* Header strip */}
      <div style={{
        padding: "14px 18px 12px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        gap: 12, borderBottom: "1px solid #f3f4f6",
        background: "#fafafa",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <div>
            <span style={{ fontSize: 14, fontWeight: 800, color: "#111827", letterSpacing: -0.3 }}>
              #{order.order_number || order.id?.slice(0, 8).toUpperCase()}
            </span>
            <span style={{ fontSize: 11, color: "#9ca3af", marginLeft: 8 }}>{fmtDate(order.created_at)}</span>
          </div>
        </div>
        <StatusPill status={status} />
      </div>

      {/* Products */}
      <div style={{ padding: "14px 18px 12px" }}>
        {thumbs.length > 0 && (
          <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
            {thumbs.map((item, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {item.thumbnail && (
                  <div style={{
                    width: 48, height: 48, borderRadius: 8, overflow: "hidden",
                    border: "1px solid #f3f4f6", flexShrink: 0, background: "#f9fafb",
                  }}>
                    <img src={item.thumbnail} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                  </div>
                )}
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#111827", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 140 }}>
                    {item.title?.replace(/\s+\(.+\)$/, "") || "—"}
                  </div>
                  {item.quantity > 1 && (
                    <div style={{ fontSize: 11, color: "#9ca3af" }}>×{item.quantity}</div>
                  )}
                </div>
              </div>
            ))}
            {extraCount > 0 && (
              <div style={{
                width: 48, height: 48, borderRadius: 8, background: "#f3f4f6",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 11, fontWeight: 700, color: "#6b7280",
              }}>
                +{extraCount}
              </div>
            )}
          </div>
        )}

        {hasTracking && (
          <div style={{
            display: "flex", alignItems: "center", gap: 6,
            fontSize: 11, color: "#6b7280",
            background: "#f8fafc", borderRadius: 6, padding: "5px 8px",
            marginBottom: 4,
          }}>
            <span>📦</span>
            <span style={{ fontFamily: "monospace" }}>{order.carrier_name ? `${order.carrier_name} · ` : ""}{order.tracking_number}</span>
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{
        padding: "10px 18px 14px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        borderTop: "1px solid #f3f4f6",
      }}>
        <div>
          <span style={{ fontSize: 11, color: "#9ca3af", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Gesamt</span>
          <div style={{ fontSize: 18, fontWeight: 800, color: "#111827", letterSpacing: -0.5, lineHeight: 1.2 }}>
            {fmtEur(total)}
          </div>
        </div>
        <div style={{
          display: "flex", alignItems: "center", gap: 4,
          fontSize: 12, fontWeight: 700, color: ORANGE,
          background: "#fff7ed", borderRadius: 8, padding: "7px 14px",
          border: `1px solid ${ORANGE}22`,
        }}>
          Details ansehen
          <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor" style={{ marginLeft: 2, opacity: 0.8 }}>
            <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
          </svg>
        </div>
      </div>
    </div>
  );
}

export default function OrdersPage() {
  useAuthGuard({ requiredRole: "customer", redirectTo: "/login" });

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const token = getToken("customer");
    if (!token) { setLoading(false); return; }
    getMedusaClient().request("/store/orders/me", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(res => {
        if (res?.__error) setError(res.message || "Fehler");
        else setOrders(res?.orders || []);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "#fafafa" }}>
      <ShopHeader />
      <main style={{ flex: 1 }}>
        <div style={ACCOUNT_PAGE_MAIN_INNER}>
          <AccountPageLayout title="Meine Bestellungen">
            <div>
              {loading && <NewtonsCradle />}

              {error && (
                <div style={{ background: "#fef2f2", border: "1px solid #fecaca", color: "#dc2626", padding: "12px 16px", borderRadius: 10, fontSize: 13 }}>
                  Fehler beim Laden der Bestellungen.
                </div>
              )}

              {!loading && !error && orders.length === 0 && (
                <div style={{ textAlign: "center", padding: "60px 0" }}>
                  <div style={{ fontSize: 48, marginBottom: 16 }}>🛍️</div>
                  <p style={{ color: "#9ca3af", fontSize: 15, marginBottom: 20, fontWeight: 500 }}>Noch keine Bestellungen vorhanden.</p>
                  <Link href="/" style={{
                    background: ORANGE, color: "#fff", padding: "10px 24px", borderRadius: 10,
                    fontWeight: 700, textDecoration: "none", border: "2px solid #000",
                    boxShadow: "0 2px 0 2px #000", fontSize: 13,
                  }}>
                    Zum Shop
                  </Link>
                </div>
              )}

              {orders.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  {orders.map(order => <OrderCard key={order.id} order={order} />)}
                </div>
              )}
            </div>
          </AccountPageLayout>
        </div>
      </main>
      <Footer />
    </div>
  );
}
