"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { Page, Banner, Button, Spinner } from "@shopify/polaris";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";
import LiveVisitorsPanel from "@/components/dashboard/LiveVisitorsPanel";

function fmtEuro(cents) {
  return (Number(cents || 0) / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" });
}

function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function orderTotalCents(o) {
  const sub = Number(o?.subtotal_cents || 0);
  const ship = Number(o?.shipping_cents || 0);
  const disc = Number(o?.coupon_discount_cents || 0);
  if (sub > 0) return Math.max(0, sub + ship - disc);
  const t = o?.total ?? o?.total_amount ?? o?.total_cents;
  return typeof t === "number" ? t : Number(t) || 0;
}

function orderStatus(o) {
  return o?.order_status || o?.status || "—";
}

const STATUS_COLORS = {
  offen: "#f59e0b",
  in_bearbeitung: "#3b82f6",
  abgeschlossen: "#10b981",
  storniert: "#ef4444",
  bezahlt: "#10b981",
  versendet: "#6366f1",
  zugestellt: "#059669",
};

function KpiCard({ icon, label, value, sub, accent = "#008060", onClick }) {
  const inner = (
    <div
      style={{
        background: "#fff",
        borderRadius: 12,
        padding: "18px 20px",
        border: "1px solid #e5e7eb",
        borderLeft: `4px solid ${accent}`,
        boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
        height: "100%",
        boxSizing: "border-box",
        cursor: onClick ? "pointer" : "default",
        transition: "box-shadow 0.15s ease, transform 0.15s ease",
      }}
      onMouseEnter={(e) => {
        if (onClick) {
          e.currentTarget.style.boxShadow = "0 4px 14px rgba(0,0,0,0.08)";
          e.currentTarget.style.transform = "translateY(-1px)";
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.04)";
        e.currentTarget.style.transform = "none";
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.06em" }}>
          {label}
        </div>
        <span style={{ fontSize: 20, lineHeight: 1 }}>{icon}</span>
      </div>
      <div style={{ fontSize: 26, fontWeight: 800, color: "#111827", marginTop: 8, fontVariantNumeric: "tabular-nums" }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 4 }}>{sub}</div>}
    </div>
  );
  if (onClick) {
    return (
      <button type="button" onClick={onClick} style={{ display: "block", width: "100%", border: "none", background: "none", padding: 0, textAlign: "left" }}>
        {inner}
      </button>
    );
  }
  return inner;
}

function Panel({ title, subtitle, action, children, noPad }) {
  return (
    <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e5e7eb", boxShadow: "0 1px 3px rgba(0,0,0,0.04)", overflow: "hidden", height: "100%" }}>
      <div style={{ padding: "16px 20px", borderBottom: "1px solid #f3f4f6", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "#111827" }}>{title}</h2>
          {subtitle && <p style={{ margin: "4px 0 0", fontSize: 12, color: "#6b7280" }}>{subtitle}</p>}
        </div>
        {action}
      </div>
      <div style={noPad ? undefined : { padding: "16px 20px" }}>{children}</div>
    </div>
  );
}

function RevenueChart({ data }) {
  const max = Math.max(...data.map((d) => d.revenue), 1);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 140, paddingTop: 8 }}>
      {data.map((d) => {
        const h = Math.max(4, Math.round((d.revenue / max) * 120));
        return (
          <div key={d.key} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, minWidth: 0 }}>
            <div style={{ fontSize: 10, color: "#6b7280", fontWeight: 600 }}>{d.revenue > 0 ? fmtEuro(d.revenue) : ""}</div>
            <div
              style={{
                width: "100%",
                maxWidth: 48,
                height: h,
                borderRadius: "6px 6px 2px 2px",
                background: "linear-gradient(180deg, #008060 0%, #0d9488 100%)",
                transition: "height 0.3s ease",
              }}
              title={`${d.label}: ${fmtEuro(d.revenue)}`}
            />
            <div style={{ fontSize: 10, color: "#9ca3af", textAlign: "center" }}>{d.label}</div>
          </div>
        );
      })}
    </div>
  );
}

function StatusBars({ counts }) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0) || 1;
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {entries.map(([status, n]) => (
        <div key={status}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
            <span style={{ fontWeight: 600, color: "#374151", textTransform: "capitalize" }}>{status.replace(/_/g, " ")}</span>
            <span style={{ color: "#6b7280" }}>{n}</span>
          </div>
          <div style={{ height: 8, background: "#f3f4f6", borderRadius: 99, overflow: "hidden" }}>
            <div
              style={{
                width: `${(n / total) * 100}%`,
                height: "100%",
                background: STATUS_COLORS[status] || "#9ca3af",
                borderRadius: 99,
                transition: "width 0.35s ease",
              }}
            />
          </div>
        </div>
      ))}
      {entries.length === 0 && <p style={{ fontSize: 13, color: "#9ca3af", margin: 0 }}>Noch keine Bestellungen</p>}
    </div>
  );
}

const QUICK_SECTIONS = [
  {
    title: "Verkauf",
    items: [
      { label: "Bestellungen", href: "/orders", icon: "📦" },
      { label: "Retouren", href: "/orders/returns", icon: "↩️" },
      { label: "Kunden", href: "/customers", icon: "👥" },
      { label: "Nachrichten", href: "/inbox", icon: "💬" },
    ],
  },
  {
    title: "Katalog",
    items: [
      { label: "Produkt anlegen", href: "/products/single-upload", icon: "➕" },
      { label: "Produkte", href: "/products", icon: "🏷️" },
      { label: "Inventar", href: "/products/inventory", icon: "📊" },
      { label: "Kollektionen", href: "/content/collections", icon: "🗂️" },
    ],
  },
  {
    title: "Marketing & Inhalt",
    items: [
      { label: "Werben", href: "/advertise", icon: "📣" },
      { label: "Rabatte", href: "/discounts", icon: "🏷️" },
      { label: "Landing Page", href: "/content/landing-page", icon: "🎨" },
      { label: "Menüs", href: "/content/menus", icon: "☰" },
    ],
  },
  {
    title: "Analyse & Berichte",
    items: [
      { label: "Berichte", href: "/analytics/reports", icon: "📈" },
      { label: "Ranking", href: "/analytics/ranking", icon: "🏆" },
      { label: "Transaktionen", href: "/analytics/transactions", icon: "💳" },
      { label: "Live View", href: "/analytics/live-view", icon: "🟢", superuserOnly: true },
    ],
  },
];

export default function DashboardHome() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isSuperuser, setIsSuperuser] = useState(false);
  const [orders, setOrders] = useState([]);
  const [products, setProducts] = useState([]);
  const [pendingReturns, setPendingReturns] = useState([]);

  useEffect(() => {
    setIsSuperuser(localStorage.getItem("sellerIsSuperuser") === "true");
  }, []);

  useEffect(() => {
    const client = getMedusaAdminClient();
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const [productsData, ordersData, returnsData] = await Promise.all([
          client.getAdminHubProducts(),
          client.getOrders().catch(() => ({ orders: [] })),
          client.getReturns().catch(() => ({ returns: [] })),
        ]);
        const allProducts = (productsData?.products || []).filter((p) => (p.status || "").toLowerCase() !== "draft");
        const allOrders = ordersData?.orders || [];
        const allReturns = returnsData?.returns || [];
        setProducts(allProducts);
        setOrders(allOrders);
        setPendingReturns(allReturns.filter((r) => r.status === "offen"));
      } catch (e) {
        setError(e?.message || "Dashboard konnte nicht geladen werden");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const stats = useMemo(() => {
    let revenueCents = 0;
    for (const o of orders) revenueCents += orderTotalCents(o);
    const pending = orders.filter((o) => {
      const s = orderStatus(o).toLowerCase();
      return s === "offen" || s === "pending" || s === "open" || s === "in_bearbeitung";
    }).length;
    const toShip = orders.filter((o) => {
      const d = (o.delivery_status || "").toLowerCase();
      return d === "offen" || d === "";
    }).length;
    const avg = orders.length ? Math.round(revenueCents / orders.length) : 0;
    return {
      revenueCents,
      orderCount: orders.length,
      productCount: products.length,
      pending,
      toShip,
      avg,
      returnsOpen: pendingReturns.length,
    };
  }, [orders, products, pendingReturns]);

  const chartData = useMemo(() => {
    const days = [];
    for (let i = 6; i >= 0; i -= 1) {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      days.push({
        key,
        label: d.toLocaleDateString("de-DE", { weekday: "short", day: "2-digit" }),
        revenue: 0,
      });
    }
    for (const o of orders) {
      if (!o.created_at) continue;
      const key = new Date(o.created_at).toISOString().slice(0, 10);
      const bucket = days.find((d) => d.key === key);
      if (bucket) bucket.revenue += orderTotalCents(o);
    }
    return days;
  }, [orders]);

  const statusCounts = useMemo(() => {
    const c = {};
    for (const o of orders) {
      const s = orderStatus(o).toLowerCase();
      c[s] = (c[s] || 0) + 1;
    }
    return c;
  }, [orders]);

  const recentOrders = useMemo(
    () => [...orders].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)).slice(0, 5),
    [orders],
  );

  const greeting = useMemo(() => {
    const h = new Date().getHours();
    if (h < 12) return "Guten Morgen";
    if (h < 18) return "Guten Tag";
    return "Guten Abend";
  }, []);

  if (loading) {
    return (
      <Page title="Dashboard">
        <div style={{ display: "flex", justifyContent: "center", padding: 80 }}>
          <Spinner size="large" />
        </div>
      </Page>
    );
  }

  return (
    <Page
      title="Dashboard"
      primaryAction={{ content: "Produkt anlegen", onAction: () => router.push("/products/single-upload") }}
      secondaryActions={[{ content: "Bestellungen", onAction: () => router.push("/orders") }]}
    >
      {error && (
        <div style={{ marginBottom: 16 }}>
          <Banner tone="critical" onDismiss={() => setError(null)}>{error}</Banner>
        </div>
      )}

      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: "0 0 4px", fontSize: 24, fontWeight: 800, color: "#111827" }}>{greeting}</h1>
        <p style={{ margin: 0, fontSize: 14, color: "#6b7280" }}>
          {new Date().toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          {" · "}
          Übersicht Ihres Shops auf einen Blick
        </p>
      </div>

      {isSuperuser && <LiveVisitorsPanel />}

      {/* KPI grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
          gap: 14,
          marginBottom: 20,
        }}
      >
        <KpiCard icon="💰" label="Umsatz" value={fmtEuro(stats.revenueCents)} sub="Brutto (alle Bestellungen)" accent="#008060" onClick={() => router.push("/analytics/reports")} />
        <KpiCard icon="📦" label="Bestellungen" value={stats.orderCount} sub={`Ø ${fmtEuro(stats.avg)}`} accent="#2563eb" onClick={() => router.push("/orders")} />
        <KpiCard icon="🏷️" label="Produkte" value={stats.productCount} sub="Aktiv (ohne Entwurf)" accent="#7c3aed" onClick={() => router.push("/products")} />
        <KpiCard icon="⏳" label="Offen" value={stats.pending} sub="In Bearbeitung" accent="#f59e0b" onClick={() => router.push("/orders")} />
        <KpiCard icon="🚚" label="Versand offen" value={stats.toShip} sub="Lieferstatus offen" accent="#6366f1" onClick={() => router.push("/orders")} />
        <KpiCard icon="↩️" label="Retouren" value={stats.returnsOpen} sub="Antwort ausstehend" accent="#ef4444" onClick={() => router.push("/orders/returns")} />
      </div>

      {/* Charts row */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.4fr) minmax(0, 1fr)", gap: 16, marginBottom: 20, alignItems: "stretch" }}>
        <Panel title="Umsatz · letzte 7 Tage" subtitle="Basierend auf Bestelldaten">
          <RevenueChart data={chartData} />
        </Panel>
        <Panel title="Bestellstatus" subtitle="Verteilung aller Bestellungen">
          <StatusBars counts={statusCounts} />
        </Panel>
      </div>

      {/* Orders + Quick actions */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.2fr) minmax(0, 1fr)", gap: 16, marginBottom: 20, alignItems: "start" }}>
        <Panel
          title="Letzte Bestellungen"
          subtitle="Schnellzugriff auf aktuelle Aufträge"
          action={<Button variant="plain" onClick={() => router.push("/orders")}>Alle anzeigen</Button>}
          noPad
        >
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#f9fafb", textAlign: "left" }}>
                {["Nr.", "Kunde", "Betrag", "Status", "Datum", ""].map((h) => (
                  <th key={h} style={{ padding: "10px 16px", fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {recentOrders.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ padding: 32, textAlign: "center", color: "#9ca3af" }}>Noch keine Bestellungen</td>
                </tr>
              )}
              {recentOrders.map((o) => {
                const st = orderStatus(o);
                return (
                  <tr key={o.id} style={{ borderTop: "1px solid #f3f4f6", cursor: "pointer" }} onClick={() => router.push(`/orders/${o.id}`)}>
                    <td style={{ padding: "12px 16px", fontWeight: 700, color: "#111827" }}>#{o.order_number || "—"}</td>
                    <td style={{ padding: "12px 16px", color: "#374151" }}>
                      {[o.first_name, o.last_name].filter(Boolean).join(" ") || "—"}
                    </td>
                    <td style={{ padding: "12px 16px", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{fmtEuro(orderTotalCents(o))}</td>
                    <td style={{ padding: "12px 16px" }}>
                      <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 20, background: `${STATUS_COLORS[st] || "#9ca3af"}22`, color: STATUS_COLORS[st] || "#6b7280" }}>
                        {st}
                      </span>
                    </td>
                    <td style={{ padding: "12px 16px", color: "#6b7280", fontSize: 12 }}>{fmtDate(o.created_at)}</td>
                    <td style={{ padding: "12px 16px" }}>
                      <Button size="slim" onClick={(e) => { e.stopPropagation(); router.push(`/orders/${o.id}`); }}>Öffnen</Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Panel>

        <Panel title="Schnellzugriff" subtitle="Nach Bereich sortiert">
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            {QUICK_SECTIONS.map((section) => (
              <div key={section.title}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
                  {section.title}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  {section.items
                    .filter((item) => !item.superuserOnly || isSuperuser)
                    .map((item) => (
                      <button
                        key={item.href}
                        type="button"
                        onClick={() => router.push(item.href)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          padding: "10px 12px",
                          borderRadius: 10,
                          border: "1px solid #e5e7eb",
                          background: "#fafafa",
                          cursor: "pointer",
                          fontSize: 13,
                          fontWeight: 600,
                          color: "#111827",
                          textAlign: "left",
                          transition: "background 0.12s ease, border-color 0.12s ease",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = "#f0fdf4";
                          e.currentTarget.style.borderColor = "#86efac";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = "#fafafa";
                          e.currentTarget.style.borderColor = "#e5e7eb";
                        }}
                      >
                        <span>{item.icon}</span>
                        <span>{item.label}</span>
                      </button>
                    ))}
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      {/* Monitoring */}
      {(pendingReturns.length > 0 || stats.toShip > 0) && (
        <div style={{ marginBottom: 20 }}>
          <Panel title="Überwachung" subtitle="Aktion erforderlich">
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {stats.toShip > 0 && (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", background: "#eff6ff", borderRadius: 10, border: "1px solid #bfdbfe" }}>
                  <span style={{ fontSize: 13, color: "#1e40af" }}>🚚 <strong>{stats.toShip}</strong> Bestellung(en) warten auf Versand</span>
                  <Button size="slim" onClick={() => router.push("/orders")}>Bearbeiten</Button>
                </div>
              )}
              {pendingReturns.length > 0 && (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", background: "#fef2f2", borderRadius: 10, border: "1px solid #fecaca" }}>
                  <span style={{ fontSize: 13, color: "#b91c1c" }}>↩️ <strong>{pendingReturns.length}</strong> Retourenanfrage(n) offen</span>
                  <Button size="slim" tone="critical" onClick={() => router.push("/orders/returns")}>Öffnen</Button>
                </div>
              )}
            </div>
          </Panel>
        </div>
      )}

      {/* Returns table if any */}
      {pendingReturns.length > 0 && (
        <Panel title="Offene Retouren" subtitle="Kurzübersicht" action={<Button variant="plain" onClick={() => router.push("/orders/returns")}>Alle</Button>} noPad>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#f9fafb" }}>
                {["Retoure", "Bestellung", "Kunde", "Grund"].map((h) => (
                  <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#6b7280" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pendingReturns.slice(0, 4).map((r) => (
                <tr key={r.id} style={{ borderTop: "1px solid #f3f4f6" }}>
                  <td style={{ padding: "10px 16px", fontWeight: 600 }}>R-{r.return_number || String(r.id).slice(0, 8)}</td>
                  <td style={{ padding: "10px 16px" }}>#{r.order_number || "—"}</td>
                  <td style={{ padding: "10px 16px" }}>{[r.first_name, r.last_name].filter(Boolean).join(" ") || "—"}</td>
                  <td style={{ padding: "10px 16px", color: "#6b7280" }}>{r.reason || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}
    </Page>
  );
}
