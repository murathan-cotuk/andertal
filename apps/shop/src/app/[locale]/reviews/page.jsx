"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuthGuard, getToken } from "@belucha/lib";
import NewtonsCradle from "@/components/NewtonsCradle";
import { useRouter } from "@/i18n/navigation";
import ShopHeader from "@/components/ShopHeader";
import Footer from "@/components/Footer";
import AccountPageLayout, { ACCOUNT_PAGE_MAIN_INNER } from "@/components/account/AccountPageLayout";
import { getMedusaClient } from "@/lib/medusa-client";
import { useCustomerAuth as useAuth } from "@belucha/lib";

const ORANGE = "#ff971c";
const DARK = "#1A1A1A";
const GRAY = "#6b7280";
const BORDER = "#e5e7eb";

function StarPicker({ value, onChange }) {
  const [hovered, setHovered] = useState(0);
  return (
    <div style={{ display: "flex", gap: 4 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onMouseEnter={() => setHovered(n)}
          onMouseLeave={() => setHovered(0)}
          onClick={() => onChange(n)}
          style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontSize: 28, color: (hovered || value) >= n ? "#f59e0b" : "#d1d5db", lineHeight: 1 }}
        >
          ★
        </button>
      ))}
    </div>
  );
}

function StarDisplay({ value }) {
  const stars = Number(value) || 0;
  return (
    <span style={{ fontSize: 18, letterSpacing: 1 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} style={{ color: stars >= n ? "#f59e0b" : "#d1d5db" }}>★</span>
      ))}
    </span>
  );
}

function fmtDate(d) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function ReviewForm({ orderId, item, existing, onSaved }) {
  const [rating, setRating] = useState(existing?.rating || 0);
  const [comment, setComment] = useState(existing?.comment || "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);

  const handleSubmit = async () => {
    if (!rating) { setErr("Bitte eine Bewertung auswählen."); return; }
    setSaving(true); setErr("");
    try {
      const token = getToken("customer");
      const client = getMedusaClient();
      await client.request("/store/reviews", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ order_id: orderId, product_id: item.product_id, rating, comment }),
      });
      setDone(true);
      onSaved({ order_id: orderId, product_id: item.product_id, rating, comment });
    } catch (e) {
      setErr(e?.message || "Fehler beim Speichern");
    }
    setSaving(false);
  };

  if (done) {
    return (
      <div style={{ padding: "12px 16px", background: "#f0fdf4", borderRadius: 8, border: "1px solid #bbf7d0" }}>
        <p style={{ margin: "0 0 4px", fontSize: 13, color: "#15803d", fontWeight: 600 }}>✓ Bewertung gespeichert</p>
        <StarDisplay value={rating} />
        {comment && <p style={{ margin: "6px 0 0", fontSize: 13, color: "#374151" }}>{comment}</p>}
      </div>
    );
  }

  return (
    <div style={{ padding: "12px 16px", background: "#fafafa", borderRadius: 8, border: `1px solid ${BORDER}`, marginTop: 4 }}>
      <p style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 600, color: DARK }}>{item.title}</p>
      <StarPicker value={rating} onChange={setRating} />
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        rows={3}
        placeholder="Kommentar (optional)..."
        style={{ width: "100%", marginTop: 10, padding: "8px 10px", border: `1px solid ${BORDER}`, borderRadius: 6, fontSize: 13, resize: "vertical", boxSizing: "border-box" }}
      />
      {err && <p style={{ color: "#ef4444", fontSize: 12, margin: "6px 0 0" }}>{err}</p>}
      <button
        type="button"
        onClick={handleSubmit}
        disabled={saving}
        style={{ marginTop: 10, padding: "8px 18px", background: ORANGE, color: "#fff", border: "2px solid #000", borderRadius: 7, fontWeight: 700, fontSize: 13, cursor: "pointer", boxShadow: "0 2px 0 2px #000" }}
      >
        {saving ? "…" : existing ? "Aktualisieren" : "Bewertung abgeben"}
      </button>
    </div>
  );
}

export default function ReviewsPage() {
  useAuthGuard({ requiredRole: "customer", redirectTo: "/login" });
  const { user, logout } = useAuth();
  const router = useRouter();
  const [orders, setOrders] = useState([]);
  const [reviews, setReviews] = useState({});
  const [loading, setLoading] = useState(true);
  const [expandedOrder, setExpandedOrder] = useState(null);
  const [editingKey, setEditingKey] = useState(null);

  const load = useCallback(async () => {
    const token = getToken("customer");
    if (!token) return;
    const client = getMedusaClient();
    const [ordersRes, reviewsRes] = await Promise.all([
      client.request("/store/orders/me", { headers: { Authorization: `Bearer ${token}` } }).catch(() => null),
      client.request("/store/reviews/my", { headers: { Authorization: `Bearer ${token}` } }).catch(() => null),
    ]);
    setOrders(ordersRes?.orders || []);
    const rvMap = {};
    for (const rv of (reviewsRes?.reviews || [])) {
      rvMap[`${rv.order_id}:${rv.product_id}`] = rv;
    }
    setReviews(rvMap);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [user?.id, load]);

  const handleSaved = (rv) => {
    const key = `${rv.order_id}:${rv.product_id}`;
    setReviews((prev) => ({ ...prev, [key]: rv }));
    setEditingKey(null);
  };

  const ordersWithItems = orders.filter((o) => (o.items || []).some((it) => it.product_id));

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "#fafafa" }}>
      <ShopHeader />
      <main style={{ flex: 1 }}>
        <div style={ACCOUNT_PAGE_MAIN_INNER}>
          <AccountPageLayout title="Bewertungen">
            <div>
              {loading && <NewtonsCradle />}
              {!loading && ordersWithItems.length === 0 && (
                <p style={{ color: GRAY }}>Noch keine Bestellungen vorhanden.</p>
              )}
              {ordersWithItems.map((order) => {
                const isOpen = expandedOrder === order.id;
                const items = (order.items || []).filter((it) => it.product_id);
                const reviewedCount = items.filter((it) => reviews[`${order.id}:${it.product_id}`]).length;
                const allReviewed = reviewedCount === items.length && items.length > 0;
                const avgRating = reviewedCount > 0
                  ? (items.reduce((s, it) => s + (reviews[`${order.id}:${it.product_id}`]?.rating || 0), 0) / reviewedCount)
                  : null;

                return (
                  <div key={order.id} style={{ background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 12, marginBottom: 14, overflow: "hidden" }}>
                    <div
                      style={{ padding: "16px 20px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}
                      onClick={() => setExpandedOrder(isOpen ? null : order.id)}
                    >
                      <div>
                        <p style={{ margin: 0, fontWeight: 700, fontSize: 15, color: DARK }}>
                          Bestellung #{order.order_number || "—"}
                        </p>
                        <p style={{ margin: "2px 0 0", fontSize: 12, color: GRAY }}>
                          {fmtDate(order.created_at)} · {items.length} Produkt{items.length !== 1 ? "e" : ""}
                          {reviewedCount > 0 && ` · ${reviewedCount}/${items.length} bewertet`}
                        </p>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        {avgRating != null ? (
                          <span style={{ fontSize: 16, letterSpacing: 1 }}>
                            {[1,2,3,4,5].map((n) => (
                              <span key={n} style={{ color: Math.round(avgRating) >= n ? "#f59e0b" : "#d1d5db" }}>★</span>
                            ))}
                          </span>
                        ) : (
                          <span style={{ fontSize: 13, color: ORANGE, fontWeight: 600 }}>Jetzt bewerten</span>
                        )}
                        <span style={{ color: GRAY, fontSize: 14 }}>{isOpen ? "▲" : "▼"}</span>
                      </div>
                    </div>

                    {isOpen && (
                      <div style={{ borderTop: `1px solid ${BORDER}`, padding: "16px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
                        {items.map((item) => {
                          const key = `${order.id}:${item.product_id}`;
                          const existing = reviews[key];
                          const isEditing = editingKey === key;

                          return (
                            <div key={item.product_id} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                              {item.thumbnail && (
                                <img src={item.thumbnail} alt="" style={{ width: 52, height: 52, objectFit: "cover", borderRadius: 6, flexShrink: 0 }} />
                              )}
                              <div style={{ flex: 1, minWidth: 0 }}>
                                {existing && !isEditing ? (
                                  <div style={{ padding: "10px 14px", background: "#f9fafb", borderRadius: 8, border: `1px solid ${BORDER}` }}>
                                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                                      <p style={{ margin: 0, fontWeight: 600, fontSize: 13 }}>{item.title}</p>
                                      <span style={{ fontSize: 16, letterSpacing: 1 }}>
                                        {[1,2,3,4,5].map((n) => (
                                          <span key={n} style={{ color: existing.rating >= n ? "#f59e0b" : "#d1d5db" }}>★</span>
                                        ))}
                                      </span>
                                    </div>
                                    {existing.comment && <p style={{ margin: "4px 0 0", fontSize: 13, color: "#374151" }}>{existing.comment}</p>}
                                    <button
                                      type="button"
                                      onClick={() => setEditingKey(key)}
                                      style={{ marginTop: 8, fontSize: 12, color: ORANGE, background: "none", border: "none", cursor: "pointer", padding: 0 }}
                                    >
                                      Bearbeiten
                                    </button>
                                  </div>
                                ) : (
                                  <ReviewForm
                                    orderId={order.id}
                                    item={item}
                                    existing={isEditing ? existing : null}
                                    onSaved={handleSaved}
                                  />
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </AccountPageLayout>
        </div>
      </main>
      <Footer />
    </div>
  );
}
