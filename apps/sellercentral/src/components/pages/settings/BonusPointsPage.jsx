"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale } from "next-intl";
import { useRouter, Link } from "@/i18n/navigation";
import {
  Banner, BlockStack, Button, Card, Checkbox, InlineStack, Modal, Select,
  Spinner, Tabs, Text, TextField,
} from "@shopify/polaris";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";
import { downloadAuthenticatedPdf } from "@/lib/order-pdf-url";
import { dateLocaleFor, lt } from "@/lib/locale-text";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
function monthStartISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
function fmtDate(d, locale) {
  if (!d) return "—";
  const loc = dateLocaleFor(locale);
  return new Date(d).toLocaleDateString(loc, { day: "2-digit", month: "2-digit", year: "numeric" });
}
function fmtCents(c, locale) {
  const loc = dateLocaleFor(locale);
  return (Number(c || 0) / 100).toLocaleString(loc, { style: "currency", currency: "EUR" });
}
function person(row) {
  return [row?.first_name, row?.last_name].filter(Boolean).join(" ") || row?.email || "—";
}

const TH = {
  fontSize: 11, fontWeight: 600, color: "#6b7280", textAlign: "left", padding: "8px 10px",
  borderBottom: "1px solid #e5e7eb", background: "#f9fafb", whiteSpace: "nowrap",
};
const TD = { fontSize: 12, padding: "7px 10px", borderBottom: "1px solid #f3f4f6", verticalAlign: "top" };
const TD_NUM = { ...TD, textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" };

function Kpi({ label, value, hint, tone }) {
  const color = tone === "blue" ? "#1d4ed8" : tone === "amber" ? "#b45309" : "#111827";
  return (
    <div style={{
      flex: "1 1 160px", minWidth: 150, padding: "12px 14px",
      background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8,
    }}>
      <div style={{ fontSize: 11, color: "#6b7280", fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color, letterSpacing: "-0.02em", marginTop: 2 }}>{value}</div>
      {hint ? <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>{hint}</div> : null}
    </div>
  );
}

function Empty({ children }) {
  return (
    <div style={{ padding: "40px 16px", textAlign: "center", color: "#9ca3af" }}>
      <Text as="p" tone="subdued">{children}</Text>
    </div>
  );
}

function Pager({ offset, limit, count, onChange, locale }) {
  const page = Math.floor(offset / limit) + 1;
  const pages = Math.max(1, Math.ceil((count || 0) / limit));
  return (
    <InlineStack align="space-between" blockAlign="center">
      <Text as="span" tone="subdued" variant="bodySm">
        {count || 0} {lt(locale, "rows", "satır", "lignes", "filas", "righe", "Zeilen")}
        {count > 0 ? ` · ${page}/${pages}` : ""}
      </Text>
      <InlineStack gap="200">
        <Button size="slim" disabled={offset <= 0} onClick={() => onChange(Math.max(0, offset - limit))}>
          {lt(locale, "Previous", "Önceki", "Précédent", "Anterior", "Precedente", "Zurück")}
        </Button>
        <Button size="slim" disabled={offset + limit >= count} onClick={() => onChange(offset + limit)}>
          {lt(locale, "Next", "Sonraki", "Suivant", "Siguiente", "Successivo", "Weiter")}
        </Button>
      </InlineStack>
    </InlineStack>
  );
}

export default function BonusPointsPage() {
  const locale = useLocale();
  const router = useRouter();
  const client = getMedusaAdminClient();

  const [isSuperuser, setIsSuperuser] = useState(null);
  const [tab, setTab] = useState(0);
  const [from, setFrom] = useState(monthStartISO);
  const [to, setTo] = useState(todayISO);
  const [paymentMethod, setPaymentMethod] = useState("all");
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [onlyBalance, setOnlyBalance] = useState(true);
  const [pmOptions, setPmOptions] = useState([{ label: "Alle Zahlungsarten", value: "all" }]);

  const [overview, setOverview] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [customerCount, setCustomerCount] = useState(0);
  const [orders, setOrders] = useState([]);
  const [orderCount, setOrderCount] = useState(0);
  const [orderTotals, setOrderTotals] = useState(null);
  const [ledger, setLedger] = useState([]);
  const [ledgerCount, setLedgerCount] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(() => new Set());
  const [busyExport, setBusyExport] = useState("");
  const [detail, setDetail] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const limit = 50;

  useEffect(() => {
    const su = typeof window !== "undefined" && localStorage.getItem("sellerIsSuperuser") === "true";
    setIsSuperuser(su);
    if (!su) router.replace("/settings/general");
  }, [router]);

  const filters = useMemo(() => ({
    from, to, payment_method: paymentMethod, search: appliedSearch,
  }), [from, to, paymentMethod, appliedSearch]);

  const qs = useCallback((extra = {}) => {
    const p = new URLSearchParams();
    if (filters.from) p.set("from", filters.from);
    if (filters.to) p.set("to", filters.to);
    if (filters.payment_method && filters.payment_method !== "all") p.set("payment_method", filters.payment_method);
    if (filters.search) p.set("search", filters.search);
    if (onlyBalance) p.set("only_with_balance", "1");
    Object.entries(extra).forEach(([k, v]) => {
      if (v != null && v !== "") p.set(k, String(v));
    });
    return p.toString();
  }, [filters, onlyBalance]);

  const tabs = useMemo(() => [
    { id: "overview", content: lt(locale, "Overview", "Özet", "Aperçu", "Resumen", "Panoramica", "Übersicht") },
    { id: "balances", content: lt(locale, "Customer balances", "Müşteri bakiyeleri", "Soldes clients", "Saldos", "Saldi", "Kundensalden") },
    { id: "redemptions", content: lt(locale, "Andertal cash", "Andertal kasası", "Caisse Andertal", "Caja Andertal", "Cassa Andertal", "Andertal-Kasse") },
    { id: "earnings", content: lt(locale, "Earned", "Kazanımlar", "Gains", "Ganados", "Guadagnati", "Verdient") },
    { id: "ledger", content: lt(locale, "Ledger", "Hareketler", "Grand livre", "Libro", "Registro", "Ledger") },
    { id: "reversals", content: lt(locale, "Cancellations & returns", "İptal & iade", "Annulations", "Cancelaciones", "Annulli", "Storno & Retoure") },
    { id: "manual", content: lt(locale, "Manual & signup", "Manuel / kayıt", "Manuel", "Manual", "Manuale", "Manuell / Registrierung") },
    { id: "reports", content: lt(locale, "Reports", "Raporlar", "Rapports", "Informes", "Report", "Berichte") },
  ], [locale]);

  const tabId = tabs[tab]?.id || "overview";

  const load = useCallback(async () => {
    if (!isSuperuser) return;
    setLoading(true);
    setError("");
    try {
      if (tabId === "overview" || tabId === "reports") {
        const ov = await client.request(`/admin-hub/v1/bonus-points/overview?${qs()}`);
        setOverview(ov);
      }
      if (tabId === "balances") {
        const r = await client.request(`/admin-hub/v1/bonus-points/customers?${qs({ limit, offset })}`);
        setCustomers(r.customers || []);
        setCustomerCount(r.count || 0);
      }
      if (tabId === "redemptions") {
        const r = await client.request(`/admin-hub/v1/bonus-points/redemptions?${qs({ limit, offset })}`);
        setOrders(r.orders || []);
        setOrderCount(r.count || 0);
        setOrderTotals(r.page_totals || null);
      }
      const ledgerMap = { earnings: "earnings", ledger: "ledger", reversals: "reversals", manual: "manual" };
      if (ledgerMap[tabId]) {
        const r = await client.request(`/admin-hub/v1/bonus-points/${ledgerMap[tabId]}?${qs({ limit, offset })}`);
        setLedger(r.entries || []);
        setLedgerCount(r.count || 0);
      }
    } catch (e) {
      setError(e?.message || "Load failed");
    } finally {
      setLoading(false);
    }
  }, [client, isSuperuser, offset, qs, tabId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!isSuperuser) return;
    client.request("/admin-hub/v1/bonus-points/payment-methods")
      .then((r) => {
        const items = Array.isArray(r?.payment_methods) ? r.payment_methods : [];
        setPmOptions(items.map((m) => ({
          value: m.key,
          label: m.count != null ? `${m.label} (${m.count})` : m.label,
        })));
      })
      .catch(() => {});
  }, [client, isSuperuser]);

  useEffect(() => { setOffset(0); setSelected(new Set()); }, [tabId, filters.from, filters.to, filters.payment_method, filters.search, onlyBalance]);

  const applySearch = () => setAppliedSearch(search.trim());

  const openOrder = async (id) => {
    try {
      const r = await client.request(`/admin-hub/v1/bonus-points/orders/${encodeURIComponent(id)}`);
      setDetail(r);
      setDetailOpen(true);
    } catch (e) {
      setError(e?.message || "Order load failed");
    }
  };

  const downloadExcel = async (scope, extra = {}) => {
    setBusyExport(`xlsx-${scope}`);
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("sellerToken") : null;
      if (!token) throw new Error(lt(locale, "Please login again.", "Lütfen tekrar giriş yapın.", "Veuillez vous reconnecter.", "Inicia sesión de nuevo.", "Accedi di nuovo.", "Bitte erneut einloggen."));
      const ids = extra.ids || (selected.size ? Array.from(selected) : undefined);
      const response = await fetch("/api/bonus-points/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sellerToken: token,
          from: filters.from,
          to: filters.to,
          payment_method: filters.payment_method,
          search: filters.search,
          only_with_balance: onlyBalance || undefined,
          scope,
          ids,
          ...extra,
        }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body?.error || `Export ${response.status}`);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `andertal-bonuspunkte-${scope}-${todayISO()}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert(e?.message || "Excel failed");
    } finally {
      setBusyExport("");
    }
  };

  const downloadPdf = async (scope, extra = {}) => {
    setBusyExport(`pdf-${scope}`);
    try {
      const p = new URLSearchParams(qs());
      p.set("scope", scope);
      if (extra.order_id) p.set("order_id", extra.order_id);
      if (selected.size && (scope === "redemptions" || scope === "all")) p.set("ids", Array.from(selected).join(","));
      const filename = extra.order_id
        ? `andertal-bonus-bestellung-${extra.order_id}.pdf`
        : `andertal-bonuspunkte-${scope}-${todayISO()}.pdf`;
      await downloadAuthenticatedPdf(`${client.baseURL}/admin-hub/v1/bonus-points/report.pdf?${p}`, filename);
    } catch (e) {
      alert(e?.message || "PDF failed");
    } finally {
      setBusyExport("");
    }
  };

  if (!isSuperuser) return null;

  const ov = overview;
  const liab = ov?.liability;
  const period = ov?.period;

  const exportButtons = (scope) => (
    <InlineStack gap="200">
      <Button size="slim" loading={busyExport === `xlsx-${scope}`} onClick={() => downloadExcel(scope)}>
        Excel
      </Button>
      <Button size="slim" loading={busyExport === `pdf-${scope}`} onClick={() => downloadPdf(scope)}>
        PDF
      </Button>
    </InlineStack>
  );

  return (
    <BlockStack gap="400">
      <Card>
        <BlockStack gap="200">
          <Text as="h2" variant="headingMd">
            {lt(locale, "Bonus points — operations & tax report", "Bonus puan — takip ve mali rapor", "Points bonus — suivi et rapport fiscal", "Puntos bonus — seguimiento y reporte fiscal", "Punti bonus — monitoraggio e report fiscale", "Bonuspunkte — Tracking & Steuerbericht")}
          </Text>
          <Text as="p" tone="subdued">
            {lt(
              locale,
              "Who holds points, which orders used them, and which discounts Andertal paid from its own cash. Built for bookkeeping / Finanzamt — not a product guide.",
              "Kimin bakiyesi var, hangi siparişte kaç puan kullanıldı, Andertal kasasından hangi siparişler tamamlandı. Muhasebe / Finanzamt için — ürün kılavuzu değil.",
              "Qui détient des points, quelles commandes les ont utilisés, et quels rabais Andertal a payés sur ses fonds propres.",
              "Quién tiene saldo, en qué pedidos se usaron puntos y qué descuentos pagó Andertal de su propia caja.",
              "Chi ha saldo, in quali ordini sono stati usati i punti e quali sconti Andertal ha coperto con cassa propria.",
              "Wer hat Guthaben, welche Bestellungen haben Punkte eingelöst, und welche Beträge Andertal aus eigenen Mitteln ausgeglichen hat.",
            )}
          </Text>
        </BlockStack>
      </Card>

      <Card>
        <BlockStack gap="300">
          <InlineStack gap="300" wrap blockAlign="end">
            <div style={{ minWidth: 150 }}>
              <TextField label={lt(locale, "From", "Başlangıç", "Du", "Desde", "Da", "Von")} type="date" value={from} onChange={setFrom} autoComplete="off" />
            </div>
            <div style={{ minWidth: 150 }}>
              <TextField label={lt(locale, "To", "Bitiş", "Au", "Hasta", "A", "Bis")} type="date" value={to} onChange={setTo} autoComplete="off" />
            </div>
            <div style={{ minWidth: 220 }}>
              <Select
                label={lt(locale, "Payment method", "Ödeme yöntemi", "Moyen de paiement", "Método de pago", "Metodo di pagamento", "Zahlungsart")}
                options={pmOptions}
                value={paymentMethod}
                onChange={setPaymentMethod}
              />
            </div>
            <div style={{ minWidth: 240, flex: 1 }}>
              <TextField
                label={lt(locale, "Search order, customer, PI", "Sipariş, müşteri, Payment Intent", "Commande, client, PI", "Pedido, cliente, PI", "Ordine, cliente, PI", "Bestellung, Kunde, PI")}
                value={search}
                onChange={setSearch}
                autoComplete="off"
                onBlur={applySearch}
                connectedRight={<Button onClick={applySearch}>{lt(locale, "Apply", "Uygula", "Appliquer", "Aplicar", "Applica", "Anwenden")}</Button>}
              />
            </div>
          </InlineStack>
          {tabId === "balances" && (
            <Checkbox
              label={lt(locale, "Only customers with a balance", "Sadece bakiyesi olan müşteriler", "Uniquement soldes > 0", "Solo con saldo", "Solo con saldo", "Nur Kunden mit Guthaben")}
              checked={onlyBalance}
              onChange={setOnlyBalance}
            />
          )}
        </BlockStack>
      </Card>

      {error ? <Banner tone="critical" onDismiss={() => setError("")}>{error}</Banner> : null}

      <Tabs tabs={tabs} selected={tab} onSelect={(i) => { setTab(i); }}>
        <div style={{ paddingTop: 16 }}>
          {loading ? (
            <div style={{ padding: 32, display: "flex", justifyContent: "center" }}><Spinner size="small" /></div>
          ) : (
            <>
              {tabId === "overview" && (
                <BlockStack gap="400">
                  <InlineStack gap="200" wrap>
                    <Kpi
                      label={lt(locale, "Open liability", "Açık yükümlülük", "Passif ouvert", "Pasivo abierto", "Passività aperta", "Offene Verbindlichkeit")}
                      value={fmtCents(liab?.outstanding_eur_cents, locale)}
                      hint={`${liab?.outstanding_points || 0} ${lt(locale, "points", "puan", "points", "puntos", "punti", "Punkte")} · ${liab?.customers_with_balance || 0} ${lt(locale, "customers", "müşteri", "clients", "clientes", "clienti", "Kunden")}`}
                      tone="amber"
                    />
                    <Kpi
                      label={lt(locale, "Andertal funded (period)", "Andertal finanse (dönem)", "Financé Andertal", "Financiado Andertal", "Finanziato Andertal", "Andertal finanziert (Zeitraum)")}
                      value={fmtCents(period?.andertal_funding_cents, locale)}
                      hint={`${period?.orders_with_bonus || 0} ${lt(locale, "orders", "sipariş", "commandes", "pedidos", "ordini", "Bestellungen")}`}
                      tone="blue"
                    />
                    <Kpi
                      label={lt(locale, "Points redeemed", "Kullanılan puan", "Points utilisés", "Puntos canjeados", "Punti usati", "Eingelöste Punkte")}
                      value={String(period?.points_redeemed || 0)}
                      hint={`${period?.orders_zero_pay || 0} × 0 € ${lt(locale, "checkout", "ödeme", "paiement", "pago", "pagamento", "Checkout")}`}
                    />
                    <Kpi
                      label={lt(locale, "Points earned", "Kazanılan puan", "Points gagnés", "Puntos ganados", "Punti guadagnati", "Verdiente Punkte")}
                      value={String(period?.points_earned || 0)}
                      hint={`${period?.earn_count || 0} ${lt(locale, "orders", "sipariş", "commandes", "pedidos", "ordini", "Bestellungen")}`}
                    />
                    <Kpi
                      label={lt(locale, "Customers total", "Toplam müşteri", "Clients", "Clientes", "Clienti", "Kunden gesamt")}
                      value={String(liab?.customers_total || 0)}
                    />
                    <Kpi
                      label={lt(locale, "Manual / signup (period)", "Manuel / kayıt (dönem)", "Manuel / inscription", "Manual / alta", "Manuale / registrazione", "Manuell / Registrierung")}
                      value={String((period?.manual_points || 0) + (period?.signup_points || 0))}
                    />
                  </InlineStack>
                  <Card>
                    <BlockStack gap="200">
                      <Text as="h3" variant="headingSm">
                        {lt(locale, "How this is booked (for finance)", "Muhasebe notu", "Note comptable", "Nota contable", "Nota contabile", "Buchungshinweis")}
                      </Text>
                      <Text as="p" variant="bodySm">
                        {lt(
                          locale,
                          "50 points = €1.00. Order value = customer card/PayPal payment + Andertal cash funding. Seller payout is commission on list price, not reduced by bonus. This is not extra revenue and not a seller discount.",
                          "50 puan = 1,00 €. Sipariş değeri = müşterinin kart/PayPal ödemesi + Andertal kasasından tamamlanan tutar. Satıcı ödemesi liste fiyatı üzerinden komisyon; bonus satıcıdan kesilmez. Ek ciro değil, satıcı indirimi değil.",
                          "50 points = 1,00 €. Valeur commande = paiement client + financement Andertal. Le vendeur n'est pas débité du bonus.",
                          "50 puntos = 1,00 €. Valor del pedido = pago del cliente + financiación Andertal. El vendedor no asume el bonus.",
                          "50 punti = 1,00 €. Valore ordine = pagamento cliente + finanziamento Andertal. Il venditore non viene addebitato.",
                          "50 Punkte = 1,00 €. Bestellwert = Kundenzahlung (Karte/PayPal) + Andertal-Finanzierung aus eigenen Mitteln. Verkäufer-Auszahlung auf Listenpreis nach Provision — kein Händler-Rabatt, kein zusätzlicher Umsatz.",
                        )}
                      </Text>
                      <InlineStack gap="200">
                        {exportButtons("all")}
                      </InlineStack>
                    </BlockStack>
                  </Card>
                </BlockStack>
              )}

              {tabId === "balances" && (
                <BlockStack gap="300">
                  <InlineStack align="space-between">
                    <Text as="p" tone="subdued" variant="bodySm">
                      {lt(locale, "Current point liability per customer. 50 points = €1.00.", "Müşteri bazında açık puan yükümlülüğü. 50 puan = 1,00 €.", "Passif actuel par client.", "Pasivo actual por cliente.", "Passività attuale per cliente.", "Aktuelle Punktverbindlichkeit je Kunde. 50 Punkte = 1,00 €.")}
                    </Text>
                    {exportButtons("balances")}
                  </InlineStack>
                  <Card padding="0">
                    {customers.length === 0 ? <Empty>{lt(locale, "No customers", "Müşteri yok", "Aucun client", "Sin clientes", "Nessun cliente", "Keine Kunden")}</Empty> : (
                      <div style={{ overflowX: "auto" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse" }}>
                          <thead>
                            <tr>
                              <th style={TH}>{lt(locale, "No.", "No.", "N°", "N.º", "N.", "Nr.")}</th>
                              <th style={TH}>{lt(locale, "Customer", "Müşteri", "Client", "Cliente", "Cliente", "Kunde")}</th>
                              <th style={{ ...TH, textAlign: "right" }}>{lt(locale, "Balance", "Bakiye", "Solde", "Saldo", "Saldo", "Guthaben")}</th>
                              <th style={{ ...TH, textAlign: "right" }}>EUR</th>
                              <th style={{ ...TH, textAlign: "right" }}>{lt(locale, "Earned", "Kazanılan", "Gagné", "Ganado", "Guadagnato", "Verdient")}</th>
                              <th style={{ ...TH, textAlign: "right" }}>{lt(locale, "Redeemed", "Kullanılan", "Utilisé", "Canjeado", "Usato", "Eingelöst")}</th>
                              <th style={{ ...TH, textAlign: "right" }}>{lt(locale, "Reversed", "İade/iptal", "Annulé", "Revertido", "Stornato", "Storno")}</th>
                              <th style={TH}>{lt(locale, "Last movement", "Son hareket", "Dernier mouvement", "Último", "Ultimo", "Letzte Bewegung")}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {customers.map((c) => (
                              <tr key={c.id}>
                                <td style={TD}>{c.customer_number || "—"}</td>
                                <td style={TD}>
                                  <Link href={`/customers/${c.id}`} style={{ fontWeight: 600, color: "#1d4ed8", textDecoration: "none" }}>{person(c)}</Link>
                                  <div style={{ fontSize: 11, color: "#6b7280" }}>{c.email}</div>
                                </td>
                                <td style={TD_NUM}>{c.bonus_points}</td>
                                <td style={TD_NUM}>{fmtCents(c.balance_eur_cents, locale)}</td>
                                <td style={TD_NUM}>{c.earned_points}</td>
                                <td style={TD_NUM}>{c.redeemed_points}</td>
                                <td style={TD_NUM}>{c.reversed_points}</td>
                                <td style={TD}>{fmtDate(c.last_ledger_at, locale)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </Card>
                  <Pager offset={offset} limit={limit} count={customerCount} onChange={setOffset} locale={locale} />
                </BlockStack>
              )}

              {tabId === "redemptions" && (
                <BlockStack gap="300">
                  <InlineStack align="space-between" wrap>
                    <Text as="p" tone="subdued" variant="bodySm">
                      {lt(
                        locale,
                        "Orders where Andertal completed the total from its own cash (bonus redemption). Select rows for a partial report.",
                        "Andertal'ın kendi kasasından tamamladığı siparişler (bonus kullanımı). Kısmi rapor için satır seçin.",
                        "Commandes financées par Andertal. Sélectionnez des lignes pour un rapport partiel.",
                        "Pedidos cubiertos por Andertal. Selecciona filas para un informe parcial.",
                        "Ordini coperti da Andertal. Seleziona righe per un report parziale.",
                        "Bestellungen, bei denen Andertal den Differenzbetrag aus eigenen Mitteln gezahlt hat. Zeilen für Teilbericht markieren.",
                      )}
                    </Text>
                    <InlineStack gap="200">
                      {selected.size > 0 ? (
                        <Text as="span" variant="bodySm">{selected.size} {lt(locale, "selected", "seçili", "sélectionné(s)", "seleccionados", "selezionati", "ausgewählt")}</Text>
                      ) : null}
                      {exportButtons("redemptions")}
                    </InlineStack>
                  </InlineStack>
                  {orderTotals && orders.length > 0 && (
                    <InlineStack gap="200" wrap>
                      <Kpi label={lt(locale, "Page: Andertal cash", "Sayfa: Andertal kasa", "Page: caisse Andertal", "Página: caja Andertal", "Pagina: cassa Andertal", "Seite: Andertal-Kasse")} value={fmtCents(orderTotals.bonus_funding_cents, locale)} tone="blue" />
                      <Kpi label={lt(locale, "Page: customer paid", "Sayfa: müşteri ödedi", "Page: client payé", "Página: cliente pagó", "Pagina: cliente pagato", "Seite: Kunde gezahlt")} value={fmtCents(orderTotals.customer_paid_cents, locale)} />
                      <Kpi label={lt(locale, "Page: order value", "Sayfa: sipariş değeri", "Page: valeur", "Página: valor", "Pagina: valore", "Seite: Bestellwert")} value={fmtCents(orderTotals.order_value_cents, locale)} />
                    </InlineStack>
                  )}
                  <Card padding="0">
                    {orders.length === 0 ? <Empty>{lt(locale, "No bonus redemptions in this filter", "Bu filtrede bonus kullanımı yok", "Aucune utilisation", "Sin canjes", "Nessun utilizzo", "Keine Einlösungen in diesem Filter")}</Empty> : (
                      <div style={{ overflowX: "auto" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse" }}>
                          <thead>
                            <tr>
                              <th style={{ ...TH, width: 36 }} />
                              <th style={TH}>{lt(locale, "Order", "Sipariş", "Commande", "Pedido", "Ordine", "Bestellung")}</th>
                              <th style={TH}>{lt(locale, "Customer", "Müşteri", "Client", "Cliente", "Cliente", "Kunde")}</th>
                              <th style={TH}>{lt(locale, "Payment", "Ödeme", "Paiement", "Pago", "Pagamento", "Zahlung")}</th>
                              <th style={{ ...TH, textAlign: "right" }}>{lt(locale, "Value", "Değer", "Valeur", "Valor", "Valore", "Wert")}</th>
                              <th style={{ ...TH, textAlign: "right" }}>{lt(locale, "Customer paid", "Müşteri ödedi", "Client", "Cliente", "Cliente", "Kunde")}</th>
                              <th style={{ ...TH, textAlign: "right" }}>{lt(locale, "Andertal cash", "Andertal kasa", "Andertal", "Andertal", "Andertal", "Andertal")}</th>
                              <th style={{ ...TH, textAlign: "right" }}>{lt(locale, "Points", "Puan", "Points", "Puntos", "Punti", "Punkte")}</th>
                              <th style={TH} />
                            </tr>
                          </thead>
                          <tbody>
                            {orders.map((o) => (
                              <tr key={o.id}>
                                <td style={TD}>
                                  <Checkbox
                                    label=""
                                    labelHidden
                                    checked={selected.has(o.id)}
                                    onChange={(v) => {
                                      setSelected((prev) => {
                                        const next = new Set(prev);
                                        if (v) next.add(o.id); else next.delete(o.id);
                                        return next;
                                      });
                                    }}
                                  />
                                </td>
                                <td style={TD}>
                                  <Link href={`/orders/${o.id}`} style={{ fontWeight: 600, color: "#1d4ed8", textDecoration: "none" }}>#{o.order_number}</Link>
                                  <div style={{ fontSize: 11, color: "#6b7280" }}>{fmtDate(o.created_at, locale)}{o.country ? ` · ${o.country}` : ""}</div>
                                </td>
                                <td style={TD}>
                                  {o.customer_id ? (
                                    <Link href={`/customers/${o.customer_id}`} style={{ color: "#111827", textDecoration: "none" }}>{person(o)}</Link>
                                  ) : person(o)}
                                  <div style={{ fontSize: 11, color: "#6b7280" }}>{o.email}</div>
                                </td>
                                <td style={TD}>
                                  {o.payment_method_label}
                                  {o.checkout_payment_kind === "platform_loyalty" ? (
                                    <div style={{ fontSize: 11, color: "#1d4ed8" }}>0 € / {lt(locale, "points only", "sadece puan", "points seuls", "solo puntos", "solo punti", "nur Punkte")}</div>
                                  ) : null}
                                </td>
                                <td style={TD_NUM}>{fmtCents(o.order_value_cents, locale)}</td>
                                <td style={TD_NUM}>{fmtCents(o.customer_paid_cents, locale)}</td>
                                <td style={{ ...TD_NUM, color: "#1d4ed8", fontWeight: 600 }}>{fmtCents(o.bonus_funding_cents, locale)}</td>
                                <td style={TD_NUM}>{o.bonus_points_redeemed}</td>
                                <td style={TD}>
                                  <InlineStack gap="100">
                                    <Button size="slim" onClick={() => openOrder(o.id)}>{lt(locale, "Detail", "Detay", "Détail", "Detalle", "Dettaglio", "Detail")}</Button>
                                  </InlineStack>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </Card>
                  <Pager offset={offset} limit={limit} count={orderCount} onChange={setOffset} locale={locale} />
                </BlockStack>
              )}

              {(tabId === "earnings" || tabId === "ledger" || tabId === "reversals" || tabId === "manual") && (
                <BlockStack gap="300">
                  <InlineStack align="space-between">
                    <Text as="p" tone="subdued" variant="bodySm">
                      {tabId === "earnings" && lt(locale, "Points earned from paid orders (ceil of euros actually paid).", "Ödenen siparişlerden kazanılan puan (ödenen euro, yukarı yuvarlanır).", "Points gagnés.", "Puntos ganados.", "Punti guadagnati.", "Punkte aus tatsächlich gezahlten Bestellungen (aufgerundet).")}
                      {tabId === "ledger" && lt(locale, "Immutable append-only ledger. Corrections are new rows, never edits.", "Değiştirilemez defter. Düzeltme yeni satırdır, eski satır silinmez.", "Grand livre append-only.", "Libro de solo anexado.", "Registro solo-append.", "Unveränderliches Ledger. Korrekturen = neue Zeilen.")}
                      {tabId === "reversals" && lt(locale, "Points reversed on cancellation or refund, proportional to the refund.", "İptal/iadede orantılı geri alınan puanlar.", "Points annulés.", "Puntos revertidos.", "Punti stornati.", "Punkte bei Storno/Retoure anteilig zurückgenommen.")}
                      {tabId === "manual" && lt(locale, "Signup welcome points and superuser manual bookings.", "Kayıt hoş geldin puanı ve superuser manuel kayıtlar.", "Inscription et écritures manuelles.", "Alta y asientos manuales.", "Registrazione e scritture manuali.", "Registrierungsbonus und manuelle Superuser-Buchungen.")}
                    </Text>
                    {exportButtons(tabId === "ledger" ? "ledger" : tabId)}
                  </InlineStack>
                  <Card padding="0">
                    {ledger.length === 0 ? <Empty>{lt(locale, "No movements", "Hareket yok", "Aucun mouvement", "Sin movimientos", "Nessun movimento", "Keine Bewegungen")}</Empty> : (
                      <div style={{ overflowX: "auto" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse" }}>
                          <thead>
                            <tr>
                              <th style={TH}>{lt(locale, "Date", "Tarih", "Date", "Fecha", "Data", "Datum")}</th>
                              <th style={TH}>{lt(locale, "Customer", "Müşteri", "Client", "Cliente", "Cliente", "Kunde")}</th>
                              <th style={TH}>{lt(locale, "Source", "Kaynak", "Source", "Origen", "Origine", "Quelle")}</th>
                              <th style={{ ...TH, textAlign: "right" }}>{lt(locale, "Points", "Puan", "Points", "Puntos", "Punti", "Punkte")}</th>
                              <th style={{ ...TH, textAlign: "right" }}>EUR</th>
                              <th style={TH}>{lt(locale, "Order", "Sipariş", "Commande", "Pedido", "Ordine", "Bestellung")}</th>
                              <th style={TH}>{lt(locale, "Description", "Açıklama", "Description", "Descripción", "Descrizione", "Beschreibung")}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {ledger.map((e) => (
                              <tr key={e.id}>
                                <td style={TD}>{fmtDate(e.occurred_at, locale)}</td>
                                <td style={TD}>
                                  {e.customer_id ? (
                                    <Link href={`/customers/${e.customer_id}`} style={{ color: "#111827", textDecoration: "none" }}>{person(e)}</Link>
                                  ) : person(e)}
                                  <div style={{ fontSize: 11, color: "#6b7280" }}>{e.email}</div>
                                </td>
                                <td style={TD}>{e.source_label}</td>
                                <td style={{ ...TD_NUM, color: e.points_delta < 0 ? "#b91c1c" : "#065f46", fontWeight: 600 }}>
                                  {e.points_delta > 0 ? `+${e.points_delta}` : e.points_delta}
                                </td>
                                <td style={TD_NUM}>{fmtCents(e.eur_cents, locale)}</td>
                                <td style={TD}>
                                  {e.order_id ? (
                                    <button type="button" onClick={() => openOrder(e.order_id)} style={{ border: "none", background: "none", color: "#1d4ed8", cursor: "pointer", padding: 0, fontWeight: 600 }}>
                                      #{e.order_number || "…"}
                                    </button>
                                  ) : "—"}
                                </td>
                                <td style={{ ...TD, maxWidth: 320 }}>{e.description}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </Card>
                  <Pager offset={offset} limit={limit} count={ledgerCount} onChange={setOffset} locale={locale} />
                </BlockStack>
              )}

              {tabId === "reports" && (
                <BlockStack gap="400">
                  <Banner tone="info">
                    <Text as="p" variant="bodySm">
                      {lt(
                        locale,
                        "Single-order PDFs prove one checkout (customer paid + Andertal cash = order value). Bulk Excel/PDF cover the current date range and payment-method filter. Selected rows on the Andertal-cash tab become a partial report.",
                        "Tekil PDF bir siparişi kanıtlar (müşteri ödedi + Andertal kasa = sipariş değeri). Toplu Excel/PDF mevcut tarih ve ödeme yöntemi filtresini kullanır. Andertal kasası sekmesinde seçilen satırlar kısmi rapor olur.",
                        "Le PDF unitaire prouve une commande. L’export groupé utilise le filtre actuel.",
                        "El PDF unitario prueba un pedido. El export masivo usa el filtro actual.",
                        "Il PDF singolo prova un ordine. L’export di massa usa il filtro attuale.",
                        "Einzel-PDF = eine Bestellung (Kunde + Andertal-Kasse = Bestellwert). Sammel-Excel/PDF = aktueller Zeitraum und Zahlungsart. Markierte Zeilen in Andertal-Kasse = Teilbericht.",
                      )}
                    </Text>
                  </Banner>
                  <Card>
                    <BlockStack gap="300">
                      <Text as="h3" variant="headingSm">{lt(locale, "Bulk (current filters)", "Toplu (mevcut filtre)", "Lot (filtre actuel)", "Lote (filtro actual)", "Lotto (filtro attuale)", "Sammelbericht (aktueller Filter)")}</Text>
                      <InlineStack gap="200" wrap>
                        <Button variant="primary" loading={busyExport === "xlsx-all"} onClick={() => downloadExcel("all")}>
                          {lt(locale, "Excel — full pack", "Excel — tam paket", "Excel — pack complet", "Excel — paquete completo", "Excel — pacchetto completo", "Excel — Gesamtpaket")}
                        </Button>
                        <Button loading={busyExport === "pdf-all"} onClick={() => downloadPdf("all")}>
                          {lt(locale, "PDF — full pack", "PDF — tam paket", "PDF — pack complet", "PDF — paquete completo", "PDF — pacchetto completo", "PDF — Gesamtpaket")}
                        </Button>
                      </InlineStack>
                      <InlineStack gap="200" wrap>
                        <Button size="slim" loading={busyExport === "xlsx-redemptions"} onClick={() => downloadExcel("redemptions")}>Excel · Andertal-Kasse</Button>
                        <Button size="slim" loading={busyExport === "pdf-redemptions"} onClick={() => downloadPdf("redemptions")}>PDF · Andertal-Kasse</Button>
                        <Button size="slim" loading={busyExport === "xlsx-balances"} onClick={() => downloadExcel("balances")}>Excel · {lt(locale, "Balances", "Bakiyeler", "Soldes", "Saldos", "Saldi", "Salden")}</Button>
                        <Button size="slim" loading={busyExport === "pdf-balances"} onClick={() => downloadPdf("balances")}>PDF · {lt(locale, "Balances", "Bakiyeler", "Soldes", "Saldos", "Saldi", "Salden")}</Button>
                        <Button size="slim" loading={busyExport === "xlsx-ledger"} onClick={() => downloadExcel("ledger")}>Excel · Ledger</Button>
                        <Button size="slim" loading={busyExport === "pdf-ledger"} onClick={() => downloadPdf("ledger")}>PDF · Ledger</Button>
                      </InlineStack>
                      {selected.size > 0 && (
                        <InlineStack gap="200">
                          <Button size="slim" onClick={() => downloadExcel("redemptions")}>
                            Excel · {selected.size} {lt(locale, "selected orders", "seçili sipariş", "commandes", "pedidos", "ordini", "Bestellungen")}
                          </Button>
                          <Button size="slim" onClick={() => downloadPdf("redemptions")}>
                            PDF · {selected.size} {lt(locale, "selected orders", "seçili sipariş", "commandes", "pedidos", "ordini", "Bestellungen")}
                          </Button>
                        </InlineStack>
                      )}
                    </BlockStack>
                  </Card>
                  <Card>
                    <BlockStack gap="200">
                      <Text as="h3" variant="headingSm">{lt(locale, "Period snapshot", "Dönem özeti", "Aperçu période", "Resumen periodo", "Riepilogo periodo", "Periodenspiegel")}</Text>
                      {period ? (
                        <div style={{ overflowX: "auto" }}>
                          <table style={{ width: "100%", borderCollapse: "collapse", maxWidth: 640 }}>
                            <tbody>
                              {[
                                [lt(locale, "Orders", "Sipariş", "Commandes", "Pedidos", "Ordini", "Bestellungen"), period.orders_total],
                                [lt(locale, "With bonus redemption", "Bonus kullanılan", "Avec bonus", "Con bonus", "Con bonus", "Mit Bonus-Einlösung"), period.orders_with_bonus],
                                [lt(locale, "Andertal cash", "Andertal kasa", "Caisse Andertal", "Caja Andertal", "Cassa Andertal", "Andertal-Kasse"), fmtCents(period.andertal_funding_cents, locale)],
                                [lt(locale, "Open liability (now)", "Açık yükümlülük (şimdi)", "Passif actuel", "Pasivo actual", "Passività attuale", "Offene Verbindlichkeit (jetzt)"), fmtCents(liab?.outstanding_eur_cents, locale)],
                                [lt(locale, "Points outstanding", "Açık puan", "Points ouverts", "Puntos abiertos", "Punti aperti", "Offene Punkte"), liab?.outstanding_points],
                              ].map(([k, v]) => (
                                <tr key={k}>
                                  <td style={{ ...TD, color: "#6b7280", width: "60%" }}>{k}</td>
                                  <td style={{ ...TD_NUM, fontWeight: 600 }}>{v}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : null}
                    </BlockStack>
                  </Card>
                </BlockStack>
              )}
            </>
          )}
        </div>
      </Tabs>

      <Modal
        open={detailOpen}
        onClose={() => { setDetailOpen(false); setDetail(null); }}
        title={detail?.order ? `${lt(locale, "Order", "Sipariş", "Commande", "Pedido", "Ordine", "Bestellung")} #${detail.order.order_number}` : "…"}
        large
        primaryAction={{
          content: "PDF",
          loading: busyExport === `pdf-order`,
          onAction: () => detail?.order && downloadPdf("order", { order_id: detail.order.id }),
        }}
        secondaryActions={[
          {
            content: "Excel",
            loading: busyExport === "xlsx-order",
            onAction: () => detail?.order && downloadExcel("order", { order_id: detail.order.id }),
          },
        ]}
      >
        <Modal.Section>
          {!detail?.order ? <Spinner size="small" /> : (
            <BlockStack gap="400">
              <Text as="p" variant="bodySm" tone="subdued">
                {lt(
                  locale,
                  "Order value is completed by the customer payment plus Andertal’s own cash. Seller payout is not reduced by the bonus.",
                  "Sipariş değeri müşteri ödemesi + Andertal kasasıyla tamamlanır. Satıcı ödemesinden bonus düşülmez.",
                  "La valeur est soldée par le client + la caisse Andertal.",
                  "El valor se completa con el pago del cliente + caja Andertal.",
                  "Il valore è coperto da pagamento cliente + cassa Andertal.",
                  "Bestellwert = Kundenzahlung + Andertal aus eigenen Mitteln. Kein Abzug beim Verkäufer.",
                )}
              </Text>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <tbody>
                    {[
                      [lt(locale, "Date", "Tarih", "Date", "Fecha", "Data", "Datum"), fmtDate(detail.order.created_at, locale)],
                      [lt(locale, "Customer", "Müşteri", "Client", "Cliente", "Cliente", "Kunde"), `${person(detail.order)} · ${detail.order.email || ""}`],
                      [lt(locale, "Payment method", "Ödeme yöntemi", "Paiement", "Pago", "Pagamento", "Zahlungsart"), detail.order.payment_method_label],
                      [lt(locale, "Country", "Ülke", "Pays", "País", "Paese", "Land"), detail.order.country || "—"],
                      [lt(locale, "Merchandise", "Mal", "Marchandise", "Mercancía", "Merce", "Ware"), fmtCents(detail.order.subtotal_cents, locale)],
                      [lt(locale, "Shipping", "Kargo", "Livraison", "Envío", "Spedizione", "Versand"), fmtCents(detail.order.shipping_cents, locale)],
                      [lt(locale, "Coupon", "Kupon", "Coupon", "Cupón", "Coupon", "Gutschein"), fmtCents(detail.order.coupon_discount_cents, locale)],
                      [lt(locale, "Order value", "Sipariş değeri", "Valeur", "Valor", "Valore", "Bestellwert"), fmtCents(detail.order.order_value_cents, locale)],
                      [lt(locale, "Customer paid", "Müşteri ödedi", "Client payé", "Cliente pagó", "Cliente pagato", "Kunde gezahlt"), fmtCents(detail.order.customer_paid_cents, locale)],
                      [lt(locale, "Andertal cash", "Andertal kasa", "Caisse Andertal", "Caja Andertal", "Cassa Andertal", "Andertal-Kasse"), fmtCents(detail.order.bonus_funding_cents, locale)],
                      [lt(locale, "Points redeemed", "Kullanılan puan", "Points", "Puntos", "Punti", "Punkte"), detail.order.bonus_points_redeemed],
                      [lt(locale, "Commission", "Komisyon", "Commission", "Comisión", "Commissione", "Provision"), fmtCents(detail.order.commission_cents, locale)],
                      [lt(locale, "Seller payout", "Satıcı ödemesi", "Versement vendeur", "Pago vendedor", "Payout venditore", "Auszahlung Verkäufer"), fmtCents(detail.order.seller_net_cents, locale)],
                      ["Stripe PI", detail.order.payment_intent_id || "—"],
                    ].map(([k, v]) => (
                      <tr key={k}>
                        <td style={{ ...TD, color: "#6b7280", width: "40%" }}>{k}</td>
                        <td style={{ ...TD, fontWeight: 600 }}>{v}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {detail.ledger?.length > 0 && (
                <BlockStack gap="150">
                  <Text as="h3" variant="headingSm">Ledger</Text>
                  {detail.ledger.map((e) => (
                    <div key={e.id} style={{ fontSize: 12, display: "flex", gap: 12, borderBottom: "1px solid #f3f4f6", padding: "6px 0" }}>
                      <span style={{ color: "#6b7280", minWidth: 90 }}>{fmtDate(e.occurred_at, locale)}</span>
                      <span style={{ flex: 1 }}>{e.source_label}</span>
                      <span style={{ fontWeight: 700, color: e.points_delta < 0 ? "#b91c1c" : "#065f46" }}>
                        {e.points_delta > 0 ? `+${e.points_delta}` : e.points_delta}
                      </span>
                    </div>
                  ))}
                </BlockStack>
              )}
              <InlineStack gap="200">
                <Link href={`/orders/${detail.order.id}`}>{lt(locale, "Open order", "Siparişi aç", "Ouvrir la commande", "Abrir pedido", "Apri ordine", "Bestellung öffnen")}</Link>
                {detail.order.customer_id ? (
                  <Link href={`/customers/${detail.order.customer_id}`}>{lt(locale, "Open customer", "Müşteriyi aç", "Ouvrir le client", "Abrir cliente", "Apri cliente", "Kunde öffnen")}</Link>
                ) : null}
              </InlineStack>
            </BlockStack>
          )}
        </Modal.Section>
      </Modal>
    </BlockStack>
  );
}
