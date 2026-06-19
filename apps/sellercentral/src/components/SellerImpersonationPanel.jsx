"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useLocale } from "next-intl";
import { Badge, Button, Spinner, Text } from "@shopify/polaris";
import { createImpersonationClient } from "@/lib/medusa-admin-client";
import { getImpersonationCopy, getSellerApprovalStatus } from "@/lib/marketing-i18n";
import { dateLocaleFor } from "@/lib/locale-text";
import { statusLabel as localizeStatus } from "@/lib/status-labels";

function statusMetaFor(locale, status) {
  const tones = {
    registered: "info",
    documents_submitted: "attention",
    pending_approval: "warning",
    approved: "success",
    rejected: "critical",
    suspended: "critical",
  };
  return { label: getSellerApprovalStatus(locale, status), tone: tones[status] || "info" };
}

function fmtCents(c, locale) {
  const loc = dateLocaleFor(locale).replace(/-[A-Z]+$/, "") === "en" ? "en-GB" : dateLocaleFor(locale);
  if (!c) return (0).toLocaleString(loc, { style: "currency", currency: "EUR" });
  return (c / 100).toLocaleString(loc, { style: "currency", currency: "EUR" });
}
function fmtDate(d, locale) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString(dateLocaleFor(locale), { day: "2-digit", month: "2-digit", year: "numeric" });
}

const TAB_STYLE = (active) => ({
  padding: "10px 20px",
  background: active ? "#fff" : "transparent",
  border: "none",
  borderBottom: active ? "2px solid #1f2937" : "2px solid transparent",
  cursor: "pointer",
  fontSize: 14,
  fontWeight: active ? 700 : 500,
  color: active ? "#111827" : "#6b7280",
  whiteSpace: "nowrap",
});

export default function SellerImpersonationPanel({ seller, token, onClose }) {
  const locale = useLocale();
  const imp = useMemo(() => getImpersonationCopy(locale), [locale]);
  const [tab, setTab] = useState("profil");
  const [profile, setProfile] = useState(null);
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [visible, setVisible] = useState(false);

  const client = createImpersonationClient(token);

  // Slide-in animation
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 10);
    return () => clearTimeout(t);
  }, []);

  const handleClose = () => {
    setVisible(false);
    setTimeout(onClose, 300);
  };

  // Block background scroll
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  const loadProfile = useCallback(async () => {
    setLoadingProfile(true);
    try {
      const d = await client.getSellerSettings("default");
      setProfile(d);
    } catch { /* ignore */ } finally {
      setLoadingProfile(false);
    }
  }, [token]);

  const loadProducts = useCallback(async () => {
    setLoadingProducts(true);
    try {
      const d = await client.getProducts({ limit: 50 });
      setProducts(d?.products || []);
    } catch { setProducts([]); } finally {
      setLoadingProducts(false);
    }
  }, [token]);

  const loadOrders = useCallback(async () => {
    setLoadingOrders(true);
    try {
      const d = await client.getOrders({ limit: 50 });
      setOrders(d?.orders || []);
    } catch { setOrders([]); } finally {
      setLoadingOrders(false);
    }
  }, [token]);

  useEffect(() => {
    if (tab === "profil") loadProfile();
    if (tab === "products") loadProducts();
    if (tab === "orders") loadOrders();
  }, [tab]);

  const statusMeta = statusMetaFor(locale, seller.approval_status);

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={handleClose}
        style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)",
          zIndex: 9998,
          opacity: visible ? 1 : 0,
          transition: "opacity 0.3s ease",
        }}
      />

      {/* Panel */}
      <div style={{
        position: "fixed", left: 0, right: 0, bottom: 0,
        height: "88vh",
        background: "#fff",
        borderRadius: "16px 16px 0 0",
        boxShadow: "0 -8px 40px rgba(0,0,0,0.18)",
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        transform: visible ? "translateY(0)" : "translateY(100%)",
        transition: "transform 0.32s cubic-bezier(0.32,0.72,0,1)",
        overflow: "hidden",
      }}>

        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "16px 24px",
          borderBottom: "1px solid #e5e7eb",
          background: "#1f2937",
          flexShrink: 0,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{
              width: 36, height: 36, borderRadius: "50%",
              background: "#374151",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 15, fontWeight: 700, color: "#fff",
            }}>
              {(seller.store_name || seller.email || "?").charAt(0).toUpperCase()}
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#fff" }}>
                {seller.store_name || seller.email || "Seller"}
              </div>
              <div style={{ fontSize: 12, color: "#9ca3af" }}>{seller.email}</div>
            </div>
            <Badge tone={statusMeta.tone}>{statusMeta.label}</Badge>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ fontSize: 12, color: "#9ca3af", textAlign: "right" }}>
              <div>{imp.loggedInAsSeller}</div>
              <div style={{ color: "#e5e7eb", fontWeight: 600 }}>{seller.store_name || seller.email}</div>
            </div>
            <button
              onClick={handleClose}
              style={{
                background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.2)",
                borderRadius: 8, color: "#fff", cursor: "pointer",
                width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 18, lineHeight: 1,
              }}
            >
              ×
            </button>
          </div>
        </div>

        {/* Tab bar */}
        <div style={{
          display: "flex", borderBottom: "1px solid #e5e7eb",
          overflowX: "auto", flexShrink: 0, background: "#f9fafb",
        }}>
          {[
            { id: "profil", label: imp.profile },
            { id: "products", label: imp.products },
            { id: "orders", label: imp.orders },
          ].map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} style={TAB_STYLE(tab === t.id)}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: "auto", padding: 24 }}>

          {/* PROFIL */}
          {tab === "profil" && (
            loadingProfile ? (
              <div style={{ textAlign: "center", padding: 40 }}><Spinner size="small" /></div>
            ) : (
              <div style={{ maxWidth: 680 }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 16, marginBottom: 24 }}>
                  {[
                    { label: imp.shopName, value: seller.store_name || "—" },
                    { label: imp.email, value: seller.email },
                    { label: imp.company, value: seller.company_name || "—" },
                    { label: "IBAN", value: seller.iban ? seller.iban.replace(/(.{4})/g, "$1 ").trim() : "—" },
                    { label: imp.joined, value: fmtDate(seller.created_at, locale) },
                    { label: imp.products, value: seller.product_count ?? "—" },
                    { label: imp.revenue, value: fmtCents(seller.revenue_cents, locale) },
                    { label: imp.commission, value: fmtCents(seller.commission_cents, locale) },
                  ].map((item) => (
                    <div key={item.label} style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 10, padding: "14px 16px" }}>
                      <div style={{ fontSize: 11, color: "#6b7280", fontWeight: 600, marginBottom: 4 }}>{item.label}</div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: "#111827", wordBreak: "break-all" }}>{item.value}</div>
                    </div>
                  ))}
                </div>
                {profile && (
                  <div style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 10, padding: 20 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#374151", marginBottom: 12 }}>{imp.shopSettings}</div>
                    {[
                      [imp.shopName, profile.store_name],
                      [imp.description, profile.store_description],
                      [imp.email, profile.contact_email],
                      [imp.phone, profile.contact_phone],
                      [imp.website, profile.website],
                      [imp.address, profile.store_address],
                    ].map(([k, v]) => v ? (
                      <div key={k} style={{ display: "flex", gap: 12, marginBottom: 8, fontSize: 13 }}>
                        <span style={{ color: "#6b7280", minWidth: 120 }}>{k}</span>
                        <span style={{ color: "#111827" }}>{v}</span>
                      </div>
                    ) : null)}
                  </div>
                )}
              </div>
            )
          )}

          {/* PRODUKTE */}
          {tab === "products" && (
            loadingProducts ? (
              <div style={{ textAlign: "center", padding: 40 }}><Spinner size="small" /></div>
            ) : products.length === 0 ? (
              <div style={{ textAlign: "center", padding: 40, color: "#6b7280" }}>{imp.noProducts}</div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: "#f6f6f7", borderBottom: "1px solid #e1e3e5" }}>
                      {["Bild", "Name", "Status", "Preis", "Lager", "Erstellt"].map((h) => (
                        <th key={h} style={{ padding: "10px 12px", textAlign: "left", fontWeight: 600, color: "#6d7175" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {products.map((p, i) => {
                      const thumb = p.thumbnail || p.images?.[0]?.url || "";
                      const price = p.variants?.[0]?.prices?.[0]?.amount;
                      const stock = p.variants?.reduce((s, v) => s + (v.inventory_quantity || 0), 0);
                      return (
                        <tr key={p.id} style={{ borderBottom: "1px solid #f1f1f1", background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                          <td style={{ padding: "8px 12px" }}>
                            {thumb ? <img src={thumb} alt="" style={{ width: 40, height: 40, objectFit: "cover", borderRadius: 6 }} /> : <div style={{ width: 40, height: 40, background: "#e5e7eb", borderRadius: 6 }} />}
                          </td>
                          <td style={{ padding: "8px 12px", fontWeight: 600, maxWidth: 220 }}>
                            <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.title}</div>
                            <div style={{ fontSize: 11, color: "#9ca3af" }}>{p.handle}</div>
                          </td>
                          <td style={{ padding: "8px 12px" }}>
                            <span style={{ background: p.status === "published" ? "#d1fae5" : "#fef3c7", color: p.status === "published" ? "#065f46" : "#92400e", padding: "2px 8px", borderRadius: 99, fontSize: 11, fontWeight: 600 }}>
                              {p.status}
                            </span>
                          </td>
                          <td style={{ padding: "8px 12px" }}>{price != null ? fmtCents(price) : "—"}</td>
                          <td style={{ padding: "8px 12px", textAlign: "center" }}>{stock ?? "—"}</td>
                          <td style={{ padding: "8px 12px", color: "#9ca3af" }}>{fmtDate(p.created_at)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )
          )}

          {/* BESTELLUNGEN */}
          {tab === "orders" && (
            loadingOrders ? (
              <div style={{ textAlign: "center", padding: 40 }}><Spinner size="small" /></div>
            ) : orders.length === 0 ? (
              <div style={{ textAlign: "center", padding: 40, color: "#6b7280" }}>{imp.noOrders}</div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: "#f6f6f7", borderBottom: "1px solid #e1e3e5" }}>
                      {[imp.order, imp.customer, imp.status, imp.amount, imp.date].map((h) => (
                        <th key={h} style={{ padding: "10px 12px", textAlign: "left", fontWeight: 600, color: "#6d7175" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((o, i) => (
                      <tr key={o.id} style={{ borderBottom: "1px solid #f1f1f1", background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                        <td style={{ padding: "8px 12px", fontFamily: "monospace", fontSize: 12 }}>#{o.display_id || o.id?.slice(-6)}</td>
                        <td style={{ padding: "8px 12px" }}>{o.shipping_address?.first_name} {o.shipping_address?.last_name}</td>
                        <td style={{ padding: "8px 12px" }}>
                          <span style={{ background: "#f3f4f6", padding: "2px 8px", borderRadius: 99, fontSize: 11, fontWeight: 600 }}>{localizeStatus(locale, o.order_status || o.status)}</span>
                        </td>
                        <td style={{ padding: "8px 12px" }}>{fmtCents(o.total, locale)}</td>
                        <td style={{ padding: "8px 12px", color: "#9ca3af" }}>{fmtDate(o.created_at, locale)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}
        </div>
      </div>
    </>
  );
}
