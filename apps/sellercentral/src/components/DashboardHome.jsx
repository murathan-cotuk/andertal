"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { useLocale } from "next-intl";
import { getUI } from "@/lib/ui-strings";
import { statusLabel } from "@/lib/status-labels";
import { Page, Banner, Button, Spinner } from "@shopify/polaris";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";
import LiveVisitorsPanel from "@/components/dashboard/LiveVisitorsPanel";
import OnboardingChecklist from "@/components/dashboard/OnboardingChecklist";
import RevenueAreaChart from "@/components/dashboard/RevenueAreaChart";
import {
  generatePayoutPeriods,
  initialPayoutPeriodKey,
  isOrderInPayoutPeriod,
  isReturnInPayoutPeriod,
  buildPeriodRevenueChart,
} from "@/lib/payout-periods";

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

function StatusBars({ counts, locale }) {
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
      {entries.length === 0 && <p style={{ fontSize: 13, color: "#9ca3af", margin: 0 }}>{locale === "en" ? "No orders yet" : locale === "tr" ? "Henüz sipariş yok" : locale === "fr" ? "Aucune commande" : locale === "es" ? "Sin pedidos" : locale === "it" ? "Nessun ordine" : "Noch keine Bestellungen"}</p>}
    </div>
  );
}

function getQuickSections(locale) {
  const t = (en, tr, fr, es, it, de) =>
    locale === "en" ? en : locale === "tr" ? tr : locale === "fr" ? fr : locale === "es" ? es : locale === "it" ? it : de;
  return [
    {
      title: t("Sales", "Satış", "Ventes", "Ventas", "Vendite", "Verkauf"),
      items: [
        { label: t("Orders", "Siparişler", "Commandes", "Pedidos", "Ordini", "Bestellungen"), href: "/orders", icon: "📦" },
        { label: t("Returns", "İadeler", "Retours", "Devoluciones", "Resi", "Retouren"), href: "/orders/returns", icon: "↩️" },
        { label: t("Customers", "Müşteriler", "Clients", "Clientes", "Clienti", "Kunden"), href: "/customers", icon: "👥" },
        { label: t("Messages", "Mesajlar", "Messages", "Mensajes", "Messaggi", "Nachrichten"), href: "/inbox", icon: "💬" },
      ],
    },
    {
      title: t("Catalog", "Katalog", "Catalogue", "Catálogo", "Catalogo", "Katalog"),
      items: [
        { label: t("Add product", "Ürün ekle", "Ajouter produit", "Agregar producto", "Aggiungi prodotto", "Produkt anlegen"), href: "/products/single-upload", icon: "➕" },
        { label: t("Products", "Ürünler", "Produits", "Productos", "Prodotti", "Produkte"), href: "/products", icon: "🏷️" },
        { label: t("Inventory", "Envanter", "Inventaire", "Inventario", "Inventario", "Inventar"), href: "/products/inventory", icon: "📊" },
        { label: t("Collections", "Koleksiyonlar", "Collections", "Colecciones", "Collezioni", "Kollektionen"), href: "/content/collections", icon: "🗂️" },
      ],
    },
    {
      title: t("Marketing & Content", "Pazarlama & İçerik", "Marketing & Contenu", "Marketing & Contenido", "Marketing & Contenuto", "Marketing & Inhalt"),
      items: [
        { label: t("Advertise", "Reklam ver", "Publicité", "Publicidad", "Pubblicità", "Werben"), href: "/advertise", icon: "📣" },
        { label: t("Discounts", "İndirimler", "Remises", "Descuentos", "Sconti", "Rabatte"), href: "/discounts", icon: "🏷️" },
        { label: t("Landing Page", "Landing Page", "Landing Page", "Landing Page", "Landing Page", "Landing Page"), href: "/content/landing-page", icon: "🎨" },
        { label: t("Menus", "Menüler", "Menus", "Menús", "Menu", "Menüs"), href: "/content/menus", icon: "☰" },
      ],
    },
    {
      title: t("Analytics & Reports", "Analiz & Raporlar", "Analytique & Rapports", "Análisis & Informes", "Analisi & Report", "Analyse & Berichte"),
      items: [
        { label: t("Reports", "Raporlar", "Rapports", "Informes", "Report", "Berichte"), href: "/analytics/reports", icon: "📈" },
        { label: t("Ranking", "Sıralama", "Classement", "Ranking", "Classifica", "Ranking"), href: "/analytics/ranking", icon: "🏆" },
        { label: t("Transactions", "İşlemler", "Transactions", "Transacciones", "Transazioni", "Transaktionen"), href: "/analytics/transactions", icon: "💳" },
        { label: t("Live View", "Canlı Görünüm", "Vue en direct", "Vista en vivo", "Vista live", "Live View"), href: "/analytics/live-view", icon: "🟢", superuserOnly: true },
      ],
    },
  ];
}

export default function DashboardHome() {
  const router = useRouter();
  const locale = useLocale();
  const ui = getUI(locale);
  const t = (en, tr, fr, es, it, de) =>
    locale === "en" ? en : locale === "tr" ? tr : locale === "fr" ? fr : locale === "es" ? es : locale === "it" ? it : de;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isSuperuser, setIsSuperuser] = useState(false);
  const [orders, setOrders] = useState([]);
  const [products, setProducts] = useState([]);
  const [pendingReturns, setPendingReturns] = useState([]);
  const [allReturns, setAllReturns] = useState([]);
  const payoutPeriods = useMemo(() => generatePayoutPeriods(24), []);
  const [periodKey, setPeriodKey] = useState(() => initialPayoutPeriodKey(generatePayoutPeriods(24)));
  const selectedPeriod = useMemo(
    () => payoutPeriods.find((p) => p.key === periodKey) || payoutPeriods[0],
    [payoutPeriods, periodKey],
  );

  const periodOrders = useMemo(
    () => orders.filter((o) => isOrderInPayoutPeriod(o, selectedPeriod)),
    [orders, selectedPeriod],
  );

  const periodReturns = useMemo(
    () => allReturns.filter((r) => isReturnInPayoutPeriod(r, selectedPeriod)),
    [allReturns, selectedPeriod],
  );

  const periodLabel = selectedPeriod?.label || t("Billing period", "Donem", "Periode de facturation", "Periodo de facturacion", "Periodo di fatturazione", "Abrechnungszeitraum");

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
        const allReturnsList = returnsData?.returns || [];
        setProducts(allProducts);
        setOrders(allOrders);
        setAllReturns(allReturnsList);
        setPendingReturns(allReturnsList.filter((r) => r.status === "offen"));
      } catch (e) {
        setError(e?.message || t("Dashboard could not be loaded", "Dashboard yüklenemedi", "Impossible de charger le tableau de bord", "No se pudo cargar el panel", "Impossibile caricare la dashboard", "Dashboard konnte nicht geladen werden"));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const stats = useMemo(() => {
    let revenueCents = 0;
    for (const o of periodOrders) revenueCents += orderTotalCents(o);
    const pending = orders.filter((o) => {
      const s = orderStatus(o).toLowerCase();
      return s === "offen" || s === "pending" || s === "open" || s === "in_bearbeitung";
    }).length;
    const toShip = orders.filter((o) => {
      const d = (o.delivery_status || "").toLowerCase();
      return d === "offen" || d === "";
    }).length;
    const avg = periodOrders.length ? Math.round(revenueCents / periodOrders.length) : 0;
    const returnsInPeriod = periodReturns.length;
    const returnsOpenInPeriod = periodReturns.filter((r) => r.status === "offen").length;
    return {
      revenueCents,
      orderCount: periodOrders.length,
      productCount: products.length,
      pending,
      toShip,
      avg,
      returnsInPeriod,
      returnsOpenInPeriod,
      returnsOpenAll: pendingReturns.length,
    };
  }, [orders, periodOrders, products, pendingReturns, periodReturns]);

  const chartData = useMemo(
    () => buildPeriodRevenueChart(selectedPeriod, orders, orderTotalCents),
    [selectedPeriod, orders],
  );

  const statusCounts = useMemo(() => {
    const c = {};
    for (const o of periodOrders) {
      const s = orderStatus(o).toLowerCase();
      c[s] = (c[s] || 0) + 1;
    }
    return c;
  }, [periodOrders]);

  const recentOrders = useMemo(
    () => [...periodOrders].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)).slice(0, 5),
    [periodOrders],
  );

  const greeting = useMemo(() => {
    const h = new Date().getHours();
    if (h < 12) return t("Good morning", "Günaydın", "Bonjour", "Buenos días", "Buongiorno", "Guten Morgen");
    if (h < 18) return t("Good afternoon", "İyi günler", "Bonne journée", "Buenas tardes", "Buon pomeriggio", "Guten Tag");
    return t("Good evening", "İyi akşamlar", "Bonsoir", "Buenas noches", "Buona sera", "Guten Abend");
  }, [locale]);

  if (loading) {
    return (
      <Page title={t("Dashboard", "Kontrol paneli", "Tableau de bord", "Panel", "Dashboard", "Dashboard")}>
        <div style={{ display: "flex", justifyContent: "center", padding: 80 }}>
          <Spinner size="large" />
        </div>
      </Page>
    );
  }

  return (
    <Page
      title={t("Dashboard", "Kontrol paneli", "Tableau de bord", "Panel", "Dashboard", "Dashboard")}
      primaryAction={{ content: t("Add product", "Ürün ekle", "Ajouter produit", "Agregar producto", "Aggiungi prodotto", "Produkt anlegen"), onAction: () => router.push("/products/single-upload") }}
      secondaryActions={[{ content: ui.orders, onAction: () => router.push("/orders") }]}
    >
      {error && (
        <div style={{ marginBottom: 16 }}>
          <Banner tone="critical" onDismiss={() => setError(null)}>{error}</Banner>
        </div>
      )}

      <div style={{ marginBottom: 24, display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: 16 }}>
        <div>
          <h1 style={{ margin: "0 0 4px", fontSize: 24, fontWeight: 800, color: "#111827" }}>{greeting}</h1>
          <p style={{ margin: 0, fontSize: 14, color: "#6b7280" }}>
            {new Date().toLocaleDateString(
              locale === "de" ? "de-DE" : locale === "tr" ? "tr-TR" : locale === "fr" ? "fr-FR" : locale === "es" ? "es-ES" : locale === "it" ? "it-IT" : "en-GB",
              { weekday: "long", day: "numeric", month: "long", year: "numeric" }
            )}
          </p>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
          <label htmlFor="dashboard-period" style={{ fontSize: 12, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            {t("Billing period", "Dönem", "Période", "Período", "Periodo", "Abrechnungszeitraum")}
          </label>
          <select
            id="dashboard-period"
            value={periodKey}
            onChange={(e) => setPeriodKey(e.target.value)}
            style={{
              minWidth: 220,
              padding: "8px 12px",
              borderRadius: 8,
              border: "1px solid #d1d5db",
              background: "#fff",
              fontSize: 13,
              fontWeight: 600,
              color: "#111827",
              cursor: "pointer",
            }}
          >
            {payoutPeriods.map((p) => (
              <option key={p.key} value={p.key}>{p.label}</option>
            ))}
          </select>
          <Button variant="plain" onClick={() => router.push("/settings/payments")}>{ui.settingsPayments}</Button>
        </div>
      </div>

      <OnboardingChecklist locale={locale} isSuperuser={isSuperuser} />

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
        <KpiCard icon="💰" label={t("Revenue", "Ciro", "Revenus", "Ingresos", "Fatturato", "Umsatz")} value={fmtEuro(stats.revenueCents)} sub={periodLabel} accent="#008060" onClick={() => router.push("/settings/payments")} />
        <KpiCard icon="📦" label={ui.orders} value={stats.orderCount} sub={`Ø ${fmtEuro(stats.avg)} · ${periodLabel}`} accent="#2563eb" onClick={() => router.push("/orders")} />
        <KpiCard icon="↩️" label={t("Returns", "İadeler", "Retours", "Devoluciones", "Resi", "Retouren")} value={stats.returnsInPeriod} sub={stats.returnsOpenInPeriod > 0 ? `${stats.returnsOpenInPeriod} ${t("open in this period", "bu dönemde açık", "ouverts dans cette période", "abiertos en este período", "aperti in questo periodo", "offen in dieser Periode")}` : periodLabel} accent="#ef4444" onClick={() => router.push("/orders/returns")} />
        <KpiCard icon="⏳" label={ui.statusOpen} value={stats.pending} sub={t("All open orders", "Tüm açık siparişler", "Toutes les commandes ouvertes", "Todos los pedidos abiertos", "Tutti gli ordini aperti", "Alle offenen Bestellungen")} accent="#f59e0b" onClick={() => router.push("/orders")} />
        <KpiCard icon="🚚" label={t("Pending shipping", "Kargo bekliyor", "Expédition en attente", "Envío pendiente", "Spedizione in attesa", "Versand offen")} value={stats.toShip} sub={t("Open delivery status (total)", "Açık teslimat durumu (toplam)", "Statut de livraison ouvert (total)", "Estado de entrega abierto (total)", "Stato consegna aperto (totale)", "Lieferstatus offen (gesamt)")} accent="#6366f1" onClick={() => router.push("/orders")} />
        <KpiCard icon="🏷️" label={ui.products} value={stats.productCount} sub={t("Active (excl. drafts)", "Aktif (taslak hariç)", "Actif (hors brouillons)", "Activo (excl. borradores)", "Attivo (escluse bozze)", "Aktiv (ohne Entwurf)")} accent="#7c3aed" onClick={() => router.push("/products")} />
      </div>

      {/* Charts row */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.4fr) minmax(0, 1fr)", gap: 16, marginBottom: 20, alignItems: "stretch" }}>
        <Panel title={t("Revenue · Daily", "Ciro · Günlük", "Revenus · Quotidien", "Ingresos · Diario", "Fatturato · Giornaliero", "Umsatz · Tagesverlauf")} subtitle={periodLabel}>
          <RevenueAreaChart data={chartData} accent="#008060" height={220} />
        </Panel>
        <Panel title={t("Order status", "Sipariş durumu", "Statut des commandes", "Estado de pedidos", "Stato ordini", "Bestellstatus")} subtitle={periodLabel}>
          <StatusBars counts={statusCounts} locale={locale} />
        </Panel>
      </div>

      {/* Orders + Quick actions */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.2fr) minmax(0, 1fr)", gap: 16, marginBottom: 20, alignItems: "start" }}>
        <Panel
          title={t("Recent orders", "Son siparişler", "Commandes récentes", "Pedidos recientes", "Ordini recenti", "Letzte Bestellungen")}
          subtitle={periodLabel}
          action={<Button variant="plain" onClick={() => router.push("/orders")}>{ui.viewAll}</Button>}
          noPad
        >
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#f9fafb", textAlign: "left" }}>
                {[ui.colNumber, ui.colCustomer, ui.colAmount, ui.colStatus, ui.colDate, ""].map((h) => (
                  <th key={h} style={{ padding: "10px 16px", fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {recentOrders.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ padding: 32, textAlign: "center", color: "#9ca3af" }}>{ui.noOrders}</td>
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
                        {statusLabel(locale, st)}
                      </span>
                    </td>
                    <td style={{ padding: "12px 16px", color: "#6b7280", fontSize: 12 }}>{fmtDate(o.created_at)}</td>
                    <td style={{ padding: "12px 16px" }}>
                      <Button size="slim" onClick={(e) => { e.stopPropagation(); router.push(`/orders/${o.id}`); }}>{ui.viewDetails}</Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Panel>

        <Panel title={t("Quick access", "Hızlı erişim", "Accès rapide", "Acceso rápido", "Accesso rapido", "Schnellzugriff")} subtitle={t("Sorted by area", "Alana göre sıralandı", "Classé par zone", "Ordenado por área", "Ordinato per area", "Nach Bereich sortiert")}>
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            {getQuickSections(locale).map((section) => (
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
          <Panel title={t("Monitoring", "İzleme", "Surveillance", "Monitoreo", "Monitoraggio", "Überwachung")} subtitle={t("Action required", "İşlem gerekli", "Action requise", "Acción requerida", "Azione richiesta", "Aktion erforderlich")}>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {stats.toShip > 0 && (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", background: "#eff6ff", borderRadius: 10, border: "1px solid #bfdbfe" }}>
                  <span style={{ fontSize: 13, color: "#1e40af" }}>🚚 <strong>{stats.toShip}</strong> {t("order(s) waiting to ship", "sipariş kargoya verilmeyi bekliyor", "commande(s) en attente d'expédition", "pedido(s) esperando envío", "ordine/i in attesa di spedizione", "Bestellung(en) warten auf Versand")}</span>
                  <Button size="slim" onClick={() => router.push("/orders")}>{ui.edit}</Button>
                </div>
              )}
              {pendingReturns.length > 0 && (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", background: "#fef2f2", borderRadius: 10, border: "1px solid #fecaca" }}>
                  <span style={{ fontSize: 13, color: "#b91c1c" }}>↩️ <strong>{stats.returnsOpenAll}</strong> {t("return request(s) open (total)", "iade talebi açık (toplam)", "demande(s) de retour ouverte(s) (total)", "solicitud(es) de devolución abierta(s) (total)", "richiesta/e di reso aperta/e (totale)", "Retourenanfrage(n) offen (gesamt)")}</span>
                  <Button size="slim" tone="critical" onClick={() => router.push("/orders/returns")}>{ui.viewAll}</Button>
                </div>
              )}
            </div>
          </Panel>
        </div>
      )}

      {/* Returns table if any */}
      {pendingReturns.length > 0 && (
        <Panel title={t("Open returns", "Açık iadeler", "Retours ouverts", "Devoluciones abiertas", "Resi aperti", "Offene Retouren")} subtitle={t("Overview", "Özet", "Aperçu", "Resumen", "Panoramica", "Kurzübersicht")} action={<Button variant="plain" onClick={() => router.push("/orders/returns")}>{ui.viewAll}</Button>} noPad>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#f9fafb" }}>
                {[t("Return", "İade", "Retour", "Devolución", "Reso", "Retoure"), ui.orders, ui.colCustomer, t("Reason", "Neden", "Raison", "Motivo", "Motivo", "Grund")].map((h) => (
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
